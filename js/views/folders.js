// 페어 폴더 + 페어틀
import { all, get, update, inFolder } from '../store.js';
import { imgAttrs, folderIcon, icon, esc, TYPES, emptyState, modal, toast, confirmBox, pickFile, $ } from '../ui.js';
import { saveImage } from '../images.js';
import { itemCard, newFolderDialog, pageHead, membersOf, membersHTML, rowVals } from '../common.js';
import { remove } from '../store.js';
import { openExport } from '../export.js';
import { helpBtn } from '../help.js';
import { newWiki } from './wiki.js';
import { newStory } from './story.js';
import { newPlot } from './plot.js';
import { quickMemo, memoBoard } from './memo.js';

const PAIRTLE_PRESETS = {
  '기본 페어틀': ['상대를 부르는 호칭', '첫인상', '지금의 인상', '상대의 좋은 점', '상대의 싫은(?) 점', '상대에게 숨기고 있는 것', '질투 포인트', '스킨십 반응', '이미지 컬러', '상징하는 꽃·동물', '테마곡', '관계를 한 줄로'],
  '관계 질문 30': ['처음 만난 곳', '처음 나눈 대화', '사이가 가까워진 계기', '가장 크게 싸운 일', '화해하는 방법', '상대 앞에서만 하는 행동', '상대가 아프면?', '상대의 생일 선물', '데이트 장소', '서로의 연락 빈도', '먼저 고백한 쪽', '상대를 잃는다면'],
  'AU 설정표': ['AU 속 직업·신분', '사는 곳', '둘의 관계', '만나게 된 이유', '갈등 요소', '원작과 달라진 점', '결말 방향'],
};

