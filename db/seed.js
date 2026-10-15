/* Insert the six starter recipes as `published`. Idempotent: a slug that is
   already present is skipped, so re-running never duplicates and never touches
   user data. Requires the Supabase schema (db/supabase/*.sql) to be applied. */
import { db, unwrap } from "../lib/db.js";
import { recipes } from "./recipes.js";

let inserted = 0;
let skipped = 0;

for (const [index, recipe] of recipes.entries()) {
  const existing = unwrap(await db.from("recipes").select("id").eq("slug", recipe.slug).limit(1));
  if (existing.length) { skipped += 1; continue; }

  // Stagger created_at so "latest recipes" has a meaningful order.
  const createdAt = new Date(Date.now() - (recipes.length - index) * 86_400_000).toISOString();

  const row = unwrap(
    await db.from("recipes").insert({
      slug: recipe.slug, title: recipe.title, category: recipe.category,
      description: recipe.description, image_url: recipe.image_url,
      time_minutes: recipe.time_minutes, servings: recipe.servings,
      difficulty: recipe.difficulty, status: "published",
      featured: Boolean(recipe.featured), created_at: createdAt,
    }).select("id")
  )[0];
  const recipeId = Number(row.id);

  unwrap(await db.from("ingredients").insert(
    recipe.ingredients.map(([emoji, name, qty, unit], position) =>
      ({ recipe_id: recipeId, position, emoji, name, qty, unit }))
  ));
  unwrap(await db.from("steps").insert(
    recipe.steps.map((text, position) => ({ recipe_id: recipeId, position, text }))
  ));

  inserted += 1;
  console.log(`  ${recipe.slug} — ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps`);
}

console.log(`\nSeeded ${inserted} recipe(s); skipped ${skipped} already present.`);
