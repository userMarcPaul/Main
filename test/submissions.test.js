/**
 * Phase 6 tests: submissions, uploads and admin moderation. Backend flows run
 * over HTTP against a throwaway, seeded database with a scratch UPLOAD_DIR; the
 * submit and admin pages run in jsdom with a cookie jar.
 *
 *   npm run test:submissions
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { JSDOM } from "jsdom";

const PORT = 3660;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DB_PATH = "test-submissions.db";
const DB_URL = `file:${DB_PATH}`;
const UPLOAD_DIR = "test-uploads";
const ADMIN_EMAIL = "boss@ecbeats.app";
let server;

// A real 1x1 PNG, so the upload type-sniff accepts it.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
  "base64"
);

before(async () => {
  for (const f of [DB_PATH, `${DB_PATH}-journal`]) await rm(f, { force: true });
  await rm(UPLOAD_DIR, { recursive: true, force: true });

  const db = createClient({ url: DB_URL });
  await db.executeMultiple(await readFile("db/schema.sql", "utf8"));
  db.close();
  spawnSync(process.execPath, ["db/seed.js"], { env: { ...process.env, TURSO_DATABASE_URL: DB_URL }, stdio: "ignore" });

  server = spawn(process.execPath, ["dev-server.js"], {
    env: { ...process.env, PORT: String(PORT), TURSO_DATABASE_URL: DB_URL, ADMIN_EMAIL, UPLOAD_DIR },
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
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/* ---------- helpers ---------- */

