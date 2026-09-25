# Wearwell

A digital closet for iOS. Photograph and tag what you own, then build outfits by
swiping through your own wardrobe. Everything lives on the device — there is no
account, no server, and no network dependency.

## Running it

```bash
npm install
npx expo start --go
```

Then press `i`, or open `exp://127.0.0.1:8081` in the iOS Simulator. Everything
in this app is covered by Expo Go's bundled modules, so no native build is
needed for day-to-day work.

If port 8081 is taken, pass `--port 8082` — without it the CLI stops to ask,
and in a non-interactive shell it exits instead.

Tap **Load sample closet** on the empty Closet screen (debug builds only) to
populate 24 pieces and try the builder immediately. After that, the **+** in the
Closet header adds pieces one at a time.

The sample pieces carry Unsplash stock photos. Items are written first and the
photos fetched afterwards, so the grid fills instantly and each tile picks up
its image as it lands — the database change listener drives that refresh. Seeding
therefore needs network once; the files are stored locally and work offline from
then on. The same `downloadImage` helper in `src/lib/photos.ts` is what receipt
import will use for product images.

### The native build is currently blocked

`npx expo run:ios` does **not** work on this machine, and it isn't the app's
code. The installed Xcode is 26.3; the latest stable Expo SDK is 57, and its
`expo-modules-jsi` package does not compile against that toolchain:

1. `RuntimeScheduler.h` annotates two constructors with `SWIFT_RETURNS_RETAINED`,
   which Xcode 26.3's Swift C++ interop rejects.
2. Removing that surfaces 14 `sending 'X' risks causing data races` errors in
   `JavaScriptRuntime.swift` — Swift 6.2 tightened region-based isolation.
3. Dropping the package to Swift language mode 5 clears those but breaks its
   bare-slash regex literals and an actor-isolated initializer.

Each fix uncovers the next, all inside a dependency, so no patch was kept — the
tree is clean. SDK 58 ships the same header, and `expo@58` is preview-only
(`58.0.0-preview.6`). The options, in rough order of preference:

- **Stay on Expo Go** until Expo ships an SDK built against Xcode 26.x. Nothing
  here needs a custom native module, so this costs nothing today.
- **Install an older Xcode** alongside 26.3 and point builds at it with
  `DEVELOPER_DIR=/Applications/Xcode-16.app/Contents/Developer npx expo run:ios`.
  No `sudo` needed, and it does not disturb the default toolchain.
- **Move to the SDK 58 preview** (`npx expo install expo@next --fix`) once you
  want a dev build, accepting preview instability.

This matters only when you need a custom native module or a TestFlight build.

> **CocoaPods and locale.** If you do run a native build, `pod install` fails
> here with `Unicode Normalization not appropriate for ASCII-8BIT` unless a
> UTF-8 locale is set: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`.

## How it fits together

```
src/
  app/                 Routes (expo-router)
    (tabs)/            Closet · Build · Outfits
    item/              new + detail/edit
    outfit/            outfit detail
  db/                  SQLite: schema/migrations, row mapping, queries
  lib/
    taxonomy.ts        Slots, categories, colors, patterns, seasons
    pairing.ts         Outfit compatibility scoring
    photos.ts          Capture, downscale, and store images
    ingest/            Receipt-import sink (see Roadmap)
  components/          UI, including the swipe deck
  hooks/use-query.ts   Reactive reads over SQLite
```

### Data

`expo-sqlite`, opened once by `SQLiteProvider` in the root layout and migrated
on start via `PRAGMA user_version` (`src/db/schema.ts`). Three tables: `items`,
`outfits`, `outfit_items`.

The provider enables SQLite's update hook, and `useQuery` subscribes to it — a
write on any screen refreshes every list reading that data, so there is no
manual cache invalidation anywhere.

**Images are stored as relative paths**, not `file://` URIs. On iOS the app
container UUID changes between installs, so an absolute path goes stale and
every photo silently disappears. `resolveImageUri()` rebuilds the absolute URI
at render time.

### One-pieces, and why top/bottom aren't a fixed sequence

A dress or jumpsuit covers the torso and legs in one garment, so the builder
can't treat its slots as a constant list. The model is that **covering torso
and legs is one decision with two shapes** — separates take two picks, a
one-piece takes one — and the step sequence follows from which shape you chose.

`coversSlots()` in `src/lib/taxonomy.ts` is the single definition of that rule.
Nothing else should test for `onepiece` inline; `coveredSlots`, `pickForSlot`
and `remainingSlots` in the builder all derive from it.

In the UI that means:

- Step one is titled **"Pick a top or dress"**, but only when the closet
  actually holds a one-piece — otherwise offering a dress you don't own is noise.
- That step carries an **All / Tops / Dresses** scope toggle, so wanting a dress
  is one tap rather than swiping past every shirt you own.
- A one-piece **merges the top and bottom cells of the slot track** into one
  double-width cell showing the garment. Previously the bottom cell just turned
  green with no explanation, which read as a bug.

