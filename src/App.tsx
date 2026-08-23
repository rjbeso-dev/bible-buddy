import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { SideRail } from './components/layout/SideRail'
import { DashboardPage } from './pages/DashboardPage'
import { ReaderPage } from './pages/ReaderPage'
import { NotesPage } from './pages/NotesPage'
import { NoteComposerPage } from './pages/NoteComposerPage'
import { SearchPage } from './pages/SearchPage'
import { ProfilePage } from './pages/ProfilePage'
import { SharedNotePage } from './pages/SharedNotePage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { readLastRead } from './hooks/useLastRead'

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Redirect "/read" to the reader at the last-read location. */
function ReadRedirect() {
  const last = readLastRead()
  return (
    <Navigate to={`/read/${encodeURIComponent(last.book)}/${last.chapter}`} replace />
  )
}

/** Remounts the composer when navigating directly between two notes' edit
 * URLs, so its form-field state doesn't carry over from the previous note. */
function NoteComposerRoute() {
  const { id } = useParams<{ id: string }>()
  return <NoteComposerPage key={id ?? 'new'} />
}

/** First path segment, e.g. "read" for "/read/john/3", "" for "/". */
function topLevelSection(pathname: string): string {
  return pathname.split('/')[1] ?? ''
}

/**
 * Fades in when the top-level section changes (Home → Read → Search → …).
 * Keyed by section rather than the full pathname so paging chapters within
 * the reader (/read/john/1 → /read/john/2) doesn't remount the page or
 * replay the animation — only switching sections does.
 */
function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={topLevelSection(location.pathname)} className="page-transition">
      {children}
    </div>
  )
}

export default function App() {
  const online = useOnlineStatus()

  return (
    <div className="app-shell">
      <SideRail />

      <main className="app-main">
        {!online && (
          <div className="offline-banner" role="status">
            You’re offline. Chapters you’ve already opened are still available.
          </div>
        )}

        <PageTransition>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/read" element={<ReadRedirect />} />
            <Route path="/read/:book/:chapter" element={<ReaderPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/new" element={<NoteComposerPage />} />
            <Route path="/notes/:id" element={<NoteComposerRoute />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/shared/:id" element={<SharedNotePage />} />
            <Route path="/admin" element={<AdminUsersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  )
}
