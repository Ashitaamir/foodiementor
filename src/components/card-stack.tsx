import { BlurTargetView, BlurView } from 'expo-blur';
import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const STACK_WIDTH = 250;
const STACK_HEIGHT = 200;

type Props = {
  front: ReactNode; // the chosen card, shown at 0.8 size
  back: ReactNode; // the other card, shown at 0.62 size
  backOnLeft: boolean; // keep the back card on the side it came from
};

// After a card is chosen: it pops out of the stack and stands in front,
// while the other card tucks in behind it, tilted and blurred.
export function CardStack({ front, back, backOnLeft }: Props) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const backTarget = useRef<ComponentRef<typeof View>>(null);
  const side = backOnLeft ? -1 : 1;

  useEffect(() => {
    pop.set(withSpring(1, { damping: 13, stiffness: 140 }));
  }, [pop]);

  const frontStyle = useAnimatedStyle(() => {
    const p = pop.get();
    return {
      transform: [
        { translateX: (1 - p) * -side * 40 },
        { translateY: (1 - p) * 28 - p * 4 },
        { rotate: `${(1 - p) * side * -8}deg` },
        { scale: 0.88 + 0.12 * p },
      ],
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const p = pop.get();
    return {
      opacity: 1 - 0.25 * p,
      transform: [
        { translateX: p * side * 14 },
        { translateY: p * 16 },
        { rotate: `${p * side * 10}deg` },
      ],
    };
  });

  return (
    <View style={styles.stack}>
      <Animated.View style={[styles.back, backOnLeft ? styles.left : styles.right, backStyle]}>
        <BlurTargetView ref={backTarget}>{back}</BlurTargetView>
        <BlurView
          pointerEvents="none"
          intensity={22}
          tint="light"
          blurTarget={backTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.blur}
        />
      </Animated.View>
      <Animated.View style={[styles.front, frontStyle]}>{front}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: STACK_WIDTH,
    height: STACK_HEIGHT,
  },
  back: {
    position: 'absolute',
    top: 18,
  },
  left: {
    left: 0,
  },
  right: {
    right: 0,
  },
  blur: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    overflow: 'hidden',
  },
  front: {
    position: 'absolute',
    top: 4,
    left: (STACK_WIDTH - 128) / 2,
  },
});
