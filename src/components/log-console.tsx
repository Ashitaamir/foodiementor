import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { UnlockCard } from '@/components/unlock-card';
import { colors, fonts } from '@/constants/fm-theme';

export type LogMode = 'scan' | 'chat' | 'recipe' | 'batch' | 'instagram';

const SILVER = 'linear-gradient(180deg, #F1F3F6, #CDD2DA 45%, #AEB4BE)';
const CONSOLE_HEIGHT = 150;
const CARD_WIDTH = 78;
const CARD_HEIGHT = 136;
const FAN_SPACE = 170; // room above the console for the fanned-out cartridges

// `hint` is printed on the small cartridge; `detail` shows when it zooms to the front
const MODES: { mode: LogMode; title: string; hint: string; detail: string; color: string }[] = [
  {
    mode: 'scan',
    title: 'Scan with camera',
    hint: 'Snap a plate or barcode',
    detail: "Take a photo of your meal, or scan a packet's barcode, and Lilo will find the food for you.",
    color: colors.lycheePink,
  },
  {
    mode: 'chat',
    title: 'Chat with Lilo',
    hint: 'Type what you ate',
    detail: 'Tell Lilo what you ate in your own words, like "2 rotis and a bowl of dal".',
    color: colors.arcadeYellow,
  },
  {
    mode: 'recipe',
    title: 'Make a recipe',
    hint: 'Mix your own dish',
    detail: 'Add your ingredients and amounts to build your own dish.',
    color: colors.leafGreen,
  },
  {
    mode: 'batch',
    title: 'Meal prep batch',
    hint: 'Cook once, eat all week',
    detail: 'Cook a big batch once, then log one portion at a time all week.',
    color: '#5CC8FF',
  },
  {
    mode: 'instagram',
    title: 'Insta recipe',
    hint: 'Paste a caption or screenshot',
    detail: 'Paste a recipe caption or screenshot from Instagram and Lilo will read it.',
    color: '#B07CFF',
  },
];

// Where each cartridge ends up in the fan: sideways shift, tilt and how high it rises
const FAN = [
  { x: -124, rotate: -24, lift: 18 },
  { x: -62, rotate: -12, lift: 44 },
  { x: 0, rotate: 0, lift: 54 },
  { x: 62, rotate: 12, lift: 44 },
  { x: 124, rotate: 24, lift: 18 },
];

type Props = {
  onSelect: (mode: LogMode) => void;
};

// A silver retro handheld that says LOG A MEAL. Tapping it fans game cartridges
// out of its top, one for each way of logging food.
export function LogConsole({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [featured, setFeatured] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const featuredMode = featured === null ? null : MODES[featured];
  const blink = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    blink.set(
      withRepeat(withSequence(withTiming(0.2, { duration: 500 }), withTiming(1, { duration: 500 })), -1),
    );
  }, [reduceMotion, blink]);

  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.get() }));

  return (
    <View style={[styles.stage, { height: CONSOLE_HEIGHT + (open ? FAN_SPACE : 0) }]}>
      {open &&
        MODES.map((item, index) => (
          <Cartridge
            key={item.mode}
            index={index}
            title={item.title}
            hint={item.hint}
            color={item.color}
            animate={!reduceMotion}
            onPress={() => setFeatured(index)}
          />
        ))}

      <UnlockCard
        item={
          featuredMode && featured !== null
            ? {
                number: featured + 1,
                title: featuredMode.title,
                detail: featuredMode.detail,
                color: featuredMode.color,
                startRotate: FAN[featured].rotate,
              }
            : null
        }
        onPlay={() => {
          if (!featuredMode) return;
          setFeatured(null);
          setOpen(false);
          onSelect(featuredMode.mode);
        }}
        onClose={() => setFeatured(null)}
      />

      {/* Drawn after the cartridges so they start hidden "inside" the console */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log a meal"
        accessibilityHint={open ? 'Hides the ways to log' : 'Shows the ways to log a meal'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.console, pressed && styles.consolePressed]}>
        <View style={styles.dpad} aria-hidden>
          <View style={styles.dpadVertical} />
          <View style={styles.dpadHorizontal} />
        </View>

        <View style={styles.bezel}>
          <View style={styles.powerLight} aria-hidden />
          <View style={styles.screen}>
            <Text style={styles.screenTitle}>{open ? 'PICK A GAME' : 'LOG A MEAL'}</Text>
            <Animated.Text style={[styles.screenHint, blinkStyle]}>
              {open ? 'TAP ONE' : 'PRESS START'}
            </Animated.Text>
          </View>
        </View>

        <View style={styles.buttons} aria-hidden>
          <View style={[styles.roundButton, styles.buttonB]} />
          <View style={[styles.roundButton, styles.buttonA]} />
        </View>

        <View style={styles.pills} aria-hidden>
          <View style={styles.pill} />
          <View style={styles.pill} />
        </View>
      </Pressable>
    </View>
  );
}

