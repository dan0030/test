// 글 연성: 회차별 작성 + E북 리더
import { all, get, create, update } from '../store.js';
import { icon, esc, sanitize, htmlToText, countText, emptyState, toast, compressImage, pickFile, promptBox, confirmBox, modal, $ } from '../ui.js';
import { createEditor } from '../editor.js';
import { itemCard, folderPicker, bindFolderPicker, bookmarkBtn, bindBookmark, commentsPanel, bindComments, tagInput, bindTags, deleteItem, pageHead, folderFilter } from '../common.js';
import { openExport } from '../export.js';
import { openStoryOutput } from '../ebook.js';

const STATUS = ['구상 중', '작성 중', '퇴고 중', '완성', '게시 완료'];
const cid = () => crypto.randomUUID().slice(0, 8);

export function newStory(folderId) {
  const it = create('story', { title: '', summary: '', status: STATUS[0], chapters: [{ id: cid(), title: '1화', html: '' }], folders: folderId ? [folderId] : [], goal: 0 });
  location.hash = `#/s/${it.id}`;
}

export function renderList(root, q) {
  const f = q.get('f');
  let items = all('story');
  if (f) items = items.filter((i) => (i.data.folders || []).includes(f));
  root.innerHTML = `
    ${pageHead('book-open', '연성', '회차별로 글을 쓰고, E북처럼 넘겨보며 퇴고해요. 완성한 글은 HTML·이미지로 내보내 다른 플랫폼에 올려요.', `<button class="btn primary" id="new">${icon('plus', 18)} 새 연성</button>`)}
    ${folderFilter(f)}
    ${items.length ? `<div class="grid">${items.map((i) => storyCard(i)).join('')}</div>` : emptyState('book-open', '아직 연성이 없어요', '첫 문장을 적어볼까요?', `<button class="btn primary" id="new2">${icon('feather', 18)} 글쓰기 시작</button>`)}`;
  root.querySelectorAll('#new,#new2').forEach((b) => (b.onclick = () => newStory(f)));
}

function storyCard(it) {
  const d = it.data;
  const chars = (d.chapters || []).reduce((n, c) => n + countText(htmlToText(c.html)).noSpace, 0);
  return `<div class="card story-card">
    <a href="#/s/${it.id}" class="sc-cover" style="${d.cover ? `background-image:url('${esc(d.cover)}')` : ''}">${d.cover ? '' : icon('book-open', 34)}</a>
    <div class="sc-body">
      <span class="chip">${esc(d.status || STATUS[0])}</span>${d.bookmarked ? `<span class="star">${icon('bookmark', 14)}</span>` : ''}
      <h4><a href="#/s/${it.id}">${esc(d.title || '제목 없음')}</a></h4>
      <p>${esc(d.summary || '')}</p>
      <div class="sc-meta muted small"><span>${icon('layers', 13)} ${(d.chapters || []).length}회차</span><span>${icon('type', 13)} ${chars.toLocaleString()}자</span></div>
      <div class="sc-act"><a class="btn ghost sm" href="#/s/${it.id}">${icon('pencil', 15)} 쓰기</a><a class="btn ghost sm" href="#/read/${it.id}">${icon('book-open-text', 15)} E북 보기</a></div>
    </div></div>`;
}

