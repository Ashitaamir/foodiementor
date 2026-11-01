import { FunctionsHttpError } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withCommas } from '@/components/calorie-bar';
import { LiloMoodArt } from '@/components/lilo';
import { DraftCard, MealTypePicker, type MealPhoto } from '@/components/meal-chat';
import { colors, fonts } from '@/constants/fm-theme';
import {
  gramsOf,
  isReady,
  mealTypeForNow,
  previewKcal,
  questionQueue,
  toDraft,
  type DraftItem,
  type FoodChoice,
  type MealType,
  type ParsedItem,
  type Portion,
} from '@/lib/meal-draft';
import { pickPhoto } from '@/lib/photo';
import { supabase } from '@/lib/supabase';

export type RecipeKind = 'recipe' | 'batch' | 'instagram';

export type SavedRecipe = {
  id: string;
  name: string;
  kind?: 'recipe' | 'batch';
  source?: 'manual' | 'instagram';
  servings: number | null;
  cooked_weight_g: number | null;
  ingredients_weight_g: number;
  energy_kcal_total: number;
};

export const RECIPE_COLUMNS =
  'id, name, kind, source, servings, cooked_weight_g, ingredients_weight_g, energy_kcal_total';

const COPY: Record<RecipeKind, { title: string; intro: string; placeholder: string; savedTitle: string }> = {
  recipe: {
    title: 'MAKE A RECIPE',
    intro: 'List your ingredients and amounts. Lilo adds up the dish for you.',
    placeholder: 'e.g. 500 g chicken thigh, 2 onions, 1 cup yogurt, 2 tbsp ghee',
    savedTitle: 'YOUR RECIPES',
  },
  batch: {
    title: 'MEAL PREP BATCH',
    intro: 'Cook once, log all week. List what went in the pot, then log a portion whenever you eat.',
    placeholder: 'e.g. 1 kg chicken, 3 cups basmati rice, 4 tbsp oil, 2 onions',
    savedTitle: 'YOUR BATCHES',
  },
  instagram: {
    title: 'INSTA RECIPE',
    intro: 'Saw a recipe reel? Paste its caption, or add a screenshot of the recipe. Lilo reads it and counts the calories.',
    placeholder: 'Paste the caption here (a link on its own can’t be opened)…',
    savedTitle: 'SAVED INSTA RECIPES',
  },
};

const LINK_PATTERN = /https?:\/\/\S+|(?:www\.)?instagram\.com\/\S+|instagr\.am\/\S+/gi;
// Below this much text (once links are removed) there's no recipe to read
const MIN_RECIPE_TEXT = 25;

const LILO_NEEDS_RECIPE =
  "I can't open Instagram links (Instagram doesn't let apps read posts). Copy the caption and paste it here, or add a screenshot of the recipe, and I'll work out the calories!";
const LILO_NO_RECIPE =
  "I couldn't find a recipe in that. Please add a screenshot of the recipe, or write the ingredients in the box (like \"500 g chicken, 2 onions, 1 cup rice\").";

function errorText(fallback: string) {
  return async (error: unknown) => {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) return body.error as string;
    }
    return fallback;
  };
}

