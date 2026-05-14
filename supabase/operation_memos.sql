-- Operation memo storage for the SEDU timetable frontend.
-- Run this in the Supabase SQL editor for the project that will store memos.

create extension if not exists pgcrypto;

create table if not exists public.operation_memos (
  id uuid primary key default gen_random_uuid(),
  date_key text not null,
  sheet_name text not null default '',
  student_name text not null,
  type text not null default 'notice',
  message text not null default '',
  severity text not null default 'warning',
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operation_memos_date_active_idx
  on public.operation_memos (date_key, active, updated_at desc);

create index if not exists operation_memos_student_idx
  on public.operation_memos (student_name);

alter table public.operation_memos enable row level security;

drop policy if exists "operation memo public read" on public.operation_memos;
create policy "operation memo public read"
  on public.operation_memos
  for select
  using (active = true);

-- The current frontend shows the write UI only to the timetable admin account.
-- Supabase cannot verify that local app role by itself when using only an anon key,
-- so this policy trusts the frontend gate. Use an Edge Function later for stricter writes.
drop policy if exists "operation memo anon insert" on public.operation_memos;
create policy "operation memo anon insert"
  on public.operation_memos
  for insert
  with check (true);

drop policy if exists "operation memo anon update" on public.operation_memos;
create policy "operation memo anon update"
  on public.operation_memos
  for update
  using (true)
  with check (true);

