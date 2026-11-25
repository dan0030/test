// 글쓰기 도구: 글자 수 세기 · 뽀모도로 · 브레인스토밍
import { create } from '../store.js';
import { icon, esc, countText, toast } from '../ui.js';
import { pageHead } from '../common.js';
import { copyText } from '../export.js';
import { pomo, MODES, onPomo, start, pause, reset, setMode, saveSettings, fmt, todayPomos } from '../pomodoro.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickN = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

const KW = {
  장소: ['옥상', '편의점', '도서관', '버스 정류장', '바닷가', '폐교', '기차 안', '병원 복도', '놀이공원', '골목길', '눈 덮인 숲', '성당', '지하철 막차', '빨래방', '왕궁 정원', '전장의 막사'],
  소품: ['우산', '편지', '반지', '깨진 안경', '사진 한 장', '손목시계', '목도리', '열쇠', '꽃다발', '카세트테이프', '피 묻은 손수건', '오래된 일기장', '귀걸이 한 짝', '머리끈', '초콜릿'],
  감정: ['질투', '그리움', '안도', '후회', '설렘', '분노', '체념', '집착', '동경', '죄책감', '서운함', '두려움', '해방감'],
  상황: ['정전', '폭우', '첫눈', '축제 전날', '이별 직전', '재회', '거짓말이 들통남', '같은 방에 갇힘', '기억을 잃음', '대신 다침', '처음으로 이름을 부름', '고백을 엿들음', '약속에 늦음'],
  날씨: ['장마', '한여름 밤', '새벽 안개', '노을', '눈보라', '벚꽃 날림', '가을비', '맑은 겨울 아침'],
};
const AU = ['학원물', '현대 일상', '오피스', '카페·베이커리', '아이돌·연예계', '마피아·조직', '경찰·형사', '의사·병원', '스포츠', '판타지 왕국', '기사와 왕족', '마법학교', '뱀파이어', '수인', '좀비 아포칼립스', '사이버펑크', '우주 SF', '조선 시대', '서양 귀족', '회귀', '빙의', '환생', '대학 캠퍼스', '시골 마을', '탐정·추리', '해적', '사이비 종교', '게임 속 세계'];
const REL = ['소꿉친구', '라이벌', '계약 관계', '상사와 부하', '스승과 제자', '적대 세력', '룸메이트', '전 연인', '첫사랑', '짝사랑', '구원자와 구원받은 자', '주인과 집사', '경호원과 의뢰인', '원수의 자식', '파트너', '선후배'];
const TROPE = ['비 오는 날 우산 하나', '침대가 하나뿐', '가짜 연애', '첫 만남이 최악', '신분을 숨김', '다친 상대를 간호', '기억상실', '편지로만 소통', '시한부', '오해와 엇갈림', '질투 유발 작전', '한쪽만 기억하는 과거', '계약 결혼', '내기에서 짐', '취해서 한 고백', '서로를 위한 희생', '술래잡기 같은 추격', '같은 꿈을 꿈'];
const INTERVIEW = ['가장 오래된 기억은 무엇인가요?', '아무도 모르는 버릇이 있다면?', '가장 두려워하는 것은?', '울고 싶을 때 어디로 가나요?', '첫사랑은 어떤 사람이었나요?', '지금 주머니(가방) 안에 든 것은?', '절대 용서할 수 없는 일은?', '하루가 남았다면 무엇을 할 건가요?', '상대에게 가장 하고 싶은 말은?', '스스로 가장 싫어하는 점은?', '좋아하는 음식과 그 이유는?', '잠들기 전 마지막으로 하는 생각은?', '가장 후회하는 선택은?', '누군가 나를 한 단어로 표현한다면?', '어릴 적 꿈은 무엇이었나요?', '거짓말을 할 때 드러나는 신호는?', '최근에 웃은 이유는?', '받아본 선물 중 최고는?', '혼자 있을 때 무엇을 하나요?', '상대의 어떤 모습에 처음 반했나요?'];
const WHATIF = ['만약 둘 중 한 명이 기억을 잃는다면?', '만약 서로의 몸이 바뀐다면?', '만약 처음 만난 날로 돌아간다면?', '만약 둘이 적으로 태어났다면?', '만약 한 명이 먼저 죽는다면?', '만약 고백을 거절했다면?', '만약 10년 뒤에 재회한다면?', '만약 둘이 서로를 모르는 세계라면?', '만약 비밀이 모두에게 알려진다면?', '만약 하루 동안 마음의 소리가 들린다면?', '만약 아이가 생긴다면?', '만약 둘 중 하나가 인간이 아니라면?'];
const SURN = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '서', '신', '권', '황', '안', '송', '류', '홍', '백', '남궁', '선우', '독고', '제갈'];
const SYL = ['서', '준', '하', '윤', '도', '시', '우', '은', '지', '현', '유', '연', '민', '재', '온', '설', '린', '휘', '결', '담', '솔', '겸', '율', '진', '태', '이', '아', '로', '빈', '한', '새', '해', '별', '단', '찬', '건', '헌', '경'];
const WEST1 = ['엘', '루', '아', '세', '카', '레', '이', '노', '테', '리', '에', '시', '로', '베', '디'];
const WEST2 = ['리안', '시스', '오넬', '드릭', '라', '비아', '레인', '엔', '토르', '니아', '셀', '로즈', '안', '카엘', '도르'];

