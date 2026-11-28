// 페어 폴더의 '사진' 탭 · '커미션' 탭
// - 사진: 이 폴더에 직접 모은 사진(올리기 / 이미지 주소) + 폴더 안 문서에 들어 있는 사진을 한곳에서 보기
// - 커미션: 커미션 링크를 위시리스트로 모으고, 사이트 제목·설명·대표 이미지를 미리보기 카드로 보여줌
//   (미리보기는 O-note 서버 함수 link-preview가 읽어 오고, 결과는 폴더에 저장해 같은 링크를 다시 부르지 않음)
import { store, update, inFolder, uuid, all } from '../store.js';
import { CONFIG } from '../config.js';
import { imgAttrs, icon, esc, emptyState, modal, toast, confirmBox, isRef, TYPES, folderIcon } from '../ui.js';
import { saveImage, LIMITS } from '../images.js';
import { itemHref, pageHead } from '../common.js';

// ---------------- 공통 ----------------
const extImg = (src) => (isRef(src) ? imgAttrs(src) : `src="${esc(src)}" referrerpolicy="no-referrer"`);
const httpUrl = (raw) => {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^[a-z][\w+.-]*:/i.test(s)) s = `https://${s}`;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
};
const imgUrl = (raw) => { const u = httpUrl(raw); return u ? u.replace(/^http:/, 'https:') : ''; };
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// 깨진 외부 이미지는 자리만 남기고 흐리게
function bindBroken(root) {
  root.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG') t.classList.add('img-missing'); }, true);
}
// 폴더 위쪽 탭의 개수 표시를 지금 값으로 맞춤 (탭 안에서만 다시 그릴 때)
function syncTab(body, key, ic, label, n) {
  const t = body.parentElement?.querySelector(`.tab[href$="tab=${key}"]`);
  if (t) t.innerHTML = `${icon(ic, 16)} ${esc(`${label} ${n || ''}`)}`;
}
function pickFiles(accept = 'image/*') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = true;
    i.onchange = () => resolve([...i.files]);
    i.click();
  });
}

// ================= 사진 탭 =================
// 폴더 안 문서에 들어 있는 사진 모으기 (캐릭터 사진, 연성 표지, 본문 사진 등)
function docPhotos(folderId) {
  const seen = new Set();
  const out = [];
  inFolder(folderId).forEach((it) => {
    if (it.type === 'folder') return;
    const json = JSON.stringify(it.data);
    const found = [
      ...(json.match(/oimg:[\w-]+\/[\w.-]+/g) || []),
      ...[...json.matchAll(/<img[^>]*?\ssrc=\\"(https:\/\/[^"\\]+)\\"/g)].map((m) => m[1]),
      ...['image', 'cover'].map((k) => it.data[k]).filter((v) => typeof v === 'string' && /^(https:|data:image\/)/.test(v)),
      ...(json.match(/data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]{200,}/g) || []),
    ];
    found.forEach((src) => {
      if (seen.has(src)) return;
      seen.add(src);
      out.push({ src, doc: it });
    });
  });
  return out;
}

// 커미션 탭에 올린 작업물(받은 그림)
const wishPhotos = (d, f) => (d.wishes || []).flatMap((w) => (w.works || []).map((x) => ({ src: x.src, wish: w, folder: f })));

export function photoCount(d, folderId) { return (d.photos || []).length + wishPhotos(d).length + (folderId ? docPhotos(folderId).length : 0); }

export function renderPhotos(body, f, rerender, view = 'all') { photoView(body, [f], f, view); }

// 폴더 이름표 (여러 폴더를 모아 볼 때)
const folderTag = (f) => `<span class="ftag" style="--c:${esc(f.data.color || '#ccc')}">${esc(f.data.title || '폴더')}</span>`;

