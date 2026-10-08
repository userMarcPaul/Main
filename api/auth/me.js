import { handler, json, fail, methodAllowed } from "../../lib/http.js";
import { getUser } from "../../lib/auth.js";

export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET"])) return;

  const user = await getUser(req);
  if (!user) return fail(res, 401, "Not logged in");

  json(res, 200, { id: user.id, displayName: user.displayName, role: user.role });
});
