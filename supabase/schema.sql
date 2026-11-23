-- =====================================================================
-- O-note 데이터베이스 스키마 (Supabase SQL Editor에 통째로 붙여넣고 실행)
-- ---------------------------------------------------------------------
-- 보안 원칙
--  1) 모든 행은 user_id(=로그인 계정)를 가지며, RLS(행 수준 보안)로
--     "본인 행만 읽기/쓰기"를 데이터베이스 단에서 강제합니다.
--     → 사이트 코드에 버그가 있거나 anon 키가 공개돼도 남의 글은 못 읽습니다.
--  2) user_id는 클라이언트가 보내는 값을 믿지 않고 auth.uid()로 덮어씁니다.
--  3) 비밀번호는 Supabase Auth가 bcrypt로 해시 저장합니다(사이트는 비밀번호를 저장하지 않음).
--  4) 선택형 "보안 금고(종단간 암호화)"를 켜면 data 컬럼에는 암호문만 저장되어
--     서버 관리자(=사이트 운영자)도 내용을 볼 수 없습니다.
-- =====================================================================

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('folder','character','world','story','plot','memo','idea','vault','settings')),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint items_data_size check (pg_column_size(data) < 5 * 1024 * 1024) -- 행당 5MB 제한
);

create index if not exists items_user_updated_idx on public.items (user_id, updated_at desc);

-- user_id 위조 방지 + updated_at 자동 갱신
create or replace function public.items_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_guard_trg on public.items;
create trigger items_guard_trg
  before insert or update on public.items
  for each row execute function public.items_guard();

-- 행 수준 보안(RLS)
alter table public.items enable row level security;
alter table public.items force row level security;

drop policy if exists "items_select_own" on public.items;
drop policy if exists "items_insert_own" on public.items;
drop policy if exists "items_update_own" on public.items;
drop policy if exists "items_delete_own" on public.items;

create policy "items_select_own" on public.items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "items_insert_own" on public.items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "items_update_own" on public.items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "items_delete_own" on public.items
  for delete to authenticated using (user_id = (select auth.uid()));

-- 비로그인(anon) 사용자는 테이블에 접근 불가
revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;

-- ---------------------------------------------------------------------
-- 회원 탈퇴: 본인 계정과 모든 데이터를 즉시 영구 삭제
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.items where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
