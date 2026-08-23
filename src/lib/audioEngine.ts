// A small, framework-agnostic Web Audio engine for generated ambient
// soundscapes, plus a thin wrapper around a single HTMLAudioElement for the
// user's own stream URL / local file.
//
// IMPORTANT: nothing here constructs an AudioContext (or calls
// HTMLMediaElement#play) at import time. Browsers block audio until a user
// gesture, and jsdom has no Web Audio implementation at all — every entry
// point below is safe to call from a render, but only actually creates
// audio nodes / starts playback when invoked from a real user action.

import type { AudioScene } from '../types'

export interface AmbientSceneOption {
  id: AudioScene
  label: string
}

/** The generated ambient scenes, in display order. */
export const AMBIENT_SCENES: AmbientSceneOption[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'ocean', label: 'Ocean waves' },
  { id: 'wind', label: 'Wind' },
  { id: 'pad', label: 'Warm pad' },
  { id: 'brown', label: 'Brown noise' },
  { id: 'white', label: 'White noise' },
  { id: 'chimes', label: 'Chimes' },
  { id: 'crickets', label: 'Crickets' },
]

/** Fade duration (seconds) used for start/stop/scene-change transitions. */
const FADE_SECONDS = 0.4
/** setTargetAtTime time constant that settles to ~95% within FADE_SECONDS. */
const FADE_TAU = FADE_SECONDS / 3
const NOISE_SECONDS = 4

interface SceneHandle {
  stop: () => void
}

type SceneBuilder = (ctx: AudioContext, destination: AudioNode) => SceneHandle

interface ActiveScene {
  id: AudioScene
  gain: GainNode
  handle: SceneHandle
}

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let active: ActiveScene | null = null

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: new () => AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Whether this browser can play generated ambient scenes at all. */
export function isAmbientSupported(): boolean {
  return getAudioContextCtor() !== null
}

/** Lazily create the shared AudioContext + master gain. Never call at mount. */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null
  const created = new Ctor()
  const gain = created.createGain()
  gain.gain.value = 0
  gain.connect(created.destination)
  ctx = created
  masterGain = gain
  return created
}

// ---------------------------------------------------------------------------
// Noise generation
// ---------------------------------------------------------------------------

