# 공통 디자인 시스템 규칙 (스택 무관)

> **용도 선언**
> 이 문서 세트는 **`kai-design-sync` 스킬의 references 편입용**이다.
> 스킬의 3모드(Ionic / Tailwind+PrimeNG / Tailwind+spartan)와 `01`~`03` 문서가 1:1로 대응한다.
> 스킬 규정(`CLAUDE.md`)과 이 문서가 충돌하면 **스킬 규정이 우선**한다.
> 이 문서는 스킬 규정을 대체하는 것이 아니라, 규정을 지킬 때 발생하는 실패 지점을 보완한다.

> **문서 목적**
> Claude Code Design 산출물을 프로젝트의 지속 가능한 디자인 시스템으로 옮길 때,
> 모드와 무관하게 항상 지켜야 하는 규칙과 자주 발생하는 실패 지점을 정리한다.
> 모드별 세부 사항은 `01`~`03` 문서를 함께 참조한다.

> **전제**
> - 공통: Angular 21+ / TypeScript strict
> - `01` Ionic 모드: **Tailwind 미사용.** 순수 Ionic CSS 변수 중앙 테마
> - `02` PrimeNG 모드 / `03` spartan 모드: Tailwind CSS v4 사용
>
> ⚠️ **이 문서의 Tailwind 관련 서술(§1.2.1, §3.2 등)은 `02`·`03` 모드에만 적용된다.**
> Ionic 모드에서는 해당 절을 건너뛰고 `01` 문서의 대응 절을 따른다.

> **문서 버전 주의**: 버전 의존적이거나 외부 정책에 의존하는 항목은 `[VERIFY]` 로 표시했다.
> 프로젝트 착수 시 반드시 1차 출처로 확인할 것.

---

## 1. 핵심 원칙

### 1.1 단일 진실 소스 (Single Source of Truth)

디자인 값은 **한 곳에만** 존재한다. 그 한 곳은 CSS 토큰 파일이다.

```
theme/tokens.css   ← 유일한 진실 소스
   ├→ Tailwind 유틸리티        (레이아웃, 커스텀 컴포넌트)
   ├→ 자체 UI 디렉티브/컴포넌트 (Button, Input, Card, Badge …)
   └→ 서드파티 라이브러리 테마   (PrimeNG preset / Ionic 변수 / spartan 토큰)
```

**서드파티 라이브러리가 자체 색상 팔레트를 갖고 있어도, 그것을 진실 소스로 삼지 않는다.**
반드시 내 토큰 → 라이브러리 토큰 방향으로 주입한다. 반대 방향은 금지.

### 1.2 3계층 토큰 구조

| 계층 | 이름 | 역할 | 컴포넌트에서 사용 |
|---|---|---|---|
| Tier 1 | Primitive | 원시값. 실제 색/수치가 존재하는 유일한 곳 | ❌ **금지** |
| Tier 2 | Semantic | 용도 기반 매핑. 라이트/다크가 갈리는 지점 | ✅ **여기만** |
| Tier 3 | Component | 특정 컴포넌트 전용 예외 | ⚠️ 최소한으로 |

```css
/* Tier 1 — Primitive : 컨텍스트 없음 */
--color-brand-500: oklch(0.62 0.19 250);
--color-neutral-200: oklch(0.92 0 0);

/* Tier 2 — Semantic : 컨텍스트 있음 */
--color-surface: var(--color-neutral-50);
--color-content: var(--color-neutral-900);
--color-border:  var(--color-neutral-200);
--color-accent:  var(--color-brand-600);

/* Tier 3 — Component : 예외적으로만 */
--color-table-header-bg: var(--color-neutral-100);
```

**철칙**: 컴포넌트 코드에 `bg-brand-600` 이 등장하면 실패다. `bg-accent` 만 허용한다.
이 규칙이 무너지면 중앙 테마가 아니라 색상 상수 모음이 된다.

> **강제 방법**: ESLint 커스텀 룰 또는 Stylelint 로 primitive 토큰 이름(`brand-`, `neutral-`, `red-` 등)이
> 컴포넌트 템플릿/스타일에 직접 등장하면 에러 처리. 토큰 파일만 예외 처리.

### 1.2.1 Tailwind v4 배선 — `@theme` vs `@theme inline` (모드 `02`·`03` 전용)

