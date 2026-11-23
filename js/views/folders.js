// 페어 폴더 + 페어틀
import { all, get, update, inFolder } from '../store.js';
import { icon, esc, TYPES, emptyState, modal, toast, confirmBox, $ } from '../ui.js';
import { itemCard, newFolderDialog, pageHead } from '../common.js';
import { remove } from '../store.js';
import { openExport } from '../export.js';
import { newWiki } from './wiki.js';
import { newStory } from './story.js';
import { newPlot } from './plot.js';
import { quickMemo } from './memo.js';

const PAIRTLE_PRESETS = {
  '기본 페어틀': ['상대를 부르는 호칭', '첫인상', '지금의 인상', '상대의 좋은 점', '상대의 싫은(?) 점', '상대에게 숨기고 있는 것', '질투 포인트', '스킨십 반응', '이미지 컬러', '상징하는 꽃·동물', '테마곡', '관계를 한 줄로'],
  '관계 질문 30': ['처음 만난 곳', '처음 나눈 대화', '사이가 가까워진 계기', '가장 크게 싸운 일', '화해하는 방법', '상대 앞에서만 하는 행동', '상대가 아프면?', '상대의 생일 선물', '데이트 장소', '서로의 연락 빈도', '먼저 고백한 쪽', '상대를 잃는다면'],
  'AU 설정표': ['AU 속 직업·신분', '사는 곳', '둘의 관계', '만나게 된 이유', '갈등 요소', '원작과 달라진 점', '결말 방향'],
};

export function renderList(root) {
  const fs = all('folder');
  root.innerHTML = `
    ${pageHead('folder-heart', '페어 폴더', '페어·CP·작품·AU별로 폴더를 만들어 캐릭터, 세계관, 연성, 플롯, 메모를 모아봐요.', `<button class="btn primary" id="new">${icon('folder-plus', 18)} 새 폴더</button>`)}
    ${fs.length ? `<div class="folder-grid">${fs.map((f) => {
      const n = inFolder(f.id).length;
      return `<a class="folder-card" href="#/folder/${f.id}" style="--c:${f.data.color || '#ccc'}">
        <div class="fc-emoji">${esc(f.data.emoji || '💞')}</div>
        <h3>${esc(f.data.title)}</h3>
        ${f.data.pair?.a || f.data.pair?.b ? `<div class="fc-pair">${esc(f.data.pair.a || '?')} <span>×</span> ${esc(f.data.pair.b || '?')}</div>` : ''}
        <p>${esc(f.data.desc || '')}</p>
        <div class="fc-stats">${['character', 'world', 'story', 'plot', 'memo'].map((t) => { const c = inFolder(f.id, t).length; return c ? `<span title="${TYPES[t].label}">${icon(TYPES[t].icon, 13)} ${c}</span>` : ''; }).join('')}${n ? '' : '<span class="muted">비어 있음</span>'}</div>
      </a>`;
    }).join('')}</div>` : emptyState('folder-heart', '아직 페어 폴더가 없어요', '최애 페어 이름으로 첫 폴더를 만들어보세요!', `<button class="btn primary" id="new2">${icon('folder-plus', 18)} 폴더 만들기</button>`)}`;
  root.querySelectorAll('#new,#new2').forEach((b) => (b.onclick = async () => { const f = await newFolderDialog(); if (f) location.hash = `#/folder/${f.id}`; }));
}

