import { readFileSync } from 'node:fs';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseSession } from '../src/engine/database';
import { DocumentAutosave } from '../src/storage/autosave';
import { IndexedDbRecoveryStore, RecoveryConflict, type RecoveryStore } from '../src/storage/recovery';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => { sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer }); });
afterEach(() => sessions.splice(0).forEach(session => session.close()));
const create = () => { const session = DatabaseSession.create(sqlite, true); sessions.push(session); return session; };
const sample = (id: string) => ({ id, name: `${id}.qbase`, pendingDownload: true, bytes: new Uint8Array([1, 2, 3]).buffer });
function store() { const factory = new IDBFactory(); return new IndexedDbRecoveryStore(() => factory); }

describe('IndexedDB recovery storage', () => {
  it('stores separate documents, updates revisions and reads independent byte copies', async () => {
    const storage = store();
    const first = await storage.save(sample('first'), null);
    const second = await storage.save(sample('second'), null);
    expect(first.revision).toBe(1); expect(second.revision).toBe(1);
    expect((await storage.list()).map(item => item.id).sort()).toEqual(['first', 'second']);
    const updated = await storage.save({ ...sample('first'), name: 'renamed.qbase', pendingDownload: false }, 1);
    expect(updated.revision).toBe(2);
    const snapshot = await storage.read('first');
    expect(snapshot).toMatchObject({ name: 'renamed.qbase', revision: 2, pendingDownload: false });
    new Uint8Array(snapshot.bytes)[0] = 99;
    expect([...new Uint8Array((await storage.read('first')).bytes)]).toEqual([1, 2, 3]);
    expect((await storage.list())[0]).not.toHaveProperty('bytes');
  });

  it('atomically rejects stale tab updates and stale removals without changing either store', async () => {
    const storage = store(); await storage.save(sample('same'), null);
    const competing = await Promise.allSettled([
      storage.save({ ...sample('same'), name: 'tab-one', bytes: new Uint8Array([4]).buffer }, 1),
      storage.save({ ...sample('same'), name: 'tab-two', bytes: new Uint8Array([5]).buffer }, 1),
    ]);
    expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = competing.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RecoveryConflict);
    const winner = await storage.read('same');
    expect(winner.revision).toBe(2);
    expect([...new Uint8Array(winner.bytes)]).toEqual(winner.name === 'tab-one' ? [4] : [5]);
    await expect(storage.remove('same', 1)).rejects.toBeInstanceOf(RecoveryConflict);
    expect(await storage.read('same')).toEqual(winner);
    await storage.remove('same', 2);
    expect(await storage.list()).toEqual([]);
    await expect(storage.read('same')).rejects.toThrow('missing');
    await expect(storage.save(sample('same'), 2)).rejects.toBeInstanceOf(RecoveryConflict);
  });

  it('retries after browser access fails and rejects oversized snapshots before writing', async () => {
    let enabled = false; const factory = new IDBFactory();
    const storage = new IndexedDbRecoveryStore(() => { if (!enabled) throw new Error('Storage disabled'); return factory; });
    await expect(storage.list()).rejects.toThrow('Storage disabled');
    enabled = true; expect(await storage.list()).toEqual([]);
    await expect(storage.save({ ...sample('huge'), bytes: new ArrayBuffer(32 * 1024 * 1024 + 1) }, null)).rejects.toThrow('32 MiB');
    expect(await storage.list()).toEqual([]);
  });

  it('rolls metadata back if storing bytes fails, then retries against the original revision', async () => {
    const storage = store(); await storage.save(sample('atomic'), null);
    const original = await storage.read('atomic');
    const put = IDBObjectStore.prototype.put; let fail = true;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (fail && this.name === 'data') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return put.apply(this, args);
    });
    try {
      await expect(storage.save({ ...sample('atomic'), name: 'must roll back', bytes: new Uint8Array([9]).buffer }, 1)).rejects.toThrow('quota');
      expect(await storage.read('atomic')).toEqual(original);
      fail = false;
      expect((await storage.save(sample('atomic'), 1)).revision).toBe(2);
    } finally { spy.mockRestore(); }
  });
});