> Ionic 모드(`01`)는 Tailwind를 쓰지 않으므로 이 절을 건너뛴다. `01` §3(변수 브릿지)을 대신 본다.

`bg-accent` 같은 **시맨틱 유틸리티 클래스는 저절로 생기지 않는다.** Tailwind v4에서 토큰을
`@theme` 블록에 선언해야 대응 유틸리티가 생성된다. 이 배선이 없으면 §1.2의 철칙 자체가 성립하지 않는다.

**핵심 함정**: `@theme` 와 `@theme inline` 의 차이가 다크모드 동작을 가른다.

| 선언 | 유틸리티가 생성하는 CSS | 다크모드 재매핑 전파 |
|---|---|---|
| `@theme { --color-accent: var(--color-brand-600) }` | `background-color: var(--color-accent)` — 값이 `:root`에 **한 번 고정** | ❌ 전파 안 됨 |
| `@theme inline { --color-accent: var(--color-brand-600) }` | `background-color: var(--color-brand-600)` — 참조가 **인라인됨** | ✅ 전파됨 |

**규칙**:

```css
@import "tailwindcss";

/* Tier 1 — Primitive : @theme (비-inline). 실제 값이 여기 존재 */
@theme {
  --color-brand-50:    oklch(0.97 0.02 250);
  --color-brand-600:   oklch(0.55 0.19 250);
  --color-neutral-50:  oklch(0.98 0 0);
  --color-neutral-900: oklch(0.21 0 0);
  --radius-field: 0.5rem;
}

/* Tier 2 — Semantic : @theme inline (필수). 다크모드에서 재매핑되어야 하므로 */
@theme inline {
  --color-surface: var(--app-surface);
  --color-content: var(--app-content);
  --color-accent:  var(--app-accent);
  --color-border:  var(--app-border);
}

/* 실제 매핑은 일반 CSS 셀렉터에서. 여기가 라이트/다크가 갈리는 유일한 지점 */
:root {
  --app-surface: var(--color-neutral-50);
  --app-content: var(--color-neutral-900);
  --app-accent:  var(--color-brand-600);
  --app-border:  var(--color-neutral-200);
}
[data-theme="dark"] {
  --app-surface: var(--color-neutral-900);
  --app-content: var(--color-neutral-50);
  --app-border:  var(--color-neutral-700);
}
```

이 3단 구조(`@theme` primitive → `@theme inline` semantic → 일반 셀렉터 매핑)를 지키면
`bg-accent` / `text-content` / `border-border` 유틸리티가 생성되면서 다크모드도 자동으로 따라온다.

**증상별 진단**:
- `bg-accent` 클래스가 아예 없음 → `@theme` 선언 누락. 토큰 이름이 Tailwind 네임스페이스 규칙(`--color-*`, `--radius-*`, `--spacing-*` 등)을 따르는지 확인
- 유틸리티는 생성되는데 다크모드에서 안 바뀜 → `inline` 누락
- 다크모드에서 일부만 바뀜 → 일부 토큰이 `@theme` 에 값 직접 선언되어 있음

`[VERIFY]` `@theme inline` 의 정확한 전개 결과는 Tailwind 마이너 버전에 따라 달라질 수 있다.
**프로젝트 착수 시 다크 토글을 켜고 실제 렌더링으로 반드시 검증**한 뒤 이 구조를 확정할 것.

### 1.3 시맨틱 토큰 네이밍 계약

시맨틱 토큰 이름은 **디자이너와 공유하는 계약서**다. Figma 변수명과 1:1로 맞춘다.

최소 세트 (프로젝트 규모와 무관하게 이 정도는 정의할 것):

```
표면(Surface)   : surface, surface-raised, surface-sunken, surface-overlay
전경(Content)   : content, content-muted, content-subtle, content-inverse
경계(Border)    : border, border-strong, border-subtle
강조(Accent)    : accent, accent-hover, accent-active, accent-subtle, on-accent
상태(Status)    : success, warning, danger, info  (+ 각각의 -subtle, on- 쌍)
포커스          : focus-ring
반경(Radius)    : radius-field, radius-card, radius-pill
간격(Spacing)   : 필요 시 field-x, field-y, section-y 등 의미 단위
고도(Elevation) : shadow-card, shadow-overlay, shadow-popover
```

