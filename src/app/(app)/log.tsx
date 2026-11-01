import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Lilo } from '@/components/lilo';
import type { LogMode } from '@/components/log-console';
import { MealChat } from '@/components/meal-chat';
import { RecipeBuilder, RecipeServing } from '@/components/recipe-builder';
import { ScanFood } from '@/components/scan-food';
import { colors, fonts } from '@/constants/fm-theme';

const TITLES: Record<LogMode, string> = {
  scan: 'SCAN WITH CAMERA',
  chat: 'CHAT WITH LILO',
  recipe: 'MAKE A RECIPE',
  batch: 'MEAL PREP BATCH',
  instagram: 'RECIPE FROM INSTA',
};

// Each way of logging gets its own screen; the ones not built yet show "coming soon".
export default function LogMealScreen() {
  const { mode, recipe } = useLocalSearchParams<{ mode?: LogMode | 'serving'; recipe?: string }>();
  const title = (mode && mode !== 'serving' && TITLES[mode]) || 'LOG A MEAL';

  if (mode === 'serving' && recipe) {
    return <RecipeServing recipeId={recipe} />;
  }
  if (mode === 'chat') {
    return <MealChat />;
  }
  if (mode === 'scan') {
    return <ScanFood />;
  }
  if (mode === 'recipe' || mode === 'batch' || mode === 'instagram') {
    return <RecipeBuilder kind={mode} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Lilo pixelSize={5} bob />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.text}>Coming soon! Lilo is still learning this one.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.button}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    lineHeight: 20,
    color: colors.navy,
    textAlign: 'center',
  },
  text: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.plum,
    textAlign: 'center',
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.navy,
  },
  buttonText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 16,
    color: colors.cream,
  },
});
