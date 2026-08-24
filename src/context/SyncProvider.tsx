import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { pullAndMerge, pushSnapshot } from '../lib/cloudSync'
import { recordSignIn } from '../lib/adminDirectory'

const PUSH_DEBOUNCE_MS = 1500
const PULLED_FLAG_PREFIX = 'bsa.sync.pulled.'

/**
 * Whether this browser tab has already pulled+reloaded for this user.
 *
 * A plain in-memory ref isn't enough here: `window.location.reload()` wipes
 * all JS state, including refs, so on the very next mount the ref would read
 * as "not yet synced" again — triggering another pull + reload, forever.
 * sessionStorage survives the reload (cleared only when the tab closes), so
 * the pull-and-reload genuinely happens once per sign-in per tab.
 */
function hasPulledThisSession(userId: string): boolean {
  try {
    return sessionStorage.getItem(PULLED_FLAG_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

function markPulledThisSession(userId: string): void {
  try {
    sessionStorage.setItem(PULLED_FLAG_PREFIX + userId, '1')
  } catch {
    // ignore (private browsing / storage disabled) — worst case, one extra pull+reload.
  }
}

/**
 * Clear every "already pulled" flag. Called on sign-out so that the next
 * sign-in in this tab — even for a user id that was already pulled earlier
 * today — gets a fresh pullAndMerge instead of being skipped. Without this,
 * switching accounts in one long-lived tab (sign out, sign in as someone
 * else, sign out, sign back in as the first user) would silently reuse a
 * stale flag and never re-run the merge/ownership check on repeat visits.
 */
function clearPulledFlags(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(PULLED_FLAG_PREFIX)) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * Drives cloud sync while signed in. On sign-in (once per tab per user,
 * tracked via sessionStorage), records the sign-in in the directory, pulls
 * the cloud snapshot, merges it with local data, writes the merge back to
 * localStorage, then reloads once so every hook re-hydrates from the merged
 * state. While signed in, listens for the `bsa:datachanged` event
 * (dispatched by storage.ts on every synced-key write) and debounce-pushes
 * the local snapshot to the cloud. A no-op tree when Supabase isn't
 * configured or no one is signed in.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, enabled, loading } = useAuth()
  const syncedUserId = useRef<string | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // AuthProvider reports {user: null, loading: true} for a moment on every
    // fresh page load — including the reload this effect itself triggers
    // below — until getSession() resolves. Treating that transient null as a
    // genuine sign-out wiped the "already pulled" flag this effect had just
    // set, which re-triggered pullAndMerge + another reload on the very next
    // render: an infinite loop, seen in production as the app stuck
    // "loading" forever right after signing in. Do nothing at all until the
    // real auth state is known.
    if (loading) return
    if (!enabled || !user) {
      syncedUserId.current = null
      clearPulledFlags()
      return
    }
    if (syncedUserId.current === user.id) return
    syncedUserId.current = user.id
    if (hasPulledThisSession(user.id)) return
    let cancelled = false
    // Record the sign-in before pulling/merging: pullAndMerge ends in a full
    // page reload, which would otherwise race recordSignIn's own request and
    // can cancel it mid-flight before it reaches the server — sequencing it
    // first guarantees it always completes.
    recordSignIn()
      .then(() => pullAndMerge(user.id))
      .then(() => {
        if (cancelled) return
        markPulledThisSession(user.id)
        window.location.reload()
      })
    return () => {
      cancelled = true
    }
    // Deliberately depend on user?.id, not `user` itself: AuthProvider sets
    // `user` from two separate paths right after sign-in (getSession()
    // resolving, and onAuthStateChange's own initial event), each producing
    // a distinct object for the *same* logical session. Depending on the
    // object meant this effect re-ran (cancelling the in-flight pull+reload
    // above via React's cleanup) purely because the reference changed, even
    // though nothing about the signed-in user actually had. pullAndMerge's
    // writes had already landed by the time it noticed `cancelled`, but the
    // reload got silently skipped — leaving a stale pre-sync page on screen
    // until a manual refresh re-read the (already-correct) local storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, loading])

  useEffect(() => {
    if (!enabled || !user) return
    const userId = user.id
    const onDataChanged = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(() => {
        pushSnapshot(userId)
      }, PUSH_DEBOUNCE_MS)
    }
    window.addEventListener('bsa:datachanged', onDataChanged)
    return () => {
      window.removeEventListener('bsa:datachanged', onDataChanged)
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id])

  return <>{children}</>
}
