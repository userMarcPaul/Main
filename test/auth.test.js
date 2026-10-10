/**
 * Phase 4 tests. Backend flows run over HTTP against a dev server backed by a
 * throwaway database; the signup page runs in jsdom so the header's logged-in
 * state is exercised the way a browser would build it.
 *
 *   npm run test:auth
 *
 * Each logical test uses a distinct X-Forwarded-For value so its rate-limit
 * bucket is isolated and the suite is order-independent.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { JSDOM } from "jsdom";

const PORT = 3620;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DB_PATH = "test-auth.db";
const DB_URL = `file:${DB_PATH}`;
const ADMIN_EMAIL = "admin@ecbeats.app";
let server;

before(async () => {
  await rm(DB_PATH, { force: true });
  await rm(`${DB_PATH}-journal`, { force: true });

  const db = createClient({ url: DB_URL });
  await db.executeMultiple(await readFile("db/schema.sql", "utf8"));
  db.close();

  server = spawn(process.execPath, ["dev-server.js"], {
    env: { ...process.env, PORT: String(PORT), TURSO_DATABASE_URL: DB_URL, ADMIN_EMAIL },
    stdio: "ignore",
  });

  for (let i = 0; i < 50; i++) {
    try { await fetch(`${ORIGIN}/api/auth/me`); return; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("dev server did not start");
});

after(async () => {
  server?.kill();
  await rm(DB_PATH, { force: true });
  await rm(`${DB_PATH}-journal`, { force: true });
});

/** POST JSON with the headers a same-origin browser fetch would send. */
function post(path, body, { ip = "10.0.0.1", cookie, origin = ORIGIN, contentType = "application/json" } = {}) {
  const headers = { "X-Forwarded-For": ip };
  if (origin) headers.Origin = origin;
  if (contentType) headers["Content-Type"] = contentType;
  if (cookie) headers.Cookie = cookie;
  return fetch(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : null;
}

/* ---------- Signup ---------- */

test("signup creates an account, sets a session, and /me reflects it", async () => {
  const res = await post("/api/auth/signup",
    { email: "ana@example.com", displayName: "Ana", password: "supersecret" }, { ip: "10.1.0.1" });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.displayName, "Ana");
  assert.equal(body.role, "user");
  assert.ok(!("password_hash" in body) && !("passwordHash" in body));

  const cookie = cookieFrom(res);
  assert.ok(cookie?.startsWith("session="), "a session cookie is set");

  const me = await fetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { id: body.id, displayName: "Ana", role: "user" });
});

test("the session cookie is HttpOnly and SameSite=Lax", async () => {
  const res = await post("/api/auth/signup",
    { email: "cookie@example.com", displayName: "Cookie", password: "supersecret" }, { ip: "10.1.0.2" });
  const raw = res.headers.get("set-cookie").toLowerCase();
  assert.match(raw, /httponly/);
  assert.match(raw, /samesite=lax/);
});

test("a duplicate email is refused with 409", async () => {
  await post("/api/auth/signup",
    { email: "dup@example.com", displayName: "First", password: "supersecret" }, { ip: "10.1.0.3" });
  const res = await post("/api/auth/signup",
    { email: "dup@example.com", displayName: "Second", password: "supersecret" }, { ip: "10.1.0.4" });
  assert.equal(res.status, 409);
});

test("a short password is rejected with field errors", async () => {
  const res = await post("/api/auth/signup",
    { email: "weak@example.com", displayName: "Weak", password: "short" }, { ip: "10.1.0.5" });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.fieldErrors.password, "names the password field");
});

test("the account matching ADMIN_EMAIL becomes an admin", async () => {
  const res = await post("/api/auth/signup",
    { email: ADMIN_EMAIL, displayName: "Boss", password: "supersecret" }, { ip: "10.1.0.6" });
  assert.equal((await res.json()).role, "admin");
});

/* ---------- Login ---------- */

test("login with the right password returns a working session", async () => {
  await post("/api/auth/signup",
    { email: "li@example.com", displayName: "Li", password: "supersecret" }, { ip: "10.2.0.1" });
  const res = await post("/api/auth/login",
    { email: "li@example.com", password: "supersecret" }, { ip: "10.2.0.2" });
  assert.equal(res.status, 200);

  const me = await fetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: cookieFrom(res) } });
  assert.equal((await me.json()).displayName, "Li");
});

