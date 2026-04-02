create extension if not exists vector;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  title text,
  storage_path text not null,
  size bigint not null,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.file_chunks (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (file_id, chunk_index)
);

alter table public.files add column if not exists title text;
alter table public.files add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.file_chunks add column if not exists page_number integer;
alter table public.file_chunks add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists file_chunks_user_id_idx on public.file_chunks (user_id);
create index if not exists file_chunks_file_id_idx on public.file_chunks (file_id);
create index if not exists file_chunks_page_number_idx on public.file_chunks (page_number);
create index if not exists file_chunks_embedding_idx
  on public.file_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

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
alter table public.file_chunks enable row level security;
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

drop policy if exists chunks_select_own on public.file_chunks;
drop policy if exists chunks_insert_own on public.file_chunks;
drop policy if exists chunks_update_own on public.file_chunks;
drop policy if exists chunks_delete_own on public.file_chunks;
create policy chunks_select_own on public.file_chunks for select using (auth.uid() = user_id);
create policy chunks_insert_own on public.file_chunks for insert with check (auth.uid() = user_id);
create policy chunks_update_own on public.file_chunks for update using (auth.uid() = user_id);
create policy chunks_delete_own on public.file_chunks for delete using (auth.uid() = user_id);

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

drop function if exists public.match_file_chunks(vector(1536), uuid, integer);

create or replace function public.match_file_chunks(
  query_embedding vector(1024),
  match_user_id uuid,
  match_count integer default 6
)
returns table (
  file_id uuid,
  file_name text,
  file_title text,
  chunk_index integer,
  page_number integer,
  content text,
  file_metadata jsonb,
  chunk_metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    file_chunks.file_id,
    files.name as file_name,
    files.title as file_title,
    file_chunks.chunk_index,
    file_chunks.page_number,
    file_chunks.content,
    files.metadata as file_metadata,
    file_chunks.metadata as chunk_metadata,
    1 - (file_chunks.embedding <=> query_embedding) as similarity
  from public.file_chunks
  join public.files on files.id = file_chunks.file_id
  where file_chunks.user_id = auth.uid()
    and file_chunks.user_id = match_user_id
  order by file_chunks.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

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
