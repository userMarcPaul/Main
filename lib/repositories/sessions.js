/* All SQL about sessions. Only the SHA-256 hash of a token is ever stored. */
import { db } from "../db.js";

export async function create(tokenHash, userId, expiresAt) {
  await db.execute({
    sql: "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    args: [tokenHash, userId, expiresAt],
  });
}

/** The account owning a session token hash, plus the session's expiry, or null. */
export async function findActor(tokenHash) {
  const { rows } = await db.execute({
    sql: `SELECT u.id, u.email, u.display_name AS displayName, u.role, s.expires_at AS expiresAt
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
    args: [tokenHash],
  });
  return rows[0] ?? null;
}

export async function deleteByHash(tokenHash) {
  await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [tokenHash] });
}

export async function deleteExpired() {
  await db.execute("DELETE FROM sessions WHERE expires_at < datetime('now')");
}
