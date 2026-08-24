-- Bible Study App — optional accounts & cloud sync.
--
-- Run this once in your Supabase project's SQL editor (Project → SQL Editor).
-- Safe to re-run any time (e.g. after pulling a newer version of this file):
-- every `create table` is `if not exists`, and every `create policy` is
-- preceded by a matching `drop policy if exists` — Postgres has no
-- `create policy if not exists`, so this is the standard way to make policy
-- creation idempotent instead of erroring on a policy that's already there.
--
-- It creates a single table holding one JSONB blob per signed-in user
-- (notes, highlights, reading progress, settings, last-read position), gated
-- by Row-Level Security so a user can only ever read/write their own row.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "own row select" on public.user_state;
create policy "own row select" on public.user_state for select using (auth.uid() = user_id);
drop policy if exists "own row upsert" on public.user_state;
create policy "own row upsert" on public.user_state for insert with check (auth.uid() = user_id);
drop policy if exists "own row update" on public.user_state;
create policy "own row update" on public.user_state for update using (auth.uid() = user_id);

-- Public "share this note" links — the id is a random UUID generated on
-- the client when a note is shared, so it's only discoverable by whoever
-- has the link ("anyone with the link" sharing, not a public listing).
-- Content is a snapshot: re-clicking "Share" on an already-shared note
-- overwrites this row with the current content rather than tracking edits
-- live, so nothing is exposed until the owner explicitly (re-)shares it.
create table if not exists public.shared_notes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  reference text,
  body_html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shared_notes enable row level security;

drop policy if exists "anyone can read a shared note by id" on public.shared_notes;
create policy "anyone can read a shared note by id" on public.shared_notes for select using (true);
drop policy if exists "owner can share" on public.shared_notes;
create policy "owner can share" on public.shared_notes for insert with check (auth.uid() = owner_id);
drop policy if exists "owner can update their shared note" on public.shared_notes;
create policy "owner can update their shared note" on public.shared_notes for update using (auth.uid() = owner_id);
drop policy if exists "owner can unshare" on public.shared_notes;
create policy "owner can unshare" on public.shared_notes for delete using (auth.uid() = owner_id);

-- A minimal "who has signed in" directory for the site owner's simple admin
-- list — one row per user, upserted by that user's own client on sign-in
-- (never touching anyone else's row). Reading the full list is restricted to
-- whichever email VITE_ADMIN_EMAIL is set to; everyone else's select just
-- returns zero rows, not an error, if they ever hit that page.
create table if not exists public.user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.user_directory enable row level security;

drop policy if exists "own row upsert" on public.user_directory;
create policy "own row upsert" on public.user_directory for insert with check (auth.uid() = user_id);
drop policy if exists "own row update" on public.user_directory;
create policy "own row update" on public.user_directory for update using (auth.uid() = user_id);
-- Replace the email below with your own — this is the only account that can
-- read the directory list (via the app's /admin page).
drop policy if exists "admin can read the directory" on public.user_directory;
create policy "admin can read the directory" on public.user_directory for select
  using (auth.jwt() ->> 'email' = 'rjbeso@gmail.com');
