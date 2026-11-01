import { router } from 'expo-router';
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

import { LiloProgress } from '@/components/lilo-progress';
import { QuizOption } from '@/components/quiz-option';
import { RetroTV } from '@/components/retro-tv';
import { formatRate, WeightScaleSlider } from '@/components/weight-scale-slider';
import { colors, fonts } from '@/constants/fm-theme';
import {
  ADULT_AGE,
  ageFromBirthYear,
  calculateCalorieGoal,
  dailyChangeForRate,
  feetInchesToCm,
  kgToPounds,
  MAX_RATE_KG_WEEK,
  MIN_RATE_KG_WEEK,
  poundsToKg,
  type Activity,
  type Gender,
  type WeightGoal,
  type Workouts,
} from '@/lib/calorie-goal';
import { useProfile, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type Units = Profile['unit_system'];
type StepId =
  | 'name'
  | 'units'
  | 'gender'
  | 'height'
  | 'activity'
  | 'weight'
  | 'workouts'
  | 'goal'
  | 'pace'
  | 'result'
  | 'burned';

type Option<T> = { value: T; label: string; hint?: string };

const UNIT_OPTIONS: Option<Units>[] = [
  { value: 'metric', label: 'Metric', hint: 'Centimetres and kilograms' },
  { value: 'imperial', label: 'Imperial', hint: 'Feet, inches and pounds' },
];
const GENDER_OPTIONS: Option<Gender>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say', hint: 'We will use an average' },
];
const ACTIVITY_OPTIONS: Option<Activity>[] = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk job, studying, driving' },
  { value: 'light', label: 'Lightly active', hint: 'Some walking, e.g. teaching or shop work' },
  { value: 'active', label: 'On my feet a lot', hint: 'e.g. nurse, waiter, retail all day' },
  { value: 'very_active', label: 'Very physical', hint: 'e.g. construction, farm or warehouse work' },
];
const WORKOUT_OPTIONS: Option<Workouts>[] = [
  { value: '0', label: 'None right now' },
  { value: '1-2', label: '1–2 a week' },
  { value: '3-4', label: '3–4 a week' },
  { value: '5+', label: '5 or more a week' },
];
const GOAL_OPTIONS: Option<WeightGoal>[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Stay the same', hint: 'Keep my current weight' },
  { value: 'gain', label: 'Gain weight', hint: 'e.g. build muscle' },
];
const BURNED_OPTIONS: Option<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes, add them back', hint: 'Exercise gives you a bit more to eat that day' },
  { value: 'no', label: 'No, keep my goal fixed', hint: 'Same goal every day' },
];
// Starting point on the "how much per week" slider
const DEFAULT_RATE: Record<'lose' | 'gain', number> = { lose: 0.5, gain: 0.25 };
const RATE_STEP = 0.05;

// Plain-words label for how ambitious a weekly amount is
function rateLabel(goal: 'lose' | 'gain', rate: number) {
  const share = rate / MAX_RATE_KG_WEEK[goal];
  if (share <= 0.3) return 'Gentle';
  if (share <= 0.55) return 'Steady';
  if (share <= 0.8) return 'Ambitious';
  return 'Very ambitious';
}

