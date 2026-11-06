import { columnKind, compileView, filterConditions, sortLevels, type TableColumn, type TableView } from '../engine/tableView';

export interface ViewSchema { table: string; columns: TableColumn[] }
export interface ViewDefinition extends ViewSchema { name: string; sourceName: string; view: TableView; filterEnabled: boolean }
export interface SavedView extends ViewDefinition { version: 1; id: string; revision: number; savedAt: number }
export interface SavedViewStore {
  list(): Promise<SavedView[]>;
  read(id: string): Promise<SavedView>;
  create(definition: ViewDefinition): Promise<SavedView>;
  update(id: string, definition: ViewDefinition, expectedRevision: number): Promise<SavedView>;
  remove(id: string, expectedRevision: number): Promise<void>;
}
export const MAX_SAVED_VIEWS = 200;
export function schemaKey(schema: ViewSchema): string {
  return JSON.stringify([schema.table, schema.columns.map(column => [column.name, column.type, column.primaryKey, column.kind])]);
}
export function normalizeDefinition(value: ViewDefinition): ViewDefinition {
  const text = (input: unknown, limit: number) => typeof input === 'string' && input.length > 0 && input.length <= limit && !/[\x00-\x1f]/.test(input);
  if (!value || !text(value.name, 80) || !value.name.trim()) throw new Error('Use a view name of 1–80 characters without control characters.');
  if (!text(value.table, 1024) || !text(value.sourceName, 1024) || typeof value.filterEnabled !== 'boolean' || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > 2048) throw new Error('Invalid saved-view table metadata.');
  const names = new Set<string>();
  const columns = value.columns.map(column => {
    if (!column || !text(column.name, 1024) || typeof column.type !== 'string' || column.type.length > 1024 || !Number.isSafeInteger(column.primaryKey) || column.primaryKey < 0 || !['text', 'integer', 'number', 'blob'].includes(column.kind) || column.kind !== columnKind(column.type) || names.has(column.name)) throw new Error('Invalid saved-view column metadata.');
    names.add(column.name); return { name: column.name, type: column.type, primaryKey: column.primaryKey, kind: column.kind };
  });
  if (!value.view || typeof value.view !== 'object' || Array.isArray(value.view)) throw new Error('Invalid saved-view settings.');
  compileView(columns, value.view); // Validate even disabled filters; never store executable SQL.
  const conditions = filterConditions(value.view).map(condition => ({ column: condition.column, operator: condition.operator, ...(['isNull', 'isNotNull'].includes(condition.operator) ? {} : { value: condition.value }) }));
  const view: TableView = {
    sorts: sortLevels(value.view).map(level => ({ column: level.column, direction: level.direction })),
    ...(conditions.length ? { filters: { match: value.view.filters?.match ?? 'all', conditions } } : {}),
    search: value.view.search ?? '',
  };
  const definition = { name: value.name.trim(), sourceName: value.sourceName, table: value.table, columns, view, filterEnabled: value.filterEnabled };
  if (new TextEncoder().encode(JSON.stringify(definition)).byteLength > 256 * 1024) throw new Error('This saved-view definition is too large.');
  return definition;
}
function decode(value: any): SavedView {
  if (!value || value.version !== 1 || typeof value.id !== 'string' || !value.id || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isFinite(value.savedAt)) throw new Error('A saved view is invalid or uses an unsupported version.');
  const definition = normalizeDefinition(value);
  if (schemaKey(definition) !== value.schemaKey || definition.name.toLocaleLowerCase('en-US') !== value.nameKey) throw new Error('Saved-view metadata is inconsistent.');
  return { ...definition, version: 1, id: value.id, revision: value.revision, savedAt: value.savedAt };
}
export class SavedViewConflict extends Error {
  constructor() { super('This saved view changed in another tab. Refresh the list before replacing or removing it.'); }
}

