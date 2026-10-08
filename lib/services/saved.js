/* Saved-recipe rules. Every operation requires a logged-in actor. */
import * as savedRepo from "../repositories/saved.js";
import * as recipesRepo from "../repositories/recipes.js";
import { savedSchema, validate } from "../validate.js";
import { unauthorized, notFound, unprocessable } from "../errors.js";

export async function list(actor) {
  if (!actor) throw unauthorized();
  return { recipes: await savedRepo.list(actor.id) };
}

export async function isSaved(actor, slug) {
  if (!actor) throw unauthorized();
  return { saved: await savedRepo.exists(actor.id, slug) };
}

export async function save(actor, input) {
  if (!actor) throw unauthorized();

  const parsed = validate(savedSchema, input);
  if (!parsed.ok) throw unprocessable("Which recipe?", parsed.fieldErrors);

  const ref = await recipesRepo.findRef(parsed.data.slug);
  if (!ref) throw notFound("Recipe not found");

  await savedRepo.add(actor.id, ref.id);
  return { ok: true, saved: true };
}

export async function remove(actor, slug) {
  if (!actor) throw unauthorized();
  await savedRepo.removeBySlug(actor.id, slug);
  return { ok: true, saved: false };
}