type CartridgeProps = {
  index: number;
  title: string;
  hint: string;
  color: string;
  animate: boolean;
  onPress: () => void;
};

// One cartridge: slides up out of the console, then swings into its place in the fan
function Cartridge({ index, title, hint, color, animate, onPress }: CartridgeProps) {
  const pop = useSharedValue(animate ? 0 : 1);
  const target = FAN[index];

  useEffect(() => {
    if (animate) {
      pop.set(withDelay(index * 60, withSpring(1, { damping: 12, stiffness: 150 })));
    }
  }, [animate, index, pop]);

  const fanStyle = useAnimatedStyle(() => {
    const p = pop.get();
    return {
      transform: [
        { translateX: target.x * p },
        { translateY: CARD_HEIGHT * 0.9 * (1 - p) - target.lift * p },
        { rotate: `${target.rotate * p}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.cardSlot, fanStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${hint}`}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.cardNotch} />
        <View style={[styles.cardLabel, { backgroundColor: color }]}>
          <Text style={styles.cardNumber}>{index + 1}</Text>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Text style={styles.cardHint}>{hint}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  console: {
    alignSelf: 'stretch',
    height: CONSOLE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundImage: SILVER,
    boxShadow: `5px 5px 0 ${colors.navy}`,
  },
  consolePressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    boxShadow: `2px 2px 0 ${colors.navy}`,
  },
  dpad: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dpadVertical: {
    position: 'absolute',
    width: 18,
    height: 54,
    borderRadius: 4,
    backgroundColor: colors.navy,
  },
  dpadHorizontal: {
    position: 'absolute',
    width: 54,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.navy,
  },
  bezel: {
    flex: 1,
    height: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#2A2A55',
  },
  powerLight: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lycheeRed,
  },
  screen: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 6,
    backgroundColor: '#9FD8A8',
  },
  screenTitle: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.navy,
  },
  screenHint: {
    fontFamily: fonts.pixel,
    fontSize: 7,
    color: colors.navy,
  },
  buttons: {
    width: 54,
    height: 70,
  },
  roundButton: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: colors.navy,
  },
  buttonB: {
    left: 0,
    bottom: 6,
    backgroundColor: colors.berry,
  },
  buttonA: {
    right: 0,
    top: 6,
    backgroundColor: colors.lycheePink,
  },
  pills: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  pill: {
    width: 26,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.navy,
  },
  cardSlot: {
    position: 'absolute',
    // Bottom of each cartridge tucks just inside the top of the console
    bottom: CONSOLE_HEIGHT - 30,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    transformOrigin: 'bottom center',
  },
  card: {
    flex: 1,
    padding: 6,
    gap: 6,
    borderRadius: 8,
    borderTopRightRadius: 2,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `3px 3px 0 ${colors.navy}`,
  },
  cardPressed: {
    transform: [{ translateY: 2 }],
  },
  cardNotch: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 14,
    height: 10,
    backgroundColor: colors.blush,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: colors.navy,
  },
  cardLabel: {
    flex: 1,
    gap: 4,
    padding: 5,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.navy,
  },
  cardNumber: {
    fontFamily: fonts.pixel,
    fontSize: 10,
    color: colors.navy,
  },
  cardTitle: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 12,
    lineHeight: 15,
    color: colors.navy,
  },
  cardHint: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.plum,
    textAlign: 'center',
  },
});
