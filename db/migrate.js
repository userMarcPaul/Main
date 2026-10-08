/**
 * Applies any migration in db/migrations/ not yet recorded in
 * schema_migrations. Idempotent: an ADD COLUMN that already exists (because a
 * fresh database was built from schema.sql) is skipped but still recorded.
 *
 *   npm run migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { db } from "../lib/db.js";

await db.execute(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     name TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`
);

const dir = new URL("./migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const applied = new Set(
  (await db.execute("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
);

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = await readFile(new URL(file, dir), "utf8");
  try {
    await db.executeMultiple(sql);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) throw err;
    // Column already present from schema.sql — nothing to do, just record it.
  }
  await db.execute({ sql: "INSERT INTO schema_migrations (name) VALUES (?)", args: [file] });
  console.log("applied", file);
  ran += 1;
}
console.log(ran ? `\n${ran} migration(s) applied.` : "Already up to date.");
