import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { isAdminEmail, fetchUserDirectory, type DirectoryEntry } from '../lib/adminDirectory'

type Status = 'loading' | 'ready' | 'error'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/** A simple list of who has signed in (email + first/last seen) — visible
 * only to the configured admin account. Row-Level Security is what actually
 * enforces that (see supabase/schema.sql); this redirect just avoids
 * showing an empty/broken page to anyone else who lands here. */
export function AdminUsersPage() {
  const { user, enabled } = useAuth()
  const isAdmin = isAdminEmail(user?.email)
  const [status, setStatus] = useState<Status>('loading')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    setStatus('loading')
    fetchUserDirectory()
      .then((rows) => {
        if (cancelled) return
        setEntries(rows)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  if (!enabled || !user || !isAdmin) return <Navigate to="/" replace />

  return (
    <div className="dashboard admin-page">
      <header className="notes-page-header">
        <h1 className="page-title">Signed-in users</h1>
        <span className="muted">
          {entries.length} {entries.length === 1 ? 'user' : 'users'}
        </span>
      </header>

      {status === 'loading' && <p className="muted">Loading…</p>}
      {status === 'error' && <p className="muted">Couldn’t load the list. Try again.</p>}

      {status === 'ready' &&
        (entries.length === 0 ? (
          <p className="empty-state-lead">No one’s signed in yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>First signed in</th>
                  <th>Last signed in</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.email}>
                    <td>{entry.email}</td>
                    <td>{formatDate(entry.firstSeenAt)}</td>
                    <td>{formatDate(entry.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}
