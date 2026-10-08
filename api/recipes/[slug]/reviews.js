import * as reviews from "../../../lib/services/reviews.js";
import {
  handler, json, methodAllowed, intParam, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../../lib/http.js";
import { getActor } from "../../../lib/auth.js";
import { badRequest } from "../../../lib/errors.js";

/**
 * Reviews for one recipe.
 *   GET    ?page=1   list + summary + per-viewer state
 *   POST             create or update the caller's review
 *   DELETE ?id=      own review, or any review when admin
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST", "DELETE"])) return;

  const slug = slugOf(req);
  const params = new URL(req.url, "http://localhost").searchParams;

  if (req.method === "GET") {
    const page = intParam(params.get("page"), { min: 1, max: 100000, fallback: 1 });
    const actor = await getActor(req);
    return json(res, 200, await reviews.listForRecipe(slug, { page, actor }));
  }

  if (req.method === "POST") {
    if (!requireJsonContentType(req, res)) return;
    if (!enforceSameOrigin(req, res)) return;
    const actor = await getActor(req);
    const body = await readJsonBody(req);
    if (body === null) throw badRequest("Invalid request body");
    return json(res, 200, await reviews.submit(slug, { actor, input: body }));
  }

  // DELETE
  if (!enforceSameOrigin(req, res)) return;
  const actor = await getActor(req);
  const id = params.get("id");
  return json(res, 200, await reviews.remove(slug, { actor, reviewId: id ? Number(id) : null }));
});

function slugOf(req) {
  if (req.query?.slug) return req.query.slug;
  const parts = new URL(req.url, "http://localhost").pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? ""); // .../:slug/reviews
}
