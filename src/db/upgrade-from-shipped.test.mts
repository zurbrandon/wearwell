// Wearwell — upgrading the database that is actually on a phone today.
//
// TestFlight build 1 (EAS f061fb7b, commit 9338eb1) shipped LATEST_VERSION = 3.
// So the only upgrade that will happen in the wild is v3 -> v4 -> v5, run
// against a database built by that build's own schema.ts — which predates the
// refactor that moved migrations into MIGRATIONS[]. Every other suite starts
// from the current code's idea of v1–v3, which is precisely the assumption
// worth not making: if the refactor drifted even slightly, a real device would
// migrate a schema that no test has ever seen.
//
// SHIPPED_V1..V3 below are copied verbatim from `git show 9338eb1:src/db/schema.ts`.
// They are a historical record, not something to tidy up. If they ever need to
// change, the shipped build changed, which cannot happen.
//
// Run with: npm run test:db

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { LATEST_VERSION, MIGRATIONS } from './migrations.ts';
import { withSyncColumns } from './backup.ts';

const SHIPPED_V1 = `
  CREATE TABLE items (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    subcategory   TEXT,
    brand         TEXT,
    colors        TEXT NOT NULL DEFAULT '[]',
    pattern       TEXT NOT NULL DEFAULT 'solid',
    formality     INTEGER NOT NULL DEFAULT 2,
    seasons       TEXT NOT NULL DEFAULT '[]',
    tags          TEXT NOT NULL DEFAULT '[]',
    image_uri     TEXT,
    notes         TEXT,

    source        TEXT NOT NULL DEFAULT 'manual',
    retailer      TEXT,
    external_ref  TEXT,
    price         REAL,
    currency      TEXT,
    purchased_at  INTEGER,

    benched_at    INTEGER,
    benched_until INTEGER,

    wear_count    INTEGER NOT NULL DEFAULT 0,
    last_worn_at  INTEGER,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE INDEX items_category_idx ON items (category);
  CREATE INDEX items_benched_idx  ON items (benched_at);
  CREATE UNIQUE INDEX items_external_ref_idx
    ON items (source, external_ref) WHERE external_ref IS NOT NULL;

  CREATE TABLE outfits (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT,
    note         TEXT,
    created_at   INTEGER NOT NULL,
    archived_at  INTEGER,
    favorite     INTEGER NOT NULL DEFAULT 0,
    worn_count   INTEGER NOT NULL DEFAULT 0,
    last_worn_at INTEGER
  );

  CREATE INDEX outfits_archived_idx ON outfits (archived_at, created_at DESC);

  CREATE TABLE outfit_items (
    outfit_id TEXT NOT NULL REFERENCES outfits (id) ON DELETE CASCADE,
    item_id   TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    slot      TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    -- Keyed by item, not slot: an outfit may carry several accessories.
    PRIMARY KEY (outfit_id, item_id)
  );

  CREATE INDEX outfit_items_item_idx ON outfit_items (item_id);
`;

const SHIPPED_V2 = `
  CREATE TABLE capsules (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- Many-to-many on purpose: a dressy outfit can belong to both "Work" and
  -- "New York" without being duplicated.
  CREATE TABLE capsule_outfits (
    capsule_id TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
    outfit_id  TEXT NOT NULL REFERENCES outfits (id) ON DELETE CASCADE,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (capsule_id, outfit_id)
  );

  CREATE INDEX capsule_outfits_outfit_idx ON capsule_outfits (outfit_id);
`;

const SHIPPED_V3 = `
  CREATE TABLE capsule_packed (
    capsule_id TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    packed_at  INTEGER NOT NULL,
    PRIMARY KEY (capsule_id, item_id)
  );
`;

/** A database exactly as build 1 leaves it. */
function shippedV3(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SHIPPED_V1);
  db.exec(SHIPPED_V2);
  db.exec(SHIPPED_V3);
  db.exec('PRAGMA user_version = 3');
  return db;
}

/** The upgrade the app performs, one transactional step at a time. */
function upgrade(db: DatabaseSync): void {
  const from = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = from; v < LATEST_VERSION; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
}

/**
 * A wardrobe with the awkward bits in it: unicode, apostrophes, NULLs, a
 * benched piece, an archived outfit, a purchase with a price, a garment worn
 * in two outfits, an outfit in two capsules.
 */
