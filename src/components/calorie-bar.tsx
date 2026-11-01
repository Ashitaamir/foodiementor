import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/fm-theme';

const SEGMENTS = 20;

type Props = {
  eaten: number;
  goal: number;
  burned?: number; // calories burned today, shown when they're added back to the goal
};

export function withCommas(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// A game-style "health bar" made of pixel blocks that fills as the day's calories add up.
export function CalorieBar({ eaten, goal, burned = 0 }: Props) {
  const over = eaten > goal;
  const filled = goal > 0 ? Math.min(SEGMENTS, Math.round((eaten / goal) * SEGMENTS)) : 0;
  const left = Math.abs(goal - eaten);
  const summary = over ? `${withCommas(left)} kcal over` : `${withCommas(left)} kcal left`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${withCommas(eaten)} of ${withCommas(goal)} calories today, ${summary}`}
      accessibilityValue={{ min: 0, max: goal, now: Math.min(eaten, goal) }}
      style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>TODAY</Text>
        <Text style={[styles.summary, over && styles.summaryOver]}>{summary}</Text>
      </View>
      <Text style={styles.numbers}>
        {withCommas(eaten)} <Text style={styles.goal}>/ {withCommas(goal)} kcal</Text>
      </Text>
      {burned > 0 && (
        <Text style={styles.burned}>Includes +{withCommas(burned)} kcal burned from workouts</Text>
      )}
      <View style={styles.bar}>
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              index < filled && (over ? styles.segmentOver : styles.segmentFilled),
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.navy,
  },
  summary: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.navy,
  },
  summaryOver: {
    color: colors.berry,
  },
  // Numbers stay in the readable body font; pixel font is only for labels
  numbers: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 30,
    color: colors.navy,
    fontVariant: ['tabular-nums'],
  },
  burned: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.plum,
  },
  goal: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.plum,
  },
  bar: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  segment: {
    flex: 1,
    height: 18,
    backgroundColor: '#3A3A70',
  },
  segmentFilled: {
    backgroundColor: colors.lycheePink,
  },
  segmentOver: {
    backgroundColor: colors.arcadeYellow,
  },
});
