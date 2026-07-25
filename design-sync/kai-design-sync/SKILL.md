---
name: kai-design-sync
description: |
  레퍼런스(HTML 파일 또는 프로젝트 경로)에서 디자인 시스템을 추출하여
  Angular V21 + Tailwind V4 + PrimeNG V21 타겟 프로젝트에 완전히 동일한 테마로 적용하고,
  playground 컴포넌트와 디자인 규칙을 생성하는 전역 스킬.
  트리거: /kai-design-sync
  사용법: /kai-design-sync <레퍼런스경로> [<타겟경로>]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
---

# kai-design-sync — 디자인 시스템 추출 & 동기화 스킬

## 역할

레퍼런스(HTML 파일 또는 기존 웹 프로젝트)에서 디자인 토큰과 UI 컴포넌트를 추출하여:
1. 타겟 프로젝트에 Tailwind V4 + PrimeNG V21 통합 테마를 적용
2. Playground 컴포넌트로 Tailwind vs PrimeNG 구현 비교 뷰 생성
3. 디자인 규칙 문서화 + CLAUDE.md 자동 갱신

**핵심 원칙 1 — 색상 토큰 공유:** PrimeNG preset의 색상값은 하드코딩하지 않고 반드시 `var(--*)` CSS 변수를 참조한다.
→ Tailwind와 PrimeNG가 동일 토큰 소스를 공유하여 한 곳만 수정해도 두 시스템이 동기화됨.

**핵심 원칙 2 — rem 기준 통일:** `html { font-size: 87.5%; }` (= 14px)를 반드시 설정한다.
→ PrimeNG는 모든 크기를 `rem`으로 생성하는데, 기준은 `html` root(기본 16px)이다. `87.5%`를 지정하면 `1rem = 14px`가 되어 Tailwind `body { font-size: 14px }`와 정확히 일치한다.

**핵심 원칙 3 — 패딩은 semantic.formField에서, 폰트 크기는 CSS 직접 오버라이드:** 패딩은 `semantic.formField.paddingX/Y`가 `{form.field.*}` 토큰을 통해 Button·Input·Select 전체에 전파된다. 단, **폰트 크기(fontSize)는 전파되지 않는다.**
→ Aura 프리셋의 `button.root`, `inputtext.root` 등은 기본 크기(default, non-sm/lg)에 `fontSize` 토큰이 없어 body 폰트(html 기준값)를 그대로 상속한다. `formField.fontSize`를 설정해도 버튼·인풋에 적용되지 않으므로, 반드시 styles.css에서 CSS 직접 오버라이드가 필요하다.

**핵심 원칙 4 — 폰트 크기 정렬은 styles.css CSS 오버라이드로:** PrimeNG 버튼·인풋의 기본 폰트가 body 크기를 상속해 Tailwind보다 크게 보이면, styles.css에 아래 규칙을 추가한다. `:not(.p-*-sm):not(.p-*-lg)`로 sm/lg 변형은 보호한다.

```css
/* PrimeNG 폼 컴포넌트 기본 폰트 — Tailwind 기본 폰트에 맞춤 */
.p-button:not(.p-button-sm):not(.p-button-lg),
.p-inputtext:not(.p-inputtext-sm):not(.p-inputtext-lg),
.p-select:not(.p-select-sm):not(.p-select-lg),
.p-textarea:not(.p-textarea-sm):not(.p-textarea-lg),
.p-password .p-inputtext {
  font-size: {레퍼런스 버튼 폰트 크기를 rem으로 변환};
}
```
→ unlayered CSS는 PrimeNG의 `primeng` layer보다 항상 우선하므로, 높은 신뢰도로 적용된다. sm/lg variant는 각자의 CSS 변수(--p-button-sm-font-size 등)로 이미 제어되므로 `:not()` 로 제외한다.

**핵심 원칙 5 — 이중 구현 비교 + 전수 진열 + 칩 주소 체계:** Playground의 모든 데모 셀은 **Tailwind 구현과 PrimeNG 구현을 나란히** 넣어 비교 가능해야 하고(한쪽 생략 금지), 컴포넌트 인벤토리(Step 2)는 **레퍼런스뿐 아니라 타겟 코드베이스의 기존 컴포넌트 유닛까지 전수 검색**하여 최대한 모두 진열한다. 각 데모 셀에는 유니크 ID 칩(`pg://{섹션}/{슬러그}`, 클릭=복사)을 붙여 사람↔AI 디자인 지정의 공용 언어로 쓴다.
→ 방법론 상세(공유 컴포넌트 추출·API 컨벤션·오버레이 래퍼·p-table 방식·칩 시스템·운영 규칙)는 **`references/shared-ui-playbook.md`를 반드시 읽고 따른다** (churchon-console 실물 기반 플레이북).

---

## ⚡ 실행 절차

### Step 0 — 경로 검증 및 입력 파싱

```bash
# 타겟 경로 미지정 시 현재 git 루트 사용
TARGET=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
```

확인 사항:
1. **레퍼런스 경로 존재** — 파일(`*.html`) 또는 디렉토리인지 감지하여 타입 기록
2. **타겟 경로 존재** — Angular 프로젝트인지 `angular.json` 유무로 확인
3. **레퍼런스 == 타겟** → 즉시 BLOCKED (자기 자신 덮어쓰기 방지)

**스택 검증 (타겟 프로젝트):**

