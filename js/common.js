// 여러 화면에서 쓰는 공통 조각들
import { all, get, update, create, remove } from './store.js';
import { folderIcon, compressSquare, pickFile, icon, esc, chips, TYPES, COLORS, modal, confirmBox, toast, timeAgo, htmlToText, fmtDate } from './ui.js';
import { colorPick, bindColorPick, pickedColor } from './colors.js';

// 폴더 멤버: 1명(단독)·2명(페어)·3명 이상(다인) 모두 지원. 예전 {pair:{a,b}} 형식도 읽음
export const membersOf = (d) => (Array.isArray(d?.members) ? d.members : [d?.pair?.a, d?.pair?.b]).map((x) => String(x || '').trim()).filter(Boolean);
export const membersHTML = (list) => list.map((m) => `<span class="mem">${esc(m)}</span>`).join('<span class="x">×</span>');
export const rowVals = (r, n) => { const v = Array.isArray(r.v) ? r.v : [r.a, r.b]; return Array.from({ length: n }, (_, i) => v[i] || ''); };

export function folderBadge(id) {
  const f = get(id);
  if (!f) return '';
  return `<a class="fbadge" href="#/folder/${f.id}" style="--c:${f.data.color || '#ccc'}">${folderIcon(f.data)} ${esc(f.data.title || '폴더')}</a>`;
}

export function summary(it) {
  const d = it.data;
  if (it.type === 'memo' || it.type === 'idea') return htmlToText(d.text || '').slice(0, 120);
  if (it.type === 'story') return d.summary || htmlToText((d.chapters || [])[0]?.html || '').slice(0, 120);
  if (it.type === 'plot') return d.desc || `사건 ${(d.events || []).length}개`;
  if (it.type === 'folder') return d.desc || '';
  return d.subtitle || (d.searchText || htmlToText(d.body || '')).slice(0, 120);
}

export function itemHref(it) {
  switch (it.type) {
    case 'character': case 'world': return `#/w/${it.id}`;
    case 'story': return `#/s/${it.id}`;
    case 'plot': return `#/p/${it.id}`;
    case 'folder': return `#/folder/${it.id}`;
    default: return `#/memo?open=${it.id}`;
  }
}

export function itemCard(it, { showType = true } = {}) {
  const t = TYPES[it.type] || { icon: 'file', label: '' };
  const d = it.data;
  const img = d.image || d.cover;
  return `<a class="card item-card" href="${itemHref(it)}">
    ${img ? `<div class="thumb" style="background-image:url('${esc(img)}')"></div>` : `<div class="thumb ph">${icon(t.icon, 28)}</div>`}
    <div class="ic-body">
      <div class="ic-top">${showType ? `<span class="type-tag">${icon(t.icon, 13)} ${t.label}</span>` : ''}${d.bookmarked ? `<span class="star">${icon('bookmark', 14)}</span>` : ''}</div>
      <h4>${esc(d.title || '제목 없음')}</h4>
      <p>${esc(summary(it))}</p>
      <div class="ic-foot">${(d.folders || []).slice(0, 2).map((f) => { const fo = get(f); return fo ? `<span class="mini-f" style="--c:${fo.data.color}">${folderIcon(fo.data, '')} ${esc(fo.data.title)}</span>` : ''; }).join('')}<span class="muted">${timeAgo(it.updated_at)}</span></div>
    </div>
  </a>`;
}

// 폴더 선택 칩 (여러 개 소속 가능)
export function folderPicker(it) {
  const folders = all('folder');
  const sel = new Set(it.data.folders || []);
  return `<div class="fpick" data-fpick="${it.id}">
    ${icon('folder-heart', 16)}
    ${folders.map((f) => `<button type="button" class="fchip ${sel.has(f.id) ? 'on' : ''}" data-f="${f.id}" style="--c:${f.data.color || '#ccc'}">${folderIcon(f.data, '')} ${esc(f.data.title)}</button>`).join('')}
    <button type="button" class="fchip add" data-fnew>${icon('plus', 14)} 새 페어 폴더</button>
  </div>`;
}

