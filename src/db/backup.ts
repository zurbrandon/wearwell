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
export async function importData(db: SQLiteDatabase, backup: BackupData): Promise<ImportSummary> {
  if (backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      'This backup was made by a newer version of the app. Update Outfit and try again.'
    );
  }

  const summary = {} as ImportSummary;

  await db.withTransactionAsync(async () => {
    for (const table of BACKUP_TABLES) {
      const rows = backup.tables?.[table] ?? [];
      summary[table] = 0;

      for (const row of rows) {
        const columns = Object.keys(row);
        if (!columns.length) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((column) => row[column] as string | number | null)
        );
        summary[table] += 1;
      }
    }
  });

  return summary;
}
