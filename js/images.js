// O-note 이미지 저장소
// - 이미지는 DB(500MB)가 아니라 Storage 버킷(1GB, 비공개, 본인 폴더만 접근)에 작은 WebP로 저장
// - 문서에는 'oimg:<사용자ID>/<파일>' 참조만 남김 → DB 용량·전송량 절약
// - 각 기기는 한 번 받은 이미지를 기기 캐시에 보관 → 같은 이미지를 다시 내려받지 않음
// - 보안 금고를 켜면 이미지도 브라우저에서 암호화한 뒤 올림
import { store, all, update, flush } from './store.js';
import { PH, isRef, esc, toast } from './ui.js';
import * as cache from './cache.js';

const BUCKET = 'img';
export const LIMITS = { file: 1.5 * 1024 * 1024, user: 15 * 1024 * 1024 };
const SPEC = {
  content: { max: 1100, q: 0.72 }, // 본문 사진
  profile: { max: 720, q: 0.75 }, // 프로필
  cover: { max: 640, q: 0.72 }, // 표지
  icon: { size: 128, q: 0.8 }, // 폴더 아이콘 (정사각형)
};
const mem = new Map(); // ref → objectURL
const blobs = new Map(); // ref → 원본(복호화된) Blob — fetch(blob:)는 보안 정책상 막혀 있어 직접 보관
const pending = new Map(); // ref → Promise<objectURL>

const uid = () => store.user?.id;
const cloud = () => store.mode === 'cloud' && store.sb && uid();

// ---------------- 압축 ----------------
let webpOK = null;
const supportsWebp = () => {
  if (webpOK === null) { const c = document.createElement('canvas'); c.width = c.height = 1; webpOK = c.toDataURL('image/webp').startsWith('data:image/webp'); }
  return webpOK;
};
function loadImg(file) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('이미지 파일이 아니에요.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 읽지 못했어요.')); };
    img.src = url;
  });
}
// 다시 그려서 저장 → 크기 축소 + 촬영 위치 등 메타데이터(EXIF) 제거
export async function encode(file, kind = 'content') {
  const sp = SPEC[kind] || SPEC.content;
  const img = await loadImg(file);
  const c = document.createElement('canvas');
  if (sp.size) {
    const s = Math.min(img.width, img.height);
    c.width = c.height = sp.size;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, sp.size, sp.size);
  } else {
    const r = Math.min(1, sp.max / Math.max(img.width, img.height));
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  }
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  let q = sp.q;
  let blob = await new Promise((r) => c.toBlob(r, type, q));
  // 너무 크면 품질을 낮춰 한 번 더
  while (blob && blob.size > 400 * 1024 && q > 0.45) { q -= 0.12; blob = await new Promise((r) => c.toBlob(r, type, q)); }
  if (!blob) throw new Error('이미지를 변환하지 못했어요.');
  return blob;
}

const toDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
// data URL → Blob (fetch를 쓰지 않음: 보안 정책 connect-src)
const fromDataURL = async (u) => {
  const [head, b64] = u.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

// ---------------- 금고 암호화 ----------------
async function seal(blob) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, store.vault.key, await blob.arrayBuffer());
  return new Blob([iv, new Uint8Array(ct)], { type: 'application/octet-stream' });
}
async function open(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, store.vault.key, buf.slice(12));
  return new Blob([pt], { type: 'image/webp' });
}

