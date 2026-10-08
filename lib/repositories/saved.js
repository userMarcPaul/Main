/* All SQL about saved recipes. */
import { db } from "../db.js";
import { recipeCard } from "../mappers.js";

export async function list(userId) {
  const { rows } = await db.execute({
    sql: `SELECT r.slug, r.title, r.category, r.description, r.image_url,
                 r.time_minutes, r.servings, r.difficulty
          FROM saved_recipes s JOIN recipes r ON r.id = s.recipe_id
          WHERE s.user_id = ? AND r.status = 'published'
          ORDER BY s.saved_at DESC`,
    args: [userId],
  });
  return rows.map(recipeCard);
}

export async function exists(userId, slug) {
  const { rows } = await db.execute({
    sql: `SELECT 1 FROM saved_recipes s JOIN recipes r ON r.id = s.recipe_id
          WHERE s.user_id = ? AND r.slug = ?`,
    args: [userId, slug],
  });
  return rows.length > 0;
}

export async function add(userId, recipeId) {
  await db.execute({
    sql: `INSERT INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)
          ON CONFLICT (user_id, recipe_id) DO NOTHING`,
    args: [userId, recipeId],
  });
}

export async function removeBySlug(userId, slug) {
  await db.execute({
    sql: `DELETE FROM saved_recipes
          WHERE user_id = ? AND recipe_id = (SELECT id FROM recipes WHERE slug = ?)`,
    args: [userId, slug],
  });
}
