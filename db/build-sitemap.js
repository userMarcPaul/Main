/* Generate sitemap.xml and robots.txt from the seeded recipes.
   SITE_URL is the production origin (set in Phase 8); it defaults to the
   placeholder below until then.  Run: `npm run sitemap` */
import { writeFile } from "node:fs/promises";
import { recipes } from "./recipes.js";

const SITE = (process.env.SITE_URL || "https://ecb-eats.vercel.app").replace(/\/$/, "");

const staticPages = ["", "results.html", "profile.html", "login.html", "signup.html"];
const recipePages = recipes.map((r) => `recipe.html?slug=${r.slug}`);
const today = new Date().toISOString().slice(0, 10);

const urls = [...staticPages, ...recipePages]
  .map((p) => `  <url>\n    <loc>${SITE}/${p}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`;

await writeFile("sitemap.xml", sitemap);
await writeFile("robots.txt", robots);
console.log(`Wrote sitemap.xml (${staticPages.length + recipePages.length} URLs) and robots.txt for ${SITE}`);