export function renderList(root) {
  const fs = all('folder');
  root.innerHTML = `
    ${pageHead('folder-heart', '페어 폴더', '페어·CP·작품·AU별로 폴더를 만들어 캐릭터, 세계관, 연성, 플롯, 메모를 모아봐요.', `<button class="btn primary" id="new">${icon('folder-plus', 18)} 새 폴더</button>`, 'folder')}
    ${fs.length ? `<div class="folder-grid">${fs.map((f) => {
      const n = inFolder(f.id).length;
      return `<a class="folder-card" href="#/folder/${f.id}" style="--c:${f.data.color || '#ccc'}">
        <div class="fc-emoji">${folderIcon(f.data)}</div>
        <h3>${esc(f.data.title)}</h3>
        ${membersOf(f.data).length ? `<div class="fc-pair">${membersHTML(membersOf(f.data))}</div>` : ''}
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
      <div class="fh-emoji">${folderIcon(d)}</div>
      <div class="fh-text">
        <h1>${esc(d.title)}</h1>
        ${membersOf(d).length ? `<div class="fh-pair">${membersHTML(membersOf(d))}</div>` : ''}
        ${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
      </div>
      <div class="fh-act">
        <button class="btn ghost sm" id="f-edit">${icon('pencil', 15)}<span>수정</span></button>
        <button class="btn ghost sm danger" id="f-del">${icon('trash', 15)}</button>
        ${helpBtn('folder', { label: '사용법' })}
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
  // 메모는 메모 화면과 똑같은 포스트잇 보드로
  if (tab === 'memo') { memoBoard(body, { folderId: id }); return; }
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

// 페어틀 사진: 폴더에 따로 올린 사진이 먼저, 없으면 같은 이름의 캐릭터 문서 사진
const faceImg = (d, name, doc) => (d.faces || {})[name] || doc?.data.image || '';

// 사진 바꾸기 창 (페어 대표 이미지 / 캐릭터별 프사)
async function photoMenu({ title, hasOwn, note }) {
  return modal({
    title,
    body: `<p class="muted small">${note}</p>`,
    actions: [
      ...(hasOwn ? [{ label: '올린 사진 지우기', cls: 'ghost danger', icon: 'trash', value: () => 'clear' }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      { label: hasOwn ? '다른 사진으로 바꾸기' : '사진 올리기', cls: 'primary', icon: 'upload', value: () => 'upload' },
    ],
  });
}
async function pickPhoto() {
  const file = await pickFile('image/*');
  if (!file) return null;
  try { toast('사진을 올리는 중…'); return await saveImage(file, 'profile'); } catch (e) { toast(e.message || '사진을 올리지 못했어요', 'error'); return null; }
}

function renderPairtle(body, f, rerender) {
  const d = f.data;
  const mem = membersOf(d);
  const cols = mem.length ? mem : ['캐릭터'];
  const n = cols.length;
  const classic = n === 2; // 2인: A | 질문 | B, 그 외: 질문 | 멤버1 | 멤버2 | …
  const rows = (d.pairtle || []).map((r) => ({ label: r.label || '', v: rowVals(r, n) }));
  const docs = cols.map((c) => (mem.length ? charDoc(c) : null));
  const tmpl = classic ? 'minmax(0,1fr) minmax(90px,150px) minmax(0,1fr)' : `minmax(96px,150px) repeat(${n}, minmax(${n >= 4 ? 110 : 130}px, 1fr))`;
  const minW = classic ? 0 : 150 + n * (n >= 4 ? 110 : 130);
  const camBtn = (attr, label) => `<button type="button" class="pt-cam" ${attr} title="${label}" aria-label="${label}">${icon('camera', 14)}</button>`;
  const face = (doc, name, j) => {
    const src = faceImg(d, name, doc);
    return `<div class="pt-face"><div class="pt-pic">${src ? `<img ${imgAttrs(src)} alt="">` : `<span class="pt-ph">${icon('user', 26)}</span>`}${mem.length ? camBtn(`data-face="${j}"`, `${name} 사진 바꾸기`) : ''}</div><b>${esc(name)}</b>${doc ? `<a class="link small" href="#/w/${doc.id}">${icon('contact', 12)} 프로필</a>` : ''}</div>`;
  };
  const pairPic = (style = '') => (d.pairImage ? `<img class="f-ico pt-pairimg" ${imgAttrs(d.pairImage)} alt="" ${style ? `style="${style}"` : ''}>` : folderIcon(d, '💞', style));
  const center = `<div class="pt-x"><div class="pt-pic">${pairPic()}${camBtn('data-pairimg', '페어 대표 이미지 바꾸기')}</div></div>`;
  const cell = (ri, j, val) => `<div class="pt-cell" contenteditable="true" data-j="${j}" data-ph="…">${esc(val)}</div>`;
  const label = (r) => `<div class="pt-label" contenteditable="true" data-k="label" data-ph="질문">${esc(r.label)}</div>`;
  const head = classic
    ? `${face(docs[0], cols[0], 0)}${center}${face(docs[1], cols[1], 1)}`
    : `${center}${cols.map((c, j) => face(docs[j], c, j)).join('')}`;
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} 페어틀: ${n === 1 ? '캐릭터 한 명에게' : `${n}명의 캐릭터에게`} 같은 질문을 던져 나란히 답하게 해보는 표예요. 칸을 눌러 바로 적고, 이미지로 저장해 공유할 수 있어요.${mem.length ? '' : ' 폴더 수정에서 멤버를 추가해보세요.'}</p>
    <div class="pt-scroll"><div class="pairtle ${classic ? 'classic' : 'multi'}" style="--c:${d.color || '#ccc'};min-width:${minW}px">
      <div class="pt-head" style="grid-template-columns:${tmpl}">${head}</div>
      <div class="pt-rows">${rows.map((r, i) => `<div class="pt-row" data-i="${i}" style="grid-template-columns:${tmpl}">
        ${classic ? `${cell(i, 0, r.v[0])}${label(r)}${cell(i, 1, r.v[1])}` : `${label(r)}${r.v.map((v, j) => cell(i, j, v)).join('')}`}
        <button class="icon-btn sm pt-rm" data-rm="${i}" title="질문 삭제" aria-label="질문 삭제">${icon('x', 13)}</button></div>`).join('')}</div>
    </div></div>
    <div class="toolbar-row">
      <button class="btn ghost" id="pt-add">${icon('plus', 16)} 질문 추가</button>
      <button class="btn ghost" id="pt-preset">${icon('layout-template', 16)} 템플릿 불러오기</button>
      <button class="btn primary" id="pt-exp">${icon('image-down', 16)} 이미지·HTML로 내보내기</button>
    </div>`;
  const store = () => rows.map((r) => ({ label: r.label, v: [...r.v] }));
  // 사진 바꾸기: 이 폴더에만 저장 (캐릭터 문서·폴더 아이콘은 그대로)
  body.querySelector('.pt-head').addEventListener('click', async (e) => {
    const fb = e.target.closest('[data-face]');
    const pb = e.target.closest('[data-pairimg]');
    if (!fb && !pb) return;
    if (pb) {
      const act = await photoMenu({ title: '페어 대표 이미지', hasOwn: !!d.pairImage, note: '페어틀 가운데에 들어가는 이미지예요. 이 폴더에만 저장되고, 폴더 아이콘은 바뀌지 않아요. 올리지 않으면 폴더 아이콘을 보여줘요.' });
      if (act === 'clear') update(f.id, { pairImage: '' });
      if (act === 'upload') { const ref = await pickPhoto(); if (ref) update(f.id, { pairImage: ref }); }
      if (act) rerender();
      return;
    }
    const j = +fb.dataset.face; const name = cols[j]; const doc = docs[j];
    const own = (d.faces || {})[name];
    const act = await photoMenu({
      title: `${name} 사진`, hasOwn: !!own,
      note: `이 폴더의 페어틀에만 쓰이는 사진이에요. 캐릭터 문서의 사진은 바뀌지 않아요.${doc ? ` 올리지 않으면 '${esc(doc.data.title)}' 캐릭터 문서의 사진을 보여줘요.` : ''}`,
    });
    if (act === 'clear') update(f.id, (dd) => { const faces = { ...(dd.faces || {}) }; delete faces[name]; return { ...dd, faces }; });
    if (act === 'upload') { const ref = await pickPhoto(); if (ref) update(f.id, (dd) => ({ ...dd, faces: { ...(dd.faces || {}), [name]: ref } })); }
    if (act) rerender();
  });
  body.querySelector('.pt-rows').addEventListener('input', (e) => {
    const c = e.target.closest('.pt-cell,.pt-label'); const row = e.target.closest('.pt-row'); if (!c || !row) return;
    const r = rows[+row.dataset.i];
    if (c.dataset.k === 'label') r.label = c.innerText.trim(); else r.v[+c.dataset.j] = c.innerText.trim();
    update(f.id, { pairtle: store() }, { silent: true });
  });
  body.querySelector('.pt-rows').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { rows.splice(+rm.dataset.rm, 1); update(f.id, { pairtle: store() }, { silent: true }); rerender(); }
  });
  body.querySelector('#pt-add').onclick = () => { rows.push({ label: '', v: Array(n).fill('') }); update(f.id, { pairtle: store() }, { silent: true }); rerender(); };
  body.querySelector('#pt-preset').onclick = async () => {
    const name = await modal({
      title: '페어틀 템플릿',
      help: 'folder',
      body: `<div class="preset-list">${Object.entries(PAIRTLE_PRESETS).map(([k, v]) => `<button class="act" data-p="${esc(k)}">${icon('layout-template', 20)}<b>${esc(k)}</b><span>${esc(v.slice(0, 4).join(' · '))} …</span></button>`).join('')}</div><p class="muted small">기존 질문 뒤에 추가돼요.</p>`,
      onOpen: (w, close) => w.querySelector('.preset-list').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) close(b.dataset.p); }),
    });
    if (!name) return;
    PAIRTLE_PRESETS[name].forEach((lb) => rows.push({ label: n === 1 ? lb.replace(/^상대/, '그 사람') : lb, v: Array(n).fill('') }));
    update(f.id, { pairtle: store() }, { silent: true });
    toast('템플릿을 추가했어요', 'ok');
    rerender();
  };
  body.querySelector('#pt-exp').onclick = () => {
    const c = d.color || '#ccc';
    const img = (j) => { const src = faceImg(d, cols[j], docs[j]); return src ? `<img ${imgAttrs(src)} alt="" style="width:${n >= 4 ? 72 : 96}px;height:${n >= 4 ? 72 : 96}px;object-fit:cover;border-radius:50%;margin:0 auto .5em;display:block;">` : ''; };
    const td = (v, extra = '') => `<td style="padding:.7em;text-align:center;border-top:1px solid ${c};word-break:keep-all;${extra}">${esc(v)}</td>`;
    const lab = (v) => td(v, `font-weight:700;font-size:.85em;background:${c}33;`);
    const faceTd = (j) => `<td style="text-align:center;padding:1em .5em;vertical-align:bottom;">${img(j)}<b style="font-size:1.05em">${esc(cols[j])}</b></td>`;
    const iconTd = `<td style="text-align:center;font-size:1.6em;width:${classic ? '22%' : '18%'};">${pairPic(d.pairImage ? 'width:72px;height:72px;object-fit:cover;border-radius:16px;' : 'width:44px;height:44px;object-fit:cover;border-radius:12px;')}</td>`;
    const headRow = classic ? `${faceTd(0)}${iconTd}${faceTd(1)}` : `${iconTd}${cols.map((_, j) => faceTd(j)).join('')}`;
    const html = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr>${headRow}</tr>
      ${rows.map((r) => `<tr>${classic ? `${td(r.v[0])}${lab(r.label)}${td(r.v[1])}` : `${lab(r.label)}${r.v.map((v) => td(v)).join('')}`}</tr>`).join('')}
    </table>`;
    openExport({ title: d.title, subtitle: [membersOf(d).join(' × '), d.desc].filter(Boolean).join(' · '), html });
  };
}
