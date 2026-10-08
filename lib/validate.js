/* zod schemas: one per request body, so bad input is rejected before it
   reaches the database. */
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  displayName: z.string().trim().min(2, "At least 2 characters").max(40, "At most 40 characters"),
  password: z.string().min(8, "At least 8 characters").max(200, "At most 200 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});

/**
 * Run a schema. On success: { ok: true, data }. On failure:
 * { ok: false, fieldErrors } with the first message per field, for inline
 * display next to each input.
 */
export function validate(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] ?? "_";
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}

export const reviewSchema = z.object({
  rating: z.coerce.number().int("Choose 1 to 5 stars").min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  // Optional free text. Missing, null or blank all normalise to null.
  comment: z.string().trim().max(1000, "At most 1,000 characters").nullish()
    .transform((v) => (v && v.length ? v : null)),
});

export const savedSchema = z.object({
  slug: z.string().trim().min(1, "Which recipe?").max(200),
});
