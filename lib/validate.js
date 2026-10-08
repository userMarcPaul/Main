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

// A single ingredient row within a submission. qty is optional ("to taste").
const ingredientSchema = z.object({
  emoji: z.string().trim().max(8).nullish().transform((v) => v || null),
  name: z.string().trim().min(1, "Name the ingredient").max(80),
  qty: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.union([z.coerce.number().positive("Amount must be positive").max(100000), z.null()])
  ),
  unit: z.string().trim().max(40).nullish().transform((v) => v || null),
});

export const submissionSchema = z.object({
  title: z.string().trim().min(3, "At least 3 characters").max(80, "At most 80 characters"),
  category: z.string().trim().min(2, "Pick a category").max(40),
  description: z.string().trim().min(1, "Add a short description").max(2000, "At most 2,000 characters"),
  timeMinutes: z.coerce.number().int().min(1, "At least 1 minute").max(1440, "At most 24 hours"),
  servings: z.coerce.number().int().min(1, "At least 1 serving").max(50, "At most 50 servings"),
  difficulty: z.enum(["Easy", "Medium", "Hard"], { errorMap: () => ({ message: "Choose a difficulty" }) }),
  imageUrl: z.string().trim().min(1, "Add a photo").max(400),
  ingredients: z.array(ingredientSchema).min(2, "Add at least 2 ingredients").max(40, "At most 40 ingredients"),
  steps: z.array(z.string().trim().min(1, "Step can't be empty").max(2000))
    .min(1, "Add at least 1 step").max(30, "At most 30 steps"),
});
