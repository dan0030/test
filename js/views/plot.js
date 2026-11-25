// 플롯 & 타임라인: 서술 순서 / 시간 순서 / 기승전결 보드 / 인물별 / 자동 점검
import { all, get, create, update } from '../store.js';
import { icon, esc, emptyState, modal, toast, confirmBox, COLORS } from '../ui.js';
import { itemCard, folderPicker, bindFolderPicker, bookmarkBtn, bindBookmark, commentsPanel, bindComments, tagInput, bindTags, deleteItem, pageHead, folderFilter } from '../common.js';
import { openExport } from '../export.js';
import { helpBtn } from '../help.js';
import { colorPick, bindColorPick, pickedColor } from '../colors.js';

const ACTS = ['발단', '전개', '위기', '절정', '결말'];
const eid = () => crypto.randomUUID().slice(0, 8);
const cmp = (a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true });

export function newPlot(folderId) {
  const it = create('plot', { title: '', desc: '', events: [], folders: folderId ? [folderId] : [] });
  location.hash = `#/p/${it.id}`;
}

export function renderList(root, q) {
  const f = q.get('f');
  let items = all('plot');
  if (f) items = items.filter((i) => (i.data.folders || []).includes(f));
  root.innerHTML = `
    ${pageHead('git-commit-vertical', '플롯·타임라인', '사건을 카드로 쌓고, 서술 순서와 실제 시간 순서를 비교하며 설정 오류를 점검해요.', `<button class="btn primary" id="new">${icon('plus', 18)} 새 플롯</button>`, 'plot')}
    ${folderFilter(f)}
    ${items.length ? `<div class="grid">${items.map((i) => itemCard(i, { showType: false })).join('')}</div>` : emptyState('git-commit-vertical', '아직 플롯이 없어요', '이야기의 큰 줄기를 사건 단위로 정리해보세요.', `<button class="btn primary" id="new2">${icon('plus', 18)} 첫 플롯 만들기</button>`)}`;
  root.querySelectorAll('#new,#new2').forEach((b) => (b.onclick = () => newPlot(f)));
}

function analyze(events) {
  const issues = [];
  const timed = events.filter((e) => e.at);
  events.filter((e) => !e.at).forEach((e) => issues.push({ lv: 'warn', ic: 'clock-exclamation-point', msg: `'${e.title || '제목 없는 사건'}'에 시간축 값이 없어요.`, id: e.id }));
  // 서술 순서와 시간 순서 비교 → 회상(플래시백) 감지
  let maxAt = null;
  events.forEach((e) => {
    if (!e.at) return;
    if (maxAt != null && cmp(e.at, maxAt) < 0) issues.push({ lv: 'info', ic: 'rotate-ccw-clock', msg: `'${e.title}'은(는) 앞 사건보다 과거예요 (회상·플래시백인지 확인).`, id: e.id });
    if (maxAt == null || cmp(e.at, maxAt) > 0) maxAt = e.at;
  });
  // 같은 시간, 같은 인물, 다른 장소
  const byAt = {};
  timed.forEach((e) => { (byAt[e.at] = byAt[e.at] || []).push(e); });
  Object.entries(byAt).forEach(([at, list]) => {
    if (list.length < 2) return;
    const seen = {};
    list.forEach((e) => (e.chars || []).forEach((c) => {
      if (seen[c] && seen[c].place && e.place && seen[c].place !== e.place) issues.push({ lv: 'error', ic: 'map-pin-x', msg: `${c}이(가) 같은 시간(${at})에 '${seen[c].place}'와(과) '${e.place}' 두 곳에 있어요.`, id: e.id });
      seen[c] = e;
    }));
  });
  events.filter((e) => !(e.chars || []).length).forEach((e) => issues.push({ lv: 'info', ic: 'user-x', msg: `'${e.title || '제목 없는 사건'}'에 등장인물이 지정되지 않았어요.`, id: e.id }));
  const acts = new Set(events.map((e) => e.act).filter(Boolean));
  ACTS.forEach((a) => { if (events.length >= 3 && !acts.has(a)) issues.push({ lv: 'info', ic: 'layout-panel-left', msg: `'${a}' 단계에 해당하는 사건이 없어요.` }); });
  return issues;
}

