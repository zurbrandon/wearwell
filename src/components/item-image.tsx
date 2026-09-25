import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolveImageUri } from '@/lib/photos';
import { CATEGORY_SYMBOL, colorHex } from '@/lib/taxonomy';
import type { Item } from '@/lib/types';

export type ItemImageProps = {
  item: Pick<Item, 'imageUri' | 'category' | 'colors'>;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
};

/**
 * An item's photo, or — when there isn't one — a tinted placeholder built from
 * the item's own colors so an unphotographed closet still reads at a glance.
 */
export function ItemImage({ item, radius = Radius.md, style, contentFit = 'cover' }: ItemImageProps) {
  const theme = useTheme();
  const uri = resolveImageUri(item.imageUri);
  const tint = item.colors.length ? colorHex(item.colors[0]) : theme.backgroundElement;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.fill,
          { borderRadius: radius, backgroundColor: theme.backgroundElement },
          style as StyleProp<ImageStyle>,
        ]}
        contentFit={contentFit}
        transition={160}
      />
    );
  }

  return (
    <View
      style={[
        styles.fill,
        styles.placeholder,
        { borderRadius: radius, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      <View style={[styles.tint, { backgroundColor: tint, borderRadius: radius }]} />
      <Icon
        name={CATEGORY_SYMBOL[item.category]}
        size={30}
        color={theme.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tint: { ...StyleSheet.absoluteFill, opacity: 0.22 },
});
