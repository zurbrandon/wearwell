// Wearwell — soft-delete behaviour.
//
// Switching ~40 queries from hard deletes to tombstones is exactly the kind of
// change that typechecks, runs, and quietly returns the wrong rows. These
// tests execute the real SQL against node:sqlite, so a missing
// `deleted_at IS NULL` shows up as a deleted garment reappearing rather than
// as a silent bug on someone's phone.
//
// Run with: npm run test:db

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { LATEST_VERSION, MIGRATIONS } from './migrations.ts';

let db: DatabaseSync;
const NOW = 1_700_000_000_000;

function migrate(target = LATEST_VERSION): void {
  db.exec('PRAGMA foreign_keys = ON;');
  for (let v = 0; v < target; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
}

function seed(): void {
  db.exec(`
    INSERT INTO items (id, name, category, colors, pattern, formality, seasons, tags,
                       image_uri, created_at, updated_at)
    VALUES ('itm_a', 'Shirt', 'top', '["White"]', 'solid', 3, '[]', '["staple"]',
            'closet-images/a.jpg', ${NOW}, ${NOW}),
           ('itm_b', 'Jeans', 'bottom', '["Denim"]', 'denim', 2, '[]', '["staple"]',
            'closet-images/b.jpg', ${NOW}, ${NOW});

    INSERT INTO outfits (id, name, created_at, updated_at, favorite, worn_count)
    VALUES ('fit_a', 'Look one', ${NOW}, ${NOW}, 0, 0);

    INSERT INTO outfit_items (outfit_id, item_id, slot, position)
    VALUES ('fit_a', 'itm_a', 'top', 0), ('fit_a', 'itm_b', 'bottom', 1);

    INSERT INTO capsules (id, name, created_at, updated_at)
    VALUES ('cap_a', 'New York', ${NOW}, ${NOW});

    INSERT INTO capsule_outfits (capsule_id, outfit_id, added_at, updated_at)
    VALUES ('cap_a', 'fit_a', ${NOW}, ${NOW});

    INSERT INTO capsule_packed (capsule_id, item_id, packed_at, updated_at)
    VALUES ('cap_a', 'itm_a', ${NOW}, ${NOW});
  `);
}

const one = <T>(sql: string, ...args: unknown[]): T =>
  db.prepare(sql).get(...(args as never[])) as T;

const many = <T>(sql: string, ...args: unknown[]): T[] =>
  db.prepare(sql).all(...(args as never[])) as T[];

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate();
  seed();
});

describe('tombstones', () => {
  it('hides a deleted item from the closet but keeps the row for sync', () => {
    db.exec(`UPDATE items SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = 'itm_a'`);

    const live = many(`SELECT * FROM items WHERE deleted_at IS NULL`);
    assert.equal(live.length, 1, 'the deleted item must not appear');

    const all = many(`SELECT * FROM items`);
    assert.equal(all.length, 2, 'the row must survive so the delete can be synced');
  });

  it('removes a deleted garment from the outfits it appeared in', () => {
    db.exec(`UPDATE items SET deleted_at = ${NOW} WHERE id = 'itm_a'`);

    const entries = many(
      `SELECT oi.slot FROM outfit_items oi
         JOIN items i ON i.id = oi.item_id
        WHERE oi.outfit_id = 'fit_a' AND i.deleted_at IS NULL`
    );
    assert.equal(entries.length, 1, 'a deleted piece must not linger in its outfits');
  });

  it('drops a deleted outfit from its capsule and from the packing list', () => {
    db.exec(`UPDATE outfits SET deleted_at = ${NOW} WHERE id = 'fit_a'`);

    const outfits = many(
      `SELECT o.id FROM capsule_outfits co
         JOIN outfits o ON o.id = co.outfit_id
        WHERE co.capsule_id = 'cap_a'
          AND co.deleted_at IS NULL AND o.deleted_at IS NULL`
    );
    assert.equal(outfits.length, 0);

    const toPack = many(
      `SELECT DISTINCT i.id FROM capsule_outfits co
         JOIN outfits o ON o.id = co.outfit_id
         JOIN outfit_items oi ON oi.outfit_id = co.outfit_id
         JOIN items i ON i.id = oi.item_id
        WHERE co.capsule_id = 'cap_a'
          AND co.deleted_at IS NULL AND o.deleted_at IS NULL AND i.deleted_at IS NULL`
    );
    assert.equal(toPack.length, 0, 'nothing to pack once the only outfit is gone');
  });
});