/** Independent browser library; never changes SQLite files, recovery bytes or snapshot stores. */
export class IndexedDbSavedViewStore implements SavedViewStore {
  private opening?: Promise<IDBDatabase>;
  constructor(private readonly factory = () => window.indexedDB, private readonly databaseName = 'annesbase.views.v1') {}
  private open(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory().open(this.databaseName, 1); let settled = false;
      request.onupgradeneeded = () => { request.result.createObjectStore('views', { keyPath: 'id' }).createIndex('name', ['schemaKey', 'nameKey'], { unique: true }); };
      request.onerror = () => { settled = true; reject(request.error ?? new Error('Saved-view storage is unavailable.')); };
      request.onblocked = () => { settled = true; reject(new Error('Close older tabs to enable saved-view storage.')); };
      request.onsuccess = () => {
        const db = request.result; if (settled) { db.close(); return; } settled = true;
        db.onversionchange = () => { db.close(); this.opening = undefined; }; resolve(db);
      };
    }).catch(error => { this.opening = undefined; throw error; });
    return this.opening;
  }
  async list(): Promise<SavedView[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('views', 'readonly'); const request = tx.objectStore('views').getAll();
      tx.oncomplete = () => { try { resolve(request.result.map(decode).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))); } catch (error) { reject(error); } };
      tx.onabort = () => reject(tx.error ?? new Error('Cannot list saved views.'));
    });
  }
  async read(id: string): Promise<SavedView> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('views', 'readonly'); const request = tx.objectStore('views').get(id);
      tx.oncomplete = () => { try { if (!request.result) throw new Error('The saved view no longer exists. Refresh the list.'); resolve(decode(request.result)); } catch (error) { reject(error); } };
      tx.onabort = () => reject(tx.error ?? new Error('Cannot read saved view.'));
    });
  }
  create(definition: ViewDefinition): Promise<SavedView> { return this.write(crypto.randomUUID(), definition, null); }
  update(id: string, definition: ViewDefinition, expectedRevision: number): Promise<SavedView> { return this.write(id, definition, expectedRevision); }
  private async write(id: string, input: ViewDefinition, expectedRevision: number | null): Promise<SavedView> {
    const definition = normalizeDefinition(input);
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) throw new Error('Invalid saved-view revision.');
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('views', 'readwrite'); const store = tx.objectStore('views'); let error: unknown, saved: SavedView;
      const request = store.get(id);
      request.onsuccess = () => {
        if ((request.result?.revision ?? null) !== expectedRevision) { error = new SavedViewConflict(); tx.abort(); return; }
        const commit = () => {
          try {
            saved = { ...definition, version: 1, id, revision: (expectedRevision ?? 0) + 1, savedAt: Date.now() };
            store.put({ ...saved, schemaKey: schemaKey(definition), nameKey: definition.name.toLocaleLowerCase('en-US') });
          } catch (reason) { error = reason; tx.abort(); }
        };
        if (expectedRevision === null) {
          const count = store.count(); count.onsuccess = () => { if (count.result >= MAX_SAVED_VIEWS) { error = new Error(`Keep at most ${MAX_SAVED_VIEWS} saved views in this browser.`); tx.abort(); } else commit(); };
        } else commit();
      };
      tx.oncomplete = () => resolve(saved);
      tx.onabort = () => reject(error ?? (tx.error?.name === 'ConstraintError' ? new Error('A saved view with that name already exists for this table layout.') : tx.error ?? new Error('The saved view could not be stored.')));
    });
  }
  async remove(id: string, expectedRevision: number): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('views', 'readwrite'); const store = tx.objectStore('views'); const request = store.get(id); let error: unknown;
      request.onsuccess = () => {
        if (request.result?.revision !== expectedRevision) { error = new SavedViewConflict(); tx.abort(); return; }
        try { store.delete(id); } catch (reason) { error = reason; tx.abort(); }
      };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(error ?? tx.error ?? new Error('Cannot remove saved view.'));
    });
  }
}
