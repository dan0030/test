// 사이트 UI 글꼴: 기본 제공 글꼴 또는 내가 올린 글꼴 파일
// - 고른 글꼴은 이 기기(localStorage, 첫 화면 깜빡임 방지) + 계정 설정(다른 기기와 동기화)에 저장
// - 올린 글꼴 파일: 클라우드 모드는 비공개 저장소('font' 버킷, 본인만 접근), 체험 모드는 이 브라우저(IndexedDB)에만
// - 기기마다 한 번 받은 글꼴은 기기 캐시에 보관 → 매번 다시 내려받지 않음
// - 본문 편집기·E북 리더의 글꼴(명조 등)은 각자의 설정을 따르고, 여기서는 메뉴·버튼·목록 같은 화면 글꼴만 바꿈
import * as cache from './cache.js';

export const FONT_KEY = 'onote-font';
export const FONT_LIMITS = { size: 10 * 1024 * 1024, count: 3 };
const BUCKET = 'font';
const FALLBACK = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';

// [키, 이름, 설명, font-family, 함께 불러올 CSS]
export const BUILTIN = [
  ['default', '기본', '기기에 있는 고딕 글꼴', '', ''],
  ['pretendard', '프리텐다드', '깔끔한 고딕', '"Pretendard Variable"', 'vendor/fonts/pretendard/font.css'],
  ['gowun-dodum', '고운돋움', '부드럽고 둥근 느낌', '"Gowun Dodum"', 'vendor/fonts/gowun-dodum/font.css'],
  ['gowun-batang', '고운바탕', '단정한 명조', '"Gowun Batang"', 'vendor/fonts/gowun-batang/font.css'],
  ['nanum-pen', '나눔손글씨 펜', '손글씨', '"Nanum Pen Script"', 'vendor/fonts/nanum-pen-script/font.css'],
  ['system-serif', '명조 (기기 글꼴)', '기기에 있는 명조', '"Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang"', ''],
];
// 손글씨처럼 작게 보이는 글꼴은 조금 키워서 읽기 편하게
const SCALE = { 'nanum-pen': 1.18 };

const EXT = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const MAGIC = { woff2: [[0x77, 0x4f, 0x46, 0x32]], woff: [[0x77, 0x4f, 0x46, 0x46]], ttf: [[0x00, 0x01, 0x00, 0x00], [0x74, 0x72, 0x75, 0x65]], otf: [[0x4f, 0x54, 0x54, 0x4f], [0x00, 0x01, 0x00, 0x00]] };

let current = { key: 'default' };
export const getFont = () => current;
export const normFont = (f) => {
  const key = typeof f?.key === 'string' ? f.key : 'default';
  if (key.startsWith('u:')) return { key, name: String(f.name || '내 글꼴').slice(0, 40), path: String(f.path || ''), local: !!f.local };
  return { key: BUILTIN.some((b) => b[0] === key) ? key : 'default' };
};