```bash
# Tailwind V4 확인
grep -r "tailwindcss" {TARGET}/package.json

# PrimeNG V21 확인
grep -r "primeng" {TARGET}/package.json

# Angular V21 확인
grep -r "@angular/core" {TARGET}/package.json
```

Tailwind V3 / PrimeNG V20 이하 / Angular V20 이하 발견 시 → BLOCKED 보고 후 종료.

Step 0 완료 후 다음을 사용자에게 보고:
```
✅ 레퍼런스: {경로} ({타입: HTML파일 | 프로젝트})
✅ 타겟: {TARGET}
✅ 스택: Angular {버전} / Tailwind {버전} / PrimeNG {버전}
```

---

### Step 1 — 레퍼런스 타입 감지 및 디자인 토큰 추출

먼저 레퍼런스 타입을 감지하고, 타입별로 적합한 추출 전략을 선택한다.

#### 타입 감지

```bash
REF="{레퍼런스 경로}"

# HTML 파일
if [[ "$REF" == *.html ]]; then TYPE="html"; fi

# 프로젝트 디렉토리 — package.json으로 스택 판별
elif [ -f "$REF/package.json" ]; then
  if grep -q '"next"' "$REF/package.json"; then TYPE="nextjs"
  elif grep -q '"react"' "$REF/package.json"; then TYPE="react"
  elif grep -q '"vue"' "$REF/package.json"; then TYPE="vue"
  elif grep -q '"@angular/core"' "$REF/package.json"; then TYPE="angular"
  else TYPE="generic"
  fi

# CSS/SCSS 단일 파일
elif [[ "$REF" == *.css ]] || [[ "$REF" == *.scss ]]; then TYPE="css"

# 기타
else TYPE="unknown"
fi
```

감지된 타입을 콘솔에 출력하고 해당 분기로 진행.

---

#### 1-A. 레퍼런스가 HTML 파일인 경우

파일을 Read하여 아래를 추출한다:

**CSS 변수 추출 (`<style>` 태그 내 `:root { --* }`):**
```
변수명 → 값 목록 전체 수집
```

**인라인 색상 추출 (CSS 변수에 없는 경우):**
- `background`, `color`, `border-color` 등에서 사용된 hex/rgb/hsl/oklch 값 수집
- 사용 빈도 3회 이상인 값만 토큰화 대상으로 표시

**폰트 정보:**
- `font-family` 값 수집
- `@import` 또는 `<link>` 태그에서 Google Fonts CDN URL 추출 (복사 금지, URL만 기록)
- 폰트 크기 체계 (`font-size` 사용 패턴) 수집

**간격/반경/그림자:**
- `--radius`, `border-radius` 패턴 수집
- `padding`/`gap`/`margin` 반복 값 수집
- `box-shadow` 값 수집

#### 1-B. 레퍼런스가 Angular / Vue / Generic 프로젝트인 경우

우선순위 순서로 병렬 탐색:

```bash
# CSS 변수 (:root)
grep -rn ":root" {REF}/src --include="*.css" --include="*.scss" | head -100

# Tailwind V4 @theme
grep -rn "@theme" {REF}/src --include="*.css" | head -50

# SCSS 변수
grep -rn "\$[a-z]" {REF}/src --include="*.scss" | grep -Ei "color|bg|surface|text|accent|border|radius|shadow" | head -100

# Tailwind config
cat {REF}/tailwind.config.* 2>/dev/null
```

#### 1-C. 레퍼런스가 React / Next.js 프로젝트인 경우

React/Next.js는 CSS-in-JS, CSS Modules, Tailwind 등 다양한 패턴이 혼재하므로 아래 순서로 탐색:

**① CSS 변수 / 글로벌 스타일 (최우선):**
```bash
# globals.css / global.css / variables.css / tokens.css 탐색
find {REF}/src {REF}/styles {REF}/app -name "global*" -o -name "variable*" -o -name "token*" 2>/dev/null | head -10

# :root 변수 추출
grep -rn ":root" {REF}/src {REF}/styles {REF}/app --include="*.css" --include="*.scss" | head -100
```

**② Tailwind config:**
```bash
cat {REF}/tailwind.config.{js,ts,mjs,cjs} 2>/dev/null
# Next.js의 경우 app/globals.css 내 @theme 블록도 확인
grep -n "@theme" {REF}/app/globals.css 2>/dev/null | head -30
```

**③ Styled Components / Emotion (theme 객체):**
```bash
# theme.ts / theme.js / tokens.ts 파일 탐색
find {REF}/src -name "theme.*" -o -name "tokens.*" -o -name "colors.*" 2>/dev/null | head -10
```

**④ CSS Modules (*.module.css):**
```bash
# 공통 변수 파일 탐색
find {REF}/src -name "*.module.css" | head -5
# 빈도 높은 클래스명 추출 (색상·간격 관련)
grep -rh "color\|background\|border\|radius\|padding\|gap" {REF}/src --include="*.module.css" | head -60
```

**⑤ `next.config.*` 에서 CSS 플러그인 확인:**
```bash
cat {REF}/next.config.{js,ts,mjs} 2>/dev/null | head -30
```

추출 우선순위: CSS 변수 > Tailwind config > theme 객체 > CSS Modules 빈도 분석

#### 1-C. 중간 산출물 저장

```bash
mkdir -p {TARGET}/docs/.design-sync
```

추출 결과를 `{TARGET}/docs/.design-sync/tokens.raw.json`에 저장:

```json
{
  "source": "{레퍼런스 경로}",
  "extractedAt": "{YYYY-MM-DD HH:MM}",
  "colors": {
    "--bg": "#F7F2EA",
    "--accent": "#C7522A",
    ...
  },
  "typography": {
    "fontSans": "\"DM Sans\", -apple-system, sans-serif",
    "fontSerif": "\"Fraunces\", serif",
    "baseSize": "14px"
  },
  "spacing": { ... },
  "radius": { "--radius": "14px" },
  "shadows": { ... },
  "fontsExternalUrl": ["https://fonts.googleapis.com/..."]
}
```

**⚠️ 폰트 파일 자동 복사 금지** — Google Fonts URL만 기록하고 사용자에게 라이선스 확인 `[!]` 마킹.

---

### Step 2 — UI 컴포넌트 인벤토리 (전수 검색)

레퍼런스에서 사용 중인 UI 컴포넌트를 카테고리별로 목록화한다.
**목표는 "최대한 모든 컴포넌트 유닛"이다 — 빈도로 걸러 버리지 않는다.**

**HTML 파일 분석 시:** 클래스명 패턴으로 컴포넌트 유추
**프로젝트 분석 시:** PrimeNG/커스텀 셀렉터 Grep

**2-A. 타겟 코드베이스 전수 스캔 (필수 추가):**
레퍼런스와 별개로, **타겟 프로젝트에 이미 존재하는 컴포넌트 유닛도 전수 검색**하여 인벤토리에 합친다:
```bash
# 커스텀 컴포넌트 셀렉터 전수 (app-* 등 프로젝트 프리픽스)
grep -rho "selector: *['\"]\(app\|ui\)-[a-z-]*['\"]" {TARGET}/src --include="*.ts" | sort -u
# 사용 중인 PrimeNG 컴포넌트 전수
grep -rho "<p-[a-z-]*" {TARGET}/src --include="*.html" | sort -u
# 공유 컴포넌트 디렉터리 구조
ls -R {TARGET}/src/app/shared 2>/dev/null
```
발견된 기존 공유 컴포넌트는 playground에서 **원시 마크업 재작성 없이 그 컴포넌트 자체로 진열**한다 (드리프트 방지 — `references/shared-ui-playbook.md` §5).

카테고리 분류:
- **tokens** — 색상·타이포·스페이싱 갤러리
- **buttons** — 버튼 변형 (primary, ghost, outline, icon, on-dark 등)
- **forms** — input, select, checkbox, radio, textarea
- **data-display** — table, card, list, badge, tag, chip
- **feedback** — toast, alert, progress, spinner
- **navigation** — top-nav, tabs, breadcrumb, pagination
- **overlay** — modal, drawer, dropdown, tooltip
- **layout** — 헤더, 사이드바, 그리드 패턴

3회 미만 사용 컴포넌트도 **인벤토리와 playground에 포함**하되 `(저빈도)` 표시만 남긴다 (제외 금지 — 전수 진열 원칙).
결과를 `{TARGET}/docs/.design-sync/components.inventory.md`에 저장.

---

### Step 3 — 디자인 시스템 문서 생성

`{TARGET}/docs/design-system.md`를 생성한다.

**구조:**
```markdown
# 디자인 시스템

> 생성: {YYYY-MM-DD} | 소스: {레퍼런스 경로}

## 1. 색상 토큰
| CSS 변수 | 값 | 용도 |
|---|---|---|
| --bg | #F7F2EA | 페이지 배경 |
...

## 2. 타이포그래피
- 기본 폰트: ...
- 헤딩 폰트: ...
- 기본 크기: ...

## 3. 간격 체계
...

## 4. 반경·그림자
...

## 5. 컴포넌트 인벤토리
(components.inventory.md 내용 요약)

## 6. Tailwind ↔ PrimeNG 토큰 매핑
Tailwind의 `@theme` CSS 변수와 PrimeNG semantic 토큰의 대응 관계.
```

---

### Step 4 — Tailwind V4 토큰 적용

#### 4-A. 기존 파일 백업

```bash
BACKUP_DIR="{TARGET}/docs/.design-sync/backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp {TARGET}/src/styles.css "$BACKUP_DIR/" 2>/dev/null
cp {TARGET}/src/styles.scss "$BACKUP_DIR/" 2>/dev/null
```

#### 4-B. `src/styles/_tokens.css` 생성

> ⚠️ **`html { font-size: 87.5%; }`는 필수** — PrimeNG가 `rem`으로 생성하는 모든 크기가 이 값(= 14px)을 기준으로 계산된다. 없으면 PrimeNG가 16px 기준으로 동작하여 Tailwind보다 크게 보인다.

