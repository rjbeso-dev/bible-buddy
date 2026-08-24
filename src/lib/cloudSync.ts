// Cloud sync for optional accounts: a pure, defensive merge of local and
// cloud state, plus thin push/pull helpers around a single-row-per-user
// JSONB blob in Supabase. Never throws — sync failures are swallowed so a
// flaky network or an unconfigured backend can never break the app.

import type { Highlight, LastRead, Note, RecentChapter, Settings } from '../types'
import { STORAGE_KEYS, readJSON, writeJSON, removeKey } from './storage'
import { supabase } from './supabase'
import { RECENT_CAP, chapterKey } from '../hooks/useReadingProgress'

/** The subset of local state that's synced to the cloud (see STORAGE_KEYS). */
export interface SyncedState {
  notes: Note[]
  highlights: Record<string, Highlight>
  readChapters: string[]
  recentChapters: RecentChapter[]
  settings: Settings | null
  lastRead: LastRead | null
}

/** Read the six synced keys out of localStorage into one object. */
export function snapshotLocal(): SyncedState {
  return {
    notes: readJSON<Note[]>(STORAGE_KEYS.notes, []),
    highlights: readJSON<Record<string, Highlight>>(STORAGE_KEYS.highlights, {}),
    readChapters: readJSON<string[]>(STORAGE_KEYS.readChapters, []),
    recentChapters: readJSON<RecentChapter[]>(STORAGE_KEYS.recentChapters, []),
    settings: readJSON<Settings | null>(STORAGE_KEYS.settings, null),
    lastRead: readJSON<LastRead | null>(STORAGE_KEYS.lastRead, null),
  }
}

function isNote(v: unknown): v is Note {
  const n = v as Note | null
  return (
    !!n &&
    typeof n === 'object' &&
    typeof n.id === 'string' &&
    (n.verseKey === undefined || typeof n.verseKey === 'string') &&
    typeof n.body === 'string' &&
    typeof n.updatedAt === 'number'
  )
}

/** Union notes by id; the copy with the newer updatedAt wins. */
function mergeNotes(a: unknown, b: unknown): Note[] {
  const merged = new Map<string, Note>()
  for (const note of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!isNote(note)) continue
    const existing = merged.get(note.id)
    if (!existing || note.updatedAt > existing.updatedAt) merged.set(note.id, note)
  }
  return [...merged.values()].sort((x, y) => x.createdAt - y.createdAt)
}

function isHighlight(v: unknown): v is Highlight {
  const h = v as Highlight | null
  return (
    !!h &&
    typeof h === 'object' &&
    typeof h.verseKey === 'string' &&
    typeof h.color === 'string' &&
    typeof h.updatedAt === 'number'
  )
}

/** Union highlights by verseKey; the copy with the newer updatedAt wins. */
function mergeHighlights(a: unknown, b: unknown): Record<string, Highlight> {
  const out: Record<string, Highlight> = {}
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object') continue
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
      if (!isHighlight(value)) continue
      const existing = out[key]
      if (!existing || value.updatedAt > existing.updatedAt) out[key] = value
    }
  }
  return out
}

/** Set-union of read-chapter keys. */
function mergeReadChapters(a: unknown, b: unknown): string[] {
  const out = new Set<string>()
  for (const src of [a, b]) {
    if (!Array.isArray(src)) continue
    for (const key of src) if (typeof key === 'string') out.add(key)
  }
  return [...out]
}

function isRecentChapter(v: unknown): v is RecentChapter {
  const r = v as RecentChapter | null
  return (
    !!r &&
    typeof r === 'object' &&
    typeof r.book === 'string' &&
    typeof r.chapter === 'number' &&
    typeof r.translationId === 'string' &&
    typeof r.updatedAt === 'number'
  )
}

/** Union recent chapters by book/chapter key, newer-wins, most-recent-first, capped. */
function mergeRecentChapters(a: unknown, b: unknown): RecentChapter[] {
  const merged = new Map<string, RecentChapter>()
  for (const entry of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!isRecentChapter(entry)) continue
    const key = chapterKey(entry.book, entry.chapter)
    const existing = merged.get(key)
    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(key, entry)
  }
  return [...merged.values()]
    .sort((x, y) => y.updatedAt - x.updatedAt)
    .slice(0, RECENT_CAP)
}

function isSettings(v: unknown): v is Settings {
  const s = v as Settings | null
  return !!s && typeof s === 'object' && typeof s.theme === 'string'
}

/** Settings has no updatedAt — prefer cloud when present, else local. */
function mergeSettings(local: unknown, cloud: unknown): Settings | null {
  if (isSettings(cloud)) return cloud
  if (isSettings(local)) return local
  return null
}

function isLastRead(v: unknown): v is LastRead {
  const r = v as LastRead | null
  return !!r && typeof r === 'object' && typeof r.book === 'string' && typeof r.chapter === 'number'
}

