/* All SQL about reviews. */
import { db } from "../db.js";
import { review } from "../mappers.js";

export async function page(recipeId, { limit, offset }) {
  const { rows } = await db.execute({
    sql: `SELECT v.id, v.rating, v.comment, v.created_at AS createdAt,
                 v.user_id AS userId, u.display_name AS author
          FROM reviews v JOIN users u ON u.id = v.user_id
          WHERE v.recipe_id = ?
          ORDER BY v.created_at DESC, v.id DESC
          LIMIT ? OFFSET ?`,
    args: [recipeId, limit, offset],
  });
  return rows.map(review);
}

export async function summary(recipeId) {
  const { rows } = await db.execute({
    sql: "SELECT ROUND(AVG(rating), 1) AS avgRating, COUNT(*) AS reviewCount FROM reviews WHERE recipe_id = ?",
    args: [recipeId],
  });
  return { avgRating: rows[0].avgRating ?? null, reviewCount: Number(rows[0].reviewCount) };
}

/** The caller's own review of a recipe (id, rating, comment), or null. */
export async function findOwn(recipeId, userId) {
  const { rows } = await db.execute({
    sql: "SELECT id, rating, comment FROM reviews WHERE recipe_id = ? AND user_id = ?",
    args: [recipeId, userId],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), rating: Number(rows[0].rating), comment: rows[0].comment };
}

/** A review by id within a recipe, as { id, userId }, or null. */
export async function findById(reviewId, recipeId) {
  const { rows } = await db.execute({
    sql: "SELECT id, user_id FROM reviews WHERE id = ? AND recipe_id = ?",
    args: [reviewId, recipeId],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), userId: Number(rows[0].user_id) };
}

export async function ownRef(recipeId, userId) {
  const { rows } = await db.execute({
    sql: "SELECT id, user_id FROM reviews WHERE recipe_id = ? AND user_id = ?",
    args: [recipeId, userId],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), userId: Number(rows[0].user_id) };
}

/** One review per user per recipe: a repeat post updates the first. */
export async function upsert({ recipeId, userId, rating, comment }) {
  await db.execute({
    sql: `INSERT INTO reviews (recipe_id, user_id, rating, comment)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (recipe_id, user_id)
          DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
                        created_at = datetime('now')`,
    args: [recipeId, userId, rating, comment],
  });
}

export async function deleteById(id) {
  await db.execute({ sql: "DELETE FROM reviews WHERE id = ?", args: [id] });
}
