import * as recipes from "../../lib/services/recipes.js";
import {
  handler, json, methodAllowed, intParam, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../lib/http.js";
import { getActor } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";

/**
 * GET  /api/recipes   published search (?q= ?category= ?featured=1 ?limit=),
 *                     or the caller's own recipes in every status (?mine=1)
 * POST /api/recipes   submit a new recipe (logged in), saved as pending
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  if (req.method === "GET") {
    const params = new URL(req.url, "http://localhost").searchParams;
    const mine = params.get("mine") === "1";
    return json(res, 200, await recipes.list({
      q: (params.get("q") ?? "").trim(),
      category: (params.get("category") ?? "").trim(),
      featured: params.get("featured") === "1",
      limit: intParam(params.get("limit"), { min: 1, max: 50, fallback: 24 }),
      mine,
      actor: mine ? await getActor(req) : null,
    }));
  }

  // POST — submission
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;
  const actor = await getActor(req);
  const body = await readJsonBody(req);
  if (body === null) throw badRequest("Invalid request body");
  return json(res, 201, await recipes.submit({ actor, input: body }));
});
