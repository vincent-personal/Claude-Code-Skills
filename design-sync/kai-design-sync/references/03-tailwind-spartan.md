# Tailwind CSS + spartan/ui — 모드별 주의사항

> **용도 선언**
> `kai-design-sync` 스킬 **Tailwind + spartan/ui 모드** references 편입용.
> 스킬 규정(`CLAUDE.md`)과 충돌 시 **스킬 규정이 우선**한다.
>
> **기본 전략 = 스킬 규정을 따른다: shadcn식 `:root` / `.dark` 변수 매핑, 전체 색값 형식.**
> 즉 §2의 **방법 B**가 이 모드의 기본값이다. 방법 A는 스킬 밖 범용 프로젝트용 대안으로만 남긴다.

> `00-common-design-system-rules.md` 를 먼저 적용한 뒤 이 문서를 함께 본다.
> `00` §1.2.1 (Tailwind v4 `@theme` 배선)이 이 모드의 전제다.

> **가장 중요한 세 줄**
> 1. helm 코드는 **복사되어 내 코드가 된다.** 업그레이드가 자동으로 오지 않는다 — 정책이 필요하다.
> 2. 토큰은 **전체 색값**으로 적는다. 구버전 shadcn의 **HSL 성분 삼중값 방식과 절대 혼용하지 않는다** (§2.0).
> 3. Data Table은 TanStack 기반이라 **배선을 직접 해야 한다.** 일정을 따로 잡는다.

`[VERIFY]` 표시 항목은 프로젝트의 실제 spartan/Angular 버전 문서로 확인할 것.

---

## 0. 구조 이해 — brain / helm 분리

spartan/ui는 shadcn/ui 철학을 Angular로 옮긴 라이브러리다. Radix에서 영감을 받아 Angular CDK 위에
접근성 있는 언스타일드 프리미티브를 만들고, 거기에 shadcn 스타일을 얹는 구조다.

| 레이어 | 배포 방식 | 소유권 | 역할 |
|---|---|---|---|
| **Brain** (`@spartan-ng/brain`) | npm 패키지 | 라이브러리 | 동작, 접근성, 상태 |
| **Helm** (`@spartan-ng/helm`) | **CLI가 내 프로젝트로 복사** | **내 코드** | Tailwind 스타일 |

> 라이브러리 상태: 2023년 8월 첫 30개 프리미티브로 시작해 **2026년 6월 1.0 릴리스**.
> 55개 이상 컴포넌트, 시그널 기반, zoneless 대응, SSR 호환. MIT.

### 이 구조가 주는 이점

- 벤더가 유료화/중단되어도 **복사된 helm 코드는 그대로 살아있다.** 노출 표면이 brain 하나뿐
- 컴포넌트 스타일을 소스에서 직접 수정 가능 → `::ng-deep` 이 원천적으로 불필요

### 이 구조가 주는 부담

- **업그레이드가 자동으로 안 온다.** helm은 내가 유지보수한다
- helm 코드가 **코드 리뷰·린트·테스트 범위 안에** 들어와야 한다
- 팀원이 helm 코드를 마음대로 고치면 디자인 시스템 일관성이 무너진다

---

## 1. 최우선 결정: helm 코드 관리 정책

**이걸 정하지 않고 시작하면 6개월 뒤 반드시 문제가 된다.** 디자인 시스템 문서에 명시할 것.

### 1.1 helm 코드 배치

```
libs/ui/
├── button/          # spartan CLI가 생성 → 이후 우리 코드
├── dialog/
└── date-picker/
```

- 별도 디렉터리/라이브러리로 격리한다. feature 코드와 섞지 않는다
- **`CODEOWNERS` 또는 리뷰 규칙으로 보호**한다. 아무나 고치면 안 되는 코드다

### 1.2 수정 정책 (셋 중 택일, 문서에 명시)

| 정책 | 내용 | 장단점 |
|---|---|---|
| **A. 동결** | 복사 후 수정 금지. 커스터마이징은 토큰으로만 | 업스트림 재복사 쉬움 / 유연성 낮음 |
| **B. 토큰 치환만** | 색·간격을 내 토큰 변수로 바꾸는 수정만 허용 | **권장.** 균형 좋음 |
| **C. 자유 수정** | 완전히 우리 것으로 | 유연 / 업스트림 개선 흡수 불가 |

> **권장: B.** 최초 복사 시 하드코딩된 shadcn 토큰명을 내 시맨틱 토큰으로 치환하고,
> 이후 구조 변경은 하지 않는다. 구조가 아쉬우면 helm을 고치지 말고 **그 위에 자체 컴포넌트를 만든다.**

