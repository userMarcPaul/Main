/* Recipe reads. Pure orchestration over the repository; throws domain errors. */
import * as recipesRepo from "../repositories/recipes.js";
import { submissionSchema, validate } from "../validate.js";
import { rateLimit } from "../rateLimit.js";
import { notFound, unauthorized, unprocessable, tooMany } from "../errors.js";

export async function list({ q, category, featured, limit, mine = false, actor = null }) {
  // `?mine=1` returns the caller's own recipes in every status.
  if (mine) {
    if (!actor) throw unauthorized();
    const recipes = await recipesRepo.listByAuthor(actor.id);
    return { count: recipes.length, recipes };
  }
  const recipes = await recipesRepo.search({ q, category, featured, limit });
  return { count: recipes.length, recipes };
}

/** Create a pending submission from a logged-in user. */
export async function submit({ actor, input }) {
  if (!actor) throw unauthorized();

  const limited = await rateLimit(`submit:${actor.id}`, { limit: 5, windowMs: 24 * 60 * 60 * 1000 });
  if (!limited.allowed) throw tooMany(limited.retryAfter, "You've reached today's submission limit.");

  const parsed = validate(submissionSchema, input);
  if (!parsed.ok) throw unprocessable("Please check the form", parsed.fieldErrors);

  const slug = await uniqueSlug(parsed.data.title);
  await recipesRepo.createSubmission(
    { ...parsed.data, slug, authorId: actor.id },
    parsed.data.ingredients,
    parsed.data.steps
  );
  return { ok: true, slug, status: "pending" };
}

/** A URL-safe slug from a title, with -2, -3 … appended until it is free. */
async function uniqueSlug(title) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recipe";
  let slug = base;
  for (let n = 2; await recipesRepo.slugTaken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function getBySlug(slug) {
  const recipe = await recipesRepo.getDetail(slug);
  if (!recipe) throw notFound("Recipe not found");
  return recipe;
}

export async function categories() {
  return { categories: await recipesRepo.categoriesWithCounts() };
}
