import { describe, it, expect, beforeEach } from 'vitest'
import type { AudioSettings } from '../types'
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage'
import { DEFAULT_AUDIO_SETTINGS } from './audioContext'
import { AMBIENT_SCENES } from '../lib/audioEngine'

beforeEach(() => {
  localStorage.clear()
})

describe('audio settings', () => {
  it('exposes the ambient scenes in order', () => {
    expect(AMBIENT_SCENES.map((s) => s.id)).toEqual([
      'rain',
      'ocean',
      'wind',
      'pad',
      'brown',
      'white',
      'chimes',
      'crickets',
    ])
  })

  it('has sensible defaults (never playing) that persist and round-trip', () => {
    expect(DEFAULT_AUDIO_SETTINGS.mode).toBe('ambient')
    expect(DEFAULT_AUDIO_SETTINGS.volume).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_AUDIO_SETTINGS.volume).toBeLessThanOrEqual(1)
    // No isPlaying-type field is persisted.
    expect('isPlaying' in DEFAULT_AUDIO_SETTINGS).toBe(false)

    const payload: AudioSettings = {
      mode: 'custom',
      scene: 'chimes',
      volume: 0.3,
      customUrl: 'https://example.com/stream',
      customName: 'My stream',
    }
    writeJSON(STORAGE_KEYS.audio, payload)
    const back = readJSON<AudioSettings | null>(STORAGE_KEYS.audio, null)
    expect(back).toEqual(payload)
  })

  it('falls back to defaults for a missing key without throwing', () => {
    const back = readJSON<AudioSettings | null>(STORAGE_KEYS.audio, null)
    expect(back).toBeNull()
  })
})
