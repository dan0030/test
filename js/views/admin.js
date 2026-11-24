// 운영자 화면 — 운영자로 지정된 계정 + 2단계 인증(OTP)을 마친 세션에서만 동작
// 화면을 숨기는 것은 편의일 뿐, 실제 권한 검사는 모두 서버 함수(onote_require_admin)에서 함
import { store } from '../store.js';
import { icon, esc, emptyState, toast, timeAgo, confirmBox } from '../ui.js';
import { pageHead } from '../common.js';
import { copy, inviteLink } from './community.js';

const sb = () => store.sb;
const text = (s) => esc(s || '').replace(/\n/g, '<br>');
const dateStr = (iso) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '');
const endOfDay = (v) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);
const ERR = {
  forbidden: '운영자 권한이 없거나 2단계 인증이 끝나지 않았어요.',
  code_format: '코드는 영문·숫자·하이픈(-) 6~32자로 정해주세요.',
  code_exists: '이미 있는 코드예요.',
  user_not_found: '그 아이디의 이용자를 찾지 못했어요.',
};
const errText = (e) => ERR[Object.keys(ERR).find((k) => (e?.message || '').includes(k))] || '처리하지 못했어요. 입력값을 확인해 주세요.';

export async function adminStatus() {
  if (store.mode !== 'cloud' || !sb()) return { admin: false };
  const { data } = await sb().rpc('admin_status');
  return data || { admin: false };
}

