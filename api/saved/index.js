import { db } from "../../lib/db.js";
import {
  handler, json, fail, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../lib/http.js";
import { requireUser } from "../../lib/auth.js";
import { savedSchema, validate } from "../../lib/validate.js";

/**
 * GET  /api/saved          the caller's saved recipes, as cards
 * GET  /api/saved?slug=x   quick { saved } check for one recipe
 * POST /api/saved {slug}   save a recipe (idempotent)
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const slug = new URL(req.url, "http://localhost").searchParams.get("slug");
    if (slug) return handleCheck(res, user, slug);
    return handleList(res, user);
  }

  return handleSave(req, res, user);
});

async function handleList(res, user) {
  const { rows } = await db.execute({
    sql: `SELECT r.slug, r.title, r.category, r.description, r.image_url,
                 r.time_minutes, r.difficulty
          FROM saved_recipes s
          JOIN recipes r ON r.id = s.recipe_id
          WHERE s.user_id = ? AND r.status = 'published'
          ORDER BY s.saved_at DESC`,
    args: [user.id],
  });

  json(res, 200, {
    recipes: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      category: r.category,
      description: r.description,
      imageUrl: r.image_url,
      timeMinutes: r.time_minutes,
      difficulty: r.difficulty,
    })),
  });
}

async function handleCheck(res, user, slug) {
  const { rows } = await db.execute({
    sql: `SELECT 1 FROM saved_recipes s
          JOIN recipes r ON r.id = s.recipe_id
          WHERE s.user_id = ? AND r.slug = ?`,
    args: [user.id, slug],
  });
  json(res, 200, { saved: rows.length > 0 });
}

async function handleSave(req, res, user) {
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;

  const body = await readJsonBody(req);
  if (body === null) return fail(res, 400, "Invalid request body");

  const parsed = validate(savedSchema, body);
  if (!parsed.ok) return json(res, 422, { error: "Which recipe?", fieldErrors: parsed.fieldErrors });

  const recipe = await db.execute({
    sql: "SELECT id FROM recipes WHERE slug = ? AND status = 'published'",
    args: [parsed.data.slug],
  });
  if (!recipe.rows[0]) return fail(res, 404, "Recipe not found");

  await db.execute({
    sql: `INSERT INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)
          ON CONFLICT (user_id, recipe_id) DO NOTHING`,
    args: [user.id, Number(recipe.rows[0].id)],
  });

  json(res, 200, { ok: true, saved: true });
}
