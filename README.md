# ECB Eats

A recipe site built with plain HTML, CSS and JavaScript — currently a static front end,
being built out into a full-stack app with a real database, user accounts, reviews and
user-submitted recipes.

**Live site:** _not deployed yet — a Vercel link goes here in Phase 2._

![ECB Eats home page](assets/img/chicken-pasta.jpg)

## What works today

Every page renders from the API — nothing on the site is hardcoded.

- **Home:** featured recipes, category tiles with real counts, and the six latest recipes
- **Recipe pages:** six real recipes, each at its own `recipe.html?slug=…`, with full
  ingredients and instructions, a servings scaler, print layout and share button
- **Search:** the header search goes to `results.html?q=…` and shows a live dropdown of
  the top five matches; category tiles go to `results.html?category=…`
- Loading skeletons, empty states and an error state with a working retry
- **Accounts:** sign up / log in / log out with an HTTP-only session cookie; the
  header shows your name once you are in, and `?next=` returns you where you were
- **Reviews & ratings:** star + comment per recipe (one each, editable); the recipe
  page shows the real average, or "No reviews yet" at zero — never a placeholder
- **Saved recipes:** a Save button that persists server-side, and a Saved Recipes
  page; both reachable from the signed-in menu
- Responsive layout, sticky navigation and scroll-in animations

Features that are not built yet are hidden rather than faked: ratings appear only once a
recipe has real reviews, every count comes from the database, and no link points to `#`.

## Coming next

The build is planned in 8 phases (see `ECB-Eats-Implementation-Plan.md`):

| Phase | What it adds |
| --- | --- |
| 1 ✅ | Repo cleanup, honest content, no dead links |
| 2 ✅ | SQLite schema, seed data, read API (Turso hosting still to set up) |
| 3 ✅ | Data-driven pages — every card opens its own recipe, real search |
| 4 ✅ | Email/password accounts with server-side sessions |
| 5 ✅ | Reviews & ratings, and save-a-recipe across devices |
| 4 | User accounts and sessions |
| 5 | Reviews, ratings and saved recipes |
| 6 | Recipe submissions with admin moderation |
| 7 | Security, accessibility, performance and SEO pass |
| 8 | Deployment workflow and portfolio packaging |

## Tech stack

- **Now:** HTML, CSS (custom design system, Bootstrap available), vanilla JavaScript
- **Planned:** Vercel serverless functions (Node.js), Turso / libSQL, `zod`, `bcryptjs`, Vercel Blob

## Running it locally

No database to provision — `@libsql/client` reads a local SQLite file, and only
deployment needs a Turso instance.

```bash
npm install
cp .env.local.example .env.local   # TURSO_DATABASE_URL=file:local.db
npm run seed                       # creates local.db and inserts the six recipes
npm run dev                        # http://localhost:3000
npm run test:all                   # all 34 tests across phases 3–5
```

Accounts are email + password. A session is a random token in an HttpOnly,
SameSite=Lax cookie; the database stores only its SHA-256 hash, so a leaked
database cannot be used to log in as anyone. Sign-up and login are rate-limited
(5 per IP per 15 minutes) and every write endpoint checks the request's `Origin`
against the site's own, as a CSRF defence. Set `ADMIN_EMAIL` so that account
becomes an admin on sign-up.

`npm run dev` runs `dev-server.js`, which maps the files under `api/` the same way
Vercel does, so the site runs without the Vercel CLI. `vercel dev` also works and is
what production mirrors.

## Project layout

```
index.html  recipe.html  results.html  profile.html
api/
  recipes/index.js     GET list + search
  recipes/[slug].js    GET one recipe
  categories.js        GET categories with real counts
  auth/                signup.js  login.js  logout.js  me.js
  recipes/[slug]/reviews.js   GET/POST/DELETE reviews
  saved/               index.js (GET/POST)  [slug].js (DELETE)
lib/
  db.js                the one place the database client is created
  http.js              JSON responses, cookies, same-origin + body parsing
  auth.js              sessions: create, read (getUser), requireUser/requireAdmin
  validate.js          zod schemas for request bodies
  rateLimit.js         fixed-window limiter backed by the rate_limits table
db/
  schema.sql           full schema, including the Phase 4–6 tables
  recipes.js           the six starter recipes
  seed.js              applies the schema and seeds (re-runnable)
assets/
  style.css            design system and page styles
  js/api.js            fetch helpers (reads + auth)
  js/render.js         templates, escapeHtml, loading/empty/error states
  js/app.js            shared chrome: nav, animations, header search, auth menu
  js/reviews.js        the recipe page's review widget
  js/home.js  recipe.js  results.js  about.js  account.js  saved.js   one per page
login.html  signup.html  saved.html            account + saved pages
  img/                 recipe photography and the logo
dev-server.js          local server that mirrors Vercel's api/ routing
test/smoke.test.js     Phase 3 API + page tests (node:test + jsdom)
test/auth.test.js      Phase 4 auth flow + protection tests
test/reviews.test.js   Phase 5 reviews + saved-recipe tests
```
