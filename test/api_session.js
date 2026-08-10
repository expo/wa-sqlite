import * as Comlink from 'comlink';
import * as SQLite from '../src/sqlite-api.js';

export function api_session(context) {
  describe('session', function() {
    let proxy, sqlite3, db, session;
    beforeEach(async function() {
      proxy = await context.create();
      sqlite3 = proxy.sqlite3;
      db = await sqlite3.open_v2('demo');
      await sqlite3.exec(db, `
        CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO t VALUES (1, 'a');
      `);
      session = await sqlite3.session_create(db, 'main');
      await sqlite3.session_attach(session, 't');
    });

    afterEach(async function() {
      await sqlite3.session_delete(session);
      await sqlite3.close(db);
      await context.destroy(proxy);
    });

    async function select() {
      const rows = [];
      await sqlite3.exec(db, 'SELECT id, name FROM t ORDER BY id',
        Comlink.proxy(row => rows.push(row)));
      return rows;
    }

    it('should return a changeset as an ArrayBuffer', async function() {
      await sqlite3.exec(db, `INSERT INTO t VALUES (2, 'b')`);

      const changeset = await sqlite3.session_changeset(session);
      expect(changeset instanceof ArrayBuffer).toBeTrue();
      expect(changeset.byteLength).toBeGreaterThan(0);
    });

    it('should return an empty changeset when nothing changed', async function() {
      const changeset = await sqlite3.session_changeset(session);
      expect(changeset instanceof ArrayBuffer).toBeTrue();
      expect(changeset.byteLength).toEqual(0);
    });

    it('should leave the scratch pointer usable across calls', async function() {
      await sqlite3.exec(db, `INSERT INTO t VALUES (2, 'b')`);

      const first = await sqlite3.session_changeset(session);
      const second = await sqlite3.session_changeset(session);
      expect(second.byteLength).toEqual(first.byteLength);

      // Any other API using the shared scratch pointer must still work.
      const other = await sqlite3.session_create(db, 'main');
      expect(other).toBeGreaterThan(0);
      await sqlite3.session_delete(other);
    });

    it('should replay inserts and updates from a changeset', async function() {
      await sqlite3.exec(db, `
        INSERT INTO t VALUES (2, 'b');
        UPDATE t SET name = 'z' WHERE id = 1;
      `);
      const changeset = await sqlite3.session_changeset(session);

      await sqlite3.exec(db, `
        DELETE FROM t WHERE id = 2;
        UPDATE t SET name = 'a' WHERE id = 1;
      `);
      const rc = await sqlite3.changeset_apply(db, changeset);
      expect(rc).toEqual(SQLite.SQLITE_OK);
      expect(await select()).toEqual([[1, 'z'], [2, 'b']]);
    });

    it('should apply a changeset passed as a Uint8Array', async function() {
      await sqlite3.exec(db, `INSERT INTO t VALUES (2, 'b')`);
      const changeset = await sqlite3.session_changeset(session);

      await sqlite3.exec(db, 'DELETE FROM t WHERE id = 2');
      const rc = await sqlite3.changeset_apply(db, new Uint8Array(changeset));
      expect(rc).toEqual(SQLite.SQLITE_OK);
      expect(await select()).toEqual([[1, 'a'], [2, 'b']]);
    });

    it('should invert a changeset to undo its changes', async function() {
      await sqlite3.exec(db, `
        INSERT INTO t VALUES (2, 'b');
        UPDATE t SET name = 'z' WHERE id = 1;
      `);
      const inverted = await sqlite3.session_changeset_inverted(session);
      expect(inverted instanceof ArrayBuffer).toBeTrue();

      const rc = await sqlite3.changeset_apply(db, inverted);
      expect(rc).toEqual(SQLite.SQLITE_OK);
      expect(await select()).toEqual([[1, 'a']]);
    });

    it('should round-trip bytes when inverted twice', async function() {
      await sqlite3.exec(db, `INSERT INTO t VALUES (2, 'b')`);
      const changeset = await sqlite3.session_changeset(session);

      const once = await sqlite3.changeset_invert(changeset);
      const twice = await sqlite3.changeset_invert(once);
      expect(twice instanceof ArrayBuffer).toBeTrue();
      expect([...new Uint8Array(twice)]).toEqual([...new Uint8Array(changeset)]);
    });

    it('should stop recording changes when disabled', async function() {
      await sqlite3.session_enable(session, false);
      await sqlite3.exec(db, `INSERT INTO t VALUES (2, 'b')`);
      expect((await sqlite3.session_changeset(session)).byteLength).toEqual(0);

      await sqlite3.session_enable(session, true);
      await sqlite3.exec(db, `INSERT INTO t VALUES (3, 'c')`);
      expect((await sqlite3.session_changeset(session)).byteLength).toBeGreaterThan(0);
    });
  });
}
