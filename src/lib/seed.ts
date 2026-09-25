import type { SQLiteDatabase } from 'expo-sqlite';

import { countItems, createItem, updateItem } from '@/db/items';
import { downloadImage } from '@/lib/photos';
import type { NewItem } from '@/lib/types';

type Seed = Omit<
  NewItem,
  'source' | 'retailer' | 'externalRef' | 'price' | 'currency' | 'purchasedAt' | 'imageUri' | 'notes'
> & {
  /** Stock photo pulled in on first seed. */
  imageUrl: string;
};

/** Portrait crop, sized for a full-bleed card on a 3x screen. */
function unsplash(id: string): string {
  return `https://images.unsplash.com/${id}?w=900&h=1200&fit=crop&crop=entropy&q=80&fm=jpg`;
}

/**
 * A small sample wardrobe for development — enough breadth that the pairing
 * rules have something to say: a formality spread from tee to blazer, mostly
 * neutrals with two loud colours to trigger clash detection, and a couple of
 * patterns. Photos are Unsplash stock, downloaded locally on first seed.
 */
const SEEDS: Seed[] = [
  // Tops
  { name: 'White oxford shirt', brand: 'Uniqlo', category: 'top', subcategory: 'Shirt', colors: ['White'], pattern: 'solid', formality: 3, seasons: ['spring', 'fall'], tags: ['staple'], imageUrl: unsplash('photo-1602810318383-e386cc2a3ccf') },
  { name: 'Blue poplin shirt', brand: 'Everlane', category: 'top', subcategory: 'Shirt', colors: ['Blue'], pattern: 'solid', formality: 3, seasons: ['spring', 'summer'], tags: [], imageUrl: unsplash('photo-1602810316693-3667c854239a') },
  { name: 'Grey V-neck tee', brand: 'Buck Mason', category: 'top', subcategory: 'T-shirt', colors: ['Grey'], pattern: 'solid', formality: 2, seasons: ['spring', 'summer'], tags: ['staple'], imageUrl: unsplash('photo-1548768041-2fceab4c0b85') },
  { name: 'Polka dot shirt', brand: 'Corridor', category: 'top', subcategory: 'Shirt', colors: ['White', 'Black'], pattern: 'print', formality: 3, seasons: ['spring', 'summer'], tags: [], imageUrl: unsplash('photo-1602810319428-019690571b5b') },
  { name: 'Cream knit sweater', brand: 'COS', category: 'top', subcategory: 'Sweater', colors: ['Cream'], pattern: 'texture', formality: 3, seasons: ['fall', 'winter'], tags: ['layer'], imageUrl: unsplash('photo-1621198059871-0d5f9b449233') },

  // One-pieces — these collapse the top and bottom slots in the builder, so the
  // sample set needs them for that path to be exercised at all.
  { name: 'Blue floral sundress', brand: 'Réalisation', category: 'onepiece', subcategory: 'Dress', colors: ['Blue', 'White'], pattern: 'floral', formality: 3, seasons: ['spring', 'summer'], tags: [], imageUrl: unsplash('photo-1760097679488-f808c6aca11d') },
  { name: 'Red midi dress', brand: 'Ganni', category: 'onepiece', subcategory: 'Dress', colors: ['Red'], pattern: 'solid', formality: 4, seasons: ['spring', 'summer'], tags: [], imageUrl: unsplash('photo-1589400363677-81704324e25b') },
  { name: 'Black long-sleeve dress', brand: 'COS', category: 'onepiece', subcategory: 'Dress', colors: ['Black'], pattern: 'solid', formality: 4, seasons: ['fall', 'winter'], tags: ['work'], imageUrl: unsplash('photo-1611077094985-c2925cbc857a') },
  { name: 'Cream utility jumpsuit', brand: 'Lemaire', category: 'onepiece', subcategory: 'Jumpsuit', colors: ['Cream'], pattern: 'solid', formality: 3, seasons: ['spring', 'fall'], tags: [], imageUrl: unsplash('photo-1571273134620-1ef375de9b84') },

  // Bottoms
  { name: 'Raw denim jeans', brand: "Levi's", category: 'bottom', subcategory: 'Jeans', colors: ['Denim'], pattern: 'denim', formality: 2, seasons: ['spring', 'fall', 'winter'], tags: ['staple'], imageUrl: unsplash('photo-1602293589930-45aad59ba3ab') },
  { name: 'Black jeans', brand: 'Acne Studios', category: 'bottom', subcategory: 'Jeans', colors: ['Black'], pattern: 'denim', formality: 2, seasons: ['fall', 'winter'], tags: [], imageUrl: unsplash('photo-1718252540617-6ecda2b56b57') },
  { name: 'Grey wool trousers', brand: 'Suitsupply', category: 'bottom', subcategory: 'Trousers', colors: ['Grey'], pattern: 'solid', formality: 4, seasons: ['fall', 'winter'], tags: ['work'], imageUrl: unsplash('photo-1601679249486-3e2a903f23ee') },
  { name: 'Tailored shorts', brand: 'Arket', category: 'bottom', subcategory: 'Shorts', colors: ['Beige'], pattern: 'solid', formality: 2, seasons: ['summer'], tags: [], imageUrl: unsplash('photo-1719473456953-bf41de642bde') },

  // Shoes
  { name: 'White high-top sneakers', brand: 'Common Projects', category: 'shoes', subcategory: 'Sneakers', colors: ['White'], pattern: 'solid', formality: 2, seasons: ['spring', 'summer', 'fall'], tags: ['staple'], imageUrl: unsplash('photo-1578269174432-a8073d86c2e0') },
  { name: 'Canvas court sneakers', brand: 'Clarks', category: 'shoes', subcategory: 'Sneakers', colors: ['Cream', 'Brown'], pattern: 'solid', formality: 2, seasons: ['spring', 'summer'], tags: [], imageUrl: unsplash('photo-1517389274750-a758d503b69e') },
  { name: 'Worn leather boots', brand: 'Red Wing', category: 'shoes', subcategory: 'Boots', colors: ['Brown'], pattern: 'texture', formality: 2, seasons: ['fall', 'winter'], tags: [], imageUrl: unsplash('photo-1550998358-08b4f83dc345') },
  { name: 'Brown leather derbies', brand: 'Grenson', category: 'shoes', subcategory: 'Dress shoes', colors: ['Brown'], pattern: 'solid', formality: 4, seasons: ['fall', 'winter'], tags: ['work'], imageUrl: unsplash('photo-1626947346165-4c2288dadc2a') },

  // Outerwear
  { name: 'Washed denim jacket', brand: 'Norse Projects', category: 'outerwear', subcategory: 'Jacket', colors: ['Denim'], pattern: 'denim', formality: 2, seasons: ['spring', 'fall'], tags: [], imageUrl: unsplash('photo-1543076447-215ad9ba6923') },
  { name: 'Brown leather jacket', brand: 'Schott', category: 'outerwear', subcategory: 'Jacket', colors: ['Brown'], pattern: 'texture', formality: 3, seasons: ['fall', 'winter'], tags: [], imageUrl: unsplash('photo-1623854156816-4c4fc355ffc7') },
  { name: 'Black blazer', brand: 'Suitsupply', category: 'outerwear', subcategory: 'Blazer', colors: ['Black'], pattern: 'solid', formality: 5, seasons: ['fall', 'winter'], tags: ['work'], imageUrl: unsplash('photo-1592343516109-362f7bd871aa') },

  // Accessories
  { name: 'Brown leather belt', brand: 'Tanner Goods', category: 'accessory', subcategory: 'Belt', colors: ['Brown'], pattern: 'solid', formality: 3, seasons: [], tags: [], imageUrl: unsplash('photo-1565251419287-9097aa7299ec') },
  { name: 'Leather satchel', brand: 'Mulberry', category: 'accessory', subcategory: 'Bag', colors: ['Brown'], pattern: 'solid', formality: 3, seasons: [], tags: [], imageUrl: unsplash('photo-1637759292654-a12cb2be085e') },
  { name: 'Black steel watch', brand: 'Braun', category: 'accessory', subcategory: 'Watch', colors: ['Black'], pattern: 'solid', formality: 4, seasons: [], tags: ['work'], imageUrl: unsplash('photo-1568115614536-648959aadb21') },
  { name: 'Grey leather holdall', brand: 'Filson', category: 'accessory', subcategory: 'Bag', colors: ['Grey'], pattern: 'solid', formality: 2, seasons: [], tags: [], imageUrl: unsplash('photo-1451930487711-61b69e43af1e') },
];

/**
 * No-ops if the closet already has anything in it.
 *
 * Items are written first and photos fetched afterwards, so the closet fills
 * immediately and each tile picks up its image as it lands — the database
 * change listener drives the refresh.
 */
export async function seedSampleCloset(db: SQLiteDatabase): Promise<number> {
  if ((await countItems(db)) > 0) return 0;

  const created: { id: string; imageUrl: string }[] = [];

  for (const seed of SEEDS) {
    const { imageUrl, ...rest } = seed;
    const id = await createItem(db, {
      ...rest,
      imageUri: null,
      notes: null,
      source: 'manual',
      retailer: null,
      externalRef: null,
      price: null,
      currency: null,
      purchasedAt: null,
    });
    created.push({ id, imageUrl });
  }

  await Promise.all(
    created.map(async ({ id, imageUrl }) => {
      const path = await downloadImage(imageUrl, id);
      if (path) await updateItem(db, id, { imageUri: path });
    })
  );

  return SEEDS.length;
}