/** Build a short, seamless-enough looping noise buffer. */
function createNoiseBuffer(audioCtx: AudioContext, kind: 'white' | 'brown', seconds = NOISE_SECONDS): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * audioCtx.sampleRate))
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }
  // Brown noise: integrate white noise (a random walk), then scale back
  // down — the running sum grows in amplitude, so we normalize as we go.
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function createLoopingNoiseSource(
  audioCtx: AudioContext,
  kind: 'white' | 'brown',
): AudioBufferSourceNode {
  const source = audioCtx.createBufferSource()
  source.buffer = createNoiseBuffer(audioCtx, kind)
  source.loop = true
  return source
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/** Rain: brown noise shaped to a rainfall band, with a slow swelling gain. */
function buildRain(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  const source = createLoopingNoiseSource(audioCtx, 'brown')

  const highpass = audioCtx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 300

  const lowpass = audioCtx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 1500

  const swell = audioCtx.createGain()
  swell.gain.value = 0.8

  const lfo = audioCtx.createOscillator()
  lfo.frequency.value = 0.15
  const lfoDepth = audioCtx.createGain()
  lfoDepth.gain.value = 0.15
  lfo.connect(lfoDepth)
  lfoDepth.connect(swell.gain)

  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(swell)
  swell.connect(destination)

  source.start()
  lfo.start()

  return {
    stop: () => {
      source.stop()
      lfo.stop()
      source.disconnect()
      highpass.disconnect()
      lowpass.disconnect()
      swell.disconnect()
      lfo.disconnect()
      lfoDepth.disconnect()
    },
  }
}

/** Warm pad: detuned oscillators on a soft low chord, cutoff breathing slowly. */
function buildPad(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  // C2, G2, C3, E3
  const notes: [number, OscillatorType][] = [
    [65.41, 'sine'],
    [98.0, 'triangle'],
    [130.81, 'sine'],
    [164.81, 'triangle'],
  ]

  const lowpass = audioCtx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 800

  const sum = audioCtx.createGain()
  sum.gain.value = 0.16

  const oscillators = notes.map(([freq, type]) => {
    const osc = audioCtx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    osc.detune.value = (3 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1)
    osc.connect(sum)
    osc.start()
    return osc
  })

  sum.connect(lowpass)
  lowpass.connect(destination)

  const lfo = audioCtx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoDepth = audioCtx.createGain()
  lfoDepth.gain.value = 250
  lfo.connect(lfoDepth)
  lfoDepth.connect(lowpass.frequency)
  lfo.start()

  return {
    stop: () => {
      oscillators.forEach((osc) => {
        osc.stop()
        osc.disconnect()
      })
      lfo.stop()
      lfo.disconnect()
      lfoDepth.disconnect()
      sum.disconnect()
      lowpass.disconnect()
    },
  }
}

/** Brown noise: steady, gently lowpassed, for focus. */
function buildBrown(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  const source = createLoopingNoiseSource(audioCtx, 'brown')
  const lowpass = audioCtx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 1000

  source.connect(lowpass)
  lowpass.connect(destination)
  source.start()

  return {
    stop: () => {
      source.stop()
      source.disconnect()
      lowpass.disconnect()
    },
  }
}

/** Chimes: generative bell notes over a feedback delay, music-box feel. */
function buildChimes(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  // C major pentatonic across ~2 octaves: C4 D4 E4 G4 A4 C5 D5 E5 G5 A5
  const pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0]

  const delay = audioCtx.createDelay(1)
  delay.delayTime.value = 0.3
  const feedback = audioCtx.createGain()
  feedback.gain.value = 0.3
  const wet = audioCtx.createGain()
  wet.gain.value = 0.45
  const dry = audioCtx.createGain()
  dry.gain.value = 0.7

  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(destination)
  dry.connect(destination)

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const voices = new Set<{ osc: OscillatorNode; gain: GainNode }>()

  function playNote(): void {
    const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)]
    const osc = audioCtx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const noteGain = audioCtx.createGain()
    const now = audioCtx.currentTime
    const attackEnd = now + 0.01
    const decaySeconds = 2 + Math.random() * 2
    noteGain.gain.setValueAtTime(0, now)
    noteGain.gain.linearRampToValueAtTime(0.22, attackEnd)
    noteGain.gain.exponentialRampToValueAtTime(0.0005, attackEnd + decaySeconds)

    osc.connect(noteGain)
    noteGain.connect(dry)
    noteGain.connect(delay)

    const voice = { osc, gain: noteGain }
    voices.add(voice)
    osc.start(now)
    osc.stop(attackEnd + decaySeconds + 0.1)
    osc.onended = () => {
      osc.disconnect()
      noteGain.disconnect()
      voices.delete(voice)
    }
  }

  function scheduleNext(): void {
    const wait = (2 + Math.random() * 4) * 1000
    timer = setTimeout(() => {
      if (stopped) return
      playNote()
      scheduleNext()
    }, wait)
  }

  scheduleNext()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      voices.forEach(({ osc, gain }) => {
        osc.onended = null
        osc.stop()
        osc.disconnect()
        gain.disconnect()
      })
      voices.clear()
      delay.disconnect()
      feedback.disconnect()
      wet.disconnect()
      dry.disconnect()
    },
  }
}

/** Ocean waves: brown noise with a slow, wide swell — like rain but lower
 * and much slower, so it reads as rolling surf rather than rainfall. */
function buildOcean(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  const source = createLoopingNoiseSource(audioCtx, 'brown')

  const lowpass = audioCtx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 700

  const swell = audioCtx.createGain()
  swell.gain.value = 0.7

  const lfo = audioCtx.createOscillator()
  lfo.frequency.value = 0.06
  const lfoDepth = audioCtx.createGain()
  lfoDepth.gain.value = 0.35
  lfo.connect(lfoDepth)
  lfoDepth.connect(swell.gain)

  source.connect(lowpass)
  lowpass.connect(swell)
  swell.connect(destination)

  source.start()
  lfo.start()

  return {
    stop: () => {
      source.stop()
      lfo.stop()
      source.disconnect()
      lowpass.disconnect()
      swell.disconnect()
      lfo.disconnect()
      lfoDepth.disconnect()
    },
  }
}

