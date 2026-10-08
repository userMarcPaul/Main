/* Recipe reads. Pure orchestration over the repository; throws domain errors. */
import * as recipesRepo from "../repositories/recipes.js";
import { notFound } from "../errors.js";

export async function list({ q, category, featured, limit }) {
  const recipes = await recipesRepo.search({ q, category, featured, limit });
  return { count: recipes.length, recipes };
}

export async function getBySlug(slug) {
  const recipe = await recipesRepo.getDetail(slug);
  if (!recipe) throw notFound("Recipe not found");
  return recipe;
}

export async function categories() {
  return { categories: await recipesRepo.categoriesWithCounts() };
}