**네이밍 안티패턴**:
- ❌ `--color-blue` (색 이름 = 나중에 파란색이 아니게 되면 거짓말이 됨)
- ❌ `--color-primary-light-2` (라이브러리 팔레트 흉내. 용도 불명)
- ❌ `--color-button-blue-bg` (Tier 2에 컴포넌트명 혼입)
- ✅ `--color-accent`, `--color-content-muted`, `--color-surface-raised`

**`on-` 접두 규칙**: 배경 토큰마다 그 위에 올라가는 전경색을 쌍으로 정의한다.
`accent` / `on-accent`, `danger` / `on-danger`. 이게 없으면 대비율 사고가 반드시 난다.

### 1.4 다크모드는 Tier 2에서만 갈린다

Primitive는 그대로 두고 **매핑만** 바꾼다.

```css
:root { --color-surface: var(--color-neutral-50);  --color-content: var(--color-neutral-900); }
[data-theme="dark"] { --color-surface: var(--color-neutral-900); --color-content: var(--color-neutral-50); }
```

- 다크모드 셀렉터는 **앱 전체에서 하나**여야 한다. 서드파티 라이브러리 설정도 같은 셀렉터로 통일한다.
- `prefers-color-scheme` 만 쓰면 사용자 토글을 못 만든다. **셀렉터 기반 + 시스템 초기값 감지 + localStorage 영속**이 기본 조합.
- 다크모드에서 그림자는 거의 안 보인다. 고도 표현을 **surface 밝기 차이**로 대체하는 토큰을 따로 준비할 것.
- 이미지/일러스트/로고의 다크모드 대응도 토큰 문제다. `--logo-filter` 같은 토큰을 만들거나 자산을 2벌 준비.

---

## 2. 파사드(Facade) 계층 — 벤더 격리

### 2.1 왜 필요한가

2026년 6월 PrimeNG가 v22부터 상용 라이선스로 전환하며 GitHub 저장소를 아카이브했다 `[VERIFY: 최신 정책]`.
**서드파티 UI 라이브러리는 언제든 라이선스·유지보수 정책이 바뀔 수 있다**는 것이 전제여야 한다.

### 2.2 규칙

**교체 가능성이 있는 벤더 컴포넌트는 화면(feature) 코드에 직접 등장하지 않는다.**

```
❌ features/order/order-list.html  →  <p-table>, <hlm-date-picker>
✅ features/order/order-list.html  →  <app-data-table>, <app-date-field>
```

```
ui/
├── data-table/     ← 내부에서만 벤더 컴포넌트 사용
├── date-field/
├── autocomplete/
└── button.directive.ts   ← 자체 구현 (벤더 없음)
```

> **⚠️ 이 규칙은 무조건이 아니다.** 파사드는 "교체 비용이 큰 데이터/입력 컴포넌트"를 격리하기 위한 것이지,
> **프레임워크 자체를 격리하기 위한 것이 아니다.** 모드별 경계는 §2.3의 각주를 따른다.

### 2.3 어디까지 감쌀 것인가

| 대상 | 파사드 필요성 | 이유 |
|---|---|---|
| DataTable / DataGrid | **필수** | 교체 비용 최대. API 표면 넓음 |
| DatePicker / Calendar | **필수** | 교체 비용 큼. 로케일·타임존 로직 집중 |
| AutoComplete / Combobox | **권장** | 서버 검색 로직이 붙음 |
| Dialog / Toast / Overlay | **권장** ※1 | 서비스 형태로 감싸면 교체 쉬움 |
| Button / Input / Card / Badge | 불필요 | 자체 구현이 더 싸다 |
| 앱 셸 / 네비게이션 / 라우팅 | **금지** ※2 | 프레임워크 자체. 감싸면 손해만 남는다 |
| Layout / Grid | 불필요 | Tailwind 또는 프레임워크 레이아웃 직접 |

#### ※1·※2 — 모드별 예외 경계 (**중요**)

**`01` Ionic 모드**: Ionic은 UI 라이브러리가 아니라 **애플리케이션 프레임워크**다.
교체 대상이 아니므로 아래는 **파사드 없이 직접 사용을 허용**한다.

