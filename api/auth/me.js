import { handler, json, methodAllowed } from "../../lib/http.js";
import { getActor } from "../../lib/auth.js";
import { unauthorized } from "../../lib/errors.js";

/** GET /api/auth/me — the current user, or 401. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const actor = await getActor(req);
  if (!actor) throw unauthorized("Not logged in");
  json(res, 200, { id: actor.id, displayName: actor.displayName, role: actor.role });
});
