// O-note 자체 리치 텍스트 에디터 (한글/포스타입 스타일, 모바일 대응)
import { openColorPopover } from './colors.js';
import { saveImage, uploadDomImages } from './images.js';
import { icon, esc, sanitize, htmlToText, countText, modal, toast, pickFile, debounce, imgAttrs, $ } from './ui.js';

const TEXT_COLORS = ['#222222', '#666666', '#b0b0b0', '#e5484d', '#f76b15', '#d6a100', '#30a46c', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#ffffff'];
const HL_COLORS = ['transparent', '#ffe8a3', '#ffd1dc', '#d7f5c9', '#cde9ff', '#e6dcff', '#ffd9b8', '#eeeeee'];
const SYMBOLS = ['「」', '『』', '“”', '‘’', '…', '—', '─', '♡', '♥', '★', '☆', '♪', '※', '→', '·', '〈〉', '《》', '~', '∼', '♣', '✿', '❀', '◆', '◇'];
const FONTS = [
  ['기본', ''],
  ['명조', '"Noto Serif KR","Nanum Myeongjo","Batang",serif'],
  ['고딕', '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif'],
  ['고정폭', '"D2Coding",ui-monospace,monospace'],
];

const btn = (cmd, ic, label, extra = '') => `<button type="button" class="tb" data-cmd="${cmd}" ${extra} title="${label}" aria-label="${label}">${icon(ic, 18)}</button>`;

export function createEditor(host, { html = '', onChange, placeholder = '여기에 글을 써보세요…', compact = false } = {}) {
  host.classList.add('ed');
  host.innerHTML = `
    <div class="ed-toolbar" role="toolbar" aria-label="글 서식 도구">
      <div class="tb-group">
        ${btn('undo', 'undo-2', '되돌리기 (Ctrl+Z)')}${btn('redo', 'redo-2', '다시 실행 (Ctrl+Y)')}
      </div>
      <div class="tb-group">
        <select class="tb-select" data-sel="block" title="문단 스타일" aria-label="문단 스타일">
          <option value="p">본문</option><option value="h2">큰 제목</option><option value="h3">중간 제목</option><option value="h4">작은 제목</option><option value="blockquote">인용</option>
        </select>
        <select class="tb-select" data-sel="size" title="글자 크기" aria-label="글자 크기">
          <option value="">크기</option><option value="1">아주 작게</option><option value="2">작게</option><option value="3">보통</option><option value="4">조금 크게</option><option value="5">크게</option><option value="6">아주 크게</option>
        </select>
        ${compact ? '' : `<select class="tb-select" data-sel="font" title="글꼴" aria-label="글꼴">${FONTS.map(([n, v]) => `<option value='${v}'>${n}</option>`).join('')}</select>`}
      </div>
      <div class="tb-group">
        ${btn('bold', 'bold', '굵게 (Ctrl+B)')}${btn('italic', 'italic', '기울임 (Ctrl+I)')}${btn('underline', 'underline', '밑줄 (Ctrl+U)')}${btn('strikeThrough', 'strikethrough', '취소선')}
        ${btn('color', 'baseline', '글자 색')}${btn('hilite', 'highlighter', '형광펜')}
      </div>
      <div class="tb-group">
        ${btn('justifyLeft', 'text-align-start', '왼쪽 정렬')}${btn('justifyCenter', 'text-align-center', '가운데 정렬')}${btn('justifyRight', 'text-align-end', '오른쪽 정렬')}${btn('justifyFull', 'text-align-justify', '양쪽 정렬')}
      </div>
      <div class="tb-group">
        ${btn('insertUnorderedList', 'list', '글머리 목록')}${btn('insertOrderedList', 'list-ordered', '번호 목록')}
        ${btn('hr', 'minus', '구분선')}${btn('image', 'image', '이미지 넣기')}${btn('link', 'link', '링크')}
        ${compact ? '' : btn('ruby', 'languages', '윗주(루비) 달기')}
        ${btn('symbol', 'smile', '특수문자·기호')}
      </div>
      <div class="tb-group">
        ${btn('removeFormat', 'remove-formatting', '서식 지우기')}
        ${compact ? '' : btn('find', 'text-search', '찾기/바꾸기')}
        ${compact ? '' : btn('focus', 'maximize-2', '집중 모드')}
      </div>
    </div>
    <div class="ed-area" contenteditable="true" spellcheck="false" data-ph="${esc(placeholder)}" role="textbox" aria-multiline="true"></div>
    <div class="ed-status">
      <span class="st-count"></span>
      <span class="st-save"></span>
    </div>`;

  const area = $('.ed-area', host);
  area.innerHTML = sanitize(html);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* noop */ }
  if (!area.innerHTML.trim()) area.innerHTML = '<p><br></p>';

  let savedRange = null;
  const saveSel = () => {
    const s = window.getSelection();
    if (s.rangeCount && area.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
  };
  const restoreSel = () => {
    area.focus({ preventScroll: true });
    if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  };
  const exec = (cmd, val = null) => { restoreSel(); document.execCommand(cmd, false, val); changed(); };

  const updateCount = () => {
    const c = countText(htmlToText(area.innerHTML));
    $('.st-count', host).innerHTML = `${icon('type', 14)} 공백 포함 <b>${c.withSpace.toLocaleString()}</b>자 · 제외 <b>${c.noSpace.toLocaleString()}</b>자 · 원고지 <b>${c.manuscript}</b>매`;
  };
  const fire = debounce(() => onChange?.(sanitize(area.innerHTML)), 500);
  const markEmpty = () => area.classList.toggle('is-empty', !area.textContent.trim() && !area.querySelector('img,hr'));
  const changed = () => { updateCount(); markEmpty(); fire(); };

  area.addEventListener('input', changed);
  area.addEventListener('keyup', saveSel);
  area.addEventListener('mouseup', saveSel);
  area.addEventListener('touchend', () => setTimeout(saveSel, 50));
  const onSelChange = () => { if (document.activeElement === area) { saveSel(); reflectState(); } };
  document.addEventListener('selectionchange', onSelChange);

  // 붙여넣기: 위험한 태그와 외부 클래스 제거
  area.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    let h = cd.getData('text/html');
    if (h) {
      h = sanitize(h).replace(/\sclass="[^"]*"/g, '');
    } else {
      const t = cd.getData('text/plain');
      h = t.split(/\r?\n/).map((l) => `<p>${esc(l) || '<br>'}</p>`).join('');
    }
    document.execCommand('insertHTML', false, h);
    changed();
    if (/<img[^>]+src="data:image/.test(h)) uploadDomImages(area).then((n) => { if (n) changed(); });
  });

  area.addEventListener('drop', async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) {
      e.preventDefault();
      try { const ref = await saveImage(f, 'content'); document.execCommand('insertHTML', false, `<img ${imgAttrs(ref)} alt="">`); changed(); } catch (err) { toast(err.message, 'error'); }
    }
  });

  // 키보드 단축키
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '　'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onChange?.(sanitize(area.innerHTML)); toast('저장했어요', 'ok'); }
  });

  function reflectState() {
    $$q('[data-cmd]').forEach((b) => {
      const c = b.dataset.cmd;
      if (['bold', 'italic', 'underline', 'strikeThrough', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertUnorderedList', 'insertOrderedList'].includes(c)) {
        let on = false; try { on = document.queryCommandState(c); } catch { /* noop */ }
        b.classList.toggle('on', on);
      }
    });
    try {
      const blk = (document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
      const sel = $('[data-sel="block"]', host);
      if ([...sel.options].some((o) => o.value === blk)) sel.value = blk; else sel.value = 'p';
    } catch { /* noop */ }
  }
  const $$q = (s) => [...host.querySelectorAll(s)];

  // 툴바 클릭 시 선택 영역 유지
  $('.ed-toolbar', host).addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  $('.ed-toolbar', host).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    const cmd = b.dataset.cmd;
    switch (cmd) {
      case 'color': saveSel(); return openColorPopover(b, null, (c) => exec('foreColor', c), { presets: [...TEXT_COLORS, ...HL_COLORS.slice(1)] });
      case 'hilite': saveSel(); return openColorPopover(b, null, (c) => { exec('styleWithCSS', true); exec('hiliteColor', c); exec('styleWithCSS', false); }, { presets: [...HL_COLORS.slice(1), ...TEXT_COLORS], transparent: true });
      case 'hr': return exec('insertHTML', '<hr><p><br></p>');
      case 'image': {
        saveSel();
        const f = await pickFile('image/*');
        if (!f) return;
        try { toast('이미지를 올리는 중…'); const ref = await saveImage(f, 'content'); exec('insertHTML', `<img ${imgAttrs(ref)} alt="">`); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      case 'link': {
        saveSel();
        const url = await modal({ title: '링크 넣기', body: '<input class="input" id="lk" placeholder="https://">', actions: [{ label: '넣기', cls: 'primary', value: (w) => w.querySelector('#lk').value.trim() || false }] });
        if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
        else if (url) toast('http:// 또는 https:// 로 시작하는 주소만 넣을 수 있어요', 'error');
        return;
      }
      case 'ruby': {
        saveSel();
        const base = window.getSelection().toString();
        const r = await modal({
          title: '윗주(루비) 달기',
          body: `<label class="lbl">본문</label><input class="input" id="rb" value="${esc(base)}" placeholder="예: 天"><label class="lbl">윗주</label><input class="input" id="rt" placeholder="예: 하늘">`,
          actions: [{ label: '넣기', cls: 'primary', value: (w) => ({ b: w.querySelector('#rb').value, t: w.querySelector('#rt').value }) }],
        });
        if (r && r.b) exec('insertHTML', `<ruby>${esc(r.b)}<rp>(</rp><rt>${esc(r.t)}</rt><rp>)</rp></ruby>&#8203;`);
        return;
      }
      case 'symbol': return palette(b, SYMBOLS, (s) => exec('insertText', s), true);
      case 'find': return findReplace();
      case 'focus': host.classList.toggle('focus-mode'); document.body.classList.toggle('ed-focus', host.classList.contains('focus-mode')); b.classList.toggle('on'); return;
      default: exec(cmd);
    }
  });

  $('.ed-toolbar', host).addEventListener('change', (e) => {
    const s = e.target.closest('[data-sel]');
    if (!s) return;
    if (s.dataset.sel === 'block') exec('formatBlock', `<${s.value}>`);
    if (s.dataset.sel === 'size' && s.value) { exec('fontSize', s.value); s.value = ''; }
    if (s.dataset.sel === 'font') exec('fontName', s.value || 'inherit');
  });

  function palette(anchor, list, pick, isText = false) {
    document.querySelectorAll('.ed-pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    pop.className = 'ed-pop';
    pop.innerHTML = list.map((c) => isText
      ? `<button type="button" class="sym" data-v="${esc(c)}">${esc(c)}</button>`
      : `<button type="button" class="sw" data-v="${c}" style="background:${c === 'transparent' ? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px)' : c}" aria-label="${c}"></button>`).join('');
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left))}px`;
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    pop.addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]');
      if (!v) return;
      let val = v.dataset.v;
      if (isText && val.length === 2 && /[「『“‘〈《]/.test(val[0])) {
        // 괄호쌍: 선택 텍스트를 감싸기
        const sel = window.getSelection().toString();
        restoreSel();
        document.execCommand('insertText', false, val[0] + sel + val[1]);
        changed();
      } else pick(val);
      pop.remove();
    });
    setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }

  async function findReplace() {
    await modal({
      title: '찾기 / 바꾸기',
      body: `<label class="lbl">찾을 말</label><input class="input" id="fq"><label class="lbl">바꿀 말</label><input class="input" id="fr"><p class="muted small" id="fres"></p>`,
      actions: [
        { label: '개수 세기', cls: 'ghost', value: (w) => { const q = w.querySelector('#fq').value; const n = q ? htmlToText(area.innerHTML).split(q).length - 1 : 0; w.querySelector('#fres').textContent = `${n}개 찾았어요`; return false; } },
        { label: '모두 바꾸기', cls: 'primary', value: (w) => {
          const q = w.querySelector('#fq').value; const r = w.querySelector('#fr').value;
          if (!q) return false;
          let n = 0;
          const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
          const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
          nodes.forEach((nd) => { if (nd.nodeValue.includes(q)) { n += nd.nodeValue.split(q).length - 1; nd.nodeValue = nd.nodeValue.split(q).join(r); } });
          changed();
          toast(`${n}곳을 바꿨어요`, 'ok');
          return true;
        } },
      ],
    });
  }

  updateCount();
  markEmpty();

  return {
    el: area,
    getHTML: () => sanitize(area.innerHTML),
    setHTML: (h) => { area.innerHTML = sanitize(h) || '<p><br></p>'; updateCount(); },
    setStatus: (t) => { $('.st-save', host).innerHTML = t; },
    focus: () => area.focus(),
    flush: () => onChange?.(sanitize(area.innerHTML)),
    destroy: () => { document.body.classList.remove('ed-focus'); document.removeEventListener('selectionchange', onSelChange); },
  };
}
