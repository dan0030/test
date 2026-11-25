// E북 출력: 티스토리 HTML 모드에 붙여넣으면 옆으로 넘겨 읽는 책 형태가 되는 코드 생성
// - 쪽 나누기는 내보낼 때 미리 계산해 고정(독자 화면에서는 계산 없이 그대로 보임)
// - 모든 모양은 인라인 스타일 → <style>이 지워지는 편집기에서도 유지
// - 넘기기: 스와이프/가로 스크롤(스크립트 없이 동작) + 선택형 이전·다음 버튼 스크립트
import { sanitize, esc, modal, icon, toast, download, safeName, htmlToText } from './ui.js';
import { copyText, exportImages } from './export.js';
import { inlineImages } from './images.js';

export const EB_THEMES = {
  paper: { bg: '#fbf8f1', fg: '#2b2620', sub: '#9a8f7e', line: '#e7dfcf', name: '종이' },
  white: { bg: '#ffffff', fg: '#222222', sub: '#999999', line: '#e6e6e6', name: '흰색' },
  sepia: { bg: '#f1e5cc', fg: '#4a3b26', sub: '#8e7a58', line: '#dccaa6', name: '세피아' },
  dark: { bg: '#1c1c21', fg: '#dcdae2', sub: '#85838f', line: '#34333b', name: '어둡게' },
  pink: { bg: '#fff5f7', fg: '#3c2a30', sub: '#a07c88', line: '#f3d6de', name: '핑크' },
};
export const EB_SIZES = {
  s: { w: 340, h: 560, name: '모바일형 (340×560)' },
  m: { w: 440, h: 640, name: '중간 (440×640)' },
  l: { w: 560, h: 720, name: '태블릿형 (560×720)' },
};
const FONTS = {
  serif: "'Noto Serif KR','Nanum Myeongjo','AppleMyungjo','Batang',serif",
  sans: "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
};