// 사진 목록 화면: single = 한 폴더(폴더 안 사진 탭) / null = 모든 폴더(사진 모음 메뉴)
function photoView(body, folders, single, view = 'all') {
  const own = []; const fromWish = []; const fromDocs = [];
  folders.forEach((f) => {
    (f.data.photos || []).forEach((p) => own.push({ ...p, own: true, folder: f }));
    fromWish.push(...wishPhotos(f.data, f));
    fromDocs.push(...docPhotos(f.id).map((x) => ({ ...x, folder: f })));
  });
  if (view === 'wish' && !fromWish.length) view = 'all';
  const list = view === 'own' ? own : view === 'docs' ? fromDocs : view === 'wish' ? fromWish : [...own, ...fromWish, ...fromDocs];
  const total = own.length + fromWish.length + fromDocs.length;
  const cloud = store.mode === 'cloud';
  if (single) syncTab(body, 'photos', 'images', '사진', total);
  const seg = (k, label, n) => `<button type="button" data-view="${k}" class="${view === k ? 'on' : ''}">${label} <span class="muted">${n}</span></button>`;
  const tools = `<div class="toolbar-row ph-tools">
      <button class="btn primary" id="ph-up">${icon('upload', 16)} 사진 올리기</button>
      <button class="btn ghost" id="ph-url">${icon('link', 16)} 이미지 주소로 넣기</button>
      <div class="seg ph-seg">${seg('all', '전체', total)}${seg('own', '모은 사진', own.length)}${fromWish.length ? seg('wish', '커미션 작업물', fromWish.length) : ''}${seg('docs', '문서 속 사진', fromDocs.length)}</div>
    </div>`;
  const tag = (p) => (single ? '' : folderTag(p.folder));
  const card = (p, i) => `<figure class="ph-item" data-i="${i}">
      <img ${extImg(p.src)} alt="${esc(p.cap || '')}" loading="lazy">
      ${tag(p) ? `<div class="ph-ftag">${tag(p)}</div>` : ''}
      ${p.own ? (p.cap ? `<figcaption>${esc(p.cap)}</figcaption>` : '') : p.wish ? `<figcaption class="ph-from">${icon('gift', 12)} ${esc(p.wish.title || host(p.wish.url) || '커미션')}</figcaption>` : `<figcaption class="ph-from">${icon(TYPES[p.doc.type]?.icon || 'file', 12)} ${esc(p.doc.data.title || '제목 없음')}</figcaption>`}
    </figure>`;
  const empty = view === 'docs'
    ? emptyState('images', single ? '폴더 문서에 사진이 없어요' : '폴더 문서에 사진이 없어요', '캐릭터 사진, 연성 표지, 본문에 넣은 사진이 여기에 자동으로 모여요.')
    : emptyState('images', '모아 둔 사진이 없어요', single ? '공식 이미지, 레퍼런스, 받은 그림 등을 이 폴더에 모아보세요.' : '사진을 올릴 때 어느 페어 폴더에 넣을지 고를 수 있어요.');
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} ${single ? '이 페어의 사진 자료를 모아봐요. 폴더 안 문서(캐릭터·연성 등)에 들어 있는 사진도 자동으로 함께 보여요.' : '모든 페어 폴더의 사진 자료를 한곳에서 봐요. 위에서 폴더를 고르면 그 폴더 사진만 보여요.'}
      ${cloud ? ` 올린 사진은 계정 사진 공간(${Math.round(LIMITS.user / 1048576)}MB)을 같이 써요. <b>이미지 주소로 넣으면</b> 공간을 쓰지 않아요.` : ''}</p>
    ${tools}
    ${list.length ? `<div class="ph-grid">${list.map(card).join('')}</div>` : empty}`;
  bindBroken(body);

  body.querySelector('.ph-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) photoView(body, folders, single, b.dataset.view);
  });
  const again = () => photoView(body, folders, single, view === 'docs' ? 'all' : view);
  const target = async () => single || pickFolder(folders, '사진을 넣을 폴더');
  body.querySelector('#ph-up').onclick = async () => { const f = await target(); if (f && await uploadPhotos(f)) again(); };
  body.querySelector('#ph-url').onclick = async () => { const f = await target(); if (f && await addPhotoUrl(f)) again(); };
  body.querySelector('.ph-grid')?.addEventListener('click', (e) => {
    const fig = e.target.closest('.ph-item');
    if (fig) lightbox(single, list, +fig.dataset.i, again);
  });
}

// 여러 폴더 중 하나 고르기 (폴더가 하나뿐이면 바로 그 폴더)
async function pickFolder(folders, title) {
  if (folders.length === 1) return folders[0];
  const id = await modal({
    title,
    body: `<div class="fpick-list">${folders.map((f) => `<button type="button" class="act" data-fid="${esc(f.id)}"><span class="fpick-ic">${folderIcon(f.data)}</span><b>${esc(f.data.title || '폴더')}</b></button>`).join('')}</div>`,
    onOpen: (w, close) => w.querySelector('.fpick-list').addEventListener('click', (e) => { const b = e.target.closest('[data-fid]'); if (b) close(b.dataset.fid); }),
  });
  return folders.find((f) => f.id === id) || null;
}

// 사진 올리기 / 주소로 넣기 (폴더 f에 저장) → 넣었으면 true
const addPhotos = (f, items) => update(f.id, (dd) => ({ ...dd, photos: [...items, ...(dd.photos || [])] }), { silent: true });
async function uploadPhotos(f) {
  const files = (await pickFiles()).filter((x) => /^image\//.test(x.type));
  if (!files.length) return false;
  const done = [];
  for (let k = 0; k < files.length; k++) {
    toast(files.length > 1 ? `사진을 올리는 중… (${k + 1}/${files.length})` : '사진을 올리는 중…');
    try { done.push({ id: uuid(), src: await saveImage(files[k], 'content'), cap: '', at: new Date().toISOString() }); } catch (e) { toast(e.message || '사진을 올리지 못했어요', 'error'); break; }
  }
  if (!done.length) return false;
  addPhotos(f, done.reverse());
  toast(`사진 ${done.length}장을 '${f.data.title || '폴더'}'에 모았어요`, 'ok');
  return true;
}
async function addPhotoUrl(f) {
  const v = await modal({
    title: '이미지 주소로 넣기',
    body: `<label class="lbl">이미지 주소</label><input class="input" id="u" placeholder="https://…/image.png" inputmode="url">
      <label class="lbl">설명 (선택)</label><input class="input" id="c" maxlength="120" placeholder="예: 공식 일러스트, 3권 표지">
      <p class="muted small">주소로 넣은 사진은 저장 공간을 쓰지 않아요. 원래 사이트에서 사진이 지워지면 여기서도 안 보여요.</p>`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, {
      label: '넣기', cls: 'primary', value: (w) => {
        const u = imgUrl(w.querySelector('#u').value);
        if (!u) { toast('이미지 주소를 확인해 주세요', 'error'); return false; }
        return { u, c: w.querySelector('#c').value.trim() };
      },
    }],
  });
  if (!v) return false;
  addPhotos(f, [{ id: uuid(), src: v.u, cap: v.c, at: new Date().toISOString() }]);
  toast('사진을 모았어요', 'ok');
  return true;
}

// 크게 보기 (좌우 넘기기, 설명 고치기, 지우기)
function lightbox(f, list, start, after) {
  let i = start;
  let changed = false;
  modal({
    title: '사진',
    wide: true,
    body: '<div class="lb"></div>',
    onOpen: (w, close) => {
      const box = w.querySelector('.lb');
      bindBroken(box);
      const draw = () => {
        const p = list[i];
        w.querySelector('.modal-head h3').textContent = `사진 ${i + 1} / ${list.length}`;
        box.innerHTML = `
          <div class="lb-stage">
            ${list.length > 1 ? `<button class="icon-btn lb-nav prev" data-go="-1" aria-label="이전 사진">${icon('chevron-left', 26)}</button>` : ''}
            <img ${extImg(p.src)} alt="${esc(p.cap || '')}">
            ${list.length > 1 ? `<button class="icon-btn lb-nav next" data-go="1" aria-label="다음 사진">${icon('chevron-right', 26)}</button>` : ''}
          </div>
          ${p.own ? `<div class="lb-foot">
              <input class="input" id="lb-cap" maxlength="120" placeholder="사진 설명 (선택)" value="${esc(p.cap || '')}">
              ${isRef(p.src) || /^data:/.test(p.src) ? '' : `<a class="btn ghost sm" href="${esc(p.src)}" target="_blank" rel="noopener noreferrer">${icon('link', 14)} 원본</a>`}
              <button class="btn ghost sm danger" id="lb-del">${icon('trash', 14)} 지우기</button>
            </div>`
    : p.wish ? `<div class="lb-foot"><span class="muted small">${icon('gift', 13)} '${esc(p.wish.title || host(p.wish.url) || '커미션')}' 커미션 작업물이에요.</span>
              <a class="btn ghost sm" href="#/folder/${esc((p.folder || f).id)}?tab=wish">${icon('gift', 14)} 커미션 탭으로</a></div>`
    : `<div class="lb-foot"><span class="muted small">${icon(TYPES[p.doc.type]?.icon || 'file', 13)} '${esc(p.doc.data.title || '제목 없음')}' 문서에 들어 있는 사진이에요.</span>
              <a class="btn ghost sm" href="${itemHref(p.doc)}">${icon('file-text', 14)} 문서로 가기</a></div>`}`;
        const cap = box.querySelector('#lb-cap');
        if (cap) {
          cap.addEventListener('input', () => {
            p.cap = cap.value.trim();
            changed = true;
            update((p.folder || f).id, (dd) => ({ ...dd, photos: (dd.photos || []).map((x) => (x.id === p.id ? { ...x, cap: p.cap } : x)) }), { silent: true });
          });
        }
        box.querySelector('#lb-del')?.addEventListener('click', async () => {
          if (!(await confirmBox('이 사진을 폴더에서 지울까요?', '지우기', true))) return;
          update((p.folder || f).id, (dd) => ({ ...dd, photos: (dd.photos || []).filter((x) => x.id !== p.id) }), { silent: true });
          changed = true;
          list.splice(i, 1);
          if (!list.length) { close(true); return; }
          i = Math.min(i, list.length - 1);
          draw();
        });
        box.querySelector('a[href^="#/"]')?.addEventListener('click', () => close(null));
      };
      const go = (n) => { i = (i + n + list.length) % list.length; draw(); };
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
      const onKey = (e) => {
        if (!document.body.contains(w)) { document.removeEventListener('keydown', onKey); return; }
        if (e.target.closest?.('input,textarea')) return;
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      };
      document.addEventListener('keydown', onKey);
      // 모바일: 좌우로 밀어서 넘기기
      let x0 = null;
      box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && list.length > 1) go(dx < 0 ? 1 : -1); });
      draw();
    },
  }).then(() => { if (changed) after(); });
}

// ================= 커미션 탭 =================
const STATUS = {
  want: { label: '위시', icon: 'sparkles', cls: '' },
  asked: { label: '신청함', icon: 'send', cls: 'warn' },
  done: { label: '받음', icon: 'circle-check', cls: 'ok' },
};

// 링크 미리보기 읽어 오기 (O-note 서버 함수) → { title, desc, image, icon, site, price } 또는 null
async function fetchPreview(url) {
  if (store.mode !== 'cloud' || !store.sb) return { error: 'local' };
  try {
    const { data: s } = await store.sb.auth.getSession();
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/link-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.session?.access_token || ''}` },
      body: JSON.stringify({ url }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok || !b.ok) return { error: b.error || 'fetch_failed' };
    return {
      title: String(b.title || '').slice(0, 200), desc: String(b.desc || '').slice(0, 300),
      image: imgUrl(b.image), icon: imgUrl(b.icon), site: String(b.site || '').slice(0, 80), price: String(b.price || '').slice(0, 40),
    };
  } catch { return { error: 'network' }; }
}


