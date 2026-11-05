import { readFileSync } from 'node:fs';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSession } from '../src/engine/database';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => { sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer }); });
afterEach(() => sessions.splice(0).forEach(session => session.close()));
const track = (session: DatabaseSession) => { sessions.push(session); return session; };
const create = () => track(DatabaseSession.create(sqlite, true));
function reopen(session: DatabaseSession, modify?: (db: Database) => void) {
  const raw = new sqlite.Database(session.exportCopy());
  try { modify?.(raw); return track(DatabaseSession.open(sqlite, raw.export(), 'history.qbase')); }
  finally { raw.close(); }
}
const change = (session: DatabaseSession, name: string) => session.updateRecord('Customers', '1', { name, city: null });

describe('record history and selective restore', () => {
  it('restores a chosen before/after image as a new change without undoing unrelated records', () => {
    const session = create(); change(session, 'First edit'); change(session, 'Second edit');
    const history = session.recordHistory('Customers', '01');
    expect(history.columns).toEqual(['id', 'name', 'city']);
    expect(history.versions.map(version => version.after?.[1])).toEqual(['Second edit', 'First edit']);
    expect(history.restorable).toBe(true);
    session.updateRecord('Customers', '02', { name: 'Unrelated edit', city: 'Here' });
    expect(session.recordHistory('Customers', '2').versions).toHaveLength(1);
    session.restoreVersion('Customers', '1', history.versions[1].id, 'before', history.currentToken);
    expect(session.record('Customers', '1')[1]).toBe('Alex Example');
    expect(session.record('Customers', '2')[1]).toBe('Unrelated edit');
    expect(session.history()[0].operation).toBe('restore');
    session.undo(); expect(session.record('Customers', '1')[1]).toBe('Second edit');
    const fresh = session.recordHistory('Customers', '1');
    session.restoreVersion('Customers', '1', history.versions[1].id, 'after', fresh.currentToken);
    expect(session.record('Customers', '1')[1]).toBe('First edit');
  });

  it('recovers deleted records without reusing their id or changing newer records, including after reopen', () => {
    let session = create();
    const original = session.insertRecord('Customers', { name: 'Deleted customer', city: null });
    session.deleteRecord('Customers', original);
    const newer = session.insertRecord('Customers', { name: 'New customer', city: '' });
    expect(newer).not.toBe(original);
    session = reopen(session);
    const history = session.recordHistory('Customers', original);
    expect(history.currentToken).toBeNull();
    session.restoreVersion('Customers', original, history.versions[0].id, 'before', null);
    expect(session.record('Customers', original)[1]).toBe('Deleted customer');
    expect(session.record('Customers', newer)[1]).toBe('New customer');
    session = reopen(session); session.undo();
    expect(() => session.record('Customers', original)).toThrow('no longer exists');
    expect(session.record('Customers', newer)[1]).toBe('New customer');
  });

  it('can inspect and restore undone images and never reuses ids after undoing an insert', () => {
    const session = create();
    const first = session.insertRecord('Customers', { name: 'Undone insertion', city: '' }); session.undo();
    const second = session.insertRecord('Customers', { name: 'Other insertion', city: null });
    expect(second).not.toBe(first);
    const history = session.recordHistory('Customers', first);
    expect(history.versions[0].undone).toBe(true); expect(history.restorable).toBe(true);
    session.restoreVersion('Customers', first, history.versions[0].id, 'after', null);
    expect(session.record('Customers', first)[1]).toBe('Undone insertion');
    session.undo(); expect(() => session.record('Customers', first)).toThrow();
    expect(session.record('Customers', second)[1]).toBe('Other insertion');
  });

  it('rejects stale previews and changes made outside the journal without partial writes', () => {
    const original = create(); change(original, 'One');
    const opened = original.recordHistory('Customers', '1'); change(original, 'Two');
    const count = original.history().length;
    expect(() => original.restoreVersion('Customers', '1', opened.versions[0].id, 'before', opened.currentToken)).toThrow('after history was opened');
    expect(original.record('Customers', '1')[1]).toBe('Two'); expect(original.history()).toHaveLength(count);
    const external = reopen(original, db => db.run("UPDATE Customers SET name='External' WHERE id=1"));
    const history = external.recordHistory('Customers', '1');
    expect(history.restorable).toBe(false);
    expect(() => external.restoreVersion('Customers', '1', history.versions[0].id, 'before', history.currentToken)).toThrow('outside its journal');
    expect(external.record('Customers', '1')[1]).toBe('External');
  });

  it('detects legacy id reuse and refuses to mix record identities', () => {
    const original = create(); const id = original.insertRecord('Customers', { name: 'Old identity', city: null }); original.deleteRecord('Customers', id);
    const legacy = reopen(original, db => {
      db.run("UPDATE qb_meta SET value='1-preview' WHERE key='schema_version'");
      db.run('INSERT INTO Customers VALUES (?, ?, ?)', [id, 'Reused identity', null]);
      const image = JSON.stringify([{ integer: id }, 'Reused identity', null]);
      db.run("INSERT INTO qb_journal(operation,table_name,record_id,before_json,after_json,created_at) VALUES('insert','Customers',?,NULL,?,'2026-01-01')", [id, image]);
    });
    const history = legacy.recordHistory('Customers', id);
    expect(history.restorable).toBe(false); expect(history.reason).toContain('reused');
    expect(() => legacy.restoreVersion('Customers', id, history.versions[1].id, 'before', history.currentToken)).toThrow('reused');
    expect(legacy.record('Customers', id)[1]).toBe('Reused identity');
  });

  it('paginates more than the global 100-entry history and can restore an older loaded version', () => {
    const session = create();
    for (let index = 0; index < 125; index++) change(session, `Version ${index}`);
    const first = session.recordHistory('Customers', '1');
    const second = session.recordHistory('Customers', '1', first.versions.at(-1)!.id);
    const third = session.recordHistory('Customers', '1', second.versions.at(-1)!.id);
    expect([first.versions.length, second.versions.length, third.versions.length]).toEqual([50, 50, 25]);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    expect(new Set([...first.versions, ...second.versions, ...third.versions].map(entry => entry.id)).size).toBe(125);
    session.restoreVersion('Customers', '1', third.versions.at(-1)!.id, 'before', first.currentToken);
    expect(session.record('Customers', '1')[1]).toBe('Alex Example');
  });

  it('rejects versions from another table incarnation, record, or an absent image', () => {
    const session = create(); session.createTable('Temporary', [{ name: 'value', type: 'TEXT', required: false }]);
    const id = session.insertRecord('Temporary', { value: 'Old table' });
    const old = session.recordHistory('Temporary', id).versions[0];
    session.undo(); session.undo();
    session.createTable('Temporary', [{ name: 'value', type: 'TEXT', required: false }]); session.insertRecord('Temporary', { value: 'New table' });
    const current = session.recordHistory('Temporary', '1');
    expect(current.versions).toHaveLength(1);
    expect(() => session.restoreVersion('Temporary', '1', old.id, 'after', current.currentToken)).toThrow('does not belong');
    expect(() => session.restoreVersion('Temporary', '1', current.versions[0].id, 'before', current.currentToken)).toThrow('no record values');
    expect(() => session.restoreVersion('Customers', '2', current.versions[0].id, 'after', null)).toThrow('does not belong');
    expect(session.record('Temporary', '1')[1]).toBe('New table');
  });

  it('rolls back restored data, journal and legacy metadata upgrade if journaling fails', () => {
    const original = create(); change(original, 'Current value');
    const blocked = reopen(original, db => {
      db.run("UPDATE qb_meta SET value='1-preview' WHERE key='schema_version'");
      db.run("CREATE UNIQUE INDEX fail_restore ON qb_journal(table_name, CASE WHEN operation='restore' THEN 'update' ELSE operation END)");
    });
    const history = blocked.recordHistory('Customers', '1');
    expect(() => blocked.restoreVersion('Customers', '1', history.versions[0].id, 'before', history.currentToken)).toThrow('UNIQUE');
    expect(blocked.record('Customers', '1')[1]).toBe('Current value'); expect(blocked.history()).toHaveLength(1); expect(blocked.hasChanges).toBe(false);
    const raw = new sqlite.Database(blocked.exportCopy());
    expect(raw.exec("SELECT value FROM qb_meta WHERE key='schema_version'")[0].values).toEqual([['1-preview']]);
    expect(raw.exec('PRAGMA integrity_check')[0].values).toEqual([['ok']]); raw.close();
  });

  it('restores full text, null/empty values and exact 64-bit numbers, including through undo/reopen', () => {
    const session = create(); const table = 'Quoted" history';
    session.createTable(table, [
      { name: 'quantity', type: 'INTEGER', required: false }, { name: 'memo', type: 'TEXT', required: false },
      { name: 'blank', type: 'TEXT', required: false }, { name: 'ratio', type: 'REAL', required: false },
    ]);
    const memo = '架空 café\n'.repeat(500);
    const id = session.insertRecord(table, { quantity: '9223372036854775807', memo, blank: '', ratio: '1.25' });
    session.updateRecord(table, id, { quantity: '-9223372036854775808', memo: null, blank: null, ratio: '-0.125' });
    const history = session.recordHistory(table, id);
    session.restoreVersion(table, id, history.versions[0].id, 'before', history.currentToken);
    expect(session.record(table, id)).toEqual([1n, 9223372036854775807n, memo, '', 1.25]);
    const next = reopen(session); next.undo();
    expect(next.record(table, id)).toEqual([1n, -9223372036854775808n, null, null, -0.125]);
    const readonly = track(DatabaseSession.open(sqlite, next.exportCopy(), 'readonly.qbase', true));
    expect(() => readonly.recordHistory(table, id)).toThrow('read-only');
  });

  it('rejects malformed snapshots and unsupported restore operations without modifying the row', () => {
    const original = create(); change(original, 'Current');
    const entry = original.recordHistory('Customers', '1').versions[0];
    const invalid = reopen(original, db => db.run("UPDATE qb_journal SET before_json='[{\"integer\":\"2\"},\"Wrong row\",null]' WHERE id=?", [entry.id]));
    expect(() => invalid.restoreVersion('Customers', '1', entry.id, 'before', null)).toThrow('Invalid journal record id');
    expect(invalid.record('Customers', '1')[1]).toBe('Current'); expect(invalid.history()).toHaveLength(1);
    expect(() => original.restoreVersion('Customers', '1', entry.id, 'unsupported' as 'before', null)).toThrow('Choose before or after');
    expect(() => original.recordHistory('Customers', '9'.repeat(10000))).toThrow('Invalid record');
  });

  it('refuses writes whose existing values cannot be represented in an undoable row image', () => {
    const session = reopen(create(), db => db.run("UPDATE Customers SET name=X'00FF' WHERE id=1"));
    expect(() => session.updateRecord('Customers', '1', { name: 'Replacement', city: null })).toThrow('Invalid journal value');
    expect(() => session.deleteRecord('Customers', '1')).toThrow('Invalid journal value');
    expect(session.record('Customers', '1')[1]).toEqual(new Uint8Array([0, 255]));
    expect(session.history()).toEqual([]); expect(session.hasChanges).toBe(false);
  });
});
