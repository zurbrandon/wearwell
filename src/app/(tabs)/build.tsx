import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ItemImage } from '@/components/item-image';
import { SwipeDeck, type SwipeAction } from '@/components/swipe-deck';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing, TabBarHeight, Type } from '@/constants/theme';
import { benchItem, getItem, listItems } from '@/db/items';
import { activeOutfitItemIds, createOutfit } from '@/db/outfits';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { rankCandidates } from '@/lib/pairing';
import {
  CATEGORY_LABEL,
  OPTIONAL_SLOTS,
  SLOT_LABEL,
  SLOT_ORDER,
  SLOT_SHORT_LABEL,
  SLOT_SKIP_LABEL,
  SLOT_SYMBOL,
  categoriesForSlot,
  coversSlots,
  slotPrompt,
  type Slot,
} from '@/lib/taxonomy';
import type { Item } from '@/lib/types';

type Pick = { slot: Slot; item: Item };

/**
 * Vertical air inside the deck stage. `onLayout` reports the border box, so
 * the card's height budget has to subtract this or the card ends up taller
 * than the space it sits in and spills onto the controls below.
 */
const STAGE_PADDING = Spacing.three;

/** Which slot filters the step-one deck, when the closet holds one-pieces. */
type TopScope = 'all' | 'top' | 'onepiece';

/** Every slot the current picks account for, one-piece coverage included. */
function coveredSlots(picks: Pick[]): Set<Slot> {
  return new Set(picks.flatMap((pick) => coversSlots(pick.item.category)));
}

/** The pick occupying a slot, whether placed there or covering it. */
function pickForSlot(picks: Pick[], slot: Slot): Pick | undefined {
  return picks.find((pick) => coversSlots(pick.item.category).includes(slot));
}

/** Slots still to fill, given what's already picked. */
function remainingSlots(picks: Pick[]): Slot[] {
  const filled = coveredSlots(picks);
  return SLOT_ORDER.filter((slot) => !filled.has(slot));
}

/**
 * One cell of the slot track. A one-piece merges the top and bottom cells into
 * a single wide one, so the collapse is visible rather than leaving the bottom
 * looking mysteriously satisfied.
 */
type TrackCell = { slots: Slot[]; pick?: Pick };

function trackCells(picks: Pick[]): TrackCell[] {
  const cells: TrackCell[] = [];

  for (const slot of SLOT_ORDER) {
    const pick = pickForSlot(picks, slot);
    const previous = cells[cells.length - 1];

    if (pick && previous?.pick === pick) {
      previous.slots.push(slot);
      continue;
    }
    cells.push({ slots: [slot], pick });
  }

  return cells;
}

