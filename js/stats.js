// 오늘 쓴 글자 수 — 계정 단위로 합산
// 기기마다 자기 줄(type 'stat') 하나에만 기록하고, 화면에는 모든 기기 줄을 더해서 보여줌
// → 여러 기기에서 동시에 써도 서로 덮어쓰지 않음. 글 내용은 저장하지 않고 날짜별 글자 수만 저장
import { all, create, update } from './store.js';
import { countText } from './ui.js';

const DEV_KEY = 'onote-device';
const KEEP_DAYS = 14;

// 사용자가 있는 곳의 날짜 (자정 기준) — YYYY-MM-DD
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEV_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEV_KEY, id); }
    return id;
  } catch { return 'nostorage'; }
}

function myRow() {
  const dev = deviceId();
  return all('stat').find((r) => r.data.dev === dev) || create('stat', { dev, days: {} });
}

function add(n) {
  if (!(n > 0)) return;
  const k = dayKey();
  const cut = dayKey(new Date(Date.now() - KEEP_DAYS * 864e5));
  update(myRow().id, (d) => {
    const days = {};
    for (const [day, v] of Object.entries(d.days || {})) if (day >= cut) days[day] = v;
    days[k] = (days[k] || 0) + n;
    return { ...d, days };
  }, { silent: true });
}

// 예전 방식(이 기기에만 저장)으로 오늘 센 글자 수가 있으면 계정 기록으로 한 번 옮김
function migrateLegacy() {
  try {
    for (const k of new Set([dayKey(), new Date().toISOString().slice(0, 10)])) {
      const v = +localStorage.getItem(`onote-daily-${k}`) || 0;
      if (v) add(v);
    }
    Object.keys(localStorage).filter((k) => k.startsWith('onote-daily-')).forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

// 문서를 열 때 현재 글자 수를 기준으로 잡고, 이후 늘어난 만큼만 셈 (지운 만큼 빼지는 않음)
const base = new Map();
const count = (text) => countText(text || '').noSpace;
export function startCount(key, text) { base.set(key, count(text)); }
export function trackText(key, text) {
  const n = count(text);
  if (!base.has(key)) { base.set(key, n); return; }
  const diff = n - base.get(key);
  base.set(key, n);
  if (diff > 0) add(diff);
}

let migrated = false;
export function todayWritten() {
  if (!migrated) { migrated = true; migrateLegacy(); }
  const k = dayKey();
  return all('stat').reduce((a, r) => a + (+r.data.days?.[k] || 0), 0);
}
