/* Fixed-window rate limiting, stored in the rate_limits table so the count
   survives across serverless invocations (where in-memory state would not). */
import { db } from "./db.js";

/**
 * Count one attempt against `key`. Returns { allowed: true } while under the
 * limit, or { allowed: false, retryAfter } (seconds) once the window is full.
 */
export async function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();

  const { rows } = await db.execute({
    sql: "SELECT count, window_start FROM rate_limits WHERE key = ?",
    args: [key],
  });
  const row = rows[0];
  const windowStart = row ? Number(row.window_start) : 0;

  // No row, or the window has rolled over: start a fresh window at 1.
  if (!row || now - windowStart >= windowMs) {
    await db.execute({
      sql: `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      args: [key, String(now)],
    });
    return { allowed: true };
  }

  if (Number(row.count) >= limit) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - windowStart)) / 1000) };
  }

  await db.execute({
    sql: "UPDATE rate_limits SET count = count + 1 WHERE key = ?",
    args: [key],
  });
  return { allowed: true };
}
