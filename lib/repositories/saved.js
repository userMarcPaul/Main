/* Saved-recipe data access via Supabase. */
import { db, unwrap } from "../db.js";
import { recipeCard } from "../mappers.js";

export async function list(userId) {
  const rows = unwrap(
    await db.from("saved_recipes")
      .select("recipes(slug, title, category, description, image_url, time_minutes, servings, difficulty, status)")
      .eq("user_id", userId)
      .order("saved_at", { ascending: false })
  );
  return rows
    .map((r) => r.recipes)
    .filter((r) => r && r.status === "published")
    .map(recipeCard);
}

export async function exists(userId, slug) {
  const id = await recipeIdBySlug(slug);
  if (id == null) return false;
  const rows = unwrap(
    await db.from("saved_recipes").select("recipe_id").eq("user_id", userId).eq("recipe_id", id).limit(1)
  );
  return rows.length > 0;
}

export async function add(userId, recipeId) {
  unwrap(
    await db.from("saved_recipes").upsert(
      { user_id: userId, recipe_id: recipeId },
      { onConflict: "user_id,recipe_id", ignoreDuplicates: true }
    )
  );
}

export async function removeBySlug(userId, slug) {
  const id = await recipeIdBySlug(slug);
  if (id == null) return;
  unwrap(await db.from("saved_recipes").delete().eq("user_id", userId).eq("recipe_id", id));
}

async function recipeIdBySlug(slug) {
  const rows = unwrap(await db.from("recipes").select("id").eq("slug", slug).limit(1));
  return rows.length ? Number(rows[0].id) : null;
}
