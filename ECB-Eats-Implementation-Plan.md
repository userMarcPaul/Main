# ECB Eats — Full-Stack Implementation Plan

Oct 8, 2026 · Marc Paul

## Overview

ECB Eats moves from a static GitHub Pages mockup to a full-stack recipe app on Vercel with a Turso (SQLite) database, in 8 phases over about 25 working days (roughly 6 weeks full-time).

Today the site looks polished but most of it is placeholder: every recipe card opens the same Chicken Pasta page, search always shows the same 3 results, category counts are invented, and the ratings and follower numbers are fake. The finished version will have real recipe pages, real search, and four writable features: user accounts, reviews and ratings, saved recipes, and recipe submissions with admin approval.

Guiding principles:

- **Everything a visitor clicks works.** No `href="#"`, no fake numbers. Unbuilt features are hidden, not faked.
- **Ship in working slices.** Each phase ends with a deployed, working site, so the project is always presentable.
- **Keep the frontend vanilla HTML/CSS/JS for now.** The existing design is good; the upgrade is the data and backend. A React rewrite can come later as a separate milestone.
- **Security is part of the feature, not a later pass.** Every write endpoint ships with validation, auth checks and rate limiting.

## Tech stack and architecture

The browser loads static HTML pages from Vercel, which call JSON API routes (Vercel serverless functions in Node.js), which read and write a Turso database.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Existing HTML/CSS + vanilla JS modules | Keeps your current design; shows real DOM and fetch skills |
| Backend | Vercel serverless functions in `/api` | No server to manage; deploys with the frontend |
| Database | Turso (libSQL, SQLite-compatible) | Same SQL as SQLite, but persistent on serverless |
| DB client | `@libsql/client` | Connects to a local file in dev and Turso in production |
| Validation | `zod` | One schema per request body; rejects bad input early |
| Passwords | `bcryptjs` | Salted password hashing that runs on serverless |
| Image uploads | Vercel Blob | Serverless functions cannot store files on disk |
| Hosting | Vercel, connected to GitHub | Auto-deploy on push, preview URL per pull request |

Folder structure:

```
ecb-eats/
  index.html  recipe.html  results.html  saved.html
  login.html  signup.html  submit.html  admin.html
  assets/  css/  js/  img/
  api/
    recipes/index.js          GET list + search, POST submission
    recipes/[slug].js         GET one recipe
    recipes/[slug]/reviews.js GET + POST reviews
    auth/signup.js  login.js  logout.js  me.js
    saved/index.js            GET, POST, DELETE saved recipes
    admin/submissions.js      GET pending, PATCH approve/reject
    upload.js                 image upload to Vercel Blob
  lib/
    db.js  auth.js  validate.js  rateLimit.js  http.js
  db/
    schema.sql  seed.js
  package.json  vercel.json  .env.local (gitignored)  README.md
```

Environment variables (set in `.env.local` for development and in Vercel project settings for production):

| Variable | Local value | Production value |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | `file:local.db` | `libsql://<your-db>.turso.io` |
| `TURSO_AUTH_TOKEN` | empty | Token from the Turso dashboard |
| `BLOB_READ_WRITE_TOKEN` | From Vercel Blob | Set automatically when Blob is linked |
| `ADMIN_EMAIL` | Your email | Your email |

Run everything locally with `vercel dev`, which serves the HTML and the `/api` functions together on one port.

## Phase 1: Repo cleanup and quick fixes

Half a day. Fixes every problem found in the code review that does not need a backend, so the site is honest before it gets bigger.

Repository:

- [ ] Rename the repo from `Main` to `ecb-eats` (GitHub redirects the old URL) — **needs the GitHub UI**
- [ ] Add a repo description, the live site link and topics (`javascript`, `vercel`, `sqlite`, `turso`, `recipes`) — **needs the GitHub UI**
- [x] Add a `.gitignore` entry for `.env.local`, `local.db` and `node_modules/`
- [x] Create a first README with a screenshot and the live link (expanded in Phase 8)

Broken links and fake content:

