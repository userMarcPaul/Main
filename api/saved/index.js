import * as saved from "../../lib/services/saved.js";
import {
  handler, json, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../lib/http.js";
import { getActor } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";

/**
 * GET  /api/saved          the caller's saved recipes
 * GET  /api/saved?slug=x   quick { saved } check
 * POST /api/saved {slug}   save a recipe
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  const actor = await getActor(req);

  if (req.method === "GET") {
    const slug = new URL(req.url, "http://localhost").searchParams.get("slug");
    return json(res, 200, slug ? await saved.isSaved(actor, slug) : await saved.list(actor));
  }

  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;
  const body = await readJsonBody(req);
  if (body === null) throw badRequest("Invalid request body");
  return json(res, 200, await saved.save(actor, body));
});
