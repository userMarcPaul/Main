/* The single place the database client is created.

   All access is server-side with the Supabase service-role key, which bypasses
   row-level security. The schema enables RLS with no policies, so the anon/
   public key can touch nothing — and that key never reaches the browser, since
   every query runs here in the API layer. */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local.example)."
  );
}

export const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Throw on a Supabase error, else return the data — keeps repositories terse. */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