// 동양풍 판타지 (무협·선협·궁중물) — [한글, 한자]
const EF_SUR = [['백', '白'], ['묵', '墨'], ['현', '玄'], ['운', '雲'], ['설', '薛'], ['연', '燕'], ['진', '陳'], ['소', '蘇'], ['화', '花'], ['목', '沐'], ['사', '謝'], ['위', '魏'], ['육', '陸'], ['강', '姜'], ['송', '宋'], ['남궁', '南宮'], ['제갈', '諸葛'], ['모용', '慕容'], ['독고', '獨孤'], ['상관', '上官'], ['황보', '皇甫'], ['서문', '西門'], ['사마', '司馬'], ['동방', '東方']];
const EF_GIV = [['월', '月'], ['휘', '輝'], ['린', '麟'], ['운', '雲'], ['설', '雪'], ['연', '蓮'], ['하', '霞'], ['청', '靑'], ['현', '玄'], ['무', '無'], ['진', '塵'], ['화', '華'], ['영', '影'], ['소', '素'], ['류', '流'], ['강', '江'], ['비', '飛'], ['명', '明'], ['사', '思'], ['여', '如'], ['한', '寒'], ['천', '天'], ['율', '律'], ['려', '麗'], ['홍', '紅'], ['백', '白'], ['언', '彦'], ['경', '鏡'], ['결', '潔'], ['요', '瑤'], ['형', '衡'], ['담', '曇'], ['호', '昊'], ['아', '雅'], ['선', '璇'], ['적', '寂']];
const EF_EPI1 = [['청풍', '淸風'], ['혈월', '血月'], ['백야', '白夜'], ['비천', '飛天'], ['무영', '無影'], ['적룡', '赤龍'], ['한설', '寒雪'], ['광풍', '狂風'], ['자하', '紫霞'], ['천마', '天魔'], ['낙화', '落花'], ['묵영', '墨影'], ['청린', '靑鱗'], ['월하', '月下']];
const EF_EPI2 = [['검', '劍'], ['검선', '劍仙'], ['공자', '公子'], ['선자', '仙子'], ['도객', '刀客'], ['신의', '神醫'], ['서생', '書生'], ['마군', '魔君'], ['진인', '眞人'], ['낭자', '娘子'], ['귀', '鬼'], ['책사', '策士']];
// 일본식 — [한자, 한글 읽기]
const JP_SUR = [['天野', '아마노'], ['雨宮', '아마미야'], ['一ノ瀬', '이치노세'], ['九条', '쿠조'], ['神崎', '칸자키'], ['白石', '시라이시'], ['黒崎', '쿠로사키'], ['桐生', '키류'], ['早乙女', '사오토메'], ['月島', '츠키시마'], ['柊', '히이라기'], ['朝比奈', '아사히나'], ['藤原', '후지와라'], ['鳴海', '나루미'], ['氷室', '히무로'], ['篠宮', '시노미야'], ['結城', '유우키'], ['綾瀬', '아야세'], ['水瀬', '미나세'], ['久遠', '쿠온'], ['東雲', '시노노메'], ['鷹宮', '타카미야'], ['七瀬', '나나세'], ['御影', '미카게'], ['高嶺', '타카네'], ['宵宮', '요이미야']];
const JP_M = [['蓮', '렌'], ['湊', '미나토'], ['陽翔', '하루토'], ['悠真', '유마'], ['律', '리츠'], ['颯', '하야테'], ['奏', '카나데'], ['蒼', '아오이'], ['樹', '이츠키'], ['凛太郎', '린타로'], ['千尋', '치히로'], ['朔', '사쿠'], ['晴', '하루'], ['響', '히비키'], ['透', '토오루'], ['慧', '케이'], ['零', '레이'], ['遥', '하루카'], ['燈真', '토우마'], ['恭弥', '쿄야']];
const JP_F = [['紬', '츠무기'], ['凛', '린'], ['結衣', '유이'], ['葵', '아오이'], ['楓', '카에데'], ['澪', '미오'], ['雫', '시즈쿠'], ['千夏', '치나츠'], ['小春', '코하루'], ['詩織', '시오리'], ['茜', '아카네'], ['琴音', '코토네'], ['灯', '아카리'], ['椿', '츠바키'], ['真昼', '마히루'], ['美月', '미즈키'], ['菫', '스미레'], ['花音', '카논'], ['彩葉', '이로하'], ['柚', '유즈']];

