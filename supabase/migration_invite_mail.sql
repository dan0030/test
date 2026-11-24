-- =====================================================================
-- O-note: 초대 코드 가입 · 우편함 · 건의함 · 운영자 계정
--
-- 보안 원칙
--  - 새 테이블은 모두 RLS를 켜고 정책을 두지 않아 브라우저에서 직접 읽기/쓰기 불가.
--    모든 동작은 아래의 함수(RPC)로만 하며, 함수가 auth.uid()로 본인 것만 다룸.
--  - 운영자 권한은 public.admins 표에 있는 계정에만 있고, 이 표는 Supabase
--    대시보드(SQL)로만 바꿀 수 있음 (사이트 안에서 운영자를 추가하는 경로 없음).
--  - 운영자 함수는 2단계 인증(OTP 앱, aal2)을 마친 세션에서만 동작 →
--    비밀번호가 새어도 운영자 기능은 쓸 수 없음.
--  - 가입 시 초대 코드 검사는 auth.users 트리거(서버)에서 하므로 화면을 우회해도 가입 불가.
-- =====================================================================

-- ---------- 사이트 설정 ----------
create table if not exists public.site_config (
  id              boolean primary key default true check (id),
  invite_required boolean not null default true,
  updated_at      timestamptz not null default now()
);
insert into public.site_config (id) values (true) on conflict do nothing;

-- ---------- 운영자 ----------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id     bigserial primary key,
  admin  uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb,
  at     timestamptz not null default now()
);

