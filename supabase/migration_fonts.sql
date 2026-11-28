-- =====================================================================
-- 사용자 폰트 업로드 (설정 → 화면 → 글꼴)
--  · 비공개 버킷 'font' — 본인 폴더만 읽기·쓰기
--  · 형식: woff2 / woff / ttf / otf, 파일 1개 최대 10MB, 계정당 최대 3개
--  · 폰트 용량은 '사진' 한도(1인 100MB)와 사진 저장소 전체 경보선에 함께 포함됨
--    → Pro 플랜 파일 저장소 계획(100GB)을 그대로 지킴
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('font', 'font', false, 10485760, array['font/woff2','font/woff','font/ttf','font/otf','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 내 사용량 = 사진 + 폰트
create or replace function public.onote_storage_used()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o where o.bucket_id in ('img', 'font') and o.owner_id = (select auth.uid())::text;
$$;

-- 사이트 전체 사용량 = 사진 + 폰트
create or replace function public.onote_bucket_used()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id in ('img', 'font');
$$;
revoke all on function public.onote_bucket_used() from public, anon, authenticated;

-- 내 폰트 개수
create or replace function public.onote_font_count()
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from storage.objects o where o.bucket_id = 'font' and o.owner_id = (select auth.uid())::text;
$$;
revoke all on function public.onote_font_count() from public, anon;
grant execute on function public.onote_font_count() to authenticated;

drop policy if exists "font_select_own" on storage.objects;
drop policy if exists "font_insert_own" on storage.objects;
drop policy if exists "font_delete_own" on storage.objects;
create policy "font_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'font' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "font_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'font' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.onote_font_count() < 3 and public.onote_can_upload());
create policy "font_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'font' and (storage.foldername(name))[1] = (select auth.uid())::text);
