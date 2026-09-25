/**
 * The wardrobe taxonomy. `Slot` is what an outfit is assembled from; `Category`
 * is what an item *is*. They're nearly 1:1, except a one-piece (dress, jumpsuit)
 * occupies the top and bottom slots at once.
 */

import type { SFSymbol } from 'sf-symbols-typescript';

export const SLOTS = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'] as const;
export type Slot = (typeof SLOTS)[number];

export const CATEGORIES = [
  'top',
  'bottom',
  'onepiece',
  'shoes',
  'outerwear',
  'accessory',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  top: 'Top',
  bottom: 'Bottom',
  onepiece: 'One-piece',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

export const SLOT_LABEL: Record<Slot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

/** The order the builder walks through slots, and whether each may be skipped. */
/** Abbreviated labels for the builder's slot track, where width is tight. */
export const SLOT_SHORT_LABEL: Record<Slot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  outerwear: 'Outer',
  accessory: 'Extra',
};

/** Prompt shown while filling a slot. Articles vary, so these aren't derived. */
export const SLOT_PROMPT: Record<Slot, string> = {
  top: 'Pick a top',
  bottom: 'Pick a bottom',
  shoes: 'Pick shoes',
  outerwear: 'Pick outerwear',
  accessory: 'Pick an accessory',
};

/** Label for the "leave this slot empty" action. */
export const SLOT_SKIP_LABEL: Record<Slot, string> = {
  top: 'No top',
  bottom: 'No bottom',
  shoes: 'No shoes',
  outerwear: 'No outerwear',
  accessory: 'No accessory',
};

export const SLOT_ORDER: readonly Slot[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];
export const OPTIONAL_SLOTS: ReadonlySet<Slot> = new Set(['outerwear', 'accessory']);

/** Which categories are eligible to fill a given slot. */
export function categoriesForSlot(slot: Slot): Category[] {
  switch (slot) {
    case 'top':
      return ['top', 'onepiece'];
    case 'bottom':
      return ['bottom'];
    default:
      return [slot];
  }
}

/**
 * Every slot a garment accounts for. A one-piece covers the top and bottom at
 * once — this is the single definition of that rule; nothing should re-derive
 * it by testing for `onepiece` inline.
 */
export function coversSlots(category: Category): Slot[] {
  return category === 'onepiece' ? ['top', 'bottom'] : [category as Slot];
}

/**
 * The first step's prompt depends on whether the closet holds any one-pieces:
 * offering a dress you don't own would be noise.
 */
export function slotPrompt(slot: Slot, hasOnePieces: boolean): string {
  if (slot === 'top' && hasOnePieces) return 'Pick a top or dress';
  return SLOT_PROMPT[slot];
}

/** Emoji used on the closet filter pills. */
export const CATEGORY_EMOJI: Record<Category, string> = {
  top: '👕',
  bottom: '👖',
  onepiece: '👗',
  shoes: '👟',
  outerwear: '🧥',
  accessory: '👜',
};

export const SUBCATEGORIES: Record<Category, string[]> = {
  top: ['T-shirt', 'Shirt', 'Blouse', 'Sweater', 'Hoodie', 'Tank', 'Polo', 'Cardigan'],
  bottom: ['Jeans', 'Trousers', 'Chinos', 'Shorts', 'Skirt', 'Joggers', 'Leggings'],
  onepiece: ['Dress', 'Jumpsuit', 'Romper', 'Suit'],
  shoes: ['Sneakers', 'Boots', 'Loafers', 'Heels', 'Sandals', 'Dress shoes', 'Flats'],
  outerwear: ['Jacket', 'Coat', 'Blazer', 'Parka', 'Vest', 'Trench'],
  accessory: ['Bag', 'Belt', 'Hat', 'Scarf', 'Watch', 'Jewelry', 'Sunglasses', 'Tie'],
};

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const PATTERNS = [
  'solid',
  'stripe',
  'check',
  'plaid',
  'floral',
  'print',
  'denim',
  'texture',
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** 1 = loungewear, 5 = black tie. Drives the "do these go together" check. */
export const FORMALITY_LABEL: Record<number, string> = {
  1: 'Loungewear',
  2: 'Casual',
  3: 'Smart casual',
  4: 'Business',
  5: 'Formal',
};

/**
 * Named colors with a hex swatch and a neutral flag. Neutrals pair with
 * anything; non-neutrals need a harmony check against each other.
 */
export type ColorDef = { name: string; hex: string; neutral: boolean };

export const COLORS: ColorDef[] = [
  { name: 'Black', hex: '#111111', neutral: true },
  { name: 'White', hex: '#FAFAF7', neutral: true },
  { name: 'Grey', hex: '#8E8E8E', neutral: true },
  { name: 'Charcoal', hex: '#3A3A3C', neutral: true },
  { name: 'Navy', hex: '#1F2A44', neutral: true },
  { name: 'Beige', hex: '#D8C8AE', neutral: true },
  { name: 'Cream', hex: '#EFE6D2', neutral: true },
  { name: 'Tan', hex: '#B08A5E', neutral: true },
  { name: 'Brown', hex: '#6B4A2F', neutral: true },
  { name: 'Denim', hex: '#4A6A8F', neutral: true },
  { name: 'Olive', hex: '#5E6444', neutral: true },
  { name: 'Red', hex: '#A63328', neutral: false },
  { name: 'Burgundy', hex: '#5E2129', neutral: false },
  { name: 'Orange', hex: '#C4652A', neutral: false },
  { name: 'Mustard', hex: '#C9A227', neutral: false },
  { name: 'Yellow', hex: '#E3C75B', neutral: false },
  { name: 'Green', hex: '#39664A', neutral: false },
  { name: 'Teal', hex: '#2E6B6B', neutral: false },
  { name: 'Blue', hex: '#2D5BA8', neutral: false },
  { name: 'Purple', hex: '#5B3F7A', neutral: false },
  { name: 'Pink', hex: '#D08A9B', neutral: false },
  { name: 'Lavender', hex: '#A79BC4', neutral: false },
];

const COLOR_BY_NAME = new Map(COLORS.map((c) => [c.name.toLowerCase(), c]));

export function colorDef(name: string): ColorDef | undefined {
  return COLOR_BY_NAME.get(name.trim().toLowerCase());
}

export function colorHex(name: string): string {
  return colorDef(name)?.hex ?? '#9A9287';
}

export function isNeutral(name: string): boolean {
  return colorDef(name)?.neutral ?? false;
}

/** SF Symbol used when an item has no photo, and in slot headers. */
export const CATEGORY_SYMBOL: Record<Category, SFSymbol> = {
  top: 'tshirt.fill',
  bottom: 'capsule.portrait.fill',
  onepiece: 'figure.stand',
  shoes: 'shoe.fill',
  outerwear: 'jacket.fill',
  accessory: 'handbag.fill',
};

export const SLOT_SYMBOL: Record<Slot, SFSymbol> = {
  top: 'tshirt.fill',
  bottom: 'capsule.portrait.fill',
  shoes: 'shoe.fill',
  outerwear: 'jacket.fill',
  accessory: 'handbag.fill',
};
