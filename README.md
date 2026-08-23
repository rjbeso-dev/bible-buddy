# Bible Study

A calm, editorial Bible reading and study web app. Land on a home dashboard,
read any chapter of the 66-book Protestant canon, switch between grouped English
translations (including optional ESV and NLT via server-side API keys), compare
two side by side, and mark up the text with highlights and personal notes.
Everything you create is stored privately in your own browser — there are no
accounts and your notes never leave your device.

Free scripture text comes from [bible-api.com](https://bible-api.com). ESV and
NLT are fetched through a server-side proxy that injects an API key from an
environment variable — the key is never exposed to the browser and readers are
never asked for one. Book introductions and the daily-verse list are bundled
locally. Cross-references come from [OpenBible.info](https://www.openbible.info/labs/cross-references/)
(CC BY), processed into one compact, lazily-loaded file per book. Verse-by-verse
commentary (Matthew Henry, Jamieson-Fausset-Brown, John Gill, Adam Clarke,
Keil-Delitzsch, John Calvin, and the Tyndale Open Study Notes) is fetched live
from the [HelloAO Free Use Bible API](https://bible.helloao.org/) — mostly
public-domain, with Tyndale under CC BY-SA 4.0. Each book's intro links out to
its [BibleProject](https://bibleproject.com/) overview video where one exists.

## The home dashboard

Opening the app (`/`) shows a quiet study desk, not a redirect:

- **Time-aware masthead** — a greeting and today's date in a display serif.
- **Continue reading** — your last-read reference with a cached snippet of its
  opening verses and a prominent **Resume →** button (first run defaults to
  John 1).
- **Verse of the day** — a deterministic pick from a bundled, public-domain
  (WEB) list, keyed to the calendar day, linking into the reader.
- **At-a-glance stats** — chapters read, notes, highlights.
- **Jump back in** — your recent chapters as compact rows.
- **Recent notes & highlights** — the latest few, each deep-linking to its verse.
- **Browse the Bible** — the book/chapter picker, right on the dashboard.

## Features

- **Read by book → chapter → verse** with a comfortable reading column, a serif
  drop cap opening each chapter, small-caps chapter references, and
  serif/sans/comfort/mono typefaces plus a 7-step text-size control. ("Comfort"
  is a genuinely legible stack — Atkinson Hyperlegible / Verdana — not a novelty
  font.)
- **Book & chapter picker** grouped by Old/New Testament, then a chapter grid.
- **Chapter paging** with previous/next that rolls across book boundaries.
  Arrow keys (← / →) also flip chapters.
- **Grouped translations** presented by reading level:
  - _Easy to read_ — Bible in Basic English.
  - _Modern English_ — World English Bible (default), WEB British, Open English
    Bible.
  - _Classic_ — King James Version, American Standard Version.
  - _Study translations_ — English Standard Version, New Living Translation
    (require server-side keys — see below).
- **Parallel view**: read two translations verse-aligned in two columns.
- **Highlights**: tap a verse and pick from five theme-aware colors (or clear).
- **Notes**: attach one or more notes to any verse; a dot marks verses that
  have notes. A dedicated Notes page lists everything grouped by book with
  links straight back to the verse. Long-form notes support rich text,
  export to PDF/Word, and — when signed in — a public "share this note"
  link anyone can open without an account (see
  [Accounts & sync](#accounts--sync-optional)).
- **Verse context**: view a verse with the surrounding verses (crossing chapter
  boundaries when needed) in a focused popover.
- **Book introductions** shown at the top of chapter 1 or via the info button.
- **Light / dark theme** that initializes from your system preference and is
  remembered.
- **Reading progress**: the app tracks which chapters you've opened to power the
  dashboard stats and "Jump back in" list.
- **Offline-friendly**: opened chapters are cached (LRU, ~150 chapters) so they
  keep working without a connection; an offline banner appears when you drop off
  the network.

## Enabling ESV & NLT

The ESV and NLT are copyrighted. They're fetched through a server-side proxy
that injects an API key from an **environment variable**, so the key stays on
the server and readers are never asked for one. Get free keys once:

- **ESV** — <https://api.esv.org/>
- **NLT** — <https://api.nlt.to/>

**Local development.** Copy `.env.example` to `.env.local` and paste your keys:

```bash
cp .env.example .env.local
# then edit .env.local:
#   ESV_API_KEY=your-esv-key
#   NLT_API_KEY=your-nlt-key
```

Restart `npm run dev`. Vite's dev proxy (in `vite.config.ts`) reads these vars
and forwards `/api/esv` and `/api/nlt` to `api.esv.org` / `api.nlt.to` with the
key attached. `.env.local` is gitignored — your keys are never committed.

**Deploying to Vercel.** The `api/esv/[...path].ts` and `api/nlt/[...path].ts`
serverless functions do the same job in production. Add the keys once in the
Vercel dashboard → **Settings → Environment Variables**:

- `ESV_API_KEY`
- `NLT_API_KEY`

Redeploy, and ESV/NLT work for every visitor with no key prompt. Leave a key
unset and that translation simply shows a short "not set up for this site"
message; the free public-domain translations always work. When an ESV or NLT
chapter is shown, the required copyright line appears beneath it (ESV® ©
Crossway; NLT © Tyndale House Foundation).

## Accounts & sync (optional)

By default the app is fully local — no accounts, nothing leaves your browser.
You can optionally turn on sign-in (Google, via Supabase) so your notes,
highlights, reading progress, and settings sync across your devices. With no
Supabase keys configured, the app runs exactly as before and no account UI
appears at all — this is entirely opt-in.

1. **Create a free Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema.** Open your project's SQL Editor and run
   [`supabase/schema.sql`](supabase/schema.sql) — it creates three tables:
   `user_state` (a single JSON blob per signed-in user, protected by
   Row-Level Security so each user can only ever read or write their own row),
   `shared_notes` (public "share this note" links — anyone with the link can
   read a shared note, but only its owner can create, update, or revoke one),
   and `user_directory` (a minimal "who's signed in" list — email plus
   first/last-seen — readable only by the email hardcoded in the file's
   "admin can read the directory" policy; if you use this, edit that email
   before running the file). If you already ran an older version of this
   file, re-run it — `create table if not exists` makes it safe to run
   again, and it'll add any new tables without touching existing data.
3. **Enable Google sign-in.** In Supabase: **Authentication → Providers →
   Google** → enable it. This needs a Google OAuth client from the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (OAuth consent screen + an OAuth 2.0 Client ID, type "Web application").
   Add Supabase's callback URL (shown on the Google provider page in Supabase,
   looks like `https://<project-ref>.supabase.co/auth/v1/callback`) as an
   authorized redirect URI on the Google client, then paste the Google Client
   ID/Secret into Supabase's Google provider settings.
4. **Add the keys.** From your Supabase project → **Settings → API**, copy the
   Project URL and the `anon` public key into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
   (The anon key is safe to expose in the browser — Row-Level Security is what
   actually protects the data.) Add the same two variables to your Vercel
   project's environment variables for production, then restart `npm run dev`
   or redeploy.
5. **Optional: a "Signed-in users" admin page.** Set `VITE_ADMIN_EMAIL` to
   your own email (same as above, in `.env.local` and Vercel) and it'll match
   the email already in `supabase/schema.sql`'s RLS policy — sign in with
   that account and a "Signed-in users" link appears in the account menu at
   `/admin`, a plain list of everyone who's signed in (email, first/last
   seen). Leave it unset to skip this entirely. This env var only shows the
   link; the actual access control is the database policy, so keep the two
   in sync if you ever change the email.

Once configured, a "Sign in" item appears at the bottom of the rail. Signing in
pulls any existing cloud data, merges it with what's on the device (newest
wins, nothing is lost), and keeps syncing in the background as you read, note,
and highlight.

## Getting started

Requires Node 20+ (built and tested on Node 24).

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:5173
npm run build    # type-check (tsc -b) and produce a production build in dist/
npm run preview  # preview the production build locally
```

### Testing

Tooling (Vitest + React Testing Library + jsdom + MSW) is configured and ready:

```bash
npm test          # run the test suite once
npm run test:watch
npm run coverage
```

## Where your data is stored

All user data lives in the browser's `localStorage` under the `bsa.` prefix —
no accounts, no backend, nothing leaves your device, unless you opt in to sync
(see [Accounts & sync](#accounts--sync-optional) above), in which case
`bsa.settings`, `bsa.lastRead`, `bsa.notes`, `bsa.highlights`,
`bsa.readChapters`, and `bsa.recentChapters` also sync to your Supabase
project under your account:

| Key | Contents |
| --- | --- |
| `bsa.settings` | Theme, translations, parallel toggle, font family & size |
| `bsa.lastRead` | Last chapter/verse you were reading |
| `bsa.notes` | Your notes |
| `bsa.highlights` | Your highlights (keyed by verse) |
| `bsa.readChapters` | The set of chapters you've opened (for stats) |
| `bsa.recentChapters` | Recent chapters, most-recent-first (for the dashboard) |
| `bsa.cache.chapter.*` | Cached chapter text (with an LRU index for eviction) |

Clearing your browser storage for this site will remove all of the above.

Sharing a note (see above) is the one deliberate exception: clicking "Share"
publishes that note's content to a public `shared_notes` row in Supabase, so
anyone with the link can read it without an account. Nothing is published
until you explicitly share, and clicking "Stop sharing" deletes the row.

## Project structure

```
src/
  api/            Bible sources: bibleApiSource (free), esvSource, nltSource,
                  and index.ts (a router that dispatches by translation id)
  components/     layout, navigation, reader, study, notes, settings, ui (icons)
  context/        Settings provider (theme, fonts, translations)
  data/           books.ts (the 66 books) and dailyVerses.ts (verse of the day)
  hooks/          useChapter, useNotes, useHighlights, useLastRead,
                  useReadingProgress
  lib/            storage, keys, chapter cache (LRU), reference helpers
  pages/          DashboardPage, ReaderPage, NotesPage
  styles/         globals.css (tokens/theming), reader.css, dashboard.css
  types/          Shared types
```

`src/api/index.ts` routes `getChapter` by translation id (ESV → `esvSource`,
NLT → `nltSource`, everything else → `bibleApiSource`) and exposes the full
grouped translation list. To add another free provider, implement the
`BibleSource` interface and wire it into the router. All new UI glyphs come from
the single inline-SVG set in `src/components/ui/Icon.tsx`.

## Tech stack

Vite + React + TypeScript, React Router, plain CSS with custom properties
driven by `data-theme` / `data-font` attributes.
