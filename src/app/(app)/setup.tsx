import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Lilo } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';
import { useProfile, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Same limits as the database (profiles.daily_calorie_goal check)
const MIN_GOAL = 500;
const MAX_GOAL = 10000;

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// First-time setup: name, calorie goal, units, time zone and the training opt-in
export default function SetupScreen() {
  const { profile, refresh } = useProfile();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [goal, setGoal] = useState(profile?.daily_calorie_goal?.toString() ?? '');
  const [units, setUnits] = useState<Profile['unit_system']>(profile?.unit_system ?? 'metric');
  const [optIn, setOptIn] = useState(profile?.ai_training_opt_in ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeZone = deviceTimeZone();

  const save = async () => {
    const trimmedName = name.trim();
    const goalNumber = Number(goal);
    if (!trimmedName) {
      setError('Please tell us what to call you.');
      return;
    }
    if (!Number.isInteger(goalNumber) || goalNumber < MIN_GOAL || goalNumber > MAX_GOAL) {
      setError(`Please enter a daily goal between ${MIN_GOAL} and ${MAX_GOAL} kcal.`);
      return;
    }
    if (!profile) {
      setError('Could not load your profile. Please try again.');
      return;
    }

    setBusy(true);
    setError(null);
    const fields = {
      display_name: trimmedName,
      daily_calorie_goal: goalNumber,
      unit_system: units,
      ai_training_opt_in: optIn,
    };
    let { error: saveError } = await supabase
      .from('profiles')
      .update({ ...fields, time_zone: timeZone })
      .eq('id', profile.id);
    if (saveError) {
      // The database rejects time zones it doesn't know; save the rest with the default
      ({ error: saveError } = await supabase.from('profiles').update(fields).eq('id', profile.id));
    }
    if (saveError) {
      setError('Could not save. Please check your connection and try again.');
      setBusy(false);
      return;
    }
    // Once the profile is complete the app opens Home automatically
    await refresh();
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Lilo pixelSize={4} bob />
            <Text style={styles.title} accessibilityRole="header">
              SET UP YOUR PLAYER
            </Text>
            <Text style={styles.intro}>A few quick things so FoodieMentor fits you.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label} nativeID="name-label">
              What should we call you?
            </Text>
            <TextInput
              accessibilityLabelledBy="name-label"
              accessibilityLabel="Display name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.placeholder}
              autoComplete="name"
              textContentType="nickname"
              maxLength={40}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label} nativeID="goal-label">
              Daily calorie goal (kcal)
            </Text>
            <TextInput
              accessibilityLabelledBy="goal-label"
              accessibilityLabel="Daily calorie goal in kilocalories"
              value={goal}
              onChangeText={(text) => setGoal(text.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 2000"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
            />
            <Text style={styles.help}>Not sure? Start with 2000. You can change it any time.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Units</Text>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['metric', 'imperial'] as const).map((option) => {
                const selected = units === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setUnits(option)}
                    style={[styles.segmentOption, selected && styles.segmentSelected]}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {option === 'metric' ? 'Metric (g, kg)' : 'Imperial (oz, lb)'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Time zone</Text>
            <Text style={styles.value}>{timeZone}</Text>
            <Text style={styles.help}>From your phone. It decides when your day starts.</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label} nativeID="optin-label">
                Help improve FoodieMentor
              </Text>
              <Text style={styles.help}>
                Use my food corrections to make the AI better. Optional, and you can turn it off
                any time.
              </Text>
            </View>
            <Switch
              accessibilityLabelledBy="optin-label"
              accessibilityLabel="Help improve FoodieMentor with my corrections"
              value={optIn}
              onValueChange={setOptIn}
              trackColor={{ false: colors.fieldLine, true: colors.navy }}
              thumbColor={colors.cream}
            />
          </View>

          {error && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={save}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
            {busy ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.primaryText}>LET&apos;S GO</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => supabase.auth.signOut()}
            style={styles.linkButton}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.blush,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
    textAlign: 'center',
    textShadowColor: colors.cream,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  intro: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.plum,
    textAlign: 'center',
  },
  field: {
    gap: 6,
  },
  label: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.fieldLine,
    backgroundColor: colors.cream,
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.plum,
  },
  value: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.navy,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.fieldLine,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  segmentText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.navy,
  },
  segmentTextSelected: {
    color: colors.cream,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  error: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.berry,
    textAlign: 'center',
  },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  primaryPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    boxShadow: `2px 2px 0 ${colors.lycheePink}`,
  },
  primaryText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.cream,
  },
  linkButton: {
    alignSelf: 'center',
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
