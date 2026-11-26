-- =====================================================================
-- Supabase Pro 플랜 전환에 맞춘 1인당 한도 상향 (가입자 1,000~5,000명 예상)
--  Pro 포함량: DB 디스크 8GB · 파일 저장소 100GB · 전송량 월 250GB · MAU 10만
--  사용량 상한(Spend cap) 켜짐 → 포함량을 넘는 추가 요금 대신 사용이 제한됨
--
--  · 기록: 1인 20MB (압축 후, 기존 5MB)   · 사진: 1인 100MB (기존 15MB, 1장 최대 1.5MB 유지)
--  · 사이트 전체 안전장치(경보선)를 넘으면 '기본 할당량'(기록 1MB · 사진 5MB)을
--    넘긴 사람만 더 늘리지 못함 → 소수가 공간을 다 써서 모두가 멈추는 일을 막음
--  · 경보선 계산 (최악의 경우에도 포함량 안):
--      기록 3GB + 5,000명 × 1MB = 약 8GB  (DB 디스크 8GB — 디스크는 Spend cap이 막아주지 않으니 여유 있게)
--      사진 75GB + 5,000명 × 5MB = 약 100GB (파일 저장소 100GB)
-- =====================================================================

create or replace function public.onote_limits()
returns json language sql immutable set search_path = '' as $$
  select json_build_object(
    'db_user',   20 * 1024 * 1024,           -- 1인 기록 한도
    'db_base',   1 * 1024 * 1024,            -- 전체가 찼을 때도 보장되는 기본 할당량
    'db_site',   3::bigint * 1024 * 1024 * 1024,  -- items 테이블 전체 경보선 (DB 8GB 중)
    'img_user',  100 * 1024 * 1024,          -- 1인 사진 한도
    'img_base',  5 * 1024 * 1024,
    'img_site',  75::bigint * 1024 * 1024 * 1024  -- 사진 저장소 전체 경보선 (100GB 중)
  );
$$;

-- 한도 초과 메시지의 숫자만 바뀜 (로직은 migration_quota_v2.sql과 같음)
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
      raise exception 'quota_exceeded' using errcode = 'P0001', hint = 'O-note 1인당 기록 한도(20MB)를 넘었어요.';
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
