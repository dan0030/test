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

-- =====================================================================
-- 아이디 · 이름(닉네임) 프로필
--  - 아이디: 영문 소문자/숫자/_ 3~20자, 중복 불가, 예약어 불가
--  - 가입 시 메타데이터(username, display_name)로 자동 생성
--  - 본인만 읽기/수정 (다른 이용자에게 공개되지 않음)
--  - 아이디 로그인은 Edge Function(login-with-id)이 서버 안에서 처리해 이메일이 브라우저에 노출되지 않음
-- =====================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.username_reserved(p text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(p) = any (array['admin','administrator','root','system','support','help','onote','o_note','official','staff','moderator','null','undefined','test']);
$$;

create or replace function public.profiles_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.id := old.id; new.created_at := old.created_at; end if;
  new.username := lower(trim(new.username));
  new.display_name := trim(new.display_name);
  if public.username_reserved(new.username) then raise exception 'username_reserved'; end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles for each row execute function public.profiles_guard();

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
        n text := trim(coalesce(new.raw_user_meta_data->>'display_name', ''));
begin
  if u ~ '^[a-z0-9_]{3,20}$' and not public.username_reserved(u) then
    if n = '' then n := u; end if;
    insert into public.profiles (id, username, display_name) values (new.id, u, left(n, 30));
  end if;
  return new;
end; $$;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_user_profile();

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not public.username_reserved(p_username)
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
