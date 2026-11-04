import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSession, MAX_DATABASE_BYTES, PAGE_SIZE } from '../src/engine/database';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => {
  sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url))).buffer });
});
afterEach(() => { for (const session of sessions.splice(0)) session.close(); });
const track = (session: DatabaseSession) => { sessions.push(session); return session; };

function fixture() {
  const db = new sqlite.Database();
  db.run(`CREATE TABLE "odd""name" (id INTEGER PRIMARY KEY, label TEXT, binary BLOB, note TEXT);
    INSERT INTO "odd""name" VALUES (9223372036854775807, '<script>alert(1)</script>', X'00FF', NULL);
    CREATE TABLE empty_table (id INTEGER, label TEXT);
    CREATE TABLE qb_meta (unrelated_column TEXT);
    CREATE TABLE many_rows (id INTEGER PRIMARY KEY);
    CREATE INDEX many_index ON many_rows(id);`);
  db.run('BEGIN');
  for (let i = 0; i < 201; i++) db.run('INSERT INTO many_rows VALUES (?)', [i]);
  db.run('COMMIT');
  const bytes = db.export();
  db.close();
  return bytes;
}

describe('SQLite database session', () => {
  it('creates a real native SQLite file and reopens it without exposing internal metadata', () => {
    const created = track(DatabaseSession.create(sqlite));
    expect(created.name).toBe('Untitled.qbase');
    expect(created.tables()).toEqual([]);
    const bytes = created.exportCopy();
    expect(new TextDecoder().decode(bytes.slice(0, 16))).toBe('SQLite format 3\0');
    const reopened = track(DatabaseSession.open(sqlite, bytes, 'saved.qbase'));
    expect(reopened.isNative).toBe(true);
    expect(reopened.tables()).toEqual([]);
  });

  it('opens and exports the sample with its actual rows and foreign keys', () => {
    const sample = track(DatabaseSession.create(sqlite, true));
    expect(sample.tables()).toEqual(['Customers', 'Orders']);
    expect(sample.page('Customers').rows).toHaveLength(3);
    const copy = track(DatabaseSession.open(sqlite, sample.exportCopy(), 'copy.qbase'));
    expect(copy.page('Orders')).toEqual(sample.page('Orders'));
    const inspect = new sqlite.Database(copy.exportCopy());
    expect(inspect.exec('PRAGMA integrity_check')[0].values).toEqual([['ok']]);
    expect(inspect.exec('PRAGMA foreign_key_check')).toEqual([]);
    inspect.close();
  });

  it('quotes unusual names, preserves 64-bit integers, Unicode, blobs, nulls and empty-table columns', () => {
    const source = fixture();
    const original = source.slice();
    const session = track(DatabaseSession.open(sqlite, source, 'test.sqlite'));
    expect(session.tables()).toContain('qb_meta');
    const page = session.page('odd"name');
    expect(page.columns).toEqual(['id', 'label', 'binary', 'note']);
    expect(page.rows[0]).toEqual([9223372036854775807n, '<script>alert(1)</script>', new Uint8Array([0, 255]), null]);
    expect(session.page('empty_table')).toMatchObject({ columns: ['id', 'label'], rows: [], hasMore: false });
    expect(track(DatabaseSession.open(sqlite, session.exportCopy(), 'copy.sqlite')).page('odd"name')).toEqual(page);
    expect(source).toEqual(original);
  });

  it('bounds table pages and refuses invalid offsets and table names', () => {
    const session = track(DatabaseSession.open(sqlite, fixture(), 'pages.sqlite'));
    const first = session.page('many_rows');
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(session.page('many_rows', 100).rows[0]).toEqual([100n]);
    expect(session.page('many_rows', 200)).toMatchObject({ rows: [[200n]], hasMore: false });
    expect(() => session.page('many_rows', -1)).toThrow('offset');
    expect(() => session.page('many_rows', 0.5)).toThrow('offset');
    expect(() => session.page('many_rows; DROP TABLE many_rows')).toThrow('Choose a table');
    expect(session.page('many_rows').rows).toHaveLength(PAGE_SIZE);
  });

  it('rejects unsupported headers, over-limit files and truncated databases', () => {
    expect(() => DatabaseSession.open(sqlite, new Uint8Array(), 'empty.db')).toThrow('not a supported SQLite');
    expect(() => DatabaseSession.open(sqlite, new Uint8Array(MAX_DATABASE_BYTES + 1), 'large.db')).toThrow('32 MiB');
    const bytes = fixture();
    expect(() => DatabaseSession.open(sqlite, bytes.slice(0, bytes.length / 2), 'truncated.db')).toThrow('Cannot open');
    const broken = bytes.slice();
    broken[0] = 0;
    expect(() => DatabaseSession.open(sqlite, broken, 'broken.db')).toThrow('not a supported SQLite');
    expect(track(DatabaseSession.open(sqlite, bytes, 'good.db')).tables()).toContain('many_rows');
  });

  it('closes idempotently and does not retain an accessible connection', () => {
    const session = track(DatabaseSession.create(sqlite));
    session.close();
    session.close();
    expect(() => session.tables()).toThrow('closed');
    expect(() => session.page('anything')).toThrow('closed');
    expect(() => session.exportCopy()).toThrow('closed');
  });
});
