import { useCallback, useEffect, useState } from 'react'
import type { NoteFolder } from '../types'
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage'

function loadFolders(): NoteFolder[] {
  const raw = readJSON<NoteFolder[]>(STORAGE_KEYS.noteFolders, [])
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is NoteFolder => !!f && typeof f.id === 'string' && typeof f.name === 'string',
  )
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

// Cross-hook broadcast so all mounted useNoteFolders instances stay in sync,
// same pattern as useNotes/useHighlights.
type Listener = (folders: NoteFolder[]) => void
const listeners = new Set<Listener>()
let current: NoteFolder[] | null = null

function getFolders(): NoteFolder[] {
  if (current === null) current = loadFolders()
  return current
}

function setFolders(next: NoteFolder[]): void {
  current = next
  writeJSON(STORAGE_KEYS.noteFolders, next)
  listeners.forEach((l) => l(next))
}

export interface UseNoteFoldersResult {
  folders: NoteFolder[]
  addFolder: (name: string) => NoteFolder | null
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
}

/** Folders a user can file standalone notes into, purely for organization
 * on the Notes page. Deliberately local-only (not part of cloud sync) to
 * keep scope tight — the notes themselves already sync. */
export function useNoteFolders(): UseNoteFoldersResult {
  const [folders, setState] = useState<NoteFolder[]>(getFolders)

  useEffect(() => {
    const listener: Listener = (next) => setState(next)
    listeners.add(listener)
    setState(getFolders())
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const addFolder = useCallback((name: string): NoteFolder | null => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const folder: NoteFolder = { id: newId(), name: trimmed, createdAt: Date.now() }
    setFolders([...getFolders(), folder])
    return folder
  }, [])

  const renameFolder = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setFolders(getFolders().map((f) => (f.id === id ? { ...f, name: trimmed } : f)))
  }, [])

  const deleteFolder = useCallback((id: string) => {
    setFolders(getFolders().filter((f) => f.id !== id))
  }, [])

  return { folders, addFolder, renameFolder, deleteFolder }
}
