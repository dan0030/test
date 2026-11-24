// 우편함 · 건의함 (계정 로그인 시)
// 데이터는 모두 서버 함수(RPC)로만 주고받음 → 본인 것만 보임
import { store } from '../store.js';
import { icon, esc, emptyState, toast, timeAgo, confirmBox } from '../ui.js';
import { pageHead } from '../common.js';

const sb = () => store.sb;
const needCloud = (root, ic, title) => {
  root.innerHTML = `${pageHead(ic, title, '계정으로 로그인하면 쓸 수 있어요.')}${emptyState('cloud-off', '체험 모드에서는 쓸 수 없어요', '회원가입 후 로그인하면 이용할 수 있어요.')}`;
};
const text = (s) => esc(s || '').replace(/\n/g, '<br>');
const dateStr = (iso) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

export function inviteLink(code) {
  return `${location.origin}${location.pathname}#/signup?invite=${encodeURIComponent(code)}`;
}
export async function copy(t, msg = '복사했어요') {
  try { await navigator.clipboard.writeText(t); toast(msg, 'ok'); } catch { prompt('복사해서 쓰세요', t); }
}

// 안 읽은 우편 수 (메뉴 배지)
export async function unreadCount() {
  if (store.mode !== 'cloud' || !sb()) return 0;
  const { data, error } = await sb().rpc('my_mail_unread');
  return error ? 0 : data || 0;
}
export async function refreshMailBadge() {
  const n = await unreadCount();
  document.querySelectorAll('[data-mail-badge]').forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; });
}

function codeRow(c) {
  const left = Math.max(0, c.max - c.used);
  const expired = c.exp && new Date(c.exp) < new Date();
  const state = !c.active ? '사용 중지됨' : expired ? '기간 지남' : left ? `${left}회 남음` : '모두 사용됨';
  const ok = c.active && !expired && left > 0;
  return `<div class="code-row ${ok ? '' : 'off'}">
    <code>${esc(c.code)}</code><span class="chip">${state}</span>${c.exp ? `<span class="muted small">~${dateStr(c.exp)}</span>` : ''}
    <span class="grow"></span>
    ${ok ? `<button class="btn ghost sm" data-copy="${esc(c.code)}">${icon('copy', 14)}<span>코드</span></button><button class="btn ghost sm" data-link="${esc(c.code)}">${icon('link', 14)}<span>초대 링크</span></button>` : ''}
  </div>`;
}