export function renderTools(root, q) {
  const tab = q.get('tab') || 'count';
  const tabs = [['count', 'type', '글자 수 세기'], ['pomo', 'timer', '뽀모도로'], ['idea', 'lightbulb', '브레인스토밍'], ['name', 'signature', '이름 짓기']];
  root.innerHTML = `
    ${pageHead('wand-sparkles', '글쓰기 도구', '글자 수 세기, 집중 타이머, 아이디어가 막힐 때 쓰는 생성기를 모았어요.', '', 'tools')}
    <div class="tabs">${tabs.map(([k, ic, n]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/tools?tab=${k}">${icon(ic, 16)} ${n}</a>`).join('')}</div>
    <div id="t-body"></div>`;
  const body = root.querySelector('#t-body');
  if (tab === 'count') return counter(body);
  if (tab === 'pomo') return pomodoro(body);
  if (tab === 'idea') return ideas(body);
  if (tab === 'name') return names(body);
}

function counter(body) {
  body.innerHTML = `
    <div class="count-tool">
      <textarea class="input" id="ct" rows="12" placeholder="글을 붙여넣으면 바로 세어드려요. (여기 적은 글은 저장되지 않아요)"></textarea>
      <div class="stat-grid" id="cs"></div>
    </div>`;
  const ta = body.querySelector('#ct');
  const draw = () => {
    const c = countText(ta.value);
    const s = [['공백 포함', c.withSpace, 'space'], ['공백 제외', c.noSpace, 'type'], ['단어', c.words, 'whole-word'], ['문단', c.paras, 'pilcrow'], ['원고지(200자)', `${c.manuscript}매`, 'notebook-pen'], ['용량', `${c.bytes.toLocaleString()} B`, 'hard-drive'], ['읽는 시간', `약 ${c.readMin}분`, 'clock'], ['트윗(140자)', `${Math.ceil(c.withSpace / 140) || 0}개`, 'message-circle']];
    body.querySelector('#cs').innerHTML = s.map(([l, v, ic]) => `<div class="stat">${icon(ic, 18)}<b>${typeof v === 'number' ? v.toLocaleString() : v}</b><span>${l}</span></div>`).join('');
  };
  ta.addEventListener('input', draw);
  draw();
}

function pomodoro(body) {
  body.innerHTML = `
    <div class="pomo-big">
      <div class="seg" id="pm-mode">${Object.entries(MODES).map(([k, v]) => `<button data-m="${k}" class="${pomo.mode === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="pomo-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="bg"/><circle cx="60" cy="60" r="54" class="fg" id="pm-arc"/></svg><div class="pomo-time" id="pm-time"></div></div>
      <div class="pomo-btns"><button class="btn primary lg" id="pm-go"></button><button class="btn ghost" id="pm-reset">${icon('rotate-ccw', 16)} 처음부터</button></div>
      <p class="muted">${icon('flame', 14)} 오늘 완료한 집중: <b id="pm-today">${todayPomos()}</b>회 · 다른 화면으로 가도 타이머는 계속 돌아가요.</p>
      <details class="panel"><summary>${icon('settings', 15)} 시간 설정</summary>
        <div class="row4">
          <label>집중(분)<input class="input" type="number" min="1" max="120" data-s="focus" value="${pomo.settings.focus}"></label>
          <label>짧은 휴식<input class="input" type="number" min="1" max="60" data-s="short" value="${pomo.settings.short}"></label>
          <label>긴 휴식<input class="input" type="number" min="1" max="60" data-s="long" value="${pomo.settings.long}"></label>
          <label>긴 휴식 주기<input class="input" type="number" min="2" max="10" data-s="every" value="${pomo.settings.every}"></label>
        </div>
        <label class="lbl"><input type="checkbox" id="pm-sound" ${pomo.settings.sound ? 'checked' : ''}> 끝나면 알림음</label>
      </details>
    </div>`;
  const draw = () => {
    if (!body.isConnected) return;
    body.querySelector('#pm-time').textContent = fmt(pomo.remaining);
    const total = pomo.settings[pomo.mode] * 60;
    const C = 2 * Math.PI * 54;
    const arc = body.querySelector('#pm-arc');
    arc.style.strokeDasharray = C; arc.style.strokeDashoffset = C * (1 - pomo.remaining / total);
    body.querySelector('#pm-go').innerHTML = pomo.running ? `${icon('pause', 18)} 일시정지` : `${icon('play', 18)} 시작`;
    body.querySelectorAll('#pm-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === pomo.mode));
    body.querySelector('#pm-today').textContent = todayPomos();
  };
  const off = onPomo(draw);
  draw();
  body.querySelector('#pm-go').onclick = () => (pomo.running ? pause() : start());
  body.querySelector('#pm-reset').onclick = reset;
  body.querySelector('#pm-mode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  body.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('change', () => saveSettings({ [i.dataset.s]: Math.max(1, +i.value || 1) })));
  body.querySelector('#pm-sound').onchange = (e) => saveSettings({ sound: e.target.checked });
  return { cleanup: off };
}

function genCard(id, ic, title, desc) {
  return `<div class="gen card" id="${id}"><div class="gen-head">${icon(ic, 22)}<div><h4>${title}</h4><p class="muted small">${desc}</p></div></div><div class="gen-out"></div>
    <div class="gen-btns"><button class="btn primary sm" data-roll>${icon('dices', 15)} 뽑기</button><button class="btn ghost sm" data-save>${icon('sticky-note', 15)} 메모로 저장</button><button class="btn ghost sm" data-copy>${icon('copy', 15)} 복사</button></div></div>`;
}

function bindGen(body, id, gen) {
  const el = body.querySelector(`#${id}`);
  let text = '';
  const roll = () => { const r = gen(); text = r.text; el.querySelector('.gen-out').innerHTML = r.html; };
  el.querySelector('[data-roll]').onclick = roll;
  el.querySelector('[data-save]').onclick = () => { create('memo', { text: `💡 ${text}`, color: '#fff7c2', tags: ['아이디어'] }); toast('메모에 저장했어요', 'ok'); };
  el.querySelector('[data-copy]').onclick = async () => { await copyText(text); toast('복사했어요', 'ok'); };
  roll();
}

function ideas(body) {
  body.innerHTML = `<div class="gen-grid">
    ${genCard('g-kw', 'dices', '키워드 주사위', '장소·소품·감정·상황을 무작위로 뽑아 장면을 떠올려요.')}
    ${genCard('g-au', 'sparkles', 'AU 생성기', 'AU 설정 + 관계 + 클리셰 조합을 뽑아요.')}
    ${genCard('g-iv', 'mic', '캐릭터 인터뷰', '캐릭터에게 던져볼 질문으로 성격을 깊게 파요.')}
    ${genCard('g-wi', 'circle-question-mark', '만약에(What if)', '이야기를 비틀어보는 질문 카드예요.')}
    </div>
    <div class="card scene">
      <div class="gen-head">${icon('clapperboard', 22)}<div><h4>장면 설계 (6하 원칙)</h4><p class="muted small">쓰기 전에 장면의 뼈대를 잡아요. 다 채우고 메모로 저장하세요.</p></div></div>
      <div class="row2">${[['누가', '등장인물'], ['언제', '시간·계절'], ['어디서', '장소'], ['무엇을', '사건'], ['어떻게', '방식·분위기'], ['왜', '동기·감정']].map(([k, p]) => `<label class="field"><span>${k}</span><input class="input" data-w="${k}" placeholder="${p}"></label>`).join('')}</div>
      <label class="field"><span>이 장면이 끝난 뒤 바뀌는 것</span><input class="input" data-w="변화" placeholder="관계, 감정, 정보의 변화"></label>
      <button class="btn primary sm" id="sc-save">${icon('sticky-note', 15)} 메모로 저장</button>
    </div>`;
  bindGen(body, 'g-kw', () => {
    const r = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, pick(v)]));
    return { text: Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' / '), html: `<div class="kw">${Object.entries(r).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` };
  });
  bindGen(body, 'g-au', () => {
    const a = pick(AU); const r = pick(REL); const t = pickN(TROPE, 2);
    return { text: `${a} AU / ${r} / ${t.join(', ')}`, html: `<div class="kw"><div><span>AU</span><b>${a}</b></div><div><span>관계</span><b>${r}</b></div><div><span>클리셰</span><b>${t.join(' + ')}</b></div></div>` };
  });
  bindGen(body, 'g-iv', () => { const qq = pickN(INTERVIEW, 3); return { text: qq.join('\n'), html: `<ol class="qlist">${qq.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` }; });
  bindGen(body, 'g-wi', () => { const w = pick(WHATIF); return { text: w, html: `<p class="big-q">${esc(w)}</p>` }; });
  body.querySelector('#sc-save').onclick = () => {
    const parts = [...body.querySelectorAll('[data-w]')].filter((i) => i.value.trim()).map((i) => `${i.dataset.w}: ${i.value.trim()}`);
    if (!parts.length) return toast('한 칸 이상 채워주세요', 'error');
    create('memo', { text: `🎬 장면 설계\n${parts.join('\n')}`, color: '#dbeeff', tags: ['장면'] });
    body.querySelectorAll('[data-w]').forEach((i) => { i.value = ''; });
    toast('메모에 저장했어요', 'ok');
  };
}

