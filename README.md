# O-note

오타쿠를 위한 자료 모음 & 메모장.
캐릭터 위키, 세계관 문서, 회차별 연성(E북 보기), 플롯·타임라인 점검, 짧은 메모를 **페어 폴더**로 묶어 관리하는 웹사이트입니다.
누구나 회원가입해서 쓸 수 있고, 기록은 **로그인한 계정에 저장**되므로 브라우저나 기기를 바꿔도 이어서 쓸 수 있습니다.

> 사이트 안에서 글을 공개·게시하는 기능은 일부러 넣지 않았습니다. 완성한 글은 **HTML / 이미지 / 텍스트**로 내보내 티스토리, 포스타입, 트위터 등에 옮겨 올리세요.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 📁 **페어 폴더** | 페어·CP·작품·AU별 폴더. 한 문서를 여러 폴더에 넣을 수 있음. 폴더 안에서 종류별로 모아 보기 |
| 💞 **페어틀** | 두 캐릭터를 같은 질문에 나란히 답하게 하는 표. 템플릿(기본 페어틀 / 관계 질문 / AU 설정표) 제공, 이미지로 내보내기 |
| 🪪 **캐릭터 위키** | 인포박스, 대표 이미지, 자동 목차, 관계 카드, `[[문서 링크]]`, 역링크(이 문서를 언급한 문서) |
| 🌐 **세계관 문서** | 지역·세력·종족·용어·역사 등 분류별 위키 문서 |
| 📖 **연성** | 회차 관리, 목표 글자 수, 상태(구상/작성/퇴고/완성), 표지 |
| 📚 **E북 리더** | 페이지 넘김(탭·스와이프·방향키), 글자 크기·줄 간격·배경·글꼴 설정, 읽던 위치 기억, 책갈피 |
| 🕰️ **플롯·타임라인** | 사건 카드 / 서술 순서 / 시간 순서 / 기승전결 보드 / 인물별 등장표 / **자동 점검**(시간값 누락, 회상 감지, 같은 시간에 두 장소에 있는 인물, 비어 있는 단계) |
| 🗒️ **메모** | 포스트잇형 빠른 메모, 색상, 상단 고정 |
| 🔖 **북마크 · 코멘트** | 모든 문서에 북마크, 퇴고용 코멘트(해결 표시 가능) |
| 🧩 **위키 편집기** | 위키 문서 공방(mnmwiki) 엔진 사용: 프로필 표(묶음·접기), 다단계 챕터·자동 목차, 각주 팝업, 인용구, 경고문, 스포일러, 표 편집, 사진 배치, 디자인 색상. 티스토리 붙여넣기용 HTML / 단독 HTML / 이미지로 내보내기 |
| 📘 **E북 출력** | 연성을 쪽 단위로 미리 나눈 '넘겨 읽는 책' 코드로 출력 → 티스토리 HTML 모드에 그대로 붙여넣기. 쪽별 이미지 저장도 지원 |
| 🎨 **색상** | 기본 팔레트 + 계정에 저장되는 내 팔레트 + 직접 지정(색상 선택·HEX) |
| ✍️ **자체 에디터** | 한글/포스타입 스타일 툴바: 문단 스타일, 글자 크기·글꼴·색·형광펜, 정렬, 목록, 구분선, 이미지, 링크, 윗주(루비), 특수문자(「」『』…), 찾기/바꾸기, 집중 모드, 실시간 글자 수·원고지 매수. 모바일에서는 툴바가 가로 스크롤 |
| 📤 **내보내기** | 서식 복사(티스토리 기본 에디터에 바로 붙여넣기), HTML 코드 복사, .html 파일, PNG 이미지(긴 글은 여러 장으로 분할), .txt |
| 🧰 **글쓰기 도구** | 글자 수 세기(공백 포함/제외, 원고지, 읽는 시간), 뽀모도로 타이머(어느 화면에서든 동작), 키워드 주사위, AU 생성기, 캐릭터 인터뷰, What if 카드, 6하원칙 장면 설계, 이름 생성기 |
| 🔍 **검색** | 제목·본문·태그·인포박스·사건·페어틀까지 전체 검색 |
| 🌙 **다크 모드 · PWA** | 시스템/밝게/어둡게, 홈 화면에 추가 가능 |

---

## 구조와 추천 서비스

```
[브라우저]  ──HTTPS──▶  [GitHub Pages]  정적 파일(HTML/CSS/JS) 호스팅 — 무료
     │
     └────HTTPS────▶  [Supabase]  회원가입·로그인(Auth) + PostgreSQL DB — 무료 플랜으로 시작 가능
```

