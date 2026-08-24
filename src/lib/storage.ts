// Typed, namespaced, crash-safe localStorage helpers.
//
// Every read is defensive: corrupt JSON or unavailable storage falls back to
// the provided default and never throws to the UI. Writes swallow errors
// (including quota-exceeded) so callers can treat persistence as best-effort.

export const STORAGE_PREFIX = 'bsa.'

export const STORAGE_KEYS = {
  version: `${STORAGE_PREFIX}version`,
  settings: `${STORAGE_PREFIX}settings`,
  lastRead: `${STORAGE_PREFIX}lastRead`,
  notes: `${STORAGE_PREFIX}notes`,
  highlights: `${STORAGE_PREFIX}highlights`,
  cacheIndex: `${STORAGE_PREFIX}cache.index`,
  readChapters: `${STORAGE_PREFIX}readChapters`,
  recentChapters: `${STORAGE_PREFIX}recentChapters`,
  audio: `${STORAGE_PREFIX}audio`,
  railExpanded: `${STORAGE_PREFIX}railExpanded`,
  studyOpen: `${STORAGE_PREFIX}studyOpen`,
  noteBibleLastRead: `${STORAGE_PREFIX}noteBibleLastRead`,
  noteFolders: `${STORAGE_PREFIX}noteFolders`,
  syncOwner: `${STORAGE_PREFIX}sync.owner`,
} as const

export const STORAGE_VERSION = 1

// The keys that participate in optional cloud sync. Writes to these keys
// dispatch a window CustomEvent so a signed-in SyncProvider can debounce-push
// the change to the cloud; everything else (cache, audio, UI prefs) is local
// only and never triggers it.
const SYNCED_KEYS = new Set<string>([
  STORAGE_KEYS.notes,
  STORAGE_KEYS.highlights,
  STORAGE_KEYS.readChapters,
  STORAGE_KEYS.recentChapters,
  STORAGE_KEYS.settings,
  STORAGE_KEYS.lastRead,
])

/** Notify listeners (e.g. cloud sync) that a synced key changed. Never throws. */
function notifyDataChanged(key: string): void {
  if (!SYNCED_KEYS.has(key)) return
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bsa:datachanged', { detail: { key } }))
    }
  } catch {
    // ignore
  }
}

/** Return the localStorage object, or null if unavailable (SSR, privacy mode). */
function getStore(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** Read and JSON-parse a value, returning `fallback` on any problem. */
export function readJSON<T>(key: string, fallback: T): T {
  const store = getStore()
  if (!store) return fallback
  try {
    const raw = store.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * JSON-serialize and write a value. Returns true on success.
 * On quota-exceeded, invokes the optional `onQuotaExceeded` hook (which may
 * free space) and retries once.
 */
export function writeJSON(
  key: string,
  value: unknown,
  onQuotaExceeded?: () => void,
): boolean {
  const store = getStore()
  if (!store) return false
  const serialized = safeStringify(value)
  if (serialized === null) return false
  try {
    store.setItem(key, serialized)
    notifyDataChanged(key)
    return true
  } catch (err) {
    if (isQuotaError(err) && onQuotaExceeded) {
      try {
        onQuotaExceeded()
        store.setItem(key, serialized)
        notifyDataChanged(key)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

export function removeKey(key: string): void {
  const store = getStore()
  if (!store) return
  try {
    store.removeItem(key)
  } catch {
    // ignore
  }
}

/** List all keys currently in storage that start with a given prefix. */
export function keysWithPrefix(prefix: string): string[] {
  const store = getStore()
  if (!store) return []
  const out: string[] = []
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key && key.startsWith(prefix)) out.push(key)
    }
  } catch {
    // ignore
  }
  return out
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}
