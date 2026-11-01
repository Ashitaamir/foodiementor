import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '@/constants/fm-theme';

// Thin dark lines across the screen, like an old CRT
const SCANLINES = `linear-gradient(180deg, ${Array.from({ length: 30 }, (_, i) => {
  const start = (i * 100) / 30;
  return `rgba(0,0,0,0.22) ${start.toFixed(2)}%, transparent ${(start + 1.6).toFixed(2)}%, transparent ${(start + 3.33).toFixed(2)}%`;
}).join(', ')})`;

type Props = {
  channel: number | string; // changing it replays the "switch on" effect
  title: string;
  subtitle?: string;
  children?: ReactNode; // extra content on the screen (e.g. a big number)
};

// A retro TV that shows the current question on its screen.
export function RetroTV({ channel, title, subtitle, children }: Props) {
  const reduceMotion = useReducedMotion();
  const on = useSharedValue(1);

  // Replay the CRT switch-on whenever the question changes
  useEffect(() => {
    if (reduceMotion) {
      on.set(1);
      return;
    }
    on.set(0);
    on.set(withTiming(1, { duration: 420 }));
  }, [channel, reduceMotion, on]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: on.get(),
    transform: [{ scaleY: 0.04 + 0.96 * on.get() }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: 0.85 * (1 - on.get()) }));

  return (
    <View style={styles.wrap}>
      <View style={styles.antennas} aria-hidden>
        <View style={[styles.antenna, { transform: [{ rotate: '-28deg' }], left: 52 }]} />
        <View style={[styles.antenna, { transform: [{ rotate: '28deg' }], right: 52 }]} />
        <View style={styles.antennaBase} />
      </View>

      <View style={styles.body}>
        <View style={styles.screen}>
          <Animated.View style={[styles.screenContent, contentStyle]}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children}
          </Animated.View>
          <View style={[styles.scanlines, { backgroundImage: SCANLINES }]} pointerEvents="none" />
          <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />
        </View>

        <View style={styles.panel} aria-hidden>
          <View style={styles.knob} />
          <View style={styles.knob} />
          <View style={styles.grill}>
            {[0, 1, 2, 3].map((line) => (
              <View key={line} style={styles.grillLine} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.feet} aria-hidden>
        <View style={styles.foot} />
        <View style={styles.foot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  antennas: {
    width: 220,
    height: 42,
  },
  antenna: {
    position: 'absolute',
    bottom: 0,
    width: 4,
    height: 46,
    backgroundColor: colors.navy,
  },
  antennaBase: {
    position: 'absolute',
    bottom: -4,
    left: 90,
    width: 40,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.navy,
  },
  body: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.berry,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  screen: {
    flex: 1,
    minHeight: 168,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.cream,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  screenContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    lineHeight: 20,
    color: colors.cream,
    textAlign: 'center',
    textShadowColor: colors.lycheePink,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  subtitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.onInkMuted,
    textAlign: 'center',
  },
  scanlines: {
    ...StyleSheet.absoluteFill,
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.cream,
  },
  panel: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.arcadeYellow,
  },
  grill: {
    gap: 4,
    marginTop: 4,
  },
  grillLine: {
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.navy,
  },
  feet: {
    width: '70%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  foot: {
    width: 26,
    height: 10,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.navy,
  },
});
