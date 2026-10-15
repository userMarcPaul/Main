/* Seed a demo account so recruiters can try the writable features without
   signing up. Idempotent. Password overridable via DEMO_PASSWORD. */
import bcrypt from "bcryptjs";
import { db, unwrap } from "../lib/db.js";

const EMAIL = "demo@ecbeats.app";
const DISPLAY_NAME = "Demo User";
const PASSWORD = process.env.DEMO_PASSWORD || "DemoPass123!";

const existing = unwrap(await db.from("users").select("id").eq("email", EMAIL).limit(1));
if (existing.length) {
  console.log(`Demo account (${EMAIL}) already exists — skipping.`);
  process.exit(0);
}

const passwordHash = await bcrypt.hash(PASSWORD, 10);
const userId = Number(
  unwrap(await db.from("users")
    .insert({ email: EMAIL, display_name: DISPLAY_NAME, password_hash: passwordHash, role: "user" })
    .select("id"))[0].id
);
console.log(`Created demo account: ${EMAIL} (id ${userId})`);

const recipes = unwrap(
  await db.from("recipes").select("id, slug").eq("status", "published").order("created_at").limit(2)
);

if (recipes[0]) {
  await db.from("reviews").upsert(
    { recipe_id: recipes[0].id, user_id: userId, rating: 5,
      comment: "Love this recipe! The instructions were super clear and it turned out amazing." },
    { onConflict: "recipe_id,user_id" }
  );
  console.log(`  Added a review on "${recipes[0].slug}"`);
}
if (recipes[1]) {
  await db.from("saved_recipes").upsert(
    { user_id: userId, recipe_id: recipes[1].id },
    { onConflict: "user_id,recipe_id", ignoreDuplicates: true }
  );
  console.log(`  Saved "${recipes[1].slug}"`);
}

console.log(`\nDemo account ready.  Log in with: ${EMAIL} / ${PASSWORD}`);
