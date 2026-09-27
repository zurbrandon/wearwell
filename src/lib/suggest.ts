import { scorePairing } from '@/lib/pairing';
import { coversSlots, type Season, type Slot } from '@/lib/taxonomy';
import { isBenched, type Item, type Outfit } from '@/lib/types';

/**
 * A proposed outfit that isn't in the capsule yet.
 *
 * `id` is derived from the item ids, so the same combination always produces
 * the same signature — which is what makes dismissals stick across sessions.
 */
export type Suggestion = {
  id: string;
  entries: { slot: Slot; item: Item }[];
  score: number;
  reasons: string[];
  /** Ids of pieces already committed to the capsule that this reuses. */
  reused: string[];
};

export function signatureOf(itemIds: string[]): string {
  return [...itemIds].sort().join('+');
}

/** How many partial combinations survive each stage of the search. */
const BEAM = 40;
/** Cap the pools so a very large closet can't blow up the first stage. */
const POOL = 30;

/**
 * Reusing shoes or a coat you're already packing is worth more than a
 * marginally better colour match, because the point of a capsule is fewer
 * bulky items carried, not more.
 *
 * It's a tiebreaker, never a rescue: below `REUSE_FLOOR` the pairing is bad
 * enough that carrying one less pair of shoes doesn't redeem it.
 */
const REUSE_BONUS = 0.18;
const REUSE_FLOOR = 0.55;

/**
 * Seasons are a hard constraint here, not a scoring term.
 *
 * As one dimension among four it only moves the total by about a tenth, which
 * the reuse bonus then cancels out — enough to suggest summer shorts with
 * winter boots. For a capsule that's plainly wrong: you are packing for one
 * climate, so a piece with no season in common with the rest is out.
 */
function seasonsAgree(item: Item, context: Item[], climate: ReadonlySet<Season>): boolean {
  if (!item.seasons.length) return true;

  // Once a capsule has a climate that is the authority, and a piece being
  // chosen against it cannot widen it. Unioning the two lets a spring/summer
  // tee readmit summer and take the shorts with it, which is exactly the
  // suggestion the climate exists to prevent. Only an empty capsule falls back
  // to keeping the combination internally coherent.
  const inPlay = climate.size
    ? climate
    : new Set<Season>(context.flatMap((other) => other.seasons));

  if (!inPlay.size) return true;
  return item.seasons.some((season) => inPlay.has(season));
}

/**
 * What the capsule is actually dressed for, taken from the outfits in it.
 *
 * Without this a suggestion only has to be coherent with *itself*, so a capsule
 * called "NYC – Fall" happily proposes summer shorts with sneakers: a perfectly
 * sensible outfit for the wrong trip. The capsule's own pieces are the only
 * statement of intent available, so they set the climate.
 *
 * Deliberately the *dominant* seasons, not the union. A union widens to cover
 * everything the moment one piece happens to span summer — a single spring/
 * summer tee would readmit shorts to a winter trip. Anything appearing in at
 * least half as many pieces as the most common season counts as intended;
 * the rest is noise from pieces that merely tolerate a season.
 */
function climateOf(existing: Outfit[]): Set<Season> {
  const counts = new Map<Season, number>();
  const seen = new Set<string>();

  for (const outfit of existing) {
    for (const { item } of outfit.entries) {
      // An item in two outfits shouldn't count twice.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      for (const season of item.seasons) counts.set(season, (counts.get(season) ?? 0) + 1);
    }
  }

  if (!counts.size) return new Set();

  const peak = Math.max(...counts.values());
  const threshold = peak / 2;
  return new Set([...counts.entries()].filter(([, n]) => n >= threshold).map(([season]) => season));
}

type Partial = {
  entries: { slot: Slot; item: Item }[];
  /** Running mean of each piece's pairing score against the pieces before it. */
  total: number;
  steps: number;
  reasons: string[];
  reused: string[];
};

function extend(
  base: Partial,
  item: Item,
  slot: Slot,
  committed: ReadonlySet<string>,
  climate: ReadonlySet<Season>
): Partial | null {
  const context = base.entries.map((e) => e.item);
  if (!seasonsAgree(item, context, climate)) return null;

  const pairing = scorePairing(item, context);
  const reuse = committed.has(item.id) && pairing.score >= REUSE_FLOOR ? REUSE_BONUS : 0;

  return {
    entries: [...base.entries, { slot, item }],
    total: base.total + pairing.score + reuse,
    steps: base.steps + 1,
    reasons: [...base.reasons, ...pairing.reasons],
    reused: reuse ? [...base.reused, item.id] : base.reused,
  };
}

