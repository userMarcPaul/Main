/* Server-side sessions in an HTTP-only cookie.

   The cookie holds a random token; the database stores only its SHA-256 hash.
   A leaked database therefore cannot be used to log in as anyone, because the
   raw token is never written down. HttpOnly keeps the token out of reach of
   any script, including an injected one. */
import crypto from "node:crypto";
import { db } from "./db.js";
import { addCookie, isSecure, parseCookies, fail } from "./http.js";

const COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create a session row and return the raw token to put in the cookie. */
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();

  await db.execute({
    sql: "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    args: [hashToken(token), userId, expiresAt],
  });

  return { token, expiresAt };
}

function buildCookie(value, maxAge, req) {
  const parts = [`${COOKIE}=${value}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (isSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(res, token, req) {
  addCookie(res, buildCookie(token, MAX_AGE_SECONDS, req));
}

export function clearSessionCookie(res, req) {
  addCookie(res, buildCookie("", 0, req));
}

/**
 * The logged-in user for this request, or null. Never returns password_hash.
 * Deletes its own session row if it has expired.
 */
export async function getUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const { rows } = await db.execute({
    sql: `SELECT u.id, u.email, u.display_name AS displayName, u.role, s.expires_at AS expiresAt
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
    args: [tokenHash],
  });

  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [tokenHash] });
    return null;
  }

  return { id: Number(row.id), email: row.email, displayName: row.displayName, role: row.role };
}

/** Delete the current request's session, if any. */
export async function destroySession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return;
  await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
}

/** Return the user, or answer 401 and return null. */
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) { fail(res, 401, "You must be logged in"); return null; }
  return user;
}

/** Return the user if an admin, or answer 401/403 and return null. */
export async function requireAdmin(req, res) {
  const user = await getUser(req);
  if (!user) { fail(res, 401, "You must be logged in"); return null; }
  if (user.role !== "admin") { fail(res, 403, "Admins only"); return null; }
  return user;
}
