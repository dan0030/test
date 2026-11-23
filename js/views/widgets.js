// 홈 위젯: 할 일 · 디데이 · 캘린더 · 프로젝트 트래커 (계정에 저장 → 기기 간 동기화)
import { all, get, settings, updateSettings } from '../store.js';
import { icon, esc, modal, toast, confirmBox, countText, htmlToText } from '../ui.js';
import { colorPick, bindColorPick, pickedColor, BASE_PALETTE } from '../colors.js';

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
    const list = [...W().todos].sort((a, b) => (a.done - b.done) || ((a.due || '9') .localeCompare(b.due || '9')));
    const doneN = list.filter((x) => x.done).length;
    el.innerHTML = `${head('list-checks', '할 일', '오늘 할 일과 마감을 챙겨요')}
      <form class="todo-add"><input class="input" name="t" placeholder="할 일 추가 후 Enter" maxlength="100"><input class="input" type="date" name="d" title="마감일 (선택)"><button class="btn primary sm" aria-label="추가">${icon('plus', 16)}</button></form>
      <ul class="todo-list">${list.length ? list.map((x) => {
        const late = !x.done && x.due && x.due < today();
        return `<li class="${x.done ? 'done' : ''}" data-id="${x.id}"><label><input type="checkbox" ${x.done ? 'checked' : ''} data-tg><span>${esc(x.text)}</span></label>${x.due ? `<span class="chip ${late ? 'late' : ''}">${x.due === today() ? '오늘' : fmtMD(x.due)}</span>` : ''}<button class="icon-btn sm" data-del aria-label="삭제">${icon('x', 13)}</button></li>`;
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
    w.events.filter((e) => e.date === date).forEach((e) => out.push({ kind: 'event', id: e.id, title: e.title, color: e.color || '#7b6cf6' }));
    w.ddays.filter((d) => nextDate(d) === date || d.date === date).forEach((d) => out.push({ kind: 'dday', title: `${d.title} (${dLabel(nextDate(d))})`, color: d.color || '#f07fa0' }));
    w.todos.filter((t) => t.due === date).forEach((t) => out.push({ kind: 'todo', title: `${t.done ? '✓ ' : ''}${t.text}`, color: '#8fcfe0' }));
    w.projects.filter((p) => p.deadline === date).forEach((p) => out.push({ kind: 'proj', title: `마감: ${p.title}`, color: statusOf(p.status)[2] }));
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
    const monthEv = W().events.filter((e) => e.date.startsWith(`${y}-${pad(m + 1)}`)).length;
    el.innerHTML = `${head('calendar-days', '캘린더', '날짜를 눌러 일정 보기·추가')}
      <div class="cal-nav"><button class="icon-btn sm" data-mv="-1" aria-label="이전 달">${icon('chevron-left', 16)}</button><b>${y}년 ${m + 1}월</b><button class="icon-btn sm" data-mv="1" aria-label="다음 달">${icon('chevron-right', 16)}</button><button class="link small" data-mv="0">오늘</button></div>
      <div class="cal-grid">${['일', '월', '화', '수', '목', '금', '토'].map((n, i) => `<div class="cal-h ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${n}</div>`).join('')}${cells.join('')}</div>
      <p class="muted small cal-legend"><span><i style="background:#7b6cf6"></i>일정</span><span><i style="background:#f07fa0"></i>디데이</span><span><i style="background:#8fcfe0"></i>할 일</span><span><i style="background:#f76b15"></i>프로젝트 마감</span>${monthEv ? `<span class="grow"></span><span>이번 달 일정 ${monthEv}개</span>` : ''}</p>`;
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
    save((w) => { w.todos = [...(w.todos || []), { id: wid(), text, due: f.d.value || '', done: false }]; });
    drawTodo(); drawCal();
    root.querySelector('.todo-add [name=t]')?.focus();
  });
  root.addEventListener('change', (e) => {
    const t = e.target.closest('[data-tg]'); if (!t) return;
    const id = t.closest('[data-id]').dataset.id;
    save((w) => { w.todos = w.todos.map((x) => (x.id === id ? { ...x, done: t.checked } : x)); });
    drawTodo(); drawCal();
  });
  root.addEventListener('click', async (e) => {
    const box = e.target.closest('.widget'); if (!box) return;
    if (box.id === 'w-todo') {
      const del = e.target.closest('[data-del]');
      if (del) { const id = del.closest('[data-id]').dataset.id; save((w) => { w.todos = w.todos.filter((x) => x.id !== id); }); drawTodo(); drawCal(); }
      if (e.target.closest('[data-clear]')) { save((w) => { w.todos = w.todos.filter((x) => !x.done); }); drawTodo(); drawCal(); }
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
    w.querySelector('#day-list').innerHTML = ev.length ? ev.map((e) => `<li style="--c:${e.color}"><i></i><span>${esc(e.title)}</span>${e.kind === 'event' ? `<button class="icon-btn sm" data-del="${e.id}" aria-label="삭제">${icon('x', 13)}</button>` : `<span class="muted small">${{ dday: '디데이', todo: '할 일', proj: '프로젝트' }[e.kind]}</span>`}</li>`).join('') : '<li class="w-empty">이 날의 일정이 없어요</li>';
  };
  await modal({
    title: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`,
    body: `<ul class="day-list" id="day-list"></ul>
      <form class="day-add"><input class="input" id="ev-t" placeholder="일정 추가 (예: 트위터 연재 업로드)" maxlength="60"><button class="btn primary sm">${icon('plus', 15)}<span>추가</span></button></form>
      ${colorPick('evc', '#7b6cf6', BASE_PALETTE.slice(0, 8))}`,
    onOpen: (w) => {
      bindColorPick(w, 'evc');
      draw(w);
      w.querySelector('.day-add').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = w.querySelector('#ev-t').value.trim(); if (!title) return;
        save((x) => { x.events = [...(x.events || []), { id: wid(), date, title, color: pickedColor(w, 'evc') || '#7b6cf6' }]; });
        w.querySelector('#ev-t').value = ''; draw(w);
      });
      w.querySelector('#day-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-del]'); if (!b) return;
        save((x) => { x.events = x.events.filter((ev) => ev.id !== b.dataset.del); }); draw(w);
      });
    },
  });
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
