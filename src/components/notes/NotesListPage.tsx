import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useNotes } from '../../hooks/useNotes'
import { useNoteFolders } from '../../hooks/useNoteFolders'
import { useAuthGate } from '../../context/useAuthGate'
import { BOOKS, getBook } from '../../data/books'
import { parseVerseKey } from '../../lib/references'
import type { Note, NoteFolder } from '../../types'
import { Icon } from '../ui/Icon'

const BOOK_ORDER: Record<string, number> = BOOKS.reduce(
  (acc, b, i) => {
    acc[b.id] = i
    return acc
  },
  {} as Record<string, number>,
)

/** Note bodies can run long (sermon prep); keep the list scannable. */
const PREVIEW_CHARS = 240

function preview(body: string): string {
  return body.length > PREVIEW_CHARS ? body.slice(0, PREVIEW_CHARS).trimEnd() + '…' : body
}

interface BookGroup {
  book: string
  bookName: string
  notes: Array<{ note: Note; chapter: number; verse: number }>
}

export function NotesListPage() {
  const { notes, deleteNote, setNoteFolder, clearFolderFromNotes } = useNotes()
  const { folders, addFolder, renameFolder, deleteFolder } = useNoteFolders()
  const navigate = useNavigate()
  const { requireAuth } = useAuthGate()
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)

  const newNote = () => {
    requireAuth(() => navigate('/notes/new'), 'Sign in to write and save notes.')
  }

  const removeFolder = (folder: NoteFolder) => {
    clearFolderFromNotes(folder.id)
    deleteFolder(folder.id)
    if (activeFolderId === folder.id) setActiveFolderId(null)
  }

  const visibleNotes = useMemo(
    () => (activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : notes),
    [notes, activeFolderId],
  )

  const { groups, general } = useMemo(() => {
    const byBook = new Map<string, BookGroup>()
    const standalone: Note[] = []
    for (const note of visibleNotes) {
      const parsed = note.verseKey ? parseVerseKey(note.verseKey) : null
      if (!parsed) {
        standalone.push(note)
        continue
      }
      const meta = getBook(parsed.book)
      const bookName = meta ? meta.name : parsed.book
      let group = byBook.get(parsed.book)
      if (!group) {
        group = { book: parsed.book, bookName, notes: [] }
        byBook.set(parsed.book, group)
      }
      group.notes.push({ note, chapter: parsed.chapter, verse: parsed.verse })
    }
    const out = Array.from(byBook.values())
    out.sort((a, b) => (BOOK_ORDER[a.book] ?? 999) - (BOOK_ORDER[b.book] ?? 999))
    for (const g of out) {
      g.notes.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
    }
    standalone.sort((a, b) => b.updatedAt - a.updatedAt)
    return { groups: out, general: standalone }
  }, [visibleNotes])

  if (notes.length === 0) {
    return (
      <div className="notes-page">
        <div className="notes-page-header">
          <h1 className="page-title">Notes</h1>
          <button type="button" className="button primary" onClick={newNote}>
            <Icon name="plus" size={16} /> New note
          </button>
        </div>
        <div className="empty-state">
          <p className="empty-state-lead">No notes yet.</p>
          <p className="muted">
            Write a sermon outline or study note with the Bible open beside you, or
            open a chapter and tap a verse to add a quick note as you read.
          </p>
          <button type="button" className="button primary" onClick={newNote}>
            Write a note
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="notes-page">
      <div className="notes-page-header">
        <h1 className="page-title">Notes</h1>
        <div className="notes-page-header-actions">
          <span className="muted">{notes.length} note{notes.length === 1 ? '' : 's'}</span>
          <button type="button" className="button primary" onClick={newNote}>
            <Icon name="plus" size={16} /> New note
          </button>
        </div>
      </div>

      <FolderBar
        folders={folders}
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId}
        onCreate={(name) => {
          const created = addFolder(name)
          if (created) setActiveFolderId(created.id)
        }}
        onRename={renameFolder}
        onDelete={removeFolder}
      />

      {groups.length === 0 && general.length === 0 && (
        <p className="empty-state-lead notes-folder-empty">No notes in this folder yet.</p>
      )}

      {general.length > 0 && (
        <section className="notes-group">
          <h2 className="notes-group-title">General</h2>
          <ul className="notes-items">
            {general.map((note) => (
              <StandaloneNoteCard
                key={note.id}
                note={note}
                folders={folders}
                onDelete={() => deleteNote(note.id)}
                onMove={(folderId) => setNoteFolder(note.id, folderId)}
              />
            ))}
          </ul>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.book} className="notes-group">
          <h2 className="notes-group-title">{group.bookName}</h2>
          <ul className="notes-items">
            {group.notes.map(({ note, chapter, verse }) => (
              <VerseNoteCard
                key={note.id}
                note={note}
                book={group.book}
                chapter={chapter}
                verse={verse}
                folders={folders}
                onDelete={() => deleteNote(note.id)}
                onMove={(folderId) => setNoteFolder(note.id, folderId)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface FolderBarProps {
  folders: NoteFolder[]
  activeFolderId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (folder: NoteFolder) => void
}

function FolderBar({ folders, activeFolderId, onSelect, onCreate, onRename, onDelete }: FolderBarProps) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null

  const submitCreate = () => {
    const name = draft.trim()
    if (name) onCreate(name)
    setDraft('')
    setCreating(false)
  }

  const startRename = (folder: NoteFolder) => {
    setRenamingId(folder.id)
    setRenameDraft(folder.name)
  }

  const submitRename = () => {
    if (renamingId) onRename(renamingId, renameDraft)
    setRenamingId(null)
  }

  return (
    <div className="notes-folder-bar">
      <div className="notes-folder-chips">
        <button
          type="button"
          className={'notes-folder-chip' + (activeFolderId === null ? ' is-active' : '')}
          onClick={() => onSelect(null)}
        >
          All notes
        </button>
        {folders.map((folder) =>
          renamingId === folder.id ? (
            <input
              key={folder.id}
              type="text"
              autoFocus
              className="notes-folder-rename-input"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
            />
          ) : (
            <button
              key={folder.id}
              type="button"
              className={'notes-folder-chip' + (activeFolderId === folder.id ? ' is-active' : '')}
              onClick={() => onSelect(folder.id)}
              onDoubleClick={() => startRename(folder)}
              title="Double-click to rename"
            >
              <Icon name="folder" size={14} /> {folder.name}
            </button>
          ),
        )}
        {creating ? (
          <input
            type="text"
            autoFocus
            className="notes-folder-rename-input"
            placeholder="Folder name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') {
                setDraft('')
                setCreating(false)
              }
            }}
          />
        ) : (
          <button type="button" className="notes-folder-chip notes-folder-add" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New folder
          </button>
        )}
      </div>
      {activeFolder && (
        <div className="notes-folder-actions">
          <button type="button" className="button ghost small" onClick={() => startRename(activeFolder)}>
            Rename
          </button>
          {confirmingDeleteId === activeFolder.id ? (
            <span className="note-card-confirm">
              <button
                type="button"
                className="button danger small"
                onClick={() => {
                  onDelete(activeFolder)
                  setConfirmingDeleteId(null)
                }}
              >
                Delete folder
              </button>
              <button type="button" className="button ghost small" onClick={() => setConfirmingDeleteId(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="button ghost small danger"
              onClick={() => setConfirmingDeleteId(activeFolder.id)}
            >
              Delete folder
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DeleteControl({ onDelete, label }: { onDelete: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <span className="note-card-confirm">
        <button type="button" className="button danger small" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="button ghost small" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="icon-button danger"
      onClick={() => setConfirming(true)}
      aria-label={label}
      title="Delete note"
    >
      <Icon name="trash" size={16} />
    </button>
  )
}

interface FolderPickerProps {
  folders: NoteFolder[]
  currentFolderId: string | undefined
  onMove: (folderId: string | undefined) => void
}

function FolderPicker({ folders, currentFolderId, onMove }: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const current = folders.find((f) => f.id === currentFolderId)

  return (
    <div className="note-card-folder-picker">
      <button
        type="button"
        className={'icon-button' + (current ? ' is-active' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `In folder: ${current.name}` : 'Move to folder'}
        title={current ? `In folder: ${current.name}` : 'Move to folder'}
      >
        <Icon name="folder" size={16} />
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="note-card-folder-menu" role="menu" aria-label="Move to folder">
            {folders.length === 0 && <p className="notes-folder-menu-empty muted">No folders yet.</p>}
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                role="menuitemradio"
                aria-checked={folder.id === currentFolderId}
                className={'note-export-item' + (folder.id === currentFolderId ? ' is-active' : '')}
                onClick={() => {
                  onMove(folder.id)
                  setOpen(false)
                }}
              >
                <Icon name="folder" size={14} /> {folder.name}
                {folder.id === currentFolderId && <Icon name="close" size={12} />}
              </button>
            ))}
            {currentFolderId && (
              <button
                type="button"
                role="menuitem"
                className="note-export-item"
                onClick={() => {
                  onMove(undefined)
                  setOpen(false)
                }}
              >
                <Icon name="close" size={14} /> Remove from folder
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface VerseNoteCardProps {
  note: Note
  book: string
  chapter: number
  verse: number
  folders: NoteFolder[]
  onDelete: () => void
  onMove: (folderId: string | undefined) => void
}

function VerseNoteCard({ note, book, chapter, verse, folders, onDelete, onMove }: VerseNoteCardProps) {
  return (
    <li className="note-card">
      <div className="note-card-head">
        <div className="note-card-titles">
          <Link
            to={`/read/${encodeURIComponent(book)}/${chapter}#v-${verse}`}
            className="note-card-ref"
          >
            {note.reference}
          </Link>
          <Link to={`/notes/${note.id}`} className="icon-button" aria-label="Edit note" title="Edit note">
            <Icon name="edit" size={16} />
          </Link>
        </div>
        <div className="note-card-actions">
          <FolderPicker folders={folders} currentFolderId={note.folderId} onMove={onMove} />
          <DeleteControl onDelete={onDelete} label={`Delete note on ${note.reference}`} />
        </div>
      </div>
      <Link to={`/notes/${note.id}`} className="note-card-body-link">
        <p className="note-card-body">{preview(note.body)}</p>
      </Link>
    </li>
  )
}

function StandaloneNoteCard({
  note,
  folders,
  onDelete,
  onMove,
}: {
  note: Note
  folders: NoteFolder[]
  onDelete: () => void
  onMove: (folderId: string | undefined) => void
}) {
  return (
    <li className="note-card">
      <div className="note-card-head">
        <Link to={`/notes/${note.id}`} className="note-card-ref">
          {note.title || note.reference || 'Untitled note'}
        </Link>
        <div className="note-card-actions">
          <FolderPicker folders={folders} currentFolderId={note.folderId} onMove={onMove} />
          <DeleteControl onDelete={onDelete} label={`Delete note ${note.title ?? ''}`} />
        </div>
      </div>
      <Link to={`/notes/${note.id}`} className="note-card-body-link">
        <p className="note-card-body">{preview(note.body)}</p>
      </Link>
    </li>
  )
}
