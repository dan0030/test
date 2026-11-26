// 사이트 테마 색: 프리셋 또는 직접 고른 색 하나로 밝게/어둡게 모드에 맞는 색 묶음을 만들어 적용
// 저장: 이 기기(localStorage, 첫 화면 깜빡임 방지) + 계정 설정(settings 기록, 다른 기기와 동기화)

export const LOOK_KEY = 'onote-look';
export const DEFAULT_LOOK = { accent: 'violet', tint: 0 };

// 프리셋: 밝은 모드 대표 색 (어두운 모드 색은 자동으로 계산)
export const PRESETS = [
  ['violet', '라벤더', '#7b6cf6'],
  ['pink', '벚꽃', '#e0608e'],
  ['coral', '코랄', '#e8664f'],
  ['orange', '귤', '#e07a1f'],
  ['gold', '머스타드', '#c08f00'],
  ['green', '숲', '#2f9e6b'],
  ['mint', '민트', '#16a394'],
  ['sky', '하늘', '#2f8ee0'],
  ['navy', '남색', '#4559d6'],
  ['grape', '포도', '#9a4fd0'],
  ['mono', '먹색', '#4b4b5a'],
];
export const TINTS = [[0, '없음'], [1, '살짝'], [2, '진하게']];

// ---------- 색 계산 ----------
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t)); // a → b 로 t만큼
const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// base 쪽으로 조금씩 섞어 bg 대비 목표치를 넘을 때까지
const reach = (c, toward, bg, goal) => { for (let t = 0; t <= 1; t += 0.04) { const m = mix(c, toward, t); if (contrast(m, bg) >= goal) return m; } return toward; };
const onColor = (c) => (contrast(c, '#ffffff') >= 3 ? '#ffffff' : '#1b1a22');
const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

export const accentHex = (look) => (isHex(look?.accent) ? look.accent.toLowerCase() : (PRESETS.find((p) => p[0] === look?.accent) || PRESETS[0])[2]);
export const normLook = (l) => ({ accent: isHex(l?.accent) || PRESETS.some((p) => p[0] === l?.accent) ? l.accent : 'violet', tint: [0, 1, 2].includes(+l?.tint) ? +l.tint : 0 });
const isDefault = (l) => l.accent === 'violet' && !l.tint;

const LIGHT = { bg: '#f6f6fa', surface: '#ffffff', s2: '#f1f0f7', line: '#e4e3ee' };
const DARK = { bg: '#15151b', surface: '#1e1e26', s2: '#272732', line: '#33323f' };

function vars(c, base, dark, tint) {
  const k = [0, 0.05, 0.11][tint] || 0;
  const bg = mix(base.bg, c, k); const surface = mix(base.surface, c, k * 0.35);
  // 고른 색을 최대한 그대로 쓰고, 배경에 묻힐 만큼 너무 밝거나(밝은 모드) 어두울 때(어두운 모드)만 살짝 보정
  const accent = dark ? reach(c, '#ffffff', base.bg, 3.2) : reach(c, '#000000', '#ffffff', 1.5);
  const ink = dark ? reach(mix(c, '#ffffff', 0.45), '#ffffff', base.surface, 7) : reach(c, '#000000', '#ffffff', 5.2);
  const out = {
    '--accent': accent,
    '--accent-2': dark ? mix(base.surface, c, 0.24) : mix('#ffffff', c, 0.13),
    '--accent-ink': ink,
    '--on-accent': onColor(accent),
  };
  if (k) Object.assign(out, { '--bg': bg, '--surface': surface, '--surface-2': mix(base.s2, c, k * 1.3), '--line': mix(base.line, c, k * 1.6) });
  return Object.entries(out).map(([n, v]) => `${n}: ${v};`).join(' ');
}

// ---------- 적용 ----------
let current = DEFAULT_LOOK;
export const getLook = () => current;

export function applyLook(look) {
  const l = normLook(look); current = l;
  let el = document.getElementById('onote-look');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (isDefault(l)) { el?.remove(); meta?.setAttribute('content', '#7b6cf6'); return l; }
  const c = accentHex(l);
  const L = vars(c, LIGHT, false, l.tint); const D = vars(c, DARK, true, l.tint);
  if (!el) { el = document.createElement('style'); el.id = 'onote-look'; document.head.appendChild(el); }
  el.textContent = `:root { ${L} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${D} } }
:root[data-theme="dark"] { ${D} }`;
  meta?.setAttribute('content', c);
  return l;
}

export function saveLocalLook(l) { try { localStorage.setItem(LOOK_KEY, JSON.stringify(l)); } catch { /* noop */ } }

// 이 기기에 저장된 색을 바로 적용 (첫 화면 깜빡임 방지)
try { applyLook(JSON.parse(localStorage.getItem(LOOK_KEY) || 'null') || DEFAULT_LOOK); } catch { applyLook(DEFAULT_LOOK); }
