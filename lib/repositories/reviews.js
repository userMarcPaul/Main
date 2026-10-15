/* Review data access via Supabase. Rating summaries come from the recipe_cards
   view (which already aggregates AVG/COUNT per recipe). */
import { db, unwrap } from "../db.js";

export async function page(recipeId, { limit, offset }) {
  const rows = unwrap(
    await db.from("reviews")
      .select("id, rating, comment, created_at, user_id, users(display_name)")
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1)
  );
  return rows.map((r) => ({
    id: Number(r.id),
    author: r.users?.display_name ?? "Unknown",
    rating: Number(r.rating),
    comment: r.comment,
    createdAt: r.created_at,
    userId: Number(r.user_id),
  }));
}

export async function summary(recipeId) {
  const rows = unwrap(await db.from("recipe_cards").select("avg_rating, review_count").eq("id", recipeId).limit(1));
  const row = rows[0];
  return {
    avgRating: row?.avg_rating ?? null,
    reviewCount: Number(row?.review_count ?? 0),
  };
}

export async function findOwn(recipeId, userId) {
  const rows = unwrap(
    await db.from("reviews").select("id, rating, comment").eq("recipe_id", recipeId).eq("user_id", userId).limit(1)
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), rating: Number(rows[0].rating), comment: rows[0].comment };
}

export async function findById(reviewId, recipeId) {
  const rows = unwrap(
    await db.from("reviews").select("id, user_id").eq("id", reviewId).eq("recipe_id", recipeId).limit(1)
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), userId: Number(rows[0].user_id) };
}

export async function ownRef(recipeId, userId) {
  const rows = unwrap(
    await db.from("reviews").select("id, user_id").eq("recipe_id", recipeId).eq("user_id", userId).limit(1)
  );
  if (!rows.length) return null;
  return { id: Number(rows[0].id), userId: Number(rows[0].user_id) };
}

/** One review per user per recipe: a repeat post updates the first. */
export async function upsert({ recipeId, userId, rating, comment }) {
  unwrap(
    await db.from("reviews").upsert(
      { recipe_id: recipeId, user_id: userId, rating, comment, created_at: new Date().toISOString() },
      { onConflict: "recipe_id,user_id" }
    )
  );
}

export async function deleteById(id) {
  unwrap(await db.from("reviews").delete().eq("id", id));
}
