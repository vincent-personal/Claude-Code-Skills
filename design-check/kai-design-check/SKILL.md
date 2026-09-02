---
name: kai-design-check
description: 이미 만들어진 프론트엔드의 화면 전부를 계측해 디자인 결함(레이아웃 어긋남·화면 벗어남·글자 잘림·색 대비·패딩/간격 불일치·정렬 어긋남·터치 타깃·오버레이/시트 오동작·애니메이션)을 찾아 순서대로 고치는 스킬. Angular(SSR/CSR)·Ionic·React·Vue·Next·Flutter 어디든, 데스크탑 브라우저·모바일 브라우저·모바일 네이티브 어느 표면이든 적용된다. 화면이 다 만들어졌을 때, "레이아웃이 이상하다"·"패딩이 안 맞는다"·"화면을 벗어난다"·"레퍼런스랑 다르다" 싶을 때 발동한다. 트리거 - /kai-design-check [프로젝트경로]
---

# kai-design-check — 프론트엔드 디자인 결함 전수 계측 & 일괄 교정

## 발동

```
/kai-design-check                      # 현재 작업 디렉터리
/kai-design-check /path/to/project     # 임의의 프로젝트
/kai-design-check . --quick            # 계측만 (수정 없이 보고)
/kai-design-check . --no-crosscheck    # 교차 검증 생략 (권장하지 않음)
```

**경로를 받으면 묻지 않고 Phase 0 → 7 을 순서대로 끝까지 간다.**
사람의 판단이 필요한 지점은 **Phase 4-A 딱 한 곳**뿐이고(디자인 원본과 접근성이 충돌할 때),
그마저도 기본 정책이 정해져 있어(§4-A) 막히지 않는다.

---

## 역할

눈으로 훑는 QA 가 아니다. **좌표와 픽셀로 증명하는 QA** 다.
"고쳤다"는 말은 계측기가 0을 낼 때만 한다.

### 잡는 것

| 갈래 | 구체적으로 |
|---|---|
| **화면 벗어남** | 가로 오버플로 · 문서 가로 스크롤 · 좁은 폭(320px)에서만 나는 넘침 |
| **레이아웃** | 상호작용 요소 겹침 · 고정 바/키보드에 가려짐 · 호스트에 상자가 없어 무시된 스타일 |
| **통째로 사라짐** | 🔴 **요소는 DOM 에 있는데 다른 것에 완전히 덮여 안 보임** ("탑 네비게이션이 없다"의 정체) |
| **글자** | 말줄임 없이 잘림 · 긴 입력값에서 넘침 · 시스템 글자 확대에서 깨짐 |
| **색** | WCAG AA 대비 미달 · 배경과 같은 색이 되어 사라진 글자 · 테마별 어긋남 |
| **패딩·간격** | 🔑 **거의 같은데 2~8px 어긋난 정렬·여백** (OCD 항목) · 열 폭 제각각 · 블록이 붙음 |
| **터치** | 24px(WCAG AA)·44px(HIG) 미달 · **이웃이 클릭을 가로챔** |
| **오버레이** | 시트·모달·서랍·토스트의 위치·정렬 · 포커스·Escape·스크롤 잠금 · **겹쳤을 때** |
| **애니메이션** | 동작 줄이기 정책 · 숨어 버린 요소 · 상시 `will-change` |
| **SSR·라우팅** | 정상 URL 200 · 없는 URL 404 · 호스트 차단 |
| **레퍼런스 대조** | 원본과 글자 크기·굵기·색·가로 위치·세로 간격이 같은가 · **구현 누락** |

---

## ★ 원칙 (이 일곱을 어기면 스킬이 무력해진다)

### 1. 계측하지 않은 것은 "고쳤다"고 하지 않는다

### 2. 🔴 계측기를 먼저 의심한다
`0건` 은 "결함이 없다"가 아니라 **"이 검사가 못 찾았다"** 이다.
이 하네스의 원본은 두 번 "0건"을 보고했다가 뒤집혔다 — 44px 라 해 놓고 32px 에서 통과시켰고,
대비를 AA 라 해 놓고 3:1 에서 끊었고, 알파 합성 함수를 만들어 두고 부르지 않았고,
**탐색 실패를 삼켜 0개를 검사하고도 "0건 통과"** 를 냈다.
새 검사를 넣을 때마다 **일부러 결함을 만들어 잡히는지 확인**한다.

