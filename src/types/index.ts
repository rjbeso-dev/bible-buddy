// Shared type definitions for the Bible Study App.

export type Testament = 'OT' | 'NT'

export interface BookMeta {
  /** API slug / URL id, e.g. "john", "1 corinthians". Also used in route params. */
  id: string
  /** Display name, e.g. "John", "1 Corinthians". */
  name: string
  testament: Testament
  chapterCount: number
  /** Standard (KJV/WEB) versification verse count. */
  verseCount: number
  /** Short 1-2 sentence introduction. */
  intro: string
  /** Traditional/most-accepted author, honest about disputed attribution. */
  author: string
  /** Approximate date of writing, e.g. "c. 1446–1406 BC". */
  written: string
  /** Where it was written or its origin/setting. */
  place: string
  /** Original recipients/audience. */
  audience: string
  /** Category, e.g. "Law / Torah", "Gospel", "Pauline Epistle". */
  genre: string
  /** Short phrase of key themes. */
  themes: string
  /** 1-2 sentence expansion of `themes` for the fuller book-overview card. */
  keyThemesDetail: string
  /** Why the book was written, as 2 short statements. */
  purpose: string[]
  /** A simple chapter-range (or verse-range, for 1-chapter books) outline. */
  structure: { range: string; label: string }[]
  /** A representative verse, e.g. "Joshua 24:15" — linked into the reader
   * rather than stored as text, so it always shows in the reader's own
   * translation rather than a hardcoded copy. */
  keyVerseRef: string
}

export interface Verse {
  book_id: string
  book_name: string
  chapter: number
  verse: number
  text: string
}

export interface Chapter {
  reference: string
  translationId: string
  translationName: string
  /** Book id (slug) this chapter belongs to. */
  book: string
  chapter: number
  verses: Verse[]
}

export type ThemeMode = 'light' | 'dark'

export type FontFamily = 'serif' | 'sans' | 'comfort' | 'mono'

export interface Settings {
  theme: ThemeMode
  primaryTranslation: string
  secondaryTranslation: string
  parallelEnabled: boolean
  fontFamily: FontFamily
  /** Index 0..6 into the font-size scale. */
  fontScale: number
}

export interface LastRead {
  book: string
  chapter: number
  verse?: number
  updatedAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange'

export interface Highlight {
  verseKey: string
  color: HighlightColor
  updatedAt: number
}

export interface Note {
  id: string
  /** Present for notes tied to a single verse (added while reading). */
  verseKey?: string
  /** Verse reference (verse-tied notes) or a short label (standalone notes). */
  reference?: string
  /** User-chosen title for a standalone note, e.g. "Sunday sermon — Romans 8". */
  title?: string
  /** Plain-text body — always kept in sync, used for previews/search. */
  body: string
  /** Sanitized rich-text HTML, when the note was written with formatting. */
  bodyHtml?: string
  /** Present once this note has been published to a public share link
   * (the id of its row in the `shared_notes` table). */
  shareId?: string
  /** Present once the note's been moved into a folder (see NoteFolder). */
  folderId?: string
  createdAt: number
  updatedAt: number
}

export interface NoteFolder {
  id: string
  name: string
  createdAt: number
}

export interface CachedChapter {
  data: Chapter
  fetchedAt: number
}

/** A chapter the reader has opened, most-recent-first in the recent list. */
export interface RecentChapter {
  book: string
  chapter: number
  translationId: string
  updatedAt: number
}

/** A bundled, public-domain verse used by the "Verse of the day" module. */
export interface DailyVerse {
  ref: string
  book: string
  chapter: number
  verse: number
  text: string
}

/** Loading/fetch status for a chapter request. */
export type ChapterStatus = 'idle' | 'loading' | 'ready' | 'error' | 'offline'

/** Generated ambient soundscape identifiers. */
export type AudioScene = 'rain' | 'pad' | 'brown' | 'chimes' | 'ocean' | 'wind' | 'white' | 'crickets'

/** Whether the background player is using a generated scene or the user's own audio. */
export type AudioMode = 'ambient' | 'custom'

/** Persisted background-audio player settings (never includes isPlaying). */
export interface AudioSettings {
  mode: AudioMode
  scene: AudioScene
  /** 0..1 */
  volume: number
  customUrl?: string
  customName?: string
}