-- ---------- 초대 코드 ----------
-- kind: admin(운영자가 만든 코드) / gift(우편 선물로 받은 1인용 코드, owner = 받은 사람)
-- 누가 어떤 코드로 가입했는지는 저장하지 않음 (사용 횟수만 셈)
create table if not exists public.invite_codes (
  code       text primary key check (code ~ '^[A-Z0-9-]{6,32}$'),
  max_uses   int  not null check (max_uses between 1 and 100000),
  used       int  not null default 0 check (used >= 0),
  note       text check (char_length(note) <= 200),
  expires_at timestamptz,
  active     boolean not null default true,
  kind       text not null default 'admin' check (kind in ('admin', 'gift')),
  owner      uuid references auth.users(id) on delete set null,
  mail_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists invite_codes_owner_idx on public.invite_codes (owner) where owner is not null;

-- ---------- 우편 ----------
create table if not exists public.mails (
  id           uuid primary key default gen_random_uuid(),
  recipient    uuid references auth.users(id) on delete cascade,   -- null = 전체
  title        text not null check (char_length(title) between 1 and 100),
  body         text not null default '' check (char_length(body) <= 5000),
  gift_invites int  not null default 0 check (gift_invites between 0 and 10),
  gift_uses    int  not null default 1 check (gift_uses between 1 and 100),
  gift_days    int  check (gift_days between 1 and 365),
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists mails_recipient_idx on public.mails (recipient, created_at desc);

create table if not exists public.mail_state (
  mail_id    uuid not null references public.mails(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  read_at    timestamptz,
  claimed_at timestamptz,
  hidden     boolean not null default false,
  primary key (mail_id, user_id)
);
create index if not exists mail_state_user_idx on public.mail_state (user_id);

-- ---------- 건의함 ----------
create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  category   text not null default 'idea' check (category in ('idea', 'bug', 'account', 'etc')),
  title      text not null check (char_length(title) between 1 and 100),
  body       text not null check (char_length(body) between 1 and 3000),
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply      text check (char_length(reply) <= 3000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists suggestions_user_idx on public.suggestions (user_id, created_at desc);
create index if not exists suggestions_status_idx on public.suggestions (status, created_at desc);

-- 모든 새 테이블: RLS 강제 + 정책 없음 + 권한 회수 → 함수로만 접근
do $$
declare t text;
begin
  foreach t in array array['site_config','admins','admin_log','invite_codes','mails','mail_state','suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.admin_log_id_seq from public, anon, authenticated;

-- =====================================================================
-- 공통 함수
-- =====================================================================
create or replace function public.onote_random_code(n int default 10)
returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 헷갈리는 0/O, 1/I 제외 (32자 → 균등 분포)
        b bytea := extensions.gen_random_bytes(n); r text := ''; i int;
begin
  for i in 0..n - 1 loop r := r || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return r;
end; $$;
revoke all on function public.onote_random_code(int) from public, anon, authenticated;

-- 운영자 여부 (2단계 인증을 마친 세션이어야 true)
create or replace function public.onote_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.admins a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
revoke all on function public.onote_is_admin() from public, anon, authenticated;

create or replace function public.onote_require_admin(p_action text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.onote_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is not null then
    insert into public.admin_log (admin, action, detail) values (auth.uid(), p_action, p_detail);
  end if;
end; $$;
revoke all on function public.onote_require_admin(text, jsonb) from public, anon, authenticated;

-- =====================================================================
-- 가입: 초대 코드 검사 (서버에서 강제)
-- =====================================================================
create or replace function public.handle_new_user_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite', '')));
begin
  -- 코드는 계정 정보에 남기지 않음
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite';
  if not coalesce((select invite_required from public.site_config where id), true) then return new; end if;
  update public.invite_codes set used = used + 1
   where code = c and active and used < max_uses and (expires_at is null or expires_at > now());
  if not found then raise exception 'invite_invalid'; end if;
  return new;
end; $$;
revoke all on function public.handle_new_user_invite() from public, anon, authenticated;
drop trigger if exists on_auth_user_before_insert_invite on auth.users;
create trigger on_auth_user_before_insert_invite before insert on auth.users
  for each row execute function public.handle_new_user_invite();

-- 가입 화면용: 초대 코드가 필요한지
create or replace function public.signup_config()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('invite_required', coalesce((select invite_required from public.site_config where id), true));
$$;
revoke all on function public.signup_config() from public;
grant execute on function public.signup_config() to anon, authenticated;

-- 가입 화면용: 코드가 지금 쓸 수 있는지 (참/거짓만 알려줌)
create or replace function public.invite_check(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invite_codes
    where code = upper(trim(p_code)) and active and used < max_uses and (expires_at is null or expires_at > now()));
$$;
revoke all on function public.invite_check(text) from public;
grant execute on function public.invite_check(text) to anon, authenticated;

-- =====================================================================
-- 우편함 (이용자)
-- =====================================================================
create or replace function public.my_mails()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(x order by x.created_at desc), '[]'::json) from (
    select m.id, m.title, m.body, m.created_at, m.expires_at, m.gift_invites, m.gift_uses, m.gift_days,
           (m.recipient is null) as broadcast, s.read_at, s.claimed_at,
           (select coalesce(json_agg(json_build_object('code', c.code, 'used', c.used, 'max', c.max_uses, 'exp', c.expires_at, 'active', c.active) order by c.code), '[]'::json)
              from public.invite_codes c where c.owner = auth.uid() and c.mail_id = m.id) as codes
      from public.mails m
      left join public.mail_state s on s.mail_id = m.id and s.user_id = auth.uid()
     where auth.uid() is not null
       and (m.recipient = auth.uid() or m.recipient is null)
       and (m.expires_at is null or m.expires_at > now())
       and not coalesce(s.hidden, false)
     order by m.created_at desc
     limit 100
  ) x;
$$;

create or replace function public.my_mail_unread()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.mails m
    left join public.mail_state s on s.mail_id = m.id and s.user_id = auth.uid()
   where auth.uid() is not null
     and (m.recipient = auth.uid() or m.recipient is null)
     and (m.expires_at is null or m.expires_at > now())
     and s.read_at is null and not coalesce(s.hidden, false);
$$;

create or replace function public.mail_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.mails where id = p_id and (recipient = auth.uid() or recipient is null)) then
    raise exception 'not_found';
  end if;
  insert into public.mail_state as ms (mail_id, user_id, read_at) values (p_id, auth.uid(), now())
    on conflict (mail_id, user_id) do update set read_at = coalesce(ms.read_at, now());
end; $$;

create or replace function public.mail_hide(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.mails where id = p_id and (recipient = auth.uid() or recipient is null)) then
    raise exception 'not_found';
  end if;
  insert into public.mail_state as ms (mail_id, user_id, read_at, hidden) values (p_id, auth.uid(), now(), true)
    on conflict (mail_id, user_id) do update set hidden = true, read_at = coalesce(ms.read_at, now());
end; $$;

-- 선물(초대 코드) 받기: 받는 순간 이 사람만의 랜덤 코드를 만듦 (한 우편당 1번)
create or replace function public.mail_claim(p_id uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); m public.mails; i int; c text; n int;
begin
  select * into m from public.mails
   where id = p_id and (recipient = uid or recipient is null) and (expires_at is null or expires_at > now());
  if uid is null or not found then raise exception 'not_found'; end if;
  if m.gift_invites = 0 then raise exception 'no_gift'; end if;
  insert into public.mail_state as ms (mail_id, user_id, read_at, claimed_at) values (p_id, uid, now(), now())
    on conflict (mail_id, user_id) do update set claimed_at = now(), read_at = coalesce(ms.read_at, now())
    where ms.claimed_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'already_claimed'; end if;
  for i in 1..m.gift_invites loop
    loop
      c := public.onote_random_code(10);
      exit when not exists (select 1 from public.invite_codes where code = c);
    end loop;
    insert into public.invite_codes (code, max_uses, note, expires_at, kind, owner, mail_id)
    values (c, m.gift_uses, left('우편 선물: ' || m.title, 200),
            case when m.gift_days is null then null else now() + make_interval(days => m.gift_days) end,
            'gift', uid, m.id);
  end loop;
  return (select json_agg(json_build_object('code', code, 'used', used, 'max', max_uses, 'exp', expires_at, 'active', active))
            from public.invite_codes where owner = uid and mail_id = p_id);
end; $$;

-- =====================================================================
-- 건의함 (이용자)
-- =====================================================================
create or replace function public.suggest_create(p_category text, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.suggestions where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'suggest_rate';
  end if;
  if (select count(*) from public.suggestions where user_id = uid) >= 200 then raise exception 'suggest_full'; end if;
  insert into public.suggestions (user_id, category, title, body)
  values (uid, coalesce(nullif(p_category, ''), 'idea'), trim(p_title), trim(p_body)) returning id into nid;
  return nid;
end; $$;

create or replace function public.my_suggestions()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object('id', id, 'category', category, 'title', title, 'body', body, 'status', status,
         'reply', reply, 'replied_at', replied_at, 'created_at', created_at) order by created_at desc), '[]'::json)
    from public.suggestions where user_id = auth.uid() and auth.uid() is not null;
$$;

create or replace function public.suggest_delete(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.suggestions where id = p_id and user_id = auth.uid();
$$;

-- =====================================================================
-- 운영자
-- =====================================================================
-- 본인의 운영자 상태 (운영자 화면 표시용; 운영자 아니면 admin=false만 알려줌)
create or replace function public.admin_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'admin', auth.uid() is not null and exists (select 1 from public.admins where user_id = auth.uid()),
    'aal2', coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2');
$$;

create or replace function public.admin_overview()
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin(null);
  return json_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'open_suggestions', (select count(*) from public.suggestions where status = 'open'),
    'active_codes', (select count(*) from public.invite_codes where active and used < max_uses and (expires_at is null or expires_at > now()) and kind = 'admin'),
    'invite_required', (select invite_required from public.site_config where id));
end; $$;

create or replace function public.admin_set_invite_required(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin('set_invite_required', jsonb_build_object('on', p_on));
  update public.site_config set invite_required = p_on, updated_at = now() where id;
end; $$;

create or replace function public.admin_codes(p_kind text default 'admin')
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin(null);
  return (select coalesce(json_agg(json_build_object('code', c.code, 'max', c.max_uses, 'used', c.used, 'note', c.note, 'exp', c.expires_at,
           'active', c.active, 'kind', c.kind, 'owner', p.username, 'created_at', c.created_at) order by c.created_at desc), '[]'::json)
    from (select * from public.invite_codes where kind = p_kind order by created_at desc limit 300) c
    left join public.profiles p on p.id = c.owner);
end; $$;

create or replace function public.admin_code_create(p_code text, p_max int, p_expires timestamptz, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare c text := upper(trim(coalesce(p_code, '')));
begin
  perform public.onote_require_admin('code_create', jsonb_build_object('max', p_max));
  if c = '' then
    loop c := public.onote_random_code(10); exit when not exists (select 1 from public.invite_codes where code = c); end loop;
  end if;
  if c !~ '^[A-Z0-9-]{6,32}$' then raise exception 'code_format'; end if;
  if exists (select 1 from public.invite_codes where code = c) then raise exception 'code_exists'; end if;
  insert into public.invite_codes (code, max_uses, note, expires_at, kind) values (c, p_max, nullif(trim(p_note), ''), p_expires, 'admin');
  return c;
end; $$;

create or replace function public.admin_code_update(p_code text, p_active boolean, p_max int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin('code_update', jsonb_build_object('code', p_code, 'active', p_active, 'max', p_max));
  update public.invite_codes set active = coalesce(p_active, active), max_uses = greatest(coalesce(p_max, max_uses), used, 1)
   where code = upper(trim(p_code));
end; $$;

create or replace function public.admin_code_delete(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin('code_delete', jsonb_build_object('code', p_code));
  delete from public.invite_codes where code = upper(trim(p_code));
end; $$;

create or replace function public.admin_mail_send(p_to text, p_title text, p_body text, p_gift int, p_gift_uses int, p_gift_days int, p_expires timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid; nid uuid;
begin
  perform public.onote_require_admin('mail_send', jsonb_build_object('to', coalesce(nullif(trim(p_to), ''), '*'), 'gift', p_gift));
  if nullif(trim(coalesce(p_to, '')), '') is not null then
    select id into rid from public.profiles where username = lower(trim(leading '@' from trim(p_to)));
    if rid is null then raise exception 'user_not_found'; end if;
  end if;
  insert into public.mails (recipient, title, body, gift_invites, gift_uses, gift_days, expires_at)
  values (rid, trim(p_title), coalesce(p_body, ''), coalesce(p_gift, 0), coalesce(p_gift_uses, 1), p_gift_days, p_expires)
  returning id into nid;
  return nid;
end; $$;

create or replace function public.admin_mails()
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin(null);
  return (select coalesce(json_agg(json_build_object('id', m.id, 'title', m.title, 'body', m.body, 'to', case when m.recipient is null then null else coalesce(p.username, '?') end,
           'gift', m.gift_invites, 'gift_uses', m.gift_uses, 'gift_days', m.gift_days, 'expires_at', m.expires_at, 'created_at', m.created_at,
           'reads', (select count(*) from public.mail_state s where s.mail_id = m.id and s.read_at is not null),
           'claims', (select count(*) from public.mail_state s where s.mail_id = m.id and s.claimed_at is not null)) order by m.created_at desc), '[]'::json)
    from (select * from public.mails order by created_at desc limit 200) m
    left join public.profiles p on p.id = m.recipient);
end; $$;

create or replace function public.admin_mail_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin('mail_delete', jsonb_build_object('id', p_id));
  delete from public.mails where id = p_id;
end; $$;

create or replace function public.admin_suggestions(p_status text default null)
returns json language plpgsql security definer set search_path = '' as $$
begin
  perform public.onote_require_admin(null);
  return (select coalesce(json_agg(json_build_object('id', s.id, 'category', s.category, 'title', s.title, 'body', s.body, 'status', s.status,
           'reply', s.reply, 'replied_at', s.replied_at, 'created_at', s.created_at, 'username', p.username, 'display_name', p.display_name)
           order by s.created_at desc), '[]'::json)
    from (select * from public.suggestions where p_status is null or status = p_status order by created_at desc limit 300) s
    left join public.profiles p on p.id = s.user_id);
end; $$;

-- 답변하면 상태가 '답변 완료'가 되고, 건의한 사람의 우편함으로도 알림 우편이 감
create or replace function public.admin_suggest_reply(p_id uuid, p_reply text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.suggestions; old_reply text;
begin
  perform public.onote_require_admin('suggest_reply', jsonb_build_object('id', p_id, 'status', p_status));
  select reply into old_reply from public.suggestions where id = p_id;
  update public.suggestions
     set reply = nullif(trim(coalesce(p_reply, '')), ''),
         status = coalesce(nullif(p_status, ''), case when nullif(trim(coalesce(p_reply, '')), '') is null then status else 'answered' end),
         replied_at = case when nullif(trim(coalesce(p_reply, '')), '') is null then replied_at
                           when nullif(trim(coalesce(p_reply, '')), '') is distinct from reply then now() else replied_at end
   where id = p_id returning * into s;
  if not found then raise exception 'not_found'; end if;
  if s.reply is not null and s.reply is distinct from old_reply then
    insert into public.mails (recipient, title, body)
    values (s.user_id, left('[건의 답변] ' || s.title, 100), left('보내주신 건의에 답변이 달렸어요.' || chr(10) || chr(10) || s.reply, 5000));
  end if;
end; $$;

-- ---------- 함수 권한: 로그인한 사람만 (가입 화면용 두 개는 위에서 anon 허용) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'my_mails()', 'my_mail_unread()', 'mail_read(uuid)', 'mail_hide(uuid)', 'mail_claim(uuid)',
    'suggest_create(text,text,text)', 'my_suggestions()', 'suggest_delete(uuid)',
    'admin_status()', 'admin_overview()', 'admin_set_invite_required(boolean)', 'admin_codes(text)',
    'admin_code_create(text,int,timestamptz,text)', 'admin_code_update(text,boolean,int)', 'admin_code_delete(text)',
    'admin_mail_send(text,text,text,int,int,int,timestamptz)', 'admin_mails()', 'admin_mail_delete(uuid)',
    'admin_suggestions(text)', 'admin_suggest_reply(uuid,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- 운영자 지정 (사이트에서는 불가 — Supabase 대시보드 SQL Editor에서만)
--   insert into public.admins (user_id)
--   select id from public.profiles where username = '운영자_아이디';
-- 해제:
--   delete from public.admins where user_id = (select id from public.profiles where username = '운영자_아이디');
-- =====================================================================

-- 내가 가진 초대 코드 (우편 선물로 받은 코드) 와 사용 현황 — 누가 썼는지는 저장하지 않으므로 횟수만
create or replace function public.my_invite_codes()
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object(
           'code', c.code, 'used', c.used, 'max', c.max_uses, 'exp', c.expires_at, 'active', c.active,
           'created_at', c.created_at, 'mail_title', m.title) order by c.created_at desc), '[]'::json)
    from public.invite_codes c
    left join public.mails m on m.id = c.mail_id
   where auth.uid() is not null and c.owner = auth.uid();
$$;
revoke all on function public.my_invite_codes() from public, anon;
grant execute on function public.my_invite_codes() to authenticated;

-- 오늘 쓴 글자 수(기기별 줄, 계정 단위 합산)를 위한 항목 종류 'stat' 허용
alter table public.items drop constraint if exists items_type_check;
alter table public.items add constraint items_type_check
  check (type in ('folder','character','world','story','plot','memo','idea','vault','settings','stat'));
