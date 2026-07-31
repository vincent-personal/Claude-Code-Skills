# Tailwind CSS + PrimeNG — 스택별 주의사항

> **용도 선언**
> `kai-design-sync` 스킬 **Tailwind + PrimeNG 모드** references 편입용.
> 스킬 규정(`CLAUDE.md`)과 충돌 시 **스킬 규정이 우선**한다.

> `00-common-design-system-rules.md` 를 먼저 적용한 뒤 이 문서를 함께 본다.
> `00` §1.2.1 (Tailwind v4 `@theme` 배선)이 **이 모드의 전제**다. 그것 없이는 시맨틱 유틸리티가 생성되지 않는다.

> **가장 중요한 두 줄**
> 1. CSS Layer 순서를 설정하지 않으면 Tailwind 유틸리티가 PrimeNG 컴포넌트에 먹지 않는다.
> 2. PrimeNG 커스터마이징은 **디자인 토큰으로만** 한다. `::ng-deep` 은 즉시 리뷰 반려 대상.

`[VERIFY]` 표시 항목은 프로젝트의 실제 PrimeNG 버전 문서 또는 1차 출처로 확인할 것.

---

## 0. 라이선스 — 착수 전 확인 (v22+)

> ⚠️ **`[VERIFY]` — 이 절 전체가 확인 대상이다.**
> 아래는 2026년 7월 시점의 공개 정보이며, **가격·자격 조건·정책은 변경될 수 있다.**
> 착수 시 반드시 PrimeUI 공식 라이선스 페이지에서 현재 조건을 확인하고, 이 문서의 수치를 갱신할 것.
> **이 문서의 숫자를 근거로 예산이나 계약 판단을 하지 않는다.**

PrimeNG는 2026년 6월 **PrimeUI** 라는 통합 라이선스 브랜드로 전환한 것으로 공표되었다.

- **PrimeNG 21 이하**: MIT. 기존 릴리스는 그대로 유지. 단 GitHub 저장소가 아카이브되어 **신규 수정·보안 패치 없음** `[VERIFY]`
- **PrimeNG 22 이상**: PrimeUI 라이선스. 컴파일된 npm 패키지로 배포. **라이선스 키 필요** `[VERIFY]`
  - **Community (무료)**: 연매출·개발자 수·직원 수·VC 투자 기준을 **전부** 충족해야 함
    - 발표 시점 기준 $1M / 5명 / 10명 / $3M 미만, 12개월 갱신 `[VERIFY: 현재 기준값]`
  - **Commercial**: 개발자당 영구 라이선스 + 업데이트 기간
    - 발표 시점 기준 $599 (런칭가), 이후 인상 예고 `[VERIFY: 현재 가격]`
- 라이선스 검증은 오프라인 우선. 런타임에 외부 서버 통신 없음 `[VERIFY]`
- 키가 없거나 만료되면 라이선스 안내가 표시될 수 있음 `[VERIFY: 정확한 동작]`

### 실무 조치

- [ ] **착수 전** 조직의 Community 자격 여부 확인 → 문서에 기록
- [ ] 라이선스 키를 소스에 하드코딩하지 않는다. CI 시크릿 → 빌드 타임 주입
- [ ] Community면 **만료일을 팀 캘린더에 등록**. 갱신 누락 시 프로덕션 빌드에서 안내가 노출되는 사고가 난다
- [ ] `[VERIFY]` 오프라인/에어갭 CI 환경에서의 검증 동작 — 폐쇄망 프로젝트라면 사전 검증 필수
- [ ] v22는 컴파일 배포이므로 **소스를 읽어 디버깅할 수 없다.** 이슈 발생 시 대응 경로(지원 포털)를 확보해둘 것

---

## 1. CSS Layer 순서 — 최우선 설정 항목

**증상**: `<p-datePicker styleClass="w-full">` 이 안 먹음. Tailwind 유틸리티가 PrimeNG 스타일에 밀림
**원인**: PrimeNG CSS와 Tailwind 유틸리티의 캐스케이드 레이어 우선순위
**해결**: PrimeNG를 Tailwind 유틸리티보다 **앞선** 레이어로 배치

