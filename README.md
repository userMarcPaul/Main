# ECB Eats

A full-stack recipe app with real accounts, reviews, saved recipes and user submissions — built with plain HTML, CSS and JavaScript on the frontend, and a Node.js server (the same `/api` handlers run locally and in production) backed by a Supabase (Postgres) database on the backend.

**Live site:** _not deployed yet_ — will be at `https://ecb-eats.onrender.com` once the repo is deployed on Render (see [Deployment](#deployment)).

**Demo account:** `demo@ecbeats.app` / `DemoPass123!`
Log in to try reviewing a recipe, saving favourites and submitting your own — all without signing up.

![ECB Eats home page](assets/img/chicken-pasta.webp)

---

## Features

Every feature below is real and backed by the database. If something isn't built yet, it's hidden — not faked.

| Feature | What it does |
|---------|-------------|
| **Recipe pages** | 6 seeded recipes, each with full ingredients and instructions, a servings scaler, print layout and share button |
| **Search** | Header search with a live dropdown (debounced, top 5 matches) and a results page; category tiles filter by type |
| **Accounts** | Email/password sign-up and log-in with HTTP-only session cookies; rate-limited at 5 attempts per IP per 15 min |
| **Reviews & ratings** | Star + comment per recipe (one per user, editable); the recipe page shows the real average or "No reviews yet" |
| **Saved recipes** | Optimistic-UI save button that persists server-side; a dedicated Saved Recipes page |
| **Submissions** | Logged-in users submit recipes with a photo (resized to WebP in the browser); nothing goes public until an admin approves it |
| **Admin moderation** | Admin queue with full preview, approve/reject with a reason the author sees on "My Submissions" |
| **SEO** | Open Graph + Twitter cards on every page, JSON-LD `Recipe` structured data, `sitemap.xml` and `robots.txt` |
| **Security** | CSP, `X-Content-Type-Options`, `X-Frame-Options`, CSRF via `SameSite` + origin check, XSS-safe rendering, daily session/rate-limit cleanup cron |
| **Accessibility** | Visible labels, `aria-describedby` errors, `:focus-visible` outlines, 4.5:1+ contrast, keyboard-navigable star rating |

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | HTML, CSS (custom design system), vanilla ES modules |
| Backend | Node.js HTTP server, file-based `/api` routing (runs on Render) |
| Database | Supabase (Postgres), via `@supabase/supabase-js` |
| Auth | `bcryptjs` hashing, `crypto.randomBytes` sessions, SHA-256 stored hashes |
| Validation | `zod` — one schema per request body |
| Aggregates & transactions | Postgres **views** (rating/category counts) and **RPC functions** (atomic submission, rate-limit) — PostgREST can't express these from the client |
| Image uploads | `lib/storage.js` — disk locally, Supabase Storage in production (switched by `SUPABASE_STORAGE_BUCKET`) |
| CI | GitHub Actions — runs all tests on every PR |

## Architecture

The backend follows a **handler → service → repository → db** layering:

- **`api/`** — thin HTTP handlers. Parse the request, call a service, send JSON. No SQL, no business rules.
- **`lib/services/`** — the rules: who may do what, validation, rate limits. They take a resolved `actor`, not a request, and throw domain errors (`lib/errors.js`) that the HTTP layer maps to status codes.
- **`lib/repositories/`** — the only place the database is touched. Uses the Supabase client with the **service-role key** (server-side only; the schema enables RLS with no policies, so the public key can read nothing and never reaches the browser). Aggregate reads come from Postgres views and atomic writes from RPC functions. Returns plain data through `lib/mappers.js`.

The frontend mirrors this separation: **`data/`** talks to the API, **`ui/`** is pure rendering, **`features/`** are self-contained widgets, and **`pages/`** are per-page controllers.

## Database schema

```
┌────────────┐       ┌──────────────┐       ┌───────────┐
│   users    │──────<│   sessions   │       │  recipes   │
│ id PK      │       │ token_hash PK│       │ id PK      │
│ email UQ   │       │ user_id FK   │       │ slug UQ    │
│ display_   │       │ expires_at   │       │ title      │
│   name     │       └──────────────┘       │ category   │
│ password_  │                              │ status     │
│   hash     │       ┌──────────────┐       │ author_id  │
│ role       │──────<│   reviews    │>──────│ featured   │
│ created_at │       │ id PK        │       │ ...        │
└────────────┘       │ recipe_id FK │       └─────┬──────┘
      │              │ user_id FK   │             │
      │              │ rating 1–5   │       ┌─────┴──────┐
      │              │ comment      │       │ingredients │
      │              │ UQ(recipe,   │       │ recipe_id  │
      │              │    user)     │       │ position   │
      │              └──────────────┘       │ name, qty  │
      │                                     └────────────┘
      │              ┌──────────────┐       ┌────────────┐
      └─────────────<│saved_recipes │>──────│   steps    │
                     │ user_id PK   │       │ recipe_id  │
                     │ recipe_id PK │       │ position   │
                     └──────────────┘       │ text       │
                                            └────────────┘
                     ┌──────────────┐
                     │ rate_limits  │
                     │ key PK       │
                     │ count        │
                     │ window_start │
                     └──────────────┘
```

Full DDL and the views/functions: [`db/supabase/`](db/supabase/) — `01_schema.sql`, `02_views.sql`, `03_functions.sql`, applied once in the Supabase SQL editor. (`db/schema.sql` is the earlier SQLite DDL, kept for reference.)

## Running it locally

The app uses Supabase (Postgres), so you need a Supabase project (the free tier
is fine) — there is no local file-database mode.

```bash
git clone https://github.com/MarcPaul/ecb-eats.git
cd ecb-eats
npm install
cp .env.local.example .env.local   # set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ADMIN_EMAIL
```

Create the Supabase project, then in its **SQL editor** run the three files in
order: `db/supabase/01_schema.sql`, `02_views.sql`, `03_functions.sql`
(`npm run migrate` just lists them). Then:

```bash
npm run seed       # insert the 6 published recipes
npm run seed:demo  # create the demo account (demo@ecbeats.app)
npm run dev        # http://localhost:3000
```

### Environment variables

| Variable | Local default | Production |
|----------|--------------|------------|
| `SUPABASE_URL` | `https://<project>.supabase.co` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server-side only) | same |
| `ADMIN_EMAIL` | Your email | Your email |
| `DEMO_PASSWORD` | `DemoPass123!` | _(set in Render)_ |
| `SITE_URL` | _(empty)_ | `https://ecb-eats.onrender.com` |
| `SUPABASE_STORAGE_BUCKET` | _(empty → disk)_ | Name of the public Supabase Storage bucket |

### Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the local dev server (same server that runs in production) |
| `npm run seed` | Apply schema + insert the 6 starter recipes |
| `npm run seed:demo` | Create the demo account with sample activity |
| `npm run migrate` | List the `db/supabase/*.sql` files to run in Supabase |
| `npm run sitemap` | Regenerate `sitemap.xml` and `robots.txt` |
| `npm run cleanup` | Purge expired sessions and stale rate-limit rows |
| `npm run test:all` | Run the test suite (see note under Tests) |

## Tests

The suite (`npm run test:all`) is 50 Node-test cases across smoke, auth, reviews,
submissions and hardening. They were written against a throwaway **SQLite**
database (each file spun up its own `file:` DB), which predates the move to
Supabase, so they're **skipped by default** rather than run against the wrong
backend — `npm run test:all` reports them as skipped, not failed.

Re-pointing them at a dedicated Supabase **test** project (resetting state
between runs) is the outstanding follow-up to this database switch. The
database-side logic the switch introduced — the schema, the `recipe_cards` /
`category_counts` views and the `create_submission` / `rl_touch` / `rl_purge`
functions — was verified on a real Postgres 16 before shipping.

## Deployment

The site deploys to **Render** from the `render.yaml` blueprint, with every push to `main`. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full beginner-friendly walkthrough.

1. Create the Supabase project and run `db/supabase/*.sql` in its SQL editor, then create a public **Storage bucket** for uploaded photos
2. Seed the database from your laptop (`npm run seed`, `npm run seed:demo`)
3. Push to GitHub, then create a Render **Blueprint** from the repo — it reads `render.yaml` and provisions the web service and the daily cleanup cron
4. Set the secret env vars in the Render dashboard (below); every push to `main` auto-deploys
5. GitHub Actions runs the test suite on every PR

### Render environment variables

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `DEMO_PASSWORD` and `SITE_URL` in the Render dashboard (they're marked `sync: false` in `render.yaml` so they're never committed). `SUPABASE_STORAGE_BUCKET` is set in `render.yaml` to the name of a **public** Supabase Storage bucket, so uploads go there instead of the server's ephemeral disk. The daily cleanup cron is declared in `render.yaml` and runs `db/cleanup.js` directly.

## Project layout

```
index.html  recipe.html  results.html  profile.html
login.html  signup.html  saved.html  submit.html  admin.html

api/                            HTTP handlers (thin)
  recipes/index.js  [slug].js  [slug]/reviews.js
  categories.js
  auth/   signup.js  login.js  logout.js  me.js
  saved/  index.js  [slug].js
  admin/  submissions.js       GET queue + PATCH approve/reject
  upload.js                    recipe photo upload
  cron/   cleanup.js           daily session/rate-limit purge

lib/
  services/     recipes.js  reviews.js  saved.js  accounts.js  admin.js  uploads.js
  repositories/ recipes.js  reviews.js  saved.js  users.js  sessions.js
  mappers.js    row → API shape
  errors.js     AppError + factories (notFound, forbidden, …)
  storage.js    image storage adapter (disk → Supabase Storage)
  db.js         Supabase client (service-role) + unwrap() helper
  http.js       JSON responses, cookies, origin check, body parsing
  auth.js       session adapter: getActor, createSessionFor, cookies
  validate.js   zod schemas
  rateLimit.js  fixed-window limiter

db/
  supabase/     01_schema.sql · 02_views.sql · 03_functions.sql  (run in Supabase)
  recipes.js    the 6 starter recipes
  seed.js       insert the starter recipes (idempotent)
  seed-demo.js  create the demo account
  schema.sql    earlier SQLite DDL, kept for reference

assets/
  style.css     design system and page styles
  js/data/      api.js (fetch client)
  js/ui/        render.js (templates, escaping), chrome.js (nav, search, auth menu)
  js/features/  reviews.js (review widget)
  js/pages/     home.js  recipe.js  results.js  about.js  account.js
                saved.js  submit.js  admin.js
  img/          recipe photography and logo

test/           smoke · auth · reviews · submissions · hardening (see Tests)

.github/workflows/ci.yml   runs tests on every PR
```

## Challenges and what I learned

**Managed Postgres, via Supabase.**
A hosted server's filesystem is ephemeral (reset on each deploy), so a local database file would lose writes. Supabase provides managed Postgres reachable over HTTPS, the same from local dev and production. All access goes through the service-role key on the server; the schema turns on row-level security with no policies, so the public key can read nothing and is never shipped to the browser.

**Session security.**
Storing the raw session token in the database would mean a leaked database dump lets an attacker log in as anyone. Instead, only the SHA-256 hash of each token is stored; the raw token lives only in the user's HTTP-only cookie. The cookie's `SameSite=Lax` flag and an `Origin` header check on write endpoints together provide CSRF protection without a separate token.

**What the Supabase client can't do — and the fix.**
The Supabase JS client talks to PostgREST, which can't run a multi-statement transaction or an arbitrary `AVG`/`GROUP BY` from the client. A recipe submission must insert the recipe, its ingredients and its steps atomically, so that became a Postgres function (`create_submission`) called via `rpc()`. The rating averages and category counts became Postgres **views** the client selects from. Pushing that logic into the database keeps each write atomic and each read a single round trip.

**Layered architecture on a static-file frontend.**
Without a framework, it's tempting to put fetch calls, DOM manipulation and business logic in the same file. Splitting into `data/` → `ui/` → `features/` → `pages/` kept each module small and testable, and made adding reviews and submissions much less error-prone because the rendering and data layers were already separate.

---

Built by **Marc Paul** · [GitHub](https://github.com/MarcPaul)