export function renderFolder(root, id, q) {
  const f = get(id);
  if (!f || f.type !== 'folder') { root.innerHTML = emptyState('folder-x', '폴더를 찾을 수 없어요', ''); return; }
  const d = f.data;
  const tab = q.get('tab') || 'pair';
  const tabs = [['pair', 'heart-handshake', '페어틀'], ...['character', 'world', 'story', 'plot', 'memo'].map((t) => [t, TYPES[t].icon, `${TYPES[t].label} ${inFolder(id, t).length || ''}`])];

  root.innerHTML = `
    <header class="folder-hero" style="--c:${d.color || '#ccc'}">
      <div class="fh-emoji">${esc(d.emoji || '💞')}</div>
      <div class="fh-text">
        <h1>${esc(d.title)}</h1>
        ${d.pair?.a || d.pair?.b ? `<div class="fh-pair">${esc(d.pair.a || '?')} <span>×</span> ${esc(d.pair.b || '?')}</div>` : ''}
        ${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
      </div>
      <div class="fh-act">
        <button class="btn ghost sm" id="f-edit">${icon('pencil', 15)}<span>수정</span></button>
        <button class="btn ghost sm danger" id="f-del">${icon('trash', 15)}</button>
      </div>
    </header>
    <div class="tabs">${tabs.map(([k, ic, n]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/folder/${id}?tab=${k}">${icon(ic, 16)} ${esc(n)}</a>`).join('')}</div>
    <div id="f-body"></div>`;

  $('#f-edit', root).onclick = async () => { await newFolderDialog(f); renderFolder(root, id, q); };
  $('#f-del', root).onclick = async () => {
    if (await confirmBox(`'${d.title}' 폴더를 삭제할까요? 안의 글은 지워지지 않고 폴더 연결만 해제돼요.`, '폴더 삭제', true)) { remove(id); location.hash = '#/folders'; }
  };

  const body = $('#f-body', root);
  if (tab === 'pair') return renderPairtle(body, f, () => renderFolder(root, id, q));
  const items = inFolder(id, tab);
  const t = TYPES[tab];
  const addBtn = `<button class="btn primary" id="f-add">${icon('plus', 18)} 이 폴더에 ${t.label} 추가</button>`;
  body.innerHTML = items.length ? `<div class="toolbar-row">${addBtn}</div><div class="grid">${items.map((i) => itemCard(i, { showType: false })).join('')}</div>` : emptyState(t.icon, `이 폴더에 ${t.label}이(가) 없어요`, t.desc, addBtn);
  $('#f-add', body).onclick = () => {
    if (tab === 'character' || tab === 'world') newWiki(tab, id);
    if (tab === 'story') newStory(id);
    if (tab === 'plot') newPlot(id);
    if (tab === 'memo') quickMemo(id).then(() => renderFolder(root, id, q));
  };
}

function charDoc(name) {
  if (!name) return null;
  return all('character').find((c) => (c.data.title || '').trim() === name.trim());
}

function renderPairtle(body, f, rerender) {
  const d = f.data;
  const rows = d.pairtle || [];
  const A = charDoc(d.pair?.a); const B = charDoc(d.pair?.b);
  const face = (doc, name) => `<div class="pt-face">${doc?.data.image ? `<img src="${doc.data.image}" alt="">` : `<span class="pt-ph">${icon('user', 30)}</span>`}<b>${esc(name || '캐릭터')}</b>${doc ? `<a class="link small" href="#/w/${doc.id}">${icon('contact', 12)} 프로필</a>` : `<span class="muted small">같은 이름의 캐릭터 문서를 만들면 사진이 연결돼요</span>`}</div>`;
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} 페어틀: 두 캐릭터를 같은 질문에 나란히 답하게 해보는 표예요. 칸을 눌러 바로 적고, 이미지로 저장해 공유할 수 있어요.</p>
    <div class="pairtle" style="--c:${d.color || '#ccc'}">
      <div class="pt-head">${face(A, d.pair?.a)}<div class="pt-x">${esc(d.emoji || '💞')}</div>${face(B, d.pair?.b)}</div>
      <div class="pt-rows">${rows.map((r, i) => `<div class="pt-row" data-i="${i}">
        <div class="pt-cell" contenteditable="true" data-k="a" data-ph="…">${esc(r.a || '')}</div>
        <div class="pt-label" contenteditable="true" data-k="label" data-ph="질문">${esc(r.label || '')}</div>
        <div class="pt-cell" contenteditable="true" data-k="b" data-ph="…">${esc(r.b || '')}</div>
        <button class="icon-btn sm pt-rm" data-rm="${i}" title="행 삭제">${icon('x', 13)}</button></div>`).join('')}</div>
    </div>
    <div class="toolbar-row">
      <button class="btn ghost" id="pt-add">${icon('plus', 16)} 질문 추가</button>
      <button class="btn ghost" id="pt-preset">${icon('layout-template', 16)} 템플릿 불러오기</button>
      <button class="btn primary" id="pt-exp">${icon('image-down', 16)} 이미지·HTML로 내보내기</button>
    </div>`;
  body.querySelector('.pt-rows').addEventListener('input', (e) => {
    const c = e.target.closest('[data-k]'); const row = e.target.closest('.pt-row'); if (!c || !row) return;
    update(f.id, (dd) => { dd.pairtle[+row.dataset.i][c.dataset.k] = c.innerText.trim(); return dd; }, { silent: true });
  });
  body.querySelector('.pt-rows').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { update(f.id, (dd) => { dd.pairtle.splice(+rm.dataset.rm, 1); return dd; }, { silent: true }); rerender(); }
  });
  body.querySelector('#pt-add').onclick = () => { update(f.id, (dd) => { dd.pairtle = [...(dd.pairtle || []), { label: '', a: '', b: '' }]; return dd; }, { silent: true }); rerender(); };
  body.querySelector('#pt-preset').onclick = async () => {
    const name = await modal({
      title: '페어틀 템플릿',
      body: `<div class="preset-list">${Object.entries(PAIRTLE_PRESETS).map(([k, v]) => `<button class="act" data-p="${esc(k)}">${icon('layout-template', 20)}<b>${esc(k)}</b><span>${esc(v.slice(0, 4).join(' · '))} …</span></button>`).join('')}</div><p class="muted small">기존 질문 뒤에 추가돼요.</p>`,
      onOpen: (w, close) => w.querySelector('.preset-list').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) close(b.dataset.p); }),
    });
    if (!name) return;
    update(f.id, (dd) => { dd.pairtle = [...(dd.pairtle || []), ...PAIRTLE_PRESETS[name].map((label) => ({ label, a: '', b: '' }))]; return dd; }, { silent: true });
    toast('템플릿을 추가했어요', 'ok');
    rerender();
  };
  body.querySelector('#pt-exp').onclick = () => {
    const img = (doc) => (doc?.data.image ? `<img src="${doc.data.image}" alt="" style="width:110px;height:110px;object-fit:cover;border-radius:50%;margin:0 auto .5em;display:block;">` : '');
    const html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <tr><td style="text-align:center;padding:1em;vertical-align:bottom;">${img(A)}<b style="font-size:1.1em">${esc(d.pair?.a || '')}</b></td><td style="text-align:center;font-size:1.6em;width:22%;">${esc(d.emoji || '💞')}</td><td style="text-align:center;padding:1em;vertical-align:bottom;">${img(B)}<b style="font-size:1.1em">${esc(d.pair?.b || '')}</b></td></tr>
      ${(d.pairtle || []).map((r) => `<tr><td style="padding:.7em;text-align:center;border-top:1px solid ${d.color};">${esc(r.a)}</td><td style="padding:.7em;text-align:center;border-top:1px solid ${d.color};font-weight:700;font-size:.85em;background:${d.color}33;">${esc(r.label)}</td><td style="padding:.7em;text-align:center;border-top:1px solid ${d.color};">${esc(r.b)}</td></tr>`).join('')}
    </table>`;
    openExport({ title: d.title, subtitle: d.desc, html });
  };
}