function fillWardrobe(db: DatabaseSync): void {
  const t = 1_726_000_000_000;

  db.exec(`
    INSERT INTO items (id, name, category, subcategory, brand, colors, pattern, formality,
                       seasons, tags, image_uri, notes, source, retailer, external_ref,
                       price, currency, purchased_at, benched_at, benched_until,
                       wear_count, last_worn_at, created_at, updated_at)
    VALUES
      ('i1', 'White oxford shirt', 'top', 'Shirt', 'Uniqlo', '["White"]', 'solid', 3,
       '["spring","fall"]', '["staple","work"]', 'closet-images/i1.jpg', 'Runs small',
       'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 12, ${t}, ${t}, ${t}),
      ('i2', 'Raw denim jeans', 'bottom', 'Jeans', 'Acne Studios', '["Indigo"]', 'denim', 2,
       '["fall","winter"]', '[]', 'closet-images/i2.jpg', NULL,
       'receipt', 'Mr Porter', 'ORD-991', 189.5, 'GBP', ${t}, NULL, NULL, 40, ${t}, ${t}, ${t}),
      ('i3', 'Café racer jacket — Schott', 'outerwear', 'Jacket', 'Schott', '["Brown"]',
       'solid', 2, '[]', '["don''t pack"]', 'closet-images/i3.jpg', 'Café, naïve, 日本製',
       'manual', NULL, NULL, NULL, NULL, NULL, ${t}, ${t + 86400000}, 3, NULL, ${t}, ${t}),
      ('i4', 'Worn leather boots', 'shoes', 'Boots', 'Red Wing', '["Tan"]', 'solid', 2,
       '[]', '[]', NULL, NULL, 'manual', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       0, NULL, ${t}, ${t});

    INSERT INTO outfits (id, name, note, created_at, archived_at, favorite, worn_count, last_worn_at)
    VALUES ('o1', 'Weekday one', 'Good in the rain', ${t}, NULL, 1, 7, ${t}),
           ('o2', NULL, NULL, ${t}, ${t}, 0, 0, NULL);

    INSERT INTO outfit_items (outfit_id, item_id, slot, position) VALUES
      ('o1', 'i1', 'top', 0), ('o1', 'i2', 'bottom', 1), ('o1', 'i4', 'shoes', 2),
      ('o2', 'i1', 'top', 0), ('o2', 'i3', 'outerwear', 1);

    INSERT INTO capsules (id, name, note, created_at, updated_at)
    VALUES ('c1', 'New York', 'Cold, smart', ${t}, ${t}),
           ('c2', 'Work', NULL, ${t}, ${t});

    INSERT INTO capsule_outfits (capsule_id, outfit_id, added_at)
    VALUES ('c1', 'o1', ${t}), ('c2', 'o1', ${t});

    INSERT INTO capsule_packed (capsule_id, item_id, packed_at)
    VALUES ('c1', 'i1', ${t}), ('c1', 'i4', ${t});
  `);
}

const rows = (db: DatabaseSync, sql: string): Record<string, unknown>[] =>
  db.prepare(sql).all() as Record<string, unknown>[];

function schemaOf(db: DatabaseSync): string[] {
  const names = (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as { name: string }[]
  ).map((r) => r.name);

  const lines: string[] = [];

  for (const table of names) {
    for (const c of db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[]) {
      // Column order matters as much as the set: ALTER TABLE appends, so a
      // drifted migration shows up here as a column in the wrong position.
      lines.push(
        `${table}.${c.name} ${c.type} notnull=${c.notnull} default=${c.dflt_value ?? '-'} pk=${c.pk}`
      );
    }

    for (const i of db.prepare(`PRAGMA index_list(${table})`).all() as {
      name: string;
      unique: number;
      partial: number;
    }[]) {
      const cols = (db.prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[])
        .map((x) => x.name)
        .join(',');
      lines.push(`${table} index ${i.name} (${cols}) unique=${i.unique} partial=${i.partial}`);
    }
  }

  return lines.sort();
}