- **GitHub Pages**: 사이트 파일 호스팅. 서버 관리가 필요 없습니다.
- **Supabase**(추천): 이메일/GitHub 로그인과 데이터베이스를 함께 제공합니다. 행 수준 보안(RLS)으로 "본인 데이터만 접근"을 DB에서 강제할 수 있어 개인정보 보호에 유리합니다.
- 별도 서버 코드가 없으므로 운영 비용이 거의 들지 않습니다. 사용자가 많아지면 Supabase 유료 플랜(Pro)으로 올리면 됩니다.
- 대안: 이미 Cloudflare를 쓰신다면 Cloudflare Pages로 호스팅해도 됩니다(파일 그대로 업로드).

---

## 설치 · 배포 방법

> ✅ **현재 상태:** Supabase 프로젝트 `o-note`(서울 리전)가 만들어져 있고 `supabase/schema.sql`이 적용되어 있으며, `js/config.js`에 연결 정보(공개용 publishable 키)가 들어가 있습니다. 아래 1)은 새 프로젝트로 옮길 때만 필요합니다.

### 1) Supabase 프로젝트 만들기
1. <https://supabase.com> 가입 → **New project** (지역은 `Northeast Asia (Seoul)` 추천).
2. 왼쪽 메뉴 **SQL Editor** → 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 **Run**.
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사해 둡니다.
   - ⚠️ `service_role` 키는 절대 사이트나 저장소에 넣지 마세요.

### 2) 로그인 설정 (Supabase → Authentication)
1. **URL Configuration**
   - Site URL: `https://<깃허브아이디>.github.io/<저장소이름>/`
   - Redirect URLs에도 같은 주소를 추가
2. **Providers → Email**: `Confirm email` 켜기(이메일 인증 후 가입 완료).
3. **(선택) GitHub로 로그인**
   - GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**
   - Homepage URL: 사이트 주소 / Authorization callback URL: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
   - 발급된 Client ID / Secret을 Supabase **Providers → GitHub**에 입력하고 켜기
   - GitHub 로그인을 쓰지 않으면 `js/config.js`의 `ENABLE_GITHUB_LOGIN`을 `false`로
4. **보안 권장 설정**
   - Authentication → **Policies/Passwords**: 최소 길이 8자 이상, *Leaked password protection* 켜기(가능한 플랜에서)
   - **Rate Limits** 기본값 유지, 필요 시 **CAPTCHA(hCaptcha/Turnstile)** 켜기 → 가입 스팸 방지
   - 운영 메일을 많이 보내야 한다면 **SMTP**에 별도 메일 서비스(Resend 등) 연결 (기본 메일은 시간당 발송 제한이 있음)

### 3) GitHub Pages로 배포
1. 이 저장소를 `main` 브랜치에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택.
3. 저장소 **Settings → Secrets and variables → Actions → Variables** 탭에 추가:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon public 키
4. `main`에 push하면 `.github/workflows/pages.yml`이 자동으로 설정을 주입해 배포합니다.

> 변수를 넣지 않으면 **체험 모드**(브라우저에만 저장)로 동작하므로, Supabase 없이도 바로 둘러볼 수 있습니다.

### 로컬에서 실행해보기
```bash
python3 -m http.server 8000
```
브라우저에서 `http://localhost:8000` 접속. (ES 모듈을 쓰므로 파일을 더블클릭해 여는 방식은 동작하지 않습니다.)

---

## 무료 플랜으로 오래 버티기 (이용자 1,000명 가정)

Supabase 무료 플랜 한도: DB 500MB · 파일 저장소 1GB · 전송량(egress) 월 5GB(+캐시 5GB).

| 장치 | 효과 |
|---|---|
| **글 자동 압축** | 1.2KB가 넘는 기록은 gzip으로 압축해 저장 (보안 금고를 켰다면 압축 → 암호화 순서). 긴 연성은 10분의 1 이하로 줄어듦 |
| **사진은 DB 밖으로** | 사진은 비공개 Storage 버킷 `img`(본인 폴더만 접근)에 WebP로 줄여 저장, 문서에는 `oimg:` 참조만 남김. 본문 사진 최대 1100px, 프로필 720px, 표지 640px, 아이콘 128px |
| **기기 사본 + 증분 동기화** | 서버 행을 저장된 형태 그대로 IndexedDB에 보관 → 다시 열 때 바뀐 행만 받음. 사진도 기기당 한 번만 내려받음. 로그아웃하면 사본 삭제 |
| **가벼운 확인** | 다른 기기 변경 확인은 화면이 보일 때만 5분마다, 바뀐 행 목록(id·시각)만 먼저 받음. 내용이 그대로면 다시 저장하지 않음 |
| **소프트 삭제** | 삭제는 흔적만 남겨 다른 기기가 가볍게 알아채게 하고, 30일 뒤 정리 |
| **1인당 한도** | 글·설정 2MB(압축 후), 사진 6MB(1장 최대 1.5MB). DB 트리거·Storage 정책으로 서버에서 강제. 설정 → 저장 공간에서 사용량 확인 |
| **자동 정리** | 문서에 직접 들어간 큰 사진(붙여넣기·백업)은 저장소로 옮기고, 어디에도 쓰이지 않는 사진은 하루 한 번 삭제 |

