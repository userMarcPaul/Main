/**
 * Phase 7 tests: security headers, XSS escaping, authorization/IDOR, cache
 * headers, and the cron cleanup. Backend over HTTP against a throwaway seeded
 * database; the XSS render check runs in jsdom.
 *
 *   npm run test:hardening
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { JSDOM } from "jsdom";

const PORT = 3680;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DB_PATH = "test-hardening.db";
const DB_URL = `file:${DB_PATH}`;
const UPLOAD_DIR = "test-uploads-h";
const ADMIN_EMAIL = "boss@ecbeats.app";
const CRON_SECRET = "test-cron-secret";
let server;

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
    env: { ...process.env, PORT: String(PORT), TURSO_DATABASE_URL: DB_URL, ADMIN_EMAIL, UPLOAD_DIR, CRON_SECRET },
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

let ipn = 0;
async function signup(email) {
  const ip = `11.0.0.${++ipn}`;
  const res = await fetch(`${ORIGIN}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip },
    body: JSON.stringify({ email, displayName: email.split("@")[0], password: "supersecret" }),
  });
  if (res.status === 409) {
    const li = await fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": ip },
      body: JSON.stringify({ email, password: "supersecret" }),
    });
    return li.headers.get("set-cookie").split(";")[0];
  }
  return res.headers.get("set-cookie").split(";")[0];
}
const json = (r) => r.json();

/* ---------- Security headers ---------- */

test("every response carries the security headers", async () => {
  for (const path of ["/", "/index.html", "/api/recipes", "/api/categories"]) {
    const res = await fetch(`${ORIGIN}${path}`);
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/, `CSP on ${path}`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", `nosniff on ${path}`);
    assert.equal(res.headers.get("x-frame-options"), "DENY", `frame-options on ${path}`);
    assert.ok(res.headers.get("referrer-policy"), `referrer-policy on ${path}`);
    assert.ok(res.headers.get("permissions-policy"), `permissions-policy on ${path}`);
  }
});

test("the CSP keeps scripts same-origin only", async () => {
  const csp = (await fetch(`${ORIGIN}/`)).headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'/);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), "no unsafe-inline for scripts");
});

/* ---------- XSS ---------- */

test("a review with a <script> payload is stored and rendered as text, not run", async () => {
  const cook = await signup("xss@x.com");
  const payload = '<script>window.__pwned = true<\/script>';
  await fetch(`${ORIGIN}/api/recipes/chicken-pasta/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cook },
    body: JSON.stringify({ rating: 5, comment: payload }),
  });

  // The API returns the raw text (escaping is the view's job)...
  const api = await json(await fetch(`${ORIGIN}/api/recipes/chicken-pasta/reviews`));
  assert.equal(api.reviews.find((r) => r.comment)?.comment, payload);

  // ...and the recipe page renders it inert: text present, no <script> element.
  const html = await readFile(new URL("../recipe.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: `${ORIGIN}/recipe.html?slug=chicken-pasta`, pretendToBeVisual: true });
  const nativeFetch = globalThis.fetch;
  dom.window.fetch = (input, init) => nativeFetch(new URL(typeof input === "string" ? input : input.href, ORIGIN), init);
  dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  for (const [k, v] of Object.entries({
    window: dom.window, document: dom.window.document, location: dom.window.location,
    navigator: dom.window.navigator, fetch: dom.window.fetch,
    IntersectionObserver: dom.window.IntersectionObserver, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  await import(`../assets/js/pages/recipe.js?t=${Math.random()}`);
  await new Promise((r) => setTimeout(r, 700));

  const comment = dom.window.document.querySelector(".review-comment");
  assert.ok(comment, "the review rendered");
  assert.equal(comment.querySelector("script"), null, "no live <script> element injected");
  assert.match(comment.textContent, /window\.__pwned/, "shown as literal text");
  assert.equal(dom.window.__pwned, undefined, "payload did not execute");
});

/* ---------- Authorization / IDOR ---------- */

test("write endpoints reject the logged-out and the unauthorized", async () => {
  // Logged out → 401
  assert.equal((await fetch(`${ORIGIN}/api/saved`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: "{}" })).status, 401);
  assert.equal((await fetch(`${ORIGIN}/api/recipes/chicken-pasta/reviews`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ rating: 5 }) })).status, 401);

  // Normal user → 403 on admin
  const user = await signup("plain@x.com");
  assert.equal((await fetch(`${ORIGIN}/api/admin/submissions?status=pending`, { headers: { Cookie: user } })).status, 403);
});

test("a user cannot delete another user's review (IDOR → 403)", async () => {
  const ana = await signup("idor-ana@x.com");
  const ben = await signup("idor-ben@x.com");

  await fetch(`${ORIGIN}/api/recipes/carrot-cake/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ana },
    body: JSON.stringify({ rating: 4 }),
  });
  const list = await json(await fetch(`${ORIGIN}/api/recipes/carrot-cake/reviews`, { headers: { Cookie: ana } }));
  const id = list.viewer.myReview.id;

  // Ben tries to delete Ana's review by its id.
  const res = await fetch(`${ORIGIN}/api/recipes/carrot-cake/reviews?id=${id}`, {
    method: "DELETE", headers: { Origin: ORIGIN, Cookie: ben },
  });
  assert.equal(res.status, 403);
});

test("errors never leak a stack trace or SQL", async () => {
  // Force a 404 (unknown recipe) and a 401; bodies are plain { error }.
  const notFound = await fetch(`${ORIGIN}/api/recipes/nope-nope`);
  const body = await json(notFound);
  assert.equal(notFound.status, 404);
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.ok(!/SELECT|INSERT|at .*\.js:/.test(JSON.stringify(body)));
});

/* ---------- Caching ---------- */

test("public recipe listings are cacheable; a user's own list is not", async () => {
  const pub = await fetch(`${ORIGIN}/api/recipes?q=chicken`);
  assert.match(pub.headers.get("cache-control") ?? "", /max-age=60/);

  const cook = await signup("cache@x.com");
  const mine = await fetch(`${ORIGIN}/api/recipes?mine=1`, { headers: { Cookie: cook } });
  assert.match(mine.headers.get("cache-control") ?? "", /no-store/);
});

/* ---------- Cron cleanup ---------- */

test("the cron cleanup needs its secret and reports what it removed", async () => {
  assert.equal((await fetch(`${ORIGIN}/api/cron/cleanup`)).status, 401);
  assert.equal((await fetch(`${ORIGIN}/api/cron/cleanup`, { headers: { Authorization: "Bearer wrong" } })).status, 401);

  const ok = await fetch(`${ORIGIN}/api/cron/cleanup`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  assert.equal(ok.status, 200);
  const body = await json(ok);
  assert.equal(body.ok, true);
  assert.ok(typeof body.rateLimitsRemoved === "number");
});