/** Newer updatedAt wins; falls back to whichever side is valid. */
function mergeLastRead(local: unknown, cloud: unknown): LastRead | null {
  const l = isLastRead(local) ? local : null
  const c = isLastRead(cloud) ? cloud : null
  if (l && c) return (c.updatedAt ?? 0) > (l.updatedAt ?? 0) ? c : l
  return c ?? l
}

/**
 * Union-merge local and cloud state. Pure and defensive — either side may be
 * partial, malformed, or missing (e.g. a first-ever sync has no cloud data).
 */
export function mergeState(
  local: Partial<SyncedState> | null | undefined,
  cloud: Partial<SyncedState> | null | undefined,
): SyncedState {
  const l = local ?? {}
  const c = cloud ?? {}
  return {
    notes: mergeNotes(l.notes, c.notes),
    highlights: mergeHighlights(l.highlights, c.highlights),
    readChapters: mergeReadChapters(l.readChapters, c.readChapters),
    recentChapters: mergeRecentChapters(l.recentChapters, c.recentChapters),
    settings: mergeSettings(l.settings, c.settings),
    lastRead: mergeLastRead(l.lastRead, c.lastRead),
  }
}

/**
 * Whether whatever's sitting in localStorage right now was left behind by a
 * *different* signed-in account, rather than being this device's own
 * pre-account data. `null` means no account has ever synced on this device
 * (a fresh install, or local-only use) — that data is fair game to merge in,
 * same as always. A mismatch means someone else signed in on this browser
 * and signed out without switching back: their notes/highlights/progress
 * must not be merged into (and thereby leaked into, and permanently mixed
 * into the cloud row of) whoever signs in next.
 */
export function isForeignLocalData(owner: string | null, userId: string): boolean {
  return owner !== null && owner !== userId
}

/**
 * Upsert the current local snapshot into the user's cloud row. Best-effort.
 *
 * Refuses to push if the local "sync owner" marker doesn't match `userId`.
 * This is the actual write gate — it's not enough for pullAndMerge to be
 * careful, because pushSnapshot is *also* called independently by
 * SyncProvider's debounced "local data changed" listener, on every synced
 * write while signed in. If pullAndMerge hasn't run yet (or got skipped —
 * this is exactly how a previous account's leftover local data ended up
 * permanently written into another account's cloud row in production,
 * confirmed via matching notes/timestamps in both rows), that listener would
 * otherwise happily upload whoever's data is currently sitting in
 * localStorage to whichever user is currently signed in.
 */
export async function pushSnapshot(userId: string): Promise<void> {
  if (!supabase) return
  const owner = readJSON<string | null>(STORAGE_KEYS.syncOwner, null)
  if (isForeignLocalData(owner, userId)) return
  try {
    await supabase.from('user_state').upsert({
      user_id: userId,
      data: snapshotLocal(),
      updated_at: new Date().toISOString(),
    })
  } catch {
    // Sync is best-effort — never let a network/RLS failure reach the UI.
  }
}

/**
 * Fetch the user's cloud row, merge it with whatever's local, write the
 * merged result back into localStorage, then push the merged blob back up so
 * both sides agree.
 */
export async function pullAndMerge(userId: string): Promise<void> {
  if (!supabase) return
  try {
    const { data, error } = await supabase
      .from('user_state')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return
    const cloud = (data?.data ?? null) as Partial<SyncedState> | null

    const owner = readJSON<string | null>(STORAGE_KEYS.syncOwner, null)
    const foreign = isForeignLocalData(owner, userId)
    if (foreign) {
      // Wipe the previous account's leftovers outright rather than merging
      // them in — an `if (merged.x)` guard further down would otherwise
      // leave a stale value in place when both this account's cloud and the
      // discarded local side are empty for that field.
      removeKey(STORAGE_KEYS.notes)
      removeKey(STORAGE_KEYS.highlights)
      removeKey(STORAGE_KEYS.readChapters)
      removeKey(STORAGE_KEYS.recentChapters)
      removeKey(STORAGE_KEYS.settings)
      removeKey(STORAGE_KEYS.lastRead)
      removeKey(STORAGE_KEYS.noteFolders)
    }
    const local = foreign ? {} : snapshotLocal()

    const merged = mergeState(local, cloud)
    writeJSON(STORAGE_KEYS.notes, merged.notes)
    writeJSON(STORAGE_KEYS.highlights, merged.highlights)
    writeJSON(STORAGE_KEYS.readChapters, merged.readChapters)
    writeJSON(STORAGE_KEYS.recentChapters, merged.recentChapters)
    if (merged.settings) writeJSON(STORAGE_KEYS.settings, merged.settings)
    if (merged.lastRead) writeJSON(STORAGE_KEYS.lastRead, merged.lastRead)
    writeJSON(STORAGE_KEYS.syncOwner, userId)
    await pushSnapshot(userId)
  } catch {
    // Sync is best-effort — leave local data untouched on failure.
  }
}
