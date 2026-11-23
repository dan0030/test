// O-note 진입점: 인증 → 데이터 로드 → 레이아웃 → 라우터
import { CONFIG } from './config.js';
import { store, initLocal, initCloud, onChange, unlock, flush, pull, get, clearDeviceCache } from './store.js';
import { startImageHydrator, migrateInlineImages, cleanupImages } from './images.js';
import { icon, esc, toast, $, modal } from './ui.js';
import { pomo, onPomo, fmt, start, pause } from './pomodoro.js';
import * as Home from './views/home.js';
import * as Folders from './views/folders.js';
import * as Wiki from './views/wiki.js';
import * as Story from './views/story.js';
import * as Plot from './views/plot.js';
import * as Memo from './views/memo.js';
import * as Tools from './views/tools.js';
import * as Settings from './views/settings.js';
import * as Privacy from './views/privacy.js';

const app = document.getElementById('app');
let sb = null;
let cleanup = null;

// ---------- 테마 ----------
function setTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('onote-theme', t); } catch { /* noop */ }
}
try { const t = localStorage.getItem('onote-theme'); if (t && t !== 'auto') document.documentElement.dataset.theme = t; } catch { /* noop */ }

// ---------- 부팅 ----------
async function boot() {
  const cloudReady = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase;
  if (!cloudReady) {
    await initLocal();
    return mount();
  }
  sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') setTimeout(recoverPassword, 300);
    if (ev === 'SIGNED_OUT') location.reload();
  });
  const { data: { session } } = await sb.auth.getSession();
  // OAuth/메일 인증 후 주소창의 ?code= 정리
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + (location.hash || '#/'));
  if (sessionStorage.getItem('onote-trial') === '1') { await initLocal(); return mount(); }
  if (!session) return authScreen();
  try {
    loading('기록을 불러오는 중…');
    await initCloud(sb, session.user);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="center-box">${icon('cloud-off', 40)}<h2>데이터를 불러오지 못했어요</h2><p class="muted">${esc(e.message || '')}</p><button class="btn primary" data-reload>다시 시도</button></div>`;
    return;
  }
  await loadProfile();
  if (store.locked) return unlockScreen();
  if (!store.profile) await profileSetup();
  mount();
}

async function loadProfile() {
  const { data } = await sb.from('profiles').select('username,display_name').maybeSingle();
  store.profile = data || null;
}

// 아이디·이름이 없는 계정(GitHub 로그인, 이전 가입자)에게 설정 받기
async function profileSetup() {
  const v = await profileDialog({ title: '아이디와 이름을 정해주세요', intro: '이메일 대신 사이트에서 쓸 아이디와 이름이에요. 아이디로도 로그인할 수 있어요.' });
  if (v) store.profile = v;
}

export async function profileDialog({ title = '아이디 · 이름 변경', intro = '', current = null } = {}) {
  const res = await modal({
    title,
    body: `${intro ? `<p class="muted small">${esc(intro)}</p>` : ''}
      <label class="lbl" for="pd-un">아이디</label><input class="input" id="pd-un" value="${esc(current?.username || '')}" placeholder="영문 소문자·숫자·_ 3~20자" maxlength="20">
      <label class="lbl" for="pd-dn">이름 (닉네임)</label><input class="input" id="pd-dn" value="${esc(current?.display_name || '')}" placeholder="사이트에서 보일 이름" maxlength="30">`,
    actions: [{ label: current ? '취소' : '나중에', cls: 'ghost', value: () => null }, {
      label: '저장', cls: 'primary', icon: 'check', value: async (w) => {
        const username = w.querySelector('#pd-un').value.trim().toLowerCase();
        const display_name = w.querySelector('#pd-dn').value.trim();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { toast('아이디는 영문 소문자, 숫자, 밑줄(_)로 3~20자예요.', 'error'); return false; }
        if (!display_name) { toast('이름을 입력해주세요.', 'error'); return false; }
        if (username !== current?.username) {
          const { data: free } = await sb.rpc('username_available', { p_username: username });
          if (!free) { toast('이미 쓰이고 있거나 쓸 수 없는 아이디예요.', 'error'); return false; }
        }
        const { error } = await sb.from('profiles').upsert({ id: store.user.id, username, display_name });
        if (error) { toast(/duplicate|unique/.test(error.message) ? '이미 쓰이고 있는 아이디예요.' : '저장하지 못했어요.', 'error'); return false; }
        return { username, display_name };
      },
    }],
  });
  if (res) toast('저장했어요', 'ok');
  return res;
}

function loading(msg) { app.innerHTML = `<div class="center-box"><div class="spinner"></div><p class="muted">${esc(msg)}</p></div>`; }

// ---------- 로그인 / 회원가입 ----------
function authScreen(mode = 'login') {
  const isUp = mode === 'signup';
  app.innerHTML = `
    <div class="auth">
      <div class="auth-card">
        <div class="logo big">${logoSvg()}<span>O-note</span></div>
        <p class="auth-desc">오타쿠를 위한 자료 모음 & 메모장<br><span class="muted small">캐릭터 위키 · 세계관 · 연성 · 플롯 · 메모를 한곳에</span></p>
        <div class="seg full"><button class="${!isUp ? 'on' : ''}" data-m="login">로그인</button><button class="${isUp ? 'on' : ''}" data-m="signup">회원가입</button></div>
        ${CONFIG.ENABLE_GITHUB_LOGIN ? `<button class="btn gh full" id="gh">${icon('github', 18)} GitHub 계정으로 ${isUp ? '가입' : '로그인'}</button><div class="or"><span>또는 이메일</span></div>` : ''}
        <form id="af" autocomplete="on">
          ${isUp ? `<div class="row2">
            <div><label class="lbl" for="un">아이디</label><input class="input" id="un" required autocomplete="username" placeholder="영문 소문자·숫자·_ 3~20자" maxlength="20" pattern="[a-zA-Z0-9_]{3,20}"></div>
            <div><label class="lbl" for="dn">이름 (닉네임)</label><input class="input" id="dn" required autocomplete="nickname" placeholder="사이트에서 보일 이름" maxlength="30"></div>
          </div>
          <p class="muted small" id="un-msg">아이디는 로그인할 때 써요. 이름은 언제든 바꿀 수 있어요.</p>
          <label class="lbl" for="em">이메일</label>
          <input class="input" id="em" type="email" required autocomplete="email" placeholder="you@example.com">
          <p class="muted small">가입 인증과 비밀번호 찾기에만 쓰여요. 다른 사람에게 공개되지 않아요.</p>` : `<label class="lbl" for="em">아이디 또는 이메일</label>
          <input class="input" id="em" required autocomplete="username" placeholder="아이디 또는 이메일">`}
          <label class="lbl" for="pw">비밀번호</label>
          <input class="input" id="pw" type="password" required minlength="8" autocomplete="${isUp ? 'new-password' : 'current-password'}" placeholder="8자 이상">
          ${isUp ? `<input class="input" id="pw2" type="password" required minlength="8" autocomplete="new-password" placeholder="비밀번호 확인">
            <label class="agree"><input type="checkbox" id="agree" required> <span>만 14세 이상이며, <a href="#" id="pv">개인정보 처리방침</a>(이메일만 수집 · 탈퇴 시 즉시 삭제)에 동의해요.</span></label>` : ''}
          <button class="btn primary full" id="go">${icon(isUp ? 'user-plus' : 'log-in', 18)} ${isUp ? '가입하기' : '로그인'}</button>
        </form>
        ${!isUp ? '<button class="link small" id="forgot">비밀번호를 잊으셨나요?</button>' : ''}
        <div class="or"><span>먼저 둘러보기</span></div>
        <button class="btn ghost full" id="trial">${icon('flask-conical', 18)} 체험 모드 (이 브라우저에만 저장)</button>
        <p class="muted small center"><span>${icon('shield-check', 13)} 비밀번호는 복원할 수 없는 해시로만 저장되고, 기록은 본인만 볼 수 있어요.</span></p>
        <p class="center small"><a href="#" id="pv2">개인정보 처리방침</a></p>
      </div>
    </div>`;
  app.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => authScreen(b.dataset.m)));
  $('#gh')?.addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + location.pathname, scopes: 'read:user user:email' } });
    if (error) toast(error.message, 'error');
  });
  $('#trial').onclick = async () => { sessionStorage.setItem('onote-trial', '1'); await initLocal(); mount(); };
  ['#pv', '#pv2'].forEach((sel) => $(sel)?.addEventListener('click', (e) => { e.preventDefault(); privacyModal(); }));
  $('#forgot')?.addEventListener('click', async () => {
    const email = $('#em').value.trim() || (await modal({ title: '비밀번호 재설정', body: '<input class="input" id="fe" type="email" placeholder="가입한 이메일">', actions: [{ label: '메일 보내기', cls: 'primary', value: (w) => w.querySelector('#fe').value.trim() || false }] }));
    if (!email) return;
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    toast('가입된 이메일이라면 재설정 메일을 보냈어요', 'ok'); // 계정 존재 여부를 드러내지 않음
  });
  const unIn = $('#un');
  if (unIn) {
    let t;
    unIn.addEventListener('input', () => {
      clearTimeout(t);
      const v = unIn.value.trim().toLowerCase();
      const msg = $('#un-msg');
      if (!v) { msg.textContent = '아이디는 로그인할 때 써요. 이름은 언제든 바꿀 수 있어요.'; msg.className = 'muted small'; return; }
      if (!/^[a-z0-9_]{3,20}$/.test(v)) { msg.textContent = '영문 소문자, 숫자, 밑줄(_)로 3~20자를 입력해주세요.'; msg.className = 'small err-text'; return; }
      t = setTimeout(async () => {
        const { data } = await sb.rpc('username_available', { p_username: v });
        if (unIn.value.trim().toLowerCase() !== v) return;
        msg.textContent = data ? '사용할 수 있는 아이디예요.' : '이미 쓰이고 있거나 쓸 수 없는 아이디예요.';
        msg.className = `small ${data ? 'ok-text' : 'err-text'}`;
      }, 400);
    });
  }
  $('#af').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#em').value.trim(); const pw = $('#pw').value;
    const btn = $('#go'); btn.disabled = true;
    try {
      if (isUp) {
        if (pw !== $('#pw2').value) throw new Error('두 비밀번호가 달라요.');
        if (!/(?=.*[A-Za-z])(?=.*\d)/.test(pw)) throw new Error('비밀번호에 영문과 숫자를 함께 넣어주세요.');
        const username = $('#un').value.trim().toLowerCase();
        const displayName = $('#dn').value.trim();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error('아이디는 영문 소문자, 숫자, 밑줄(_)로 3~20자예요.');
        if (!displayName) throw new Error('이름(닉네임)을 입력해주세요.');
        const { data: free } = await sb.rpc('username_available', { p_username: username });
        if (!free) throw new Error('이미 쓰이고 있거나 쓸 수 없는 아이디예요.');
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname, data: { username, display_name: displayName } } });
        if (error) throw new Error(signupErrorText(error));
        if (!data.session) {
          app.querySelector('.auth-card').innerHTML = `<div class="center">${icon('mail-check', 44)}<h2>메일을 확인해주세요</h2><p class="muted">${esc(email)}로 인증 링크를 보냈어요.<br>링크를 누르면 가입이 완료돼요.</p>
            ${mailHelpHTML()}
            <div class="btn-row center-row"><button class="btn primary" id="resend">${icon('send', 16)}<span>인증 메일 다시 보내기</span></button><button class="btn ghost" data-reload>로그인 화면으로</button></div></div>`;
          bindResend($('#resend'), email);
          return;
        }
      } else {
        if (email.includes('@')) {
          const { error } = await sb.auth.signInWithPassword({ email, password: pw });
          if (error && /confirm/i.test(error.message)) { btn.disabled = false; return notConfirmed(email); }
          if (error) throw new Error(error.message.includes('Invalid') ? '아이디(이메일) 또는 비밀번호가 올바르지 않아요.' : error.message);
        } else {
          await loginWithId(email, pw);
        }
      }
      location.reload();
    } catch (err) {
      btn.disabled = false;
      if (err.notConfirmed) return notConfirmed('');
      toast(err.message, 'error');
    }
  };
}

// ---------- 인증 메일 도움말 · 다시 보내기 ----------
function mailHelpHTML() {
  return `<div class="mail-help"><b>${icon('circle-question-mark', 14)} 메일이 안 오나요?</b>
    <ul><li>도착까지 몇 분 걸릴 수 있어요.</li><li>네이버·다음은 <b>스팸메일함</b>과 <b>전체메일함</b>도 확인해 주세요.</li><li>그래도 없으면 아래 버튼으로 다시 보내거나, 다른 이메일(예: Gmail)로 가입해 보세요.</li></ul></div>`;
}
function bindResend(button, email) {
  if (!button) return;
  let wait = 0;
  button.onclick = async () => {
    if (wait > 0) return;
    button.disabled = true;
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { toast(signupErrorText(error), 'error'); button.disabled = false; return; }
    toast('인증 메일을 다시 보냈어요', 'ok');
    wait = 60;
    const label = button.querySelector('span');
    const t = setInterval(() => { wait--; label.textContent = wait > 0 ? `다시 보내기 (${wait}초)` : '인증 메일 다시 보내기'; if (wait <= 0) { clearInterval(t); button.disabled = false; } }, 1000);
  };
}
// 인증 전 계정으로 로그인 시도 → 다시 보내기 안내
async function notConfirmed(email) {
  await modal({
    title: '이메일 인증이 필요해요',
    body: `<p>가입할 때 받은 메일의 인증 링크를 눌러야 로그인할 수 있어요.</p>${mailHelpHTML()}
      ${email ? '' : '<label class="lbl" for="rs-em">가입한 이메일</label><input class="input" id="rs-em" type="email" placeholder="you@example.com">'}
      <div class="btn-row"><button class="btn primary" id="rs-go">${icon('send', 16)}<span>인증 메일 다시 보내기</span></button></div>`,
    onOpen: (w) => {
      const b = w.querySelector('#rs-go');
      if (email) bindResend(b, email);
      else b.onclick = () => { const e = w.querySelector('#rs-em').value.trim(); if (!/@/.test(e)) return toast('이메일을 입력해주세요', 'error'); bindResend(b, e); b.onclick(); };
    },
  });
}

// 가입 오류를 이해하기 쉬운 말로 (가입이 실패하면 계정은 만들어지지 않으니 다시 시도하면 됨)
function signupErrorText(e) {
  const m = `${e.message || ''} ${e.code || ''}`;
  if (/over_email_send_rate_limit|rate limit|too many/i.test(m) || e.status === 429) return '지금 가입 요청이 많아 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.';
  if (/sending|confirmation email|smtp|unexpected_failure/i.test(m) || e.status === 500) return '지금 사이트의 메일 발송에 문제가 있어 인증 메일을 보낼 수 없어요. 가입 정보는 저장되지 않았으니 잠시 후 다시 시도해 주세요.';
  if (/already registered|already exists/i.test(m)) return '이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해 주세요.';
  if (/password/i.test(m)) return '비밀번호가 조건에 맞지 않아요. 8자 이상, 영문과 숫자를 함께 넣어주세요.';
  if (/email/i.test(m) && /invalid/i.test(m)) return '이메일 주소를 다시 확인해 주세요.';
  return e.message || '가입하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

// 아이디 로그인: 서버(Edge Function)가 아이디로 계정을 찾아 로그인하고 세션만 돌려줌 → 브라우저에 이메일이 노출되지 않음
async function loginWithId(username, password) {
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/login-with-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
    });
  } catch { throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    if (body.error === 'email_not_confirmed') { const e = new Error(''); e.notConfirmed = true; throw e; }
    const m = { rate_limited: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' };
    throw new Error(m[body.error] || '아이디(이메일) 또는 비밀번호가 올바르지 않아요.');
  }
  const { error } = await sb.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  if (error) throw new Error(error.message);
}

function privacyModal() {
  modal({ title: '개인정보 처리방침', wide: true, body: Privacy.policyHTML() });
}

async function recoverPassword() {
  const pw = await modal({ title: '새 비밀번호 설정', body: '<input class="input" type="password" id="np" placeholder="새 비밀번호 (8자 이상)" autocomplete="new-password">', actions: [{ label: '변경', cls: 'primary', value: (w) => { const v = w.querySelector('#np').value; return v.length >= 8 ? v : (toast('8자 이상 입력해주세요', 'error'), false); } }] });
  if (!pw) return;
  const { error } = await sb.auth.updateUser({ password: pw });
  toast(error ? error.message : '비밀번호를 바꿨어요', error ? 'error' : 'ok');
}

function unlockScreen() {
  app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="logo big">${logoSvg()}<span>O-note</span></div>
    <div class="center">${icon('lock', 36)}<h2>보안 금고 열기</h2><p class="muted small">기록이 종단간 암호화되어 있어요. 금고 암호를 입력해주세요.</p></div>
    <form id="uf"><input class="input" type="password" id="vp" placeholder="금고 암호" autocomplete="current-password" required>
    <label class="agree"><input type="checkbox" id="rem"> <span>이 기기에서 기억하기 (개인 기기에서만)</span></label>
    <button class="btn primary full">${icon('lock-open', 18)} 열기</button></form>
    <button class="link small" id="lo">${icon('log-out', 14)} 로그아웃</button>
  </div></div>`;
  $('#uf').onsubmit = async (e) => {
    e.preventDefault();
    loadingBtn(true);
    const ok = await unlock($('#vp').value, $('#rem').checked);
    if (ok) mount(); else { loadingBtn(false); toast('금고 암호가 올바르지 않아요', 'error'); }
  };
  $('#lo').onclick = signOut;
  function loadingBtn(on) { const b = $('#uf button'); if (b) { b.disabled = on; } }
}

