# 🧰 공유 UI 체계 구축 플레이북 (에이전트 지시서)

> **용도**: kai-design-sync가 Playground·디자인 테마·공유 컴포넌트 체계를 구축할 때 참조하는 방법론 문서.
> churchon-console에서 확립한 "공유 컴포넌트 + Playground + 패턴 ID" 체계의 원본이다.
> **완성 실물은 전부 `churchon-console/`에 있다** — 이 문서는 방법론, 코드는 실물을 복제 기준으로 삼는다.

## 0. 철학 (왜 이렇게 하나)

1. **단일 진실원**: 같은 UI를 복붙하지 않는다. 재사용 패턴은 공유 컴포넌트 1곳에 있고, 수정은 그 1곳만 고치면 전체 적용된다.
2. **살아있는 카탈로그**: `/playground` 라우트에 모든 패턴이 실물로 렌더된다 — 문서 드리프트가 원천 불가능.
3. **주소 체계**: 모든 데모 셀에 유니크 ID 칩(클릭=복사)이 붙는다. 사람↔AI 사이의 디자인 지정 공용 언어.
   - 🟡 골드 `pg://{섹션}/{슬러그}` = 패턴 ID → grep 한 번으로 마크업·출처 특정
   - 🟢 에메랄드 `app-…` = 공유 컴포넌트로 구현됨 → 마크업 복제 대신 컴포넌트 import
4. **자동 갱신**: 새 컴포넌트/패턴/화면을 만들면 playground 셀+칩(+REGISTRY 행) 추가는 같은 작업의 일부. 누락 = 미완성.

## 1. 공유 컴포넌트 추출 지침 (최대한 모든 것)

### 1-1. 대상 선정
- 전 화면을 훑어(또는 playground 카탈로그에서) **재사용 빈도·수정 파급력 상위** 패턴을 뽑는다. 151개 패턴 전부가 아니라 1차 20~25종 — 나머지는 수요 생길 때 승격.
- churchon-console 1차 확정 22종 (실물: `churchon-console/src/app/shared/`):
  - **원자** (`shared/ui/`): Button · Badge · FilterChip · ToggleSwitch · ProgressBar · SearchInput · Segment · Avatar · EmptyState · Callout
  - **분자** (`shared/ui/`): KpiCard(레이아웃 5변형 단일 통합 — 최대 파급) · StatTile · GradientSummary · SectionCard · HubRouteCard · OptionSelectCard · PageHeader · DropdownNavigator · StepsIndicator
  - **오버레이/오거니즘** (`shared/components/`): AppDrawer · AppSheet · AppDialog · MainLayout(레이아웃 셸)
- **만들지 않는 것**: 전역 토스트/컨펌/스피너(§3 서비스로 이미 존재 — 재생성 금지), p-table 범용 래퍼(§4 — 복제 기준 방식이 정답), 도메인 특수 UI(차트·챗은 후순위).

### 1-2. API 컨벤션 표준 (모범: `shared/ui/button/`)
```ts
@Component({
  selector: 'app-button',
  imports: [], // iconify 쓰면 반드시 schemas: [CUSTOM_ELEMENTS_SCHEMA]
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl, styleUrl,
  host: { '[class.app-button-block]': 'block()' }, // 레이아웃形 입력은 host 클래스로
})
export class Button {
  readonly variant = input<ButtonVariant>('primary'); // string literal union (enum 금지)
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute }); // bare 속성 허용
  readonly styleClass = input('');                    // 오버라이드 통로: rootClass 말미 append
  readonly clicked = output<MouseEvent>();            // 이벤트명 과거형
  protected readonly rootClass = computed(() =>
    [BASE, VARIANT[this.variant()], SIZE[this.size()], this.styleClass()].filter(Boolean).join(' '));
}
```
- variant × tone × size = **union 타입 + `Record` 클래스맵 + `computed rootClass`**. 클래스 문자열은 창작 금지 — 기존 실물(playground/실화면)에서 그대로 이식.
- tone 표준: gold(액센트)/zinc(중립)/emerald(성공·출석)/blue(정보·교인)/red(위험)/purple(행사).
- 두방향 상태는 `model<T>()`, slot은 `<ng-content select="[header]">`/`[footer]`/`[action]` attribute 셀렉터.
- 3-file 세트(.ts/.html/.scss), 상태 없는 순수 프레젠테이션(스토어·API 금지). 다크/라이트 클래스 병기 필수.