```css
/* ============================================
   디자인 토큰 — /kai-design-sync 자동 생성
   수정 시 design-system.md 참조
   ============================================ */

@theme {
  /* 색상 */
  --color-bg: {--bg 값};
  --color-bg-2: {--bg-2 값};
  --color-surface: {--surface 값};
  --color-ink: {--ink 값};
  --color-ink-2: {--ink-2 값};
  --color-muted: {--muted 값};
  --color-line: {--line 값};
  --color-accent: {--accent 값};
  --color-accent-hover: {--accent-2 값};
  --color-accent-soft: {--accent-soft 값};
  --color-success: {--green 값};
  --color-success-soft: {--green-soft 값};
  --color-warning: {--amber 값};
  --color-warning-soft: {--amber-soft 값};

  /* 타이포그래피 */
  --font-sans: {fontSans};
  --font-serif: {fontSerif};
  --font-size-base: {baseSize};

  /* 반경 */
  --radius: {radius 값};
  --radius-sm: calc({radius 값} * 0.5);
  --radius-lg: calc({radius 값} * 1.5);
  --radius-full: 9999px;
}

/* CSS 변수 (PrimeNG preset이 var(--*)로 참조하는 원본 토큰) */
:root {
  --bg: {--bg 값};
  --bg-2: {--bg-2 값};
  --surface: {--surface 값};
  --surface-elevated: {계산값};
  --panel: {--bg-2 값};
  --ink: {--ink 값};
  --ink-2: {--ink-2 값};
  --text-primary: {--ink 값};
  --text-secondary: {--ink-2 값};
  --text-tertiary: {--muted 값};
  --text-disabled: color-mix(in oklch, {--muted 값}, transparent 50%);
  --muted: {--muted 값};
  --border: {--line 값};
  --border-strong: {--line-2 값};
  --line: {--line 값};
  --line-2: {--line-2 값};
  --accent: {--accent 값};
  --accent-hover: {--accent-2 값};
  --accent-active: {--accent-2 값};
  --accent-soft: {--accent-soft 값};
  --accent-ink: #ffffff;
  --green: {--green 값};
  --green-soft: {--green-soft 값};
  --success: {--green 값};
  --success-soft: {--green-soft 값};
  --amber: {--amber 값};
  --amber-soft: {--amber-soft 값};
  --warning: {--amber 값};
  --warning-soft: {--amber-soft 값};
  --danger: #dc2626;
  --danger-soft: #fee2e2;
  --radius: {radius 값};
  --radius-sm: calc({radius 값} / 2);
  --radius-lg: calc({radius 값} * 1.5);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06);
  --shadow-md: 0 4px 16px -2px rgb(0 0 0 / 0.08);
  --shadow-modal: 0 16px 48px -8px rgb(0 0 0 / 0.16);
}

/* ✅ PrimeNG rem 기준값 통일 — 반드시 포함해야 함 */
html {
  font-size: 87.5%; /* = 14px — 1rem을 14px로 고정 */
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--ink);
  font-size: 1rem; /* = 14px */
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  margin: 0;
  padding: 0;
}
```

#### 4-C. 메인 스타일 파일에 import 추가 + PrimeNG 폰트 오버라이드

`styles.css` 또는 `styles.scss` 상단에 아래 추가 (기존 내용 보존):

```css
@import "tailwindcss";
@import "./styles/_tokens.css";
@import "tailwindcss-primeui";
@import "primeicons/primeicons.css";

/* ─────────────────────────────────────────────
   PrimeNG 폰트 크기 보정 (필수)

   Aura 프리셋의 button/inputtext/select 등 기본(default) 크기에는
   fontSize 토큰이 없어 body 폰트(html 기준값)를 그대로 상속함.
   → formField.fontSize 설정만으로는 효과 없음. CSS 직접 오버라이드 필수.

   {레퍼런스_폰트크기_rem}: 레퍼런스 HTML의 버튼/인풋 폰트를 rem으로 환산
     예) html { font-size: 87.5% } (14px) 기준, 레퍼런스 버튼이 12.5px → 0.875rem
         html { font-size: 93.75% } (15px) 기준, 레퍼런스 버튼이 text-sm → 0.875rem

   unlayered CSS는 PrimeNG의 'primeng' layer보다 항상 우선 적용됨.
   :not(.p-*-sm):not(.p-*-lg) — sm/lg variant는 각자 CSS 변수로 이미 제어됨, 제외 필수.
   ────────────────────────────────────────────── */
.p-button:not(.p-button-sm):not(.p-button-lg),
.p-inputtext:not(.p-inputtext-sm):not(.p-inputtext-lg),
.p-select:not(.p-select-sm):not(.p-select-lg),
.p-textarea:not(.p-textarea-sm):not(.p-textarea-lg),
.p-password .p-inputtext,
.p-multiselect:not(.p-multiselect-sm):not(.p-multiselect-lg),
.p-datepicker-input,
.p-inputnumber-input {
  font-size: {레퍼런스_폰트크기_rem};
}
```

---

### Step 5 — PrimeNG V21 preset 생성

`{TARGET}/src/app/theme/{프로젝트명}-preset.ts`를 생성한다.

> ⚠️ **크기 제어 원칙:**
> - `semantic.formField.paddingX/Y`는 `{form.field.padding.*}` 토큰을 통해 Button·Input·Select·Textarea 전체에 전파된다.
> - **⚠️ `formField.fontSize`는 전파되지 않는다.** Aura의 `button.root`·`inputtext.root` 등 기본 크기(non-sm/lg)에는 fontSize 토큰이 없어 body 폰트(html 기준값)를 그대로 상속한다. → styles.css에서 CSS 직접 오버라이드 필수 (핵심 원칙 4 참조)
> - `html { font-size: N% }` 기준값이 설정되어 있으므로 `1rem = 기준 px`로 계산한다.
> - `components.button.root`에는 `borderRadius`·`label.fontWeight`만 지정한다. `paddingX/Y/sm/lg`를 별도로 넣으면 formField 상속이 깨져 버튼만 비정상적으로 커진다.

