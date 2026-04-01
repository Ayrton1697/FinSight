create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.files enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- Postgres/Supabase: use drop + create (CREATE POLICY IF NOT EXISTS is not supported)

drop policy if exists files_select_own on public.files;
drop policy if exists files_insert_own on public.files;
drop policy if exists files_update_own on public.files;
drop policy if exists files_delete_own on public.files;
create policy files_select_own on public.files for select using (auth.uid() = user_id);
create policy files_insert_own on public.files for insert with check (auth.uid() = user_id);
create policy files_update_own on public.files for update using (auth.uid() = user_id);
create policy files_delete_own on public.files for delete using (auth.uid() = user_id);

drop policy if exists threads_select_own on public.chat_threads;
drop policy if exists threads_insert_own on public.chat_threads;
drop policy if exists threads_update_own on public.chat_threads;
drop policy if exists threads_delete_own on public.chat_threads;
create policy threads_select_own on public.chat_threads for select using (auth.uid() = user_id);
create policy threads_insert_own on public.chat_threads for insert with check (auth.uid() = user_id);
create policy threads_update_own on public.chat_threads for update using (auth.uid() = user_id);
create policy threads_delete_own on public.chat_threads for delete using (auth.uid() = user_id);

drop policy if exists messages_select_own on public.chat_messages;
drop policy if exists messages_insert_own on public.chat_messages;
drop policy if exists messages_update_own on public.chat_messages;
drop policy if exists messages_delete_own on public.chat_messages;
create policy messages_select_own on public.chat_messages for select using (auth.uid() = user_id);
create policy messages_insert_own on public.chat_messages for insert with check (auth.uid() = user_id);
create policy messages_update_own on public.chat_messages for update using (auth.uid() = user_id);
create policy messages_delete_own on public.chat_messages for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('user-files', 'user-files', false)
on conflict (id) do nothing;

-- App uploads to paths: "<user_uuid>/timestamp-filename" (must match first folder = auth.uid())

drop policy if exists storage_user_files_select on storage.objects;
drop policy if exists storage_user_files_insert on storage.objects;
drop policy if exists storage_user_files_update on storage.objects;
drop policy if exists storage_user_files_delete on storage.objects;
create policy storage_user_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy storage_user_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy storage_user_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy storage_user_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