async function signOut() {
  if (store.mode === 'local') { sessionStorage.removeItem('onote-trial'); location.reload(); return; }
  await flush();
  await clearDeviceCache();
  await sb.auth.signOut();
}

// ---------- 레이아웃 ----------
const NAV = [
  ['#/', 'house', '홈', '오늘의 기록과 바로가기'],
  ['#/folders', 'folder-heart', '페어 폴더', '페어별 자료 모음'],
  ['#/list/character', 'contact', '캐릭터', '위키형 프로필'],
  ['#/list/world', 'globe', '세계관', '설정 문서'],
  ['#/list/story', 'book-open', '연성', '글쓰기 · E북 보기'],
  ['#/list/plot', 'git-commit-vertical', '플롯·타임라인', '사건 순서 점검'],
  ['#/memo', 'sticky-note', '메모', '짧은 메모'],
  ['#/bookmarks', 'bookmark', '북마크', '모아 보기'],
  ['#/tools', 'wand-sparkles', '글쓰기 도구', '글자 수 · 타이머 · 아이디어'],
];
const TABBAR = [['#/', 'house', '홈'], ['#/folders', 'folder-heart', '폴더'], ['#/list/story', 'book-open', '연성'], ['#/memo', 'sticky-note', '메모'], ['more', 'menu', '전체']];

