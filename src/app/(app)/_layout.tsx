import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/fm-theme';
import { isProfileComplete, ProfileProvider, useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// New users finish setup first; everyone else goes straight to Home
function SignedInNavigator() {
  const { profile, isLoading, error, refresh } = useProfile();
  const [retrying, setRetrying] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.navy} size="large" accessibilityLabel="Loading" />
      </View>
    );
  }

  if (!profile) {
    const retry = async () => {
      setRetrying(true);
      await refresh();
      setRetrying(false);
    };
    return (
      <View style={styles.center}>
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error ?? 'Could not load your profile.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: retrying, disabled: retrying }}
          disabled={retrying}
          onPress={retry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          {retrying ? (
            <ActivityIndicator color={colors.cream} />
          ) : (
            <Text style={styles.retryText}>Try again</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => supabase.auth.signOut()}
          style={styles.link}>
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const complete = isProfileComplete(profile);
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.blush } }}>
      <Stack.Protected guard={complete} redirectTo="/setup">
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!complete} redirectTo="/">
        <Stack.Screen name="setup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function AppLayout() {
  return (
    <ProfileProvider>
      <SignedInNavigator />
    </ProfileProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: colors.blush,
  },
  error: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.navy,
    textAlign: 'center',
  },
  retry: {
    minHeight: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.navy,
  },
  retryText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.cream,
  },
  pressed: {
    opacity: 0.8,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
});
