# 개인 AI 비서 웹앱

1인 전용. 아이폰 홈화면에 추가해서 쓰는 PWA. 뉴스 모아보기가 아니라 **내 상태를 알고 필요한 것만 먼저 꺼내주는 비서**다.

- 회원가입 없음. 암구호 하나로 들어가고 365일 유지된다.
- 아침 7시에 브리핑이 텔레그램으로 온다. 카드 나열이 아니라 읽히는 글이다.
- 관심사 카드 30종을 개별 코드로 만들지 않는다. `config/sources.json`에 객체 하나 추가하면 끝이다.
- 알림은 다섯 가지 조건에서만 울린다. 그 외에는 침묵한다.

---

## 1. 5분 세팅

```bash
npm install
cp .env.example .env.local     # 값 채우기 (아래 표)
# Supabase SQL Editor에서 supabase/migrations/*.sql 을 번호 순서대로 실행
npm run dev                    # http://localhost:3000
```

최소로 필요한 값은 넷이다. 나머지는 없어도 앱이 돈다 — 해당 소스만 "환경변수 없음"으로 건너뛴다.

| 변수 | 없으면 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 앱이 아예 안 뜬다 |
| `APP_PASSPHRASE` | 로그인 불가 |
| `SESSION_SECRET` | 쿠키 서명 불가 (`openssl rand -hex 32`) |
| `CRON_SECRET` | 크론 라우트가 전부 401 |
| `ANTHROPIC_API_KEY` | Quick Capture 자동 분류·브리핑·요약·퀴즈·주간 리포트가 죽는다 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 알림이 앱 안에만 쌓인다 |
| `NEIS_*` | 급식·시간표·학사일정 자리가 "설정 필요"로 뜬다 |
| 그 외 (`GITHUB_TOKEN`, `NAVER_*`, `ITAD_API_KEY`, `LASTFM_API_KEY`, `RIOT_*`, `YOUTUBE_API_KEY`, `DATA_GO_KR_KEY`) | 그 소스만 건너뛴다 |

전체 목록과 설명은 `.env.example`에 있다.

### 마이그레이션

`supabase/migrations/` 안의 세 파일을 순서대로 SQL Editor에 붙여넣는다.

| 파일 | 내용 |
|---|---|
| `0001_init.sql` | 전체 테이블 + 인덱스 + RLS + 프로젝트 6개 시드 |
| `0002_stalled_view.sql` | `projects_with_stall` 뷰 (정체 일수를 조회 시점 기준으로 계산) |
| `0003_captures.sql` | Quick Capture 인박스 |

RLS는 **켜고 정책은 두지 않는다.** 접근은 전부 서버의 service_role 키로만 이뤄지므로, anon 키가 새어나가도 데이터는 안 읽힌다.

---

## 2. 배포 (Vercel)

1. 저장소를 Vercel에 연결하고 `.env.local`의 값을 프로젝트 환경변수에 그대로 넣는다.
2. `NEXT_PUBLIC_APP_URL`을 배포된 주소로 맞춘다 (텔레그램 버튼 링크에 쓰인다).
3. `vercel.json`의 크론이 자동 등록된다. 스케줄은 **UTC**이고 KST 기준으로 이렇게 잡혀 있다.

| 크론 | UTC | KST | 하는 일 |
|---|---|---|---|
| `/api/cron/collect?slot=morning` | 21:00 | 06:00 | 수집 + 복습문제 생성 + 알림 조건 검사 |
| `/api/cron/collect?slot=noon` | 03:00 | 12:00 | 수집 |
| `/api/cron/collect?slot=night` | 12:00 | 21:00 | 수집 |
| `/api/cron/briefing` | 22:00 | 07:00 | 아침 브리핑 생성 + 텔레그램 발송 |
| `/api/cron/alerts` | 00:00 | 09:00 | 알림 조건만 재검사 |
| `/api/cron/weekly` | 일 12:00 | 일 21:00 | 주간 방향성 리포트 |

> **Hobby 플랜은 크론이 하루 2개로 제한된다.** 무료로 쓸 거면 `collect?slot=morning`과 `briefing`만 남기고 나머지는 지워라. 더보기 화면의 "지금 수집" 버튼으로 언제든 수동 실행할 수 있다.

