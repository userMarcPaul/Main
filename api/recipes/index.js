import * as recipes from "../../lib/services/recipes.js";
import { handler, json, methodAllowed, intParam } from "../../lib/http.js";

/** GET /api/recipes — ?q= ?category= ?featured=1 ?limit= (published only). */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const params = new URL(req.url, "http://localhost").searchParams;
  json(res, 200, await recipes.list({
    q: (params.get("q") ?? "").trim(),
    category: (params.get("category") ?? "").trim(),
    featured: params.get("featured") === "1",
    limit: intParam(params.get("limit"), { min: 1, max: 50, fallback: 24 }),
  }));
});