### 1-3. 실제 밟은 함정 (반드시 회피)
| 함정 | 증상 | 해법 |
|---|---|---|
| 블록 주석 안에 `*/60` 같은 문자열 | 주석 조기 종료 → 한글이 코드로 파싱 | 클래스 예시가 든 주석은 `//` 라인 주석으로 |
| `this.tone()` 을 한 식에서 2회 호출 | union 내로잉 끊겨 TS2322 | 지역 변수로 고정 후 분기 |
| bare 속성 바인딩 | 'string not assignable to boolean' | boolean input에 `{ transform: booleanAttribute }` |
| `:host { display: inline-flex }` + 내부 `w-full` | block 버튼이 전폭이 안 됨 | host 클래스 바인딩으로 host를 `display:flex; width:100%` |
| Tailwind 클래스 동적 조립 | 클래스 미생성(스캔 불가) | 크기/변형 맵은 **정적 리터럴 문자열**로만 |
| `pTemplate` 쓰는 래퍼에서 `PrimeTemplate` 미임포트 | slot이 조용히 미렌더 | `imports: [PrimeX, PrimeTemplate]` |

## 2. 오버레이 래퍼 3종 (드로워/시트/다이얼로그·팝업)

실물: `churchon-console/src/app/shared/components/{drawer,sheet,dialog}/` — 호출측은 **size/duration(속도)/내용(slot)만 넘기면 열린다.**

- **공통 골격**: PrimeNG p-drawer/p-dialog **위에 씌우는 래퍼** (직접 fixed div 구현 금지 — modal 마스크 기반이어야 전역 스크롤 잠금을 자동 상속).
  - visible은 `model<boolean>()` — 내부에서 `[visible]="visible()" (visibleChange)="visible.set($event)"` 브리지 (zoneless에서 `[(visible)]="signal()"` 직접 바인딩은 깨짐. 호출측 필드는 plain boolean).
  - `duration` input → `transitionOptions: `${duration()}ms cubic-bezier(0.32,0.72,0,1)``.
  - 크기 프리셋은 정적 리터럴 맵: `{ md: '!w-full sm:!w-[320px]', ... }`.
  - slot: `[header]` / 기본(스크롤 바디 `flex-1 min-h-0 overflow-y-auto`) / `[footer]`(shrink-0).
- **AppSheet(바텀/탑시트)**: p-drawer position bottom/top. 4변형(side×variant floating/flush) 정적 styleClass 맵. 공통 `!h-auto !max-h-[80dvh] !left-0 !right-0 !w-auto sm:!max-w-2xl !mx-auto`(⚠️ fixed 요소라 left/right 0 + mx-auto가 있어야 중앙 정렬됨) + floating은 `sm:!mb-6/!mt-6 sm:!rounded-2xl`, flush는 가장자리 밀착. bottom-floating만 드래그 핸들.
- **AppDialog(팝업)**: 표준 헤더(`header` input) / `headerless`(contentStyle padding 0 + 내부 자체 카드) 2모드, width 프리셋(sm/md/lg=480/640/900px + maxWidth 95vw), 항상 modal·draggable/resizable false.
- **⚠️ 래퍼가 못 해주는 것**: 투영 콘텐츠 안의 p-select/p-datepicker/p-inputnumber/p-autocomplete는 **호출측이 `appendTo="body"`** 를 붙여야 한다 (안 붙이면 패널이 오버레이에 갇힘).
- **전역 스크롤 잠금** (styles.scss 1회):
  ```scss
  body:has(.p-overlay-mask, .app-overlay-lock) main { overflow: hidden; }
  ```
  앱의 스크롤 컨테이너가 `<main>`일 때의 규칙. 커스텀 전체화면 오버레이엔 루트에 `app-overlay-lock` 클래스. main에는 `scrollbar-gutter: stable`(잠글 때 레이아웃 시프트 방지).

## 3. 전역 UI 서비스 (컨펌/토스트/스피너 — 컴포넌트 재생성 금지)

실물: `shared/services/{notice,confirm,loading}.service.ts` + `shared/components/{dialog-notice,dialog-confirm,spinner-overlay}/`
- 렌더러 컴포넌트는 **앱 루트(app.html)에 딱 1회 선언**, 각 화면은 서비스 주입 후 **발사만**:
  - 토스트: `notice.success/error/warning/info(title, msg)` — 모든 추가/수정/삭제 후 필수
  - 컨펌: `confirmService.open({ type:'danger'|'warning'|'info', message, accept: () => {...} })` — **반드시 TS 메서드로 분리** (템플릿 인라인 객체 리터럴은 파서 에러)
  - 스피너: `loading.show(msg)` / `hide()` — 카운터 기반 중첩 안전
- 전부 signal 기반 (zoneless 안전). PrimeNG Toast/ConfirmDialog는 금지.

## 4. p-table 구현 방식 (범용 래퍼 아님 — 복제 기준 방식)

