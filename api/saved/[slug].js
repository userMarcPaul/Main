import * as saved from "../../lib/services/saved.js";
import { handler, json, methodAllowed, enforceSameOrigin } from "../../lib/http.js";
import { getActor } from "../../lib/auth.js";

/** DELETE /api/saved/:slug — unsave a recipe. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["DELETE"])) return;
  if (!enforceSameOrigin(req, res)) return;

  const actor = await getActor(req);
  const slug = req.query?.slug ?? decodeURIComponent(new URL(req.url, "http://localhost").pathname.split("/").pop());
  json(res, 200, await saved.remove(actor, slug));
});
