/* Results page: driven entirely by ?q= and ?category= in the URL. */

import { initChrome } from "../ui/chrome.js";
import { listRecipes } from "../data/api.js";
import { resultCard, skeletonCards, emptyState, renderInto } from "../ui/render.js";

initChrome();

const params = new URLSearchParams(location.search);
const q = (params.get("q") ?? "").trim();
const category = (params.get("category") ?? "").trim();

const heading = document.getElementById("results-heading");
const summary = document.getElementById("results-summary");

// Heading reflects the query before the request finishes, so the page never
// looks blank while loading.
if (q) {
  heading.textContent = `Results for "${q}"`;
  document.title = `"${q}" — ECB Eats`;
} else if (category) {
  heading.textContent = category;
  document.title = `${category} recipes — ECB Eats`;
} else {
  heading.textContent = "All Recipes";
  document.title = "All Recipes — ECB Eats";
}

summary.textContent = "Searching…";

renderInto(
  document.getElementById("results"),
  () => listRecipes({ q, category }),
  (container, { count, recipes }) => {
    if (!recipes.length) {
      summary.textContent = "";
      container.innerHTML = emptyState(
        q ? `No recipes match "${q}".` : "No recipes in this category yet.",
        '<a href="index.html" class="state-retry">Browse all recipes</a>'
      );
      return;
    }

    const label = count === 1 ? "1 recipe" : `${count} recipes`;
    summary.textContent = q
      ? `${label} matching "${q}"`
      : category
        ? `${label} in ${category}`
        : label;

    container.innerHTML = recipes.map(resultCard).join("");
  },
  { skeleton: skeletonCards(3, "result") }
);
