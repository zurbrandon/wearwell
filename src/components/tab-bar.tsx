import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing, TabBarHeight, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Inferred from the navigator rather than imported from
 * @react-navigation/bottom-tabs: expo-router ships its own copy of these types
 * and the two are not structurally identical.
 */
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, SFSymbol> = {
  index: 'tshirt.fill',
  build: 'wand.and.stars',
  outfits: 'rectangle.stack.fill',
};

const LABELS: Record<string, string> = {
  index: 'Closet',
  build: 'Build',
  outfits: 'Outfits',
};

/** The middle route is promoted to a raised circular button. */
const CENTER_ROUTE = 'build';

export function TabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: insets.bottom, height: TabBarHeight + insets.bottom },
      ]}>
      {/* Content scrolls under the bar, so fade it out rather than cutting it. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,1)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const isCenter = route.name === CENTER_ROUTE;

        function onPress() {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (focused || event.defaultPrevented) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate(route.name);
        }

        if (isCenter) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={LABELS[route.name]}
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.85 : 1 }]}>
              <View
                style={[
                  styles.centerButton,
                  {
                    backgroundColor: focused ? theme.accent : theme.text,
                    shadowColor: focused ? theme.accent : '#000000',
                  },
                ]}>
                <Icon
                  name={ICONS[route.name]}
                  size={24}
                  color={focused ? theme.accentText : theme.background}
                  weight="semibold"
                />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}>
            <Icon
              name={ICONS[route.name]}
              size={21}
              color={focused ? theme.text : theme.textTertiary}
              weight={focused ? 'semibold' : 'regular'}
            />
            <ThemedText
              style={[
                styles.label,
                { color: focused ? theme.text : theme.textTertiary },
              ]}>
              {LABELS[route.name]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // No bar chrome — just a fade, so the grid runs to the bottom edge.
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.four,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two - 2,
    height: TabBarHeight - Spacing.two,
  },
  label: { ...Type.label, textTransform: 'uppercase' },
  centerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    // Raised above the row.
    marginTop: -Spacing.three,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
