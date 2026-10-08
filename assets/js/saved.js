/* Saved Recipes page. Requires login: a signed-out visitor is sent to log in
   and returned here afterwards. */

import { initChrome, safeNext } from "./app.js";
import { listSaved, unsaveRecipe, ApiError } from "./api.js";
import {
  escapeHtml, latestCard, skeletonCards, emptyState,
} from "./render.js";

initChrome();

const grid = document.getElementById("saved-grid");
grid.innerHTML = skeletonCards(3, "latest");

load();

async function load() {
  let data;
  try {
    data = await listSaved();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Not logged in — bounce to login and come back here.
      location.replace(`login.html?next=${encodeURIComponent(safeNext("/saved.html"))}`);
      return;
    }
    grid.innerHTML = emptyState(error.message ?? "Couldn't load your saved recipes.");
    return;
  }

  render(data.recipes);
}

function render(recipes) {
  if (!recipes.length) {
    grid.innerHTML = emptyState(
      "You haven't saved any recipes yet.",
      '<a href="index.html" class="state-retry">Browse recipes</a>'
    );
    return;
  }

  // A saved card is a normal recipe card with a remove button layered on top.
  grid.innerHTML = recipes
    .map((r) => `
      <div class="saved-card">
        ${latestCard(r)}
        <button type="button" class="saved-remove" data-slug="${escapeHtml(r.slug)}"
          aria-label="Remove ${escapeHtml(r.title)} from saved">
          <i class="fas fa-xmark"></i>
        </button>
      </div>`)
    .join("");

  grid.querySelectorAll(".saved-remove").forEach((button) => {
    button.addEventListener("click", () => remove(button));
  });
}

async function remove(button) {
  const card = button.closest(".saved-card");
  card.classList.add("saved-card--removing");

  try {
    await unsaveRecipe(button.dataset.slug);
    card.remove();
    if (!grid.querySelector(".saved-card")) render([]);
  } catch {
    card.classList.remove("saved-card--removing");
  }
}
