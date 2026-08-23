// A single, consistent inline-SVG icon set (feather-style: currentColor,
// 1.5 stroke, round joins). Import <Icon name="..." /> everywhere instead of
// emoji or font glyphs so the UI reads as one coherent system.

import type { ReactElement, SVGProps } from 'react'

export type IconName =
  | 'book'
  | 'bookmark'
  | 'note'
  | 'sun'
  | 'moon'
  | 'type'
  | 'search'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'columns'
  | 'settings'
  | 'info'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'arrow-right'
  | 'close'
  | 'key'
  | 'sparkle'
  | 'music'
  | 'play'
  | 'pause'
  | 'speaker'
  | 'menu'
  | 'home'
  | 'sidebar'
  | 'cross'
  | 'user'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'list'
  | 'list-ordered'
  | 'highlighter'
  | 'image'
  | 'download'
  | 'file-text'
  | 'share'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** Pixel size for width and height. Defaults to 18. */
  size?: number
  title?: string
}

// Path/children markup for each icon, drawn on a 24×24 grid.
const PATHS: Record<IconName, ReactElement> = {
  // Open book, reads clearly as "read".
  book: (
    <>
      <path d="M12 6.4C10.2 5.2 7.6 4.8 5 5.2v12.7c2.6-.4 5.2 0 7 1.2" />
      <path d="M12 6.4c1.8-1.2 4.4-1.6 7-1.2v12.7c-2.6-.4-5.2 0-7 1.2" />
      <path d="M12 6.4v12.7" />
    </>
  ),
  bookmark: <path d="M6 4h12v16l-6-4-6 4z" />,
  // A note with a folded corner and a pencil.
  note: (
    <>
      <path d="M13.5 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5" />
      <path d="M8.5 9h4M8.5 12.5h3" />
      <path d="M17 3.5l3.5 3.5L15 12.5l-3.5.5.5-3.5z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  type: (
    <>
      <path d="M5 7V5h14v2" />
      <path d="M12 5v14M9 19h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  'chevron-left': <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  'chevron-down': <path d="M5 9l7 7 7-7" />,
  columns: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M12 5v14" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9 2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5 2 2 0 1 1 4 0 1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  edit: (
    <>
      <path d="M4 20l1-4.2L15.2 5.6a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20z" />
      <path d="M13.5 7.3l3.2 3.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8M16 16l2-2M14 18l2-2" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  music: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="17" cy="16" r="2.5" />
      <path d="M8.5 18V6l11-2v12" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  speaker: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  home: (
    <>
      <path d="M3.5 11 12 3.5 20.5 11" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9.5v-4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V20h3a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M15.5 4.5v15" />
    </>
  ),
  // Latin (Christian) cross.
  cross: <path d="M12 2.5v19M7.5 8.5h9" />,
  // A simple person: head + shoulders, for account/sign-in.
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  bold: (
    <>
      <path d="M6 4h6a3.5 3.5 0 0 1 0 7H6z" />
      <path d="M6 11h7a3.5 3.5 0 0 1 0 7H6z" />
    </>
  ),
  italic: <path d="M10 4h9M5 20h9M15 4l-6 16" />,
  underline: (
    <>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <path d="M4 20h16" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  'list-ordered': (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 4.5h1v3h-1" />
      <path d="M4 10.5h1.3L4 13h1.5" />
      <path d="M4 16.5h1.3a.7.7 0 0 1 0 1.4H4.7a.7.7 0 0 1 0 1.4H5.3" />
    </>
  ),
  // A marker/highlighter pen touching down, with a mark left on the page.
  highlighter: (
    <>
      <path d="M8.5 13.5l7-7a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8l-7 7-4-4z" />
      <path d="M8.5 13.5L5 17l-1 3 3-1 3.5-3.5" />
      <path d="M4 20h5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M4 17l5-5 3.5 3.5L17 10l3 3.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 11.5L12 16l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  'file-text': (
    <>
      <path d="M6.5 3.5h8l4 4v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5v4h4" />
      <path d="M8.5 12.5h7M8.5 15.5h7M8.5 18h4" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.6l7.6-4.2M8.2 13.4l7.6 4.2" />
    </>
  ),
}

export function Icon({ name, size = 18, title, ...rest }: IconProps) {
  const path = PATHS[name]
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {path}
    </svg>
  )
}
