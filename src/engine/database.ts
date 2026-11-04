import type { Database, SqlJsStatic } from 'sql.js';

export const MAX_DATABASE_BYTES = 32 * 1024 * 1024;
export const PAGE_SIZE = 100;
export type Cell = string | number | bigint | Uint8Array | null;
export interface TablePage { columns: string[]; rows: Cell[][]; offset: number; hasMore: boolean }
const signature = 'SQLite format 3\0';
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"';

/** An in-memory, read-only working copy. No caller receives the SQLite connection. */
export class DatabaseSession {
  private closed = false;
  private constructor(private readonly db: Database, readonly name: string, readonly isNative: boolean) {
    db.run('PRAGMA query_only = ON');
  }

  static create(sqlite: SqlJsStatic, sample = false): DatabaseSession {
    const db = new sqlite.Database();
    try {
      db.run(`CREATE TABLE qb_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO qb_meta VALUES ('application', 'annes-base'), ('schema_version', '0-preview');`);
      if (sample) {
        db.run(`CREATE TABLE Customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT);
          CREATE TABLE Orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES Customers(id), item TEXT, amount_cents INTEGER);
          INSERT INTO Customers VALUES (1, 'Alex Example', 'Boston'), (2, 'Renée Example', 'Montréal'), (3, '架空 Example', NULL);
          INSERT INTO Orders VALUES (1, 1, 'Notebook', 1250), (2, 2, 'Desk lamp', 4500), (3, 1, 'Folder', 350);`);
      }
      return new DatabaseSession(db, sample ? 'Sample.qbase' : 'Untitled.qbase', true);
    } catch (error) { db.close(); throw error; }
  }

  static open(sqlite: SqlJsStatic, bytes: Uint8Array, name: string): DatabaseSession {
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
          isNative = values.get('application') === 'annes-base' && values.get('schema_version') === '0-preview';
        } catch { /* An unrelated SQLite table named qb_meta is ordinary user data. */ }
      }
      return new DatabaseSession(db, name, isNative);
    } catch (error) {
      db.close();
      throw new Error(`Cannot open this database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private assertOpen(): void { if (this.closed) throw new Error('The database is closed.'); }

  tables(): string[] {
    this.assertOpen();
    const result = this.db.exec("SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name COLLATE NOCASE, name");
    return (result[0]?.values ?? []).map(row => String(row[0])).filter(name => !this.isNative || name !== 'qb_meta');
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

  close(): void { if (!this.closed) { this.db.close(); this.closed = true; } }
}