### 1.3 업스트림 추적

- 복사 시점의 **spartan 버전을 파일 헤더 주석 또는 별도 매니페스트에 기록**한다
- 정기적으로(분기 1회 등) 업스트림 변경사항 확인 → 접근성/버그 수정은 수동 반영
- `git diff` 로 대조할 수 있게, **최초 복사본을 수정 없이 한 번 커밋**한 뒤 별도 커밋으로 토큰 치환한다.
  이 순서를 지키면 나중에 업스트림 대조가 훨씬 쉽다

---

## 2. 토큰 네이밍 계약 — 가장 자주 깨지는 지점

### 2.0 ⚠️ 최우선 — HSL 성분 삼중값 vs 전체 색값 (조용히 깨지는 함정)

shadcn 계열 예제에는 **두 가지 색값 표기 방식이 섞여 유통된다.** 혼용하면 **에러 없이** 깨진다.

| 세대 | 토큰 정의 | 사용처 |
|---|---|---|
| **구 (레거시)** | `--background: 0 0% 100%;` — HSL **성분만**, 함수 없음 | `hsl(var(--background))` 로 감싸서 사용 |
| **신 (표준)** | `--background: #ffffff;` 또는 `oklch(1 0 0)` — **전체 색값** | `var(--background)` 그대로 사용 |

**스킬 규정 = 전체 색값 형식. HSL 성분 방식은 사용하지 않는다.**

**혼용 증상 (전부 무경고)**:
- 색이 검정 또는 투명으로 렌더링됨 → 전체 색값을 `hsl()` 로 감쌈 (`hsl(#ffffff)` = 무효)
- 색이 아예 적용 안 됨 → 성분값을 `var()` 로 직접 사용 (`color: 0 0% 100%` = 무효)
- **일부 컴포넌트만** 깨짐 → 구버전 예제에서 복사한 helm 코드가 섞임

**필수 점검**:
- [ ] 프로젝트 전체에서 `hsl(var(--` 패턴 **0건** 확인 (전역 검색)
- [ ] 인터넷/구버전 예제에서 helm 코드나 토큰 블록을 복사할 때 **표기 방식부터 확인**
- [ ] 알파 조합이 필요하면 `color-mix(in oklab, var(--primary) 20%, transparent)` 또는
      Tailwind의 `/20` 문법 사용. `hsl(var(--x) / 0.2)` 로 되돌아가지 않는다
- [ ] `[VERIFY]` 설치 시 CLI가 생성한 CSS가 어느 방식인지 먼저 열어보고, 다르면 통일

---

helm 컴포넌트는 shadcn 관례의 시맨틱 토큰 이름을 전제로 작성되어 있다.

```
--background, --foreground, --card, --card-foreground, --popover, --popover-foreground,
--primary, --primary-foreground, --secondary, --secondary-foreground,
--muted, --muted-foreground, --accent, --accent-foreground,
--destructive, --destructive-foreground, --border, --input, --ring, --radius
```

`[VERIFY]` 정확한 목록은 설치 시 생성되는 CSS와 spartan 문서로 확인.
**누락된 토큰이 하나라도 있으면 그 토큰을 쓰는 컴포넌트만 색이 깨진다.**

**내 디자인 시스템의 시맨틱 이름(`surface`, `content`…)과 충돌한다.** 아래에서 택한다.

### 방법 B — shadcn 이름 채택 ★ **스킬 기본값**

디자인 시스템의 시맨틱 계층 자체가 shadcn 네이밍을 쓴다.
스킬 규정(`:root` / `.dark` 변수 매핑)과 정합적이므로 **이 모드에서는 B를 쓴다.**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* Tier 1 — Primitive (@theme, 비-inline) */
@theme {
  --color-brand-600: #2563eb;
  --color-gray-50:   #f9fafb;
  --color-gray-900:  #111827;
}

/* Tier 2 — Semantic (@theme inline). shadcn 이름 = 내 시맨틱 이름 */
@theme inline {
  --color-background:         var(--background);
  --color-foreground:         var(--foreground);
  --color-card:               var(--card);
  --color-card-foreground:    var(--card-foreground);
  --color-primary:            var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted:              var(--muted);
  --color-muted-foreground:   var(--muted-foreground);
  --color-border:             var(--border);
  --color-input:              var(--input);
  --color-ring:               var(--ring);
  --radius-md:                var(--radius);
}

