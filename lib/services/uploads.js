/* Image upload rules: who may upload, size and real-type checks, rate limit.
   The actual bytes are handed to the storage adapter. */
import * as storage from "../storage.js";
import { rateLimit } from "../rateLimit.js";
import { AppError, unauthorized, unprocessable, tooMany } from "../errors.js";

const MAX_BYTES = 2 * 1024 * 1024;

/** Detect the real image type from the leading bytes, ignoring any claimed type. */
function sniff(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function upload({ actor, buffer }) {
  if (!actor) throw unauthorized();
  // readRawBody returns null when the body exceeds the limit.
  if (!buffer || buffer.length === 0) throw unprocessable("No image received");
  if (buffer.length > MAX_BYTES) throw new AppError(413, "Image is too large (max 2 MB)");

  const limited = await rateLimit(`upload:${actor.id}`, { limit: 20, windowMs: 24 * 60 * 60 * 1000 });
  if (!limited.allowed) throw tooMany(limited.retryAfter, "Too many uploads today.");

  const type = sniff(buffer);
  if (!type) throw unprocessable("Only JPEG, PNG and WebP images are allowed");

  return { url: await storage.save(buffer, type) };
}