/** Wind: bandpass-filtered white noise with a slowly wandering center
 * frequency and resonance, for a howling-gust character. */
function buildWind(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  const source = createLoopingNoiseSource(audioCtx, 'white')

  const bandpass = audioCtx.createBiquadFilter()
  bandpass.type = 'bandpass'
  bandpass.frequency.value = 500
  bandpass.Q.value = 0.7

  const gain = audioCtx.createGain()
  gain.gain.value = 0.5

  const freqLfo = audioCtx.createOscillator()
  freqLfo.frequency.value = 0.045
  const freqDepth = audioCtx.createGain()
  freqDepth.gain.value = 350
  freqLfo.connect(freqDepth)
  freqDepth.connect(bandpass.frequency)

  const gustLfo = audioCtx.createOscillator()
  gustLfo.frequency.value = 0.09
  const gustDepth = audioCtx.createGain()
  gustDepth.gain.value = 0.25
  gustLfo.connect(gustDepth)
  gustDepth.connect(gain.gain)

  source.connect(bandpass)
  bandpass.connect(gain)
  gain.connect(destination)

  source.start()
  freqLfo.start()
  gustLfo.start()

  return {
    stop: () => {
      source.stop()
      freqLfo.stop()
      gustLfo.stop()
      source.disconnect()
      bandpass.disconnect()
      gain.disconnect()
      freqLfo.disconnect()
      freqDepth.disconnect()
      gustLfo.disconnect()
      gustDepth.disconnect()
    },
  }
}

/** Plain white noise, gently lowpassed to take the harshest edge off —
 * flat and steady, for masking rather than atmosphere. */
function buildWhite(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  const source = createLoopingNoiseSource(audioCtx, 'white')
  const lowpass = audioCtx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 6000

  const gain = audioCtx.createGain()
  gain.gain.value = 0.35

  source.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(destination)
  source.start()

  return {
    stop: () => {
      source.stop()
      source.disconnect()
      lowpass.disconnect()
      gain.disconnect()
    },
  }
}

/** Crickets: quick, high-pitched chirp bursts at randomized intervals —
 * built the same way as the chimes scene's note scheduler, but faster,
 * higher, and dry (no delay/reverb — crickets don't echo). */
function buildCrickets(audioCtx: AudioContext, destination: AudioNode): SceneHandle {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const voices = new Set<{ osc: OscillatorNode; gain: GainNode }>()

  function playChirp(): void {
    const freq = 2600 + Math.random() * 1400
    const pulses = 2 + Math.floor(Math.random() * 3)
    const now = audioCtx.currentTime
    const pulseGap = 0.045

    for (let i = 0; i < pulses; i++) {
      const osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq + (Math.random() * 60 - 30)

      const noteGain = audioCtx.createGain()
      const start = now + i * pulseGap
      const attackEnd = start + 0.004
      const decayEnd = attackEnd + 0.03
      noteGain.gain.setValueAtTime(0, start)
      noteGain.gain.linearRampToValueAtTime(0.06, attackEnd)
      noteGain.gain.exponentialRampToValueAtTime(0.0005, decayEnd)

      osc.connect(noteGain)
      noteGain.connect(destination)

      const voice = { osc, gain: noteGain }
      voices.add(voice)
      osc.start(start)
      osc.stop(decayEnd + 0.02)
      osc.onended = () => {
        osc.disconnect()
        noteGain.disconnect()
        voices.delete(voice)
      }
    }
  }

  function scheduleNext(): void {
    const wait = (0.6 + Math.random() * 2.5) * 1000
    timer = setTimeout(() => {
      if (stopped) return
      playChirp()
      scheduleNext()
    }, wait)
  }

  scheduleNext()

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      voices.forEach(({ osc, gain }) => {
        osc.onended = null
        osc.stop()
        osc.disconnect()
        gain.disconnect()
      })
      voices.clear()
    },
  }
}

const SCENE_BUILDERS: Record<AudioScene, SceneBuilder> = {
  rain: buildRain,
  pad: buildPad,
  brown: buildBrown,
  chimes: buildChimes,
  ocean: buildOcean,
  wind: buildWind,
  white: buildWhite,
  crickets: buildCrickets,
}