let ipn = 0;
/** Sign up, or log in if the account already exists (e.g. the shared admin). */
async function signup(email) {
  const ip = `8.0.0.${++ipn}`;
  const res = await fetch(`${ORIGIN}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip },
    body: JSON.stringify({ email, displayName: email.split("@")[0], password: "supersecret" }),
  });
  if (res.status === 409) {
    const li = await fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip },
      body: JSON.stringify({ email, password: "supersecret" }),
    });
    return li.headers.get("set-cookie").split(";")[0];
  }
  return res.headers.get("set-cookie").split(";")[0];
}
const json = (r) => r.json();

function uploadPng(cookie) {
  return fetch(`${ORIGIN}/api/upload`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "image/png", Cookie: cookie },
    body: PNG_1x1,
  });
}

async function submit(cookie, overrides = {}) {
  const { url } = await json(await uploadPng(cookie));
  const body = {
    title: "Chicken Adobo", category: "Poultry", description: "A Filipino classic",
    timeMinutes: 60, servings: 4, difficulty: "Medium", imageUrl: url,
    ingredients: [{ emoji: "🍗", name: "Chicken", qty: 1, unit: "kg" }, { name: "Soy sauce", qty: 100, unit: "ml" }],
    steps: ["Marinate", "Simmer", "Serve"],
    ...overrides,
  };
  return fetch(`${ORIGIN}/api/recipes`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
}

/* ---------- Uploads ---------- */

test("upload needs login, rejects non-images, accepts a real PNG", async () => {
  assert.equal((await fetch(`${ORIGIN}/api/upload`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "image/png" }, body: PNG_1x1 })).status, 401);

  const cook = await signup("up@x.com");
  const text = await fetch(`${ORIGIN}/api/upload`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "image/png", Cookie: cook }, body: "this is not an image at all" });
  assert.equal(text.status, 422);

  const ok = await uploadPng(cook);
  assert.equal(ok.status, 201);
  assert.match((await json(ok)).url, /^\/uploads\/.+\.png$/);
});

/* ---------- Submit → moderate → publish (the Phase 6 gate) ---------- */

test("a submission is pending and invisible until an admin approves it", async () => {
  const cook = await signup("flow@x.com");
  const admin = await signup(ADMIN_EMAIL);

  const created = await submit(cook);
  assert.equal(created.status, 201);
  const { slug } = await json(created);

  // Invisible to the public.
  assert.equal((await json(await fetch(`${ORIGIN}/api/recipes?q=adobo`))).count, 0);
  assert.equal((await fetch(`${ORIGIN}/api/recipes/${slug}`)).status, 404);

  // The author sees it in every status via ?mine=1.
  const mine = await json(await fetch(`${ORIGIN}/api/recipes?mine=1`, { headers: { Cookie: cook } }));
  assert.equal(mine.recipes[0].status, "pending");

  // A normal user cannot reach the admin queue.
  assert.equal((await fetch(`${ORIGIN}/api/admin/submissions?status=pending`, { headers: { Cookie: cook } })).status, 403);

  // Admin approves.
  const queue = await json(await fetch(`${ORIGIN}/api/admin/submissions?status=pending`, { headers: { Cookie: admin } }));
  const id = queue.submissions.find((s) => s.slug === slug).id;
  const patch = await fetch(`${ORIGIN}/api/admin/submissions`, {
    method: "PATCH", headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ id, action: "approve" }),
  });
  assert.equal((await json(patch)).status, "published");

  // Now public, in its category, crediting the author.
  assert.equal((await json(await fetch(`${ORIGIN}/api/recipes?q=adobo`))).count, 1);
  const detail = await json(await fetch(`${ORIGIN}/api/recipes/${slug}`));
  assert.equal(detail.authorName, "flow");
  assert.equal(detail.ingredients.length, 2);
});

test("rejecting records a reason the author can see", async () => {
  const cook = await signup("rej@x.com");
  const admin = await signup(ADMIN_EMAIL);
  const { slug } = await json(await submit(cook, { title: "Mystery Mush" }));

  const queue = await json(await fetch(`${ORIGIN}/api/admin/submissions?status=pending`, { headers: { Cookie: admin } }));
  const id = queue.submissions.find((s) => s.slug === slug).id;
  await fetch(`${ORIGIN}/api/admin/submissions`, {
    method: "PATCH", headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ id, action: "reject", reason: "Needs clearer steps" }),
  });

  const mine = await json(await fetch(`${ORIGIN}/api/recipes?mine=1`, { headers: { Cookie: cook } }));
  const row = mine.recipes.find((r) => r.slug === slug);
  assert.equal(row.status, "rejected");
  assert.equal(row.rejectionReason, "Needs clearer steps");
});

test("two submissions with the same title get distinct slugs", async () => {
  const cook = await signup("slug@x.com");
  const a = await json(await submit(cook, { title: "Same Name Dish" }));
  const b = await json(await submit(cook, { title: "Same Name Dish" }));
  assert.equal(a.slug, "same-name-dish");
  assert.equal(b.slug, "same-name-dish-2");
});

test("an invalid submission is rejected with field errors", async () => {
  const cook = await signup("bad@x.com");
  const res = await submit(cook, { ingredients: [{ name: "Only one", qty: 1, unit: "g" }] });
  assert.equal(res.status, 422);
  assert.ok((await json(res)).fieldErrors.ingredients);
});

test("a 6th submission in a day is rate-limited", async () => {
  const cook = await signup("spam@x.com");
  for (let i = 0; i < 5; i++) {
    assert.equal((await submit(cook, { title: `Daily Dish ${i}` })).status, 201);
  }
  assert.equal((await submit(cook, { title: "One Too Many" })).status, 429);
});

/* ---------- Frontend (jsdom) ---------- */

async function openPage(file, { cookie }) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: `${ORIGIN}/${file}`, pretendToBeVisual: true });
  const nativeFetch = globalThis.fetch;
  let jar = cookie ?? "";
  dom.window.fetch = async (input, init = {}) => {
    const href = typeof input === "string" ? input : input.href;
    const headers = { ...(init.headers || {}), Origin: ORIGIN, "X-Forwarded-For": "8.9.9.9" };
    if (jar) headers.Cookie = jar;
    const r = await nativeFetch(new URL(href, ORIGIN), { ...init, headers });
    const sc = r.headers.get("set-cookie");
    if (sc) jar = sc.split(";")[0];
    return r;
  };
  dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  for (const [k, v] of Object.entries({
    window: dom.window, document: dom.window.document, location: dom.window.location,
    navigator: dom.window.navigator, fetch: dom.window.fetch, Event: dom.window.Event,
    FormData: dom.window.FormData, IntersectionObserver: dom.window.IntersectionObserver,
    requestAnimationFrame: (fn) => setTimeout(fn, 0), confirm: () => true, alert: () => {},
    localStorage: dom.window.localStorage,
  })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  const src = html.match(/<script type="module" src="([^"]+)"/)[1];
  await import(`../${src}?t=${Math.random()}`);
  await new Promise((r) => setTimeout(r, 600));
  return dom.window.document;
}

test("submit page renders the form and can add ingredient rows", async () => {
  const cook = await signup("ui-submit@x.com");
  const doc = await openPage("submit.html", { cookie: cook });

  assert.ok(doc.getElementById("submit-form"), "the form is rendered for a logged-in user");
  const before = doc.querySelectorAll("#ingredient-rows .dyn-row").length;
  assert.ok(before >= 2, "starts with at least two ingredient rows");

  doc.querySelector('[data-add="ingredient"]').click();
  assert.equal(doc.querySelectorAll("#ingredient-rows .dyn-row").length, before + 1);
});

test("admin page lists a pending submission and approves it", async () => {
  const cook = await signup("ui-admin-user@x.com");
  const admin = await signup(ADMIN_EMAIL);
  const { slug } = await json(await submit(cook, { title: "Admin UI Dish" }));

  const doc = await openPage("admin.html", { cookie: admin });
  const approve = [...doc.querySelectorAll("[data-approve]")]
    .find((b) => b.closest(".admin-card").textContent.includes("Admin UI Dish"));
  assert.ok(approve, "the pending submission shows with an Approve button");

  approve.click();
  await new Promise((r) => setTimeout(r, 500));

  // It is now public.
  assert.equal((await json(await fetch(`${ORIGIN}/api/recipes/${slug}`, { headers: {} }))).slug, slug);
});
