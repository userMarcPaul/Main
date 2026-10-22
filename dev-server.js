/**
 * The HTTP server, used for both local development (`npm run dev`) and
 * production on Render (`npm start`).
 *
 * It serves the static site and maps the routes under api/ to their handler
 * modules by filename. It reads PORT from the environment (Render sets it), so
 * the same file runs in both places and what you test locally is what deploys.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { applySecurityHeaders } from "./lib/securityHeaders.js";
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
  { pattern: /^\/api\/cron\/cleanup$/, module: "./api/cron/cleanup.js", params: [] },
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

  applySecurityHeaders(res);

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

  await serveStatic(req, pathname, res);
});

// Belt and braces: one bad request should never kill local development.
server.on("request", (req, res) => {
  res.on("error", (err) => console.error("response error:", err));
});
process.on("uncaughtException", (err) => console.error("uncaught:", err));

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");

async function serveStatic(req, pathname, res) {
  // Uploaded images live in UPLOAD_DIR (which storage.js writes to and may sit
  // outside the project), served under /uploads. In production this path is a
  // Supabase Storage URL instead, so this mapping is for local disk only.
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

    const type = MIME[path.extname(filePath)] ?? "application/octet-stream";
    // Validation-based caching: the browser reuses assets across page loads so a
    // navigation doesn't re-download the CSS, JS modules, fonts and images, but
    // it revalidates with a cheap 304 when needed so a new deploy is picked up
    // quickly. HTML entry points always revalidate; other assets may sit in the
    // cache for a few minutes. (ETag is derived from size+mtime — no file read.)
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const isHtml = type.startsWith("text/html");
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", info.mtime.toUTCString());
    res.setHeader("Cache-Control", isHtml ? "no-cache" : "public, max-age=300");

    if (req.headers["if-none-match"] === etag) {
      res.statusCode = 304;
      return res.end();
    }

    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
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