A pick **evicts whatever it now covers**. Choosing a dress after trousers drops
the trousers rather than leaving both in the outfit — without that, the bottom
slot stayed satisfied by the orphaned trousers and the builder silently jumped
past the next step, which looked like it was skipping slots.

### Reopening a slot

The track is tappable. Tapping any cell drops whatever filled it and decks that
slot again, **leaving every other pick alone** — so you can swap the shoes
without losing the jacket. Tapping a one-piece's merged cell drops the dress and
returns you to the top-or-dress decision, which is how you get back to the
separates path.

Skipping a slot clears the reopened-slot focus too, or the builder would keep
pointing at the slot you just skipped and refuse to move on.

Picks are stored in the order they were made and sorted into `SLOT_ORDER` for
display and saving, so an outfit always reads top-down however you assembled it.

### Adding a piece

Hitting **+** opens the viewfinder, not a form. Cataloguing a wardrobe means
doing this dozens of times and nearly every piece wants a photo, so the photo is
the default path and "no photo" is the detour. From the camera you can shoot,
switch to the library (bottom-left), or **Skip** straight to the form.

**The camera and the form are one screen**, switched by a `mode` rather than
being two routes. They were briefly separate, with a `router.replace` between
them — but the two had different presentations (full-screen modal vs sheet), and
swapping one for the other made the native stack rebuild and drop the screen
underneath. Cancelling the form then dispatched a `GO_BACK` with nothing to go
back to. Two steps of one task belong in one stack entry.

`close()` also guards with `router.canGoBack()`, so no dismissal can ever
dispatch a back against an empty stack.

The item id is minted before the camera opens, so the photo is named for the
item it will become.

**Orphan images are swept on launch.** Capture-first writes the photo before the
item exists, so cancelling the form — or swiping the sheet away, or crashing —
would leave the file behind. `sweep()` in `src/db/schema.ts` runs after
migrations and deletes any stored image no item points at, which also cleans up
after a failed delete. It's wrapped so housekeeping can never stop the app
starting.

### Benching

"Stop showing me this" is a bench, not a delete. `benched_at` records when, and
`benched_until` how long — `NULL` means indefinitely, until you bring it back.
Benched pieces drop out of the builder and sit on their own shelf in the Closet.

### Collections and capsules

The Outfits tab is a **library of collections**, the same shape as a music
library: collections are the primary object, and the built-in ones sit
alongside the ones you made. There is no separate capsules tab — you open a
collection to see the outfits in it.

Three collections are built in and **derived rather than stored**
(`src/lib/collections.ts`):

- **All outfits** — the working queue. `Clear` lives here, since that's what it
  acts on.
- **Favorites** — backed by the heart on each outfit. Hearting anything files it
  automatically; there's no membership to keep in sync, because the collection
  *is* the query. This is why it can't be renamed or deleted, and why you add to
  it with the heart rather than an "add" button.
- **Archived** — the recovery view, hidden from the library while empty.

Everything else is a **capsule**: a named group of outfits for a trip, season or
occasion. Membership is many-to-many on purpose — a dressy look can sit in both
*Work* and *New York* without being duplicated.

One screen (`app/collection/[id].tsx`) renders all four kinds. The trailing
control on each outfit card states what that collection can do to the outfit:
heart it, un-heart it out of Favorites, restore it from Archived, or drop it
from a capsule.