| 직접 사용 허용 | 파사드 대상 |
|---|---|
| 앱 셸: `ion-app`, `ion-router-outlet`, `ion-header`, `ion-content`, `ion-footer` | `ion-datetime` → `app-date-field` |
| 네비게이션: `ion-tabs`, `ion-menu`, `ion-nav`, `ion-back-button` | `ion-searchbar` + 결과 목록 → `app-autocomplete` |
| 오버레이 **프리미티브**: `ion-modal`, `ion-popover`, `ion-action-sheet` | 목록/테이블 조합 → `app-data-table` |
| 플랫폼 상호작용: `ion-refresher`, `ion-infinite-scroll`, `ion-reorder`, `ion-picker` | 오버레이 **호출**은 `overlay.service.ts` 로 감싼다 |

→ 근거: 이들은 제스처·세이프에어리어·하드웨어 백버튼·플랫폼 전환 애니메이션과 결합되어 있어
파사드로 감싸면 기능이 깨지고 얻는 것이 없다. **`01` 문서 §11의 표가 이 예외의 상세판이다.**

**`02` PrimeNG 모드 / `03` spartan 모드**: 위 표를 그대로 적용한다.
이 모드에서는 앱 셸/네비게이션을 Angular Router + 자체 레이아웃으로 구성하므로 벤더 노출이 없다.

### 2.4 파사드 설계 주의

- **벤더 타입을 밖으로 노출하지 않는다.** 파사드의 `input`/`output` 시그니처에 벤더 인터페이스가 등장하면 격리 실패다. 자체 타입을 정의하고 내부에서 변환한다.
- **벤더 이벤트 객체를 그대로 emit 하지 않는다.** `LazyLoadEvent` 같은 걸 밖으로 던지면 화면 코드가 벤더에 묶인다.
- **파사드가 얇아야 한다는 강박을 버린다.** 변환 로직이 좀 들어가도 괜찮다. 그게 격리의 대가다.
- **파사드에 벤더 고유 기능을 다 뚫어주지 않는다.** 정말 필요한 것만. 다 뚫으면 파사드가 아니라 별칭이 된다.

---

## 3. 컴포넌트 작성 패턴 (Angular)

### 3.1 래퍼 컴포넌트보다 어트리뷰트 디렉티브

```typescript
// ✅ 권장: DOM 노드 추가 없음, 네이티브 접근성·폼 동작 그대로 상속
@Directive({ selector: 'button[appButton], a[appButton]', host: { '[class]': 'classes()' } })

// ⚠️ 필요할 때만: 내부 구조가 필요한 경우 (Card, Dialog 등)
@Component({ selector: 'app-card', ... })
```

**이유**: `<app-button><button>...</button></app-button>` 구조는 DOM 깊이가 늘고,
`display: contents` 를 안 주면 레이아웃이 꼬이며, `type="submit"` 같은 네이티브 동작이 끊긴다.

### 3.2 variant 관리는 cva + tailwind-merge

```typescript
const buttonVariants = cva(
  '기본 클래스…',
  { variants: { variant: {...}, size: {...} }, defaultVariants: {...} },
);

protected readonly classes = computed(() =>
  twMerge(buttonVariants({ variant: this.variant(), size: this.size() }), this.class()),
);
```

- **`twMerge` 없이 클래스를 이어붙이면 사용처 오버라이드가 안 먹고 `!important` 지옥이 시작된다.**
- 사용처가 `class="w-full"` 같은 예외를 줄 수 있는 탈출구를 반드시 남긴다. 탈출구가 없으면 `::ng-deep` 이 나온다.
- `class` 라는 이름의 `input()` 은 네이티브 class 속성과 충돌할 수 있다. `[class]` host 바인딩과 조합 시 동작을 실제로 검증할 것. `[VERIFY]`

### 3.3 시그널 우선

- `input()` / `output()` / `model()` 사용. 데코레이터 방식 `@Input()` 은 신규 코드에 쓰지 않는다.
- 파생 클래스명은 `computed()`. `ngOnChanges` 로 계산하지 않는다.
- `ChangeDetectionStrategy.OnPush` 기본. zoneless 대응을 염두에 둔다.

### 3.4 폼 통합

자체 입력 컴포넌트는 반드시 폼에 붙을 수 있어야 한다.

- Reactive Forms → `ControlValueAccessor` 구현
- Signal Forms → `FormValueControl` 인터페이스 구현 `[VERIFY: Angular 버전별 API 안정화 상태]`
- **둘 중 무엇을 쓸지 프로젝트 착수 시 결정하고 문서에 명시한다.** 섞이면 지옥이다.
- `disabled`, `readonly`, `required`, 에러 상태(`aria-invalid`, `aria-describedby`)를 토큰과 연결된 시각 상태로 정의한다.