const MIN_AGE = 13;
const MIN_GOAL = 1200;
const MAX_GOAL = 10000;

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function withCommas(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Turn saved metric values back into what the form shows, in the user's units
function previousAnswers(profile: Profile | null) {
  const imperial = profile?.unit_system === 'imperial';
  const units: Units | null = profile?.weight_goal ? (profile.unit_system ?? null) : null;
  const cm = profile?.height_cm ?? null;
  const kg = profile?.weight_kg ?? null;
  const totalInches = cm ? Math.round(cm / 2.54) : null;
  return {
    units,
    heightCm: cm ? String(Math.round(cm)) : '',
    heightFt: totalInches ? String(Math.floor(totalInches / 12)) : '',
    heightIn: totalInches ? String(totalInches % 12) : '',
    weight: kg ? String(imperial ? Math.round(kgToPounds(kg)) : Math.round(kg * 10) / 10) : '',
  };
}

const digitsOnly = (text: string) => text.replace(/[^0-9]/g, '');
const decimalOnly = (text: string) => text.replace(/[^0-9.]/g, '');

// First-time onboarding: one question per screen on Lilo's retro TV, then the calorie goal.
export default function SetupScreen() {
  const { profile, refresh } = useProfile();
  const [stepIndex, setStepIndex] = useState(0);
  // Retaking the survey starts from the previous answers
  const saved = previousAnswers(profile);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [birthYear, setBirthYear] = useState(profile?.birth_year?.toString() ?? '');
  const [units, setUnits] = useState<Units | null>(saved.units);
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [heightCm, setHeightCm] = useState(saved.heightCm);
  const [heightFt, setHeightFt] = useState(saved.heightFt);
  const [heightIn, setHeightIn] = useState(saved.heightIn);
  const [weight, setWeight] = useState(saved.weight);
  const [activity, setActivity] = useState<Activity | null>(profile?.activity_level ?? null);
  const [workouts, setWorkouts] = useState<Workouts | null>(profile?.workouts_per_week ?? null);
  const [goal, setGoal] = useState<WeightGoal | null>(profile?.weight_goal ?? null);
  const [rate, setRate] = useState(profile?.goal_rate_kg_week ?? DEFAULT_RATE.lose);
  const [goalEdit, setGoalEdit] = useState<string | null>(
    profile?.daily_calorie_goal ? String(profile.daily_calorie_goal) : null,
  );
  const [addBurned, setAddBurned] = useState<'yes' | 'no' | null>(
    profile?.weight_goal ? (profile.add_burned_calories ? 'yes' : 'no') : null,
  );
  const [optIn, setOptIn] = useState(profile?.ai_training_opt_in ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const steps: StepId[] = [
    'name',
    'units',
    'gender',
    'height',
    'activity',
    'weight',
    'workouts',
    'goal',
    ...(goal && goal !== 'maintain' ? (['pace'] as const) : []),
    'result',
    'burned',
  ];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const metric = units !== 'imperial';
  const age = ageFromBirthYear(Number(birthYear));
  const heightValue = metric
    ? Number(heightCm)
    : feetInchesToCm(Number(heightFt), Number(heightIn || 0));
  const weightValue = metric ? Number(weight) : poundsToKg(Number(weight));

  const result =
    gender && activity && workouts && goal
      ? calculateCalorieGoal({
          gender,
          age,
          heightCm: heightValue,
          weightKg: weightValue,
          activity,
          workouts,
          goal,
          rateKgPerWeek: goal === 'maintain' ? null : rate,
        })
      : null;
  const goalText = goalEdit ?? (result ? String(result.calories) : '');

  // Returns a message when the current answer isn't usable yet
  const problem = (): string | null => {
    const thisYear = new Date().getFullYear();
    switch (step) {
      case 'name': {
        const year = Number(birthYear);
        if (!name.trim()) return 'Please tell us what to call you.';
        if (!Number.isInteger(year) || year < thisYear - 110 || year > thisYear) {
          return 'Please enter your year of birth, e.g. 1998.';
        }
        if (age < MIN_AGE) return `FoodieMentor is for ages ${MIN_AGE} and up.`;
        return null;
      }
      case 'units':
        return units ? null : 'Please pick one.';
      case 'gender':
        return gender ? null : 'Please pick one.';
      case 'height':
        return heightValue >= 100 && heightValue <= 250
          ? null
          : metric
            ? 'Please enter your height in cm, e.g. 165.'
            : 'Please enter your height, e.g. 5 ft 5 in.';
      case 'activity':
        return activity ? null : 'Please pick one.';
      case 'weight':
        return weightValue >= 25 && weightValue <= 350
          ? null
          : metric
            ? 'Please enter your weight in kg, e.g. 62.'
            : 'Please enter your weight in lb, e.g. 137.';
      case 'workouts':
        return workouts ? null : 'Please pick one.';
      case 'goal':
        return goal ? null : 'Please pick one.';
      case 'pace':
        return null;
      case 'result': {
        const value = Number(goalText);
        return Number.isInteger(value) && value >= MIN_GOAL && value <= MAX_GOAL
          ? null
          : `Please choose a goal between ${withCommas(MIN_GOAL)} and ${withCommas(MAX_GOAL)} kcal.`;
      }
      case 'burned':
        return addBurned ? null : 'Please pick one.';
    }
  };

  const next = () => {
    const message = problem();
    setError(message);
    if (!message) {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const back = () => {
    setError(null);
    setStepIndex((index) => Math.max(0, index - 1));
  };

  // Tapping an answer selects it and moves on, like a quiz
  const choose = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setError(null);
    setGoalEdit(null);
    setTimeout(() => setStepIndex((index) => index + 1), 220);
  };

  const save = async () => {
    const message = problem();
    if (message || !profile || !gender || !activity || !workouts || !goal || !units) {
      setError(message ?? 'Something is missing. Please go back and check your answers.');
      return;
    }
    setBusy(true);
    setError(null);
    const fields = {
      display_name: name.trim(),
      birth_year: Number(birthYear),
      unit_system: units,
      gender,
      height_cm: Math.round(heightValue * 10) / 10,
      weight_kg: Math.round(weightValue * 10) / 10,
      activity_level: activity,
      workouts_per_week: workouts,
      weight_goal: goal,
      goal_rate_kg_week: goal === 'maintain' ? null : rate,
      daily_calorie_goal: Number(goalText),
      add_burned_calories: addBurned === 'yes',
      ai_training_opt_in: optIn,
    };
    let { error: saveError } = await supabase
      .from('profiles')
      .update({ ...fields, time_zone: deviceTimeZone() })
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
    await refresh();
    setBusy(false);
    router.replace('/');
  };

  const rateGoal = goal === 'gain' ? 'gain' : 'lose';

  // Picking a goal also resets the slider to a sensible starting amount
  const chooseGoal = (value: WeightGoal) => {
    if (value !== 'maintain') setRate(DEFAULT_RATE[value]);
    choose(setGoal, value);
  };

  const screens: Record<StepId, { title: string; subtitle?: string }> = {
    name: { title: "HI, I'M LILO!", subtitle: 'What should we call you, and what year were you born?' },
    units: { title: 'METRIC OR IMPERIAL?', subtitle: 'How do you like to measure things?' },
    gender: { title: "WHAT'S YOUR GENDER?", subtitle: 'Only used for the calorie formula.' },
    height: { title: 'HOW TALL ARE YOU?' },
    activity: { title: 'HOW ACTIVE IS YOUR DAY?', subtitle: 'Not counting workouts.' },
    weight: { title: 'WHAT DO YOU WEIGH?', subtitle: 'Private: only you can see this.' },
    workouts: { title: 'WORKOUTS PER WEEK?', subtitle: 'Gym, sport, dance, brisk walks…' },
    goal: { title: "WHAT'S YOUR GOAL?" },
    pace: {
      title: goal === 'gain' ? 'HOW MUCH TO GAIN?' : 'HOW MUCH TO LOSE?',
      subtitle: 'Slide the weight. Slower is easier to keep up.',
    },
    result: { title: 'CALORIES SUGGESTED BY LILO FOR YOUR GOAL' },
    burned: {
      title: 'ADD CALORIES BURNED BACK?',
      subtitle: 'When you log exercise, should your daily goal go up?',
    },
  };

  const renderOptions = <T extends string>(
    options: Option<T>[],
    selected: T | null,
    setter: (value: T) => void,
  ) => (
    <View style={styles.options} accessibilityRole="radiogroup">
      {options.map((option) => (
        <QuizOption
          key={option.value}
          label={option.label}
          hint={option.hint}
          selected={selected === option.value}
          onPress={() => choose(setter, option.value)}
        />
      ))}
    </View>
  );

  const input = (props: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    numeric?: boolean;
    maxLength?: number;
    flex?: boolean;
  }) => (
    <View style={[styles.field, props.flex && styles.flex]}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
        maxLength={props.maxLength}
        returnKeyType="next"
        onSubmitEditing={next}
        style={styles.input}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              disabled={stepIndex === 0}
              onPress={back}
              style={[styles.backButton, stepIndex === 0 && styles.hidden]}>
              <Text style={styles.backText}>{'<'}</Text>
            </Pressable>
            <View style={styles.flex}>
              <LiloProgress step={stepIndex} total={steps.length} />
            </View>
          </View>

          <RetroTV channel={step} title={screens[step].title} subtitle={screens[step].subtitle}>
            {step === 'result' && result ? (
              <Text style={styles.bigNumber}>{withCommas(Number(goalText) || result.calories)} kcal</Text>
            ) : null}
          </RetroTV>

          <View style={styles.answers}>
            {step === 'name' && (
              <>
                {input({ label: 'Your name', value: name, onChangeText: setName, placeholder: 'e.g. Ashita', maxLength: 40 })}
                {input({
                  label: 'Year of birth',
                  value: birthYear,
                  onChangeText: (text) => setBirthYear(digitsOnly(text)),
                  placeholder: 'e.g. 1998',
                  numeric: true,
                  maxLength: 4,
                })}
              </>
            )}
            {step === 'units' && renderOptions(UNIT_OPTIONS, units, setUnits)}
            {step === 'gender' && renderOptions(GENDER_OPTIONS, gender, setGender)}
            {step === 'height' &&
              (metric ? (
                input({
                  label: 'Height (cm)',
                  value: heightCm,
                  onChangeText: (text) => setHeightCm(decimalOnly(text)),
                  placeholder: 'e.g. 165',
                  numeric: true,
                  maxLength: 5,
                })
              ) : (
                <View style={styles.row}>
                  {input({
                    label: 'Feet',
                    value: heightFt,
                    onChangeText: (text) => setHeightFt(digitsOnly(text)),
                    placeholder: '5',
                    numeric: true,
                    maxLength: 1,
                    flex: true,
                  })}
                  {input({
                    label: 'Inches',
                    value: heightIn,
                    onChangeText: (text) => setHeightIn(digitsOnly(text)),
                    placeholder: '5',
                    numeric: true,
                    maxLength: 2,
                    flex: true,
                  })}
                </View>
              ))}
            {step === 'activity' && renderOptions(ACTIVITY_OPTIONS, activity, setActivity)}
            {step === 'weight' &&
              input({
                label: metric ? 'Weight (kg)' : 'Weight (lb)',
                value: weight,
                onChangeText: (text) => setWeight(decimalOnly(text)),
                placeholder: metric ? 'e.g. 62' : 'e.g. 137',
                numeric: true,
                maxLength: 5,
              })}
            {step === 'workouts' && renderOptions(WORKOUT_OPTIONS, workouts, setWorkouts)}
            {step === 'goal' && (
              <View style={styles.options} accessibilityRole="radiogroup">
                {GOAL_OPTIONS.map((option) => (
                  <QuizOption
                    key={option.value}
                    label={option.label}
                    hint={option.hint}
                    selected={goal === option.value}
                    onPress={() => chooseGoal(option.value)}
                  />
                ))}
              </View>
            )}
            {step === 'pace' && (
              <>
                <WeightScaleSlider
                  value={rate}
                  min={MIN_RATE_KG_WEEK}
                  max={MAX_RATE_KG_WEEK[rateGoal]}
                  step={RATE_STEP}
                  metric={metric}
                  onChange={(value) => {
                    setRate(value);
                    setGoalEdit(null);
                  }}
                />
                <Text style={styles.explain}>
                  {rateLabel(rateGoal, rate)}: {formatRate(rate, metric)} a week is about{' '}
                  {withCommas(Math.round(dailyChangeForRate(rateGoal, rate) / 10) * 10)} kcal{' '}
                  {rateGoal === 'lose' ? 'less' : 'more'} each day.
                </Text>
              </>
            )}
            {step === 'burned' && (
              <>
                <View style={styles.options} accessibilityRole="radiogroup">
                  {BURNED_OPTIONS.map((option) => (
                    <QuizOption
                      key={option.value}
                      label={option.label}
                      hint={option.hint}
                      selected={addBurned === option.value}
                      onPress={() => {
                        setAddBurned(option.value);
                        setError(null);
                      }}
                    />
                  ))}
                </View>
                <View style={styles.switchRow}>
                  <View style={styles.flex}>
                    <Text style={styles.fieldLabel}>Help improve FoodieMentor</Text>
                    <Text style={styles.help}>
                      Use my food corrections to make the AI better. Optional; you can turn it off
                      any time.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Help improve FoodieMentor with my corrections"
                    value={optIn}
                    onValueChange={setOptIn}
                    trackColor={{ false: colors.fieldLine, true: colors.navy }}
                    thumbColor={colors.cream}
                  />
                </View>
                <Text style={styles.help}>Time zone: {deviceTimeZone()} (from your phone).</Text>
              </>
            )}

            {step === 'result' && result && (
              <>
                <Text style={styles.explain}>
                  About {withCommas(result.maintenance)} kcal a day keeps your weight the same
                  {goal === 'lose' && !result.limitedToMaintain ? ', so we took a little off.' : ''}
                  {goal === 'gain' && !result.limitedToMaintain ? ', so we added a little.' : ''}
                  {goal === 'maintain' || result.limitedToMaintain ? '.' : ''}
                </Text>
                {result.limitedToMaintain && (
                  <Text style={styles.note}>
                    Because you are under {ADULT_AGE}, this goal keeps your weight the same. Please talk
                    to a parent or doctor before trying to lose or gain weight.
                  </Text>
                )}
                {result.raisedToMinimum && (
                  <Text style={styles.note}>
                    We never suggest less than {withCommas(MIN_GOAL)} kcal a day.
                  </Text>
                )}
                {input({
                  label: 'Customise your daily calories (kcal)',
                  value: goalText,
                  onChangeText: (text) => setGoalEdit(digitsOnly(text)),
                  placeholder: String(result.calories),
                  numeric: true,
                  maxLength: 5,
                })}
                <Text style={styles.help}>
                  An estimate using the Mifflin–St Jeor equation, not medical advice.
                </Text>
              </>
            )}
          </View>

          {error && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          )}

          {(step === 'name' ||
            step === 'height' ||
            step === 'weight' ||
            step === 'pace' ||
            step === 'result') && (
            <Pressable
              accessibilityRole="button"
              onPress={next}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
              <Text style={styles.primaryText}>NEXT</Text>
            </Pressable>
          )}

          {step === 'burned' && (
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
          )}

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
    paddingVertical: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.navy,
    borderRadius: 10,
    backgroundColor: colors.cream,
  },
  hidden: {
    opacity: 0,
  },
  backText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  bigNumber: {
    fontFamily: fonts.pixel,
    fontSize: 22,
    lineHeight: 30,
    color: colors.arcadeYellow,
    textAlign: 'center',
  },
  answers: {
    gap: 12,
  },
  options: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  explain: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.navy,
  },
  note: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.berry,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.plum,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
