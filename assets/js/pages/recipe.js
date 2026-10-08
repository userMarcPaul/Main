/* Recipe page: reads ?slug= from the URL and renders one recipe. */

import { initChrome } from "../ui/chrome.js";
import { getRecipe, me, isSaved, saveRecipe, unsaveRecipe, ApiError } from "../data/api.js";
import {
  escapeHtml, formatMinutes, categoryUrl, errorState,
} from "../ui/render.js";
import { initReviews } from "../features/reviews.js";

initChrome();

const hero = document.getElementById("recipe-hero");
const root = document.getElementById("recipe-root");
const slug = new URLSearchParams(location.search).get("slug");

/** Current servings, and the recipe's own baseline. Set once loaded. */
let recipe = null;
let servings = 0;
let user = null;
let saved = false;

load();

async function load() {
  if (!slug) return showNotFound("No recipe was specified.");

  root.innerHTML = skeleton();

  try {
    // The recipe is essential; who is logged in and whether it is saved are
    // best-effort, so a failure there must not blank the page.
    [recipe, user] = await Promise.all([getRecipe(slug), me().catch(() => null)]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return showNotFound(`We couldn't find a recipe called "${slug}".`);
    }
    hero.innerHTML = "";
    root.innerHTML = errorState(error.message);
    root.querySelector("[data-retry]")?.addEventListener("click", load);
    return;
  }

  saved = user ? await isSaved(slug).catch(() => false) : false;
  servings = recipe.servings;
  render();

  initReviews(document.getElementById("reviews"), {
    slug,
    onSummary: updateRatingMeta,
  });
}

function render() {
  document.title = `${recipe.title} — ECB Eats`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", recipe.description);

  hero.innerHTML = `
    <img src="${escapeHtml(recipe.imageUrl)}" alt="${escapeHtml(recipe.title)}">
    <div class="recipe-detail-hero-overlay"></div>`;

  root.innerHTML = `
    <div class="recipe-breadcrumb">
      <a href="index.html">Home</a>
      <span>/</span>
      <a href="${escapeHtml(categoryUrl(recipe.category))}">${escapeHtml(recipe.category)}</a>
      <span>/</span>
      <span>${escapeHtml(recipe.title)}</span>
    </div>

    <h1 class="recipe-detail-title">${escapeHtml(recipe.title)}</h1>

    <div class="recipe-detail-meta">
      <div class="meta-item">
        <i class="far fa-clock"></i>
        <span>${escapeHtml(formatMinutes(recipe.timeMinutes))}</span>
      </div>
      <div class="meta-item">
        <i class="fas fa-utensils"></i>
        <span><strong>${recipe.servings}</strong> servings</span>
      </div>
      <div class="meta-item">
        <i class="fas fa-signal"></i>
        <span>${escapeHtml(recipe.difficulty)}</span>
      </div>
      ${ratingMeta()}
    </div>

    <div class="recipe-actions">
      <button class="recipe-action-btn primary" data-save aria-pressed="${saved}">
        <i class="${saved ? "fas" : "far"} fa-bookmark"></i> <span>${saved ? "Saved" : "Save Recipe"}</span>
      </button>
      <button class="recipe-action-btn secondary" data-print><i class="fas fa-print"></i> Print</button>
      <button class="recipe-action-btn secondary" data-share><i class="fas fa-share-nodes"></i> Share</button>
    </div>

    ${recipe.authorName ? `
    <div class="author-bar">
      <div class="author-avatar">${escapeHtml(recipe.authorName.charAt(0).toUpperCase())}</div>
      <div class="author-details">
        <p class="author-name">Submitted by ${escapeHtml(recipe.authorName)}</p>
      </div>
    </div>` : ""}

    <p class="recipe-description">${escapeHtml(recipe.description)}</p>

    <div class="recipe-section-head">
      <h2 class="recipe-section-heading">Ingredients</h2>
      <div class="servings-scaler">
        <span class="servings-label">Servings</span>
        <button type="button" data-servings="-1" aria-label="Fewer servings">−</button>
        <output id="servings-value">${servings}</output>
        <button type="button" data-servings="1" aria-label="More servings">+</button>
      </div>
    </div>
    <div class="ingredients-list" id="ingredients-list">${ingredientRows()}</div>

    <h2 class="recipe-section-heading">Instructions</h2>
    <div class="procedures-list">
      ${recipe.steps.map((text, i) => `
        <div class="step-item">
          <div class="step-number">${i + 1}</div>
          <p class="step-text">${escapeHtml(text)}</p>
        </div>`).join("")}
    </div>

    <section class="reviews-section" id="reviews"></section>`;

  root.querySelector("[data-print]").addEventListener("click", () => window.print());
  root.querySelector("[data-share]").addEventListener("click", share);
  root.querySelector("[data-save]").addEventListener("click", toggleSave);
  root.querySelectorAll("[data-servings]").forEach((button) => {
    button.addEventListener("click", () => changeServings(Number(button.dataset.servings)));
  });
}

