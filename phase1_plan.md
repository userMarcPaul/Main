# Phase 1: Repo Cleanup & Quick Fixes — Implementation Plan

## Changes to make

### Repository
- [x] Update `.gitignore` with `.env.local`, `local.db`, `node_modules/`
- [x] Create initial `README.md`

### Broken links & fake content
- [x] Remove fake rating ("4.7 (128 reviews)") and author stats ("4.4M followers")
- [x] Rename "My RecipeTin" → "Saved Recipes" across all pages
- [x] Hide social icons, "Iconic Dishes" and "View All" links
- [x] Make category tiles into links (placeholder `results.html?category=...`) and drop invented counts
- [x] Remove PocketDEVS link from recipe nav

### Content & naming
- [x] Rename images to lowercase kebab-case; fix `maet_R.jpg` → `meat-r.jpg`
- [x] Give Carrot Cake its own image (generate one)
- [x] Add paprika and olive oil to Chicken Pasta ingredients
- [x] Use "ECB Eats" in every page title; point About links consistently
- [x] Rename `result.html` → `results.html`; make footer year automatic with JS

### Files affected
- `index.html`, `recipe.html`, `result.html` → `results.html`, `profile.html`
- `assets/js/app.js`
- `assets/style.css` (hide social icons in header)
- `.gitignore`
- New: `README.md`
- Image renames in `assets/img/`

> [!IMPORTANT]
> **Done when:** No link on the site points to `#`, and no number on the site is invented.