describe('document autosave', () => {
  it('saves native rows and undo history, and restores pending-download state separately', async () => {
    const storage = store(); const session = create();
    session.updateRecord('Customers', '1', { name: 'Autosaved name', city: null });
    const changed = vi.fn(); const saver = new DocumentAutosave(storage, changed);
    saver.save(session); expect(saver.state.status).toBe('saving');
    await saver.flush(); expect(saver.state.status).toBe('saved');
    const snapshot = await storage.read(saver.id);
    expect(snapshot.pendingDownload).toBe(true);
    const restored = DatabaseSession.open(sqlite, new Uint8Array(snapshot.bytes), snapshot.name); sessions.push(restored);
    restored.markRecoveredChanges(); expect(restored.hasChanges).toBe(true);
    expect(restored.record('Customers', '1')[1]).toBe('Autosaved name');
    restored.undo(); expect(restored.record('Customers', '1')[1]).toBe('Alex Example');
    const next = new DocumentAutosave(storage, () => {}, snapshot);
    next.save(restored); await next.flush();
    expect((await storage.read(saver.id)).revision).toBe(2);
  });

  it('keeps only the newest pending snapshot while a write is in flight', async () => {
    const base = store(); const session = create();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const save = vi.fn(async (...args: Parameters<RecoveryStore['save']>) => { await gate; return base.save(...args); });
    const storage: RecoveryStore = { list: () => base.list(), read: id => base.read(id), remove: (id, revision) => base.remove(id, revision), save };
    const saver = new DocumentAutosave(storage, () => {});
    saver.save(session);
    for (let index = 0; index < 15; index++) {
      session.updateRecord('Customers', '1', { name: `Version ${index}`, city: null }); saver.save(session);
    }
    expect(save).toHaveBeenCalledTimes(1);
    release(); await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    const snapshot = await base.read(saver.id);
    const restored = DatabaseSession.open(sqlite, new Uint8Array(snapshot.bytes), snapshot.name); sessions.push(restored);
    expect(restored.record('Customers', '1')[1]).toBe('Version 14');
    expect(restored.history()).toHaveLength(15);
    expect(saver.state.status).toBe('saved');
  });

  it('reports quota failures, retains pending changes and retries the newest data', async () => {
    const base = store(); const session = create(); let fail = true;
    const storage: RecoveryStore = { list: () => base.list(), read: id => base.read(id), remove: (id, revision) => base.remove(id, revision), save: async (...args) => {
      if (fail) throw new Error('Quota exceeded'); return base.save(...args);
    } };
    session.deleteRecord('Orders', '1');
    const saver = new DocumentAutosave(storage, () => {});
    saver.save(session); await saver.flush();
    expect(saver.state).toEqual({ status: 'error', message: 'Quota exceeded' });
    expect(session.hasChanges).toBe(true);
    fail = false; saver.save(session); await saver.flush();
    expect(saver.state.status).toBe('saved');
    expect((await base.read(saver.id)).pendingDownload).toBe(true);
  });

  it('does not overwrite a newer saved document from another tab', async () => {
    const storage = store(); const first = create();
    const initial = new DocumentAutosave(storage, () => {}); initial.save(first); await initial.flush();
    const metadata = await storage.read(initial.id);
    const stale = new DocumentAutosave(storage, () => {}, metadata);
    first.updateRecord('Customers', '1', { name: 'Newer tab', city: null }); initial.save(first); await initial.flush();
    const old = create(); old.updateRecord('Customers', '1', { name: 'Stale tab', city: null }); stale.save(old); await stale.flush();
    expect(stale.state.status).toBe('error');
    const snapshot = await storage.read(initial.id);
    const restored = DatabaseSession.open(sqlite, new Uint8Array(snapshot.bytes), snapshot.name); sessions.push(restored);
    expect(restored.record('Customers', '1')[1]).toBe('Newer tab');
    expect(old.record('Customers', '1')[1]).toBe('Stale tab');
  });
});
