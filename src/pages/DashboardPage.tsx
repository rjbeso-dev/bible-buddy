import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSettings } from '../context/useSettings'
import { useChapter } from '../hooks/useChapter'
import { useNotes } from '../hooks/useNotes'
import { useHighlights } from '../hooks/useHighlights'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { readLastRead } from '../hooks/useLastRead'
import { formatReference, parseVerseKey } from '../lib/references'
import { verseOfTheDay } from '../data/dailyVerses'
import { getBook } from '../data/books'
import type { Highlight, Note, RecentChapter } from '../types'
import { BookChapterPicker } from '../components/navigation/BookChapterPicker'
import { Icon } from '../components/ui/Icon'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function readerHref(book: string, chapter: number, verse?: number): string {
  const base = `/read/${encodeURIComponent(book)}/${chapter}`
  return verse ? `${base}#v-${verse}` : base
}

/** First ~180 chars of the opening verses, for the "Continue reading" preview. */
function snippetFrom(verses: { text: string }[] | undefined): string {
  if (!verses || verses.length === 0) return ''
  const joined = verses
    .slice(0, 2)
    .map((v) => v.text)
    .join(' ')
    .trim()
  return joined.length > 200 ? joined.slice(0, 197).trimEnd() + '…' : joined
}

export function DashboardPage() {
  const { settings } = useSettings()
  const { notes } = useNotes()
  const { highlights } = useHighlights()
  const { recentChapters, chaptersReadCount } = useReadingProgress()

  const last = readLastRead()
  const lastMeta = getBook(last.book)

  const now = new Date()
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)

  // Cache-first snippet of the last-read chapter; never hard-fails offline.
  const continueChapter = useChapter(last.book, last.chapter, settings.primaryTranslation)
  const snippet = snippetFrom(continueChapter.chapter?.verses)

  const daily = verseOfTheDay(now)
  // Verse of the day always shows in ESV; the bundled text (WEB, public
  // domain) renders instantly and this fetch swaps it in once it lands, or
  // stays as the fallback if ESV isn't configured on this deployment.
  const dailyEsv = useChapter(daily.book, daily.chapter, 'esv')
  const dailyEsvVerse = dailyEsv.chapter?.verses.find((v) => v.verse === daily.verse)
  const dailyText = dailyEsvVerse?.text ?? daily.text

  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [notes],
  )

  const recentHighlights = useMemo(
    () =>
      Object.values(highlights)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [highlights],
  )

  return (
    <div className="dashboard">
      <header className="dash-masthead">
        <p className="dash-greeting">{greeting(now.getHours())}.</p>
        <p className="dash-date">{dateLabel}</p>
      </header>

      <div className="dash-grid">
        <div className="dash-main">
          <section className="dash-card dash-continue" aria-labelledby="dash-continue-h">
            <span className="dash-ribbon" aria-hidden="true" />
            <p className="dash-eyebrow">Continue reading</p>
            <h2 id="dash-continue-h" className="dash-ref">
              {lastMeta ? `${lastMeta.name} ${last.chapter}` : formatReference(last.book, last.chapter)}
            </h2>
            {snippet ? (
              <p className="dash-snippet">{snippet}</p>
            ) : (
              <p className="dash-snippet muted">
                Pick up where you left off and keep reading.
              </p>
            )}
            <Link
              to={readerHref(last.book, last.chapter, last.verse)}
              className="button primary dash-resume"
            >
              Resume <Icon name="arrow-right" size={16} />
            </Link>
          </section>

          <section className="dash-card dash-daily" aria-labelledby="dash-daily-h">
            <p className="dash-eyebrow">Verse of the day</p>
            <p className="dash-ref-sc" id="dash-daily-h">{daily.ref}</p>
            <p className="dash-verse">{dailyText}</p>
            <Link
              to={readerHref(daily.book, daily.chapter, daily.verse)}
              className="dash-inline-link"
            >
              Read full chapter <Icon name="arrow-right" size={14} />
            </Link>
          </section>
        </div>

        <aside className="dash-aside">
          <section className="dash-stats" aria-label="Your study at a glance">
            <StatItem icon="book" value={chaptersReadCount} label="Chapters read" />
            <StatItem icon="note" value={notes.length} label="Notes" />
            <StatItem icon="bookmark" value={Object.keys(highlights).length} label="Highlights" />
          </section>

          <section className="dash-block" aria-labelledby="dash-jump-h">
            <h3 id="dash-jump-h" className="dash-block-title">Jump back in</h3>
            {recentChapters.length > 0 ? (
              <ul className="dash-list">
                {recentChapters.slice(0, 6).map((c) => (
                  <RecentRow key={`${c.book}.${c.chapter}`} chapter={c} />
                ))}
              </ul>
            ) : (
              <div className="dash-empty">
                <p className="muted">Your recently opened chapters will collect here.</p>
                <Link to="/read/john/1" className="dash-inline-link">
                  Start with John 1 <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            )}
          </section>

          <section className="dash-block" aria-labelledby="dash-notes-h">
            <h3 id="dash-notes-h" className="dash-block-title">Recent notes</h3>
            {recentNotes.length > 0 ? (
              <ul className="dash-list">
                {recentNotes.map((n) => (
                  <NoteRow key={n.id} note={n} />
                ))}
              </ul>
            ) : (
              <p className="dash-empty muted">
                Tap a verse while reading and choose “Add note”.
              </p>
            )}
          </section>

          <section className="dash-block" aria-labelledby="dash-hl-h">
            <h3 id="dash-hl-h" className="dash-block-title">Recent highlights</h3>
            {recentHighlights.length > 0 ? (
              <ul className="dash-list">
                {recentHighlights.map((h) => (
                  <HighlightRow key={h.verseKey} highlight={h} />
                ))}
              </ul>
            ) : (
              <p className="dash-empty muted">
                Highlight a verse in five theme-aware colors as you read.
              </p>
            )}
          </section>

          <section className="dash-block dash-browse" aria-label="Browse the Bible">
            <h3 className="dash-block-title">Browse the Bible</h3>
            <BookChapterPicker book={last.book} chapter={last.chapter} />
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatItem({ icon, value, label }: { icon: 'book' | 'note' | 'bookmark'; value: number; label: string }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-icon" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <span className="dash-stat-value">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </div>
  )
}

