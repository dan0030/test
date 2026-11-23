// 위키형 캐릭터 프로필 & 세계관 문서
// 문서 엔진: 위키 문서 공방(mnmwiki)의 렌더러/에디터/표 도구 (vendor/nw/*) — 나무위키 형식 출력, 티스토리 붙여넣기 호환
import { all, get, create, update, settings, updateSettings } from '../store.js';
import { icon, esc, TYPES, emptyState, toast, compressImage, pickFile, modal, confirmBox, promptBox, download, safeName, debounce } from '../ui.js';
import { itemCard, folderBadge, folderPicker, bindFolderPicker, bookmarkBtn, bindBookmark, commentsPanel, bindComments, tagInput, bindTags, deleteItem, pageHead, folderFilter } from '../common.js';
import { openColorPopover } from '../colors.js';
import { formDialog } from '../form.js';
import { copyRich, copyText, exportImages } from '../export.js';

const N = () => window.NWR;
const ED = () => window.NWE;
const hrefOf = (it) => `#/${it.type === 'story' ? 's' : it.type === 'plot' ? 'p' : 'w'}/${it.id}`;

// ---------------- 분류 (사용자 커스텀) ----------------
export const catsOf = (type) => settings().data.cats[type] || [];

export async function manageCats(type) {
  const label = TYPES[type].label;
  let list = [...catsOf(type)];
  const draw = (w) => {
    w.querySelector('#cat-list').innerHTML = list.length ? list.map((c, i) => `<div class="cat-row" data-i="${i}">
      ${icon('grip-vertical', 15)}<input class="input" value="${esc(c)}" maxlength="30">
      <button class="icon-btn sm" data-up title="위로">${icon('chevron-up', 14)}</button>
      <button class="icon-btn sm" data-rm title="삭제">${icon('x', 14)}</button></div>`).join('') : '<p class="muted small">분류가 없어요. 아래에서 추가해보세요.</p>';
  };
  const res = await modal({
    title: `${label} 분류 관리`,
    body: `<p class="muted small">${icon('info', 13)} 분류 이름을 바꾸면 그 분류에 속한 문서도 함께 바뀌어요. 삭제해도 문서는 지워지지 않고 '미분류'가 돼요.</p>
      <div id="cat-list" class="cat-list"></div>
      <div class="cat-add"><input class="input" id="cat-new" placeholder="새 분류 이름 (예: 마법 학교, 주연, 악역)" maxlength="30"><button class="btn primary sm" id="cat-add">${icon('plus', 15)}<span>추가</span></button></div>`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, { label: '저장', cls: 'primary', icon: 'check', value: (w) => [...w.querySelectorAll('.cat-row input')].map((x) => x.value.trim()) }],
    onOpen: (w) => {
      draw(w);
      const add = () => { const v = w.querySelector('#cat-new').value.trim(); if (!v) return; if (list.includes(v)) return toast('이미 있는 분류예요'); sync(); list.push(v); w.querySelector('#cat-new').value = ''; draw(w); };
      const sync = () => { list = [...w.querySelectorAll('.cat-row input')].map((x) => x.value.trim()); };
      w.querySelector('#cat-add').onclick = add;
      w.querySelector('#cat-new').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
      w.querySelector('#cat-list').addEventListener('click', (e) => {
        const row = e.target.closest('.cat-row'); if (!row) return;
        sync(); const i = +row.dataset.i;
        if (e.target.closest('[data-rm]')) list.splice(i, 1);
        else if (e.target.closest('[data-up]') && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        else return;
        draw(w);
      });
      w._orig = [...catsOf(type)];
    },
  });
  if (!res) return false;
  const old = catsOf(type);
  const next = res.filter(Boolean);
  // 이름 변경(같은 위치) 반영
  old.forEach((o, i) => {
    const n = res[i];
    if (n && n !== o && !old.includes(n)) all(type).forEach((it) => { if (it.data.category === o) update(it.id, { category: n }, { silent: true }); });
  });
  updateSettings((d) => { d.cats[type] = [...new Set(next)]; });
  toast('분류를 저장했어요', 'ok');
  return true;
}

// ---------------- 문서 모델 ----------------
function blankModel(type, title = '') {
  const m = N().defaults(type === 'character' ? 'profile' : 'plain');
  m.title = esc(title);
  m.theme.accent = '#7b6cf6';
  if (type === 'character') { m.profile.title = esc(title); m.profile.subtitle = ''; }
  return m;
}

// 예전 형식(인포박스 + 본문) 문서를 위키 모델로 변환
function migrate(it) {
  const d = it.data;
  if (d.nw) return d.nw;
  const R = N();
  const m = blankModel(it.type, d.title || '');
  if ((d.infobox || []).length || d.image) {
    m.type = 'profile';
    m.profile.enabled = true;
    m.profile.title = esc(d.title || '');
    m.profile.subtitle = esc(d.subtitle || '');
    m.profile.image = d.image || '';
    const g = R.newGroup('plain');
    g.rows = (d.infobox || []).filter((r) => r.k || r.v).map((r) => R.newRow(esc(r.k), esc(r.v).replace(/\n/g, '<br>')));
    m.profile.groups = [g];
  }
  if (d.body) {
    const box = document.createElement('div');
    box.innerHTML = R.sanitize(d.body);
    const chs = []; let cur = null;
    [...box.childNodes].forEach((n) => {
      if (n.nodeType === 1 && n.tagName === 'H2') { cur = R.newChapter(esc(n.textContent)); cur.body = ''; chs.push(cur); return; }
      if (!cur) { cur = R.newChapter('개요'); cur.body = ''; chs.push(cur); }
      cur.body += n.nodeType === 1 ? n.outerHTML : esc(n.textContent);
    });
    chs.forEach((c) => { if (!c.body.trim()) c.body = '<p><br></p>'; });
    if (chs.length) m.chapters = chs;
  }
  if (d.color) m.theme.accent = d.color;
  return m;
}

function walk(nodes, fn, parent = null) { (nodes || []).forEach((n, i) => { fn(n, nodes, i, parent); walk(n.children, fn, n); }); }

