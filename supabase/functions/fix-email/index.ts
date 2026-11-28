// O-note: 로그인 화면의 '이메일을 잘못 적었어요'
// 이메일 확인 전이라 로그인할 수 없는 계정이, 아이디(또는 이메일)+비밀번호로 본인임을 보이고
// 이메일을 고친 뒤 새 주소로 확인 메일을 다시 받게 함.
// - 비밀번호 확인은 Supabase 로그인 서버에 맡김: 비밀번호가 맞을 때만 'Email not confirmed'가 오고, 틀리면 'Invalid credentials'
// - 계정이 있는지 없는지 드러내지 않도록 실패 응답은 모두 같게 + 최소 지연
// - 같은 계정에 1시간 5번 넘게 틀리면 막고, 이메일 변경은 하루 3번까지
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const pick = (jsonEnv: string, legacy: string) => {
  try { const v = JSON.parse(Deno.env.get(jsonEnv) || '{}').default; if (v) return v as string; } catch { /* noop */ }
  return Deno.env.get(legacy) || '';
};
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SECRET = pick('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC = pick('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const FAIL_LIMIT = 5;      // 1시간
const CHANGE_LIMIT = 3;    // 24시간
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const started = Date.now();
  const slow = async (body: unknown, status: number) => {
    const wait = 700 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return json(body, status);
  };
  const fail = () => slow({ error: 'invalid' }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body.login || '').trim().toLowerCase();
    const password = String(body.password || '');
    const newEmail = String(body.email || '').trim().toLowerCase();
    const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
    if (!EMAIL_RE.test(newEmail) || newEmail.length > 254) return slow({ error: 'invalid_email' }, 400);
    if (!login || password.length < 6 || password.length > 200) return fail();

    const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
    admin.rpc('onote_prune_email_logs').then(() => {}, () => {});

    // 지금 이메일과 계정 찾기
    let userId = '';
    let curEmail = '';
    if (login.includes('@')) {
      const { data } = await admin.rpc('onote_user_by_email', { p_email: login });
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return fail();
      userId = row.id; curEmail = login;
    } else {
      if (!/^[a-z0-9_]{3,20}$/.test(login)) return fail();
      const { data: prof } = await admin.from('profiles').select('id').eq('username', login).maybeSingle();
      if (!prof) return fail();
      const { data: u } = await admin.auth.admin.getUserById(prof.id);
      if (!u?.user?.email) return fail();
      userId = prof.id; curEmail = u.user.email;
    }
    if (newEmail === curEmail.toLowerCase()) return slow({ error: 'same_email' }, 400);

    // 비밀번호 추측 방지
    const hourAgo = new Date(Date.now() - 3600e3).toISOString();
    const { count: fails } = await admin.from('fix_email_fail').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('at', hourAgo);
    if ((fails || 0) >= FAIL_LIMIT) return slow({ error: 'rate_limited' }, 429);

    // 비밀번호 확인 (로그인 서버의 응답으로 판단)
    const pub = createClient(URL_, PUBLIC, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: si, error: siErr } = await pub.auth.signInWithPassword({ email: curEmail, password });
    if (si?.session) {
      // 이미 확인된 계정 → 만든 세션은 바로 끝내고, 그냥 로그인하라고 안내
      await pub.auth.signOut().catch(() => {});
      return slow({ error: 'already_confirmed' }, 409);
    }
    const code = String((siErr as { code?: string })?.code || '');
    const msg = String(siErr?.message || '');
    if (!(code === 'email_not_confirmed' || /not confirmed/i.test(msg))) {
      if (/rate|too many/i.test(msg)) return slow({ error: 'rate_limited' }, 429);
      await admin.from('fix_email_fail').insert({ user_id: userId });
      return fail();
    }

    // 하루 변경 횟수 제한
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const { count: changes } = await admin.from('email_change_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('at', dayAgo);
    if ((changes || 0) >= CHANGE_LIMIT) return slow({ error: 'too_many' }, 429);

    const { error: upErr } = await admin.auth.admin.updateUserById(userId, { email: newEmail });
    if (upErr) {
      if (/already|exists|registered/i.test(String(upErr.message || ''))) return slow({ error: 'email_taken' }, 409);
      return slow({ error: 'update_failed' }, 400);
    }
    await admin.from('email_change_log').insert({ user_id: userId });

    const { error: mailErr } = await pub.auth.resend({ type: 'signup', email: newEmail, options: redirectTo ? { emailRedirectTo: redirectTo } : undefined });
    return slow({ ok: true, mail: mailErr ? (/rate|seconds/i.test(mailErr.message) ? 'rate_limited' : 'failed') : 'sent' }, 200);
  } catch (_e) {
    return slow({ error: 'server' }, 500);
  }
});
