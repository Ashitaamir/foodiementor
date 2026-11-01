import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
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
import { Lilo, LiloMoodArt } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';
import {
  gramsOf,
  householdSizes,
  isReady,
  mealTypeForNow,
  mergeDraft,
  previewKcal,
  questionQueue,
  toDraft,
  toLogRows,
  type Amount,
  type DraftItem,
  type FoodChoice,
  type LiloQuestion,
  type MealType,
  type ParsedItem,
  type Portion,
} from '@/lib/meal-draft';
import { supabase } from '@/lib/supabase';

type Message = { id: number; from: 'lilo' | 'user'; text: string };

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

const MAX_TEXT = 500;
let nextId = 1;

function amountLabel(amount: Amount | null) {
  if (!amount) return 'Amount needed';
  if (amount.kind === 'grams') return `${Math.round(amount.grams)} g`;
  return `${amount.count} × ${amount.portion.label} · ${Math.round(amount.portion.grams * amount.count)} g`;
}

export type MealPhoto = { base64: string; mimeType: 'image/jpeg' };

type MealChatProps = {
  // A photo from "Scan with camera": Lilo starts by looking at it
  initialPhoto?: MealPhoto;
};

// "Chat with Lilo": type a meal, Lilo (the parse-meal function) turns it into a draft,
// the user answers at most a few quick questions, then saves it to today's log.
export function MealChat({ initialPhoto }: MealChatProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId++,
      from: 'lilo',
      text: 'Hi! Tell me what you ate, like "2 rotis and a bowl of dal". I\'ll find it for you.',
    },
  ]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState<DraftItem[] | null>(null);
  const [questions, setQuestions] = useState<LiloQuestion[]>([]);
  // Lilo only reads the chat since the last saved meal
  const [mealStart, setMealStart] = useState(0);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // The meal's photo is re-sent with each reply, so Lilo can keep looking at it
  const [photo, setPhoto] = useState<MealPhoto | null>(initialPhoto ?? null);
  const startedWithPhoto = useRef(false);

  const say = (from: Message['from'], message: string) =>
    setMessages((list) => [...list, { id: nextId++, from, text: message }]);

  useEffect(() => {
    if (initialPhoto && !startedWithPhoto.current) {
      startedWithPhoto.current = true;
      send('Here is a photo of my meal');
    }
    // Runs once for the photo this screen opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sends the typed message, or a tapped answer to one of Lilo's questions
  const send = async (answer?: string) => {
    const meal = (answer ?? text).trim();
    if (!meal || thinking) return;
    const conversation = [...messages.slice(mealStart), { id: 0, from: 'user' as const, text: meal }].map(
      (message) => ({ role: message.from === 'lilo' ? 'assistant' : 'user', text: message.text }),
    );
    say('user', meal);
    if (!answer) setText('');
    setThinking(true);
    setSaved(false);
    setQuestions([]);

    const { data, error } = await supabase.functions.invoke('parse-meal', {
      body: {
        messages: conversation,
        ...(photo ? { image: { media_type: photo.mimeType, data: photo.base64 } } : {}),
      },
    });
    setThinking(false);

    if (error) {
      let reason = 'Sorry, I could not reach the kitchen. Check your connection and try again.';
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        if (body?.error) reason = body.error;
      }
      say('lilo', reason);
      return;
    }

    const items = (data?.items ?? []) as ParsedItem[];
    const found = items.filter((item) => item.food);
    setNotFound(items.filter((item) => !item.food).map((item) => item.said));
    if (found.length === 0) {
      setDraft(null);
      say('lilo', "I couldn't find any food in that. Try naming the dish, like \"chicken biryani\".");
      return;
    }
    // Questions point at items by position in the full list; re-point them at the found items
    const foundIndex = new Map(items.map((item, index) => [index, found.indexOf(item)]));
    setQuestions(
      ((data?.questions ?? []) as LiloQuestion[])
        .map((q) => ({ ...q, item: foundIndex.get(q.item) ?? -1 }))
        .filter((q) => q.item >= 0),
    );
    setDraft((previous) => mergeDraft(previous, toDraft(found)));
    setEditing(null);
    say('lilo', data?.reply || "Here's what I found. Check the amounts, then save!");
  };

  const update = (key: string, change: Partial<DraftItem>) =>
    setDraft((items) => items?.map((item) => (item.key === key ? { ...item, ...change } : item)) ?? null);

  const remove = (key: string) =>
    setDraft((items) => {
      const left = items?.filter((item) => item.key !== key) ?? [];
      return left.length ? left : null;
    });

  // Picking a different food also loads that food's own portion sizes
  const chooseFood = async (item: DraftItem, food: FoodChoice) => {
    if (food.id === item.food?.id) {
      update(item.key, { matchConfirmed: true });
      return;
    }
    const { data } = await supabase
      .from('portion_sizes')
      .select('id, label, grams')
      .eq('food_id', food.id);
    const portions = ((data ?? []) as Portion[]).map((p) => ({ ...p, grams: Number(p.grams) }));
    const keepGrams = item.amount?.kind === 'grams' ? item.amount : null;
    update(item.key, {
      food,
      matchConfirmed: true,
      alternatives: [item.food!, ...item.alternatives.filter((alt) => alt.id !== food.id)],
      portions,
      amount: keepGrams,
    });
  };

  const nudge = (item: DraftItem, direction: 1 | -1) => {
    const amount = item.amount;
    if (!amount) return;
    if (amount.kind === 'portion') {
      const count = Math.max(0.5, Math.min(100, amount.count + direction * 0.5));
      update(item.key, { amount: { ...amount, count }, edited: true });
    } else {
      const grams = Math.max(10, Math.min(5000, amount.grams + direction * 25));
      update(item.key, { amount: { kind: 'grams', grams }, edited: true });
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    const rows = toLogRows(draft, mealType, photo ? 'scan' : 'chat');
    if (rows.length === 0) return;
    setSaving(true);
    const { error } = await supabase.from('food_logs').insert(rows);
    setSaving(false);
    if (error) {
      console.warn('Saving meal failed:', error.code, error.message);
      say('lilo', 'Hmm, I could not save that. Please try again.');
      return;
    }
    const total = draft.reduce((sum, item) => sum + (previewKcal(item) ?? 0), 0);
    setDraft(null);
    setNotFound([]);
    setQuestions([]);
    setSaved(true);
    // The next message starts a new meal, so Lilo doesn't re-read this one
    setMealStart(messages.length + 1);
    setPhoto(null);
    say('lilo', `Saved! About ${withCommas(total)} kcal added to today. Anything else?`);
  };

  const queue = draft ? questionQueue(draft) : [];
  const allReady = !!draft && draft.every(isReady);
  const total = draft?.reduce((sum, item) => sum + (previewKcal(item) ?? 0), 0) ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backButton}>
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          CHAT WITH LILO
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chat}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.map((message) =>
            message.from === 'lilo' ? (
              <View key={message.id} style={styles.liloRow}>
                <View aria-hidden style={styles.avatar}>
                  <Lilo pixelSize={2} />
                </View>
                <View style={[styles.bubble, styles.liloBubble]}>
                  <Text style={styles.liloText}>{message.text}</Text>
                </View>
              </View>
            ) : (
              <View key={message.id} style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{message.text}</Text>
              </View>
            ),
          )}

          {thinking && (
            <View style={styles.liloRow} accessibilityLiveRegion="polite">
              <View aria-hidden>
                <LiloMoodArt mood="thinking" pixelSize={2} bob />
              </View>
              <View style={[styles.bubble, styles.liloBubble, styles.thinking]}>
                <Text style={styles.liloText}>Lilo is thinking…</Text>
              </View>
            </View>
          )}

          {draft && (
            <View style={styles.draft}>
              {questions.map((question, index) => (
                <View key={index} style={[styles.card, styles.cardAsking]}>
                  <Text style={styles.questionText}>{question.question}</Text>
                  <Text style={styles.cardSub}>About: {draft[question.item]?.food?.name}</Text>
                  <View style={styles.options}>
                    {question.options.map((option) => (
                      <Pressable
                        key={option.label}
                        accessibilityRole="button"
                        accessibilityHint="Sends this answer to Lilo"
                        disabled={thinking}
                        onPress={() => send(option.answer)}
                        style={styles.chip}>
                        <Text style={styles.chipText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}

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
                  onRemove={() => remove(item.key)}
                />
              ))}

              {notFound.length > 0 && (
                <Text style={styles.note}>
                  I couldn&apos;t find: {notFound.join(', ')}. Try a different name in a new message.
                </Text>
              )}

              <MealTypePicker value={mealType} onChange={setMealType} />

              <Text style={styles.notice}>AI estimate, please check. Calories come from our food database.</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !allReady || saving, busy: saving }}
                disabled={!allReady || saving}
                onPress={save}
                style={({ pressed }) => [
                  styles.saveButton,
                  !allReady && styles.saveDisabled,
                  pressed && styles.savePressed,
                ]}>
                {saving ? (
                  <ActivityIndicator color={colors.cream} />
                ) : (
                  <Text style={styles.saveText}>
                    {allReady ? `SAVE · ${withCommas(total)} KCAL` : 'ANSWER LILO FIRST'}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {saved && (
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.homeLink}>
              <Text style={styles.homeLinkText}>Back to Home</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            accessibilityLabel="What did you eat?"
            value={text}
            onChangeText={setText}
            placeholder="e.g. 2 rotis and a bowl of dal"
            placeholderTextColor={colors.placeholder}
            maxLength={MAX_TEXT}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !text.trim() || thinking }}
            disabled={!text.trim() || thinking}
            onPress={() => send()}
            style={({ pressed }) => [
              styles.sendButton,
              (!text.trim() || thinking) && styles.sendDisabled,
              pressed && styles.savePressed,
            ]}>
            <Text style={styles.sendText}>▶</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Breakfast / Lunch / Dinner / Snack chips
export function MealTypePicker({ value, onChange }: { value: MealType; onChange: (value: MealType) => void }) {
  return (
    <View style={styles.mealTypes} accessibilityRole="radiogroup">
      {MEAL_TYPES.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type DraftCardProps = {
  item: DraftItem;
  asking: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onChooseFood: (food: FoodChoice) => void;
  onAmount: (amount: Amount) => void;
  onNudge: (direction: 1 | -1) => void;
  onRemove: () => void;
};

// One food in the draft: a quick question while it's unclear, otherwise its amount and calories
export function DraftCard({
  item,
  asking,
  editing,
  onToggleEdit,
  onChooseFood,
  onAmount,
  onNudge,
  onRemove,
}: DraftCardProps) {
  const [customGrams, setCustomGrams] = useState('');
  const kcal = previewKcal(item);
  const ready = isReady(item);
  const sizeOptions = [
    ...item.portions.map((portion) => ({
      label: portion.label,
      amount: { kind: 'portion', portion, count: item.quantity || 1 } as Amount,
    })),
    ...householdSizes(item.unit).map((size) => ({
      label: size.label,
      amount: { kind: 'grams', grams: size.grams * (item.quantity || 1) } as Amount,
    })),
  ];

  const sizePicker = (
    <View style={styles.options}>
      {sizeOptions.map((option) => (
        <Pressable
          key={option.label}
          accessibilityRole="button"
          onPress={() => onAmount(option.amount)}
          style={styles.chip}>
          <Text style={styles.chipText}>{option.label}</Text>
        </Pressable>
      ))}
      <View style={styles.gramsRow}>
        <TextInput
          accessibilityLabel={`Grams of ${item.said}`}
          value={customGrams}
          onChangeText={(value) => setCustomGrams(value.replace(/[^0-9]/g, ''))}
          placeholder="Or type grams"
          placeholderTextColor={colors.placeholder}
          keyboardType="number-pad"
          maxLength={4}
          style={styles.gramsInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use these grams"
          disabled={!Number(customGrams)}
          onPress={() => onAmount({ kind: 'grams', grams: Number(customGrams) })}
          style={[styles.chip, !Number(customGrams) && styles.saveDisabled]}>
          <Text style={styles.chipText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.card, !ready && styles.cardAsking]}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{item.food?.name ?? item.said}</Text>
          <Text style={styles.cardSub}>
            You said: {item.quantity} {item.unit} {item.said}
          </Text>
        </View>
        <Text style={styles.cardKcal}>{kcal === null ? '—' : `${withCommas(kcal)} kcal`}</Text>
      </View>

      {!ready && asking && !item.matchConfirmed && (
        <View style={styles.question}>
          <Text style={styles.questionText}>Did you mean…?</Text>
          <View style={styles.options}>
            {[item.food!, ...item.alternatives].map((food) => (
              <Pressable
                key={food.id}
                accessibilityRole="button"
                onPress={() => onChooseFood(food)}
                style={styles.chip}>
                <Text style={styles.chipText}>{food.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!ready && asking && item.matchConfirmed && !item.amount && (
        <View style={styles.question}>
          <Text style={styles.questionText}>How much {item.said}?</Text>
          {sizePicker}
        </View>
      )}

      {!ready && !asking && <Text style={styles.cardSub}>Lilo will ask about this next.</Text>}

      {ready && (
        <>
          <View style={styles.amountRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Less"
              onPress={() => onNudge(-1)}
              style={styles.stepButton}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={styles.amountText}>{amountLabel(item.amount)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More"
              onPress={() => onNudge(1)}
              style={styles.stepButton}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.cardActions}>
            <Pressable accessibilityRole="button" onPress={onToggleEdit} style={styles.smallLink}>
              <Text style={styles.smallLinkText}>{editing ? 'Done' : 'Change size'}</Text>
            </Pressable>
            {item.alternatives.length > 0 && editing && (
              <View style={styles.options}>
                {item.alternatives.map((food) => (
                  <Pressable
                    key={food.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Swap to ${food.name}`}
                    onPress={() => onChooseFood(food)}
                    style={styles.chip}>
                    <Text style={styles.chipText}>Swap: {food.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={onRemove} style={styles.smallLink}>
              <Text style={styles.smallLinkText}>Remove</Text>
            </Pressable>
          </View>
          {editing && sizePicker}
          {gramsOf(item.amount) !== null && item.amount?.kind === 'grams' && (
            <Text style={styles.cardSub}>Sizes marked ≈ are estimates.</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
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
  backText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  headerTitle: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    color: colors.navy,
  },
  chat: {
    gap: 12,
    padding: 16,
  },
  liloRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '88%',
  },
  avatar: {
    width: 32,
    height: 32,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.navy,
  },
  liloBubble: {
    flexShrink: 1,
    backgroundColor: colors.cream,
    borderBottomLeftRadius: 2,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    backgroundColor: colors.navy,
    borderBottomRightRadius: 2,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liloText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.navy,
  },
  userText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.cream,
  },
  draft: {
    gap: 10,
  },
  card: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    boxShadow: `4px 4px 0 ${colors.navy}`,
  },
  cardAsking: {
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 10,
  },
  cardTitle: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  cardSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.plum,
  },
  cardKcal: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
  },
  question: {
    gap: 8,
  },
  questionText: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    color: colors.berry,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.background,
  },
  chipSelected: {
    backgroundColor: colors.navy,
  },
  chipText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 13,
    color: colors.navy,
  },
  chipTextSelected: {
    color: colors.cream,
  },
  gramsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gramsInput: {
    width: 130,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
    paddingHorizontal: 10,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.navy,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stepText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
  amountText: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.navy,
    textAlign: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  smallLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  smallLinkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
  note: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.berry,
  },
  mealTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notice: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.plum,
    textAlign: 'center',
  },
  saveButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  savePressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  saveText: {
    fontFamily: fonts.pixel,
    fontSize: 11,
    color: colors.cream,
  },
  homeLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  homeLinkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.cream,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.navy,
  },
  sendButton: {
    width: 52,
    height: 48,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.lycheePink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    fontFamily: fonts.pixel,
    fontSize: 14,
    color: colors.navy,
  },
});
