// 입력 폼 대화상자 (위키 편집기의 사진·인용구·각주 등)
import { modal, esc, icon, toast, pickFile } from './ui.js';
import { saveImage } from './images.js';
import { openColorPopover, normHex } from './colors.js';

// ---------- 꾸밈 글 입력칸 (각주 등 한 줄 안에 들어가는 글) ----------
// 굵게·기울임·밑줄·취소선·위/아래 첨자·글자 색·형광펜·크기·링크. 줄바꿈은 <br> 로만 저장
const RICH_SIZES = [['', '크기'], ['.8em', '작게'], ['1em', '보통'], ['1.2em', '크게'], ['1.45em', '아주 크게']];
const RICH_CSS = /^(color|background-color|font-size|font-weight|font-style|text-decoration|text-decoration-line)$/;
const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUP', 'SUB', 'A', 'SPAN', 'MARK', 'SMALL', 'BR']);
const BLOCKS = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'TR']);

// 허용한 인라인 꾸밈만 남기고 나머지는 글자만 남김 (붙여넣기·저장 모두 이 함수를 거침)
export function cleanInlineHtml(html) {
  // 별도 문서(DOMParser)에서 파싱 → 이미지 로딩·스크립트·이벤트 속성이 전혀 실행되지 않음
  const src = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html').body;
  const out = document.createElement('div');
  const copy = (from, to) => {
    from.childNodes.forEach((n) => {
      if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|IMG|SVG|VIDEO|AUDIO)$/.test(n.tagName)) return;
      const tag = n.tagName;
      if (tag === 'FONT') { // execCommand 가 만드는 <font color> 는 span 으로
        const sp = document.createElement('span');
        if (n.getAttribute('color')) sp.style.color = n.getAttribute('color');
        copy(n, sp); to.appendChild(sp); return;
      }
      if (!RICH_TAGS.has(tag)) {
        if (BLOCKS.has(tag) && to.lastChild && to.lastChild.nodeName !== 'BR') to.appendChild(document.createElement('br'));
        copy(n, to);
        return;
      }
      const el = document.createElement(tag === 'STRONG' ? 'b' : tag === 'EM' ? 'i' : tag === 'STRIKE' || tag === 'DEL' ? 's' : tag.toLowerCase());
      if (tag === 'A') {
        const href = n.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) { copy(n, to); return; }
        el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer');
      }
      const style = (n.getAttribute('style') || '').split(';').map((d) => {
        const i = d.indexOf(':'); if (i < 0) return '';
        const k = d.slice(0, i).trim().toLowerCase(); const v = d.slice(i + 1).trim();
        return RICH_CSS.test(k) && !/(url\(|expression|javascript:)/i.test(v) ? `${k}:${v}` : '';
      }).filter(Boolean).join(';');
      if (style) el.setAttribute('style', style);
      copy(n, el);
      if (tag === 'SPAN' && !style) { while (el.firstChild) to.appendChild(el.firstChild); return; }
      to.appendChild(el);
    });
  };
  copy(src, out);
  while (out.lastChild && out.lastChild.nodeName === 'BR') out.lastChild.remove();
  while (out.firstChild && out.firstChild.nodeName === 'BR') out.firstChild.remove();
  return out.innerHTML.trim();
}

const RB = (cmd, ic, label) => `<button type="button" class="tb" data-rc="${cmd}" title="${label}" aria-label="${label}">${icon(ic, 16)}</button>`;

function bindRich(w) {
  w.querySelectorAll('.rich').forEach((box) => {
    const area = box.querySelector('.rich-area');
    let saved = null;
    const save = () => { const s = window.getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restore = () => { area.focus({ preventScroll: true }); if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    const exec = (cmd, val = null, css = false) => {
      restore();
      try { document.execCommand('styleWithCSS', false, css); } catch { /* noop */ }
      document.execCommand(cmd, false, val);
      try { document.execCommand('styleWithCSS', false, false); } catch { /* noop */ }
      save(); sync();
    };
    const sync = () => area.classList.toggle('is-empty', !area.textContent.trim());
    const onSel = () => { if (document.activeElement === area) save(); };
    document.addEventListener('selectionchange', onSel);
    new MutationObserver(() => { if (!document.body.contains(box)) document.removeEventListener('selectionchange', onSel); }).observe(document.body, { childList: true });
    area.addEventListener('input', sync);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.execCommand('insertLineBreak') || document.execCommand('insertHTML', false, '<br><br>'); }
    });
    area.addEventListener('paste', (e) => {
      const cd = e.clipboardData; if (!cd) return;
      e.preventDefault();
      const h = cd.getData('text/html');
      document.execCommand('insertHTML', false, h ? cleanInlineHtml(h) : esc(cd.getData('text/plain')).replace(/\r?\n/g, '<br>'));
    });
    const bar = box.querySelector('.rich-bar');
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rc]'); if (!b) return;
      const c = b.dataset.rc;
      if (c === 'color') return openColorPopover(b, null, (v) => exec('foreColor', v, true));
      if (c === 'hilite') return openColorPopover(b, null, (v) => exec('hiliteColor', v === 'transparent' ? 'transparent' : v, true), { transparent: true });
      if (c === 'link') {
        const row = box.querySelector('.rich-link');
        row.hidden = !row.hidden;
        if (!row.hidden) row.querySelector('input').focus();
        return;
      }
      if (c === 'clear') { exec('removeFormat'); exec('unlink'); return; }
      exec(c);
    });
    bar.addEventListener('change', (e) => {
      const s = e.target.closest('[data-rsize]'); if (!s || !s.value) return;
      const size = s.value; s.value = '';
      exec('fontSize', '7');
      area.querySelectorAll('font[size="7"]').forEach((f) => {
        const sp = document.createElement('span'); sp.style.fontSize = size;
        while (f.firstChild) sp.appendChild(f.firstChild);
        f.replaceWith(sp);
      });
      sync();
    });
    const lrow = box.querySelector('.rich-link');
    const applyLink = () => {
      const url = lrow.querySelector('input').value.trim();
      if (!/^https?:\/\//i.test(url)) return toast('http:// 또는 https:// 로 시작하는 주소를 넣어주세요', 'error');
      restore();
      if (window.getSelection().isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
      else document.execCommand('createLink', false, url);
      lrow.hidden = true; lrow.querySelector('input').value = ''; save(); sync();
    };
    lrow.querySelector('button').addEventListener('click', applyLink);
    lrow.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } });
    sync();
  });
}

