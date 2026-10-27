import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * A whole-database snapshot, table by table.
 *
 * Rows are carried in their raw column form rather than the mapped domain
 * types: a backup should survive changes to how the app models things, and the
 * columns are the stable contract.
 */
export type BackupData = {
  /** Bumped when the shape changes incompatibly. */
  schemaVersion: number;
  exportedAt: number;
  /** `PRAGMA user_version` at export time, for future migration on import. */
  databaseVersion: number;
  tables: Record<BackupTable, Record<string, unknown>[]>;
};

/** Order matters on import: parents before the rows that reference them. */
export const BACKUP_TABLES = [
  'items',
  'outfits',
  'outfit_items',
  'capsules',
  'capsule_outfits',
  'capsule_packed',
  // Added in migration v4 but never exported, so dismissed suggestions were
  // silently absent from every backup taken since.
  'capsule_dismissed',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export const BACKUP_SCHEMA_VERSION = 1;

export async function exportData(db: SQLiteDatabase): Promise<BackupData> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const tables = {} as BackupData['tables'];

  for (const table of BACKUP_TABLES) {
    tables[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    databaseVersion: version?.user_version ?? 0,
    tables,
  };
}

export type ImportSummary = Record<BackupTable, number>;

/**
 * Restores a backup by primary key.
 *
 * `INSERT OR REPLACE` rather than wiping first: restoring into an empty app is
 * a full recovery, and restoring over existing data updates what matches and
 * adds what's missing. Nothing is ever deleted, so an import can't itself
 * destroy data — which matters when the whole point is not losing any.
 */
/** Where a table's `updated_at` comes from when a backup predates the column. */
const CREATED_COLUMN: Partial<Record<BackupTable, string>> = {
  outfits: 'created_at',
  capsule_outfits: 'added_at',
  capsule_packed: 'packed_at',
  capsule_dismissed: 'dismissed_at',
};

/**
 * Supplies `updated_at` for rows from a backup taken before the column existed.
 *
 * Backups made by build 1 have no `updated_at` on outfits or the join tables —
 * it arrived in migration v5. INSERT OR REPLACE would fall through to the
 * column default of 0, and a row stamped 0 is invisible to a sync pull asking
 * for `updated_at > lastSync`. The migration backfills exactly this way for
 * rows already on the device; a restore has to do the same, or recovering from
 * a backup would quietly produce data that never syncs.
 *
 * `deleted_at` needs no such care: it is nullable, and NULL means live.
 */
export function withSyncColumns(
  table: BackupTable,
  row: Record<string, unknown>
): Record<string, unknown> {
  const source = CREATED_COLUMN[table];
  if (!source || 'updated_at' in row) return row;

  const origin = row[source];
  return { ...row, updated_at: typeof origin === 'number' ? origin : Date.now() };
}

export async function importData(db: SQLiteDatabase, backup: BackupData): Promise<ImportSummary> {
  if (backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      'This backup was made by a newer version of the app. Update Wearwell and try again.'
    );
  }

  const summary = {} as ImportSummary;

  await db.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      const rows = backup.tables?.[table] ?? [];
      summary[table] = 0;

      for (const row of rows) {
        const restored = withSyncColumns(table, row);
        const columns = Object.keys(restored);
        if (!columns.length) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((column) => restored[column] as string | number | null)
        );
        summary[table] += 1;
      }
    }
  });

  return summary;
}
