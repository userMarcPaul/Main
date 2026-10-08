/* Small helpers so every endpoint answers in the same shape. */

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
