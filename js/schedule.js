// 할 일·일정의 시간 · 반복 · 알림 계산 (화면과 알림 예약이 함께 씀)
//  item.time    'HH:MM' (선택)
//  item.repeat  { days: [0~6 요일], until: 'YYYY-MM-DD'(선택) } — 없으면 한 번만
//  item.skip    ['YYYY-MM-DD'] — 반복 일정 중 '이 날만 빼기'
//  item.remind  '' | 분 단위 숫자 문자열('0','10','1440'…) | 'at'(직접 시각) ; item.remindAt 'HH:MM'
import { icon, esc } from './ui.js';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const DOW = '일월화수목금토';
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const isTime = (s) => /^\d{2}:\d{2}$/.test(s || '');

// 반복 시작일: 일정은 date, 할 일은 마감일(없으면 만든 날)
export const startOf = (it) => it.date || it.due || (isRepeat(it) ? it.start || '' : '');
export const isRepeat = (it) => !!(it.repeat && Array.isArray(it.repeat.days) && it.repeat.days.length);

export function occursOn(it, date) {
  const s = startOf(it);
  if (!isRepeat(it)) return s === date;
  if (isDate(s) && date < s) return false;
  if (isDate(it.repeat.until) && date > it.repeat.until) return false;
  if ((it.skip || []).includes(date)) return false;
  return it.repeat.days.includes(parse(date).getDay());
}

// from 날짜(포함) 이후 첫 발생일 — 없으면 ''
export function nextOcc(it, from = today()) {
  if (!isRepeat(it)) return startOf(it);
  let d = from < startOf(it) ? startOf(it) : from;
  for (let i = 0; i < 400; i++) { if (occursOn(it, d)) return d; d = addDays(d, 1); if (isDate(it.repeat.until) && d > it.repeat.until) return ''; }
  return '';
}

export function repeatLabel(r) {
  const days = [...(r?.days || [])].sort();
  if (!days.length) return '';
  const k = days.join('');
  const base = k === '0123456' ? '매일' : k === '12345' ? '평일마다' : k === '06' ? '주말마다' : `매주 ${days.map((d) => DOW[d]).join('·')}`;
  return base + (isDate(r.until) ? ` (~${+r.until.slice(5, 7)}/${+r.until.slice(8)})` : '');
}

export const REMINDS = [['', '알림 없음'], ['0', '정시에'], ['5', '5분 전'], ['10', '10분 전'], ['30', '30분 전'], ['60', '1시간 전'], ['180', '3시간 전'], ['1440', '하루 전'], ['at', '직접 시각 지정']];
export const DEFAULT_TIME = '09:00'; // 시간을 안 정한 할 일·일정은 이 시각 기준

// 그 날짜의 알림 시각 (Date) — 알림이 없으면 null
export function remindTime(it, date) {
  if (!it.remind) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (it.remind === 'at') {
    if (!isTime(it.remindAt)) return null;
    const [h, mi] = it.remindAt.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi);
  }
  const [h, mi] = (isTime(it.time) ? it.time : DEFAULT_TIME).split(':').map(Number);
  return new Date(new Date(y, m - 1, d, h, mi).getTime() - (+it.remind || 0) * 60000);
}

export function remindLabel(it) {
  if (!it.remind) return '';
  if (it.remind === 'at') return isTime(it.remindAt) ? `${it.remindAt} 알림` : '';
  const r = REMINDS.find((x) => x[0] === it.remind);
  return r ? (it.remind === '0' ? `${isTime(it.time) ? it.time : DEFAULT_TIME} 알림` : `${r[1]} 알림`) : '';
}

// 할 일 완료 여부 (반복 할 일은 날짜별로)
export const isDoneOn = (t, date) => (isRepeat(t) ? (t.doneDates || []).includes(date) : !!t.done);

