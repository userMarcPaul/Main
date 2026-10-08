import * as accounts from "../../lib/services/accounts.js";
import {
  handler, json, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType, clientIp,
} from "../../lib/http.js";
import { setSessionCookie } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";

/** POST /api/auth/signup — create an account and start a session. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;

  const body = await readJsonBody(req);
  if (body === null) throw badRequest("Invalid request body");

  const { user, token } = await accounts.register({ input: body, ip: clientIp(req) });
  setSessionCookie(res, token, req);
  json(res, 201, user);
});
