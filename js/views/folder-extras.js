// 페어 폴더의 '사진' 탭 · '커미션' 탭
// - 사진: 이 폴더에 직접 모은 사진(올리기 / 이미지 주소) + 폴더 안 문서에 들어 있는 사진을 한곳에서 보기
// - 커미션: 커미션 링크를 위시리스트로 모으고, 사이트 제목·설명·대표 이미지를 미리보기 카드로 보여줌
//   (미리보기는 O-note 서버 함수 link-preview가 읽어 오고, 결과는 폴더에 저장해 같은 링크를 다시 부르지 않음)
import { store, update, inFolder, uuid } from '../store.js';
import { CONFIG } from '../config.js';
import { imgAttrs, icon, esc, emptyState, modal, toast, confirmBox, isRef, TYPES } from '../ui.js';
import { saveImage, LIMITS } from '../images.js';
import { itemHref } from '../common.js';

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

export function photoCount(d, folderId) { return (d.photos || []).length + (folderId ? docPhotos(folderId).length : 0); }

export function renderPhotos(body, f, rerender, view = 'all') {
  const d = f.data;
  const own = (d.photos || []).map((p) => ({ ...p, own: true }));
  const fromDocs = docPhotos(f.id);
  const list = view === 'own' ? own : view === 'docs' ? fromDocs : [...own, ...fromDocs];
  const cloud = store.mode === 'cloud';
  syncTab(body, 'photos', 'images', '사진', own.length + fromDocs.length);
  const seg = (k, label, n) => `<button type="button" data-view="${k}" class="${view === k ? 'on' : ''}">${label} <span class="muted">${n}</span></button>`;
  const tools = `<div class="toolbar-row ph-tools">
      <button class="btn primary" id="ph-up">${icon('upload', 16)} 사진 올리기</button>
      <button class="btn ghost" id="ph-url">${icon('link', 16)} 이미지 주소로 넣기</button>
      <div class="seg ph-seg">${seg('all', '전체', own.length + fromDocs.length)}${seg('own', '모은 사진', own.length)}${seg('docs', '문서 속 사진', fromDocs.length)}</div>
    </div>`;
  const card = (p, i) => `<figure class="ph-item" data-i="${i}">
      <img ${extImg(p.src)} alt="${esc(p.cap || '')}" loading="lazy">
      ${p.own ? (p.cap ? `<figcaption>${esc(p.cap)}</figcaption>` : '') : `<figcaption class="ph-from">${icon(TYPES[p.doc.type]?.icon || 'file', 12)} ${esc(p.doc.data.title || '제목 없음')}</figcaption>`}
    </figure>`;
  const empty = view === 'docs'
    ? emptyState('images', '폴더 문서에 사진이 없어요', '캐릭터 사진, 연성 표지, 본문에 넣은 사진이 여기에 자동으로 모여요.')
    : emptyState('images', '모아 둔 사진이 없어요', '공식 이미지, 레퍼런스, 받은 그림 등을 이 폴더에 모아보세요.');
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} 이 페어의 사진 자료를 모아봐요. 폴더 안 문서(캐릭터·연성 등)에 들어 있는 사진도 자동으로 함께 보여요.
      ${cloud ? ` 올린 사진은 계정 사진 공간(${Math.round(LIMITS.user / 1048576)}MB)을 같이 써요. <b>이미지 주소로 넣으면</b> 공간을 쓰지 않아요.` : ''}</p>
    ${tools}
    ${list.length ? `<div class="ph-grid">${list.map(card).join('')}</div>` : empty}`;
  bindBroken(body);

  body.querySelector('.ph-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) renderPhotos(body, f, rerender, b.dataset.view);
  });
  const again = () => renderPhotos(body, f, rerender, view === 'docs' ? 'all' : view);
  const add = (items) => update(f.id, (dd) => ({ ...dd, photos: [...items, ...(dd.photos || [])] }), { silent: true });

  body.querySelector('#ph-up').onclick = async () => {
    const files = (await pickFiles()).filter((x) => /^image\//.test(x.type));
    if (!files.length) return;
    const done = [];
    for (let k = 0; k < files.length; k++) {
      toast(files.length > 1 ? `사진을 올리는 중… (${k + 1}/${files.length})` : '사진을 올리는 중…');
      try { done.push({ id: uuid(), src: await saveImage(files[k], 'content'), cap: '', at: new Date().toISOString() }); } catch (e) { toast(e.message || '사진을 올리지 못했어요', 'error'); break; }
    }
    if (done.length) { add(done.reverse()); toast(`사진 ${done.length}장을 모았어요`, 'ok'); again(); }
  };
  body.querySelector('#ph-url').onclick = async () => {
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
    if (!v) return;
    add([{ id: uuid(), src: v.u, cap: v.c, at: new Date().toISOString() }]);
    toast('사진을 모았어요', 'ok');
    again();
  };
  body.querySelector('.ph-grid')?.addEventListener('click', (e) => {
    const fig = e.target.closest('.ph-item');
    if (fig) lightbox(f, list, +fig.dataset.i, again);
  });
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
    : `<div class="lb-foot"><span class="muted small">${icon(TYPES[p.doc.type]?.icon || 'file', 13)} '${esc(p.doc.data.title || '제목 없음')}' 문서에 들어 있는 사진이에요.</span>
              <a class="btn ghost sm" href="${itemHref(p.doc)}">${icon('file-text', 14)} 문서로 가기</a></div>`}`;
        const cap = box.querySelector('#lb-cap');
        if (cap) {
          cap.addEventListener('input', () => {
            p.cap = cap.value.trim();
            changed = true;
            update(f.id, (dd) => ({ ...dd, photos: (dd.photos || []).map((x) => (x.id === p.id ? { ...x, cap: p.cap } : x)) }), { silent: true });
          });
        }
        box.querySelector('#lb-del')?.addEventListener('click', async () => {
          if (!(await confirmBox('이 사진을 폴더에서 지울까요?', '지우기', true))) return;
          update(f.id, (dd) => ({ ...dd, photos: (dd.photos || []).filter((x) => x.id !== p.id) }), { silent: true });
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

function wishCard(w) {
  const st = STATUS[w.status] || STATUS.want;
  const site = w.site || host(w.url);
  return `<article class="card wish ${w.status === 'done' ? 'is-done' : ''}" data-id="${esc(w.id)}">
    <a class="wish-thumb ${w.image ? '' : 'ph'}" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(w.title || site)} 열기">
      ${w.image ? `<img ${extImg(w.image)} alt="" loading="lazy">` : icon('gift', 34)}
    </a>
    <div class="wish-body">
      <div class="wish-site">${w.icon ? `<img ${extImg(w.icon)} alt="" class="wish-fav">` : icon('globe', 13)}<span>${esc(site)}</span>
        <button type="button" class="chip ${st.cls} wish-st" data-act="status" title="상태 바꾸기">${icon(st.icon, 12)} ${st.label}</button></div>
      <a class="wish-title" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.title || site || w.url)}</a>
      ${w.desc ? `<p class="wish-desc">${esc(w.desc)}</p>` : ''}
      ${w.price || w.note ? `<div class="wish-meta">${w.price ? `<span class="chip">${esc(w.price)}</span>` : ''}${w.note ? `<span class="wish-note">${esc(w.note)}</span>` : ''}</div>` : ''}
      <div class="wish-act">
        <button type="button" class="icon-btn sm" data-act="edit" title="수정" aria-label="수정">${icon('pencil', 15)}</button>
        <button type="button" class="icon-btn sm" data-act="del" title="지우기" aria-label="지우기">${icon('trash', 15)}</button>
      </div>
    </div>
  </article>`;
}

export function renderWishes(body, f, rerender, filter = 'all') {
  const list = f.data.wishes || [];
  const shown = filter === 'all' ? list : list.filter((w) => (w.status || 'want') === filter);
  syncTab(body, 'wish', 'gift', '커미션', list.length);
  const cnt = (k) => list.filter((w) => (w.status || 'want') === k).length;
  const seg = (k, label, n) => `<button type="button" data-f="${k}" class="${filter === k ? 'on' : ''}">${label} <span class="muted">${n}</span></button>`;
  body.innerHTML = `
    <p class="hint">${icon('info', 14)} 받고 싶은 커미션 링크를 모아두는 위시리스트예요. 링크를 넣으면 사이트 제목·설명·대표 이미지를 미리보기 카드로 보여줘요. 카드의 상태 표시를 누르면 위시 → 신청함 → 받음 순서로 바뀌어요.</p>
    <div class="toolbar-row ph-tools">
      <button class="btn primary" id="w-add">${icon('plus', 16)} 커미션 링크 추가</button>
      ${list.length ? `<div class="seg ph-seg">${seg('all', '전체', list.length)}${Object.entries(STATUS).map(([k, s]) => seg(k, s.label, cnt(k))).join('')}</div>` : ''}
    </div>
    ${shown.length ? `<div class="wish-grid">${shown.map(wishCard).join('')}</div>`
    : emptyState('gift', list.length ? '이 상태의 커미션이 없어요' : '커미션 위시리스트가 비어 있어요', list.length ? '' : '마음에 드는 작가님의 커미션 링크를 모아보세요. 크레페, 포스타입, X(트위터) 등 어떤 링크든 괜찮아요.')}`;
  bindBroken(body);
  const again = (fl = filter) => renderWishes(body, f, rerender, fl);
  body.querySelector('.ph-seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) again(b.dataset.f); });
  const save = (fn) => update(f.id, (dd) => ({ ...dd, wishes: fn(dd.wishes || []) }), { silent: true });
  body.querySelector('#w-add').onclick = async () => {
    const w = await wishDialog();
    if (!w) return;
    save((ws) => [w, ...ws]);
    toast('위시리스트에 담았어요', 'ok');
    again(filter === 'all' || filter === w.status ? filter : 'all');
  };
  body.querySelector('.wish-grid')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('.wish').dataset.id;
    const w = list.find((x) => x.id === id);
    if (!w) return;
    if (b.dataset.act === 'status') {
      const order = Object.keys(STATUS);
      const next = order[(order.indexOf(w.status || 'want') + 1) % order.length];
      save((ws) => ws.map((x) => (x.id === id ? { ...x, status: next } : x)));
      toast(`'${STATUS[next].label}'(으)로 바꿨어요`, 'ok');
      again();
    }
    if (b.dataset.act === 'edit') {
      const nw = await wishDialog(w);
      if (nw) { save((ws) => ws.map((x) => (x.id === id ? nw : x))); again(); }
    }
    if (b.dataset.act === 'del') {
      if (!(await confirmBox(`'${w.title || host(w.url)}'을(를) 위시리스트에서 지울까요?`, '지우기', true))) return;
      save((ws) => ws.filter((x) => x.id !== id));
      again();
    }
  });
}

// 추가·수정 창: 링크 → 미리보기 불러오기 → 내용 다듬기 → 저장
function wishDialog(old) {
  const w = old ? { ...old } : { id: uuid(), url: '', title: '', desc: '', image: '', icon: '', site: '', price: '', status: 'want', note: '', at: new Date().toISOString() };
  const cloud = store.mode === 'cloud';
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
      <div class="wd-row">
        <div><label class="lbl">가격</label><input class="input" id="wd-price" maxlength="40" value="${esc(w.price)}" placeholder="예: 50,000원"></div>
        <div><label class="lbl">상태</label><div class="seg full" id="wd-st">${Object.entries(STATUS).map(([k, s]) => `<button type="button" data-s="${k}" class="${(w.status || 'want') === k ? 'on' : ''}">${s.label}</button>`).join('')}</div></div>
      </div>
      <label class="lbl">메모</label><input class="input" id="wd-note" maxlength="200" value="${esc(w.note)}" placeholder="예: 오픈일 12/5, 슬롯 3개">`,
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
          return {
            ...w, url, image,
            icon: host(url) === host(w.url) || !old ? w.icon : '',
            site: host(url) === host(w.url) || !old ? w.site || host(url) : host(url),
            title: m.querySelector('#wd-title').value.trim(), desc: m.querySelector('#wd-desc').value.trim(),
            price: m.querySelector('#wd-price').value.trim(), note: m.querySelector('#wd-note').value.trim(),
            status: m.querySelector('#wd-st .on')?.dataset.s || 'want',
          };
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
      $m('#wd-st').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; m.querySelectorAll('#wd-st button').forEach((x) => x.classList.toggle('on', x === b)); });
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
        // 새로 불러온 값으로 채움 (사용자가 적은 메모·가격·상태는 그대로)
        if (p.title) $m('#wd-title').value = p.title;
        if (p.desc) $m('#wd-desc').value = p.desc;
        if (p.image) $m('#wd-img').value = p.image;
        if (p.price && !$m('#wd-price').value.trim()) $m('#wd-price').value = p.price;
        msg.textContent = p.title || p.image ? '미리보기를 불러왔어요. 필요하면 고쳐서 저장하세요.' : '사이트에 미리보기 정보가 거의 없어요. 제목과 이미지를 직접 적어도 돼요.';
        drawPrev();
      };
      $m('#wd-fetch').onclick = run;
      $m('#wd-url').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(); } });
      // 링크를 붙여넣으면 바로 불러오기
      $m('#wd-url').addEventListener('paste', () => setTimeout(() => { if (!old && httpUrl($m('#wd-url').value)) run(); }, 0));
      drawPrev();
    },
  });
}
