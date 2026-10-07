# ECB Eats

A recipe site built with plain HTML, CSS and JavaScript — currently a static front end,
being built out into a full-stack app with a real database, user accounts, reviews and
user-submitted recipes.

**Live site:** _not deployed yet — a Vercel link goes here in Phase 2._

![ECB Eats home page](assets/img/chicken-pasta.jpg)

## What works today

- Home page with featured recipes, category tiles and a latest-recipes grid
- A full recipe page (Chicken Pasta) with ingredients and step-by-step instructions
- Search results and About pages
- Responsive layout, sticky navigation and scroll-in animations

Features that are not built yet are hidden rather than faked: there are no placeholder
ratings, follower counts or recipe counts anywhere on the site, and no link points to `#`.

## Coming next

The build is planned in 8 phases (see `ECB-Eats-Implementation-Plan.md`):

| Phase | What it adds |
| --- | --- |
| 1 ✅ | Repo cleanup, honest content, no dead links |
| 2 | Turso (SQLite) database, seed data, read API |
| 3 | Data-driven pages — every card opens its own recipe, real search |
| 4 | User accounts and sessions |
| 5 | Reviews, ratings and saved recipes |
| 6 | Recipe submissions with admin moderation |
| 7 | Security, accessibility, performance and SEO pass |
| 8 | Deployment workflow and portfolio packaging |

## Tech stack

- **Now:** HTML, CSS (custom design system, Bootstrap available), vanilla JavaScript
- **Planned:** Vercel serverless functions (Node.js), Turso / libSQL, `zod`, `bcryptjs`, Vercel Blob

## Running it locally

The site is static today, so any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

From Phase 2 onward this becomes `vercel dev`, which serves the pages and the `/api`
functions together.

## Project layout

```
index.html        Home
recipe.html       Recipe detail
results.html      Search results
profile.html      About
assets/
  style.css       Design system and page styles
  css/            Bootstrap
  js/app.js       Navigation, scroll animations, footer year
  img/            Recipe photography and the logo
```