test("wrong password and unknown email give the same generic 401", async () => {
  await post("/api/auth/signup",
    { email: "gen@example.com", displayName: "Gen", password: "supersecret" }, { ip: "10.2.0.3" });

  const wrong = await post("/api/auth/login",
    { email: "gen@example.com", password: "nope" }, { ip: "10.2.0.4" });
  const unknown = await post("/api/auth/login",
    { email: "ghost@example.com", password: "nope" }, { ip: "10.2.0.5" });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

/* ---------- Logout ---------- */

test("logout invalidates the session", async () => {
  const signup = await post("/api/auth/signup",
    { email: "out@example.com", displayName: "Out", password: "supersecret" }, { ip: "10.3.0.1" });
  const cookie = cookieFrom(signup);

  const out = await post("/api/auth/logout", {}, { ip: "10.3.0.1", cookie });
  assert.equal(out.status, 200);

  const me = await fetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 401, "the old cookie no longer works");
});

/* ---------- Protection ---------- */

test("a cross-origin write is refused (CSRF)", async () => {
  const res = await post("/api/auth/login",
    { email: "ana@example.com", password: "supersecret" },
    { ip: "10.4.0.1", origin: "https://evil.example" });
  assert.equal(res.status, 403);
});

test("a non-JSON content type is refused", async () => {
  const res = await post("/api/auth/login",
    { email: "ana@example.com", password: "supersecret" },
    { ip: "10.4.0.2", contentType: "text/plain" });
  assert.equal(res.status, 415);
});

test("GET is not allowed on login", async () => {
  const res = await fetch(`${ORIGIN}/api/auth/login`);
  assert.equal(res.status, 405);
});

test("a sixth wrong login from one IP is rate-limited (429)", async () => {
  const attempt = () => post("/api/auth/login",
    { email: "ana@example.com", password: "wrong" }, { ip: "10.5.0.99" });

  for (let i = 0; i < 5; i++) {
    assert.equal((await attempt()).status, 401);
  }
  assert.equal((await attempt()).status, 429, "the sixth attempt trips the limit");
});

/* ---------- Frontend ---------- */

test("the signup page logs in and the header then shows the display name", async () => {
  const html = await readFile(new URL("../signup.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: `${ORIGIN}/signup.html`, pretendToBeVisual: true });

  const nativeFetch = globalThis.fetch;
  // Browser fetch to a relative/absolute same-origin URL; carry cookies in a jar
  // so the header's /api/auth/me call sees the session the form just created.
  let jar = "";
  dom.window.fetch = async (input, init = {}) => {
    const href = typeof input === "string" ? input : input.href;
    const url = new URL(href, ORIGIN);
    const headers = { ...(init.headers || {}), Origin: ORIGIN, "X-Forwarded-For": "10.6.0.1" };
    if (jar) headers.Cookie = jar;
    const response = await nativeFetch(url, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) jar = setCookie.split(";")[0];
    return response;
  };
  dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

  for (const [k, v] of Object.entries({
    window: dom.window, document: dom.window.document, location: dom.window.location,
    navigator: dom.window.navigator, fetch: dom.window.fetch,
    FormData: dom.window.FormData, Event: dom.window.Event,
    IntersectionObserver: dom.window.IntersectionObserver,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });

  await import(`../assets/js/pages/account.js?t=${Math.random()}`);
  await new Promise((r) => setTimeout(r, 400));

  const form = dom.window.document.getElementById("signup-form");
  form.elements.displayName.value = "Jess";
  form.elements.email.value = "jess@example.com";
  form.elements.password.value = "supersecret";
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true, bubbles: true }));

  // Wait for the async submit to complete (the session cookie lands in the jar)
  // rather than guessing at a fixed delay, so the test isn't timing-flaky.
  let me;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (!jar) continue;
    me = await nativeFetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: jar } });
    if (me.status === 200) break;
  }
  assert.ok(me && me.status === 200, "the signup actually created a session");
  assert.equal((await me.json()).displayName, "Jess");
});
