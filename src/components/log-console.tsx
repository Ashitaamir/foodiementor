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

import { PixelArt, toPixelRows } from '@/components/pixel-art';
import { UnlockCard } from '@/components/unlock-card';
import { colors, fonts } from '@/constants/fm-theme';

export type LogMode = 'scan' | 'chat' | 'recipe' | 'batch' | 'instagram';

// Hard colour bands instead of a smooth gradient, so the silver looks pixel-shaded
const SILVER =
  'linear-gradient(180deg, #F1F3F6 0%, #F1F3F6 16%, #CDD2DA 16%, #CDD2DA 74%, #AEB4BE 74%, #AEB4BE 100%)';
const PX = 4; // size of one "pixel" in the console's outline and buttons
const CONSOLE_HEIGHT = 150;
const SCANLINES = 14;

// Stepped corner (top-left); flipped for the other three corners.
// b = page background, O = outline, . = see-through
const CORNER = ['bbOO', 'bO..', 'O...', 'O...'];
const flipX = (map: string[]) => map.map((row) => row.split('').reverse().join(''));
const flipY = (map: string[]) => [...map].reverse();
const CORNER_COLORS = { b: colors.background, O: colors.navy };
const CORNERS = {
  topLeft: toPixelRows(CORNER, CORNER_COLORS),
  topRight: toPixelRows(flipX(CORNER), CORNER_COLORS),
  bottomLeft: toPixelRows(flipY(CORNER), CORNER_COLORS),
  bottomRight: toPixelRows(flipY(flipX(CORNER)), CORNER_COLORS),
};

// A round pixel button: O outline, C colour, H shine
const ROUND_BUTTON = ['..OOO..', '.OCCCO.', 'OCHCCCO', 'OCCCCCO', 'OCCCCCO', '.OCCCO.', '..OOO..'];
const BUTTON_A = toPixelRows(ROUND_BUTTON, { O: colors.navy, C: colors.lycheePink, H: '#FFFFFF' });
const BUTTON_B = toPixelRows(ROUND_BUTTON, { O: colors.navy, C: colors.berry, H: '#FF9EB8' });

// Pixel D-pad: N = navy, h = highlight
const DPAD = [
  '...NNN...',
  '...NhN...',
  '...NNN...',
  'NNNNNNNNN',
  'NhNNNNNhN',
  'NNNNNNNNN',
  '...NNN...',
  '...NhN...',
  '...NNN...',
];
const DPAD_ROWS = toPixelRows(DPAD, { N: colors.navy, h: '#3A3A70' });
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
        <View aria-hidden>
          <PixelArt rows={DPAD_ROWS} pixelSize={6} />
        </View>

        <View style={styles.bezel}>
          <View style={styles.powerLight} aria-hidden />
          <View style={styles.screen}>
            <View style={styles.scanlines} aria-hidden pointerEvents="none">
              {Array.from({ length: SCANLINES }, (_, index) => (
                <View key={index} style={styles.scanline} />
              ))}
            </View>
            <Text style={styles.screenTitle}>{open ? 'PICK A GAME' : 'LOG A MEAL'}</Text>
            <Animated.Text style={[styles.screenHint, blinkStyle]}>
              {open ? 'TAP ONE' : 'PRESS START'}
            </Animated.Text>
          </View>
        </View>

        <View style={styles.buttons} aria-hidden>
          <View style={styles.buttonB}>
            <PixelArt rows={BUTTON_B} pixelSize={PX} />
          </View>
          <View style={styles.buttonA}>
            <PixelArt rows={BUTTON_A} pixelSize={PX} />
          </View>
        </View>

        <View style={styles.pills} aria-hidden>
          <View style={styles.pill} />
          <View style={styles.pill} />
        </View>

        {/* Stepped corners drawn on top of the square body */}
        <View style={[styles.corner, { top: -PX, left: -PX }]} aria-hidden pointerEvents="none">
          <PixelArt rows={CORNERS.topLeft} pixelSize={PX} />
        </View>
        <View style={[styles.corner, { top: -PX, right: -PX }]} aria-hidden pointerEvents="none">
          <PixelArt rows={CORNERS.topRight} pixelSize={PX} />
        </View>
        <View style={[styles.corner, { bottom: -PX, left: -PX }]} aria-hidden pointerEvents="none">
          <PixelArt rows={CORNERS.bottomLeft} pixelSize={PX} />
        </View>
        <View style={[styles.corner, { bottom: -PX, right: -PX }]} aria-hidden pointerEvents="none">
          <PixelArt rows={CORNERS.bottomRight} pixelSize={PX} />
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
    borderWidth: PX,
    borderColor: colors.navy,
    backgroundImage: SILVER,
    boxShadow: `${PX * 2}px ${PX * 2}px 0 ${colors.navy}`,
  },
  consolePressed: {
    transform: [{ translateX: PX }, { translateY: PX }],
    boxShadow: `${PX}px ${PX}px 0 ${colors.navy}`,
  },
  corner: {
    position: 'absolute',
  },
  bezel: {
    flex: 1,
    height: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderWidth: PX,
    borderTopColor: '#14142C',
    borderLeftColor: '#14142C',
    borderBottomColor: '#3A3A70',
    borderRightColor: '#3A3A70',
    backgroundColor: '#2A2A55',
  },
  powerLight: {
    width: PX * 2,
    height: PX * 2,
    backgroundColor: colors.lycheeRed,
  },
  screen: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    backgroundColor: '#9FD8A8',
  },
  scanlines: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  scanline: {
    height: 1,
    backgroundColor: 'rgba(27, 27, 58, 0.12)',
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
  buttonB: {
    position: 'absolute',
    left: 0,
    bottom: 4,
  },
  buttonA: {
    position: 'absolute',
    right: 0,
    top: 4,
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
    width: PX * 6,
    height: PX * 2,
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
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `${PX}px ${PX}px 0 ${colors.navy}`,
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
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: colors.navy,
  },
  cardLabel: {
    flex: 1,
    gap: 4,
    padding: 5,
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