/** Real rating or nothing — never a placeholder. */
function ratingMeta() {
  if (!recipe.reviewCount) return "";
  return `
    <div class="meta-item" id="rating-meta">
      <i class="fas fa-star"></i>
      <span class="recipe-rating-text">${escapeHtml(recipe.avgRating)} (${recipe.reviewCount} ${
        recipe.reviewCount === 1 ? "review" : "reviews"
      })</span>
    </div>`;
}

/** Keep the meta star in sync when a review is posted or deleted. */
function updateRatingMeta(summary) {
  const metaRow = document.querySelector(".recipe-detail-meta");
  if (!metaRow) return;
  let node = document.getElementById("rating-meta");

  if (!summary.reviewCount) {
    node?.remove();
    return;
  }

  const text = `${summary.avgRating} (${summary.reviewCount} ${
    summary.reviewCount === 1 ? "review" : "reviews"
  })`;

  if (!node) {
    node = document.createElement("div");
    node.className = "meta-item";
    node.id = "rating-meta";
    node.innerHTML = `<i class="fas fa-star"></i> <span class="recipe-rating-text"></span>`;
    metaRow.appendChild(node);
  }
  node.querySelector(".recipe-rating-text").textContent = text;
}

/* ---------- Save ---------- */

async function toggleSave() {
  // Signed out: send them to log in, and come back to this recipe.
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `login.html?next=${next}`;
    return;
  }

  const button = root.querySelector("[data-save]");
  const wasSaved = saved;
  // Optimistic: flip immediately, roll back if the request fails.
  setSaveButton(!saved);

  try {
    if (wasSaved) await unsaveRecipe(slug);
    else await saveRecipe(slug);
  } catch (error) {
    setSaveButton(wasSaved);
    toast(error.message ?? "Could not update your saved recipes");
  }
}

function setSaveButton(next) {
  saved = next;
  const button = root.querySelector("[data-save]");
  button.setAttribute("aria-pressed", String(saved));
  button.querySelector("span").textContent = saved ? "Saved" : "Save Recipe";
  button.querySelector("i").className = `${saved ? "fas" : "far"} fa-bookmark`;
}

/* ---------- Servings scaler ---------- */

function changeServings(delta) {
  const next = servings + delta;
  if (next < 1 || next > 50) return;

  servings = next;
  document.getElementById("servings-value").textContent = String(servings);
  document.getElementById("ingredients-list").innerHTML = ingredientRows();
}

function ingredientRows() {
  return recipe.ingredients
    .map((ingredient) => `
      <div class="ingredient-row">
        <div class="ingredient-left">
          <span class="ingredient-emoji">${escapeHtml(ingredient.emoji ?? "")}</span>
          <span class="ingredient-name">${escapeHtml(ingredient.name)}</span>
        </div>
        <span class="ingredient-amount">${escapeHtml(formatAmount(ingredient))}</span>
      </div>`)
    .join("");
}

/** qty × newServings ÷ baseServings. A null qty ("to taste") never scales. */
function formatAmount({ qty, unit }) {
  if (qty === null || qty === undefined) return unit ?? "";

  const scaled = (qty * servings) / recipe.servings;
  return unit ? `${roundSensibly(scaled)} ${unit}` : String(roundSensibly(scaled));
}

/**
 * Coarser rounding as amounts grow: 1333.33 g is noise, 0.33 tsp is not.
 */
function roundSensibly(value) {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 2) / 2;
  if (value >= 1) return Math.round(value * 4) / 4;
  return Math.round(value * 100) / 100;
}

/* ---------- Share ---------- */

async function share() {
  const payload = {
    title: `${recipe.title} — ECB Eats`,
    text: recipe.description,
    url: location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch {
      return; // The user dismissed the sheet; not an error.
    }
  }

  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied");
  } catch {
    toast("Could not copy the link");
  }
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);

  requestAnimationFrame(() => node.classList.add("toast--visible"));
  setTimeout(() => {
    node.classList.remove("toast--visible");
    node.addEventListener("transitionend", () => node.remove(), { once: true });
  }, 2200);
}

/* ---------- States ---------- */

function showNotFound(message) {
  document.title = "Recipe not found — ECB Eats";
  hero.innerHTML = "";
  root.innerHTML = `
    <div class="state-panel state-panel--page">
      <div class="state-icon">🍳</div>
      <h1 class="state-title">Recipe not found</h1>
      <p class="state-message">${escapeHtml(message)}</p>
      <a href="index.html" class="state-retry">Browse all recipes</a>
    </div>`;
}

function skeleton() {
  return `
    <div class="skeleton-block skeleton-line skeleton-line--short" style="height:36px"></div>
    <div class="skeleton-block skeleton-line" style="height:18px"></div>
    <div class="skeleton-block skeleton-line" style="height:18px"></div>
    <div class="skeleton-block skeleton-line skeleton-line--short" style="height:18px"></div>`;
}
