import { db } from "../../lib/db.js";
import { handler, json, fail, methodAllowed } from "../../lib/http.js";

/**
 * GET /api/recipes/:slug — one published recipe with its ingredients, steps
 * and review summary. 404 if the slug is unknown or the recipe is not
 * published, so a pending submission cannot be read by guessing its URL.
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const slug = req.query?.slug ?? new URL(req.url, "http://localhost").pathname.split("/").pop();

  const { rows } = await db.execute({
    sql: `SELECT r.id, r.slug, r.title, r.category, r.description, r.image_url,
                 r.time_minutes, r.servings, r.difficulty, r.created_at,
                 u.display_name AS author_name,
                 ROUND(AVG(v.rating), 1) AS avg_rating,
                 COUNT(v.id)             AS review_count
          FROM recipes r
          LEFT JOIN users u   ON u.id = r.author_id
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE r.slug = ? AND r.status = 'published'
          GROUP BY r.id`,
    args: [slug],
  });

  const recipe = rows[0];
  if (!recipe) return fail(res, 404, "Recipe not found");

  const [ingredients, steps] = await db.batch(
    [
      {
        sql: `SELECT emoji, name, qty, unit FROM ingredients
              WHERE recipe_id = ? ORDER BY position`,
        args: [recipe.id],
      },
      {
        sql: "SELECT text FROM steps WHERE recipe_id = ? ORDER BY position",
        args: [recipe.id],
      },
    ],
    "read"
  );

  json(res, 200, {
    slug: recipe.slug,
    title: recipe.title,
    category: recipe.category,
    description: recipe.description,
    imageUrl: recipe.image_url,
    timeMinutes: recipe.time_minutes,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    authorName: recipe.author_name ?? null,
    avgRating: recipe.avg_rating ?? null,
    reviewCount: Number(recipe.review_count ?? 0),
    ingredients: ingredients.rows.map((i) => ({
      emoji: i.emoji,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
    })),
    steps: steps.rows.map((s) => s.text),
  });
});
