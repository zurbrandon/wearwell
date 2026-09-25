import '@/global.css';

import { Platform } from 'react-native';

/**
 * Dark-first and photography-forward: the garment images are the content, so
 * the chrome is near-black and a single green accent carries every primary
 * action. Surfaces step up in lightness rather than using borders for depth.
 *
 * `accentText` stays dark deliberately — the accent is light enough that dark
 * text on it clears 6.8:1, where white would only manage 2.8:1.
 */
export const Colors = {
  dark: {
    text: '#FFFFFF',
    textSecondary: '#A1A1A6',
    textTertiary: '#6B6B70',
    background: '#000000',
    /** Chips, inputs, inert pills. */
    backgroundElement: '#1A1A1C',
    backgroundSelected: '#2E2E32',
    /** Cards that sit above the page. */
    surface: '#141416',
    border: '#262629',
    borderStrong: '#3A3A3E',
    accent: '#28B16F',
    accentText: '#141416',
    positive: '#7FD1A0',
    negative: '#FF6B5A',
    shadow: '#000000',
  },
  light: {
    text: '#0E0E10',
    textSecondary: '#5C5C63',
    textTertiary: '#8E8E96',
    background: '#FFFFFF',
    backgroundElement: '#F1F1F3',
    backgroundSelected: '#E2E2E6',
    surface: '#FFFFFF',
    border: '#E4E4E8',
    borderStrong: '#C9C9D0',
    accent: '#1B7A4B',
    accentText: '#FFFFFF',
    positive: '#2F7D52',
    negative: '#C4402C',
    shadow: '#0E0E10',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

/** 4pt base scale. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
  eight: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

/**
 * Display type runs tight and heavy; metadata runs small, uppercase and wide.
 * The contrast between the two is most of the look.
 */
export const Type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.7 },
  cardTitle: { fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.4 },
  label: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.9 },
  value: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2 },
} as const;

/** Height of the floating tab bar, excluding the bottom safe-area inset. */
export const TabBarHeight = 64;

export const MaxContentWidth = 700;
