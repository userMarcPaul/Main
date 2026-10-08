/* Small helpers so every endpoint answers in the same shape. */
import { AppError } from "./errors.js";

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function fail(res, status, message) {
  json(res, status, { error: message });
}

/** Only allow the listed methods; answers 405 otherwise. */
export function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  fail(res, 405, `${req.method} not allowed here`);
  return false;
}

/**
 * Wraps a handler so a thrown error becomes a 500 with no stack trace or SQL
 * in the response body (Phase 7 asks for this; cheaper to do it from the start).
 */
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      // A domain error from the service layer carries its own status.
      if (err instanceof AppError) {
        if (err.retryAfter != null) res.setHeader("Retry-After", String(err.retryAfter));
        const body = { error: err.message };
        if (err.fieldErrors) body.fieldErrors = err.fieldErrors;
        if (!res.headersSent) json(res, err.status, body);
        return;
      }
      console.error(`${req.method} ${req.url} failed:`, err);
      if (!res.headersSent) fail(res, 500, "Something went wrong on our end");
    }
  };
}

/** Clamp a query-string integer into a sane range. */
export function intParam(value, { min, max, fallback }) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/* =========================================
   Phase 4 — request parsing and write protection
   Works the same in dev (reads the raw stream) and on Vercel
   (which pre-parses the body onto req.body).
   ========================================= */

/**
 * Parse a JSON request body. Returns the parsed object, {} for an empty body,
 * or null for malformed JSON / an over-size body (the caller answers 400/413).
 */
export async function readJsonBody(req, { limitBytes = 100_000 } = {}) {
  // Vercel's Node runtime parses JSON onto req.body before the handler runs.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      try { return JSON.parse(req.body || "{}"); } catch { return null; }
    }
    return req.body;
  }

  return new Promise((resolve) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limitBytes) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooBig) return resolve(null);
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

/** Read the request's cookies into a plain object. */
export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Append a Set-Cookie header without clobbering any already set. */
export function addCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", existing ? [].concat(existing, cookie) : cookie);
}

function headerValue(req, name) {
  return String(req.headers[name] ?? "").split(",")[0].trim();
}

/** The origin this request was actually served from. */
export function requestOrigin(req) {
  const proto = headerValue(req, "x-forwarded-proto") || "http";
  const host = headerValue(req, "x-forwarded-host") || req.headers.host;
  return `${proto}://${host}`;
}

/** True when the connection is HTTPS, so cookies get the Secure flag. */
export function isSecure(req) {
  return headerValue(req, "x-forwarded-proto") === "https";
}

/** The client IP, trusting Vercel's x-forwarded-for, for rate-limit keys. */
export function clientIp(req) {
  return headerValue(req, "x-forwarded-for") || req.socket?.remoteAddress || "unknown";
}

/**
 * CSRF defence for state-changing requests: the Origin header must be present
 * and match the site's own origin. A cross-site form post has a foreign (or,
 * for some, absent) Origin and is refused. Returns false after answering 403.
 */
export function enforceSameOrigin(req, res) {
  if (req.headers.origin && req.headers.origin === requestOrigin(req)) return true;
  fail(res, 403, "Cross-origin request refused");
  return false;
}

/** Write endpoints accept JSON only. Returns false after answering 415. */
export function requireJsonContentType(req, res) {
  if (String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return true;
  }
  fail(res, 415, "Expected application/json");
  return false;
}