function styleBlocks(html, T) {
  const box = document.createElement('div');
  box.innerHTML = sanitize(html || '');
  // 문단 밖 텍스트를 문단으로 감싸기
  [...box.childNodes].forEach((n) => {
    if (n.nodeType === 3 && n.nodeValue.trim()) { const p = document.createElement('p'); p.textContent = n.nodeValue; n.replaceWith(p); } else if (n.nodeType === 3) n.remove();
    else if (n.nodeType === 1 && ['SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'FONT', 'MARK', 'RUBY'].includes(n.tagName)) { const p = document.createElement('p'); n.replaceWith(p); p.appendChild(n); }
  });
  const set = (el, css) => el.setAttribute('style', `${css};${el.getAttribute('style') || ''}`);
  box.querySelectorAll('p,div').forEach((p) => set(p, 'margin:0 0 .85em;'));
  box.querySelectorAll('h2,h3,h4').forEach((h) => set(h, 'margin:.6em 0 .7em;font-size:1.12em;line-height:1.5;font-weight:700;'));
  box.querySelectorAll('blockquote').forEach((b) => set(b, `margin:0 0 .9em;padding:.2em 0 .2em .9em;border-left:3px solid ${T.sub};color:${T.sub};`));
  box.querySelectorAll('hr').forEach((h) => h.setAttribute('style', `border:0;border-top:1px solid ${T.line};width:36%;margin:1.4em auto;`));
  box.querySelectorAll('img').forEach((i) => i.setAttribute('style', 'display:block;max-width:100%;max-height:300px;height:auto;margin:.6em auto;border-radius:4px;'));
  box.querySelectorAll('ul,ol').forEach((l) => set(l, 'margin:0 0 .85em;padding-left:1.3em;'));
  box.querySelectorAll('rt').forEach((r) => set(r, 'font-size:.55em;'));
  box.querySelectorAll('p:empty').forEach((p) => { p.innerHTML = '&nbsp;'; });
  return [...box.children];
}

// 블록을 오프셋 k에서 둘로 나눔 (서식 유지)
function splitAt(el, k) {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let acc = 0; let node = null; let off = 0;
  while (tw.nextNode()) {
    const len = tw.currentNode.nodeValue.length;
    if (acc + len >= k) { node = tw.currentNode; off = k - acc; break; }
    acc += len;
  }
  if (!node) return null;
  const r1 = document.createRange(); r1.setStart(el, 0); r1.setEnd(node, off);
  const r2 = document.createRange(); r2.setStart(node, off); r2.setEnd(el, el.childNodes.length);
  const a = el.cloneNode(false); a.appendChild(r1.cloneContents());
  const b = el.cloneNode(false); b.appendChild(r2.cloneContents());
  // 이어지는 문단은 들여쓰기 없이 시작
  b.style.textIndent = '0';
  return [a, b];
}

export function paginate({ chapters, title, subtitle, opt }) {
  const T = EB_THEMES[opt.theme] || EB_THEMES.paper;
  const S = EB_SIZES[opt.size] || EB_SIZES.s;
  const padX = 26; const padTop = 30; const padBot = 46;
  const meas = document.createElement('div');
  meas.style.cssText = `position:fixed;left:-99999px;top:0;width:${S.w - padX * 2}px;font-family:${FONTS[opt.font]};font-size:${opt.fs}px;line-height:${opt.lh};word-break:keep-all;overflow-wrap:break-word;text-align:${opt.align};`;
  document.body.appendChild(meas);
  // 안전 여유: 독자 환경의 글꼴 차이를 감안해 높이를 조금 덜 채움
  const limit = (S.h - padTop - padBot) * 0.94;
  const pages = [];
  let cur = [];
  const fits = () => meas.scrollHeight <= limit;
  const flush = () => { if (cur.length) pages.push(cur.map((x) => x.outerHTML).join('')); cur = []; meas.innerHTML = ''; };
  try {
    chapters.forEach((ch, ci) => {
      if (ci > 0 || opt.cover) flush();
      const blocks = [];
      if (ch.title) {
        const h = document.createElement('h2');
        h.textContent = ch.title;
        h.setAttribute('style', `margin:1.2em 0 1.6em;text-align:center;font-size:1.18em;font-weight:700;line-height:1.5;color:${T.fg};`);
        blocks.push(h);
      }
      blocks.push(...styleBlocks(ch.html, T));
      const queue = [...blocks];
      while (queue.length) {
        const b = queue.shift();
        meas.appendChild(b);
        if (fits()) { cur.push(b); continue; }
        meas.removeChild(b);
        const text = b.textContent || '';
        const splittable = text.length > 1 && !b.querySelector('img') && b.tagName !== 'HR';
        if (splittable) {
          // 들어가는 만큼 이분 탐색
          let lo = 0; let hi = text.length; let best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const part = splitAt(b, mid);
            if (!part) break;
            meas.appendChild(part[0]);
            const ok = fits();
            meas.removeChild(part[0]);
            if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
          }
          // 단어 단위로 끊기
          if (best > 0 && best < text.length) {
            const sp = text.lastIndexOf(' ', best);
            if (sp > best * 0.6) best = sp + 1;
          }
          if (best > 0) {
            const [a, rest] = splitAt(b, best);
            meas.appendChild(a); cur.push(a);
            flush();
            queue.unshift(rest);
            continue;
          }
        }
        if (cur.length) { flush(); queue.unshift(b); continue; }
        // 빈 쪽에도 안 들어가는 큰 블록은 그대로 한 쪽에
        cur.push(b); flush();
      }
    });
    flush();
  } finally { meas.remove(); }
  return { pages, T, S, padX, padTop, padBot };
}

export function buildEbook({ title, subtitle, chapters, opt }) {
  const { pages, T, S, padX, padTop, padBot } = paginate({ chapters, title, subtitle, opt });
  const uid = `oeb${Math.random().toString(36).slice(2, 8)}`;
  const all = [];
  if (opt.cover) {
    all.push(`<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;height:100%;min-height:${S.h - padTop - padBot}px;">
      <div style="width:34px;height:2px;background:${T.sub};margin:0 auto 22px;opacity:.6;"></div>
      <div style="font-size:1.5em;font-weight:700;line-height:1.45;color:${T.fg};word-break:keep-all;">${esc(title || '')}</div>
      ${subtitle ? `<div style="margin-top:12px;font-size:.88em;color:${T.sub};line-height:1.6;">${esc(subtitle)}</div>` : ''}
      <div style="width:34px;height:2px;background:${T.sub};margin:22px auto 0;opacity:.6;"></div>
      ${opt.author ? `<div style="margin-top:28px;font-size:.85em;color:${T.sub};">${esc(opt.author)}</div>` : ''}
    </div>`);
  }
  all.push(...pages);
  const total = all.length;
  const pageHtml = all.map((inner, i) => `<section id="${uid}-${i + 1}" style="flex:0 0 100%;width:100%;box-sizing:border-box;min-height:${S.h}px;scroll-snap-align:start;scroll-snap-stop:always;padding:${padTop}px ${padX}px ${padBot}px;position:relative;display:flex;flex-direction:column;">
  <div style="flex:1 1 auto;">${inner}</div>
  <div style="position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:11px;letter-spacing:.08em;color:${T.sub};font-family:${FONTS.sans};">${i + 1} / ${total}</div>
</section>`).join('\n');

  const nav = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-family:${FONTS.sans};font-size:13px;color:#888;">
  <a href="#${uid}-1" data-oeb="prev" style="display:inline-block;padding:7px 14px;border:1px solid #ddd;border-radius:999px;color:#666;text-decoration:none;background:#fff;">&#9664; 이전</a>
  <span style="font-size:12px;">옆으로 밀어서 넘겨요</span>
  <a href="#${uid}-2" data-oeb="next" style="display:inline-block;padding:7px 14px;border:1px solid #ddd;border-radius:999px;color:#666;text-decoration:none;background:#fff;">다음 &#9654;</a>
</div>`;
  const style = opt.styleTag ? `<style>#${uid} .oeb-pages::-webkit-scrollbar{display:none}#${uid} .oeb-pages{scrollbar-width:none}</style>\n` : '';
  const script = opt.script ? `\n<script>(function(){var r=document.getElementById('${uid}');if(!r)return;var p=r.querySelector('.oeb-pages');r.addEventListener('click',function(e){var a=e.target.closest?e.target.closest('[data-oeb]'):null;if(!a)return;e.preventDefault();p.scrollBy({left:(a.getAttribute('data-oeb')==='next'?1:-1)*p.clientWidth,behavior:'smooth'});});r.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();p.scrollBy({left:(e.key==='ArrowRight'?1:-1)*p.clientWidth,behavior:'smooth'});}});})();</script>` : '';

  return `<div id="${uid}" class="onote-ebook" style="max-width:${S.w}px;width:100%;margin:28px auto;font-family:${FONTS[opt.font]};">
${style}<div class="oeb-pages" tabindex="0" style="display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;background:${T.bg};color:${T.fg};font-size:${opt.fs}px;line-height:${opt.lh};text-align:${opt.align};word-break:keep-all;overflow-wrap:break-word;border-radius:10px;box-shadow:0 2px 14px rgba(0,0,0,.12);border:1px solid ${T.line};outline:none;">
${pageHtml}
</div>
${nav}${script}
</div>`;
}

const EPREF = 'onote-ebook-opt';
function loadOpt() {
  const d = { theme: 'paper', size: 's', font: 'serif', fs: 15, lh: 1.85, align: 'justify', cover: true, styleTag: true, script: true, author: '' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(EPREF) || '{}') }; } catch { return d; }
}

