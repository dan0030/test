// 내보내기: 티스토리·포스타입 등 외부 플랫폼에 옮기기 쉬운 HTML / 이미지 / 텍스트
import { inlineImages } from './images.js';
import { sanitize, htmlToText, esc, download, safeName, modal, toast, icon } from './ui.js';

const THEMES = {
  white: { bg: '#ffffff', fg: '#222222', sub: '#888888', line: '#e5e5e5', name: '화이트' },
  cream: { bg: '#fbf7ee', fg: '#3b3226', sub: '#8d806c', line: '#e8dfcc', name: '크림' },
  dark: { bg: '#1d1e22', fg: '#e6e6e6', sub: '#9a9a9a', line: '#3a3b40', name: '다크' },
  pink: { bg: '#fff4f6', fg: '#3c2a30', sub: '#a07c88', line: '#f3d6de', name: '핑크' },
};
const FONTS = {
  serif: '"Noto Serif KR","Nanum Myeongjo","Batang",serif',
  sans: '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif',
};

// 인라인 스타일을 입혀 외부 에디터(HTML 모드)에 붙여넣어도 모양이 유지되게
export function inlineHTML(bodyHTML, { theme = 'white', font = 'serif', title = '', subtitle = '', align = 'left' } = {}) {
  const t = THEMES[theme] || THEMES.white;
  const d = document.createElement('div');
  d.innerHTML = sanitize(bodyHTML);
  d.querySelectorAll('p').forEach((p) => { p.style.margin = p.style.margin || '0 0 0.9em'; });
  d.querySelectorAll('h2,h3,h4').forEach((h) => { h.style.margin = '1.4em 0 0.6em'; h.style.lineHeight = '1.4'; });
  d.querySelectorAll('blockquote').forEach((b) => { b.style.cssText += `;margin:1em 0;padding:.6em 1em;border-left:3px solid ${t.sub};color:${t.sub};`; });
  d.querySelectorAll('hr').forEach((h) => { h.style.cssText = `border:0;border-top:1px solid ${t.line};margin:2em auto;width:40%;`; });
  d.querySelectorAll('img').forEach((i) => { i.style.cssText += ';max-width:100%;height:auto;display:block;margin:1em auto;'; });
  d.querySelectorAll('rt').forEach((r) => { r.style.fontSize = '0.6em'; });
  const head = title ? `<div style="text-align:center;margin:0 0 2.2em;"><div style="font-size:1.5em;font-weight:700;line-height:1.4;">${esc(title)}</div>${subtitle ? `<div style="font-size:.9em;color:${t.sub};margin-top:.5em;">${esc(subtitle)}</div>` : ''}</div>` : '';
  return `<div style="background:${t.bg};color:${t.fg};font-family:${FONTS[font]};font-size:16px;line-height:1.9;letter-spacing:-0.01em;word-break:keep-all;overflow-wrap:break-word;padding:2.4em 1.6em;max-width:720px;margin:0 auto;text-align:${align};">${head}${d.innerHTML}</div>`;
}