export function bindFolderPicker(root, it, rerender) {
  const box = root.querySelector(`[data-fpick="${it.id}"]`);
  if (!box) return;
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f]');
    if (b) {
      const fid = b.dataset.f;
      update(it.id, (d) => { const s = new Set(d.folders || []); s.has(fid) ? s.delete(fid) : s.add(fid); d.folders = [...s]; return d; }, { silent: true });
      b.classList.toggle('on');
      return;
    }
    if (e.target.closest('[data-fnew]')) {
      const f = await newFolderDialog();
      if (f) { update(it.id, (d) => { d.folders = [...(d.folders || []), f.id]; return d; }, { silent: true }); rerender?.(); }
    }
  });
}

function memberRow(name, orig) {
  return `<div class="mem-row" data-orig="${orig}"><input class="input" value="${esc(name)}" placeholder="캐릭터 이름" maxlength="40"><button type="button" class="icon-btn sm" data-mup title="앞으로">${icon('chevron-up', 14)}</button><button type="button" class="icon-btn sm" data-mrm title="빼기">${icon('x', 14)}</button></div>`;
}
// 멤버 목록을 읽고, 순서 변경·삭제에 맞춰 페어틀 답변 칸도 옮김
function readMembers(w, d) {
  const rows = [...w.querySelectorAll('#fm .mem-row')].map((r) => ({ name: r.querySelector('input').value.trim(), orig: r.dataset.orig })).filter((r) => r.name);
  const oldN = membersOf(d).length;
  const pairtle = (d.pairtle || []).map((r) => {
    const old = rowVals(r, Math.max(oldN, 2));
    return { label: r.label || '', v: rows.map((m) => (m.orig === '' ? '' : old[+m.orig] || '')) };
  });
  return { members: rows.map((m) => m.name), pair: null, pairtle };
}

