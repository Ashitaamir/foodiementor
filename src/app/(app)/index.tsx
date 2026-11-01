import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/fm-theme';
import { supabase } from '@/lib/supabase';

// Placeholder: the real home screen (today's totals and logs) replaces this in Step 4.
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        Home
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => supabase.auth.signOut()}
        style={styles.button}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 18,
    color: colors.navy,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.navy,
  },
  buttonText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.cream,
  },
});
