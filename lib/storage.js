/* Image storage adapter. In this local/dev setup it writes to a directory on
   disk (served at /uploads by the dev server, and by Vercel's static layer).
   This is the one place to swap for Vercel Blob in a serverless deployment,
   where the filesystem is read-only — the service layer calls `save()` and does
   not care how bytes are stored. */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DIR = process.env.UPLOAD_DIR || "uploads";

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Persist image bytes and return the public URL path to reference them by. */
export async function save(buffer, contentType) {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`unsupported content type: ${contentType}`);

  await mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(DIR, name), buffer);
  return `/uploads/${name}`;
}
