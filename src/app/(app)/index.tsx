import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalorieBar, withCommas } from '@/components/calorie-bar';
import { Lilo } from '@/components/lilo';
import { LogConsole } from '@/components/log-console';
import { colors, fonts } from '@/constants/fm-theme';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useToday, type DayLog } from '@/lib/today';

const GRAMS_PER_OUNCE = 28.3495;

function amountText(log: DayLog, imperial: boolean) {
  const weight = imperial
    ? `${(log.grams / GRAMS_PER_OUNCE).toFixed(1)} oz`
    : `${Math.round(log.grams)} g`;
  if (log.portion_label && log.portion_count) {
    return `${log.portion_count} × ${log.portion_label} · ${weight}`;
  }
  return weight;
}

// Today at a glance: calories against the goal, macros, and what's been logged.
export default function HomeScreen() {
  const { profile } = useProfile();
  const { totals, logs, error, load } = useToday();
  const [refreshing, setRefreshing] = useState(false);
  const imperial = profile?.unit_system === 'imperial';
  const goal = totals?.daily_calorie_goal ?? profile?.daily_calorie_goal ?? 0;

  // Reload whenever Home comes back into view (e.g. after logging a meal)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const macros = [
    { label: 'PROTEIN', value: totals?.protein_g ?? 0 },
    { label: 'CARBS', value: totals?.carbs_g ?? 0 },
    { label: 'FAT', value: totals?.fat_g ?? 0 },
    { label: 'FIBRE', value: totals?.fibre_g ?? 0 },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />
        }>
        <View style={styles.greeting}>
          <Lilo pixelSize={3} bob />
          <View style={styles.greetingText}>
            <Text style={styles.hello} accessibilityRole="header">
              Hi, {profile?.display_name ?? 'player'}!
            </Text>
            <Text style={styles.subtle}>Let&apos;s see how today is going.</Text>
          </View>
        </View>

        <CalorieBar eaten={Number(totals?.energy_kcal ?? 0)} goal={goal} />

        <View style={styles.macroGrid}>
          {macros.map((macro) => (
            <View
              key={macro.label}
              style={styles.macroCard}
              accessible
              accessibilityLabel={`${macro.label.toLowerCase()} ${Math.round(Number(macro.value))} grams`}>
              <Text style={styles.macroLabel}>{macro.label}</Text>
              <Text style={styles.macroValue}>{Math.round(Number(macro.value))} g</Text>
            </View>
          ))}
        </View>

        <LogConsole onSelect={(mode) => router.push({ pathname: '/log', params: { mode } })} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            TODAY&apos;S FOOD
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {!error && logs.length === 0 && (
            <View style={styles.empty}>
              <Lilo pixelSize={4} />
              <Text style={styles.emptyText}>Nothing logged yet. Tell Lilo what you ate!</Text>
            </View>
          )}
          {logs.map((log) => (
            <View key={log.id} style={styles.foodRow}>
              <View style={styles.foodText}>
                <Text style={styles.foodName}>{log.food_name}</Text>
                <Text style={styles.subtle}>{amountText(log, imperial)}</Text>
              </View>
              <Text style={styles.foodKcal}>{withCommas(Number(log.energy_kcal))} kcal</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/setup')}
            style={styles.linkButton}>
            <Text style={styles.linkText}>Retake survey</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => supabase.auth.signOut()}
            style={styles.linkButton}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        </View>
        <Text style={styles.credit}>
          Food data: UK CoFID 2021 (Open Government Licence v3.0) and U.S. Department of
          Agriculture FoodData Central.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.blush,
  },
  content: {
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greetingText: {
    flex: 1,
    gap: 4,
  },
  hello: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    lineHeight: 20,
    color: colors.navy,
  },
  subtle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.plum,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  macroLabel: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: colors.plum,
  },
  macroValue: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 17,
    color: colors.navy,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.navy,
  },
  error: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.berry,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  emptyText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.plum,
    textAlign: 'center',
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.fieldLine,
    backgroundColor: colors.cream,
  },
  foodText: {
    flex: 1,
    gap: 2,
  },
  foodName: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  foodKcal: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
  credit: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.plum,
    textAlign: 'center',
  },
});
