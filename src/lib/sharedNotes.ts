// Public "share this note" links: a snapshot of a note's content, published
// to a public (RLS: select-by-anyone) row keyed by an unguessable client-
// generated UUID — "anyone with the link" sharing, not a public listing.
// Requires accounts to be configured (there's nowhere to publish to
// otherwise); every export here no-ops or rejects cleanly when they aren't.

import { supabase } from './supabase'
import { sanitizeNoteHtml, plainTextToHtml } from './sanitizeNoteHtml'

export interface SharedNote {
  title: string | null
  reference: string | null
  bodyHtml: string
  updatedAt: string
}

/** Publishes whatever the composer currently shows — the live draft, not
 * necessarily the last-saved note — same as Export. */
export interface ShareableNoteInput {
  /** Pass the note's existing shareId to update its link in place, or
   * omit to mint a new one. */
  shareId?: string
  title?: string
  reference?: string
  body: string
  bodyHtml?: string
}

function newShareId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback matching useNotes' newId() — vanishingly unlikely to be
  // needed given randomUUID's broad support, but keeps this dependency-free.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Publish (or refresh) a note's current content to its public link.
 * Reuses the note's existing shareId if it has one, otherwise mints a new
 * one. Returns the shareId to save onto the local note. */
export async function shareNote(note: ShareableNoteInput, ownerId: string): Promise<string> {
  if (!supabase) throw new Error('Sharing isn’t available — accounts aren’t configured for this site.')
  const shareId = note.shareId ?? newShareId()
  const bodyHtml = sanitizeNoteHtml(note.bodyHtml ?? plainTextToHtml(note.body))
  const { error } = await supabase.from('shared_notes').upsert({
    id: shareId,
    owner_id: ownerId,
    title: note.title?.trim() || null,
    reference: note.reference?.trim() || null,
    body_html: bodyHtml,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return shareId
}

/** Revoke a note's public link. */
export async function unshareNote(shareId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('shared_notes').delete().eq('id', shareId)
  if (error) throw new Error(error.message)
}

/** Fetch a shared note for public, read-only display. Returns null both
 * when the id doesn't exist and when Supabase isn't configured — the
 * caller shows the same "not found" state either way. */
export async function fetchSharedNote(shareId: string): Promise<SharedNote | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('shared_notes')
    .select('title, reference, body_html, updated_at')
    .eq('id', shareId)
    .maybeSingle()
  if (error || !data) return null
  return {
    title: data.title,
    reference: data.reference,
    bodyHtml: data.body_html,
    updatedAt: data.updated_at,
  }
}

/** The public URL for a shared note, from the current origin. */
export function sharedNoteUrl(shareId: string): string {
  return `${window.location.origin}/shared/${shareId}`
}
