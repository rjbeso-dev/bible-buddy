import { describe, it, expect } from 'vitest'
import { mergeState, isForeignLocalData, type SyncedState } from './cloudSync'
import type { Note, RecentChapter } from '../types'

function note(id: string, updatedAt: number, body = 'x'): Note {
  return { id, verseKey: 'john.1.1', reference: 'John 1:1', body, createdAt: updatedAt, updatedAt }
}

/** A standalone note (sermon prep, etc.) — no verseKey, per addStandaloneNote. */
function standaloneNote(id: string, updatedAt: number, body = 'x'): Note {
  return { id, title: 'Untitled', body, createdAt: updatedAt, updatedAt }
}

function recent(book: string, chapter: number, updatedAt: number): RecentChapter {
  return { book, chapter, translationId: 'web', updatedAt }
}

describe('mergeState: notes (union by id, newer wins)', () => {
  it('keeps notes unique to each side', () => {
    const local: Partial<SyncedState> = { notes: [note('a', 1)] }
    const cloud: Partial<SyncedState> = { notes: [note('b', 1)] }
    const merged = mergeState(local, cloud)
    expect(merged.notes.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('the newer updatedAt wins for a shared id', () => {
    const local: Partial<SyncedState> = { notes: [note('a', 1, 'old body')] }
    const cloud: Partial<SyncedState> = { notes: [note('a', 2, 'new body')] }
    const merged = mergeState(local, cloud)
    expect(merged.notes).toHaveLength(1)
    expect(merged.notes[0].body).toBe('new body')
  })

  it('keeps standalone notes (no verseKey) instead of dropping them', () => {
    const local: Partial<SyncedState> = { notes: [standaloneNote('sermon-1', 1)] }
    const merged = mergeState(local, {})
    expect(merged.notes).toHaveLength(1)
    expect(merged.notes[0].id).toBe('sermon-1')
    expect(merged.notes[0].verseKey).toBeUndefined()
  })

  it('merges a mix of verse-tied and standalone notes from both sides', () => {
    const local: Partial<SyncedState> = { notes: [note('a', 1), standaloneNote('b', 1)] }
    const cloud: Partial<SyncedState> = { notes: [standaloneNote('c', 1)] }
    const merged = mergeState(local, cloud)
    expect(merged.notes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('mergeState: highlights (union by verseKey, newer wins)', () => {
  it('unions highlights from both sides', () => {
    const local: Partial<SyncedState> = {
      highlights: { 'gen.1.1': { verseKey: 'gen.1.1', color: 'yellow', updatedAt: 1 } },
    }
    const cloud: Partial<SyncedState> = {
      highlights: { 'john.3.16': { verseKey: 'john.3.16', color: 'blue', updatedAt: 1 } },
    }
    const merged = mergeState(local, cloud)
    expect(Object.keys(merged.highlights).sort()).toEqual(['gen.1.1', 'john.3.16'])
  })

  it('the newer updatedAt wins for a shared verseKey', () => {
    const local: Partial<SyncedState> = {
      highlights: { 'gen.1.1': { verseKey: 'gen.1.1', color: 'yellow', updatedAt: 1 } },
    }
    const cloud: Partial<SyncedState> = {
      highlights: { 'gen.1.1': { verseKey: 'gen.1.1', color: 'pink', updatedAt: 5 } },
    }
    const merged = mergeState(local, cloud)
    expect(merged.highlights['gen.1.1'].color).toBe('pink')
  })
})

describe('mergeState: readChapters (set union)', () => {
  it('unions and dedupes chapter keys', () => {
    const local: Partial<SyncedState> = { readChapters: ['john.1', 'john.2'] }
    const cloud: Partial<SyncedState> = { readChapters: ['john.2', 'gen.1'] }
    const merged = mergeState(local, cloud)
    expect(merged.readChapters.sort()).toEqual(['gen.1', 'john.1', 'john.2'])
  })
})

describe('mergeState: recentChapters (union, dedup, cap)', () => {
  it('newer entry for the same chapter wins', () => {
    const local: Partial<SyncedState> = { recentChapters: [recent('john', 1, 1)] }
    const cloud: Partial<SyncedState> = { recentChapters: [recent('john', 1, 5)] }
    const merged = mergeState(local, cloud)
    expect(merged.recentChapters).toHaveLength(1)
    expect(merged.recentChapters[0].updatedAt).toBe(5)
  })

  it('sorts most-recent-first and caps at 12', () => {
    const local: Partial<SyncedState> = {
      recentChapters: Array.from({ length: 8 }, (_, i) => recent('john', i + 1, i + 1)),
    }
    const cloud: Partial<SyncedState> = {
      recentChapters: Array.from({ length: 8 }, (_, i) => recent('gen', i + 1, i + 100)),
    }
    const merged = mergeState(local, cloud)
    expect(merged.recentChapters).toHaveLength(12)
    expect(merged.recentChapters[0]).toEqual(recent('gen', 8, 107))
    // Descending by updatedAt throughout.
    for (let i = 1; i < merged.recentChapters.length; i++) {
      expect(merged.recentChapters[i - 1].updatedAt).toBeGreaterThan(merged.recentChapters[i].updatedAt)
    }
  })
})

describe('mergeState: settings (cloud wins when present)', () => {
  it('prefers cloud settings when both are present', () => {
    const local: Partial<SyncedState> = {
      settings: { theme: 'light', primaryTranslation: 'web', secondaryTranslation: 'kjv', parallelEnabled: false, fontFamily: 'serif', fontScale: 2 },
    }
    const cloud: Partial<SyncedState> = {
      settings: { theme: 'dark', primaryTranslation: 'web', secondaryTranslation: 'kjv', parallelEnabled: false, fontFamily: 'serif', fontScale: 2 },
    }
    const merged = mergeState(local, cloud)
    expect(merged.settings?.theme).toBe('dark')
  })

  it('falls back to local settings when cloud has none', () => {
    const local: Partial<SyncedState> = {
      settings: { theme: 'dark', primaryTranslation: 'web', secondaryTranslation: 'kjv', parallelEnabled: false, fontFamily: 'serif', fontScale: 2 },
    }
    const merged = mergeState(local, {})
    expect(merged.settings?.theme).toBe('dark')
  })
})

describe('mergeState: lastRead (newer updatedAt wins)', () => {
  it('picks the newer side', () => {
    const local: Partial<SyncedState> = { lastRead: { book: 'john', chapter: 1, updatedAt: 1 } }
    const cloud: Partial<SyncedState> = { lastRead: { book: 'gen', chapter: 3, updatedAt: 9 } }
    const merged = mergeState(local, cloud)
    expect(merged.lastRead).toEqual({ book: 'gen', chapter: 3, updatedAt: 9 })
  })

  it('is defensive about malformed/missing input', () => {
    const merged = mergeState(null, undefined)
    expect(merged).toEqual({
      notes: [],
      highlights: {},
      readChapters: [],
      recentChapters: [],
      settings: null,
      lastRead: null,
    })
  })
})

describe('isForeignLocalData', () => {
  it('is not foreign when no account has ever synced on this device', () => {
    expect(isForeignLocalData(null, 'user-a')).toBe(false)
  })

  it('is not foreign when the same account is signing in again', () => {
    expect(isForeignLocalData('user-a', 'user-a')).toBe(false)
  })

  it('is foreign when a different account left data behind on this device', () => {
    expect(isForeignLocalData('user-a', 'user-b')).toBe(true)
  })
})
