/* Moderation rules. Every operation requires an admin actor. */
import * as recipesRepo from "../repositories/recipes.js";
import { unauthorized, forbidden, notFound, badRequest } from "../errors.js";

function requireAdmin(actor) {
  if (!actor) throw unauthorized();
  if (actor.role !== "admin") throw forbidden("Admins only");
}

export async function listSubmissions(actor, status = "pending") {
  requireAdmin(actor);
  const allowed = ["pending", "published", "rejected"];
  const wanted = allowed.includes(status) ? status : "pending";
  return { status: wanted, submissions: await recipesRepo.listByStatus(wanted) };
}

export async function getSubmission(actor, id) {
  requireAdmin(actor);
  const recipe = await recipesRepo.getByIdDetail(id);
  if (!recipe) throw notFound("Submission not found");
  return recipe;
}

export async function moderate(actor, { id, action, reason }) {
  requireAdmin(actor);
  if (!id) throw badRequest("Which submission?");

  const existing = await recipesRepo.authorOf(id);
  if (!existing) throw notFound("Submission not found");

  if (action === "approve") {
    await recipesRepo.setStatus(id, "published", null);
    return { ok: true, status: "published" };
  }
  if (action === "reject") {
    await recipesRepo.setStatus(id, "rejected", (reason ?? "").trim() || "No reason given");
    return { ok: true, status: "rejected" };
  }
  throw badRequest("Unknown action");
}
