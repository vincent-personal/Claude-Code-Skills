# Ionic — 고유 함정

> Ionic 은 **WebView 위의 DOM** 이라 `web` 어댑터가 그대로 통한다.
> 다만 **Shadow DOM · 플랫폼 모드 · 안전영역 · 키보드** 때문에 일반 웹과 다르게 깨진다.

---

## 🔴 계측 축이 하나 더 있다 — 플랫폼 모드

Ionic 은 **iOS 모드와 Material 모드가 서로 다른 패딩·높이·폰트**를 쓴다.
한쪽만 보고 만들면 다른 쪽에서 간격이 어긋난다. **양쪽을 다 잰다.**

```json
"themes": [
  { "name": "ios-light",  "url": "?ionic:mode=ios" },
  { "name": "md-light",   "url": "?ionic:mode=md" },
  { "name": "ios-dark",   "url": "?ionic:mode=ios", "class": "ion-palette-dark" },
  { "name": "md-dark",    "url": "?ionic:mode=md",  "class": "ion-palette-dark" }
]
```
> Ionic 8+ 는 다크가 `.ion-palette-dark`(예전 `.dark`) 클래스다. 프로젝트의 `variables.scss` 를 보고 맞춘다.

---

## Shadow DOM — 보통 CSS 가 닿지 않는다 🔴

### N1. `ion-content` 에 `padding` 을 줘도 안 먹는다
**증상** 내용이 화면 가장자리에 붙어 있다
**원인** `ion-content` 의 실제 스크롤 컨테이너는 shadow DOM 안이다
**수정** CSS 변수로:
```css
ion-content { --padding-start: 16px; --padding-end: 16px;
              --padding-top: 8px;   --padding-bottom: 24px; }
```
또는 `class="ion-padding"` 유틸리티.

### N2. `ion-item` 의 좌우 여백이 제각각
**증상** 목록 항목마다 왼쪽 여백이 미세하게 다르다 (**정렬 근접 불일치의 주범**)
**원인** `ion-item` 은 `--padding-start` 와 **`--inner-padding-end`** 를 따로 쓴다.
바깥 `padding` 은 무시된다
**수정**
```css
ion-item { --padding-start: 16px; --inner-padding-end: 16px; --min-height: 56px; }
```
🔑 `ion-list` 안팎에서 기본값이 다르므로 **한 곳에 규칙을 두고 전역 적용**한다.

### N3. `ion-input`/`ion-textarea` 의 여백
Ionic 7+ 는 `label`·`labelPlacement` 가 컴포넌트 안으로 들어왔다.
`--padding-start/end`·`--highlight-height` 로 조정한다. 바깥 CSS 로는 안 된다.

### N4. `::part()` 가 필요한 곳
```css
ion-modal::part(content)   { border-radius: 20px; }
ion-toolbar::part(container){ padding-inline: 8px; }
ion-searchbar::part(icon)  { color: var(--x); }
```
`::ng-deep` 이나 자손 선택자로는 shadow 경계를 못 넘는다.

---

## 안전영역 · 노치

### N5. 커스텀 하단 바가 홈 인디케이터에 잘림
**원인** `ion-tab-bar`·`ion-footer` 는 자동 처리되지만 **직접 만든 고정 바는 아니다**
**수정**
```css
.my-bar { padding-bottom: calc(12px + var(--ion-safe-area-bottom, env(safe-area-inset-bottom))); }
```
🔑 Ionic 은 `--ion-safe-area-*` 를 채워 준다. 웹 브라우저에서는 비어 있으므로 `env()` 를 폴백으로 함께 쓴다.

### N6. `fullscreen="true"` 를 안 줘서 헤더 아래가 비거나, 줘서 내용이 헤더에 가림
`<ion-content fullscreen="true">` 는 내용을 헤더 **아래로 흘려보낸다**(iOS 큰 제목용).
헤더가 반투명이 아니면 첫 줄이 가린다. 상단 여백을 함께 조정한다.

### N7. iOS 큰 제목(collapse) 이 안 접힘
`<ion-header collapse="condense">` 를 **`ion-content` 안에** 하나 더 둬야 동작한다.
빠뜨리면 스크롤해도 제목이 그대로다.

---

## 오버레이

### N8. `ion-modal` 크기·모서리
```css
ion-modal { --height: auto; --width: 92%; --border-radius: 20px; --max-height: 90vh; }
```
시트 모달은 `[initialBreakpoint]`·`[breakpoints]`. **데스크탑 폭에서 전체 화면이 되지 않도록** `--max-width` 를 준다.

### N9. `ion-toast` 가 탭바에 가림
`position="bottom"` 이면 탭바 뒤로 들어간다.
```css
ion-toast { --start: 16px; --end: 16px; }
```
+ `position-anchor` 또는 `--bottom` 으로 띄운다.

