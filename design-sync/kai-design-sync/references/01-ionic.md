# Ionic (순수) — 모드별 주의사항

> **용도 선언**
> `kai-design-sync` 스킬 **Ionic 모드** references 편입용.
> 스킬 규정(`CLAUDE.md`)과 충돌 시 **스킬 규정이 우선**한다.

> **모드 전제 (중요)**
> - **Tailwind CSS 를 설치하지도, 사용하지도 않는다.**
> - **PrimeNG 를 설치하지도, 사용하지도 않는다.**
> - 중앙 테마는 **Ionic CSS 변수 체계**로 구성한다.
> - `00` 문서의 Tailwind 관련 절(§1.2.1 `@theme` 배선, §3.2 cva/tailwind-merge)은 **적용하지 않는다.**
>   그 외(3계층 토큰 개념, 파사드, 접근성 기준선, 한글 IME/타이포)는 그대로 적용한다.

> **가장 중요한 한 줄**
> Ionic 컴포넌트는 Shadow DOM으로 캡슐화되어 있다. **외부 CSS는 내부에 닿지 않는다.**
> 중앙 테마의 전달 경로는 오직 **CSS 변수**다.

`[VERIFY]` 표시 항목은 프로젝트의 실제 Ionic / Angular 버전 문서로 확인할 것.

---

## 1. 구조 이해 — 왜 CSS 변수여야 하는가

Ionic 컴포넌트는 Angular 컴포넌트가 아니라 **웹 컴포넌트**다.
Shadow DOM 명세를 따라 스타일과 마크업을 캡슐화하므로, 외부에서 작성한 CSS 규칙은 내부 요소에 도달하지 못한다.

**Ionic 컴포넌트는 셋 중 하나다** — Shadow / Scoped / Light DOM.
공식 문서의 컴포넌트 페이지 우상단 배지로 표시된다. **커스터마이징 전에 반드시 이 배지를 확인한다.**

| 유형 | 외부 CSS 도달 | 커스터마이징 방법 |
|---|---|---|
| **Shadow** (`ion-button` 등) | ❌ 내부 불가 | CSS 변수 → `::part()` 순 |
| **Scoped** (오버레이·입력 계열 다수) | ⚠️ 자식 요소 직접 타겟 가능 | CSS 변수 우선. 클래스는 가능하나 취약 |
| **Light DOM** | ✅ 가능 | 일반 CSS |

> 문서화된 `part` 가 없는 컴포넌트도 많다. 특히 **구조적(structural) 내부 요소는 커스터마이징을
> 권장하지 않는다** — 예기치 않은 결과가 발생한다. `ion-title` 의 내부 요소가 대표적이다.

**결론**: `::ng-deep` 은 Shadow 경계를 뚫지 못한다. Angular의 스타일 스코프 우회 기능일 뿐
브라우저의 Shadow 경계와는 다른 차원이다. **작동하는 것처럼 보였다면 그건 Scoped 컴포넌트였을 뿐이다.**

---

## 2. 중앙 테마 파일 구조

Tailwind가 없으므로 **모든 것이 CSS 변수 계층**으로 표현된다. `00` 문서의 3계층을 그대로 구현한다.

```
src/theme/
├── _primitive.css      # Tier 1 — 원시 팔레트. 실제 색값이 존재하는 유일한 곳
├── _semantic.css       # Tier 2 — 용도 기반. 라이트/다크가 갈리는 지점
├── _ionic-bridge.css   # Ionic 변수(--ion-*)로 주입 ★ 이 모드의 핵심
├── _utilities.css      # 자체 유틸리티 클래스 (최소한)
└── variables.css       # 위를 import
```

