import type { Database, SqlJsStatic } from 'sql.js';
import { NativeJournal, type Field, type RecordValues } from './journal';

export const MAX_DATABASE_BYTES = 32 * 1024 * 1024;
export const PAGE_SIZE = 100;
export type Cell = string | number | bigint | Uint8Array | null;
export interface TablePage { columns: string[]; rows: Cell[][]; offset: number; hasMore: boolean }
const signature = 'SQLite format 3\0';
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';

/** In-memory working copy; only validated native schemas expose journaled mutations. */
export class DatabaseSession {
  private closed = false;
  private constructor(private readonly db: Database, readonly name: string, readonly isNative: boolean, private readonly journal?: NativeJournal) {
    db.run('PRAGMA query_only = ON');
  }

  static create(sqlite: SqlJsStatic, sample = false): DatabaseSession {
    const db = new sqlite.Database();
    try {
      const journal = NativeJournal.initialize(db, sample);
      return new DatabaseSession(db, sample ? 'Sample.qbase' : 'Untitled.qbase', true, journal);
    } catch (error) { db.close(); throw error; }
  }

  static open(sqlite: SqlJsStatic, bytes: Uint8Array, name: string, readOnly = false): DatabaseSession {
    if (bytes.byteLength > MAX_DATABASE_BYTES) throw new Error('This preview supports databases up to 32 MiB.');
    if (bytes.byteLength < 100 || ![...signature].every((character, index) => bytes[index] === character.charCodeAt(0))) {
      throw new Error('This is not a supported SQLite database. Access, encrypted files and damaged headers need readers that are not available yet.');
    }
    const db = new sqlite.Database(bytes);
    try {
      db.run('PRAGMA query_only = ON');
      const checks = db.exec('PRAGMA quick_check(1)');
      if (checks[0]?.values[0]?.[0] !== 'ok') throw new Error('The database failed its integrity check. Recovery is not implemented yet; the original file was not changed.');
      const tables = db.exec("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'qb_meta'");
      let isNative = false;
      if (tables[0]?.values.length) {
        try {
          const metadata = db.exec("SELECT key, value FROM qb_meta WHERE key IN ('application', 'schema_version')");
          const values = new Map(metadata[0]?.values.map(row => [row[0], row[1]]));
          isNative = values.get('application') === 'annes-base' && ['0-preview', '1-preview'].includes(String(values.get('schema_version')));
        } catch { /* An unrelated SQLite table named qb_meta is ordinary user data. */ }
      }
      return new DatabaseSession(db, name, isNative, isNative && !readOnly ? NativeJournal.attach(db) : undefined);
    } catch (error) {
      db.close();
      throw new Error(`Cannot open this database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private assertOpen(): void { if (this.closed) throw new Error('The database is closed.'); }

  tables(): string[] {
    this.assertOpen();
    const result = this.db.exec("SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name COLLATE NOCASE, name");
    return (result[0]?.values ?? []).map(row => String(row[0])).filter(name => !this.isNative || !['qb_meta', 'qb_objects', 'qb_journal'].includes(name));
  }

  page(table: string, offset = 0): TablePage {
    this.assertOpen();
    if (!this.tables().includes(table)) throw new Error('Choose a table from the navigation pane.');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid page offset.');
    // Read one extra row to detect a next page without an expensive full-table count.
    const statement = this.db.prepare(`SELECT * FROM ${quote(table)} LIMIT ? OFFSET ?`);
    try {
      statement.bind([PAGE_SIZE + 1, offset]);
      const columns = statement.getColumnNames();
      const rows: Cell[][] = [];
      // sql.js supports useBigInt; its separate DefinitelyTyped package omits this overload.
      const reader = statement as typeof statement & { get(params: null, options: { useBigInt: true }): Cell[] };
      while (statement.step()) rows.push(reader.get(null, { useBigInt: true }));
      return { columns, rows: rows.slice(0, PAGE_SIZE), offset, hasMore: rows.length > PAGE_SIZE };
    } finally { statement.free(); }
  }

  exportCopy(): Uint8Array {
    this.assertOpen();
    // sql.js export reopens its connection and resets pragmas.
    try { return this.db.export(); }
    finally { this.db.run('PRAGMA query_only = ON'); }
  }

  get editable(): boolean { this.assertOpen(); return !!this.journal; }
  get hasChanges(): boolean { this.assertOpen(); return this.journal?.changed ?? false; }
  acknowledgeDownload(): void { if (this.journal) this.journal.changed = false; }
  private writable(): NativeJournal {
    this.assertOpen();
    if (!this.journal) throw new Error('This database is read-only. Create a new native database to edit records.');
    return this.journal;
  }
  fields(table: string): Field[] { return this.writable().fields(table); }
  canEditTable(table: string): boolean { try { this.fields(table); return true; } catch { return false; } }
  createTable(name: string, fields: Field[]): void { this.writable().createTable(name, fields); }
  insertRecord(table: string, values: RecordValues): string { return this.writable().insert(table, values); }
  updateRecord(table: string, id: string, values: RecordValues): void { this.writable().update(table, id, values); }
  deleteRecord(table: string, id: string): void { this.writable().delete(table, id); }
  record(table: string, id: string): Cell[] { return this.writable().record(table, id); }
  history() { this.assertOpen(); return this.journal?.history() ?? []; }
  canUndo(): boolean { this.assertOpen(); return this.journal?.canUndo() ?? false; }
  undo(): void { this.writable().undo(); }

  close(): void { if (!this.closed) { this.db.close(); this.closed = true; } }
}
