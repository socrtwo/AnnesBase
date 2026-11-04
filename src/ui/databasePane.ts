import type { SqlJsStatic } from 'sql.js';
import type { CommandRegistry } from '../commands/registry';
import { DatabaseSession, MAX_DATABASE_BYTES, PAGE_SIZE, type Cell } from '../engine/database';

export interface DatabaseDependencies {
  load: () => Promise<SqlJsStatic>;
  download: (bytes: Uint8Array, name: string) => void;
}
const defaultDependencies: DatabaseDependencies = {
  load: async () => (await import('../engine/browser')).loadSqlite(),
  download: (bytes, name) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/vnd.sqlite3' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  },
};

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountDatabasePane(
  container: HTMLElement,
  registry: CommandRegistry,
  changed: (name: string | undefined, busy: boolean) => void,
  showWorkspace: () => void,
  dependencies: DatabaseDependencies = defaultDependencies,
): { openFile: (file: File) => Promise<void>; dispose: () => void } {
  let session: DatabaseSession | undefined;
  let selected: string | undefined;
  let offset = 0;
  let busy = false;
  let disposed = false;
  const pane = node('section');
  pane.className = 'database-pane';
  pane.setAttribute('aria-label', 'Database workspace');
  const title = node('h2', 'Your database workspace');
  const message = node('p', 'Create a blank database, try the sample, or open a SQLite file from your device.');
  message.setAttribute('role', 'status');
  const actions = node('div');
  actions.className = 'database-actions';
  const button = (text: string, action: () => void) => {
    const control = node('button', text);
    control.addEventListener('click', action);
    actions.append(control);
    return control;
  };
  const input = node('input');
  input.type = 'file';
  input.accept = '.qbase,.sqlite,.sqlite3,.db,application/vnd.sqlite3,application/x-sqlite3';
  input.hidden = true;
  input.setAttribute('aria-label', 'Open SQLite database');
  const grid = node('div');
  grid.className = 'database-grid';
  const navigation = node('nav');
  navigation.setAttribute('aria-label', 'Database tables');
  const data = node('div');
  data.className = 'datasheet';
  const note = node('p', 'Read-only preview · Files stay on your device. Download a copy to keep a new database. Reloading clears the workspace. Limit: 32 MiB.');
  note.className = 'database-note';

  const display = (value: Cell): string => {
    if (value === null) return 'NULL';
    if (value instanceof Uint8Array) return `BLOB · ${value.byteLength} bytes`;
    const text = String(value);
    return text.length > 2000 ? text.slice(0, 2000) + '… [display shortened]' : text;
  };
  function renderTable() {
    data.replaceChildren();
    if (!session || !selected) {
      data.append(node('p', session ? 'This database has no user tables. Table creation and editing are coming next.' : 'No database is open.'));
      return;
    }
    try {
      const page = session.page(selected, offset);
      data.append(node('h3', selected));
      const wrapper = node('div');
      wrapper.className = 'datasheet-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', `${selected} records`);
      const table = node('table');
      const caption = node('caption', `${selected} · read-only`);
      const head = node('thead');
      const header = node('tr');
      for (const column of page.columns) { const th = node('th', column); th.scope = 'col'; header.append(th); }
      head.append(header);
      const body = node('tbody');
      for (const row of page.rows) {
        const tr = node('tr');
        for (const value of row) {
          const td = node('td', display(value));
          if (value === null) td.className = 'null-cell';
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(caption, head, body);
      wrapper.append(table);
      const pagination = node('div');
      pagination.className = 'pagination';
      const previous = node('button', 'Previous page');
      previous.disabled = offset === 0;
      previous.addEventListener('click', () => { offset = Math.max(0, offset - PAGE_SIZE); renderTable(); });
      const next = node('button', 'Next page');
      next.disabled = !page.hasMore;
      next.addEventListener('click', () => { offset += PAGE_SIZE; renderTable(); });
      const range = page.rows.length ? `Rows ${offset + 1}–${offset + page.rows.length}` : 'No records';
      pagination.append(previous, node('span', range), next);
      data.append(wrapper, pagination);
    } catch (error) { data.append(node('p', `Cannot read this table: ${error instanceof Error ? error.message : String(error)}`)); }
  }

  function render() {
    title.textContent = session ? session.name : 'Your database workspace';
    navigation.replaceChildren(node('h3', 'Tables'));
    for (const name of session?.tables() ?? []) {
      const item = node('button', name);
      item.setAttribute('aria-pressed', String(name === selected));
      item.addEventListener('click', () => { selected = name; offset = 0; render(); });
      navigation.append(item);
    }
    for (const control of [newButton, sampleButton, openButton]) control.disabled = busy;
    exportButton.disabled = busy || !session;
    closeButton.disabled = busy || !session;
    pane.setAttribute('aria-busy', String(busy));
    renderTable();
    changed(session?.name, busy);
  }

  async function replace(create: () => Promise<DatabaseSession>) {
    if (busy || disposed) return;
    busy = true;
    message.textContent = 'Loading SQLite…';
    render();
    let candidate: DatabaseSession | undefined;
    try {
      candidate = await create();
      if (disposed) { candidate.close(); return; }
      // Validate navigation before replacing a successfully opened database.
      const tables = candidate.tables();
      session?.close();
      session = candidate;
      candidate = undefined;
      selected = tables[0];
      offset = 0;
      message.textContent = `${session.name} is open read-only. ${tables.length} user tables.`;
      showWorkspace();
    } catch (error) {
      candidate?.close();
      message.textContent = `${error instanceof Error ? error.message : String(error)}${session ? ' The current database is still open.' : ''}`;
    } finally { busy = false; if (!disposed) render(); }
  }

  function download() {
    if (!session || busy) return;
    showWorkspace();
    try {
      const base = session.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'Database';
      const extension = session.isNative ? '.qbase' : '.sqlite';
      dependencies.download(session.exportCopy(), `${base}-copy${extension}`);
      message.textContent = 'Download started. Keep the downloaded copy; this preview does not save back to the original file.';
    } catch (error) { message.textContent = `Download failed: ${error instanceof Error ? error.message : String(error)}`; }
  }
  function close() {
    if (busy) return;
    showWorkspace();
    session?.close(); session = undefined; selected = undefined; offset = 0;
    message.textContent = 'Database closed. Files on your device were not changed.';
    render();
  }
  async function openFile(file: File) {
    showWorkspace();
    await replace(async () => {
      if (file.size > MAX_DATABASE_BYTES) throw new Error('This preview supports databases up to 32 MiB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      return DatabaseSession.open(await dependencies.load(), bytes, file.name);
    });
  }
  const newButton = button('New blank database', () => { void replace(async () => DatabaseSession.create(await dependencies.load())); });
  const sampleButton = button('Try sample database', () => { void replace(async () => DatabaseSession.create(await dependencies.load(), true)); });
  const openButton = button('Open SQLite file', () => input.click());
  const exportButton = button('Download a copy', download);
  const closeButton = button('Close database', close);
  input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; if (file) void openFile(file); });
  for (const [id, handler, enabled] of [
    ['file.new', () => newButton.click(), () => !busy],
    ['file.open', () => input.click(), () => !busy],
    ['file.openReadOnly', () => input.click(), () => !busy],
    ['file.save', download, () => !!session && !busy],
    ['file.saveAs', download, () => !!session && !busy],
    ['file.closeDatabase', close, () => !!session && !busy],
  ] as const) registry.bind(id, handler, enabled);
  grid.append(navigation, data);
  pane.append(title, message, actions, input, grid, note);
  container.append(pane);
  render();
  return { openFile, dispose: () => { disposed = true; session?.close(); } };
}
