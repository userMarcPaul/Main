/* All SQL about recipes lives here. Returns API-shaped data via mappers;
   no HTTP, no business rules. */
import { db } from "../db.js";
import { recipeCard, recipeDetail } from "../mappers.js";

const CARD_COLUMNS = `r.slug, r.title, r.category, r.description, r.image_url,
                      r.time_minutes, r.servings, r.difficulty`;

/** Published recipes matching an optional query, as cards. */
export async function search({ q, category, featured, limit }) {
  const where = ["r.status = 'published'"];
  const args = [];

  if (q) { where.push("(r.title LIKE ? OR r.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push("r.category = ? COLLATE NOCASE"); args.push(category); }
  if (featured) where.push("r.featured = 1");
  args.push(limit);

  const { rows } = await db.execute({
    sql: `SELECT ${CARD_COLUMNS},
                 ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
          FROM recipes r
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE ${where.join(" AND ")}
          GROUP BY r.id
          ORDER BY r.created_at DESC
          LIMIT ?`,
    args,
  });
  return rows.map(recipeCard);
}

/** A lightweight { id, authorId } for a published recipe, or null. */
export async function findRef(slug) {
  const { rows } = await db.execute({
    sql: "SELECT id, author_id FROM recipes WHERE slug = ? AND status = 'published'",
    args: [slug],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), authorId: rows[0].author_id == null ? null : Number(rows[0].author_id) };
}

/** A full published recipe with ingredients, steps and review summary, or null. */
export async function getDetail(slug) {
  const { rows } = await db.execute({
    sql: `SELECT r.id, ${CARD_COLUMNS}, u.display_name AS author_name,
                 ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
          FROM recipes r
          LEFT JOIN users u   ON u.id = r.author_id
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE r.slug = ? AND r.status = 'published'
          GROUP BY r.id`,
    args: [slug],
  });
  const row = rows[0];
  if (!row) return null;

  const [ingredients, steps] = await db.batch(
    [
      { sql: "SELECT emoji, name, qty, unit FROM ingredients WHERE recipe_id = ? ORDER BY position", args: [row.id] },
      { sql: "SELECT text FROM steps WHERE recipe_id = ? ORDER BY position", args: [row.id] },
    ],
    "read"
  );
  return recipeDetail(row, ingredients.rows, steps.rows);
}

/** Categories that have published recipes, with real counts. */
export async function categoriesWithCounts() {
  const { rows } = await db.execute(
    `SELECT category, COUNT(*) AS recipe_count
     FROM recipes WHERE status = 'published'
     GROUP BY category ORDER BY recipe_count DESC, category ASC`
  );
  return rows.map((r) => ({ name: r.category, recipeCount: Number(r.recipe_count) }));
}
