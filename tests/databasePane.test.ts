// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRegistry } from '../src/commands/registry';
import { DatabaseSession } from '../src/engine/database';
import { mountDatabasePane } from '../src/ui/databasePane';

let sqlite: SqlJsStatic;
const cleanups: (() => void)[] = [];
beforeAll(async () => {
  sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer });
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); });

function setup(load = async () => sqlite) {
  const root = document.createElement('div');
  document.body.append(root);
  const registry = createRegistry();
  const download = vi.fn();
  const changed = vi.fn();
  const pane = mountDatabasePane(root, registry, changed, vi.fn(), { load, download });
  cleanups.push(pane.dispose);
  const button = (label: string) => [...root.querySelectorAll('button')].find(button => button.textContent === label)!;
  return { root, registry, pane, download, changed, button };
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
});