### N10. 오버레이 겹침 — Ionic 이 스택을 관리한다
`ion-modal`·`ion-alert`·`ion-action-sheet` 는 Ionic 자체 스택을 쓴다.
**직접 만든 오버레이와 섞으면** z-index 와 Escape 처리가 어긋난다.
🔑 **한쪽으로 통일한다.** 섞을 거면 겹침 감사(`audit:stack`)를 반드시 돌린다.

### N11. `ion-content` 가 스크롤 잠금을 무시
배경 스크롤을 잠글 때 `body { overflow: hidden }` 만으로는 부족하다.
Ionic 오버레이는 자동 처리하지만 **커스텀 오버레이는 `ion-content` 의 `scrollY=false`** 도 함께.

---

## 키보드

### N12. 화면 키보드가 뜨면 하단 CTA 가 가림
**수정** `@capacitor/keyboard` 의 `KeyboardResize.Body`(기본) 확인 +
`ion-footer` 를 쓰거나, 키보드 높이만큼 여백:
```ts
Keyboard.addListener('keyboardWillShow', (i) =>
  document.documentElement.style.setProperty('--kb', `${i.keyboardHeight}px`));
```
**검증** 계측으로는 못 잡는다 — 시뮬레이터 필요.

### N13. iOS 에서 입력 시 화면 전체가 밀려 올라감
`KeyboardResize.None` 이면 WebView 자체가 밀린다. `Body` 또는 `Native` 로.

---

## 터치 타깃

### N14. `ion-button size="small"` 이 44px 미만
**수정** `--padding-start/end`·`--min-height` 로 히트영역만 키운다:
```css
ion-button.small-tap { --min-height: 44px; }
```
### N15. `ion-icon` 단독 클릭
아이콘만 두면 20px 다. `ion-button fill="clear"` 로 감싸거나 히트영역을 넓힌다.

---

## 색 · 테마

### N16. Ionic 색 변수를 안 쓰고 하드코딩
Ionic 은 `--ion-color-primary` 와 함께 `-rgb`·`-contrast`·`-shade`·`-tint` **5종**을 요구한다.
하나만 바꾸면 hover/active 가 어긋난다. `theme/variables.scss` 에서 세트로 바꾼다.

### N17. `contrast` 값이 대비를 못 넘김 🔴
`--ion-color-primary-contrast` 가 흰색인데 primary 가 밝은 색이면 **버튼 글자가 안 읽힌다**.
🔑 **채움색을 어둡게 하지 말고 `-contrast` 를 어두운 색으로** 바꾼다.

### N18. 다크 모드가 Ionic 기본과 충돌
`@ionic/angular/css/palettes/dark.*.css` 를 import 하면서 자체 다크 규칙을 또 쓰면 어긋난다.
**한쪽으로 통일**하고 양쪽 모드를 다 계측한다.

---

## 계측 시 주의

- **웹 브라우저에서 재도 대부분 잡힌다.** 안 잡히는 것은 N5(안전영역)·N12(키보드)·N13 뿐이니
  그 셋만 시뮬레이터/실기기로 확인한다
- `ion-content` 는 자체 스크롤 컨테이너라 **문서 스크롤(`document.scrollingElement`)이 안 움직인다.**
  하단 바 가려짐 검사는 `main` 선택자를 **`ion-content`** 로 잡아야 한다
  (`detect.mjs` 가 Ionic 을 감지하면 자동으로 그렇게 넣는다)
- 스크림 선택자는 **`ion-backdrop`**
- 모달 선택자는 `ion-modal, ion-popover, ion-action-sheet, ion-alert`

---

## 🔴 실측으로 확인된 Ionic 함정 — 화면을 통째로 망가뜨리는 것들

> Ionic 9 판매자앱(61화면)에서 **재현하고 고친 것**이다. 위쪽 항목보다 파급이 크다.

### N25. `[fullscreen]="true"` 가 **탑 네비게이션을 통째로 지운다** 🔴🔴
| | |
|---|---|
| **증상** | 47+ 화면에서 상단 앱바·검색창이 **아예 안 보인다**. "레퍼런스랑 똑같이 만든 거 맞냐"는 말이 나온다 |
| **원인** | `ion-content` 는 형제 중 **`ion-header`/`ion-footer` 만** 레이아웃 계산에 넣는다.<br>`[fullscreen]="true"` 면 content 가 페이지 전체를 덮어, 일반 `<header>` 로 둔 앱바가 **그 아래로 깔린다** |
| **수정** | ① `[fullscreen]="true"` 를 걷어낸다(불필요한 곳에서)<br>② 앱바 컴포넌트를 **`<ion-header class="ion-no-border">` 로 감싼다**(+`IonHeader` import)<br>③ 헤더 형제로 두었던 **검색·필터 블록도 전부 `ion-header` 안으로** |
| **검증** | 레퍼런스 대조의 "레퍼런스에만 있음" 항목이 잡는다. DOM 감사만으로는 **안 잡힌다**(요소는 존재하고 가려졌을 뿐) |

