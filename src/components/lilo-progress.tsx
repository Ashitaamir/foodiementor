import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Lilo } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';

const LILO_SIZE = 32; // 16 pixels x 2
const BAR_HEIGHT = 16;

type Props = {
  step: number; // 0-based
  total: number;
};

// A pixel progress bar with Lilo running along in front of the fill.
export function LiloProgress({ step, total }: Props) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const fraction = total > 0 ? (step + 1) / total : 0;

  useEffect(() => {
    progress.set(reduceMotion ? fraction : withSpring(fraction, { damping: 16, stiffness: 120 }));
  }, [fraction, reduceMotion, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: progress.get() * width }));
  const liloStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.min(width - LILO_SIZE, Math.max(0, progress.get() * width - LILO_SIZE / 2)) },
    ],
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Question ${step + 1} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step + 1 }}
      style={styles.wrap}>
      <View style={styles.liloLane}>
        <Animated.View style={liloStyle}>
          <Lilo pixelSize={2} bob />
        </Animated.View>
      </View>
      <View style={styles.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 6)}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <Text style={styles.count}>
        {step + 1} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  liloLane: {
    height: LILO_SIZE,
  },
  track: {
    height: BAR_HEIGHT,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.lycheePink,
  },
  count: {
    alignSelf: 'flex-end',
    fontFamily: fonts.pixel,
    fontSize: 8,
    color: colors.navy,
  },
});
