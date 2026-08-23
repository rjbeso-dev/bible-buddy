import { useCallback, useEffect, useState } from 'react'
import type { Note } from '../types'
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage'

function loadNotes(): Note[] {
  const raw = readJSON<Note[]>(STORAGE_KEYS.notes, [])
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (n): n is Note =>
      !!n && typeof n.id === 'string' && typeof n.body === 'string',
  )
}

function persist(notes: Note[]): boolean {
  return writeJSON(STORAGE_KEYS.notes, notes)
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Simple cross-hook broadcast so all mounted useNotes instances stay in sync.
type Listener = (notes: Note[]) => void
const listeners = new Set<Listener>()
let current: Note[] | null = null

function getNotes(): Note[] {
  if (current === null) current = loadNotes()
  return current
}

/**
 * Persist and broadcast a new notes array. Returns false (without applying
 * the change) if the write failed — e.g. localStorage quota exceeded, which
 * an attached image can realistically hit. Callers that skip checking this
 * still behave as before (best-effort), but the note composer checks it so
 * it can tell the user their note — and any image in it — didn't actually save.
 */
function setNotes(next: Note[]): boolean {
  const ok = persist(next)
  if (!ok) return false
  current = next
  listeners.forEach((l) => l(next))
  return true
}

export interface StandaloneNoteInput {
  title?: string
  reference?: string
  body: string
  /** Sanitized rich-text HTML, when written with the formatting toolbar. */
  bodyHtml?: string
}

/** 'empty' = nothing to save (blank body); 'storage' = write failed, most
 * likely a full localStorage quota — realistic once notes can hold images. */
export type SaveNoteResult = { ok: true; note: Note } | { ok: false; reason: 'empty' | 'storage' }

export interface UseNotesResult {
  notes: Note[]
  notesFor: (verseKey: string) => Note[]
  addNote: (verseKey: string, reference: string, body: string) => Note | null
  updateNote: (id: string, body: string) => void
  deleteNote: (id: string) => void
  hasNote: (verseKey: string) => boolean
  /** Create a note with no verse tie, e.g. sermon prep spanning a passage. */
  addStandaloneNote: (input: StandaloneNoteInput) => SaveNoteResult
  /** Update any combination of a note's title/reference/body (standalone or verse-tied). */
  updateNoteFields: (id: string, patch: Partial<StandaloneNoteInput>) => SaveNoteResult
  /** Record (or clear) a note's public share link id. */
  setNoteShareId: (id: string, shareId: string | undefined) => void
}

export function useNotes(): UseNotesResult {
  const [notes, setState] = useState<Note[]>(getNotes)

  useEffect(() => {
    const listener: Listener = (next) => setState(next)
    listeners.add(listener)
    // Re-sync in case notes changed before this subscribed.
    setState(getNotes())
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const addNote = useCallback(
    (verseKey: string, reference: string, body: string): Note | null => {
      const trimmed = body.trim()
      if (!trimmed) return null
      const now = Date.now()
      const note: Note = {
        id: newId(),
        verseKey,
        reference,
        body: trimmed,
        createdAt: now,
        updatedAt: now,
      }
      setNotes([...getNotes(), note])
      return note
    },
    [],
  )

  const updateNote = useCallback((id: string, body: string) => {
    const next = getNotes().map((n) =>
      n.id === id ? { ...n, body: body.trim(), updatedAt: Date.now() } : n,
    )
    setNotes(next)
  }, [])

  const addStandaloneNote = useCallback((input: StandaloneNoteInput): SaveNoteResult => {
    const trimmed = input.body.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    const now = Date.now()
    const note: Note = {
      id: newId(),
      title: input.title?.trim() || undefined,
      reference: input.reference?.trim() || undefined,
      body: trimmed,
      bodyHtml: input.bodyHtml,
      createdAt: now,
      updatedAt: now,
    }
    const saved = setNotes([...getNotes(), note])
    return saved ? { ok: true, note } : { ok: false, reason: 'storage' }
  }, [])

  const updateNoteFields = useCallback((id: string, patch: Partial<StandaloneNoteInput>): SaveNoteResult => {
    let updated: Note | undefined
    const next = getNotes().map((n) => {
      if (n.id !== id) return n
      updated = {
        ...n,
        ...(patch.title !== undefined && { title: patch.title.trim() || undefined }),
        ...(patch.reference !== undefined && { reference: patch.reference.trim() || undefined }),
        ...(patch.body !== undefined && { body: patch.body.trim() }),
        ...(patch.bodyHtml !== undefined && { bodyHtml: patch.bodyHtml }),
        updatedAt: Date.now(),
      }
      return updated
    })
    if (!updated) return { ok: false, reason: 'storage' }
    const saved = setNotes(next)
    return saved ? { ok: true, note: updated } : { ok: false, reason: 'storage' }
  }, [])

  const deleteNote = useCallback((id: string) => {
    setNotes(getNotes().filter((n) => n.id !== id))
  }, [])

  /** Record (or clear, passing undefined) a note's public share link id.
   * Separate from updateNoteFields since it's system-managed, not part of
   * the composer's editable fields. */
  const setNoteShareId = useCallback((id: string, shareId: string | undefined) => {
    setNotes(
      getNotes().map((n) => (n.id === id ? { ...n, shareId } : n)),
    )
  }, [])

  const notesFor = useCallback(
    (verseKey: string) => notes.filter((n) => n.verseKey === verseKey),
    [notes],
  )

  const hasNote = useCallback(
    (verseKey: string) => notes.some((n) => n.verseKey === verseKey),
    [notes],
  )

  return {
    notes,
    notesFor,
    addNote,
    updateNote,
    deleteNote,
    hasNote,
    addStandaloneNote,
    updateNoteFields,
    setNoteShareId,
  }
}