function setVar(family, scale = 1) {
  let el = document.getElementById('onote-font');
  if (!family) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'onote-font'; document.head.appendChild(el); }
  el.textContent = `:root { --sans: ${family}, ${FALLBACK}; }${scale !== 1 ? ` body { font-size: ${Math.round(15 * scale * 10) / 10}px; }` : ''}`;
}
function linkCSS(href) {
  if (!href || document.querySelector(`link[data-font="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.dataset.font = href;
  document.head.appendChild(l);
}

// ---------- 내 글꼴 파일 불러오기 ----------
const loaded = new Map(); // key → family 이름
const familyOf = (key) => `ONoteUser-${key.slice(2).replace(/[^\w-]/g, '')}`;
async function fontBytes(f, sb) {
  const ck = `ofont:${f.path || f.key}`;
  let blob = await cache.getImg(ck);
  if (!blob && !f.local && sb) {
    const { data, error } = await sb.storage.from(BUCKET).download(f.path);
    if (error) throw error;
    blob = data;
    if (cache.cacheEnabled()) cache.putImg(ck, blob);
  }
  return blob;
}
async function loadUser(f, sb) {
  if (loaded.has(f.key)) return loaded.get(f.key);
  const blob = await fontBytes(f, sb);
  if (!blob) throw new Error('글꼴 파일을 찾지 못했어요.');
  const fam = familyOf(f.key);
  const face = new FontFace(fam, await blob.arrayBuffer(), { display: 'swap' });
  await face.load();
  document.fonts.add(face);
  loaded.set(f.key, fam);
  return fam;
}

let sbRef = null;
export const fontReady = (f) => !f?.key?.startsWith('u:') || loaded.has(f.key);
export function setFontClient(sb) { sbRef = sb; }

export async function applyFont(f) {
  const n = normFont(f); current = n;
  if (n.key.startsWith('u:')) {
    try { setVar(`"${await loadUser(n, sbRef)}"`); } catch (e) { console.warn('font', e); if (current === n) setVar(''); }
    return n;
  }
  const b = BUILTIN.find((x) => x[0] === n.key);
  linkCSS(b[4]);
  setVar(b[3], SCALE[n.key] || 1);
  return n;
}
export function saveLocalFont(f) { try { localStorage.setItem(FONT_KEY, JSON.stringify(f)); } catch { /* noop */ } }

// ---------- 올리기 · 지우기 ----------
export async function checkFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!EXT[ext]) throw new Error('woff2 · woff · ttf · otf 형식의 글꼴 파일만 올릴 수 있어요.');
  if (file.size > FONT_LIMITS.size) throw new Error(`글꼴 파일이 너무 커요. ${FONT_LIMITS.size / 1048576}MB 이하만 올릴 수 있어요. (woff2로 바꾸면 훨씬 작아져요)`);
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!MAGIC[ext].some((m) => m.every((v, i) => head[i] === v))) throw new Error('올바른 글꼴 파일이 아니에요.');
  // 실제로 글꼴로 읽히는지 확인
  try { await new FontFace('ONoteCheck', await file.arrayBuffer()).load(); } catch { throw new Error('이 브라우저에서 읽을 수 없는 글꼴 파일이에요.'); }
  return { ext, type: EXT[ext] };
}

/** 파일 → 계정 설정에 넣을 글꼴 정보 { key, name, path, size, local } */
export async function uploadFont(file, { sb, uid, cloud }) {
  const { ext, type } = await checkFile(file);
  const id = crypto.randomUUID().slice(0, 12);
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '내 글꼴';
  const blob = new Blob([await file.arrayBuffer()], { type });
  if (!cloud) {
    await cache.putImg(`ofont:u:${id}`, blob);
    if (!(await cache.getImg(`ofont:u:${id}`))) throw new Error('이 브라우저에 글꼴을 저장하지 못했어요.');
    return { key: `u:${id}`, name, path: '', size: file.size, local: true };
  }
  const path = `${uid}/${id}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) {
    if (/row-level security|policy|quota|exceed/i.test(error.message)) throw new Error(`글꼴은 계정당 ${FONT_LIMITS.count}개까지 올릴 수 있어요. 또는 사진·글꼴 저장 공간을 다 썼을 수 있어요.`);
    throw new Error(`글꼴을 올리지 못했어요: ${error.message}`);
  }
  if (cache.cacheEnabled()) cache.putImg(`ofont:${path}`, blob);
  return { key: `u:${id}`, name, path, size: file.size, local: false };
}

export async function deleteFont(f, sb) {
  if (!f.local && f.path && sb) { const { error } = await sb.storage.from(BUCKET).remove([f.path]); if (error) throw error; }
  cache.delImgs([`ofont:${f.path || f.key}`]);
  loaded.delete(f.key);
}

// 탈퇴할 때: 내 글꼴 파일 전부 지우기
export async function deleteAllFonts(sb, uid) {
  if (!sb || !uid) return;
  const { data } = await sb.storage.from(BUCKET).list(uid, { limit: 100 });
  if (data?.length) await sb.storage.from(BUCKET).remove(data.map((f) => `${uid}/${f.name}`));
}

// 이 기기에 저장된 글꼴을 바로 적용 (내 글꼴은 기기 캐시에 있으면 바로, 없으면 로그인 후 받아서 적용)
try { applyFont(JSON.parse(localStorage.getItem(FONT_KEY) || 'null') || {}); } catch { /* noop */ }
