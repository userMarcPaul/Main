/* Reviews widget for the recipe page: summary, the signed-in review form with
   clickable stars, and a paginated list. Mounted by recipe.js. */

import {
  getReviews, postReview, deleteReview, ApiError,
} from "./api.js";
import { escapeHtml, starsDisplay, formatDate } from "./render.js";

/**
 * @param {HTMLElement} container
 * @param {{ slug: string, onSummary?: (summary) => void }} options
 */
export async function initReviews(container, { slug, onSummary }) {
  let page = 1;
  let totalPages = 1;

  container.innerHTML = `
    <h2 class="recipe-section-heading">Reviews</h2>
    <div class="reviews-summary" id="reviews-summary"></div>
    <div class="review-form-area" id="review-form-area"></div>
    <div class="review-list" id="review-list"></div>
    <div class="review-pager" id="review-pager"></div>`;

  const summaryEl = container.querySelector("#reviews-summary");
  const formArea = container.querySelector("#review-form-area");
  const listEl = container.querySelector("#review-list");
  const pagerEl = container.querySelector("#review-pager");

  await refresh();

  async function refresh() {
    let data;
    try {
      data = await getReviews(slug, 1);
    } catch (error) {
      summaryEl.innerHTML = `<p class="reviews-error">Couldn't load reviews: ${escapeHtml(error.message)}</p>`;
      return;
    }

    page = 1;
    totalPages = data.totalPages;
    onSummary?.(data.summary);

    renderSummary(data.summary);
    renderForm(data.viewer);
    listEl.innerHTML = data.reviews.map(reviewRow).join("");
    renderPager();
  }

  function renderSummary(summary) {
    summaryEl.innerHTML = summary.reviewCount
      ? `${starsDisplay(summary.avgRating)}
         <span class="reviews-avg">${escapeHtml(summary.avgRating)}</span>
         <span class="reviews-count">${summary.reviewCount} ${summary.reviewCount === 1 ? "review" : "reviews"}</span>`
      : `<p class="reviews-none">No reviews yet. Be the first!</p>`;
  }

  function renderForm(viewer) {
    if (!viewer.loggedIn) {
      const next = encodeURIComponent(location.pathname + location.search);
      formArea.innerHTML = `<p class="review-signed-out">
        <a href="login.html?next=${next}">Log in</a> to leave a review.</p>`;
      return;
    }
    if (viewer.isAuthor) {
      formArea.innerHTML = `<p class="review-signed-out">You can't review your own recipe.</p>`;
      return;
    }

    const mine = viewer.myReview;
    formArea.innerHTML = `
      <form class="review-form" id="review-form">
        <p class="review-form-title">${mine ? "Your review" : "Leave a review"}</p>
        <fieldset class="star-input" aria-describedby="rating-error">
          <legend>Your rating</legend>
          ${[5, 4, 3, 2, 1].map((n) => `
            <input type="radio" name="rating" id="star${n}" value="${n}" ${mine && mine.rating === n ? "checked" : ""}>
            <label for="star${n}" title="${n} star${n === 1 ? "" : "s"}"><i class="fas fa-star"></i></label>`).join("")}
        </fieldset>
        <p class="auth-field-error" id="rating-error" hidden></p>
        <label class="review-comment-label" for="comment">Comment <span>(optional)</span></label>
        <textarea id="comment" name="comment" maxlength="1000" rows="3"
          placeholder="What did you think?">${mine && mine.comment ? escapeHtml(mine.comment) : ""}</textarea>
        <p class="auth-form-error" id="review-error" role="alert" hidden></p>
        <div class="review-form-actions">
          <button type="submit" class="auth-submit review-submit">${mine ? "Update review" : "Post review"}</button>
          ${mine ? `<button type="button" class="review-delete" data-id="${mine.id}">Delete</button>` : ""}
        </div>
      </form>`;

    formArea.querySelector("#review-form").addEventListener("submit", onSubmit);
    formArea.querySelector(".review-delete")?.addEventListener("click", onDelete);
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector("#review-error");
    const ratingError = form.querySelector("#rating-error");
    error.hidden = true;
    ratingError.hidden = true;

    const rating = form.querySelector('input[name="rating"]:checked')?.value;
    if (!rating) {
      ratingError.textContent = "Choose 1 to 5 stars";
      ratingError.hidden = false;
      return;
    }

    const submit = form.querySelector(".review-submit");
    submit.disabled = true;

    try {
      const comment = form.querySelector("#comment").value;
      await postReview(slug, { rating: Number(rating), comment });
      await refresh();
    } catch (err) {
      submit.disabled = false;
      if (err.fieldErrors?.rating) {
        ratingError.textContent = err.fieldErrors.rating;
        ratingError.hidden = false;
      } else {
        error.textContent = err instanceof ApiError ? err.message : "Could not post your review";
        error.hidden = false;
      }
    }
  }

  async function onDelete(event) {
    if (!confirm("Delete your review?")) return;
    try {
      await deleteReview(slug, event.currentTarget.dataset.id);
      await refresh();
    } catch (err) {
      alert(err.message ?? "Could not delete the review");
    }
  }

  function reviewRow(review) {
    return `
      <article class="review${review.mine ? " review--mine" : ""}">
        <div class="review-head">
          <span class="review-avatar">${escapeHtml(review.author.charAt(0).toUpperCase())}</span>
          <div>
            <p class="review-author">${escapeHtml(review.author)}${review.mine ? ' <span class="review-you">you</span>' : ""}</p>
            <p class="review-date">${escapeHtml(formatDate(review.createdAt))}</p>
          </div>
          ${starsDisplay(review.rating)}
        </div>
        ${review.comment ? `<p class="review-comment">${escapeHtml(review.comment)}</p>` : ""}
      </article>`;
  }

  function renderPager() {
    if (page >= totalPages) { pagerEl.innerHTML = ""; return; }
    pagerEl.innerHTML = `<button type="button" class="review-more" id="review-more">Load more reviews</button>`;
    pagerEl.querySelector("#review-more").addEventListener("click", loadMore);
  }

  async function loadMore() {
    const button = pagerEl.querySelector("#review-more");
    button.disabled = true;
    try {
      const data = await getReviews(slug, page + 1);
      page += 1;
      totalPages = data.totalPages;
      listEl.insertAdjacentHTML("beforeend", data.reviews.map(reviewRow).join(""));
      renderPager();
    } catch {
      button.disabled = false;
    }
  }
}
