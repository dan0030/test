// 홈 위젯: 할 일 · 디데이 · 캘린더 · 프로젝트 트래커 (계정에 저장 → 기기 간 동기화)
import { all, get, settings, updateSettings } from '../store.js';
import { icon, esc, modal, toast, confirmBox, countText, htmlToText } from '../ui.js';
import { colorPick, bindColorPick, pickedColor, BASE_PALETTE } from '../colors.js';
import { occursOn, nextOcc, isRepeat, repeatLabel, remindLabel, isDoneOn, whenFields, bindWhen } from '../schedule.js';
import * as Notify from '../notify.js';

const wid = () => crypto.randomUUID().slice(0, 8);
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
const fmtMD = (s) => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const W = () => {
  const d = settings().data;
  d.widgets = d.widgets || {};
  ['todos', 'ddays', 'events', 'projects'].forEach((k) => { d.widgets[k] = d.widgets[k] || []; });
  return d.widgets;
};
const save = (fn) => updateSettings((d) => { d.widgets = d.widgets || {}; fn(d.widgets); });

// 페어 폴더 커미션 탭에서 '신청함' 상태이고 마감일이 있는 커미션 (받은 커미션은 빼고)
const COMM_COLOR = '#16a394';
function commissionDues() {
  const out = [];
  all('folder').forEach((f) => (f.data.wishes || []).forEach((c) => {
    if (c.status !== 'asked' || !/^\d{4}-\d{2}-\d{2}$/.test(c.dueAt || '')) return;
    let host = '';
    try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { /* noop */ }
    out.push({ date: c.dueAt, title: c.title || c.site || host || '커미션', folder: f.data.title || '', href: `#/folder/${f.id}?tab=wish` });
  }));
  return out;
}

