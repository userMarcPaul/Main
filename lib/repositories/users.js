/* All SQL about user accounts. Returns password_hash only where login needs it;
   callers never pass it on to a response. */
import { db } from "../db.js";

export async function findByEmail(email) {
  const { rows } = await db.execute({
    sql: "SELECT id, display_name AS displayName, password_hash AS passwordHash, role FROM users WHERE email = ?",
    args: [email],
  });
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), displayName: rows[0].displayName, passwordHash: rows[0].passwordHash, role: rows[0].role };
}

export async function existsByEmail(email) {
  const { rows } = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  return rows.length > 0;
}

export async function create({ email, displayName, passwordHash, role }) {
  const result = await db.execute({
    sql: "INSERT INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
    args: [email, displayName, passwordHash, role],
  });
  return Number(result.lastInsertRowid);
}
