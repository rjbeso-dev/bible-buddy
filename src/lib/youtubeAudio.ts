// Thin wrapper around the YouTube IFrame Player API, used to let a pasted
// YouTube link play as looping background audio (the same "Sound" slot that
// otherwise plays a direct audio-file URL). A plain <audio src> can't play a
// YouTube page — there's no public API for extracting just the audio stream
// — so this drives an actual (small, visible) YouTube embed instead, per
// YouTube's embedding terms.

interface YouTubePlayerInstance {
  playVideo(): void
  pauseVideo(): void
  setVolume(volume: number): void
  getVideoData(): { title?: string }
  destroy(): void
}

interface YouTubePlayerEvent {
  target: YouTubePlayerInstance
}

interface YouTubeErrorEvent {
  data: number
}

interface YouTubePlayerCtor {
  new (
    el: HTMLElement,
    options: {
      videoId: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (e: YouTubePlayerEvent) => void
        onError?: (e: YouTubeErrorEvent) => void
      }
    },
  ): YouTubePlayerInstance
}

declare global {
  interface Window {
    YT?: { Player: YouTubePlayerCtor }
    onYouTubeIframeAPIReady?: () => void
  }
}

const ERROR_MESSAGES: Record<number, string> = {
  2: 'That’s not a valid YouTube video.',
  5: 'Couldn’t play that video here.',
  100: 'That video isn’t available (it may have been removed).',
  101: 'The video’s uploader has disabled playback in other apps.',
  150: 'The video’s uploader has disabled playback in other apps.',
}

/** youtube.com/watch?v=, youtu.be/, youtube.com/embed|shorts|live/ -> the 11-char video id. */
export function extractYouTubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '')
  const idPattern = /^[\w-]{11}$/

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1)
    return idPattern.test(id) ? id : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v')
      return id && idPattern.test(id) ? id : null
    }
    const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)
    return match ? match[1] : null
  }
  return null
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null
}

let apiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
  })
  return apiPromise
}

let containerEl: HTMLElement | null = null
let player: YouTubePlayerInstance | null = null
let readyVideoId: string | null = null

/** The persistent DOM node the player attaches to — registered once by the
 * component that renders it (AudioProvider), independent of any popover's
 * open/closed state so playback survives the Sound panel closing. */
export function registerYouTubeContainer(el: HTMLElement | null): void {
  containerEl = el
}

/** Load (or reuse, if already current) the player for `videoId`. Does not
 * start playback — mirrors setCustomAudioUrl's "set the source" role.
 * Resolves with the video's title once the player reports ready. */
export function ensureYouTubeVideo(videoId: string): Promise<string> {
  if (readyVideoId === videoId && player) {
    return Promise.resolve(player.getVideoData().title || 'YouTube')
  }
  if (!containerEl) return Promise.reject(new Error('YouTube player container not mounted.'))

  return loadYouTubeApi().then(
    () =>
      new Promise<string>((resolve, reject) => {
        if (player) {
          player.destroy()
          player = null
          readyVideoId = null
        }
        player = new window.YT!.Player(containerEl!, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            loop: 1,
            // Undocumented-but-standard trick to loop a single video: the
            // IFrame API's loop=1 only works when the "playlist" is the
            // video itself.
            playlist: videoId,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: (e) => {
              readyVideoId = videoId
              resolve(e.target.getVideoData().title || 'YouTube')
            },
            onError: (e) => {
              reject(new Error(ERROR_MESSAGES[e.data] ?? 'Couldn’t play that video.'))
            },
          },
        })
      }),
  )
}

export function playYouTube(): void {
  player?.playVideo()
}

export function pauseYouTube(): void {
  player?.pauseVideo()
}

/** `volume` is 0-1, matching the rest of the app; YouTube wants 0-100. */
export function setYouTubeVolume(volume: number): void {
  player?.setVolume(Math.round(volume * 100))
}

export function destroyYouTubePlayer(): void {
  if (player) {
    player.destroy()
    player = null
    readyVideoId = null
  }
}