---

## 4. 접근성 기준선 (협상 불가)

디자인 시스템 문서에 **수치로** 박아둔다. "접근성 고려" 같은 문장은 지침이 아니다.

- **대비율**: 본문 텍스트 4.5:1 이상, 큰 텍스트(18.66px+ bold 또는 24px+) 3:1 이상, UI 컴포넌트 경계 3:1 이상
- **포커스 링**: 모든 인터랙티브 요소에 `:focus-visible` 로 보이는 링. `outline: none` 단독 사용 금지. 토큰 `--color-focus-ring` + offset 2px
- **터치 타겟**: 최소 44×44px (모바일). 시각적 크기가 작아도 히트 영역을 확보
- **키보드**: 모든 기능이 마우스 없이 도달 가능. 오버레이는 포커스 트랩 + Esc 닫기 + 닫힌 후 트리거로 포커스 복귀
- **모션**: `prefers-reduced-motion: reduce` 존중. 애니메이션 토큰에 duration 0 대체값 제공
- **색만으로 정보 전달 금지**: 에러는 색 + 아이콘 + 텍스트

---

## 5. 한글 프로젝트 특유의 주의사항

자주 누락되는 항목이다. 디자인 시스템 문서에 명시할 것.

### 5.1 타이포그래피

```css
:root {
  --font-sans: Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont,
               system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo',
               'Noto Sans KR', 'Malgun Gothic', sans-serif;
}
```

- **줄바꿈**: `word-break: keep-all` 을 본문 기본값으로. 없으면 단어 중간에서 잘린다.
  긴 URL·영문 대응으로 `overflow-wrap: anywhere` 를 함께 고려.
- **행간**: 한글은 라틴보다 넉넉해야 한다. 본문 `line-height: 1.6~1.7`. Tailwind 기본 `leading-normal`(1.5)은 한글에 빡빡하다.
- **자간**: 한글 본문은 `letter-spacing: -0.01em ~ -0.02em` 이 일반적. 영문 위주 디자인 값을 그대로 쓰지 않는다.
- **폰트 크기**: 같은 px에서 한글이 시각적으로 더 크게 보인다. 라틴 기준 타입 스케일을 그대로 쓰면 커 보인다.
- **폰트 로딩**: 한글 웹폰트는 용량이 크다. subset + `font-display: swap` + preload 전략을 토큰 문서에 포함.

### 5.2 IME (한글 입력) — **가장 자주 빠지는 항목**

자체 구현하는 모든 텍스트 입력(특히 실시간 검색·자동완성)에서:

- `compositionstart` / `compositionend` 이벤트를 처리하지 않으면 **"ㄱㅏㅁ" 같은 조합 중간 상태로 검색 요청이 나간다.**
- Enter 키 처리: IME 조합 확정 Enter와 제출 Enter가 구분되어야 한다. `event.isComposing` 확인 필수.
- 디바운스만으로 해결되지 않는다. 조합 상태 자체를 봐야 한다.
- **자체 AutoComplete/Combobox를 만든다면 이건 필수 테스트 케이스다.**

### 5.3 기타

- 날짜/시간: `Asia/Seoul` 기준. `new Date()` 직접 조작 금지, 라이브러리(date-fns-tz / Temporal) 사용
- 숫자: 천단위 구분, 원화 표기(`₩` vs `원`) 규칙을 토큰/파이프로 통일
- 이름 필드: 성/이름 분리 여부, 최소 길이 1자 허용 (영문 기준 2자 이상 검증이 들어가면 안 됨)
- 주소: 도로명/지번, 우편번호 검색 팝업 → 오버레이 시스템과 통합 필요

---

## 6. 안티패턴 (발견 즉시 리뷰에서 차단)