🔑 **이것 하나가 "검색창이 없다"·"개판이다"의 정체였다.** Ionic 프로젝트에서 상단 요소가
안 보이면 **가장 먼저** 이것을 의심한다.

### N26. Ionic 이 `label` 의 `line-height` 를 되돌린다 🔴
| | |
|---|---|
| **증상** | 라벨·라디오 제목이 **전 화면에서 2~8px 위로 뜬다**. 본문 리듬에서만 이탈 |
| **원인** | Ionic 기본 CSS 가 `label { line-height: normal }` 로 덮는다 |
| **수정** | `global.scss` 에 **한 곳에서** 되찾는다: `ion-app label { line-height: inherit; }` |

### N27. Ionic 이 `button` 의 `line-height` 를 `1` 로 누른다 🔴🔴
| | |
|---|---|
| **증상** | 목록 카드가 **전부 3~4px 씩 붙어 보인다**. 화면 전체 세로 리듬이 무너진다 |
| **원인** | 목록 카드를 `<button>` 으로 만드는 것이 보통인데, Ionic 이 `button { line-height: 1 }` 을 누른다.<br>실측: 앱 `13.33px/13.33px` vs 레퍼런스 `normal/13.33px` |
| **수정** | `ion-app button { line-height: normal; }`<br>(`.ds-button` 등 스스로 `line-height:1` 을 못 박는 것에는 무영향) |

🔑 **N26·N27 이 "패딩 간격이 안 맞는다"의 진짜 원인인 경우가 많다.**
개별 화면을 고치지 말고 **전역 두 줄**로 되찾는다.

### N28. 전역 터치 타깃 규칙이 엉뚱한 것을 부풀린다 🔴
| | |
|---|---|
| **증상** | 스위치가 **거대한 알약(48×44)** 으로, 순서이동 화살표·텍스트 링크가 괴물처럼 커진다 |
| **원인** | `button, [role=button] { min-height: 44px }` 같은 **전역 규칙**이 스위치 트랙(28px)·화살표(22px)까지 잡는다 |
| **수정** | 🔑 **전역 규칙을 지운다.** 터치 타깃은 **컴포넌트가 각자 책임**진다<br>(버튼 36/48/56 · 아이콘버튼 32/40/44 · 목록행 60). 예외로 박아 둔 `min-height:0` 도 함께 정리 |

> ⚠️ **결함 카탈로그 D1(히트영역 넓히기)을 전역 규칙으로 하면 이 사달이 난다.**
> `::after` 로 **누를 면만** 넓히는 이유가 이것이다.

### N29. `ion-header`/`ion-footer` 가 **없는 그림자를 그린다**
| | |
|---|---|
| **증상** | 하단 고정 바 위에 레퍼런스에 없는 선/그림자 (27화면) |
| **원인** | Material 모드에서 `::after`/`::before` 로 그림자를 그린다 |
| **수정** | ```css
ion-header.ion-no-border::after,
ion-footer::before,
ion-footer.ion-no-border::before { display: none; }
``` (`!important` 없이 된다) |

### N30. Ionic 오버레이의 z-index 를 모르면 커스텀 오버레이가 숨는다
Ionic: modal `20000+i` · toast `60000+i`.
커스텀은 그 위로: `--z-modal: 30000` · `--z-toast: 70000`.

### N31. 안드로이드 백버튼이 커스텀 오버레이를 안 닫는다
```ts
platform.backButton.subscribeWithPriority(150, (next) => {
  if (!overlay.closeTop()) next();
});
```

### N32. `ion-tabs` 안에 `ion-router-outlet` 을 또 두면 화면이 겹친다 🔴
`IonTabs` 가 이미 outlet 을 만든다. 수동 outlet 을 지우고 `<ion-tab-bar>` 만 둔다.

### N33. `IonicRouteStrategy` 는 **path 파라미터만** 비교한다
쿼리 파라미터로 필터를 바꿔도 컴포넌트가 재생성되지 않아 **snapshot 이 낡는다**.
`toSignal(route.queryParamMap)` + `effect` 로 반응하게 한다.

### N34. 하위 화면에서 탭바가 하단 CTA 와 겹친다
탭바를 상시 렌더하지 말고 `showTabBar = computed(() => 세그먼트 수 === 2 && …)`.
`html.app-has-tabbar` 클래스로 toast·fab·bulk-bar 를 `--tabbar-height` 만큼 올린다.