export async function newFolderDialog(existing) {
  const d = existing?.data || {};
  const emojis = ['💞', '💘', '🌙', '🌸', '🔥', '🗡️', '🍰', '⭐', '🐺', '🦊', '🌊', '🎀', '☕', '🎭', '👑', '🪐'];
  const res = await modal({
    title: existing ? '페어 폴더 수정' : '새 페어 폴더 만들기',
    body: `
      <p class="muted small">${icon('info', 14)} 페어(CP)·작품·AU별로 폴더를 만들면 캐릭터, 세계관, 연성, 플롯을 한곳에서 모아볼 수 있어요.</p>
      <label class="lbl">폴더 이름 (페어 이름)</label>
      <input class="input" id="fn" value="${esc(d.title || '')}" placeholder="예: 공×수, 작품명 AU" maxlength="60">
      <label class="lbl">멤버 (캐릭터)</label>
      <p class="muted small">1명이면 단독·드림 폴더, 2명이면 페어, 3명 이상이면 트리오·그룹 같은 다인 페어가 돼요.</p>
      <div class="mem-list" id="fm">${(existing ? membersOf(d) : ['', '']).map((m, i) => memberRow(m, existing ? i : '')).join('')}</div>
      <button type="button" class="btn ghost sm" id="fm-add">${icon('user-plus', 15)}<span>멤버 추가</span></button>
      <label class="lbl">한 줄 소개</label>
      <input class="input" id="fd" value="${esc(d.desc || '')}" placeholder="예: 소꿉친구 → 라이벌 → 연인" maxlength="120">
      <label class="lbl">아이콘</label>
      <div class="ico-cur"><span class="ico-preview" id="ico-prev">${folderIcon(d)}</span><span class="muted small">이모지를 고르거나, 직접 입력하거나, 이미지를 올려 나만의 아이콘을 쓸 수 있어요.</span></div>
      <div class="emo-pick">${emojis.map((e) => `<button type="button" class="${!d.iconImg && (d.emoji || '💞') === e ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
      <div class="ico-custom">
        <input class="input" id="ico-text" maxlength="4" placeholder="직접 입력 (이모지·글자)" value="${esc(!d.iconImg && d.emoji && !emojis.includes(d.emoji) ? d.emoji : '')}">
        <button type="button" class="btn ghost sm" id="ico-up">${icon('image-plus', 15)}<span>이미지 올리기</span></button>
        <button type="button" class="btn ghost sm" id="ico-clear" ${d.iconImg ? '' : 'hidden'}>${icon('x', 15)}<span>이미지 지우기</span></button>
      </div>
      <label class="lbl">색상</label>
      ${colorPick('fc', d.color || COLORS[0], COLORS)}`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, {
      label: existing ? '저장' : '만들기', cls: 'primary', icon: 'check', value: (w) => {
        const title = w.querySelector('#fn').value.trim();
        if (!title) { toast('폴더 이름을 입력해주세요', 'error'); return false; }
        return {
          title, desc: w.querySelector('#fd').value.trim(),
          emoji: w.querySelector('#ico-text').value.trim() || w.querySelector('.emo-pick .on')?.dataset.e || '💞',
          iconImg: w._iconImg || '',
          color: pickedColor(w, 'fc') || COLORS[0],
          ...readMembers(w, d),
        };
      },
    }],
    onOpen: (w) => {
      bindColorPick(w, 'fc');
      const fm = w.querySelector('#fm');
      w.querySelector('#fm-add').onclick = () => {
        if (fm.children.length >= 12) return toast('멤버는 12명까지 넣을 수 있어요');
        fm.insertAdjacentHTML('beforeend', memberRow('', '')); fm.lastElementChild.querySelector('input').focus();
      };
      fm.addEventListener('click', (e) => { const b = e.target.closest('[data-mrm]'); if (b) b.closest('.mem-row').remove(); });
      fm.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mup]'); if (!b) return;
        const row = b.closest('.mem-row'); if (row.previousElementSibling) fm.insertBefore(row, row.previousElementSibling);
      });
      w._iconImg = d.iconImg || '';
      const prev = () => { w.querySelector('#ico-prev').innerHTML = folderIcon({ iconImg: w._iconImg, emoji: w.querySelector('#ico-text').value.trim() || w.querySelector('.emo-pick .on')?.dataset.e }); w.querySelector('#ico-clear').hidden = !w._iconImg; };
      w.querySelector('.emo-pick').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        w.querySelectorAll('.emo-pick button').forEach((x) => x.classList.toggle('on', x === b));
        w.querySelector('#ico-text').value = ''; w._iconImg = ''; prev();
      });
      w.querySelector('#ico-text').addEventListener('input', () => { w._iconImg = ''; prev(); });
      w.querySelector('#ico-up').onclick = async () => {
        const f = await pickFile(); if (!f) return;
        try { w._iconImg = await compressSquare(f, 128); prev(); } catch (err) { toast(err.message, 'error'); }
      };
      w.querySelector('#ico-clear').onclick = () => { w._iconImg = ''; prev(); };
    },
  });
  if (!res) return null;
  if (existing) { update(existing.id, res); return existing; }
  return create('folder', { ...res, pairtle: [] });
}

// 북마크 버튼
export function bookmarkBtn(it) {
  return `<button class="btn ghost sm ${it.data.bookmarked ? 'on' : ''}" data-bm="${it.id}" title="북마크">${icon(it.data.bookmarked ? 'bookmark-check' : 'bookmark', 16)}<span>${it.data.bookmarked ? '북마크됨' : '북마크'}</span></button>`;
}
export function bindBookmark(root, it) {
  root.querySelectorAll(`[data-bm="${it.id}"]`).forEach((b) => b.addEventListener('click', () => {
    update(it.id, { bookmarked: !it.data.bookmarked }, { silent: true });
    b.outerHTML = bookmarkBtn(it);
    bindBookmark(root, it);
    toast(it.data.bookmarked ? '북마크에 추가했어요' : '북마크를 해제했어요', 'ok');
  }));
}

// 댓글(나만 보는 코멘트) 패널
export function commentsPanel(it, anchorLabel = '') {
  const list = it.data.comments || [];
  return `<section class="comments" data-cm="${it.id}">
    <h4>${icon('message-square', 16)} 코멘트 <span class="muted">${list.length}</span></h4>
    <p class="muted small">퇴고 메모, 피드백, 떠오른 생각을 남겨요. 나에게만 보여요.</p>
    <ul>${list.map((c) => `<li><div class="cm-meta">${c.anchor ? `<span class="chip">${esc(c.anchor)}</span>` : ''}<span class="muted small">${fmtDate(c.at, true)}</span>${c.done ? `<span class="chip ok">해결</span>` : ''}</div>
      <div class="cm-text ${c.done ? 'done' : ''}">${esc(c.text)}</div>
      <div class="cm-act"><button class="link" data-cdone="${c.id}">${icon('check', 14)} ${c.done ? '되돌리기' : '해결'}</button><button class="link danger" data-cdel="${c.id}">${icon('trash', 14)} 삭제</button></div></li>`).join('')}</ul>
    <div class="cm-new"><textarea class="input" rows="2" placeholder="코멘트 남기기${anchorLabel ? ` (${esc(anchorLabel)})` : ''}"></textarea><button class="btn primary sm" data-cadd>${icon('send', 15)}</button></div>
  </section>`;
}
export function bindComments(root, it, rerender, anchorFn) {
  const box = root.querySelector(`[data-cm="${it.id}"]`);
  if (!box) return;
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-cadd]')) {
      const ta = box.querySelector('textarea');
      const text = ta.value.trim(); if (!text) return;
      update(it.id, (d) => { d.comments = [...(d.comments || []), { id: crypto.randomUUID(), text, at: new Date().toISOString(), anchor: anchorFn?.() || '' }]; return d; }, { silent: true });
      rerender();
    }
    const done = e.target.closest('[data-cdone]');
    if (done) { update(it.id, (d) => { d.comments = d.comments.map((c) => (c.id === done.dataset.cdone ? { ...c, done: !c.done } : c)); return d; }, { silent: true }); rerender(); }
    const del = e.target.closest('[data-cdel]');
    if (del) { update(it.id, (d) => { d.comments = d.comments.filter((c) => c.id !== del.dataset.cdel); return d; }, { silent: true }); rerender(); }
  });
}

// 태그 입력
export function tagInput(it) {
  return `<div class="tags" data-tags="${it.id}">${icon('tag', 15)}${(it.data.tags || []).map((t) => `<span class="chip">${esc(t)}<button data-tdel="${esc(t)}" aria-label="태그 삭제">×</button></span>`).join('')}<input class="tag-in" placeholder="태그 + Enter" maxlength="30"></div>`;
}
export function bindTags(root, it) {
  const box = root.querySelector(`[data-tags="${it.id}"]`);
  if (!box) return;
  const redraw = () => { box.outerHTML = tagInput(it); bindTags(root, it); root.querySelector(`[data-tags="${it.id}"] .tag-in`)?.focus(); };
  box.querySelector('.tag-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/, '');
      if (v && !(it.data.tags || []).includes(v)) { update(it.id, (d) => { d.tags = [...(d.tags || []), v]; return d; }, { silent: true }); redraw(); }
    }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tdel]');
    if (b) { update(it.id, (d) => { d.tags = d.tags.filter((t) => t !== b.dataset.tdel); return d; }, { silent: true }); redraw(); }
  });
}

export async function deleteItem(it, after = '#/') {
  if (await confirmBox(`'${it.data.title || '제목 없음'}'을(를) 삭제할까요? 되돌릴 수 없어요.`, '삭제', true)) {
    remove(it.id);
    toast('삭제했어요', 'ok');
    location.hash = after;
  }
}

export function pageHead(ic, title, desc, right = '') {
  return `<header class="page-head"><div class="ph-ic">${icon(ic, 26)}</div><div class="ph-text"><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="ph-right">${right}</div></header>`;
}

export function folderFilter(current) {
  const fs = all('folder');
  if (!fs.length) return '';
  return `<div class="filter-row">${icon('funnel', 15)}<a class="fchip ${!current ? 'on' : ''}" href="${location.hash.split('?')[0]}">전체</a>${fs.map((f) => `<a class="fchip ${current === f.id ? 'on' : ''}" style="--c:${f.data.color}" href="${location.hash.split('?')[0]}?f=${f.id}">${folderIcon(f.data, '')} ${esc(f.data.title)}</a>`).join('')}</div>`;
}

export { chips };