```
1. [원칙] churchon-console/docs/FRONTEND_FEATURE_GUIDE.md §4-6 정독
2. [복제 기준] src/app/pages/playground/view-playground/sections/view-playground-data/sample-prime-table/
   (pg://data/table-prime — 배지·달성률바·합계행·빈상태 포함 실전 데모)
3. 핵심 규칙:
   - TableModule + encapsulation: ViewEncapsulation.None
   - 모든 SCSS를 컴포넌트 태그(app-xxx) 아래 중첩 (전역 누수 방지)
   - pTemplate="header|body|footer|emptymessage"
   - 컬럼 폭: table-layout:auto + 전 컬럼 `width:1%; white-space:nowrap`(콘텐츠 폭)
     + 흡수 컬럼 1개만 `width:100%; max-width:0; white-space:normal`
   - ⚠️ 폭 규칙은 thead th/tbody td 한정 — colspan 있는 tfoot에 nth-child 금지(합계 줄바꿈 버그)
   - 폭/패딩/배경/보더=SCSS, 텍스트 스타일=셀 안 자식의 Tailwind 클래스
   - 금지: ::ng-deep / !important / table-layout:fixed
   - 전제: app.config.ts의 providePrimeNG cssLayer { name:'primeng', order:'theme, base, primeng' }
     (PrimeNG을 CSS layer에 격리 → 컴포넌트 SCSS가 !important 없이 이긴다. 전역 설정 — 제거 금지)
4. [검증] build 0에러 + 흡수 컬럼만 확장·나머지 콘텐츠 폭·tfoot 한 줄 확인
```

## 5. Playground 진열 + 칩 시스템

- 라우트 `/playground` 1개(사이드바 미노출), 셸+섹션 컴포넌트 10개(foundation/buttons/forms/cards/data/overlays/navigation/charts/chat/motion), 무거운 섹션은 `@defer (on viewport)`. 상단 다크/라이트 토글 필수.
- 데모 셀 크롬: 카드 헤더 = 패턴명 + 골드 pg 칩 + (컴포넌트化 시) 에메랄드 칩 + font-mono 출처 캡션.
- 칩 렌더러 실물: `view-playground/pg-chip/` — `pgId`(복사 텍스트) + `tone`('pattern'=골드/'component'=에메랄드), 클릭 → clipboard + 토스트.
- **컴포넌트化된 패턴의 데모 셀은 원시 마크업 대신 컴포넌트 사용으로 교체**(드리프트 방지 — 렌더 결과가 곧 baseline). 컴포넌트 API 밖 변형만 raw 유지 + "(raw — API 미포함 변형)" 캡션.
- 인벤토리: `src/app/shared/ui/REGISTRY.md` — 컴포넌트별 selector·API 시그니처·pg:// 원천 표. 신규 생성 전 필수 검색, 유사하면 variant 추가.
- ID 유니크 검사: `grep -rho 'pg://[a-z-]*/[a-z0-9-]*' src/app/pages/playground | sort | uniq -d` → 출력 없어야 함.

## 6. 운영 규칙 (CLAUDE.md에 박제할 것)

**컴포넌트 3+1원칙**:
1. 공유 컴포넌트 우선 — 인라인 재구현 금지, REGISTRY 먼저 검색
2. 중복 감지 → 공용 컴포넌트 승격 + grep으로 앱 전역 교체
3. 신규 컴포넌트는 사용자 승인 후 생성
4. Playground 자동 갱신(상시) — 새 컴포넌트/패턴/화면 = 데모 셀+칩(+REGISTRY 행) 추가까지가 한 작업

**문서 위계**: CLAUDE.md(얇은 구조 규칙+포인터, 중복 서술 금지) → docs/FRONTEND_FEATURE_GUIDE.md(워크플로우·컴포넌트 사용 규칙 상세) → docs/PLAYGROUND_GUIDE.md(칩·검색·갱신) → REGISTRY.md(인벤토리) → playground(실물).

## 7. 완성 검증 체크리스트

- [ ] `npm run build` 0에러 (미사용 컴포넌트도 템플릿 타입체크됨)
- [ ] `/playground` 실렌더: 전 섹션 렌더·콘솔 에러 0·칩 클릭 복사+토스트
- [ ] 다크/라이트 양쪽 확인 (상단 토글)
- [ ] 오버레이: 열림 시 배후 스크롤 잠금 → 닫힘 시 해제, 시트 중앙 정렬·80dvh 상한
- [ ] 칩 ID 중복 0 · REGISTRY 행 = 컴포넌트 수 일치

---
_원본 구축: churchon-console (2026-07-24). 이 문서만으로 재현이 안 되는 세부는 반드시 실물 코드를 복제 기준으로 삼을 것._
