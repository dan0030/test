// 위키형 캐릭터 프로필 & 세계관 문서
import { all, get, create, update } from '../store.js';
import { icon, esc, sanitize, TYPES, emptyState, toast, compressImage, pickFile, COLORS, $ } from '../ui.js';
import { createEditor } from '../editor.js';
import { itemCard, folderBadge, folderPicker, bindFolderPicker, bookmarkBtn, bindBookmark, commentsPanel, bindComments, tagInput, bindTags, deleteItem, pageHead, folderFilter } from '../common.js';
import { openExport } from '../export.js';

const CHAR_FIELDS = ['이름', '나이', '생일', '키', '소속', '외모', '성격', '좋아하는 것', '싫어하는 것', '말버릇·호칭', '이미지 컬러', '테마곡'];
const WORLD_CATS = ['지역·장소', '세력·조직', '종족·생물', '용어·개념', '역사·사건', '능력·마법 체계', '아이템', '기타'];
const WORLD_FIELDS = ['분류', '위치·범위', '관련 인물', '등장 시기'];

const CHAR_BODY = '<h2>개요</h2><p><br></p><h2>외모</h2><p><br></p><h2>성격</h2><p><br></p><h2>과거사</h2><p><br></p><h2>인간관계</h2><p><br></p><h2>기타 설정</h2><p><br></p>';
const WORLD_BODY = '<h2>개요</h2><p><br></p><h2>상세 설정</h2><p><br></p><h2>관련 사건</h2><p><br></p>';

export function newWiki(type, folderId) {
  const isChar = type === 'character';
  const it = create(type, {
    title: '',
    subtitle: '',
    category: isChar ? '' : WORLD_CATS[0],
    infobox: (isChar ? CHAR_FIELDS : WORLD_FIELDS).map((k) => ({ k, v: k === '분류' ? WORLD_CATS[0] : '' })),
    body: isChar ? CHAR_BODY : WORLD_BODY,
    color: COLORS[5],
    relations: [],
    folders: folderId ? [folderId] : [],
  });
  location.hash = `#/w/${it.id}/edit`;
}