### 3. 🔴 실제로 검사한 수를 예정 수와 대조한다
모든 감사기는 `연 화면 448/448` 처럼 **분모와 분자**를 찍는다. `catch { continue }` 금지.

### 4. 오탐을 지울 때는 **이유를 주석으로** 남기고, **몇 개를 걸렀는지 센다**
예외가 소리 없이 늘면 계측기가 껍데기가 된다.
🔴 실제 사고: 부유 요소를 빼려고 `position: absolute` 조상을 제외했는데
Ionic 의 `.ion-page` 가 absolute 라 **전 화면의 세로 간격 검사가 통째로 꺼진 채 "편차 0"** 을 보고했다.
구멍을 메우자 33개 화면에서 편차가 다시 나왔다. **필터는 반드시 `걸러낸 수`를 함께 찍는다.**

### 5. 접근성은 디자인 충실도와 **동급 선택지가 아니다**
충돌하면 접근 가능한 값을 **기본값**으로, 원본은 **옵트인**으로 뒤집는다.

### 6. 🔴 사용자의 dev 서버를 절대 건드리지 않는다
감사는 **전용 포트**에 자기 서버를 띄웠다 내린다. 사용자 포트를 kill 하지 않는다.

### 7. 🔑 사람이 거슬려 하는 것은 "다양함"이 아니라 **"거의 같은데 어긋남"** 이다
정렬선이 3가지인 것은 설계다. **55px 과 59px 이 섞여 있는 것**이 결함이다.
간격도 마찬가지 — 12·16·24 는 리듬이고, **14 와 16 이 섞인 것**이 버그다.

---

## Phase 0 — 표면 판별 & 조사 (자동)

```bash
cd <프로젝트>
node ~/.claude/skills/kai-design-check/assets/detect.mjs .
```

`ui-audit.config.json` 초안이 나온다(프레임워크·빌드·산출물·SSR·라우트·테마·안전 포트).
**`"?"` 와 `$파라미터확인` 이 붙은 항목은 반드시 사람이 확인한다.**

### 표면 → 어댑터

| 표면 | 계측 방법 | 어댑터 |
|---|---|---|
| Angular CSR/SSR · React · Vue · Next · Svelte | 브라우저 DOM 좌표 | `web` |
| **Ionic** (Angular/React/Vue) | 같음 — WebView 도 DOM 이다. 브라우저에서 기기 뷰포트로 잰 뒤 네이티브 전용 항목만 실기기 | `web` + `references/framework-ionic.md` |
| **Flutter** (네이티브·웹) | 위젯 트리 rect + 프레임워크 오버플로 오류 | `flutter` |
| React Native · 네이티브 · 게임 UI | 스크린샷 픽셀 | `pixel` |
| **어느 표면이든** (보조) | 스크린샷 픽셀 — 정렬·여백 근접 불일치 | `pixel` |

| **디자인 원본이 있을 때** | 레퍼런스 ↔ 구현 **글자 단위** 대조 (크기·굵기·색·가로·세로 간격) | `refdiff` |

> 🔑 `pixel` 어댑터는 **표면을 가리지 않는다.** DOM 이 없어도, 네이티브라도,
> 스크린샷만 있으면 정렬 어긋남·여백 불일치·잘림·Flutter 오버플로 줄무늬를 잡는다.
> DOM 이 있으면 DOM 계측이 권위이고, 픽셀은 **패딩/정렬 OCD 항목을 보태는 쪽**이다.

### 확인 목록
- [ ] 빌드 명령 · 산출물 경로 · (SSR 이면) 서버 엔트리
- [ ] **사용자 dev 서버 포트** — 감사 포트는 여기서 비켜난다
- [ ] 화면 전수 (파라미터가 **실제 값으로 채워진** URL)
- [ ] 오버레이(시트·모달·서랍) 여는 방법 — URL 인가 클릭인가
- [ ] 테마 전환 방식
- [ ] 🔴 **`selectors.landmarks`** — 이 프로젝트의 앱바·헤더 선택자.
      안 맞으면 "덮여 사라짐" 검사가 **조용히 0건**이 된다.
      `audit:ui` 가 `landmarks 검사 대상 N개` 를 찍으니 **0이면 반드시 고친다**

