import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSession } from '../src/engine/database';
import type { TableView } from '../src/engine/tableView';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => { sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer }); });
afterEach(() => sessions.splice(0).forEach(session => session.close()));
function fixture() {
  const db = new sqlite.Database();
  db.run(`CREATE TABLE data (id INTEGER PRIMARY KEY, label TEXT, quantity INTEGER, price REAL, payload BLOB);
    INSERT INTO data VALUES (1,'Alpha 100%_done',10,1.5,NULL), (2,'alpha',2,20.5,X'FF'),
      (3,NULL,-3,NULL,NULL), (4,'',NULL,0,NULL), (5,'架空 café',9223372036854775807,50,NULL);
    CREATE TABLE pages (id INTEGER PRIMARY KEY, score INTEGER); BEGIN`);
  for (let id = 0; id < 235; id++) db.run('INSERT INTO pages VALUES (?,?)', [id, id % 3]);
  db.run(`COMMIT;
    CREATE TABLE composite (a INTEGER, b TEXT, PRIMARY KEY(a,b)) WITHOUT ROWID;
    INSERT INTO composite VALUES (1,'z'),(1,'a'),(2,'a');
    CREATE TABLE untyped (value); INSERT INTO untyped VALUES (12),('12'),('abc');
    CREATE TABLE generated (source INTEGER, doubled INTEGER GENERATED ALWAYS AS (source*2) VIRTUAL);
    INSERT INTO generated(source) VALUES (2),(4);
    CREATE TABLE "odd""table" ("odd""column" TEXT); INSERT INTO "odd""table" VALUES ('literal');`);
  const bytes = db.export(); db.close();
  const session = DatabaseSession.open(sqlite, bytes, 'views.sqlite'); sessions.push(session); return session;
}
const ids = (session: DatabaseSession, view: TableView) => session.page('data', 0, view).rows.map(row => row[0]);

describe('table sort/filter/find', () => {
  it('sorts numeric values numerically with primary-key ties and SQLite null ordering', () => {
    const session = fixture();
    expect(ids(session, { sort: { column: 'quantity', direction: 'ASC' } })).toEqual([4n, 3n, 2n, 1n, 5n]);
    expect(ids(session, { sort: { column: 'quantity', direction: 'DESC' } })).toEqual([5n, 1n, 2n, 3n, 4n]);
    const pages = [0, 100, 200].flatMap(offset => session.page('pages', offset, { sort: { column: 'score', direction: 'DESC' } }).rows);
    expect(pages).toHaveLength(235); expect(new Set(pages.map(row => row[0])).size).toBe(235);
    expect(pages).toEqual([...pages].sort((a, b) => Number(b[1]) - Number(a[1]) || Number(a[0]) - Number(b[0])));
    expect(session.page('pages', 200, { sort: { column: 'score', direction: 'DESC' } }).hasMore).toBe(false);
  });

  it('compares whole numbers precisely and combines numeric filters with find', () => {
    const session = fixture();
    expect(ids(session, { filter: { column: 'quantity', operator: 'equals', value: '+9223372036854775807' } })).toEqual([5n]);
    expect(ids(session, { filter: { column: 'quantity', operator: 'gt', value: '2' } })).toEqual([1n, 5n]);
    expect(ids(session, { filter: { column: 'quantity', operator: 'lte', value: '2' } })).toEqual([2n, 3n]);
    expect(ids(session, { filter: { column: 'price', operator: 'gte', value: '2e1' }, search: 'ALPHA' })).toEqual([2n]);
    expect(ids(session, { filter: { column: 'quantity', operator: 'notEquals', value: '2' } })).toEqual([1n, 3n, 5n]);
  });

  it('treats wildcard and SQL-looking input as literal data and distinguishes empty strings from null', () => {
    const session = fixture();
    expect(ids(session, { filter: { column: 'label', operator: 'contains', value: '%_' } })).toEqual([1n]);
    expect(ids(session, { filter: { column: 'label', operator: 'contains', value: 'ALPHA' } })).toEqual([1n, 2n]);
    expect(ids(session, { filter: { column: 'label', operator: 'equals', value: '' } })).toEqual([4n]);
    expect(ids(session, { filter: { column: 'label', operator: 'isNull' } })).toEqual([3n]);
    expect(ids(session, { filter: { column: 'label', operator: 'isNotNull' } })).toEqual([1n, 2n, 4n, 5n]);
    expect(ids(session, { search: "'); DROP TABLE data; --" })).toEqual([]);
    expect(ids(session, { search: '架空' })).toEqual([5n]);
    expect(ids(session, { search: '9223372036854775807' })).toEqual([5n]);
    expect(session.tables()).toContain('data');
  });

  it('supports generated columns, quoted names, composite primary keys and untyped text comparisons', () => {
    const session = fixture();
    expect(session.columns('generated').map(column => column.name)).toEqual(['source', 'doubled']);
    expect(session.page('generated', 0, { filter: { column: 'doubled', operator: 'equals', value: '8' } }).rows).toEqual([[4n, 8n]]);
    expect(session.page('odd"table', 0, { search: 'literal', sort: { column: 'odd"column', direction: 'DESC' } }).rows).toEqual([['literal']]);
    expect(session.page('composite').rows).toEqual([[1n, 'a'], [1n, 'z'], [2n, 'a']]);
    expect(session.page('untyped', 0, { filter: { column: 'value', operator: 'equals', value: '12' } }).rows).toHaveLength(2);
  });

  it('rejects invalid identifiers, operators, directions and numeric values without changing data', () => {
    const session = fixture();
    const bad: TableView[] = [
      { sort: { column: 'quantity; DROP TABLE data', direction: 'ASC' } },
      { sort: { column: 'quantity', direction: 'DESC; DROP TABLE data' as 'DESC' } },
      { filter: { column: 'missing', operator: 'isNull' } },
      { filter: { column: 'label', operator: 'gt', value: 'x' } },
      { filter: { column: 'quantity', operator: 'equals', value: '1.5' } },
      { filter: { column: 'quantity', operator: 'equals', value: '9223372036854775808' } },
      { filter: { column: 'price', operator: 'equals', value: 'Infinity' } },
      { filter: { column: 'price', operator: 'equals', value: '0x10' } },
      { filter: { column: 'payload', operator: 'contains', value: 'FF' } },
      { filter: { column: 'label', operator: 'OR 1=1' as 'equals', value: 'x' } },
      { search: 'x'.repeat(513) },
    ];
    for (const view of bad) expect(() => session.page('data', 0, view)).toThrow();
    expect(session.page('data').rows).toHaveLength(5);
    expect(ids(session, { filter: { column: 'payload', operator: 'isNotNull' } })).toEqual([2n]);
    expect(session.hasChanges).toBe(false);
  });

  it('does not journal or persist temporary views', () => {
    const session = DatabaseSession.create(sqlite, true); sessions.push(session);
    session.page('Customers', 0, { search: 'Alex', sort: { column: 'name', direction: 'DESC' } });
    expect(session.hasChanges).toBe(false); expect(session.history()).toEqual([]);
    const reopened = DatabaseSession.open(sqlite, session.exportCopy(), 'copy.qbase'); sessions.push(reopened);
    expect(reopened.page('Customers').rows).toHaveLength(3); expect(reopened.history()).toEqual([]);
  });
});
