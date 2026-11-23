// 여러 화면에서 쓰는 공통 조각들
import { all, get, update, create, remove } from './store.js';
import { icon, esc, chips, TYPES, COLORS, modal, confirmBox, toast, timeAgo, htmlToText, fmtDate } from './ui.js';
import { colorPick, bindColorPick, pickedColor } from './colors.js';

export function folderBadge(id) {
  const f = get(id);
  if (!f) return '';
  return `<a class="fbadge" href="#/folder/${f.id}" style="--c:${f.data.color || '#ccc'}">${esc(f.data.emoji || '💞')} ${esc(f.data.title || '폴더')}</a>`;
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
      <div class="ic-foot">${(d.folders || []).slice(0, 2).map((f) => { const fo = get(f); return fo ? `<span class="mini-f" style="--c:${fo.data.color}">${esc(fo.data.emoji || '')} ${esc(fo.data.title)}</span>` : ''; }).join('')}<span class="muted">${timeAgo(it.updated_at)}</span></div>
    </div>
  </a>`;
}

// 폴더 선택 칩 (여러 개 소속 가능)
export function folderPicker(it) {
  const folders = all('folder');
  const sel = new Set(it.data.folders || []);
  return `<div class="fpick" data-fpick="${it.id}">
    ${icon('folder-heart', 16)}
    ${folders.map((f) => `<button type="button" class="fchip ${sel.has(f.id) ? 'on' : ''}" data-f="${f.id}" style="--c:${f.data.color || '#ccc'}">${esc(f.data.emoji || '')} ${esc(f.data.title)}</button>`).join('')}
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

export async function newFolderDialog(existing) {
  const d = existing?.data || {};
  const emojis = ['💞', '💘', '🌙', '🌸', '🔥', '🗡️', '🍰', '⭐', '🐺', '🦊', '🌊', '🎀', '☕', '🎭', '👑', '🪐'];
  const res = await modal({
    title: existing ? '페어 폴더 수정' : '새 페어 폴더 만들기',
    body: `
      <p class="muted small">${icon('info', 14)} 페어(CP)·작품·AU별로 폴더를 만들면 캐릭터, 세계관, 연성, 플롯을 한곳에서 모아볼 수 있어요.</p>
      <label class="lbl">폴더 이름 (페어 이름)</label>
      <input class="input" id="fn" value="${esc(d.title || '')}" placeholder="예: 공×수, 작품명 AU" maxlength="60">
      <div class="row2">
        <div><label class="lbl">왼쪽 캐릭터</label><input class="input" id="fa" value="${esc(d.pair?.a || '')}" placeholder="예: 캐릭터 A"></div>
        <div><label class="lbl">오른쪽 캐릭터</label><input class="input" id="fb" value="${esc(d.pair?.b || '')}" placeholder="예: 캐릭터 B"></div>
      </div>
      <label class="lbl">한 줄 소개</label>
      <input class="input" id="fd" value="${esc(d.desc || '')}" placeholder="예: 소꿉친구 → 라이벌 → 연인" maxlength="120">
      <label class="lbl">아이콘</label>
      <div class="emo-pick">${emojis.map((e) => `<button type="button" class="${(d.emoji || '💞') === e ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
      <label class="lbl">색상</label>
      ${colorPick('fc', d.color || COLORS[0], COLORS)}`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, {
      label: existing ? '저장' : '만들기', cls: 'primary', icon: 'check', value: (w) => {
        const title = w.querySelector('#fn').value.trim();
        if (!title) { toast('폴더 이름을 입력해주세요', 'error'); return false; }
        return {
          title, desc: w.querySelector('#fd').value.trim(),
          emoji: w.querySelector('.emo-pick .on')?.dataset.e || '💞',
          color: pickedColor(w, 'fc') || COLORS[0],
          pair: { ...(d.pair || {}), a: w.querySelector('#fa').value.trim(), b: w.querySelector('#fb').value.trim() },
        };
      },
    }],
    onOpen: (w) => {
      bindColorPick(w, 'fc');
      ['.emo-pick'].forEach((s) => w.querySelector(s).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        w.querySelectorAll(`${s} button`).forEach((x) => x.classList.toggle('on', x === b));
      }));
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
  return `<div class="filter-row">${icon('funnel', 15)}<a class="fchip ${!current ? 'on' : ''}" href="${location.hash.split('?')[0]}">전체</a>${fs.map((f) => `<a class="fchip ${current === f.id ? 'on' : ''}" style="--c:${f.data.color}" href="${location.hash.split('?')[0]}?f=${f.id}">${esc(f.data.emoji || '')} ${esc(f.data.title)}</a>`).join('')}</div>`;
}

export { chips };
