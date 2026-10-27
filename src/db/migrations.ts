/**
 * Schema migrations, as data.
 *
 * Index N is the migration from `user_version` N to N+1, so the array length
 * is the latest version. Plain SQL strings with no expo-sqlite import, which
 * means the migration test can run exactly the statements the app runs —
 * there is no second copy of the schema to drift out of sync.
 *
 * Append only. Never edit a migration that has shipped: a device that has
 * already run it will not run it again.
 */
export const MIGRATIONS: readonly string[] = [
  // ---- v0 -> v1 ----------------------------------------------------
  `
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
  `,

  // ---- v1 -> v2 ----------------------------------------------------
  `
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
  `,

  // ---- v2 -> v3 ----------------------------------------------------
  `
CREATE TABLE capsule_packed (
  capsule_id TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  packed_at  INTEGER NOT NULL,
  PRIMARY KEY (capsule_id, item_id)
);
  `,

  // ---- v3 -> v4 ----------------------------------------------------
  `
CREATE TABLE capsule_dismissed (
  capsule_id   TEXT NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
  signature    TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (capsule_id, signature)
);
  `,

  // ---- v4 -> v5 ----------------------------------------------------------
  // Prepare for cloud sync.
  //
  // Two things sync cannot work without, and neither can be added safely once
  // devices disagree:
  //
  //   Tombstones. Until now a delete removed the row outright, so a sync had
  //   no way to tell "deleted here" from "not created here yet" — and the row
  //   would resurrect from the other device on the next pull.
  //
  //   updated_at everywhere. Last-write-wins needs a comparable timestamp on
  //   every syncable row, and outfits and the join tables had none.
  //
  // Purely additive: ALTER TABLE ADD COLUMN is cheap in SQLite and leaves
  // existing rows untouched. Older code reading this database simply ignores
  // the new columns.
  //
  // outfit_items deliberately gets neither. It has no edit path in the app —
  // rows are written once with their outfit and never touched again — so it
  // syncs as part of the outfit aggregate rather than as a row in its own
  // right.
  `
  ALTER TABLE items             ADD COLUMN deleted_at INTEGER;
  ALTER TABLE outfits           ADD COLUMN deleted_at INTEGER;
  ALTER TABLE capsules          ADD COLUMN deleted_at INTEGER;
  ALTER TABLE capsule_outfits   ADD COLUMN deleted_at INTEGER;
  ALTER TABLE capsule_packed    ADD COLUMN deleted_at INTEGER;
  ALTER TABLE capsule_dismissed ADD COLUMN deleted_at INTEGER;

  ALTER TABLE outfits           ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE capsule_outfits   ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE capsule_packed    ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE capsule_dismissed ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

  -- Backfill from each table's own creation timestamp, so existing rows carry
  -- a truthful time rather than the epoch. A row that has never been edited
  -- was last written when it was created.
  UPDATE outfits           SET updated_at = created_at   WHERE updated_at = 0;
  UPDATE capsule_outfits   SET updated_at = added_at     WHERE updated_at = 0;
  UPDATE capsule_packed    SET updated_at = packed_at    WHERE updated_at = 0;
  UPDATE capsule_dismissed SET updated_at = dismissed_at WHERE updated_at = 0;

  -- Every pull is "what changed since", so this is the hot path.
  CREATE INDEX items_sync_idx             ON items (updated_at);
  CREATE INDEX outfits_sync_idx           ON outfits (updated_at);
  CREATE INDEX capsules_sync_idx          ON capsules (updated_at);
  CREATE INDEX capsule_outfits_sync_idx   ON capsule_outfits (updated_at);
  CREATE INDEX capsule_packed_sync_idx    ON capsule_packed (updated_at);
  CREATE INDEX capsule_dismissed_sync_idx ON capsule_dismissed (updated_at);
  `,
];

/** The version a fully migrated database reports. */
export const LATEST_VERSION = MIGRATIONS.length;

/**
 * Tables that participate in sync, with the columns that identify a row.
 *
 * The foundation's sync engine is driven by this manifest rather than by a
 * schema it imposes, so an app keeps its own domain tables. Composite keys are
 * declared rather than replaced with surrogate ids — rewriting four join
 * tables on live data would be a far riskier migration than teaching the
 * engine about multi-column keys.
 */
export const SYNC_TABLES = [
  { table: 'items', key: ['id'] },
  { table: 'outfits', key: ['id'], children: ['outfit_items'] },
  { table: 'capsules', key: ['id'] },
  { table: 'capsule_outfits', key: ['capsule_id', 'outfit_id'] },
  { table: 'capsule_packed', key: ['capsule_id', 'item_id'] },
  { table: 'capsule_dismissed', key: ['capsule_id', 'signature'] },
] as const;