// ---------------- 저장 ----------------
async function upload(blob, enc = !!store.vault?.key) {
  const body = enc ? await seal(blob) : blob;
  if (body.size > LIMITS.file) throw new Error('이미지가 너무 커요. 더 작은 이미지를 써주세요.');
  const name = `${crypto.randomUUID()}.${enc ? 'bin' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const path = `${uid()}/${name}`;
  const { error } = await store.sb.storage.from(BUCKET).upload(path, body, { contentType: body.type, cacheControl: '31536000', upsert: false });
  if (error) {
    if (/row-level security|policy|quota|exceed/i.test(error.message)) throw new Error('사진 저장 공간(15MB)을 다 썼거나, 사이트 전체 사진 공간이 거의 찼어요. 설정 → 저장 공간에서 확인해 주세요.');
    throw new Error(`이미지를 올리지 못했어요: ${error.message}`);
  }
  const ref = `oimg:${path}`;
  mem.set(ref, URL.createObjectURL(blob));
  blobs.set(ref, blob);
  if (cache.cacheEnabled()) cache.putImg(ref, body);
  return ref;
}

/** 파일 → 문서에 넣을 이미지 값 (클라우드: oimg 참조 / 체험 모드: data URL) */
export async function saveImage(file, kind = 'content') {
  const blob = await encode(file, kind);
  if (!cloud()) return toDataURL(blob);
  return upload(blob);
}

// ---------------- 불러오기 ----------------
export async function refBlob(ref) { await refURL(ref); return blobs.get(ref); }

export function refURL(ref) {
  if (!isRef(ref)) return Promise.resolve(ref);
  if (mem.has(ref)) return Promise.resolve(mem.get(ref));
  if (pending.has(ref)) return pending.get(ref);
  const p = (async () => {
    const path = ref.slice(5);
    let raw = cache.cacheEnabled() ? await cache.getImg(ref) : null;
    if (!raw) {
      if (!cloud()) throw new Error('offline');
      const { data, error } = await store.sb.storage.from(BUCKET).download(path);
      if (error) throw error;
      raw = data;
      if (cache.cacheEnabled()) cache.putImg(ref, raw);
    }
    const blob = path.endsWith('.bin') ? (store.vault?.key ? await open(raw) : null) : raw;
    if (!blob) throw new Error('locked');
    const url = URL.createObjectURL(blob);
    mem.set(ref, url);
    blobs.set(ref, blob);
    return url;
  })().finally(() => pending.delete(ref));
  pending.set(ref, p);
  return p;
}

// 화면에 붙는 이미지 자동 채우기
function fill(el) {
  if (el.nodeType !== 1) return;
  const list = [];
  if (el.matches?.('img[data-src^="oimg:"],[data-bg^="oimg:"]')) list.push(el);
  el.querySelectorAll?.('img[data-src^="oimg:"],[data-bg^="oimg:"]').forEach((x) => list.push(x));
  list.forEach((x) => {
    const ref = x.getAttribute('data-src') || x.getAttribute('data-bg');
    if (x._oimg === ref) return;
    x._oimg = ref;
    refURL(ref).then((url) => {
      if (x.getAttribute('data-src') === ref) x.src = url;
      else if (x.getAttribute('data-bg') === ref) x.style.backgroundImage = `url('${url}')`;
    }).catch(() => { x.classList.add('img-missing'); x.title = '이미지를 불러오지 못했어요'; });
  });
}
export function startImageHydrator() {
  fill(document.body);
  new MutationObserver((muts) => muts.forEach((m) => {
    if (m.type === 'attributes') fill(m.target);
    else m.addedNodes.forEach(fill);
  })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-src', 'data-bg'] });
}

// ---------------- 내보내기용: 참조 → 실제 이미지(data URL) ----------------
export async function inlineImages(html) {
  if (!html || !html.includes('oimg:')) return html;
  const tags = html.match(/<img\b[^>]*data-src="oimg:[^"]+"[^>]*>/g) || [];
  for (const tag of [...new Set(tags)]) {
    const ref = tag.match(/data-src="(oimg:[^"]+)"/)[1];
    let data = '';
    try { data = await toDataURL(await refBlob(ref)); } catch { /* 못 불러오면 빈 이미지 */ }
    const fixed = tag.replace(/\s(?:src|data-src)="[^"]*"/g, '').replace(/^<img\b/, `<img src="${data || PH}"`);
    html = html.split(tag).join(fixed);
  }
  return html;
}
// 데이터 전체(백업용)
export async function inlineData(value) {
  if (typeof value === 'string') {
    if (isRef(value)) { try { return await toDataURL(await refBlob(value)); } catch { return ''; } }
    return value.includes('oimg:') ? inlineImages(value) : value;
  }
  if (Array.isArray(value)) return Promise.all(value.map(inlineData));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await inlineData(v);
    return out;
  }
  return value;
}

// ---------------- 옮기기 · 정리 ----------------
const DATA_IMG = /data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]{1500,}/g;

async function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await mapStrings(v, fn)); return out; }
  if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = await mapStrings(v, fn); return out; }
  return value;
}

// 문서 안에 직접 들어 있는 큰 이미지(data URL)를 저장소로 옮김 (붙여넣기·백업 불러오기·예전 기록)
let migrating = false;
export async function migrateInlineImages({ quiet = true } = {}) {
  if (!cloud() || store.locked || migrating) return 0;
  migrating = true;
  let moved = 0;
  try {
    for (const it of [...all(), ...all('settings')]) {
      const json = JSON.stringify(it.data);
      if (!DATA_IMG.test(json)) { DATA_IMG.lastIndex = 0; continue; }
      DATA_IMG.lastIndex = 0;
      const done = new Map();
      const conv = async (s) => {
        if (!s.includes('data:image/')) return s;
        const whole = /^data:image\/(?:png|jpe?g|gif|webp);base64,/.test(s) && s.length > 1500 && !/[\s<"]/.test(s);
        const found = whole ? [s] : (s.match(DATA_IMG) || []);
        let out = s;
        for (const du of found) {
          if (!done.has(du)) {
            try { done.set(du, await upload(await encode(await fromDataURL(du), 'content'))); moved++; } catch (e) { done.set(du, null); if (!quiet) toast(e.message, 'error'); }
          }
          const ref = done.get(du);
          if (!ref) continue;
          if (whole) return ref;
          out = out.split(`src="${du}"`).join(`src="${PH}" data-src="${ref}"`).split(du).join(ref);
        }
        return out;
      };
      const next = await mapStrings(it.data, conv);
      if (done.size) update(it.id, () => next, { silent: true });
    }
    if (moved) await flush();
  } finally { migrating = false; }
  return moved;
}

// 어디에서도 쓰지 않는 이미지 파일 지우기 (만든 지 1시간 넘은 것만)
export async function cleanupImages({ force = false } = {}) {
  if (!cloud() || store.locked) return { removed: 0 };
  const day = new Date().toISOString().slice(0, 10);
  const key = `onote-imggc-${uid()}`;
  try { if (!force && localStorage.getItem(key) === day) return { removed: 0 }; localStorage.setItem(key, day); } catch { /* noop */ }
  if (store.dirty.size) await flush();
  const used = JSON.stringify([...all(), ...all('settings')].map((i) => i.data));
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await store.sb.storage.from(BUCKET).list(uid(), { limit: 1000, offset });
    if (error || !data) break;
    files.push(...data);
    if (data.length < 1000) break;
  }
  const hourAgo = Date.now() - 3600000;
  const orphans = files.filter((f) => f.name && !used.includes(`oimg:${uid()}/${f.name}`) && new Date(f.created_at || 0).getTime() < hourAgo).map((f) => `${uid()}/${f.name}`);
  for (let k = 0; k < orphans.length; k += 100) await store.sb.storage.from(BUCKET).remove(orphans.slice(k, k + 100));
  if (orphans.length) cache.delImgs(orphans.map((p) => `oimg:${p}`));
  return { removed: orphans.length, total: files.length };
}

// 보안 금고를 켜고 끌 때 기존 이미지도 암호화/복호화해서 다시 올림
export async function reencryptImages(wantEnc = !!store.vault?.key) {
  if (!cloud()) return 0;
  if (!store.vault?.key) return 0; // 열쇠가 있어야 암호화·복호화 가능
  const refs = new Set((JSON.stringify([...all(), ...all('settings')].map((i) => i.data)).match(/oimg:[\w-]+\/[\w.-]+/g) || []));
  const map = new Map();
  for (const ref of refs) {
    const isEnc = ref.endsWith('.bin');
    if (isEnc === wantEnc) continue;
    try {
      const plain = isEnc ? await open(await (async () => { const r = await cache.getImg(ref); if (r) return r; const { data } = await store.sb.storage.from(BUCKET).download(ref.slice(5)); return data; })()) : await refBlob(ref);
      map.set(ref, await upload(plain, wantEnc));
    } catch (e) { console.warn('reencrypt fail', ref, e); }
  }
  if (!map.size) return 0;
  const swap = (s) => { let out = s; map.forEach((to, from) => { out = out.split(from).join(to); }); return out; };
  for (const it of [...all(), ...all('settings')]) {
    const json = JSON.stringify(it.data);
    if ([...map.keys()].some((r) => json.includes(r))) update(it.id, () => JSON.parse(swap(json)), { silent: true });
  }
  await flush();
  await cleanupImages({ force: true });
  return map.size;
}

// 탈퇴 전에 내 이미지 전부 지우기
export async function deleteAllImages() {
  if (!cloud()) return;
  for (;;) {
    const { data } = await store.sb.storage.from(BUCKET).list(uid(), { limit: 1000 });
    if (!data || !data.length) break;
    await store.sb.storage.from(BUCKET).remove(data.map((f) => `${uid()}/${f.name}`));
    if (data.length < 1000) break;
  }
}

export async function usage() {
  if (!cloud()) return null;
  const { data, error } = await store.sb.rpc('my_usage');
  return error ? null : data;
}
export { esc };

// 에디터에 붙여넣거나 끌어다 놓은 이미지(data URL)를 그 자리에서 저장소로 옮김
export async function uploadDomImages(root) {
  if (!cloud()) return 0;
  let n = 0;
  for (const img of root.querySelectorAll('img[src^="data:image"]')) {
    if (img.getAttribute('data-src')) continue;
    try {
      const blob = await fromDataURL(img.getAttribute('src'));
      if (blob.size < 1024) continue;
      const ref = await upload(await encode(blob, 'content'));
      img.setAttribute('data-src', ref);
      img.src = mem.get(ref);
      n++;
    } catch (e) { toast(e.message, 'error'); }
  }
  return n;
}
