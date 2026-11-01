// lookup-barcode: finds a packaged food by its barcode in Open Food Facts (ODbL).
// Results are cached in public.off_products (kept separate from public.foods).
// Only this server function writes there; users can only read.
import { withSupabase } from "npm:@supabase/server@1";

const CACHE_DAYS = 30;
// Open Food Facts asks every app to identify itself
const USER_AGENT = "FoodieMentor/0.1 (https://github.com/Ashitaamir/foodiementor)";
const FIELDS = "product_name,brands,serving_size,serving_quantity,nutriments";

type Nutriments = Record<string, unknown>;

function per100(nutriments: Nutriments, key: string): number | null {
  const value = Number(nutriments[`${key}_100g`]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const body = await req.json().catch(() => null);
    const barcode = typeof body?.barcode === "string" ? body.barcode.replace(/\D/g, "") : "";
    if (!/^[0-9]{8,14}$/.test(barcode)) {
      return Response.json({ error: "That doesn't look like a food barcode." }, { status: 400 });
    }

    // 1. Already looked up recently?
    const { data: cached, error: cacheError } = await ctx.supabase
      .from("off_products")
      .select("*")
      .eq("barcode", barcode)
      .maybeSingle();
    if (cacheError) throw cacheError;
    const fresh =
      cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 24 * 3600 * 1000;
    if (fresh) return Response.json({ product: cached });

    // 2. Ask Open Food Facts
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${FIELDS}`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (response.status === 404) {
      return Response.json({ error: "Lilo couldn't find this product yet." }, { status: 404 });
    }
    if (!response.ok) {
      console.error(`Open Food Facts error ${response.status}`);
      if (cached) return Response.json({ product: cached });
      return Response.json({ error: "The product library is busy, please try again." }, { status: 502 });
    }
    const json = await response.json();
    const product = json?.product;
    const nutriments: Nutriments = product?.nutriments ?? {};
    const energy = per100(nutriments, "energy-kcal");
    if (!product || json?.status === 0 || energy === null) {
      return Response.json(
        { error: "This product has no calorie information yet." },
        { status: 404 },
      );
    }

    const servingG = Number(product.serving_quantity);
    const row = {
      barcode,
      product_name: String(product.product_name || "Unnamed product").slice(0, 120),
      brands: product.brands ? String(product.brands).slice(0, 120) : null,
      serving_size: product.serving_size ? String(product.serving_size).slice(0, 60) : null,
      serving_g: Number.isFinite(servingG) && servingG > 0 && servingG <= 5000 ? servingG : null,
      energy_kcal: energy,
      protein_g: per100(nutriments, "proteins"),
      carbs_g: per100(nutriments, "carbohydrates"),
      fat_g: per100(nutriments, "fat"),
      fibre_g: per100(nutriments, "fiber"),
      fetched_at: new Date().toISOString(),
    };

    // 3. Cache it (server-only write; users can't change this table)
    const { error: saveError } = await ctx.supabaseAdmin.from("off_products").upsert(row);
    if (saveError) throw saveError;
    return Response.json({ product: row });
  }),
};