---

## Phase 1 — 하네스 설치 (자동)

```bash
mkdir -p scripts .ui-audit && echo ".ui-audit/" >> .gitignore
S=~/.claude/skills/kai-design-check/assets

# 웹 계열
cp $S/web/*.mjs $S/pixel/*.mjs scripts/
npm i -D playwright && npx playwright install chromium

# Flutter
cp $S/flutter/design_check_test.dart integration_test/
cp $S/flutter/run-flutter-check.sh . && chmod +x run-flutter-check.sh
cp $S/pixel/*.mjs scripts/          # 스크린샷 분석은 Flutter 에도 쓴다
```

`package.json` 배선:
```json
"audit:all":"node scripts/audit-all.mjs",  "audit:ui":"node scripts/audit-ui.mjs",
"audit:overlays":"node scripts/audit-overlays.mjs", "audit:a11y":"node scripts/audit-a11y-overlay.mjs",
"audit:stack":"node scripts/audit-overlay-stack.mjs", "audit:longtext":"node scripts/audit-longtext.mjs",
"audit:motion":"node scripts/audit-motion.mjs", "audit:routes":"node scripts/audit-routes.mjs",
"audit:pixel":"node scripts/audit-pixel.mjs .ui-audit/shots"
```

`audit:all` 이 **빌드 최신화 → 감사 서버 기동 → 감사 전부 → 서버 정리**를 한다.
포트를 누가 쓰고 있으면 **무엇을 재는지 확신할 수 없어 멈춘다**(그것이 옳다).

### 화면 목록을 확실히 채운다 (웹)
정적 분석은 중첩 라우트·동적 파라미터를 못 푼다. **실제 앱을 크롤한다**:
```bash
npm run build && node scripts/preview-server.mjs 4499 <dist> &
node scripts/crawl.mjs http://localhost:4499        # config 의 screens 를 갱신
```
⚠️ 링크로 닿지 않는 화면(딥링크·조건부)은 크롤이 못 찾는다 — **직접 보탠다.**

---

## Phase 2 — 기준선 계측 (고치기 전에)

```bash
npm run audit:all 2>&1 | tee .ui-audit/baseline.txt
```
**숫자를 적어 둔다.** 나중에 "얼마나 나아졌나"를 말하려면 시작점이 필요하다.

---

## Phase 3 — 🔴 오탐부터 걷어낸다 (수정보다 먼저)

거짓 결함이 섞이면 진짜 신호가 묻힌다. 원본 하네스는 356건 중 **200건 이상이 오탐**이었다.
**`references/auditor-traps.md` 의 목록을 대조하며** 하나씩 확인하고,
지울 때마다 **왜 그런지 주석을 남긴다.**

---

## Phase 3.5 — 🔑 레퍼런스 1:1 대조 (원본이 있을 때 · OCD 항목의 최종 병기)

디자인 원본(HTML 캔버스·Storybook·배포된 원본)이 있으면 **반드시** 이 단계를 넣는다.
스크린샷 육안 대조로는 12.5px 와 13px 을 가릴 수 없다.

```bash
cp ~/.claude/skills/kai-design-check/assets/refdiff/*.mjs scripts/
# ui-audit.config.json 에 reference 블록 작성 (references/reference-diff.md)
node scripts/audit-ref-diff.mjs            # 라이트
node scripts/audit-ref-diff.mjs --dark     # 다크
```

양쪽 DOM 을 같은 규칙으로 읽어 **글자마다** 크기·굵기·색·가로 위치·**이웃 간 세로 간격**을 대조하고,
**레퍼런스에만 있는 글자**(구현 누락)를 짚는다.

> 🔴 **함정 여덟 가지를 모르면 결과가 전부 거짓이 된다** — 상자가 아니라 글리프를 재고,
> `position` 으로 부유 요소를 판정하지 말고, 폰트·아이콘이 그려질 때까지 기다리고,
> 원점(상태바·안전영역)을 맞추고, **글자 폭은 비교하지 않는다.**
> 반드시 `references/reference-diff.md` 를 먼저 읽는다.

