/* Image storage adapter — the one place that decides where uploaded photos go.

   - In production (SUPABASE_STORAGE_BUCKET set), it stores to a public Supabase
     Storage bucket, which is required on Render because the server's filesystem
     is ephemeral (reset on every deploy/restart).
   - Locally and in tests (no bucket name), it writes to a directory on disk
     served at /uploads by the dev server.

   The service layer just calls save() and gets back a URL to reference. */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DIR = process.env.UPLOAD_DIR || "uploads";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET;

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Persist image bytes and return the public URL to reference them by. */
export async function save(buffer, contentType) {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`unsupported content type: ${contentType}`);

  const name = `recipes/${randomUUID()}.${ext}`;

  if (BUCKET) {
    // Imported lazily so dev and tests never need the Supabase client resolved.
    const { db } = await import("./db.js");
    const { error } = await db.storage
      .from(BUCKET)
      .upload(name, buffer, { contentType, upsert: false });
    if (error) throw new Error(error.message);

    const { data } = db.storage.from(BUCKET).getPublicUrl(name);
    return data.publicUrl; // absolute https URL on the Supabase project host
  }

  await mkdir(DIR, { recursive: true });
  const file = path.basename(name);
  await writeFile(path.join(DIR, file), buffer);
  return `/uploads/${file}`;
}
