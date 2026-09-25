import type { SQLiteDatabase } from 'expo-sqlite';

import { createItem } from '@/db/items';
import { downloadImage } from '@/lib/photos';
import type { ParsedPurchase } from '@/lib/ingest/types';
import type { NewItem } from '@/lib/types';

export type { ParsedPurchase, ParseResult, ReceiptSource } from '@/lib/ingest/types';

export type ImportSummary = {
  added: number;
  duplicates: number;
  failed: { externalRef: string; error: string }[];
};

function toNewItem(purchase: ParsedPurchase, imageUri: string | null): NewItem {
  return {
    name: purchase.name,
    category: purchase.category ?? 'top',
    subcategory: purchase.subcategory ?? null,
    brand: purchase.brand ?? null,
    colors: purchase.colors ?? [],
    pattern: purchase.pattern ?? 'solid',
    formality: purchase.formality ?? 2,
    seasons: purchase.seasons ?? [],
    tags: ['imported'],
    imageUri,
    notes: null,
    source: 'email',
    retailer: purchase.retailer,
    externalRef: purchase.externalRef,
    price: purchase.price ?? null,
    currency: purchase.currency ?? null,
    purchasedAt: purchase.purchasedAt ?? null,
  };
}

/**
 * Writes parsed purchases into the closet, skipping anything already imported.
 *
 * Dedupe is enforced by the unique index on (source, external_ref) rather than
 * a pre-check, so a re-run is safe even if two imports overlap.
 */
export async function importPurchases(
  db: SQLiteDatabase,
  purchases: ParsedPurchase[]
): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, duplicates: 0, failed: [] };

  for (const purchase of purchases) {
    const id = `itm_${purchase.externalRef.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 48)}`;

    try {
      const imageUri = purchase.imageUrl ? await downloadImage(purchase.imageUrl, id) : null;
      await createItem(db, { ...toNewItem(purchase, imageUri), id });
      summary.added += 1;
    } catch (error) {
      const message = String((error as Error).message ?? error);
      if (message.includes('UNIQUE constraint failed')) {
        summary.duplicates += 1;
      } else {
        summary.failed.push({ externalRef: purchase.externalRef, error: message });
      }
    }
  }

  return summary;
}
