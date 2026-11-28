// O-note: 이메일 확인 전 계정의 이메일 바꾸기
// - 로그인한 본인만, 그리고 아직 이메일 확인이 안 된 계정만 쓸 수 있음
//   (확인된 계정은 브라우저에서 기본 '이메일 변경' 절차(새 주소로 확인 메일)를 그대로 씀)
// - 바꾼 뒤 새 주소로 가입 확인 메일을 보냄. 다른 사람 주소로 메일 폭탄을 보내지 못하게 하루 3번까지
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
const DAILY_LIMIT = 3;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'auth' }, 401);
    const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    const user = who?.user;
    if (whoErr || !user) return json({ error: 'auth' }, 401);
    if (user.email_confirmed_at) return json({ error: 'already_confirmed' }, 409);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined;
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400);
    if (email === (user.email || '').toLowerCase()) return json({ error: 'same_email' }, 400);

    // 하루 변경 횟수 제한 (기록은 서버 표에만, 24시간 지나면 의미 없음)
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from('email_change_log').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('at', since);
    if ((count || 0) >= DAILY_LIMIT) return json({ error: 'too_many' }, 429);

    const { error: upErr } = await admin.auth.admin.updateUserById(user.id, { email });
    if (upErr) {
      const m = String(upErr.message || '');
      if (/already|exists|registered/i.test(m)) return json({ error: 'email_taken' }, 409);
      return json({ error: 'update_failed' }, 400);
    }
    await admin.from('email_change_log').insert({ user_id: user.id });

    const pub = createClient(URL_, PUBLIC, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: mailErr } = await pub.auth.resend({ type: 'signup', email, options: redirectTo ? { emailRedirectTo: redirectTo } : undefined });
    return json({ ok: true, mail: mailErr ? (/rate|seconds/i.test(mailErr.message) ? 'rate_limited' : 'failed') : 'sent' });
  } catch (_e) {
    return json({ error: 'server' }, 500);
  }
});