크론 라우트는 `Authorization: Bearer ${CRON_SECRET}`로만 열린다. Vercel Cron은 이 헤더를 자동으로 붙인다. 수동 호출은 이렇게 한다.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<앱>/api/cron/collect?slot=all
```

---

## 3. 아이폰에서 쓰기

**홈화면 추가**: Safari에서 앱을 열고 공유 → 홈 화면에 추가. `display: standalone`이라 주소창 없이 전체화면으로 뜬다.

**공유시트로 링크 던지기**: iOS 단축어 앱에서 아래처럼 만들면 사파리 공유시트에 뜬다.

1. 새 단축어 → "공유 시트에 표시" 켜기 (입력 타입: URL, 텍스트)
2. 동작: **URL 열기** → `https://<앱>/share?url=[단축어 입력]`

열리는 즉시 본문을 긁어 Claude가 3줄로 줄이고 문서고에 저장한다. 앱 안에서는 기록 → 문서고 탭의 입력칸에 붙여넣어도 같다.

**오프라인**: 서비스 워커가 마지막 응답을 캐시한다. 지하철에서 열면 마지막으로 가져온 데이터가 뜨고 상단에 "오프라인 · 마지막 데이터" 표시가 붙는다.

---

## 4. 관심사 추가하기 — 코드는 건드리지 않는다

`config/sources.json`에 객체 하나를 넣고 검증만 돌리면 다음 수집부터 카드가 뜬다.

```jsonc
{
  "key": "my_new_feed",        // 소문자·숫자·밑줄
  "category": "dev",           // 화면에서 묶이는 단위
  "kind": "rss",               // rss | rest | github | llm — 이 넷뿐이다
  "title": "새 피드",
  "endpoint": "https://example.com/feed.xml",
  "schedule": "daily",         // morning | noon | night | daily(=아침만) | hourly(=매 수집)
  "limit": 10
}
```

```bash
npm run sources:check   # key 중복, 필수 필드, 환경변수 선언 누락까지 잡아준다
```

### 어댑터 4종

| kind | 쓰는 곳 | 핵심 필드 |
|---|---|---|
| `rss` | 뉴스 전부 (RSS 2.0 / Atom 자동 판별) | `endpoint` |
| `rest` | 임의의 JSON API | `endpoint`, `root`, `map`, `snapshot` |
| `github` | 내 활동 / Trending 근사 / 릴리즈 / OSV 취약점 | `mode`, `repos`, `packages` |
| `llm` | 외부 API가 없는 것 (꿀팁, 오늘 배울 기술, 게임 추천) | `prompt`, `count` |

자동 수집이 불가능한 대상(포챔스 메타 등)은 `links` 배열로 선언하면 네트워크 호출 없이 링크 카드로 뜬다.

### 템플릿 문법

`endpoint` · `headers` · `map` · `snapshot` 어디서나 쓸 수 있다.

| 표기 | 치환되는 값 |
|---|---|
| `{{env.NAVER_CLIENT_ID}}` | 환경변수 |
| `{{ref}}` / `{{label}}` | 찜 목록 항목 (`foreach` 사용 시) |
| `{{today}}` / `{{daysAgo:7}}` | 날짜 |
| `{{$.some.path}}` | 응답 **행 안의 값** (`map` 안에서만) |

`map`의 각 필드는 `"$.경로"`면 그 값을, 그 외 문자열이면 템플릿으로 해석한다.

```jsonc
"map": {
  "title": "$.name",                                        // 값 그대로
  "url":   "https://store.steampowered.com/app/{{$.id}}",   // 조립
  "summary": "{{$.points}}점 · 댓글 {{$.num_comments}}"
}
```

### 찜 목록 = 소스 복제기

`foreach`가 붙은 소스는 찜 목록의 항목 수만큼 복제되어 돈다. 더보기 → 찜 목록에서 Steam 앱ID를 하나 추가하면 그 게임의 소식·동접자·리뷰 긍정률·최저가가 전부 따라 붙는다. (Steam 위시리스트 비공식 엔드포인트에 기대지 않고 앱ID 수동 등록으로 가는 이유다.)

| 찜 kind | 값 예시 | 붙는 소스 |
|---|---|---|
| `steam_app` | `730` | 게임 소식 / 동접자 / 리뷰 긍정률 |
| `itad_game` | ITAD 게임 UUID | 최저가 추적 + 가격 알림 |
| `part` | `RTX 5070` | 네이버 쇼핑 최저가 근사치 |
| `package` | `npm:next` | OSV 취약점 검사 |

