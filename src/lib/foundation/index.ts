// Wearwell's binding to the App Foundation.
//
// Everything app-specific about the foundation lives here: where the session
// is kept, which operations this app knows about, and what their results look
// like. `client.ts` beside it is vendored and generic.
//
// Wearwell works entirely without any of this. The closet, the builder and
// capsules make no network calls at all. Auto-tagging is the single feature
// that reaches out, and only when someone taps the button.

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { createFoundation, FoundationError, type Foundation } from '@/lib/foundation/client';
import { CATEGORIES, COLORS, PATTERNS, SEASONS } from '@/lib/taxonomy';
import type { Category, Pattern, Season } from '@/lib/taxonomy';

export { FoundationError } from '@/lib/foundation/client';
export type { Balance } from '@/lib/foundation/client';

type FoundationConfig = { url: string; anonKey: string };

const config = Constants.expoConfig?.extra?.foundation as FoundationConfig | undefined;

/**
 * The session lives in the keychain rather than AsyncStorage.
 *
 * An anonymous user cannot sign back in by any other means, so this value *is*
 * the account — and any credits it holds. SecureStore keeps it out of
 * unencrypted backups.
 */
const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let instance: Foundation | null = null;

/** Null when the app was built without foundation config — AI stays off. */
export function foundation(): Foundation | null {
  if (!config?.url || !config?.anonKey) return null;
  instance ??= createFoundation({ url: config.url, anonKey: config.anonKey, storage });
  return instance;
}

export const aiAvailable = (): boolean => foundation() !== null;

/**
 * What the model is asked to return.
 *
 * The enums are built from the app's own taxonomy rather than written out
 * again. Spelling one of them by hand is how you get a model confidently
 * returning "one-piece" for a category the app calls "onepiece", and a tag
 * that silently fails to apply.
 */
const COLOR_NAMES = COLORS.map((c) => c.name);

const GARMENT_SCHEMA = {
  name: 'garment',
  schema: {
    type: 'object',
    additionalProperties: false,
    // Strict structured output requires *every* property to appear in
    // `required`. Leaving the genuinely optional ones out got the whole call
    // rejected with "Invalid schema for response_format". The way to say
    // optional is to require the key and allow null, which `sanitize` below
    // then drops.
    required: ['name', 'category', 'subcategory', 'colors', 'pattern', 'formality', 'seasons'],
    properties: {
      name: { type: 'string', description: 'Short, like "White oxford shirt"' },
      // Brand is deliberately absent. Asked for it, gpt-4o returned "InStitchu"
      // and then "Indochino" for the same shirt whose label plainly reads
      // "nimble made" — two confident, different, wrong answers, which is
      // guessing rather than reading. A wrong brand is worse than an empty
      // field, because it fills a box the user then has to notice is wrong.
      category: { type: 'string', enum: [...CATEGORIES] },
      subcategory: { type: ['string', 'null'], description: 'Shirt, Jeans, Boots, Bag…' },
      // Constrained to the app's own palette. Free-form colour names came
      // back as "light blue" and "navy blue", which are perfectly good
      // descriptions and match nothing the app can select — so the field
      // filled in and the chips stayed blank.
      colors: {
        type: 'array',
        items: { type: 'string', enum: COLOR_NAMES },
        maxItems: 3,
        description: 'Closest matches from the list, most dominant first',
      },
      pattern: {
        type: 'string',
        enum: [...PATTERNS],
        description:
          '"denim" means denim fabric itself, not a blue garment. Small ' +
          'repeating motifs are "print"; woven texture with no motif is ' +
          '"texture"; plain is "solid".',
      },
      formality: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: '1 loungewear, 3 smart casual, 5 black tie',
      },
      seasons: {
        type: 'array',
        items: { type: 'string', enum: [...SEASONS] },
        description: 'Leave empty if it works year round',
      },
    },
  },
} as const;

/**
 * Only the fields that came back usable.
 *
 * Everything is optional because a schema is a request, not a guarantee: a
 * model can still answer with a category that doesn't exist or a formality of
 * 9. One bad field shouldn't cost the user the other six, so anything that
 * fails validation is simply dropped and left for them to fill in.
 */
export type TaggedGarment = Partial<{
  name: string;
  category: Category;
  subcategory: string;
  colors: string[];
  pattern: Pattern;
  formality: number;
  seasons: Season[];
}>;

const text = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 && s.length <= 120 ? s : undefined;
};

const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

function sanitize(raw: Record<string, unknown>): TaggedGarment {
  const colors = Array.isArray(raw.colors)
    ? raw.colors.map((c) => oneOf(COLOR_NAMES, c)).filter((c): c is string => !!c).slice(0, 3)
    : [];

  const seasons = Array.isArray(raw.seasons)
    ? raw.seasons.map((s) => oneOf(SEASONS, s)).filter((s): s is Season => !!s)
    : [];

  const formality = Number(raw.formality);

  return {
    name: text(raw.name),
    category: oneOf(CATEGORIES, raw.category),
    subcategory: text(raw.subcategory),
    colors: colors.length ? colors : undefined,
    pattern: oneOf(PATTERNS, raw.pattern),
    formality: Number.isInteger(formality) && formality >= 1 && formality <= 5 ? formality : undefined,
    seasons: seasons.length ? seasons : undefined,
  };
}

const SYSTEM = [
  'You are tagging a single garment for a personal wardrobe app.',
  'Describe only the main garment in the photo, ignoring anything worn with it,',
  'hangers, or the background. Be specific but brief — "White oxford shirt",',
  'not "a white coloured button-up shirt made of cotton". Never guess a brand.',
].join(' ');

/**
 * Tag a garment from its photo.
 *
 * Throws `FoundationError`; callers should expect `insufficient_credits` and
 * `network_error` as ordinary outcomes rather than faults.
 */
export async function tagGarment(base64: string, mediaType = 'image/jpeg'): Promise<TaggedGarment> {
  const api = foundation();
  if (!api) throw new FoundationError('invalid_request', 'Auto-tagging is not configured');

  const raw = await api.runJson<Record<string, unknown>>('wearwell.tag_garment', {
    system: SYSTEM,
    text: 'Tag this garment.',
    image: { base64, mediaType },
    jsonSchema: GARMENT_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
  });

  return sanitize(raw);
}

/** Title and sentence for an alert, rather than a raw error. */
export function describeFailure(error: unknown): { title: string; message: string } {
  return { title: failureTitle(error), message: failureMessage(error) };
}

function failureTitle(error: unknown): string {
  if (error instanceof FoundationError && error.code === 'insufficient_credits') {
    return 'Out of credits';
  }
  if (error instanceof FoundationError && (error.code === 'network_error' || error.code === 'timeout')) {
    return 'No connection';
  }
  return 'Couldn’t read that photo';
}

function failureMessage(error: unknown): string {
  if (error instanceof FoundationError) {
    switch (error.code) {
      case 'insufficient_credits':
        return 'You’re out of tagging credits for now. Fill the details in by hand.';
      case 'network_error':
      case 'timeout':
        return 'Couldn’t reach the tagging service. Check your connection and try again.';
      case 'provider_error':
        return 'The tagging service had a problem. Try again in a moment.';
      case 'bad_response':
        return 'The tags came back garbled. Try again, or fill them in by hand.';
      default:
        return 'Auto-tagging isn’t available right now. Fill the details in by hand.';
    }
  }
  return 'Something went wrong while tagging. Fill the details in by hand.';
}
