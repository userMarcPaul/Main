/* User account data access via Supabase. password_hash is selected only where
   login needs it; callers never put it in a response. */
import { db, unwrap } from "../db.js";

export async function findByEmail(email) {
  const rows = unwrap(
    await db.from("users").select("id, display_name, password_hash, role").eq("email", email).limit(1)
  );
  if (!rows.length) return null;
  const u = rows[0];
  return { id: Number(u.id), displayName: u.display_name, passwordHash: u.password_hash, role: u.role };
}

export async function existsByEmail(email) {
  const rows = unwrap(await db.from("users").select("id").eq("email", email).limit(1));
  return rows.length > 0;
}

export async function create({ email, displayName, passwordHash, role }) {
  const rows = unwrap(
    await db.from("users")
      .insert({ email, display_name: displayName, password_hash: passwordHash, role })
      .select("id")
  );
  return Number(rows[0].id);
}
