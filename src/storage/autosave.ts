import type { DatabaseSession } from '../engine/database';
import type { RecoveryMetadata, RecoverySnapshot, RecoveryStore } from './recovery';

export type AutosaveState = { status: 'saving' | 'saved' } | { status: 'error'; message: string };

/** Serializes snapshots for one document, retaining the newest error/save state. */
export class DocumentAutosave {
  readonly id: string;
  state: AutosaveState;
  private revision: number | null;
  private requested = 0;
  private tail: Promise<void> = Promise.resolve();
  private pending?: { request: number; snapshot: Omit<RecoverySnapshot, 'revision' | 'savedAt'> };
  private writing = false;

  constructor(private readonly store: RecoveryStore, private readonly changed: () => void, restored?: RecoveryMetadata) {
    this.id = restored?.id ?? crypto.randomUUID();
    this.revision = restored?.revision ?? null;
    this.state = { status: restored ? 'saved' : 'saving' };
  }

  save(session: DatabaseSession): void {
    const request = ++this.requested;
    this.state = { status: 'saving' };
    this.changed();
    try {
      const snapshot = {
        id: this.id, name: session.name, pendingDownload: session.hasChanges,
        bytes: Uint8Array.from(session.exportCopy()).buffer,
      };
      this.pending = { snapshot, request };
      this.start();
    } catch (error) {
      this.state = { status: 'error', message: error instanceof Error ? error.message : String(error) };
      this.changed();
    }
  }

  private start(): void {
    if (this.writing) return;
    this.writing = true;
    this.tail = (async () => {
      try {
        while (this.pending) {
          const { snapshot, request } = this.pending;
          this.pending = undefined;
          try {
            const saved = await this.store.save(snapshot, this.revision);
            this.revision = saved.revision;
            if (request === this.requested) this.state = { status: 'saved' };
          } catch (error) {
            if (request === this.requested) this.state = { status: 'error', message: error instanceof Error ? error.message : String(error) };
          }
          this.changed();
        }
      } finally { this.writing = false; }
    })();
  }

  flush(): Promise<void> { return this.tail; }
}
