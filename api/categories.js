import * as recipes from "../lib/services/recipes.js";
import { handler, json, methodAllowed } from "../lib/http.js";

/** GET /api/categories — categories with real counts, for the home tiles. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;
  json(res, 200, await recipes.categories());
});
