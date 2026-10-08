import { db } from "../../lib/db.js";
import { handler, json, methodAllowed, intParam } from "../../lib/http.js";

/**
 * GET /api/recipes
 *   ?q=chicken      title or description match
 *   ?category=Pasta exact category
 *   ?featured=1     only featured recipes
 *   ?limit=6        1..50, default 24
 *
 * Only ever returns `published` recipes — pending and rejected submissions
 * stay invisible to the public.
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const params = new URL(req.url, "http://localhost").searchParams;
  const q = (params.get("q") ?? "").trim();
  const category = (params.get("category") ?? "").trim();
  const featured = params.get("featured") === "1";
  const limit = intParam(params.get("limit"), { min: 1, max: 50, fallback: 24 });

  // Build the WHERE clause from fragments, but every value is still a bound
  // parameter — nothing from the query string is concatenated into the SQL.
  const where = ["r.status = 'published'"];
  const args = [];

  if (q) {
    where.push("(r.title LIKE ? OR r.description LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    where.push("r.category = ? COLLATE NOCASE");
    args.push(category);
  }
  if (featured) {
    where.push("r.featured = 1");
  }

  args.push(limit);

  const { rows } = await db.execute({
    sql: `SELECT r.slug, r.title, r.category, r.description, r.image_url,
                 r.time_minutes, r.servings, r.difficulty,
                 ROUND(AVG(v.rating), 1) AS avg_rating,
                 COUNT(v.id)             AS review_count
          FROM recipes r
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE ${where.join(" AND ")}
          GROUP BY r.id
          ORDER BY r.created_at DESC
          LIMIT ?`,
    args,
  });

  json(res, 200, { count: rows.length, recipes: rows.map(toCard) });
});

function toCard(row) {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description,
    imageUrl: row.image_url,
    timeMinutes: row.time_minutes,
    servings: row.servings,
    difficulty: row.difficulty,
    avgRating: row.avg_rating ?? null,
    reviewCount: Number(row.review_count ?? 0),
  };
}
