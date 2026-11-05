import type { Database, BindParams } from 'sql.js';
import type { Cell } from './database';

export interface Field { name: string; type: 'TEXT' | 'INTEGER' | 'REAL'; required: boolean }
export type RecordValues = Record<string, string | null>;
export interface HistoryEntry { id: string; operation: string; table: string; recordId: string | null; time: string; undone: boolean }
export interface RecordVersion extends HistoryEntry { before: Cell[] | null; after: Cell[] | null }
export interface RecordHistory {
  columns: string[]; versions: RecordVersion[]; hasMore: boolean;
  currentToken: string | null; restorable: boolean; reason: string;
}
export const quoteName = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const schemas = {
  qb_meta: 'CREATE TABLE qb_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  qb_objects: 'CREATE TABLE qb_objects (name TEXT PRIMARY KEY, fields_json TEXT NOT NULL)',
  qb_journal: 'CREATE TABLE qb_journal (id INTEGER PRIMARY KEY, operation TEXT NOT NULL, table_name TEXT NOT NULL, record_id TEXT, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0)',
};

export function rows(db: Database, sql: string, params: BindParams = []): Cell[][] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const reader = statement as typeof statement & { get(params: null, options: { useBigInt: true }): Cell[] };
    const result: Cell[][] = [];
    while (statement.step()) result.push(reader.get(null, { useBigInt: true }));
    return result;
  } finally { statement.free(); }
}

function validName(name: string): void {
  if (!name.trim() || name.length > 64 || /[\x00-\x1f]/.test(name)) throw new Error('Use a name of 1–64 characters without control characters.');
}
function fieldsValid(fields: Field[]): void {
  if (!Array.isArray(fields) || !fields.length || fields.length > 32) throw new Error('Add between 1 and 32 fields.');
  const names = new Set(['id']);
  for (const field of fields) {
    if (!field || typeof field.name !== 'string') throw new Error('Invalid field.');
    validName(field.name);
    if (!['TEXT', 'INTEGER', 'REAL'].includes(field.type) || typeof field.required !== 'boolean') throw new Error('Invalid field type or required setting.');
    const name = field.name.toLowerCase();
    if (names.has(name)) throw new Error('Field names must be unique; id is provided automatically.');
    names.add(name);
  }
}
function tableSql(name: string, fields: Field[]): string {
  return `CREATE TABLE ${quoteName(name)} (id INTEGER PRIMARY KEY, ${fields.map(field => `${quoteName(field.name)} ${field.type}${field.required ? ' NOT NULL' : ''}`).join(', ')})`;
}
const encode = (row: Cell[] | undefined) => row ? JSON.stringify(row.map(cell => typeof cell === 'bigint' ? { integer: String(cell) } : cell)) : null;
function decode(json: string, fields: Field[]): Cell[] {
  const cells: unknown = JSON.parse(json);
  if (!Array.isArray(cells) || cells.length !== fields.length + 1) throw new Error('Invalid journal record.');
  return cells.map((value, i) => {
    const type = i === 0 ? 'INTEGER' : fields[i - 1].type;
    if (value === null && i > 0 && !fields[i - 1].required) return null;
    if (type === 'INTEGER' && value && typeof value === 'object' && typeof value.integer === 'string' && value.integer.length <= 20 && /^-?\d+$/.test(value.integer)) {
      const n = BigInt(value.integer);
      if (n >= -(2n ** 63n) && n < 2n ** 63n) return n;
    }
    if (type === 'TEXT' && typeof value === 'string') return value;
    if (type === 'REAL' && (typeof value === 'number' && Number.isFinite(value) || value && typeof value === 'object' && typeof value.integer === 'string' && Number.isFinite(Number(value.integer)))) {
      return typeof value === 'number' ? value : Number(value.integer);
    }
    throw new Error('Invalid journal value.');
  });
}
const bindCells = (cells: Cell[]) => cells.map(cell => typeof cell === 'bigint' ? String(cell) : cell);

/** Writes only supported native schemas; each user mutation and its journal event commit together. */
export class NativeJournal {
  changed = false;
  constructor(private readonly db: Database) {}