describe('upgrading a real TestFlight device (v3 -> v5)', () => {
  it('reaches the current version', () => {
    const db = shippedV3();
    fillWardrobe(db);
    upgrade(db);

    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(user_version, LATEST_VERSION);
    db.close();
  });

  it('changes not one byte of the wardrobe', () => {
    const db = shippedV3();
    fillWardrobe(db);

    const columnsBefore = {
      items: `SELECT id, name, category, subcategory, brand, colors, pattern, formality,
                     seasons, tags, image_uri, notes, source, retailer, external_ref,
                     price, currency, purchased_at, benched_at, benched_until,
                     wear_count, last_worn_at, created_at, updated_at
              FROM items ORDER BY id`,
      outfits: `SELECT id, name, note, created_at, archived_at, favorite, worn_count,
                       last_worn_at FROM outfits ORDER BY id`,
      outfit_items: `SELECT outfit_id, item_id, slot, position FROM outfit_items
                     ORDER BY outfit_id, item_id`,
      capsules: `SELECT id, name, note, created_at, updated_at FROM capsules ORDER BY id`,
      capsule_outfits: `SELECT capsule_id, outfit_id, added_at FROM capsule_outfits
                        ORDER BY capsule_id, outfit_id`,
      capsule_packed: `SELECT capsule_id, item_id, packed_at FROM capsule_packed
                       ORDER BY capsule_id, item_id`,
    };

    const before = Object.fromEntries(
      Object.entries(columnsBefore).map(([t, sql]) => [t, rows(db, sql)])
    );

    upgrade(db);

    for (const [table, sql] of Object.entries(columnsBefore)) {
      assert.deepEqual(rows(db, sql), before[table], `${table} changed during the upgrade`);
    }

    db.close();
  });

  it('keeps every photo reachable, so housekeeping cannot delete one', () => {
    // sweep() runs straight after migrate() and deletes every image file not
    // returned by referencedImages(). If the upgrade tombstoned anything by
    // accident, that query would shrink and real photos would be erased from
    // disk — irreversibly, and without an error.
    const db = shippedV3();
    fillWardrobe(db);

    const before = rows(db, `SELECT image_uri FROM items WHERE image_uri IS NOT NULL ORDER BY image_uri`);
    upgrade(db);
    const after = rows(
      db,
      `SELECT image_uri FROM items WHERE image_uri IS NOT NULL AND deleted_at IS NULL ORDER BY image_uri`
    );

    assert.deepEqual(after, before, 'an image stopped being referenced — sweep() would delete it');
    assert.equal(after.length, 3);
    db.close();
  });

  it('leaves nothing tombstoned', () => {
    const db = shippedV3();
    fillWardrobe(db);
    upgrade(db);

    for (const table of ['items', 'outfits', 'capsules', 'capsule_outfits', 'capsule_packed']) {
      const [{ n }] = rows(db, `SELECT count(*) AS n FROM ${table} WHERE deleted_at IS NOT NULL`) as {
        n: number;
      }[];
      assert.equal(n, 0, `${table} came out of the upgrade with rows marked deleted`);
    }

    db.close();
  });

  it('backfills updated_at from real timestamps, never the epoch', () => {
    const db = shippedV3();
    fillWardrobe(db);
    upgrade(db);

    const zeros = rows(
      db,
      `SELECT 'outfits' AS t, id FROM outfits WHERE updated_at = 0
       UNION ALL SELECT 'capsule_outfits', capsule_id FROM capsule_outfits WHERE updated_at = 0
       UNION ALL SELECT 'capsule_packed', capsule_id FROM capsule_packed WHERE updated_at = 0`
    );
    assert.deepEqual(zeros, [], 'these rows would never be picked up by a sync pull');
    db.close();
  });

  it('lands on the same schema as a fresh install', () => {
    // Otherwise an upgraded phone and a new one diverge, and every later
    // migration has two different starting points to be correct against.
    const upgraded = shippedV3();
    upgrade(upgraded);

    const fresh = new DatabaseSync(':memory:');
    fresh.exec('PRAGMA foreign_keys = ON;');
    for (let v = 0; v < LATEST_VERSION; v++) fresh.exec(MIGRATIONS[v]);

    assert.deepEqual(schemaOf(upgraded), schemaOf(fresh));
    upgraded.close();
    fresh.close();
  });

  it('survives being killed mid-upgrade and finishes on the next launch', () => {
    const db = shippedV3();
    fillWardrobe(db);

    // v3 -> v4 commits, then the phone dies partway through v4 -> v5.
    db.exec('BEGIN');
    db.exec(MIGRATIONS[3]);
    db.exec('PRAGMA user_version = 4');
    db.exec('COMMIT');

    db.exec('BEGIN');
    db.exec(MIGRATIONS[4]);
    db.exec('ROLLBACK'); // power cut before the commit

    const mid = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    assert.equal(mid, 4, 'a rolled-back step must not advance the version');
    assert.equal((rows(db, 'SELECT * FROM items') as unknown[]).length, 4, 'data survived');

    upgrade(db); // next launch

    const end = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    assert.equal(end, LATEST_VERSION);
    assert.equal((rows(db, 'SELECT * FROM items') as unknown[]).length, 4);
    db.close();
  });

  it('is a no-op if the upgrade somehow runs twice', () => {
    const db = shippedV3();
    fillWardrobe(db);
    upgrade(db);

    const snapshot = rows(db, 'SELECT * FROM items ORDER BY id');
    upgrade(db);
    assert.deepEqual(rows(db, 'SELECT * FROM items ORDER BY id'), snapshot);
    db.close();
  });
});