function syncMeta(d, m) {
  const R = N();
  d.title = R.plainText(m.title || '').trim();
  const pfOn = m.type === 'profile' && m.profile && m.profile.enabled !== false;
  d.image = pfOn ? (m.profile.image || '') : '';
  d.subtitle = pfOn ? R.plainText(m.profile.subtitle || '').trim() : '';
  d.color = m.theme?.accent || '';
  const parts = [];
  if (pfOn) (m.profile.groups || []).forEach((g) => { parts.push(R.plainText(g.title || '')); (g.rows || []).forEach((r) => parts.push(`${R.plainText(r.label || '')} ${R.plainText(r.value || '')}`)); });
  walk(m.chapters, (c) => parts.push(R.plainText(c.title || ''), R.plainText(c.body || '')));
  (m.notices || []).forEach((n) => parts.push(R.plainText(n.text || '')));
  d.searchText = parts.join(' ').replace(/\s+/g, ' ').slice(0, 20000);
  // [[링크]] 역링크 계산용 원문 보존
  d.links = [...new Set((JSON.stringify(m).match(/\[\[([^\]<>|]{1,60})/g) || []).map((x) => x.slice(2).trim()))];
}

export function newWiki(type, folderId, title = '') {
  const m = blankModel(type, title);
  const d = { title, folders: folderId ? [folderId] : [], relations: [], category: '' };
  syncMeta(d, m);
  d.nw = m;
  const it = create(type, d);
  location.hash = `#/w/${it.id}/edit`;
}

// ---------------- 목록 ----------------
export function renderList(root, type, q) {
  const t = TYPES[type];
  const f = q.get('f');
  const cat = q.get('c');
  let items = all(type);
  if (f) items = items.filter((i) => (i.data.folders || []).includes(f));
  if (cat === '__none') items = items.filter((i) => !i.data.category || !catsOf(type).includes(i.data.category));
  else if (cat) items = items.filter((i) => i.data.category === cat);
  const cats = catsOf(type);
  const base = `#/list/${type}`;
  const add = `<button class="btn primary" id="new">${icon('plus', 18)} 새 ${t.label} 문서</button>`;
  root.innerHTML = `
    ${pageHead(t.icon, t.label, type === 'character' ? '나무위키처럼 정리하는 캐릭터 프로필. 프로필 표, 접히는 목차·챕터, 각주, 인용구를 지원하고 티스토리에 그대로 붙여넣을 수 있어요.' : '지역·세력·용어 등 세계관 설정을 위키 문서로 모아요. 분류는 직접 만들 수 있어요.', add)}
    ${folderFilter(f)}
    <div class="filter-row">${icon('shapes', 15)}<a class="fchip ${!cat ? 'on' : ''}" href="${base}${f ? `?f=${f}` : ''}">모든 분류</a>${cats.map((c) => `<a class="fchip ${cat === c ? 'on' : ''}" href="${base}?c=${encodeURIComponent(c)}${f ? `&f=${f}` : ''}">${esc(c)}</a>`).join('')}<a class="fchip ${cat === '__none' ? 'on' : ''}" href="${base}?c=__none">미분류</a><button class="fchip add" id="cat-manage">${icon('settings-2', 14)} 분류 관리</button></div>
    ${items.length ? `<div class="grid">${items.map((i) => itemCard(i, { showType: false })).join('')}</div>` : emptyState(t.icon, `아직 ${t.label} 문서가 없어요`, type === 'character' ? '최애의 프로필부터 정리해볼까요?' : '세계관의 첫 설정을 적어보세요.', `<button class="btn primary" id="new2">${icon('plus', 18)} 첫 문서 만들기</button>`)}`;
  root.querySelectorAll('#new,#new2').forEach((b) => (b.onclick = () => newWiki(type, f)));
  root.querySelector('#cat-manage').onclick = async () => { if (await manageCats(type)) renderList(root, type, q); };
}

// ---------------- 보기 ----------------
function linkifyWiki(host) {
  const byTitle = new Map();
  all().forEach((i) => { if (['character', 'world', 'story', 'plot'].includes(i.type) && i.data.title) byTitle.set(i.data.title.trim(), i); });
  const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (tw.nextNode()) if (tw.currentNode.nodeValue.includes('[[')) nodes.push(tw.currentNode);
  nodes.forEach((nd) => {
    if (nd.parentElement.closest('a,summary,style,script')) return;
    const frag = document.createDocumentFragment();
    let last = 0; const s = nd.nodeValue;
    s.replace(/\[\[([^\]<>]{1,60})\]\]/g, (m, inner, idx) => {
      frag.append(s.slice(last, idx));
      const [target, label] = inner.split('|').map((x) => x.trim());
      const it = byTitle.get(target);
      const a = document.createElement('a');
      a.textContent = label || target;
      a.className = it ? 'wlink' : 'wlink red';
      a.href = it ? hrefOf(it) : '#';
      if (!it) { a.dataset.newwiki = target; a.title = '아직 없는 문서 — 눌러서 만들기'; }
      frag.append(a);
      last = idx + m.length;
      return m;
    });
    frag.append(s.slice(last));
    nd.replaceWith(frag);
  });
}

export function renderView(root, id) {
  const it = get(id);
  if (!it || !['character', 'world'].includes(it.type)) { root.innerHTML = emptyState('file-question-mark', '문서를 찾을 수 없어요', '삭제되었거나 다른 기기에서 아직 동기화되지 않았어요.'); return; }
  if (!window.NWR) { root.innerHTML = emptyState('bug', '위키 엔진을 불러오지 못했어요', '새로고침해 주세요.'); return; }
  const d = it.data;
  const t = TYPES[it.type];
  const m = migrate(it);
  const r = N().render(m, { editable: false, docId: `v${it.id.slice(0, 8)}` });
  const backlinks = all().filter((o) => o.id !== it.id && d.title && ((o.data.links || []).includes(d.title) || JSON.stringify(o.data).includes(`[[${d.title}`)));
  const relations = (d.relations || []).map((x) => ({ ...x, it: get(x.id) })).filter((x) => x.it);

  root.innerHTML = `
    <div class="wiki-bar">
      <div class="wb-meta">
        <span class="type-tag">${icon(t.icon, 14)} ${t.label}${d.category ? ` · ${esc(d.category)}` : ''}</span>
        <div class="badges">${(d.folders || []).map(folderBadge).join('')}${(d.tags || []).map((x) => `<span class="chip">#${esc(x)}</span>`).join('')}</div>
      </div>
      <div class="wiki-actions">
        <a class="btn primary sm" href="#/w/${it.id}/edit">${icon('pencil', 16)}<span>편집</span></a>
        ${bookmarkBtn(it)}
        <button class="btn ghost sm" id="exp">${icon('share', 16)}<span>내보내기</span></button>
        <button class="btn ghost sm danger" id="del" title="삭제">${icon('trash', 16)}</button>
      </div>
    </div>
    <div class="nw-paper"><div class="nw-view" style="${esc(N().docStyle(m))}"><style>${N().enhanceCss('.nw-view')}</style>${r.html}</div></div>
    ${relations.length ? `<h2 class="rel-h">${icon('users', 18)} 관계</h2><div class="relations">${relations.map((x) => `<a class="rel" href="#/w/${x.it.id}">${x.it.data.image ? `<img src="${esc(x.it.data.image)}" alt="">` : `<span class="rel-ph">${icon('user', 20)}</span>`}<div><b>${esc(x.it.data.title)}</b><span>${esc(x.label || '')}</span></div></a>`).join('')}</div>` : ''}
    ${backlinks.length ? `<div class="backlinks">${icon('link-2', 15)} <span>이 문서를 언급한 문서: ${backlinks.map((b) => `<a href="${hrefOf(b)}">${esc(b.data.title)}</a>`).join(', ')}</span></div>` : ''}
    ${commentsPanel(it)}`;
  const host = root.querySelector('.nw-view');
  linkifyWiki(host);
  try { N().placePopups(host); } catch { /* 선택적 향상 */ }
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-newwiki]');
    if (a) { e.preventDefault(); newWiki(it.type === 'world' ? 'world' : 'character', (d.folders || [])[0], a.dataset.newwiki); return; }
    const toc = e.target.closest('.nw-toc a[href^="#"]');
    if (toc) { e.preventDefault(); const target = host.querySelector(toc.getAttribute('href')); if (target) { target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  });
  bindBookmark(root, it);
  bindComments(root, it, () => renderView(root, id));
  root.querySelector('#del').onclick = () => deleteItem(it, `#/list/${it.type}`);
  root.querySelector('#exp').onclick = () => openWikiExport(it, m);
}

