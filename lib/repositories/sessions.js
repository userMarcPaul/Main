/* Session data access via Supabase. Only the SHA-256 hash of a token is stored. */
import { db, unwrap } from "../db.js";

export async function create(tokenHash, userId, expiresAt) {
  unwrap(await db.from("sessions").insert({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt }));
}

/** The account owning a session token hash, plus the session's expiry, or null. */
export async function findActor(tokenHash) {
  const rows = unwrap(
    await db.from("sessions")
      .select("expires_at, users(id, email, display_name, role)")
      .eq("token_hash", tokenHash)
      .limit(1)
  );
  if (!rows.length || !rows[0].users) return null;
  const u = rows[0].users;
  return { id: u.id, email: u.email, displayName: u.display_name, role: u.role, expiresAt: rows[0].expires_at };
}

export async function deleteByHash(tokenHash) {
  unwrap(await db.from("sessions").delete().eq("token_hash", tokenHash));
}

export async function deleteExpired() {
  unwrap(await db.from("sessions").delete().lt("expires_at", new Date().toISOString()));
}