describe('restoring a build-1 backup into v5', () => {
  // The safety net. If someone exports from build 1 before updating, that file
  // has no deleted_at or updated_at anywhere, and no capsule_dismissed table.
  it('accepts rows that predate the sync columns', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    for (let v = 0; v < LATEST_VERSION; v++) db.exec(MIGRATIONS[v]);

    const t = 1_726_000_000_000;

    // Exactly the column set `SELECT *` returns on a v3 database.
    db.exec(`
      INSERT OR REPLACE INTO items (id, name, category, colors, pattern, formality,
                                    seasons, tags, created_at, updated_at)
      VALUES ('i1', 'Restored shirt', 'top', '["White"]', 'solid', 3, '[]', '[]', ${t}, ${t});

      INSERT OR REPLACE INTO outfits (id, name, created_at, favorite, worn_count)
      VALUES ('o1', 'From the backup', ${t}, 0, 0);
    `);

    const outfit = db.prepare(`SELECT updated_at, deleted_at FROM outfits WHERE id = 'o1'`).get() as {
      updated_at: number;
      deleted_at: number | null;
    };

    // The raw INSERT shows the trap: the column default is 0.
    assert.equal(outfit.updated_at, 0, 'the default importData has to work around');
    assert.equal(outfit.deleted_at, null, 'restored rows must come back live, not tombstoned');
    db.close();
  });

  it('stamps updated_at on rows the backup has none for', () => {
    const t = 1_726_000_000_000;

    assert.equal(
      withSyncColumns('outfits', { id: 'o1', created_at: t }).updated_at,
      t,
      'an outfit should carry forward its own creation time'
    );
    assert.equal(withSyncColumns('capsule_outfits', { added_at: t }).updated_at, t);
    assert.equal(withSyncColumns('capsule_packed', { packed_at: t }).updated_at, t);
    assert.equal(withSyncColumns('capsule_dismissed', { dismissed_at: t }).updated_at, t);
  });

  it('leaves a newer backup’s own updated_at alone', () => {
    const row = { id: 'o1', created_at: 1, updated_at: 999 };
    assert.equal(withSyncColumns('outfits', row).updated_at, 999);
    assert.equal(withSyncColumns('items', { id: 'i1', updated_at: 5 }).updated_at, 5);
  });

  it('never leaves updated_at at zero, even with a corrupt timestamp', () => {
    const out = withSyncColumns('outfits', { id: 'o1', created_at: null });
    assert.ok((out.updated_at as number) > 0, 'a missing creation time must fall back to now');
  });

  it('restores a v5 outfit that a sync pull would actually see', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    for (let v = 0; v < LATEST_VERSION; v++) db.exec(MIGRATIONS[v]);

    const t = 1_726_000_000_000;
    const row = withSyncColumns('outfits', { id: 'o1', name: 'From the backup', created_at: t,
                                             favorite: 0, worn_count: 0 });
    const cols = Object.keys(row);
    db.prepare(
      `INSERT OR REPLACE INTO outfits (${cols.join(', ')})
       VALUES (${cols.map(() => '?').join(', ')})`
    ).run(...(cols.map((c) => row[c]) as never[]));

    const [found] = db.prepare(`SELECT id FROM outfits WHERE updated_at > 0`).all() as { id: string }[];
    assert.equal(found?.id, 'o1', 'a restored outfit must be visible to a sync pull');
    db.close();
  });
});