```css
/* _primitive.css — Tier 1 */
:root {
  --p-brand-50:  #eff6ff;
  --p-brand-500: #3b82f6;
  --p-brand-600: #2563eb;
  --p-brand-700: #1d4ed8;
  --p-gray-50:   #f9fafb;
  --p-gray-200:  #e5e7eb;
  --p-gray-500:  #6b7280;
  --p-gray-700:  #374151;
  --p-gray-800:  #1f2937;
  --p-gray-900:  #111827;
  --p-red-600:   #dc2626;

  --p-radius-field: 8px;
  --p-space-2: 8px;
  --p-space-4: 16px;
}

/* _semantic.css — Tier 2 */
:root {
  --app-surface:       var(--p-gray-50);
  --app-surface-card:  #ffffff;
  --app-content:       var(--p-gray-900);
  --app-content-muted: var(--p-gray-500);
  --app-border:        var(--p-gray-200);
  --app-accent:        var(--p-brand-600);
  --app-accent-hover:  var(--p-brand-700);
  --app-accent-subtle: var(--p-brand-50);
  --app-on-accent:     #ffffff;
  --app-danger:        var(--p-red-600);
  --app-on-danger:     #ffffff;
  --app-focus-ring:    var(--p-brand-500);
}
```

**Tier 1 에는 `oklch()` 대신 hex 사용을 권장한다.** 이유는 §4의 `-rgb` 계약 때문이다.

---

## 3. Ionic 변수 브릿지 — 이 모드의 핵심 작업

`_ionic-bridge.css` 에서 **내 시맨틱 토큰 → Ionic 변수** 방향으로만 주입한다. 반대 방향 금지.

```css
/* _ionic-bridge.css */
:root {
  /* 전역 표면·전경 */
  --ion-background-color:     var(--app-surface);
  --ion-background-color-rgb: 249, 250, 251;   /* ⚠️ §4 참조 */
  --ion-text-color:           var(--app-content);
  --ion-text-color-rgb:       17, 24, 39;      /* ⚠️ */
  --ion-border-color:         var(--app-border);

  /* 컴포넌트 계열 전역 변수 */
  --ion-card-background:      var(--app-surface-card);
  --ion-item-background:      var(--app-surface-card);
  --ion-toolbar-background:   var(--app-surface-card);
  --ion-tab-bar-background:   var(--app-surface-card);
}
```

`[VERIFY]` 사용 가능한 전역 `--ion-*` 변수의 전체 목록은 버전 문서의 Theming 섹션으로 확인.

### 컴포넌트 단위 미세 조정

```css
ion-button {
  --background:           var(--app-accent);
  --background-hover:     var(--app-accent-hover);
  --background-activated: var(--app-accent-hover);
  --color:                var(--app-on-accent);
  --border-radius:        var(--p-radius-field);
  --padding-start:        var(--p-space-4);
  --padding-end:          var(--p-space-4);
}
```

**컴포넌트별 CSS 변수 이름은 컴포넌트마다 다르다.** 각 컴포넌트 문서의 "CSS Custom Properties" 표를
확인하고, **프로젝트에서 실제로 사용하는 변수 목록을 디자인 시스템 문서에 기록**한다.
버전 업그레이드 시 대조할 근거가 된다.

---

## 4. `--ion-color-*` 6종 세트 계약

`color="primary"` 속성이 동작하려면 **하나의 색마다 6개 변수가 모두** 있어야 한다.
하나라도 빠지면 hover/active 상태나 대비 텍스트가 조용히 깨진다.

```css
:root {
  --ion-color-primary:              var(--app-accent);
  --ion-color-primary-rgb:          37, 99, 235;      /* ⚠️ 숫자 3개. 변수 참조 불가 */
  --ion-color-primary-contrast:     var(--app-on-accent);
  --ion-color-primary-contrast-rgb: 255, 255, 255;    /* ⚠️ */
  --ion-color-primary-shade:        var(--app-accent-hover);
  --ion-color-primary-tint:         var(--app-accent-subtle);
}
```

### `-rgb` 함정 (가장 자주 깨지는 지점)

`-rgb` 변수는 Ionic 내부에서 `rgba(var(--ion-color-primary-rgb), 0.2)` 형태로 사용된다.
따라서 **콤마로 구분된 숫자 문자열**이어야 하고, `var(...)` 참조나 hex/`oklch()` 를 넣으면
**에러 없이 조용히 깨진다** (ripple, 하이라이트, 반투명 배경이 사라짐).

**대응 (셋 중 택일, 문서에 명시)**:

| 방법 | 내용 | 평가 |
|---|---|---|
| A. 수동 병기 | primitive 정의 시 hex와 rgb 숫자를 함께 적어둠 | 소규모면 충분. 동기화 누락 위험 |
| B. 빌드 스크립트 생성 | 팔레트 원본(JSON/TS)에서 CSS 생성 | **권장.** 어긋날 수 없음 |
| C. Ionic Color Generator | 공식 생성기로 6종 세트를 만들고 그것을 진실 소스로 | 진실 소스가 밖으로 나감. 비권장 |

> 이 이중 관리를 디자인 시스템 문서에 명시하지 않으면 **반드시** 어긋난다.
> 브랜드 색이 바뀌었는데 ripple 색만 예전 색으로 남아있는 상태가 전형적인 증상이다.

### 정의해야 할 색 목록

`primary, secondary, tertiary, success, warning, danger, light, medium, dark`
프로젝트에서 안 쓰는 색이라도 **Ionic 내부 컴포넌트가 참조**하므로 전부 정의하는 편이 안전하다.

---

## 5. Step 색상 — Ionic 8에서 재편됨 ⚠️

**Ionic 8부터 텍스트용과 배경용 step 토큰이 분리되었다.** 고대비 팔레트 지원을 위한 변경이다.
Ionic 7 이하의 `--ion-color-step-[number]` 단일 세트를 그대로 쓰면 안 된다.

### 마이그레이션 규칙

| 용도 | 구 (v7 이하) | 신 (v8+) | 숫자 변환 |
|---|---|---|---|
| 배경색 | `--ion-color-step-400` | `--ion-background-color-step-400` | 그대로 |
| 텍스트색 | `--ion-color-step-400` | `--ion-text-color-step-600` | **1000 − n** |

```css
/* ❌ 구세대 — 신규 프로젝트에서 쓰지 않는다 */
.card { background: var(--ion-color-step-50); }

/* ✅ Ionic 8+ */
.card {
  background: var(--ion-background-color-step-50);
  color:      var(--ion-text-color-step-50);
}
```

### 함정 1 — 구 토큰이 우선순위를 가짐

Ionic 내부 테마 소스는 `var(--ion-color-step-50, var(--ion-background-color-step-50, …))` 형태의
폴백 체인을 쓴다. 즉 **구 토큰이 정의되어 있으면 신 토큰보다 우선 적용된다.**

→ **레거시 코드나 옛날 블로그에서 복사한 `--ion-color-step-*` 정의가 남아있으면
신 토큰 설정이 통째로 무시된다.** 착수 시 전역 검색으로 구 토큰 정의를 **0건**으로 만들 것.

### 함정 2 — 라이트 모드에서 미정의 `[VERIFY]`

다크 팔레트를 임포트하면 step 토큰이 함께 정의되지만, **라이트 모드에서는 정의되지 않아
`var()` 폴백이 흰색으로 떨어지는 현상**이 보고되어 있다.

→ **라이트/다크 양쪽에서 step 토큰을 명시적으로 정의**하거나, step 토큰에 의존하지 않고
내 시맨틱 토큰(`--app-surface-raised` 등)을 직접 쓰는 편이 안전하다.
**후자를 권장한다** — 진실 소스가 내 토큰에 남는다.

```css
/* 권장: step 의존 대신 내 토큰 직접 사용 */
ion-card { --background: var(--app-surface-card); }
```

---

## 6. 다크 팔레트

- Ionic 8은 다크 팔레트를 **클래스/미디어쿼리 방식으로 선택 임포트**한다 `[VERIFY: 정확한 클래스명·임포트 경로]`
- **`00` 문서의 앱 전역 다크 셀렉터와 반드시 일치시킨다.** 두 개의 다크 스위치가 존재하면
  Ionic 컴포넌트만 다크로 남거나 그 반대가 되는 상태가 발생한다

**권장 접근**: Ionic 다크 팔레트 CSS를 임포트하지 않고, **`--ion-*` 변수를 내 다크 토큰에 직접 매핑**한다.
통제하기 쉽고 진실 소스가 하나로 유지된다.

