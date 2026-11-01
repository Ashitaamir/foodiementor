// parse-meal: Lilo, the conversational meal logger.
// Each message runs two short Claude steps:
//   1. Understand: read the whole chat and list the meal (name, amount, size, cooking method).
//   2. Decide: pick foods and measured portions ONLY from options our database offers,
//      and ask at most 3 quick questions, biggest calorie impact first.
// Claude never supplies calories or grams: weights come from measured portions or
// exact unit maths, and calories from public.foods. Every pick is checked here.
import Anthropic from "npm:@anthropic-ai/sdk@1";
import { withSupabase } from "npm:@supabase/server@1";

const MODEL = "claude-haiku-5-5";
const MAX_TEXT_LENGTH = 500;
const MAX_RECIPE_LENGTH = 4000; // Instagram captions can be long
const MAX_TURNS = 12;
const MAX_ITEMS = 10;
const MAX_INGREDIENTS = 30;
const MAX_QUESTIONS = 3;
const MIN_MATCH_SCORE = 0.5;
const MAX_IMAGE_BASE64_LENGTH = 5_000_000; // ~3.7 MB photo; the app should shrink photos first
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SEARCH_RESULTS = 5;
const UNITLESS = new Set(["", "piece", "pieces", "whole", "serving", "servings"]);

// Weights convert exactly; no portion needed
const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1, gm: 1, gram: 1, grams: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

// Household measures: the words to look for in a food's measured portion labels
const PORTION_WORDS: Record<string, string[]> = {
  cup: ["cup"], cups: ["cup"], c: ["cup"],
  tbsp: ["tablespoon", "tbsp"], tbs: ["tablespoon", "tbsp"], tablespoon: ["tablespoon", "tbsp"],
  tablespoons: ["tablespoon", "tbsp"],
  tsp: ["teaspoon", "tsp"], teaspoon: ["teaspoon", "tsp"], teaspoons: ["teaspoon", "tsp"],
  slice: ["slice"], slices: ["slice"],
  glass: ["glass", "cup"], glasses: ["glass", "cup"],
  "fl oz": ["fl oz"], "fluid ounce": ["fl oz"], "fluid ounces": ["fl oz"],
};

type PortionRow = { id: string; food_id: string; label: string; grams: number; is_default: boolean };
type FoodMatch = { id: string; name: string; energy_kcal: number; match_score: number };
type ImageInput = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
type Turn = { role: "user" | "assistant"; text: string };

// All measured portions of a food that use the unit the user said (e.g. "cup")
function unitPortions(portions: PortionRow[], unit: string): PortionRow[] {
  if (UNITLESS.has(unit)) return portions.filter((p) => p.is_default);
  const words = PORTION_WORDS[unit] ?? [unit];
  return portions
    .filter((p) => {
      const label = p.label.toLowerCase();
      return words.some((word) => new RegExp(`\\b${word}e?s?\\b`).test(label));
    })
    .sort((a, b) => a.label.length - b.label.length);
}

// The portion to use, or null if it's unclear and the user should pick
// (e.g. dry pasta: "1 cup shells" is 64 g but "1 cup elbows" is 122 g)
function findPortion(portions: PortionRow[], unit: string): PortionRow | null {
  const matching = unitPortions(portions, unit);
  if (matching.length === 0) return null;
  const words = PORTION_WORDS[unit] ?? [unit];
  const plain = matching.find((p) => words.some((word) => p.label.toLowerCase() === `1 ${word}`));
  if (plain) return plain;
  const weights = matching.map((p) => Number(p.grams));
  return Math.max(...weights) <= Math.min(...weights) * 1.15 ? matching[0] : null;
}

// Reads ANTHROPIC_API_KEY from Supabase secrets automatically
const anthropic = new Anthropic();

// ---------- Step 1: understand the meal ----------

const UNDERSTAND_PROMPT = `You are Lilo, a friendly food-logging helper. Read the whole conversation and list
everything the user has eaten in this meal so far, applying any corrections or answers they gave later
(e.g. "actually 6", "they were fried"). Users often use South Asian dish names and mixed spellings.
For each food or drink return:
- name: the food in plain words, keeping the user's dish name (e.g. "chicken biryani", "masoor dal", "shrimp")
- quantity: how many, as a number (1 if not stated, 0.5 for "half", 3 for "a few")
- unit: the unit word used, e.g. "cup", "tbsp", "slice", "oz", "g", "bowl", "plate", or "" if none
- size: "small", "medium", "large" or "" if not said
- preparation: how it was cooked or served if said or answered (e.g. "fried", "grilled", "in curry"), else ""
- search: 2-4 words to look the food up in a nutrition database, e.g. "shrimp fried", "dry pasta", "rice white cooked"
If the user says uncooked, raw or dry, use "dry" or "raw" in name and search.
Never estimate calories, grams or nutrition. Ignore anything that is not food or drink.
If a photo is included, list only foods you can see plus any the user mentions; count pieces,
or guess cups for rice, dal and curries.`;