/* 매핑 — 라이트/다크가 갈리는 유일한 지점. 전체 색값 형식 */
:root {
  --background:         var(--color-gray-50);
  --foreground:         var(--color-gray-900);
  --primary:            var(--color-brand-600);
  --primary-foreground: #ffffff;
  --border:             #e5e7eb;
  --radius:             0.5rem;
}
.dark {
  --background:         var(--color-gray-900);
  --foreground:         var(--color-gray-50);
  --border:             #374151;
}
```

- ✅ 별칭 불필요, helm 코드 무수정, 업스트림 대조 최상, 스킬 규정과 일치
- ⚠️ Figma 변수명을 shadcn 이름에 맞추도록 디자이너와 합의해야 함
- ⚠️ `01`·`02` 모드와 시맨틱 이름이 다르다 → **모드 간 토큰 이름 대응표를 별도 문서로** 유지

### 방법 A — 별칭 계층 (스킬 밖 범용 프로젝트용 대안)

내 네이밍(`surface`/`content`/`accent`)이 진실 소스, shadcn 이름은 별칭.

```css
@theme inline {
  /* 내 시맨틱 */
  --color-surface: var(--app-surface);
  --color-content: var(--app-content);
  --color-accent:  var(--app-accent);

  /* helm 호환 별칭 — 빠짐없이 전부 정의해야 함 */
  --color-background:         var(--app-surface);
  --color-foreground:         var(--app-content);
  --color-primary:            var(--app-accent);
  --color-primary-foreground: var(--app-on-accent);
  --color-input:              var(--app-border);
  --color-ring:               var(--app-focus-ring);
  /* … shadcn 토큰 전량 */
}
```

- ✅ `01`·`02` 모드와 네이밍 통일, Figma 변수명 유지
- ❌ 별칭 누락 시 특정 컴포넌트만 조용히 깨짐. **전량 매핑 검증이 필수**
- ❌ 스킬 규정과 어긋남 → **스킬 모드에서는 사용하지 않는다**

### 방법 C — helm 코드에서 직접 치환

- ✅ 코드가 가장 읽기 쉬움
- ❌ 업스트림 대조 비용 증가, 신규 컴포넌트 추가마다 반복 작업 → **비권장**

---

## 3. `--radius` 와 다크모드

### radius
shadcn 관례는 `--radius` 단일 변수에서 파생값(`calc(var(--radius) - 2px)` 등)을 만든다.
`00` 문서의 `--radius-field / --radius-card / --radius-pill` 체계와 충돌한다.
→ **별칭 계층에서 매핑하고, 파생 계산식이 의도한 결과를 내는지 실제로 확인**한다.

### 다크모드
- helm 컴포넌트는 `dark:` variant 를 사용한다
- **Tailwind v4의 `dark` variant 정의가 앱 전역 다크 셀렉터와 일치해야 한다.**
  이 모드의 전역 다크 셀렉터는 스킬 규정에 따라 **`.dark` 클래스**다 (§2 방법 B 예시와 동일).

```css
@custom-variant dark (&:where(.dark, .dark *));
```

- 기본값(`prefers-color-scheme`)을 그대로 두면 사용자 토글이 helm 컴포넌트에 반영되지 않는다.
  **이게 "내가 만든 버튼은 다크로 바뀌는데 spartan 다이얼로그만 라이트"의 원인이다.**
- 방법 A(스킬 밖 범용 프로젝트)에서 `data-theme` 셀렉터를 채택했다면 variant도 같은 셀렉터로 맞춘다:
  `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));`
  — 어느 쪽이든 **토큰이 갈리는 셀렉터와 `dark` variant 셀렉터는 반드시 하나로 일치**해야 한다.

---

## 4. cva + tailwind-merge 규약 통일

helm 컴포넌트는 `cva` 와 `tailwind-merge` 를 사용한다. **자체 컴포넌트도 같은 방식으로 작성한다.**

```typescript
// 자체 컴포넌트도 helm과 동일한 패턴
const badgeVariants = cva('기본…', { variants: {…}, defaultVariants: {…} });

