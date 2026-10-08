/* Home page: featured recipes, category tiles with real counts, latest recipes. */

import { initChrome, initScrollAnimations } from "../ui/chrome.js";
import { listRecipes, listCategories } from "../data/api.js";
import {
  featuredCard, latestCard, categoryTile,
  skeletonCards, emptyState, renderInto,
} from "../ui/render.js";

initChrome();

renderInto(
  document.getElementById("featured-grid"),
  () => listRecipes({ featured: true, limit: 3 }),
  (container, { recipes }) => {
    container.innerHTML = recipes.length
      ? recipes.map(featuredCard).join("")
      : emptyState("No featured recipes yet.");
    initScrollAnimations(container);
  },
  { skeleton: skeletonCards(3, "featured") }
);

renderInto(
  document.getElementById("category-grid"),
  () => listCategories(),
  (container, { categories }) => {
    container.innerHTML = categories.length
      ? categories.map(categoryTile).join("")
      : emptyState("No categories yet.");
    initScrollAnimations(container);
  },
  { skeleton: skeletonCards(6, "tile") }
);

renderInto(
  document.getElementById("latest-grid"),
  () => listRecipes({ limit: 6 }),
  (container, { recipes }) => {
    container.innerHTML = recipes.length
      ? recipes.map(latestCard).join("")
      : emptyState("No recipes yet.");
    initScrollAnimations(container);
  },
  { skeleton: skeletonCards(3, "latest") }
);
