// 색상 선택기: 기본 팔레트 + 내 팔레트(계정에 저장) + 직접 지정
import { settings, updateSettings } from './store.js';
import { icon, esc, toast } from './ui.js';

export const BASE_PALETTE = [
  '#f2a7b8', '#f6c28b', '#f3e08a', '#a8d8a0', '#8fcfe0', '#a9b6f2', '#c9a7f0', '#d0d0d0',
  '#e5484d', '#f76b15', '#d6a100', '#30a46c', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f',
  '#222222', '#666666', '#b0b0b0', '#ffffff',
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const normHex = (v) => {
  v = String(v || '').trim();
  if (!v.startsWith('#')) v = `#${v}`;
  if (!HEX.test(v)) return null;
  if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v.toLowerCase();
};
export const userPalette = () => settings().data.palette || [];

function swatch(c, on, extra = '') {
  const bg = c === 'transparent' ? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' : c;
  return `<button type="button" class="sw ${on ? 'on' : ''}" data-v="${esc(c)}" style="background:${bg}" title="${esc(c)}" aria-label="${esc(c)}" ${extra}></button>`;
}

/**
 * 색 선택 팝오버. anchor 아래에 뜨고, 고르면 onPick(색) 호출.
 * opts.auto: '자동(테마 색)' 선택지 표시 / opts.transparent: '없음' 선택지 표시 / opts.presets: 기본 팔레트 대체
 */
export function openColorPopover(anchor, current, onPick, opts = {}) {
  document.querySelectorAll('.cp-pop').forEach((p) => p.remove());
  const pop = document.createElement('div');
  pop.className = 'cp-pop';
  const presets = opts.presets || BASE_PALETTE;
  const cur = normHex(current) || current || '';
  let typed = normHex(cur) || '';
  const draw = () => {
    const mine = userPalette();
    pop.innerHTML = `
      ${opts.auto || opts.transparent ? `<div class="cp-row">${opts.auto ? `<button type="button" class="cp-auto ${!cur ? 'on' : ''}" data-v="">${icon('wand-sparkles', 14)} 자동</button>` : ''}${opts.transparent ? `<button type="button" class="cp-auto" data-v="transparent">${icon('ban', 14)} 없음</button>` : ''}</div>` : ''}
      <div class="cp-label">기본 팔레트</div>
      <div class="cp-grid">${presets.map((c) => swatch(c, c === cur)).join('')}</div>
      <div class="cp-label">내 팔레트 <span class="muted">(계정에 저장돼요 · 길게 눌러 삭제)</span></div>
      <div class="cp-grid">${mine.map((c) => swatch(c, c === cur, 'data-mine="1"')).join('')}<button type="button" class="sw add" data-add title="지금 색을 내 팔레트에 추가">${icon('plus', 14)}</button></div>
      <div class="cp-label">직접 지정</div>
      <div class="cp-custom"><input type="color" value="${typed || '#7b6cf6'}" aria-label="색 고르기"><input class="input" data-hex value="${esc(typed)}" placeholder="#7b6cf6" maxlength="7"><button type="button" class="btn primary sm" data-apply>적용</button></div>`;
  };
  draw();
  document.body.appendChild(pop);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth; const h = pop.offsetHeight;
    let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.top = `${top}px`;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
  };
  place();
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  pop.addEventListener('mousedown', (e) => { if (!e.target.matches('input')) e.preventDefault(); });
  const picker = () => pop.querySelector('input[type=color]');
  const hexIn = () => pop.querySelector('[data-hex]');
  pop.addEventListener('input', (e) => {
    if (e.target.type === 'color') { hexIn().value = e.target.value; typed = e.target.value; }
    if (e.target.matches('[data-hex]')) { const h = normHex(e.target.value); if (h) { picker().value = h; typed = h; } }
  });
  pop.addEventListener('change', (e) => { if (e.target.type === 'color') { onPick(e.target.value); } });
  let pressT = null;
  pop.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-mine]');
    if (!b) return;
    pressT = setTimeout(() => {
      updateSettings((d) => { d.palette = d.palette.filter((c) => c !== b.dataset.v); });
      pressT = 'done'; draw(); toast('내 팔레트에서 삭제했어요', 'ok');
    }, 600);
  });
  pop.addEventListener('pointerup', () => { if (pressT && pressT !== 'done') clearTimeout(pressT); });
  pop.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('[data-mine]');
    if (!b) return;
    e.preventDefault();
    updateSettings((d) => { d.palette = d.palette.filter((c) => c !== b.dataset.v); });
    draw();
  });
  pop.addEventListener('click', (e) => {
    if (pressT === 'done') { pressT = null; return; }
    if (e.target.closest('[data-add]')) {
      const h = normHex(hexIn().value) || picker().value;
      if (userPalette().includes(h)) return toast('이미 내 팔레트에 있어요');
      updateSettings((d) => { d.palette = [...d.palette, h].slice(-32); });
      draw(); toast('내 팔레트에 추가했어요', 'ok');
      return;
    }
    if (e.target.closest('[data-apply]')) {
      const h = normHex(hexIn().value);
      if (!h) return toast('#RRGGBB 형식으로 입력해주세요', 'error');
      onPick(h); close(); return;
    }
    const b = e.target.closest('[data-v]');
    if (b) { onPick(b.dataset.v); close(); }
  });
  return close;
}

/**
 * 폼 안에 넣는 색 선택 줄: 빠른 선택(기본 팔레트 일부 + 내 팔레트) + [다른 색] 버튼
 * 값은 root.querySelector('[data-cp="name"]').dataset.value 로 읽음
 */
export function colorPick(name, value, quick = BASE_PALETTE.slice(0, 8), { auto = false } = {}) {
  const v = normHex(value) || value || '';
  const list = [...new Set([...quick, ...userPalette()])];
  const inList = list.includes(v);
  return `<div class="col-pick" data-cp="${esc(name)}" data-value="${esc(v)}" data-auto="${auto ? 1 : ''}">
    ${auto ? `<button type="button" class="cp-auto ${!v ? 'on' : ''}" data-c="">자동</button>` : ''}
    ${list.map((c) => `<button type="button" class="${c === v ? 'on' : ''}" data-c="${esc(c)}" style="background:${c}" aria-label="${esc(c)}"></button>`).join('')}
    ${v && !inList ? `<button type="button" class="on" data-c="${esc(v)}" style="background:${v}" aria-label="${esc(v)}"></button>` : ''}
    <button type="button" class="cp-more" data-more title="다른 색 · 내 팔레트">${icon('palette', 15)}</button>
  </div>`;
}

export function bindColorPick(root, name, onChange) {
  const box = root.querySelector(`[data-cp="${name}"]`);
  if (!box) return;
  const set = (c) => {
    box.dataset.value = c;
    let b = [...box.querySelectorAll('[data-c]')].find((x) => x.dataset.c === c);
    if (!b && c) {
      box.querySelector('[data-more]').insertAdjacentHTML('beforebegin', `<button type="button" data-c="${esc(c)}" style="background:${c}" aria-label="${esc(c)}"></button>`);
      b = box.querySelector(`[data-c="${c}"]`);
    }
    box.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b));
    onChange?.(c);
  };
  box.addEventListener('click', (e) => {
    const m = e.target.closest('[data-more]');
    if (m) return openColorPopover(m, box.dataset.value, set, { auto: !!box.dataset.auto });
    const b = e.target.closest('[data-c]');
    if (b) set(b.dataset.c);
  });
}
export const pickedColor = (root, name) => root.querySelector(`[data-cp="${name}"]`)?.dataset.value || '';
