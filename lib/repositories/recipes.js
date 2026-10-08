/* All SQL about recipes lives here. Returns API-shaped data via mappers;
   no HTTP, no business rules. */
import { db } from "../db.js";
import { recipeCard, recipeDetail } from "../mappers.js";

const CARD_COLUMNS = `r.slug, r.title, r.category, r.description, r.image_url,
                      r.time_minutes, r.servings, r.difficulty`;

/** Published recipes matching an optional query, as cards. */
export async function search({ q, category, featured, limit }) {
  const where = ["r.status = 'published'"];
  const args = [];

  if (q) { where.push("(r.title LIKE ? OR r.description LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push("r.category = ? COLLATE NOCASE"); args.push(category); }
  if (featured) where.push("r.featured = 1");
  args.push(limit);

  const { rows } = await db.execute({
    sql: `SELECT ${CARD_COLUMNS},
                 ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
          FROM recipes r
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE ${where.join(" AND ")}
          GROUP BY r.id
          ORDER BY r.created_at DESC
          LIMIT ?`,
    args,
  });
  return rows.map(recipeCard);
}

/** A lightweight { id, authorId } for a published recipe, or null. */
export async function findRef(slug) {
  const { rows } = await db.execute({
    sql: "SELECT id, author_id FROM recipes WHERE slug = ? AND status = 'published'",
    args: [slug],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), authorId: rows[0].author_id == null ? null : Number(rows[0].author_id) };
}

/** A full published recipe with ingredients, steps and review summary, or null. */
export async function getDetail(slug) {
  const { rows } = await db.execute({
    sql: `SELECT r.id, ${CARD_COLUMNS}, u.display_name AS author_name,
                 ROUND(AVG(v.rating), 1) AS avg_rating, COUNT(v.id) AS review_count
          FROM recipes r
          LEFT JOIN users u   ON u.id = r.author_id
          LEFT JOIN reviews v ON v.recipe_id = r.id
          WHERE r.slug = ? AND r.status = 'published'
          GROUP BY r.id`,
    args: [slug],
  });
  const row = rows[0];
  if (!row) return null;

  const [ingredients, steps] = await db.batch(
    [
      { sql: "SELECT emoji, name, qty, unit FROM ingredients WHERE recipe_id = ? ORDER BY position", args: [row.id] },
      { sql: "SELECT text FROM steps WHERE recipe_id = ? ORDER BY position", args: [row.id] },
    ],
    "read"
  );
  return recipeDetail(row, ingredients.rows, steps.rows);
}

/** Categories that have published recipes, with real counts. */
export async function categoriesWithCounts() {
  const { rows } = await db.execute(
    `SELECT category, COUNT(*) AS recipe_count
     FROM recipes WHERE status = 'published'
     GROUP BY category ORDER BY recipe_count DESC, category ASC`
  );
  return rows.map((r) => ({ name: r.category, recipeCount: Number(r.recipe_count) }));
}

/* ---------- Submissions & moderation (Phase 6) ---------- */

export async function slugTaken(slug) {
  const { rows } = await db.execute({ sql: "SELECT 1 FROM recipes WHERE slug = ?", args: [slug] });
  return rows.length > 0;
}

/**
 * Create a pending submission with its ingredients and steps in a single
 * transaction (db.batch), so a failure leaves nothing half-saved. Children
 * reference the new row by its unique slug, which is stable inside the batch.
 */
export async function createSubmission(recipe, ingredients, steps) {
  const statements = [
    {
      sql: `INSERT INTO recipes
              (slug, title, category, description, image_url, time_minutes,
               servings, difficulty, status, author_id, featured)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0)`,
      args: [
        recipe.slug, recipe.title, recipe.category, recipe.description, recipe.imageUrl,
        recipe.timeMinutes, recipe.servings, recipe.difficulty, recipe.authorId,
      ],
    },
    ...ingredients.map((ing, i) => ({
      sql: `INSERT INTO ingredients (recipe_id, position, emoji, name, qty, unit)
            VALUES ((SELECT id FROM recipes WHERE slug = ?), ?, ?, ?, ?, ?)`,
      args: [recipe.slug, i, ing.emoji, ing.name, ing.qty, ing.unit],
    })),
    ...steps.map((text, i) => ({
      sql: `INSERT INTO steps (recipe_id, position, text)
            VALUES ((SELECT id FROM recipes WHERE slug = ?), ?, ?)`,
      args: [recipe.slug, i, text],
    })),
  ];
  await db.batch(statements, "write");
}

/** Every recipe a user has submitted, any status, newest first. */
export async function listByAuthor(authorId) {
  const { rows } = await db.execute({
    sql: `SELECT ${CARD_COLUMNS}, r.status, r.rejection_reason AS rejectionReason
          FROM recipes r WHERE r.author_id = ? ORDER BY r.created_at DESC`,
    args: [authorId],
  });
  return rows.map((r) => ({ ...recipeCard(r), status: r.status, rejectionReason: r.rejectionReason ?? null }));
}

/** The moderation queue: recipes in one status, with the author's name. */
export async function listByStatus(status) {
  const { rows } = await db.execute({
    sql: `SELECT r.id, ${CARD_COLUMNS}, r.status, r.rejection_reason AS rejectionReason,
                 u.display_name AS author_name, r.created_at AS createdAt
          FROM recipes r LEFT JOIN users u ON u.id = r.author_id
          WHERE r.status = ? ORDER BY r.created_at ASC`,
    args: [status],
  });
  return rows.map((r) => ({
    id: Number(r.id), ...recipeCard(r), status: r.status,
    authorName: r.author_name ?? null, createdAt: r.createdAt,
  }));
}

/** A full recipe by id, any status, for an admin preview; or null. */
export async function getByIdDetail(id) {
  const { rows } = await db.execute({
    sql: `SELECT r.id, ${CARD_COLUMNS}, u.display_name AS author_name,
                 r.status, r.rejection_reason AS rejectionReason
          FROM recipes r LEFT JOIN users u ON u.id = r.author_id
          WHERE r.id = ?`,
    args: [id],
  });
  const row = rows[0];
  if (!row) return null;

  const [ingredients, steps] = await db.batch(
    [
      { sql: "SELECT emoji, name, qty, unit FROM ingredients WHERE recipe_id = ? ORDER BY position", args: [row.id] },
      { sql: "SELECT text FROM steps WHERE recipe_id = ? ORDER BY position", args: [row.id] },
    ],
    "read"
  );
  return {
    ...recipeDetail(row, ingredients.rows, steps.rows),
    id: Number(row.id), status: row.status, rejectionReason: row.rejectionReason ?? null,
  };
}

/** The author of a recipe by id, or null — for ownership checks. */
export async function authorOf(id) {
  const { rows } = await db.execute({ sql: "SELECT author_id, status FROM recipes WHERE id = ?", args: [id] });
  if (!rows[0]) return null;
  return { authorId: rows[0].author_id == null ? null : Number(rows[0].author_id), status: rows[0].status };
}

export async function setStatus(id, status, rejectionReason = null) {
  await db.execute({
    sql: "UPDATE recipes SET status = ?, rejection_reason = ? WHERE id = ?",
    args: [status, rejectionReason, id],
  });
}