// ---------------------------------------------------------------------------
// Public ambient controls
// ---------------------------------------------------------------------------

function fadeOutAndTeardown(entry: ActiveScene): void {
  if (!ctx) return
  const now = ctx.currentTime
  entry.gain.gain.cancelScheduledValues(now)
  entry.gain.gain.setTargetAtTime(0, now, FADE_TAU)
  setTimeout(() => {
    entry.handle.stop()
    entry.gain.disconnect()
  }, FADE_SECONDS * 1000 * 2)
}

/** Start (or switch to) an ambient scene, fading out whatever was playing. */
export function startAmbientScene(scene: AudioScene, volume: number): void {
  const audioCtx = ensureContext()
  if (!audioCtx || !masterGain) return
  if (audioCtx.state === 'suspended') void audioCtx.resume()

  const now = audioCtx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setTargetAtTime(volume, now, FADE_TAU)

  if (active) {
    fadeOutAndTeardown(active)
    active = null
  }

  const sceneGain = audioCtx.createGain()
  sceneGain.gain.value = 0
  sceneGain.connect(masterGain)
  const handle = SCENE_BUILDERS[scene](audioCtx, sceneGain)
  sceneGain.gain.setTargetAtTime(1, now, FADE_TAU)

  active = { id: scene, gain: sceneGain, handle }
}

/** Fade out and stop the current ambient scene, if any. */
export function stopAmbient(): void {
  if (!ctx || !masterGain) return
  const now = ctx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setTargetAtTime(0, now, FADE_TAU)
  if (active) {
    const entry = active
    active = null
    setTimeout(() => {
      entry.handle.stop()
      entry.gain.disconnect()
    }, FADE_SECONDS * 1000 * 2)
  }
}

/** Smoothly ramp the ambient master volume. No-op until playback has started. */
export function setAmbientVolume(volume: number): void {
  if (!ctx || !masterGain) return
  const now = ctx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setTargetAtTime(volume, now, 0.08)
}

// ---------------------------------------------------------------------------
// Custom audio (stream URL / local file) via a single HTMLAudioElement
// ---------------------------------------------------------------------------

let customAudioEl: HTMLAudioElement | null = null
let customObjectUrl: string | null = null
let customErrorHandler: ((message: string) => void) | null = null

/** Whether the browser can construct an HTMLAudioElement at all. */
export function isCustomAudioSupported(): boolean {
  return typeof Audio !== 'undefined'
}

/** Register the callback invoked when the underlying element errors. */
export function setCustomAudioErrorHandler(handler: ((message: string) => void) | null): void {
  customErrorHandler = handler
}

function ensureCustomAudioElement(): HTMLAudioElement | null {
  if (customAudioEl) return customAudioEl
  if (!isCustomAudioSupported()) return null
  const el = new Audio()
  el.loop = true
  el.addEventListener('error', () => {
    customErrorHandler?.("Couldn't play that audio source.")
  })
  customAudioEl = el
  return el
}

function revokeCustomObjectUrl(): void {
  if (customObjectUrl) {
    URL.revokeObjectURL(customObjectUrl)
    customObjectUrl = null
  }
}

/** Point the custom player at a stream URL (does not start playback). */
export function setCustomAudioUrl(url: string): void {
  const el = ensureCustomAudioElement()
  if (!el) return
  revokeCustomObjectUrl()
  el.src = url
}

/** Point the custom player at a local file, returning its object URL. */
export function setCustomAudioFile(file: File): string | null {
  const el = ensureCustomAudioElement()
  if (!el) return null
  revokeCustomObjectUrl()
  const url = URL.createObjectURL(file)
  customObjectUrl = url
  el.src = url
  return url
}

/** Play the custom audio element from its current source. */
export function playCustomAudio(): Promise<void> {
  const el = ensureCustomAudioElement()
  if (!el) return Promise.reject(new Error('Audio playback is not supported in this browser.'))
  const result = el.play()
  return result instanceof Promise ? result : Promise.resolve()
}

export function pauseCustomAudio(): void {
  customAudioEl?.pause()
}

/** Set the custom element's volume. No-op until a source has been loaded. */
export function setCustomAudioVolume(volume: number): void {
  if (customAudioEl) customAudioEl.volume = volume
}