### snapshots

가격·동접자·긍정률 같은 값은 `snapshots`에 매일 쌓인다. **1페이즈부터 쌓기 시작해야** "8% 하락" 같은 변화 감지가 가능하다 — 나중에 붙이면 과거 데이터는 영원히 없다.

`metric_key`는 `소스키|식별자` 형식을 지켜야 변화율이 소스와 연결된다. `divisor`를 주면 백분율로 저장된다 (긍정 리뷰 / 전체 리뷰 → 90).

---

## 5. 정보를 '덜' 보여주는 규칙

### 스코어링 (`src/lib/scoring.ts`)

각 항목에 0~100점을 매기고 **상위 3개만** '오늘의 핵심'으로 올린다. 나머지는 카테고리별 접힌 섹션이다.

| 항목 | 점수 |
|---|---|
| 찜/구독 등록한 대상 | +40 |
| 보안 취약점 | +30 |
| snapshots 변화폭 20% / 10% / 5% 이상 | +25 / +18 / +12 |
| 최근 7일간 자주 열어본 카테고리 | 최대 +20 |
| 발행 24시간 / 72시간 / 7일 이내 | +15 / +9 / +4 |
| 이미 본 것 | −25 |

핵심 3개는 카테고리당 최대 2개로 제한해서 한 분야가 화면을 다 먹지 않게 한다. 항목을 열면 `views`에 기록되고, 그게 다음 스코어링의 학습 데이터가 된다.

### 알림 (`src/lib/watchdog.ts`)

보내는 조건은 이 다섯뿐이다.

1. 찜한 가격이 임계치(기본 ±5%) 이상 변동
2. 내 라이브러리에서 보안 취약점 발견
3. 프로젝트가 5일 이상 정체
4. 마감 24시간 이내 할일
5. 수집 소스 3회 연속 실패

**하루 최대 3건**, **같은 내용은 7일간 재발송 금지**. 한도를 넘으면 발송하지 않고 앱 안에만 기록한다(더보기 → 알림 기록에서 "앱에만"으로 표시된다).

---

## 6. 디자인

### 토큰 — Deep Slate + Amber

`src/app/globals.css`의 `@theme` 블록 하나에 다 있다. 색을 바꾸려면 여기 6줄만 고치면 된다.

| 이름 | 값 | 역할 |
|---|---|---|
| `bg` | `#0B0E14` | 배경. 밤에 침대에서 봐도 눈이 안 아픈 밝기 |
| `surface` / `surface2` | `#131822` / `#1B2231` | 카드 / 입력창 |
| `line` | `#263041` | 경계선 — 카드 그림자 대신 선으로 구분한다 |
| `text` / `muted` / `dim` | `#E6EAF2` / `#8A94A6` / `#5B6577` | 본문 / 보조 / 메타 |
| `accent` | `#FFB020` | **강조는 이 하나뿐.** 화면당 최대 2곳 |
| `danger` / `ok` | `#FF5C5C` / `#3FD68C` | 경고 / 성공 |

타이포는 Pretendard Variable 한 벌. 크기로만 역할을 나눈다 — 15px 본문 / 13px 보조 / 11px 메타 / 18px 화면 제목. 한글 가독성 때문에 `word-break: keep-all`과 자간 −0.01em을 전역으로 걸었다.

### 레이아웃 — 시간의 흐름과 긴급도

```
┌──────────────────────────────┐
│ 밤  2026-09-12               │ ← 아침/낮/밤이 제목에 드러난다
│ ▓▓ 취약점 발견: next@15.1.6  │ ← critical만 상단 배너
├──────────────────────────────┤
│ 오늘 마감인 건 복지 사이트     │
│ 제출 하나다. 카드 로그라이크는 │ ← 브리핑: 목록이 아니라 문단
│ 9일째 멈춰 있다. ...          │
├──────────────────────────────┤
│ 오늘의 핵심                   │
│ 88  Next.js 15.5 릴리즈       │ ← 점수 + 상위 3개만
│ 71  RTX 5070 최저가 7% 하락   │
├──────────────────────────────┤
│ 학교                          │
│ [1 수학][2 물리][3 정보]…     │ ← 가로 스크롤 한 줄
│ 중식 제육볶음 · 미역국 …      │
├──────────────────────────────┤
│ 할일 (4)                      │
│ ○ 복지 사이트 폼 정리   D-1   │
├──────────────────────────────┤
│ 멈춰 있는 프로젝트            │
│ 카드 로그라이크      9일째    │
├──────────────────────────────┤
│ [ 오늘 하루, 한 줄     ][적기]│ ← sticky. 이 화면을 안 벗어난다
├──────────────────────────────┤
│ 오늘 프로젝트 관심사 기록 더보기│  ⊕ ← 엄지 반경 안
└──────────────────────────────┘
```