```typescript
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// ⚠️ 색상값 하드코딩 금지 — 반드시 var(--*) CSS 변수 참조
// Tailwind _tokens.css와 동일 소스를 공유함

const scheme = {
  surface: {
    0: 'var(--surface)',
    50: 'var(--panel)',
    100: 'var(--panel)',
    200: 'var(--border)',
    300: 'var(--border-strong)',
    400: 'var(--text-disabled)',
    500: 'var(--text-tertiary)',
    600: 'var(--text-tertiary)',
    700: 'var(--text-secondary)',
    800: 'var(--text-secondary)',
    900: 'var(--text-primary)',
    950: 'var(--text-primary)',
  },
  primary: {
    color: 'var(--accent)',
    contrastColor: 'var(--accent-ink)',
    hoverColor: 'var(--accent-hover)',
    activeColor: 'var(--accent-active)',
  },
  highlight: {
    background: 'var(--accent-soft)',
    focusBackground: 'var(--accent-soft)',
    color: 'var(--accent)',
    focusColor: 'var(--accent)',
  },
  text: {
    color: 'var(--text-primary)',
    hoverColor: 'var(--text-primary)',
    mutedColor: 'var(--text-secondary)',
    hoverMutedColor: 'var(--text-primary)',
  },
  content: {
    background: 'var(--surface)',
    hoverBackground: 'var(--surface-elevated)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
    hoverColor: 'var(--text-primary)',
  },
  overlay: {
    select: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
    popover: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
    modal: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
  },
  list: {
    option: {
      focusBackground: 'var(--surface-elevated)',
      selectedBackground: 'var(--accent-soft)',
      selectedFocusBackground: 'var(--accent-soft)',
      color: 'var(--text-primary)',
      focusColor: 'var(--text-primary)',
      selectedColor: 'var(--accent)',
      selectedFocusColor: 'var(--accent)',
    },
    optionGroup: { background: 'transparent', color: 'var(--text-tertiary)' },
  },
  navigation: {
    item: {
      focusBackground: 'var(--surface-elevated)',
      activeBackground: 'var(--accent-soft)',
      color: 'var(--text-primary)',
      focusColor: 'var(--text-primary)',
      activeColor: 'var(--accent)',
      icon: {
        color: 'var(--text-tertiary)',
        focusColor: 'var(--text-secondary)',
        activeColor: 'var(--accent)',
      },
    },
  },
  formField: {
    background: 'var(--surface)',
    disabledBackground: 'var(--panel)',
    filledBackground: 'var(--panel)',
    filledHoverBackground: 'var(--panel)',
    filledFocusBackground: 'var(--panel)',
    borderColor: 'var(--border)',
    hoverBorderColor: 'var(--border-strong)',
    focusBorderColor: 'var(--accent)',
    invalidBorderColor: 'var(--danger)',
    color: 'var(--text-primary)',
    disabledColor: 'var(--text-disabled)',
    placeholderColor: 'var(--text-tertiary)',
    invalidPlaceholderColor: 'var(--danger)',
    iconColor: 'var(--text-tertiary)',
    shadow: 'none',
  },
};

const toastSeverity = {
  background: 'var(--text-primary)',
  borderColor: 'var(--text-primary)',
  color: 'var(--bg)',
  detailColor: 'color-mix(in oklch, var(--bg), var(--text-primary) 28%)',
  shadow: 'var(--shadow-modal)',
  closeButton: { hoverBackground: 'color-mix(in oklch, var(--bg), transparent 88%)' },
};

export const {프로젝트명}Preset = definePreset(Aura, {
  semantic: {
    primary: {
      50: 'var(--accent-soft)',
      100: 'var(--accent-soft)',
      200: 'var(--accent-soft)',
      300: 'var(--accent)',
      400: 'var(--accent)',
      500: 'var(--accent)',
      600: 'var(--accent-hover)',
      700: 'var(--accent-active)',
      800: 'var(--accent-active)',
      900: 'var(--accent-active)',
      950: 'var(--accent-active)',
    },
    borderRadius: {
      none: '0', xs: '2px', sm: '4px',
      md: 'var(--radius)', lg: 'var(--radius-lg)', xl: 'var(--radius-lg)',
    },
    focusRing: { width: '2px', style: 'solid', color: 'var(--accent)', offset: '2px' },
    disabledOpacity: '0.5',
    formField: {
      // ✅ html { font-size: N% } 기준으로 rem 계산
      // ⚠️ fontSize를 여기 설정해도 button/inputtext 기본 크기에 적용되지 않음 (Aura 구조적 한계)
      //    → styles.css에서 .p-button/.p-inputtext 등 직접 CSS 오버라이드 필수 (핵심 원칙 4)
      paddingX: '0.75rem',   // 패딩은 {form.field.padding.x}로 전파됨 ✓
      paddingY: '0.5rem',    // 패딩은 {form.field.padding.y}로 전파됨 ✓
      sm: { fontSize: '0.875rem', paddingX: '0.625rem', paddingY: '0.3125rem' },
      lg: { fontSize: '1.125rem', paddingX: '1.125rem', paddingY: '0.625rem' },
      borderRadius: 'var(--radius)',
      focusRing: { width: '2px', style: 'solid', color: 'var(--accent)', offset: '0', shadow: 'none' },
    },
    colorScheme: { light: scheme, dark: scheme },
  },
  components: {
    button: {
      root: {
        // ✅ borderRadius·fontWeight만 오버라이드 — 패딩/폰트는 semantic.formField 전역 상속
        borderRadius: '999px', // pill 디자인이 아닌 경우 'var(--radius)'로 교체
        label: { fontWeight: '600' },
        // ❌ paddingX/paddingY/sm/lg 오버라이드 금지 — formField 상속 깨짐
      },
    },
    tag: {
      root: {
        fontSize: '0.75rem',       // ~10.5px at 14px root
        fontWeight: '600',
        borderRadius: '999px',
        roundedBorderRadius: '999px',
        padding: '0.25rem 0.625rem',
        gap: '0.3125rem',
      },
    },
    dialog: {
      root: { borderRadius: '22px' },
    },
    toast: {
      colorScheme: {
        light: { info: toastSeverity, success: toastSeverity, warn: toastSeverity, error: toastSeverity, secondary: toastSeverity, contrast: toastSeverity },
        dark:  { info: toastSeverity, success: toastSeverity, warn: toastSeverity, error: toastSeverity, secondary: toastSeverity, contrast: toastSeverity },
      },
    },
    datatable: {
      headerCell: { padding: '0.5rem 0.75rem' },
      bodyCell:   { padding: '0.5rem 0.75rem' },
      footerCell: { padding: '0.5rem 0.75rem' },
    },
  },
});
```

