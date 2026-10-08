import { handler, json, methodAllowed, enforceSameOrigin } from "../../lib/http.js";
import { destroySession, clearSessionCookie } from "../../lib/auth.js";

/** POST /api/auth/logout — end the session and clear the cookie. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!enforceSameOrigin(req, res)) return;

  await destroySession(req);
  clearSessionCookie(res, req);
  json(res, 200, { ok: true });
});
