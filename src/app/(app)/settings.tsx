import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withCommas } from '@/components/calorie-bar';
import { ScreenHeader } from '@/components/screen-header';
import { colors, fonts } from '@/constants/fm-theme';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Goals and workout settings
export default function SettingsScreen() {
  const { profile, refresh } = useProfile();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAddBurned = async (value: boolean) => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ add_burned_calories: value })
      .eq('id', profile.id);
    if (updateError) {
      setError('Could not save that. Please try again.');
    } else {
      await refresh();
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader title="SETTINGS" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>DAILY GOAL</Text>
          <Text style={styles.big}>
            {profile?.daily_calorie_goal ? `${withCommas(profile.daily_calorie_goal)} kcal` : 'Not set'}
          </Text>
          <Text style={styles.small}>
            Lilo works this out from your survey answers. Retake it to change your weight, activity or goal.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/setup')}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>EDIT MY GOALS</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>WORKOUTS</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Add calories burned in workouts to my daily goal</Text>
            <Switch
              accessibilityLabel="Add calories burned in workouts to my daily goal"
              value={profile?.add_burned_calories ?? false}
              disabled={saving}
              onValueChange={setAddBurned}
              trackColor={{ false: colors.fieldLine, true: colors.navy }}
              thumbColor={colors.cream}
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: 16, padding: 16 },
  card: {
    gap: 10,
    padding: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  label: { fontFamily: fonts.pixel, fontSize: 9, color: colors.navy },
  big: { fontFamily: fonts.bodyHeavy, fontSize: 28, color: colors.navy },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.plum },
  primary: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  primaryText: { fontFamily: fonts.pixel, fontSize: 10, color: colors.cream },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20, color: colors.navy },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.berry },
});
