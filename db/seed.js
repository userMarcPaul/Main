/**
 * Creates the schema and inserts the starter recipes as `published`.
 *
 * Re-runnable: it drops the recipe content tables first, so `npm run seed`
 * always leaves the same known state. It does NOT touch users, sessions or
 * reviews, so seeding again will not log anyone out or delete their reviews.
 */
import { readFile } from "node:fs/promises";
import { db } from "../lib/db.js";
import { recipes } from "./recipes.js";

const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");

// Fresh database: apply the whole schema. Existing one: only reset the
// recipe tables, so user data survives a re-seed.
const { rows } = await db.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipes'"
);

if (rows.length === 0) {
  console.log("No schema found — creating all tables.");
  await db.executeMultiple(schema);
} else {
  console.log("Schema already present — clearing recipe content only.");
  // ingredients and steps cascade from recipes, but Turso/libSQL does not
  // enable foreign keys by default, so delete the children explicitly.
  await db.batch(
    ["DELETE FROM ingredients", "DELETE FROM steps", "DELETE FROM recipes"],
    "write"
  );
}

let inserted = 0;

for (const [index, recipe] of recipes.entries()) {
  // Stagger created_at so "latest recipes" has a meaningful order.
  const createdAt = `datetime('now', '-${recipes.length - index} days')`;

  const result = await db.execute({
    sql: `INSERT INTO recipes
            (slug, title, category, description, image_url,
             time_minutes, servings, difficulty, status, featured, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ${createdAt})`,
    args: [
      recipe.slug,
      recipe.title,
      recipe.category,
      recipe.description,
      recipe.image_url,
      recipe.time_minutes,
      recipe.servings,
      recipe.difficulty,
      recipe.featured,
    ],
  });

  const recipeId = Number(result.lastInsertRowid);

  const statements = [
    ...recipe.ingredients.map(([emoji, name, qty, unit], position) => ({
      sql: `INSERT INTO ingredients (recipe_id, position, emoji, name, qty, unit)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [recipeId, position, emoji, name, qty, unit],
    })),
    ...recipe.steps.map((text, position) => ({
      sql: "INSERT INTO steps (recipe_id, position, text) VALUES (?, ?, ?)",
      args: [recipeId, position, text],
    })),
  ];

  // One batch per recipe: a failure leaves no half-written recipe behind.
  await db.batch(statements, "write");

  inserted += 1;
  console.log(
    `  ${recipe.slug} — ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps`
  );
}

console.log(`\nSeeded ${inserted} published recipes.`);
