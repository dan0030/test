// 짧은 메모 (포스트잇)
import { all, get, create, update, remove } from '../store.js';
import { icon, esc, emptyState, modal, toast, COLORS, timeAgo, confirmBox } from '../ui.js';
import { colorPick, bindColorPick } from '../colors.js';
import { pageHead, folderFilter, folderPicker, bindFolderPicker } from '../common.js';

const MEMO_COLORS = ['#fff7c2', '#ffe0e6', '#dff5d8', '#dbeeff', '#ece2ff', '#ffe6cc', '#f1f1f1'];

// 손가락으로 쓰는 기기(휴대폰·태블릿)인지: 마우스 없이 터치가 주 입력일 때
const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export async function quickMemo(folderId, text = '') {
  const it = create('memo', { text, color: MEMO_COLORS[0], pinned: false, folders: folderId ? [folderId] : [] });
  await openMemo(it.id);
  if (!get(it.id)?.data.text?.trim()) remove(it.id);
}

export async function openMemo(id) {
  const it = get(id);
  if (!it) return;
  await modal({
    title: '메모',
    body: `<textarea class="input memo-ta" id="m-t" rows="8" placeholder="떠오른 생각을 적어요…" style="background:${it.data.color}">${esc(it.data.text || '')}</textarea>
      ${colorPick('mc', it.data.color, MEMO_COLORS)}
      ${folderPicker(it)}
      <p class="muted small">${icon('save', 13)} 입력하는 대로 자동 저장돼요.</p>`,
    actions: [
      { label: '삭제', cls: 'ghost danger', icon: 'trash', value: async () => { if (await confirmBox('메모를 삭제할까요?', '삭제', true)) { remove(id); return 'del'; } return false; } },
      { label: '완료', cls: 'primary', icon: 'check', value: () => true },
    ],
    onOpen: (w) => {
      const ta = w.querySelector('#m-t');
      ta.addEventListener('input', () => update(id, { text: ta.value }, { silent: true }));
      bindColorPick(w, 'mc', (c) => { ta.style.background = c || '#fff7c2'; update(id, { color: c }, { silent: true }); });
      bindFolderPicker(w, it);
    },
  });
}

// 메모 보드: 빠른 입력 + 포스트잇 목록 (메모 화면과 페어 폴더의 메모 탭이 똑같이 사용)
export function memoBoard(box, { folderId = null, search = '', filterHTML = '' } = {}) {
  const draw = () => {
    let items = all('memo');
    if (folderId) items = items.filter((i) => (i.data.folders || []).includes(folderId));
    if (search) items = items.filter((i) => (i.data.text || '').toLowerCase().includes(search));
    items.sort((a, b) => (b.data.pinned ? 1 : 0) - (a.data.pinned ? 1 : 0));
    box.innerHTML = `
    <div class="memo-quick">
      ${icon('pen-line', 18)}
      <textarea id="mq" rows="1" placeholder="${isTouch() ? '빠른 메모를 적고 추가를 눌러요' : '빠른 메모: 쓰고 Enter (줄바꿈은 Shift+Enter)'}"></textarea>
      <button class="btn primary sm" id="mq-add">${icon('plus', 16)}<span>추가</span></button>
    </div>
    ${filterHTML}
    ${items.length ? `<div class="memo-grid">${items.map((m) => `<div class="memo" style="background:${m.data.color || MEMO_COLORS[0]}" data-m="${m.id}" tabindex="0">
        <div class="memo-top">${m.data.pinned ? icon('pin', 14) : ''}<span class="muted small">${timeAgo(m.updated_at)}</span>
          <button class="icon-btn sm" data-pin="${m.id}" title="${m.data.pinned ? '고정 해제' : '위에 고정'}">${icon(m.data.pinned ? 'pin-off' : 'pin', 14)}</button>
          <button class="icon-btn sm" data-bmk="${m.id}" title="북마크">${icon(m.data.bookmarked ? 'bookmark-check' : 'bookmark', 14)}</button></div>
        <div class="memo-text">${esc(m.data.text || '').replace(/\n/g, '<br>')}</div>
      </div>`).join('')}</div>` : emptyState('sticky-note', search ? '검색 결과가 없어요' : folderId ? '이 폴더에 메모가 없어요' : '메모가 비어 있어요', '위 입력칸에 바로 적어보세요.')}`;

    const ta = box.querySelector('#mq');
    const add = () => {
      const v = ta.value.trim(); if (!v) return;
      create('memo', { text: v, color: MEMO_COLORS[Math.floor(Math.random() * MEMO_COLORS.length)], folders: folderId ? [folderId] : [] });
      toast('메모를 추가했어요', 'ok');
      draw();
      box.querySelector('#mq').focus();
    };
    // 모바일(터치 기기)에서는 Enter = 줄바꿈(Shift+Enter와 같게), 추가는 버튼으로
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) { e.preventDefault(); add(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(160, ta.scrollHeight)}px`; });
    box.querySelector('#mq-add').onclick = add;
    box.querySelectorAll('.memo').forEach((el) => el.addEventListener('click', async (e) => {
      const pin = e.target.closest('[data-pin]');
      const bm = e.target.closest('[data-bmk]');
      const id = el.dataset.m;
      if (pin) { update(id, { pinned: !get(id).data.pinned }, { silent: true }); return draw(); }
      if (bm) { update(id, { bookmarked: !get(id).data.bookmarked }, { silent: true }); return draw(); }
      await openMemo(id);
      draw();
    }));
  };
  draw();
  return draw;
}

export function renderMemos(root, q) {
  const f = q.get('f');
  const s = (q.get('q') || '').toLowerCase();
  root.innerHTML = `${pageHead('sticky-note', '메모', '대사 한 줄, 장면 아이디어, 설정 조각… 짧게 휘갈겨 두는 곳이에요.', '', 'memo')}<div id="memo-board"></div>`;
  memoBoard(root.querySelector('#memo-board'), { folderId: f, search: s, filterHTML: folderFilter(f) });
  const open = q.get('open');
  if (open && get(open)) openMemo(open).then(() => { history.replaceState(null, '', '#/memo'); renderMemos(root, new URLSearchParams()); });
}
