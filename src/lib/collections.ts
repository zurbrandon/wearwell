import type { SFSymbol } from 'expo-symbols';

/**
 * Outfits live in collections, the way songs live in playlists.
 *
 * Three are built in and derived rather than stored: "All" is the whole queue,
 * "Favorites" is backed by the heart on each outfit (so hearting anything files
 * it automatically, with nothing to keep in sync), and "Archived" is the
 * recovery view. Everything else is a capsule the user made.
 */
export const VIRTUAL_COLLECTIONS = ['all', 'favorites', 'archived'] as const;
export type VirtualCollectionId = (typeof VIRTUAL_COLLECTIONS)[number];

export type CollectionKind = VirtualCollectionId | 'capsule';

export function collectionKind(id: string): CollectionKind {
  return (VIRTUAL_COLLECTIONS as readonly string[]).includes(id)
    ? (id as VirtualCollectionId)
    : 'capsule';
}

export function isCapsule(id: string): boolean {
  return collectionKind(id) === 'capsule';
}

export const COLLECTION_NAME: Record<VirtualCollectionId, string> = {
  all: 'All outfits',
  favorites: 'Favorites',
  archived: 'Archived',
};

export const COLLECTION_SYMBOL: Record<CollectionKind, SFSymbol> = {
  all: 'rectangle.stack.fill',
  favorites: 'heart.fill',
  archived: 'archivebox.fill',
  capsule: 'suitcase.fill',
};

export const COLLECTION_EMPTY_BODY: Record<VirtualCollectionId, string> = {
  all: 'Head to Build and swipe through your closet — the looks you keep collect here.',
  favorites: 'Tap the heart on any outfit and it lands here automatically.',
  archived: 'Outfits you clear land here, so a cleared batch is never really gone.',
};
