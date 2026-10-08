import * as uploads from "../lib/services/uploads.js";
import { handler, json, methodAllowed, enforceSameOrigin, readRawBody } from "../lib/http.js";
import { getActor } from "../lib/auth.js";

/** POST /api/upload — a recipe photo (JPEG/PNG/WebP, max 2 MB), logged in. */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!enforceSameOrigin(req, res)) return;

  const actor = await getActor(req);
  const buffer = await readRawBody(req, { limitBytes: 2 * 1024 * 1024 + 1024 });
  json(res, 201, await uploads.upload({ actor, buffer }));
});