// ---------------- 내보내기 ----------------
async function openWikiExport(it, m) {
  const R = N();
  const name = R.plainText(m.title) || '위키 문서';
  await modal({
    title: '위키 문서 내보내기',
    wide: true,
    body: `
      <div class="seg" id="wx-mode"><button class="on" data-v="frag">${icon('clipboard-copy', 15)} 티스토리 붙여넣기용</button><button data-v="page">${icon('file-code', 15)} 단독 HTML 파일</button><button data-v="png">${icon('image-down', 15)} 이미지</button></div>
      <div id="wx-frag">
        <label class="check"><input type="checkbox" id="wx-style" checked><span>&lt;style&gt; 포함 (접기 화살표·스포일러·모바일 대응)</span></label>
        <label class="check"><input type="checkbox" id="wx-script" checked><span>각주 팝업 위치 보정 스크립트 포함</span></label>
        <textarea class="input code" id="wx-code" rows="9" readonly spellcheck="false"></textarea>
        <p class="muted small">${icon('info', 13)} 티스토리 글쓰기 화면 오른쪽 위 <b>기본모드 → HTML</b>로 바꾼 뒤 붙여넣으세요. 모든 스타일이 인라인으로 들어가 있어 &lt;style&gt;이 지워지는 편집기에서도 모양이 유지돼요.</p>
      </div>
      <div id="wx-png" hidden><p class="muted small">접힌 챕터를 모두 펼친 상태로 이미지를 만들어요. 긴 문서는 여러 장으로 나눌 수 있어요.</p>
        <select class="input" id="wx-split"><option value="0">한 장으로</option><option value="1600">약 1600px씩 나누기</option><option value="2400">약 2400px씩 나누기</option></select></div>
      <div class="btn-row"><button class="btn primary" id="wx-go">${icon('download', 16)}<span>복사 / 저장</span></button></div>`,
    onOpen: (w) => {
      let mode = 'frag';
      const code = () => R.exportFragment(m, { docId: `x${it.id.slice(0, 6)}`, styleTag: w.querySelector('#wx-style').checked, script: w.querySelector('#wx-script').checked }).html;
      const draw = () => {
        w.querySelector('#wx-frag').hidden = mode === 'png';
        w.querySelector('#wx-png').hidden = mode !== 'png';
        w.querySelectorAll('#wx-style,#wx-script').forEach((x) => { x.closest('label').hidden = mode === 'page'; });
        if (mode !== 'png') w.querySelector('#wx-code').value = mode === 'frag' ? code() : R.exportPage(m, { docId: `x${it.id.slice(0, 6)}` });
      };
      w.querySelector('#wx-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; mode = b.dataset.v; w.querySelectorAll('#wx-mode button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
      w.querySelectorAll('#wx-style,#wx-script').forEach((x) => x.addEventListener('change', draw));
      draw();
      w.querySelector('#wx-go').onclick = async () => {
        if (mode === 'frag') { toast((await copyText(code())) ? 'HTML 코드를 복사했어요. 티스토리 HTML 모드에 붙여넣으세요!' : '복사에 실패했어요', 'ok'); }
        if (mode === 'page') download(`${safeName(name)}.html`, R.exportPage(m, { docId: `x${it.id.slice(0, 6)}` }), 'text/html');
        if (mode === 'png') {
          const open = JSON.parse(JSON.stringify(m));
          walk(open.chapters, (c) => { c.collapsed = false; });
          const r = R.render(open, { editable: false, docId: 'img' });
          const html = `<div style="${R.docStyle(open)};background:#fff;width:900px;">${r.html}</div>`;
          toast('이미지를 만드는 중…');
          const n = await exportImages(html, name, { width: 900, split: +w.querySelector('#wx-split').value });
          if (n) toast(`${n}장의 이미지를 저장했어요`, 'ok');
        }
      };
    },
  });
}

// ---------------- 편집 (위키 문서 공방 방식) ----------------
const TB = (a, ic, label, text = '') => `<button type="button" class="tb" data-a="${a}" title="${label}" aria-label="${label}">${icon(ic, 17)}${text ? `<span>${text}</span>` : ''}</button>`;

export function renderEdit(root, id) {
  const it = get(id);
  if (!it || !['character', 'world'].includes(it.type)) { root.innerHTML = emptyState('file-question-mark', '문서를 찾을 수 없어요', ''); return; }
  if (!window.NWR || !window.NWE) { root.innerHTML = emptyState('bug', '위키 엔진을 불러오지 못했어요', '새로고침해 주세요.'); return; }
  const R = N(); const E = ED();
  const t = TYPES[it.type];
  const model = migrate(it);
  if (!it.data.nw) update(it.id, (d) => { d.nw = model; syncMeta(d, model); return d; }, { silent: true });
  const docId = `e${it.id.slice(0, 6)}`;
  let tab = 'struct';

  root.innerHTML = `
    <div class="edit-head">
      <a class="btn ghost sm" href="#/w/${it.id}">${icon('eye', 16)}<span>보기</span></a>
      <span class="type-tag">${icon(t.icon, 14)} ${t.label} 편집</span>
      <span class="grow"></span>
      <button class="btn ghost sm show-m" id="side-toggle">${icon('panel-left', 16)}<span>설정</span></button>
      <span class="muted small hide-m">문서를 눌러 바로 써요 · 자동 저장</span>
    </div>
    <div class="nw-fbar" role="toolbar" aria-label="위키 서식 도구">
      <div class="tb-group">${TB('undo', 'undo-2', '되돌리기')}${TB('redo', 'redo-2', '다시 실행')}</div>
      <div class="tb-group">${TB('bold', 'bold', '굵게')}${TB('italic', 'italic', '기울임')}${TB('underline', 'underline', '밑줄')}${TB('strike', 'strikethrough', '취소선')}${TB('sup', 'superscript', '위 첨자')}${TB('sub', 'subscript', '아래 첨자')}</div>
      <div class="tb-group">${TB('color', 'baseline', '글자 색')}${TB('bg', 'highlighter', '글자 배경')}
        <select class="tb-select" data-sel="size" title="글자 크기" aria-label="글자 크기"><option value="">크기</option>${[12, 13, 14, 15, 16, 18, 20, 24, 28, 32].map((n) => `<option value="${n}">${n}px</option>`).join('')}</select></div>
      <div class="tb-group">${TB('ul', 'list', '글머리 목록')}${TB('ol', 'list-ordered', '번호 목록')}${TB('left', 'text-align-start', '왼쪽 정렬')}${TB('center', 'text-align-center', '가운데 정렬')}${TB('right', 'text-align-end', '오른쪽 정렬')}</div>
      <div class="tb-group">${TB('link', 'link', '링크')}${TB('wikilink', 'book-marked', '문서 링크 [[ ]]')}${TB('image', 'image', '사진')}${TB('table', 'table', '표')}</div>
      <div class="tb-group">${TB('quote', 'quote', '인용구', '인용')}${TB('notice', 'triangle-exclamation-point', '경고·안내 문구', '경고문')}${TB('fn', 'superscript', '각주', '각주')}${TB('spoiler', 'eye-off', '스포일러 가리기', '스포')}${TB('hr', 'minus', '구분선')}</div>
      <div class="tb-group">${TB('clear', 'remove-formatting', '서식 지우기')}</div>
    </div>
    <div class="nw-tbar" id="nw-tbar" hidden>
      <span class="muted small">${icon('table', 14)} 표 편집</span>
      ${[['row+', '행 추가'], ['row-', '행 삭제'], ['col+', '열 추가'], ['col-', '열 삭제'], ['head', '제목 행'], ['bg', '칸 배경'], ['merge', '셀 병합'], ['split', '병합 해제'], ['del', '표 삭제']].map(([k, n]) => `<button type="button" class="btn ghost sm ${k === 'del' ? 'danger' : ''}" data-tbl="${k}">${n}</button>`).join('')}
      <span class="muted small hide-m">Shift+클릭으로 여러 칸 선택</span>
    </div>
    <div class="studio">
      <aside class="st-side" id="st-side">
        <div class="seg full st-tabs">${[['struct', 'list-tree', '구조'], ['profile', 'id-card', '프로필'], ['design', 'palette', '디자인'], ['meta', 'folder-heart', '문서']].map(([k, ic, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${icon(ic, 14)}<span>${n}</span></button>`).join('')}</div>
        <div class="st-body" id="st-body"></div>
      </aside>
      <div class="st-canvas"><div class="nw-paper"><div id="nwdoc" class="nw-edit-doc"></div></div></div>
    </div>`;

  const elDoc = root.querySelector('#nwdoc');
  const side = root.querySelector('#st-body');

  // ----- 저장 -----
  let timer = null;
  const commit = () => { clearTimeout(timer); update(it.id, (d) => { d.nw = model; syncMeta(d, model); return d; }, { silent: true }); };
  const save = () => { clearTimeout(timer); timer = setTimeout(commit, 350); };

  // ----- 문서 ↔ 모델 -----
  const findChapter = (cid) => { let f = null; walk(model.chapters, (n, arr, i, parent) => { if (n.id === cid) f = { node: n, arr, index: i, parent }; }); return f; };
  const findGroup = (gid) => (model.profile.groups || []).find((g) => g.id === gid);
  const findRow = (rid) => { let f = null; (model.profile.groups || []).forEach((g) => (g.rows || []).forEach((r) => { if (r.id === rid) f = r; })); return f; };

  const cleanEditable = (el) => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('[data-nw=fn]').forEach((fn) => { fn.innerHTML = '[*]'; fn.removeAttribute('class'); fn.removeAttribute('style'); fn.removeAttribute('contenteditable'); });
    copy.querySelectorAll('.nw-cell-selected').forEach((c) => { c.classList.remove('nw-cell-selected'); if (!c.className) c.removeAttribute('class'); });
    return copy.innerHTML;
  };

  const refreshToc = () => {
    const box = elDoc.querySelector('.nw-toc');
    if (!box) return;
    const w = document.createElement('div'); w.innerHTML = R.tocHtml(model, docId);
    if (w.firstElementChild) box.replaceWith(w.firstElementChild);
  };

  function pull(el) {
    const ch = el.getAttribute('data-ch');
    if (el.classList.contains('nw-doc-title')) {
      const prev = model.title;
      model.title = cleanEditable(el);
      // 프로필 표 제목이 비었거나 문서 제목과 같았다면 함께 바꿔줌
      if (model.profile && (!R.plainText(model.profile.title || '').trim() || model.profile.title === prev)) {
        model.profile.title = model.title;
        const sp = elDoc.querySelector('[data-pf="title"]');
        if (sp && document.activeElement !== sp) sp.innerHTML = model.title;
      }
      save(); return;
    }
    if (el.classList.contains('nw-ch-title') && ch) { const c = findChapter(ch); if (c) { c.node.title = cleanEditable(el); refreshToc(); if (tab === 'struct') drawSide(); save(); } return; }
    if (el.classList.contains('nw-body') && ch) { const c = findChapter(ch); if (c) { c.node.body = cleanEditable(el); save(); } return; }
    const pf = el.getAttribute('data-pf');
    if (pf === 'title' || pf === 'subtitle' || pf === 'imageCaption') { model.profile[pf] = cleanEditable(el); save(); return; }
    if (pf === 'gtitle') { const g = findGroup(el.getAttribute('data-group')); if (g) { g.title = cleanEditable(el); save(); } return; }
    if (pf === 'label' || pf === 'value') { const row = findRow(el.getAttribute('data-row')); if (row) { row[pf] = cleanEditable(el); if (tab === 'profile' && pf === 'label') drawSide(); save(); } return; }
    const nid = el.getAttribute('data-notice');
    if (nid) { const n = (model.notices || []).find((x) => x.id === nid); if (n) { n.text = cleanEditable(el); save(); } }
  }

  function renumber() {
    let n = 0; const named = {};
    const accent = R.resolveTheme(model).accent;
    elDoc.querySelectorAll('[data-nw=fn]').forEach((el) => {
      const name = (el.getAttribute('data-name') || '').trim();
      let label;
      if (name) { if (!named[name]) named[name] = ++n; label = name; } else label = String(++n);
      el.className = 'nw-fnwrap';
      el.setAttribute('contenteditable', 'false');
      el.removeAttribute('title');
      el.setAttribute('style', `display:inline-block;font-size:.78em;line-height:1;vertical-align:super;font-weight:600;color:${el.closest('.nw-profile') ? 'inherit' : accent};cursor:pointer;`);
      el.innerHTML = `<span class="nw-fnlabel" style="line-height:1;">[${R.esc(label)}]</span>${R.footnotePopup(R.styleNote(el.getAttribute('data-note') || '', model))}`;
    });
  }

  function rerender() {
    const r = R.render(model, { editable: true, docId });
    elDoc.setAttribute('style', R.docStyle(model));
    elDoc.innerHTML = `<style>${R.enhanceCss('#nwdoc')}</style>${r.html}`;
    elDoc.querySelectorAll('[contenteditable=true]').forEach((el) => {
      el.addEventListener('input', () => pull(el));
      el.addEventListener('blur', () => pull(el));
      if (el.classList.contains('nw-doc-title') || el.classList.contains('nw-ch-title') || el.classList.contains('nw-pf-head')) el.setAttribute('data-single', '1');
    });
    elDoc.querySelectorAll('.nw-edit-fold').forEach((b) => b.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const c = findChapter(b.getAttribute('data-ch')); if (!c) return;
      c.node.collapsed = !c.node.collapsed; b.textContent = c.node.collapsed ? '접힘' : '펼침'; save();
    }));
    elDoc.querySelectorAll('.nw-cats span').forEach((sp) => { if (/^\(왼쪽 설정/.test(sp.textContent)) sp.textContent = "(설정 → '문서' 탭의 위키 분류 표시에서 추가)"; });
    renumber();
    drawSide();
    save();
  }

  const syncActive = () => { const h = E.activeHost(); if (h) pull(h); renumber(); };
  const syncBlocks = () => {
    const h = E.activeHost(); const chId = h && h.getAttribute ? h.getAttribute('data-ch') : null;
    syncActive(); E.clearSelection(); rerender();
    if (chId) { const el = elDoc.querySelector(`.nw-body[data-ch="${chId}"]`); if (el) { el.focus(); const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); E.saveSelection(); } }
  };

  E.attach(elDoc, () => {});
  if (window.NWTables) window.NWTables.init({ root: elDoc, onChange: (h) => { if (h) pull(h); renumber(); }, onToast: (m) => toast(m) });

  // ----- 서식 도구 -----
  const bar = root.querySelector('.nw-fbar');
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('change', (e) => {
    if (e.target.dataset.sel === 'size' && e.target.value) { E.fontSize(`${e.target.value}px`); syncActive(); e.target.value = ''; }
  });
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    E.saveSelection();
    const needHost = !['wikilink'].includes(a);
    if (needHost && !E.activeHost() && !['undo', 'redo'].includes(a)) return toast('먼저 문서 본문을 눌러 커서를 두세요');
    switch (a) {
      case 'undo': case 'redo': if (E.restoreSelection()) { document.execCommand(a); syncActive(); } return;
      case 'bold': case 'italic': case 'underline': case 'strike': case 'sup': case 'sub': case 'ul': case 'ol': case 'left': case 'center': case 'right': case 'clear':
        E.format(a); syncActive(); return;
      case 'color': return openColorPopover(b, null, (c) => { E.color(c); syncActive(); });
      case 'bg': return openColorPopover(b, null, (c) => { E.background(c === 'transparent' ? 'transparent' : c); syncActive(); }, { transparent: true, presets: ['#fff3bf', '#ffd1dc', '#d7f5c9', '#cde9ff', '#e6dcff', '#ffd9b8', '#eeeeee', '#15171a'] });
      case 'link': {
        const snap = E.snapshot();
        const v = await formDialog({ title: '링크 넣기', fields: [{ key: 'url', label: '주소', placeholder: 'https://' }, { key: 'text', label: '보일 글자', value: E.selectedText(), placeholder: '비우면 주소가 보여요' }] });
        E.restore(snap);
        if (!v) return;
        const u = R.safeUrl(v.url); if (!u) return toast('주소를 확인해주세요', 'error');
        E.insertHtml(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(v.text || v.url)}</a>`); syncActive(); return;
      }
      case 'wikilink': {
        const snap = E.snapshot();
        const docs = all().filter((o) => ['character', 'world', 'story', 'plot'].includes(o.type) && o.id !== it.id && o.data.title);
        const v = await formDialog({ title: '문서 링크 [[ ]] 넣기', fields: [
          { key: 'pick', label: '기존 문서에서 고르기', type: 'select', value: '', options: [['', '— 직접 입력 —'], ...docs.map((o) => [o.data.title, `${TYPES[o.type]?.label || ''} · ${o.data.title}`])] },
          { key: 'name', label: '또는 문서 이름 직접 입력', placeholder: '아직 없는 문서면 빨간 링크가 돼요' },
          { key: 'label', label: '보일 이름 (선택)', placeholder: '비우면 문서 이름' }] });
        E.restore(snap);
        if (!v) return;
        const name = (v.pick || v.name || '').trim(); if (!name) return;
        if (!E.activeHost()) return toast('본문에 커서를 두고 다시 시도하세요');
        E.insertHtml(esc(`[[${name}${v.label ? `|${v.label}` : ''}]]`)); syncActive(); return;
      }
      case 'image': return figureDialog(E.closest('[data-nw=figure]'));
      case 'table': {
        if (E.closest('table')) return toast('표 안에서는 위의 표 편집 도구를 쓰세요');
        const snap = E.snapshot();
        const v = await formDialog({ title: '표 넣기', fields: [{ key: 'rows', label: '행 수', type: 'number', value: 3 }, { key: 'cols', label: '열 수', type: 'number', value: 2 }, { key: 'head', label: '첫 행을 제목 행으로', type: 'checkbox', value: true }] });
        E.restore(snap);
        if (!v) return;
        const rows = Math.max(1, Math.min(30, +v.rows || 3)); const cols = Math.max(1, Math.min(12, +v.cols || 2));
        let h = '<table><tbody>';
        for (let r = 0; r < rows; r++) { h += '<tr>'; for (let c = 0; c < cols; c++) h += v.head && r === 0 ? '<th>제목</th>' : '<td>내용</td>'; h += '</tr>'; }
        E.insertBlock(`${h}</tbody></table>`); syncBlocks(); return;
      }
      case 'quote': return quoteDialog();
      case 'notice': return noticeDialog();
      case 'fn': {
        const snap = E.snapshot();
        const v = await formDialog({ title: '각주 넣기', fields: [{ key: 'note', label: '각주 내용', type: 'textarea', rows: 3 }, { key: 'name', label: '각주 이름 (선택)', placeholder: '같은 이름끼리 하나로 묶여요', hint: '넣은 뒤 각주 번호를 누르면 다시 고칠 수 있어요.' }] });
        E.restore(snap);
        if (!v || !v.note.trim()) return;
        E.insertHtml(`<sup data-nw="fn" data-note="${esc(v.note).replace(/\n/g, '<br>')}"${v.name ? ` data-name="${esc(v.name)}"` : ''}>[*]</sup>&#8203;`); syncActive(); return;
      }
      case 'spoiler': {
        if (!E.selectedText()) return toast('가릴 글자를 먼저 드래그해서 선택하세요');
        const el = E.wrapSelection('span', { 'data-nw': 'spoiler', style: 'background:#15171a;color:#15171a;border-radius:3px;padding:0 .2em;' });
        if (el) syncActive(); return;
      }
      case 'hr': E.insertBlock('<hr>'); syncBlocks(); return;
      default:
    }
  });

  async function figureDialog(cur) {
    const snap = E.snapshot();
    const img = cur && cur.querySelector('img'); const cap = cur && cur.querySelector('[data-nw=fcap]');
    const v = await formDialog({
      title: cur ? '사진 편집' : '사진 넣기', okText: cur ? '적용' : '넣기', danger: cur ? '사진 삭제' : null,
      fields: [
        { key: 'src', label: '이미지', type: 'image', value: img ? img.getAttribute('src') : '' },
        { key: 'w', label: '가로 크기', value: cur ? (cur.getAttribute('data-w') || '') : '', placeholder: '예: 420 또는 60% (비우면 원본)' },
        { key: 'align', label: '정렬', type: 'select', value: cur ? (cur.getAttribute('data-align') || 'center') : 'center', options: [['center', '가운데'], ['left', '왼쪽'], ['right', '오른쪽']] },
        { key: 'cap', label: '사진 설명', value: cap ? cap.textContent : '', placeholder: '비워도 돼요' },
      ],
    });
    E.restore(snap);
    if (!v) return;
    if (v.__delete && cur) { cur.remove(); syncBlocks(); return; }
    const src = R.safeUrl(v.src); if (!src) return toast('이미지를 확인해주세요', 'error');
    const w = String(v.w || '').trim(); if (w && !/^[0-9.]+%?$/.test(w)) return toast('가로 크기는 숫자(px) 또는 %로 입력하세요', 'error');
    const html = `<div data-nw="figure" data-w="${esc(w)}" data-align="${esc(v.align || 'center')}"><img src="${esc(src)}" alt="${esc(v.cap || '이미지')}">${v.cap ? `<span data-nw="fcap">${esc(v.cap)}</span>` : ''}</div>`;
    if (cur) E.replaceBlock(cur, html); else if (!E.insertBlock(html)) return toast('본문에 커서를 두고 다시 시도하세요');
    syncBlocks();
  }

  async function quoteDialog() {
    const cur = E.closest('[data-nw=quote]');
    const body = cur && cur.querySelector('[data-nw=qbody]'); const cite = cur && cur.querySelector('[data-nw=qcite]');
    const text = () => { if (!body) return E.selectedText(); const dd = body.cloneNode(true); dd.querySelector('[data-nw=qcite]')?.remove(); return dd.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim(); };
    const snap = E.snapshot();
    const v = await formDialog({
      title: cur ? '인용구 편집' : '인용구 넣기', okText: cur ? '적용' : '넣기',
      fields: [
        { key: 'text', label: '인용할 내용', type: 'textarea', rows: 3, value: text() },
        { key: 'cite', label: '출처', value: cite ? cite.textContent.replace(/^—\s*/, '') : '', placeholder: '비워도 돼요' },
        { key: 'fit', label: '상자 폭', type: 'select', value: (cur && cur.getAttribute('data-fit')) || 'full', options: [['full', '본문 전체 폭'], ['content', '내용에 맞춤']] },
        { key: 'accent', label: '강조 막대 색', type: 'color', value: cur?.getAttribute('data-accent') || '' },
        { key: 'bg', label: '배경색', type: 'color', value: cur?.getAttribute('data-bg') || '' },
        { key: 'fg', label: '글자색', type: 'color', value: cur?.getAttribute('data-fg') || '' },
      ],
    });
    E.restore(snap);
    if (!v) return;
    const inner = String(v.text || '').split('\n').filter((x) => x.trim()).map(esc).join('<br>') || '인용할 내용';
    const html = `<div data-nw="quote" data-fit="${esc(v.fit)}" data-accent="${esc(v.accent)}" data-bg="${esc(v.bg)}" data-fg="${esc(v.fg)}" data-border=""><span data-nw="qbar"></span><div data-nw="qbody">${inner}${v.cite ? `<span data-nw="qcite">— ${esc(v.cite)}</span>` : ''}</div></div>`;
    if (cur) E.replaceBlock(cur, html); else E.insertBlock(html);
    syncBlocks();
  }

  const ICONS = Object.entries(R.MI).map(([k, x]) => [`mi:${k}`, x.label]);
  async function noticeDialog() {
    const cur = E.closest('[data-nw=notice]');
    const tx = cur && cur.querySelector('[data-nw=ntext]');
    const P = R.NOTICE_PRESETS;
    const snap = E.snapshot();
    const v = await formDialog({
      title: cur ? '경고 문구 편집' : '경고 · 안내 문구 넣기', okText: cur ? '적용' : '넣기',
      fields: [
        { key: 'preset', label: '자주 쓰는 문구', type: 'select', value: '', options: [['', '직접 입력'], ['pc', 'PC 열람 권장'], ['spoiler', '스포일러 주의'], ['trigger', '트리거 워닝'], ['info', '일반 안내']] },
        { key: 'icon', label: '아이콘', type: 'select', value: cur?.getAttribute('data-icon') || 'mi:warning', options: ICONS },
        { key: 'text', label: '문구', type: 'textarea', rows: 2, value: tx ? tx.textContent : P.spoiler.text },
        { key: 'accent', label: '강조 색', type: 'color', value: cur?.getAttribute('data-accent') || P.spoiler.color, auto: false },
      ],
    });
    E.restore(snap);
    if (!v) return;
    let ic = v.icon; let accent = v.accent || P.spoiler.color; let text = v.text;
    if (v.preset && P[v.preset]) { const pr = P[v.preset]; if (!text || text === P.spoiler.text) text = pr.text; ic = pr.icon; accent = pr.color; }
    const html = `<div data-nw="notice" data-icon="${esc(ic)}" data-accent="${esc(accent)}" data-bg="" data-fg="" data-border=""><span data-nw="nicon">${R.iconHtml(ic)}</span><span data-nw="ntext">${esc(text).replace(/\n/g, '<br>')}</span></div>`;
    if (cur) E.replaceBlock(cur, html); else E.insertBlock(html);
    syncBlocks();
  }

  async function editFootnote(el) {
    const snap = E.snapshot();
    const v = await formDialog({ title: '각주 편집', okText: '적용', danger: '각주 삭제', fields: [{ key: 'note', label: '각주 내용', type: 'textarea', rows: 3, value: (el.getAttribute('data-note') || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '') }, { key: 'name', label: '각주 이름', value: el.getAttribute('data-name') || '' }] });
    E.restore(snap);
    if (!v) return;
    const host = el.closest('[contenteditable=true]');
    if (v.__delete) el.remove();
    else { el.setAttribute('data-note', esc(v.note).replace(/\n/g, '<br>')); if (v.name) el.setAttribute('data-name', v.name); else el.removeAttribute('data-name'); }
    if (host) pull(host);
    renumber();
  }

  elDoc.addEventListener('click', (ev) => {
    const fn = ev.target.closest('[data-nw=fn]');
    if (fn) { ev.preventDefault(); editFootnote(fn); return; }
    const fig = ev.target.closest('[data-nw=figure]');
    if (fig) { ev.preventDefault(); figureDialog(fig); }
  });

  // 표 편집 도구 표시
  const tbar = root.querySelector('#nw-tbar');
  const onSel = () => {
    const s = window.getSelection();
    if (!s.rangeCount) return;
    const n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    const tb = n && n.closest && n.closest('table');
    tbar.hidden = !(tb && elDoc.contains(tb) && !tb.closest('.nw-profile'));
  };
  document.addEventListener('selectionchange', onSel);
  tbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  tbar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tbl]'); if (!b) return;
    const op = b.dataset.tbl;
    const td = E.closest('td,th'); const tb = E.closest('table');
    if (!tb || !td) return toast('표 안에 커서를 두세요');
    if (window.NWTables && window.NWTables.command(op, td)) return;
    const tr = td.parentNode;
    if (op === 'head') {
      const isHead = td.tagName === 'TH';
      [...tr.children].forEach((c) => { const n = document.createElement(isHead ? 'td' : 'th'); n.innerHTML = c.innerHTML; ['rowspan', 'colspan', 'style'].forEach((x) => { if (c.hasAttribute(x)) n.setAttribute(x, c.getAttribute(x)); }); c.replaceWith(n); });
    } else if (op === 'bg') {
      return openColorPopover(b, td.style.background, (c) => { if (c && c !== 'transparent') td.style.background = c; else td.style.removeProperty('background'); syncActive(); }, { auto: true });
    } else if (op === 'del') {
      if (!(await confirmBox('이 표를 삭제할까요?', '삭제', true))) return;
      tb.remove(); syncBlocks(); return;
    }
    syncActive();
  });

  // ----- 사이드 패널 -----
  root.querySelector('.st-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    root.querySelectorAll('.st-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    drawSide();
  });
  root.querySelector('#side-toggle').onclick = () => root.querySelector('#st-side').classList.toggle('open');

  const plain = (h) => R.plainText(h || '').trim();
  const colorBtn = (path, label, value) => `<div class="cf-row"><span>${esc(label)}</span><button type="button" class="color-btn sm" data-path="${path}"><span class="cb-sw" style="background:${value || 'transparent'}"></span><span class="cb-t">${value || '자동'}</span></button></div>`;
  const getPath = (path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), model);
  const setPath = (path, v) => { const ks = path.split('.'); const last = ks.pop(); const o = ks.reduce((a, k) => { if (!a[k]) a[k] = {}; return a[k]; }, model); o[last] = v; };

  function drawSide() {
    if (tab === 'struct') {
      const rows = [];
      walk(model.chapters, (c) => { let depth = 0; let p = findChapter(c.id).parent; while (p) { depth++; p = findChapter(p.id)?.parent; } rows.push({ c, depth }); });
      side.innerHTML = `
        <p class="muted small">${icon('info', 13)} 챕터 제목과 본문은 오른쪽 문서에서 바로 고쳐요. 여기서는 순서·단계·접힘을 정해요.</p>
        <div class="tree">${rows.map(({ c, depth }) => `<div class="tree-row" data-id="${c.id}" style="padding-left:${6 + depth * 16}px">
          <button class="tr-title" data-go>${esc(plain(c.title) || '(제목 없음)')}</button>
          <span class="tr-btns">
            <button class="icon-btn sm" data-op="up" title="위로">${icon('chevron-up', 14)}</button>
            <button class="icon-btn sm" data-op="down" title="아래로">${icon('chevron-down', 14)}</button>
            <button class="icon-btn sm" data-op="out" title="한 단계 위로 (상위 챕터로)">${icon('arrow-left', 14)}</button>
            <button class="icon-btn sm" data-op="in" title="한 단계 아래로 (하위 챕터로)">${icon('arrow-right', 14)}</button>
            <button class="icon-btn sm" data-op="child" title="하위 챕터 추가">${icon('plus', 14)}</button>
            <button class="icon-btn sm ${c.collapsed ? 'on' : ''}" data-op="fold" title="보기 화면에서 처음에 접어두기">${icon(c.collapsed ? 'chevrons-down-up' : 'chevrons-up-down', 14)}</button>
            <button class="icon-btn sm" data-op="del" title="삭제">${icon('x', 14)}</button>
          </span></div>`).join('')}</div>
        <button class="btn ghost sm" data-op="add">${icon('plus', 14)} 챕터 추가</button>`;
      return;
    }
    if (tab === 'profile') {
      const pf = model.profile || (model.profile = { enabled: false, groups: [] });
      const on = model.type === 'profile' && pf.enabled !== false;
      const P = model.theme.profile || {};
      side.innerHTML = `
        <label class="check"><input type="checkbox" id="pf-on" ${on ? 'checked' : ''}><span>프로필 표 사용</span></label>
        ${on ? `
        <div class="panel">
          <h4>${icon('image', 15)} 프로필 이미지</h4>
          <div class="img-drop sm" id="pf-img">${pf.image ? `<img src="${esc(pf.image)}" alt="">` : `${icon('image-plus', 24)}<span>눌러서 올리기</span>`}</div>
          <div class="btn-row"><button class="btn ghost sm" id="pf-url">${icon('link', 14)} 주소로 넣기</button>${pf.image ? `<button class="btn ghost sm danger" id="pf-del">${icon('trash', 14)} 삭제</button>` : ''}</div>
          ${pf.image ? `<label class="lbl">사진 설명</label><input class="input" id="pf-cap" value="${esc(plain(pf.imageCaption))}" placeholder="비워도 돼요">` : ''}
        </div>
        <div class="panel">
          <h4>${icon('layout-panel-left', 15)} 표 배치</h4>
          <div class="seg full" id="pf-align">${[['right', '오른쪽'], ['left', '왼쪽'], ['full', '전체 폭']].map(([k, n]) => `<button data-v="${k}" class="${(P.align || 'right') === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <label class="lbl"><span>표 너비</span><b id="pf-wv">${P.width || 400}px</b></label><input type="range" min="240" max="640" step="10" id="pf-w" value="${P.width || 400}">
        </div>
        <div class="panel">
          <h4>${icon('table-properties', 15)} 항목 구성</h4>
          <p class="muted small">항목 이름과 내용은 문서의 표에서 바로 고쳐요.</p>
          ${(pf.groups || []).map((g, gi) => `<div class="pg" data-g="${g.id}">
            <div class="pg-head">
              <select class="input sm" data-gk>${[['plain', '기본'], ['head', '소제목 있음'], ['fold', '접기 묶음']].map(([k, n]) => `<option value="${k}" ${g.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
              ${g.kind !== 'plain' ? `<input class="input sm" data-gt value="${esc(plain(g.title))}" placeholder="묶음 제목">` : '<span class="grow"></span>'}
              <button class="icon-btn sm" data-gup title="위로" ${gi === 0 ? 'disabled' : ''}>${icon('chevron-up', 14)}</button>
              <button class="icon-btn sm" data-gdel title="묶음 삭제">${icon('x', 14)}</button>
            </div>
            ${(g.rows || []).map((r) => `<div class="pr" data-r="${r.id}"><span class="pr-l">${esc(r.full ? `(전체 칸) ${plain(r.value).slice(0, 14)}` : plain(r.label) || '(항목)')}</span>
              <button class="icon-btn sm" data-rup title="위로">${icon('chevron-up', 13)}</button>
              <button class="icon-btn sm ${r.full ? 'on' : ''}" data-rfull title="항목 이름 없이 한 칸으로">${icon('rectangle-horizontal', 13)}</button>
              <button class="icon-btn sm" data-rdel title="삭제">${icon('x', 13)}</button></div>`).join('')}
            <button class="link small" data-radd>${icon('plus', 13)} 항목 추가</button>
          </div>`).join('')}
          <button class="btn ghost sm" id="pg-add">${icon('plus', 14)} 묶음 추가</button>
        </div>` : '<p class="muted small">세계관 문서처럼 프로필 표가 필요 없는 문서는 꺼두세요.</p>'}`;
      return;
    }
    if (tab === 'design') {
      const T = model.theme;
      side.innerHTML = `
        <div class="panel"><h4>${icon('palette', 15)} 대표 색</h4>
          ${colorBtn('theme.accent', '대표 색 (번호·링크·목차)', T.accent)}
          <p class="muted small">나머지 색은 '자동'으로 두면 대표 색에 맞춰 만들어져요.</p></div>
        <div class="panel"><h4>${icon('heading', 15)} 챕터 제목</h4>
          ${colorBtn('theme.heading.num', '번호 색', T.heading?.num)}${colorBtn('theme.heading.text', '글자 색', T.heading?.text)}${colorBtn('theme.heading.line', '밑줄 색', T.heading?.line)}</div>
        <div class="panel"><h4>${icon('id-card', 15)} 프로필 표</h4>
          ${colorBtn('theme.profile.headBg', '머리 배경', T.profile?.headBg)}${colorBtn('theme.profile.headFg', '머리 글자', T.profile?.headFg)}${colorBtn('theme.profile.labelBg', '항목 배경', T.profile?.labelBg)}${colorBtn('theme.profile.labelFg', '항목 글자', T.profile?.labelFg)}${colorBtn('theme.profile.valueBg', '내용 배경', T.profile?.valueBg)}${colorBtn('theme.profile.border', '테두리', T.profile?.border)}</div>
        <div class="panel"><h4>${icon('list-tree', 15)} 목차 · 인용구</h4>
          ${colorBtn('theme.toc.headBg', '목차 머리 배경', T.toc?.headBg)}${colorBtn('theme.toc.headFg', '목차 머리 글자', T.toc?.headFg)}${colorBtn('theme.quote.accent', '인용구 막대', T.quote?.accent)}${colorBtn('theme.quote.bg', '인용구 배경', T.quote?.bg)}
          <label class="check"><input type="checkbox" id="fn-col" ${T.footnote?.collapsed ? 'checked' : ''}><span>각주 목록 접어두기</span></label></div>`;
      return;
    }
    // meta
    const d = it.data;
    const cats = catsOf(it.type);
    const others = all('character').filter((o) => o.id !== it.id);
    side.innerHTML = `
      <div class="panel"><h4>${icon('shapes', 15)} O-note 분류</h4>
        <div class="row-inline"><select class="input" id="m-cat"><option value="">미분류</option>${cats.map((c) => `<option ${d.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><button class="btn ghost sm" id="m-catm">${icon('settings-2', 14)}<span>관리</span></button></div></div>
      <div class="panel"><h4>${icon('folder-heart', 15)} 페어 폴더 · 태그</h4>${folderPicker(it)}${tagInput(it)}</div>
      <div class="panel"><h4>${icon('tags', 15)} 위키 분류 표시</h4>
        <p class="muted small">위키 문서 맨 위에 '분류: ○○'로 표시돼요.</p>
        <div class="tags" id="m-wcats">${(model.categories || []).map((c, i) => `<span class="chip">${esc(c)}<button data-wc="${i}" aria-label="삭제">×</button></span>`).join('')}<input class="tag-in" placeholder="분류 + Enter" maxlength="30"></div></div>
      <div class="panel"><h4>${icon('megaphone', 15)} 상단 안내문</h4>
        ${(model.notices || []).map((n) => `<div class="pr" data-n="${n.id}"><span class="pr-l">${esc(plain(n.text).slice(0, 26))}</span><button class="icon-btn sm" data-ndel>${icon('x', 13)}</button></div>`).join('')}
        <div class="btn-row">${[['spoiler', '스포일러 주의'], ['pc', 'PC 권장'], ['trigger', '트리거 워닝'], ['info', '일반 안내']].map(([k, n]) => `<button class="btn ghost sm" data-nadd="${k}">${icon('plus', 13)} ${n}</button>`).join('')}</div></div>
      ${it.type === 'character' ? `<div class="panel"><h4>${icon('users', 15)} 관계</h4>
        ${(d.relations || []).map((r, i) => `<div class="rel-row" data-i="${i}"><select class="input sm" data-rid>${others.map((o) => `<option value="${o.id}" ${o.id === r.id ? 'selected' : ''}>${esc(o.data.title || '제목 없음')}</option>`).join('')}</select><input class="input sm" data-rl value="${esc(r.label || '')}" placeholder="관계 (예: 소꿉친구)"><button class="icon-btn sm" data-rrm>${icon('x', 13)}</button></div>`).join('')}
        ${others.length ? `<button class="btn ghost sm" id="rel-add">${icon('plus', 14)} 관계 추가</button>` : '<p class="muted small">다른 캐릭터 문서를 만들면 관계를 이을 수 있어요.</p>'}</div>` : ''}`;
    bindFolderPicker(side, it, drawSide);
    bindTags(side, it);
  }

  // 사이드 패널 이벤트 (위임)
  side.addEventListener('click', async (e) => {
    // 구조
    const row = e.target.closest('.tree-row');
    const op = e.target.closest('[data-op]')?.dataset.op;
    if (op === 'add') { model.chapters.push(R.newChapter('새 챕터')); rerender(); return; }
    if (row && e.target.closest('[data-go]')) {
      const cid = row.dataset.id;
      const el = elDoc.querySelector(`[data-chapter="${cid}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      root.querySelector('#st-side').classList.remove('open');
      return;
    }
    if (row && op) {
      const f = findChapter(row.dataset.id); if (!f) return;
      const { node, arr, index, parent } = f;
      if (op === 'up' && index > 0) [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      else if (op === 'down' && index < arr.length - 1) [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      else if (op === 'in' && index > 0) { arr.splice(index, 1); const prev = arr[index - 1]; (prev.children = prev.children || []).push(node); }
      else if (op === 'out' && parent) { arr.splice(index, 1); const pf = findChapter(parent.id); pf.arr.splice(pf.index + 1, 0, node); }
      else if (op === 'child') (node.children = node.children || []).push(R.newChapter('하위 챕터'));
      else if (op === 'fold') node.collapsed = !node.collapsed;
      else if (op === 'del') {
        const has = plain(node.body) || (node.children || []).length;
        if (has && !(await confirmBox(`'${plain(node.title)}' 챕터${(node.children || []).length ? '와 하위 챕터' : ''}를 삭제할까요?`, '삭제', true))) return;
        arr.splice(index, 1);
      } else return;
      rerender(); return;
    }
    // 프로필
    const pf = model.profile;
    if (e.target.closest('#pf-img')) {
      const f = await pickFile(); if (!f) return;
      try { pf.image = await compressImage(f, 800); rerender(); } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.closest('#pf-url')) { const u = await promptBox('이미지 주소', 'https://'); if (u) { const s = R.safeUrl(u); if (!s) return toast('주소를 확인해주세요', 'error'); pf.image = s; rerender(); } return; }
    if (e.target.closest('#pf-del')) { pf.image = ''; pf.imageCaption = ''; rerender(); return; }
    const al = e.target.closest('#pf-align [data-v]');
    if (al) { model.theme.profile = { ...(model.theme.profile || {}), align: al.dataset.v }; rerender(); return; }
    const g = e.target.closest('.pg'); const grp = g && findGroup(g.dataset.g);
    if (e.target.closest('#pg-add')) { pf.groups.push(Object.assign(R.newGroup('plain'), { rows: [R.newRow('항목', '')] })); rerender(); return; }
    if (grp) {
      const gi = pf.groups.indexOf(grp);
      if (e.target.closest('[data-gup]') && gi > 0) { [pf.groups[gi - 1], pf.groups[gi]] = [pf.groups[gi], pf.groups[gi - 1]]; rerender(); return; }
      if (e.target.closest('[data-gdel]')) { if (await confirmBox('이 묶음과 안의 항목을 삭제할까요?', '삭제', true)) { pf.groups.splice(gi, 1); rerender(); } return; }
      if (e.target.closest('[data-radd]')) { grp.rows.push(R.newRow('항목', '')); rerender(); return; }
      const pr = e.target.closest('.pr'); const r = pr && grp.rows.find((x) => x.id === pr.dataset.r); const ri = r ? grp.rows.indexOf(r) : -1;
      if (r && e.target.closest('[data-rup]') && ri > 0) { [grp.rows[ri - 1], grp.rows[ri]] = [grp.rows[ri], grp.rows[ri - 1]]; rerender(); return; }
      if (r && e.target.closest('[data-rfull]')) { r.full = !r.full; rerender(); return; }
      if (r && e.target.closest('[data-rdel]')) { grp.rows.splice(ri, 1); rerender(); return; }
    }
    // 디자인
    const cb = e.target.closest('[data-path]');
    if (cb) {
      return openColorPopover(cb, getPath(cb.dataset.path), (c) => {
        setPath(cb.dataset.path, c === 'transparent' ? '' : c);
        if (cb.dataset.path === 'theme.accent' && !c) setPath('theme.accent', '#7b6cf6');
        rerender();
      }, { auto: cb.dataset.path !== 'theme.accent' });
    }
    // 문서 정보
    if (e.target.closest('#m-catm')) { if (await manageCats(it.type)) drawSide(); return; }
    const wc = e.target.closest('[data-wc]');
    if (wc) { model.categories.splice(+wc.dataset.wc, 1); rerender(); return; }
    const na = e.target.closest('[data-nadd]');
    if (na) { (model.notices = model.notices || []).push(R.newNotice(na.dataset.nadd)); rerender(); return; }
    const nd = e.target.closest('[data-ndel]');
    if (nd) { model.notices = model.notices.filter((n) => n.id !== nd.closest('[data-n]').dataset.n); rerender(); return; }
    if (e.target.closest('#rel-add')) { const o = all('character').find((x) => x.id !== it.id); update(it.id, (d) => { d.relations = [...(d.relations || []), { id: o.id, label: '' }]; return d; }, { silent: true }); drawSide(); return; }
    const rr = e.target.closest('[data-rrm]');
    if (rr) { const i = +rr.closest('.rel-row').dataset.i; update(it.id, (d) => { d.relations.splice(i, 1); return d; }, { silent: true }); drawSide(); }
  });
  side.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'pf-on') { if (el.checked) { model.type = 'profile'; model.profile.enabled = true; if (!model.profile.groups?.length) model.profile.groups = [Object.assign(R.newGroup('plain'), { rows: [R.newRow('이름', ''), R.newRow('나이', '')] })]; if (!plain(model.profile.title)) model.profile.title = model.title; } else model.profile.enabled = false; rerender(); return; }
    if (el.id === 'pf-cap') { model.profile.imageCaption = esc(el.value); rerender(); return; }
    if (el.matches('[data-gk]')) { const grp = findGroup(el.closest('.pg').dataset.g); grp.kind = el.value; rerender(); return; }
    if (el.matches('[data-gt]')) { const grp = findGroup(el.closest('.pg').dataset.g); grp.title = esc(el.value); rerender(); return; }
    if (el.id === 'pf-w') { model.theme.profile = { ...(model.theme.profile || {}), width: +el.value }; rerender(); return; }
    if (el.id === 'fn-col') { model.theme.footnote = { ...(model.theme.footnote || {}), collapsed: el.checked }; rerender(); return; }
    if (el.id === 'm-cat') { update(it.id, { category: el.value }, { silent: true }); return; }
    if (el.matches('[data-rid]')) { const i = +el.closest('.rel-row').dataset.i; update(it.id, (d) => { d.relations[i].id = el.value; return d; }, { silent: true }); }
  });
  side.addEventListener('input', (e) => {
    if (e.target.id === 'pf-w') root.querySelector('#pf-wv').textContent = `${e.target.value}px`;
    if (e.target.matches('[data-rl]')) { const i = +e.target.closest('.rel-row').dataset.i; update(it.id, (d) => { d.relations[i].label = e.target.value; return d; }, { silent: true }); }
  });
  side.addEventListener('keydown', (e) => {
    if (e.target.closest('#m-wcats') && e.target.matches('.tag-in') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
      model.categories = [...(model.categories || []), v]; rerender();
      side.querySelector('#m-wcats .tag-in')?.focus();
    }
  });

  rerender();
  if (!plain(model.title)) setTimeout(() => { const ttl = elDoc.querySelector('.nw-doc-title'); if (ttl) { ttl.focus(); } }, 50);
  return { cleanup: () => { document.removeEventListener('selectionchange', onSel); commit(); E.clearSelection(); } };
}