// 매년 반복 디데이의 다음 날짜
function nextDate(dd) {
  if (!dd.yearly) return dd.date;
  const t = parse(today()); const d = parse(dd.date);
  let n = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (n < t) n = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return ymd(n);
}
const dLabel = (date) => { const n = dayDiff(date, today()); return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`; };

const STATUS = [['plan', '기획', '#8fcfe0'], ['doing', '진행 중', '#7b6cf6'], ['crunch', '마감 직전', '#f76b15'], ['done', '완료', '#30a46c'], ['hold', '보류', '#b0b0b0']];
const statusOf = (k) => STATUS.find((s) => s[0] === k) || STATUS[1];

function storyProgress(storyId) {
  const s = get(storyId);
  if (!s || s.type !== 'story') return null;
  const n = (s.data.chapters || []).reduce((a, c) => a + countText(htmlToText(c.html)).noSpace, 0);
  const g = +s.data.goal || 0;
  return { n, g, pct: g ? Math.min(100, Math.round((n / g) * 100)) : null, title: s.data.title || '제목 없음' };
}
function projPct(p) {
  if (p.storyId) { const sp = storyProgress(p.storyId); if (sp && sp.pct != null) return sp.pct; }
  return Math.max(0, Math.min(100, +p.progress || 0));
}

// ---------------- 렌더 ----------------
export function widgetsHTML() {
  return `<div class="widget-grid">
    <section class="card widget" id="w-todo"></section>
    <section class="card widget" id="w-dday"></section>
    <section class="card widget" id="w-cal"></section>
    <section class="card widget" id="w-proj"></section>
  </div>`;
}

export function bindWidgets(host) {
  const root = host.querySelector('.widget-grid');
  if (!root) return;
  let calMonth = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  const head = (ic, title, desc, btn = '') => `<header class="w-head"><span class="w-ic">${icon(ic, 18)}</span><div class="w-t"><h3>${title}</h3><p>${desc}</p></div>${btn}</header>`;

  const drawTodo = () => {
    const el = root.querySelector('#w-todo'); if (!el) return;
    // 반복 할 일은 '오늘 또는 다음 차례' 날짜 기준으로 보여주고, 체크도 그 날짜에만 적용
    const list = W().todos.map((x) => { const on = isRepeat(x) ? nextOcc(x) : x.due; return { ...x, on, isDone: isRepeat(x) ? isDoneOn(x, on) : !!x.done }; })
      .sort((a, b) => (a.isDone - b.isDone) || ((a.on || '9').localeCompare(b.on || '9')) || ((a.time || '99').localeCompare(b.time || '99')));
    const doneN = W().todos.filter((x) => !isRepeat(x) && x.done).length;
    el.innerHTML = `${head('list-checks', '할 일', '오늘 할 일과 마감을 챙겨요')}
      <form class="todo-add"><input class="input" name="t" placeholder="할 일 추가 후 Enter" maxlength="100"><input class="input" type="date" name="d" title="마감일 (선택)"><button type="button" class="btn ghost sm" data-more title="시간 · 반복 · 알림 정해서 추가" aria-label="시간 · 반복 · 알림 정해서 추가">${icon('bell', 16)}</button><button class="btn primary sm" aria-label="추가">${icon('plus', 16)}</button></form>
      <ul class="todo-list">${list.length ? list.map((x) => {
        const late = !x.isDone && x.on && x.on < today();
        const meta = [x.time ? esc(x.time) : '', isRepeat(x) ? `${icon('repeat', 11)}${esc(repeatLabel(x.repeat))}` : '', x.remind ? `${icon('bell', 11)}${esc(remindLabel(x))}` : ''].filter(Boolean).join(' ');
        return `<li class="${x.isDone ? 'done' : ''}" data-id="${x.id}" data-on="${x.on || ''}"><label><input type="checkbox" ${x.isDone ? 'checked' : ''} data-tg aria-label="완료"></label><button type="button" class="todo-t" data-edit title="눌러서 시간·반복·알림 바꾸기"><span>${esc(x.text)}</span>${meta ? `<small class="todo-meta">${meta}</small>` : ''}</button>${x.on ? `<span class="chip ${late ? 'late' : ''}">${x.on === today() ? '오늘' : fmtMD(x.on)}</span>` : ''}<button class="icon-btn sm" data-del aria-label="삭제">${icon('x', 13)}</button></li>`;
      }).join('') : '<li class="w-empty">할 일이 없어요. 위에 적어보세요!</li>'}</ul>
      ${doneN ? `<button class="link small" data-clear>${icon('trash', 13)} 완료한 ${doneN}개 지우기</button>` : ''}`;
  };

  const drawDday = () => {
    const el = root.querySelector('#w-dday'); if (!el) return;
    const list = W().ddays.map((d) => ({ ...d, nd: nextDate(d) })).sort((a, b) => {
      const da = dayDiff(a.nd, today()); const db = dayDiff(b.nd, today());
      return (da < 0) - (db < 0) || Math.abs(da) - Math.abs(db);
    });
    el.innerHTML = `${head('calendar-heart', '디데이', '마감·이벤트·캐릭터 생일까지 남은 날', `<button class="icon-btn" data-add title="디데이 추가">${icon('plus', 18)}</button>`)}
      <ul class="dday-list">${list.length ? list.map((d) => `<li data-id="${d.id}" style="--c:${d.color || '#7b6cf6'}"><span class="dd-num">${dLabel(d.nd)}</span><div class="dd-t"><b>${esc(d.title)}</b><span>${fmtMD(d.nd)}${d.yearly ? ' · 매년' : ''}</span></div></li>`).join('') : '<li class="w-empty">+ 를 눌러 첫 디데이를 추가하세요</li>'}</ul>`;
  };

  const eventsOn = (date) => {
    const w = W(); const out = [];
    w.events.filter((e) => occursOn(e, date)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
      .forEach((e) => out.push({ kind: 'event', id: e.id, title: `${e.time ? `${e.time} ` : ''}${e.title}`, color: e.color || '#7b6cf6', repeat: isRepeat(e), remind: !!e.remind }));
    w.ddays.filter((d) => nextDate(d) === date || d.date === date).forEach((d) => out.push({ kind: 'dday', title: `${d.title} (${dLabel(nextDate(d))})`, color: d.color || '#f07fa0' }));
    w.todos.filter((t) => occursOn(t, date)).forEach((t) => out.push({ kind: 'todo', title: `${isDoneOn(t, date) ? '✓ ' : ''}${t.time ? `${t.time} ` : ''}${t.text}`, color: '#8fcfe0' }));
    w.projects.filter((p) => p.deadline === date).forEach((p) => out.push({ kind: 'proj', title: `마감: ${p.title}`, color: statusOf(p.status)[2] }));
    commissionDues().filter((c) => c.date === date).forEach((c) => out.push({ kind: 'comm', title: `커미션 마감: ${c.title}${c.folder ? ` (${c.folder})` : ''}`, color: COMM_COLOR, href: c.href }));
    return out;
  };

  const drawCal = () => {
    const el = root.querySelector('#w-cal'); if (!el) return;
    const y = calMonth.getFullYear(); const m = calMonth.getMonth();
    const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div class="cal-c out"></div>');
    for (let d = 1; d <= days; d++) {
      const date = `${y}-${pad(m + 1)}-${pad(d)}`;
      const ev = eventsOn(date);
      const dow = (first + d - 1) % 7;
      cells.push(`<button class="cal-c ${date === today() ? 'today' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}" data-date="${date}" aria-label="${m + 1}월 ${d}일${ev.length ? `, 일정 ${ev.length}개` : ''}"><span class="cal-d">${d}</span><span class="cal-dots">${ev.slice(0, 3).map((e) => `<i style="background:${e.color}"></i>`).join('')}</span></button>`);
    }
    let monthEv = 0;
    for (let d = 1; d <= days; d++) { const ds = `${y}-${pad(m + 1)}-${pad(d)}`; monthEv += W().events.filter((e) => occursOn(e, ds)).length; }
    el.innerHTML = `${head('calendar-days', '캘린더', '날짜를 눌러 일정 보기·추가')}
      <div class="cal-nav"><button class="icon-btn sm" data-mv="-1" aria-label="이전 달">${icon('chevron-left', 16)}</button><b>${y}년 ${m + 1}월</b><button class="icon-btn sm" data-mv="1" aria-label="다음 달">${icon('chevron-right', 16)}</button><button class="link small" data-mv="0">오늘</button></div>
      <div class="cal-grid">${['일', '월', '화', '수', '목', '금', '토'].map((n, i) => `<div class="cal-h ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${n}</div>`).join('')}${cells.join('')}</div>
      <p class="muted small cal-legend"><span><i style="background:#7b6cf6"></i>일정</span><span><i style="background:#f07fa0"></i>디데이</span><span><i style="background:#8fcfe0"></i>할 일</span><span><i style="background:#f76b15"></i>프로젝트 마감</span><span><i style="background:${COMM_COLOR}"></i>커미션 마감</span>${monthEv ? `<span class="grow"></span><span>이번 달 일정 ${monthEv}개</span>` : ''}</p>`;
  };

  const drawProj = () => {
    const el = root.querySelector('#w-proj'); if (!el) return;
    const order = { crunch: 0, doing: 1, plan: 2, hold: 3, done: 4 };
    const list = [...W().projects].sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1) || (a.deadline || '9').localeCompare(b.deadline || '9'));
    el.innerHTML = `${head('kanban', '프로젝트 트래커', '회지·연재·이벤트 원고 진행 상황', `<button class="icon-btn" data-add title="프로젝트 추가">${icon('plus', 18)}</button>`)}
      <ul class="proj-list">${list.length ? list.map((p) => {
        const st = statusOf(p.status); const pct = projPct(p);
        const sp = p.storyId ? storyProgress(p.storyId) : null;
        return `<li data-id="${p.id}"><div class="pj-top"><b>${esc(p.title)}</b><span class="chip" style="background:${st[2]}22;color:${st[2]}">${st[1]}</span>${p.deadline ? `<span class="pj-dd">${dLabel(p.deadline)}</span>` : ''}</div>
          <div class="progress"><div style="width:${pct}%;background:${st[2]}"></div></div>
          <div class="pj-meta muted small"><span>${pct}%</span>${sp ? `<span>${icon('book-open', 12)} ${esc(sp.title)} · ${sp.n.toLocaleString()}${sp.g ? ` / ${sp.g.toLocaleString()}` : ''}자</span>` : ''}${p.deadline ? `<span>마감 ${fmtMD(p.deadline)}</span>` : ''}</div></li>`;
      }).join('') : '<li class="w-empty">+ 를 눌러 진행 중인 원고를 등록하세요</li>'}</ul>`;
  };

  const drawAll = () => { drawTodo(); drawDday(); drawCal(); drawProj(); };

  // ---- 이벤트 ----
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('.todo-add'); if (!f) return;
    e.preventDefault();
    const text = f.t.value.trim(); if (!text) return;
    save((w) => { w.todos = [...(w.todos || []), { id: wid(), text, due: f.d.value || '', done: false, start: today() }]; });
    drawTodo(); drawCal();
    root.querySelector('.todo-add [name=t]')?.focus();
  });
  root.addEventListener('change', (e) => {
    const t = e.target.closest('[data-tg]'); if (!t) return;
    const li = t.closest('[data-id]'); const id = li.dataset.id; const on = li.dataset.on;
    save((w) => {
      w.todos = w.todos.map((x) => {
        if (x.id !== id) return x;
        if (!isRepeat(x)) return { ...x, done: t.checked };
        // 반복 할 일: 그 날짜만 완료 처리 (오래된 기록은 60개까지만 보관)
        const dd = (x.doneDates || []).filter((d) => d !== on);
        return { ...x, doneDates: (t.checked ? [...dd, on] : dd).sort().slice(-60) };
      });
    });
    drawTodo(); drawCal();
  });
  root.addEventListener('click', async (e) => {
    const box = e.target.closest('.widget'); if (!box) return;
    if (box.id === 'w-todo') {
      const del = e.target.closest('[data-del]');
      if (del) { const id = del.closest('[data-id]').dataset.id; save((w) => { w.todos = w.todos.filter((x) => x.id !== id); }); drawTodo(); drawCal(); }
      if (e.target.closest('[data-clear]')) { save((w) => { w.todos = w.todos.filter((x) => isRepeat(x) || !x.done); }); drawTodo(); drawCal(); }
      if (e.target.closest('[data-more]')) {
        const f = box.querySelector('.todo-add');
        if (await todoDialog(null, { text: f.t.value.trim(), due: f.d.value })) { drawTodo(); drawCal(); }
        return;
      }
      const ed = e.target.closest('[data-edit]');
      if (ed && await todoDialog(W().todos.find((x) => x.id === ed.closest('[data-id]').dataset.id))) { drawTodo(); drawCal(); }
      return;
    }
    if (box.id === 'w-dday') {
      if (e.target.closest('[data-add]')) { if (await ddayDialog()) { drawDday(); drawCal(); } return; }
      const li = e.target.closest('[data-id]');
      if (li && await ddayDialog(W().ddays.find((x) => x.id === li.dataset.id))) { drawDday(); drawCal(); }
      return;
    }
    if (box.id === 'w-cal') {
      const mv = e.target.closest('[data-mv]');
      if (mv) { const n = +mv.dataset.mv; calMonth = n === 0 ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1); drawCal(); return; }
      const c = e.target.closest('[data-date]');
      if (c) { await dayDialog(c.dataset.date, eventsOn); drawAll(); }
      return;
    }
    if (box.id === 'w-proj') {
      if (e.target.closest('[data-add]')) { if (await projDialog()) { drawProj(); drawCal(); } return; }
      const li = e.target.closest('[data-id]');
      if (li && await projDialog(W().projects.find((x) => x.id === li.dataset.id))) { drawProj(); drawCal(); }
    }
  });

  drawAll();
}

// ---------------- 대화상자 ----------------
async function ddayDialog(cur) {
  const res = await modal({
    title: cur ? '디데이 수정' : '디데이 추가',
    body: `<label class="lbl">이름</label><input class="input" id="dd-t" value="${esc(cur?.title || '')}" placeholder="예: 온리전, 원고 마감, ○○ 생일" maxlength="40">
      <label class="lbl">날짜</label><input class="input" type="date" id="dd-d" value="${esc(cur?.date || today())}">
      <label class="check"><input type="checkbox" id="dd-y" ${cur?.yearly ? 'checked' : ''}><span>매년 반복 (생일·기념일)</span></label>
      <label class="lbl">색상</label>${colorPick('ddc', cur?.color || '#f07fa0', BASE_PALETTE.slice(0, 8))}`,
    actions: [
      ...(cur ? [{ label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => ((await confirmBox('이 디데이를 삭제할까요?', '삭제', true)) ? 'DEL' : false) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: '저장', cls: 'primary', icon: 'check', value: (w) => {
        const title = w.querySelector('#dd-t').value.trim(); const date = w.querySelector('#dd-d').value;
        if (!title || !date) { toast('이름과 날짜를 입력해주세요', 'error'); return false; }
        return { title, date, yearly: w.querySelector('#dd-y').checked, color: pickedColor(w, 'ddc') || '#f07fa0' };
      } },
    ],
    onOpen: (w) => bindColorPick(w, 'ddc'),
  });
  if (!res) return false;
  save((w) => {
    if (res === 'DEL') w.ddays = w.ddays.filter((x) => x.id !== cur.id);
    else if (cur) w.ddays = w.ddays.map((x) => (x.id === cur.id ? { ...x, ...res } : x));
    else w.ddays = [...(w.ddays || []), { id: wid(), ...res }];
  });
  return true;
}

async function dayDialog(date, eventsOn) {
  const d = parse(date);
  const draw = (w) => {
    const ev = eventsOn(date);
    w.querySelector('#day-list').innerHTML = ev.length ? ev.map((e) => `<li style="--c:${e.color}"><i></i>${e.href ? `<a href="${esc(e.href)}" data-go>${esc(e.title)}</a>` : e.kind === 'event' ? `<button type="button" class="day-ev" data-ed="${e.id}" title="눌러서 수정">${esc(e.title)}${e.repeat ? icon('repeat', 12) : ''}${e.remind ? icon('bell', 12) : ''}</button>` : `<span>${esc(e.title)}</span>`}${e.kind === 'event' ? `<button class="icon-btn sm" data-del="${e.id}" aria-label="삭제">${icon('x', 13)}</button>` : `<span class="muted small">${{ dday: '디데이', todo: '할 일', proj: '프로젝트', comm: '커미션' }[e.kind]}</span>`}</li>`).join('') : '<li class="w-empty">이 날의 일정이 없어요</li>';
  };
  await modal({
    title: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`,
    body: `<ul class="day-list" id="day-list"></ul>
      <form class="day-add"><input class="input" id="ev-t" placeholder="일정 추가 (예: 트위터 연재 업로드)" maxlength="60"><button type="button" class="btn ghost sm" data-more title="시간 · 반복 · 알림 정해서 추가">${icon('bell', 15)}<span class="hide-m">시간·반복·알림</span></button><button class="btn primary sm">${icon('plus', 15)}<span>추가</span></button></form>
      ${colorPick('evc', '#7b6cf6', BASE_PALETTE.slice(0, 8))}`,
    onOpen: (w, close) => {
      bindColorPick(w, 'evc');
      draw(w);
      // 커미션 마감 → 그 폴더의 커미션 탭으로 이동하면서 창 닫기
      w.querySelector('#day-list').addEventListener('click', (e) => { if (e.target.closest('a[data-go]')) close(null); });
      w.querySelector('.day-add').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = w.querySelector('#ev-t').value.trim(); if (!title) return;
        save((x) => { x.events = [...(x.events || []), { id: wid(), date, title, color: pickedColor(w, 'evc') || '#7b6cf6' }]; });
        w.querySelector('#ev-t').value = ''; draw(w);
      });
      w.querySelector('[data-more]').addEventListener('click', async () => {
        if (await eventDialog(null, { date, title: w.querySelector('#ev-t').value.trim(), color: pickedColor(w, 'evc') })) { w.querySelector('#ev-t').value = ''; draw(w); }
      });
      w.querySelector('#day-list').addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-ed]');
        if (ed) { if (await eventDialog(W().events.find((x) => x.id === ed.dataset.ed))) draw(w); return; }
        const b = e.target.closest('[data-del]'); if (!b) return;
        const cur = W().events.find((x) => x.id === b.dataset.del);
        if (cur && isRepeat(cur)) {
          const how = await modal({ title: '반복 일정 삭제', body: `<p><b>${esc(cur.title)}</b>은(는) ${esc(repeatLabel(cur.repeat))} 반복되는 일정이에요.</p>`, actions: [{ label: '취소', cls: 'ghost', value: () => null }, { label: '이 날만 빼기', cls: 'ghost', value: () => 'one' }, { label: '반복 전체 삭제', cls: 'danger', value: () => 'all' }] });
          if (!how) return;
          if (how === 'one') { save((x) => { x.events = x.events.map((ev) => (ev.id === cur.id ? { ...ev, skip: [...(ev.skip || []), date].slice(-100) } : ev)); }); draw(w); return; }
        }
        save((x) => { x.events = x.events.filter((ev) => ev.id !== b.dataset.del); }); draw(w);
      });
    },
  });
}

