import bcrypt from "bcryptjs";
import { db } from "../../lib/db.js";
import {
  handler, json, fail, methodAllowed, readJsonBody,
  enforceSameOrigin, requireJsonContentType, clientIp,
} from "../../lib/http.js";
import { signupSchema, validate } from "../../lib/validate.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { createSession, setSessionCookie } from "../../lib/auth.js";

export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;

  const limited = await rateLimit(`signup:${clientIp(req)}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return fail(res, 429, "Too many attempts. Please try again later.");
  }

  const body = await readJsonBody(req);
  if (body === null) return fail(res, 400, "Invalid request body");

  const parsed = validate(signupSchema, body);
  if (!parsed.ok) {
    return json(res, 422, { error: "Please check the form", fieldErrors: parsed.fieldErrors });
  }

  const { email, displayName, password } = parsed.data;

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email],
  });
  if (existing.rows.length) return fail(res, 409, "That email is already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const role = email === adminEmail ? "admin" : "user";

  const result = await db.execute({
    sql: "INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
    args: [email, displayName, passwordHash, role],
  });
  const userId = Number(result.lastInsertRowid);

  const { token } = await createSession(userId);
  setSessionCookie(res, token, req);

  json(res, 201, { id: userId, displayName, role });
});