function names(body) {
  body.innerHTML = `<div class="gen-grid">
    ${genCard('g-kn', 'signature', '한국식 이름', '성 + 두 글자 이름을 조합해요.')}
    ${genCard('g-ef', 'mountain', '동양풍 판타지 이름', '무협·선협·궁중물 느낌의 이름과 한자, 별호를 만들어요.')}
    ${genCard('g-jp', 'flower-2', '일본식 이름', '성(苗字)과 이름을 한자·읽기와 함께 만들어요.')}
    ${genCard('g-wn', 'crown', '서양 판타지 이름', '서양 판타지 느낌의 이름을 만들어요.')}
  </div>`;
  const list = (arr) => `<div class="name-list">${arr.map(([main, sub]) => `<span>${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`).join('')}</div>`;
  bindGen(body, 'g-kn', () => { const l = Array.from({ length: 6 }, () => pick(SURN) + pick(SYL) + pick(SYL)); return { text: l.join(', '), html: list(l.map((n) => [n])) }; });
  bindGen(body, 'g-ef', () => {
    const l = Array.from({ length: 6 }, () => {
      const s1 = pick(EF_SUR); let a = pick(EF_GIV); let b = pick(EF_GIV);
      while (b[0] === a[0]) b = pick(EF_GIV);
      const one = Math.random() < 0.25;
      const ko = s1[0] + a[0] + (one ? '' : b[0]);
      const hj = s1[1] + a[1] + (one ? '' : b[1]);
      const e1 = pick(EF_EPI1); const e2 = pick(EF_EPI2);
      return [ko, `${hj} · 별호 ${e1[0]}${e2[0]}(${e1[1]}${e2[1]})`];
    });
    return { text: l.map(([a, b]) => `${a} (${b})`).join('\n'), html: list(l) };
  });
  bindGen(body, 'g-jp', () => {
    const l = Array.from({ length: 6 }, (_, i) => {
      const sur = pick(JP_SUR); const g = pick(i % 2 ? JP_F : JP_M);
      return [`${sur[1]} ${g[1]}`, `${sur[0]} ${g[0]} · ${i % 2 ? '여' : '남'}`];
    });
    return { text: l.map(([a, b]) => `${a} (${b})`).join('\n'), html: list(l) };
  });
  bindGen(body, 'g-wn', () => { const l = Array.from({ length: 6 }, () => pick(WEST1) + pick(WEST2)); return { text: l.join(', '), html: list(l.map((n) => [n])) }; });
}