// 알림을 고르면, 이 기기에서 알림이 아직 꺼져 있을 때 켜도록 안내
function askNotify() {
  if (Notify.enabled()) return;
  if (Notify.needsInstall()) { toast('iPhone·iPad는 O-note를 홈 화면에 추가한 앱에서 알림을 받을 수 있어요', 'info'); return; }
  Notify.enable().then((ok) => { if (ok) toast('이 기기에서 알림을 받도록 켰어요', 'ok'); });
}
const remindNote = () => (Notify.enabled() ? '' : `<p class="hint">${icon('bell-off', 14)} 이 기기에서는 아직 알림이 꺼져 있어요. 알림을 고르면 허용 여부를 물어봐요. (설정 → 알림에서도 켤 수 있어요)</p>`);

async function todoDialog(cur, preset = {}) {
  const base = cur || { text: preset.text || '', due: preset.due || '' };
  let read;
  const res = await modal({
    title: cur ? '할 일 수정' : '할 일 추가',
    body: `<label class="lbl">할 일</label><input class="input" id="td-t" value="${esc(base.text)}" placeholder="예: 원고 퇴고, 굿즈 입금" maxlength="100">
      ${whenFields({ ...base, date: base.due }, { dateLabel: '날짜 (반복이면 시작일)', dateRequired: false })}${remindNote()}`,
    actions: [
      ...(cur ? [{ label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => ((await confirmBox('이 할 일을 삭제할까요?', '삭제', true)) ? 'DEL' : false) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: '저장', cls: 'primary', icon: 'check', value: (w) => {
        const text = w.querySelector('#td-t').value.trim();
        if (!text) { toast('할 일을 입력해주세요', 'error'); return false; }
        const r = read(); if (r.error) { toast(r.error, 'error'); return false; }
        if (r.remind && !r.date && !r.repeat) { toast('알림을 받으려면 날짜를 정해주세요', 'error'); return false; }
        return { text, due: r.date, time: r.time, repeat: r.repeat, remind: r.remind, remindAt: r.remindAt };
      } },
    ],
    onOpen: (w) => { read = bindWhen(w, { onRemindOn: askNotify }); },
  });
  if (!res) return false;
  save((w) => {
    if (res === 'DEL') w.todos = w.todos.filter((x) => x.id !== cur.id);
    else if (cur) w.todos = w.todos.map((x) => (x.id === cur.id ? { ...x, ...res } : x));
    else w.todos = [...(w.todos || []), { id: wid(), done: false, start: today(), ...res }];
  });
  return true;
}

async function eventDialog(cur, preset = {}) {
  const base = cur || { title: preset.title || '', date: preset.date || today(), color: preset.color || '#7b6cf6' };
  let read;
  const res = await modal({
    title: cur ? '일정 수정' : '일정 추가',
    body: `<label class="lbl">일정</label><input class="input" id="ev2-t" value="${esc(base.title)}" placeholder="예: 트위터 연재 업로드" maxlength="60">
      ${whenFields(base, { dateLabel: '날짜 (반복이면 시작일)' })}${remindNote()}
      <label class="lbl">색상</label>${colorPick('ev2c', base.color || '#7b6cf6', BASE_PALETTE.slice(0, 8))}`,
    actions: [
      ...(cur ? [{ label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => ((await confirmBox(isRepeat(cur) ? '반복 일정 전체를 삭제할까요?' : '이 일정을 삭제할까요?', '삭제', true)) ? 'DEL' : false) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: '저장', cls: 'primary', icon: 'check', value: (w) => {
        const title = w.querySelector('#ev2-t').value.trim();
        if (!title) { toast('일정 이름을 입력해주세요', 'error'); return false; }
        const r = read(); if (r.error) { toast(r.error, 'error'); return false; }
        if (!r.date) { toast('날짜를 정해주세요', 'error'); return false; }
        return { title, date: r.date, time: r.time, repeat: r.repeat, remind: r.remind, remindAt: r.remindAt, color: pickedColor(w, 'ev2c') || '#7b6cf6' };
      } },
    ],
    onOpen: (w) => { bindColorPick(w, 'ev2c'); read = bindWhen(w, { onRemindOn: askNotify }); },
  });
  if (!res) return false;
  save((w) => {
    if (res === 'DEL') w.events = w.events.filter((x) => x.id !== cur.id);
    else if (cur) w.events = w.events.map((x) => (x.id === cur.id ? { ...x, ...res } : x));
    else w.events = [...(w.events || []), { id: wid(), ...res }];
  });
  return true;
}

async function projDialog(cur) {
  const stories = all('story');
  const res = await modal({
    title: cur ? '프로젝트 수정' : '프로젝트 추가',
    body: `<label class="lbl">프로젝트 이름</label><input class="input" id="pj-t" value="${esc(cur?.title || '')}" placeholder="예: 겨울 온리전 회지, 주간 연재" maxlength="50">
      <div class="row2"><div><label class="lbl">상태</label><select class="input" id="pj-s">${STATUS.map(([k, n]) => `<option value="${k}" ${(cur?.status || 'doing') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label class="lbl">마감일</label><input class="input" type="date" id="pj-d" value="${esc(cur?.deadline || '')}"></div></div>
      <label class="lbl">연결할 연성 <span class="muted small">(목표 글자 수를 정해두면 진행률이 자동으로 계산돼요)</span></label>
      <select class="input" id="pj-st"><option value="">연결 안 함 (직접 입력)</option>${stories.map((s) => `<option value="${s.id}" ${cur?.storyId === s.id ? 'selected' : ''}>${esc(s.data.title || '제목 없음')}${s.data.goal ? ` · 목표 ${(+s.data.goal).toLocaleString()}자` : ''}</option>`).join('')}</select>
      <label class="lbl"><span>진행률</span><b id="pj-pv">${+cur?.progress || 0}%</b></label><input type="range" id="pj-p" min="0" max="100" step="5" value="${+cur?.progress || 0}">
      <label class="lbl">메모</label><textarea class="input" id="pj-m" rows="2" placeholder="분량, 인쇄소, 할 일 등">${esc(cur?.memo || '')}</textarea>`,
    actions: [
      ...(cur ? [{ label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => ((await confirmBox('이 프로젝트를 삭제할까요?', '삭제', true)) ? 'DEL' : false) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: '저장', cls: 'primary', icon: 'check', value: (w) => {
        const title = w.querySelector('#pj-t').value.trim();
        if (!title) { toast('프로젝트 이름을 입력해주세요', 'error'); return false; }
        return { title, status: w.querySelector('#pj-s').value, deadline: w.querySelector('#pj-d').value, storyId: w.querySelector('#pj-st').value, progress: +w.querySelector('#pj-p').value, memo: w.querySelector('#pj-m').value };
      } },
    ],
    onOpen: (w) => {
      const sync = () => {
        const sid = w.querySelector('#pj-st').value;
        const sp = sid ? storyProgress(sid) : null;
        const auto = sp && sp.pct != null;
        w.querySelector('#pj-p').disabled = !!auto;
        if (auto) w.querySelector('#pj-p').value = sp.pct;
        w.querySelector('#pj-pv').textContent = `${w.querySelector('#pj-p').value}%${auto ? ' (자동)' : ''}`;
      };
      w.querySelector('#pj-st').addEventListener('change', sync);
      w.querySelector('#pj-p').addEventListener('input', sync);
      sync();
    },
  });
  if (!res) return false;
  save((w) => {
    if (res === 'DEL') w.projects = w.projects.filter((x) => x.id !== cur.id);
    else if (cur) w.projects = w.projects.map((x) => (x.id === cur.id ? { ...x, ...res } : x));
    else w.projects = [...(w.projects || []), { id: wid(), ...res }];
  });
  return true;
}