export function renderEdit(root, id, q) {
  const it = get(id);
  if (!it) { root.innerHTML = emptyState('file-question-mark', '글을 찾을 수 없어요', ''); return; }
  const d = it.data;
  if (!d.chapters?.length) d.chapters = [{ id: cid(), title: '1화', html: '' }];
  let chId = q.get('ch') || d.lastCh || d.chapters[0].id;
  let ch = d.chapters.find((c) => c.id === chId) || d.chapters[0];
  chId = ch.id;
  const total = () => d.chapters.reduce((n, c) => n + countText(htmlToText(c.html)).noSpace, 0);

  root.innerHTML = `
    <div class="edit-head">
      <a class="btn ghost sm" href="#/list/story">${icon('arrow-left', 16)}<span>목록</span></a>
      <button class="btn ghost sm show-m" id="ch-toggle">${icon('panel-left', 16)}<span>회차</span></button>
      <span class="grow"></span>
      <a class="btn ghost sm" href="#/read/${it.id}?ch=${chId}">${icon('book-open-text', 16)}<span>E북 보기</span></a>
      <button class="btn ghost sm" id="exp">${icon('share', 16)}<span>출력하기</span></button>
      ${bookmarkBtn(it)}
      <button class="btn ghost sm danger" id="del" title="삭제">${icon('trash', 16)}</button>
    </div>
    <div class="story-edit">
      <aside class="se-side" id="se-side">
        <div class="panel">
          <input class="title-in sm" id="s-title" value="${esc(d.title || '')}" placeholder="작품 제목" maxlength="80">
          <textarea class="input" id="s-sum" rows="2" placeholder="한 줄 소개·키워드">${esc(d.summary || '')}</textarea>
          <div class="row2"><select class="input" id="s-status">${STATUS.map((s) => `<option ${d.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn ghost sm" id="s-cover">${icon('image', 15)} 표지</button></div>
        </div>
        <div class="panel">
          <h4>${icon('layers', 16)} 회차 <span class="muted">${d.chapters.length}</span></h4>
          <ol class="ch-list">${d.chapters.map((c, i) => `<li class="${c.id === chId ? 'on' : ''}" data-ch="${c.id}"><span class="ch-n">${i + 1}</span><span class="ch-t">${esc(c.title || `${i + 1}화`)}</span><span class="ch-c muted">${countText(htmlToText(c.html)).noSpace.toLocaleString()}</span></li>`).join('')}</ol>
          <div class="ch-btns">
            <button class="btn ghost sm" id="ch-add">${icon('plus', 14)} 회차 추가</button>
            <button class="icon-btn sm" id="ch-up" title="위로">${icon('arrow-up', 14)}</button>
            <button class="icon-btn sm" id="ch-down" title="아래로">${icon('arrow-down', 14)}</button>
            <button class="icon-btn sm" id="ch-del" title="이 회차 삭제">${icon('trash', 14)}</button>
          </div>
        </div>
        <div class="panel">
          <h4>${icon('target', 16)} 목표 글자 수</h4>
          <div class="goal"><input class="input" type="number" min="0" step="500" id="s-goal" value="${d.goal || ''}" placeholder="예: 10000"><span class="goal-unit">자</span></div>
          <p class="muted small">공백 제외 · 전체 회차 기준</p>
          <div class="progress"><div id="goal-bar"></div></div>
          <p class="muted small" id="goal-txt"></p>
        </div>
        <div class="panel">${folderPicker(it)}${tagInput(it)}</div>
      </aside>
      <div class="se-main">
        <input class="ch-title-in" id="ch-title" value="${esc(ch.title || '')}" placeholder="회차 제목" maxlength="80">
        <div id="s-ed"></div>
        ${commentsPanel(it, '현재 회차')}
      </div>
    </div>`;

  const drawGoal = () => {
    const n = total(); const g = +it.data.goal || 0;
    root.querySelector('#goal-bar').style.width = `${g ? Math.min(100, (n / g) * 100) : 0}%`;
    root.querySelector('#goal-txt').textContent = g ? `${n.toLocaleString()} / ${g.toLocaleString()}자 (${Math.floor((n / g) * 100)}%)` : `현재 ${n.toLocaleString()}자`;
  };
  drawGoal();

  const ed = createEditor(root.querySelector('#s-ed'), {
    html: ch.html,
    placeholder: '이야기를 시작해보세요…',
    onChange: (html) => {
      update(it.id, (dd) => { const c = dd.chapters.find((x) => x.id === chId); if (c) c.html = html; dd.lastCh = chId; return dd; }, { silent: true });
      const li = root.querySelector(`[data-ch="${chId}"] .ch-c`);
      if (li) li.textContent = countText(htmlToText(html)).noSpace.toLocaleString();
      drawGoal();
      bumpDaily(html, chId);
    },
  });

  const go = (cId) => { ed.flush(); location.hash = `#/s/${it.id}?ch=${cId}`; };
  root.querySelector('.ch-list').addEventListener('click', (e) => { const li = e.target.closest('[data-ch]'); if (li) go(li.dataset.ch); });
  root.querySelector('#ch-title').addEventListener('input', (e) => {
    update(it.id, (dd) => { dd.chapters.find((x) => x.id === chId).title = e.target.value; return dd; }, { silent: true });
    const li = root.querySelector(`[data-ch="${chId}"] .ch-t`); if (li) li.textContent = e.target.value;
  });
  root.querySelector('#ch-add').onclick = () => {
    const nc = { id: cid(), title: `${d.chapters.length + 1}화`, html: '' };
    update(it.id, (dd) => { dd.chapters.push(nc); return dd; }, { silent: true });
    go(nc.id);
  };
  const move = (dir) => {
    ed.flush();
    update(it.id, (dd) => { const i = dd.chapters.findIndex((x) => x.id === chId); const j = i + dir; if (j < 0 || j >= dd.chapters.length) return dd; [dd.chapters[i], dd.chapters[j]] = [dd.chapters[j], dd.chapters[i]]; return dd; }, { silent: true });
    renderEdit(root, id, q);
  };
  root.querySelector('#ch-up').onclick = () => move(-1);
  root.querySelector('#ch-down').onclick = () => move(1);
  root.querySelector('#ch-del').onclick = async () => {
    if (d.chapters.length < 2) return toast('회차가 하나뿐이라 삭제할 수 없어요', 'error');
    if (!(await confirmBox(`'${ch.title}' 회차를 삭제할까요?`, '삭제', true))) return;
    update(it.id, (dd) => { dd.chapters = dd.chapters.filter((x) => x.id !== chId); return dd; }, { silent: true });
    go(it.data.chapters[0].id);
  };
  root.querySelector('#ch-toggle').onclick = () => root.querySelector('#se-side').classList.toggle('open');

  root.querySelector('#s-title').addEventListener('input', (e) => update(it.id, { title: e.target.value }, { silent: true }));
  root.querySelector('#s-sum').addEventListener('input', (e) => update(it.id, { summary: e.target.value }, { silent: true }));
  root.querySelector('#s-status').addEventListener('change', (e) => update(it.id, { status: e.target.value }, { silent: true }));
  root.querySelector('#s-goal').addEventListener('input', (e) => { update(it.id, { goal: +e.target.value || 0 }, { silent: true }); drawGoal(); });
  root.querySelector('#s-cover').onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { update(it.id, { cover: await compressImage(f, 600) }, { silent: true }); toast('표지를 바꿨어요', 'ok'); } catch (e) { toast(e.message, 'error'); }
  };
  bindFolderPicker(root, it, () => { ed.flush(); renderEdit(root, id, q); });
  bindTags(root, it);
  bindBookmark(root, it);
  bindComments(root, it, () => { ed.flush(); renderEdit(root, id, q); }, () => ch.title);
  root.querySelector('#del').onclick = () => deleteItem(it, '#/list/story');
  root.querySelector('#exp').onclick = async () => {
    ed.flush();
    const which = d.chapters.length > 1 ? await modal({
      title: '무엇을 내보낼까요?',
      body: '<p class="muted">현재 회차만 또는 전체 회차를 하나로 합쳐 내보낼 수 있어요.</p>',
      actions: [{ label: '현재 회차', cls: 'ghost', value: () => 'one' }, { label: '전체 회차', cls: 'primary', value: () => 'all' }],
    }) : 'one';
    if (!which) return;
    const dd = get(id).data;
    const cur = dd.chapters.find((x) => x.id === chId) || dd.chapters[0];
    const chs = which === 'one' ? [{ title: cur.title, html: cur.html }] : dd.chapters.map((c) => ({ title: c.title, html: c.html }));
    const fallback = () => (which === 'one'
      ? openExport({ title: dd.title || '제목 없음', subtitle: cur.title, html: cur.html })
      : openExport({ title: dd.title || '제목 없음', subtitle: dd.summary, html: dd.chapters.map((c) => `<h3 style="text-align:center">${esc(c.title)}</h3>${c.html}`).join('<hr>') }));
    openStoryOutput({ title: dd.title || '제목 없음', subtitle: which === 'one' ? cur.title : dd.summary, chapters: chs, fallback });
  };
  if (!d.title) root.querySelector('#s-title').focus();
  return { cleanup: () => { ed.flush(); ed.destroy(); } };
}

