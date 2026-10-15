/* Fixed-window rate limiting, backed by the rl_touch Postgres function so the
   read-increment is atomic under concurrency (PostgREST can't express that from
   the client). */
import { db, unwrap } from "./db.js";

/** Count one attempt against `key`. { allowed: true } under the limit, else
    { allowed: false, retryAfter } (seconds). */
export async function rateLimit(key, { limit, windowMs }) {
  const rows = unwrap(await db.rpc("rl_touch", { p_key: key, p_limit: limit, p_window_ms: windowMs }));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { allowed: Boolean(row.allowed), retryAfter: Number(row.retry_after) };
}

/** Delete rate-limit rows older than `olderThanMs` (cleanup). Returns the count. */
export async function purgeOlderThan(olderThanMs) {
  return Number(unwrap(await db.rpc("rl_purge", { p_older_than_ms: olderThanMs })));
}
