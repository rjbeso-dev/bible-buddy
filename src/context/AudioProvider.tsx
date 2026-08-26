import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AudioMode, AudioScene, AudioSettings } from '../types'
import { STORAGE_KEYS, readJSON, writeJSON } from '../lib/storage'
import { Icon } from '../components/ui/Icon'
import {
  startAmbientScene,
  stopAmbient,
  setAmbientVolume,
  setCustomAudioUrl,
  setCustomAudioFile,
  playCustomAudio,
  pauseCustomAudio,
  setCustomAudioVolume,
  setCustomAudioErrorHandler,
} from '../lib/audioEngine'
import {
  extractYouTubeId,
  isYouTubeUrl,
  registerYouTubeContainer,
  ensureYouTubeVideo,
  playYouTube,
  pauseYouTube,
  setYouTubeVolume,
  destroyYouTubePlayer,
} from '../lib/youtubeAudio'
import {
  AudioPlayerContext,
  DEFAULT_AUDIO_SETTINGS,
  type AudioContextValue,
} from './audioContext'

const VALID_SCENES: AudioScene[] = ['rain', 'pad', 'brown', 'chimes', 'ocean', 'wind', 'white', 'crickets']

/** Load persisted audio settings defensively. Never restores a playing state. */
function loadSettings(): Required<Pick<AudioSettings, 'mode' | 'scene' | 'volume'>> & {
  customUrl: string
  customName: string
} {
  const raw = readJSON<Partial<AudioSettings> | null>(STORAGE_KEYS.audio, null)
  const d = DEFAULT_AUDIO_SETTINGS
  if (!raw || typeof raw !== 'object') {
    return { mode: d.mode, scene: d.scene, volume: d.volume, customUrl: '', customName: '' }
  }
  return {
    mode: raw.mode === 'custom' ? 'custom' : 'ambient',
    scene: VALID_SCENES.includes(raw.scene as AudioScene) ? (raw.scene as AudioScene) : d.scene,
    volume:
      typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1
        ? raw.volume
        : d.volume,
    customUrl: typeof raw.customUrl === 'string' ? raw.customUrl : '',
    customName: typeof raw.customName === 'string' ? raw.customName : '',
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadSettings()).current
  const [isPlaying, setIsPlaying] = useState(false)
  const [mode, setModeState] = useState<AudioMode>(initial.mode)
  const [scene, setSceneState] = useState<AudioScene>(initial.scene)
  const [volume, setVolumeState] = useState(initial.volume)
  const [customUrl, setCustomUrlState] = useState(initial.customUrl)
  const [customName, setCustomName] = useState(initial.customName)
  const [error, setError] = useState<string | null>(null)
  // A local file was loaded this session (its object URL isn't persistable).
  const hasFileSource = useRef(false)
  // The persistent DOM node the YouTube IFrame player attaches to — stays
  // mounted regardless of the Sound popover's open/closed state, so a
  // YouTube source keeps playing after the panel closes (same as ambient
  // and file/stream playback already do).
  const youtubeContainerRef = useRef<HTMLDivElement>(null)
  const youtubeVideoId = mode === 'custom' ? extractYouTubeId(customUrl) : null
  // Shrinks the dock further without pausing — YouTube's embedding terms
  // require the player stay visible while playing, but say nothing about
  // how large, so a small still-visible dock is fine (same idea as
  // YouTube's own miniplayer).
  const [dockMinimized, setDockMinimized] = useState(false)

  useEffect(() => {
    registerYouTubeContainer(youtubeContainerRef.current)
    return () => registerYouTubeContainer(null)
  }, [])

  // Persist settings (never the playing state) whenever they change.
  useEffect(() => {
    const payload: AudioSettings = { mode, scene, volume }
    if (customUrl) payload.customUrl = customUrl
    if (customName) payload.customName = customName
    writeJSON(STORAGE_KEYS.audio, payload)
  }, [mode, scene, volume, customUrl, customName])

  // Surface errors from the underlying <audio> element.
  useEffect(() => {
    setCustomAudioErrorHandler((message) => {
      setError(message)
      setIsPlaying(false)
    })
    return () => setCustomAudioErrorHandler(null)
  }, [])

  // Takes the URL explicitly (rather than reading `customUrl` state) so
  // callers that just called setCustomUrlState() in the same tick — whose
  // new value React hasn't re-rendered with yet — can still start the
  // right source instead of racing the stale closure.
  const startCustomFor = useCallback(
    (url: string) => {
      const videoId = extractYouTubeId(url)
      if (videoId) {
        ensureYouTubeVideo(videoId)
          .then((title) => {
            setYouTubeVolume(volume)
            playYouTube()
            setError(null)
            setIsPlaying(true)
            setCustomName(title)
          })
          .catch((err: Error) => {
            setError(err.message || 'Couldn’t play that video.')
            setIsPlaying(false)
          })
        return
      }
      if (url) {
        setCustomAudioUrl(url)
      } else if (!hasFileSource.current) {
        setError('Add a stream URL or choose a file first.')
        setIsPlaying(false)
        return
      }
      setCustomAudioVolume(volume)
      playCustomAudio()
        .then(() => {
          setError(null)
          setIsPlaying(true)
        })
        .catch(() => {
          setError("Couldn't play that audio source.")
          setIsPlaying(false)
        })
    },
    [volume],
  )

  const startCustom = useCallback(() => startCustomFor(customUrl), [startCustomFor, customUrl])

  const play = useCallback(() => {
    setError(null)
    if (mode === 'ambient') {
      startAmbientScene(scene, volume)
      setIsPlaying(true)
    } else {
      startCustom()
    }
  }, [mode, scene, volume, startCustom])

  const pause = useCallback(() => {
    stopAmbient()
    pauseCustomAudio()
    pauseYouTube()
    setIsPlaying(false)
  }, [])

  const toggle = useCallback(() => {
    if (isPlaying) pause()
    else play()
  }, [isPlaying, pause, play])

  const setScene = useCallback(
    (id: AudioScene) => {
      setSceneState(id)
      if (isPlaying && mode === 'ambient') startAmbientScene(id, volume)
    },
    [isPlaying, mode, volume],
  )

  const setMode = useCallback(
    (next: AudioMode) => {
      if (next === mode) return
      const wasPlaying = isPlaying
      if (wasPlaying) {
        stopAmbient()
        pauseCustomAudio()
        pauseYouTube()
      }
      setModeState(next)
      setError(null)
      if (wasPlaying) {
        if (next === 'ambient') {
          startAmbientScene(scene, volume)
          setIsPlaying(true)
        } else {
          startCustom()
        }
      }
    },
    [mode, isPlaying, scene, volume, startCustom],
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    setAmbientVolume(v)
    setCustomAudioVolume(v)
    setYouTubeVolume(v)
  }, [])

  const setCustomUrl = useCallback(
    (url: string, name?: string) => {
      hasFileSource.current = false
      setCustomUrlState(url)
      setCustomName(name ?? url)
      setError(null)
      if (isYouTubeUrl(url)) {
        // startCustomFor below loads it through ensureYouTubeVideo — never
        // through the plain <audio> element, which can't play a YouTube
        // page at all.
      } else {
        destroyYouTubePlayer()
        if (url) setCustomAudioUrl(url)
      }
      if (isPlaying && mode === 'custom') startCustomFor(url)
    },
    [isPlaying, mode, startCustomFor],
  )

  const loadFile = useCallback(
    (file: File) => {
      const url = setCustomAudioFile(file)
      if (!url) {
        setError('Audio playback is not supported in this browser.')
        return
      }
      destroyYouTubePlayer()
      hasFileSource.current = true
      setCustomUrlState('') // object URLs don't survive a reload, so don't persist one
      setCustomName(file.name)
      setError(null)
      if (isPlaying && mode === 'custom') startCustomFor('')
    },
    [isPlaying, mode, startCustomFor],
  )

  const value = useMemo<AudioContextValue>(
    () => ({
      isPlaying,
      mode,
      scene,
      volume,
      customUrl,
      customName,
      error,
      play,
      pause,
      toggle,
      setScene,
      setMode,
      setVolume,
      setCustomUrl,
      loadFile,
    }),
    [
      isPlaying,
      mode,
      scene,
      volume,
      customUrl,
      customName,
      error,
      play,
      pause,
      toggle,
      setScene,
      setMode,
      setVolume,
      setCustomUrl,
      loadFile,
    ],
  )

  return (
    <AudioPlayerContext value={value}>
      {children}
      {/* Persistent YouTube embed for the Sound feature's "custom" source.
          Kept mounted (visibility toggled by CSS on this outer wrapper,
          never on the inner node) regardless of the Sound popover's
          open/closed state — the IFrame API replaces the inner div with
          its own <iframe>, so React must never touch that node again
          after mount. Only shown while actually playing: YouTube's
          embedding terms require it stay visible during playback, but a
          paused/closed player has nothing playing to require that, so the
          close button below just pauses — which also hides the dock — and
          it reappears on its own the next time playback resumes. */}
      <div
        className={
          'youtube-audio-dock' +
          (youtubeVideoId && isPlaying ? ' is-active' : '') +
          (dockMinimized ? ' is-minimized' : '')
        }
        aria-hidden={!(youtubeVideoId && isPlaying)}
      >
        <button
          type="button"
          className="youtube-audio-dock-minimize"
          onClick={() => setDockMinimized((m) => !m)}
          aria-label={dockMinimized ? 'Restore video size' : 'Minimize video'}
          title={dockMinimized ? 'Restore video size' : 'Minimize video'}
        >
          <Icon name="chevron-down" size={14} className={dockMinimized ? 'is-flipped' : undefined} />
        </button>
        <button
          type="button"
          className="youtube-audio-dock-close"
          onClick={pause}
          aria-label="Close and pause"
          title="Close and pause"
        >
          <Icon name="close" size={14} />
        </button>
        <div ref={youtubeContainerRef} />
      </div>
    </AudioPlayerContext>
  )
}