// ---------- 날짜 · 금액 도우미 ----------
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const dayDiff = (s) => { const [y, m, d] = s.split('-').map(Number); const [ty, tm, td] = today().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5); };
const shortDate = (s) => (isDate(s) ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : '');
// 마감일 표시: D-3, D-day, 2일 지남 (받은 커미션은 표시 안 함)
function ddayHTML(w) {
  if (!isDate(w.dueAt) || w.status === 'done') return '';
  const n = dayDiff(w.dueAt);
  const label = n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `${-n}일 지남`;
  return `<span class="chip dday ${n < 0 ? 'late' : n <= 3 ? 'warn' : ''}" title="마감일 ${esc(w.dueAt)}">${icon('clock', 12)} ${label}</span>`;
}
const toNum = (s) => { const m = String(s || '').replace(/\s/g, '').match(/\d[\d,]*(?:\.\d+)?/); return m ? Number(m[0].replace(/,/g, '')) : NaN; };
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
// 예전 데이터(가격 한 칸)도 가격표로 읽음
const pricesOf = (w) => (Array.isArray(w.prices) ? w.prices : w.price ? [{ name: '', amount: w.price, pick: false }] : []);
// 신청한 항목의 합계 (금액을 숫자로 읽을 수 있는 것만)
function pickedTotal(w) {
  const picked = pricesOf(w).filter((p) => p.pick);
  const nums = picked.map((p) => toNum(p.amount)).filter((n) => Number.isFinite(n));
  return { picked, sum: nums.reduce((a, b) => a + b, 0), counted: nums.length };
}
const priceLabel = (p) => [p.name, p.amount].filter(Boolean).join(' ');
// 상태를 바꿀 때 날짜 자동 채우기
function withStatus(w, status) {
  const nw = { ...w, status };
  if (status !== 'want' && !nw.appliedAt) nw.appliedAt = today();
  if (status === 'done' && !nw.doneAt) nw.doneAt = today();
  return nw;
}