export function renderView(root, id, q) {
  const it = get(id);
  if (!it) { root.innerHTML = emptyState('file-question-mark', '플롯을 찾을 수 없어요', ''); return; }
  const d = it.data;
  const ev = d.events || [];
  const tab = q.get('tab') || 'line';
  const charFilter = q.get('c') || '';
  const allChars = [...new Set(ev.flatMap((e) => e.chars || []))];
  const issues = analyze(ev);
  const shown = charFilter ? ev.filter((e) => (e.chars || []).includes(charFilter)) : ev;
  const base = `#/p/${it.id}`;
  const tabs = [['line', 'list-ordered', '서술 순서'], ['time', 'clock', '시간 순서'], ['board', 'columns-3', '기승전결 보드'], ['lanes', 'users', '인물별'], ['check', 'shield-check', `점검 ${issues.length ? `(${issues.length})` : ''}`]];

  root.innerHTML = `
    <div class="edit-head">
      <a class="btn ghost sm" href="#/list/plot">${icon('arrow-left', 16)}<span>목록</span></a><span class="grow"></span>
      <button class="btn ghost sm" id="exp">${icon('share', 16)}<span>내보내기</span></button>${bookmarkBtn(it)}
      <button class="btn ghost sm danger" id="del">${icon('trash', 16)}</button>
      ${helpBtn('plot', { label: '사용법' })}
    </div>
    <input class="title-in" id="p-title" value="${esc(d.title || '')}" placeholder="플롯 제목 (예: 본편 1부, ○○ AU)" maxlength="80">
    <input class="input sub-in" id="p-desc" value="${esc(d.desc || '')}" placeholder="한 줄 설명" maxlength="140">
    ${folderPicker(it)}${tagInput(it)}
    <div class="tabs">${tabs.map(([k, ic, n]) => `<a class="tab ${tab === k ? 'on' : ''}" href="${base}?tab=${k}${charFilter ? `&c=${encodeURIComponent(charFilter)}` : ''}">${icon(ic, 16)} ${n}</a>`).join('')}</div>
    ${allChars.length && tab !== 'check' ? `<div class="filter-row">${icon('user-search', 15)}<a class="fchip ${!charFilter ? 'on' : ''}" href="${base}?tab=${tab}">모든 인물</a>${allChars.map((c) => `<a class="fchip ${charFilter === c ? 'on' : ''}" href="${base}?tab=${tab}&c=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>` : ''}
    <div id="p-body"></div>
    <button class="fab" id="ev-add" title="사건 추가">${icon('plus', 24)}<span>사건 추가</span></button>
    ${commentsPanel(it)}`;

  const body = root.querySelector('#p-body');
  const evCard = (e, i, opts = {}) => `<div class="ev ${e.done ? 'done' : ''}" style="--ec:${e.color || '#a9b6f2'}" data-ev="${e.id}">
      <div class="ev-dot"></div>
      <div class="ev-card">
        <div class="ev-top">${opts.num ? `<span class="ev-n">#${i + 1}</span>` : ''}${e.when ? `<span class="chip">${icon('clock', 12)} ${esc(e.when)}</span>` : ''}${e.act ? `<span class="chip">${esc(e.act)}</span>` : ''}${e.place ? `<span class="chip">${icon('map-pin', 12)} ${esc(e.place)}</span>` : ''}</div>
        <h4>${esc(e.title || '제목 없는 사건')}</h4>
        ${e.desc ? `<p>${esc(e.desc).replace(/\n/g, '<br>')}</p>` : ''}
        ${(e.chars || []).length ? `<div class="ev-chars">${icon('users', 13)} ${e.chars.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
        ${opts.move ? `<div class="ev-act"><button class="icon-btn sm" data-up="${e.id}" title="앞으로">${icon('arrow-up', 14)}</button><button class="icon-btn sm" data-down="${e.id}" title="뒤로">${icon('arrow-down', 14)}</button><button class="icon-btn sm" data-done="${e.id}" title="완료 표시">${icon(e.done ? 'circle-check' : 'circle', 14)}</button></div>` : ''}
      </div></div>`;

  if (!ev.length) {
    body.innerHTML = emptyState('milestone', '사건을 추가해보세요', '첫 만남, 갈등, 고백… 이야기의 사건을 카드로 쌓아요. 오른쪽 아래 + 버튼을 눌러요.');
  } else if (tab === 'line') {
    body.innerHTML = `<p class="hint">${icon('info', 14)} 독자가 읽게 될 순서(서술 순서)예요. 화살표로 순서를 바꿀 수 있어요.</p><div class="timeline">${shown.map((e) => evCard(e, ev.indexOf(e), { num: true, move: true })).join('')}</div>`;
  } else if (tab === 'time') {
    const sorted = [...shown].sort((a, b) => (!a.at ? 1 : !b.at ? -1 : cmp(a.at, b.at)));
    body.innerHTML = `<p class="hint">${icon('info', 14)} 작중 실제 시간 순서예요. 사건의 '시간축 값'(예: 1, 2, 3 또는 2024-05-01)으로 정렬해요. #번호는 서술 순서예요.</p><div class="timeline">${sorted.map((e) => evCard(e, ev.indexOf(e), { num: true })).join('')}</div>`;
  } else if (tab === 'board') {
    const cols = [...ACTS, ''];
    body.innerHTML = `<div class="board">${cols.map((a) => `<div class="bcol"><h4>${a || '미분류'} <span class="muted">${shown.filter((e) => (e.act || '') === a).length}</span></h4>${shown.filter((e) => (e.act || '') === a).map((e) => evCard(e, ev.indexOf(e), { num: true })).join('')}</div>`).join('')}</div>`;
  } else if (tab === 'lanes') {
    const chars = charFilter ? [charFilter] : allChars;
    body.innerHTML = chars.length ? `<div class="lanes-wrap"><table class="lanes"><thead><tr><th>인물</th>${ev.map((e, i) => `<th title="${esc(e.title)}">#${i + 1}<br><span>${esc((e.title || '').slice(0, 8))}</span></th>`).join('')}</tr></thead>
      <tbody>${chars.map((c) => `<tr><th>${esc(c)}</th>${ev.map((e) => `<td>${(e.chars || []).includes(c) ? `<button class="lane-dot" style="--ec:${e.color || '#a9b6f2'}" data-ev="${e.id}" title="${esc(e.title)}${e.place ? ` @ ${esc(e.place)}` : ''}"></button>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">${icon('info', 14)} 인물마다 어느 사건에 등장하는지 한눈에 봐요. 오래 등장하지 않는 인물을 찾을 때 유용해요.</p>` : emptyState('users', '사건에 등장인물을 지정해보세요', '');
  } else if (tab === 'check') {
    body.innerHTML = issues.length ? `<ul class="issues">${issues.map((x) => `<li class="lv-${x.lv}" ${x.id ? `data-ev="${x.id}"` : ''}>${icon(x.ic, 18)}<span>${esc(x.msg)}</span></li>`).join('')}</ul>` : emptyState('shield-check', '문제를 찾지 못했어요!', '시간축, 등장인물, 장소가 서로 잘 맞아요.');
  }

  // 이벤트 바인딩
  root.querySelector('#p-title').addEventListener('input', (e) => update(it.id, { title: e.target.value }, { silent: true }));
  root.querySelector('#p-desc').addEventListener('input', (e) => update(it.id, { desc: e.target.value }, { silent: true }));
  bindFolderPicker(root, it, () => renderView(root, id, q));
  bindTags(root, it);
  bindBookmark(root, it);
  bindComments(root, it, () => renderView(root, id, q));
  root.querySelector('#del').onclick = () => deleteItem(it, '#/list/plot');
  root.querySelector('#ev-add').onclick = () => editEvent(it, null, () => renderView(root, id, q));
  root.querySelector('#exp').onclick = () => openExport({
    title: d.title || '플롯', subtitle: d.desc,
    html: ev.map((e, i) => `<h4>#${i + 1} ${esc(e.title)}${e.when ? ` <small>(${esc(e.when)})</small>` : ''}</h4><p>${esc(e.desc || '').replace(/\n/g, '<br>')}</p>${(e.chars || []).length ? `<p><small>등장: ${esc(e.chars.join(', '))}${e.place ? ` / 장소: ${esc(e.place)}` : ''}</small></p>` : ''}`).join(''),
  });
  body.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-up],[data-down]');
    if (mv) {
      const eId = mv.dataset.up || mv.dataset.down; const dir = mv.dataset.up ? -1 : 1;
      update(it.id, (dd) => { const i = dd.events.findIndex((x) => x.id === eId); const j = i + dir; if (j >= 0 && j < dd.events.length) [dd.events[i], dd.events[j]] = [dd.events[j], dd.events[i]]; return dd; }, { silent: true });
      return renderView(root, id, q);
    }
    const dn = e.target.closest('[data-done]');
    if (dn) { update(it.id, (dd) => { const x = dd.events.find((y) => y.id === dn.dataset.done); x.done = !x.done; return dd; }, { silent: true }); return renderView(root, id, q); }
    const card = e.target.closest('[data-ev]');
    if (card) editEvent(it, card.dataset.ev, () => renderView(root, id, q));
  });
}

async function editEvent(it, eId, done) {
  const e = eId ? it.data.events.find((x) => x.id === eId) : { id: eid(), title: '', desc: '', when: '', at: '', chars: [], place: '', act: '', color: COLORS[5] };
  const known = [...new Set([
    ...all('character').filter((c) => !(it.data.folders || []).length || (c.data.folders || []).some((f) => it.data.folders.includes(f))).map((c) => c.data.title).filter(Boolean),
    ...(it.data.events || []).flatMap((x) => x.chars || []),
  ])];
  const res = await modal({
    title: eId ? '사건 수정' : '새 사건',
    body: `
      <label class="lbl">사건 이름</label><input class="input" id="e-t" value="${esc(e.title)}" placeholder="예: 비 오는 날의 첫 만남">
      <label class="lbl">내용</label><textarea class="input" id="e-d" rows="4" placeholder="무슨 일이 일어나나요? 감정 변화, 복선 등">${esc(e.desc)}</textarea>
      <div class="row2">
        <div><label class="lbl">언제 (표시용)</label><input class="input" id="e-w" value="${esc(e.when)}" placeholder="예: 고2 여름, 3년 전"></div>
        <div><label class="lbl">시간축 값 <span class="muted small">(정렬용)</span></label><input class="input" id="e-a" value="${esc(e.at)}" placeholder="예: 17.07 또는 2024-07-01"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">장소</label><input class="input" id="e-p" value="${esc(e.place)}" placeholder="예: 학교 옥상"></div>
        <div><label class="lbl">단계</label><select class="input" id="e-act"><option value="">미분류</option>${ACTS.map((a) => `<option ${e.act === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      </div>
      <label class="lbl">등장인물 <span class="muted small">(눌러서 선택, 직접 입력 후 Enter)</span></label>
      <div class="char-pick" id="e-c">${[...new Set([...known, ...(e.chars || [])])].map((c) => `<button type="button" class="fchip ${(e.chars || []).includes(c) ? 'on' : ''}" data-n="${esc(c)}">${esc(c)}</button>`).join('')}<input class="tag-in" id="e-cn" placeholder="+ 인물 추가"></div>
      <label class="lbl">색상</label>
      ${colorPick('ec', e.color, COLORS)}`,
    actions: [
      ...(eId ? [{ label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => ((await confirmBox('이 사건을 삭제할까요?', '삭제', true)) ? 'DEL' : false) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: '저장', cls: 'primary', icon: 'check', value: (w) => ({
        title: w.querySelector('#e-t').value.trim(), desc: w.querySelector('#e-d').value, when: w.querySelector('#e-w').value.trim(), at: w.querySelector('#e-a').value.trim(),
        place: w.querySelector('#e-p').value.trim(), act: w.querySelector('#e-act').value,
        chars: [...w.querySelectorAll('#e-c .fchip.on')].map((b) => b.dataset.n), color: pickedColor(w, 'ec') || COLORS[5],
      }) },
    ],
    onOpen: (w) => {
      const cp = w.querySelector('#e-c');
      cp.addEventListener('click', (ev) => { const b = ev.target.closest('[data-n]'); if (b) b.classList.toggle('on'); });
      w.querySelector('#e-cn').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.isComposing) {
          ev.preventDefault(); const v = ev.target.value.trim(); if (!v) return;
          ev.target.insertAdjacentHTML('beforebegin', `<button type="button" class="fchip on" data-n="${esc(v)}">${esc(v)}</button>`); ev.target.value = '';
        }
      });
      bindColorPick(w, 'ec');
    },
  });
  if (!res) return;
  if (res === 'DEL') { update(it.id, (dd) => { dd.events = dd.events.filter((x) => x.id !== e.id); return dd; }, { silent: true }); toast('사건을 삭제했어요', 'ok'); return done(); }
  if (!res.title) res.title = '제목 없는 사건';
  update(it.id, (dd) => {
    dd.events = dd.events || [];
    const i = dd.events.findIndex((x) => x.id === e.id);
    if (i >= 0) dd.events[i] = { ...dd.events[i], ...res }; else dd.events.push({ ...e, ...res });
    return dd;
  }, { silent: true });
  done();
}