@Directive({ selector: '[appBadge]', host: { '[class]': 'classes()' } })
export class BadgeDirective {
  readonly variant = input<BadgeVariants['variant']>('default');
  readonly class = input<string>('');
  protected readonly classes = computed(() =>
    twMerge(badgeVariants({ variant: this.variant() }), this.class()),
  );
}
```

**주의**:
- `tailwind-merge` 는 Tailwind 클래스 그룹을 알고 있어야 병합이 정확하다. **커스텀 유틸리티/임의 접두사를
  쓴다면 `extendTailwindMerge` 로 설정을 확장**해야 한다. 안 하면 조용히 잘못 병합된다 `[VERIFY]`
- variant 이름을 helm과 다르게 지으면(`solid` vs `default`) 혼란이 생긴다. **어휘를 통일**하고 문서화
- `tailwind-merge` 버전이 Tailwind 버전과 맞아야 한다 (v4용 릴리스 확인)

---

## 5. Data Table — 가장 큰 작업량

spartan의 Data Table은 **TanStack Table 기반**이다.

> 즉 정렬·필터·페이징·컬럼 표시·선택 로직은 **내가 배선한다.** PrimeNG의 `p-table` 처럼
> 옵션 하나로 켜지는 것이 아니다.

### 반드시 직접 만들어야 하는 것

- 서버 사이드 지연 로딩 (페이지/정렬/필터 상태 → API 요청 → 결과 반영)
- 로딩/에러/빈 상태 UI
- 페이지 크기 선택, 총 개수 표시
- 컬럼 표시/숨김, 컬럼 순서
- 행 선택(단일/다중), 전체 선택 반정도(indeterminate) 상태
- 가상 스크롤 필요 시 CDK Virtual Scroll 연동
- 반응형 (모바일에서 테이블 → 카드 전환 등)
- 접근성: 정렬 가능 헤더의 `aria-sort`, 행 선택 체크박스 라벨

### 권장 접근

- **공용 `<app-data-table>` 을 한 번 제대로 만들고 전 화면에서 재사용**한다.
  화면마다 TanStack을 직접 배선하면 그 순간 디자인 시스템이 아니게 된다
- 컬럼 정의·쿼리 타입을 자체 인터페이스로 고정한다 (`02` 문서의 `TableQuery` 참고)
- **초기 구축에 1~2주를 별도 일정으로 잡는다.** "테이블 붙이기"로 견적하면 실패한다

### 그래도 부족하면

컬럼 리사이즈/고정, 그룹핑, 피벗, 엑셀 export, 수십만 행 처리가 필요하면
**AG Grid Community(MIT)를 별도로 붙이는 것**을 검토한다. spartan으로 억지로 만들지 않는다.

---

## 6. Calendar / Date Picker — 기능 범위 확인

spartan의 Calendar / Date Picker는 `[min]` / `[max]` 등 기본 기능과 i18n 커스터마이징을 제공한다.
`brain/calendar` 의 i18n 주입으로 월/요일 라벨을 한국어로 바꿀 수 있다.

**하지만 확인이 필요한 항목** `[VERIFY]`:

- [ ] 기간(range) 선택 지원 여부
- [ ] 다중 날짜 선택
- [ ] 시간 선택 (별도 `<input type="time">` 조합인지 통합 컴포넌트인지)
- [ ] 월/연도 직접 점프
- [ ] 특정 날짜 비활성화 (공휴일 등)
- [ ] 인라인 표시
- [ ] 주 시작 요일 설정 (한국은 일요일 시작)

**미지원 기능이 요구사항에 있으면 그 컴포넌트만 다른 해법을 쓰거나 직접 확장해야 한다.**
디자인 시안을 그리기 전에 이 목록을 먼저 대조할 것. 시안을 먼저 그리면 구현 불가 시안이 나온다.

> 타임존은 어느 라이브러리를 쓰든 직접 해결해야 한다. `Date` 직접 조작 금지, date-fns-tz / Temporal 사용.

---

## 7. 자체 구현으로 커버되는 영역

이 조합의 장점은 **대부분을 자체 구현으로 가져갈 수 있다**는 것이다.
Angular 21+ 의 **Angular Aria**(`@angular/aria`)가 헤드리스 접근성 디렉티브를 제공한다:
Accordion, Autocomplete, Combobox, Grid, Listbox, Menu, Menubar, Multiselect, Select, Tabs, Toolbar, Tree.

**선택 기준**:
- spartan에 있고 요구사항을 충족 → **spartan helm 사용**
- spartan에 없거나 부족 → **Angular Aria + CDK Overlay 로 자체 구현** (spartan과 같은 방식이므로 이질감 없음)
- 둘 다 어려움(캘린더 고급 기능, 데이터 그리드) → **별도 라이브러리 검토**

Angular Aria로 직접 만들 때도 `00` 문서의 접근성 기준선과 IME 처리는 동일하게 적용한다.

---

## 8. 버전 정합성

- **brain(npm) ↔ helm(복사본) ↔ Angular 버전** 세 축이 맞아야 한다
- brain을 올렸는데 helm이 옛날 API를 쓰고 있으면 컴파일 에러 또는 런타임 오작동
- **brain 업그레이드는 helm 재확인과 세트로 진행**한다. 단독 `npm update` 금지
- Angular는 6개월마다 메이저가 나온다. spartan의 대응 시점을 확인하고 업그레이드 일정을 잡는다
- `[VERIFY]` spartan 1.x의 지원 Angular 버전 매트릭스

---

## 9. 기타 확인 항목

- **아이콘**: spartan 예제는 lucide 계열을 쓴다. 아이콘 세트를 디자인 시스템 토큰(크기·굵기)과 함께 확정할 것
- **스타일 프리셋**: spartan에 복수의 스타일 변형이 존재한다 `[VERIFY: 명칭과 선택 방법]`.
  **프로젝트 착수 시 하나를 정하고 고정**한다. 컴포넌트마다 다른 스타일을 복사하면 일관성이 무너진다
- **폼 API**: spartan 문서가 Reactive Forms와 Signal Forms를 모두 다룬다. **하나로 통일**하고 문서에 명시
- **SSR**: SSR 호환이라고 명시되어 있으나, 오버레이/포커스 관련 컴포넌트는 실제 SSR 빌드로 검증할 것
- **CLI 생성 코드의 lint**: 복사된 helm 코드가 프로젝트 lint 규칙(예: primitive 토큰 사용 금지)을
  위반할 수 있다. 최초 복사 후 lint를 돌려 정리하는 절차를 포함

---

## 10. 체크리스트

### 정책 (착수 전 결정)
- [ ] helm 코드 배치 위치 및 CODEOWNERS/리뷰 보호
- [ ] helm 수정 정책 (A 동결 / B 토큰 치환만 / C 자유) 결정 및 문서화
- [ ] 최초 복사본을 무수정 커밋 → 이후 토큰 치환을 별도 커밋 (업스트림 대조용)
- [ ] 복사 시점 spartan 버전 기록 방법
- [ ] 스타일 프리셋 하나로 고정
- [ ] 폼 API 통일 (Reactive / Signal)

### 토큰
- [ ] **색값 표기 방식 통일 — `hsl(var(--` 패턴 전역 검색 0건** (§2.0)
- [ ] 설치 시 CLI 생성 CSS의 표기 방식 확인 및 통일
- [ ] 네이밍 방법 결정: 스킬 모드면 **방법 B** (그 외 프로젝트만 A 허용)
- [ ] `00` §1.2.1 배선: primitive `@theme` / semantic `@theme inline` / 매핑 `:root`·`.dark`
- [ ] shadcn 토큰 **전량** 정의 확인 (누락 시 해당 컴포넌트만 조용히 깨짐)
- [ ] 방법 A 채택 시: 별칭 표 문서화 **및 누락 0건 확인**
- [ ] `--radius` 파생 계산이 의도한 결과를 내는지 실제 확인
- [ ] `@custom-variant dark` 가 앱 전역 다크 셀렉터(`.dark`)와 일치
- [ ] 다크모드 전환 시 helm 컴포넌트와 자체 컴포넌트가 동시 전환
- [ ] 모드 간 토큰 이름 대응표 (`01`/`02`/`03` 시맨틱 이름 매핑) 유지

### 규약
- [ ] 자체 컴포넌트도 cva + twMerge 패턴 사용
- [ ] `extendTailwindMerge` 설정 (커스텀 유틸리티 사용 시)
- [ ] variant 어휘가 helm과 통일됨
- [ ] tailwind-merge 버전이 Tailwind v4와 호환

### 작업량 확보
- [ ] Data Table 공용 컴포넌트 구축에 별도 일정 배정 (1~2주)
- [ ] Date Picker 요구 기능 vs spartan 제공 기능 대조 완료
- [ ] 대조 결과 미지원 기능에 대한 해법 결정 (직접 확장 / 다른 라이브러리 / 요구사항 조정)

### 검증
- [ ] brain / helm / Angular 버전 정합성
- [ ] SSR 빌드에서 오버레이 계열 동작
- [ ] 한글 IME 입력 (Combobox / Autocomplete / Command)
- [ ] 키보드 전용 조작 (helm 수정 과정에서 brain의 접근성을 깨뜨리지 않았는지)
- [ ] 대비율 검사