// Make a recipe / Meal prep batch / Insta recipe: read the ingredients, check them,
// save the recipe (its nutrition is added up by the database), then log a serving.
export function RecipeBuilder({ kind }: { kind: RecipeKind }) {
  const copy = COPY[kind];
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [text, setText] = useState('');
  const [screenshot, setScreenshot] = useState<MealPhoto | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liloSays, setLiloSays] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('');
  const [cookedWeight, setCookedWeight] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);

  const loadSaved = useCallback(async () => {
    let query = supabase
      .from('recipes')
      .select(RECIPE_COLUMNS)
      .eq('kind', kind === 'batch' ? 'batch' : 'recipe')
      .order('created_at', { ascending: false })
      .limit(20);
    if (kind !== 'batch') query = query.eq('source', kind === 'instagram' ? 'instagram' : 'manual');
    const { data } = await query;
    setSaved((data ?? []) as SavedRecipe[]);
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved]),
  );

  if (recipe) {
    return <LogServing recipe={recipe} title={copy.title} onBack={() => setRecipe(null)} />;
  }

  const read = async () => {
    // Links can't be opened (no scraping), so only the pasted words are sent
    const words = kind === 'instagram' ? text.replace(LINK_PATTERN, ' ').replace(/\s+/g, ' ').trim() : text.trim();
    if (kind === 'instagram' && !screenshot && words.length < MIN_RECIPE_TEXT) {
      setError(null);
      setLiloSays(text.trim() ? LILO_NEEDS_RECIPE : 'Paste the caption, or add a screenshot of the recipe.');
      return;
    }
    if (!words && !screenshot) {
      setError('Type or paste the ingredients first.');
      return;
    }
    setReading(true);
    setError(null);
    setLiloSays(null);
    const { data, error: readError } = await supabase.functions.invoke('parse-meal', {
      body: {
        purpose: 'recipe',
        text: words || 'Read the recipe in this screenshot',
        ...(screenshot ? { image: { media_type: screenshot.mimeType, data: screenshot.base64 } } : {}),
      },
    });
    setReading(false);
    if (readError) {
      setError(await errorText('Lilo could not read that. Please try again.')(readError));
      return;
    }
    const items = (data?.items ?? []) as ParsedItem[];
    const found = items.filter((item) => item.food);
    if (!found.length) {
      if (kind === 'instagram') setLiloSays(LILO_NO_RECIPE);
      else setError("Lilo couldn't find any ingredients. Try listing them with amounts.");
      return;
    }
    setNotFound(items.filter((item) => !item.food).map((item) => item.said));
    setDraft(toDraft(found));
    if (data?.recipe_name && !name) setName(data.recipe_name);
    if (data?.servings && !servings) setServings(String(data.servings));
  };

  const update = (key: string, change: Partial<DraftItem>) =>
    setDraft((items) => items?.map((item) => (item.key === key ? { ...item, ...change } : item)) ?? null);

  const chooseFood = async (item: DraftItem, food: FoodChoice) => {
    if (food.id === item.food?.id) {
      update(item.key, { matchConfirmed: true });
      return;
    }
    const { data } = await supabase.from('portion_sizes').select('id, label, grams').eq('food_id', food.id);
    const portions = ((data ?? []) as Portion[]).map((p) => ({ ...p, grams: Number(p.grams) }));
    update(item.key, {
      food,
      matchConfirmed: true,
      alternatives: [item.food!, ...item.alternatives.filter((alt) => alt.id !== food.id)],
      portions,
      amount: item.amount?.kind === 'grams' ? item.amount : null,
    });
  };

  const nudge = (item: DraftItem, direction: 1 | -1) => {
    const amount = item.amount;
    if (!amount) return;
    update(item.key, {
      edited: true,
      amount:
        amount.kind === 'portion'
          ? { ...amount, count: Math.max(0.5, Math.min(100, amount.count + direction * 0.5)) }
          : { kind: 'grams', grams: Math.max(5, Math.min(5000, amount.grams + direction * 25)) },
    });
  };

  const saveRecipe = async () => {
    if (!draft || !draft.every(isReady)) return;
    const servingsNumber = Number(servings) || null;
    const weightNumber = Number(cookedWeight) || null;
    if (!name.trim()) {
      setError('Please give your recipe a name.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data: created, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        name: name.trim().slice(0, 80),
        kind: kind === 'batch' ? 'batch' : 'recipe',
        source: kind === 'instagram' ? 'instagram' : 'manual',
        servings: servingsNumber,
        cooked_weight_g: weightNumber,
      })
      .select('id')
      .single();
    if (recipeError || !created) {
      setSaving(false);
      setError('Could not save the recipe. Please try again.');
      return;
    }
    const rows = draft.map((item) => ({
      recipe_id: created.id,
      food_id: item.food!.id,
      grams: Math.round((gramsOf(item.amount) ?? 0) * 10) / 10,
    }));
    const { error: ingredientError } = await supabase.from('recipe_ingredients').insert(rows);
    if (ingredientError) {
      await supabase.from('recipes').delete().eq('id', created.id);
      setSaving(false);
      setError('Could not save the ingredients. Please try again.');
      return;
    }
    // Totals are added up by the database; read them back
    const { data: full } = await supabase
      .from('recipes')
      .select(RECIPE_COLUMNS)
      .eq('id', created.id)
      .single();
    setSaving(false);
    setDraft(null);
    setText('');
    setScreenshot(null);
    if (full) setRecipe(full as SavedRecipe);
  };

  const queue = draft ? questionQueue(draft) : [];
  const allReady = !!draft && draft.length > 0 && draft.every(isReady);
  const total = draft?.reduce((sum, item) => sum + (previewKcal(item) ?? 0), 0) ?? 0;

  return (
    <SafeAreaView style={styles.screen}>
      <Header title={copy.title} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!draft && (
            <>
              <View style={styles.introRow}>
                <LiloMoodArt mood="chef" pixelSize={2} bob />
                <Text style={styles.intro}>{copy.intro}</Text>
              </View>

              <TextInput
                accessibilityLabel={kind === 'instagram' ? 'Recipe caption' : 'Ingredients'}
                value={text}
                onChangeText={setText}
                placeholder={copy.placeholder}
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={4000}
                style={[styles.input, styles.textArea]}
              />

              {kind === 'batch' && (
                <Field
                  label="How many portions will you divide it into?"
                  value={servings}
                  onChange={(v) => setServings(v.replace(/[^0-9.]/g, ''))}
                  placeholder="e.g. 5 (you can change this later)"
                  numeric
                />
              )}

              {kind === 'instagram' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    const picked = await pickPhoto();
                    if (picked) {
                      setScreenshot(picked);
                      setLiloSays(null);
                    }
                  }}
                  style={styles.secondary}>
                  <Text style={styles.secondaryText}>
                    {screenshot ? 'Screenshot added ✓ (tap to change)' : 'Choose a screenshot'}
                  </Text>
                </Pressable>
              )}

              {liloSays && (
                <View style={styles.liloRow} accessibilityLiveRegion="polite">
                  <LiloMoodArt mood="thinking" pixelSize={2} />
                  <View style={styles.bubble}>
                    <Text style={styles.bubbleText}>{liloSays}</Text>
                  </View>
                </View>
              )}

              {reading && (
                <View style={styles.liloRow} accessibilityLiveRegion="polite">
                  <LiloMoodArt mood="thinking" pixelSize={2} bob />
                  <View style={styles.bubble}>
                    <Text style={styles.bubbleText}>Lilo is reading your recipe…</Text>
                  </View>
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: reading, disabled: reading }}
                disabled={reading}
                onPress={read}
                style={styles.primary}>
                {reading ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>READ IT</Text>}
              </Pressable>

              {saved.length > 0 && (
                <View style={styles.savedList}>
                  <Text style={styles.sectionTitle}>{copy.savedTitle}</Text>
                  {saved.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityHint="Log a serving of this"
                      onPress={() => setRecipe(item)}
                      style={styles.savedRow}>
                      <Text style={styles.savedName}>{item.name}</Text>
                      <Text style={styles.small}>
                        {withCommas(Number(item.energy_kcal_total))} kcal total
                        {item.servings ? ` · ${item.servings} servings` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {draft && (
            <>
              <View style={styles.totalCard} accessible>
                <Text style={styles.sectionTitle}>LILO&apos;S COUNT</Text>
                <Text style={styles.totalNumber}>{withCommas(total)} kcal</Text>
                <Text style={styles.small}>
                  {Number(servings) > 0
                    ? `About ${withCommas(total / Number(servings))} kcal per serving (${servings} servings)`
                    : 'for the whole recipe. Add servings below to see one portion.'}
                  {allReady ? '' : ' · answer Lilo on the cards to finish the count'}
                </Text>
              </View>
              <Text style={styles.sectionTitle}>CHECK THE INGREDIENTS</Text>
              {draft.map((item) => (
                <DraftCard
                  key={item.key}
                  item={item}
                  asking={queue.includes(item.key)}
                  editing={editing === item.key}
                  onToggleEdit={() => setEditing(editing === item.key ? null : item.key)}
                  onChooseFood={(food) => chooseFood(item, food)}
                  onAmount={(amount) => update(item.key, { amount, edited: true })}
                  onNudge={(direction) => nudge(item, direction)}
                  onRemove={() =>
                    setDraft((items) => {
                      const left = items?.filter((i) => i.key !== item.key) ?? [];
                      return left.length ? left : null;
                    })
                  }
                />
              ))}
              {notFound.length > 0 && (
                <Text style={styles.error}>Lilo couldn&apos;t find: {notFound.join(', ')}.</Text>
              )}

              <Field label="Recipe name" value={name} onChange={setName} placeholder="e.g. Chicken karahi" />
              <Field
                label={kind === 'batch' ? 'How many portions?' : 'How many servings?'}
                value={servings}
                onChange={(v) => setServings(v.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 4"
                numeric
              />
              {kind === 'batch' && (
                <Field
                  label="Cooked weight of the whole pot (g), optional"
                  value={cookedWeight}
                  onChange={(v) => setCookedWeight(v.replace(/[^0-9]/g, ''))}
                  placeholder="Weigh the pot minus the empty pot"
                  numeric
                />
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !allReady || saving, busy: saving }}
                disabled={!allReady || saving}
                onPress={saveRecipe}
                style={[styles.primary, !allReady && styles.disabled]}>
                {saving ? (
                  <ActivityIndicator color={colors.cream} />
                ) : (
                  <Text style={styles.primaryText}>
                    {allReady ? `SAVE RECIPE · ${withCommas(total)} KCAL` : 'ANSWER LILO FIRST'}
                  </Text>
                )}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={styles.link}>
                <Text style={styles.linkText}>Start over</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Opened from the Recipes tab: load one saved recipe, then log a serving of it
export function RecipeServing({ recipeId }: { recipeId: string }) {
  const [recipe, setRecipe] = useState<SavedRecipe | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('recipes')
        .select(RECIPE_COLUMNS)
        .eq('id', recipeId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) setFailed(true);
          else setRecipe(data as SavedRecipe);
        });
    }, [recipeId]),
  );

  if (!recipe) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header title="LOG A SERVING" />
        <View style={styles.content}>
          {failed ? (
            <Text style={styles.error}>Could not load that recipe.</Text>
          ) : (
            <ActivityIndicator color={colors.navy} accessibilityLabel="Loading" />
          )}
        </View>
      </SafeAreaView>
    );
  }
  return <LogServing recipe={recipe} title="LOG A SERVING" onBack={() => router.back()} />;
}

// Log some of a saved recipe or batch: by servings if known, otherwise by grams
function LogServing({
  recipe: initialRecipe,
  title,
  onBack,
}: {
  recipe: SavedRecipe;
  title: string;
  onBack: () => void;
}) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [editingPortions, setEditingPortions] = useState(false);
  const [portionsText, setPortionsText] = useState(initialRecipe.servings ? String(initialRecipe.servings) : '');
  const weight = Number(recipe.cooked_weight_g ?? recipe.ingredients_weight_g) || 0;
  const servings = Number(recipe.servings) || null;

  // Change how many portions the batch or recipe is divided into
  const savePortions = async () => {
    const value = Number(portionsText);
    if (!value || value <= 0 || value > 100) {
      setError('Please enter between 1 and 100 portions.');
      return;
    }
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ servings: value })
      .eq('id', recipe.id);
    if (updateError) {
      setError('Could not change the portions. Please try again.');
      return;
    }
    setError(null);
    setRecipe({ ...recipe, servings: value });
    setEditingPortions(false);
  };
  const gramsPerServing = servings && weight ? weight / servings : null;
  const [count, setCount] = useState(1);
  const [gramsText, setGramsText] = useState('');
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grams = gramsPerServing ? gramsPerServing * count : Number(gramsText) || 0;
  const kcal = weight ? Math.round((Number(recipe.energy_kcal_total) * grams) / weight) : 0;

  const save = async () => {
    if (!grams || grams > 5000) {
      setError('Please enter how much you had (up to 5000 g).');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase.from('food_logs').insert({
      recipe_id: recipe.id,
      grams: Math.round(grams * 10) / 10,
      status: 'confirmed',
      input_method: 'recipe',
      meal_type: mealType,
    });
    setSaving(false);
    if (saveError) {
      console.warn('Saving serving failed:', saveError.code, saveError.message);
      setError('Could not save. Please try again.');
      return;
    }
    setDone(true);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header title={title} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.small}>
            {withCommas(Number(recipe.energy_kcal_total))} kcal for the whole recipe
            {gramsPerServing && servings
              ? ` · about ${withCommas(Number(recipe.energy_kcal_total) / servings)} kcal per serving`
              : ''}
          </Text>
          <Text style={styles.small}>
            {servings ? `Divided into ${servings} portion${servings === 1 ? '' : 's'}` : 'No portions set'}
          </Text>
          {editingPortions ? (
            <View style={styles.portionEdit}>
              <TextInput
                accessibilityLabel="Number of portions"
                value={portionsText}
                onChangeText={(v) => setPortionsText(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="e.g. 5"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.flex]}
              />
              <Pressable accessibilityRole="button" onPress={savePortions} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditingPortions(true)}
              style={styles.link}>
              <Text style={styles.linkText}>{servings ? 'Change portions' : 'Set portions'}</Text>
            </Pressable>
          )}
        </View>

        {gramsPerServing ? (
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              onPress={() => setCount((c) => Math.max(0.5, c - 0.5))}
              style={styles.stepButton}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={styles.amount}>
              {count} serving{count === 1 ? '' : 's'} · {withCommas(kcal)} kcal
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => setCount((c) => Math.min(20, c + 0.5))}
              style={styles.stepButton}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Field
            label="How much did you have (g)?"
            value={gramsText}
            onChange={(v) => setGramsText(v.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 300"
            numeric
          />
        )}

        <MealTypePicker value={mealType} onChange={setMealType} />
        {error && <Text style={styles.error}>{error}</Text>}

        {done ? (
          <>
            <Text style={styles.success}>Logged! Enjoy.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}>
              <Text style={styles.primaryText}>DONE</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={save}
            style={styles.primary}>
            {saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>LOG IT</Text>}
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.link}>
          <Text style={styles.linkText}>Back to recipes</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
        style={styles.input}
      />
    </View>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.backButton}>
        <Text style={styles.backText}>{'<'}</Text>
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.navy,
    borderRadius: 10,
    backgroundColor: colors.cream,
  },
  backText: { fontFamily: fonts.pixel, fontSize: 14, color: colors.navy },
  headerTitle: { fontFamily: fonts.pixel, fontSize: 13, color: colors.navy },
  content: { gap: 14, padding: 16 },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  intro: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: colors.navy },
  field: { gap: 6 },
  label: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 14,
  },
  textArea: { minHeight: 140, paddingTop: 12, textAlignVertical: 'top' },
  sectionTitle: { fontFamily: fonts.pixel, fontSize: 10, color: colors.navy },
  liloRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bubble: {
    flex: 1,
    padding: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `3px 3px 0 ${colors.navy}`,
  },
  bubbleText: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: colors.navy },
  totalCard: {
    gap: 6,
    padding: 16,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  totalNumber: { fontFamily: fonts.bodyHeavy, fontSize: 30, color: colors.navy, fontVariant: ['tabular-nums'] },
  savedList: { gap: 8, marginTop: 8 },
  savedRow: {
    gap: 2,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  savedName: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.plum },
  card: {
    gap: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  recipeName: { fontFamily: fonts.pixel, fontSize: 13, lineHeight: 20, color: colors.navy },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: fonts.pixel, fontSize: 14, color: colors.navy },
  amount: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.navy, textAlign: 'center' },
  primary: {
    height: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  primaryText: { fontFamily: fonts.pixel, fontSize: 11, color: colors.cream },
  disabled: { opacity: 0.5 },
  portionEdit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallButton: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    justifyContent: 'center',
  },
  smallButtonText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.cream },
  secondary: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.navy },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  linkText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.berry, textDecorationLine: 'underline' },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.berry, textAlign: 'center' },
  success: { fontFamily: fonts.pixel, fontSize: 12, color: colors.navy, textAlign: 'center' },
});