> 🔑 **"여러 화면에 반복되는 편차" 표를 먼저 본다.** 같은 편차가 12개 화면에 나오면
> 화면 12개가 아니라 **토큰/공용 컴포넌트 한 곳**을 고친다.
> (실제 사례: 헤더 규격이 54개 화면에서 어긋났으나 공용 헤더 하나로 해결)

---

## Phase 4 — 결함 수정 (순서가 중요하다)

**`references/defect-catalog.md`(증상→원인→수정→검증)를 펴고 아래 순서로.**
뒤엣것이 앞엣것을 무효화하지 않도록 정해진 순서다.

### 4-A. 토큰·전역 규칙 — 여기서 고치면 화면을 안 만져도 된다

**① 색 대비.** 위반이 **어느 토큰에서 오는지 먼저 센다.** 대개 토큰 2~3개가 90% 를 만든다.
램프에서 **한 단씩** 내려 위계를 지키며 AA 를 넘긴다.

> 🔑 **밝고 따뜻한 브랜드색(주황·노랑) 위의 흰 글자는 구조적으로 AA 를 못 넘는다.**
> **채움색을 어둡게 하지 말고 글자를 어둡게 한다.** 브랜드색이 그대로 살면서 통과한다.
> (실측: 흰 글자 3.36:1 → 어두운 글자 5.81:1, 채움색 변경 없음)

> ⚖️ **여기가 유일하게 사람 판단이 필요한 지점이다.** 디자인 원본과 충돌하면
> **기본값을 AA 로 하고 원본을 옵트인**(`<html data-palette="exact">`)으로 뒤집는다.
> 그리고 **바꾼 토큰 표를 보고에 반드시 싣는다.**

**② 열 폭 규격화.** 화면마다 다른 `max-width` 를 3~4개 토큰으로 통일한다.
🔑 **시트·하단바도 같은 토큰**을 써야 본문과 어긋나지 않는다.

**③ 간격 토큰.** 근접 불일치(14 vs 16)를 하나로. 간격 책임을 **부모의 `gap`** 으로 옮긴다.

**④ `prefers-reduced-motion` 전역 방어.** 없으면 넣는다.
🔴 `animation: none` 이 아니라 **`animation-duration: 1ms`** — `none` 은
`fill-mode: both` 요소를 `opacity:0` 에 영원히 가둔다.

### 4-B. 화면 벗어남 (좁은 폭부터)
320px 에서만 나오는 것이 대부분이다. 흔한 원인 넷 — `minmax(320px,1fr)` ·
격자 칸의 `min-width:auto` · 플렉스에 눌린 글자 · **금액은 자르면 안 되는 정보**.

### 4-C. 가려짐 · 고정 바
🔴 **하단 고정 바의 가운데 정렬에 `translateX(-50%)` 를 쓰지 않는다** — 등장 애니메이션의
`transform` 과 충돌해 바가 화면 밖으로 나간다. `left:0;right:0;width:min(100%,var(--app-col));margin-inline:auto`.
하단 여백은 `calc(넉넉히 + env(safe-area-inset-bottom))` — 좁은 폭에서 바가 두 줄이 된다.

### 4-D. 터치 타깃
🔑 **겉모습을 키우지 않는다.** `::after`(웹) / `padding`·`SizedBox`(Flutter) 로 **누를 면만** 넓힌다.
웹은 44 가 아니라 **46px** 로 (44 면 `elementFromPoint` 가 경계에서 놓친다).
🔴 넓히면 **이웃의 클릭을 가로챌 수 있다** — `tap-stolen` 검사 없이는 이 수정을 하지 않는다.

### 4-E. 오버레이 — **하나로 통일한다**
컴포넌트마다 따로 만들면 반드시 빠진다. **공용 지시자/훅 하나**로 모은다.
🔴 **Escape 를 `document` 에 직접 달지 않는다** — 겹친 오버레이가 함께 닫힌다.
공용 스택에서 **맨 위 하나만** 처리한다.

### 4-F. 상태·생명주기
타이머 정리 · 오버레이 닫기는 `replaceUrl` ·
**목록 키에 번역 문자열 금지, `$index` 도 안정 키가 아니다**(삽입·정렬 시 상태가 다른 행으로 샌다).

