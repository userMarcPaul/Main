import { db } from "../../../lib/db.js";
import {
  handler, json, fail, methodAllowed, intParam, readJsonBody,
  enforceSameOrigin, requireJsonContentType,
} from "../../../lib/http.js";
import { getUser, requireUser } from "../../../lib/auth.js";
import { reviewSchema, validate } from "../../../lib/validate.js";
import { rateLimit } from "../../../lib/rateLimit.js";

const PAGE_SIZE = 10;

/**
 * Reviews for one recipe.
 *   GET    ?page=1   newest first, 10 per page, with reviewer name + summary
 *   POST             create or update the caller's review (one per recipe)
 *   DELETE ?id=      own review, or any review when admin
 */
export default handler(async (req, res) => {
  if (!methodAllowed(req, res, ["GET", "POST", "DELETE"])) return;

  const recipe = await findPublishedRecipe(slugOf(req));
  if (!recipe) return fail(res, 404, "Recipe not found");

  if (req.method === "GET") return handleGet(req, res, recipe);
  if (req.method === "POST") return handlePost(req, res, recipe);
  return handleDelete(req, res, recipe);
});

function slugOf(req) {
  if (req.query?.slug) return req.query.slug;
  const parts = new URL(req.url, "http://localhost").pathname.split("/");
  return decodeURIComponent(parts[parts.length - 2] ?? ""); // .../:slug/reviews
}

async function findPublishedRecipe(slug) {
  const { rows } = await db.execute({
    sql: "SELECT id, author_id FROM recipes WHERE slug = ? AND status = 'published'",
    args: [slug],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), authorId: rows[0].author_id == null ? null : Number(rows[0].author_id) };
}

async function summaryOf(recipeId) {
  const { rows } = await db.execute({
    sql: "SELECT ROUND(AVG(rating), 1) AS avgRating, COUNT(*) AS reviewCount FROM reviews WHERE recipe_id = ?",
    args: [recipeId],
  });
  return { avgRating: rows[0].avgRating ?? null, reviewCount: Number(rows[0].reviewCount) };
}

async function handleGet(req, res, recipe) {
  const page = intParam(new URL(req.url, "http://localhost").searchParams.get("page"), {
    min: 1, max: 100000, fallback: 1,
  });
  const offset = (page - 1) * PAGE_SIZE;

  const [list, summary] = await db.batch(
    [
      {
        sql: `SELECT v.id, v.rating, v.comment, v.created_at AS createdAt,
                     v.user_id AS userId, u.display_name AS author
              FROM reviews v JOIN users u ON u.id = v.user_id
              WHERE v.recipe_id = ?
              ORDER BY v.created_at DESC, v.id DESC
              LIMIT ? OFFSET ?`,
        args: [recipe.id, PAGE_SIZE, offset],
      },
      {
        sql: "SELECT ROUND(AVG(rating), 1) AS avgRating, COUNT(*) AS reviewCount FROM reviews WHERE recipe_id = ?",
        args: [recipe.id],
      },
    ],
    "read"
  );

  const reviewCount = Number(summary.rows[0].reviewCount);

  // Per-viewer state, so the page knows whether to show the form, a prompt to
  // log in, or "you can't review your own recipe" — without another round trip.
  const user = await getUser(req);
  const viewer = { loggedIn: Boolean(user), isAuthor: false, canReview: false, myReview: null };
  if (user) {
    viewer.isAuthor = recipe.authorId === user.id;
    viewer.canReview = !viewer.isAuthor;
    const mine = await db.execute({
      sql: "SELECT id, rating, comment FROM reviews WHERE recipe_id = ? AND user_id = ?",
      args: [recipe.id, user.id],
    });
    if (mine.rows[0]) {
      viewer.myReview = {
        id: Number(mine.rows[0].id),
        rating: Number(mine.rows[0].rating),
        comment: mine.rows[0].comment,
      };
    }
  }

  json(res, 200, {
    page,
    pageSize: PAGE_SIZE,
    total: reviewCount,
    totalPages: Math.max(1, Math.ceil(reviewCount / PAGE_SIZE)),
    summary: { avgRating: summary.rows[0].avgRating ?? null, reviewCount },
    reviews: list.rows.map((r) => ({
      id: Number(r.id),
      author: r.author,
      rating: Number(r.rating),
      comment: r.comment,
      createdAt: r.createdAt,
      mine: user ? Number(r.userId) === user.id : false,
    })),
    viewer,
  });
}

async function handlePost(req, res, recipe) {
  if (!requireJsonContentType(req, res)) return;
  if (!enforceSameOrigin(req, res)) return;

  const user = await requireUser(req, res);
  if (!user) return;

  if (recipe.authorId === user.id) {
    return fail(res, 403, "You can't review your own recipe");
  }

  const limited = await rateLimit(`review:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return fail(res, 429, "Too many reviews. Please try again later.");
  }

  const body = await readJsonBody(req);
  if (body === null) return fail(res, 400, "Invalid request body");

  const parsed = validate(reviewSchema, body);
  if (!parsed.ok) {
    return json(res, 422, { error: "Please check your review", fieldErrors: parsed.fieldErrors });
  }

  // One review per user per recipe: a second post updates the first.
  await db.execute({
    sql: `INSERT INTO reviews (recipe_id, user_id, rating, comment)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (recipe_id, user_id)
          DO UPDATE SET rating = excluded.rating,
                        comment = excluded.comment,
                        created_at = datetime('now')`,
    args: [recipe.id, user.id, parsed.data.rating, parsed.data.comment],
  });

  json(res, 200, { ok: true, summary: await summaryOf(recipe.id) });
}

async function handleDelete(req, res, recipe) {
  if (!enforceSameOrigin(req, res)) return;

  const user = await requireUser(req, res);
  if (!user) return;

  const id = new URL(req.url, "http://localhost").searchParams.get("id");

  const found = id
    ? await db.execute({
        sql: "SELECT id, user_id FROM reviews WHERE id = ? AND recipe_id = ?",
        args: [Number(id), recipe.id],
      })
    : await db.execute({
        sql: "SELECT id, user_id FROM reviews WHERE recipe_id = ? AND user_id = ?",
        args: [recipe.id, user.id],
      });

  const target = found.rows[0];
  if (!target) return fail(res, 404, "Review not found");

  const owns = Number(target.user_id) === user.id;
  if (!owns && user.role !== "admin") {
    return fail(res, 403, "You can only delete your own review");
  }

  await db.execute({ sql: "DELETE FROM reviews WHERE id = ?", args: [Number(target.id)] });
  json(res, 200, { ok: true, summary: await summaryOf(recipe.id) });
}
