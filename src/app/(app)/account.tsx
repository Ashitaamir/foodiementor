import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { colors, fonts } from '@/constants/fm-theme';
import { useProfile } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Who's signed in, signing out, and where the food data comes from
export default function AccountScreen() {
  const { session } = useSession();
  const { profile } = useProfile();

  const signOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader title="ACCOUNT" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>PLAYER</Text>
          <Text style={styles.value}>{profile?.display_name ?? 'Player'}</Text>
          <Text style={styles.label}>EMAIL</Text>
          <Text style={styles.value}>{session?.user.email ?? '—'}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </Pressable>

        <Text style={styles.credit}>
          Food data: UK CoFID 2021 (Open Government Licence v3.0) and U.S. Department of
          Agriculture FoodData Central. Packaged foods © Open Food Facts contributors (ODbL).
          Workout calories use the 2024 Adult Compendium of Physical Activities.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: 18, padding: 16 },
  card: {
    gap: 6,
    padding: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  label: { fontFamily: fonts.pixel, fontSize: 8, color: colors.plum, marginTop: 6 },
  value: { fontFamily: fonts.bodyHeavy, fontSize: 17, color: colors.navy },
  signOut: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.berry,
    backgroundColor: colors.cream,
  },
  pressed: { transform: [{ translateY: 2 }] },
  signOutText: { fontFamily: fonts.pixel, fontSize: 10, color: colors.berry },
  credit: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.plum, textAlign: 'center' },
});
