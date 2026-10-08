/**
 * Phase 5 tests: reviews, ratings and saved recipes. Backend flows run over
 * HTTP against a throwaway, freshly seeded database; the recipe and saved
 * pages run in jsdom with a cookie jar so the signed-in UI is exercised.
 *
 *   npm run test:reviews
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { JSDOM } from "jsdom";

const PORT = 3640;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DB_PATH = "test-reviews.db";
const DB_URL = `file:${DB_PATH}`;
const ADMIN_EMAIL = "boss@ecbeats.app";
let server;

before(async () => {
  for (const f of [DB_PATH, `${DB_PATH}-journal`]) await rm(f, { force: true });

  const db = createClient({ url: DB_URL });
  await db.executeMultiple(await readFile("db/schema.sql", "utf8"));
  db.close();

  // Seed the six recipes into the throwaway database.
  spawnSync(process.execPath, ["db/seed.js"], {
    env: { ...process.env, TURSO_DATABASE_URL: DB_URL },
    stdio: "ignore",
  });

  server = spawn(process.execPath, ["dev-server.js"], {
    env: { ...process.env, PORT: String(PORT), TURSO_DATABASE_URL: DB_URL, ADMIN_EMAIL },
    stdio: "ignore",
  });

  for (let i = 0; i < 50; i++) {
    try { await fetch(`${ORIGIN}/api/categories`); return; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("dev server did not start");
});

after(async () => {
  server?.kill();
  for (const f of [DB_PATH, `${DB_PATH}-journal`]) await rm(f, { force: true });
});

/* ---------- HTTP helpers ---------- */

