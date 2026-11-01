import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withCommas } from '@/components/calorie-bar';
import { LiloMoodArt } from '@/components/lilo';
import type { LogMode } from '@/components/log-console';
import { RECIPE_COLUMNS, type SavedRecipe } from '@/components/recipe-builder';
import { colors, fonts } from '@/constants/fm-theme';
import { supabase } from '@/lib/supabase';

const NEW_BUTTONS: { mode: LogMode; label: string; color: string }[] = [
  { mode: 'recipe', label: '+ Recipe', color: colors.leafGreen },
  { mode: 'batch', label: '+ Meal prep', color: colors.sky },
  { mode: 'instagram', label: '+ From Insta', color: colors.grape },
];

function tagFor(recipe: SavedRecipe) {
  if (recipe.kind === 'batch') return 'MEAL PREP';
  if (recipe.source === 'instagram') return 'INSTA';
  return 'RECIPE';
}

// All saved recipes and meal prep batches in one place: tap one to log a serving.
export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('recipes')
      .select(RECIPE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (loadError) {
      setError('Could not load your recipes. Pull down to try again.');
    } else {
      setError(null);
      setRecipes((data ?? []) as SavedRecipe[]);
    }
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const remove = (recipe: SavedRecipe) => {
    Alert.alert('Delete recipe?', `"${recipe.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: deleteError } = await supabase.from('recipes').delete().eq('id', recipe.id);
          if (deleteError) {
            // 23503: still used by a food log entry, so the database keeps it
            setError(
              deleteError.code === '23503'
                ? `"${recipe.name}" is in your food log, so it can't be deleted.`
                : 'Could not delete that recipe. Please try again.',
            );
            return;
          }
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} />}>
        <View style={styles.titleRow}>
          <LiloMoodArt mood="chef" pixelSize={2} bob />
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header">
              RECIPES
            </Text>
            <Text style={styles.subtle}>Your dishes and meal prep batches. Tap one to log a serving.</Text>
          </View>
        </View>

        <View style={styles.newRow}>
          {NEW_BUTTONS.map((button) => (
            <Pressable
              key={button.mode}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/log', params: { mode: button.mode } })}
              style={({ pressed }) => [styles.newButton, { backgroundColor: button.color }, pressed && styles.pressed]}>
              <Text style={styles.newText}>{button.label}</Text>
            </Pressable>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {loaded && !error && recipes.length === 0 && (
          <View style={styles.empty}>
            <LiloMoodArt mood="chef" pixelSize={3} />
            <Text style={styles.emptyText}>No recipes yet. Make one, or paste one from Instagram!</Text>
          </View>
        )}

        {recipes.map((recipe) => {
          const servings = Number(recipe.servings) || null;
          const total = Number(recipe.energy_kcal_total);
          return (
            <View key={recipe.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Log a serving of this"
                onPress={() => router.push({ pathname: '/log', params: { mode: 'serving', recipe: recipe.id } })}
                style={styles.rowMain}>
                <Text style={styles.tag}>{tagFor(recipe)}</Text>
                <Text style={styles.rowName}>{recipe.name}</Text>
                <Text style={styles.rowKcal}>
                  {servings
                    ? `${withCommas(total / servings)} kcal per serving · ${servings} servings`
                    : `${withCommas(total)} kcal total`}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${recipe.name}`}
                onPress={() => remove(recipe)}
                style={styles.removeButton}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.pixel, fontSize: 14, color: colors.navy },
  subtle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.plum, marginTop: 4 },
  newRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  newButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    boxShadow: `3px 3px 0 ${colors.navy}`,
  },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }], boxShadow: `1px 1px 0 ${colors.navy}` },
  newText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.onAccent },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.berry, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.plum, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  rowMain: { flex: 1, gap: 4, padding: 12 },
  tag: { fontFamily: fonts.pixel, fontSize: 7, color: colors.plum },
  rowName: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.navy },
  rowKcal: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.plum },
  removeButton: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: fonts.bodyHeavy, fontSize: 22, color: colors.berry },
});