function wishCard(w, tag = '') {
  const st = STATUS[w.status] || STATUS.want;
  const site = w.site || host(w.url);
  const prices = pricesOf(w);
  const { picked, sum, counted } = pickedTotal(w);
  const works = w.works || [];
  const showPrices = prices.slice(0, 3);
  const dates = w.status !== 'want' && (w.appliedAt || w.dueAt || w.doneAt)
    ? `<div class="wish-dates">${w.appliedAt ? `<span>신청 ${shortDate(w.appliedAt)}</span>` : ''}${w.dueAt ? `<span>마감 ${shortDate(w.dueAt)}</span>` : ''}${w.status === 'done' && w.doneAt ? `<span>받음 ${shortDate(w.doneAt)}</span>` : ''}${ddayHTML(w)}</div>` : '';
  return `<article class="card wish ${w.status === 'done' ? 'is-done' : ''}" data-id="${esc(w.id)}">
    <a class="wish-thumb ${w.image ? '' : 'ph'}" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(w.title || site)} 열기">
      ${w.image ? `<img ${extImg(w.image)} alt="" loading="lazy">` : icon('gift', 34)}
    </a>
    <div class="wish-body">
      ${tag ? `<div class="wish-ftag">${tag}</div>` : ''}
      <div class="wish-site">${w.icon ? `<img ${extImg(w.icon)} alt="" class="wish-fav">` : icon('globe', 13)}<span>${esc(site)}</span>
        <button type="button" class="chip ${st.cls} wish-st" data-act="status" title="상태 바꾸기">${icon(st.icon, 12)} ${st.label}</button></div>
      <a class="wish-title" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.title || site || w.url)}</a>
      ${w.desc ? `<p class="wish-desc">${esc(w.desc)}</p>` : ''}
      ${prices.length ? `<div class="wish-meta">${showPrices.map((p) => `<span class="chip ${p.pick ? 'picked' : ''}" ${p.pick ? 'title="신청한 항목"' : ''}>${p.pick ? icon('check', 11) : ''}${esc(priceLabel(p))}</span>`).join('')}${prices.length > 3 ? `<span class="muted small">외 ${prices.length - 3}개</span>` : ''}</div>` : ''}
      ${picked.length && counted ? `<div class="wish-sum small">신청 금액 <b>${won(sum)}</b></div>` : ''}
      ${dates}
      ${works.length ? `<div class="wish-works">${works.slice(0, 4).map((x) => `<img ${extImg(x.src)} alt="" loading="lazy">`).join('')}${works.length > 4 ? `<span>+${works.length - 4}</span>` : ''}</div>` : ''}
      ${w.note ? `<div class="wish-note small">${esc(w.note)}</div>` : ''}
      <div class="wish-act">
        <button type="button" class="icon-btn sm" data-act="edit" title="수정" aria-label="수정">${icon('pencil', 15)}</button>
        <button type="button" class="icon-btn sm" data-act="del" title="지우기" aria-label="지우기">${icon('trash', 15)}</button>
      </div>
    </div>
  </article>`;
}

