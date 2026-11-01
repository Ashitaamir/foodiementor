import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { LiloMoodArt } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';

export type UnlockItem = {
  number: number;
  title: string;
  detail: string;
  color: string;
  startRotate: number; // the cartridge's tilt in the fan, so it straightens as it zooms in
};

type Props = {
  item: UnlockItem | null;
  onPlay: () => void;
  onClose: () => void;
};

// Pixel sparkles that burst out from behind the card
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { x: Math.cos(angle) * 170, y: Math.sin(angle) * 210, color: i % 2 ? colors.arcadeYellow : colors.cream };
});

// The chosen cartridge zooms to the front like a game level being unlocked,
// big enough to read, with PLAY to start and BACK to choose another.
export function UnlockCard({ item, onPlay, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const zoom = useSharedValue(0);
  const burst = useSharedValue(0);
  const banner = useSharedValue(0);

  useEffect(() => {
    if (!item) return;
    if (reduceMotion) {
      zoom.set(1);
      banner.set(1);
      return;
    }
    zoom.set(0);
    burst.set(0);
    banner.set(0);
    zoom.set(withSpring(1, { damping: 13, stiffness: 140 }));
    burst.set(withDelay(120, withTiming(1, { duration: 650 })));
    banner.set(withDelay(200, withSequence(withSpring(1.15), withSpring(1))));
  }, [item, reduceMotion, zoom, burst, banner]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, zoom.get() * 2),
    transform: [
      { scale: 0.35 + 0.65 * zoom.get() },
      { rotate: `${(item?.startRotate ?? 0) * (1 - zoom.get())}deg` },
    ],
  }));
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, banner.get()),
    transform: [{ scale: banner.get() }],
  }));

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {item && (
          <>
            {!reduceMotion &&
              SPARKS.map((spark, index) => (
                <Spark key={index} {...spark} progress={burst} />
              ))}

            <Animated.Text style={[styles.banner, bannerStyle]} accessibilityRole="header">
              MODE UNLOCKED!
            </Animated.Text>

            <Animated.View style={[styles.card, cardStyle]}>
              <View style={styles.notch} />
              <View style={[styles.label, { backgroundColor: item.color }]}>
                <Text style={styles.number}>{item.number}</Text>
                <Text style={styles.title}>{item.title}</Text>
              </View>
              <View style={styles.mascot}>
                <LiloMoodArt mood="goal" pixelSize={3} />
              </View>
              <Text style={styles.detail}>{item.detail}</Text>
            </Animated.View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={onPlay}
                style={({ pressed }) => [styles.play, pressed && styles.pressed]}>
                <Text style={styles.playText}>PLAY ▶</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to the other modes"
                onPress={onClose}
                style={styles.back}>
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

type SparkProps = {
  x: number;
  y: number;
  color: string;
  progress: ReturnType<typeof useSharedValue<number>>;
};

function Spark({ x, y, color, progress }: SparkProps) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateX: x * progress.get() }, { translateY: y * progress.get() }],
  }));
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    padding: 24,
    backgroundColor: 'rgba(27, 27, 58, 0.85)',
  },
  spark: {
    position: 'absolute',
    width: 10,
    height: 10,
  },
  banner: {
    fontFamily: fonts.pixel,
    fontSize: 16,
    color: colors.arcadeYellow,
    textShadowColor: colors.lycheePink,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  mascot: {
    alignItems: 'center',
  },
  card: {
    width: 250,
    minHeight: 330,
    padding: 12,
    gap: 14,
    borderRadius: 14,
    borderTopRightRadius: 4,
    borderWidth: 4,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `6px 6px 0 ${colors.lycheePink}`,
  },
  notch: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 34,
    height: 22,
    backgroundColor: 'rgba(27, 27, 58, 1)',
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderColor: colors.navy,
  },
  label: {
    minHeight: 170,
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.navy,
    justifyContent: 'center',
  },
  number: {
    fontFamily: fonts.pixel,
    fontSize: 28,
    color: colors.navy,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    lineHeight: 22,
    color: colors.navy,
  },
  detail: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.navy,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'center',
    gap: 6,
  },
  play: {
    minWidth: 200,
    height: 56,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.cream,
    backgroundColor: colors.lycheePink,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.arcadeYellow}`,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  playText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  back: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.cream,
    textDecorationLine: 'underline',
  },
});
