import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiloMoodArt } from '@/components/lilo';
import { ScreenHeader } from '@/components/screen-header';
import { colors, fonts, setTheme, themeName, THEMES, type ThemeName } from '@/constants/fm-theme';

// Pick the app's colour theme. Each card previews its own colours.
export default function ThemesScreen() {
  const choose = (name: ThemeName) => {
    if (name === themeName) return;
    Alert.alert(`Switch to ${THEMES[name].label}?`, 'The app restarts for a moment to change its colours.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => setTheme(name) },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader title="THEMES" />
      <ScrollView contentContainerStyle={styles.content}>
        {(Object.keys(THEMES) as ThemeName[]).map((name) => {
          const { label, detail, palette } = THEMES[name];
          const inUse = name === themeName;
          return (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityState={{ checked: inUse }}
              accessibilityLabel={`${label} theme, ${detail}`}
              onPress={() => choose(name)}
              style={({ pressed }) => [styles.option, inUse && styles.optionInUse, pressed && styles.pressed]}>
              {/* Mini screen drawn in that theme's own colours */}
              <View style={[styles.preview, { backgroundColor: palette.background }]} aria-hidden>
                <LiloMoodArt mood="welcome" pixelSize={2} />
                <View style={styles.previewStack}>
                  <View
                    style={[
                      styles.previewCard,
                      { backgroundColor: palette.cream, borderColor: palette.navy, boxShadow: `3px 3px 0 ${palette.navy}` },
                    ]}>
                    <Text style={[styles.previewNumber, { color: palette.navy }]}>1,240</Text>
                    <Text style={[styles.previewSmall, { color: palette.plum }]}>kcal today</Text>
                  </View>
                  <View style={[styles.previewButton, { backgroundColor: palette.lycheePink, borderColor: palette.navy }]}>
                    <Text style={[styles.previewButtonText, { color: palette.onAccent }]}>LOG</Text>
                  </View>
                </View>
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{label.toUpperCase()}</Text>
                <Text style={styles.optionDetail}>{detail}</Text>
              </View>
              <Text style={styles.status}>{inUse ? 'IN USE' : 'TAP TO USE'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: 18, padding: 16 },
  option: {
    gap: 12,
    padding: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  optionInUse: { boxShadow: `5px 5px 0 ${colors.lycheePink}` },
  pressed: { transform: [{ translateY: 2 }] },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  previewStack: { flex: 1, gap: 8 },
  previewCard: { padding: 8, borderWidth: 3 },
  previewNumber: { fontFamily: fonts.bodyHeavy, fontSize: 20 },
  previewSmall: { fontFamily: fonts.body, fontSize: 12 },
  previewButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderWidth: 3 },
  previewButtonText: { fontFamily: fonts.pixel, fontSize: 9 },
  optionText: { gap: 2 },
  optionLabel: { fontFamily: fonts.pixel, fontSize: 11, color: colors.navy },
  optionDetail: { fontFamily: fonts.body, fontSize: 14, color: colors.plum },
  status: { fontFamily: fonts.pixel, fontSize: 8, color: colors.plum },
});
