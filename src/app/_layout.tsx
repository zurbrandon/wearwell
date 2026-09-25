import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DATABASE_NAME, migrate, sweep } from '@/db/schema';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

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
      <Suspense
        fallback={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        }>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={async (db) => {
            await migrate(db);
            await sweep(db);
          }}
          options={{ enableChangeListener: true }}
          useSuspense>
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
              <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
              <Stack.Screen name="outfit/[id]" options={{ title: '' }} />
              <Stack.Screen name="collection/[id]" options={{ title: '' }} />
              <Stack.Screen
                name="collection/[id]/add"
                options={{ presentation: 'modal', title: 'Add outfits' }}
              />
            </Stack>
          </ThemeProvider>
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