// 오늘 쓴 글자 수 추적 (기기별 통계, 내용은 저장하지 않음)
const base = new Map();
function bumpDaily(html, key) {
  const n = countText(htmlToText(html)).noSpace;
  if (!base.has(key)) { base.set(key, n); return; }
  const diff = n - base.get(key);
  base.set(key, n);
  if (diff <= 0) return;
  try {
    const k = `onote-daily-${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + diff));
  } catch { /* noop */ }
}
export function todayWritten() { try { return +localStorage.getItem(`onote-daily-${new Date().toISOString().slice(0, 10)}`) || 0; } catch { return 0; } }

// ---------------- E북 리더 ----------------
const RPREF = 'onote-reader';
function loadPref() { try { return { size: 18, lh: 1.9, theme: 'paper', font: 'serif', ...JSON.parse(localStorage.getItem(RPREF) || '{}') }; } catch { return { size: 18, lh: 1.9, theme: 'paper', font: 'serif' }; } }

export function renderReader(root, id, q) {
  const it = get(id);
  if (!it) { root.innerHTML = emptyState('file-question-mark', '글을 찾을 수 없어요', ''); return; }
  const d = it.data;
  const chs = d.chapters || [];
  let ci = Math.max(0, chs.findIndex((c) => c.id === q.get('ch')));
  if (!q.get('ch') && d.readPos) ci = Math.max(0, chs.findIndex((c) => c.id === d.readPos.ch));
  let page = 0; let pages = 1;
  const pref = loadPref();
  document.body.classList.add('reading');

  root.innerHTML = `
    <div class="reader theme-${pref.theme}" id="rd">
      <div class="rd-top">
        <a class="icon-btn" href="#/s/${it.id}?ch=${chs[ci]?.id || ''}" title="편집으로">${icon('x', 20)}</a>
        <div class="rd-title"><b>${esc(d.title || '제목 없음')}</b><select id="rd-ch" aria-label="회차 선택">${chs.map((c, i) => `<option value="${i}" ${i === ci ? 'selected' : ''}>${esc(c.title || `${i + 1}화`)}</option>`).join('')}</select></div>
        <button class="icon-btn" id="rd-mark" title="책갈피">${icon('bookmark-plus', 20)}</button>
        <button class="icon-btn" id="rd-set" title="보기 설정">${icon('type', 20)}</button>
      </div>
      <div class="rd-stage" id="rd-stage"><div class="rd-cols" id="rd-cols"></div>
        <button class="rd-tap l" id="rd-prev" aria-label="이전 페이지"></button><button class="rd-tap r" id="rd-next" aria-label="다음 페이지"></button>
      </div>
      <div class="rd-bot"><div class="rd-prog"><div id="rd-bar"></div></div><span id="rd-pg"></span></div>
      <div class="rd-panel" id="rd-panel" hidden>
        <div class="rp-row"><span>${icon('a-large-small', 16)} 글자 크기</span><button class="btn ghost sm" data-p="size" data-d="-1">가-</button><b id="rp-size">${pref.size}</b><button class="btn ghost sm" data-p="size" data-d="1">가+</button></div>
        <div class="rp-row"><span>${icon('rows-3', 16)} 줄 간격</span><button class="btn ghost sm" data-p="lh" data-d="-0.1">좁게</button><b id="rp-lh">${pref.lh.toFixed(1)}</b><button class="btn ghost sm" data-p="lh" data-d="0.1">넓게</button></div>
        <div class="rp-row"><span>${icon('palette', 16)} 배경</span>${[['paper', '종이'], ['white', '흰색'], ['sepia', '세피아'], ['dark', '어둡게']].map(([k, n]) => `<button class="btn ghost sm ${pref.theme === k ? 'on' : ''}" data-theme="${k}">${n}</button>`).join('')}</div>
        <div class="rp-row"><span>${icon('type', 16)} 글꼴</span><button class="btn ghost sm ${pref.font === 'serif' ? 'on' : ''}" data-font="serif">명조</button><button class="btn ghost sm ${pref.font === 'sans' ? 'on' : ''}" data-font="sans">고딕</button></div>
        <div class="rp-marks"><b>${icon('bookmark', 15)} 책갈피</b><div id="rp-marks"></div></div>
      </div>
    </div>`;

  const stage = $('#rd-stage', root);
  const cols = $('#rd-cols', root);

  const applyPref = () => {
    cols.style.fontSize = `${pref.size}px`;
    cols.style.lineHeight = pref.lh;
    cols.style.fontFamily = pref.font === 'serif' ? 'var(--serif)' : 'var(--sans)';
    $('#rd', root).className = `reader theme-${pref.theme}`;
    try { localStorage.setItem(RPREF, JSON.stringify(pref)); } catch { /* noop */ }
  };

  const GAP = 56;
  const pageStep = () => cols.clientWidth + GAP;
  const layout = (keepRatio) => {
    const ratio = pages > 1 ? page / (pages - 1) : 0;
    const W = stage.clientWidth;
    const pad = W > 700 ? 56 : 22;
    cols.style.margin = `0 ${pad}px`;
    const inner = W - pad * 2;
    const two = W > 980;
    cols.style.columnWidth = `${two ? (inner - GAP) / 2 : inner}px`;
    cols.style.columnCount = two ? 2 : 1;
    cols.style.columnGap = `${GAP}px`;
    cols.style.height = `${stage.clientHeight}px`;
    cols.style.transform = 'translateX(0)';
    const perPage = two ? 2 : 1;
    // 실제 콘텐츠가 차지하는 단(column) 수로 페이지 계산
    const colsUsed = Math.max(1, Math.round((cols.scrollWidth + GAP) / ((two ? (inner - GAP) / 2 : inner) + GAP)));
    pages = Math.max(1, Math.ceil(colsUsed / perPage));
    page = keepRatio ? Math.round(ratio * (pages - 1)) : Math.min(page, pages - 1);
    show();
  };
  const show = () => {
    cols.style.transform = `translateX(${-page * pageStep()}px)`;
    $('#rd-pg', root).textContent = `${page + 1} / ${pages}`;
    $('#rd-bar', root).style.width = `${((page + 1) / pages) * 100}%`;
    savePos();
  };
  const savePos = debounceLocal(() => update(it.id, { readPos: { ch: chs[ci]?.id, r: pages > 1 ? page / (pages - 1) : 0 } }, { silent: true }), 800);

  const loadCh = (i, atEnd = false, ratio = null) => {
    ci = i;
    const c = chs[ci];
    $('#rd-ch', root).value = String(ci);
    cols.innerHTML = c ? `<h2 class="rd-chtitle">${esc(c.title || '')}</h2>${sanitize(c.html || '')}` : '<p>회차가 없어요.</p>';
    page = 0;
    requestAnimationFrame(() => {
      layout(false);
      if (atEnd) page = pages - 1;
      if (ratio != null) page = Math.round(ratio * (pages - 1));
      show();
    });
  };
  const next = () => { if (page < pages - 1) { page++; show(); } else if (ci < chs.length - 1) loadCh(ci + 1); else toast('마지막 페이지예요'); };
  const prev = () => { if (page > 0) { page--; show(); } else if (ci > 0) loadCh(ci - 1, true); };

  $('#rd-next', root).onclick = next;
  $('#rd-prev', root).onclick = prev;
  $('#rd-ch', root).onchange = (e) => loadCh(+e.target.value);
  const onKey = (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); next(); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
  };
  document.addEventListener('keydown', onKey);
  // 스와이프
  let sx = null; let sy = null;
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)();
    sx = null;
  });
  const onResize = () => layout(true);
  window.addEventListener('resize', onResize);

  // 설정 패널
  $('#rd-set', root).onclick = () => { const p = $('#rd-panel', root); p.hidden = !p.hidden; drawMarks(); };
  $('#rd-panel', root).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) {
      const k = b.dataset.p; const dlt = +b.dataset.d;
      pref[k] = k === 'size' ? Math.min(30, Math.max(13, pref[k] + dlt)) : Math.round(Math.min(2.6, Math.max(1.3, pref[k] + dlt)) * 10) / 10;
      $('#rp-size', root).textContent = pref.size; $('#rp-lh', root).textContent = pref.lh.toFixed(1);
    }
    if (b.dataset.theme) { pref.theme = b.dataset.theme; b.parentElement.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.dataset.font) { pref.font = b.dataset.font; b.parentElement.querySelectorAll('[data-font]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.dataset.goto) { const m = it.data.marks[+b.dataset.goto]; const i = chs.findIndex((c) => c.id === m.ch); if (i >= 0) loadCh(i, false, m.r); $('#rd-panel', root).hidden = true; return; }
    if (b.dataset.unmark) { update(it.id, (dd) => { dd.marks.splice(+b.dataset.unmark, 1); return dd; }, { silent: true }); drawMarks(); return; }
    applyPref(); layout(true);
  });
  const drawMarks = () => {
    const ms = it.data.marks || [];
    $('#rp-marks', root).innerHTML = ms.length ? ms.map((m, i) => { const c = chs.find((x) => x.id === m.ch); return `<div class="mark-row"><button class="link" data-goto="${i}">${esc(c?.title || '?')} · ${Math.round(m.r * 100)}% ${m.note ? `— ${esc(m.note)}` : ''}</button><button class="icon-btn sm" data-unmark="${i}">${icon('x', 13)}</button></div>`; }).join('') : '<p class="muted small">책갈피 아이콘을 눌러 지금 페이지를 저장하세요.</p>';
  };
  $('#rd-mark', root).onclick = async () => {
    const note = await promptBox('책갈피 메모 (선택)', '예: 여기 묘사 다듬기');
    if (note === null) return;
    update(it.id, (dd) => { dd.marks = [...(dd.marks || []), { ch: chs[ci].id, r: pages > 1 ? page / (pages - 1) : 0, note }]; return dd; }, { silent: true });
    toast('책갈피를 추가했어요', 'ok');
  };

  applyPref();
  const startRatio = !q.get('ch') && d.readPos ? d.readPos.r : null;
  loadCh(ci, false, startRatio);

  return { cleanup: () => { document.body.classList.remove('reading'); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); } };
}

function debounceLocal(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }
