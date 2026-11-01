import { useEffect } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { LiloMoodArt } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';

const CARD_WIDTH = 160;
const CARD_HEIGHT = 236;
const MAX_TILT = 14; // degrees, while a finger is on the card
const IDLE_TILT = 0.45; // share of MAX_TILT the card gently rocks by on its own
const TAP_SLOP = 12; // finger can move this far and still count as a tap
const GLARE_SIZE = 240;

type Props = {
  label: string;
  stat: string;
  title: string;
  subtitle: string;
  tint: string; // CSS linear-gradient for the card face
  accessibilityLabel: string;
  selected?: boolean;
  dimmed?: boolean;
  scale?: number;
  phaseOffset?: number; // so two cards don't rock in sync
  onPress: () => void;
};

// A holographic "player card": it slowly rocks and shimmers on its own,
// and tilts towards the user's finger with a moving rainbow foil and glare.
export function HoloCard({
  label,
  stat,
  title,
  subtitle,
  tint,
  accessibilityLabel,
  selected = false,
  dimmed = false,
  scale = 1,
  phaseOffset = 0,
  onPress,
}: Props) {
  const reduceMotion = useReducedMotion();
  const touchX = useSharedValue(0.5); // 0 = left edge, 1 = right edge
  const touchY = useSharedValue(0.5); // 0 = top, 1 = bottom
  const active = useSharedValue(0); // 1 while a finger is on the card
  const idle = useSharedValue(0); // how much the card rocks by itself
  const phase = useSharedValue(0); // 0 → 1, loops forever
  const start = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    phase.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.linear }), -1, false));
  }, [reduceMotion, phase]);

  useEffect(() => {
    const rocking = !reduceMotion && !selected && !dimmed;
    idle.set(withTiming(rocking ? 1 : 0, { duration: 500 }));
  }, [reduceMotion, selected, dimmed, idle]);

  // Where the "light" is: the finger while touching, otherwise a slow circle
  const light = useDerivedValue(() => {
    const angle = (phase.get() + phaseOffset) * 2 * Math.PI;
    const a = active.get();
    const x = a * touchX.get() + (1 - a) * (0.5 + 0.45 * Math.sin(angle));
    const y = a * touchY.get() + (1 - a) * (0.5 + 0.3 * Math.cos(angle));
    const strength = a + (1 - a) * idle.get() * IDLE_TILT;
    return { x, y, strength, shine: a + (1 - a) * idle.get() * 0.55 };
  });

  const track = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    touchX.set(Math.min(1, Math.max(0, locationX / CARD_WIDTH)));
    touchY.set(Math.min(1, Math.max(0, locationY / CARD_HEIGHT)));
  };

  const cardStyle = useAnimatedStyle(() => {
    const { x, y, strength } = light.get();
    return {
      transform: [
        { perspective: 650 },
        { translateY: -6 * idle.get() * Math.sin((phase.get() + phaseOffset) * 4 * Math.PI) },
        { rotateX: `${(0.5 - y) * 2 * MAX_TILT * strength}deg` },
        { rotateY: `${(x - 0.5) * 2 * MAX_TILT * strength}deg` },
        { scale: 1 + 0.06 * active.get() },
      ],
    };
  });

  const foilStyle = useAnimatedStyle(() => {
    const { x, y, shine } = light.get();
    return {
      opacity: 0.25 + 0.55 * shine,
      transform: [
        { translateX: (0.5 - x) * CARD_WIDTH * 1.4 },
        { translateY: (0.5 - y) * CARD_HEIGHT * 0.4 },
      ],
    };
  });

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.6 * light.get().shine,
    transform: [{ translateX: (light.get().x - 0.5) * 30 }],
  }));

  const glareStyle = useAnimatedStyle(() => {
    const { x, y, shine } = light.get();
    return {
      opacity: 0.35 + 0.65 * shine,
      transform: [
        { translateX: x * CARD_WIDTH - GLARE_SIZE / 2 },
        { translateY: y * CARD_HEIGHT - GLARE_SIZE / 2 },
      ],
    };
  });

  return (
    <View
      style={{
        width: CARD_WIDTH * scale,
        height: CARD_HEIGHT * scale,
        opacity: dimmed ? 0.85 : 1,
      }}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onPress}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          start.set({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
          track(event);
          active.set(withSpring(1, { damping: 18, stiffness: 240 }));
        }}
        onResponderMove={track}
        onResponderRelease={(event) => {
          active.set(withSpring(0, { damping: 14, stiffness: 120 }));
          const moved = Math.hypot(
            event.nativeEvent.pageX - start.get().x,
            event.nativeEvent.pageY - start.get().y,
          );
          if (moved < TAP_SLOP) {
            onPress();
          }
        }}
        onResponderTerminate={() => active.set(withSpring(0))}
        style={[styles.card, { transformOrigin: 'top left', transform: [{ scale }] }]}>
        <Animated.View
          style={[styles.frame, selected && styles.selected, cardStyle]}
          pointerEvents="none">
          <View style={[styles.face, { backgroundImage: tint }]}>
            <View style={styles.header}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.stat}>{stat}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.art}>
              <LiloMoodArt mood="welcome" pixelSize={3} />
              <View style={[styles.spark, { left: 12, top: 14, backgroundColor: colors.arcadeYellow }]} />
              <View style={[styles.spark, { right: 14, bottom: 16, backgroundColor: colors.cream }]} />
            </View>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <Text style={styles.cta}>TAP TO PLAY</Text>
          </View>

          {/* Holographic layers on top of the card face */}
          <Animated.View style={[styles.foil, foilStyle]} />
          <Animated.View style={[styles.sparkles, sparkleStyle]} />
          <Animated.View style={[styles.glare, glareStyle]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  frame: {
    flex: 1,
    borderRadius: 14,
    padding: 6,
    overflow: 'hidden',
    backgroundImage: 'linear-gradient(135deg, #F4F4F8, #B9BCC8 40%, #FFFFFF 55%, #A6A9B6)',
    boxShadow: '0 12px 24px rgba(90, 35, 64, 0.35)',
  },
  selected: {
    borderWidth: 3,
    borderColor: colors.navy,
  },
  face: {
    flex: 1,
    borderRadius: 9,
    padding: 8,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.cream,
    backgroundColor: colors.navy,
    borderRadius: 4,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  stat: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 10,
    color: colors.onAccent,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    color: colors.onAccent,
  },
  art: {
    height: 104,
    borderRadius: 6,
    backgroundColor: colors.navy,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    width: 4,
    height: 4,
  },
  subtitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.onAccent,
  },
  cta: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    textAlign: 'center',
    color: colors.onAccent,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(27,27,58,0.35)',
    paddingTop: 6,
  },
  // Rainbow bands that slide across the card as the light moves
  foil: {
    position: 'absolute',
    top: -CARD_HEIGHT * 0.25,
    left: -CARD_WIDTH,
    width: CARD_WIDTH * 3,
    height: CARD_HEIGHT * 1.5,
    mixBlendMode: 'overlay',
    backgroundImage:
      'linear-gradient(115deg, transparent 18%, rgba(255,92,138,0.9) 26%, rgba(255,210,63,0.9) 32%, rgba(61,220,132,0.9) 38%, rgba(92,200,255,0.9) 44%, rgba(176,124,255,0.9) 50%, transparent 58%, rgba(255,92,138,0.7) 66%, rgba(92,200,255,0.7) 72%, transparent 80%)',
  },
  // Fine diagonal glitter lines
  sparkles: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -20,
    right: -20,
    mixBlendMode: 'overlay',
    backgroundImage:
      'linear-gradient(55deg, transparent 14%, rgba(255,255,255,0.9) 15%, transparent 16%, transparent 29%, rgba(255,255,255,0.9) 30%, transparent 31%, transparent 44%, rgba(255,255,255,0.9) 45%, transparent 46%, transparent 59%, rgba(255,255,255,0.9) 60%, transparent 61%, transparent 74%, rgba(255,255,255,0.9) 75%, transparent 76%, transparent 89%, rgba(255,255,255,0.9) 90%, transparent 91%)',
  },
  // Bright spot that follows the light
  glare: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: GLARE_SIZE,
    height: GLARE_SIZE,
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.65), rgba(255,255,255,0) 60%)',
  },
});