- [x] Remove the fake rating ("4.7 (128 reviews)") and author stats ("4.4M followers"); real reviews replace them in Phase 5
- [x] Rename "My RecipeTin" to "Saved Recipes" so it does not borrow the RecipeTin Eats brand
- [x] Hide the social icons, "Iconic Dishes" and "View All" links until they go somewhere real
- [x] Make category tiles links (to `results.html?category=pasta` in Phase 3) and drop the invented counts
- [x] Move the PocketDEVS link out of the recipe nav (removed here; adding it to the portfolio is a separate repo) and into your portfolio instead

Content and naming:

- [x] Rename all images to lowercase kebab-case (`chicken-pasta.jpg`, `beef-bourguignon.jpg`); fix the `maet_R.jpg` typo
- [x] Give Carrot Cake its own image instead of `Veggies.jpg`
- [x] Add paprika and olive oil to the Chicken Pasta ingredients (step 1 uses them)
- [x] Use "ECB Eats" in every page title, and point every About link to the same place
- [x] Rename `result.html` to `results.html` and make the footer year automatic with JS

Done when: no link on the site points to `#`, and no number on the site is invented.

## Phase 2: Database, seed data and read API

3–4 days. Creates the whole schema up front, including the tables the writable phases need, so you only design it once.

Setup:

- [x] ~~Install the Vercel CLI and Turso CLI~~; run `npm init -y` and `npm i @libsql/client` (`zod`, `bcryptjs` and `@vercel/blob` are installed when Phases 4 and 6 first need them)
- [ ] Create the Turso database (`turso db create ecb-eats`) and an auth token — **not done: needs a Turso account.** Development runs against `file:local.db`, which the same client supports
- [x] Write `lib/db.js`, the single place that creates the database client

```js
// lib/db.js
import { createClient } from "@libsql/client";
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

Schema (`db/schema.sql`):

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  time_minutes INTEGER NOT NULL,
  servings INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  author_id INTEGER REFERENCES users(id),
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  emoji TEXT, name TEXT NOT NULL, qty REAL, unit TEXT
);

CREATE TABLE steps (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (recipe_id, user_id)
);

CREATE TABLE saved_recipes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE INDEX idx_recipes_status_category ON recipes(status, category);
CREATE INDEX idx_reviews_recipe ON reviews(recipe_id);
```

Seed and read API:

- [x] Write `db/seed.js` that inserts your 6 recipes as `published`, with full ingredients and steps for every one (not just Chicken Pasta)
- [x] `GET /api/recipes` returns published recipes; supports `?q=`, `?category=`, `?featured=1` and `?limit=`
- [x] `GET /api/recipes/[slug]` returns one recipe with ingredients, steps, average rating and review count; 404 if missing or not published
- [x] Use parameterized queries everywhere, never string-built SQL

```js
// search: parameters, not string concatenation
const { rows } = await db.execute({
  sql: `SELECT slug, title, category, image_url, time_minutes, difficulty
        FROM recipes
        WHERE status = 'published'
          AND (title LIKE ? OR description LIKE ?)
        ORDER BY created_at DESC LIMIT ?`,
  args: [`%${q}%`, `%${q}%`, limit],
});
```

Done when: `curl /api/recipes?q=chicken` returns real JSON from Turso on the deployed site.

## Phase 3: Data-driven frontend

3–4 days. Every page renders from the API, so each card opens its own recipe and search actually searches.

Shared code:

- [x] Split `app.js` into ES modules: `api.js` (fetch helpers), `render.js` (card and recipe templates), and one small file per page
- [x] Escape all user-facing text when building HTML (use `textContent`, or one `escapeHtml()` helper) so submitted recipes cannot inject scripts
- [x] Add loading skeletons, an empty state ("No recipes match") and an error state with a retry button

Pages:

- [x] **Home:** featured from `?featured=1`, latest from `?limit=6`, category tiles with real counts (counts come from a new `GET /api/categories`)
- [x] **Recipe** (`recipe.html?slug=beef-bourguignon`): read the slug from the URL, fetch, render; show a friendly 404 if it does not exist; set `document.title` per recipe
- [x] **Results:** the header search submits to `results.html?q=pasta`; tiles go to `results.html?category=pasta`; show the real count ("4 results for pasta")
- [x] Debounce live search in the header (300 ms) with a small dropdown of top 5 matches