// ---------------- 대화상자 공용 입력칸 ----------------
export function whenFields(cur = {}, { dateLabel = '날짜', dateRequired = true } = {}) {
  const r = isRepeat(cur) ? [...cur.repeat.days].sort().join('') : '';
  const mode = !r ? 'none' : r === '0123456' ? 'daily' : r === '12345' ? 'weekday' : 'custom';
  const days = isRepeat(cur) ? cur.repeat.days : [parse(isDate(startOf(cur)) ? startOf(cur) : today()).getDay()];
  return `<div class="row2"><div><label class="lbl">${dateLabel}${dateRequired ? '' : ' <span class="muted small">(선택)</span>'}</label><input class="input" type="date" id="wh-d" value="${esc(startOf(cur))}"></div>
      <div><label class="lbl">시간 <span class="muted small">(선택)</span></label><input class="input" type="time" id="wh-t" value="${esc(cur.time || '')}"></div></div>
    <label class="lbl">${icon('repeat', 14)} 반복</label>
    <div class="seg" id="wh-rm">${[['none', '안 함'], ['daily', '매일'], ['weekday', '평일'], ['custom', '요일 선택']].map(([k, n]) => `<button type="button" data-m="${k}" class="${mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="wh-days" id="wh-days" ${mode === 'custom' ? '' : 'hidden'}>${[...DOW].map((n, i) => `<label class="day-tg ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}"><input type="checkbox" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <div id="wh-until-row" ${mode === 'none' ? 'hidden' : ''}><label class="lbl">반복 끝나는 날 <span class="muted small">(비우면 계속)</span></label><input class="input" type="date" id="wh-u" value="${esc(cur.repeat?.until || '')}"></div>
    <label class="lbl">${icon('bell', 14)} 알림</label>
    <div class="wh-rem"><select class="input" id="wh-r">${REMINDS.map(([v, n]) => `<option value="${v}" ${(cur.remind || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <input class="input" type="time" id="wh-ra" value="${esc(cur.remindAt || '')}" ${cur.remind === 'at' ? '' : 'hidden'} aria-label="알림 시각"></div>
    <p class="muted small" id="wh-hint"></p>`;
}

export function bindWhen(w, { onRemindOn } = {}) {
  const $ = (s) => w.querySelector(s);
  let mode = $('#wh-rm .on')?.dataset.m || 'none';
  const hint = () => {
    const rv = $('#wh-r').value;
    const t = $('#wh-t').value;
    $('#wh-hint').textContent = rv && rv !== 'at' && !t ? `시간을 정하지 않으면 그날 ${DEFAULT_TIME} 기준으로 알려드려요.` : '';
  };
  $('#wh-rm').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m;
    w.querySelectorAll('#wh-rm button').forEach((x) => x.classList.toggle('on', x === b));
    $('#wh-days').hidden = mode !== 'custom';
    $('#wh-until-row').hidden = mode === 'none';
  });
  $('#wh-r').addEventListener('change', () => { $('#wh-ra').hidden = $('#wh-r').value !== 'at'; if ($('#wh-r').value === 'at' && !$('#wh-ra').value) $('#wh-ra').value = $('#wh-t').value || DEFAULT_TIME; hint(); if ($('#wh-r').value) onRemindOn?.(); });
  $('#wh-t').addEventListener('input', hint);
  hint();
  return () => {
    const date = $('#wh-d').value; const time = $('#wh-t').value;
    let days = [];
    if (mode === 'daily') days = [0, 1, 2, 3, 4, 5, 6];
    else if (mode === 'weekday') days = [1, 2, 3, 4, 5];
    else if (mode === 'custom') days = [...w.querySelectorAll('#wh-days input:checked')].map((x) => +x.value);
    if (mode === 'custom' && !days.length) return { error: '반복할 요일을 하나 이상 골라주세요' };
    const remind = $('#wh-r').value; const remindAt = remind === 'at' ? $('#wh-ra').value : '';
    if (remind === 'at' && !isTime(remindAt)) return { error: '알림 시각을 입력해주세요' };
    const until = days.length ? $('#wh-u').value : '';
    if (until && date && until < date) return { error: '반복 끝나는 날이 시작일보다 빨라요' };
    return { date, time, repeat: days.length ? { days, until } : null, remind, remindAt };
  };
}
