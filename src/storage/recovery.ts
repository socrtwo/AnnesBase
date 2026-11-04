import { MAX_DATABASE_BYTES } from '../engine/database';

export interface RecoveryMetadata {
  id: string;
  revision: number;
  name: string;
  savedAt: number;
  pendingDownload: boolean;
}
export interface RecoverySnapshot extends RecoveryMetadata { bytes: ArrayBuffer }
export interface RecoveryStore {
  list(): Promise<RecoveryMetadata[]>;
  read(id: string): Promise<RecoverySnapshot>;
  save(snapshot: Omit<RecoverySnapshot, 'revision' | 'savedAt'>, expectedRevision: number | null): Promise<RecoveryMetadata>;
  remove(id: string, expectedRevision: number): Promise<void>;
}
export class RecoveryConflict extends Error {
  constructor() { super('This recovery copy changed in another tab. Download your changes or restore the latest copy.'); }
}

/** Metadata and bytes commit together; revision checks prevent stale-tab writes/deletes. */
export class IndexedDbRecoveryStore implements RecoveryStore {
  private opening?: Promise<IDBDatabase>;
  constructor(private readonly factory = () => window.indexedDB, private readonly name = 'annesbase.recovery.v1') {}

  private open(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.factory();
      if (!factory) { reject(new Error('Browser storage is unavailable.')); return; }
      const request = factory.open(this.name, 1);
      let settled = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('metadata', { keyPath: 'id' });
        request.result.createObjectStore('data', { keyPath: 'id' });
      };
      request.onerror = () => { settled = true; reject(request.error ?? new Error('Cannot open browser storage.')); };
      request.onblocked = () => { settled = true; reject(new Error('Close older tabs to enable browser storage.')); };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true;
        const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = undefined; };
        resolve(db);
      };
    }).catch(error => { this.opening = undefined; throw error; });
    return this.opening;
  }

  async list(): Promise<RecoveryMetadata[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('metadata', 'readonly');
      const request = transaction.objectStore('metadata').getAll();
      transaction.oncomplete = () => resolve((request.result as RecoveryMetadata[]).sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id)));
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot list browser recovery copies.'));
    });
  }

  async read(id: string): Promise<RecoverySnapshot> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readonly');
      const metadata = transaction.objectStore('metadata').get(id);
      const data = transaction.objectStore('data').get(id);
      transaction.oncomplete = () => {
        if (!metadata.result || !data.result || Object.prototype.toString.call(data.result.bytes) !== '[object ArrayBuffer]') { reject(new Error('The recovery copy is missing or incomplete.')); return; }
        resolve({ ...metadata.result, bytes: data.result.bytes });
      };
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot read the recovery copy.'));
    });
  }

  async save(snapshot: Omit<RecoverySnapshot, 'revision' | 'savedAt'>, expectedRevision: number | null): Promise<RecoveryMetadata> {
    if (snapshot.bytes.byteLength > MAX_DATABASE_BYTES) throw new Error('The recovery copy exceeds the 32 MiB preview limit. Download a copy.');
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readwrite');
      let error: Error | undefined;
      let saved: RecoveryMetadata;
      const metadata = transaction.objectStore('metadata');
      const request = metadata.get(snapshot.id);
      request.onsuccess = () => {
        const revision = request.result?.revision ?? null;
        if (revision !== expectedRevision) { error = new RecoveryConflict(); transaction.abort(); return; }
        try {
          saved = {
            id: snapshot.id, name: snapshot.name, pendingDownload: snapshot.pendingDownload,
            revision: (revision ?? 0) + 1, savedAt: Date.now(),
          };
          metadata.put(saved);
          transaction.objectStore('data').put({ id: snapshot.id, bytes: snapshot.bytes });
        } catch (reason) {
          error = reason instanceof Error ? reason : new Error(String(reason)); transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(saved);
      transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Browser autosave failed. Download a copy.'));
    });
  }

  async remove(id: string, expectedRevision: number): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'data'], 'readwrite');
      let error: Error | undefined;
      const metadata = transaction.objectStore('metadata');
      const request = metadata.get(id);
      request.onsuccess = () => {
        if (request.result?.revision !== expectedRevision) { error = new RecoveryConflict(); transaction.abort(); return; }
        metadata.delete(id); transaction.objectStore('data').delete(id);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Cannot remove the recovery copy.'));
    });
  }
}
