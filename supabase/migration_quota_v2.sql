-- =====================================================================
-- 1인당 한도 상향 (가입자 500~1,000명 예상)
--  · 기록: 1인 5MB (압축 후)  · 사진: 1인 15MB (1장 최대 1.5MB)
--  · 사이트 전체 안전장치: 무료 한도(DB 500MB · 저장소 1GB)에 가까워지면
--    '기본 할당량'(기록 1MB · 사진 3MB)을 넘긴 사람만 더 늘리지 못하게 막음
--    → 소수가 공간을 다 써서 모두가 멈추는 일을 막음
-- =====================================================================

create or replace function public.onote_limits()
returns json language sql immutable set search_path = '' as $$
  select json_build_object(
    'db_user',   5 * 1024 * 1024,     -- 1인 기록 한도
    'db_base',   1 * 1024 * 1024,     -- 전체가 찼을 때도 보장되는 기본 할당량
    'db_site',   400 * 1024 * 1024,   -- items 테이블 전체 경보선 (DB 500MB 중)
    'img_user',  15 * 1024 * 1024,    -- 1인 사진 한도
    'img_base',  3 * 1024 * 1024,
    'img_site',  900 * 1024 * 1024    -- 사진 저장소 전체 경보선 (1GB 중)
  );
$$;

create or replace function public.items_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare used bigint; lim json := public.onote_limits(); total bigint;
begin
  new.user_id := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  -- 크기가 늘어나는 쓰기만 검사 (삭제·축소는 항상 허용)
  if new.type <> 'vault' and not new.deleted
     and (tg_op = 'INSERT' or pg_column_size(new.data) > pg_column_size(old.data)) then
    select coalesce(sum(pg_column_size(i.data)), 0) into used
      from public.items i where i.user_id = new.user_id and i.id <> new.id;
    used := used + pg_column_size(new.data);
    if used > (lim->>'db_user')::bigint then
      raise exception 'quota_exceeded' using errcode = 'P0001', hint = 'O-note 1인당 기록 한도(5MB)를 넘었어요.';
    end if;
    if used > (lim->>'db_base')::bigint then
      total := pg_total_relation_size('public.items');
      if total > (lim->>'db_site')::bigint then
        raise exception 'site_full' using errcode = 'P0001', hint = '사이트 전체 저장 공간이 거의 찼어요.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 사진 저장소 전체 사용량 (모든 이용자 합계 — 숫자만 돌려줌)
create or replace function public.onote_bucket_used()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o where o.bucket_id = 'img';
$$;
revoke all on function public.onote_bucket_used() from public, anon, authenticated;

-- 업로드 허용 여부: 1인 한도 이하 + (기본 할당량 이하이거나 전체 경보선 이하)
create or replace function public.onote_can_upload()
returns boolean language sql stable security definer set search_path = '' as $$
  with l as (select public.onote_limits() as j), u as (select public.onote_storage_used() as mine)
  select (select mine from u) < (select (j->>'img_user')::bigint from l)
     and ((select mine from u) < (select (j->>'img_base')::bigint from l)
          or public.onote_bucket_used() < (select (j->>'img_site')::bigint from l));
$$;
revoke all on function public.onote_can_upload() from public, anon;
grant execute on function public.onote_can_upload() to authenticated;

drop policy if exists "img_insert_own" on storage.objects;
create policy "img_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'img' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.onote_can_upload());

create or replace function public.my_usage()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'db_bytes', (select coalesce(sum(pg_column_size(data)), 0) from public.items where user_id = (select auth.uid())),
    'db_limit', (public.onote_limits()->>'db_user')::bigint,
    'img_bytes', public.onote_storage_used(),
    'img_count', (select count(*) from storage.objects o where o.bucket_id = 'img' and o.owner_id = (select auth.uid())::text),
    'img_limit', (public.onote_limits()->>'img_user')::bigint,
    'site_db_tight', pg_total_relation_size('public.items') > (public.onote_limits()->>'db_site')::bigint,
    'site_img_tight', public.onote_bucket_used() > (public.onote_limits()->>'img_site')::bigint
  );
$$;
revoke all on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;