export default function BuildScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [picks, setPicks] = useState<Pick[]>([]);
  const [skipped, setSkipped] = useState<Slot[]>([]);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  /** Set when a slot is reopened from the track, overriding the normal order. */
  const [focused, setFocused] = useState<Slot | null>(null);
  const [topScope, setTopScope] = useState<TopScope>('all');

  /**
   * "Start an outfit" from a piece arrives as `start=<itemId>:<nonce>`. The
   * nonce makes each tap a distinct value, so starting from the same piece
   * twice seeds twice — a bare id would look unchanged the second time.
   */
  const { start } = useLocalSearchParams<{ start?: string }>();
  const startItemId = start?.split(':')[0] || null;
  const { data: startItem } = useQuery(
    (d) => (startItemId ? getItem(d, startItemId) : Promise.resolve(null)),
    null as Item | null,
    [startItemId]
  );
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  // Adjusting state during render rather than in an effect: this is the
  // documented way to react to a changed prop, and it seeds before the first
  // paint so the deck never flashes an unseeded state.
  if (start && startItem && seededFrom !== start) {
    setSeededFrom(start);
    setPicks([{ slot: coversSlots(startItem.category)[0], item: startItem }]);
    setSkipped([]);
    setPassedIds([]);
    setFocused(null);
    setTopScope('all');
  }
  const [seed, setSeed] = useState(1);
  const [saving, setSaving] = useState(false);

  const { data: wardrobe } = useQuery((d) => listItems(d, { bench: 'active' }), [] as Item[]);
  const { data: usedIds } = useQuery((d) => activeOutfitItemIds(d), new Set<string>());

  const pending = remainingSlots(picks).filter((s) => !skipped.includes(s));
  // A reopened slot wins over the natural order, so you can go back and change
  // one thing without unwinding everything after it.
  const slot: Slot | null = focused ?? pending[0] ?? null;

  const hasOnePieces = wardrobe.some((item) => item.category === 'onepiece');
  const scopeApplies = slot === 'top' && hasOnePieces;

  const orderedPicks = useMemo(
    () => [...picks].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)),
    [picks]
  );
  const pickedItems = useMemo(() => picks.map((p) => p.item), [picks]);
  const pickedIds = useMemo(() => new Set(picks.map((p) => p.item.id)), [picks]);

  const cards = useMemo(() => {
    if (!slot) return [];
    const allowed = new Set(
      slot === 'top' && topScope !== 'all' ? [topScope] : categoriesForSlot(slot)
    );
    const candidates = wardrobe.filter(
      (item) => allowed.has(item.category) && !pickedIds.has(item.id) && !passedIds.includes(item.id)
    );
    return rankCandidates(candidates, pickedItems, { usedItemIds: usedIds, seed });
  }, [slot, topScope, wardrobe, pickedIds, passedIds, pickedItems, usedIds, seed]);

  const [stage, setStage] = useState({ width: 0, height: 0 });
  const cardWidth = Math.min(stage.width - Spacing.four * 2, 460);
  const cardHeight = Math.min(cardWidth * 1.45, stage.height - STAGE_PADDING * 2);

  const covered = coveredSlots(picks);
  const essentialsMet = covered.has('top') && covered.has('bottom');

  const handleAction = useCallback(
    (action: SwipeAction, card: { item: Item }) => {
      if (!slot) return;

      if (action === 'pick') {
        const claims = coversSlots(card.item.category);
        setPicks((current) => [
          // A garment evicts whatever it now covers. Without this, choosing a
          // dress after trousers leaves both in the outfit and silently jumps
          // the step order, because the trousers still satisfy the bottom slot.
          ...current.filter(
            (pick) => !coversSlots(pick.item.category).some((covered) => claims.includes(covered))
          ),
          { slot, item: card.item },
        ]);
        setPassedIds([]);
        setFocused(null);
        return;
      }

      if (action === 'pass') {
        setPassedIds((current) => [...current, card.item.id]);
        return;
      }

      // Bench: out of rotation until explicitly brought back.
      setPassedIds((current) => [...current, card.item.id]);
      benchItem(db, card.item.id, null);
    },
    [db, slot]
  );

  /**
   * Reopen a slot from the track: drop whatever was covering it and deck it
   * again, leaving every other pick alone. Tapping the merged cell of a
   * one-piece drops the dress and puts you back on the separates path.
   */
  function reopen(cell: TrackCell) {
    const target = cell.slots[0];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (cell.pick) {
      const dropped = cell.pick;
      setPicks((current) => current.filter((pick) => pick !== dropped));
    }

    setSkipped((current) => current.filter((s) => !cell.slots.includes(s)));
    setPassedIds([]);
    setFocused(target);
  }

  function skip(target: Slot) {
    setSkipped((current) => [...current, target]);
    setFocused(null);
  }

  function undo() {
    setFocused(null);

    if (picks.length) {
      setPicks((current) => current.slice(0, -1));
      setPassedIds([]);
      setSkipped([]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (skipped.length) setSkipped((current) => current.slice(0, -1));
  }

  function reset() {
    setPicks([]);
    setSkipped([]);
    setPassedIds([]);
    setFocused(null);
    setTopScope('all');
    setSeed((s) => s + 1);
  }

  async function save() {
    if (!picks.length) return;
    setSaving(true);
    try {
      await createOutfit(
        db,
        orderedPicks.map((p) => ({ slot: p.slot, itemId: p.item.id }))
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
    } catch (error) {
      Alert.alert('Could not save outfit', String((error as Error).message ?? error));
    } finally {
      setSaving(false);
    }
  }

  if (!wardrobe.length) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <EmptyState
          icon="wand.and.stars"
          title="Nothing to work with yet"
          body="Add a few pieces to your closet and the builder will start pairing them up."
          actionLabel="Add a piece"
          onAction={() => router.push('/item/new')}
        />
      </View>
    );
  }

  const done = slot === null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.eyebrow, { color: theme.accent }]}>
            {done ? 'OUTFIT READY' : `STEP ${picks.length + skipped.length + 1}`}
          </ThemedText>
          <ThemedText style={styles.title}>
            {done ? 'Looking good' : slotPrompt(slot, hasOnePieces)}
          </ThemedText>
        </View>

        {picks.length || skipped.length ? (
          <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel="Undo last step">
            <View style={[styles.iconButton, { borderColor: theme.border }]}>
              <Icon name="arrow.uturn.backward" size={16} color={theme.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <SlotTrack picks={picks} skipped={skipped} current={slot} onReopen={reopen} />

      {scopeApplies ? (
        <View style={styles.scopeRow}>
          {(['all', 'top', 'onepiece'] as TopScope[]).map((scope) => (
            <Chip
              key={scope}
              size="sm"
              label={scope === 'all' ? 'All' : scope === 'top' ? 'Tops' : 'Dresses'}
              selected={topScope === scope}
              onPress={() => {
                setTopScope(scope);
                setPassedIds([]);
              }}
            />
          ))}
        </View>
      ) : null}

      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setStage((current) =>
            current.width === w && current.height === h ? current : { width: w, height: h }
          );
        }}>
        {done ? (
          <OutfitSummary picks={orderedPicks} width={cardWidth} />
        ) : (
          <SwipeDeck
            cards={cards}
            width={cardWidth}
            height={cardHeight}
            showMatch={picks.length > 0}
            onAction={handleAction}
            empty={
              <View style={[styles.exhausted, { borderColor: theme.border }]}>
                <Icon name={SLOT_SYMBOL[slot]} size={26} color={theme.textTertiary} />
                <ThemedText style={{ fontWeight: '600', fontSize: 17, lineHeight: 22 }}>
                  Out of {SLOT_LABEL[slot].toLowerCase()} options
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {"You've seen everything that fits. Skip this slot, or start the pass again."}
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <Button
                    label="Skip"
                    variant="secondary"
                    size="sm"
                    onPress={() => skip(slot)}
                  />
                  <Button label="Show all again" size="sm" onPress={() => setPassedIds([])} />
                </View>
              </View>
            }
          />
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + TabBarHeight - Spacing.four }]}>
        {done ? (
          <View style={{ gap: Spacing.two }}>
            <Button
              label="Save this outfit"
              icon="checkmark"
              size="lg"
              fullWidth
              loading={saving}
              onPress={save}
            />
            <Button label="Start over" variant="ghost" fullWidth onPress={reset} />
          </View>
        ) : (
          <>
            <View style={styles.hintRow}>
              <Hint icon="arrow.left" label="Pass" />
              <Hint icon="arrow.down" label="Bench" />
              <Hint icon="arrow.right" label="Pick" />
            </View>

            {/* Only take up room when there's actually something in it — an
                empty row still reserved its height, stealing it from the deck. */}
            {OPTIONAL_SLOTS.has(slot) || essentialsMet ? (
              <View style={styles.actionRow}>
                {OPTIONAL_SLOTS.has(slot) ? (
                  <Button
                    label={SLOT_SKIP_LABEL[slot]}
                    variant="secondary"
                    size="sm"
                    onPress={() => skip(slot)}
                  />
                ) : (
                  <View />
                )}

                {essentialsMet ? (
                  <Button label="Save outfit" size="sm" loading={saving} onPress={save} />
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function Hint({ icon, label }: { icon: SFSymbol; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.hint}>
      <Icon name={icon} size={13} color={theme.textTertiary} />
      <ThemedText type="small" themeColor="textTertiary" style={{ fontSize: 12 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function SlotTrack({
  picks,
  skipped,
  current,
  onReopen,
}: {
  picks: Pick[];
  skipped: Slot[];
  current: Slot | null;
  onReopen: (cell: TrackCell) => void;
}) {
  const theme = useTheme();
  const cells = trackCells(picks);

  return (
    <View style={styles.track}>
      {cells.map((cell) => {
        const item = cell.pick?.item;
        const isSkipped = cell.slots.every((slot) => skipped.includes(slot));
        const isCurrent = current !== null && cell.slots.includes(current);
        // A merged cell is one garment doing two jobs, so it names the garment
        // rather than the slots it happens to cover.
        const label =
          cell.slots.length > 1
            ? (item?.subcategory ?? CATEGORY_LABEL.onepiece)
            : SLOT_SHORT_LABEL[cell.slots[0]];

        return (
          <Pressable
            key={cell.slots.join('+')}
            onPress={() => onReopen(cell)}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
            accessibilityLabel={
              item ? `Change ${label.toLowerCase()}: ${item.name}` : `Go to ${label.toLowerCase()}`
            }
            style={({ pressed }) => [
              styles.trackCell,
              // Width tracks how many slots the garment covers.
              { flex: cell.slots.length, opacity: pressed ? 0.6 : 1 },
            ]}>
            <View
              style={[
                styles.trackThumb,
                {
                  borderColor: isCurrent ? theme.accent : theme.border,
                  backgroundColor: theme.backgroundElement,
                  borderWidth: isCurrent ? 2 : StyleSheet.hairlineWidth,
                  opacity: isSkipped ? 0.35 : 1,
                  // A one-piece's thumbnail stretches across both its slots.
                  width: cell.slots.length > 1 ? undefined : 42,
                  alignSelf: cell.slots.length > 1 ? 'stretch' : 'center',
                },
              ]}>
              {item ? (
                // Pops in as the swipe lands, tying the result back to the gesture.
                <Animated.View
                  key={item.id}
                  entering={ZoomIn.springify().damping(14).stiffness(260)}
                  style={StyleSheet.absoluteFill}>
                  <ItemImage item={item} radius={Radius.sm - 2} />
                </Animated.View>
              ) : (
                <Icon
                  name={SLOT_SYMBOL[cell.slots[0]]}
                  size={15}
                  color={isCurrent ? theme.accent : theme.textTertiary}
                />
              )}
            </View>
            <ThemedText
              numberOfLines={1}
              style={[styles.trackLabel, { color: isCurrent ? theme.accent : theme.textTertiary }]}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function OutfitSummary({ picks, width }: { picks: Pick[]; width: number }) {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ gap: Spacing.three, paddingVertical: Spacing.two }}
      showsVerticalScrollIndicator={false}>
      {picks.map(({ slot, item }) => (
        <View
          key={item.id}
          style={[
            styles.summaryRow,
            { width, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <View style={styles.summaryThumb}>
            <ItemImage item={item} radius={Radius.sm} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="small" themeColor="textTertiary" style={styles.eyebrow}>
              {SLOT_LABEL[slot]}
            </ThemedText>
            <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {[item.brand, item.subcategory].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  eyebrow: { ...Type.eyebrow, textTransform: 'uppercase' },
  title: Type.title,
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  trackCell: { alignItems: 'center', gap: Spacing.one, flex: 1 },
  trackThumb: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackLabel: { ...Type.label, textTransform: 'uppercase', textAlign: 'center' },
  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: STAGE_PADDING },
  exhausted: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  controls: { paddingHorizontal: Spacing.four, gap: Spacing.three, paddingTop: Spacing.four },
  // (bottom padding is applied inline from the safe-area inset)
  hintRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.five },
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 34,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryThumb: { width: 56, height: 72, borderRadius: Radius.sm, overflow: 'hidden' },
});