### 4-G. 애니메이션
hover 는 `@media (hover:hover)` 안에만 · 목록 stagger 는 CSS `nth-child` 지연으로
(템플릿을 안 건드린다) · `will-change` 를 상시로 주지 않는다.

### 4-H. SSR·라우팅 (웹만)
소프트 404 · **프레임워크가 상태코드를 덮어쓸 수 있다** ·
**`allowedHosts` 가 비면 SSR 서버가 모든 요청을 400 으로 막는다** · 라우트 이중 관리.

---

## Phase 5 — 재계측 & 회귀 확인

```bash
npm run audit:all
```
특히: 히트영역을 넓힌 뒤 **`tap-stolen` 이 0인가** ·
토큰 색을 바꾼 뒤 **다른 화면의 대비가 두 테마 모두 멀쩡한가** ·
폭 토큰을 통일한 뒤 **시트·하단바가 본문과 맞는가**.

---

## Phase 6 — 🔴 교차 검증 게이트 (건너뛰지 않는다)

**이 스킬의 가치 절반이 여기서 나온다.** 원본 작업에서 교차 검증이 "완료"라던 보고를 **세 번** 뒤집었다.

1. `advisor` 서브에이전트(Opus) — 설계 자문
2. `kai_consult`(비-Anthropic 계열) — **반박 우선** 교차 검증

전달: 고쳤다는 목록 · 계측 수치 · **계측기 소스 자체**.
지시: *"동의하지 말고 반박부터 하라. (1) 고쳤다는 것 중 실제로는 안 고쳐진 것,
(2) 새 코드가 만든 새 결함, (3) 계측기가 못 잡는 종류."*

받은 지적은 **코드로 하나씩 확인**한다. 곧이곧대로 믿지도, 무시하지도 않는다.
이견이 없어질 때까지 **최대 3라운드**.

---

## Phase 7 — 문서화 & CI

프로젝트 `CLAUDE.md` 에: 감사 명령 · **현재 기준선 수치** · 이번에 확립한 규약 ·
🔴 **뒤집혔던 결론들**(다음 세션이 같은 함정에 빠지지 않도록).

```yaml
- run: npm ci && npx playwright install --with-deps chromium
- run: npm run audit:all      # 종료코드 1 이면 머지 차단
```

---

## 보고 형식

```
■ 기준선 → 현재      (숫자로)
■ 고친 실결함        (증상 → 원인 → 조치)
■ 색을 바꿨다면      (토큰 표 · 되돌리는 방법)
■ 교차 검증이 뒤집은 것
■ 🟡 남긴 것         (왜 · 되돌리는 법)
■ 아직 못 잡는 종류  (정직하게)
```

## 이 스킬이 **못 잡는 것** (반드시 함께 아뢴다)

- **그림 요소의 시각 회귀** — 아이콘 모양·그림자 번짐·easing 궤적·이미지 크롭.
  글자·간격·색은 Phase 3.5 가 잡지만, 그림은 **스크린샷 diff** 가 따로 필요하다
- **브라우저 하나(Chromium)** — Firefox/WebKit·200% 확대·RTL 미검증
- **실기기 전용** — 노치·홈 인디케이터·화면 키보드·상태바 겹침은 시뮬레이터/실기기 필요
- **hydration** — 감사 서버가 CSR 대체본을 주면 SSR/CSR 불일치는 안 보인다
- **픽셀 대비** — 글자와 구분선·아이콘을 구분 못 한다. DOM 이 있으면 DOM 이 권위

---

## 참고 문서

| 무엇 | 어디 |
|---|---|
| 결함 카탈로그 (증상→원인→수정→검증) | `references/defect-catalog.md` |
| **레퍼런스 1:1 대조 — 방법과 함정 8가지** | `references/reference-diff.md` |
| 계측기 함정 (오탐·거짓 통과) | `references/auditor-traps.md` |
| Ionic 고유 함정 | `references/framework-ionic.md` |
| Flutter 고유 함정 | `references/framework-flutter.md` |
| Angular/React/Vue 고유 함정 | `references/framework-web.md` |
