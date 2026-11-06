import { readFileSync } from 'node:fs';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSession } from '../src/engine/database';
import type { TotalChoice } from '../src/engine/totals';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => { sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer }); });
afterEach(() => sessions.splice(0).forEach(session => session.close()));
function open(sql: string) { const db = new sqlite.Database(); db.run(sql); const session = DatabaseSession.open(sqlite, db.export(), 'totals.sqlite'); db.close(); sessions.push(session); return session; }

describe('full-table totals', () => {
  it('keeps exact large integer sums/min/max and handles decimals, NULL and empty text', () => {
    const session = open(`CREATE TABLE data (id INTEGER PRIMARY KEY, quantity INTEGER, amount REAL, label TEXT, payload BLOB);
      INSERT INTO data VALUES (1,9007199254740993,1.5,'',NULL),(2,2,2.25,'Z',X'FF'),(3,NULL,NULL,NULL,NULL);`);
    const result = session.totals('data', [{ column: 'quantity', operation: 'sum' }, { column: 'amount', operation: 'average' }, { column: 'label', operation: 'count' }, { column: 'payload', operation: 'count' }]);
    expect(result.records).toBe(3n); expect(result.values.map(value => value.value)).toEqual([9007199254740995n, 1.875, 2n, 1n]);
    expect(session.totals('data', [{ column: 'quantity', operation: 'max' }]).values[0].value).toBe(9007199254740993n);
    expect(session.totals('data', [{ column: 'quantity', operation: 'min' }]).values[0].value).toBe(2n);
    expect(session.totals('data', [{ column: 'label', operation: 'min' }]).values[0].value).toBe('');
    const empty = session.totals('data', [{ column: 'amount', operation: 'sum' }, { column: 'label', operation: 'count' }], { filter: { column: 'id', operator: 'lt', value: '0' } });
    expect(empty.records).toBe(0n); expect(empty.values.map(value => value.value)).toEqual([null, 0n]);
    expect(session.hasChanges).toBe(false);
  });
  it('summarizes every filtered row beyond a page and groups OR with Find', () => {
    const db = new sqlite.Database(); db.run('CREATE TABLE pages (id INTEGER PRIMARY KEY, bucket INTEGER, name TEXT); BEGIN');
    for (let id = 1; id <= 235; id++) db.run('INSERT INTO pages VALUES (?,?,?)', [id, id % 3, id % 2 ? 'keep' : 'omit']);
    db.run('COMMIT'); const session = DatabaseSession.open(sqlite, db.export(), 'pages.sqlite'); db.close(); sessions.push(session);
    const view = { filters: { match: 'any' as const, conditions: [{ column: 'bucket', operator: 'equals' as const, value: '0' }, { column: 'bucket', operator: 'equals' as const, value: '1' }] }, search: 'keep', sorts: [{ column: 'id', direction: 'DESC' as const }] };
    const matching = Array.from({ length: 235 }, (_, index) => index + 1).filter(id => id % 2 && [0, 1].includes(id % 3));
    const result = session.totals('pages', [{ column: 'id', operation: 'sum' }], view);
    expect(result.records).toBe(BigInt(matching.length)); expect(result.values[0].value).toBe(BigInt(matching.reduce((a, b) => a + b, 0)));
    expect(session.page('pages').rows).toHaveLength(100); expect(session.totals('pages').records).toBe(235n);
  });
  it('isolates integer overflow, nonnumeric contents and nonfinite sums from other totals', () => {
    const session = open(`CREATE TABLE data (id INTEGER PRIMARY KEY, huge INTEGER, mixed NUMERIC, amount REAL, label TEXT);
      INSERT INTO data VALUES (1,9223372036854775807,1,1e308,'a'),(2,1,'not a number',1e308,'b');`);
    const result = session.totals('data', [{ column: 'huge', operation: 'sum' }, { column: 'mixed', operation: 'average' }, { column: 'amount', operation: 'sum' }, { column: 'label', operation: 'count' }]);
    expect(result.records).toBe(2n); expect(result.values[0].error).toContain('64-bit'); expect(result.values[1].error).toContain('nonnumeric'); expect(result.values[2].error).toContain('not finite'); expect(result.values[3].value).toBe(2n);
    expect(session.totals('data', [{ column: 'mixed', operation: 'sum' }], { filter: { column: 'id', operator: 'equals', value: '1' } }).values[0].value).toBe(1n);
    expect(session.page('data').rows).toHaveLength(2); expect(session.hasChanges).toBe(false);
  });
  it('supports quoted identifiers and generated columns while rejecting invalid requests', () => {
    const session = open(`CREATE TABLE "odd\"\"table" ("odd\"\"column" INTEGER, doubled INTEGER GENERATED ALWAYS AS ("odd\"\"column"*2), payload BLOB); INSERT INTO "odd\"\"table" ("odd\"\"column") VALUES (4);`);
    expect(session.totals('odd"table', [{ column: 'doubled', operation: 'sum' }]).values[0].value).toBe(8n);
    const invalid: TotalChoice[][] = [
      [{ column: 'missing', operation: 'sum' }], [{ column: 'doubled', operation: 'DROP TABLE' as 'sum' }],
      [{ column: 'payload', operation: 'sum' }], [{ column: 'doubled', operation: 'sum' }, { column: 'doubled', operation: 'max' }],
    ];
    for (const choices of invalid) expect(() => session.totals('odd"table', choices)).toThrow('supported total');
    expect(() => session.totals('missing')).toThrow('Choose a table');
    session.close(); expect(() => session.totals('odd"table')).toThrow('closed');
  });
  it('does not journal totals and reflects committed editing and undo', () => {
    const session = DatabaseSession.create(sqlite, true); sessions.push(session);
    expect(session.totals('Orders', [{ column: 'amount_cents', operation: 'sum' }]).values[0].value).toBe(6100n);
    expect(session.hasChanges).toBe(false); expect(session.history()).toEqual([]);
    session.updateRecord('Orders', '1', { customer_id: '1', item: 'Notebook', amount_cents: '2000' });
    expect(session.totals('Orders', [{ column: 'amount_cents', operation: 'sum' }]).values[0].value).toBe(6850n);
    session.undo(); expect(session.totals('Orders', [{ column: 'amount_cents', operation: 'sum' }]).values[0].value).toBe(6100n);
  });
});
