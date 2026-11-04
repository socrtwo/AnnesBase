import { readFileSync } from 'node:fs';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSession } from '../src/engine/database';
import type { Field } from '../src/engine/journal';

let sqlite: SqlJsStatic;
const sessions: DatabaseSession[] = [];
beforeAll(async () => { sqlite = await initSqlJs({ wasmBinary: Uint8Array.from(readFileSync('node_modules/sql.js/dist/sql-wasm.wasm')).buffer }); });
afterEach(() => { sessions.splice(0).forEach(session => session.close()); });
const track = (session: DatabaseSession) => { sessions.push(session); return session; };
const fields: Field[] = [
  { name: 'name', type: 'TEXT', required: true },
  { name: 'quantity', type: 'INTEGER', required: false },
  { name: 'price', type: 'REAL', required: false },
];
const create = () => track(DatabaseSession.create(sqlite));
function reopen(session: DatabaseSession, modify?: (db: Database) => void) {
  const bytes = session.exportCopy();
  if (!modify) return track(DatabaseSession.open(sqlite, bytes, 'copy.qbase'));
  const raw = new sqlite.Database(bytes);
  try { modify(raw); return track(DatabaseSession.open(sqlite, raw.export(), 'modified.qbase')); }
  finally { raw.close(); }
}

