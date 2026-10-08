import * as recipes from "../../lib/services/recipes.js";
import { handler, json, methodAllowed } from "../../lib/http.js";

/** GET /api/recipes/:slug — one published recipe, or 404. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const slug = req.query?.slug ?? new URL(req.url, "http://localhost").pathname.split("/").pop();
  json(res, 200, await recipes.getBySlug(decodeURIComponent(slug)));
});
