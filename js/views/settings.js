// 설정: 계정 · 보안 금고 · 백업 · 테마 · 탈퇴
import { store, exportAll, importAll, enableVault, disableVault, lockNow, flush, all, clearDeviceCache } from '../store.js';
import { usage, cleanupImages, migrateInlineImages, reencryptImages, deleteAllImages, inlineData } from '../images.js';
import { cacheEnabled, setCacheEnabled } from '../cache.js';
import { icon, esc, modal, toast, confirmBox, download, pickFile } from '../ui.js';
import { pageHead } from '../common.js';
import { CONFIG } from '../config.js';

export function renderSettings(root, opts) {
  const { signOut, setTheme, editProfile, rememberLogin, setRememberLogin } = opts;
  const cloud = store.mode === 'cloud';
  const vaultOn = !!store.vault;
  const theme = document.documentElement.dataset.theme || 'auto';
  const isOAuth = store.user?.app_metadata?.provider && store.user.app_metadata.provider !== 'email';
  root.innerHTML = `
    ${pageHead('settings', '설정', '계정, 보안, 백업, 화면 설정을 관리해요.')}
    <div class="set-grid">
      <section class="card set">
        <h3>${icon('user-round', 18)} 계정</h3>
        ${cloud ? `<dl class="acct">
            <dt>${icon('user-round', 14)} 이름</dt><dd>${esc(store.profile?.display_name || '미설정')}</dd>
            <dt>${icon('at-sign', 14)} 아이디</dt><dd>${store.profile ? `@${esc(store.profile.username)}` : '미설정'}</dd>
            <dt>${icon('mail', 14)} 이메일</dt><dd>${esc(store.user.email || '')} <span class="muted small">(나만 보여요)</span></dd>
          </dl>
          <p><span class="chip ok">${icon('cloud', 12)} 클라우드 동기화</span></p>
          <p class="muted small">어떤 브라우저·기기에서든 같은 계정으로 로그인하면 기록이 그대로 이어져요.</p>
          <label class="check"><input type="checkbox" id="remember-set" ${rememberLogin?.() !== false ? 'checked' : ''}><span>이 브라우저에서 로그인 상태 유지 <span class="muted small">(끄면 브라우저를 닫을 때 로그아웃되고, 이 기기에 기록 사본도 남기지 않아요)</span></span></label>
          <div class="btn-row">
            <button class="btn ghost" id="prof">${icon('user-pen', 16)} 아이디·이름 변경</button>
            ${isOAuth ? '' : `<button class="btn ghost" id="pw">${icon('key-round', 16)} 비밀번호 변경</button>`}
            <button class="btn ghost" id="out">${icon('log-out', 16)} 로그아웃</button>
          </div>`
        : `<p><span class="chip warn">${icon('hard-drive', 12)} 체험 모드</span></p>
          <p class="muted small">지금은 이 브라우저에만 저장돼요. ${CONFIG.SUPABASE_URL ? '로그인하면 계정에 저장되어 어디서든 이어서 쓸 수 있어요.' : '지금은 계정 동기화를 사용할 수 없어요.'}</p>
          ${CONFIG.SUPABASE_URL ? `<button class="btn primary" id="out">${icon('log-in', 16)} 로그인하러 가기</button>` : ''}`}
      </section>

      <section class="card set">
        <h3>${icon('shield-check', 18)} 보안 금고 (종단간 암호화)</h3>
        <p class="muted small">켜면 모든 기록이 <b>내 브라우저에서 암호화된 뒤</b> 서버로 전송돼요. 사이트 운영자나 서버 관리자도 내용을 볼 수 없어요. 새 기기에서는 금고 암호를 한 번 입력해야 해요.</p>
        <p class="warn-box">${icon('triangle-exclamation-point', 15)} 금고 암호를 잊으면 <b>누구도 기록을 복구할 수 없어요.</b> 꼭 따로 적어두세요.</p>
        ${!cloud ? '<p class="muted small">클라우드 모드에서 사용할 수 있어요.</p>' : vaultOn
          ? `<p><span class="chip ok">${icon('lock', 12)} 사용 중</span></p><div class="btn-row"><button class="btn ghost" id="v-lock">${icon('lock', 16)} 이 기기에서 금고 잠그기</button><button class="btn ghost danger" id="v-off">${icon('lock-open', 16)} 암호화 끄기</button></div>`
          : `<button class="btn primary" id="v-on">${icon('lock', 16)} 보안 금고 켜기</button>`}
      </section>

      ${cloud ? `<section class="card set">
        <h3>${icon('hard-drive', 18)} 저장 공간</h3>
        <p class="muted small">O-note는 무료로 운영돼서 한 사람당 쓸 수 있는 공간이 정해져 있어요. 글은 자동으로 압축하고, 사진은 작게 줄여 저장해요.</p>
        <div id="usage" class="usage"><p class="muted small">사용량을 불러오는 중…</p></div>
        <div class="btn-row"><button class="btn ghost sm" id="gc">${icon('sparkles', 15)}<span>안 쓰는 사진 정리</span></button></div>
        <label class="check"><input type="checkbox" id="devcache" ${cacheEnabled() ? 'checked' : ''} ${rememberLogin?.() === false ? 'disabled' : ''}><span>이 기기에 기록 사본 저장 <span class="muted small">(다시 열 때 바뀐 것만 받아 빨라요. 로그아웃하면 지워져요. 여러 사람이 쓰는 컴퓨터라면 꺼두세요.)</span></span></label>
      </section>` : ''}

      <section class="card set">
        <h3>${icon('archive', 18)} 백업 · 복원</h3>
        <p class="muted small">전체 기록을 JSON 파일로 내려받아 보관하거나, 다른 계정/체험 모드에서 불러올 수 있어요. 백업 파일은 암호화되지 않으니 안전한 곳에 보관하세요.</p>
        <div class="btn-row">
          <button class="btn ghost" id="bk">${icon('download', 16)} 백업 파일 받기</button>
          <button class="btn ghost" id="rs">${icon('upload', 16)} 백업 불러오기</button>
        </div>
        <p class="muted small">현재 ${all().length}개의 기록 · 저장 상태: ${esc({ saved: '저장됨', saving: '저장 중', error: '저장 실패(재시도 중)', offline: '오프라인', quota: '저장 공간 가득 참' }[store.status] || '')}</p>
      </section>

      <section class="card set">
        <h3>${icon('sun-moon', 18)} 화면</h3>
        <div class="seg" id="th">${[['auto', '시스템'], ['light', '밝게'], ['dark', '어둡게']].map(([k, n]) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${n}</button>`).join('')}</div>
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
  $('#remember-set') && ($('#remember-set').onchange = (e) => {
    setRememberLogin?.(e.target.checked);
    toast(e.target.checked ? '브라우저를 껐다 켜도 로그인이 유지돼요' : '브라우저를 닫으면 로그아웃돼요 (이 기기의 사본도 지웠어요)', 'ok');
    const dc = $('#devcache'); if (dc) { dc.checked = cacheEnabled(); dc.disabled = !e.target.checked; }
  });
  $('#th').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; setTheme(b.dataset.t); root.querySelectorAll('#th button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#bk').onclick = async () => {
    toast('백업 파일을 만드는 중… (사진도 함께 담아요)');
    const data = exportAll();
    data.items = await inlineData(data.items);
    download(`o-note-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
    toast('백업 파일을 저장했어요', 'ok');
  };
  const drawUsage = async () => {
    const box = $('#usage'); if (!box) return;
    const u = await usage();
    if (!u) { box.innerHTML = '<p class="muted small">사용량을 불러오지 못했어요.</p>'; return; }
    const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.ceil(b / 1024)}KB`);
    const bar = (label, ic, used, limit, extra) => { const pct = Math.min(100, Math.round((used / limit) * 100)); return `<div class="u-row"><div class="u-top"><span>${icon(ic, 14)} ${label}</span><b>${kb(used)} / ${kb(limit)}</b></div><div class="progress"><div style="width:${pct}%;${pct >= 90 ? 'background:var(--danger)' : ''}"></div></div>${extra ? `<p class="muted small">${extra}</p>` : ''}</div>`; };
    const tight = u.site_db_tight || u.site_img_tight;
    box.innerHTML = bar('글·설정 기록', 'file-text', u.db_bytes, u.db_limit, '') + bar('사진', 'image', u.img_bytes, u.img_limit, `사진 ${u.img_count}장`)
      + (tight ? `<p class="warn-box">${icon('triangle-exclamation-point', 14)} 지금 O-note 전체 무료 저장 공간이 거의 찼어요. 기본 할당량(기록 1MB · 사진 3MB)까지는 계속 쓸 수 있고, 그 이상은 공간이 생기면 다시 늘릴 수 있어요.</p>` : '');
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
    const { error } = await store.sb.rpc('delete_my_account');
    await clearDeviceCache();
    if (error) return toast(`탈퇴 처리 실패: ${error.message}`, 'error');
    await lockNow();
    await store.sb.auth.signOut();
    toast('탈퇴가 완료됐어요. 그동안 고마웠어요.', 'ok');
    setTimeout(() => location.reload(), 1200);
  };
}