// ---------- 우편함 ----------
export async function renderMail(root) {
  if (store.mode !== 'cloud') return needCloud(root, 'mail', '우편함');
  root.innerHTML = `${pageHead('mail', '우편함', '운영자가 보내는 소식과 이벤트 선물(초대 코드)을 받아요.')}<div id="mail-list"><div class="center-box"><div class="spinner"></div></div></div>`;
  const box = root.querySelector('#mail-list');
  let open = null;
  const load = async () => {
    const { data, error } = await sb().rpc('my_mails');
    if (error) { box.innerHTML = emptyState('cloud-off', '우편을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); return; }
    const mails = data || [];
    if (!mails.length) { box.innerHTML = emptyState('mail', '받은 우편이 없어요', '운영자의 공지나 이벤트 선물이 오면 여기에 표시돼요.'); refreshMailBadge(); return; }
    box.innerHTML = `<div class="mail-list">${mails.map((m) => `
      <article class="mail card ${m.read_at ? '' : 'unread'} ${open === m.id ? 'open' : ''}" data-id="${m.id}">
        <button class="mail-head" data-toggle="${m.id}" aria-expanded="${open === m.id}">
          <span class="mail-ic">${icon(m.gift_invites ? 'gift' : m.broadcast ? 'megaphone' : 'mail', 18)}</span>
          <span class="mail-t"><b>${esc(m.title)}</b><small>${m.broadcast ? '전체 우편' : '나에게 온 우편'} · ${timeAgo(m.created_at)}${m.gift_invites ? ` · 선물 ${m.gift_invites}개` : ''}</small></span>
          ${m.read_at ? '' : '<span class="new-dot" aria-label="안 읽음"></span>'}
        </button>
        ${open === m.id ? `<div class="mail-body">
          <div class="prose">${text(m.body) || '<span class="muted">내용 없음</span>'}</div>
          ${m.gift_invites ? `<div class="gift-box">
            <h4>${icon('gift', 16)} 선물: 초대 코드 ${m.gift_invites}개 <span class="muted small">(코드 하나당 ${m.gift_uses}명 가입${m.gift_days ? ` · 받은 날부터 ${m.gift_days}일` : ''})</span></h4>
            ${m.claimed_at ? (m.codes || []).map(codeRow).join('') : `<button class="btn primary" data-claim="${m.id}">${icon('gift', 16)}<span>선물 받기</span></button>`}
            <p class="muted small">초대 코드를 친구에게 전해주면 O-note에 가입할 수 있어요. 코드는 다른 사람에게 공개된 곳에 올리지 마세요.</p>
          </div>` : ''}
          <div class="btn-row"><span class="muted small">${dateStr(m.created_at)}${m.expires_at ? ` · ${dateStr(m.expires_at)}까지 보관` : ''}</span><span class="grow"></span>
            <button class="btn ghost sm danger" data-hide="${m.id}">${icon('trash', 14)}<span>삭제</span></button></div>
        </div>` : ''}
      </article>`).join('')}</div>`;
    refreshMailBadge();
  };
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const id = t.dataset.toggle;
      open = open === id ? null : id;
      if (open && t.closest('.mail').classList.contains('unread')) await sb().rpc('mail_read', { p_id: id });
      return load();
    }
    const cl = e.target.closest('[data-claim]');
    if (cl) {
      cl.disabled = true;
      const { error } = await sb().rpc('mail_claim', { p_id: cl.dataset.claim });
      if (error) { toast(/already/.test(error.message) ? '이미 받은 선물이에요' : '선물을 받지 못했어요. 잠시 후 다시 시도해 주세요.', 'error'); cl.disabled = false; }
      else toast('초대 코드를 받았어요!', 'ok');
      return load();
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) return copy(cp.dataset.copy, '초대 코드를 복사했어요');
    const ln = e.target.closest('[data-link]');
    if (ln) return copy(inviteLink(ln.dataset.link), '초대 링크를 복사했어요');
    const h = e.target.closest('[data-hide]');
    if (h && await confirmBox('이 우편을 삭제할까요? 받은 초대 코드는 그대로 쓸 수 있어요.', '삭제', true)) {
      await sb().rpc('mail_hide', { p_id: h.dataset.hide });
      open = null; toast('삭제했어요', 'ok'); load();
    }
  });
  await load();
}

// ---------- 건의함 ----------
const CATS = { idea: ['lightbulb', '기능 제안'], bug: ['bug', '오류 제보'], account: ['user', '계정 문의'], etc: ['message-square', '기타'] };
const STATUS = { open: ['접수됨', ''], answered: ['답변 완료', 'ok'], closed: ['처리 완료', 'done'] };

