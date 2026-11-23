-- =====================================================================
-- 무료 플랜 최적화 (이용자 1,000명 가정)
--  · 증분 동기화를 위한 소프트 삭제(deleted) 컬럼
--  · 이용자 1인당 DB 사용량 한도 (2MB, 압축 후 기준)
--  · 이미지 전용 비공개 Storage 버킷 'img' (본인 폴더만 접근, 1장 1.5MB, 1인당 6MB)
--  · 내 사용량 조회 함수
-- =====================================================================
alter table public.items add column if not exists deleted boolean not null default false;
create index if not exists items_user_updated_asc_idx on public.items (user_id, updated_at);

create or replace function public.items_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare used bigint;
begin
  new.user_id := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  -- 1인당 DB 한도: 크기가 늘어나는 쓰기만 검사 (삭제·축소는 항상 허용)
  if new.type <> 'vault' and not new.deleted
     and (tg_op = 'INSERT' or pg_column_size(new.data) > pg_column_size(old.data)) then
    select coalesce(sum(pg_column_size(i.data)), 0) into used
      from public.items i where i.user_id = new.user_id and i.id <> new.id;
    if used + pg_column_size(new.data) > 2 * 1024 * 1024 then
      raise exception 'quota_exceeded' using errcode = 'P0001', hint = 'O-note 1인당 저장 한도(2MB)를 넘었어요.';
    end if;
  end if;
  return new;
end;
$$;

-- 이미지 버킷
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('img', 'img', false, 1572864, array['image/webp','image/jpeg','image/png','image/gif','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.onote_storage_used()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o where o.bucket_id = 'img' and o.owner_id = (select auth.uid())::text;
$$;
revoke all on function public.onote_storage_used() from public, anon;
grant execute on function public.onote_storage_used() to authenticated;

drop policy if exists "img_select_own" on storage.objects;
drop policy if exists "img_insert_own" on storage.objects;
drop policy if exists "img_update_own" on storage.objects;
drop policy if exists "img_delete_own" on storage.objects;
create policy "img_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'img' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "img_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'img' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.onote_storage_used() < 6 * 1024 * 1024);
create policy "img_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'img' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "img_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'img' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 내 사용량
create or replace function public.my_usage()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'db_bytes', (select coalesce(sum(pg_column_size(data)), 0) from public.items where user_id = (select auth.uid())),
    'db_limit', 2 * 1024 * 1024,
    'img_bytes', public.onote_storage_used(),
    'img_count', (select count(*) from storage.objects o where o.bucket_id = 'img' and o.owner_id = (select auth.uid())::text),
    'img_limit', 6 * 1024 * 1024
  );
$$;
revoke all on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;