export function fullHTMLDoc(title, inner) {
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>\n<body style="margin:0;">\n${inner}\n</body></html>`;
}

export async function copyRich(html) {
  const text = htmlToText(html);
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else {
      await navigator.clipboard.writeText(html);
    }
    return true;
  } catch { return false; }
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

async function renderCanvas(html, width) {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;`;
  box.innerHTML = html;
  document.body.appendChild(box);
  await Promise.all([...box.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
  try {
    return await window.html2canvas(box.firstElementChild, { scale: 2, backgroundColor: null, useCORS: true, logging: false });
  } finally { box.remove(); }
}

export async function exportImages(html, name, { width = 720, split = 0 } = {}) {
  if (!window.html2canvas) { toast('이미지 변환 모듈을 불러오지 못했어요', 'error'); return; }
  const canvas = await renderCanvas(html, width);
  const pages = [];
  const sliceH = split ? split * 2 : canvas.height;
  for (let y = 0; y < canvas.height; y += sliceH) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = Math.min(sliceH, canvas.height - y);
    const ctx = c.getContext('2d');
    ctx.drawImage(canvas, 0, y, c.width, c.height, 0, 0, c.width, c.height);
    pages.push(c);
  }
  for (let i = 0; i < pages.length; i++) {
    const blob = await new Promise((r) => pages[i].toBlob(r, 'image/png'));
    download(`${safeName(name)}${pages.length > 1 ? `_${String(i + 1).padStart(2, '0')}` : ''}.png`, blob);
    await new Promise((r) => setTimeout(r, 250));
  }
  return pages.length;
}

// 내보내기 대화상자
export async function openExport({ title, subtitle = '', html }) {
  html = await inlineImages(html); // 저장소 이미지를 실제 이미지로 바꿔 외부에서도 보이게
  const body = `
    <div class="exp-grid">
      <div>
        <label class="lbl">배경 테마</label>
        <div class="seg" data-g="theme">${Object.entries(THEMES).map(([k, v], i) => `<button class="${i === 0 ? 'on' : ''}" data-v="${k}"><span class="dot" style="background:${v.bg};border-color:${v.line}"></span>${v.name}</button>`).join('')}</div>
        <label class="lbl">글꼴</label>
        <div class="seg" data-g="font"><button class="on" data-v="serif">명조</button><button data-v="sans">고딕</button></div>
        <label class="lbl">정렬</label>
        <div class="seg" data-g="align"><button class="on" data-v="left">왼쪽</button><button data-v="justify">양쪽</button><button data-v="center">가운데</button></div>
        <label class="lbl"><input type="checkbox" id="ex-title" checked> 제목 포함</label>
        <label class="lbl">이미지 나누기 <span class="muted small">(긴 글을 여러 장으로)</span></label>
        <select class="input" id="ex-split"><option value="0">한 장으로</option><option value="1200">약 1200px씩</option><option value="1800">약 1800px씩</option><option value="2400">약 2400px씩</option></select>
      </div>
      <div class="exp-preview" id="ex-prev"></div>
    </div>
    <div class="exp-actions">
      <button class="act" data-a="copy">${icon('clipboard-copy', 22)}<b>서식 복사</b><span>티스토리 기본 에디터에 바로 붙여넣기</span></button>
      <button class="act" data-a="code">${icon('code', 22)}<b>HTML 코드 복사</b><span>티스토리 HTML 모드·포스타입 코드 블록용</span></button>
      <button class="act" data-a="html">${icon('file-code', 22)}<b>HTML 파일 저장</b><span>.html 파일로 다운로드</span></button>
      <button class="act" data-a="png">${icon('image-down', 22)}<b>이미지 저장</b><span>PNG 이미지 (트위터·인스타용)</span></button>
      <button class="act" data-a="txt">${icon('file-text', 22)}<b>텍스트 저장</b><span>서식 없는 .txt 파일</span></button>
    </div>`;
  return modal({
    title: '내보내기 · 옮겨 게시하기',
    wide: true,
    body,
    onOpen: (w) => {
      const opt = { theme: 'white', font: 'serif', align: 'left' };
      const build = () => inlineHTML(html, { ...opt, title: w.querySelector('#ex-title').checked ? title : '', subtitle: w.querySelector('#ex-title').checked ? subtitle : '' });
      const prev = () => { w.querySelector('#ex-prev').innerHTML = build(); };
      w.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        opt[seg.dataset.g] = b.dataset.v; prev();
      }));
      w.querySelector('#ex-title').onchange = prev;
      prev();
      w.querySelector('.exp-actions').addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
        const out = build();
        if (a === 'copy') toast((await copyRich(out)) ? '서식째 복사했어요. 붙여넣기 하세요!' : '복사에 실패했어요', 'ok');
        if (a === 'code') toast((await copyText(out)) ? 'HTML 코드를 복사했어요' : '복사에 실패했어요', 'ok');
        if (a === 'html') download(`${safeName(title)}.html`, fullHTMLDoc(title, out), 'text/html');
        if (a === 'txt') download(`${safeName(title)}.txt`, `${title}\n\n${htmlToText(html)}`, 'text/plain');
        if (a === 'png') {
          toast('이미지를 만드는 중…');
          const n = await exportImages(out, title, { split: +w.querySelector('#ex-split').value });
          if (n) toast(`${n}장의 이미지를 저장했어요`, 'ok');
        }
      });
    },
  });
}
