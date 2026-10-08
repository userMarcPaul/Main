import bcrypt from "bcryptjs";
import { db } from "../../lib/db.js";
import {
  handler, json, fail, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType, clientIp,
} from "../../lib/http.js";
import { loginSchema, validate } from "../../lib/validate.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { createSession, setSessionCookie } from "../../lib/auth.js";

// A valid-shaped hash to compare against when the email is unknown, so a
// missing account and a wrong password take the same time and give the same
// answer — no way to probe which emails are registered.
const DUMMY_HASH = "$2a$10$wo9gHoVXaLMkofQ7EusvgODiyl.H6qXSVzuxZeRQhokcq2A/d8FyO";

export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;

  const limited = await rateLimit(`login:${clientIp(req)}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return fail(res, 429, "Too many attempts. Please try again later.");
  }

  const body = await readJsonBody(req);
  if (body === null) return fail(res, 400, "Invalid request body");

  const parsed = validate(loginSchema, body);
  if (!parsed.ok) return fail(res, 401, "Invalid email or password");

  const { email, password } = parsed.data;

  const { rows } = await db.execute({
    sql: "SELECT id, display_name AS displayName, password_hash AS passwordHash, role FROM users WHERE email = ?",
    args: [email],
  });
  const user = rows[0];

  const ok = user
    ? await bcrypt.compare(password, user.passwordHash)
    : (await bcrypt.compare(password, DUMMY_HASH), false);

  if (!ok) return fail(res, 401, "Invalid email or password");

  const { token } = await createSession(Number(user.id));
  setSessionCookie(res, token, req);

  json(res, 200, { id: Number(user.id), displayName: user.displayName, role: user.role });
});
