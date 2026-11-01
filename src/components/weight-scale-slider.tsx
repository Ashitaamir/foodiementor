import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { Lilo } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';
import { kgToPounds } from '@/lib/calorie-goal';

const HANDLE = 30;

type Props = {
  value: number; // kg per week
  min: number;
  max: number;
  step: number;
  metric: boolean;
  onChange: (value: number) => void;
};

export function formatRate(kgPerWeek: number, metric: boolean) {
  return metric
    ? `${kgPerWeek.toFixed(2).replace(/0$/, '')} kg`
    : `${kgToPounds(kgPerWeek).toFixed(1)} lb`;
}

// Lilo stands on a pixel bathroom scale; drag the weight along the track to choose kg per week.
export function WeightScaleSlider({ value, min, max, step, metric, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const fraction = (value - min) / (max - min);
  const label = `${formatRate(value, metric)} per week`;

  const snap = (raw: number) => {
    const stepped = Math.round((raw - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(2))));
  };

  const fromTouch = (event: GestureResponderEvent) => {
    if (trackWidth <= 0) return;
    const x = event.nativeEvent.locationX - HANDLE / 2;
    const next = snap(min + (x / (trackWidth - HANDLE)) * (max - min));
    if (next !== value) onChange(next);
  };

  const nudge = (direction: 1 | -1) => onChange(snap(value + direction * step));

  return (
    <View style={styles.wrap}>
      <View style={styles.scaleArea} aria-hidden>
        <Lilo pixelSize={3} />
        {/* The scale platform sinks a little more the bigger the amount */}
        <View style={[styles.platform, { transform: [{ translateY: fraction * 4 }] }]}>
          <View style={styles.dial}>
            <Text style={styles.dialText}>{formatRate(value, metric)}</Text>
            <Text style={styles.dialUnit}>/ WEEK</Text>
          </View>
        </View>
        <View style={styles.shadow} />
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Amount per week"
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Less"
          onPress={() => nudge(-1)}
          style={styles.stepButton}>
          <Text style={styles.stepText}>-</Text>
        </Pressable>

        <View
          style={styles.trackArea}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={fromTouch}
          onResponderMove={fromTouch}>
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.fill, { width: fraction * Math.max(0, trackWidth - HANDLE) + HANDLE / 2 }]} />
          </View>
          <View
            pointerEvents="none"
            style={[styles.handle, { left: fraction * Math.max(0, trackWidth - HANDLE) }]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => nudge(1)}
          style={styles.stepButton}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.ends}>
        <Text style={styles.endText}>{formatRate(min, metric)}</Text>
        <Text style={styles.endText}>{formatRate(max, metric)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  scaleArea: {
    alignItems: 'center',
  },
  platform: {
    width: 190,
    height: 64,
    marginTop: -4,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  dial: {
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.navy,
    alignItems: 'center',
  },
  dialText: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: colors.arcadeYellow,
  },
  dialUnit: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    marginTop: 4,
    color: colors.cream,
  },
  shadow: {
    width: 170,
    height: 8,
    marginTop: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(90, 35, 64, 0.2)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  trackArea: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
  },
  track: {
    height: 14,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.lycheePink,
  },
  handle: {
    position: 'absolute',
    top: (48 - HANDLE) / 2,
    width: HANDLE,
    height: HANDLE,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.arcadeYellow,
    boxShadow: `3px 3px 0 ${colors.navy}`,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 54,
  },
  endText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.plum,
  },
});
