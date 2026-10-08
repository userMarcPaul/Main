import * as admin from "../../lib/services/admin.js";
import {
  handler, json, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../lib/http.js";
import { getActor } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";

/**
 * GET   /api/admin/submissions?status=pending   the moderation queue
 * GET   /api/admin/submissions?id=123           one full submission (preview)
 * PATCH /api/admin/submissions {id, action, reason}   approve / reject
 * All admin-only (the service enforces it).
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "PATCH"])) return;

  const actor = await getActor(req);

  if (req.method === "GET") {
    const params = new URL(req.url, "http://localhost").searchParams;
    const id = params.get("id");
    if (id) return json(res, 200, await admin.getSubmission(actor, Number(id)));
    return json(res, 200, await admin.listSubmissions(actor, params.get("status") ?? "pending"));
  }

  // PATCH
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;
  const body = await readJsonBody(req);
  if (body === null) throw badRequest("Invalid request body");
  return json(res, 200, await admin.moderate(actor, {
    id: body.id ? Number(body.id) : null,
    action: body.action,
    reason: body.reason,
  }));
});
