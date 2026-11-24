// 이메일 확인 · 이메일 변경 (로그인한 뒤에도 할 수 있게)
import { CONFIG } from './config.js';
import { store } from './store.js';
import { icon, esc, modal, toast } from './ui.js';

const sb = () => store.sb;
const redirectTo = () => location.origin + location.pathname;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmailAccount = () => store.mode === 'cloud' && !!store.user?.email && (store.user.app_metadata?.provider || 'email') === 'email';
export const isUnconfirmed = () => isEmailAccount() && !store.user.email_confirmed_at;

// 다른 기기·탭에서 확인 링크를 눌렀을 수 있으니 서버에서 최신 상태를 받아옴
export async function refreshUser() {
  if (store.mode !== 'cloud' || !sb()) return store.user;
  try { const { data } = await sb().auth.getUser(); if (data?.user) store.user = data.user; } catch { /* 오프라인 */ }
  return store.user;
}

// 확인 메일 보내기 버튼 (60초 다시 보내기 대기)
let cooldownUntil = 0;
export function bindSendConfirm(button) {
  if (!button) return;
  const label = button.querySelector('span') || button;
  const base = label.textContent;
  const tick = () => {
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (left > 0) { button.disabled = true; label.textContent = `다시 보내기 (${left}초)`; setTimeout(tick, 1000); } else { button.disabled = false; label.textContent = base; }
  };
  tick();
  button.addEventListener('click', async () => {
    if (Date.now() < cooldownUntil) return;
    button.disabled = true;
    const { error } = await sb().auth.resend({ type: 'signup', email: store.user.email, options: { emailRedirectTo: redirectTo() } });
    if (error) {
      button.disabled = false;
      const m = `${error.message || ''}`;
      return toast(/rate|seconds|too many/i.test(m) ? '잠시 후 다시 보내주세요.' : /already|confirmed/i.test(m) ? '이미 확인된 이메일이에요. 새로고침해 보세요.' : '확인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.', 'error');
    }
    toast(`${store.user.email}로 확인 메일을 보냈어요`, 'ok');
    cooldownUntil = Date.now() + 60000; tick();
  });
}

// 홈 화면 안내 (이메일 확인 전 계정에만)
export function emailNoticeHTML() {
  if (!isUnconfirmed()) return '';
  return `<div class="notice email-notice">${icon('mail-warning', 18)}<div>
    <b>이메일 확인이 아직 안 됐어요.</b> ${esc(store.user.email)}로 온 확인 메일의 링크를 눌러주세요. 비밀번호를 잊었을 때 이 메일로 찾을 수 있어요.
    <div class="btn-row"><button class="btn primary sm" data-email-send>${icon('send', 14)}<span>확인 메일 보내기</span></button><button class="btn ghost sm" data-email-change>${icon('pencil', 14)}<span>이메일 바꾸기</span></button></div>
  </div></div>`;
}
export function bindEmailActions(root, after) {
  root.querySelectorAll('[data-email-send]').forEach(bindSendConfirm);
  root.querySelectorAll('[data-email-change]').forEach((b) => b.addEventListener('click', async () => { if (await changeEmailDialog()) after?.(); }));
}

// 이메일 바꾸기
export async function changeEmailDialog() {
  const unconfirmed = isUnconfirmed();
  const email = await modal({
    title: '이메일 바꾸기',
    body: `<p class="muted small">지금 이메일: <b>${esc(store.user.email || '')}</b></p>
      <label class="lbl" for="ce-em">새 이메일</label><input class="input" id="ce-em" type="email" autocomplete="email" placeholder="you@example.com">
      <p class="muted small">${unconfirmed
        ? '확인 전인 이메일은 바로 바뀌고, 새 주소로 확인 메일을 다시 보내요. (하루 3번까지)'
        : '새 이메일로 보낸 확인 링크를 눌러야 바뀌어요. 보안을 위해 지금 이메일로도 확인 메일이 갈 수 있어요.'}</p>`,
    actions: [{ label: '취소', cls: 'ghost', value: () => null }, {
      label: '바꾸기', cls: 'primary', icon: 'check', value: (w) => {
        const v = w.querySelector('#ce-em').value.trim().toLowerCase();
        if (!EMAIL_RE.test(v)) { toast('이메일 주소를 다시 확인해 주세요', 'error'); return false; }
        if (v === (store.user.email || '').toLowerCase()) { toast('지금과 같은 이메일이에요', 'error'); return false; }
        return v;
      },
    }],
  });
  if (!email) return false;

  if (!unconfirmed) {
    const { error } = await sb().auth.updateUser({ email }, { emailRedirectTo: redirectTo() });
    if (error) { toast(/already|exists|registered/i.test(error.message) ? '이미 다른 계정이 쓰는 이메일이에요.' : /rate|seconds/i.test(error.message) ? '잠시 후 다시 시도해 주세요.' : '이메일을 바꾸지 못했어요.', 'error'); return false; }
    await modal({ title: '확인 메일을 보냈어요', body: `<p><b>${esc(email)}</b>로 보낸 메일의 링크를 누르면 이메일이 바뀌어요.</p><p class="muted small">지금 이메일로도 확인 메일이 왔다면 그 링크도 눌러주세요. 링크를 누르기 전까지는 지금 이메일이 그대로 쓰여요.</p>`, actions: [{ label: '확인', cls: 'primary', value: () => true }] });
    return true;
  }

  const { data: s } = await sb().auth.getSession();
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/change-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.session?.access_token || ''}` },
      body: JSON.stringify({ email, redirectTo: redirectTo() }),
    });
  } catch { toast('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', 'error'); return false; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const m = { email_taken: '이미 다른 계정이 쓰는 이메일이에요.', too_many: '오늘은 이메일을 더 바꿀 수 없어요. 내일 다시 시도해 주세요.', invalid_email: '이메일 주소를 다시 확인해 주세요.', same_email: '지금과 같은 이메일이에요.', already_confirmed: '이미 확인된 계정이에요. 새로고침 후 다시 시도해 주세요.' };
    toast(m[body.error] || '이메일을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 'error');
    return false;
  }
  try { await sb().auth.refreshSession(); } catch { /* noop */ }
  await refreshUser();
  toast(body.mail === 'sent' ? `${email}로 바꾸고 확인 메일을 보냈어요` : `${email}로 바꿨어요. 확인 메일은 잠시 후 '확인 메일 보내기'로 다시 보내주세요`, 'ok');
  return true;
}