```typescript
providePrimeNG({
  theme: {
    preset: AppPreset,
    options: {
      darkModeSelector: '[data-theme="dark"]',
      cssLayer: {
        name: 'primeng',
        order: 'theme, base, primeng, components, utilities',
      },
    },
  },
})
```

> **`[VERIFY]` 필수**: `order` 문자열의 레이어 이름은 Tailwind 버전에 따라 다르다.
> Tailwind v3 시절 문서에는 `'tailwind-base, primeng, tailwind-utilities'` 로 되어 있다.
> Tailwind v4는 `theme, base, components, utilities` 레이어를 사용하므로 위 형태가 맞지만,
> **프로젝트에서 실제 생성되는 `@layer` 선언을 브라우저 devtools로 확인하고 맞출 것.**
> 이 값이 틀리면 증상이 "가끔 먹고 가끔 안 먹는" 형태로 나타나 디버깅이 매우 어렵다.

**검증 방법**: 아무 PrimeNG 컴포넌트에 `class="!hidden"` 이 아닌 `class="hidden"` 을 주고
사라지는지 확인한다. 사라지면 순서가 맞은 것이다.

---

## 2. 토큰 브릿지 — definePreset

PrimeNG는 디자인 아그노스틱 라이브러리로, 스타일이 테마로 컴포넌트에서 분리되어 있다.
테마는 **base**(CSS 변수를 플레이스홀더로 쓰는 스타일 규칙)와 **preset**(토큰을 CSS 변수에 매핑하는
디자인 토큰 집합)으로 구성되며, preset은 **primitive / semantic / component** 3티어다.

→ **`00` 문서의 3계층 토큰 구조와 정확히 대응한다.** 내 토큰을 preset에 주입하면 된다.

```typescript
// theme/primeng-preset.ts
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const AppPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50:  'var(--color-brand-50)',
      500: 'var(--color-brand-500)',
      600: 'var(--color-brand-600)',
      700: 'var(--color-brand-700)',
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--color-focus-ring)',
      offset: '2px',
    },
    formField: {
      borderRadius: 'var(--radius-field)',
      paddingX:     'var(--spacing-field-x)',
      borderColor:  'var(--color-border)',
    },
    colorScheme: {
      light: { surface: { 0: 'var(--color-surface-raised)' } },
      dark:  { surface: { 0: 'var(--color-surface-raised)' } },
    },
  },
});
```

### 주의

- **preset 안에 hex 색상을 직접 적지 않는다.** 그 순간 진실 소스가 두 개가 된다. 반드시 `var(--…)` 참조
- **`[VERIFY]` 알려진 이슈**: 값이 CSS 변수인 디자인 토큰의 커스터마이징이 일부 상황에서 의도대로
  동작하지 않는다는 보고가 있다 (구버전 기준). 착수 시 대표 토큰 몇 개로 **실제 렌더링 검증**을 먼저 하고,
  안 되는 항목은 별도 목록으로 관리할 것
- preset의 예약어는 토큰 이름으로 쓸 수 없다: `primitive, semantic, components, directives,
  colorscheme, light, dark, common, root, states`
- `darkModeSelector` 는 **`00` 문서의 앱 전역 다크 셀렉터와 반드시 동일**해야 한다

### 국소 예외는 `dt` 로

특정 인스턴스 하나만 다르게 하고 싶을 때, CSS를 쓰지 말고 scoped token을 쓴다.

```html
<p-slider [dt]="{ range: { background: 'var(--color-danger)' } }" />
```

전역 예외는 preset의 `components` 계층에 정의한다.

---

## 3. 커스터마이징 우선순위 (위에서부터 시도)

1. **preset semantic 토큰** — 전역 규칙. 대부분 여기서 해결된다
2. **preset components 토큰** — 특정 컴포넌트 전역 규칙
3. **`dt` scoped token** — 특정 인스턴스
4. **`styleClass` + Tailwind 유틸리티** — 레이아웃/여백 등 외곽
5. **`pt` (PassThrough)** — 내부 요소에 속성/클래스 주입이 필요할 때 `[VERIFY: 버전별 지원 범위]`
6. ~~`::ng-deep`~~ — **금지**