export async function renderAdmin(root, q) {
  root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
  const st = await adminStatus();
  if (!st.admin) {
    root.innerHTML = `${pageHead('shield-check', '운영자', '운영자 전용 화면이에요.')}${emptyState('lock', '권한이 없어요', '운영자로 지정된 계정만 들어올 수 있어요.')}`;
    return;
  }
  if (!st.aal2) return mfaGate(root, q);
  const tab = q.get('tab') || 'home';
  const tabs = [['home', 'layout-dashboard', '개요'], ['codes', 'key-round', '초대 코드'], ['mail', 'send', '우편 보내기'], ['sugg', 'message-square', '건의함']];
  root.innerHTML = `${pageHead('shield-check', '운영자', '초대 코드 · 우편 · 건의를 관리해요. 이용자의 기록(문서·메모·사진)은 운영자도 볼 수 없어요.')}
    <div class="tabs">${tabs.map(([k, ic, n]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/admin?tab=${k}">${icon(ic, 16)} ${n}</a>`).join('')}</div>
    <div id="adm"></div>`;
  const box = root.querySelector('#adm');
  if (tab === 'codes') return codesTab(box);
  if (tab === 'mail') return mailTab(box);
  if (tab === 'sugg') return suggTab(box, q);
  return homeTab(box);
}

// ---------- 2단계 인증 ----------
async function mfaGate(root, q) {
  const mfa = sb().auth.mfa;
  const { data } = await mfa.listFactors();
  const verified = (data?.totp || []).filter((f) => f.status === 'verified');
  const head = pageHead('shield-check', '운영자 2단계 인증', '운영자 기능은 휴대폰 OTP 앱(Google Authenticator, Microsoft Authenticator 등) 인증을 마쳐야 쓸 수 있어요.');
  let factorId = verified[0]?.id;
  if (!factorId) {
    // 처음 한 번: OTP 앱 등록 (끝나지 않은 등록은 지우고 새로)
    for (const f of (data?.all || []).filter((x) => x.status !== 'verified')) await mfa.unenroll({ factorId: f.id }).catch(() => {});
    const { data: en, error } = await mfa.enroll({ factorType: 'totp', friendlyName: `O-note 운영자 ${Date.now().toString(36)}` });
    if (error) { root.innerHTML = `${head}${emptyState('triangle-exclamation-point', 'OTP 등록을 시작하지 못했어요', esc(error.message))}`; return; }
    factorId = en.id;
    root.innerHTML = `${head}<div class="card set mfa">
      <h3>${icon('key-round', 18)} OTP 앱 등록 (처음 한 번)</h3>
      <ol class="small"><li>휴대폰의 OTP 앱에서 <b>QR 코드 스캔</b>을 눌러 아래 코드를 찍어요.</li><li>앱에 나온 6자리 숫자를 입력해요.</li></ol>
      <img class="mfa-qr" src="${esc(en.totp.qr_code)}" alt="OTP 등록용 QR 코드" width="200" height="200">
      <p class="muted small">스캔이 안 되면 앱에 이 키를 직접 입력: <code>${esc(en.totp.secret)}</code></p>
      ${codeForm()}
      <p class="warn-box">휴대폰을 잃어버리면 운영자 기능을 쓸 수 없어요. 그때는 Supabase 대시보드 → Authentication → Users에서 이 계정의 MFA를 지운 뒤 다시 등록하세요.</p></div>`;
  } else {
    root.innerHTML = `${head}<div class="card set mfa"><h3>${icon('lock', 18)} OTP 코드 입력</h3><p class="muted small">OTP 앱에 표시된 6자리 숫자를 입력해요.</p>${codeForm()}</div>`;
  }
  const f = root.querySelector('#mfa-f');
  f.querySelector('input').focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const code = f.querySelector('input').value.replace(/\s/g, '');
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await mfa.challengeAndVerify({ factorId, code });
    btn.disabled = false;
    if (error) return toast('코드가 맞지 않아요. 앱의 새 숫자로 다시 입력해 주세요.', 'error');
    toast('인증했어요', 'ok');
    renderAdmin(root, q);
  };
}
const codeForm = () => `<form id="mfa-f" class="row-inline"><input class="input otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"><button class="btn primary">${icon('check', 16)}<span>확인</span></button></form>`;

// ---------- 개요 ----------
async function homeTab(box) {
  const { data: o, error } = await sb().rpc('admin_overview');
  if (error) { box.innerHTML = emptyState('lock', errText(error), ''); return; }
  box.innerHTML = `<div class="adm-stats">
      <div class="stat">${icon('users', 18)}<b>${o.users}</b><span>전체 가입자</span></div>
      <div class="stat">${icon('user-plus', 18)}<b>${o.users_7d}</b><span>최근 7일 가입</span></div>
      <div class="stat">${icon('key-round', 18)}<b>${o.active_codes}</b><span>쓸 수 있는 초대 코드</span></div>
      <a class="stat" href="#/admin?tab=sugg&s=open">${icon('message-square', 18)}<b>${o.open_suggestions}</b><span>답변 대기 건의</span></a>
    </div>
    <div class="card set">
      <h3>${icon('user-plus', 18)} 가입 방식</h3>
      <label class="check"><input type="checkbox" id="inv-req" ${o.invite_required ? 'checked' : ''}><span><b>초대 코드가 있어야 가입 가능</b><br><span class="muted small">끄면 누구나 가입할 수 있어요. 켜 두는 것을 권장해요.</span></span></label>
    </div>
    <div class="card set"><h3>${icon('shield-check', 18)} 운영자 계정 안전 수칙</h3>
      <ul class="small"><li>운영자 계정은 개인 기록용 계정과 따로 쓰고, 다른 사이트와 다른 긴 비밀번호를 쓰세요.</li>
      <li>운영자 권한은 Supabase 대시보드에서만 주고 뺄 수 있어요. 사이트 안에서는 아무도 운영자가 될 수 없어요.</li>
      <li>공용 컴퓨터에서는 '로그인 상태 유지'를 끄고, 다 쓰면 로그아웃하세요.</li></ul></div>`;
  box.querySelector('#inv-req').onchange = async (e) => {
    const on = e.target.checked;
    if (!on && !(await confirmBox('초대 코드 없이 누구나 가입할 수 있게 할까요?', '끄기', true))) { e.target.checked = true; return; }
    const { error: er } = await sb().rpc('admin_set_invite_required', { p_on: on });
    toast(er ? errText(er) : on ? '이제 초대 코드가 있어야 가입할 수 있어요' : '누구나 가입할 수 있어요', er ? 'error' : 'ok');
  };
}

// ---------- 초대 코드 ----------
async function codesTab(box) {
  let kind = 'admin';
  box.innerHTML = `<form class="card set" id="cc">
      <h3>${icon('plus', 18)} 새 초대 코드</h3>
      <div class="adm-form">
        <label class="field"><span>코드 (비우면 랜덤 10자)</span><input class="input" id="cc-code" maxlength="32" placeholder="예: WINTER-EVENT-26" autocomplete="off"></label>
        <label class="field"><span>사용 가능 횟수</span><input class="input" id="cc-max" type="number" min="1" max="100000" value="1" required></label>
        <label class="field"><span>사용 기한 (선택)</span><input class="input" id="cc-exp" type="date"></label>
        <label class="field"><span>메모 (운영자만 봄)</span><input class="input" id="cc-note" maxlength="200" placeholder="어디에 쓰는 코드인지"></label>
      </div>
      <p class="muted small">직접 정한 코드는 남이 짐작하기 어렵게 8자 이상을 권장해요. 영문 대문자·숫자·하이픈만 쓸 수 있어요 (소문자는 대문자로 바뀌어요).</p>
      <div class="btn-row"><span class="grow"></span><button class="btn primary">${icon('key-round', 16)}<span>만들기</span></button></div>
    </form>
    <div class="seg" id="ck"><button class="on" data-k="admin">운영자 코드</button><button data-k="gift">우편 선물 코드</button></div>
    <div id="cl"></div>`;
  const list = box.querySelector('#cl');
  const load = async () => {
    const { data, error } = await sb().rpc('admin_codes', { p_kind: kind });
    if (error) { list.innerHTML = emptyState('lock', errText(error), ''); return; }
    list.innerHTML = data.length ? `<div class="adm-table"><table><thead><tr><th>코드</th><th>사용</th><th>기한</th><th>${kind === 'gift' ? '받은 사람' : '메모'}</th><th>상태</th><th></th></tr></thead><tbody>
      ${data.map((c) => `<tr class="${c.active ? '' : 'off'}"><td><code>${esc(c.code)}</code></td><td>${c.used} / ${c.max}</td><td>${c.exp ? dateStr(c.exp) : '없음'}</td><td>${esc(kind === 'gift' ? (c.owner ? `@${c.owner}` : '(탈퇴)') : c.note || '')}</td>
        <td><label class="check sm"><input type="checkbox" data-act="${esc(c.code)}" ${c.active ? 'checked' : ''}><span>사용</span></label></td>
        <td class="nowrap"><button class="icon-btn sm" data-copy="${esc(c.code)}" title="코드 복사" aria-label="코드 복사">${icon('copy', 14)}</button><button class="icon-btn sm" data-link="${esc(c.code)}" title="초대 링크 복사" aria-label="초대 링크 복사">${icon('link', 14)}</button><button class="icon-btn sm" data-max="${esc(c.code)}" data-cur="${c.max}" title="횟수 바꾸기" aria-label="횟수 바꾸기">${icon('pencil', 14)}</button><button class="icon-btn sm danger" data-del="${esc(c.code)}" title="삭제" aria-label="삭제">${icon('trash', 14)}</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyState('key-round', '코드가 없어요', kind === 'gift' ? '우편 선물을 받은 이용자가 생기면 여기에 표시돼요.' : '위에서 첫 초대 코드를 만들어 보세요.');
  };
  box.querySelector('#ck').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    kind = b.dataset.k; box.querySelectorAll('#ck button').forEach((x) => x.classList.toggle('on', x === b)); load();
  });
  box.querySelector('#cc').onsubmit = async (e) => {
    e.preventDefault();
    const { data, error } = await sb().rpc('admin_code_create', {
      p_code: box.querySelector('#cc-code').value.trim(), p_max: +box.querySelector('#cc-max').value || 1,
      p_expires: endOfDay(box.querySelector('#cc-exp').value), p_note: box.querySelector('#cc-note').value.trim(),
    });
    if (error) return toast(errText(error), 'error');
    e.target.reset(); box.querySelector('#cc-max').value = 1;
    copy(data, `코드 ${data}를 만들고 복사했어요`);
    if (kind !== 'admin') box.querySelector('#ck [data-k="admin"]').click(); else load();
  };
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.copy) return copy(b.dataset.copy, '코드를 복사했어요');
    if (b.dataset.link) return copy(inviteLink(b.dataset.link), '초대 링크를 복사했어요');
    if (b.dataset.max) {
      const v = prompt('사용 가능 횟수 (이미 쓴 횟수보다 작게는 못 해요)', b.dataset.cur);
      if (!v) return;
      const { error } = await sb().rpc('admin_code_update', { p_code: b.dataset.max, p_active: null, p_max: Math.max(1, parseInt(v, 10) || 1) });
      if (error) toast(errText(error), 'error'); return load();
    }
    if (b.dataset.del && await confirmBox(`코드 ${b.dataset.del}를 삭제할까요? 이 코드로는 더 이상 가입할 수 없어요.`, '삭제', true)) {
      const { error } = await sb().rpc('admin_code_delete', { p_code: b.dataset.del });
      if (error) toast(errText(error), 'error'); load();
    }
  });
  list.addEventListener('change', async (e) => {
    const c = e.target.closest('[data-act]'); if (!c) return;
    const { error } = await sb().rpc('admin_code_update', { p_code: c.dataset.act, p_active: c.checked, p_max: null });
    if (error) toast(errText(error), 'error'); else toast(c.checked ? '코드를 다시 쓸 수 있어요' : '코드 사용을 멈췄어요', 'ok');
    load();
  });
  load();
}

// ---------- 우편 ----------
async function mailTab(box) {
  box.innerHTML = `<form class="card set" id="ms">
      <h3>${icon('send', 18)} 우편 보내기</h3>
      <div class="seg" id="ms-to"><button type="button" class="on" data-to="all">${icon('users', 14)} 전체 이용자</button><button type="button" data-to="one">${icon('user', 14)} 특정 이용자</button></div>
      <label class="field" id="ms-user" hidden><span>받는 사람 아이디</span><input class="input" id="ms-un" maxlength="21" placeholder="@아이디" autocomplete="off"></label>
      <label class="field"><span>제목</span><input class="input" id="ms-t" maxlength="100" required placeholder="예: 겨울 이벤트 보상이 도착했어요"></label>
      <label class="field"><span>내용</span><textarea class="input" id="ms-b" rows="5" maxlength="5000" placeholder="전할 말을 적어요"></textarea></label>
      <div class="adm-form">
        <label class="field"><span>선물: 초대 코드 개수</span><input class="input" id="ms-g" type="number" min="0" max="10" value="0"></label>
        <label class="field"><span>코드 하나당 가입 가능 인원</span><input class="input" id="ms-gu" type="number" min="1" max="100" value="1"></label>
        <label class="field"><span>코드 유효 기간 (받은 날부터, 일)</span><input class="input" id="ms-gd" type="number" min="1" max="365" placeholder="비우면 무기한"></label>
        <label class="field"><span>우편 보관 기한 (선택)</span><input class="input" id="ms-exp" type="date"></label>
      </div>
      <p class="muted small">선물 코드는 이용자가 '선물 받기'를 누르는 순간 그 사람만의 랜덤 코드로 만들어져요. 전체 우편이면 이용자마다 각자 받아요. 이벤트 보상이라면 보관 기한을 정해두면 좋아요.</p>
      <div class="btn-row"><span class="grow"></span><button class="btn primary">${icon('send', 16)}<span>보내기</span></button></div>
    </form>
    <h2 class="sec-h">${icon('mail', 18)} <span>보낸 우편</span></h2>
    <div id="ml"></div>`;
  let to = 'all';
  box.querySelector('#ms-to').addEventListener('click', (e) => {
    const b = e.target.closest('[data-to]'); if (!b) return;
    to = b.dataset.to; box.querySelectorAll('#ms-to button').forEach((x) => x.classList.toggle('on', x === b));
    box.querySelector('#ms-user').hidden = to !== 'one';
  });
  const list = box.querySelector('#ml');
  const load = async () => {
    const { data, error } = await sb().rpc('admin_mails');
    if (error) { list.innerHTML = emptyState('lock', errText(error), ''); return; }
    list.innerHTML = data.length ? `<div class="sug-list">${data.map((m) => `<article class="card sug">
        <div class="sug-top"><span class="chip">${icon(m.to ? 'user' : 'users', 12)} ${m.to ? `@${esc(m.to)}` : '전체'}</span>${m.gift ? `<span class="chip">${icon('gift', 12)} 코드 ${m.gift}개 × ${m.gift_uses}명</span>` : ''}
          <span class="muted small">${timeAgo(m.created_at)} · 읽음 ${m.reads}${m.gift ? ` · 받음 ${m.claims}` : ''}${m.expires_at ? ` · ${dateStr(m.expires_at)}까지` : ''}</span><span class="grow"></span>
          <button class="icon-btn sm danger" data-del="${m.id}" title="회수(삭제)" aria-label="회수(삭제)">${icon('trash', 14)}</button></div>
        <b class="sug-t">${esc(m.title)}</b><div class="prose small">${text(m.body)}</div></article>`).join('')}</div>` : emptyState('mail', '보낸 우편이 없어요', '');
  };
  box.querySelector('#ms').onsubmit = async (e) => {
    e.preventDefault();
    const target = to === 'one' ? box.querySelector('#ms-un').value.trim() : '';
    if (to === 'one' && !target) return toast('받는 사람 아이디를 입력해 주세요', 'error');
    const gift = Math.min(10, Math.max(0, +box.querySelector('#ms-g').value || 0));
    if (!(await confirmBox(`${target ? `@${target.replace(/^@/, '')}` : '전체 이용자'}에게 우편을 보낼까요?${gift ? ` (초대 코드 ${gift}개 선물)` : ''}`, '보내기'))) return;
    const { error } = await sb().rpc('admin_mail_send', {
      p_to: target, p_title: box.querySelector('#ms-t').value.trim(), p_body: box.querySelector('#ms-b').value,
      p_gift: gift, p_gift_uses: Math.min(100, Math.max(1, +box.querySelector('#ms-gu').value || 1)),
      p_gift_days: +box.querySelector('#ms-gd').value || null, p_expires: endOfDay(box.querySelector('#ms-exp').value),
    });
    if (error) return toast(errText(error), 'error');
    e.target.reset(); box.querySelector('#ms-gu').value = 1;
    toast('우편을 보냈어요', 'ok'); load();
  };
  list.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox('이 우편을 회수할까요? 이용자의 우편함에서도 사라져요. (이미 받은 초대 코드는 남아요)', '회수', true)) {
      const { error } = await sb().rpc('admin_mail_delete', { p_id: d.dataset.del });
      if (error) toast(errText(error), 'error'); load();
    }
  });
  load();
}

// ---------- 건의함 ----------
const CATS = { idea: '기능 제안', bug: '오류 제보', account: '계정 문의', etc: '기타' };
const STATUS = { open: '접수됨', answered: '답변 완료', closed: '처리 완료' };
async function suggTab(box, q) {
  let s = q.get('s') ?? 'open';
  box.innerHTML = `<div class="seg" id="sf">${[['open', '답변 대기'], ['answered', '답변 완료'], ['closed', '처리 완료'], ['', '전체']].map(([k, n]) => `<button data-s="${k}" class="${s === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="sl"></div>`;
  const list = box.querySelector('#sl');
  const load = async () => {
    const { data, error } = await sb().rpc('admin_suggestions', { p_status: s || null });
    if (error) { list.innerHTML = emptyState('lock', errText(error), ''); return; }
    list.innerHTML = data.length ? `<div class="sug-list">${data.map((g) => `<article class="card sug" data-id="${g.id}">
        <div class="sug-top"><span class="chip">${CATS[g.category] || g.category}</span><span class="chip">${STATUS[g.status]}</span>
          <span class="muted small">${esc(g.display_name || '')} ${g.username ? `@${esc(g.username)}` : ''} · ${timeAgo(g.created_at)}</span></div>
        <b class="sug-t">${esc(g.title)}</b><div class="prose small">${text(g.body)}</div>
        <textarea class="input" rows="3" maxlength="3000" placeholder="답변 (저장하면 이용자의 우편함으로 알림이 가요)">${esc(g.reply || '')}</textarea>
        <div class="btn-row"><select class="input sm-sel"><option value="">상태 자동</option>${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <span class="grow"></span><button class="btn primary sm" data-save>${icon('send', 14)}<span>저장</span></button></div>
      </article>`).join('')}</div>` : emptyState('message-square', '건의가 없어요', '');
  };
  box.querySelector('#sf').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    s = b.dataset.s; box.querySelectorAll('#sf button').forEach((x) => x.classList.toggle('on', x === b)); load();
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const card = b.closest('[data-id]');
    b.disabled = true;
    const { error } = await sb().rpc('admin_suggest_reply', { p_id: card.dataset.id, p_reply: card.querySelector('textarea').value, p_status: card.querySelector('select').value || null });
    b.disabled = false;
    if (error) return toast(errText(error), 'error');
    toast('저장했어요', 'ok'); load();
  });
  load();
}
