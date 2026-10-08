/* Sign-up and login rules: validation, rate limiting, hashing, admin role.
   Returns the public user plus a session token for the HTTP layer to set as a
   cookie. `ip` is just a rate-limit key here — the service knows nothing of
   headers. */
import bcrypt from "bcryptjs";
import * as usersRepo from "../repositories/users.js";
import { signupSchema, loginSchema, validate } from "../validate.js";
import { rateLimit } from "../rateLimit.js";
import { conflict, unprocessable, unauthorized, tooMany } from "../errors.js";
import { createSessionFor } from "../auth.js";

// A valid bcrypt hash to compare against for unknown emails, so a missing
// account and a wrong password take the same time and give the same answer.
const DUMMY_HASH = "$2a$10$wo9gHoVXaLMkofQ7EusvgODiyl.H6qXSVzuxZeRQhokcq2A/d8FyO";

const WINDOW = { limit: 5, windowMs: 15 * 60 * 1000 };

export async function register({ input, ip }) {
  const limited = await rateLimit(`signup:${ip}`, WINDOW);
  if (!limited.allowed) throw tooMany(limited.retryAfter);

  const parsed = validate(signupSchema, input);
  if (!parsed.ok) throw unprocessable("Please check the form", parsed.fieldErrors);

  const { email, displayName, password } = parsed.data;
  if (await usersRepo.existsByEmail(email)) throw conflict("That email is already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const role = email === adminEmail ? "admin" : "user";

  const id = await usersRepo.create({ email, displayName, passwordHash, role });
  const token = await createSessionFor(id);
  return { user: { id, displayName, role }, token };
}

export async function login({ input, ip }) {
  const limited = await rateLimit(`login:${ip}`, WINDOW);
  if (!limited.allowed) throw tooMany(limited.retryAfter);

  const parsed = validate(loginSchema, input);
  if (!parsed.ok) throw unauthorized("Invalid email or password");

  const { email, password } = parsed.data;
  const user = await usersRepo.findByEmail(email);

  const ok = user
    ? await bcrypt.compare(password, user.passwordHash)
    : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!ok) throw unauthorized("Invalid email or password");

  const token = await createSessionFor(user.id);
  return { user: { id: user.id, displayName: user.displayName, role: user.role }, token };
}