```css
[data-theme="dark"] {
  --app-surface:      var(--p-gray-900);
  --app-surface-card: var(--p-gray-800);
  --app-content:      var(--p-gray-50);
  --app-border:       var(--p-gray-700);
  /* --ion-* 는 --app-* 를 참조하므로 자동으로 따라온다 */

  /* -rgb 계열만 별도 갱신 필요 */
  --ion-background-color-rgb: 17, 24, 39;
  --ion-text-color-rgb:       249, 250, 251;
}
```

- 다크 전환 시 **네이티브 상태바/스플래시 색도 바꿔야 한다** (Capacitor `StatusBar`).
  웹만 바뀌고 상태바가 흰색으로 남는 것은 매우 흔한 미완성 상태다.
- 다크에서 그림자는 거의 안 보인다. 고도는 `--app-surface-card` 밝기 차이로 표현한다.

---

## 7. 플랫폼 모드 (iOS / Material) — 디자인 시스템 최대 변수

Ionic 컴포넌트는 **플랫폼에 따라 디자인이 달라진다.** 같은 `<ion-button>` 이 iOS와 Android에서
다른 반경·높이·폰트·전환 애니메이션을 갖는다.

**착수 시 반드시 결정하고 문서에 명시**:

| 선택 | 결과 | 적합한 경우 |
|---|---|---|
| **모드 고정** (`mode: 'md'` 등) | 전 플랫폼 동일 외관. 토큰 1벌 | 브랜드 일관성 우선, 웹 병행 |
| **플랫폼 적응 허용** | 각 OS 네이티브 느낌. **토큰 2벌 필요** | 네이티브 앱 경험 우선 |

```typescript
provideIonicAngular({ mode: 'md' })
```

**"iOS에서만 버튼이 이상하다"는 버그의 대부분이 이 결정을 안 한 결과다.**

`[VERIFY]` Ionic 8에서 iOS 디자인이 개정되었다. 기존 디자인 시안이 구버전 iOS 스타일 기준이면
어긋나므로, 착수 시 실제 렌더링과 대조할 것.

---

## 8. 커스터마이징 우선순위 (위에서부터 시도)

1. **전역 `--ion-*` 변수** — `_ionic-bridge.css`. 대부분 여기서 해결
2. **컴포넌트 CSS 변수** — `ion-button { --background: … }`
3. **`::part()`** — CSS 변수가 없는 속성에 한해
4. **Scoped 컴포넌트의 자식 선택자** — 취약하므로 최소한
5. ~~`::ng-deep`~~ — **금지 (Shadow 경계에서 어차피 무효)**

```css
/* 3번 예시 */
ion-select::part(icon) { opacity: 1; color: var(--app-content-muted); }
```

- `::part()` 안에서 자식 선택자 조합(`::part(x) > y`)은 동작하지 않는다
- `part` 가 노출되지 않은 요소는 건드릴 방법이 없다. **디자인을 바꾸라는 신호**로 받아들인다
- **사용한 `::part()` 목록을 문서화**한다. 버전 업그레이드 시 대조 근거

---

## 9. 유틸리티 클래스 정책 (Tailwind 없음)

Tailwind가 없으므로 여백·정렬을 어떻게 표현할지 **정책을 정하고 문서화**해야 한다.
정하지 않으면 화면마다 인라인 스타일과 일회용 클래스가 난립한다.

### 선택지

| 방식 | 내용 | 평가 |
|---|---|---|
| A. Ionic 기본 유틸리티 | `ion-padding`, `ion-margin`, `ion-text-center`, `ion-hide-*` 등 (선택 임포트 CSS) | 스케일이 거칠다. 단독으로는 부족 |
| B. 자체 최소 유틸리티 | 토큰 기반으로 20~30개만 직접 정의 | **권장.** A와 병용 |
| C. 유틸리티 없이 컴포넌트 CSS만 | 모든 여백을 컴포넌트 스타일로 | 재사용 낮고 반복 많음 |

