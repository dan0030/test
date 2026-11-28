// 설정: 계정 · 보안 금고 · 백업 · 테마 · 탈퇴
import { store, exportAll, importAll, enableVault, disableVault, lockNow, flush, all, clearDeviceCache, settings, updateSettings } from '../store.js';
import { usage, cleanupImages, migrateInlineImages, reencryptImages, deleteAllImages, inlineData } from '../images.js';
import { cacheEnabled, setCacheEnabled } from '../cache.js';
import { icon, esc, modal, toast, confirmBox, download, pickFile } from '../ui.js';
import { pageHead } from '../common.js';
import { helpBtn } from '../help.js';
import { CONFIG } from '../config.js';
import { PRESETS, TINTS, getLook, accentHex } from '../look.js';
import { BUILTIN, FONT_LIMITS, getFont, uploadFont, deleteFont, deleteAllFonts } from '../fonts.js';
import * as Notify from '../notify.js';
import { isEmailAccount, isUnconfirmed, refreshUser, bindEmailActions } from '../email.js';

// 마지막으로 백업 파일을 받은 날 (이 브라우저 기준)
const BK_KEY = 'onote-last-backup';
function lastBackupText() {
  let t = null; try { t = localStorage.getItem(BK_KEY); } catch { /* noop */ }
  if (!t) return '이 브라우저에서는 아직 백업을 받은 적이 없어요.';
  const days = Math.floor((Date.now() - new Date(t).getTime()) / 864e5);
  return `마지막 백업: ${new Date(t).toLocaleDateString('ko-KR')} (${days ? `${days}일 전` : '오늘'})${days >= 30 ? ' — 새로 받아두는 걸 권장해요.' : ''}`;
}

