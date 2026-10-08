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

The backend is layered so each file has one job, and dependencies point inward
(**handler → service → repository → db**):

- **`api/`** — thin HTTP handlers. Parse the request, call a service, send JSON.
  No SQL and no business rules live here.
- **`lib/services/`** — the rules: who may do what, validation, rate limits.
  They take a resolved `actor`, not a request, and throw domain errors
  (`lib/errors.js`) that the HTTP layer turns into status codes. No SQL, no `req`/`res`.
- **`lib/repositories/`** — the only place SQL lives. Returns plain data via
  `lib/mappers.js`.

The frontend mirrors this: **`data/`** talks to the API, **`ui/`** is pure
rendering, **`features/`** are widgets, and **`pages/`** are per-page controllers.

```
index.html recipe.html results.html profile.html login.html signup.html saved.html
api/                         HTTP handlers (thin)
  recipes/index.js  [slug].js  [slug]/reviews.js
  categories.js
  auth/   signup.js login.js logout.js me.js
  saved/  index.js  [slug].js
lib/
  services/     recipes.js reviews.js saved.js accounts.js   business rules
  repositories/ recipes.js reviews.js saved.js users.js sessions.js   all SQL
  mappers.js    row -> API shape, in one place
  errors.js     AppError + factories (notFound, forbidden, ...)
  db.js         the one place the database client is created
  http.js       JSON responses, cookies, same-origin, body parsing, AppError mapping
  auth.js       session adapter: getActor(req), createSessionFor, cookies
  validate.js   zod schemas for request bodies
  rateLimit.js  fixed-window limiter backed by the rate_limits table
db/
  schema.sql    full schema, including the later-phase tables
  recipes.js    the six starter recipes
  seed.js       applies the schema and seeds (re-runnable)
assets/
  style.css     design system and page styles
  js/data/      api.js        fetch client (reads, auth, reviews, saved)
  js/ui/        render.js     templates, escapeHtml, loading/empty/error states
                chrome.js     shared chrome: nav, animations, search, auth menu
  js/features/  reviews.js    the recipe page's review widget
  js/pages/     home.js recipe.js results.js about.js account.js saved.js
  img/          recipe photography and the logo
dev-server.js   local server that mirrors Vercel's api/ routing
test/           smoke.test.js (pages) · auth.test.js · reviews.test.js
```
