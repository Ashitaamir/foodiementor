// Turns parse-meal's answer into an editable draft and, once confirmed, into food_logs rows.
// Calories shown here are previews only: the database recalculates them when the log is saved.

export type Portion = { id: string; label: string; grams: number };
export type FoodChoice = { id: string; name: string; kcal_per_100g: number };

// What the parse-meal function returns for each item
export type ParsedItem = {
  said: string;
  quantity: number;
  unit: string;
  status: 'ready' | 'needs_portion' | 'check_match' | 'no_match';
  food?: FoodChoice & { match_score: number };
  alternatives?: FoodChoice[];
  portion?: Portion | null;
  portions?: Portion[];
  grams?: number | null;
};

// A quick question from Lilo; tapping an option sends its `answer` as the user's reply
export type LiloQuestion = {
  item: number;
  question: string;
  options: { label: string; answer: string }[];
};

export type Amount = { kind: 'portion'; portion: Portion; count: number } | { kind: 'grams'; grams: number };

export type DraftItem = {
  key: string;
  said: string;
  unit: string;
  quantity: number;
  food: FoodChoice | null;
  matchConfirmed: boolean; // false while Lilo isn't sure it picked the right food
  alternatives: FoodChoice[];
  portions: Portion[];
  amount: Amount | null;
  edited: boolean; // the user changed the amount by hand, so keep it when Lilo updates the draft
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export function toDraft(items: ParsedItem[]): DraftItem[] {
  return items.map((item, index) => {
    let amount: Amount | null = null;
    if (item.portion) {
      amount = { kind: 'portion', portion: item.portion, count: item.quantity };
    } else if (item.grams) {
      amount = { kind: 'grams', grams: item.grams };
    }
    return {
      key: `${index}-${item.said}`,
      said: item.said,
      unit: item.unit,
      quantity: item.quantity,
      food: item.food
        ? { id: item.food.id, name: item.food.name, kcal_per_100g: item.food.kcal_per_100g }
        : null,
      matchConfirmed: item.status !== 'check_match',
      alternatives: item.alternatives ?? [],
      portions: item.portions ?? [],
      amount,
      edited: false,
    };
  });
}

// Lilo rebuilds the whole draft each message; keep amounts the user set by hand
export function mergeDraft(previous: DraftItem[] | null, next: DraftItem[]): DraftItem[] {
  if (!previous) return next;
  return next.map((item) => {
    const old = previous.find((p) => p.edited && p.food?.id && p.food.id === item.food?.id);
    return old ? { ...item, amount: old.amount, edited: true } : item;
  });
}

export function gramsOf(amount: Amount | null) {
  if (!amount) return null;
  return amount.kind === 'grams' ? amount.grams : amount.portion.grams * amount.count;
}

export function previewKcal(item: DraftItem) {
  const grams = gramsOf(item.amount);
  if (!item.food || grams === null) return null;
  return Math.round((item.food.kcal_per_100g * grams) / 100);
}

export function isReady(item: DraftItem) {
  return !!item.food && item.matchConfirmed && !!item.amount;
}

// Items that still need an answer, biggest likely calorie impact first.
// Only the first few are asked at once so the user isn't flooded with questions.
export const MAX_OPEN_QUESTIONS = 3;
export function questionQueue(items: DraftItem[]) {
  return items
    .filter((item) => item.food && !isReady(item))
    .sort((a, b) => (b.food?.kcal_per_100g ?? 0) - (a.food?.kcal_per_100g ?? 0))
    .slice(0, MAX_OPEN_QUESTIONS)
    .map((item) => item.key);
}

// Household sizes for when the database has no matching portion.
// These are FoodieMentor estimates (marked "≈"), to be replaced with weighed home portions.
const HOUSEHOLD_SIZES: Record<string, { label: string; grams: number }[]> = {
  bowl: [
    { label: 'Small bowl ≈150 g', grams: 150 },
    { label: 'Medium bowl ≈250 g', grams: 250 },
    { label: 'Large bowl ≈350 g', grams: 350 },
  ],
  plate: [
    { label: 'Small plate ≈200 g', grams: 200 },
    { label: 'Medium plate ≈300 g', grams: 300 },
    { label: 'Large plate ≈400 g', grams: 400 },
  ],
  default: [
    { label: 'Small serving ≈100 g', grams: 100 },
    { label: 'Medium serving ≈200 g', grams: 200 },
    { label: 'Large serving ≈300 g', grams: 300 },
  ],
};

export function householdSizes(unit: string) {
  return HOUSEHOLD_SIZES[unit] ?? HOUSEHOLD_SIZES.default;
}

export function mealTypeForNow(now = new Date()): MealType {
  const hour = now.getHours();
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'snack';
}

// Rows for food_logs. Only food, amount and labels are sent; calories are filled in by the database.
export function toLogRows(items: DraftItem[], mealType: MealType, inputMethod: 'chat' | 'scan') {
  return items.filter(isReady).map((item) => {
    const base = {
      food_id: item.food!.id,
      status: 'confirmed' as const,
      input_method: inputMethod,
      meal_type: mealType,
    };
    const amount = item.amount!;
    return amount.kind === 'portion'
      ? { ...base, portion_id: amount.portion.id, portion_count: amount.count }
      : { ...base, grams: Math.round(amount.grams * 10) / 10 };
  });
}