### N35. `iconify-icon` 웹컴포넌트가 재방문 때 사라진다
웹컴포넌트 업그레이드 시점과 Angular 속성 설정이 **경합**한다.
→ 웹컴포넌트를 쓰지 말고 **번들 JSON 에서 SVG 를 직접 렌더**한다.
아이콘 서브셋 빌더는 **별칭을 최종 아이콘으로 평탄화**해야 한다(별칭만 담으면 영원히 빈칸).

### N36. Ionic `core.css` 가 `:root` 에 68건을 정의해 브랜드색을 덮는다 🔴
`@use` 순서를 **`ionic-base → tokens → variables`** 로.
⚠️ **`angular.json` 의 `styles` 배열에 `variables.scss` 가 중복 진입점으로 들어가 있는 일이 잦다** — 제거한다.

### N37. `-contrast`/`-shade`/`-tint`/`-rgb` 는 `var()` 를 자동 추종하지 않는다 🔴
다크에서 **흰 배경 위 흰 글씨**가 되는 원인. 다크 블록에서 **6종 세트를 손으로 다시 쓴다.**

### N38. 구형 WebView(89~110)는 `color-mix()` 를 모른다
stepped colors 가 통째로 죽는다 → **정적으로 계산해 박는다**(50~950 전 단계).

### N39. `:not(:placeholder-shown)` 은 placeholder 속성이 없으면 **항상 참**
OTP 칸이 비어 있는데도 오류색(붉은 테두리)으로 보인다.
→ `[data-filled]` 같은 명시적 상태 속성을 쓴다.

### N40. inline `span` 두 개가 붙어 한 문장처럼 보인다
"현재 설정기본 배송비…" 처럼 읽힌다 → `display: block`.
"제목 아래에 공백이 없다"는 지적의 흔한 정체다.

---

## 실제 프로젝트에서 나온 추가 발견 (Ionic 9 판매자앱, 61화면)

### N19. 서체 대체로 **전 화면의 가로 위치가 어긋남** 🔴
**증상** 레퍼런스와 대조하니 라틴 글자의 폭·시작점이 화면마다 조금씩 다르다
**원인** 레퍼런스는 `Plus Jakarta Sans`, 구현은 `Pretendard` 를 앞세웠다.
한글은 같아 보여도 **라틴 글자 폭이 달라 그 뒤 모든 글자가 밀린다**
**수정** 폰트 스택을 원본과 **같은 순서**로 맞추거나, 다르다면
**"글자 폭은 비교하지 않는다"** 를 대조 규칙에 명시한다 (`references/reference-diff.md`)
🔑 이것을 모르면 대조 결과가 온통 빨간색이 되어 **진짜 결함이 묻힌다**

### N20. `--ion-background-color`/`--ion-text-color` 만 바꾸고 stepped colors 를 안 만듦 🔴
**증상** 테두리·비활성 글자만 기본 흑백 혼합으로 남아 테마가 어긋난다
**원인** Ionic 은 `--ion-color-step-50 … -950` (배경↔글자 5% 간격 혼합) 를 함께 쓴다
**수정** 배경/글자색을 바꾸면 **step 50~950 을 전부 재생성**한다

### N21. 안전영역 적용 범위를 좁게 잡음
`ion-header`/`ion-footer` 만 챙기고 끝내면 안 된다. **함께 봐야 할 것**:
`fullscreen` 인 `ion-content` · 모달/시트 · FAB(fixed slot) · **가로 모드의 좌우 노치**
→ 기본 `header+content+footer` 구조를 벗어나는 화면마다 개별 확인한다

### N22. 화면마다 헤더 규격이 조금씩 다름 (OCD 주범) 🔑
**증상** 화면을 옮길 때마다 제목 위치·뒤로 버튼 크기가 미세하게 다르다
**원인** 화면마다 헤더를 손으로 만들었다
**수정** 원본의 헤더 규격을 **하나로 못 박고**(예: 패딩 4/12 · 간격 6 · 뒤로 버튼 40×40)
**공용 헤더 컴포넌트** 하나로 통일한다
🔑 실제로 54개 화면의 헤더 편차가 **공용 컴포넌트 하나**로 전부 해소됐다

### N23. 데스크탑 폭에서 모바일 화면이 늘어짐
**수정** 둘 중 하나를 **문서에 못 박는다** — ① 중앙 고정폭 셸(`max-width` + 중앙 정렬)
② 브레이크포인트별 반응형 재배치. **미결정 상태로 두지 않는다**

### N24. OS 글꼴 최대 배율에서 잘림
Ionic 도 `Text Size` 설정을 따른다. 고정 높이 컨테이너가 깨진다.
**픽셀 동일 기준은 기본 배율에만 적용**하고, 최대 배율에서는 **잘림·조작 불가 없음**만 본다.
