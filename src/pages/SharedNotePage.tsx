import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSharedNote, type SharedNote } from '../lib/sharedNotes'
import { sanitizeNoteHtml } from '../lib/sanitizeNoteHtml'
import { Icon } from '../components/ui/Icon'

type Status = 'loading' | 'ready' | 'not-found'

/** Public, read-only view of a note someone shared — no sign-in required. */
export function SharedNotePage() {
  const { id } = useParams<{ id: string }>()
  const [status, setStatus] = useState<Status>('loading')
  const [note, setNote] = useState<SharedNote | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setNote(null)
    if (!id) {
      setStatus('not-found')
      return
    }
    fetchSharedNote(id).then((result) => {
      if (cancelled) return
      if (result) {
        setNote(result)
        setStatus('ready')
      } else {
        setStatus('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [id])

  if (status === 'loading') {
    return (
      <div className="shared-note-page">
        <div className="chapter-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-line" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'not-found' || !note) {
    return (
      <div className="shared-note-page">
        <div className="reader-empty">
          <h2>This link isn’t available</h2>
          <p className="muted">
            The note may have been unshared, or the link isn’t correct.
          </p>
          <Link to="/" className="button primary">
            Go to Bible Study
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="shared-note-page">
      <p className="shared-note-eyebrow">
        <Icon name="share" size={14} /> Shared note
      </p>
      {note.title && <h1 className="shared-note-title">{note.title}</h1>}
      {note.reference && <p className="shared-note-reference">{note.reference}</p>}
      <div
        className="rich-editor-body shared-note-body"
        dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.bodyHtml) }}
      />
      <footer className="shared-note-footer">
        <p className="muted">
          Shared from <Link to="/">Bible Study</Link>.
        </p>
      </footer>
    </div>
  )
}
