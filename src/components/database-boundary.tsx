import * as SplashScreen from 'expo-splash-screen';
import { Component, type ReactNode, useState, useSyncExternalStore } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { getFailure, retryInitialise, subscribeToFailure } from '@/db/init';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shown when the app cannot start, instead of dying on a black screen.
 *
 * Whatever went wrong, the wardrobe is still there: each migration step runs in
 * its own transaction, so a failure rolls back, and `sweep()` — which deletes
 * image files off disk — is sequenced after `migrate()` and never runs. Saying
 * so is the whole point. The alternative is someone assuming the opposite and
 * deleting the app, which is the one action that really would lose the closet.
 */
function DatabaseErrorScreen({
  error,
  attempt,
  retrying,
  onRetry,
}: {
  error: Error;
  attempt: number;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.page}>
      <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="exclamationmark.triangle" size={26} color={theme.text} />
      </View>

      <ThemedText type="title" style={styles.heading}>
        Wearwell couldn’t open your closet
      </ThemedText>

      <ThemedText themeColor="textSecondary" style={styles.body}>
        Your wardrobe is still on this device. Nothing has been deleted — this is a problem
        starting the app, not with your pieces, outfits or photos.
      </ThemedText>

      <ThemedText themeColor="textSecondary" style={styles.body}>
        Please don’t delete the app to fix it. That would remove the closet itself, and it’s the
        only copy.
      </ThemedText>

      {onRetry ? (
        <Button
          label="Try again"
          onPress={onRetry}
          loading={retrying}
          fullWidth
          style={styles.action}
        />
      ) : (
        // No retry here: the database never opened, and expo-sqlite caches that
        // failure for the life of the process, so nothing can be retried until
        // the app is relaunched. Better to say that than offer a dead button.
        <ThemedText themeColor="textSecondary" style={[styles.body, styles.action]}>
          Close Wearwell completely — swipe it away from the app switcher — then open it again.
        </ThemedText>
      )}

      {attempt > 0 ? (
        <ThemedText type="small" themeColor="textTertiary" style={styles.note}>
          {attempt === 1 ? 'Tried once already.' : `Tried ${attempt} times already.`} If it keeps
          failing, send the details — the closet can still be recovered.
        </ThemedText>
      ) : null}

      <View style={[styles.detail, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="code" themeColor="textSecondary" selectable>
          {error.name}: {error.message}
        </ThemedText>
      </View>

      <Button
        label="Send details"
        icon="square.and.arrow.up"
        variant="ghost"
        size="sm"
        onPress={() => {
          // Share rather than the clipboard: it needs no extra native module,
          // and it puts the text straight into a message instead of relying on
          // someone remembering to paste it somewhere.
          Share.share({
            message: `Wearwell could not start.\n\n${error.name}: ${error.message}`,
          }).catch(() => {});
        }}
      />
    </ScrollView>
  );
}

/**
 * The migration failed, but the database is open.
 *
 * Rendered inside the provider, so `retryInitialise` has a live handle to run
 * against — this is the case where trying again can genuinely work.
 */
export function MigrationGate({ children }: { children: ReactNode }) {
  const failure = useSyncExternalStore(subscribeToFailure, getFailure, getFailure);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  if (!failure) return <>{children}</>;

  return (
    <DatabaseErrorScreen
      error={failure}
      attempt={attempt}
      retrying={retrying}
      onRetry={async () => {
        setRetrying(true);
        setAttempt((n) => n + 1);
        await retryInitialise().catch(() => false);
        setRetrying(false);
      }}
    />
  );
}

/**
 * Backstop for a failure that isn't a migration — the database file itself
 * refusing to open, which surfaces as a rejected Suspense promise.
 *
 * Nothing can be retried in that state, so this only explains and reassures.
 */
export class DatabaseBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Normally the root layout's effect dismisses the splash. If the failure
    // happened before that ran, it would stay up and cover this screen.
    SplashScreen.hideAsync().catch(() => {});
    console.error('Database could not be opened', error);
  }

  render() {
    const { error } = this.state;
    if (error) return <DatabaseErrorScreen error={error} attempt={0} />;
    return <>{this.props.children}</>;
  }
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  heading: {
    // ThemedText's title carries its own lineHeight; oversized copy clips without one.
    fontSize: 28,
    lineHeight: 34,
  },
  body: { lineHeight: 22 },
  action: { marginTop: Spacing.three },
  note: { lineHeight: 20 },
  detail: {
    borderRadius: Radius.sm,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
});
