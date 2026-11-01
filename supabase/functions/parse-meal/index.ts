// parse-meal: turns "2 rotis and a bowl of dal" into a DRAFT list of foods.
// Claude only splits the text into food names + amounts. It never supplies
// calories or grams: every number comes from our database.
import Anthropic from "npm:@anthropic-ai/sdk@1";
import { withSupabase } from "npm:@supabase/server@1";

const MODEL = "claude-haiku-5-5";
const MAX_TEXT_LENGTH = 500;
const MAX_ITEMS = 10;
const UNITLESS = new Set(["", "piece", "pieces", "whole"]);
const GRAM_UNITS = new Set(["g", "gram", "grams"]);

// Reads ANTHROPIC_API_KEY from Supabase secrets automatically
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You turn a short description of a meal into a list of foods.
Users often use South Asian dish names (dal, roti, bhaji, biryani) and mixed spellings.
For each food or drink, return:
- name: the food in plain words, keeping the user's dish name (e.g. "chicken biryani", "masoor dal", "roti")
- quantity: how many, as a number (1 if not stated, 0.5 for "half")
- unit: the unit word the user used, e.g. "cup", "bowl", "plate", "g", or "" if none
Never estimate calories, grams or nutrition. Ignore anything that is not food or drink.
If the text contains no food, return an empty list.`;

const OUTPUT_SCHEMA = {
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
        },
        required: ["name", "quantity", "unit"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

type ParsedItem = { name: string; quantity: number; unit: string };

async function parseWithClaude(text: string): Promise<ParsedItem[] | null> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason !== "end_turn") return null; // refusal, cut off, etc.
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  return (JSON.parse(block.text).items as ParsedItem[]).slice(0, MAX_ITEMS);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return Response.json(
        { error: `Please describe your meal in 1-${MAX_TEXT_LENGTH} characters.` },
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

    // 1. Claude: split the text into foods (names + amounts only)
    let parsed: ParsedItem[] | null;
    try {
      parsed = await parseWithClaude(text);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return Response.json({ error: "The assistant is busy, please try again." }, { status: 429 });
      }
      if (error instanceof Anthropic.APIError) {
        console.error(`Claude API error ${error.status}`); // never log the user's text
        return Response.json({ error: "The assistant is unavailable right now." }, { status: 502 });
      }
      throw error;
    }
    if (parsed === null) {
      return Response.json({ error: "Sorry, I couldn't read that. Try rephrasing." }, { status: 422 });
    }

    // 2. Database: find each food, its portion and calories
    const items = [];
    for (const item of parsed) {
      const quantity = item.quantity > 0 && item.quantity <= 100 ? item.quantity : 1;
      const unit = item.unit.trim().toLowerCase();

      const { data: matches, error: searchError } = await ctx.supabase.rpc("search_foods", {
        search_text: item.name,
        max_results: 3,
      });
      if (searchError) throw searchError;
      if (!matches?.length) {
        items.push({ said: item.name, quantity, unit, status: "no_match" });
        continue;
      }
      const best = matches[0];

      const { data: portions, error: portionError } = await ctx.supabase
        .from("portion_sizes")
        .select("id, label, grams, is_default")
        .eq("food_id", best.id);
      if (portionError) throw portionError;

      let portion = null;
      let grams: number | null = null;
      if (GRAM_UNITS.has(unit)) {
        grams = quantity;
      } else {
        portion = UNITLESS.has(unit)
          ? portions.find((p) => p.is_default) ?? null
          : portions.find((p) => p.label.toLowerCase().includes(unit)) ?? null;
        if (portion) grams = Number(portion.grams) * quantity;
      }

      items.push({
        said: item.name,
        quantity,
        unit,
        status: grams === null ? "needs_portion" : "ready",
        food: { id: best.id, name: best.name, match_score: best.match_score },
        alternatives: matches.slice(1).map((m) => ({ id: m.id, name: m.name })),
        portion: portion && { id: portion.id, label: portion.label },
        portions: portions.map((p) => ({ id: p.id, label: p.label })),
        grams,
        // Preview only — the database recalculates when the log is saved
        energy_kcal: grams === null ? null : Math.round((Number(best.energy_kcal) * grams) / 100),
      });
    }

    return Response.json({ items, notice: "AI estimate, please check" });
  }),
};
