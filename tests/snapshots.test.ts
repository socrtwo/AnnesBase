import { createHash } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbSnapshotStore, SnapshotQueue, sha256, type SnapshotInput } from '../src/storage/snapshots';
import { defaultSnapshotSettings, loadSnapshotSettings, saveSnapshotSettings } from '../src/storage/snapshotPreferences';

const hash = async (bytes: ArrayBuffer) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const input = (id: string, kind: SnapshotInput['kind'] = 'automatic', documentId = 'one', capturedAt = Number(id) || 1): SnapshotInput => ({ id, documentId, name: 'Sample.qbase', label: id, kind, capturedAt, bytes: new Uint8Array([1, 2, 3]).buffer });
const setup = () => { const factory = new IDBFactory(); return { factory, store: new IndexedDbSnapshotStore(() => factory, 'test', hash) }; };

describe('versioned snapshot storage', () => {
  it('pins manual versions, prunes only this document’s old automatic versions, and keeps bytes immutable', async () => {
    const { store } = setup();
    await store.create(input('manual', 'manual'), 2);
    await store.create(input('other', 'automatic', 'two'), 2);
    for (const id of ['1', '2', '3']) await store.create(input(id), 2);
    expect((await store.list()).map(item => item.id).sort()).toEqual(['2', '3', 'manual', 'other']);
    expect((await store.list())[0]).not.toHaveProperty('bytes');
    const saved = await store.read('manual'); new Uint8Array(saved.bytes)[0] = 9;
    expect([...new Uint8Array((await store.read('manual')).bytes)]).toEqual([1, 2, 3]);
    await expect(store.create({ ...input('manual'), bytes: new Uint8Array([9]).buffer }, 1)).rejects.toThrow();
    expect([...new Uint8Array((await store.read('manual')).bytes)]).toEqual([1, 2, 3]);
    await store.remove('manual'); await expect(store.read('manual')).rejects.toThrow('missing');
  });
  it('rolls metadata and pruning back when a byte write fails, then retries', async () => {
    const { store } = setup(); await store.create(input('1'), 1);
    const add = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'data') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return add.apply(this, args);
    });
    try { await expect(store.create(input('2'), 1)).rejects.toThrow('Quota'); } finally { spy.mockRestore(); }
    expect((await store.list()).map(item => item.id)).toEqual(['1']);
    expect([...new Uint8Array((await store.read('1')).bytes)]).toEqual([1, 2, 3]);
    await store.create(input('2'), 1); expect((await store.list()).map(item => item.id)).toEqual(['2']);
  });
  it('detects tampered bytes and missing bytes before a restore', async () => {
    const { store, factory } = setup(); await store.create(input('1'), 1);
    const db = await new Promise<IDBDatabase>(resolve => { const request = factory.open('test'); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').put({ id: '1', bytes: new Uint8Array([9, 2, 3]).buffer }); tx.oncomplete = () => resolve(); });
    await expect(store.read('1')).rejects.toThrow('checksum');
    await new Promise<void>(resolve => { const tx = db.transaction('data', 'readwrite'); tx.objectStore('data').delete('1'); tx.oncomplete = () => resolve(); });
    await expect(store.read('1')).rejects.toThrow('missing'); db.close();
  });
  it('copies caller bytes before asynchronous hashing and validates input before writing', async () => {
    const { store } = setup(); const original = input('1'); const save = store.create(original, 1);
    new Uint8Array(original.bytes)[0] = 8; await save;
    expect([...new Uint8Array((await store.read('1')).bytes)]).toEqual([1, 2, 3]);
    for (const keep of [0, 21, 1.5]) await expect(store.create(input('bad'), keep)).rejects.toThrow('1 and 20');
    await expect(store.create({ ...input('bad'), label: ' ' }, 1)).rejects.toThrow('label');
    await expect(store.create({ ...input('big'), bytes: new ArrayBuffer(32 * 1024 * 1024 + 1) }, 1)).rejects.toThrow('32 MiB');
    expect(await sha256(new Uint8Array([1, 2, 3]).buffer)).toBe(await hash(new Uint8Array([1, 2, 3]).buffer));
  });
  it('recovers from unavailable storage without deleting saved versions', async () => {
    let enabled = false; const factory = new IDBFactory();
    const store = new IndexedDbSnapshotStore(() => { if (!enabled) throw new Error('Disabled'); return factory; }, 'retry', hash);
    await expect(store.list()).rejects.toThrow('Disabled'); enabled = true;
    await store.create(input('1'), 1); expect(await store.list()).toHaveLength(1);
  });
  it('coalesces pending automatic captures but preserves manual captures and continues after errors', async () => {
    const { store } = setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const create = store.create.bind(store);
    const spy = vi.spyOn(store, 'create').mockImplementationOnce(async (...args) => { await gate; throw new Error('Full'); }).mockImplementation(create);
    const queue = new SnapshotQueue(store);
    const first = queue.save(input('1'), 2).catch(error => error.message);
    const old = queue.save(input('2'), 2); const manual = queue.save(input('manual', 'manual'), 2); const latest = queue.save(input('3'), 2);
    expect(await old).toBeUndefined(); release();
    expect(await first).toBe('Full'); await manual; await latest;
    expect(spy.mock.calls.map(call => call[0].id)).toEqual(['1', 'manual', '3']);
    expect((await store.list()).map(item => item.id).sort()).toEqual(['3', 'manual']);
  });
});

it('loads validated opt-in snapshot preferences and handles unavailable persistence', () => {
  expect(loadSnapshotSettings()).toEqual(defaultSnapshotSettings());
  const storage = { getItem: () => '{bad', setItem: vi.fn() };
  expect(loadSnapshotSettings(storage).enabled).toBe(false);
  storage.getItem = () => JSON.stringify({ version: 1, enabled: true, keep: 3 });
  expect(loadSnapshotSettings(storage)).toEqual({ version: 1, enabled: true, keep: 3 });
  storage.getItem = () => JSON.stringify({ version: 1, enabled: true, keep: 21 });
  expect(loadSnapshotSettings(storage)).toEqual(defaultSnapshotSettings());
  expect(saveSnapshotSettings(undefined, defaultSnapshotSettings())).toBe(false);
  storage.setItem.mockImplementation(() => { throw new Error('Disabled'); });
  expect(saveSnapshotSettings(storage, defaultSnapshotSettings())).toBe(false);
});
