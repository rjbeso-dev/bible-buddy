// A minimal "who has signed in" list for the site owner — not general
// analytics, just email + first/last seen, gated by Postgres RLS (see
// supabase/schema.sql's "admin can read the directory" policy) so only the
// configured admin email can ever read more than their own row.

import { supabase } from './supabase'

/** The one account allowed to read the full directory (enforced for real by
 * RLS server-side — this is only used client-side to show/hide the admin UI). */
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL?.trim() || null

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!ADMIN_EMAIL && !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

/** Upsert the current user's own row (email + last_seen_at) — RLS only
 * allows a user to write their own row, never anyone else's. Best-effort,
 * same as the rest of the app's sync calls.
 *
 * Deliberately re-reads the live session instead of trusting a passed-in
 * user id: this gets called right out of an onAuthStateChange handler, and
 * during a fast sign-out/sign-in cycle a stale closure-captured id can
 * disagree with whatever session the client actually attaches to the
 * request by the time it goes out — which RLS's `auth.uid() = user_id`
 * check then rejects outright (seen in production as a 42501 "new row
 * violates row-level security policy" error). Reading the session fresh
 * here guarantees the payload can never disagree with the request's own
 * auth token. */
export async function recordSignIn(): Promise<void> {
  if (!supabase) return
  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user?.email) return
    const { error } = await supabase.from('user_directory').upsert({
      user_id: user.id,
      email: user.email,
      last_seen_at: new Date().toISOString(),
    })
    // supabase-js resolves (doesn't throw) on query/RLS errors, so this check
    // is the only way a failed upsert is ever visible — without it, a broken
    // policy or missing table fails completely silently.
    if (error) console.warn('[recordSignIn] failed to record sign-in:', error)
  } catch (err) {
    console.warn('[recordSignIn] failed to record sign-in:', err)
  }
}

export interface DirectoryEntry {
  email: string
  firstSeenAt: string
  lastSeenAt: string
}

/** Fetch the full directory. Only returns rows when the signed-in user is
 * the configured admin — everyone else gets an empty list (RLS-enforced,
 * not a client-side check). */
export async function fetchUserDirectory(): Promise<DirectoryEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('user_directory')
    .select('email, first_seen_at, last_seen_at')
    .order('last_seen_at', { ascending: false })
  if (error || !data) return []
  return data.map((row) => ({
    email: row.email,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }))
}
