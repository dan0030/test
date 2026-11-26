// O-note: 커미션 위시리스트용 링크 미리보기 (사이트 제목·설명·대표 이미지 읽기)
// - 로그인한 사용자만 쓸 수 있음 (verify_jwt + 토큰 확인)
// - 받은 주소의 HTML 앞부분만 읽어서 og:title / og:description / og:image 등을 돌려줌
// - 내부망·사설 IP 주소는 막음(SSRF 방지), 리다이렉트도 한 단계씩 다시 확인
// - 결과는 브라우저가 문서(폴더)에 저장하므로 같은 링크를 다시 부르지 않음 → 무료 호출 한도(월 50만 회) 안에서 충분
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
const PUBLIC = pick('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const MAX_BYTES = 600 * 1024;
const TIMEOUT = 7000;
const UA = 'Mozilla/5.0 (compatible; O-note-LinkPreview/1.0; +https://www.o-note.net)';

// ---------- 주소 검사 (내부망 차단) ----------
const privateV4 = (ip: string) => {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};
const privateV6 = (ip: string) => {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('::ffff:')) return privateV4(s.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
};
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && !['80', '443', '8080'].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) return null;
  if (/^[\d.]+$/.test(host)) return privateV4(host) ? null : u;
  if (host.includes(':')) return privateV6(host) ? null : u;
  try {
    const v4 = await Deno.resolveDns(host, 'A').catch(() => [] as string[]);
    const v6 = await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]);
    if (!v4.length && !v6.length) return null;
    if (v4.some(privateV4) || v6.some(privateV6)) return null;
  } catch { return null; }
  return u;
}

async function get(url: URL, accept = 'text/html,application/xhtml+xml'): Promise<{ res: Response; url: URL } | null> {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    let res: Response;
    try {
      res = await fetch(cur, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'ko,en;q=0.8' } });
    } finally { clearTimeout(t); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      const next = await safeUrl(new URL(res.headers.get('location')!, cur).href);
      if (!next) return null;
      cur = next;
      continue;
    }
    return { res, url: cur };
  }
  return null;
}

async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value); size += value.length;
    // </head>까지 읽었으면 충분
    if (new TextDecoder().decode(value).includes('</head>')) break;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size);
  let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  const ctype = res.headers.get('content-type') || '';
  let cs = (ctype.match(/charset=([\w-]+)/i) || [])[1];
  const ascii = new TextDecoder('latin1').decode(buf.slice(0, 4096));
  if (!cs) cs = (ascii.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder().decode(buf); }
}

const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

function parse(html: string, base: URL) {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1]?.toLowerCase();
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && val != null && !(key in meta)) meta[key] = decode(val);
  }
  const title = meta['og:title'] || meta['twitter:title'] || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const desc = meta['og:description'] || meta['twitter:description'] || meta['description'] || '';
  let image = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || meta['image'] || '';
  if (!image) {
    const link = (html.match(/<link\b[^>]*rel=["'][^"']*image_src[^"']*["'][^>]*>/i) || [])[0];
    image = link ? decode((link.match(/href=["']([^"']+)["']/i) || [])[1] || '') : '';
  }
  let icon = '';
  const iconTag = (html.match(/<link\b[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i) || html.match(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*>/i) || [])[0];
  if (iconTag) icon = decode((iconTag.match(/href=["']([^"']+)["']/i) || [])[1] || '');
  const abs = (s: string) => { if (!s) return ''; try { const u = new URL(s, base); return /^https?:$/.test(u.protocol) ? u.href.replace(/^http:/, 'https:') : ''; } catch { return ''; } };
  const price = meta['product:price:amount'] || meta['og:price:amount'] || '';
  const currency = meta['product:price:currency'] || meta['og:price:currency'] || '';
  return {
    title: title.slice(0, 200),
    desc: desc.slice(0, 300),
    image: abs(image).slice(0, 1000),
    icon: abs(icon || '/favicon.ico').slice(0, 500),
    site: (meta['og:site_name'] || base.hostname.replace(/^www\./, '')).slice(0, 80),
    price: price ? `${price}${currency ? ` ${currency}` : ''}`.slice(0, 40) : '',
  };
}

// X(트위터)는 HTML에 미리보기 정보가 없어서 공식 oEmbed로 작성자·글 내용만 가져옴
async function twitter(u: URL) {
  const api = new URL('https://publish.twitter.com/oembed');
  api.searchParams.set('url', u.href.replace('://x.com', '://twitter.com'));
  api.searchParams.set('omit_script', '1');
  const r = await get(api, 'application/json');
  if (!r || !r.res.ok) return null;
  const j = await r.res.json().catch(() => null);
  if (!j) return null;
  const text = decode(String(j.html || '').replace(/<a\b[^>]*>(pic\.twitter\.com[^<]*)<\/a>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/— .*$/, '').trim();
  return { title: `${j.author_name || 'X'}님의 게시물`.slice(0, 200), desc: text.slice(0, 300), image: '', icon: '', site: 'X', price: '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'auth' }, 401);
    const sb = createClient(URL_, PUBLIC, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: who, error: whoErr } = await sb.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: 'auth' }, 401);

    const body = await req.json().catch(() => ({}));
    const raw = String(body.url || '').trim().slice(0, 2000);
    const u = await safeUrl(raw);
    if (!u) return json({ error: 'bad_url' }, 400);

    if (/^(www\.|mobile\.)?(x|twitter)\.com$/i.test(u.hostname)) {
      const t = await twitter(u).catch(() => null);
      return t ? json({ ok: true, ...t }) : json({ error: 'fetch_failed' }, 502);
    }
    const r = await get(u).catch(() => null);
    if (!r) return json({ error: 'fetch_failed' }, 502);
    const ctype = r.res.headers.get('content-type') || '';
    if (/^image\//i.test(ctype)) {
      await r.res.body?.cancel();
      return json({ ok: true, title: '', desc: '', image: r.url.href, icon: '', site: r.url.hostname.replace(/^www\./, ''), price: '' });
    }
    if (!r.res.ok || !/html|xml/i.test(ctype)) { await r.res.body?.cancel(); return json({ error: 'fetch_failed', status: r.res.status }, 502); }
    const html = await readHead(r.res);
    return json({ ok: true, ...parse(html, r.url) });
  } catch (_e) {
    return json({ error: 'server' }, 500);
  }
});