// 관리표: 신청·받은 커미션의 날짜·금액·작업물을 한 번에
function manageTable(list, tagOf = () => '') {
  const rank = { asked: 0, done: 1, want: 2 };
  const rows = [...list].sort((a, b) => {
    const s = (rank[a.status || 'want'] ?? 2) - (rank[b.status || 'want'] ?? 2);
    if (s) return s;
    if ((a.status || 'want') === 'done') return (b.doneAt || '').localeCompare(a.doneAt || '');
    return (a.dueAt || '9999').localeCompare(b.dueAt || '9999');
  });
  const asked = list.filter((w) => w.status === 'asked');
  const late = asked.filter((w) => isDate(w.dueAt) && dayDiff(w.dueAt) < 0).length;
  const soon = asked.filter((w) => isDate(w.dueAt) && dayDiff(w.dueAt) >= 0 && dayDiff(w.dueAt) <= 7).length;
  const spent = list.filter((w) => w.status !== 'want').reduce((a, w) => a + pickedTotal(w).sum, 0);
  const cell = (label, v) => `<td data-l="${label}"><span class="wm-v">${v || '<span class="muted">-</span>'}</span></td>`;
  return `<div class="wm-sum">
      <div><b>${asked.length}</b><span>진행 중</span></div>
      <div class="${soon ? 'warn' : ''}"><b>${soon}</b><span>7일 안 마감</span></div>
      <div class="${late ? 'late' : ''}"><b>${late}</b><span>마감 지남</span></div>
      <div><b>${spent ? won(spent) : '-'}</b><span>신청 금액 합계</span></div>
    </div>
    <div class="wm-scroll"><table class="wm-table">
      <thead><tr><th>커미션</th><th>상태</th><th>신청 항목</th><th>신청일</th><th>마감일</th><th>받은 날</th><th>작업물</th></tr></thead>
      <tbody>${rows.map((w) => {
    const st = STATUS[w.status] || STATUS.want;
    const { picked, sum, counted } = pickedTotal(w);
    const works = w.works || [];
    return `<tr data-id="${esc(w.id)}" tabindex="0">
          <td class="wm-title" data-l="커미션"><b>${esc(w.title || w.site || host(w.url))}</b><span class="muted small">${tagOf(w)}${esc(w.site || host(w.url))}</span></td>
          ${cell('상태', `<span class="chip ${st.cls}">${icon(st.icon, 12)} ${st.label}</span>`)}
          ${cell('신청 항목', picked.length ? `${esc(picked.map(priceLabel).join(', '))}${counted && picked.length > 1 ? `<br><b>${won(sum)}</b>` : ''}` : '')}
          ${cell('신청일', isDate(w.appliedAt) ? esc(w.appliedAt) : '')}
          ${cell('마감일', isDate(w.dueAt) ? `${esc(w.dueAt)} ${ddayHTML(w)}` : '')}
          ${cell('받은 날', w.status === 'done' && isDate(w.doneAt) ? esc(w.doneAt) : '')}
          ${cell('작업물', works.length ? `<span class="wm-works">${works.slice(0, 3).map((x) => `<img ${extImg(x.src)} alt="" loading="lazy">`).join('')}${works.length > 3 ? `<span>+${works.length - 3}</span>` : ''}</span>` : '')}
        </tr>`;
  }).join('')}</tbody>
    </table></div>
    <p class="muted small">줄을 누르면 신청일·마감일·작업물을 고칠 수 있어요.</p>`;
}

let wishMode = 'cards';
try { wishMode = localStorage.getItem('onote-wish-mode') === 'table' ? 'table' : 'cards'; } catch { /* noop */ }

export function renderWishes(body, f, rerender, filter = 'all') { wishView(body, [f], f, filter); }

// 커미션 목록 화면: single = 한 폴더(폴더 안 커미션 탭) / null = 모든 폴더(커미션 메뉴)
function wishView(body, folders, single, filter = 'all') {
  const owner = new Map(); // 커미션 id → 폴더
  const list = folders.flatMap((f) => (f.data.wishes || []).map((w) => { owner.set(w.id, f); return w; }));
  const shown = filter === 'all' ? list : list.filter((w) => (w.status || 'want') === filter);
  if (single) syncTab(body, 'wish', 'gift', '커미션', list.length);
  const tagOf = single ? () => '' : (w) => folderTag(owner.get(w.id));
  const cnt = (k) => list.filter((w) => (w.status || 'want') === k).length;
  const seg = (k, label, n) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${label} <span class="muted">${n}</span></button>`;
  const modeSeg = `<div class="seg wm-mode"><button type="button" data-m="cards" class="${wishMode === 'cards' ? 'on' : ''}">${icon('layout-dashboard', 14)} 카드</button><button type="button" data-m="table" class="${wishMode === 'table' ? 'on' : ''}">${icon('table', 14)} 관리표</button></div>`;
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} ${single ? '받고 싶은 커미션 링크를 모아두는 위시리스트예요.' : '모든 페어 폴더의 커미션을 한곳에서 봐요. 위에서 폴더를 고르면 그 폴더 커미션만 보여요.'} 가격은 항목별로 여러 개 적을 수 있고, 신청한 커미션은 신청일·마감일·작업물까지 함께 관리해요. <b>관리표</b>에서 진행 중인 커미션을 마감 순서로 한눈에 볼 수 있어요.</p>
    <div class="toolbar-row ph-tools">
      <button class="btn primary" id="w-add">${icon('plus', 16)} 커미션 링크 추가</button>
      ${list.length ? modeSeg : ''}
      ${list.length ? `<div class="seg ph-seg">${seg('all', '전체', list.length)}${Object.entries(STATUS).map(([k, s]) => seg(k, s.label, cnt(k))).join('')}</div>` : ''}
    </div>
    ${shown.length ? (wishMode === 'table' ? manageTable(shown, tagOf) : `<div class="wish-grid">${shown.map((w) => wishCard(w, tagOf(w))).join('')}</div>`)
    : emptyState('gift', list.length ? '이 상태의 커미션이 없어요' : '커미션 위시리스트가 비어 있어요', list.length ? '' : `마음에 드는 작가님의 커미션 링크를 모아보세요. 크레페, 포스타입, X(트위터) 등 어떤 링크든 괜찮아요.${single ? '' : ' 담을 때 어느 페어 폴더에 넣을지 고를 수 있어요.'}`)}`;
  bindBroken(body);
  const again = (fl = filter) => wishView(body, folders, single, fl);
  body.querySelector('.ph-seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) again(b.dataset.f); });
  body.querySelector('.wm-mode')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    wishMode = b.dataset.m;
    try { localStorage.setItem('onote-wish-mode', wishMode); } catch { /* noop */ }
    again();
  });
  const save = (f, fn) => update(f.id, (dd) => ({ ...dd, wishes: fn(dd.wishes || []) }), { silent: true });
  const edit = async (w) => {
    const f = owner.get(w.id);
    const nw = await wishDialog(w);
    if (nw && f) { save(f, (ws) => ws.map((x) => (x.id === w.id ? nw : x))); again(); }
  };
  body.querySelector('#w-add').onclick = async () => {
    const f = single || await pickFolder(folders, '커미션을 담을 폴더');
    if (!f) return;
    const w = await wishDialog();
    if (!w) return;
    save(f, (ws) => [w, ...ws]);
    toast(single ? '위시리스트에 담았어요' : `'${f.data.title || '폴더'}' 위시리스트에 담았어요`, 'ok');
    again(filter === 'all' || filter === w.status ? filter : 'all');
  };
  const table = body.querySelector('.wm-table');
  if (table) {
    const open = (tr) => { const w = list.find((x) => x.id === tr?.dataset.id); if (w) edit(w); };
    table.addEventListener('click', (e) => { if (e.target.closest('a')) return; open(e.target.closest('tr[data-id]')); });
    table.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e.target.closest('tr[data-id]')); });
  }
  body.querySelector('.wish-grid')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.wish').dataset.id;
    const w = list.find((x) => x.id === id);
    const f = owner.get(id);
    if (!w || !f) return;
    if (b.dataset.act === 'status') {
      const order = Object.keys(STATUS);
      const next = order[(order.indexOf(w.status || 'want') + 1) % order.length];
      save(f, (ws) => ws.map((x) => (x.id === id ? withStatus(x, next) : x)));
      toast(`'${STATUS[next].label}'(으)로 바꿨어요`, 'ok');
      again();
    }
    if (b.dataset.act === 'edit') edit(w);
    if (b.dataset.act === 'del') {
      if (!(await confirmBox(`'${w.title || host(w.url)}'을(를) 위시리스트에서 지울까요?`, '지우기', true))) return;
      save(f, (ws) => ws.filter((x) => x.id !== id));
      again();
    }
  });
}

