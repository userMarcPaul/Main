/* Scheduled cleanup: drop expired sessions and stale rate-limit rows. Called by
   the daily cron endpoint, and runnable by hand (`npm run cleanup`). */
import * as sessionsRepo from "../repositories/sessions.js";
import { purgeOlderThan } from "../rateLimit.js";

const ONE_DAY = 24 * 60 * 60 * 1000;

export async function cleanup() {
  await sessionsRepo.deleteExpired();
  const rateLimitsRemoved = await purgeOlderThan(ONE_DAY);
  return { ok: true, rateLimitsRemoved };
}
