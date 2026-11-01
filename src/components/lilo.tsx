import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

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

const GRID_WIDTH = MAP[0].length;
const GRID_HEIGHT = MAP.length;

// Merge neighbouring pixels of the same colour into one block per row (fewer views to draw)
const ROWS = MAP.map((row) => {
  const runs: { color: string | null; length: number }[] = [];
  for (const char of row) {
    const color = COLORS[char] ?? null;
    const last = runs[runs.length - 1];
    if (last && last.color === color) {
      last.length += 1;
    } else {
      runs.push({ color, length: 1 });
    }
  }
  return runs;
});

type Props = {
  pixelSize?: number;
  bob?: boolean;
};

export function Lilo({ pixelSize = 6, bob = false }: Props) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (bob && !reduceMotion) {
      offset.set(
        withRepeat(
          withSequence(withTiming(-4, { duration: 1200 }), withTiming(0, { duration: 1200 })),
          -1,
        ),
      );
    }
  }, [bob, reduceMotion, offset]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Lilo the lychee, the FoodieMentor mascot"
      style={[{ width: pixelSize * GRID_WIDTH, height: pixelSize * GRID_HEIGHT }, bobStyle]}>
      {ROWS.map((runs, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {runs.map((run, runIndex) => (
            <View
              key={runIndex}
              style={{
                width: run.length * pixelSize,
                height: pixelSize,
                backgroundColor: run.color ?? 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
