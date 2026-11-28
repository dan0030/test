// 할 일·일정 알림 (브라우저 알림)
// - O-note가 열려 있는 동안(다른 탭에 가 있거나 창을 내려둬도) 정한 시각에 알림을 띄움
// - 사이트를 완전히 닫았다가 다시 열면, 그사이 놓친 알림(최근 12시간)을 한 번에 알려줌
// - 알림 켜기는 기기(브라우저)마다 따로: 이 기기에서 받을지 여부만 localStorage에 저장
import { settings, store } from './store.js';
import { toast } from './ui.js';
import { occursOn, remindTime, isDoneOn, addDays, today, isTime, DEFAULT_TIME } from './schedule.js';

const ON_KEY = 'onote-notify';
const SENT_KEY = 'onote-notified';
const LAST_KEY = 'onote-notify-last';
const CATCHUP = 12 * 3600000; // 다시 열었을 때 놓친 알림을 챙기는 범위
const LATE = 3 * 60000; // 이보다 늦게 울리면 '놓친 알림'으로 표시

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const enabled = () => { try { return localStorage.getItem(ON_KEY) === '1' && permission() === 'granted'; } catch { return false; } };
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// iPhone·iPad는 '홈 화면에 추가'한 O-note 앱에서만 알림을 받을 수 있음
export const needsInstall = () => isIOS() && !standalone();

let reg = null;
async function swReg() {
  if (reg || !('serviceWorker' in navigator)) return reg;
  try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('sw', e); }
  return reg;
}

export async function enable() {
  if (!supported()) { toast(needsInstall() ? 'iPhone·iPad에서는 O-note를 홈 화면에 추가한 뒤 그 앱에서 알림을 켤 수 있어요' : '이 브라우저는 알림을 지원하지 않아요', 'error'); return false; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { toast('알림이 차단되어 있어요. 브라우저 주소창의 자물쇠(사이트 설정)에서 알림을 허용해 주세요.', 'error'); return false; }
  try { localStorage.setItem(ON_KEY, '1'); localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* noop */ }
  await swReg();
  start();
  return true;
}
export function disable() { try { localStorage.setItem(ON_KEY, '0'); } catch { /* noop */ } }

async function show(title, body, tag) {
  const opt = { body, tag, icon: 'favicon.svg', badge: 'favicon.svg', data: { url: './#/' }, renotify: true };
  const r = await swReg();
  if (r?.showNotification) { try { await r.showNotification(title, opt); return; } catch { /* 아래로 */ } }
  try { const n = new Notification(title, opt); n.onclick = () => { window.focus(); location.hash = '#/'; n.close(); }; } catch { /* 모바일 등 */ }
}

export async function test() {
  if (!enabled() && !(await enable())) return;
  await show('O-note 알림 테스트', '이렇게 알려드릴게요. 알림이 잘 보이면 준비 끝!', 'onote-test');
}

// ---------- 예약 확인 ----------
const sentMap = () => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); } catch { return {}; } };
const fmtTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayWord = (date) => { const t = today(); return date === t ? '오늘' : date === addDays(t, 1) ? '내일' : date === addDays(t, -1) ? '어제' : `${+date.slice(5, 7)}월 ${+date.slice(8)}일`; };

function due(from, to) {
  if (store.locked || !store.user) return [];
  const w = settings().data.widgets || {};
  const items = [...(w.todos || []).map((x) => ['todo', x]), ...(w.events || []).map((x) => ['event', x])].filter(([, x]) => x.remind);
  const out = [];
  // '하루 전' 알림까지 고려해 앞뒤 며칠을 살펴봄
  const days = []; for (let d = addDays(today(), -2); d <= addDays(today(), 2); d = addDays(d, 1)) days.push(d);
  items.forEach(([kind, it]) => days.forEach((date) => {
    if (!occursOn(it, date)) return;
    if (kind === 'todo' && isDoneOn(it, date)) return;
    const at = remindTime(it, date);
    if (!at || at.getTime() <= from || at.getTime() > to) return;
    out.push({ key: `${store.user.id.slice(0, 8)}:${it.id}:${date}:${at.getTime()}`, kind, it, date, at });
  }));
  return out.sort((a, b) => a.at - b.at);
}

async function check() {
  if (!enabled()) return;
  const run = async () => {
    const now = Date.now();
    let last = +(localStorage.getItem(LAST_KEY) || 0) || now - 60000;
    last = Math.max(last, now - CATCHUP);
    const list = due(last, now);
    localStorage.setItem(LAST_KEY, String(now));
    if (!list.length) return;
    const sent = sentMap();
    const fresh = list.filter((x) => !sent[x.key]);
    fresh.forEach((x) => { sent[x.key] = now; });
    // 3일 지난 기록은 정리
    Object.keys(sent).forEach((k) => { if (now - sent[k] > 3 * 864e5) delete sent[k]; });
    localStorage.setItem(SENT_KEY, JSON.stringify(sent));
    const late = fresh.filter((x) => now - x.at.getTime() > LATE);
    const onTime = fresh.filter((x) => now - x.at.getTime() <= LATE);
    for (const x of onTime.slice(0, 5)) {
      const when = `${dayWord(x.date)} ${isTime(x.it.time) ? x.it.time : x.kind === 'event' ? '' : `(${DEFAULT_TIME} 기준)`}`.trim();
      await show(`${x.kind === 'todo' ? '✅ 할 일' : '📅 일정'} · ${x.it.text || x.it.title}`, when, x.key);
    }
    if (late.length) {
      const names = late.slice(0, 3).map((x) => x.it.text || x.it.title).join(', ');
      await show(`놓친 알림 ${late.length}개`, `${names}${late.length > 3 ? ' 외' : ''} (${fmtTime(late[0].at)}부터)`, 'onote-missed');
    }
    if (document.visibilityState === 'visible' && fresh.length) toast(`${fresh.length > 1 ? `알림 ${fresh.length}개: ` : '알림: '}${fresh.map((x) => x.it.text || x.it.title).slice(0, 3).join(', ')}`, 'info');
  };
  // 여러 탭이 동시에 열려 있어도 한 번만 울리도록
  if (navigator.locks?.request) await navigator.locks.request('onote-notify', run); else await run();
}

let timer = null;
export function start() {
  if (!enabled()) return;
  swReg();
  check();
  if (!timer) {
    timer = setInterval(check, 20000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }
}