function logoSvg() {
  return '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="8" fill="var(--accent)"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#fff" stroke-width="3"/><path d="M22 7.5l3 -3" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
}

function mount() {
  app.innerHTML = `
    <div class="shell">
      <aside class="side" id="side">
        <a class="logo" href="#/">${logoSvg()}<span>O-note</span></a>
        <nav class="nav">${NAV.map(([h, ic, n, d]) => `<a href="${h}" data-nav="${h}"><span class="n-ic">${icon(ic, 20)}</span><span class="n-t"><b>${n}</b><small>${d}</small></span></a>`).join('')}</nav>
        <div class="side-foot">
          <a href="#/privacy" data-nav="#/privacy"><span class="n-ic">${icon('file-lock', 20)}</span><span class="n-t"><b>개인정보 처리방침</b></span></a>
          <a href="#/settings" data-nav="#/settings"><span class="n-ic">${icon('settings', 20)}</span><span class="n-t"><b>설정</b><small>${esc(store.mode === 'cloud' ? (store.profile ? `${store.profile.display_name} · @${store.profile.username}` : '아이디 미설정') : '체험 모드')}</small></span></a>
        </div>
      </aside>
      <div class="side-back" id="side-back"></div>
      <div class="main">
        <header class="top">
          <button class="icon-btn hide-d" id="menu" aria-label="메뉴">${icon('menu', 22)}</button>
          <form class="search" id="gs" role="search">${icon('search', 18)}<input placeholder="모든 기록 검색" name="q" aria-label="검색"></form>
          <span class="grow"></span>
          <span class="sync" id="sync" title="저장 상태"></span>
          <button class="pomo-chip" id="pchip" title="뽀모도로 타이머">${icon('timer', 16)}<span id="ptime">${fmt(pomo.remaining)}</span></button>
          <button class="btn primary sm" id="newbtn">${icon('plus', 18)}<span class="hide-m">새로 만들기</span></button>
        </header>
        <main id="view" class="view" tabindex="-1"></main>
      </div>
      <nav class="tabbar">${TABBAR.map(([h, ic, n]) => `<a href="${h === 'more' ? '#' : h}" ${h === 'more' ? 'id="more"' : `data-nav="${h}"`}>${icon(ic, 22)}<span>${n}</span></a>`).join('')}</nav>
    </div>`;

  const side = $('#side'); const back = $('#side-back');
  const closeSide = () => { side.classList.remove('open'); back.classList.remove('open'); };
  $('#menu').onclick = () => { side.classList.add('open'); back.classList.add('open'); };
  $('#more').onclick = (e) => { e.preventDefault(); side.classList.add('open'); back.classList.add('open'); };
  back.onclick = closeSide;
  side.addEventListener('click', (e) => { if (e.target.closest('a')) closeSide(); });
  $('#gs').onsubmit = (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`; };
  $('#newbtn').onclick = newMenu;
  $('#pchip').onclick = () => { if (location.hash.startsWith('#/tools?tab=pomo')) { pomo.running ? pause() : start(); } else location.hash = '#/tools?tab=pomo'; };

  onPomo(() => {
    $('#ptime').textContent = fmt(pomo.remaining);
    $('#pchip').classList.toggle('run', pomo.running);
    $('#pchip').classList.toggle('brk', pomo.mode !== 'focus');
  });
  const drawSync = () => {
    const s = store.status;
    const map = { saved: ['cloud-check', store.mode === 'cloud' ? '동기화됨' : '저장됨'], saving: ['loader', '저장 중…'], error: ['cloud-exclamation-point', '저장 실패 · 재시도 중'], offline: ['cloud-off', '오프라인'], quota: ['cloud-exclamation-point', '저장 공간 가득 참'] };
    const [ic, t] = map[s] || map.saved;
    $('#sync').innerHTML = `${icon(store.mode === 'local' && s === 'saved' ? 'hard-drive' : ic, 16, s === 'saving' ? 'spin' : '')}<span class="hide-m">${t}</span>`;
    $('#sync').className = `sync s-${s}`;
  };
  drawSync();
  onChange((kind) => {
    if (kind === 'status') drawSync();
    if (kind === 'quota') {
      const site = store.quotaKind === 'site';
      modal({ title: site ? '사이트 저장 공간이 거의 찼어요' : '저장 공간이 가득 찼어요', body: `<p>${site ? 'O-note 전체 무료 저장 공간이 거의 차서, 기본 할당량(1MB)을 넘긴 계정은 잠시 기록을 더 늘릴 수 없어요. 새로 쓴 내용이 아직 서버에 저장되지 않았어요.' : '계정의 기록 저장 공간(5MB)을 다 썼어요. 새로 쓴 내용이 아직 서버에 저장되지 않았어요.'}</p><p class="muted small">설정 → 저장 공간에서 사용량을 확인하고, 필요 없는 기록을 지우거나 백업 후 정리해 주세요. 정리하면 자동으로 다시 저장돼요.</p>`, actions: [{ label: '설정으로', cls: 'primary', value: () => { location.hash = '#/settings'; return true; } }] });
    }
    if (kind === 'remote') {
      // 글을 쓰는 중인 화면은 커서가 튀지 않도록 다시 그리지 않음
      const editing = /^#\/(s|read)\//.test(location.hash) || /\/edit/.test(location.hash) || document.querySelector('.modal-back');
      if (!editing) route();
    }
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (store.dirty.size || store.deleted.size) { flush(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else pull(); });
  window.addEventListener('online', () => { flush(); pull({ force: true }); });
  // 무료 전송량을 아끼기 위해 화면이 보일 때만 5분마다 확인 (바뀐 행만 받음)
  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 300000);
  route();
  startImageHydrator();
  if (store.mode === 'cloud') {
    // 무료 공간 아끼기: 문서 속 큰 사진은 저장소로 옮기고, 안 쓰는 사진은 하루 한 번 정리
    setTimeout(() => { migrateInlineImages().then(() => cleanupImages()).catch(() => {}); }, 4000);
  }
}

async function newMenu() {
  const opts = [
    ['character', 'contact', '캐릭터 프로필', '인포박스와 목차가 있는 위키 문서'],
    ['world', 'globe', '세계관 문서', '지역·세력·용어 설정'],
    ['story', 'feather', '연성', '회차별 글쓰기 + E북 보기'],
    ['plot', 'git-commit-vertical', '플롯·타임라인', '사건 카드와 시간축 점검'],
    ['memo', 'sticky-note', '메모', '짧은 아이디어 메모'],
    ['folder', 'folder-heart', '페어 폴더', 'CP·작품별 묶음'],
  ];
  const t = await modal({
    title: '무엇을 만들까요?',
    body: `<div class="new-grid">${opts.map(([k, ic, n, d]) => `<button class="act" data-k="${k}">${icon(ic, 24)}<b>${n}</b><span>${d}</span></button>`).join('')}</div>`,
    onOpen: (w, close) => w.querySelector('.new-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) close(b.dataset.k); }),
  });
  if (t) createNew(t, currentFolder());
}

function currentFolder() { const m = location.hash.match(/#\/folder\/([0-9a-f-]+)/); return m ? m[1] : (new URLSearchParams(location.hash.split('?')[1] || '').get('f') || null); }

async function createNew(t, f) {
  if (t === 'character' || t === 'world') Wiki.newWiki(t, f);
  else if (t === 'story') Story.newStory(f);
  else if (t === 'plot') Plot.newPlot(f);
  else if (t === 'memo') { await Memo.quickMemo(f); route(); }
  else if (t === 'folder') { const { newFolderDialog } = await import('./common.js'); const fo = await newFolderDialog(); if (fo) location.hash = `#/folder/${fo.id}`; }
}

// ---------- 라우터 ----------
function route() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  const view = $('#view');
  if (!view) return;
  $('#side')?.classList.remove('open'); $('#side-back')?.classList.remove('open');
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const h = a.dataset.nav.slice(1);
    a.classList.toggle('on', h === '/' ? path === '/' : path.startsWith(h) || (h === '/list/story' && parts[0] === 's') || (h === '/list/plot' && parts[0] === 'p') || (h === '/folders' && parts[0] === 'folder'));
  });
  view.scrollTop = 0; window.scrollTo(0, 0);
  let r;
  try {
    switch (parts[0]) {
      case undefined: r = Home.renderHome(view); break;
      case 'folders': r = Folders.renderList(view); break;
      case 'folder': r = Folders.renderFolder(view, parts[1], q); break;
      case 'list':
        if (parts[1] === 'character' || parts[1] === 'world') r = Wiki.renderList(view, parts[1], q);
        else if (parts[1] === 'story') r = Story.renderList(view, q);
        else if (parts[1] === 'plot') r = Plot.renderList(view, q);
        break;
      case 'new': createNew(parts[1], q.get('f')); return;
      case 'w': r = parts[2] === 'edit' ? Wiki.renderEdit(view, parts[1]) : Wiki.renderView(view, parts[1]); break;
      case 's': r = Story.renderEdit(view, parts[1], q); break;
      case 'read': r = Story.renderReader(view, parts[1], q); break;
      case 'p': r = Plot.renderView(view, parts[1], q); break;
      case 'memo': r = Memo.renderMemos(view, q); break;
      case 'tools': r = Tools.renderTools(view, q); break;
      case 'bookmarks': r = Home.renderBookmarks(view); break;
      case 'search': r = Home.renderSearch(view, q); break;
      case 'settings': r = Settings.renderSettings(view, { signOut, setTheme, editProfile: async () => { const v = await profileDialog({ current: store.profile }); if (v) { store.profile = v; location.reload(); } } }); break;
      case 'privacy': r = Privacy.renderPrivacy(view); break;
      default: view.innerHTML = '<div class="center-box"><h2>페이지를 찾을 수 없어요</h2><a class="btn primary" href="#/">홈으로</a></div>';
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="center-box">${icon('bug', 36)}<h2>화면을 그리다 문제가 생겼어요</h2><p class="muted">${esc(e.message)}</p><a class="btn primary" href="#/">홈으로</a></div>`;
  }
  if (r && r.cleanup) cleanup = r.cleanup;
  const titles = { w: get(parts[1])?.data.title, s: get(parts[1])?.data.title, p: get(parts[1])?.data.title, read: get(parts[1])?.data.title };
  document.title = `${titles[parts[0]] ? `${titles[parts[0]]} · ` : ''}O-note`;
}

boot().catch((e) => {
  console.error(e);
  app.innerHTML = `<div class="center-box"><h2>시작하지 못했어요</h2><p class="muted">${esc(e.message)}</p></div>`;
});

document.addEventListener('click', (e) => { if (e.target.closest('[data-reload]')) location.reload(); });