// 연성 출력 대화상자: E북 / 이미지 / 일반 HTML·텍스트
export async function openStoryOutput({ title, subtitle, chapters, fallback }) {
  chapters = await Promise.all(chapters.map(async (c) => ({ ...c, html: await inlineImages(c.html) })));
  const mode = await modal({
    title: '연성 출력하기',
    help: 'export',
    body: `<div class="out-choice">
      <button class="act" data-m="ebook">${icon('book-open-text', 26)}<b>E북으로 출력하기</b><span>티스토리 HTML 모드에 코드를 붙여넣으면 옆으로 넘겨 읽는 책이 돼요</span></button>
      <button class="act" data-m="image">${icon('image-down', 26)}<b>이미지로 출력하기</b><span>책 쪽 모양 그대로 PNG 이미지로 저장해요 (트위터·인스타용)</span></button>
      <button class="act" data-m="plain">${icon('file-code', 26)}<b>일반 HTML · 텍스트</b><span>서식 복사, HTML 코드, .html / .txt 파일</span></button>
    </div>`,
    onOpen: (w, close) => w.querySelector('.out-choice').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) close(b.dataset.m); }),
  });
  if (!mode) return;
  if (mode === 'plain') return fallback();
  const opt = loadOpt();
  if (mode === 'image') { opt.script = false; }
  await modal({
    title: mode === 'ebook' ? 'E북으로 출력하기' : '이미지로 출력하기',
    help: 'export',
    wide: true,
    body: `<div class="exp-grid">
      <div class="eb-opts">
        <label class="lbl">책 크기</label><select class="input" data-o="size">${Object.entries(EB_SIZES).map(([k, v]) => `<option value="${k}" ${opt.size === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        <label class="lbl">배경</label><div class="seg" data-g="theme">${Object.entries(EB_THEMES).map(([k, v]) => `<button class="${opt.theme === k ? 'on' : ''}" data-v="${k}"><span class="dot" style="background:${v.bg};border-color:${v.line}"></span>${v.name}</button>`).join('')}</div>
        <label class="lbl">글꼴</label><div class="seg" data-g="font"><button class="${opt.font === 'serif' ? 'on' : ''}" data-v="serif">명조</button><button class="${opt.font === 'sans' ? 'on' : ''}" data-v="sans">고딕</button></div>
        <div class="row2"><div><label class="lbl">글자 크기</label><select class="input" data-o="fs">${[13, 14, 15, 16, 17, 18].map((n) => `<option ${opt.fs === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label class="lbl">줄 간격</label><select class="input" data-o="lh">${[1.6, 1.7, 1.8, 1.85, 1.9, 2.0, 2.2].map((n) => `<option ${opt.lh === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <label class="lbl">정렬</label><div class="seg" data-g="align"><button class="${opt.align === 'justify' ? 'on' : ''}" data-v="justify">양쪽</button><button class="${opt.align === 'left' ? 'on' : ''}" data-v="left">왼쪽</button></div>
        <label class="check"><input type="checkbox" data-o="cover" ${opt.cover ? 'checked' : ''}><span>표지 쪽 넣기</span></label>
        <label class="lbl">표지에 적을 이름 (선택)</label><input class="input" data-o="author" value="${esc(opt.author || '')}" placeholder="예: 글 · 닉네임" maxlength="40">
        ${mode === 'ebook' ? `<label class="check"><input type="checkbox" data-o="script" ${opt.script ? 'checked' : ''}><span>이전·다음 버튼 동작 스크립트 포함</span></label>
        <label class="check"><input type="checkbox" data-o="styleTag" ${opt.styleTag ? 'checked' : ''}><span>스크롤바 숨기기 &lt;style&gt; 포함</span></label>` : ''}
      </div>
      <div><div class="eb-preview" id="eb-prev"></div><p class="muted small center" id="eb-info"></p></div>
    </div>
    ${mode === 'ebook' ? `<div class="btn-row"><button class="btn primary" data-go="copy">${icon('clipboard-copy', 16)}<span>코드 복사</span></button><button class="btn ghost" data-go="file">${icon('file-code', 16)}<span>.html 파일 저장</span></button></div>
      <p class="muted small">${icon('info', 13)} 티스토리 글쓰기 → 오른쪽 위 <b>기본모드 → HTML</b>로 바꾸고 붙여넣으세요. 휴대폰에서는 옆으로 밀어서, PC에서는 이전·다음 버튼(또는 가로 스크롤)으로 넘겨요. 스크립트가 지워지는 곳에서도 밀어서 넘기기는 그대로 돼요.</p>`
    : `<div class="btn-row"><button class="btn primary" data-go="png">${icon('image-down', 16)}<span>쪽마다 이미지 저장</span></button><button class="btn ghost" data-go="pnglong">${icon('images', 16)}<span>한 장으로 이어 붙여 저장</span></button></div>`}`,
    onOpen: (w) => {
      let code = '';
      const rebuild = () => {
        try { localStorage.setItem(EPREF, JSON.stringify(opt)); } catch { /* noop */ }
        code = buildEbook({ title, subtitle, chapters, opt });
        w.querySelector('#eb-prev').innerHTML = code.replace(/<script[\s\S]*?<\/script>/g, '');
        const n = (code.match(/<section /g) || []).length;
        w.querySelector('#eb-info').textContent = `총 ${n}쪽 · 코드 ${Math.round(code.length / 1024)}KB`;
      };
      const deb = (() => { let t; return () => { clearTimeout(t); t = setTimeout(rebuild, 200); }; })();
      w.querySelectorAll('.seg[data-g]').forEach((seg) => seg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        opt[seg.dataset.g] = b.dataset.v; deb();
      }));
      w.querySelectorAll('[data-o]').forEach((el) => el.addEventListener(el.type === 'text' ? 'input' : 'change', () => {
        const k = el.dataset.o;
        opt[k] = el.type === 'checkbox' ? el.checked : (k === 'fs' || k === 'lh') ? +el.value : el.value;
        deb();
      }));
      // 미리보기의 이전/다음 버튼
      w.querySelector('#eb-prev').addEventListener('click', (e) => {
        const a = e.target.closest('[data-oeb]'); if (!a) return;
        e.preventDefault();
        const p = w.querySelector('.oeb-pages');
        p.scrollBy({ left: (a.dataset.oeb === 'next' ? 1 : -1) * p.clientWidth, behavior: 'smooth' });
      });
      rebuild();
      w.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', async () => {
        const g = b.dataset.go;
        if (g === 'copy') toast((await copyText(code)) ? 'E북 코드를 복사했어요. 티스토리 HTML 모드에 붙여넣으세요!' : '복사에 실패했어요', 'ok');
        if (g === 'file') download(`${safeName(title)}_ebook.html`, `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0;padding:12px;background:#f4f4f4;">\n${code}\n</body></html>`, 'text/html');
        if (g === 'png' || g === 'pnglong') {
          toast('이미지를 만드는 중…');
          const S = EB_SIZES[opt.size];
          const secs = [...w.querySelectorAll('.oeb-pages > section')];
          const T = EB_THEMES[opt.theme];
          const wrap = (inner) => `<div style="width:${S.w}px;background:${T.bg};color:${T.fg};font-family:${FONTS[opt.font]};font-size:${opt.fs}px;line-height:${opt.lh};text-align:${opt.align};word-break:keep-all;">${inner}</div>`;
          if (g === 'pnglong') {
            const n = await exportImages(wrap(secs.map((s) => s.outerHTML.replace('flex:0 0 100%;', '').replace(/min-height:\d+px/, `height:${S.h}px`)).join(`<div style="height:1px;background:${T.line}"></div>`)), title, { width: S.w });
            if (n) toast('이미지를 저장했어요', 'ok');
          } else {
            for (let i = 0; i < secs.length; i++) {
              // eslint-disable-next-line no-await-in-loop
              await exportImages(wrap(secs[i].outerHTML.replace('flex:0 0 100%;', '').replace(/min-height:\d+px/, `height:${S.h}px`)), `${title}_${String(i + 1).padStart(2, '0')}`, { width: S.w });
            }
            toast(`${secs.length}장의 이미지를 저장했어요`, 'ok');
          }
        }
      }));
    },
  });
}
export { htmlToText };
