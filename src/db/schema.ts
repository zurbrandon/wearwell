import type { SQLiteDatabase } from 'expo-sqlite';

import { referencedImages } from '@/db/items';
import { pruneOrphanImages } from '@/lib/photos';

export const DATABASE_NAME = 'closet.db';

/**
 * Bump this and append a case to `migrate` for every schema change.
 * Migrations run inside a transaction on app start.
 */
const LATEST_VERSION = 4;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version >= LATEST_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
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
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`
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
    `);
    version = 2;
  }

  if (version === 2) {
    // Ticking a piece off is per capsule, not per item: the same shirt can be
    // packed for New York while still sitting unpacked in the Work capsule.
    await db.execAsync(`
      CREATE TABLE capsule_packed (
        capsule_id TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
        item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
        packed_at  INTEGER NOT NULL,
        PRIMARY KEY (capsule_id, item_id)
      );
    `);
    version = 3;
  }

  if (version === 3) {
    // Keyed by a signature derived from the item ids rather than an outfit id,
    // because a dismissed suggestion was never an outfit — it's a combination
    // the user has said no to, and it must stay said-no-to across sessions.
    await db.execAsync(`
      CREATE TABLE capsule_dismissed (
        capsule_id   TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
        signature    TEXT NOT NULL,
        dismissed_at INTEGER NOT NULL,
        PRIMARY KEY (capsule_id, signature)
      );
    `);
    version = 4;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

/** Housekeeping run once on start, after migrations. */
export async function sweep(db: SQLiteDatabase): Promise<void> {
  pruneOrphanImages(await referencedImages(db));
}
