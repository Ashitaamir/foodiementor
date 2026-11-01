# FoodieMentor 🍒

**A pixel-art calorie tracker for real, home-cooked food.** Log meals the way you actually eat them — in your own words, a photo of your plate, a packet's barcode, or a recipe from an Instagram caption — and Lilo the lychee turns it into an editable food log.

> Status: in active development (personal project). iOS and Android via Expo.

## Why

Most calorie apps struggle with home cooking and make you weigh everything. FoodieMentor understands everyday dishes from many cuisines, everyday portions (bowls, cups, spoons, slices) and UK/US/Canadian packaged food.

## Features

- **Chat with Lilo** – describe a meal in plain English; Lilo asks short follow-up questions (e.g. "cooked or uncooked rice?") instead of making you fill in forms.
- **Plate photo** – snap your meal and confirm what Lilo sees.
- **Barcode scan** – packaged foods via Open Food Facts.
- **Recipes and meal-prep batches** – add ingredients once, log a portion all week.
- **Instagram recipes** – paste a caption or screenshot and get the calories per serving.
- **Workouts** – log activities and estimate calories burned from MET values and your weight.
- **Personal goal** – onboarding survey (Mifflin–St Jeor) with a safe weekly-rate slider.
- **Today at a glance** – calorie "health bar", macros, meals grouped by breakfast / lunch / dinner / snacks.
- **Two themes** – colourful lavender arcade and a black-and-silver dark mode, with Lilo's mood faces.

## How the AI is used (and not used)

All input goes through one pipeline: **parse → clarify → database lookup → editable draft**.

The language model only *understands* what you wrote or photographed and picks matches from database search results. **It never invents calorie numbers** — every number comes from published food composition data, and nothing is saved until you confirm it. AI calls run server-side with a per-user daily limit.

## Tech stack

| Area | Tools |
| --- | --- |
| App | React Native 0.88, Expo SDK 58, Expo Router (file-based navigation), TypeScript |
| UI and animation | React Native Reanimated 4, custom pixel-art renderer, Press Start 2P + Nunito fonts |
| Device | Expo Camera (photos and barcodes), Expo Image Picker, Expo Image Manipulator |
| Backend | Supabase: Postgres, Auth, Row-Level Security, Edge Functions (Deno) |
| Database logic | SQL migrations, triggers for nutrition maths, `pg_trgm` fuzzy food search |
| AI | Claude API (Anthropic) with structured JSON output, called only from Edge Functions |
| Data pipeline | Python scripts that convert official food datasets into SQL migrations |

## Security and privacy

- No secrets in the app or this repo. The Claude API key and Supabase service key live only in Supabase secrets; `.env` is git-ignored and `.env.example` has empty placeholders.
- Every table has **row-level security**: each user can only read and change their own logs, recipes, workouts and profile.
- Survey answers (weight, height, etc.) are never sent to the AI.

## Project structure

```
src/app/          screens (Expo Router): sign-in, survey, tabs (Home, Workout, Recipes), log modes
src/components/   UI: Lilo, pixel console, chat, scanner, recipe builder, themes
src/lib/          Supabase client, session/profile, meal draft logic, calorie goal maths
supabase/         SQL migrations (schema, RLS, food data) and Edge Functions
scripts/          dataset import scripts, Lilo pixel-art generator, API test script
data/             hand-written search aliases and everyday portion sizes
```

## Running it locally

You need Node.js, the Supabase CLI and your own Supabase project.

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase project URL and publishable (anon) key.
3. Apply the database: `npx supabase link` then `npx supabase db push`.
4. Set the AI key as a Supabase secret (never in `.env`): `npx supabase secrets set ANTHROPIC_API_KEY=...`
5. Deploy the functions: `npx supabase functions deploy parse-meal` and `npx supabase functions deploy lookup-barcode`.
6. `npx expo start` and open it in Expo Go or a development build.

## Data sources and credits

- **UK CoFID 2021** (McCance and Widdowson's Composition of Foods Integrated Dataset), Public Health England / Food Standards Agency — contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **USDA FoodData Central** (FNDDS 2021–2023 and SR Legacy), U.S. Department of Agriculture, Agricultural Research Service — public domain (CC0).
- **Open Food Facts** — product data © Open Food Facts contributors, [Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/). Fetched at runtime and kept separate; not included in this repo.
- **2024 Adult Compendium of Physical Activities** — Herrmann SD, et al. *Journal of Sport and Health Science* 2024 ([pacompendium.com](https://pacompendium.com/)). MET values used unchanged.
- Fonts: Press Start 2P and Nunito (SIL Open Font License).

Calorie and nutrient values are estimates for general wellbeing, not medical advice.

## Licence

© 2026 Ashita Binte Amir. All rights reserved. The code is public to view; please ask before reusing any of it. See [LICENSE](LICENSE). Third-party data keeps its own licence (above).

## Author

Built by **Ashita Binte Amir** — [GitHub](https://github.com/Ashitaamir).