지킨 것: 다크 우선 / 강조색 하나 / 정보 밀도 / 44pt 터치 타겟 / 16px 입력창(아이폰 자동 확대 방지) / `100dvh` / `env(safe-area-inset-*)`.

의도적으로 안 한 것: 크림색+세리프+테라코타, 전부 같은 라운드 카드+그림자, 대문자 eyebrow 라벨, 가운뎃점 메타 나열, 등장 애니메이션(모션은 `:active` 눌림 반응만), 순서가 아닌 것에 01/02/03 붙이기.

빈 화면 카피는 전부 다음 행동을 가리킨다 — "아직 없습니다"가 아니라 "오른쪽 아래 + 를 눌러 한 줄 적으면 알아서 할일로 들어간다".

---

## 7. Quick Capture가 어떻게 도는가

앱의 핵심 기능이다. 부가 기능이 아니다.

```
+ 탭  →  시트 열림 + 즉시 포커스  →  한 줄 + 엔터
                                       │
              ┌────────────────────────┴───────────────────────┐
              │ 낙관적 삽입 (즉시 목록에 뜸)                    │
              │ POST /api/capture → captures(type='pending')    │
              └────────────────────────┬───────────────────────┘
                                       │  UI는 여기서 안 기다린다
              POST /api/capture/:id/classify  (백그라운드)
                                       │
        Claude가 task / idea / meal / error / log 로 분류 + 필드 추출
                                       │
        실제 테이블로 물질화 → tasks · notes · meals · error_logs · daily_logs
                                       │
              분류가 틀렸으면 칩을 탭 → 이전 행 삭제 후 새 타입으로 재생성
```

식단으로 분류되면 식약처 DB에서 칼로리를 자동으로 붙이고, 못 찾으면 수동 입력으로 폴백한다. 분류 자체가 실패해도 원문은 남고 칩이 "분류 실패"로 바뀐다 — 탭 한 번으로 직접 지정하면 된다.

---

## 8. 폴더 구조

```
config/sources.json          ← 관심사 선언. 새 소스 = 여기 객체 하나
scripts/validate-sources.mjs ← npm run sources:check
supabase/migrations/         ← 스키마 3개 파일
middleware.ts                ← /login·/api/cron·정적파일 빼고 전 경로 차단

src/lib/
  auth.ts        세션 쿠키 서명·검증 (edge/node 공용 Web Crypto), 크론 인증
  db.ts          service_role 클라이언트 — 서버 전용
  claude.ts      Messages API 래퍼 + JSON 추출
  telegram.ts    알림 발송
  alerts.ts      dedupe(7일) + 하루 3건 한도
  watchdog.ts    알림 조건 다섯 가지 검사
  scoring.ts     0~100점
  capture.ts     분류 → 물질화 → 재분류
  briefing.ts    아침 브리핑 / 주간 리포트 프롬프트
  reviews.ts     3·7·30일 간격 반복
  neis.ts        급식·시간표·학사일정
  mfds.ts        식약처 영양성분
  readable.ts    링크 본문 추출
  http.ts        타임아웃 + 재시도 (모든 외부 호출이 여기를 지난다)
  dates.ts       KST 기준 날짜 계산
  collectors/
    run.ts       파이프라인: sync → fetch → normalize → dedupe → 저장 → fail_count
    rss.ts rest.ts github.ts llm.ts   ← 어댑터 4종. 다섯 번째는 없다
    path.ts      축약 JSONPath + 템플릿 치환

src/app/
  (app)/today · projects · interests · records · more · share
  api/…        라우트 (전부 서버, 키는 클라이언트로 안 나간다)
```

---

## 9. 페이즈별 완료 조건 — 자체 검증 결과

