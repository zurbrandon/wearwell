import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DatabaseBoundary, MigrationGate } from '@/components/database-boundary';
import { initialise } from '@/db/init';
import { DATABASE_NAME } from '@/db/schema';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

// Hoisted so its identity is stable. SQLiteProvider compares `options` by
// reference to decide whether to close and reopen the database, so an inline
// object would do that on any re-render of this layout — a colour-scheme
// change, for one.
const DATABASE_OPTIONS = { enableChangeListener: true } as const;

function navigationTheme(scheme: 'light' | 'dark') {
  const colors = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Two layers, because the two failures are not alike. A migration that
          throws is caught inside `initialise` and handled by MigrationGate,
          which can retry against the open database. A database that will not
          open at all rejects the Suspense promise instead, and only this
          boundary — above the Suspense — can catch that one. */}
      <DatabaseBoundary>
        <Suspense
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          }>
          <SQLiteProvider
            databaseName={DATABASE_NAME}
            onInit={initialise}
            options={DATABASE_OPTIONS}
            useSuspense>
            <MigrationGate>
              <ThemeProvider value={navigationTheme(scheme)}>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <Stack
                  screenOptions={{
                    headerShadowVisible: false,
                    // Otherwise the back button inherits the route-group name, "(tabs)".
                    headerBackButtonDisplayMode: 'minimal',
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    contentStyle: { backgroundColor: colors.background },
                  }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="item/new"
                    options={{ presentation: 'fullScreenModal', title: 'New item' }}
                  />
                  <Stack.Screen name="item/[id]" options={{ title: '' }} />
                  <Stack.Screen
                    name="settings"
                    options={{ presentation: 'modal', title: 'Settings' }}
                  />
                  <Stack.Screen name="outfit/[id]" options={{ title: '' }} />
                  <Stack.Screen name="collection/[id]" options={{ title: '' }} />
                  <Stack.Screen
                    name="collection/[id]/add"
                    options={{ presentation: 'modal', title: 'Add outfits' }}
                  />
                </Stack>
              </ThemeProvider>
            </MigrationGate>
          </SQLiteProvider>
        </Suspense>
      </DatabaseBoundary>
    </GestureHandlerRootView>
  );
}