let ipCounter = 0;
async function signup(email, { ip } = {}) {
  const res = await fetch(`${ORIGIN}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip ?? `7.0.0.${++ipCounter}` },
    body: JSON.stringify({ email, displayName: email.split("@")[0], password: "supersecret" }),
  });
  return res.headers.get("set-cookie").split(";")[0];
}

function req(method, path, { cookie, body, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const json = (r) => r.json();

/* ---------- Reviews ---------- */

test("two accounts review the same recipe and the average is their mean", async () => {
  const ana = await signup("r-ana@x.com");
  const ben = await signup("r-ben@x.com");

  assert.equal((await req("POST", "/api/recipes/chicken-pasta/reviews", { cookie: ana, body: { rating: 5 } })).status, 200);
  const second = await req("POST", "/api/recipes/chicken-pasta/reviews", { cookie: ben, body: { rating: 3, comment: "fine" } });
  const { summary } = await json(second);

  assert.equal(summary.reviewCount, 2);
  assert.equal(summary.avgRating, 4); // (5 + 3) / 2
});

test("posting twice updates the one review rather than adding another", async () => {
  const cook = await signup("r-upsert@x.com");
  await req("POST", "/api/recipes/carrot-cake/reviews", { cookie: cook, body: { rating: 2 } });
  const again = await req("POST", "/api/recipes/carrot-cake/reviews", { cookie: cook, body: { rating: 5, comment: "changed my mind" } });

  const { summary } = await json(again);
  assert.equal(summary.reviewCount, 1, "still one review");
  assert.equal(summary.avgRating, 5, "updated to the new rating");
});

test("you cannot review your own recipe and cannot review signed out", async () => {
  // Make an admin-published recipe owned by a user, then have that user try.
  const owner = await signup("r-owner@x.com");
  const me = await json(await fetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: owner } }));
  const db = createClient({ url: DB_URL });
  await db.execute({
    sql: `INSERT INTO recipes (slug,title,category,description,image_url,time_minutes,servings,difficulty,status,author_id,featured)
          VALUES ('mine','Mine','Pasta','d','a.jpg',10,2,'Easy','published',?,0)`,
    args: [me.id],
  });
  db.close();

  assert.equal((await req("POST", "/api/recipes/mine/reviews", { cookie: owner, body: { rating: 5 } })).status, 403);
  assert.equal((await req("POST", "/api/recipes/chicken-pasta/reviews", { body: { rating: 5 } })).status, 401);
});

test("only the owner or an admin can delete a review", async () => {
  const ana = await signup("d-ana@x.com");
  const ben = await signup("d-ben@x.com");
  const admin = await signup(ADMIN_EMAIL);

  await req("POST", "/api/recipes/wagyu-ribeye/reviews", { cookie: ana, body: { rating: 4 } });
  const list = await json(await fetch(`${ORIGIN}/api/recipes/wagyu-ribeye/reviews`));
  const id = list.reviews[0].id;

  assert.equal((await req("DELETE", `/api/recipes/wagyu-ribeye/reviews?id=${id}`, { cookie: ben })).status, 403);
  assert.equal((await req("DELETE", `/api/recipes/wagyu-ribeye/reviews?id=${id}`, { cookie: admin })).status, 200);

  const after = await json(await fetch(`${ORIGIN}/api/recipes/wagyu-ribeye/reviews`));
  assert.equal(after.summary.reviewCount, 0);
});

test("a rating outside 1–5 is rejected with 422", async () => {
  const cook = await signup("r-bad@x.com");
  assert.equal((await req("POST", "/api/recipes/rosemary-chicken/reviews", { cookie: cook, body: { rating: 9 } })).status, 422);
});

test("an 11th review in an hour is rate-limited", async () => {
  const cook = await signup("r-spam@x.com");
  const slugs = ["chicken-pasta", "beef-bourguignon", "carrot-cake", "rosemary-chicken",
    "wagyu-ribeye", "vegetable-tartine"];
  // 10 allowed within the window (posting across recipes; the limit is per user).
  for (let i = 0; i < 10; i++) {
    const slug = slugs[i % slugs.length];
    const res = await req("POST", `/api/recipes/${slug}/reviews`, { cookie: cook, body: { rating: 3 } });
    assert.ok(res.status === 200, `attempt ${i + 1} should pass`);
  }
  const blocked = await req("POST", "/api/recipes/chicken-pasta/reviews", { cookie: cook, body: { rating: 3 } });
  assert.equal(blocked.status, 429);
});

/* ---------- Saved ---------- */

test("save, check, list and unsave a recipe", async () => {
  const cook = await signup("s-user@x.com");

  assert.equal((await req("POST", "/api/saved", { cookie: cook, body: { slug: "beef-bourguignon" } })).status, 200);
  assert.equal((await json(await req("GET", "/api/saved?slug=beef-bourguignon", { cookie: cook }))).saved, true);

  const list = await json(await req("GET", "/api/saved", { cookie: cook }));
  assert.equal(list.recipes.length, 1);
  assert.equal(list.recipes[0].slug, "beef-bourguignon");

  await req("DELETE", "/api/saved/beef-bourguignon", { cookie: cook });
  assert.equal((await json(await req("GET", "/api/saved?slug=beef-bourguignon", { cookie: cook }))).saved, false);
});

test("saving is idempotent and saved recipes require login", async () => {
  const cook = await signup("s-idem@x.com");
  await req("POST", "/api/saved", { cookie: cook, body: { slug: "carrot-cake" } });
  await req("POST", "/api/saved", { cookie: cook, body: { slug: "carrot-cake" } });
  const list = await json(await req("GET", "/api/saved", { cookie: cook }));
  assert.equal(list.recipes.filter((r) => r.slug === "carrot-cake").length, 1);

  assert.equal((await req("GET", "/api/saved")).status, 401);
});

/* ---------- Frontend (jsdom) ---------- */

async function openPage(file, { cookie }) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: `${ORIGIN}/${file}`, pretendToBeVisual: true });

  const nativeFetch = globalThis.fetch;
  let jar = cookie ?? "";
  dom.window.fetch = async (input, init = {}) => {
    const href = typeof input === "string" ? input : input.href;
    const headers = { ...(init.headers || {}), Origin: ORIGIN, "X-Forwarded-For": "7.9.9.9" };
    if (jar) headers.Cookie = jar;
    const response = await nativeFetch(new URL(href, ORIGIN), { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) jar = setCookie.split(";")[0];
    return response;
  };
  dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

  for (const [k, v] of Object.entries({
    window: dom.window, document: dom.window.document, location: dom.window.location,
    navigator: dom.window.navigator, fetch: dom.window.fetch, Event: dom.window.Event,
    FormData: dom.window.FormData, IntersectionObserver: dom.window.IntersectionObserver,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    confirm: () => true, alert: () => {},
  })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  const src = html.match(/<script type="module" src="([^"]+)"/)[1];
  await import(`../${src}?t=${Math.random()}`);
  await new Promise((r) => setTimeout(r, 700));
  return dom.window.document;
}

test("recipe page: Save button toggles and persists, review form posts", async () => {
  const cook = await signup("ui-user@x.com");

  // A recipe no other test touches, so the review count is deterministic.
  const db = createClient({ url: DB_URL });
  await db.execute(`INSERT INTO recipes (slug,title,category,description,image_url,time_minutes,servings,difficulty,status,featured)
    VALUES ('ui-fresh','UI Fresh','Pasta','A test recipe','a.jpg',20,2,'Easy','published',0)`);
  await db.execute("INSERT INTO ingredients (recipe_id,position,emoji,name,qty,unit) SELECT id,0,'🍝','Pasta',100,'g' FROM recipes WHERE slug='ui-fresh'");
  await db.execute("INSERT INTO steps (recipe_id,position,text) SELECT id,0,'Cook it.' FROM recipes WHERE slug='ui-fresh'");
  db.close();

  const doc = await openPage("recipe.html?slug=ui-fresh", { cookie: cook });

  // Save button present and starts un-saved.
  const save = doc.querySelector("[data-save]");
  assert.ok(save, "a Save button is rendered");
  assert.equal(save.getAttribute("aria-pressed"), "false");

  save.click();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(save.getAttribute("aria-pressed"), "true", "button shows Saved");

  const saved = await json(await fetch(`${ORIGIN}/api/saved?slug=ui-fresh`, { headers: { Cookie: cook } }));
  assert.equal(saved.saved, true, "it persisted on the server");

  // Post a review through the widget.
  const form = doc.getElementById("review-form");
  assert.ok(form, "the review form is shown to a logged-in non-author");
  doc.getElementById("star4").checked = true;
  doc.getElementById("comment").value = "Lovely and simple";
  form.dispatchEvent(new doc.defaultView.Event("submit", { cancelable: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));

  assert.match(doc.querySelector(".review-comment")?.textContent ?? "", /Lovely and simple/);
  assert.match(doc.getElementById("reviews-summary").textContent, /1 review/);
});

test("saved page lists a saved recipe", async () => {
  const cook = await signup("ui-saved@x.com");
  await req("POST", "/api/saved", { cookie: cook, body: { slug: "vegetable-tartine" } });

  const doc = await openPage("saved.html", { cookie: cook });
  const cards = doc.querySelectorAll("#saved-grid .saved-card");
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /Roasted Vegetable Tartine/);
});
