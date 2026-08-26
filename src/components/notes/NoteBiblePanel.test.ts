import { describe, it, expect, beforeEach } from 'vitest'
import { readLastBook } from './NoteBiblePanel'
import { STORAGE_KEYS } from '../../lib/storage'

describe('readLastBook', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("prefers the note's own verse tie over any last-used-anywhere memory", () => {
    localStorage.setItem(STORAGE_KEYS.noteBibleLastRead, JSON.stringify({ book: 'genesis', chapter: 3 }))
    expect(readLastBook('matthew.28.23')).toEqual({ book: 'matthew', chapter: 28 })
  })

  it('falls back to last-used-anywhere when the note has no verse tie', () => {
    localStorage.setItem(STORAGE_KEYS.noteBibleLastRead, JSON.stringify({ book: 'genesis', chapter: 3 }))
    expect(readLastBook(undefined)).toEqual({ book: 'genesis', chapter: 3 })
  })

  it('falls back to last-used-anywhere when the verse key is malformed', () => {
    localStorage.setItem(STORAGE_KEYS.noteBibleLastRead, JSON.stringify({ book: 'genesis', chapter: 3 }))
    expect(readLastBook('not-a-verse-key')).toEqual({ book: 'genesis', chapter: 3 })
  })

  it('falls back to last-used-anywhere when the verse key names an unknown book', () => {
    localStorage.setItem(STORAGE_KEYS.noteBibleLastRead, JSON.stringify({ book: 'genesis', chapter: 3 }))
    expect(readLastBook('notabook.1.1')).toEqual({ book: 'genesis', chapter: 3 })
  })

  it('defaults to John 1 when neither a verse tie nor any memory exists', () => {
    expect(readLastBook(undefined)).toEqual({ book: 'john', chapter: 1 })
  })
})
