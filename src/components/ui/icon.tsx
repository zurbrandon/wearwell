import type { SFSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconProps = {
  name: SFSymbol;
  size?: number;
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
};

/**
 * SF Symbols wrapper. Off iOS, `SymbolView` renders the fallback — a neutral
 * dot keeps layout stable rather than collapsing the row.
 */
export function Icon({ name, size = 18, color, weight = 'medium' }: IconProps) {
  const theme = useTheme();
  const tint = color ?? theme.text;

  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={tint}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      fallback={
        <View
          style={[
            styles.fallback,
            { width: size * 0.6, height: size * 0.6, borderRadius: size, backgroundColor: tint },
          ]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  fallback: { opacity: 0.6, margin: 'auto' },
});