export function renderSettings(root, opts) {
  const { signOut, setTheme, setLook, setFont, editProfile, rememberLogin, setRememberLogin } = opts;
  const cloud = store.mode === 'cloud';
  const vaultOn = !!store.vault;
  const theme = document.documentElement.dataset.theme || 'auto';
  const isOAuth = store.user?.app_metadata?.provider && store.user.app_metadata.provider !== 'email';
  root.innerHTML = `
    ${pageHead('settings', '설정', '계정, 보안, 백업, 화면 설정을 관리해요.', '', 'settings')}
    <div class="set-grid">
      <section class="card set">
        <h3>${icon('user-round', 18)} 계정</h3>
        ${cloud ? `<dl class="acct">
            <dt>${icon('user-round', 14)} 이름</dt><dd>${esc(store.profile?.display_name || '미설정')}</dd>
            <dt>${icon('at-sign', 14)} 아이디</dt><dd>${store.profile ? `@${esc(store.profile.username)}` : '미설정'}</dd>
            <dt>${icon('mail', 14)} 이메일</dt><dd>${esc(store.user.email || '')} ${isEmailAccount() ? (isUnconfirmed() ? `<span class="chip warn">${icon('mail-warning', 12)} 확인 전</span>` : `<span class="chip ok">${icon('circle-check', 12)} 확인됨</span>`) : ''} <span class="muted small">(나만 보여요)</span></dd>
          </dl>
          ${isUnconfirmed() ? `<p class="warn-box">${icon('mail-warning', 15)} 이메일 확인이 아직 안 됐어요. 확인 메일의 링크를 누르면 끝나요. 주소를 잘못 적었다면 이메일을 바꿔주세요.</p>` : ''}
          <p><span class="chip ok">${icon('cloud', 12)} 클라우드 동기화</span></p>
          <p class="muted small">어떤 브라우저·기기에서든 같은 계정으로 로그인하면 기록이 그대로 이어져요.</p>
          <label class="check"><input type="checkbox" id="remember-set" ${rememberLogin?.() !== false ? 'checked' : ''}><span>이 브라우저에서 로그인 상태 유지 <span class="muted small">(끄면 브라우저를 닫을 때 로그아웃되고, 이 기기에 기록 사본도 남기지 않아요)</span></span></label>
          <div class="btn-row">
            ${isUnconfirmed() ? `<button class="btn primary" data-email-send>${icon('send', 16)}<span>확인 메일 보내기</span></button>` : ''}
            <button class="btn ghost" id="prof">${icon('user-pen', 16)} 아이디·이름 변경</button>
            ${isEmailAccount() ? `<button class="btn ghost" data-email-change>${icon('mail', 16)}<span>이메일 변경</span></button>` : ''}
            ${isOAuth ? '' : `<button class="btn ghost" id="pw">${icon('key-round', 16)} 비밀번호 변경</button>`}
            <button class="btn ghost" id="out">${icon('log-out', 16)} 로그아웃</button>
          </div>`
        : `<p><span class="chip warn">${icon('hard-drive', 12)} 체험 모드</span></p>
          <p class="muted small">지금은 이 브라우저에만 저장돼요. ${CONFIG.SUPABASE_URL ? '로그인하면 계정에 저장되어 어디서든 이어서 쓸 수 있어요.' : '지금은 계정 동기화를 사용할 수 없어요.'}</p>
          ${CONFIG.SUPABASE_URL ? `<button class="btn primary" id="out">${icon('log-in', 16)} 로그인하러 가기</button>` : ''}`}
      </section>

      <section class="card set">
        <h3>${icon('shield-check', 18)} 보안 금고 (종단간 암호화) ${helpBtn('vault')}</h3>
        <p class="muted small">켜면 모든 기록이 <b>내 브라우저에서 암호화된 뒤</b> 서버로 전송돼요. 사이트 운영자나 서버 관리자도 내용을 볼 수 없어요. 새 기기에서는 금고 암호를 한 번 입력해야 해요.</p>
        <p class="warn-box">${icon('triangle-exclamation-point', 15)} 금고 암호를 잊으면 <b>누구도 기록을 복구할 수 없어요.</b> 꼭 따로 적어두세요.</p>
        ${!cloud ? '<p class="muted small">클라우드 모드에서 사용할 수 있어요.</p>' : vaultOn
          ? `<p><span class="chip ok">${icon('lock', 12)} 사용 중</span></p><div class="btn-row"><button class="btn ghost" id="v-lock">${icon('lock', 16)} 이 기기에서 금고 잠그기</button><button class="btn ghost danger" id="v-off">${icon('lock-open', 16)} 암호화 끄기</button></div>`
          : `<button class="btn primary" id="v-on">${icon('lock', 16)} 보안 금고 켜기</button>`}
      </section>

      ${cloud ? `<section class="card set">
        <h3>${icon('hard-drive', 18)} 저장 공간</h3>
        <p class="muted small">모두가 쾌적하게 쓸 수 있도록 한 사람당 쓸 수 있는 공간이 정해져 있어요. 글은 자동으로 압축하고, 사진은 작게 줄여 저장해서 생각보다 훨씬 많이 담을 수 있어요.</p>
        <div id="usage" class="usage"><p class="muted small">사용량을 불러오는 중…</p></div>
        <div class="btn-row"><button class="btn ghost sm" id="gc">${icon('sparkles', 15)}<span>안 쓰는 사진 정리</span></button></div>
        <label class="check"><input type="checkbox" id="devcache" ${cacheEnabled() ? 'checked' : ''} ${rememberLogin?.() === false ? 'disabled' : ''}><span>이 기기에 기록 사본 저장 <span class="muted small">(다시 열 때 바뀐 것만 받아 빨라요. 로그아웃하면 지워져요. 여러 사람이 쓰는 컴퓨터라면 꺼두세요.)</span></span></label>
      </section>` : ''}

      <section class="card set">
        <h3>${icon('archive', 18)} 백업 · 복원</h3>
        <div class="tip-box">${icon('lightbulb', 16)}<div><b>가끔 백업 파일을 받아두세요.</b> ${cloud ? '서버는 매일 자동 백업되지만, 사이트 전체를 되돌리는 용도라 내가 실수로 지운 기록 하나만 골라 살릴 수는 없어요. 한 달에 한 번쯤 또는 중요한 글을 많이 쓴 뒤에 받아두면 안심이에요.' : '체험 모드 기록은 이 브라우저에만 있어서, 브라우저 데이터를 지우면 함께 사라져요. 자주 받아두세요.'}<br><span class="muted small" id="bk-last">${lastBackupText()}</span></div></div>
        <p class="muted small">전체 기록을 JSON 파일로 내려받아 보관하거나, 다른 계정/체험 모드에서 불러올 수 있어요. 백업 파일은 암호화되지 않으니 안전한 곳에 보관하세요.</p>
        <div class="btn-row">
          <button class="btn ghost" id="bk">${icon('download', 16)} 백업 파일 받기</button>
          <button class="btn ghost" id="rs">${icon('upload', 16)} 백업 불러오기</button>
        </div>
        <p class="muted small">현재 ${all().length}개의 기록 · 저장 상태: ${esc({ saved: '저장됨', saving: '저장 중', error: '저장 실패(재시도 중)', offline: '오프라인', quota: '저장 공간 가득 참' }[store.status] || '')}</p>
      </section>

      <section class="card set">
        <h3>${icon('sun-moon', 18)} 화면</h3>
        <label class="lbl">밝기</label>
        <div class="seg" id="th">${[['auto', '시스템'], ['light', '밝게'], ['dark', '어둡게']].map(([k, n]) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div id="look"></div>
        <div id="font"></div>
      </section>

      <section class="card set">
        <h3>${icon('bell', 18)} 알림</h3>
        <p class="muted small">할 일·일정에 알림 시각을 정해두면 그때 이 기기로 알려드려요. 기기(브라우저)마다 따로 켜야 해요.</p>
        <div id="ntf"></div>
        <div class="tip-box">${icon('lightbulb', 16)}<div><b>알아두세요</b>
          <ul class="ntf-notes">
            <li>O-note가 <b>열려 있는 동안</b> 정시에 울려요. 다른 탭을 보거나 창을 내려둬도 괜찮아요.</li>
            <li>사이트를 완전히 닫아두면 그 시각에는 울리지 않아요. 대신 다음에 열 때 <b>놓친 알림(12시간 이내)</b>을 모아서 알려드려요.</li>
            <li>휴대폰은 화면이 꺼지거나 앱을 오래 내려두면 늦게 울릴 수 있어요. iPhone·iPad는 <b>홈 화면에 추가한 O-note</b>에서만 알림을 받을 수 있어요.</li>
          </ul></div></div>
      </section>

      <section class="card set wide">
        <h3>${icon('file-lock', 18)} <span>개인정보 처리 안내</span> <a class="more" href="#/privacy">처리방침 전문 보기</a></h3>
        <ul class="privacy">
          <li>${icon('check', 14)}<span><b>수집 항목:</b> 로그인용 이메일 주소(또는 GitHub 계정 식별자)와 사용자가 직접 작성한 기록만 저장해요. 이름·전화번호 등은 받지 않아요.</span></li>
          <li>${icon('check', 14)}<span><b>비밀번호:</b> O-note는 비밀번호를 보관하지 않아요. 인증 서비스(Supabase Auth)가 bcrypt 해시로만 저장해요.</span></li>
          <li>${icon('check', 14)}<span><b>접근 통제:</b> 데이터베이스의 행 수준 보안(RLS)으로 본인 계정 외에는 누구도 기록을 읽거나 바꿀 수 없어요. 글 공개·게시 기능이 없어 외부에 노출되지 않아요.</span></li>
          <li>${icon('check', 14)}<span><b>전송 구간:</b> 모든 통신은 HTTPS로 암호화돼요. 보안 금고를 켜면 저장 내용까지 종단간 암호화돼요.</span></li>
          <li>${icon('check', 14)}<span><b>추적 없음:</b> 광고·분석 스크립트, 외부 폰트·CDN을 쓰지 않아요. 필요한 라이브러리는 사이트에 직접 포함했어요.</span></li>
          <li>${icon('check', 14)}<span><b>이미지:</b> 올린 이미지는 크기를 줄이면서 촬영 위치 등 메타데이터(EXIF)를 제거해요.</span></li>
          <li>${icon('check', 14)}<span><b>탈퇴:</b> 아래 버튼으로 탈퇴하면 계정과 모든 기록이 즉시 영구 삭제돼요.</span></li>
        </ul>
      </section>

      <section class="card set wide danger-zone">
        <h3>${icon('user-x', 18)} ${cloud ? '회원 탈퇴' : '체험 데이터 지우기'}</h3>
        <p class="muted small">${cloud ? '계정과 모든 기록을 영구 삭제해요. 먼저 백업을 받아두는 것을 권장해요.' : '이 브라우저에 저장된 체험 모드 기록을 모두 지워요.'}</p>
        <button class="btn danger" id="bye">${icon('trash', 16)} ${cloud ? '탈퇴하고 모든 데이터 삭제' : '체험 데이터 모두 지우기'}</button>
      </section>
    </div>`;

  const $ = (s) => root.querySelector(s);
  $('#out') && ($('#out').onclick = signOut);
  $('#prof') && ($('#prof').onclick = () => editProfile?.());
  bindEmailActions(root, () => renderSettings(root, opts));
  // 다른 곳에서 확인 링크를 눌렀다면 상태를 새로 받아 다시 그림
  if (isUnconfirmed()) refreshUser().then(() => { if (!isUnconfirmed() && root.isConnected && location.hash.startsWith('#/settings')) renderSettings(root, opts); });
  $('#remember-set') && ($('#remember-set').onchange = (e) => {
    setRememberLogin?.(e.target.checked);
    toast(e.target.checked ? '브라우저를 껐다 켜도 로그인이 유지돼요' : '브라우저를 닫으면 로그아웃돼요 (이 기기의 사본도 지웠어요)', 'ok');
    const dc = $('#devcache'); if (dc) { dc.checked = cacheEnabled(); dc.disabled = !e.target.checked; }
  });
  // 테마 색: 프리셋 · 직접 고르기 · 배경 물들이기
  const drawLook = () => {
    const l = getLook(); const custom = l.accent.startsWith('#'); const hex = accentHex(l);
    $('#look').innerHTML = `
      <label class="lbl">테마 색</label>
      <div class="look-sw" id="lk-sw">${PRESETS.map(([k, n, c]) => `<button type="button" data-k="${k}" class="${l.accent === k ? 'on' : ''}" style="--c:${c}" aria-pressed="${l.accent === k}"><span class="lk-dot">${l.accent === k ? icon('check', 16) : ''}</span>${n}</button>`).join('')}
        <button type="button" class="lk-custom ${custom ? 'on' : ''}" data-k="custom" style="--c:${hex}" aria-pressed="${custom}"><span class="lk-dot">${custom ? icon('check', 16) : icon('palette', 15)}</span>직접 고르기</button></div>
      <div class="look-custom" id="lk-cu" ${custom ? '' : 'hidden'}><input type="color" id="lk-pick" value="${hex}" aria-label="테마 색 고르기"><input class="input" id="lk-hex" value="${hex}" maxlength="7" placeholder="#7b6cf6" aria-label="색 코드"><span class="muted small">아무 색이나 골라도 글씨가 잘 보이게 자동으로 맞춰요.</span></div>
      <label class="lbl">배경 물들이기</label>
      <div class="seg" id="lk-tint">${TINTS.map(([v, n]) => `<button type="button" data-v="${v}" class="${l.tint === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="look-prev"><button type="button" class="btn primary sm" tabindex="-1">${icon('plus', 15)} 버튼</button><span class="btn ghost sm on" tabindex="-1">선택됨</span><a class="link" tabindex="-1">링크 글씨</a><span class="grow"></span><button type="button" class="link" id="lk-reset">${icon('rotate-ccw', 14)} 기본 색으로</button></div>`;
  };
  const pickLook = (patch) => { setLook({ ...getLook(), ...patch }); drawLook(); };
  drawLook();
  $('#look').onclick = (e) => {
    const sw = e.target.closest('#lk-sw [data-k]');
    if (sw) { if (sw.dataset.k === 'custom') { if (getLook().accent.startsWith('#')) return; pickLook({ accent: accentHex(getLook()) }); $('#lk-pick')?.focus(); } else pickLook({ accent: sw.dataset.k }); return; }
    const t = e.target.closest('#lk-tint [data-v]'); if (t) { pickLook({ tint: +t.dataset.v }); return; }
    if (e.target.closest('#lk-reset')) { setLook({ accent: 'violet', tint: 0 }); drawLook(); toast('기본 색으로 돌렸어요', 'ok'); }
  };
  // 색 고르기 창은 움직이는 동안 미리보기만, 손을 떼면 저장
  $('#look').addEventListener('input', (e) => {
    if (e.target.id === 'lk-pick') { setLook({ ...getLook(), accent: e.target.value }); $('#lk-hex').value = e.target.value; const c = $('.lk-custom'); c?.style.setProperty('--c', e.target.value); }
    if (e.target.id === 'lk-hex') { let v = e.target.value.trim(); if (!v.startsWith('#')) v = `#${v}`; if (/^#[0-9a-f]{6}$/i.test(v)) { setLook({ ...getLook(), accent: v.toLowerCase() }); $('#lk-pick').value = v.toLowerCase(); $('.lk-custom')?.style.setProperty('--c', v); } }
  });
  $('#look').addEventListener('change', (e) => { if (e.target.id === 'lk-pick' || e.target.id === 'lk-hex') drawLook(); });
  // ---------- 글꼴 ----------
  BUILTIN.forEach((b) => { if (b[4] && !document.querySelector(`link[data-font="${b[4]}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = b[4]; l.dataset.font = b[4]; document.head.appendChild(l); } });
  const myFonts = () => { try { return settings().data.fonts || []; } catch { return []; } };
  const drawFont = () => {
    const cur = getFont().key; const mine = myFonts();
    const mb = (b) => `${(b / 1048576).toFixed(1)}MB`;
    $('#font').innerHTML = `
      <label class="lbl">화면 글꼴</label><p class="muted small">메뉴·버튼·목록 등 사이트 화면의 글꼴이에요. 본문 편집기·E북 글꼴은 각 화면에서 따로 정해요.</p>
      <div class="font-list">${BUILTIN.map(([k, n, d, fam]) => `<button type="button" class="font-opt ${cur === k ? 'on' : ''}" data-f="${k}" aria-pressed="${cur === k}"><b style="${fam ? `font-family:${esc(fam)}, sans-serif` : ''}">${esc(n)}</b><span style="${fam ? `font-family:${esc(fam)}, sans-serif` : ''}">가나다 Aa 123</span><small class="muted">${esc(d)}</small></button>`).join('')}
        ${mine.map((f) => `<div class="font-opt mine ${cur === f.key ? 'on' : ''}" data-f="${esc(f.key)}" role="button" tabindex="0" aria-pressed="${cur === f.key}"><b>${esc(f.name)}</b><span data-prev="${esc(f.key)}">가나다 Aa 123</span><small class="muted">내 글꼴 · ${mb(f.size || 0)}${f.local ? ' · 이 브라우저에만' : ''}</small><button type="button" class="icon-btn sm" data-fdel="${esc(f.key)}" aria-label="${esc(f.name)} 지우기" title="지우기">${icon('trash', 13)}</button></div>`).join('')}</div>
      <div class="btn-row"><button type="button" class="btn ghost sm" id="ft-up" ${mine.length >= FONT_LIMITS.count ? 'disabled' : ''}>${icon('upload', 15)}<span>글꼴 파일 올리기</span></button></div>
      <p class="muted small">woff2 · woff · ttf · otf 파일, 1개 ${FONT_LIMITS.size / 1048576}MB 이하, 계정당 ${FONT_LIMITS.count}개까지 올릴 수 있어요${cloud ? ' (사진 저장 공간에 함께 포함돼요)' : ''}. 웹에서 써도 되는(라이선스가 허락된) 글꼴인지 확인해 주세요.</p>`;
    // 내 글꼴 미리보기는 실제 글꼴을 불러와서
    mine.forEach((f) => { if (f.key === cur) { const el = $(`[data-prev="${CSS.escape(f.key)}"]`); if (el) el.style.fontFamily = 'var(--sans)'; } });
  };
  drawFont();
  const pickFont = async (key) => {
    const f = key.startsWith('u:') ? myFonts().find((x) => x.key === key) : { key };
    if (!f) return;
    toast('글꼴을 바꾸는 중…');
    const n = await setFont(f);
    if (key.startsWith('u:') && getComputedStyle(document.documentElement).getPropertyValue('--sans').indexOf('ONoteUser') < 0) toast('글꼴 파일을 불러오지 못했어요', 'error');
    else toast(`'${f.name || BUILTIN.find((b) => b[0] === n.key)?.[1]}' 글꼴로 바꿨어요`, 'ok');
    drawFont();
  };
  $('#font').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-fdel]');
    if (del) {
      const f = myFonts().find((x) => x.key === del.dataset.fdel); if (!f) return;
      if (!(await confirmBox(`'${f.name}' 글꼴을 지울까요?`, '지우기', true))) return;
      try { await deleteFont(f, store.sb); } catch (err) { toast(`지우지 못했어요: ${err.message}`, 'error'); return; }
      updateSettings((d) => { d.fonts = (d.fonts || []).filter((x) => x.key !== f.key); });
      if (getFont().key === f.key) await setFont({ key: 'default' });
      toast('글꼴을 지웠어요', 'ok'); drawFont(); return;
    }
    if (e.target.closest('#ft-up')) {
      if (myFonts().length >= FONT_LIMITS.count) { toast(`글꼴은 ${FONT_LIMITS.count}개까지 올릴 수 있어요. 하나를 지운 뒤 올려주세요.`, 'error'); return; }
      const file = await pickFile('.woff2,.woff,.ttf,.otf');
      if (!file) return;
      try {
        toast('글꼴을 확인하고 올리는 중…');
        const f = await uploadFont(file, { sb: store.sb, uid: store.user?.id, cloud });
        updateSettings((d) => { d.fonts = [...(d.fonts || []), f]; });
        await pickFont(f.key);
      } catch (err) { toast(err.message || '글꼴을 올리지 못했어요', 'error'); }
      return;
    }
    const opt = e.target.closest('[data-f]'); if (opt) pickFont(opt.dataset.f);
  });
  $('#font').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.font-opt.mine')) { e.preventDefault(); pickFont(e.target.dataset.f); } });

  // ---------- 알림 ----------
  const drawNtf = () => {
    const p = Notify.permission(); const on = Notify.enabled();
    const st = p === 'unsupported' ? ['warn', Notify.needsInstall() ? '홈 화면 앱에서만 가능' : '이 브라우저는 지원 안 함'] : p === 'denied' ? ['warn', '브라우저에서 차단됨'] : on ? ['ok', '이 기기에서 켜짐'] : ['', '이 기기에서 꺼짐'];
    $('#ntf').innerHTML = `<p><span class="chip ${st[0]}">${icon(on ? 'bell-ring' : 'bell-off', 12)} ${st[1]}</span></p>
      ${p === 'denied' ? '<p class="muted small">주소창 왼쪽의 자물쇠(사이트 설정) → 알림 → 허용으로 바꾼 뒤 새로고침해 주세요.</p>' : ''}
      <div class="btn-row">${on ? `<button class="btn ghost sm" id="ntf-test">${icon('bell-ring', 15)}<span>테스트 알림 보내기</span></button><button class="btn ghost sm" id="ntf-off">${icon('bell-off', 15)}<span>이 기기에서 끄기</span></button>` : p !== 'unsupported' && p !== 'denied' ? `<button class="btn primary sm" id="ntf-on">${icon('bell', 15)}<span>이 기기에서 알림 켜기</span></button>` : ''}</div>`;
  };
  drawNtf();
  $('#ntf').addEventListener('click', async (e) => {
    if (e.target.closest('#ntf-on')) { if (await Notify.enable()) toast('이 기기에서 알림을 켰어요', 'ok'); drawNtf(); }
    if (e.target.closest('#ntf-off')) { Notify.disable(); toast('이 기기에서 알림을 껐어요', 'ok'); drawNtf(); }
    if (e.target.closest('#ntf-test')) Notify.test();
  });

  $('#th').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; setTheme(b.dataset.t); root.querySelectorAll('#th button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#bk').onclick = async () => {
    toast('백업 파일을 만드는 중… (사진도 함께 담아요)');
    const data = exportAll();
    data.items = await inlineData(data.items);
    download(`o-note-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
    toast('백업 파일을 저장했어요', 'ok');
    try { localStorage.setItem(BK_KEY, new Date().toISOString()); } catch { /* noop */ }
    $('#bk-last').textContent = lastBackupText();
  };
  const drawUsage = async () => {
    const box = $('#usage'); if (!box) return;
    const u = await usage();
    if (!u) { box.innerHTML = '<p class="muted small">사용량을 불러오지 못했어요.</p>'; return; }
    const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.ceil(b / 1024)}KB`);
    const bar = (label, ic, used, limit, extra) => { const pct = Math.min(100, Math.round((used / limit) * 100)); return `<div class="u-row"><div class="u-top"><span>${icon(ic, 14)} ${label}</span><b>${kb(used)} / ${kb(limit)}</b></div><div class="progress"><div style="width:${pct}%;${pct >= 90 ? 'background:var(--danger)' : ''}"></div></div>${extra ? `<p class="muted small">${extra}</p>` : ''}</div>`; };
    const tight = u.site_db_tight || u.site_img_tight;
    box.innerHTML = bar('글·설정 기록', 'file-text', u.db_bytes, u.db_limit, '') + bar('사진·글꼴', 'image', u.img_bytes, u.img_limit, `사진 ${u.img_count}장${(settings().data.fonts || []).filter((f) => !f.local).length ? ` · 글꼴 ${(settings().data.fonts || []).filter((f) => !f.local).length}개` : ''}`)
      + (tight ? `<p class="warn-box">${icon('triangle-exclamation-point', 14)} 지금 O-note 전체 저장 공간이 거의 찼어요. 기본 할당량(기록 1MB · 사진 5MB)까지는 계속 쓸 수 있고, 그 이상은 운영자가 공간을 늘리면 다시 쓸 수 있어요.</p>` : '');
  };
  if (cloud) drawUsage();
  $('#gc') && ($('#gc').onclick = async () => {
    toast('정리하는 중…');
    const moved = await migrateInlineImages({ quiet: false });
    const r = await cleanupImages({ force: true });
    toast(`안 쓰는 사진 ${r.removed}장을 지웠어요${moved ? ` · 문서 속 사진 ${moved}장을 저장소로 옮겼어요` : ''}`, 'ok');
    drawUsage();
  });
  $('#devcache') && ($('#devcache').onchange = async (e) => {
    setCacheEnabled(e.target.checked);
    if (!e.target.checked) { await clearDeviceCache(); toast('이 기기에 저장된 사본을 지웠어요', 'ok'); } else toast('다음에 열 때부터 이 기기에 사본을 저장해요', 'ok');
  });
  $('#rs').onclick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const mode = await modal({ title: '백업 불러오기', body: `<p>${json.items?.length || 0}개의 기록이 있어요. 어떻게 불러올까요?</p>`, actions: [{ label: '기존 기록에 합치기', cls: 'ghost', value: () => 'merge' }, { label: '전부 교체', cls: 'danger', value: () => 'replace' }] });
      if (!mode) return;
      const n = importAll(json, { replace: mode === 'replace' });
      if (cloud) migrateInlineImages().then(() => drawUsage());
      await flush();
      toast(`${n}개의 기록을 불러왔어요`, 'ok');
    } catch (e) { toast(e.message || '파일을 읽지 못했어요', 'error'); }
  };
  $('#pw') && ($('#pw').onclick = async () => {
    const pw = await modal({ title: '비밀번호 변경', body: '<input class="input" type="password" id="np" placeholder="새 비밀번호 (8자 이상)" autocomplete="new-password"><input class="input" type="password" id="np2" placeholder="한 번 더" autocomplete="new-password">', actions: [{ label: '변경', cls: 'primary', value: (w) => { const a = w.querySelector('#np').value; if (a.length < 8) { toast('8자 이상 입력해주세요', 'error'); return false; } if (a !== w.querySelector('#np2').value) { toast('두 비밀번호가 달라요', 'error'); return false; } return a; } }] });
    if (!pw) return;
    const { error } = await store.sb.auth.updateUser({ password: pw });
    toast(error ? error.message : '비밀번호를 바꿨어요', error ? 'error' : 'ok');
  });
  $('#v-on') && ($('#v-on').onclick = async () => {
    const pass = await modal({
      title: '보안 금고 켜기',
      help: 'vault',
      body: `<p class="muted small">로그인 비밀번호와 <b>다른</b> 긴 암호 문구를 권장해요. (예: 좋아하는 대사 한 줄)</p>
        <input class="input" type="password" id="v1" placeholder="금고 암호 (10자 이상)" autocomplete="new-password"><input class="input" type="password" id="v2" placeholder="한 번 더" autocomplete="new-password">
        <label class="lbl"><input type="checkbox" id="v3"> 금고 암호를 잊으면 복구할 수 없다는 것을 이해했어요.</label>`,
      actions: [{ label: '암호화 시작', cls: 'primary', icon: 'lock', value: (w) => {
        const a = w.querySelector('#v1').value;
        if (a.length < 10) { toast('10자 이상 입력해주세요', 'error'); return false; }
        if (a !== w.querySelector('#v2').value) { toast('두 암호가 달라요', 'error'); return false; }
        if (!w.querySelector('#v3').checked) { toast('안내를 확인하고 체크해주세요', 'error'); return false; }
        return a;
      } }],
    });
    if (!pass) return;
    try { toast('모든 기록을 암호화하는 중…'); await enableVault(pass); await reencryptImages(true); toast('보안 금고를 켰어요. 모든 기록이 암호화됐어요.', 'ok'); renderSettings(root, opts); } catch (e) { toast(e.message, 'error'); }
  });
  $('#v-off') && ($('#v-off').onclick = async () => {
    if (!(await confirmBox('암호화를 끄면 기록이 다시 일반 형태로 저장돼요. 계속할까요?', '끄기', true))) return;
    try { await reencryptImages(false); await disableVault(); toast('보안 금고를 껐어요', 'ok'); renderSettings(root, opts); } catch (e) { toast(e.message, 'error'); }
  });
  $('#v-lock') && ($('#v-lock').onclick = async () => { await lockNow(); toast('이 기기에 기억된 금고 키를 지웠어요. 다시 열 때 암호가 필요해요.', 'ok'); setTimeout(() => location.reload(), 800); });
  $('#bye').onclick = async () => {
    if (!cloud) {
      if (await confirmBox('체험 모드 기록을 모두 지울까요?', '모두 지우기', true)) { localStorage.removeItem('onote-local-v1'); location.reload(); }
      return;
    }
    const ok = await modal({ title: '회원 탈퇴', body: '<p>정말 탈퇴할까요? 모든 기록이 <b>즉시 영구 삭제</b>되고 되돌릴 수 없어요.</p><p class="muted small">확인을 위해 <b>탈퇴</b>라고 입력해주세요.</p><input class="input" id="bye-in">', actions: [{ label: '취소', cls: 'ghost', value: () => null }, { label: '영구 삭제', cls: 'danger', value: (w) => (w.querySelector('#bye-in').value.trim() === '탈퇴' ? true : (toast('‘탈퇴’를 정확히 입력해주세요', 'error'), false)) }] });
    if (!ok) return;
    try { await deleteAllImages(); } catch { /* 계속 진행 */ }
    try { await deleteAllFonts(store.sb, store.user?.id); } catch { /* 계속 진행 */ }
    const { error } = await store.sb.rpc('delete_my_account');
    await clearDeviceCache();
    if (error) return toast(`탈퇴 처리 실패: ${error.message}`, 'error');
    await lockNow();
    await store.sb.auth.signOut();
    toast('탈퇴가 완료됐어요. 그동안 고마웠어요.', 'ok');
    setTimeout(() => location.reload(), 1200);
  };
}
