/**
 * Phase 3 smoke tests.
 *
 * The pure template helpers run directly; the page modules run inside jsdom
 * against a real dev server, so what is asserted is what a browser would build.
 *
 *   node --env-file=.env.local --test test/
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { JSDOM } from "jsdom";

import {
  escapeHtml, formatMinutes, featuredCard, categoryTile, recipeUrl,
} from "../assets/js/ui/render.js";

const PORT = 3210;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = spawn(
    process.execPath,
    ["--env-file=.env.local", "dev-server.js"],
    { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" }
  );

  // Wait for it to accept connections rather than guessing at a delay.
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${ORIGIN}/api/categories`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("dev server did not start");
});

after(() => server?.kill());

/* ---------- Pure helpers ---------- */

test("escapeHtml neutralises markup in both text and attribute contexts", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('" onerror="x'), "&quot; onerror=&quot;x");
  assert.equal(escapeHtml("Salt & Pepper"), "Salt &amp; Pepper");
  assert.equal(escapeHtml(null), "");
});

test("formatMinutes reads naturally past an hour", () => {
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(60), "1 hr");
  assert.equal(formatMinutes(210), "3 hr 30 min");
});

test("a malicious recipe title cannot inject markup into a card", () => {
  const html = featuredCard({
    slug: "x",
    title: '<img src=x onerror="alert(1)">',
    category: "Pasta",
    description: "ok",
    imageUrl: "a.jpg",
  });
  assert.ok(!html.includes("<img src=x"), "raw tag must not survive");
  assert.ok(html.includes("&lt;img src=x"), "should appear escaped");
});

test("category tiles pluralise and link to their results page", () => {
  assert.ok(categoryTile({ name: "Pasta", recipeCount: 1 }).includes("1 recipe<"));
  assert.ok(categoryTile({ name: "Pasta", recipeCount: 4 }).includes("4 recipes<"));
  assert.ok(categoryTile({ name: "Stews", recipeCount: 2 })
    .includes('href="results.html?category=Stews"'));
});

test("recipeUrl encodes the slug", () => {
  assert.equal(recipeUrl("a b"), "recipe.html?slug=a%20b");
});

/* ---------- Pages, in jsdom, against the live server ---------- */

async function openPage(path) {
  const file = path.split("?")[0];
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

  const dom = new JSDOM(html, {
    url: `${ORIGIN}/${path}`,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
  });

  // jsdom has no fetch or IntersectionObserver; both are needed by the modules.
  // Capture Node's fetch first: the wrapper is about to become globalThis.fetch,
  // and calling the bare name inside it would recurse into itself.
  const nativeFetch = globalThis.fetch;
  dom.window.fetch = (input, init) => nativeFetch(new URL(input, ORIGIN), init);
  dom.window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Module scripts are not executed by jsdom, so run the page's entry module
  // with the jsdom globals installed. Some of these (navigator) are
  // getter-only on globalThis, so they have to be redefined rather than assigned.
  const src = html.match(/<script type="module" src="([^"]+)"/)?.[1];
  const globals = {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    navigator: dom.window.navigator,
    fetch: dom.window.fetch,
    IntersectionObserver: dom.window.IntersectionObserver,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };

  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }

  // A fresh query string defeats the module cache so each page starts clean.
  await import(`../${src}?t=${Math.random()}`);
  await new Promise((r) => setTimeout(r, 600));

  return { dom, document: dom.window.document, restore: () => {} };
}

test("home page renders 3 featured, 6 categories and 6 latest from the API", async () => {
  const { document, restore } = await openPage("index.html");

  const featured = document.querySelectorAll("#featured-grid .recipe-card");
  const tiles = document.querySelectorAll("#category-grid .category-card");
  const latest = document.querySelectorAll("#latest-grid .latest-card");

  assert.equal(featured.length, 3, "three featured cards");
  assert.equal(tiles.length, 6, "six category tiles");
  assert.equal(latest.length, 6, "six latest cards");

  // Every card must point at its own recipe — the Phase 3 gate.
  const hrefs = [...featured, ...latest].map((a) => a.getAttribute("href"));
  assert.ok(hrefs.every((h) => h.startsWith("recipe.html?slug=")), "slug links");
  assert.equal(new Set([...latest].map((a) => a.getAttribute("href"))).size, 6,
    "six latest cards must be six distinct recipes");

  // Counts on tiles come from the database, never hardcoded.
  assert.ok([...tiles].every((t) => /\d+ recipes?$/.test(t.querySelector(".category-card-count").textContent)));

  restore();
});

test("results page filters by ?q= and reports the real count", async () => {
  const { document, restore } = await openPage("results.html?q=beef");

  const cards = document.querySelectorAll("#results .result-card");
  assert.equal(cards.length, 1, 'only one recipe matches "beef"');
  assert.match(document.getElementById("results-heading").textContent, /beef/i);
  assert.match(document.getElementById("results-summary").textContent, /^1 recipe matching/);

  restore();
});

test("results page shows an empty state for a query with no matches", async () => {
  const { document, restore } = await openPage("results.html?q=zzzznothing");

  assert.equal(document.querySelectorAll("#results .result-card").length, 0);
  assert.match(document.querySelector("#results .state-message").textContent, /No recipes match/);

  restore();
});

test("recipe page renders the requested recipe, not always Chicken Pasta", async () => {
  const { document, restore } = await openPage("recipe.html?slug=beef-bourguignon");

  assert.equal(document.querySelector(".recipe-detail-title").textContent, "Beef Bourguignon");
  assert.equal(document.title, "Beef Bourguignon — ECB Eats");
  assert.equal(document.querySelectorAll("#ingredients-list .ingredient-row").length, 13);
  assert.equal(document.querySelectorAll(".procedures-list .step-item").length, 8);

  // Breadcrumb category links to its results page.
  assert.ok(document.querySelector('.recipe-breadcrumb a[href="results.html?category=Stews"]'));

  // No invented rating: this recipe has no reviews yet.
  assert.equal(document.querySelector(".recipe-rating-text"), null);

  restore();
});

test("servings scaler recalculates quantities and clamps at 1", async () => {
  const { document, restore } = await openPage("recipe.html?slug=beef-bourguignon");

  const amount = () =>
    document.querySelector("#ingredients-list .ingredient-row .ingredient-amount").textContent;
  const plus = document.querySelector('[data-servings="1"]');
  const minus = document.querySelector('[data-servings="-1"]');

  assert.equal(document.getElementById("servings-value").textContent, "6");
  assert.equal(amount(), "1.5 kg", "beef chuck at the base 6 servings");

  plus.click();
  assert.equal(document.getElementById("servings-value").textContent, "7");
  assert.equal(amount(), "1.75 kg", "1.5 × 7 ÷ 6");

  for (let i = 0; i < 20; i++) minus.click();
  assert.equal(document.getElementById("servings-value").textContent, "1",
    "must not go below one serving");

  // "to taste" has no number, so it must never be scaled.
  const toTaste = [...document.querySelectorAll(".ingredient-row")]
    .find((r) => r.textContent.includes("Salt & Pepper"));
  assert.equal(toTaste.querySelector(".ingredient-amount").textContent, "to taste");

  restore();
});

test("an unknown slug shows a friendly 404, not an error", async () => {
  const { document, restore } = await openPage("recipe.html?slug=no-such-recipe");

  assert.match(document.querySelector(".state-title").textContent, /not found/i);
  assert.equal(document.title, "Recipe not found — ECB Eats");
  assert.ok(document.querySelector('.state-panel a[href="index.html"]'), "offers a way back");

  restore();
});