const UNDERSTAND_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          size: { type: "string" },
          preparation: { type: "string" },
          search: { type: "string" },
        },
        required: ["name", "quantity", "unit", "size", "preparation", "search"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// Recipes (typed, pasted from an Instagram caption, or a screenshot): list the ingredients
const RECIPE_PROMPT = `You read a recipe (typed by the user, pasted from a social media caption, or in a
screenshot) and list its INGREDIENTS with amounts, as written. Ignore steps, hashtags, emojis and chatter.
Also give recipe_name (short, e.g. "Chicken karahi") and servings (number of people it serves; 0 if not given).
For each ingredient return:
- name: the ingredient in plain words (e.g. "chicken thigh", "basmati rice", "ghee")
- quantity: the amount as a number (1 if not stated, 0.5 for "1/2")
- unit: the unit word used, e.g. "cup", "tbsp", "tsp", "g", "kg", "oz", "lb", or "" if none
- size: "small", "medium", "large" or ""
- preparation: "raw", "dry", "cooked", "canned" etc. if stated, else ""
- search: 2-4 words to look it up in a nutrition database, e.g. "chicken thigh raw", "rice basmati dry"
Ingredients in a recipe are usually raw or dry unless it says cooked.
Never estimate calories, grams or nutrition.`;

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    recipe_name: { type: "string" },
    servings: { type: "number" },
    items: UNDERSTAND_SCHEMA.properties.items,
  },
  required: ["recipe_name", "servings", "items"],
  additionalProperties: false,
};

type Understood = {
  name: string;
  quantity: number;
  unit: string;
  size: string;
  preparation: string;
  search: string;
};

// ---------- Step 2: choose from the database and decide what to ask ----------

const DECIDE_PROMPT = `You are Lilo, a warm, playful food-logging helper (a pixel lychee).
You get the user's meal items and, for each, candidate foods from a nutrition database with their
measured portions. For each item:
- food_ref: the candidate that best matches what the user ate (respect preparation, e.g. fried vs grilled).
  Use "" only if no candidate fits at all.
- portion_ref: a portion of THAT food matching what they said (e.g. "1 medium" for "5 medium shrimp",
  "1 cup" for cups). Use "" if the unit is a weight (g, kg, oz, lb) or no portion fits.
- portion_count: how many of that portion (e.g. 5). Use 1 if unsure.
Then decide questions: ask ONLY about things that change calories a lot (cooking method like fried vs
grilled, oil/ghee/butter, big size differences, which variety when portions differ a lot). Ask at most 3,
biggest calorie impact first. If nothing important is unclear, ask nothing. Each question has 2-4 short
options; "answer" is exactly what the user would reply (e.g. "They were fried").
Never mention calorie or gram numbers. reply: one or two short, friendly sentences, e.g.
"5 medium shrimp, yum! Quick question so I get it right:" or "All set, check it and save!".
Only use refs that appear in the input.`;

const DECIDE_SCHEMA = {
  type: "object",
  properties: {
    choices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "integer" },
          food_ref: { type: "string" },
          portion_ref: { type: "string" },
          portion_count: { type: "number" },
        },
        required: ["item", "food_ref", "portion_ref", "portion_count"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "integer" },
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, answer: { type: "string" } },
              required: ["label", "answer"],
              additionalProperties: false,
            },
          },
        },
        required: ["item", "question", "options"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["choices", "questions", "reply"],
  additionalProperties: false,
};

type Decision = {
  choices: { item: number; food_ref: string; portion_ref: string; portion_count: number }[];
  questions: { item: number; question: string; options: { label: string; answer: string }[] }[];
  reply: string;
};

// One structured Claude call; null if it refused or got cut off
async function askClaude<T>(
  system: string,
  messages: Anthropic.MessageParam[],
  schema: Record<string, unknown>,
): Promise<T | null> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages,
  });
  if (response.stop_reason !== "end_turn") return null;
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  return JSON.parse(block.text) as T;
}

// ---------- Request checks ----------

// Accept only a JPEG/PNG/WebP photo (base64) within the size limit
function readImage(value: unknown): ImageInput | null {
  if (!value || typeof value !== "object") return null;
  const { media_type, data } = value as Record<string, unknown>;
  if (typeof media_type !== "string" || !IMAGE_TYPES.has(media_type)) return null;
  if (typeof data !== "string" || !data || data.length > MAX_IMAGE_BASE64_LENGTH) return null;
  return { media_type: media_type as ImageInput["media_type"], data };
}

