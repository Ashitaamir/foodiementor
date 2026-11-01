import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withCommas } from '@/components/calorie-bar';
import { LiloMoodArt } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type Activity = { code: string; name: string; met: number; category: string };
type Workout = {
  id: string;
  minutes: number;
  kcal_burned: number;
  done_at: string;
  activities: { name: string } | null;
};

const CATEGORY_TITLES: Record<string, string> = {
  walk_run: 'WALK & RUN',
  cardio: 'CARDIO',
  gym: 'GYM',
  sport: 'SPORT',
  dance: 'DANCE',
};
const QUICK_MINUTES = [15, 30, 45, 60];
const DEFAULT_WEIGHT_KG = 70;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

// Log a workout: pick the activity and how long. The database works out the calories
// from the activity's MET value and your weight (MET x kg x hours).
export default function WorkoutScreen() {
  const { profile } = useProfile();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [today, setToday] = useState<Workout[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [minutes, setMinutes] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [activityResult, workoutResult] = await Promise.all([
      supabase.from('activities').select('code, name, met, category').order('sort'),
      supabase
        .from('workouts')
        .select('id, minutes, kcal_burned, done_at, activities(name)')
        .gte('done_at', startOfToday())
        .order('done_at', { ascending: false }),
    ]);
    if (activityResult.error || workoutResult.error) {
      setError('Could not load workouts. Please try again.');
      return;
    }
    setActivities((activityResult.data ?? []) as Activity[]);
    setToday((workoutResult.data ?? []) as unknown as Workout[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const minutesNumber = Number(minutes) || 0;
  const weight = Number(profile?.weight_kg) || DEFAULT_WEIGHT_KG;
  const estimate = selected ? Math.round((Number(selected.met) * weight * minutesNumber) / 60) : 0;
  const burnedToday = today.reduce((sum, workout) => sum + Number(workout.kcal_burned), 0);

  const save = async () => {
    if (!selected) {
      setError('Pick an activity first.');
      return;
    }
    if (minutesNumber < 1 || minutesNumber > 600) {
      setError('Please enter between 1 and 600 minutes.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from('workouts')
      .insert({ activity_code: selected.code, minutes: Math.round(minutesNumber) });
    setSaving(false);
    if (saveError) {
      console.warn('Saving workout failed:', saveError.code, saveError.message);
      setError('Could not save the workout. Please try again.');
      return;
    }
    setMessage(`Nice! ${selected.name} logged.`);
    setSelected(null);
    load();
  };

  const remove = async (id: string) => {
    const { error: deleteError } = await supabase.from('workouts').delete().eq('id', id);
    if (deleteError) {
      setError('Could not remove that workout.');
      return;
    }
    load();
  };

  const categories = Object.keys(CATEGORY_TITLES).filter((category) =>
    activities.some((activity) => activity.category === category),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <LiloMoodArt mood="workout" pixelSize={2} bob />
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">
                WORKOUT
              </Text>
              <Text style={styles.subtle}>
                {profile?.add_burned_calories
                  ? 'Calories you burn are added to today’s goal.'
                  : 'Calories you burn are shown on Home, not added to your goal.'}
              </Text>
            </View>
          </View>

          <View style={styles.burnedCard} accessible accessibilityLabel={`${withCommas(burnedToday)} calories burned today`}>
            <Text style={styles.label}>BURNED TODAY</Text>
            <Text style={styles.burnedNumber}>{withCommas(burnedToday)} kcal</Text>
          </View>

          {categories.map((category) => (
            <View key={category} style={styles.group}>
              <Text style={styles.label}>{CATEGORY_TITLES[category]}</Text>
              <View style={styles.chips}>
                {activities
                  .filter((activity) => activity.category === category)
                  .map((activity) => {
                    const active = selected?.code === activity.code;
                    return (
                      <Pressable
                        key={activity.code}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setSelected(activity);
                          setMessage(null);
                        }}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={styles.chipText}>{activity.name}</Text>
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          ))}

          {selected && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{selected.name}</Text>
              <Text style={styles.fieldLabel}>How many minutes?</Text>
              <View style={styles.chips}>
                {QUICK_MINUTES.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: minutesNumber === value }}
                    onPress={() => setMinutes(String(value))}
                    style={[styles.chip, minutesNumber === value && styles.chipActive]}>
                    <Text style={styles.chipText}>{value} min</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Minutes"
                value={minutes}
                onChangeText={(value) => setMinutes(value.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="Minutes"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <Text style={styles.estimate}>About {withCommas(estimate)} kcal</Text>
              <Text style={styles.small}>
                Based on {Math.round(weight)} kg{profile?.weight_kg ? '' : ' (add your weight in the survey)'}.
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {message && (
            <View style={styles.cheer} accessibilityLiveRegion="polite">
              <LiloMoodArt mood="workout" pixelSize={3} bob />
              <Text style={styles.success}>{message}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !selected || saving, busy: saving }}
            disabled={!selected || saving}
            onPress={save}
            style={[styles.primary, !selected && styles.disabled]}>
            {saving ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.primaryText}>{selected ? 'LOG WORKOUT' : 'PICK AN ACTIVITY'}</Text>
            )}
          </Pressable>

          {today.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.label}>TODAY</Text>
              {today.map((workout) => (
                <View key={workout.id} style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.rowName}>{workout.activities?.name ?? 'Workout'}</Text>
                    <Text style={styles.small}>{workout.minutes} min</Text>
                  </View>
                  <Text style={styles.rowKcal}>{withCommas(Number(workout.kcal_burned))} kcal</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${workout.activities?.name ?? 'workout'}`}
                    onPress={() => remove(workout.id)}
                    style={styles.removeButton}>
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.credit}>
            Calories are estimates using MET values from the 2024 Adult Compendium of Physical
            Activities (Herrmann et al., pacompendium.com).
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.pixel, fontSize: 14, color: colors.navy },
  subtle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.plum, marginTop: 4 },
  burnedCard: {
    gap: 6,
    padding: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  burnedNumber: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 30,
    color: colors.navy,
    fontVariant: ['tabular-nums'],
  },
  label: { fontFamily: fonts.pixel, fontSize: 9, color: colors.navy },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  chipActive: { backgroundColor: colors.arcadeYellow, boxShadow: `3px 3px 0 ${colors.navy}` },
  chipText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.navy },
  card: {
    gap: 10,
    padding: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  cardTitle: { fontFamily: fonts.bodyHeavy, fontSize: 18, color: colors.navy },
  fieldLabel: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  input: {
    minHeight: 52,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: '#FFFFFF',
    color: colors.navy,
    fontFamily: fonts.bodyHeavy,
    fontSize: 18,
    paddingHorizontal: 14,
  },
  estimate: { fontFamily: fonts.bodyHeavy, fontSize: 20, color: colors.navy },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.plum },
  primary: {
    height: 56,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  primaryText: { fontFamily: fonts.pixel, fontSize: 11, color: colors.cream },
  disabled: { opacity: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: colors.fieldLine,
    backgroundColor: colors.cream,
  },
  rowName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  rowKcal: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: fonts.bodyHeavy, fontSize: 22, color: colors.berry },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.berry, textAlign: 'center' },
  cheer: { alignItems: 'center', gap: 8 },
  success: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy, textAlign: 'center' },
  credit: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.plum, textAlign: 'center' },
});
