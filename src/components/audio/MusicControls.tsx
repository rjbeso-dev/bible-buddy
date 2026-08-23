import { useEffect, useRef, useState } from 'react'
import { useAudio } from '../../context/useAudio'
import { AMBIENT_SCENES } from '../../lib/audioEngine'
import { Icon } from '../ui/Icon'

interface MusicControlsProps {
  /** 'rail' renders the trigger as a full-width rail item and opens the panel to the right. */
  variant?: 'header' | 'rail'
}

export function MusicControls({ variant = 'header' }: MusicControlsProps = {}) {
  const isRail = variant === 'rail'
  const {
    isPlaying,
    mode,
    scene,
    volume,
    customUrl,
    customName,
    error,
    toggle,
    setScene,
    setMode,
    setVolume,
    setCustomUrl,
    loadFile,
  } = useAudio()
  const [open, setOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState(customUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUrlDraft(customUrl)
  }, [customUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const loadUrl = () => {
    const url = urlDraft.trim()
    if (url) setCustomUrl(url)
  }

  return (
    <div className={'music-controls' + (isRail ? ' rail-item-wrap' : '')}>
      <button
        type="button"
        className={(isRail ? 'rail-item' : 'icon-button') + (isPlaying ? ' is-active' : '')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Background sound"
        aria-label={isPlaying ? 'Background sound (playing)' : 'Background sound'}
      >
        {isPlaying ? (
          <span className={'eq' + (isRail ? ' eq-rail' : '')} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <Icon name="music" size={isRail ? 24 : 18} />
        )}
        {isRail && <span className="rail-item-label">Sound</span>}
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className={'music-panel' + (isRail ? ' panel-right' : '')}
            role="dialog"
            aria-label="Background sound"
          >
            <div className="music-transport">
              <button
                type="button"
                className="button primary music-play"
                onClick={toggle}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <span className="music-now" aria-live="polite">
                {mode === 'ambient'
                  ? AMBIENT_SCENES.find((s) => s.id === scene)?.label
                  : customName || 'No source yet'}
              </span>
            </div>

            <div className="segmented music-mode">
              <button
                type="button"
                className={'segmented-item' + (mode === 'ambient' ? ' is-active' : '')}
                onClick={() => setMode('ambient')}
                aria-pressed={mode === 'ambient'}
              >
                Ambient
              </button>
              <button
                type="button"
                className={'segmented-item' + (mode === 'custom' ? ' is-active' : '')}
                onClick={() => setMode('custom')}
                aria-pressed={mode === 'custom'}
              >
                My audio
              </button>
            </div>

            {mode === 'ambient' ? (
              <div className="music-section">
                <span className="font-controls-label">Soundscape</span>
                <div className="music-scenes">
                  {AMBIENT_SCENES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={'music-scene' + (scene === s.id ? ' is-active' : '')}
                      onClick={() => setScene(s.id)}
                      aria-pressed={scene === s.id}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="music-section">
                <span className="font-controls-label">Stream URL or YouTube link</span>
                <div className="music-url-row">
                  <input
                    type="url"
                    className="settings-input"
                    placeholder="https://… or a YouTube link"
                    value={urlDraft}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadUrl()
                    }}
                  />
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={loadUrl}
                    disabled={!urlDraft.trim()}
                  >
                    Load
                  </button>
                </div>
                <button
                  type="button"
                  className="button ghost small music-file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a file…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) loadFile(file)
                    e.target.value = ''
                  }}
                />
                {error && <p className="music-error">{error}</p>}
              </div>
            )}

            <div className="music-section">
              <span className="font-controls-label">Volume</span>
              <div className="music-volume">
                <Icon name="speaker" size={16} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
