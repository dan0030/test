// 홈 · 북마크 · 검색
import { all, store } from '../store.js';
import { icon, esc, TYPES, emptyState, htmlToText } from '../ui.js';
import { itemCard, pageHead, summary, itemHref } from '../common.js';
import { todayWritten } from './story.js';
import { todayPomos } from '../pomodoro.js';

export function renderHome(root) {
  const recent = all().filter((i) => i.type !== 'folder').slice(0, 6);
  const pinned = all('memo').filter((m) => m.data.pinned).slice(0, 4);
  const folders = all('folder').slice(0, 8);
  const hour = new Date().getHours();
  const hi = hour < 6 ? '새벽 연성 중이신가요? 🌙' : hour < 12 ? '좋은 아침이에요 ☀️' : hour < 18 ? '오늘도 즐거운 덕질 💞' : '오늘 하루도 수고했어요 🌙';
  const quick = [
    ['#/folders', 'folder-heart', '페어 폴더', 'CP·작품별로 자료를 묶어요'],
    ['#/new/character', 'contact', '캐릭터 프로필', '위키처럼 설정을 정리해요'],
    ['#/new/world', 'globe', '세계관 문서', '장소·세력·용어를 기록해요'],
    ['#/new/story', 'feather', '연성 쓰기', '회차별로 글을 써요'],
    ['#/new/plot', 'git-commit-vertical', '플롯·타임라인', '사건 순서를 점검해요'],
    ['#/memo', 'sticky-note', '빠른 메모', '떠오른 생각을 바로 적어요'],
    ['#/tools?tab=idea', 'lightbulb', '브레인스토밍', '막힐 때 아이디어 뽑기'],
    ['#/tools?tab=pomo', 'timer', '뽀모도로', '25분 집중 타이머'],
  ];
  root.innerHTML = `
    <section class="hero">
      <div><h1>${hi}</h1><p>O-note는 캐릭터·세계관·연성·플롯·메모를 한곳에 모아 두는 나만의 덕질 작업실이에요. 모든 기록은 내 계정에만 저장돼요.</p></div>
      <div class="today">
        <div>${icon('pen-line', 18)}<b>${todayWritten().toLocaleString()}</b><span>오늘 쓴 글자</span></div>
        <div>${icon('timer', 18)}<b>${todayPomos()}</b><span>오늘 집중</span></div>
        <div>${icon('files', 18)}<b>${all().filter((i) => i.type !== 'folder').length}</b><span>전체 기록</span></div>
      </div>
    </section>
    ${store.mode === 'local' ? `<div class="notice">${icon('triangle-exclamation-point', 18)}<div><b>체험 모드</b>로 사용 중이에요. 기록이 이 브라우저에만 저장돼요. 다른 기기와 동기화하려면 <a href="#/settings">설정</a>에서 안내를 확인하세요.</div></div>` : ''}
    <h2 class="sec-h">${icon('zap', 18)} 바로 시작하기</h2>
    <div class="quick-grid">${quick.map(([h, ic, t, d]) => `<a class="quick" href="${h}"><span class="q-ic">${icon(ic, 22)}</span><b>${t}</b><span>${d}</span></a>`).join('')}</div>
    ${folders.length ? `<h2 class="sec-h">${icon('folder-heart', 18)} 페어 폴더 <a class="more" href="#/folders">전체 보기</a></h2>
      <div class="chip-row">${folders.map((f) => `<a class="fchip big" style="--c:${f.data.color}" href="#/folder/${f.id}">${esc(f.data.emoji || '💞')} ${esc(f.data.title)}</a>`).join('')}</div>` : ''}
    ${pinned.length ? `<h2 class="sec-h">${icon('pin', 18)} 고정한 메모 <a class="more" href="#/memo">메모 전체</a></h2>
      <div class="memo-grid">${pinned.map((m) => `<a class="memo" href="#/memo?open=${m.id}" style="background:${m.data.color}"><div class="memo-text">${esc(m.data.text || '').replace(/\n/g, '<br>')}</div></a>`).join('')}</div>` : ''}
    <h2 class="sec-h">${icon('rotate-ccw-clock', 18)} 최근 기록</h2>
    ${recent.length ? `<div class="grid">${recent.map((i) => itemCard(i)).join('')}</div>` : emptyState('sparkles', '아직 기록이 없어요', '위의 바로 시작하기에서 첫 기록을 만들어보세요!')}`;
}

export function renderBookmarks(root) {
  const items = all().filter((i) => i.data.bookmarked);
  root.innerHTML = `${pageHead('bookmark', '북마크', '자주 보는 문서와 글을 모아봐요. 각 문서의 북마크 버튼으로 추가해요.')}
    ${items.length ? `<div class="grid">${items.map((i) => itemCard(i)).join('')}</div>` : emptyState('bookmark', '북마크한 기록이 없어요', '문서 상단의 북마크 버튼을 눌러보세요.')}`;
}

export function renderSearch(root, q) {
  const s = (q.get('q') || '').trim();
  const type = q.get('t') || '';
  const lower = s.toLowerCase();
  const hit = (it) => {
    const d = it.data;
    const hay = [d.title, d.subtitle, d.summary, d.desc, d.text, (d.tags || []).join(' '), htmlToText(d.body || ''),
      ...(d.chapters || []).map((c) => `${c.title} ${htmlToText(c.html)}`), ...(d.events || []).map((e) => `${e.title} ${e.desc} ${(e.chars || []).join(' ')} ${e.place}`),
      ...(d.infobox || []).map((r) => `${r.k} ${r.v}`), ...(d.pairtle || []).map((r) => `${r.label} ${r.a} ${r.b}`)].join(' ').toLowerCase();
    const i = hay.indexOf(lower);
    return i < 0 ? null : hay.slice(Math.max(0, i - 30), i + 60);
  };
  const res = s ? all(type || null).map((it) => ({ it, snip: hit(it) })).filter((r) => r.snip) : [];
  const mark = (t) => esc(t).replace(new RegExp(esc(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  root.innerHTML = `${pageHead('search', '검색', '제목, 본문, 태그, 인포박스, 사건까지 모두 찾아요.')}
    <form class="search-big" id="sf">${icon('search', 20)}<input name="q" value="${esc(s)}" placeholder="검색어를 입력하세요" autofocus>
      <select name="t"><option value="">전체</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <button class="btn primary">검색</button></form>
    ${s ? `<p class="muted">${res.length}개의 결과</p><ul class="search-res">${res.map(({ it, snip }) => `<li><a href="${itemHref(it)}">${icon(TYPES[it.type]?.icon || 'file', 18)}<div><b>${esc(it.data.title || summary(it).slice(0, 30) || '제목 없음')}</b><span>…${mark(snip)}…</span></div></a></li>`).join('')}</ul>` : ''}`;
  root.querySelector('#sf').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    location.hash = `#/search?q=${encodeURIComponent(fd.get('q'))}&t=${fd.get('t')}`;
  };
}