```css
/* _utilities.css — B 방식 최소 세트 예 */
.u-stack-2 > * + * { margin-block-start: var(--p-space-2); }
.u-stack-4 > * + * { margin-block-start: var(--p-space-4); }
.u-row      { display: flex; align-items: center; gap: var(--p-space-2); }
.u-grow     { flex: 1 1 auto; }
.u-muted    { color: var(--app-content-muted); }
.u-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

**규칙**: 유틸리티는 **토큰만 참조**한다. `margin: 13px` 같은 매직 넘버가 들어가는 순간 스케일이 붕괴한다.
유틸리티 목록은 디자인 시스템 문서에 **전량 나열**하고, 추가 시 승인 절차를 둔다.

---

## 10. 레이아웃 함정

### 10.1 `ion-content` 스크롤

**하지 말 것**:
- `ion-content` 를 감싸는 요소에 `height: 100vh; overflow: auto` — Ionic이 자체 스크롤 컨테이너를 갖는다. 이중 스크롤
- `ion-content` 에 일반 `padding` — `--padding-start/end/top/bottom` CSS 변수를 쓸 것
- `100vh` 사용 — 모바일 브라우저 주소창 때문에 깨진다. `100dvh` 또는 Ionic 레이아웃에 위임

### 10.2 그리드

Tailwind가 없으므로 **`ion-grid` / `ion-row` / `ion-col` 을 정식 레이아웃 수단으로 채택**하거나,
자체 CSS Grid/Flex 유틸리티를 쓰거나 **하나로 통일**한다. 섞으면 브레이크포인트가 두 벌이 된다.

`ion-grid` 채택 시 반응형 브레이크포인트는 Ionic 것을 따르게 되므로,
**디자인 시안의 브레이크포인트를 Ionic 기준에 맞춰 그리도록** 디자이너와 합의한다. `[VERIFY: 브레이크포인트 값]`

### 10.3 세이프 에어리어

```css
.custom-sheet {
  padding-top:    var(--ion-safe-area-top);
  padding-bottom: var(--ion-safe-area-bottom);
  padding-left:   var(--ion-safe-area-left);   /* 가로 모드 */
  padding-right:  var(--ion-safe-area-right);
}
```

커스텀 오버레이/시트를 직접 만들 때 **가장 자주 빠지는 항목**이다.
Ionic 표준 오버레이(`ion-modal` 등)를 쓰면 자동 처리되므로, 그것이 직접 사용을 허용하는 이유이기도 하다.

---

## 11. 파사드 경계 (`00` §2.3 예외 적용)

**Ionic은 UI 라이브러리가 아니라 애플리케이션 프레임워크다.** 교체 대상이 아니므로
`00` 문서의 "화면 코드에 벤더 태그 금지" 규칙을 **전면 적용하지 않는다.**

### 직접 사용 허용 (파사드 금지)

| 분류 | 컴포넌트 | 이유 |
|---|---|---|
| 앱 셸 | `ion-app`, `ion-router-outlet`, `ion-header`, `ion-content`, `ion-footer`, `ion-toolbar`, `ion-title` | 프레임워크 구조 |
| 네비게이션 | `ion-tabs`, `ion-menu`, `ion-nav`, `ion-back-button`, `ion-breadcrumbs` | 라우팅·제스처·플랫폼 전환 결합 |
| 오버레이 프리미티브 | `ion-modal`, `ion-popover`, `ion-action-sheet`, `ion-alert`, `ion-toast`, `ion-loading` | 세이프에어리어·백드롭·하드웨어 백버튼 처리 |
| 플랫폼 상호작용 | `ion-refresher`, `ion-infinite-scroll`, `ion-reorder`, `ion-picker` | 터치 물리 구현. 감싸면 깨진다 |

> 구 `ion-slides` 는 **Ionic 7에서 제거**되었다 — 슬라이드/캐러셀이 필요하면 Swiper 등
> 별도 라이브러리를 직접 채택하고, 그 채택 결정을 디자인 시스템 문서에 기록한다.

### 파사드 대상

| 대상 | 파사드 | 이유 |
|---|---|---|
| `ion-datetime` | `app-date-field` | 타임존·로케일·포맷 로직 집중 |
| `ion-searchbar` + 결과 목록 | `app-autocomplete` | 서버 검색·IME 처리 집중 (§13) |
| `ion-list` + `ion-item` 조합 | `app-data-list` | 반복 패턴. 정렬/페이징 로직 |
| 오버레이 **호출부** | `overlay.service.ts` | 컴포넌트가 아니라 **호출 방식**을 감싼다 |

> **핵심 구분**: 오버레이 **컴포넌트**(`ion-modal`)는 직접 쓰되,
> `ModalController.create({...})` 호출은 서비스로 감싼다. 옵션 기본값(백드롭, 브레이크포인트,
> 세이프에어리어, 애니메이션)을 한 곳에서 통제하기 위함이다.

### `ion-item` / `ion-list` 주의

커스터마이징 난이도가 높은 대표 컴포넌트다. 디자인 시안이 `ion-item` 의 기본 구조
(start/end 슬롯, 구분선, 고정 높이)와 크게 다르면 **Ionic을 억지로 맞추는 것보다
`<div>` + 자체 CSS로 새로 만드는 게 싸다.** 이 판단을 시안 확정 전에 해둘 것.

---

## 12. 자체 컴포넌트 작성 패턴 (Tailwind 없음)

`00` §3.2의 cva + tailwind-merge 패턴은 **이 모드에서 적용하지 않는다.**
대신 **데이터 속성 + CSS 변수** 방식으로 variant를 구현한다.

```typescript
@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'app-badge',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
  },
  template: `<ng-content />`,
  styleUrl: './badge.component.css',
})
export class BadgeComponent {
  readonly variant = input<'neutral' | 'accent' | 'success' | 'danger'>('neutral');
  readonly size = input<'sm' | 'md'>('md');
}
```

```css
/* badge.component.css */
.app-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--badge-bg);
  color: var(--badge-fg);
  padding-inline: var(--badge-pad-x);
  font-size: var(--badge-font-size);
}

