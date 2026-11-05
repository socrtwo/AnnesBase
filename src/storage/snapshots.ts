import { MAX_DATABASE_BYTES } from '../engine/database';

export interface SnapshotInput {
  id: string; documentId: string; name: string; label: string; kind: 'manual' | 'automatic';
  capturedAt: number; bytes: ArrayBuffer;
}
export interface SnapshotMetadata extends Omit<SnapshotInput, 'bytes'> { size: number; checksum: string }
export interface SavedSnapshot extends SnapshotMetadata { bytes: ArrayBuffer }
export interface SnapshotStore {
  list(): Promise<SnapshotMetadata[]>;
  create(input: SnapshotInput, keepAutomatic: number): Promise<SnapshotMetadata>;
  read(id: string): Promise<SavedSnapshot>;
  remove(id: string): Promise<void>;
}
export async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Snapshot checksums require HTTPS or localhost in a supported browser.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Separate from latest-state recovery storage, so existing recovery copies need no migration. */
export class IndexedDbSnapshotStore implements SnapshotStore {
  private opening?: Promise<IDBDatabase>;
  constructor(private readonly factory = () => window.indexedDB, private readonly name = 'annesbase.snapshots.v1', private readonly hash = sha256) {}
  private open(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.factory();
      if (!factory) { reject(new Error('Browser snapshot storage is unavailable.')); return; }
      const request = factory.open(this.name, 1); let settled = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('metadata', { keyPath: 'id' }).createIndex('documentId', 'documentId');
        request.result.createObjectStore('data', { keyPath: 'id' });
      };
      request.onerror = () => { settled = true; reject(request.error ?? new Error('Cannot open snapshot storage.')); };
      request.onblocked = () => { settled = true; reject(new Error('Close older tabs to enable snapshot storage.')); };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = undefined; };
        resolve(db);
      };
    }).catch(error => { this.opening = undefined; throw error; });
    return this.opening;
  }
  async list(): Promise<SnapshotMetadata[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('metadata', 'readonly');
      const request = transaction.objectStore('metadata').getAll();
      transaction.oncomplete = () => resolve((request.result as SnapshotMetadata[]).sort((a, b) => b.capturedAt - a.capturedAt || b.id.localeCompare(a.id)));
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot list snapshots.'));
    });
  }
  async create(input: SnapshotInput, keepAutomatic: number): Promise<SnapshotMetadata> {
    if (!Number.isInteger(keepAutomatic) || keepAutomatic < 1 || keepAutomatic > 20) throw new Error('Keep between 1 and 20 automatic snapshots.');
    if (!input.label.trim() || input.label.length > 80 || /[\x00-\x1f]/.test(input.label)) throw new Error('Use a snapshot label of 1–80 characters without control characters.');
    if (!['manual', 'automatic'].includes(input.kind) || !input.id || !input.documentId || !Number.isFinite(input.capturedAt)) throw new Error('Invalid snapshot metadata.');
    if (input.bytes.byteLength > MAX_DATABASE_BYTES) throw new Error('The snapshot exceeds the 32 MiB preview limit.');
    const bytes = input.bytes.slice(0);
    const { bytes: _bytes, ...details } = input;
    const checksum = await this.hash(bytes);
    const saved: SnapshotMetadata = { ...details, label: input.label.trim(), size: bytes.byteLength, checksum };
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readwrite'); let error: Error | undefined;
      try {
        const metadata = transaction.objectStore('metadata'); const data = transaction.objectStore('data');
        // add, never put: a snapshot id is immutable, including across tabs.
        metadata.add(saved); data.add({ id: input.id, bytes });
        if (input.kind === 'automatic') {
          const request = metadata.index('documentId').getAll(input.documentId);
          request.onsuccess = () => {
            try {
              const automatic = (request.result as SnapshotMetadata[]).filter(item => item.kind === 'automatic').sort((a, b) => b.capturedAt - a.capturedAt || b.id.localeCompare(a.id));
              for (const old of automatic.slice(keepAutomatic)) { metadata.delete(old.id); data.delete(old.id); }
            } catch (reason) { error = reason instanceof Error ? reason : new Error(String(reason)); transaction.abort(); }
          };
        }
      } catch (reason) { error = reason instanceof Error ? reason : new Error(String(reason)); transaction.abort(); }
      transaction.oncomplete = () => resolve(saved);
      transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Snapshot creation failed. Older snapshots were kept.'));
    });
  }
  async read(id: string): Promise<SavedSnapshot> {
    const db = await this.open();
    const saved = await new Promise<SavedSnapshot>((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readonly');
      const metadata = transaction.objectStore('metadata').get(id); const data = transaction.objectStore('data').get(id);
      transaction.oncomplete = () => {
        if (!metadata.result || !data.result || Object.prototype.toString.call(data.result.bytes) !== '[object ArrayBuffer]') { reject(new Error('The snapshot is missing or incomplete.')); return; }
        resolve({ ...metadata.result, bytes: data.result.bytes });
      };
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot read snapshot.'));
    });
    if (saved.bytes.byteLength > MAX_DATABASE_BYTES || saved.bytes.byteLength !== saved.size || await this.hash(saved.bytes) !== saved.checksum) throw new Error('Snapshot checksum verification failed. The database was not replaced.');
    return saved;
  }
  async remove(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readwrite');
      transaction.objectStore('metadata').delete(id); transaction.objectStore('data').delete(id);
      transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error('Cannot remove snapshot.'));
    });
  }
}

interface SnapshotTask { input: SnapshotInput; keep: number; resolve: (saved: SnapshotMetadata | undefined) => void; reject: (error: unknown) => void }
/** Pin manual requests; combine rapid pending automatic captures for the same document. */
export class SnapshotQueue {
  private queue: SnapshotTask[] = [];
  private running = false;
  constructor(private readonly store: SnapshotStore) {}
  save(input: SnapshotInput, keep: number): Promise<SnapshotMetadata | undefined> {
    return new Promise((resolve, reject) => {
      if (input.kind === 'automatic') {
        const old = this.queue.findIndex(task => task.input.kind === 'automatic' && task.input.documentId === input.documentId);
        if (old >= 0) this.queue.splice(old, 1)[0].resolve(undefined);
      }
      this.queue.push({ input, keep, resolve, reject }); void this.run();
    });
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const task = this.queue.shift()!;
        try { task.resolve(await this.store.create(task.input, task.keep)); } catch (error) { task.reject(error); }
      }
    } finally { this.running = false; }
  }
}
