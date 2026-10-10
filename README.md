# ECB Eats

A full-stack recipe app with real accounts, reviews, saved recipes and user submissions — built with plain HTML, CSS and JavaScript on the frontend, and Vercel serverless functions backed by a Turso (SQLite) database on the backend.

**Live site:** _not deployed yet_ — will be at `https://ecb-eats.vercel.app` once the repo is imported into Vercel (see [Deployment](#deployment)).

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
| Backend | Vercel serverless functions (Node.js), file-based routing |
| Database | Turso (libSQL / SQLite-compatible) |
| Auth | `bcryptjs` hashing, `crypto.randomBytes` sessions, SHA-256 stored hashes |
| Validation | `zod` — one schema per request body |
| Image uploads | `lib/storage.js` — disk locally, Vercel Blob in production (switched by `BLOB_READ_WRITE_TOKEN`) |
| CI | GitHub Actions — runs all tests on every PR |

## Architecture

The backend follows a **handler → service → repository → db** layering:

- **`api/`** — thin HTTP handlers. Parse the request, call a service, send JSON. No SQL, no business rules.
- **`lib/services/`** — the rules: who may do what, validation, rate limits. They take a resolved `actor`, not a request, and throw domain errors (`lib/errors.js`) that the HTTP layer maps to status codes.
- **`lib/repositories/`** — the only place SQL lives. Returns plain data through `lib/mappers.js`.

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

Full DDL: [`db/schema.sql`](db/schema.sql). Migrations live in [`db/migrations/`](db/migrations/) and are applied by [`db/migrate.js`](db/migrate.js).

## Running it locally

No Turso account needed — `@libsql/client` reads a local SQLite file.

```bash
git clone https://github.com/MarcPaul/ecb-eats.git
cd ecb-eats
npm install
cp .env.local.example .env.local   # edit ADMIN_EMAIL to your email
npm run seed                       # creates local.db with 6 published recipes
npm run migrate                    # apply any pending migrations
npm run seed:demo                  # create the demo account (demo@ecbeats.app)
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Local default | Production |
|----------|--------------|------------|
| `TURSO_DATABASE_URL` | `file:local.db` | `libsql://<db>.turso.io` |
| `TURSO_AUTH_TOKEN` | _(empty)_ | Token from Turso dashboard |
| `ADMIN_EMAIL` | Your email | Your email |
| `DEMO_PASSWORD` | `DemoPass123!` | _(set in Vercel)_ |
| `SITE_URL` | _(empty)_ | `https://ecb-eats.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | _(empty → disk)_ | Set when Vercel Blob is linked |

### Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the local dev server (mirrors Vercel routing) |
| `npm run seed` | Apply schema + insert the 6 starter recipes |
| `npm run seed:demo` | Create the demo account with sample activity |
| `npm run migrate` | Apply pending migrations from `db/migrations/` |
| `npm run sitemap` | Regenerate `sitemap.xml` and `robots.txt` |
| `npm run cleanup` | Purge expired sessions and stale rate-limit rows |
| `npm run test:all` | Run all 50 tests (smoke, auth, reviews, submissions, hardening) |

## Deployment

The site deploys to **Vercel** with every push to `main`.

1. Import the GitHub repo into Vercel — every push to `main` auto-deploys
2. Work on feature branches (`feat/reviews`, `feat/auth`) and open a PR — Vercel posts a preview URL on every PR
3. Use a separate Turso database for previews (`ecb-eats-dev`) so testing never touches production data
4. Keep `db/migrations/` numbered and run them against production before merging the PR that needs them
5. GitHub Actions runs the full test suite on every PR

### Vercel environment variables

Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_EMAIL`, `DEMO_PASSWORD` and `CRON_SECRET` in the Vercel project settings. Link **Vercel Blob** so `BLOB_READ_WRITE_TOKEN` is injected (uploads need it — the serverless filesystem is read-only). For preview environments, point `TURSO_DATABASE_URL` at the dev database. The daily cleanup cron is declared in `vercel.json`.

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
  storage.js    image storage adapter (disk → Vercel Blob)
  db.js         database client singleton
  http.js       JSON responses, cookies, origin check, body parsing
  auth.js       session adapter: getActor, createSessionFor, cookies
  validate.js   zod schemas
  rateLimit.js  fixed-window limiter

db/
  schema.sql    full DDL
  migrations/   numbered SQL files; migrate.js applies them
  recipes.js    the 6 starter recipes
  seed.js       apply schema + seed recipes
  seed-demo.js  create the demo account

assets/
  style.css     design system and page styles
  js/data/      api.js (fetch client)
  js/ui/        render.js (templates, escaping), chrome.js (nav, search, auth menu)
  js/features/  reviews.js (review widget)
  js/pages/     home.js  recipe.js  results.js  about.js  account.js
                saved.js  submit.js  admin.js
  img/          recipe photography and logo

test/           smoke · auth · reviews · submissions · hardening (42 tests)

.github/workflows/ci.yml   runs tests on every PR
```

## Challenges and what I learned

**Why SQLite needed Turso on serverless.**
Vercel serverless functions are ephemeral — each invocation gets a fresh filesystem. A plain SQLite file would lose writes between requests. Turso gives the same SQL dialect but stores the data on their edge servers, so `@libsql/client` works identically locally (where it reads `file:local.db`) and in production (where it connects over HTTPS).

**Session security.**
Storing the raw session token in the database would mean a leaked database dump lets an attacker log in as anyone. Instead, only the SHA-256 hash of each token is stored; the raw token lives only in the user's HTTP-only cookie. The cookie's `SameSite=Lax` flag and an `Origin` header check on write endpoints together provide CSRF protection without a separate token.

**Transactions for submissions.**
A recipe submission involves inserting one row in `recipes`, one per ingredient, and one per step. If the server crashes mid-insert, the database could end up with a recipe that has 3 of its 12 ingredients. Using `db.batch([...], "write")` wraps every insert in a single transaction, so a failure leaves nothing half-saved.

**Layered architecture on a static-file frontend.**
Without a framework, it's tempting to put fetch calls, DOM manipulation and business logic in the same file. Splitting into `data/` → `ui/` → `features/` → `pages/` kept each module small and testable, and made adding reviews and submissions much less error-prone because the rendering and data layers were already separate.

---

Built by **Marc Paul** · [GitHub](https://github.com/MarcPaul)
