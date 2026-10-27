// Wearwell — schema migration tests.
//
// Runs the *same* SQL the app runs, against node:sqlite. The point is to catch
// a migration that loses or corrupts data before it reaches a phone, because
// there is no undo once it has: a device that has run a migration will not run
// it again, and the only copy of a user's wardrobe is on their device.
//
// Run with: npm run test:db

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { LATEST_VERSION, MIGRATIONS } from './migrations.ts';

/** Migrate a fresh database up to `target`, exactly as the app does. */
function migrateTo(db: DatabaseSync, target: number): void {
  db.exec('PRAGMA foreign_keys = ON;');
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

  for (let version = current; version < target; version++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[version]);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec('COMMIT');
  }
}

/**
 * A v4 database holding every shape that exists in the real app: an item worn
 * in an outfit, an outfit filed in a capsule, a packed item, a dismissed
 * suggestion. These are the rows a careless migration would drop.
 */
function seedV4(db: DatabaseSync): void {
  const now = 1_700_000_000_000;

  db.exec(`
    INSERT INTO items (id, name, category, colors, pattern, formality, seasons, tags,
                       image_uri, created_at, updated_at)
    VALUES ('itm_a', 'White oxford shirt', 'top', '["White"]', 'solid', 3,
            '["spring"]', '["staple"]', 'closet-images/itm_a.jpg', ${now}, ${now}),
           ('itm_b', 'Raw denim jeans', 'bottom', '["Denim"]', 'denim', 2,
            '["fall"]', '[]', 'closet-images/itm_b.jpg', ${now}, ${now});

    INSERT INTO outfits (id, name, created_at, favorite, worn_count)
    VALUES ('fit_a', 'Weekday one', ${now}, 1, 3);

    INSERT INTO outfit_items (outfit_id, item_id, slot, position)
    VALUES ('fit_a', 'itm_a', 'top', 0),
           ('fit_a', 'itm_b', 'bottom', 1);

    INSERT INTO capsules (id, name, created_at, updated_at)
    VALUES ('cap_a', 'New York', ${now}, ${now});

    INSERT INTO capsule_outfits (capsule_id, outfit_id, added_at)
    VALUES ('cap_a', 'fit_a', ${now});

    INSERT INTO capsule_packed (capsule_id, item_id, packed_at)
    VALUES ('cap_a', 'itm_a', ${now});

    INSERT INTO capsule_dismissed (capsule_id, signature, dismissed_at)
    VALUES ('cap_a', 'itm_a|itm_b', ${now});
  `);
}

const count = (db: DatabaseSync, table: string): number =>
  (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

const columns = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('migrations', () => {
  it('builds a database at the latest version from empty', () => {
    const db = new DatabaseSync(':memory:');
    migrateTo(db, LATEST_VERSION);

    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(user_version, LATEST_VERSION);
    db.close();
  });

  it('is idempotent — running again is a no-op', () => {
    const db = new DatabaseSync(':memory:');
    migrateTo(db, LATEST_VERSION);
    seedV4(db);

    migrateTo(db, LATEST_VERSION); // second pass
    assert.equal(count(db, 'items'), 2, 'a re-run must not disturb data');
    db.close();
  });

  it('preserves every row when upgrading real v4 data to v5', () => {
    const db = new DatabaseSync(':memory:');
    migrateTo(db, 4);
    seedV4(db);

    const before = {
      items: count(db, 'items'),
      outfits: count(db, 'outfits'),
      outfit_items: count(db, 'outfit_items'),
      capsules: count(db, 'capsules'),
      capsule_outfits: count(db, 'capsule_outfits'),
      capsule_packed: count(db, 'capsule_packed'),
      capsule_dismissed: count(db, 'capsule_dismissed'),
    };

    migrateTo(db, 5);

    for (const [table, n] of Object.entries(before)) {
      assert.equal(count(db, table), n, `${table} lost rows`);
    }

    // Field-level: the data is still the data, not just the right row count.
    const item = db.prepare(`SELECT * FROM items WHERE id = 'itm_a'`).get() as Record<string, unknown>;
    assert.equal(item.name, 'White oxford shirt');
    assert.equal(item.image_uri, 'closet-images/itm_a.jpg');
    assert.equal(item.colors, '["White"]');

    const outfit = db.prepare(`SELECT * FROM outfits WHERE id = 'fit_a'`).get() as Record<string, unknown>;
    assert.equal(outfit.name, 'Weekday one');
    assert.equal(outfit.favorite, 1);
    assert.equal(outfit.worn_count, 3);

    db.close();
  });

  it('adds tombstones and updated_at to every syncable table', () => {
    const db = new DatabaseSync(':memory:');
    migrateTo(db, LATEST_VERSION);

    for (const table of [
      'items',
      'outfits',
      'capsules',
      'capsule_outfits',
      'capsule_packed',
      'capsule_dismissed',
    ]) {
      const cols = columns(db, table);
      assert.ok(cols.includes('deleted_at'), `${table} has no deleted_at`);
      assert.ok(cols.includes('updated_at'), `${table} has no updated_at`);
    }

    // outfit_items is deliberately excluded: it syncs with its outfit.
    assert.ok(!columns(db, 'outfit_items').includes('deleted_at'));
    db.close();
  });

  it('backfills updated_at from each row’s own creation time, not the epoch', () => {
    const db = new DatabaseSync(':memory:');
    migrateTo(db, 4);
    seedV4(db);
    migrateTo(db, 5);

    const rows = [
      [`SELECT updated_at AS t, created_at AS src FROM outfits WHERE id = 'fit_a'`, 'outfits'],
      [`SELECT updated_at AS t, added_at AS src FROM capsule_outfits WHERE capsule_id = 'cap_a'`, 'capsule_outfits'],
      [`SELECT updated_at AS t, packed_at AS src FROM capsule_packed WHERE capsule_id = 'cap_a'`, 'capsule_packed'],
      [`SELECT updated_at AS t, dismissed_at AS src FROM capsule_dismissed WHERE capsule_id = 'cap_a'`, 'capsule_dismissed'],
    ] as const;

    for (const [query, table] of rows) {
      const row = db.prepare(query).get() as { t: number; src: number };
      assert.notEqual(row.t, 0, `${table}.updated_at was left at the epoch`);
      assert.equal(row.t, row.src, `${table}.updated_at should match its creation time`);
    }

    db.close();
  });

  it('resumes correctly if an earlier upgrade was interrupted', () => {
    // A device killed mid-upgrade sits at an intermediate version. It must be
    // able to finish, not restart or stall.
    const db = new DatabaseSync(':memory:');
    migrateTo(db, 2);
    db.exec(`INSERT INTO items (id, name, category, created_at, updated_at)
             VALUES ('itm_x', 'Partial', 'top', 1, 1)`);

    migrateTo(db, LATEST_VERSION);

    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(user_version, LATEST_VERSION);
    assert.equal(count(db, 'items'), 1, 'data written before the interruption must survive');
    db.close();
  });

  it('leaves no migration able to run twice', () => {
    // Guards against someone editing a shipped migration instead of appending.
    const db = new DatabaseSync(':memory:');
    migrateTo(db, LATEST_VERSION);

    assert.throws(
      () => db.exec(MIGRATIONS[0]),
      /already exists/i,
      'migration 0 should fail if replayed, proving steps are not re-runnable'
    );
    db.close();
  });
});
