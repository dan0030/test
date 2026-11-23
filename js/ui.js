// 공통 UI 유틸리티
import { ICONS } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function icon(name, size = 20, cls = '') {
  if (!ICONS[name]) console.warn('missing icon', name);
  const node = ICONS[name] || ICONS.circle;
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// 리치 텍스트 정화 (XSS 방지)
const ALLOWED_TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'hr', 'img', 'a', 'font', 'mark', 'sub', 'sup', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ruby', 'rt', 'rp', 'figure', 'figcaption'];
const ALLOWED_ATTR = ['style', 'href', 'src', 'alt', 'title', 'color', 'size', 'face', 'class', 'data-wiki', 'colspan', 'rowspan', 'width', 'height', 'target', 'rel'];
export function sanitize(html) {
  if (!window.DOMPurify) return esc(html);
  return window.DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS, ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp);base64,|#|\/)/i,
  });
}

export function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html || '').replace(/<\/(p|div|h\d|li|blockquote)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n');
  return d.textContent || '';
}

export function debounce(fn, ms = 400) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return fmtDate(iso);
}

// 글자 수 통계 (한국어 기준)
export function countText(text) {
  const t = (text || '').replace(/\r/g, '');
  const withSpace = [...t.replace(/\n/g, '')].length;
  const noSpace = [...t.replace(/\s/g, '')].length;
  const words = (t.trim().match(/\S+/g) || []).length;
  const paras = t.split(/\n+/).filter((l) => l.trim()).length;
  // 원고지(200자) 매수: 줄바꿈마다 남은 칸은 버림 처리
  let cells = 0;
  t.split('\n').forEach((line) => { const n = [...line].length; cells += Math.max(20, Math.ceil(n / 20) * 20); });
  const manuscript = Math.ceil(cells / 200 * 10) / 10;
  const bytes = new Blob([t]).size;
  const readMin = Math.max(1, Math.round(noSpace / 500));
  return { withSpace, noSpace, words, paras, manuscript, bytes, readMin };
}

// ---------- 토스트 ----------
export function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(type === 'error' ? 'circle-exclamation-point' : type === 'ok' ? 'circle-check' : 'info', 18)}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2600);
}

// ---------- 모달 ----------
export function modal({ title, body = '', actions = [], wide = false, onOpen } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="닫기">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? icon(a.icon, 16) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const close = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
    wrap.querySelector('[data-x]').onclick = () => close(null);
    wrap.querySelectorAll('[data-i]').forEach((b) => {
      b.onclick = async () => {
        const a = actions[+b.dataset.i];
        const v = a.value ? await a.value(wrap) : a.label;
        if (v === false) return;
        close(v);
      };
    });
    document.body.appendChild(wrap);
    onOpen?.(wrap, close);
    const f = wrap.querySelector('input,textarea,select');
    if (f && !f.closest('.fpick')) f.focus({ preventScroll: true });
  });
}

export function confirmBox(msg, okLabel = '확인', danger = false) {
  return modal({
    title: '확인',
    body: `<p>${esc(msg)}</p>`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, { label: okLabel, cls: danger ? 'danger' : 'primary', value: () => true }],
  }).then((v) => v === true);
}

export function promptBox(title, placeholder = '', initial = '') {
  return modal({
    title,
    body: `<input class="input" id="pbox" placeholder="${esc(placeholder)}" value="${esc(initial)}" maxlength="200">`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, { label: '확인', cls: 'primary', value: (w) => w.querySelector('#pbox').value.trim() || false }],
    onOpen: (w, close) => w.querySelector('#pbox').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { const v = e.target.value.trim(); if (v) close(v); } }),
  });
}

// ---------- 이미지 압축 (용량 절약 + EXIF 위치정보 제거) ----------
export function compressImage(file, max = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('이미지 파일이 아니에요.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요.')); };
    img.src = url;
  });
}

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

export function download(name, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function safeName(s) { return (s || 'o-note').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60); }

export const TYPES = {
  folder: { label: '페어 폴더', icon: 'folder-heart', desc: '페어·CP별로 모든 자료를 묶어 봐요' },
  character: { label: '캐릭터', icon: 'contact', desc: '위키형 캐릭터 프로필' },
  world: { label: '세계관', icon: 'globe', desc: '지역·세력·용어 등 설정 문서' },
  story: { label: '연성', icon: 'book-open', desc: '회차별 글 쓰기와 E북 보기' },
  plot: { label: '플롯·타임라인', icon: 'git-commit-vertical', desc: '사건 순서와 시간축 점검' },
  memo: { label: '메모', icon: 'sticky-note', desc: '짧은 메모와 아이디어' },
};

export const COLORS = ['#f2a7b8', '#f6c28b', '#f3e08a', '#a8d8a0', '#8fcfe0', '#a9b6f2', '#c9a7f0', '#d0d0d0'];

export function chips(list, cls = '') { return (list || []).map((t) => `<span class="chip ${cls}">${esc(t)}</span>`).join(''); }

export function emptyState(ic, title, desc, btn = '') {
  return `<div class="empty">${icon(ic, 40)}<h3>${esc(title)}</h3><p>${esc(desc)}</p>${btn}</div>`;
}

// 페어 폴더 아이콘: 업로드한 이미지 > 직접 입력/선택한 이모지
export function folderIcon(d, fallback = '💞', inlineStyle = '') {
  if (d && d.iconImg && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(d.iconImg)) {
    return `<img class="f-ico" src="${d.iconImg}" alt="" ${inlineStyle ? `style="${inlineStyle}"` : ''}>`;
  }
  return esc((d && d.emoji) || fallback);
}

// 정사각형으로 잘라 작게 저장 (폴더 아이콘용)
export function compressSquare(file, size = 128) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('이미지 파일이 아니에요.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했어요.')); };
    img.src = url;
  });
}
