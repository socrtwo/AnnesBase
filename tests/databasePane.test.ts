// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IndexedDbSnapshotStore, type SnapshotStore } from '../src/storage/snapshots';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/commands/registry';
import { DatabaseSession } from '../src/engine/database';
import { mountDatabasePane } from '../src/ui/databasePane';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbRecoveryStore, type RecoveryStore } from '../src/storage/recovery';

let sqlite: SqlJsStatic;
const cleanups: (() => void)[] = [];
beforeAll(async () => {
  sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer });
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); });

function setup(load = async () => sqlite, recovery?: RecoveryStore, snapshots?: SnapshotStore) {
  const root = document.createElement('div');
  document.body.append(root);
  const registry = createRegistry();
  const download = vi.fn();
  const confirmDiscard = vi.fn(() => true);
  const changed = vi.fn();
  const pane = mountDatabasePane(root, registry, changed, vi.fn(), { load, download, confirmDiscard, recovery, snapshots });
  cleanups.push(pane.dispose);
  const button = (label: string) => [...root.querySelectorAll('button')].find(button => button.textContent === label)!;
  return { root, registry, pane, download, changed, button, confirmDiscard };
}
function fileFrom(bytes: Uint8Array, name: string) {
  return { name, size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer } as File;
}

describe('database workspace', () => {
  it('opens the sample, switches tables, downloads a real copy and closes', async () => {
    const { root, registry, button, download } = setup();
    expect(registry.isAvailable('file.save')).toBe(false);
    button('Try sample database').click();
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    expect(root.textContent).toContain('Alex Example');
    button('Orders').click();
    expect(root.textContent).toContain('Notebook');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(registry.isAvailable('file.save')).toBe(true);
    registry.execute('file.save');
    expect(download).toHaveBeenCalledOnce();
    const [bytes, name] = download.mock.calls[0];
    expect(name).toBe('Sample-copy.qbase');
    const exported = DatabaseSession.open(sqlite, bytes, name);
    expect(exported.page('Orders').rows).toHaveLength(3);
    exported.close();
    registry.execute('file.closeDatabase');
    expect(root.textContent).toContain('No database is open');
    expect(registry.isAvailable('file.save')).toBe(false);
  });

  it('keeps the current database when loading another file fails', async () => {
    const { root, pane, button } = setup();
    button('Try sample database').click();
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    await pane.openFile(fileFrom(new Uint8Array([1, 2, 3]), 'bad.db'));
    expect(root.textContent).toContain('current database is still open');
    expect(root.textContent).toContain('Alex Example');
  });

  it('shows file contents as text and paginates through real SQLite records', async () => {
    const db = new sqlite.Database();
    db.run('CREATE TABLE data (value TEXT); BEGIN');
    for (let i = 0; i < 102; i++) db.run('INSERT INTO data VALUES (?)', [i === 0 ? '<img src=x onerror=alert(1)>' : `Record ${i}`]);
    db.run('COMMIT');
    const bytes = db.export(); db.close();
    const { root, pane, button } = setup();
    await pane.openFile(fileFrom(bytes, 'test.sqlite'));
    expect(root.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    button('Next page').click();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('Rows 101–102');
    expect(button('Next page').disabled).toBe(true);
    button('Previous page').click();
    expect(root.textContent).toContain('Rows 1–100');
  });

  it('disables overlapping actions during loading and allows retry after failure', async () => {
    let fail = true;
    const { root, registry, button } = setup(async () => {
      if (fail) throw new Error('WASM download failed');
      return sqlite;
    });
    button('New blank database').click();
    expect(registry.isAvailable('file.new')).toBe(false);
    await vi.waitFor(() => expect(root.textContent).toContain('WASM download failed'));
    expect(registry.isAvailable('file.new')).toBe(true);
    fail = false;
    registry.execute('file.new');
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Untitled.qbase'));
    expect(root.textContent).toContain('no user tables');
  });

  it('creates a table, edits and deletes records, and restores them through undo', async () => {
    const { root, registry, button } = setup();
    button('New blank database').click();
    await vi.waitFor(() => expect(registry.isAvailable('create.table')).toBe(true));
    registry.execute('create.table');
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    expect(root.textContent).toContain('Table1');
    registry.execute('record.new');
    root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = 'Original record';
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    expect(root.querySelector('tbody')?.textContent).toContain('Original record');
    root.querySelector<HTMLInputElement>('tbody input[type=radio]')!.click();
    button('Edit selected').click();
    root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = 'Edited record';
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    expect(root.querySelector('tbody')?.textContent).toContain('Edited record');
    root.querySelector<HTMLInputElement>('tbody input[type=radio]')!.click();
    expect(registry.isAvailable('record.delete')).toBe(true);
    registry.execute('record.delete');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(0);
    registry.execute('edit.undo');
    expect(root.querySelector('tbody')?.textContent).toContain('Edited record');
    registry.execute('edit.undo');
    expect(root.querySelector('tbody')?.textContent).toContain('Original record');
    expect(root.querySelector('.change-history')?.textContent).toContain('Undone');
  });

  it('guards pending changes on close, replace and reload, including failed downloads', async () => {
    const { root, registry, button, confirmDiscard, download } = setup();
    button('New blank database').click();
    await vi.waitFor(() => expect(registry.isAvailable('create.table')).toBe(true));
    button('Create table').click();
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    confirmDiscard.mockReturnValue(false);
    button('Close database').click();
    expect(root.querySelector('h2')?.textContent).toBe('Untitled.qbase');
    button('Try sample database').click();
    expect(root.querySelector('h2')?.textContent).toBe('Untitled.qbase');
    expect(confirmDiscard).toHaveBeenCalledTimes(2);
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    download.mockImplementationOnce(() => { throw new Error('Storage full'); });
    button('Download a copy').click();
    expect(root.textContent).toContain('Download failed: Storage full');
    const failed = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(failed);
    expect(failed.defaultPrevented).toBe(true);
    button('Download a copy').click();
    const acknowledged = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(acknowledged);
    expect(acknowledged.defaultPrevented).toBe(false);
    button('Close database').click();
    expect(root.textContent).toContain('No database is open');
  });

  it('protects unsaved form drafts and honors explicit read-only opening', async () => {
    const source = DatabaseSession.create(sqlite, true); const bytes = source.exportCopy(); source.close();
    const { root, pane, registry, button, download, confirmDiscard } = setup();
    await pane.openFile(fileFrom(bytes, 'native.qbase'), true);
    expect(registry.isAvailable('create.table')).toBe(false);
    await pane.openFile(fileFrom(bytes, 'native.qbase'));
    button('Add record').click();
    const input = root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!;
    input.value = 'Uncommitted draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    button('Download a copy').click();
    expect(download).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Save or cancel');
    confirmDiscard.mockReturnValue(false);
    button('Orders').click();
    expect(root.querySelector<HTMLTextAreaElement>('.database-editor textarea')?.value).toBe('Uncommitted draft');
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    button('Cancel editing').click();
    const cancelled = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(cancelled);
    expect(cancelled.defaultPrevented).toBe(false);
  });

  it('restores browser-saved records and undo after the old workspace is disposed', async () => {
    const factory = new IDBFactory(); const storage = new IndexedDbRecoveryStore(() => factory);
    const first = setup(undefined, storage);
    first.button('Try sample database').click();
    await vi.waitFor(() => expect(first.root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    first.root.querySelector<HTMLInputElement>('tbody input[type=radio]')!.click();
    first.button('Edit selected').click();
    first.root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = 'Recovered customer';
    first.root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    await vi.waitFor(async () => expect((await storage.list())[0]?.revision).toBeGreaterThanOrEqual(2));
    expect(first.root.querySelector('.browser-recovery')?.textContent).toContain('Saved in this browser');
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    first.pane.dispose(); first.root.remove();
    const second = setup(undefined, storage);
    await vi.waitFor(() => expect(second.registry.isAvailable('file.openRecent')).toBe(true));
    second.root.querySelector<HTMLButtonElement>('.recovery-list button')!.click();
    await vi.waitFor(() => expect(second.root.textContent).toContain('Recovered customer'));
    second.registry.execute('edit.undo');
    expect(second.root.querySelector('tbody')?.textContent).toContain('Alex Example');
    expect(second.registry.isAvailable('edit.undo')).toBe(false);
  });

  it('preserves separate browser copies on switching databases and removes only the chosen inactive copy', async () => {
    const factory = new IDBFactory(); const storage = new IndexedDbRecoveryStore(() => factory);
    const { root, button } = setup(undefined, storage);
    button('Try sample database').click();
    await vi.waitFor(async () => expect(await storage.list()).toHaveLength(1));
    button('New blank database').click();
    await vi.waitFor(async () => expect(await storage.list()).toHaveLength(2));
    const remove = () => root.querySelector<HTMLButtonElement>('[aria-label="Remove browser copy of Sample.qbase"]');
    await vi.waitFor(() => expect(remove()).not.toBeNull());
    expect(remove()!.disabled).toBe(false); remove()!.click();
    await vi.waitFor(async () => expect(await storage.list()).toHaveLength(1));
    expect((await storage.list())[0].name).toBe('Untitled.qbase');
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Remove browser copy of Untitled.qbase"]')?.disabled).toBe(true);
  });

  it('keeps the pending-edit guard on quota errors and retries autosave without a download', async () => {
    const factory = new IDBFactory(); const base = new IndexedDbRecoveryStore(() => factory); let fail = true;
    const storage: RecoveryStore = { list: () => base.list(), read: id => base.read(id), remove: (id, revision) => base.remove(id, revision), save: async (...args) => {
      if (fail) throw new Error('Quota exceeded'); return base.save(...args);
    } };
    const { root, button, registry, download } = setup(undefined, storage);
    button('New blank database').click();
    await vi.waitFor(() => expect(registry.isAvailable('create.table')).toBe(true));
    button('Create table').click(); root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    await vi.waitFor(() => expect(root.querySelector('.browser-recovery')?.textContent).toContain('Quota exceeded'));
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fail = false; button('Retry browser autosave').click();
    await vi.waitFor(() => expect(root.querySelector('.browser-recovery')?.textContent).toContain('Saved in this browser'));
    const saved = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false); expect(download).not.toHaveBeenCalled();
    expect(await base.list()).toHaveLength(1);
  });

  it('can restore the newer copy after a stale-tab autosave conflict', async () => {
    const factory = new IDBFactory(); const storage = new IndexedDbRecoveryStore(() => factory);
    const { root, button, confirmDiscard } = setup(undefined, storage);
    button('Try sample database').click();
    await vi.waitFor(async () => expect(await storage.list()).toHaveLength(1));
    const saved = await storage.read((await storage.list())[0].id);
    const other = DatabaseSession.open(sqlite, new Uint8Array(saved.bytes), saved.name);
    other.updateRecord('Customers', '1', { name: 'Other tab customer', city: null });
    await storage.save({ ...saved, bytes: Uint8Array.from(other.exportCopy()).buffer, pendingDownload: true }, saved.revision);
    other.close();
    root.querySelector<HTMLInputElement>('tbody input[type=radio]')!.click(); button('Edit selected').click();
    root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = 'Local stale customer';
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    await vi.waitFor(() => expect(root.querySelector('.browser-recovery')?.textContent).toContain('changed in another tab'));
    expect(root.querySelector('tbody')?.textContent).toContain('Local stale customer');
    const restore = root.querySelector<HTMLButtonElement>('[aria-label="Restore Sample.qbase"]')!;
    expect(restore.disabled).toBe(false); restore.click();
    await vi.waitFor(() => expect(root.querySelector('tbody')?.textContent).toContain('Other tab customer'));
    expect(confirmDiscard).toHaveBeenCalledOnce();
  });

  it('applies numeric sorting and filters, toggles/clears filters and focuses find through commands', async () => {
    const { root, registry, button } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    button('Orders').click();
    const select = (label: string, value: string) => {
      const control = root.querySelector<HTMLSelectElement>(`.table-tools [aria-label="${label}"]`)!;
      control.value = value; control.dispatchEvent(new Event('change')); return control;
    };
    select('Sort column', 'amount_cents'); registry.execute('sort.descending');
    expect(root.querySelector('tbody tr')?.textContent).toContain('Desk lamp');
    expect(root.querySelector('th[aria-sort="descending"]')?.textContent).toBe('amount_cents');
    select('Filter column', 'amount_cents'); select('Filter condition', 'gte');
    root.querySelector<HTMLInputElement>('[aria-label="Filter value"]')!.value = '1000';
    root.querySelector<HTMLFormElement>('.table-view-form')!.requestSubmit();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    registry.execute('filter.toggle'); expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    registry.execute('filter.toggle'); expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    registry.execute('edit.find'); expect(document.activeElement).toBe(root.querySelector('[aria-label="Find in table"]'));
    root.querySelector<HTMLInputElement>('[aria-label="Find in table"]')!.value = 'notebook';
    root.querySelector<HTMLFormElement>('.table-view-form')!.requestSubmit();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelector('tbody')?.textContent).toContain('Notebook');
    registry.execute('filter.clearAll'); expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    registry.execute('sort.clear'); expect(root.querySelector('tbody tr')?.textContent).toContain('Notebook');
    expect(root.querySelector('.change-history')?.textContent).toContain('No changes recorded');
  });

  it('edits the selected record identity correctly when it disappears from a filtered view', async () => {
    const { root, registry, button } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    const filter = root.querySelector<HTMLSelectElement>('[aria-label="Filter column"]')!;
    filter.value = 'name'; filter.dispatchEvent(new Event('change'));
    root.querySelector<HTMLInputElement>('[aria-label="Filter value"]')!.value = 'Renée';
    root.querySelector<HTMLFormElement>('.table-view-form')!.requestSubmit();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    root.querySelector<HTMLInputElement>('[aria-label="Select record 2"]')!.click(); button('Edit selected').click();
    root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = 'Changed matching record';
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(0); expect(root.textContent).toContain('No matching records');
    registry.execute('filter.clearAll');
    root.querySelector<HTMLInputElement>('[aria-label="Select record 2"]')!.click(); button('Edit selected').click();
    expect(root.querySelector<HTMLTextAreaElement>('.database-editor textarea')?.value).toBe('Changed matching record');
    button('Cancel editing').click(); registry.execute('edit.undo');
    expect(root.querySelector('tbody')?.textContent).toContain('Renée Example');
    expect(root.querySelector('.change-history')?.textContent).not.toContain('createTable');
  });

  it('reports invalid filters and preserves a record draft when a view change is cancelled', async () => {
    const { root, button, confirmDiscard } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    const filter = root.querySelector<HTMLSelectElement>('[aria-label="Filter column"]')!;
    filter.value = 'id'; filter.dispatchEvent(new Event('change'));
    root.querySelector<HTMLInputElement>('[aria-label="Filter value"]')!.value = 'bad number';
    root.querySelector<HTMLFormElement>('.table-view-form')!.requestSubmit();
    expect(root.querySelector('.table-tools [role=alert]')?.textContent).toContain('whole number');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
    root.querySelector<HTMLInputElement>('[aria-label="Filter value"]')!.value = '1';
    root.querySelector<HTMLInputElement>('[aria-label="Select record 1"]')!.click(); button('Edit selected').click();
    const draft = root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!;
    draft.value = 'Keep this draft'; draft.dispatchEvent(new Event('input', { bubbles: true }));
    confirmDiscard.mockReturnValue(false);
    root.querySelector<HTMLFormElement>('.table-view-form')!.requestSubmit();
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLTextAreaElement>('.database-editor textarea')?.value).toBe('Keep this draft');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('reviews record before/after values and journals an undoable selective restoration', async () => {
    const { root, registry, button } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    for (const value of ['First version', 'Second version']) {
      root.querySelector<HTMLInputElement>('[aria-label="Select record 1"]')!.click(); button('Edit selected').click();
      root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!.value = value;
      root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    }
    root.querySelector<HTMLInputElement>('[aria-label="Select record 1"]')!.click(); registry.execute('record.history');
    expect(root.querySelector('.record-history-values')?.textContent).toContain('First version');
    expect(root.querySelector('.record-history-values')?.textContent).toContain('Second version');
    button('Restore before values').click();
    expect(root.querySelector('.datasheet tbody')?.textContent).toContain('First version');
    expect(root.querySelector<HTMLElement>('.record-history')?.hidden).toBe(true);
    expect(root.querySelector('.change-history')?.textContent).toContain('restore');
    registry.execute('edit.undo'); expect(root.querySelector('.datasheet tbody')?.textContent).toContain('Second version');
  });

  it('finds deleted-record history by id and restores it while preserving unrelated rows', async () => {
    const { root, registry, button } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    root.querySelector<HTMLInputElement>('[aria-label="Select record 1"]')!.click(); registry.execute('record.delete');
    expect(root.querySelectorAll('.datasheet tbody tr')).toHaveLength(2);
    button('Record history').click();
    root.querySelector<HTMLInputElement>('[aria-label="Record history id"]')!.value = '1';
    root.querySelector<HTMLFormElement>('.record-history form')!.requestSubmit();
    expect(root.querySelector('.record-history')?.textContent).toContain('not currently present');
    expect(button('Restore after values').disabled).toBe(true);
    button('Restore before values').click();
    expect(root.querySelectorAll('.datasheet tbody tr')).toHaveLength(3);
    expect(root.querySelector('.datasheet tbody')?.textContent).toContain('Alex Example');
    registry.execute('edit.undo'); expect(root.querySelectorAll('.datasheet tbody tr')).toHaveLength(2);
  });

  it('preserves a record draft when opening history is cancelled and keeps read-only history disabled', async () => {
    const { root, registry, pane, button, confirmDiscard } = setup();
    button('Try sample database').click(); await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    root.querySelector<HTMLInputElement>('[aria-label="Select record 1"]')!.click(); button('Edit selected').click();
    const draft = root.querySelector<HTMLTextAreaElement>('.database-editor textarea')!;
    draft.value = 'Keep draft'; draft.dispatchEvent(new Event('input', { bubbles: true }));
    confirmDiscard.mockReturnValue(false); registry.execute('record.history');
    expect(root.querySelector<HTMLElement>('.record-history')?.hidden).toBe(true);
    expect(root.querySelector<HTMLTextAreaElement>('.database-editor textarea')?.value).toBe('Keep draft');
    button('Cancel editing').click();
    const native = DatabaseSession.create(sqlite, true); const bytes = native.exportCopy(); native.close();
    await pane.openFile(fileFrom(bytes, 'readonly.qbase'), true);
    expect(registry.isAvailable('record.history')).toBe(false); expect(button('Record history').disabled).toBe(true);
  });
});


describe('snapshot workspace', () => {
  const snapshots = () => new IndexedDbSnapshotStore(() => new IDBFactory(), 'ui', async bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex'));
  it('pins, downloads and restores a journaled version as a new independent recovery copy', async () => {
    const store = snapshots(); const recovery = new IndexedDbRecoveryStore(() => new IDBFactory());
    const { root, button, download, registry } = setup(undefined, recovery, store);
    button('Try sample database').click();
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'));
    button('Create table').click(); root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    button('Snapshots').click(); button('Create snapshot').click();
    await vi.waitFor(async () => expect(await store.list()).toHaveLength(1));
    await vi.waitFor(() => expect(button('Download snapshot')).toBeDefined());
    button('Download snapshot').click();
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
    const saved = DatabaseSession.open(sqlite, download.mock.calls[0][0], 'download.qbase');
    expect(saved.tables()).toContain('Table1'); expect(saved.canUndo()).toBe(true); saved.close();
    await vi.waitFor(() => expect(button('Restore as new copy').disabled).toBe(false));
    button('New blank database').click();
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Untitled.qbase'));
    const checkboxes = root.querySelectorAll<HTMLInputElement>('.browser-snapshots input[type=checkbox]');
    checkboxes[1].click();
    await vi.waitFor(() => expect(button('Restore as new copy')).toBeDefined());
    button('Restore as new copy').click();
    await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Sample-snapshot copy.qbase'));
    expect(root.textContent).toContain('Table1'); expect(registry.isAvailable('edit.undo')).toBe(true);
    await vi.waitFor(async () => expect(await recovery.list()).toHaveLength(3));
    expect(new Set((await recovery.list()).map(item => item.id)).size).toBe(3);
    registry.execute('edit.undo'); expect(root.querySelector('nav[aria-label="Database tables"]')?.textContent).not.toContain('Table1');
    const snapshot = await store.read((await store.list())[0].id);
    const original = DatabaseSession.open(sqlite, new Uint8Array(snapshot.bytes), snapshot.name);
    expect(original.tables()).toContain('Table1'); original.close();
  });
  it('captures before changes only when opted in, excludes drafts and honors cancelled restores', async () => {
    const store = snapshots(); const { root, button, confirmDiscard } = setup(undefined, undefined, store);
    button('Try sample database').click(); await vi.waitFor(() => expect(button('Create table').disabled).toBe(false));
    expect(await store.list()).toHaveLength(0);
    button('Snapshots').click(); root.querySelector<HTMLInputElement>('.browser-snapshots input[type=checkbox]')!.click();
    button('Create table').click();
    const field = root.querySelector<HTMLInputElement>('.database-editor input')!; field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(button('Create snapshot').disabled).toBe(true); expect(await store.list()).toHaveLength(0);
    root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    await vi.waitFor(async () => expect(await store.list()).toHaveLength(1));
    const snapshot = await store.read((await store.list())[0].id);
    const prior = DatabaseSession.open(sqlite, new Uint8Array(snapshot.bytes), 'prior.qbase'); expect(prior.tables()).not.toContain('Table1'); prior.close();
    await vi.waitFor(() => expect(button('Restore as new copy')).toBeDefined());
    button('Add record').click(); root.querySelector('textarea')!.dispatchEvent(new Event('input', { bubbles: true }));
    confirmDiscard.mockReturnValue(false); button('Restore as new copy').click();
    await vi.waitFor(() => expect(confirmDiscard).toHaveBeenCalled());
    expect(root.querySelector('h2')?.textContent).toBe('Sample.qbase'); expect(root.querySelector('textarea')).not.toBeNull();
  });
  it('reports automatic storage failures visibly and keeps committed edits editable', async () => {
    const store = snapshots(); vi.spyOn(store, 'create').mockRejectedValue(new Error('Quota exceeded'));
    const { root, button, registry } = setup(undefined, undefined, store);
    button('Try sample database').click(); await vi.waitFor(() => expect(button('Create table').disabled).toBe(false));
    registry.execute('recover.autoSnapshots');
    button('Create table').click(); root.querySelector<HTMLFormElement>('.database-editor form')!.requestSubmit();
    await vi.waitFor(() => expect(root.querySelector('.browser-snapshots [role=alert]')?.textContent).toContain('Quota exceeded'));
    expect(root.textContent).toContain('Table1'); expect(registry.isAvailable('edit.undo')).toBe(true);
  });
});
