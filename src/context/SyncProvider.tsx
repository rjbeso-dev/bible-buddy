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
  const { user, enabled } = useAuth()
  const syncedUserId = useRef<string | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !user) {
      syncedUserId.current = null
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
  }, [enabled, user])

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
  }, [enabled, user])

  return <>{children}</>
}