### PrimeNG ↔ Tailwind 크기 동기화 대조표

| 항목 | Tailwind (html N%) | PrimeNG 제어 위치 | 비고 |
|---|---|---|---|
| **기본 폰트** | `text-sm` = 0.875rem | `styles.css` `.p-button` 등 CSS 오버라이드 | ⚠️ formField.fontSize는 button/input에 미전파 |
| 기본 패딩 X | `px-3` = 0.75rem | `formField.paddingX: '0.75rem'` | `{form.field.padding.x}`로 전파됨 ✓ |
| 기본 패딩 Y | `py-2` = 0.5rem | `formField.paddingY: '0.5rem'` | `{form.field.padding.y}`로 전파됨 ✓ |
| sm 폰트 | `text-xs` | `formField.sm.fontSize` | sm/lg는 `{form.field.sm.font.size}`로 전파됨 ✓ |
| 버튼 radius | `rounded-full` | `button.root.borderRadius: '999px'` | ✓ |
| 태그 폰트 | `text-xs` | `tag.root.fontSize` | 컴포넌트 직접 지정 ✓ |

#### 5-A. app.config.ts에 preset 등록

`app.config.ts`에서 `providePrimeNG` 설정을 찾아 아래 패턴으로 교체 (없으면 추가):

```typescript
providePrimeNG({
  theme: {
    preset: {프로젝트명}Preset,
    options: {
      darkModeSelector: '.dark',
      cssLayer: {
        name: 'primeng',
        order: 'theme, base, primeng',  // Tailwind v4와 우선순위 충돌 방지
      },
    },
  },
})
```

---

### Step 6 — Playground 생성

#### 6-A. 라우터 등록

`app.routes.ts`에 lazy route 추가:

```typescript
{
  path: 'playground',
  loadComponent: () =>
    import('./pages/playground/playground.component').then(m => m.PlaygroundComponent),
}
```

#### 6-B. 폴더 구조 생성

```
src/app/pages/playground/
├── playground.component.ts       # 카테고리 탭 컨테이너
├── playground.component.html
├── playground.routes.ts
└── sections/
    ├── tokens/                   # 색상·타이포·스페이싱 갤러리
    ├── buttons/                  # 버튼 변형
    ├── forms/                    # 입력 요소
    ├── data-display/             # 테이블·카드·배지·태그
    ├── feedback/                 # 토스트·알림·프로그레스
    ├── navigation/               # 상단 네비·탭·브레드크럼
    └── overlay/                  # 모달·드로어·드롭다운
```

#### 6-C. Playground 레이아웃 — 단일 스크롤 페이지

Playground는 **탭 방식이 아닌 단일 스크롤 페이지**로 구성한다.
- 상단에 sticky 헤더 + 앵커 네비게이션 버튼
- 각 섹션은 `id` 속성을 가지며 스무스 스크롤로 이동
- 섹션 구분은 `.pg-section-divider` 클래스 사용

**playground.component.ts:**
```typescript
@Component({ ... })
export class PlaygroundComponent {
  sections = [
    { id: 'tokens', label: '토큰' },
    { id: 'buttons', label: '버튼' },
    { id: 'forms', label: '폼' },
    // ...
  ];
  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
```

**playground.component.html 패턴:**
```html
<!-- sticky 헤더 + 앵커 네비 -->
<div class="border-b border-[var(--line)] bg-[var(--surface)] sticky top-0 z-10">
  <div class="max-w-[1280px] mx-auto px-7 py-3.5 flex items-center gap-6">
    <!-- 브랜드 로고 영역 -->
    <div class="flex gap-1">
      @for (s of sections; track s.id) {
        <button class="px-3.5 py-[6px] rounded-full ..."
          (click)="scrollTo(s.id)">{{ s.label }}</button>
      }
    </div>
  </div>
</div>

<!-- 전체 섹션 스크롤 뷰 -->
<div class="max-w-[1280px] mx-auto px-7 py-10 flex flex-col gap-16">
  <div id="tokens">
    <div class="pg-section-divider">토큰</div>
    <app-tokens-section />
  </div>
  <div id="buttons">
    <div class="pg-section-divider">버튼</div>
    <app-buttons-section />
  </div>
  <!-- ... 나머지 섹션 -->
</div>
```

#### 6-D. 각 Section 내부 구조