// The chat so far (newest last). Older apps/tests may still send a single `text`.
function readConversation(body: Record<string, unknown> | null, maxLength: number): Turn[] | null {
  if (typeof body?.text === "string") {
    const text = body.text.trim();
    return text.length <= maxLength ? [{ role: "user", text }] : null;
  }
  if (!Array.isArray(body?.messages)) return [];
  const turns: Turn[] = [];
  for (const raw of body.messages.slice(-MAX_TURNS)) {
    const role = raw?.role === "assistant" ? "assistant" : raw?.role === "user" ? "user" : null;
    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    if (!role || !text) continue;
    if (text.length > maxLength) return null;
    turns.push({ role, text });
  }
  return turns;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body = await req.json().catch(() => null);
    // "recipe": read a recipe's ingredients (Make a recipe, Meal prep batch, Insta recipe)
    const isRecipe = body?.purpose === "recipe";
    const turns = readConversation(body, isRecipe ? MAX_RECIPE_LENGTH : MAX_TEXT_LENGTH);
    const image = readImage(body?.image);
    if (body?.image && !image) {
      return Response.json(
        { error: "Photo must be a JPEG, PNG or WebP under about 3.5 MB." },
        { status: 400 },
      );
    }
    if (turns === null || (!turns.some((t) => t.role === "user") && !image)) {
      return Response.json(
        { error: `Please describe your meal (up to ${MAX_TEXT_LENGTH} characters) or add a photo.` },
        { status: 400 },
      );
    }

    // Daily limit: checked before calling Claude, so over-limit requests cost nothing
    const { data: allowed, error: limitError } = await ctx.supabase.rpc("use_ai_request");
    if (limitError) throw limitError;
    if (!allowed) {
      return Response.json(
        { error: "Daily AI limit reached, try again tomorrow." },
        { status: 429 },
      );
    }

    try {
      // ---- Step 1: understand the whole conversation ----
      const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
        role: turn.role,
        content: turn.text,
      }));
      if (image) {
        const photo = {
          type: "image" as const,
          source: { type: "base64" as const, media_type: image.media_type, data: image.data },
        };
        const caption = turns.length ? turns[turns.length - 1].text : "What foods are in this photo?";
        messages.splice(messages.length ? messages.length - 1 : 0, 1, {
          role: "user",
          content: [photo, { type: "text" as const, text: caption }],
        });
      }
      if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: "(meal chat)" });

      const understood = await askClaude<{ items: Understood[]; recipe_name?: string; servings?: number }>(
        isRecipe ? RECIPE_PROMPT : UNDERSTAND_PROMPT,
        messages,
        isRecipe ? RECIPE_SCHEMA : UNDERSTAND_SCHEMA,
      );
      if (!understood) {
        return Response.json({ error: "Sorry, I couldn't read that. Try rephrasing." }, { status: 422 });
      }
      const meal = understood.items.slice(0, isRecipe ? MAX_INGREDIENTS : MAX_ITEMS).map((item) => ({
        ...item,
        quantity: item.quantity > 0 && item.quantity <= 100 ? item.quantity : 1,
        unit: item.unit.trim().toLowerCase().replace(/\.$/, ""),
      }));

      // ---- Database: candidate foods and their measured portions ----
      const candidatesByItem: FoodMatch[][] = [];
      for (const item of meal) {
        const { data, error } = await ctx.supabase.rpc("search_foods", {
          search_text: item.search || item.name,
          max_results: SEARCH_RESULTS,
        });
        if (error) throw error;
        let matches = (data ?? []) as FoodMatch[];
        if (!matches.length && item.search) {
          const retry = await ctx.supabase.rpc("search_foods", {
            search_text: item.name,
            max_results: SEARCH_RESULTS,
          });
          if (retry.error) throw retry.error;
          matches = (retry.data ?? []) as FoodMatch[];
        }
        candidatesByItem.push(matches.filter((m, i) => i === 0 || m.match_score >= MIN_MATCH_SCORE));
      }
      const allFoodIds = [...new Set(candidatesByItem.flat().map((m) => m.id))];
      const { data: portionData, error: portionError } = allFoodIds.length
        ? await ctx.supabase
            .from("portion_sizes")
            .select("id, food_id, label, grams, is_default")
            .in("food_id", allFoodIds)
        : { data: [], error: null };
      if (portionError) throw portionError;
      const portionsOf = (foodId: string) =>
        ((portionData ?? []) as PortionRow[]).filter((p) => p.food_id === foodId);

      // Short refs ("f1", "p3") instead of database ids, so Claude can only pick what we offer
      const foodRefs = new Map<string, FoodMatch>();
      const portionRefs = new Map<string, PortionRow>();
      let foodCounter = 0;
      let portionCounter = 0;
      const decideInput = meal.map((item, index) => ({
        item: index,
        said: `${item.quantity} ${item.size} ${item.unit} ${item.name}`.replace(/\s+/g, " ").trim(),
        preparation: item.preparation,
        candidates: candidatesByItem[index].map((food) => {
          const ref = `f${++foodCounter}`;
          foodRefs.set(ref, food);
          return {
            food_ref: ref,
            name: food.name,
            portions: portionsOf(food.id).map((portion) => {
              const pref = `p${++portionCounter}`;
              portionRefs.set(pref, portion);
              return { portion_ref: pref, label: portion.label };
            }),
          };
        }),
      }));

      // ---- Step 2: choose and decide what to ask ----
      const decision = meal.length
        ? await askClaude<Decision>(
            DECIDE_PROMPT,
            [{ role: "user", content: JSON.stringify({ items: decideInput }) }],
            DECIDE_SCHEMA,
          )
        : { choices: [], questions: [], reply: "" };

      // ---- Build the draft, checking every pick against what we offered ----
      const items = meal.map((item, index) => {
        const candidates = candidatesByItem[index];
        const base = { said: item.name, quantity: item.quantity, unit: item.unit };
        if (!candidates.length) return { ...base, status: "no_match" };

        const choice = decision?.choices.find((c) => c.item === index);
        const picked = choice ? foodRefs.get(choice.food_ref) : undefined;
        let food = picked && candidates.some((c) => c.id === picked.id) ? picked : candidates[0];
        const weightUnit = GRAMS_PER_UNIT[item.unit];
        // No usable pick: prefer a candidate that has a measured size for the user's unit
        if (!picked && !weightUnit && unitPortions(portionsOf(food.id), item.unit).length === 0) {
          food = candidates.find((c) => unitPortions(portionsOf(c.id), item.unit).length > 0) ?? food;
        }
        const portions = portionsOf(food.id);

        let portion: PortionRow | null = null;
        let count = item.quantity;
        let grams: number | null = null;
        if (weightUnit) {
          grams = Math.round(item.quantity * weightUnit * 10) / 10;
        } else {
          const chosen = choice ? portionRefs.get(choice.portion_ref) : undefined;
          if (chosen && chosen.food_id === food.id) {
            portion = chosen;
            if (choice!.portion_count > 0 && choice!.portion_count <= 100) count = choice!.portion_count;
          } else {
            portion = findPortion(portions, item.unit);
          }
          if (portion) grams = Number(portion.grams) * count;
        }

        return {
          ...base,
          quantity: portion ? count : item.quantity,
          status: grams === null ? "needs_portion" : "ready",
          food: {
            id: food.id,
            name: food.name,
            match_score: food.match_score,
            kcal_per_100g: Number(food.energy_kcal),
          },
          alternatives: candidates
            .filter((c) => c.id !== food.id && c.match_score >= MIN_MATCH_SCORE)
            .slice(0, 3)
            .map((c) => ({ id: c.id, name: c.name, kcal_per_100g: Number(c.energy_kcal) })),
          portion: portion && { id: portion.id, label: portion.label, grams: Number(portion.grams) },
          portions: portions.map((p) => ({ id: p.id, label: p.label, grams: Number(p.grams) })),
          grams,
          // Preview only — the database recalculates when the log is saved
          energy_kcal: grams === null ? null : Math.round((Number(food.energy_kcal) * grams) / 100),
        };
      });

      // Recipes are checked on screen instead of with chat questions
      const questions = (isRecipe ? [] : decision?.questions ?? [])
        .filter((q) => q.item >= 0 && q.item < items.length && q.question.trim())
        .slice(0, MAX_QUESTIONS)
        .map((q) => ({
          item: q.item,
          question: q.question.trim().slice(0, 160),
          options: q.options
            .filter((o) => o.label.trim() && o.answer.trim())
            .slice(0, 4)
            .map((o) => ({ label: o.label.trim().slice(0, 40), answer: o.answer.trim().slice(0, 120) })),
        }))
        .filter((q) => q.options.length > 0);

      return Response.json({
        items,
        questions,
        reply: decision?.reply?.trim().slice(0, 300) ?? "",
        recipe_name: isRecipe ? (understood.recipe_name ?? "").trim().slice(0, 80) : undefined,
        servings:
          isRecipe && understood.servings && understood.servings > 0 && understood.servings <= 100
            ? understood.servings
            : undefined,
        input_method: image ? "scan" : "chat",
        notice: "AI estimate, please check",
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return Response.json({ error: "Lilo is busy, please try again." }, { status: 429 });
      }
      if (error instanceof Anthropic.APIError) {
        console.error(`Claude API error ${error.status}`); // never log the user's text
        return Response.json({ error: "Lilo is unavailable right now." }, { status: 502 });
      }
      throw error;
    }
  }),
};