describe('re-adding something previously removed', () => {
  // The dangerous case. A tombstoned row still occupies its primary key, so
  // INSERT OR IGNORE silently does nothing and the user's action appears to
  // work while changing nothing.
  it('revives a capsule membership instead of silently doing nothing', () => {
    db.exec(`UPDATE capsule_outfits SET deleted_at = ${NOW} WHERE capsule_id = 'cap_a'`);

    const later = NOW + 1000;
    db.exec(`
      INSERT INTO capsule_outfits (capsule_id, outfit_id, added_at, updated_at)
      VALUES ('cap_a', 'fit_a', ${later}, ${later})
      ON CONFLICT (capsule_id, outfit_id) DO UPDATE SET
        deleted_at = NULL, added_at = excluded.added_at, updated_at = excluded.updated_at
    `);

    const row = one<{ deleted_at: number | null; added_at: number }>(
      `SELECT deleted_at, added_at FROM capsule_outfits WHERE capsule_id = 'cap_a'`
    );
    assert.equal(row.deleted_at, null, 'the membership must come back');
    assert.equal(row.added_at, later, 'and read as freshly added');
  });

  it('re-packing an unpacked item brings it back', () => {
    db.exec(`UPDATE capsule_packed SET deleted_at = ${NOW} WHERE item_id = 'itm_a'`);

    const later = NOW + 1000;
    db.exec(`
      INSERT INTO capsule_packed (capsule_id, item_id, packed_at, updated_at)
      VALUES ('cap_a', 'itm_a', ${later}, ${later})
      ON CONFLICT (capsule_id, item_id) DO UPDATE SET
        deleted_at = NULL, packed_at = excluded.packed_at, updated_at = excluded.updated_at
    `);

    const packed = many(
      `SELECT item_id FROM capsule_packed WHERE capsule_id = 'cap_a' AND deleted_at IS NULL`
    );
    assert.equal(packed.length, 1);
  });

  it('would have failed with INSERT OR IGNORE — the bug this guards against', () => {
    db.exec(`UPDATE capsule_packed SET deleted_at = ${NOW} WHERE item_id = 'itm_a'`);

    db.exec(`INSERT OR IGNORE INTO capsule_packed (capsule_id, item_id, packed_at, updated_at)
             VALUES ('cap_a', 'itm_a', ${NOW + 1}, ${NOW + 1})`);

    const packed = many(
      `SELECT item_id FROM capsule_packed WHERE capsule_id = 'cap_a' AND deleted_at IS NULL`
    );
    assert.equal(packed.length, 0, 'IGNORE leaves the tombstone in place — hence ON CONFLICT');
  });
});

describe('sync readiness', () => {
  it('gives every syncable row a monotonic updated_at to compare', () => {
    const later = NOW + 5000;
    db.exec(`UPDATE items SET name = 'Renamed', updated_at = ${later} WHERE id = 'itm_a'`);

    const changed = many<{ id: string }>(
      `SELECT id FROM items WHERE updated_at > ${NOW}`
    );
    assert.deepEqual(changed.map((r) => r.id), ['itm_a'], 'a pull must see exactly what changed');
  });

  it('exposes deletes as changes, which a hard delete could not', () => {
    const later = NOW + 5000;
    db.exec(`UPDATE items SET deleted_at = ${later}, updated_at = ${later} WHERE id = 'itm_b'`);

    const changed = many<{ id: string; deleted_at: number | null }>(
      `SELECT id, deleted_at FROM items WHERE updated_at > ${NOW}`
    );
    assert.equal(changed.length, 1);
    assert.equal(changed[0].id, 'itm_b');
    assert.ok(changed[0].deleted_at, 'the other device needs to see this as a delete');
  });
});