추정: 1인당 글 0.1~2MB(압축 후), 사진 0~6MB, 월 전송량 1~3MB 수준 → 1,000명이 무료 한도 안에 들어오도록 설계했습니다. 사용량은 Supabase 대시보드 → Usage에서 확인하세요.

DB 변경 내역은 `supabase/schema.sql`(기본)과 `supabase/migration_free_tier.sql`(무료 플랜 최적화)에 있습니다.

---

## 개인정보 · 보안 설계

| 위협 | 대응 |
|---|---|
| 남의 글 열람·수정 | DB **RLS 정책**으로 `user_id = auth.uid()`인 행만 읽기/쓰기/삭제 가능. `user_id`는 서버 트리거가 강제로 채워 위조 불가. 비로그인(anon) 사용자는 테이블 접근 권한 자체가 없음 |
| 비밀번호 유출 | 사이트는 비밀번호를 저장하지 않음. Supabase Auth가 bcrypt 해시로 보관. 비밀번호 찾기 시 계정 존재 여부를 노출하지 않음 |
| 서버/운영자 열람 | **보안 금고(선택)**: 브라우저에서 AES-GCM 256으로 암호화 후 업로드(키는 PBKDF2 31만 회로 금고 암호에서 유도, 서버로 전송 안 됨). 운영자도 내용을 볼 수 없음 |
| XSS(악성 스크립트) | 모든 사용자 입력 이스케이프, 리치 텍스트는 DOMPurify로 정화(허용 태그만), 붙여넣기 정화, **CSP**로 외부·인라인 스크립트 차단 |
| 외부 추적 | 광고·분석·외부 CDN·외부 폰트 없음. 라이브러리는 `vendor/`에 직접 포함 |
| 이미지 메타데이터 | 업로드 이미지를 다시 그려 저장 → 촬영 위치(EXIF) 제거, 용량 축소 |
| 공용 PC | 기록은 브라우저 저장소에 캐시하지 않음(로그인 토큰만 저장). 로그아웃 시 세션 종료. 금고 키는 '이 기기에서 기억'을 체크한 경우에만 추출 불가 키로 보관 |
| 탈퇴·삭제권 | 설정 → 회원 탈퇴 시 `delete_my_account()`가 계정과 모든 기록을 즉시 영구 삭제. JSON 백업으로 데이터 이동 가능 |
| 공개 노출 | 사이트 내 공개·게시 기능 없음. `noindex`로 검색엔진 수집 차단 |

> 운영자 안내: 실제 서비스로 공개하려면 개인정보 처리방침(수집 항목: 이메일, 보관 기간: 탈퇴 시까지, 위탁: Supabase)을 사이트나 README에 게시하세요. 설정 화면의 '개인정보 처리 안내'를 바탕으로 쓰면 됩니다.

---

## 폴더 구조

```
index.html               진입 HTML (CSP 포함)
css/app.css              전체 디자인 (라이트/다크, 모바일)
js/config.js             Supabase 연결 설정
js/main.js               로그인·레이아웃·라우터
js/store.js              데이터 저장/동기화(클라우드·체험), 금고 암호화 연동
js/crypto.js             종단간 암호화 (Web Crypto)
js/editor.js             자체 리치 텍스트 에디터
js/export.js             HTML·이미지·텍스트 내보내기
js/pomodoro.js           뽀모도로 타이머
js/views/*.js            화면별 모듈 (홈, 폴더·페어틀, 위키, 연성·리더, 플롯, 메모, 도구, 설정)
js/icons.js              Lucide 아이콘 일부 (ISC)
vendor/                  supabase-js, DOMPurify, html2canvas (직접 포함)
supabase/schema.sql      DB 테이블·RLS·탈퇴 함수
```

## 사용한 오픈소스
- [Supabase JS](https://github.com/supabase/supabase-js) (MIT)
- [DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0 / MPL-2.0)
- [html2canvas](https://github.com/niklasvh/html2canvas) (MIT)
- [Lucide Icons](https://lucide.dev) (ISC)
