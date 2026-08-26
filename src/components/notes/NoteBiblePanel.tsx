import { useState } from 'react'
import { useSettings } from '../../context/useSettings'
import { useChapter } from '../../hooks/useChapter'
import { getBook } from '../../data/books'
import { formatReference, parseVerseKey } from '../../lib/references'
import { STORAGE_KEYS, readJSON, writeJSON } from '../../lib/storage'
import { BookChapterPicker } from '../navigation/BookChapterPicker'
import { TranslationSelect } from '../reader/TranslationSelect'
import { Icon } from '../ui/Icon'

interface NoteBiblePanelProps {
  onInsert: (html: string) => void
  onClose: () => void
  /** The note's own verse tie, if any — takes priority over the
   * last-used-anywhere fallback below, so reopening a verse-tied note's
   * Bible panel lands on that note's own verse rather than wherever some
   * other note last left the panel. */
  initialVerseKey?: string
}

interface LastRead {
  book: string
  chapter: number
}

export function readLastBook(initialVerseKey: string | undefined): LastRead {
  const parsed = initialVerseKey ? parseVerseKey(initialVerseKey) : null
  if (parsed && getBook(parsed.book)) return { book: parsed.book, chapter: parsed.chapter }
  const saved = readJSON<LastRead | null>(STORAGE_KEYS.noteBibleLastRead, null)
  return saved && getBook(saved.book) ? saved : { book: 'john', chapter: 1 }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Read-only Bible browser beside the note composer — click a verse to quote
 * it into the note, so writing a sermon or study note never means leaving
 * the page to go check a reference. Shift-click extends a range so several
 * verses land in a single combined quote instead of one bubble each. */
export function NoteBiblePanel({ onInsert, onClose, initialVerseKey }: NoteBiblePanelProps) {
  const { settings } = useSettings()
  const initial = useState(() => readLastBook(initialVerseKey))[0]
  const [book, setBookState] = useState(initial.book)
  const [chapter, setChapterState] = useState(initial.chapter)
  const [translationId, setTranslationId] = useState(settings.primaryTranslation)
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const { chapter: data, status } = useChapter(book, chapter, translationId)
  const meta = getBook(book)

  const goTo = (b: string, c: number) => {
    setBookState(b)
    setChapterState(c)
    setSelected([])
    setAnchor(null)
    writeJSON(STORAGE_KEYS.noteBibleLastRead, { book: b, chapter: c })
  }

  const insertVerses = (verseNumbers: number[]) => {
    if (!data || verseNumbers.length === 0) return
    const nums = [...verseNumbers].sort((a, b) => a - b)
    const translation = escapeHtml(data.translationId.toUpperCase())
    if (nums.length === 1) {
      const v = data.verses.find((v) => v.verse === nums[0])
      if (!v) return
      onInsert(
        `<div class="note-quote"><strong>${escapeHtml(formatReference(book, chapter, v.verse))}</strong> ` +
          `<em>(${translation})</em><br>${escapeHtml(v.text)}</div><p><br></p>`,
      )
      return
    }
    const first = nums[0]
    const last = nums[nums.length - 1]
    const bookName = meta ? meta.name : book
    const range = `${bookName} ${chapter}:${first}–${last}`
    const body = nums
      .map((n) => {
        const v = data.verses.find((v) => v.verse === n)
        return v ? `<strong>${v.verse}</strong> ${escapeHtml(v.text)}` : ''
      })
      .filter(Boolean)
      .join(' ')
    onInsert(
      `<div class="note-quote"><strong>${escapeHtml(range)}</strong> ` +
        `<em>(${translation})</em><br>${body}</div><p><br></p>`,
    )
  }

  const clickVerse = (verseNum: number, shiftKey: boolean) => {
    if (shiftKey && anchor != null) {
      // Extends the last-clicked verse into a range, held for explicit
      // confirmation rather than inserted immediately — a plain click
      // should still quote just that one verse, unchanged.
      const lo = Math.min(anchor, verseNum)
      const hi = Math.max(anchor, verseNum)
      const range: number[] = []
      for (let n = lo; n <= hi; n++) range.push(n)
      setSelected(range)
      return
    }
    setAnchor(verseNum)
    setSelected([])
    insertVerses([verseNum])
  }

  const confirmInsert = () => {
    insertVerses(selected)
    setSelected([])
    setAnchor(null)
  }

  const cancelSelection = () => {
    setSelected([])
    setAnchor(null)
  }

  return (
    <aside className="note-bible-panel" aria-label="Bible reference">
      <header className="note-bible-panel-header">
        <BookChapterPicker book={book} chapter={chapter} onSelect={goTo} />
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close Bible panel">
          <Icon name="close" />
        </button>
      </header>
      <TranslationSelect compact label="Translation" value={translationId} onChange={setTranslationId} />
      <p className="note-bible-panel-hint muted">
        Tap a verse to quote it. Shift-click another to quote the whole range as one block.
      </p>
      <div className="note-bible-panel-body">
        {status === 'loading' && <p className="muted">Loading…</p>}
        {status === 'error' && <p className="muted">Couldn’t load this chapter.</p>}
        {data?.verses.map((v) => (
          <button
            key={v.verse}
            type="button"
            className={'note-bible-verse' + (selected.includes(v.verse) ? ' is-selected' : '')}
            onClick={(e) => clickVerse(v.verse, e.shiftKey)}
          >
            <sup>{v.verse}</sup> {v.text}
          </button>
        ))}
      </div>
      {selected.length > 1 && (
        <div className="note-bible-panel-selection">
          <span>{selected.length} verses selected</span>
          <button type="button" className="button ghost small" onClick={cancelSelection}>
            Cancel
          </button>
          <button type="button" className="button primary small" onClick={confirmInsert}>
            Insert as one quote
          </button>
        </div>
      )}
      {meta && <p className="note-bible-panel-credit muted">{meta.name} {chapter}</p>}
    </aside>
  )
}
