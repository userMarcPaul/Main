/* All recipe data access, via Supabase. Aggregate reads come from the
   `recipe_cards` / `category_counts` views, and the atomic submission write
   from the `create_submission` RPC (see db/supabase/). Returns the same shapes
   the services already expect. */
import { db, unwrap } from "../db.js";
import { recipeCard, recipeDetail } from "../mappers.js";

/** Published recipes matching an optional query, as cards. */
export async function search({ q, category, featured, limit }) {
  let query = db.from("recipe_cards").select("*").eq("status", "published");

  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  if (category) query = query.ilike("category", category); // exact, case-insensitive
  if (featured) query = query.eq("featured", true);

  query = query.order("created_at", { ascending: false }).limit(limit);
  return unwrap(await query).map(recipeCard);
}

/** A lightweight { id, authorId } for a published recipe, or null. */
export async function findRef(slug) {
  const rows = unwrap(
    await db.from("recipes").select("id, author_id").eq("slug", slug).eq("status", "published").limit(1)
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), authorId: rows[0].author_id == null ? null : Number(rows[0].author_id) };
}

/** A full published recipe with ingredients, steps and review summary, or null. */
export async function getDetail(slug) {
  const rows = unwrap(
    await db.from("recipe_cards").select("*").eq("slug", slug).eq("status", "published").limit(1)
  );
  if (!rows.length) return null;
  return assembleDetail(rows[0]);
}

/** A full recipe by id, any status, for an admin preview; or null. */
export async function getByIdDetail(id) {
  const rows = unwrap(await db.from("recipe_cards").select("*").eq("id", id).limit(1));
  if (!rows.length) return null;
  const detail = await assembleDetail(rows[0]);
  return { ...detail, id: Number(rows[0].id), status: rows[0].status, rejectionReason: rows[0].rejection_reason ?? null };
}

async function assembleDetail(row) {
  const [ingredients, steps] = await Promise.all([
    db.from("ingredients").select("emoji, name, qty, unit").eq("recipe_id", row.id).order("position"),
    db.from("steps").select("text").eq("recipe_id", row.id).order("position"),
  ]);
  return recipeDetail(row, unwrap(ingredients), unwrap(steps));
}

/** Categories that have published recipes, with real counts. */
export async function categoriesWithCounts() {
  const rows = unwrap(
    await db.from("category_counts").select("*").order("recipe_count", { ascending: false }).order("name")
  );
  return rows.map((r) => ({ name: r.name, recipeCount: Number(r.recipe_count) }));
}

/* ---------- Submissions & moderation ---------- */

export async function slugTaken(slug) {
  const rows = unwrap(await db.from("recipes").select("id").eq("slug", slug).limit(1));
  return rows.length > 0;
}

/** Create a pending submission + its ingredients and steps atomically (RPC). */
export async function createSubmission(recipe, ingredients, steps) {
  unwrap(
    await db.rpc("create_submission", {
      p_slug: recipe.slug,
      p_title: recipe.title,
      p_category: recipe.category,
      p_description: recipe.description,
      p_image_url: recipe.imageUrl,
      p_time_minutes: recipe.timeMinutes,
      p_servings: recipe.servings,
      p_difficulty: recipe.difficulty,
      p_author_id: recipe.authorId,
      p_ingredients: ingredients,
      p_steps: steps,
    })
  );
}

/** Every recipe a user has submitted, any status, newest first. */
export async function listByAuthor(authorId) {
  const rows = unwrap(
    await db.from("recipe_cards").select("*").eq("author_id", authorId).order("created_at", { ascending: false })
  );
  return rows.map((r) => ({ ...recipeCard(r), status: r.status, rejectionReason: r.rejection_reason ?? null }));
}

/** The moderation queue: recipes in one status, oldest first, with author name. */
export async function listByStatus(status) {
  const rows = unwrap(
    await db.from("recipe_cards").select("*").eq("status", status).order("created_at", { ascending: true })
  );
  return rows.map((r) => ({
    id: Number(r.id), ...recipeCard(r), status: r.status,
    authorName: r.author_name ?? null, createdAt: r.created_at,
  }));
}

/** The author of a recipe by id, or null — for ownership checks. */
export async function authorOf(id) {
  const rows = unwrap(await db.from("recipes").select("author_id, status").eq("id", id).limit(1));
  if (!rows.length) return null;
  return { authorId: rows[0].author_id == null ? null : Number(rows[0].author_id), status: rows[0].status };
}

export async function setStatus(id, status, rejectionReason = null) {
  unwrap(await db.from("recipes").update({ status, rejection_reason: rejectionReason }).eq("id", id));
}
