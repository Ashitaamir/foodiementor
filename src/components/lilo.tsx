import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MOOD_COLORS, MOODS, type LiloMood } from '@/components/lilo-moods';
import { PixelArt, toPixelRows } from '@/components/pixel-art';

// Lilo the lychee, drawn on a 16 x 16 pixel grid (one letter = one pixel):
// a bumpy pink shell peeled open at the front, showing the white fruit as her face.
const MAP = [
  '.......gG.......',
  '......gGG.......',
  '.....DDgDDD.....',
  '...DDRRPRRRDD...',
  '..DRRPRRRPRRRD..',
  '.DRPRWWWWWWRPRD.',
  '.DRRWWWWWWWWRRD.',
  'DRPWWSKWWSKWWPRD',
  'DRRWWKKWWKKWWRRD',
  'DRPWBWWWWWWBWPRD',
  'DRRWWWWMMWWWWRRD',
  '.DRPWWWWWWWWPRD.',
  '.DRRRWWWWWWRRRD.',
  '..DRPRRPRRPRRD..',
  '...DDRRRRRRDD...',
  '.....DDDDDD.....',
];

const COLORS: Record<string, string> = {
  D: '#7A1235', // shell outline
  R: '#E8325F', // shell
  P: '#FF7FA3', // shell highlight
  W: '#FFF8F0', // fruit (face)
  K: '#1B1B3A', // eyes
  S: '#FFFFFF', // eye shine
  B: '#FF9EB8', // blush
  G: '#3DDC84', // leaf
  g: '#1E8F55', // leaf shade
  M: '#7A1235', // mouth
};

// Same face with eyes shut: the top of each eye turns to fruit, leaving a little line
const BLINK_MAP = MAP.map((row, index) => (index === 7 ? row.replace(/[SK]/g, 'W') : row));

const GRID_WIDTH = MAP[0].length;
const GRID_HEIGHT = MAP.length;
const ROWS = toPixelRows(MAP, COLORS);
const BLINK_ROWS = toPixelRows(BLINK_MAP, COLORS);

const BLINK_EVERY_MS = 3200;
const BLINK_FOR_MS = 160;

type Props = {
  pixelSize?: number;
  bob?: boolean;
  blink?: boolean;
};

// Closes Lilo's eyes for a moment every few seconds (sometimes a double blink)
function useBlinking(enabled: boolean) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const blinkOnce = (delay: number) => {
      timers.push(setTimeout(() => setClosed(true), delay));
      timers.push(setTimeout(() => setClosed(false), delay + BLINK_FOR_MS));
    };
    const interval = setInterval(() => {
      blinkOnce(0);
      if (Math.random() < 0.3) blinkOnce(BLINK_FOR_MS * 2);
    }, BLINK_EVERY_MS);
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [enabled]);

  return closed;
}

export function Lilo({ pixelSize = 6, bob = false, blink = false }: Props) {
  const reduceMotion = useReducedMotion();
  const eyesClosed = useBlinking(blink && !reduceMotion);
  const bobStyle = useBob(bob && !reduceMotion);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Lilo the lychee, the FoodieMentor mascot"
      style={[{ width: pixelSize * GRID_WIDTH, height: pixelSize * GRID_HEIGHT }, bobStyle]}>
      <PixelArt rows={eyesClosed ? BLINK_ROWS : ROWS} pixelSize={pixelSize} />
    </Animated.View>
  );
}

// Gentle up-and-down float
function useBob(enabled: boolean) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (enabled) {
      offset.set(
        withRepeat(
          withSequence(withTiming(-4, { duration: 1200 }), withTiming(0, { duration: 1200 })),
          -1,
        ),
      );
    }
  }, [enabled, offset]);

  return useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
}

// The bigger, more detailed Lilo with a mood and accessory for each moment
const MOOD_ROWS = Object.fromEntries(
  (Object.keys(MOODS) as LiloMood[]).map((mood) => {
    const { map, blink } = MOODS[mood];
    const shut = map.map((row, index) => blink[index] ?? row);
    return [mood, { open: toPixelRows(map, MOOD_COLORS), shut: toPixelRows(shut, MOOD_COLORS) }];
  }),
) as Record<LiloMood, { open: ReturnType<typeof toPixelRows>; shut: ReturnType<typeof toPixelRows> }>;

const MOOD_LABELS: Record<LiloMood, string> = {
  welcome: 'Lilo the lychee, smiling and waving',
  workout: 'Lilo the lychee, lifting weights in a headband',
  thinking: 'Lilo the lychee, thinking with a spoon',
  chef: 'Lilo the lychee in a chef hat',
  goal: 'Lilo the lychee, winking with sparkles',
  sleepy: 'Lilo the lychee, sleeping',
};

const MOOD_WIDTH = MOODS.welcome.map[0].length;
const MOOD_HEIGHT = MOODS.welcome.map.length;

type MoodProps = {
  mood: LiloMood;
  pixelSize?: number;
  bob?: boolean;
};

export function LiloMoodArt({ mood, pixelSize = 4, bob = false }: MoodProps) {
  const reduceMotion = useReducedMotion();
  const canBlink = Object.keys(MOODS[mood].blink).length > 0;
  const eyesClosed = useBlinking(canBlink && !reduceMotion);
  const bobStyle = useBob(bob && !reduceMotion);
  const rows = MOOD_ROWS[mood];

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={MOOD_LABELS[mood]}
      style={[{ width: pixelSize * MOOD_WIDTH, height: pixelSize * MOOD_HEIGHT }, bobStyle]}>
      <PixelArt rows={eyesClosed ? rows.shut : rows.open} pixelSize={pixelSize} />
    </Animated.View>
  );
}

type PeekProps = {
  side?: 'left' | 'right';
  pixelSize?: number;
};

// Lilo peeking in from the edge of the screen, tilted, blinking and gently bobbing.
// Purely decorative: sits on top of the screen but lets taps through.
export function PeekingLilo({ side = 'right', pixelSize = 6 }: PeekProps) {
  const size = pixelSize * GRID_WIDTH;
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[
        styles.peek,
        side === 'right' ? { right: -size * 0.38 } : { left: -size * 0.38 },
        { transform: [{ rotate: side === 'right' ? '-22deg' : '22deg' }] },
      ]}>
      <Lilo pixelSize={pixelSize} bob blink />
    </View>
  );
}

const styles = StyleSheet.create({
  peek: {
    position: 'absolute',
    bottom: 6,
  },
});
