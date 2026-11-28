// 뽀모도로 타이머 (사이트 어디서든 동작, 상단바에 남은 시간 표시)
import { toast } from './ui.js';

const PKEY = 'onote-pomo';
const listeners = new Set();
const defaults = { focus: 25, short: 5, long: 15, every: 4, sound: true };

export const pomo = {
  settings: { ...defaults },
  mode: 'focus',
  running: false,
  endAt: 0,
  remaining: 25 * 60,
  cycles: 0,
  timer: null,
};

try { Object.assign(pomo.settings, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch { /* noop */ }
pomo.remaining = pomo.settings.focus * 60;

export const MODES = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
export function onPomo(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((f) => f(pomo));

export function saveSettings(s) {
  Object.assign(pomo.settings, s);
  try { localStorage.setItem(PKEY, JSON.stringify(pomo.settings)); } catch { /* noop */ }
  if (!pomo.running) setMode(pomo.mode);
}

export function setMode(m) {
  pomo.mode = m;
  pomo.running = false;
  clearInterval(pomo.timer);
  pomo.remaining = pomo.settings[m] * 60;
  emit();
}

export function start() {
  if (pomo.running) return;
  pomo.running = true;
  pomo.endAt = Date.now() + pomo.remaining * 1000;
  clearInterval(pomo.timer);
  pomo.timer = setInterval(tick, 500);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  emit();
}

export function pause() {
  pomo.running = false;
  clearInterval(pomo.timer);
  pomo.remaining = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
  emit();
}

export function reset() { setMode(pomo.mode); }

function tick() {
  pomo.remaining = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
  if (pomo.remaining <= 0) finish();
  emit();
}

function finish() {
  clearInterval(pomo.timer);
  pomo.running = false;
  const was = pomo.mode;
  if (was === 'focus') {
    pomo.cycles++;
    try { const k = `onote-pomo-${new Date().toISOString().slice(0, 10)}`; localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + 1)); } catch { /* noop */ }
  }
  const next = was === 'focus' ? (pomo.cycles % pomo.settings.every === 0 ? 'long' : 'short') : 'focus';
  const msg = was === 'focus' ? '집중 시간 끝! 잠깐 쉬어가요 ☕' : '휴식 끝! 다시 써볼까요 ✍️';
  toast(msg, 'ok');
  if (pomo.settings.sound) beep();
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('O-note 뽀모도로', { body: msg }); } catch { /* noop */ }
  setMode(next);
}

export function todayPomos() { try { return +localStorage.getItem(`onote-pomo-${new Date().toISOString().slice(0, 10)}`) || 0; } catch { return 0; } }

export function fmt(sec) { return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i]; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    });
  } catch { /* noop */ }
}