> 공식 문서도 스타일 클래스로 오버라이드하는 것은 최후의 수단이며 디자인 토큰이 권장 방식이라고 명시한다.
> `::ng-deep` 은 라이브러리 내부 DOM 구조에 의존하므로 **마이너 업데이트 하나에 전부 깨진다.**
> v22는 컴파일 배포라 내부 구조 확인도 어렵다.

---

## 4. Tailwind와의 이중 팔레트 문제

PrimeNG preset의 primitive 계층에는 자체 색상 팔레트(emerald, green, lime … 각 50~950)가 들어있다.
**이것을 그대로 두면 팔레트가 두 벌이 된다.**

**해결**: preset의 primitive는 건드리지 않고 **semantic 계층에서만 내 토큰을 참조**한다.
primitive를 통째로 재정의하려 하면 놓치는 색이 생겨서 오히려 불일치가 커진다.

**금지**: 컴포넌트 템플릿에서 `--p-*` CSS 변수를 직접 참조하는 것.
그건 PrimeNG 내부 구현에 의존하는 것이고, 진실 소스 방향이 거꾸로 된다.

### 4.1 공식 Tailwind 플러그인 채택 여부 — 착수 시 결정

PrimeTek은 PrimeNG 디자인 토큰을 Tailwind 유틸리티로 노출하는 공식 플러그인을 제공한다
(`tailwindcss-primeui` 계열) `[VERIFY: 현재 패키지명·Tailwind v4 지원 여부·PrimeUI 전환 후 변경 사항]`.

| 선택 | 결과 |
|---|---|
| **미채택 (권장)** | 유틸리티는 `00` §1.2.1의 내 `@theme` 배선으로만 생성. **진실 소스 하나** |
| 채택 | `bg-primary`, `text-surface-500` 등 PrimeNG 토큰 기반 유틸리티가 추가로 생김 |

> ⚠️ **채택 시 주의**: 내 시맨틱 유틸리티(`bg-accent`)와 플러그인 유틸리티(`bg-primary`)가
> **공존하면 팀원마다 다른 걸 쓴다.** 채택한다면 둘 중 하나를 금지하고 lint로 강제할 것.
> 채택하지 않는 쪽이 `00` 문서의 단일 진실 소스 원칙과 정합적이다.

---

## 5. 파사드 대상 (필수)

이 조합을 선택하는 주된 이유는 **DataTable / DatePicker / AutoComplete** 이다.
그리고 그것이 정확히 벤더 락인의 핵심이므로 반드시 감싼다.

```
ui/
├── data-table/          # 내부: p-table
│   ├── data-table.component.ts
│   └── data-table.types.ts   # ⚠️ 자체 타입. LazyLoadEvent 를 밖으로 노출하지 않는다
├── date-field/          # 내부: p-datePicker
├── autocomplete/        # 내부: p-autoComplete
└── overlay.service.ts   # 내부: DialogService / MessageService
```

### DataTable 파사드 설계 포인트

- 서버 사이드 지연 로딩 이벤트를 **자체 타입으로 변환**해서 emit
  ```typescript
  export interface TableQuery {
    page: number; size: number;
    sort?: { field: string; dir: 'asc' | 'desc' };
    filters?: Record<string, unknown>;
  }
  ```
- .NET 백엔드 페이징 규약(0-base vs 1-base, `$skip/$top` 등)과의 변환도 파사드 안에서 처리
- 컬럼 정의를 자체 인터페이스로 받는다. PrimeNG 템플릿 문법을 화면에 노출하지 않는다
- **주의**: 파사드에 PrimeNG의 모든 기능을 다 뚫으면 파사드가 아니라 별칭이 된다. 실제 쓰는 기능만

### DatePicker 파사드 설계 포인트

- 타임존 처리(Asia/Seoul)를 파사드 안에 가둔다. `Date` 객체를 그대로 주고받지 않는다
- 문자열(ISO) ↔ Date 변환 지점을 한 곳으로 통일
- 로케일(한국어 월/요일, 주 시작 요일)을 파사드에서 설정

---

## 6. 버전/API 관련 함정

### 6.1 컴포넌트 이름 변경 이력

v18~v21에 걸쳐 다수의 컴포넌트가 개명되었다. **구버전 기준 예제/블로그를 그대로 쓰면 동작하지 않는다.**

| 구 | 신 |
|---|---|
| `p-calendar` | `p-datePicker` |
| `p-dropdown` | `p-select` |
| `p-inputSwitch` | `p-toggleSwitch` |
| `p-overlayPanel` | `p-popover` |
| `p-sidebar` | `p-drawer` |

`[VERIFY]` 전체 목록은 해당 버전의 마이그레이션 가이드 확인. **신규 프로젝트라면 처음부터 신 API로 작성한다.**

### 6.2 테마 시스템 세대

- v17 이하: SCSS 테마 파일 방식
- v18 이상: 디자인 토큰 + `@primeuix/themes` 방식

**인터넷의 PrimeNG 테마 예제 상당수가 v17 기준이다.** SCSS 변수를 오버라이드하라는 지침을 만나면 구버전이다.

### 6.3 번들 크기

컴포넌트는 개별 import 한다. 배럴 import 로 전체를 끌어오지 않는다.

```typescript
import { Button } from 'primeng/button';   // ✅
```

---

## 7. 폼 통합

- PrimeNG 입력 컴포넌트는 `ControlValueAccessor` 를 구현하고 있다. 파사드가 그 사이에 끼면
  **파사드도 CVA를 구현**하거나 `viewProviders` 로 위임해야 한다. 이걸 빠뜨리면 파사드가 폼에 안 붙는다
- 에러 상태 표시(`ng-invalid` + `ng-touched`)를 토큰과 연결된 시각 상태로 정의
- Signal Forms 사용 시 PrimeNG 컴포넌트와의 호환성 `[VERIFY]`

---

## 8. 체크리스트

### 라이선스
- [ ] Community 자격 여부 확인 및 문서화
- [ ] 라이선스 키 CI 시크릿 주입 (소스 하드코딩 0건)
- [ ] Community면 갱신 만료일 캘린더 등록
- [ ] 폐쇄망/에어갭 CI 환경 검증 (해당 시)

### 설정
- [ ] `00` §1.2.1 Tailwind v4 배선 완료 (primitive `@theme` / semantic `@theme inline` / 매핑 일반 셀렉터)
- [ ] `cssLayer.order` 설정 완료 **및 실제 렌더링으로 검증** (`class="hidden"` 테스트)
- [ ] `darkModeSelector` 가 앱 전역 다크 셀렉터와 동일
- [ ] `AppPreset` 이 `var(--…)` 만 참조 (hex 하드코딩 0건)
- [ ] preset 예약어 충돌 없음
- [ ] `tailwindcss-primeui` 채택 여부 결정 및 문서화 (채택 시 유틸리티 이중화 방지책 포함)

### 커스터마이징
- [ ] `::ng-deep` **0건**
- [ ] `!important` 0건 (또는 사유와 함께 목록화)
- [ ] 템플릿에서 `--p-*` 변수 직접 참조 0건
- [ ] CSS 변수 참조가 실제로 반영되지 않는 토큰 목록 파악 및 대응책 기록

### 결정 사항 명시
- [ ] **폼 API (Reactive Forms / Signal Forms)** 결정 및 문서화 ← `00` §3.4
- [ ] 파사드가 폼 API를 위임하는 방식 확정 (CVA 구현 또는 `viewProviders`)

### 격리
- [ ] DataTable / DatePicker / AutoComplete 파사드 존재
- [ ] 파사드 시그니처에 PrimeNG 타입 노출 0건
- [ ] feature 코드에 `p-*` 태그 0건 (lint 룰로 강제 권장)

### 검증
- [ ] 다크모드 전환 시 PrimeNG 컴포넌트와 자체 컴포넌트가 동시 전환
- [ ] 포커스 링이 자체 컴포넌트와 시각적으로 동일
- [ ] 한글 IME 입력 (`p-autoComplete` 실시간 검색)
- [ ] 대비율 검사 (PrimeNG 기본 색이 남아있으면 여기서 걸린다)