export async function renderSuggest(root) {
  if (store.mode !== 'cloud') return needCloud(root, 'message-square', '건의함');
  root.innerHTML = `${pageHead('message-square', '건의함', '바라는 기능, 불편한 점, 오류를 운영자에게 알려주세요. 답변은 여기와 우편함에서 볼 수 있어요.')}
    <form class="card set sug-form" id="sg">
      <div class="seg" id="sg-cat">${Object.entries(CATS).map(([k, [ic, n]], i) => `<button type="button" data-cat="${k}" class="${i ? '' : 'on'}">${icon(ic, 14)} ${n}</button>`).join('')}</div>
      <label class="lbl" for="sg-t">제목</label><input class="input" id="sg-t" maxlength="100" required placeholder="한 줄로 요약해 주세요">
      <label class="lbl" for="sg-b">내용</label><textarea class="input" id="sg-b" rows="5" maxlength="3000" required placeholder="자세히 적어주실수록 빨리 확인할 수 있어요. 오류라면 어떤 화면에서 무엇을 눌렀는지 알려주세요."></textarea>
      <p class="muted small">${icon('shield-check', 13)} 건의 내용은 운영자만 봐요. 내 문서·메모 등 다른 기록은 운영자도 볼 수 없어요. 비밀번호 같은 개인정보는 적지 마세요.</p>
      <div class="btn-row"><span class="muted small" id="sg-n">0 / 3000</span><span class="grow"></span><button class="btn primary">${icon('send', 16)}<span>보내기</span></button></div>
    </form>
    <h2 class="sec-h">${icon('list', 18)} <span>내가 보낸 건의</span></h2>
    <div id="sg-list"><div class="center-box"><div class="spinner"></div></div></div>`;
  let cat = 'idea';
  root.querySelector('#sg-cat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.dataset.cat;
    root.querySelectorAll('#sg-cat button').forEach((x) => x.classList.toggle('on', x === b));
  });
  const ta = root.querySelector('#sg-b');
  ta.addEventListener('input', () => { root.querySelector('#sg-n').textContent = `${ta.value.length} / 3000`; });
  const list = root.querySelector('#sg-list');
  const load = async () => {
    const { data, error } = await sb().rpc('my_suggestions');
    if (error) { list.innerHTML = emptyState('cloud-off', '불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); return; }
    const rows = data || [];
    list.innerHTML = rows.length ? `<div class="sug-list">${rows.map((s) => `<article class="card sug">
        <div class="sug-top"><span class="chip">${icon(CATS[s.category]?.[0] || 'message-square', 12)} ${CATS[s.category]?.[1] || '기타'}</span>
          <span class="chip st-${STATUS[s.status]?.[1] || ''}">${STATUS[s.status]?.[0] || s.status}</span><span class="muted small">${timeAgo(s.created_at)}</span><span class="grow"></span>
          <button class="icon-btn sm" data-del="${s.id}" title="삭제" aria-label="삭제">${icon('trash', 14)}</button></div>
        <b class="sug-t">${esc(s.title)}</b>
        <div class="prose small">${text(s.body)}</div>
        ${s.reply ? `<div class="reply"><b>${icon('shield-check', 14)} 운영자 답변</b> <span class="muted small">${timeAgo(s.replied_at)}</span><div class="prose small">${text(s.reply)}</div></div>` : ''}
      </article>`).join('')}</div>` : emptyState('message-square', '아직 보낸 건의가 없어요', '위 양식으로 첫 의견을 보내보세요.');
  };
  list.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox('이 건의를 삭제할까요? 운영자도 더 이상 볼 수 없어요.', '삭제', true)) {
      await sb().rpc('suggest_delete', { p_id: d.dataset.del }); toast('삭제했어요', 'ok'); load();
    }
  });
  root.querySelector('#sg').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button.primary'); btn.disabled = true;
    const { error } = await sb().rpc('suggest_create', { p_category: cat, p_title: root.querySelector('#sg-t').value.trim(), p_body: ta.value.trim() });
    btn.disabled = false;
    if (error) return toast(/suggest_rate/.test(error.message) ? '건의는 하루에 5개까지 보낼 수 있어요.' : /suggest_full/.test(error.message) ? '보낸 건의가 너무 많아요. 지난 건의를 정리해 주세요.' : '보내지 못했어요. 잠시 후 다시 시도해 주세요.', 'error');
    e.target.reset(); root.querySelector('#sg-n').textContent = '0 / 3000';
    toast('건의를 보냈어요. 고마워요!', 'ok');
    load();
  };
  await load();
}