function best(partials: Partial[], limit: number): Partial[] {
  return [...partials].sort((a, b) => b.total / b.steps - a.total / a.steps).slice(0, limit);
}

function poolFor(wardrobe: Item[], predicate: (item: Item) => boolean): Item[] {
  return wardrobe.filter(predicate).slice(0, POOL);
}

export type SuggestOptions = {
  wardrobe: Item[];
  /** Outfits already in the capsule — their pieces are the ones worth reusing. */
  existing: Outfit[];
  /** Signatures the user has already thrown away. */
  dismissed: readonly string[];
  count?: number;
};

/**
 * Proposes outfits for a capsule, built where possible around the shoes and
 * outerwear already committed to it.
 *
 * A beam search rather than a full enumeration: score every top/bottom pair,
 * keep the best handful, extend those with shoes, keep the best again, and so
 * on. That turns a combinatorial blow-up into a few thousand cheap arithmetic
 * operations, which is fast enough to run on every render.
 */
export function suggestOutfits({
  wardrobe,
  existing,
  dismissed,
  count = 3,
}: SuggestOptions): Suggestion[] {
  const active = wardrobe.filter((item) => !isBenched(item));

  // The bulky things you've already decided to bring.
  const committed = new Set<string>();
  for (const outfit of existing) {
    for (const entry of outfit.entries) {
      if (entry.slot === 'shoes' || entry.slot === 'outerwear') committed.add(entry.item.id);
    }
  }

  const taken = new Set(existing.map((o) => signatureOf(o.entries.map((e) => e.item.id))));
  const skip = new Set([...taken, ...dismissed]);

  const climate = climateOf(existing);

  const tops = poolFor(
    active,
    (i) => (i.category === 'top' || i.category === 'onepiece') && seasonsAgree(i, [], climate)
  );
  const bottoms = poolFor(active, (i) => i.category === 'bottom');
  const shoes = poolFor(active, (i) => i.category === 'shoes');
  const outerwear = poolFor(active, (i) => i.category === 'outerwear');

  if (!tops.length || !shoes.length) return [];

  // Stage 1 — torso, and legs unless the top is a one-piece.
  let partials: Partial[] = [];
  for (const top of tops) {
    const seed: Partial = {
      entries: [{ slot: 'top', item: top }],
      total: 0,
      steps: 0,
      reasons: [],
      reused: [],
    };

    if (coversSlots(top.category).includes('bottom')) {
      partials.push({ ...seed, total: 0.9, steps: 1 });
      continue;
    }
    for (const bottom of bottoms) {
      const next = extend(seed, bottom, 'bottom', committed, climate);
      if (next) partials.push(next);
    }
  }
  partials = best(partials, BEAM);

  // Stage 2 — shoes, where reuse matters most.
  partials = best(
    partials.flatMap((p) =>
      shoes.map((shoe) => extend(p, shoe, 'shoes', committed, climate)).filter((x): x is Partial => !!x)
    ),
    BEAM
  );
  if (!partials.length) return [];

  // Stage 3 — outerwear is optional, so "none" competes on equal terms.
  if (outerwear.length) {
    partials = best(
      partials.flatMap((p) => [
        p,
        ...outerwear
          .map((coat) => extend(p, coat, 'outerwear', committed, climate))
          .filter((x): x is Partial => !!x),
      ]),
      BEAM
    );
  }

  const suggestions: Suggestion[] = [];
  const usedTops = new Set<string>();

  // Two passes so variety wins first, but a short list still fills up.
  for (const pass of [0, 1]) {
    for (const partial of partials) {
      if (suggestions.length >= count) break;

      const ids = partial.entries.map((e) => e.item.id);
      const id = signatureOf(ids);
      if (skip.has(id) || suggestions.some((s) => s.id === id)) continue;

      const topId = partial.entries[0].item.id;
      if (pass === 0 && usedTops.has(topId)) continue;
      usedTops.add(topId);

      suggestions.push({
        id,
        entries: partial.entries,
        score: partial.total / Math.max(partial.steps, 1),
        reasons: [...new Set(partial.reasons)].slice(0, 2),
        reused: partial.reused,
      });
    }
  }

  return suggestions;
}
