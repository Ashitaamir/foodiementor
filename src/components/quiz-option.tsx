import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/fm-theme';

type Props = {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
};

// A chunky quiz-style answer box with a pixel shadow.
export function QuizOption({ label, hint, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.box,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.marker, selected && styles.markerSelected]} />
      <View style={styles.text}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {hint ? <Text style={[styles.hint, selected && styles.hintSelected]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  selected: {
    backgroundColor: colors.navy,
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    boxShadow: `2px 2px 0 ${colors.navy}`,
  },
  marker: {
    width: 14,
    height: 14,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  markerSelected: {
    borderColor: colors.cream,
    backgroundColor: colors.lycheePink,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.navy,
  },
  labelSelected: {
    color: colors.cream,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.plum,
  },
  hintSelected: {
    color: colors.onInkMuted,
  },
});
