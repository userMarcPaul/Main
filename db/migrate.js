/* Schema for Supabase is applied as plain SQL, not via this runner. Apply the
   files in db/supabase/ in order, once, in the Supabase SQL editor (or psql):
   01_schema.sql, 02_views.sql, 03_functions.sql. This script just lists them. */
import { readdir } from "node:fs/promises";

const dir = new URL("./supabase/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

console.log("Apply these in the Supabase SQL editor, in order:");
for (const f of files) console.log(`  db/supabase/${f}`);
console.log("\n(Then: npm run seed, npm run seed:demo)");