// ================= 좌측 메뉴: 사진 모음 · 커미션 (모든 폴더) =================
function allView(root, q, { key, ic, title, desc, render }) {
  const folders = all('folder');
  const fid = q.get('f') || '';
  const cur = folders.find((f) => f.id === fid) || null;
  root.innerHTML = `${pageHead(ic, title, desc, '', 'folder')}
    ${folders.length ? `<div class="fsel" role="tablist">
      <a class="fsel-c ${cur ? '' : 'on'}" href="#/${key}">${icon('folders', 14)} 모든 폴더</a>
      ${folders.map((f) => `<a class="fsel-c ${cur?.id === f.id ? 'on' : ''}" href="#/${key}?f=${esc(f.id)}" style="--c:${esc(f.data.color || '#ccc')}"><i></i>${esc(f.data.title || '폴더')}</a>`).join('')}
    </div><div id="all-body"></div>`
    : emptyState('folder-heart', '아직 페어 폴더가 없어요', '사진과 커미션은 페어 폴더에 모아요. 먼저 폴더를 만들어 보세요.', '<a class="btn primary" href="#/folders">페어 폴더로 가기</a>')}`;
  const body = root.querySelector('#all-body');
  if (!body) return;
  render(body, cur ? [cur] : folders, cur);
}
export function renderAllPhotos(root, q) {
  allView(root, q, { key: 'photos', ic: 'images', title: '사진 모음', desc: '모든 페어 폴더의 사진 자료와 받은 커미션 작업물을 한곳에서 봐요.', render: (b, fs, cur) => photoView(b, fs, cur) });
}
export function renderAllWishes(root, q) {
  allView(root, q, { key: 'commissions', ic: 'gift', title: '커미션', desc: '모든 페어 폴더의 커미션 위시리스트와 신청한 커미션을 한곳에서 관리해요.', render: (b, fs, cur) => wishView(b, fs, cur) });
}

