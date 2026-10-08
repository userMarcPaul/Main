/* Session adapter: turns a request cookie into an actor, and mints / clears
   session cookies. The token is random; only its SHA-256 hash is stored (see
   repositories/sessions.js), so a leaked database cannot be used to log in. */
import crypto from "node:crypto";
import * as sessionsRepo from "./repositories/sessions.js";
import { addCookie, isSecure, parseCookies } from "./http.js";

const COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create a session for a user and return the raw token for the cookie. */
export async function createSessionFor(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();
  await sessionsRepo.create(hashToken(token), userId, expiresAt);
  return token;
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

/** The actor for this request ({ id, email, displayName, role }), or null. */
export async function getActor(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = await sessionsRepo.findActor(tokenHash);
  if (!row) return null;

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await sessionsRepo.deleteByHash(tokenHash);
    return null;
  }
  return { id: Number(row.id), email: row.email, displayName: row.displayName, role: row.role };
}

/** End the current request's session, if any. */
export async function destroySession(req) {
  const token = parseCookies(req)[COOKIE];
  if (token) await sessionsRepo.deleteByHash(hashToken(token));
}