  static initialize(db: Database, sample: boolean): NativeJournal {
    db.run(Object.values(schemas).join(';'));
    db.run("INSERT INTO qb_meta VALUES ('application', 'annes-base'), ('schema_version', '2-preview')");
    const journal = new NativeJournal(db);
    if (sample) {
      journal.addTable('Customers', [{ name: 'name', type: 'TEXT', required: true }, { name: 'city', type: 'TEXT', required: false }]);
      journal.addTable('Orders', [{ name: 'customer_id', type: 'INTEGER', required: false }, { name: 'item', type: 'TEXT', required: false }, { name: 'amount_cents', type: 'INTEGER', required: false }]);
      db.run(`INSERT INTO Customers VALUES (1, 'Alex Example', 'Boston'), (2, 'Renée Example', 'Montréal'), (3, '架空 Example', NULL);
        INSERT INTO Orders VALUES (1, 1, 'Notebook', 1250), (2, 2, 'Desk lamp', 4500), (3, 1, 'Folder', 350)`);
    }
    return journal;
  }

  static attach(db: Database): NativeJournal | undefined {
    try {
      if (!['1-preview', '2-preview'].includes(String(rows(db, "SELECT value FROM qb_meta WHERE key='schema_version'")[0]?.[0]))) return undefined;
      for (const [name, sql] of Object.entries(schemas)) {
        if (rows(db, 'SELECT sql FROM sqlite_schema WHERE name=? AND type=\'table\'', [name])[0]?.[0] !== sql) return undefined;
      }
      if (rows(db, "SELECT name FROM sqlite_schema WHERE type='trigger'").length) return undefined;
      return new NativeJournal(db);
    } catch { return undefined; }
  }

  fields(name: string): Field[] {
    const result = rows(this.db, 'SELECT fields_json FROM qb_objects WHERE name=?', [name]);
    if (!result[0]) throw new Error('This table is read-only; its schema is not managed by this preview.');
    const fields: Field[] = JSON.parse(String(result[0][0]));
    fieldsValid(fields);
    if (rows(this.db, "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?", [name])[0]?.[0] !== tableSql(name, fields)) throw new Error('This table has an unsupported or modified schema.');
    return fields;
  }

  private transaction<T>(change: () => T): T {
    this.db.run('PRAGMA query_only=OFF; BEGIN IMMEDIATE');
    try {
      const result = change();
      this.db.run('COMMIT');
      this.changed = true;
      return result;
    } catch (error) { this.db.run('ROLLBACK'); throw error; }
    finally { this.db.run('PRAGMA query_only=ON'); }
  }
  private event(operation: string, table: string, id: string | null, before: string | null, after: string | null): void {
    this.db.run('INSERT INTO qb_journal (operation, table_name, record_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', [operation, table, id, before, after, new Date().toISOString()]);
  }
  private addTable(name: string, fields: Field[]): void {
    this.db.run(tableSql(name, fields));
    this.db.run('INSERT INTO qb_objects VALUES (?, ?)', [name, JSON.stringify(fields)]);
  }
  private boundary(table: string): string {
    return String(rows(this.db, "SELECT COALESCE(MAX(id),0) FROM qb_journal WHERE table_name=? AND operation='createTable' AND undone=0", [table])[0][0]);
  }
  private canonicalId(id: string): string {
    if (id.length > 20 || !/^-?\d+$/.test(id) || BigInt(id) < -(2n ** 63n) || BigInt(id) >= 2n ** 63n) throw new Error('Invalid record or history id.');
    return String(BigInt(id));
  }
  private current(table: string, id: string): Cell[] | undefined {
    return rows(this.db, `SELECT * FROM ${quoteName(table)} WHERE id=?`, [id])[0];
  }
  createTable(name: string, fields: Field[]): void {
    validName(name); fieldsValid(fields);
    if (/^(qb_|sqlite_)/i.test(name)) throw new Error('Names starting with qb_ or sqlite_ are reserved.');
    this.transaction(() => { this.addTable(name, fields); this.event('createTable', name, null, null, JSON.stringify(fields)); });
  }

  record(table: string, id: string): Cell[] {
    this.fields(table);
    const result = this.current(table, this.canonicalId(id));
    if (!result) throw new Error('The record no longer exists.');
    return result;
  }

