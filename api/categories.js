import { db } from "../lib/db.js";
import { handler, json, methodAllowed } from "../lib/http.js";

/**
 * GET /api/categories — every category that actually has published recipes,
 * with a real count. The home page tiles are built from this, which is why
 * no tile can lead to an empty results page.
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const { rows } = await db.execute(
    `SELECT category, COUNT(*) AS recipe_count
     FROM recipes
     WHERE status = 'published'
     GROUP BY category
     ORDER BY recipe_count DESC, category ASC`
  );

  json(res, 200, {
    categories: rows.map((r) => ({
      name: r.category,
      recipeCount: Number(r.recipe_count),
    })),
  });
});
