-- Bible Study App — optional accounts & cloud sync.
--
-- Run this once in your Supabase project's SQL editor (Project → SQL Editor).
-- It creates a single table holding one JSONB blob per signed-in user
-- (notes, highlights, reading progress, settings, last-read position), gated
-- by Row-Level Security so a user can only ever read/write their own row.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "own row select" on public.user_state for select using (auth.uid() = user_id);
create policy "own row upsert" on public.user_state for insert with check (auth.uid() = user_id);
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

create policy "anyone can read a shared note by id" on public.shared_notes for select using (true);
create policy "owner can share" on public.shared_notes for insert with check (auth.uid() = owner_id);
create policy "owner can update their shared note" on public.shared_notes for update using (auth.uid() = owner_id);
create policy "owner can unshare" on public.shared_notes for delete using (auth.uid() = owner_id);
