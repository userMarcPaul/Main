/**
 * Seed a demo account so recruiters can try the writable features without
 * signing up. Idempotent: skips if demo@ecbeats.app already exists.
 *
 *   npm run seed:demo
 *
 * The password defaults to "DemoPass123!" but can be overridden via the
 * DEMO_PASSWORD environment variable.
 */
import bcrypt from "bcryptjs";
import { db } from "../lib/db.js";

const EMAIL = "demo@ecbeats.app";
const DISPLAY_NAME = "Demo User";
const PASSWORD = process.env.DEMO_PASSWORD || "DemoPass123!";

const { rows: existing } = await db.execute({
  sql: "SELECT id FROM users WHERE email = ?",
  args: [EMAIL],
});

if (existing.length > 0) {
  console.log(`Demo account (${EMAIL}) already exists — skipping.`);
  process.exit(0);
}

const passwordHash = await bcrypt.hash(PASSWORD, 10);
const result = await db.execute({
  sql: "INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, 'user')",
  args: [EMAIL, DISPLAY_NAME, passwordHash],
});
const userId = Number(result.lastInsertRowid);
console.log(`Created demo account: ${EMAIL} (id ${userId})`);

// Add a review on the first published recipe so the demo user has visible
// activity, and save a second recipe so the Saved Recipes page is not empty.
const { rows: recipes } = await db.execute(
  "SELECT id, slug FROM recipes WHERE status = 'published' ORDER BY created_at LIMIT 2"
);

if (recipes[0]) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO reviews (recipe_id, user_id, rating, comment)
          VALUES (?, ?, 5, 'Love this recipe! The instructions were super clear and it turned out amazing.')`,
    args: [recipes[0].id, userId],
  });
  console.log(`  Added a review on "${recipes[0].slug}"`);
}

if (recipes[1]) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)",
    args: [userId, recipes[1].id],
  });
  console.log(`  Saved "${recipes[1].slug}"`);
}

console.log(`\nDemo account ready.  Log in with: ${EMAIL} / ${PASSWORD}`);
