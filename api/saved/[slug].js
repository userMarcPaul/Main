import { db } from "../../lib/db.js";
import { handler, json, fail, methodAllowed, enforceSameOrigin } from "../../lib/http.js";
import { requireUser } from "../../lib/auth.js";

/** DELETE /api/saved/:slug — unsave a recipe (idempotent). */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["DELETE"])) return;
  if (!enforceSameOrigin(req, res)) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const slug = req.query?.slug ?? decodeURIComponent(new URL(req.url, "http://localhost").pathname.split("/").pop());

  await db.execute({
    sql: `DELETE FROM saved_recipes
          WHERE user_id = ?
            AND recipe_id = (SELECT id FROM recipes WHERE slug = ?)`,
    args: [user.id, slug],
  });

  json(res, 200, { ok: true, saved: false });
});
