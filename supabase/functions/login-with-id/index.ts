// O-note: 아이디로 로그인
// 브라우저에는 이메일을 절대 돌려주지 않고, 서버 안에서 아이디 → 계정을 찾아 로그인한 뒤 세션만 돌려줍니다.
// 아이디가 없든 비밀번호가 틀리든 같은 응답을 보내 계정 존재 여부를 숨깁니다.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const started = Date.now();
  const fail = async (code = 'invalid', status = 401) => {
    // 응답 시간으로 계정 존재 여부를 추측하지 못하게 최소 지연
    const wait = 600 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return json({ error: code }, status);
  };
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[a-z0-9_]{3,20}$/.test(username) || password.length < 6 || password.length > 200) return fail();

    const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: prof } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (!prof) return fail();
    const { data: u } = await admin.auth.admin.getUserById(prof.id);
    const email = u?.user?.email;
    if (!email) return fail();

    const pub = createClient(URL_, PUBLIC, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await pub.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const msg = String(error?.message || '');
      if (/confirm/i.test(msg)) return fail('email_not_confirmed', 403);
      if (/rate|too many/i.test(msg)) return fail('rate_limited', 429);
      return fail();
    }
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (_e) {
    return fail('server', 500);
  }
});