| 페이즈 | 완료 조건 | 상태 |
|---|---|---|
| 1 | 홈화면 실행 시 주소창 없이 전체화면 | `display:standalone` + `apple-mobile-web-app-capable` + `viewport-fit=cover` 설정됨 — **실기기 확인 필요** |
| 1 | 로그인 1회 후 재실행 시 로그인 화면 안 뜸 | 서명 쿠키 365일 · HttpOnly · SameSite=Lax |
| 1 | 실행부터 메모 저장까지 3탭 이하 | 앱 열기 → `+` → 입력+엔터 = 2탭 |
| 1 | 입력창 탭 시 화면 확대 안 됨 | 전역 `input{font-size:16px}` + `maximum-scale=1` |
| 2 | 프로젝트 6개를 한 화면에 스크롤 없이 파악 | 행당 3줄(이름·진행바·다음 할 일), 시드 6개 |
| 2 | 하루 한 줄이 '오늘' 화면을 안 벗어남 | 하단 sticky 입력칸 |
| 3 | RSS 항목 하나 추가 시 코드 수정 없이 카드 등장 | `sources.json` → `syncSources()` → 어댑터 dispatch. **단위 테스트 통과** |
| 3 | 잘못된 URL 넣으면 fail_count 상승 + 알림 | `catch` → `fail_count++` + `last_error` 기록 + 3회째 텔레그램 |
| 3 | snapshots 이틀치 쌓이면 변화율 계산 | `computeChangePct()` — 2점 미만이면 계산하지 않음 |
| 4 | 아침 브리핑이 목록이 아니라 글 | 시스템 프롬프트에서 불릿·제목·인사 금지 |
| 4 | 조건 밖 소식은 알림 안 감 | 다섯 조건 외 발송 경로 없음 + 하루 3건 한도 |
| 5 | 공유시트에서 링크 전송 | `/share?url=` 라우트 (단축어 설정은 §3) |
| 5 | 저장한 에러가 키워드 검색으로 3초 안에 | `pg_trgm` GIN 인덱스 + 200ms 디바운스 |
| 6 | 주간 리포트가 덕담이 아니라 사실 지적 | "칭찬은 근거 있을 때만 한 문장, 방치된 것은 이름을 대서 지적" 프롬프트 |
| 6 | 백업 파일 하나로 전체 복원 가능 | 17개 테이블 전량 페이지네이션 덤프 |

**실제로 돌려본 것**: `next build` 프로덕션 빌드 통과, `tsc --noEmit` 통과, 수집 어댑터 단위 테스트 18종 통과(JSONPath·템플릿 치환·RSS 파싱·snapshot 백분율·스코어링·에러 전파), `sources:check` 27개 소스 검증 통과.

**아직 못 돌려본 것**: 실제 Supabase 연결, 실제 외부 API 응답, 아이폰 실기기. 아래를 먼저 확인해라.

---

## 10. 처음 켤 때 확인할 것

1. **RSS 주소**: `config/sources.json`의 피드 URL은 바뀌거나 죽을 수 있다. 첫 수집 후 더보기 → 수집 소스에서 빨간 것부터 고쳐라. 실패해도 앱은 안 죽는다.
2. **식약처 필드 코드**: `src/lib/mfds.ts` 맨 위 `FIELD` 상수가 API 버전에 따라 다를 수 있다. 칼로리가 계속 비면 실제 응답을 보고 그 상수만 고치면 된다.
3. **NEIS 학교급**: 기본이 고등학교(`hisTimetable`)다. 중학교면 `NEIS_SCHOOL_LEVEL=mis`, 초등학교면 `els`를 환경변수에 넣어라.
4. **해커뉴스**: 공식 Firebase API는 목록 → 항목의 2단 호출이라 어댑터 하나로 안 된다. 한 번에 끝나는 HN Search API(Algolia)를 쓴다.
5. **ITAD**: 게임 UUID를 찾아 찜 목록에 `itad_game`으로 등록해야 가격 추적이 시작된다.

## 11. 안 한 것 (PART 3 — 지금은 손대지 않는다)

시험 D-day와 과목별 준비도 / 게임잼·공모전 마감 트래커 / 사진 칼로리 인식 / 음성 입력 Quick Capture / 상황 반응형 한 줄 문구.

## 12. 하지 않기로 한 것

다나와·OP.GG·메타크리틱·SteamDB 스크래핑, API 키의 클라이언트 노출, 외부 호출 실패를 조용히 삼키기, 더미 데이터로 화면만 그려놓기. 롤 티어표 자체 산출과 포챔스 메타 자동 수집도 시도하지 않는다 — 링크 카드와 수동 입력으로 간다.