// 추가·수정 창: 링크 → 미리보기 → 가격표 → 신청 정보(신청일·마감일·받은 날·작업물) → 메모
function wishDialog(old) {
  const base = { id: uuid(), url: '', title: '', desc: '', image: '', icon: '', site: '', status: 'want', note: '', appliedAt: '', dueAt: '', doneAt: '', works: [], at: new Date().toISOString() };
  const w = { ...base, ...(old || {}) };
  const prices = pricesOf(w).map((p) => ({ name: p.name || '', amount: p.amount || '', pick: !!p.pick }));
  if (!prices.length) prices.push({ name: '', amount: '', pick: false });
  const works = (w.works || []).map((x) => ({ ...x }));
  let status = w.status || 'want';
  const cloud = store.mode === 'cloud';
  const statusSeg = Object.entries(STATUS).map(([k, s]) => `<button type="button" data-s="${k}" class="${status === k ? 'on' : ''}">${s.label}</button>`).join('');
  return modal({
    title: old ? '커미션 수정' : '커미션 링크 추가',
    body: `
      <label class="lbl">커미션 링크</label>
      <div class="wd-url"><input class="input" id="wd-url" inputmode="url" placeholder="https://crepe.cm/… , https://posty.pe/…" value="${esc(w.url)}">
        <button type="button" class="btn ghost" id="wd-fetch">${icon(old ? 'rotate-ccw' : 'search', 16)} ${old ? '다시 불러오기' : '미리보기'}</button></div>
      <p class="muted small" id="wd-msg">${cloud ? '링크를 넣고 미리보기를 누르면 사이트 정보를 채워줘요.' : '체험 모드에서는 미리보기를 불러올 수 없어요. 제목과 이미지를 직접 적어주세요.'}</p>
      <div id="wd-prev"></div>
      <label class="lbl">제목</label><input class="input" id="wd-title" maxlength="200" value="${esc(w.title)}" placeholder="예: OO작가님 반신 커미션">
      <label class="lbl">설명</label><textarea class="input" id="wd-desc" rows="2" maxlength="300">${esc(w.desc)}</textarea>
      <label class="lbl">대표 이미지 주소 <span class="muted small">(비워도 돼요)</span></label><input class="input" id="wd-img" inputmode="url" value="${esc(w.image)}" placeholder="https://…">

      <label class="lbl">가격표 <span class="muted small">(항목별로 여러 개)</span></label>
      <div id="wd-prices"></div>
      <div class="wd-price-foot"><button type="button" class="btn ghost sm" id="wd-padd">${icon('plus', 14)} 가격 추가</button><span class="small" id="wd-total"></span></div>

      <label class="lbl">상태</label><div class="seg full" id="wd-st">${statusSeg}</div>
      <fieldset class="wd-apply" id="wd-apply">
        <legend>${icon('send', 14)} 신청 정보</legend>
        <div class="wd-dates">
          <div><label class="lbl">신청일</label><input class="input" type="date" id="wd-applied" value="${esc(w.appliedAt)}"></div>
          <div><label class="lbl">마감일 <span class="muted small">(완성 예정)</span></label><input class="input" type="date" id="wd-due" value="${esc(w.dueAt)}"></div>
          <div class="wd-done-only"><label class="lbl">받은 날</label><input class="input" type="date" id="wd-done" value="${esc(w.doneAt)}"></div>
        </div>
        <label class="lbl">작업물 <span class="muted small">(받은 그림·중간 확인본, 사진 탭에도 모여요)</span></label>
        <div class="wd-works" id="wd-works"></div>
        <div class="btn-row"><button type="button" class="btn ghost sm" id="wd-wup">${icon('upload', 14)} 작업물 올리기</button><button type="button" class="btn ghost sm" id="wd-wurl">${icon('link', 14)} 주소로 넣기</button></div>
      </fieldset>
      <label class="lbl">메모</label><input class="input" id="wd-note" maxlength="200" value="${esc(w.note)}" placeholder="예: 오픈일 12/5, 입금 완료, 수정 1회 남음">`,
    actions: [
      { label: '취소', cls: 'ghost', value: () => null },
      {
        label: old ? '저장' : '담기', cls: 'primary', icon: old ? 'save' : 'gift',
        value: (m) => {
          const url = httpUrl(m.querySelector('#wd-url').value);
          if (!url) { toast('커미션 링크를 확인해 주세요', 'error'); return false; }
          const imgRaw = m.querySelector('#wd-img').value.trim();
          const image = imgRaw ? imgUrl(imgRaw) : '';
          if (imgRaw && !image) { toast('대표 이미지 주소를 확인해 주세요', 'error'); return false; }
          const sameHost = host(url) === host(w.url) || !old;
          const out = {
            ...w, url, image,
            icon: sameHost ? w.icon : '',
            site: sameHost ? w.site || host(url) : host(url),
            title: m.querySelector('#wd-title').value.trim(), desc: m.querySelector('#wd-desc').value.trim(),
            prices: prices.map((p) => ({ name: p.name.trim(), amount: p.amount.trim(), pick: status !== 'want' && p.pick })).filter((p) => p.name || p.amount),
            note: m.querySelector('#wd-note').value.trim(),
            status,
            appliedAt: m.querySelector('#wd-applied').value, dueAt: m.querySelector('#wd-due').value,
            doneAt: status === 'done' ? m.querySelector('#wd-done').value : '',
            works,
          };
          delete out.price; // 예전 가격 한 칸은 가격표로 옮김
          return out;
        },
      },
    ],
    onOpen: (m) => {
      const $m = (s) => m.querySelector(s);
      bindBroken(m);
      const drawPrev = () => {
        const url = httpUrl($m('#wd-url').value);
        const img = imgUrl($m('#wd-img').value);
        const title = $m('#wd-title').value.trim();
        $m('#wd-prev').innerHTML = url ? `<div class="wd-prev">${img ? `<img ${extImg(img)} alt="">` : `<span class="ph">${icon('gift', 26)}</span>`}<div><span class="muted small">${esc(w.site || host(url))}</span><b>${esc(title || host(url))}</b></div></div>` : '';
      };
      // ----- 가격표 -----
      const drawTotal = () => {
        const t = pickedTotal({ prices });
        $m('#wd-total').innerHTML = status !== 'want' && t.picked.length ? (t.counted ? `신청 금액 <b>${won(t.sum)}</b>` : '') : '';
      };
      const drawPrices = () => {
        const applied = status !== 'want';
        $m('#wd-prices').innerHTML = prices.map((p, i) => `<div class="wd-price" data-i="${i}">
            <input class="input" data-k="name" maxlength="40" placeholder="항목 (예: 반신)" value="${esc(p.name)}">
            <input class="input" data-k="amount" maxlength="40" placeholder="가격 (예: 50,000원)" value="${esc(p.amount)}">
            ${applied ? `<label class="wd-pick" title="신청한 항목"><input type="checkbox" data-k="pick" ${p.pick ? 'checked' : ''}> 신청</label>` : ''}
            <button type="button" class="icon-btn sm" data-rm="${i}" aria-label="가격 지우기" title="지우기">${icon('x', 14)}</button>
          </div>`).join('');
        drawTotal();
      };
      $m('#wd-prices').addEventListener('input', (e) => {
        const row = e.target.closest('.wd-price'); if (!row) return;
        const p = prices[+row.dataset.i]; const k = e.target.dataset.k;
        if (k === 'pick') p.pick = e.target.checked; else if (k) p[k] = e.target.value;
        drawTotal();
      });
      $m('#wd-prices').addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]'); if (!rm) return;
        prices.splice(+rm.dataset.rm, 1);
        if (!prices.length) prices.push({ name: '', amount: '', pick: false });
        drawPrices();
      });
      $m('#wd-padd').onclick = () => { prices.push({ name: '', amount: '', pick: false }); drawPrices(); $m('#wd-prices .wd-price:last-child input')?.focus(); };
      // ----- 상태 · 신청 정보 -----
      const drawApply = () => {
        $m('#wd-apply').hidden = status === 'want';
        $m('.wd-done-only').hidden = status !== 'done';
      };
      $m('#wd-st').addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        status = b.dataset.s;
        m.querySelectorAll('#wd-st button').forEach((x) => x.classList.toggle('on', x === b));
        if (status !== 'want' && !$m('#wd-applied').value) $m('#wd-applied').value = today();
        if (status === 'done' && !$m('#wd-done').value) $m('#wd-done').value = today();
        drawApply(); drawPrices();
      });
      // ----- 작업물 -----
      const drawWorks = () => {
        $m('#wd-works').innerHTML = works.length ? works.map((x, i) => `<div class="wd-work"><img ${extImg(x.src)} alt=""><button type="button" class="icon-btn sm" data-wrm="${i}" aria-label="작업물 지우기" title="지우기">${icon('x', 13)}</button></div>`).join('') : '<span class="muted small">아직 없어요</span>';
      };
      $m('#wd-works').addEventListener('click', (e) => { const b = e.target.closest('[data-wrm]'); if (b) { works.splice(+b.dataset.wrm, 1); drawWorks(); } });
      $m('#wd-wup').onclick = async () => {
        const files = (await pickFiles()).filter((x) => /^image\//.test(x.type));
        for (let k = 0; k < files.length; k++) {
          toast(files.length > 1 ? `작업물을 올리는 중… (${k + 1}/${files.length})` : '작업물을 올리는 중…');
          try { works.push({ id: uuid(), src: await saveImage(files[k], 'content') }); drawWorks(); } catch (err) { toast(err.message || '사진을 올리지 못했어요', 'error'); break; }
        }
      };
      $m('#wd-wurl').onclick = () => {
        const row = document.createElement('div');
        row.className = 'wd-url';
        row.innerHTML = `<input class="input" placeholder="https://…/image.png" inputmode="url"><button type="button" class="btn ghost sm">${icon('plus', 14)} 넣기</button>`;
        $m('#wd-wurl').closest('.btn-row').after(row);
        const inp = row.querySelector('input');
        const addUrl = () => { const u = imgUrl(inp.value); if (!u) { toast('이미지 주소를 확인해 주세요', 'error'); return; } works.push({ id: uuid(), src: u }); drawWorks(); row.remove(); };
        row.querySelector('button').onclick = addUrl;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addUrl(); } });
        inp.focus();
      };
      // ----- 미리보기 -----
      ['#wd-url', '#wd-img', '#wd-title'].forEach((s) => $m(s).addEventListener('input', drawPrev));
      const run = async () => {
        const url = httpUrl($m('#wd-url').value);
        if (!url) { toast('커미션 링크를 확인해 주세요', 'error'); return; }
        $m('#wd-url').value = url;
        const msg = $m('#wd-msg');
        if (!cloud) { msg.textContent = '체험 모드에서는 미리보기를 불러올 수 없어요. 제목과 이미지를 직접 적어주세요.'; return; }
        const btn = $m('#wd-fetch');
        btn.disabled = true;
        msg.textContent = '사이트 정보를 읽는 중…';
        const p = await fetchPreview(url);
        btn.disabled = false;
        if (p.error) {
          msg.textContent = '이 사이트는 미리보기를 읽지 못했어요. 제목과 이미지 주소를 직접 적어도 돼요.';
          if (!$m('#wd-title').value.trim()) $m('#wd-title').value = host(url);
          w.site = host(url); w.icon = '';
          drawPrev();
          return;
        }
        w.site = p.site || host(url); w.icon = p.icon;
        if (p.title) $m('#wd-title').value = p.title;
        if (p.desc) $m('#wd-desc').value = p.desc;
        if (p.image) $m('#wd-img').value = p.image;
        // 사이트에 가격 정보가 있으면 빈 가격 칸에 넣음
        if (p.price && !prices.some((x) => x.amount.trim())) { prices[0].amount = p.price; drawPrices(); }
        msg.textContent = p.title || p.image ? '미리보기를 불러왔어요. 필요하면 고쳐서 저장하세요.' : '사이트에 미리보기 정보가 거의 없어요. 제목과 이미지를 직접 적어도 돼요.';
        drawPrev();
      };
      $m('#wd-fetch').onclick = run;
      $m('#wd-url').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(); } });
      $m('#wd-url').addEventListener('paste', () => setTimeout(() => { if (!old && httpUrl($m('#wd-url').value)) run(); }, 0));
      drawPrev(); drawPrices(); drawApply(); drawWorks();
    },
  });
}
