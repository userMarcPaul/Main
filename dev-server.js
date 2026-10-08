/**
 * Local development server.
 *
 * Vercel builds the routes under api/ from the filenames; this script does the
 * same mapping by hand so the site runs with plain `npm run dev` and no Vercel
 * CLI. It mounts the *same* handler modules, so what you test here is what
 * deploys. Not used in production — Vercel never runs this file.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".map": "application/json; charset=utf-8",
};

// Mirrors Vercel's file-based routing for the endpoints that exist today.
// More specific patterns go first; /api/recipes/:slug must not swallow
// /api/auth/* etc.
const routes = [
  { pattern: /^\/api\/auth\/signup$/, module: "./api/auth/signup.js", params: [] },
  { pattern: /^\/api\/auth\/login$/, module: "./api/auth/login.js", params: [] },
  { pattern: /^\/api\/auth\/logout$/, module: "./api/auth/logout.js", params: [] },
  { pattern: /^\/api\/auth\/me$/, module: "./api/auth/me.js", params: [] },
  { pattern: /^\/api\/recipes\/([^/]+)\/reviews$/, module: "./api/recipes/[slug]/reviews.js", params: ["slug"] },
  { pattern: /^\/api\/recipes\/([^/]+)$/, module: "./api/recipes/[slug].js", params: ["slug"] },
  { pattern: /^\/api\/recipes$/, module: "./api/recipes/index.js", params: [] },
  { pattern: /^\/api\/categories$/, module: "./api/categories.js", params: [] },
  { pattern: /^\/api\/upload$/, module: "./api/upload.js", params: [] },
  { pattern: /^\/api\/admin\/submissions$/, module: "./api/admin/submissions.js", params: [] },
  { pattern: /^\/api\/saved\/([^/]+)$/, module: "./api/saved/[slug].js", params: ["slug"] },
  { pattern: /^\/api\/saved$/, module: "./api/saved/index.js", params: [] },
];

const server = createServer(async (req, res) => {
  let pathname;
  try {
    ({ pathname } = new URL(req.url, `http://${req.headers.host}`));
  } catch {
    // A malformed request line must not be able to take the server down.
    res.statusCode = 400;
    return res.end("Bad request");
  }

  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (!match) continue;

    req.query = Object.fromEntries(
      route.params.map((name, i) => [name, decodeURIComponent(match[i + 1])])
    );

    const { default: fn } = await import(route.module);
    return fn(req, res);
  }

  if (pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "No such endpoint" }));
  }

  await serveStatic(pathname, res);
});

// Belt and braces: one bad request should never kill local development.
server.on("request", (req, res) => {
  res.on("error", (err) => console.error("response error:", err));
});
process.on("uncaughtException", (err) => console.error("uncaught:", err));

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");

async function serveStatic(pathname, res) {
  // Uploaded images live in UPLOAD_DIR (which storage.js writes to and may sit
  // outside the project), served under /uploads. In production this path is a
  // Vercel Blob URL instead, so this mapping is dev-only.
  let filePath;
  if (pathname.startsWith("/uploads/")) {
    const name = path.basename(pathname); // no traversal past the filename
    filePath = path.join(UPLOAD_DIR, name);
  } else {
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    filePath = path.join(ROOT, relative);
    // Never serve anything outside the project directory.
    if (!filePath.startsWith(ROOT)) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("directory");

    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[path.extname(filePath)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<h1>404 — page not found</h1><p><a href='/'>Back to ECB Eats</a></p>");
  }
}

server.listen(PORT, () => {
  console.log(`ECB Eats dev server on http://localhost:${PORT}`);
});
