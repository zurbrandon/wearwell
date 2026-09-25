import { hexToHsl, hueDistance } from '@/lib/color';
import { colorHex, isNeutral } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';

/**
 * Scores how well a candidate item sits alongside the items already picked.
 *
 * This is deliberately a pure function over `(candidate, context)` returning a
 * score and human-readable reasons — the same shape a model-backed scorer would
 * have. Swapping in an AI suggester later means replacing `scorePairing` (or
 * blending its output), not rewriting the builder.
 */

export type PairingScore = {
  score: number; // 0–1
  reasons: string[]; // why it works
  cautions: string[]; // why it might not
};

const WEIGHTS = { formality: 0.3, color: 0.3, pattern: 0.2, season: 0.2 };

/** Patterns that read as quiet enough to mix with another pattern. */
const QUIET_PATTERNS = new Set(['solid', 'denim', 'texture']);

function scoreFormality(candidate: Item, context: Item[]) {
  if (!context.length) return { value: 1, reason: null, caution: null };

  const worst = Math.max(...context.map((i) => Math.abs(i.formality - candidate.formality)));
  const value = Math.max(0, 1 - worst / 3);

  if (worst === 0) return { value, reason: 'Same register', caution: null };
  if (worst >= 2) return { value, caution: 'Mixed formality', reason: null };
  return { value, reason: null, caution: null };
}

function scoreColor(candidate: Item, context: Item[]) {
  if (!context.length) return { value: 1, reason: null, caution: null };

  const candidateLoud = candidate.colors.filter((c) => !isNeutral(c));
  const loudContext = context.filter((i) => i.colors.some((c) => !isNeutral(c)));

  if (!candidateLoud.length && !loudContext.length) {
    return { value: 0.95, reason: 'All neutrals', caution: null };
  }

  if (!candidateLoud.length || !loudContext.length) {
    return { value: 0.92, reason: 'Neutral base', caution: null };
  }

  // Judge the candidate against each coloured item separately and keep the
  // WORST of those verdicts — clashing with the trousers still reads as a clash
  // however well the jacket works. Within a single garment, though, take the
  // best pairing: a two-colour piece only needs one of them to relate.
  let worst = 1;
  let worstLabel: string | null = null;
  let bestLabel: string | null = null;
  let best = 0;

  for (const other of loudContext) {
    let pairBest = 0;
    let pairLabel = '';

    for (const a of candidateLoud) {
      for (const b of other.colors.filter((c) => !isNeutral(c))) {
        let value: number;
        let label: string;

        if (a.toLowerCase() === b.toLowerCase()) {
          value = 0.72;
          label = `Tonal ${a.toLowerCase()}`;
        } else {
          const d = hueDistance(hexToHsl(colorHex(a)).h, hexToHsl(colorHex(b)).h);
          if (d < 35) {
            value = 0.85;
            label = 'Analogous colors';
          } else if (d < 80) {
            value = 0.42;
            label = 'Colors fight a little';
          } else if (d < 145) {
            value = 0.62;
            label = 'Split contrast';
          } else {
            value = 0.9;
            label = 'Complementary colors';
          }
        }

        if (value > pairBest) {
          pairBest = value;
          pairLabel = label;
        }
      }
    }

    if (pairBest < worst) {
      worst = pairBest;
      worstLabel = pairLabel;
    }
    if (pairBest > best) {
      best = pairBest;
      bestLabel = pairLabel;
    }
  }

  const positive = worst >= 0.8;
  return {
    value: worst,
    reason: positive ? bestLabel : null,
    caution: positive || worst >= 0.7 ? null : worstLabel,
  };
}

function scorePattern(candidate: Item, context: Item[]) {
  const busy = context.filter((i) => !QUIET_PATTERNS.has(i.pattern));
  const candidateBusy = !QUIET_PATTERNS.has(candidate.pattern);

  if (candidateBusy && busy.length) {
    return { value: 0.3, reason: null, caution: 'Pattern on pattern' };
  }
  if (candidateBusy || busy.length) {
    return { value: 1, reason: candidateBusy ? 'Adds a pattern' : null, caution: null };
  }
  return { value: 0.9, reason: null, caution: null };
}

function scoreSeason(candidate: Item, context: Item[]) {
  if (!candidate.seasons.length || !context.length) return { value: 0.85, reason: null, caution: null };

  const contextSeasons = new Set(context.flatMap((i) => i.seasons));
  if (!contextSeasons.size) return { value: 0.85, reason: null, caution: null };

  const shared = candidate.seasons.filter((s) => contextSeasons.has(s));
  if (!shared.length) return { value: 0.35, reason: null, caution: 'Different season' };

  const value = 0.7 + 0.3 * (shared.length / Math.max(candidate.seasons.length, 1));
  return { value, reason: shared.length >= 2 ? null : `Good for ${shared[0]}`, caution: null };
}

export function scorePairing(candidate: Item, context: Item[]): PairingScore {
  const parts = {
    formality: scoreFormality(candidate, context),
    color: scoreColor(candidate, context),
    pattern: scorePattern(candidate, context),
    season: scoreSeason(candidate, context),
  };

  const score = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
    (total, key) => total + WEIGHTS[key] * parts[key].value,
    0
  );

  const reasons = Object.values(parts)
    .map((p) => p.reason)
    .filter((r): r is string => !!r);
  const cautions = Object.values(parts)
    .map((p) => p.caution)
    .filter((c): c is string => !!c);

  return { score, reasons, cautions };
}

export type RankedItem = { item: Item; pairing: PairingScore };

export type RankOptions = {
  /** Items already used elsewhere in the working set — nudged down for variety. */
  usedItemIds?: ReadonlySet<string>;
  /** 0 keeps the order strictly by score; higher mixes the deck up. */
  jitter?: number;
  seed?: number;
};

/** Deterministic 0–1 noise, so a given seed always deals the same deck. */
function noise(seed: number, n: number): number {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function rankCandidates(
  candidates: Item[],
  context: Item[],
  options: RankOptions = {}
): RankedItem[] {
  const { usedItemIds, jitter = 0.08, seed = 1 } = options;

  return candidates
    .map((item, index) => {
      const pairing = scorePairing(item, context);
      let sort = pairing.score;

      if (usedItemIds?.has(item.id)) sort -= 0.12;
      // Favour things that haven't been worn much lately.
      if (item.lastWornAt && Date.now() - item.lastWornAt < 7 * 864e5) sort -= 0.05;
      sort += (noise(seed, index) - 0.5) * jitter;

      return { item, pairing, sort };
    })
    .sort((a, b) => b.sort - a.sort)
    .map(({ item, pairing }) => ({ item, pairing }));
}

export function scoreLabel(score: number): string {
  if (score >= 0.85) return 'Strong match';
  if (score >= 0.7) return 'Works';
  if (score >= 0.55) return 'A stretch';
  return 'Clashes';
}