The payoff is the **packing list**. A capsule's outfits imply a set of garments,
so the union of their items — deduped, grouped by category — is exactly what you
need to take. A shirt worn in three of the looks is packed once. That's computed
in SQL (`DISTINCT` across the capsule's `outfit_items`), not by hydrating every
outfit.

Capsules are filled in bulk, because that's how they're actually made: the
primary entry point is a multi-select picker from inside the capsule, offering
both current *and* archived outfits — something you cleared last month is still
fair game for a trip you're planning now. Adding one look at a time from the
outfit screen is there too, for the one-off case.

The packing list is **checkable**, and the ticks are stored per capsule rather
than per item — the same shirt can be packed for *New York* while still sitting
unpacked in *Work*. State is persisted (table `capsule_packed`) rather than held
in component state: packing happens across an evening, not in one sitting, so
losing it on a screen change would defeat the point. A **Reset** clears the
capsule's ticks for the next trip.

Note this borrows the word loosely: a *capsule wardrobe* classically means a
small set of interchangeable **garments**, not a set of outfits. The packing
list is the bridge back to that original sense.

### Clearing outfits

Clearing is non-destructive: outfits move to **Archived** rather than being
deleted. Favorites stay in the working set, and so does anything filed into a
capsule — clearing the queue must not gut a trip you've planned. The confirm
dialog asks the database what would actually move rather than counting the
visible list, so it never overstates. Deleting an outfit is a separate,
explicit action on the outfit itself.

### Pairing

`scorePairing(candidate, context)` returns a 0–1 score plus the reasons and
cautions shown on each card. It weighs formality distance (30%), color harmony
by hue distance with neutrals treated as universal (30%), pattern clash (20%),
and season overlap (20%). `rankCandidates` then nudges down anything already
used in the current outfit queue or worn in the last week, and adds a small
seeded jitter so the deck isn't identical every pass.

It is a pure function of `(candidate, context)` — deliberately the same shape a
model-backed scorer would have, so swapping in or blending an AI suggester means
replacing that one function rather than reworking the builder.

## Visual direction

Dark-first and photography-forward, modelled on the CREME app: true black
ground, a single green accent (`#28B16F`) carrying primary actions, tight heavy
display type set against small wide uppercase metadata, and pill shapes
throughout.

`accentText` is deliberately dark: the accent is light enough that dark text on
it clears 6.8:1, where white would manage only 2.8:1. The light palette uses a
darker green (`#1B7A4B`) for the same reason, since `#28B16F` on white is too
low for text.

The pieces worth knowing about:

- `src/constants/theme.ts` holds the palette plus a `Type` scale. `Type.display`
  / `Type.title` are the tight bold headings; `Type.eyebrow` and `Type.label`
  are the uppercase counterparts. Pair them — the contrast is most of the look.
- The tab bar is custom (`src/components/tab-bar.tsx`), not the native one, so
  the middle route can be promoted to a raised circular button. It sits on a
  gradient fade with no bar chrome, and content scrolls under it.
- Item detail runs the image full-bleed under a transparent header, with the
  title overlaid and the header controls on their own dark discs.
- `app.json` sets `userInterfaceStyle: "dark"`. A light palette is still defined
  in `theme.ts`, so switching that back to `"automatic"` restores it.

### Swipe feel

The deck's timing is tuned rather than incidental, and a few choices matter:

- **Haptics fire at the moment of decision**, inside the gesture's `onEnd`, not
  in the exit animation's completion callback. Waiting for the animation put
  roughly 200ms between the flick and the feedback, which read as lag.
- **Exit duration scales with throw velocity** (`exitDuration`, clamped to
  120–225ms) so a hard flick leaves fast and a slow drag still clears quickly.
- **The stack rises during the drag, not after it.** The active card owns a
  0–1 `progress` shared value and renders the cards behind it, which read that
  value. By the time a swipe commits, the next card is already at full size, so
  promotion is invisible and there is no re-stack on every swipe. It's shared by
  prop and written only by its owner — writing a shared value through a prop or
  a hook return is a mutation React's compiler rejects.
- **A selection tick fires as the drag crosses the threshold**, so the commit
  point is felt before releasing.
- **Horizontal is resolved before bench.** A fast diagonal flick satisfies both;
  picking wrongly is one undo away, while benching quietly pulls a piece out of
  rotation.

Thresholds live at the top of `swipe-deck.tsx`: 88pt of travel *or* 450pt/s of
velocity commits, which is deliberately low enough that a decisive flick works
without a long drag, and high enough that a tentative one springs back.

## Backup and restore

Everything lives in local SQLite with no account, so a backup is the only copy
that survives deleting the app. **Settings** (the ••• in the Closet header)
writes a single `.zip` — `backup.json` plus every photo — and hands it to the
share sheet.

One file is the point: the data and the images can't drift apart in transit.

- `src/db/backup.ts` snapshots the tables **in raw column form**, not the mapped
  domain types. A backup has to outlive changes to how the app models things,
  and the columns are the stable contract. `schemaVersion` guards against
  importing a file from a newer build.
- Restore uses `INSERT OR REPLACE` keyed on primary key rather than wiping
  first, so restoring into an empty app is a full recovery and restoring over
  existing data updates what matches and adds the rest. **Nothing is ever
  deleted**, which matters when the entire purpose is not losing anything.
- Photos are written back before the database half runs, so a failed import
  leaves them already in place for a retry.
- Compression is set to level 1: JPEGs are already compressed, so a higher
  level costs seconds on a phone and saves almost nothing.

Verified end to end by deleting the database and image folder outright and
restoring from the archive: 24 items, 4 outfits, 14 outfit entries, 1 capsule
and all 24 photos came back, with no item left pointing at a missing file.

## Roadmap

**Email receipt import.** Not built. The device-side half is: `importPurchases()`
in `src/lib/ingest/` writes `ParsedPurchase[]` into the closet, downloads product
images locally, and dedupes on a unique `(source, external_ref)` index so re-runs
are safe. What's missing is the fetch and parse half — `ReceiptSource` in
`src/lib/ingest/types.ts` defines that interface. It should be a server-side job
(mailbox OAuth, then an extraction pass over message bodies); mailbox credentials
should not live in the app.

**AI-assisted pairing.** See `src/lib/pairing.ts` above.

## Notes

- Requires iOS 18+: the closet uses SF Symbols 6 glyphs (`jacket.fill`). Drop
  `outerwear`'s symbol in `src/lib/taxonomy.ts` to go lower.
- `/ios` is gitignored. It's generated by `npx expo prebuild` and disposable.
- `node_modules` carries no patches — see the native-build note above.