  private values(fields: Field[], values: RecordValues): (string | number | null)[] {
    if (Object.keys(values).some(key => !fields.some(field => field.name === key))) throw new Error('Unknown field.');
    return fields.map(field => {
      const value = Object.hasOwn(values, field.name) ? values[field.name] ?? null : null;
      if (value === null) { if (field.required) throw new Error(`${field.name} is required.`); return null; }
      if (typeof value !== 'string') throw new Error('Field values must be text or null.');
      if (field.type === 'INTEGER') {
        if (!/^[+-]?\d+$/.test(value.trim())) throw new Error(`${field.name} must be a whole number.`);
        const integer = BigInt(value.trim());
        if (integer < -(2n ** 63n) || integer >= 2n ** 63n) throw new Error(`${field.name} is outside the 64-bit integer range.`);
        return String(integer);
      }
      if (field.type === 'REAL') {
        if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${field.name} must be a finite decimal number.`);
        return Number(value);
      }
      return value;
    });
  }
  insert(table: string, values: RecordValues): string {
    const fields = this.fields(table);
    const params = this.values(fields, values);
    return this.transaction(() => {
      const currentMax = rows(this.db, `SELECT COALESCE(MAX(id),0) FROM ${quoteName(table)}`)[0][0] as bigint;
      const historicMax = rows(this.db, 'SELECT COALESCE(MAX(CAST(record_id AS INTEGER)),0) FROM qb_journal WHERE table_name=? AND id>?', [table, this.boundary(table)])[0][0] as bigint;
      const highest = currentMax > historicMax ? currentMax : historicMax;
      const next = (highest > 0n ? highest : 0n) + 1n;
      if (next >= 2n ** 63n) throw new Error('No unused automatic record ids remain.');
      const id = String(next);
      this.db.run(`INSERT INTO ${quoteName(table)} (id, ${fields.map(f => quoteName(f.name)).join(',')}) VALUES (?, ${fields.map(() => '?').join(',')})`, [id, ...params]);
      this.event('insert', table, id, null, encode(this.record(table, id)));
      return id;
    });
  }
  update(table: string, id: string, values: RecordValues): void {
    id = this.canonicalId(id);
    const fields = this.fields(table);
    const params = this.values(fields, values);
    this.transaction(() => {
      const before = this.record(table, id);
      decode(encode(before)!, fields);
      this.db.run(`UPDATE ${quoteName(table)} SET ${fields.map(f => `${quoteName(f.name)}=?`).join(',')} WHERE id=?`, [...params, id]);
      this.event('update', table, id, encode(before), encode(this.record(table, id)));
    });
  }
  delete(table: string, id: string): void {
    id = this.canonicalId(id);
    const fields = this.fields(table);
    this.transaction(() => {
      const before = this.record(table, id);
      decode(encode(before)!, fields);
      this.db.run(`DELETE FROM ${quoteName(table)} WHERE id=?`, [id]);
      this.event('delete', table, id, encode(before), null);
    });
  }
  history(): HistoryEntry[] {
    return rows(this.db, 'SELECT id, operation, table_name, record_id, created_at, undone FROM qb_journal ORDER BY id DESC LIMIT 100').map(row => ({
      id: String(row[0]), operation: String(row[1]), table: String(row[2]), recordId: row[3] === null ? null : String(row[3]), time: String(row[4]), undone: row[5] === 1n,
    }));
  }
  recordHistory(table: string, recordId: string, beforeEvent?: string): RecordHistory {
    const fields = this.fields(table); const id = this.canonicalId(recordId); const boundary = this.boundary(table);
    const where = 'table_name=? AND record_id=? AND id>?';
    const params = [table, id, boundary];
    const actual = this.current(table, id);
    const reused = Number(rows(this.db, `SELECT COUNT(*) FROM qb_journal WHERE ${where} AND operation='insert'`, params)[0][0]) > 1;
    const latest = rows(this.db, `SELECT operation, after_json FROM qb_journal WHERE ${where} AND undone=0 ORDER BY id DESC LIMIT 1`, params)[0];
    const earliest = latest ? undefined : rows(this.db, `SELECT operation, before_json FROM qb_journal WHERE ${where} ORDER BY id LIMIT 1`, params)[0];
    const expected = latest ?? earliest;
    let tracked = true;
    if (expected) {
      if (!['insert', 'update', 'delete', 'restore'].includes(String(expected[0]))) throw new Error('Unsupported record history operation.');
      tracked = encode(actual) === (expected[1] === null ? null : encode(decode(String(expected[1]), fields)));
    }
    const limit = beforeEvent === undefined ? '' : ' AND id<?';
    const values = beforeEvent === undefined ? params : [...params, this.canonicalId(beforeEvent)];
    const history = rows(this.db, `SELECT id, operation, record_id, created_at, undone, before_json, after_json FROM qb_journal WHERE ${where}${limit} ORDER BY id DESC LIMIT 51`, values);
    const versions = history.slice(0, 50).map(row => {
      if (!['insert', 'update', 'delete', 'restore'].includes(String(row[1]))) throw new Error('Unsupported record history operation.');
      const before = row[5] === null ? null : decode(String(row[5]), fields);
      const after = row[6] === null ? null : decode(String(row[6]), fields);
      if ([before, after].some(image => image && String(image[0]) !== id)) throw new Error('Invalid journal record id.');
      return { id: String(row[0]), operation: String(row[1]), table, recordId: id, time: String(row[3]), undone: row[4] === 1n, before, after };
    });
    return {
      columns: ['id', ...fields.map(field => field.name)], versions, hasMore: history.length > 50,
      currentToken: encode(actual), restorable: !reused && tracked,
      reason: reused ? 'This id was reused in an older file. History may include different records; selective restore is disabled.'
        : !tracked ? 'The record changed outside its journal. Selective restore is disabled.' : '',
    };
  }
  restoreVersion(table: string, recordId: string, eventId: string, side: 'before' | 'after', expectedCurrent: string | null): void {
    const fields = this.fields(table); const id = this.canonicalId(recordId); const event = this.canonicalId(eventId);
    if (!['before', 'after'].includes(side)) throw new Error('Choose before or after values.');
    const entry = rows(this.db, 'SELECT operation, before_json, after_json FROM qb_journal WHERE id=? AND table_name=? AND record_id=? AND id>?', [event, table, id, this.boundary(table)])[0];
    if (!entry) throw new Error('This change does not belong to the current table and record.');
    if (!['insert', 'update', 'delete', 'restore'].includes(String(entry[0]))) throw new Error('Unsupported record history operation.');
    const image = entry[side === 'before' ? 1 : 2];
    if (image === null) throw new Error('This version has no record values to restore.');
    const saved = decode(String(image), fields);
    if (String(saved[0]) !== id) throw new Error('Invalid journal record id.');
    this.transaction(() => {
      const history = this.recordHistory(table, id);
      if (!history.restorable) throw new Error(history.reason);
      if (history.currentToken !== expectedCurrent) throw new Error('The record changed after history was opened. Refresh its history before restoring.');
      const before = this.current(table, id);
      if (before) this.db.run(`UPDATE ${quoteName(table)} SET ${fields.map(f => `${quoteName(f.name)}=?`).join(',')} WHERE id=?`, [...bindCells(saved.slice(1)), id]);
      else this.db.run(`INSERT INTO ${quoteName(table)} (id, ${fields.map(f => quoteName(f.name)).join(',')}) VALUES (${saved.map(() => '?').join(',')})`, bindCells(saved));
      this.db.run("UPDATE qb_meta SET value='2-preview' WHERE key='schema_version'");
      this.event('restore', table, id, encode(before), encode(this.record(table, id)));
    });
  }
  canUndo(): boolean { return rows(this.db, 'SELECT id FROM qb_journal WHERE undone=0 LIMIT 1').length > 0; }
  undo(): void {
    const entry = rows(this.db, 'SELECT id, operation, table_name, record_id, before_json, after_json FROM qb_journal WHERE undone=0 ORDER BY id DESC LIMIT 1')[0];
    if (!entry) throw new Error('Nothing to undo.');
    const [eventId, operation, name, recordId, before, after] = entry;
    const table = String(name);
    const fields = this.fields(table);
    this.transaction(() => {
      if (operation === 'createTable') {
        if (JSON.stringify(fields) !== after || rows(this.db, `SELECT id FROM ${quoteName(table)} LIMIT 1`).length) throw new Error('The table changed outside its journal; undo was stopped.');
        this.db.run(`DROP TABLE ${quoteName(table)}`);
        this.db.run('DELETE FROM qb_objects WHERE name=?', [table]);
      } else if (operation === 'insert' || operation === 'update' || operation === 'restore') {
        if (encode(this.record(table, String(recordId))) !== after) throw new Error('The record changed outside its journal; undo was stopped.');
        if (operation === 'insert' || operation === 'restore' && before === null) this.db.run(`DELETE FROM ${quoteName(table)} WHERE id=?`, [String(recordId)]);
        else {
          const saved = decode(String(before), fields);
          if (String(saved[0]) !== String(recordId)) throw new Error('Invalid journal record id.');
          this.db.run(`UPDATE ${quoteName(table)} SET ${fields.map(f => `${quoteName(f.name)}=?`).join(',')} WHERE id=?`, [...bindCells(saved.slice(1)), String(recordId)]);
        }
      } else if (operation === 'delete') {
        const saved = decode(String(before), fields);
        if (String(saved[0]) !== String(recordId)) throw new Error('Invalid journal record id.');
        this.db.run(`INSERT INTO ${quoteName(table)} (id, ${fields.map(f => quoteName(f.name)).join(',')}) VALUES (${saved.map(() => '?').join(',')})`, bindCells(saved));
      } else throw new Error('Unsupported journal operation.');
      this.db.run('UPDATE qb_journal SET undone=1 WHERE id=?', [String(eventId)]);
    });
  }
}