Recipe page tools:

- [x] **Servings scaler:** +/− buttons recalculate every ingredient quantity (`qty × newServings ÷ baseServings`), rounded sensibly
- [x] **Print:** a `@media print` stylesheet that hides nav, hero, footer and buttons
- [x] **Share:** `navigator.share()` on phones, copy-link with a "Link copied" toast as the fallback
- [x] **Breadcrumb:** Home / Category / Recipe, with the category linking to its results page

```js
// recipe.js
const slug = new URLSearchParams(location.search).get("slug");
const res = await fetch(`/api/recipes/${encodeURIComponent(slug)}`);
if (res.status === 404) return showNotFound();
const recipe = await res.json();
renderRecipe(recipe);
```

Done when: all 6 recipe cards open their own correct recipe, and searching "beef" returns only beef recipes.

## Phase 4: User accounts and authentication

4–5 days. Email and password sign-up with server-side sessions in an HTTP-only cookie, which every later writable feature depends on.

How a session works:

1. On sign-up or login, the server creates a random 32-byte token with `crypto.randomBytes`.
2. It stores only the SHA-256 **hash** of the token in `sessions`, with a 30-day expiry.
3. It sends the raw token as a cookie: `session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
4. On each request, `lib/auth.js` hashes the cookie value, looks it up, and checks the expiry.
5. Logout deletes the row and clears the cookie.

Storing only the hash means a leaked database cannot be used to log in as anyone. `HttpOnly` means JavaScript, including any injected script, cannot read the cookie.

Endpoints:

- [x] `POST /api/auth/signup`: validate with zod (valid email, display name 2–40 chars, password 8+ chars), hash with `bcryptjs` (cost 10), create the user and session; 409 if the email exists
- [x] `POST /api/auth/login`: same generic error ("Invalid email or password") for unknown email and wrong password
- [x] `POST /api/auth/logout`: delete the session, clear the cookie
- [x] `GET /api/auth/me`: return `{ id, displayName, role }` or 401
- [x] `lib/auth.js` exports `getUser(req)`, `requireUser(req, res)` and `requireAdmin(req, res)`
- [x] The account whose email matches `ADMIN_EMAIL` gets `role = 'admin'` on sign-up

Protection:

- [x] Rate-limit login and sign-up: 5 attempts per IP per 15 minutes, stored in `rate_limits`
- [x] CSRF: `SameSite=Lax` cookies, plus write endpoints accept only `Content-Type: application/json` and reject requests whose `Origin` header is not your domain
- [x] Never return `password_hash` in any response; select only the columns you need

Frontend:

- [x] `login.html` and `signup.html` styled with your existing card design; inline field errors
- [x] Header calls `/api/auth/me` on load: shows "Log in" when signed out, or the display name with a menu (Saved Recipes, Submit a Recipe, Admin for admins, Log out) — **menu shows only Log out for now**; Saved Recipes / Submit / Admin are added in Phases 5–6 when those pages exist, to keep the "everything clickable works" rule
- [x] After login, return the user to the page they came from (`?next=` parameter, same-site paths only)

Done when: you can sign up, refresh, stay logged in, log out, and a wrong password 6 times in a row gets a 429.

## Phase 5: Reviews, ratings and saved recipes

3–4 days. Replaces the fake "4.7 (128 reviews)" with real ratings from real users, and makes Save Recipe work across devices.

Reviews and ratings:

- [x] `GET /api/recipes/[slug]/reviews?page=1`: newest first, 10 per page, with reviewer display name
- [x] `POST /api/recipes/[slug]/reviews` (logged in): rating 1–5 required, comment optional, max 1,000 characters
- [x] One review per user per recipe; posting again **updates** the existing one (`INSERT ... ON CONFLICT (recipe_id, user_id) DO UPDATE`)
- [x] `DELETE` on your own review; admins can delete any review
- [x] Users cannot review recipes they submitted themselves
- [x] Rate-limit to 10 review posts per user per hour
- [x] Recipe page shows the real average (one decimal) and count from `AVG(rating)` and `COUNT(*)`; shows "No reviews yet" at zero
- [x] Review form with clickable stars (keyboard accessible: radio inputs styled as stars); signed-out users see "Log in to review"

```sql
SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count
FROM reviews WHERE recipe_id = ?;
```

Saved recipes:

- [x] `GET /api/saved`, `POST /api/saved` with `{ slug }`, `DELETE /api/saved/[slug]` (all logged in)
- [x] Save button toggles between "Save Recipe" and "Saved" and updates instantly (optimistic UI), rolling back if the request fails
- [x] Signed-out users who click Save are sent to login with `?next=` back to the recipe
- [x] `saved.html` lists the user's saved recipes as cards, with an empty state that links to browse

Done when: two different accounts can review the same recipe, the average updates, and a saved recipe still appears after logging in on another browser.

## Phase 6: Recipe submissions and admin moderation

5–6 days. Logged-in users submit recipes with a photo; nothing goes public until an admin approves it.

Submission flow:

1. User fills in `submit.html`: title, category, description, time, servings, difficulty, ingredients, steps, photo.
2. The browser resizes the photo to max 1600 px wide and compresses it to WebP before upload.
3. `POST /api/upload` stores it in Vercel Blob and returns its URL.
4. `POST /api/recipes` saves the recipe as `pending`, with ingredients and steps, in one transaction.
5. An admin approves (status becomes `published`) or rejects with a reason (status becomes `rejected`).
6. The user sees the status on "My Submissions"; a rejected recipe can be edited and resubmitted, which sets it back to `pending`.

Backend:

- [x] Migration: `ALTER TABLE recipes ADD COLUMN rejection_reason TEXT;` (keep migrations as numbered files in `db/migrations/`) — plus `db/migrate.js`, an idempotent runner (`npm run migrate`)
- [x] `POST /api/upload` (logged in): accept only JPEG, PNG and WebP, check the file's actual type not just its name, max 2 MB, rate limit 20 uploads per user per day — stores to disk via a storage adapter (`lib/storage.js`); the Vercel Blob swap lives there
- [x] `POST /api/recipes` (logged in): zod validation (title 3–80 chars, 2–40 ingredients, 1–30 steps, time 1–1,440 min, servings 1–50); generate a unique slug from the title (`chicken-adobo`, then `chicken-adobo-2`)
- [x] Write the recipe, ingredients and steps with `db.batch([...], "write")` so a failure leaves nothing half-saved
- [x] Rate-limit to 5 submissions per user per day
- [x] `GET /api/admin/submissions?status=pending` and `PATCH /api/admin/submissions` with `{ id, action: "approve" | "reject", reason }`, both behind `requireAdmin`
- [x] `GET /api/recipes?mine=1` lists the current user's own recipes in every status

Frontend:

- [x] `submit.html`: dynamic ingredient and step rows (add, remove, reorder), photo preview, client-side validation that mirrors the server rules, and a draft auto-saved to `localStorage` so a refresh does not lose work — add/remove rows (no drag-reorder)
- [x] "My Submissions" list with status badges: Pending, Published, Rejected (with the reason)
- [x] `admin.html`: queue of pending recipes, a full preview using the real recipe template, Approve and Reject buttons, and a reason box for rejections
- [x] Published user recipes show "Submitted by {display name}" in place of the old fake author bar

Done when: a normal account submits a recipe with a photo, it is invisible to the public, the admin approves it, and it then appears in search and its category.

## Phase 7: Security, accessibility, performance and SEO

3 days. A final pass that turns a working app into one you can confidently show a reviewer.

Security review:

- [ ] Try to break your own app: submit `<script>alert(1)</script>` as a title and comment, and confirm it shows as text
- [ ] Call every write endpoint while logged out and as a normal user; expect 401 and 403
- [ ] Try to edit or delete another user's review or recipe by changing IDs in the request; expect 403
- [ ] Add security headers in `vercel.json`: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
- [ ] Errors return `{ error: "message" }` with a correct status code and never leak stack traces or SQL
- [ ] Delete expired sessions and old `rate_limits` rows with a daily Vercel Cron job

Accessibility:

- [ ] Label the search input, add `aria-expanded` to the mobile menu toggle, fix heading order (author bar and footer use `h4` directly under `h2`)
- [ ] Every form field has a visible label and errors linked with `aria-describedby`
- [ ] Full keyboard pass: tab through every page, star rating and admin action; visible focus outlines
- [ ] Text contrast at least 4.5:1, especially the coral on white

Performance:

- [ ] `loading="lazy"` plus `width` and `height` on all images below the fold; WebP for the seeded images
- [ ] Load only the Inter weights you use (likely 400, 600, 700) instead of five
- [ ] Replace the full Font Awesome stylesheet with inline SVG icons for the ~15 you use
- [ ] Cache headers on `GET /api/recipes` (`s-maxage=60, stale-while-revalidate`) so popular pages do not hit the database every time

SEO and sharing:

- [ ] Open Graph and Twitter tags on every page, so links shared on LinkedIn show an image and title
- [ ] JSON-LD `Recipe` structured data on recipe pages, built from the API data
- [ ] `sitemap.xml` and `robots.txt`

Done when: Lighthouse scores 90+ in Performance, Accessibility, Best Practices and SEO on the home and recipe pages, on mobile.

## Phase 8: Deployment workflow and portfolio packaging

Set up deployment in Phase 2 and keep it running; the packaging work is the last 1–2 days.

Deployment workflow (from Phase 2 onward):

- [ ] Import the GitHub repo into Vercel; every push to `main` deploys to production
- [ ] Work on feature branches (`feat/reviews`, `feat/auth`) and open a pull request for each; Vercel posts a preview URL on every PR
- [ ] Use a separate Turso database for previews (`ecb-eats-dev`) so testing never touches real data; set it as the Preview environment variable in Vercel
- [ ] Keep `db/migrations/` numbered and run them against production by hand before merging the PR that needs them
- [ ] Optional: a GitHub Actions workflow that runs a few API tests (Vitest) on every PR

README:

- [ ] Live link and a demo account (e.g. `demo@ecbeats.app`, a normal user, not admin) so recruiters can try the writable features without signing up
- [ ] A screenshot or short GIF of search, reviewing and submitting
- [ ] Tech stack, the architecture in one paragraph, and the database schema
- [ ] Feature list, and how to run it locally (`vercel dev`, seed command, env vars)
- [ ] "Challenges and what I learned": e.g. why SQLite needed Turso on serverless, session security, transactions for submissions

Portfolio case study:

- [ ] Problem: a polished static mockup where most features were fake
- [ ] What you built: a full-stack app with auth, reviews, user submissions and moderation
- [ ] Before and after: Lighthouse scores, and a before/after screenshot of the recipe page
- [ ] Link both the live site and the repo; add the project link to your GitHub profile README's Portfolio badge, which currently points to `#`

Done when: someone with only your portfolio link can try the app, read the code, and understand what you built in under 2 minutes.

## Timeline and milestones

The 8 phases group into 4 releases totalling about 25 working days: roughly 6 weeks full-time, or 10–12 weeks alongside school or work.

| Release | Phases | When | What ships | Gate before moving on |
| --- | --- | --- | --- | --- |
| 1. Honest static site | Phase 1 | Day 1 | Fixed links and images, fake numbers removed | No `#` links, no fake data |
| 2. Live data | Phases 2–3 | Weeks 1–2 | Turso database, API, real recipe pages, search | All 6 recipes + search work live |
| 3. Writable app | Phases 4–6 | Weeks 2–5 | Accounts, reviews, saved recipes, submissions, admin moderation | Submit → approve → goes live |
| 4. Portfolio-ready | Phases 7–8 | Weeks 5–6 | Security, accessibility, speed, README, case study | Lighthouse 90+, demo account live |

Each gate is a check: do not start the next release until it passes on the live Vercel site.

If time runs short, cut in this order: the admin page's preview (approve from a list instead), live search suggestions, then image uploads (use a fixed placeholder per category). Keep accounts, reviews and moderation, because those are what make this a full-stack project.
