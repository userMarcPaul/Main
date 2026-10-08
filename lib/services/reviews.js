/* Review rules: who may review what, one per user, rate limits, validation.
   Takes a resolved `actor` (or null) rather than a request. */
import * as reviewsRepo from "../repositories/reviews.js";
import * as recipesRepo from "../repositories/recipes.js";
import { reviewSchema, validate } from "../validate.js";
import { rateLimit } from "../rateLimit.js";
import { notFound, unauthorized, forbidden, unprocessable, tooMany } from "../errors.js";

const PAGE_SIZE = 10;

export async function listForRecipe(slug, { page = 1, actor = null }) {
  const ref = await recipesRepo.findRef(slug);
  if (!ref) throw notFound("Recipe not found");

  const [rows, summary] = await Promise.all([
    reviewsRepo.page(ref.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    reviewsRepo.summary(ref.id),
  ]);

  const viewer = { loggedIn: Boolean(actor), isAuthor: false, canReview: false, myReview: null };
  if (actor) {
    viewer.isAuthor = ref.authorId === actor.id;
    viewer.canReview = !viewer.isAuthor;
    viewer.myReview = await reviewsRepo.findOwn(ref.id, actor.id);
  }

  return {
    page,
    pageSize: PAGE_SIZE,
    total: summary.reviewCount,
    totalPages: Math.max(1, Math.ceil(summary.reviewCount / PAGE_SIZE)),
    summary,
    reviews: rows.map((r) => ({
      id: r.id, author: r.author, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
      mine: actor ? r.userId === actor.id : false,
    })),
    viewer,
  };
}

export async function submit(slug, { actor, input }) {
  if (!actor) throw unauthorized();

  const ref = await recipesRepo.findRef(slug);
  if (!ref) throw notFound("Recipe not found");
  if (ref.authorId === actor.id) throw forbidden("You can't review your own recipe");

  const limited = await rateLimit(`review:${actor.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) throw tooMany(limited.retryAfter, "Too many reviews. Please try again later.");

  const parsed = validate(reviewSchema, input);
  if (!parsed.ok) throw unprocessable("Please check your review", parsed.fieldErrors);

  await reviewsRepo.upsert({ recipeId: ref.id, userId: actor.id, ...parsed.data });
  return { ok: true, summary: await reviewsRepo.summary(ref.id) };
}

export async function remove(slug, { actor, reviewId }) {
  if (!actor) throw unauthorized();

  const ref = await recipesRepo.findRef(slug);
  if (!ref) throw notFound("Recipe not found");

  const target = reviewId
    ? await reviewsRepo.findById(reviewId, ref.id)
    : await reviewsRepo.ownRef(ref.id, actor.id);
  if (!target) throw notFound("Review not found");

  if (target.userId !== actor.id && actor.role !== "admin") {
    throw forbidden("You can only delete your own review");
  }

  await reviewsRepo.deleteById(target.id);
  return { ok: true, summary: await reviewsRepo.summary(ref.id) };
}