| 안티패턴 | 왜 문제인가 | 대안 |
|---|---|---|
| `::ng-deep` | 스코프를 뚫고 전역 오염. 라이브러리 내부 구조 변경 시 전부 깨짐 | 라이브러리가 제공하는 토큰/CSS 변수/part API |
| `!important` | 특이성 전쟁의 시작. 한 번 쓰면 확산됨 | `tailwind-merge` 로 클래스 병합(`02`·`03`), 레이어/변수 우선순위 정리 |
| 컴포넌트에서 primitive 토큰 직접 사용 | 다크모드/리브랜딩 시 전수 수정 | semantic 토큰 |
| `@apply` 남용 〔`02`·`03`〕 | Tailwind의 장점을 버리고 CSS 파일만 비대해짐 | cva variants. `@apply` 는 3~4개 클래스의 진짜 반복에만 |
| 매직 넘버 (`mt-[13px]`, `margin: 13px`) | 스케일 붕괴 | 간격 스케일 토큰. 정말 필요하면 Tier 3 토큰으로 승격 |
| 인라인 style 바인딩으로 색 지정 | 다크모드 불가, CSP 이슈 | 클래스 + CSS 변수 |
| **파사드 대상** 라이브러리 컴포넌트를 화면에서 직접 사용 | 벤더 락인 | 파사드 (**§2.3 예외 목록 확인 후 적용**) |
| 컴포넌트별 로컬 색상 정의 | 진실 소스 분산 | 토큰 파일로 승격 |
| 접근성을 "나중에" | 나중은 오지 않음 | 기준선을 컴포넌트 정의에 포함 |

---

## 7. 산출물 체크리스트

디자인 시스템 문서/코드가 완성되었다고 말하려면 아래가 모두 있어야 한다.

### 토큰
- [ ] Primitive 팔레트 (색상 스케일, 간격, 반경, 그림자, 타이포)
- [ ] Semantic 매핑 (라이트)
- [ ] Semantic 매핑 (다크)
- [ ] 상태 색상 + `on-` 전경색 쌍
- [ ] 포커스 링 토큰
- [ ] 모션 토큰 (duration, easing) + reduced-motion 대체값
- [ ] z-index 스케일 토큰 (오버레이 계층: dropdown < sticky < modal < toast)
- [ ] 〔`02`·`03`〕 primitive = `@theme`, semantic = `@theme inline`, 매핑 = 일반 셀렉터 (§1.2.1)
- [ ] 〔`02`·`03`〕 시맨틱 유틸리티(`bg-accent` 등)가 실제로 생성되는지 확인
- [ ] 〔`02`·`03`〕 다크 토글 시 시맨틱 유틸리티가 따라 바뀌는지 **실제 렌더링으로** 확인

### 컴포넌트
- [ ] 각 컴포넌트의 variant / size / state 매트릭스
- [ ] 상태 정의: default / hover / active / focus-visible / disabled / loading / error
- [ ] 반응형 동작 규칙
- [ ] 접근성 요구사항 (역할, ARIA, 키보드 조작)
- [ ] 사용 예시 코드 + **하지 말아야 할 예시**

### 문서
- [ ] 토큰 → Tailwind 유틸리티 매핑 표
- [ ] 토큰 → 서드파티 라이브러리 브릿지 방법 (스택별 문서 참조)
- [ ] 파사드 대상 목록과 이유
- [ ] 안티패턴 목록
- [ ] 신규 컴포넌트 추가 절차 (누가, 어떤 기준으로 승인)
- [ ] 버전 업그레이드 시 확인 사항

### 강제 장치
- [ ] Lint 룰 (primitive 토큰 직접 사용 차단, `::ng-deep` 차단)
- [ ] 대비율 자동 검사 (CI)
- [ ] 시각 회귀 테스트 또는 Storybook 스냅샷 `[선택]`

---

## 8. 스킬 산출 시 확인할 질문

디자인 시스템 문서를 생성할 때, 아래가 입력에서 확정되지 않았다면 **추정하지 말고 물어본다.**

1. 다크모드 지원 여부와 토글 방식 (시스템 따름 / 사용자 선택 / 둘 다)
2. 지원 최소 화면폭과 브레이크포인트 (모바일 웹 포함 여부)
3. 폼 API (Reactive Forms / Signal Forms)
4. 접근성 준수 목표 (WCAG 2.1 AA 등) — 공공/금융이면 법적 요구사항 확인
5. 다국어 여부 (한국어 전용인지, RTL 가능성 있는지)
6. 서드파티 라이브러리 선택과 그 버전
7. 브랜드 자산 유무 (기존 컬러/폰트 가이드 존재 여부)
8. 디자이너 협업 방식 (Figma 변수 동기화 필요 여부)
