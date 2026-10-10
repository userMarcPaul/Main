/* Image storage adapter — the one place that decides where uploaded photos go.

   - In production (BLOB_READ_WRITE_TOKEN set), it stores to Vercel Blob, which
     is required there because the serverless filesystem is read-only.
   - Locally and in tests (no token), it writes to a directory on disk served at
     /uploads by the dev server.

   The service layer just calls save() and gets back a URL to reference. */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DIR = process.env.UPLOAD_DIR || "uploads";

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Persist image bytes and return the public URL to reference them by. */
export async function save(buffer, contentType) {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`unsupported content type: ${contentType}`);

  const name = `${randomUUID()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Imported lazily so dev and tests never need the package resolved.
    const { put } = await import("@vercel/blob");
    const { url } = await put(`recipes/${name}`, buffer, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return url; // absolute https URL
  }

  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), buffer);
  return `/uploads/${name}`;
}
