// Wearwell — every write to a syncable table must stamp updated_at.
//
// This exists because of a bug that shipped past both other suites. Migration
// v5 added `updated_at INTEGER NOT NULL DEFAULT 0` to outfits — the default is
// forced, since ALTER TABLE cannot add a non-null column to existing rows
// without one — and then backfilled those rows from created_at. New rows get
// no backfill, and `createOutfit` was never updated to set the column, so
// every outfit saved after the migration was written with updated_at = 0.
//
// Nothing caught it. migrations.test.mts checks the backfill, which was
// correct. soft-delete.test.mts seeds rows with explicit timestamps, so it
// never ran the app's own INSERT. The app typechecked, ran, and silently wrote
// outfits that a sync pull asking `updated_at > lastSync` would never return.
//
// So this suite reads the actual SQL in src/db/*.ts rather than re-stating it.
//
// Run with: npm run test:db

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { LATEST_VERSION, MIGRATIONS, SYNC_TABLES } from './migrations.ts';

const DB_DIR = dirname(fileURLToPath(import.meta.url));

/** Every `INSERT INTO <table> (...)` across the data layer, with its columns. */
function inserts(): { file: string; line: number; table: string; columns: string[] }[] {
  const found: { file: string; line: number; table: string; columns: string[] }[] = [];

  for (const file of readdirSync(DB_DIR).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(DB_DIR, file), 'utf8');
    const pattern = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]*)\)/gis;

    for (const match of source.matchAll(pattern)) {
      found.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        table: match[1],
        columns: match[2].split(',').map((c) => c.trim()),
      });
    }
  }

  return found;
}

describe('syncable writes', () => {
  it('finds the data layer to inspect', () => {
    // Guards the regex itself: a silently-zero match would make every
    // assertion below vacuously pass.
    assert.ok(inserts().length >= 5, 'expected to parse several INSERT statements');
  });

  it('stamps updated_at on every insert into a syncable table', () => {
    const syncable = new Set(SYNC_TABLES.map((t) => t.table));

    const missing = inserts()
      .filter((i) => syncable.has(i.table))
      .filter((i) => !i.columns.includes('updated_at'))
      .map((i) => `${i.file}:${i.line} INSERT INTO ${i.table} (${i.columns.join(', ')})`);

    assert.deepEqual(
      missing,
      [],
      `these rows would sync as updated_at = 0 and never be pulled:\n  ${missing.join('\n  ')}`
    );
  });

  it('revives tombstoned rows rather than ignoring the conflict', () => {
    // The other half of the same class of bug: a write that appears to work
    // and changes nothing. Join tables keep their primary key while
    // tombstoned, so re-adding must be ON CONFLICT ... DO UPDATE.
    const joins = new Set(['capsule_outfits', 'capsule_packed', 'capsule_dismissed']);

    const bad = inserts()
      .filter((i) => joins.has(i.table))
      .filter((i) => {
        const source = readFileSync(join(DB_DIR, i.file), 'utf8');
        const statement = source.slice(source.indexOf(`INTO ${i.table}`, 0));
        return !/ON CONFLICT[\s\S]{0,120}?DO UPDATE[\s\S]{0,200}?deleted_at\s*=\s*NULL/i.test(
          statement.slice(0, 600)
        );
      })
      .map((i) => `${i.file}:${i.line} ${i.table}`);

    assert.deepEqual(bad, [], `re-adding these would silently do nothing:\n  ${bad.join('\n  ')}`);
  });

  it('shows what the DEFAULT 0 does if an insert omits the column', () => {
    // Documents the trap rather than trusting anyone to remember it.
    const db = new DatabaseSync(':memory:');
    for (let v = 0; v < LATEST_VERSION; v++) db.exec(MIGRATIONS[v]);

    db.exec(`INSERT INTO outfits (id, name, created_at, favorite, worn_count)
             VALUES ('fit_x', 'No timestamp', 1700000000000, 0, 0)`);

    const row = db.prepare(`SELECT updated_at FROM outfits WHERE id = 'fit_x'`).get() as {
      updated_at: number;
    };
    assert.equal(row.updated_at, 0, 'the column default is 0, which is why the check above exists');
    db.close();
  });
});