function field(f) {
  const id = `ff-${f.key}`;
  const hint = f.hint ? `<p class="muted small">${esc(f.hint)}</p>` : '';
  const lbl = `<label class="lbl" for="${id}">${esc(f.label)}</label>`;
  switch (f.type) {
    case 'textarea':
      return `${lbl}<textarea class="input" id="${id}" data-k="${f.key}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>${hint}`;
    case 'rich':
      return `<label class="lbl" id="${id}-l">${esc(f.label)}</label><div class="rich">
        <div class="rich-bar" role="toolbar" aria-label="글자 꾸밈">
          ${RB('bold', 'bold', '굵게')}${RB('italic', 'italic', '기울임')}${RB('underline', 'underline', '밑줄')}${RB('strikeThrough', 'strikethrough', '취소선')}
          ${RB('superscript', 'superscript', '위 첨자')}${RB('subscript', 'subscript', '아래 첨자')}
          ${RB('color', 'baseline', '글자 색')}${RB('hilite', 'highlighter', '형광펜')}
          <select class="tb-select" data-rsize title="글자 크기" aria-label="글자 크기">${RICH_SIZES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
          ${RB('link', 'link', '링크')}${RB('clear', 'remove-formatting', '꾸밈 지우기')}
        </div>
        <div class="rich-link" hidden><input class="input" type="url" placeholder="https:// 링크 주소 (글자를 먼저 선택하면 그 글자에 걸려요)"><button type="button" class="btn primary sm">넣기</button></div>
        <div class="input rich-area" id="${id}" data-k="${f.key}" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="${id}-l" data-ph="${esc(f.placeholder || '')}" style="min-height:${(f.rows || 3) * 1.7 + 1}em">${cleanInlineHtml(f.value || '')}</div>
      </div>${hint}`;
    case 'select':
      return `${lbl}<select class="input" id="${id}" data-k="${f.key}">${f.options.map(([v, n]) => `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${hint}`;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" id="${id}" data-k="${f.key}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span></label>${hint}`;
    case 'color': {
      const v = normHex(f.value) || '';
      return `${lbl}<button type="button" class="color-btn" id="${id}" data-k="${f.key}" data-color="${esc(v)}" data-auto="${f.auto === false ? '' : 1}"><span class="cb-sw" style="background:${v || 'transparent'}"></span><span class="cb-t">${v || '자동'}</span>${icon('chevron-down', 14)}</button>${hint}`;
    }
    case 'image':
      return `${lbl}<div class="img-field"><input class="input" id="${id}" data-k="${f.key}" value="${esc(f.value || '')}" placeholder="https:// 이미지 주소 또는 파일 올리기"><button type="button" class="btn ghost sm" data-upload="${f.key}">${icon('upload', 15)}<span>파일</span></button></div>${hint}`;
    default:
      return `${lbl}<input class="input" id="${id}" data-k="${f.key}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">${hint}`;
  }
}

export function formDialog({ title, fields, okText = '확인', wide = false, danger }) {
  return modal({
    title,
    wide,
    body: `<div class="form">${fields.map(field).join('')}</div>`,
    actions: [
      ...(danger ? [{ label: danger, cls: 'ghost danger', icon: 'trash', value: () => ({ __delete: true }) }] : []),
      { label: '취소', cls: 'ghost', value: () => null },
      {
        label: okText, cls: 'primary', icon: 'check', value: (w) => {
          const out = {};
          w.querySelectorAll('[data-k]').forEach((el) => {
            const k = el.dataset.k;
            if (el.type === 'checkbox') out[k] = el.checked;
            else if (el.classList.contains('color-btn')) out[k] = el.dataset.color || '';
            else if (el.classList.contains('rich-area')) out[k] = cleanInlineHtml(el.innerHTML);
            else out[k] = el.value;
          });
          return out;
        },
      },
    ],
    onOpen: (w) => {
      bindRich(w);
      w.querySelectorAll('.color-btn').forEach((b) => b.addEventListener('click', () => openColorPopover(b, b.dataset.color, (c) => {
        b.dataset.color = c === 'transparent' ? '' : c;
        b.querySelector('.cb-sw').style.background = b.dataset.color || 'transparent';
        b.querySelector('.cb-t').textContent = b.dataset.color || '자동';
      }, { auto: !!b.dataset.auto })));
      w.querySelectorAll('[data-upload]').forEach((b) => b.addEventListener('click', async () => {
        const f = await pickFile();
        if (!f) return;
        try {
          toast('이미지를 올리는 중…');
          const url = await saveImage(f, 'content');
          w.querySelector(`[data-k="${b.dataset.upload}"]`).value = url;
          toast('이미지를 올렸어요 (자동으로 줄이고 위치정보를 지웠어요)', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      }));
    },
  });
}
