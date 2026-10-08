import { handler, json, fail, methodAllowed } from "../../lib/http.js";
import { cleanup } from "../../lib/services/maintenance.js";

/**
 * Daily maintenance, invoked by Vercel Cron (see vercel.json). When CRON_SECRET
 * is set, the request must present it as a Bearer token, so the endpoint can't
 * be triggered by anyone. Locally it runs without a secret.
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return fail(res, 401, "Unauthorized");
  }

  json(res, 200, await cleanup());
});
