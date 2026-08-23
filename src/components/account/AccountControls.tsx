import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { isAdminEmail } from '../../lib/adminDirectory'
import { Icon } from '../ui/Icon'

/** Best available display name for the signed-in user. */
function displayName(user: { user_metadata?: Record<string, unknown>; email?: string }): string {
  const meta = user.user_metadata
  const name = meta?.full_name ?? meta?.name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return user.email ?? 'Account'
}

/**
 * Account rail item: hidden entirely when Supabase isn't configured. Signed
 * out, it's a "Sign in" trigger with a Google sign-in popover; signed in, it
 * shows the user's name/email and a "Sign out" popover. Mirrors MusicControls'
 * rail variant (rail-item trigger + panel-right popover).
 */
export function AccountControls() {
  const { user, enabled, signInWithGoogle, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!enabled) return null

  const label = user ? displayName(user) : 'Sign in'

  return (
    <div className="account-controls rail-item-wrap">
      <button
        type="button"
        className={'rail-item' + (user ? ' is-active' : '')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
      >
        <Icon name="user" size={24} />
        <span className="rail-item-label">{label}</span>
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="account-panel panel-right" role="dialog" aria-label="Account">
            {user ? (
              <>
                <div className="account-section">
                  <span className="font-controls-label">Signed in as</span>
                  <p className="account-email">{user.email ?? displayName(user)}</p>
                  <p className="account-status">Synced</p>
                </div>
                <Link to="/profile" className="button ghost small" onClick={() => setOpen(false)}>
                  View profile
                </Link>
                {isAdminEmail(user.email) && (
                  <Link to="/admin" className="button ghost small" onClick={() => setOpen(false)}>
                    Signed-in users
                  </Link>
                )}
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setOpen(false)
                    void signOut()
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="account-note">
                  Sign in to sync your notes, highlights and reading progress across devices.
                </p>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    void signInWithGoogle()
                  }}
                >
                  Continue with Google
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