describe('native transaction journal', () => {
  it('journals create/insert/update/delete and undoes them in reverse order across downloads', () => {
    let session = create();
    expect(session.editable).toBe(true);
    session.createTable('Stock', fields);
    const id = session.insertRecord('Stock', { name: 'Renée\n架空', quantity: '9223372036854775807', price: '12.5' });
    expect(session.record('Stock', id)).toEqual([1n, 'Renée\n架空', 9223372036854775807n, 12.5]);
    session.updateRecord('Stock', id, { name: 'Changed', quantity: '-9223372036854775808', price: null });
    session.deleteRecord('Stock', id);
    expect(session.page('Stock').rows).toEqual([]);
    expect(session.history().map(entry => entry.operation)).toEqual(['delete', 'update', 'insert', 'createTable']);
    session = reopen(session);
    expect(session.hasChanges).toBe(false);
    session.undo();
    expect(session.record('Stock', id)).toEqual([1n, 'Changed', -9223372036854775808n, null]);
    session = reopen(session); session.undo();
    expect(session.record('Stock', id)).toEqual([1n, 'Renée\n架空', 9223372036854775807n, 12.5]);
    session.undo(); expect(session.page('Stock').rows).toEqual([]);
    session.undo(); expect(session.tables()).toEqual([]);
    expect(session.canUndo()).toBe(false);
    expect(session.history().every(entry => entry.undone)).toBe(true);
    expect(() => session.undo()).toThrow('Nothing to undo');
  });

  it('rolls back a record write if recording its journal entry fails', () => {
    const original = create(); original.createTable('Stock', fields);
    const session = reopen(original, db => db.run('CREATE UNIQUE INDEX fail_journal ON qb_journal(table_name)'));
    expect(session.editable).toBe(true);
    expect(() => session.insertRecord('Stock', { name: 'Must roll back' })).toThrow('UNIQUE');
    expect(session.page('Stock').rows).toEqual([]);
    expect(session.history()).toHaveLength(1);
    expect(session.hasChanges).toBe(false);
    const raw = new sqlite.Database(session.exportCopy());
    expect(raw.exec('PRAGMA integrity_check')[0].values).toEqual([['ok']]); raw.close();
  });

  it('rejects invalid fields and values without adding history or partially changing data', () => {
    const session = create();
    for (const name of ['qb_internal', 'sqlite_internal', '', 'bad\0name']) expect(() => session.createTable(name, fields)).toThrow();
    expect(() => session.createTable('Bad', [fields[0], { ...fields[0], name: 'NAME' }])).toThrow('unique');
    expect(() => session.createTable('Bad', [{ ...fields[0], name: 'id' }])).toThrow('id');
    expect(() => session.createTable('Bad', [])).toThrow('between');
    expect(session.history()).toEqual([]);
    session.createTable('Stock', fields);
    for (const value of ['9223372036854775808', '-9223372036854775809', '1.5', 'not a number']) {
      expect(() => session.insertRecord('Stock', { name: 'Bad', quantity: value })).toThrow();
    }
    expect(() => session.insertRecord('Stock', { name: null })).toThrow('required');
    expect(() => session.insertRecord('Stock', { name: 'Bad', price: 'Infinity' })).toThrow('finite');
    expect(() => session.insertRecord('Stock', { name: 'Bad', extra: 'unknown' })).toThrow('Unknown field');
    expect(() => session.updateRecord('Stock', '999', { name: 'Missing' })).toThrow('no longer exists');
    expect(session.page('Stock').rows).toEqual([]);
    expect(session.history()).toHaveLength(1);
  });

  it('supports quoted names, SQL-looking text, empty strings, nulls and branching after undo', () => {
    const session = create(); const name = 'Stock";--';
    session.createTable(name, fields);
    const id = session.insertRecord(name, { name: "'); DROP TABLE qb_meta; --", quantity: null, price: null });
    session.updateRecord(name, id, { name: '', quantity: '0', price: '0' });
    session.undo();
    expect(session.record(name, id)[1]).toContain('DROP TABLE');
    session.insertRecord(name, { name: 'A different branch' });
    session.undo();
    expect(session.page(name).rows).toHaveLength(1);
    expect(reopen(session).editable).toBe(true);
  });

  it('stops undo if a row was changed outside the journal', () => {
    const original = create(); original.createTable('Stock', fields); original.insertRecord('Stock', { name: 'Original' });
    const changed = reopen(original, db => db.run("UPDATE Stock SET name='External change' WHERE id=1"));
    expect(() => changed.undo()).toThrow('outside its journal');
    expect(changed.record('Stock', '1')[1]).toBe('External change');
    expect(changed.history()[0].undone).toBe(false);
    expect(changed.hasChanges).toBe(false);
  });

  it('rejects malformed history and conflicting deleted-record restoration atomically', () => {
    const original = create(); original.createTable('Stock', fields); original.insertRecord('Stock', { name: 'Original' });
    original.updateRecord('Stock', '1', { name: 'Updated' });
    const corrupt = reopen(original, db => db.run("UPDATE qb_journal SET before_json='[]' WHERE operation='update'"));
    expect(() => corrupt.undo()).toThrow('Invalid journal');
    expect(corrupt.record('Stock', '1')[1]).toBe('Updated');
    expect(corrupt.history()[0].undone).toBe(false);
    original.deleteRecord('Stock', '1');
    const conflict = reopen(original, db => db.run("INSERT INTO Stock (id,name) VALUES (1,'New occupant')"));
    expect(() => conflict.undo()).toThrow('UNIQUE');
    expect(conflict.record('Stock', '1')[1]).toBe('New occupant');
    expect(conflict.history()[0].undone).toBe(false);
  });

  it('keeps old preview files, ordinary SQLite and files with triggers read-only', () => {
    const db = new sqlite.Database();
    db.run("CREATE TABLE qb_meta (key TEXT PRIMARY KEY,value TEXT); INSERT INTO qb_meta VALUES ('application','annes-base'),('schema_version','0-preview')");
    const old = track(DatabaseSession.open(sqlite, db.export(), 'old.qbase')); db.close();
    expect(old.isNative).toBe(true); expect(old.editable).toBe(false);
    expect(() => old.createTable('Stock', fields)).toThrow('read-only');
    const sample = track(DatabaseSession.create(sqlite, true));
    const forced = track(DatabaseSession.open(sqlite, sample.exportCopy(), 'readonly.qbase', true));
    expect(forced.isNative).toBe(true); expect(forced.editable).toBe(false);
    const triggers = reopen(sample, db => db.run("CREATE TRIGGER surprise AFTER UPDATE ON Customers BEGIN DELETE FROM Orders; END"));
    expect(triggers.editable).toBe(false);
    const modifiedSchema = reopen(sample, db => db.run('ALTER TABLE Customers ADD COLUMN surprise TEXT'));
    expect(modifiedSchema.canEditTable('Customers')).toBe(false);
    expect(() => modifiedSchema.insertRecord('Customers', { name: 'No' })).toThrow('unsupported');
  });

  it('keeps pending edits after failed export delivery and clears them only on acknowledgement', () => {
    const session = create(); session.createTable('Stock', fields);
    expect(session.hasChanges).toBe(true);
    session.exportCopy(); expect(session.hasChanges).toBe(true);
    session.acknowledgeDownload(); expect(session.hasChanges).toBe(false);
    session.insertRecord('Stock', { name: 'Another change' }); expect(session.hasChanges).toBe(true);
  });
});
