import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbSavedViewStore, MAX_SAVED_VIEWS, SavedViewConflict, normalizeDefinition, type ViewDefinition } from '../src/storage/savedViews';

const definition = (name = 'Boston customers'): ViewDefinition => ({
  name, sourceName: 'Sample.qbase', table: 'Customers',
  columns: [{ name: 'id', type: 'INTEGER', primaryKey: 1, kind: 'integer' }, { name: 'city', type: 'TEXT', primaryKey: 0, kind: 'text' }],
  view: { sort: { column: 'city', direction: 'DESC' }, filter: { column: 'city', operator: 'contains', value: 'Boston' }, search: 'literal %_' }, filterEnabled: false,
});
function setup() { const factory = new IDBFactory(); return { factory, store: new IndexedDbSavedViewStore(() => factory, 'saved-views-test') }; }

describe('saved view library', () => {
  it('stores canonical independent copies and preserves applied settings, including a disabled filter', async () => {
    const { store } = setup(); const input = definition(); const saved = await store.create(input);
    input.columns[0].name = 'changed'; input.view.filter!.value = 'changed';
    expect(await store.read(saved.id)).toMatchObject({ revision: 1, filterEnabled: false, view: { sorts: [{ column: 'city', direction: 'DESC' }], filters: { match: 'all', conditions: [{ column: 'city', operator: 'contains', value: 'Boston' }] }, search: 'literal %_' } });
    const read = await store.read(saved.id); read.view.filters!.conditions[0].value = 'mutated';
    expect((await store.read(saved.id)).view.filters!.conditions[0].value).toBe('Boston');
    expect((await store.list()).map(view => view.name)).toEqual(['Boston customers']);
  });
  it('rejects duplicate names within a layout and permits the same name for a different layout', async () => {
    const { store } = setup(); await store.create(definition(' My view '));
    await expect(store.create(definition('MY VIEW'))).rejects.toThrow('already exists');
    await store.create({ ...definition('My view'), table: 'Other table' });
    const second = await store.create(definition('Second'));
    await expect(store.update(second.id, definition('my view'), second.revision)).rejects.toThrow('already exists');
    expect((await store.read(second.id)).name).toBe('Second'); expect(await store.list()).toHaveLength(3);
  });
  it('checks revisions atomically for competing updates and stale deletion', async () => {
    const { store } = setup(); const saved = await store.create(definition());
    const results = await Promise.allSettled([store.update(saved.id, definition('First tab'), 1), store.update(saved.id, definition('Second tab'), 1)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(SavedViewConflict);
    await expect(store.remove(saved.id, 1)).rejects.toBeInstanceOf(SavedViewConflict);
    expect((await store.read(saved.id)).revision).toBe(2);
    await store.remove(saved.id, 2); await expect(store.read(saved.id)).rejects.toThrow('no longer exists');
  });
  it('keeps the old view after a quota failure and retries storage access safely', async () => {
    let enabled = false; const factory = new IDBFactory();
    const store = new IndexedDbSavedViewStore(() => { if (!enabled) throw new Error('Storage disabled'); return factory; });
    await expect(store.list()).rejects.toThrow('Storage disabled'); enabled = true;
    const saved = await store.create(definition());
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    try { await expect(store.update(saved.id, definition('Replacement'), 1)).rejects.toThrow('Quota'); } finally { spy.mockRestore(); }
    expect(await store.read(saved.id)).toEqual(saved);
    expect((await store.update(saved.id, definition('Replacement'), 1)).revision).toBe(2);
  });
  it('bounds the library without blocking replacement or removal', async () => {
    const { store } = setup(); let first = await store.create(definition('0'));
    for (let index = 1; index < MAX_SAVED_VIEWS; index++) await store.create(definition(String(index)));
    await expect(store.create(definition('Too many'))).rejects.toThrow('at most 200');
    first = await store.update(first.id, definition('Renamed'), 1); await store.remove(first.id, first.revision);
    await store.create(definition('Space available')); expect(await store.list()).toHaveLength(MAX_SAVED_VIEWS);
  });
  it('rejects malformed settings, invalid metadata and incompatible stored versions', async () => {
    expect(() => normalizeDefinition({ ...definition(), name: ' ' })).toThrow('name');
    expect(() => normalizeDefinition({ ...definition(), columns: Array.from({ length: 120 }, (_, index) => ({ name: '架'.repeat(900) + index, type: 'TEXT', primaryKey: 0, kind: 'text' })), view: {} })).toThrow('too large');
    expect(() => normalizeDefinition({ ...definition(), view: { filter: { column: 'missing', operator: 'equals', value: '1' } } })).toThrow('column');
    expect(() => normalizeDefinition({ ...definition(), view: { filter: { column: 'id', operator: 'equals', value: '1.5' } } })).toThrow('whole number');
    expect(() => normalizeDefinition({ ...definition(), filterEnabled: 'yes' as unknown as boolean })).toThrow('metadata');
    const { factory, store } = setup(); const saved = await store.create(definition());
    const db = await new Promise<IDBDatabase>(resolve => { const request = factory.open('saved-views-test'); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction('views', 'readwrite'); const views = tx.objectStore('views'); const read = views.get(saved.id);
      read.onsuccess = () => views.put({ ...read.result, version: 999 }); tx.oncomplete = () => resolve();
    });
    await expect(store.read(saved.id)).rejects.toThrow('unsupported version'); await expect(store.list()).rejects.toThrow('unsupported version'); db.close();
  });
});