.app-badge[data-variant="neutral"] { --badge-bg: var(--app-surface);  --badge-fg: var(--app-content-muted); }
.app-badge[data-variant="accent"]  { --badge-bg: var(--app-accent);   --badge-fg: var(--app-on-accent); }
.app-badge[data-variant="danger"]  { --badge-bg: var(--app-danger);   --badge-fg: var(--app-on-danger); }

.app-badge[data-size="sm"] { --badge-pad-x: var(--p-space-2); --badge-font-size: 12px; }
.app-badge[data-size="md"] { --badge-pad-x: var(--p-space-4); --badge-font-size: 14px; }
```

**장점**: variant 조합이 CSS 특이성 충돌 없이 처리되고, 사용처에서
`--badge-bg` 를 덮어쓰는 탈출구가 자연스럽게 열린다 (`!important` 불필요).

**규칙**:
- variant 값은 **CSS 변수 매핑만** 담당한다. 구조 CSS를 variant마다 다시 쓰지 않는다
- 컴포넌트 로컬 변수(`--badge-*`)는 반드시 **시맨틱 토큰(`--app-*`)만** 참조한다. primitive 직접 참조 금지
- `ViewEncapsulation.None` 을 쓰지 않는다. 전역 오염된다

### 폼 통합

자체 입력 컴포넌트는 `ControlValueAccessor`(Reactive Forms) 또는 `FormValueControl`(Signal Forms)를
구현한다. **둘 중 무엇을 쓸지 착수 시 결정하고 문서에 명시**한다 `[VERIFY: Angular 버전별 Signal Forms 안정화 상태]`.

---

## 13. 한글 IME — `ion-searchbar` / `ion-input`

`00` §5.2의 내용이 이 모드에서 특히 중요하다. **Ionic 입력 컴포넌트는 Shadow DOM 내부에 실제
`<input>` 이 있어서, 이벤트 처리 방식이 일반 input과 다를 수 있다.**

- `ionInput` / `ionChange` 이벤트가 IME 조합 중간 상태를 어떻게 다루는지 **실제 기기에서 검증**한다 `[VERIFY]`
- 실시간 검색은 디바운스만으로 부족하다. `compositionstart`/`compositionend` 또는 `isComposing` 확인 필요
- Shadow DOM 안의 native input에 리스너를 붙여야 할 수도 있다 — 이 경우 **파사드(`app-autocomplete`) 안에
  가둬서 한 번만 해결**한다. 화면마다 반복하면 반드시 누락된다
- Android 키보드와 iOS 키보드의 조합 이벤트 동작이 다르다. **양쪽 실기기 검증 필수**

---

## 14. 네이티브(Capacitor) 연계

- **상태바 색상/스타일**: 다크모드 토큰과 연동. 전환 시 함께 갱신
- **스플래시 스크린**: 브랜드 색 토큰과 일치해야 함. 별도 자산이라 토큰 변경 시 누락되기 쉬움
- **키보드**: `keyboardResize` 정책에 따라 레이아웃이 밀린다. 폼 화면 설계 시 결정
- **하드웨어 백버튼(Android)**: 커스텀 오버레이를 직접 만들었다면 백버튼 처리를 직접 등록
- **앱 아이콘/스플래시 다크 변형**: 지원 여부 결정
- **웹 병행 배포 시**: 웹에는 세이프 에어리어가 없고 네이티브 제스처도 없다. 양쪽 검증

---

## 15. 체크리스트

### 모드 전제
- [ ] Tailwind 미설치 확인 (`package.json` 에 `tailwindcss` 0건)
- [ ] PrimeNG 미설치 확인
- [ ] `00` 문서의 Tailwind 절(§1.2.1, §3.2)을 적용하지 않았음

### 토큰 브릿지
- [ ] `_primitive.css` / `_semantic.css` / `_ionic-bridge.css` 분리
- [ ] `--ion-color-*` 6종 세트가 `primary~dark` 전체 색에 대해 정의됨
- [ ] `-rgb` 숫자값 생성/동기화 방법 결정 및 문서화 (A/B/C 중 택일)
- [ ] `--ion-background-color`, `--ion-text-color`, `--ion-border-color` 매핑
- [ ] **구세대 `--ion-color-step-*` 정의 0건** (전역 검색으로 확인)
- [ ] step 토큰을 쓴다면 라이트/다크 양쪽에서 정의됨 (또는 미사용 결정 기록)

### 결정 사항 명시
- [ ] 플랫폼 모드 고정 여부 (`md` / `ios` / 적응형)
- [ ] 레이아웃 수단 (`ion-grid` vs 자체 유틸리티) — 하나 선택
- [ ] 유틸리티 클래스 정책 (A/B/C) 및 전체 목록
- [ ] **폼 API (Reactive Forms / Signal Forms)** ← `00` §3.4
- [ ] 다크모드 방식 (Ionic 팔레트 임포트 vs 변수 직접 매핑)
- [ ] 파사드 대상 목록 (§11 표 기준으로 프로젝트 확정본 작성)

### 커스터마이징
- [ ] `::ng-deep` **0건**
- [ ] `!important` 0건 (또는 사유와 함께 목록화)
- [ ] 사용한 `::part()` 목록 문서화
- [ ] 사용한 컴포넌트 CSS 변수 목록 문서화
- [ ] 자체 컴포넌트가 primitive 토큰을 직접 참조하는 사례 0건

### 모바일
- [ ] 세이프 에어리어 처리 (상/하 + 가로 모드 좌/우)
- [ ] `100vh` 사용 0건
- [ ] 터치 타겟 44×44px 이상
- [ ] 키보드 노출 시 레이아웃 정책
- [ ] 상태바/스플래시 색상이 토큰과 연동

### 검증
- [ ] `[VERIFY]` Ionic ↔ Angular 21+ 지원 매트릭스 확인
- [ ] iOS 실기기 + Android 실기기 렌더링 대조 (모드 고정했어도)
- [ ] 다크 전환 시 Ionic 컴포넌트 + 자체 컴포넌트 + 네이티브 상태바 동시 전환
- [ ] **한글 IME 실기기 검증** (`ion-searchbar` 실시간 검색, iOS·Android 양쪽)
- [ ] 대비율 검사 (Ionic 기본 색이 남아있으면 여기서 걸린다)
- [ ] 키보드 전용 조작 + 스크린리더(VoiceOver/TalkBack)