각 section 컴포넌트 내부는 **두 블록**으로 구성:
- 블록 1: `[Tailwind]` 레이블 + Tailwind 유틸리티 클래스 구현
- 블록 2: `[PrimeNG]` 레이블 + PrimeNG 컴포넌트 구현

두 블록은 **시각적으로 완전히 동일**해야 한다. 동일한 `var(--*)` CSS 변수를 사용하기 때문에 보장된다.

```html
<!-- section 내부 구조 예시 -->
<div class="space-y-6">
  <div>
    <div class="pg-tab-label">Tailwind</div>
    <div class="pg-tab-content">
      <!-- Tailwind 유틸리티 클래스 구현 -->
    </div>
  </div>
  <div>
    <div class="pg-tab-label">PrimeNG</div>
    <div class="pg-tab-content">
      <!-- PrimeNG 컴포넌트 구현 -->
    </div>
  </div>
</div>
```

#### 6-D. Step 2 컴포넌트 인벤토리 기준으로 각 section 구현

Step 2에서 추출한 컴포넌트 목록을 기반으로 실제 HTML/TS를 작성한다.
레퍼런스의 클래스·스타일을 참조하여 Tailwind 탭을 먼저 구현하고,
동일한 디자인을 PrimeNG 컴포넌트로 구현한다.

> ⚠️ **전수 + 양쪽 강제**: Step 2 인벤토리(2-A 타겟 전수 스캔 포함)의 컴포넌트 유닛은 **빠짐없이** 데모 셀로 진열하고, 각 셀은 **[Tailwind]·[PrimeNG] 두 블록이 모두** 있어야 한다. 한쪽 구현이 기술적으로 불가능한 유닛만 예외로 하되 셀에 "(단일 구현 — {사유})" 캡션을 남긴다.

#### 6-E. 칩 주소 체계 + 카탈로그 운영 장치 (`references/shared-ui-playbook.md` §5 준수)

**이 단계 착수 전 `references/shared-ui-playbook.md`를 Read한다.** 핵심 이식 항목:

1. **pg 칩 렌더러** — 재사용 칩 컴포넌트(`pg-chip`) 생성: `pgId`(복사 텍스트) + `tone`('pattern'=골드 / 'component'=에메랄드), 클릭 → clipboard 복사 + 토스트.
2. **데모 셀 크롬 표준** — 카드 헤더 = 패턴명 + 골드 `pg://{섹션}/{슬러그}` 칩 + (공유 컴포넌트로 구현된 셀은) 에메랄드 `app-…` 칩 + font-mono 출처 캡션.
3. **컴포넌트化 셀은 실물 사용** — 타겟에 공유 컴포넌트가 이미 있으면 데모 셀은 원시 마크업 복제 대신 **그 컴포넌트를 직접 렌더**한다(렌더 결과가 곧 baseline). API 밖 변형만 raw 유지 + "(raw — API 미포함 변형)" 캡션.
4. **다크/라이트 토글** — playground 상단 sticky 헤더에 필수. 모든 셀을 양 모드에서 확인.
5. **@defer** — 무거운 섹션(data/overlay/charts 등)은 `@defer (on viewport)`로 감싼다.
6. **REGISTRY 인벤토리** — 타겟에 공유 컴포넌트가 있으면 `src/app/shared/ui/REGISTRY.md`(selector·API 시그니처·pg:// 원천 표)를 생성/갱신한다.
7. **ID 유니크 검사** (완료 전 필수):
   ```bash
   grep -rho 'pg://[a-z-]*/[a-z0-9-]*' {TARGET}/src/app/pages/playground | sort | uniq -d
   # 출력 없어야 통과
   ```

---

### Step 7 — 디자인 규칙 문서 생성 + CLAUDE.md 갱신

#### 7-A. `docs/design-rules.md` 생성

```markdown
# 디자인 규칙

> /kai-design-sync 자동 생성 | {YYYY-MM-DD}
> 레퍼런스: {레퍼런스 경로}

## 화면 작업 필수 참조 순서

화면(UI) 관련 작업 — 수정·생성 모두 해당 — 시작 전 아래 순서로 반드시 확인한다:

1. **Playground** (`/playground`) — 해당 UI 요소의 Tailwind/PrimeNG 구현 참조
2. **디자인 시스템** (`docs/design-system.md`) — 토큰·컴포넌트 사양 확인
3. **레퍼런스** (`{레퍼런스 경로}`) — 원본 디자인 대조

## 토큰 사용 규칙

- 색상은 반드시 CSS 변수(`var(--*)`) 사용, hex 하드코딩 금지
- Tailwind 클래스에서도 `bg-[var(--accent)]` 또는 `@theme`에 등록된 `bg-accent` 형태 사용
- PrimeNG 컴포넌트에서 직접 스타일 지정 시 CSS 변수 참조

## 신규 컴포넌트 추가 시

1. Playground의 해당 카테고리 section에 먼저 추가 (Tailwind + PrimeNG 탭 모두)
2. design-system.md 업데이트
3. 그 다음 실제 화면에 적용

## 토큰 수정 시

`src/styles/_tokens.css`의 `:root {}` 블록만 수정 → Tailwind + PrimeNG 동시 반영
```

#### 7-B. CLAUDE.md 디자인 섹션 교체

타겟 프로젝트의 `CLAUDE.md`를 Read한 후:
- `<!-- KAI-DESIGN-RULES:START -->` ~ `<!-- KAI-DESIGN-RULES:END -->` 마커 블록이 있으면 **그 블록만 교체**
- 마커가 없으면 파일 **맨 아래에 추가**
- 교체 전 반드시 diff를 콘솔에 출력

```markdown
<!-- KAI-DESIGN-RULES:START generated={YYYY-MM-DD} ref={레퍼런스 경로} -->
## ★ 디자인 작업 규칙 (kai-design-sync 자동 생성)

화면 작업 시 반드시 아래 순서를 따른다:

### 참조 우선순위
1. **Playground** (`/playground` 라우트) — 구현 패턴 참조
2. **디자인 시스템** (`docs/design-system.md`) — 토큰·사양 확인
3. **레퍼런스** (`{레퍼런스 경로}`) — 원본 대조

### 핵심 규칙
- 색상은 `var(--*)` CSS 변수만 사용, hex 하드코딩 금지
- 토큰 수정: `src/styles/_tokens.css` `:root` 블록 — Tailwind + PrimeNG 동시 반영
- 신규 UI 요소: Playground에 먼저 추가 → 화면 적용
- Tailwind와 PrimeNG는 동일 디자인 토큰을 공유함

### 컴포넌트 3+1 원칙
1. 공유 컴포넌트 우선 — 인라인 재구현 금지, REGISTRY(있으면) 먼저 검색
2. 중복 감지 → 공용 컴포넌트 승격 + grep으로 앱 전역 교체
3. 신규 컴포넌트는 사용자 승인 후 생성
4. Playground 자동 갱신(상시) — 새 컴포넌트/패턴/화면 = 데모 셀+`pg://` 칩(+REGISTRY 행) 추가까지가 한 작업. 누락 = 미완성

### 폰트
{폰트 정보 — CDN URL 포함}
<!-- KAI-DESIGN-RULES:END -->
```

---

### Step 8 — 완료 보고

```
✅ kai-design-sync 완료

📁 생성된 파일:
  docs/design-system.md
  docs/design-rules.md
  docs/.design-sync/tokens.raw.json
  docs/.design-sync/components.inventory.md
  src/styles/_tokens.css
  src/app/theme/{프로젝트명}-preset.ts
  src/app/pages/playground/ (N개 section)

📝 수정된 파일:
  src/styles.css (또는 styles.scss)
  src/app/app.config.ts
  src/app/app.routes.ts
  CLAUDE.md (디자인 규칙 섹션)

🔤 폰트 주의:
  {외부 폰트가 있으면} → 라이선스 확인 필요 [!]
  CDN URL: {URL}

🔗 참조:
  Playground: http://localhost:4200/playground
  디자인 시스템: docs/design-system.md
```

---

## Red Lines (절대 금지)

- ❌ **레퍼런스 프로젝트 파일 수정** — 읽기(Read/Grep)만 허용
- ❌ **폰트 파일 자동 복사** — 라이선스 위반 가능, URL만 기록
- ❌ **PrimeNG preset에 hex 하드코딩** — 반드시 `var(--*)` CSS 변수 참조
- ❌ **레퍼런스 == 타겟** 경로일 때 진행
- ❌ **기존 파일 백업 없이 덮어쓰기** (`styles.css`, `app.config.ts`, `CLAUDE.md`)
- ❌ **dev 서버 자동 시작** (`ng serve`, `npm run start`) — 사용자 서버 보호 원칙
- ❌ **Playground를 eagerly load** — 반드시 `loadComponent: () => import(...)` lazy 방식
- ❌ **Tailwind V3 / PrimeNG V20 이하 / Angular V20 이하**에서 강제 진행
- ❌ **CLAUDE.md 마커 없이 디자인 섹션 전체 교체** — 마커 기반으로만 교체
- ❌ **단일 Playground 컴포넌트에 모든 요소 집어넣기** — 반드시 sections/ 분할
- ❌ **데모 셀에서 [Tailwind]·[PrimeNG] 중 한쪽 블록 생략** — 비교가 목적. 기술적 불가 시에만 "(단일 구현 — 사유)" 캡션으로 예외
- ❌ **인벤토리 컴포넌트 유닛을 빈도 이유로 playground에서 제외** — 전수 진열, 저빈도는 표시만
- ❌ **`references/shared-ui-playbook.md` 미참조로 칩·REGISTRY·오버레이 래퍼 방식 재발명** — 플레이북이 복제 기준
- ❌ **`html { font-size: 87.5% }` 누락** — PrimeNG가 16px 기준으로 동작하여 Tailwind보다 크게 보임. `_tokens.css`에 반드시 포함
- ❌ **`components.button.root`에 `paddingX/paddingY/sm/lg` 오버라이드** — `semantic.formField`의 전역 상속이 깨져 버튼만 비정상적으로 커짐. 패딩은 formField에서만 제어
- ❌ **`formField.fontSize`만 설정하고 styles.css 오버라이드 생략** — Aura button/inputtext root에 fontSize 토큰 없어 body 폰트 상속됨. PrimeNG 기본 컴포넌트 폰트는 반드시 styles.css에서 `.p-button`, `.p-inputtext` 등 직접 CSS 오버라이드 필요 (핵심 원칙 4)
- ❌ **styles.css 폰트 오버라이드에서 sm/lg 변형 제외 누락** — `.p-button { font-size: X }` 단독 작성 시 sm/lg variant도 덮어씀. `:not(.p-button-sm):not(.p-button-lg)` 반드시 추가
