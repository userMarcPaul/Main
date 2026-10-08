/* =========================================
   ECB Eats — Templates and page states
   Every value that reaches HTML goes through escapeHtml(), so a
   user-submitted recipe title cannot inject markup or script.
   ========================================= */

/** Escape for both text and quoted-attribute contexts. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BADGE_CLASSES = {
  pasta: "badge-pasta",
  stews: "badge-stews",
  soups: "badge-soup",
  cakes: "badge-cakes",
  desserts: "badge-dessert",
  seafood: "badge-seafood",
};

const CATEGORY_EMOJI = {
  pasta: "🍝",
  stews: "🍲",
  soups: "🍲",
  cakes: "🍰",
  desserts: "🍰",
  seafood: "🦐",
  beef: "🥩",
  meat: "🥩",
  poultry: "🍗",
  vegetarian: "🥗",
  salads: "🥗",
};

function badgeClass(category) {
  return BADGE_CLASSES[String(category).toLowerCase()] ?? "badge-pasta";
}

export function categoryEmoji(category) {
  return CATEGORY_EMOJI[String(category).toLowerCase()] ?? "🍽️";
}

export function recipeUrl(slug) {
  return `recipe.html?slug=${encodeURIComponent(slug)}`;
}

export function categoryUrl(category) {
  return `results.html?category=${encodeURIComponent(category)}`;
}

/* ---------- Cards ---------- */

/** Large featured card used in the hero grid. */
export function featuredCard(recipe, index = 0) {
  const stagger = index < 3 ? ` stagger-${index + 1}` : "";
  const topPick = index === 0 ? '<span class="top-picks-badge">Top Picks!</span>' : "";

  return `
    <a href="${escapeHtml(recipeUrl(recipe.slug))}" class="recipe-card animate-on-scroll${stagger}">
      <div class="recipe-card-image">
        ${topPick}
        <img src="${escapeHtml(recipe.imageUrl)}" alt="${escapeHtml(recipe.title)}" loading="lazy" width="400" height="260">
        <span class="category-badge ${badgeClass(recipe.category)}">${escapeHtml(recipe.category)}</span>
      </div>
      <div class="recipe-card-body">
        <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
        <p class="recipe-card-desc">${escapeHtml(recipe.description)}</p>
      </div>
    </a>`;
}

/** Compact card used in the "Latest Recipes" grid. */
export function latestCard(recipe, index = 0) {
  const stagger = index < 3 ? ` stagger-${index + 1}` : "";

  return `
    <a href="${escapeHtml(recipeUrl(recipe.slug))}" class="latest-card animate-on-scroll${stagger}">
      <div class="latest-card-image">
        <img src="${escapeHtml(recipe.imageUrl)}" alt="${escapeHtml(recipe.title)}" loading="lazy" width="400" height="180">
      </div>
      <div class="latest-card-body">
        <span class="latest-card-category">${escapeHtml(recipe.category)}</span>
        <h3 class="latest-card-title">${escapeHtml(recipe.title)}</h3>
        <div class="latest-card-meta">
          <span><i class="far fa-clock"></i> ${escapeHtml(formatMinutes(recipe.timeMinutes))}</span>
          <span><i class="fas fa-fire-flame-curved"></i> ${escapeHtml(recipe.difficulty)}</span>
        </div>
      </div>
    </a>`;
}

/** Wide row used on the results page. */
export function resultCard(recipe) {
  return `
    <a href="${escapeHtml(recipeUrl(recipe.slug))}" class="result-card">
      <div class="result-image">
        <img src="${escapeHtml(recipe.imageUrl)}" alt="${escapeHtml(recipe.title)}" loading="lazy" width="160" height="120">
      </div>
      <div class="result-body">
        <span class="result-category">${escapeHtml(recipe.category)}</span>
        <h3 class="result-title">${escapeHtml(recipe.title)}</h3>
        <p class="result-snippet">${escapeHtml(recipe.description)}</p>
        <div class="result-meta">
          <span><i class="far fa-clock"></i> ${escapeHtml(formatMinutes(recipe.timeMinutes))}</span>
          <span><i class="fas fa-fire-flame-curved"></i> ${escapeHtml(recipe.difficulty)}</span>
          ${ratingSnippet(recipe)}
        </div>
      </div>
    </a>`;
}

export function categoryTile(category, index = 0) {
  const stagger = index < 3 ? ` stagger-${index + 1}` : "";
  const count = category.recipeCount;

  return `
    <a href="${escapeHtml(categoryUrl(category.name))}" class="category-card animate-on-scroll${stagger}">
      <div class="category-card-emoji">${categoryEmoji(category.name)}</div>
      <div class="category-card-name">${escapeHtml(category.name)}</div>
      <div class="category-card-count">${count} ${count === 1 ? "recipe" : "recipes"}</div>
    </a>`;
}

/* ---------- Shared bits ---------- */

export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Real rating or nothing at all — never a placeholder number. */
function ratingSnippet(recipe) {
  if (!recipe.reviewCount) return "";
  return `<span><i class="fas fa-star"></i> ${escapeHtml(recipe.avgRating)} (${recipe.reviewCount})</span>`;
}

/* ---------- Ratings and dates ---------- */

/** Five star icons for a numeric average: full, half, or empty. */
export function starsDisplay(rating) {
  const value = Number(rating) || 0;
  let html = "";
  for (let i = 1; i <= 5; i++) {
    if (value >= i) html += '<i class="fas fa-star"></i>';
    else if (value >= i - 0.5) html += '<i class="fas fa-star-half-alt"></i>';
    else html += '<i class="far fa-star"></i>';
  }
  return `<span class="stars" aria-hidden="true">${html}</span>`;
}

/** "3 Oct 2026" from an ISO / SQLite datetime string. */
export function formatDate(value) {
  const date = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A coloured status pill for a submission (pending / published / rejected). */
export function statusBadge(status) {
  const label = { pending: "Pending", published: "Published", rejected: "Rejected" }[status] ?? status;
  return `<span class="status-badge status-badge--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

/* ---------- Loading, empty and error states ---------- */

export function skeletonCards(count, variant = "latest") {
  return Array.from(
    { length: count },
    () => `<div class="skeleton-card skeleton-card--${variant}" aria-hidden="true">
      <div class="skeleton-block skeleton-image"></div>
      <div class="skeleton-lines">
        <div class="skeleton-block skeleton-line skeleton-line--short"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line skeleton-line--short"></div>
      </div>
    </div>`
  ).join("");
}

export function emptyState(message, actionHtml = "") {
  return `
    <div class="state-panel">
      <div class="state-icon">🍽️</div>
      <p class="state-message">${escapeHtml(message)}</p>
      ${actionHtml}
    </div>`;
}

export function errorState(message) {
  return `
    <div class="state-panel">
      <div class="state-icon">⚠️</div>
      <p class="state-message">${escapeHtml(message)}</p>
      <button type="button" class="state-retry" data-retry>Try again</button>
    </div>`;
}

/**
 * Render into a container, wiring the error state's retry button back to the
 * same loader so "Try again" actually tries again.
 */
export async function renderInto(container, load, draw, { skeleton } = {}) {
  if (!container) return;
  if (skeleton) container.innerHTML = skeleton;

  try {
    const data = await load();
    draw(container, data);
  } catch (error) {
    container.innerHTML = errorState(error.message ?? "Something went wrong");
    container.querySelector("[data-retry]")?.addEventListener("click", () => {
      renderInto(container, load, draw, { skeleton });
    });
  }
}