export function renderList(root, type, q) {
  const t = TYPES[type];
  const f = q.get('f');
  let items = all(type);
  if (f) items = items.filter((i) => (i.data.folders || []).includes(f));
  const cat = q.get('c');
  if (type === 'world' && cat) items = items.filter((i) => i.data.category === cat);
  const add = `<button class="btn primary" id="new">${icon('plus', 18)} 새 ${t.label} 문서</button>`;
  root.innerHTML = `
    ${pageHead(t.icon, t.label, type === 'character' ? '위키처럼 정리하는 캐릭터 프로필. 인포박스, 목차, 관계, [[문서 링크]]를 지원해요.' : '지역·세력·용어 등 세계관 설정을 위키 문서로 모아요.', add)}
    ${folderFilter(f)}
    ${type === 'world' ? `<div class="filter-row">${icon('shapes', 15)}<a class="fchip ${!cat ? 'on' : ''}" href="#/list/world">모든 분류</a>${WORLD_CATS.map((c) => `<a class="fchip ${cat === c ? 'on' : ''}" href="#/list/world?c=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>` : ''}
    ${items.length ? `<div class="grid">${items.map((i) => itemCard(i, { showType: false })).join('')}</div>` : emptyState(t.icon, `아직 ${t.label} 문서가 없어요`, type === 'character' ? '최애의 프로필부터 정리해볼까요?' : '세계관의 첫 설정을 적어보세요.', `<button class="btn primary" id="new2">${icon('plus', 18)} 첫 문서 만들기</button>`)}`;
  root.querySelectorAll('#new,#new2').forEach((b) => (b.onclick = () => newWiki(type, f)));
}

// [[문서명]] → 링크
function linkify(html) {
  const byTitle = new Map();
  all().forEach((i) => { if (['character', 'world', 'story', 'plot'].includes(i.type) && i.data.title) byTitle.set(i.data.title.trim(), i); });
  return html.replace(/\[\[([^\]<>]{1,60})\]\]/g, (m, name) => {
    const [target, label] = name.split('|');
    const it = byTitle.get(target.trim());
    if (it) return `<a class="wlink" href="#/${it.type === 'story' ? 's' : it.type === 'plot' ? 'p' : 'w'}/${it.id}">${esc((label || target).trim())}</a>`;
    return `<a class="wlink red" href="#" data-newwiki="${esc(target.trim())}" title="아직 없는 문서 — 눌러서 만들기">${esc((label || target).trim())}</a>`;
  });
}

function buildToc(container) {
  const hs = [...container.querySelectorAll('h2,h3')];
  if (hs.length < 2) return '';
  let n2 = 0; let n3 = 0;
  return `<nav class="toc"><b>${icon('list-tree', 15)} 목차</b><ol>${hs.map((h, i) => {
    h.id = `sec-${i}`;
    let num;
    if (h.tagName === 'H2') { n2++; n3 = 0; num = `${n2}`; } else { n3++; num = `${n2}.${n3}`; }
    h.insertAdjacentHTML('afterbegin', `<span class="secnum">${num}.</span> `);
    return `<li class="${h.tagName.toLowerCase()}"><a href="#" data-sec="sec-${i}">${num}. ${esc(h.textContent.replace(/^\S+\.\s/, ''))}</a></li>`;
  }).join('')}</ol></nav>`;
}

export function renderView(root, id) {
  const it = get(id);
  if (!it) { root.innerHTML = emptyState('file-question-mark', '문서를 찾을 수 없어요', '삭제되었거나 다른 기기에서 아직 동기화되지 않았어요.'); return; }
  const d = it.data;
  const t = TYPES[it.type];
  const body = document.createElement('div');
  body.innerHTML = linkify(sanitize(d.body || ''));
  // 빈 문단만 있는 섹션 정리
  const toc = buildToc(body);
  const backlinks = all().filter((o) => o.id !== it.id && d.title && JSON.stringify(o.data).includes(`[[${d.title}`));
  const relations = (d.relations || []).map((r) => ({ ...r, it: get(r.id) })).filter((r) => r.it);
  const infobox = (d.infobox || []).filter((r) => (r.v || '').trim());

  root.innerHTML = `
    <article class="wiki" style="--wc:${d.color || '#a9b6f2'}">
      <div class="wiki-head">
        <div>
          <span class="type-tag">${icon(t.icon, 14)} ${t.label}${d.category && it.type === 'world' ? ` · ${esc(d.category)}` : ''}</span>
          <h1>${esc(d.title || '제목 없음')}</h1>
          ${d.subtitle ? `<p class="wiki-sub">${esc(d.subtitle)}</p>` : ''}
          <div class="badges">${(d.folders || []).map(folderBadge).join('')}${(d.tags || []).map((x) => `<span class="chip">#${esc(x)}</span>`).join('')}</div>
        </div>
        <div class="wiki-actions">
          <a class="btn primary sm" href="#/w/${it.id}/edit">${icon('pencil', 16)}<span>편집</span></a>
          ${bookmarkBtn(it)}
          <button class="btn ghost sm" id="exp">${icon('share', 16)}<span>내보내기</span></button>
          <button class="btn ghost sm danger" id="del">${icon('trash', 16)}</button>
        </div>
      </div>
      <div class="wiki-grid">
        <aside class="infobox">
          <div class="ib-title">${esc(d.title || '')}</div>
          ${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.title)}">` : ''}
          ${infobox.length ? `<table>${infobox.map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}
        </aside>
        <div class="wiki-body">
          ${toc}
          <div class="prose">${body.innerHTML}</div>
          ${relations.length ? `<h2 class="rel-h">${icon('users', 18)} 관계</h2><div class="relations">${relations.map((r) => `<a class="rel" href="#/w/${r.it.id}">${r.it.data.image ? `<img src="${esc(r.it.data.image)}" alt="">` : `<span class="rel-ph">${icon('user', 20)}</span>`}<div><b>${esc(r.it.data.title)}</b><span>${esc(r.label || '')}</span></div></a>`).join('')}</div>` : ''}
          ${backlinks.length ? `<div class="backlinks">${icon('link-2', 15)} 이 문서를 언급한 문서: ${backlinks.map((b) => `<a href="#/${b.type === 'story' ? 's' : b.type === 'plot' ? 'p' : 'w'}/${b.id}">${esc(b.data.title)}</a>`).join(', ')}</div>` : ''}
          ${commentsPanel(it)}
        </div>
      </div>
    </article>`;
  bindBookmark(root, it);
  bindComments(root, it, () => renderView(root, id));
  root.querySelector('#del').onclick = () => deleteItem(it, `#/list/${it.type}`);
  root.querySelector('#exp').onclick = () => {
    const ib = infobox.length ? `<table style="border-collapse:collapse;margin:0 auto 2em;font-size:.9em;">${infobox.map((r) => `<tr><th style="text-align:left;padding:4px 12px;border-bottom:1px solid #ddd;">${esc(r.k)}</th><td style="padding:4px 12px;border-bottom:1px solid #ddd;">${esc(r.v)}</td></tr>`).join('')}</table>` : '';
    const img = d.image ? `<img src="${d.image}" alt="">` : '';
    openExport({ title: d.title, subtitle: d.subtitle, html: img + ib + sanitize(d.body || '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (m, a, b) => b || a) });
  };
  root.querySelectorAll('[data-sec]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); root.querySelector(`#${a.dataset.sec}`)?.scrollIntoView({ behavior: 'smooth' }); }));
  root.querySelectorAll('[data-newwiki]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const n = create(it.type === 'world' ? 'world' : 'character', { title: a.dataset.newwiki, body: '', infobox: [], folders: [...(d.folders || [])] });
    location.hash = `#/w/${n.id}/edit`;
  }));
}

export function renderEdit(root, id) {
  const it = get(id);
  if (!it) { root.innerHTML = emptyState('file-question-mark', '문서를 찾을 수 없어요', ''); return; }
  const d = it.data;
  const t = TYPES[it.type];
  const isChar = it.type === 'character';
  const others = all(it.type === 'world' ? null : 'character').filter((o) => o.id !== it.id && ['character', 'world'].includes(o.type));

  root.innerHTML = `
    <div class="edit-head">
      <a class="btn ghost sm" href="#/w/${it.id}">${icon('eye', 16)} 보기</a>
      <span class="type-tag">${icon(t.icon, 14)} ${t.label} 편집</span>
      <span class="grow"></span>
      <span class="save-ind" data-save></span>
    </div>
    <div class="wiki-edit">
      <div class="we-main">
        <input class="title-in" id="w-title" value="${esc(d.title || '')}" placeholder="${isChar ? '캐릭터 이름' : '문서 제목'}" maxlength="80">
        <input class="input sub-in" id="w-sub" value="${esc(d.subtitle || '')}" placeholder="${isChar ? '한 줄 소개 (예: 검은 늑대 기사단의 단장)' : '한 줄 요약'}" maxlength="140">
        ${folderPicker(it)}
        ${tagInput(it)}
        <p class="hint">${icon('lightbulb', 14)} 본문에 <code>[[다른 문서 이름]]</code>처럼 적으면 위키 링크가 돼요. <code>[[문서|보일 이름]]</code>도 가능해요.</p>
        <div id="w-ed"></div>
      </div>
      <aside class="we-side">
        <div class="panel">
          <h4>${icon('image', 16)} 대표 이미지</h4>
          <div class="img-drop" id="w-img">${d.image ? `<img src="${esc(d.image)}" alt="">` : `${icon('image-plus', 28)}<span>눌러서 이미지 올리기</span>`}</div>
          ${d.image ? `<button class="link danger" id="w-img-del">${icon('trash', 14)} 이미지 삭제</button>` : ''}
          <p class="muted small">이미지는 자동으로 줄이고, 위치정보(EXIF)를 지워서 저장해요.</p>
        </div>
        <div class="panel">
          <h4>${icon('palette', 16)} 테마 색</h4>
          <div class="col-pick" id="w-color">${COLORS.map((c) => `<button type="button" class="${d.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
        </div>
        ${!isChar ? `<div class="panel"><h4>${icon('shapes', 16)} 분류</h4><select class="input" id="w-cat">${WORLD_CATS.map((c) => `<option ${d.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>` : ''}
        <div class="panel">
          <h4>${icon('table-properties', 16)} 인포박스</h4>
          <div id="w-ib"></div>
          <button class="btn ghost sm" id="ib-add">${icon('plus', 14)} 항목 추가</button>
        </div>
        ${isChar ? `<div class="panel"><h4>${icon('users', 16)} 관계</h4><div id="w-rel"></div><button class="btn ghost sm" id="rel-add" ${others.length ? '' : 'disabled'}>${icon('plus', 14)} 관계 추가</button>${others.length ? '' : '<p class="muted small">다른 캐릭터 문서를 만들면 관계를 이을 수 있어요.</p>'}</div>` : ''}
      </aside>
    </div>`;

  const saveInd = root.querySelector('[data-save]');
  const ed = createEditor(root.querySelector('#w-ed'), { html: d.body, onChange: (html) => update(it.id, { body: html }, { silent: true }) });

  const bindText = (sel, key) => root.querySelector(sel)?.addEventListener('input', (e) => update(it.id, { [key]: e.target.value }, { silent: true }));
  bindText('#w-title', 'title');
  bindText('#w-sub', 'subtitle');
  root.querySelector('#w-cat')?.addEventListener('change', (e) => update(it.id, (dd) => { dd.category = e.target.value; const r = (dd.infobox || []).find((x) => x.k === '분류'); if (r) r.v = e.target.value; return dd; }, { silent: true }));
  bindFolderPicker(root, it, () => renderEdit(root, id));
  bindTags(root, it);

  root.querySelector('#w-color').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    root.querySelectorAll('#w-color button').forEach((x) => x.classList.toggle('on', x === b));
    update(it.id, { color: b.dataset.c }, { silent: true });
  });
  root.querySelector('#w-img').onclick = async () => {
    const f = await pickFile();
    if (!f) return;
    try { const url = await compressImage(f, 700); ed.flush(); update(it.id, { image: url }, { silent: true }); renderEdit(root, id); } catch (e) { toast(e.message, 'error'); }
  };
  const imgDel = root.querySelector('#w-img-del');
  if (imgDel) imgDel.onclick = () => { ed.flush(); update(it.id, { image: '' }, { silent: true }); renderEdit(root, id); };

  // 인포박스 편집
  const ib = root.querySelector('#w-ib');
  const drawIb = () => {
    ib.innerHTML = (it.data.infobox || []).map((r, i) => `<div class="ib-row" data-i="${i}">
      <input class="input" data-k value="${esc(r.k)}" placeholder="항목">
      <textarea class="input" data-v rows="1" placeholder="내용">${esc(r.v)}</textarea>
      <div class="ib-btns"><button class="icon-btn sm" data-up title="위로">${icon('chevron-up', 14)}</button><button class="icon-btn sm" data-rm title="삭제">${icon('x', 14)}</button></div></div>`).join('');
  };
  drawIb();
  ib.addEventListener('input', (e) => {
    const row = e.target.closest('.ib-row'); if (!row) return;
    const i = +row.dataset.i;
    update(it.id, (dd) => { const r = dd.infobox[i]; if (e.target.matches('[data-k]')) r.k = e.target.value; else r.v = e.target.value; return dd; }, { silent: true });
  });
  ib.addEventListener('click', (e) => {
    const row = e.target.closest('.ib-row'); if (!row) return;
    const i = +row.dataset.i;
    if (e.target.closest('[data-rm]')) { update(it.id, (dd) => { dd.infobox.splice(i, 1); return dd; }, { silent: true }); drawIb(); }
    if (e.target.closest('[data-up]') && i > 0) { update(it.id, (dd) => { const a = dd.infobox; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return dd; }, { silent: true }); drawIb(); }
  });
  root.querySelector('#ib-add').onclick = () => { update(it.id, (dd) => { dd.infobox = [...(dd.infobox || []), { k: '', v: '' }]; return dd; }, { silent: true }); drawIb(); ib.querySelector('.ib-row:last-child [data-k]')?.focus(); };

  // 관계 편집
  const rel = root.querySelector('#w-rel');
  if (rel) {
    const drawRel = () => {
      rel.innerHTML = (it.data.relations || []).map((r, i) => `<div class="ib-row" data-i="${i}">
        <select class="input" data-rid>${others.map((o) => `<option value="${o.id}" ${o.id === r.id ? 'selected' : ''}>${esc(o.data.title || '제목 없음')}</option>`).join('')}</select>
        <input class="input" data-rl value="${esc(r.label || '')}" placeholder="관계 (예: 소꿉친구, 짝사랑)">
        <div class="ib-btns"><button class="icon-btn sm" data-rm>${icon('x', 14)}</button></div></div>`).join('');
    };
    drawRel();
    rel.addEventListener('change', (e) => { const i = +e.target.closest('.ib-row').dataset.i; if (e.target.matches('[data-rid]')) update(it.id, (dd) => { dd.relations[i].id = e.target.value; return dd; }, { silent: true }); });
    rel.addEventListener('input', (e) => { const i = +e.target.closest('.ib-row').dataset.i; if (e.target.matches('[data-rl]')) update(it.id, (dd) => { dd.relations[i].label = e.target.value; return dd; }, { silent: true }); });
    rel.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { const i = +e.target.closest('.ib-row').dataset.i; update(it.id, (dd) => { dd.relations.splice(i, 1); return dd; }, { silent: true }); drawRel(); } });
    root.querySelector('#rel-add').onclick = () => { update(it.id, (dd) => { dd.relations = [...(dd.relations || []), { id: others[0].id, label: '' }]; return dd; }, { silent: true }); drawRel(); };
  }

  if (!d.title) root.querySelector('#w-title').focus();
  return { cleanup: () => { ed.flush(); ed.destroy(); }, saveInd };
}