function RecentRow({ chapter }: { chapter: RecentChapter }) {
  const meta = getBook(chapter.book)
  const name = meta ? `${meta.name} ${chapter.chapter}` : formatReference(chapter.book, chapter.chapter)
  return (
    <li className="dash-row">
      <Link to={readerHref(chapter.book, chapter.chapter)} className="dash-row-link">
        <span className="dash-row-ref">{name}</span>
        <span className="dash-row-meta">{chapter.translationId.toUpperCase()}</span>
      </Link>
    </li>
  )
}

function NoteRow({ note }: { note: Note }) {
  const parsed = note.verseKey ? parseVerseKey(note.verseKey) : null
  const href = parsed
    ? readerHref(parsed.book, parsed.chapter, parsed.verse)
    : `/notes/${note.id}`
  return (
    <li className="dash-row">
      <Link to={href} className="dash-row-link dash-row-note">
        <span className="dash-row-ref">{note.reference ?? note.title ?? 'Note'}</span>
        <span className="dash-row-preview">{note.body}</span>
      </Link>
    </li>
  )
}

function HighlightRow({ highlight }: { highlight: Highlight }) {
  const parsed = parseVerseKey(highlight.verseKey)
  const ref = parsed ? formatReference(parsed.book, parsed.chapter, parsed.verse) : highlight.verseKey
  const href = parsed
    ? readerHref(parsed.book, parsed.chapter, parsed.verse)
    : '/read'
  return (
    <li className="dash-row">
      <Link to={href} className="dash-row-link">
        <span className={'dash-swatch dash-swatch-' + highlight.color} aria-hidden="true" />
        <span className="dash-row-ref">{ref}</span>
      </Link>
    </li>
  )
}
