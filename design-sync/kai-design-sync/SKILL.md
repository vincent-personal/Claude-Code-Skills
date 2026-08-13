---
name: kai-design-sync
description: |
  레퍼런스(HTML 파일 또는 프로젝트 경로)에서 디자인 시스템을 추출하여
  타겟 프로젝트에 완전히 동일한 테마로 적용하고, playground 컴포넌트와
  디자인 규칙을 생성하는 전역 스킬. 타겟 스택 자동 감지 + 모드 확정 질문 — 3모드:
  ① Tailwind V4 + spartan/ui (신규 프로젝트 추천 · shadcn식 copy-in)
  ② Tailwind V4 + PrimeNG V21 (기존 프로젝트 · 유료 전환 유의)
  ③ Ionic 8 순수 중앙 통합 테마 (Tailwind·PrimeNG 불사용).
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

**핵심 원칙 6 — 모드별 보완 문서 참조:** 규칙 문서 산출(Step 3·Step 7)과 검증 체크리스트 작성 시 `references/00-common-design-system-rules.md`(공통) + 실행 모드에 해당하는 문서 1부(`references/01-ionic.md` / `references/02-tailwind-primeng.md` / `references/03-tailwind-spartan.md`)를 참고하여 함정·체크리스트 항목을 산출물에 반영한다. 이 문서들은 본 스킬 규정의 **보완**이며, 충돌 시 스킬 규정이 우선한다.

**핵심 원칙 7 — 아이콘 기본값은 Iconify (전 모드 공통):** 사용자가 특별히 명시하지 않는 한 아이콘은 **Iconify**(`iconify-icon` 웹컴포넌트)를 쓴다. Angular 컴포넌트에서 사용 시 `schemas: [CUSTOM_ELEMENTS_SCHEMA]` 필수. 레퍼런스가 다른 아이콘셋(lucide·heroicons·ionicons 등)을 쓰면 해당 아이콘을 Iconify 컬렉션 이름(`lucide:*`, `heroicons:*` 등)으로 매핑해 기록한다. primeicons(PrimeNG 내부)·ionicons(Ionic 내부)은 라이브러리 컴포넌트가 자체 요구하는 곳에만 남기고, **앱 레벨 아이콘은 Iconify로 통일**한다. 이 규칙은 design-rules.md·CLAUDE.md 마커 블록에도 포함시킨다.

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

**타겟 모드 감지 + 사용자 확정 질문 (스택 검증 전 · 필수):**

3모드를 지원한다: `primeng`(Tailwind V4 + PrimeNG V21) / `spartan`(Tailwind V4 + spartan/ui) / `ionic`(순수 Ionic 중앙 테마).

```bash
grep -c '"@ionic/angular"' {TARGET}/package.json   # >0 → ionic 후보
grep -c '"primeng"'        {TARGET}/package.json   # >0 → primeng 후보
grep -c '"@spartan-ng/'    {TARGET}/package.json   # >0 → spartan 후보
```

**결정 규칙 (질문은 AskUserQuestion 도구로):**
1. `@ionic/angular` 감지 → **질문 없이 `MODE=ionic`** (모바일 프레임워크가 이미 확정돼 있어 다른 선택지가 무의미).
2. PrimeNG 또는 spartan이 **이미 설치**됨 → 감지된 모드를 "(Recommended)" 기본값으로 하여 **1회 확정 질문** — 사용자가 다른 모드를 고르면 그 모드로 진행 (이 경우에도 선택 = 그 모드 미설치 패키지의 설치 승인).
3. UI 라이브러리(ionic·primeng·spartan) 어느 것도 없음 — **Tailwind만 설치된 타겟 포함** → **반드시 2택 질문 — spartan을 첫 번째 "(Recommended)" 옵션으로**:
   ① **Tailwind + spartan/ui (Recommended)** — 신규 프로젝트 기본 선택 (오픈소스 · 필요 컴포넌트 충분)
   ② Tailwind + PrimeNG — 설명에 "⚠️ 유료 라이선스 전환" 명시
   감지 결과만으로 추정해 진행하지 않는다. **질문에서 선택됨 = 그 스택의 미설치 패키지 설치 승인**으로 간주하고, 확정 모드에서 빠진 패키지(예: Tailwind-only 타겟이면 `primeng` 또는 `@spartan-ng/*` 계열, Tailwind 자체가 없으면 `tailwindcss`)를 해당 모드의 설치 절차로 설치한다 (설치 내역은 Step 8 보고에 명시).
   > PrimeNG를 추천 기본값으로 두지 않는 이유: 유료 전환. 신규 프로젝트는 spartan 우선이 정책이다 (기존 PrimeNG 프로젝트는 규칙 2로 기존 스택 유지).

- `MODE=primeng` (기본) → 아래 스택 검증·보조 패키지 설치 그대로 진행.
- `MODE=spartan` → **§spartan 모드 치환표를 따른다**: PrimeNG 관련 검증·보조 3종 설치·정렬 트릭(핵심 원칙 2·3·4·cssLayer)을 적용하지 않는다.
- `MODE=ionic` → **§Ionic 모드 치환표를 따른다**: 코어 검증은 Angular V20+ + `@ionic/angular` V8+만 확인하고, **Tailwind·PrimeNG 부재는 정상이며 설치하지 않는다** (보조 3종 설치 단계도 skip). 절차·산출물은 전부 동일하되 Step 4·5·6의 구현 대상만 치환된다.

**스택 검증 (타겟 프로젝트 · 코어 3종):**

```bash
# Tailwind V4 확인
grep -r "tailwindcss" {TARGET}/package.json

# PrimeNG V21 확인
grep -r "primeng" {TARGET}/package.json

# Angular V21 확인
grep -r "@angular/core" {TARGET}/package.json
```

- **구버전 발견 시 → BLOCKED**: Tailwind V3 / PrimeNG V20 이하 / Angular V20 이하 — 메이저 업그레이드는 침습적이므로 사용자 몫, 자동 업그레이드 금지.
- **`@angular/core` 부재 → BLOCKED**: Angular 도입 자체는 프로젝트 구조 결정이므로 자동 설치 금지.
- **모드 스택 패키지(`tailwindcss`·`primeng`·`@spartan-ng/*`) 부재** → 모드 확정 질문에서 그 스택이 **선택된 경우에 한해** 설치 승인으로 간주하고 설치한다 (결정 규칙 2·3). 질문 없이 부재 상태로 진행하거나 임의 설치하는 것은 금지.

**보조 패키지 검증 + 자동 설치 (Step 4~5 산출물의 빌드 전제):**

이 스킬이 생성하는 코드가 import하는 보조 패키지 3종은 **부재 시 자동 설치한다** (없으면 Step 4-C의 `@import`·Step 5 preset이 빌드를 깨뜨림):

```bash
cd {TARGET}
MISSING=""
for pkg in tailwindcss-primeui primeicons @primeuix/themes; do
  grep -q "\"$pkg\"" package.json || MISSING="$MISSING $pkg"
done
if [ -n "$MISSING" ]; then
  echo "📦 보조 패키지 설치:$MISSING"
  npm install$MISSING
fi
```

- 설치한 패키지는 Step 8 완료 보고에 명시한다 (package.json 변경 사실 고지).
- `npm install` 실패 시 → BLOCKED 보고 후 종료 (실패한 채 진행하면 Step 4~5 산출물이 빌드 불가).
- dev 서버는 여전히 건드리지 않는다 — 설치는 의존성 추가일 뿐, 서버 시작 금지 원칙과 무관.

Step 0 완료 후 다음을 사용자에게 보고:
```
✅ 레퍼런스: {경로} ({타입: HTML파일 | 프로젝트})
✅ 타겟: {TARGET}
✅ 스택: Angular {버전} / Tailwind {버전} / PrimeNG {버전}
📦 보조 패키지: {이미 있음 | N종 설치함: ...}
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

📦 설치된 보조 패키지:
  {Step 0에서 설치했으면 목록 + package.json 변경 고지 | 없으면 "없음 (모두 기존재)"}

🔤 폰트 주의:
  {외부 폰트가 있으면} → 라이선스 확인 필요 [!]
  CDN URL: {URL}

🔗 참조:
  Playground: http://localhost:4200/playground
  디자인 시스템: docs/design-system.md
```

---

## 🅢 spartan 모드 — 단계별 치환표 (MODE=spartan)

> **대원칙**: 산출물·절차·칩 체계·문서 골격은 기본 모드와 전부 동일하다. PrimeNG 자리에 **spartan/ui**
> (shadcn식 copy-in 컴포넌트 — headless `@spartan-ng/brain` + 코드베이스에 복사되는 helm)가 들어간다.
> spartan은 컴포넌트 자체가 Tailwind로 스타일되므로 **PrimeNG 정렬 트릭이 전부 불필요**하다:
> 핵심 원칙 2(`html font-size 87.5%`)·3·4(폰트 CSS 오버라이드)와 `providePrimeNG cssLayer`를 **적용하지 않는다**.

| 기본 모드 | spartan 모드 치환 |
|---|---|
| Step 0 보조 3종(primeui·primeicons·@primeuix) | **0-S** `@spartan-ng/brain` + `@spartan-ng/cli`(dev) 설치 + `ui-theme` 스캐폴드 |
| Step 5 PrimeNG preset (`*-preset.ts`) | **5-S** shadcn식 테마 변수 매핑 (`:root`/`.dark`) |
| (없음) | **5-S-b** helm 컴포넌트 CLI 생성 + 수정 규율 |
| Step 6 [Tailwind]·[PrimeNG] 이중 블록 | **6-S** [Tailwind raw]·[spartan/ui] 이중 블록 |
| 핵심 원칙 2·3·4 (rem·폰트 정렬 트릭) | **적용 안 함** (단일 Tailwind 체계라 정렬 대상이 없음) |

### 0-S. 설치·검증

- **코어**: Angular V20+ (부재·미달 → BLOCKED — 자동 설치 금지, 기본 모드와 동일 원칙).
- **Tailwind V4 부재 시**: 이 모드는 Step 0 질문에서 명시 선택된 것이므로 **선택 = 설치 승인** — `npm install tailwindcss @tailwindcss/postcss` 후 Angular 표준 설정(`.postcssrc.json`)을 구성한다.
- **spartan**: `npm install @spartan-ng/brain` + `npm install -D @spartan-ng/cli` → `ng g @spartan-ng/cli:ui-theme` (공식 테마 스캐폴드 — 이후 5-S가 마커로 감싸 교체).
- 설치 실패 → BLOCKED 종료 (실패 채 진행 금지). 설치 내역은 Step 8 보고에 명시.

### 5-S. 테마 매핑 — shadcn식 변수 (`:root` / `.dark` · 공식 사양)

spartan helm은 shadcn 계열 변수를 참조하며, 값은 **전체 색값(oklch/hex) 형식**이다 (hsl 성분값 아님 — 구세대 shadcn과 다름). `ui-theme`가 생성한 기본 블록을 마커(`/* KAI-DESIGN-SPARTAN:START */`~`END`)로 감싸 우리 토큰 매핑으로 교체한다(멱등). 값은 `var(--*)` 참조 — 색상 리터럴은 primitive 토큰에서만 (핵심 원칙 1).

**매핑표 (우리 토큰 → spartan 변수 · `-foreground` 짝 필수):**

| spartan 변수 | 우리 토큰 |
|---|---|
| `--background` / `--foreground` | `--bg` / `--ink` |
| `--card`·`--popover` (+`-foreground`) | `--surface` / `--ink` |
| `--primary` / `--primary-foreground` | `--accent` / `--accent-ink` |
| `--secondary`·`--muted`·`--accent`(spartan) (+`-foreground`) | `--bg-2`·soft 계열 / `--text-secondary` |
| `--muted-foreground` | `--text-tertiary` |
| `--destructive` | `--danger` |
| `--border`·`--input` | `--line` |
| `--ring` | `--accent` |
| `--radius` | `--radius` |

- 레퍼런스에 다크 팔레트가 있으면 동일 세트를 `.dark` 스코프에 정의하고 `color-scheme: dark`를 병기한다.
- 우리 토큰에 대응이 없는 변수(sidebar 계열 등)는 가장 가까운 semantic 토큰으로 매핑하고 design-system.md 매핑표에 기록한다.

### 5-S-b. helm 컴포넌트 생성 + 수정 규율 (copy-in 모델)

- **기성품 우선 원칙 (자작 금지 기본값)**: UI 요소가 필요하면 순서대로 — ① spartan 카탈로그에서 해당 컴포넌트를 찾아 `ng g @spartan-ng/cli:ui {이름}` 으로 생성 ② 없으면 `@spartan-ng/brain` 프리미티브 조합 ③ 그래도 불가할 때만 자작하되 반드시 중앙(shared/ui)에 두고 REGISTRY에 등록. **spartan에 있는 것을 두고 직접 만드는 것은 금지** — 디자인이 달라 보여도 만들지 말고 테마 변수(5-S)로 우리 디자인 시스템과 일치시킨다.
- Step 2 인벤토리에 필요한 컴포넌트만 복사-인한다 (**전량 일괄 생성 금지** — dead code). 배치 경로는 design-rules.md에 기록.
- **수정 2단 규율**: ① 색·반경·간격 조정은 **테마 변수(5-S)에서만** — helm 파일을 열지 않는다. ② 구조·variant 추가가 필요할 때만 helm 파일을 직접 수정하고, 수정한 helm은 REGISTRY.md에 **"(modified)"** 표기한다.
- ⚠️ **CLI 재생성은 수정을 덮어쓴다** — 재생성 전 REGISTRY "(modified)" 확인 + diff 필수.

### 7-S. 중앙 관리 규율 (design-rules.md·CLAUDE.md 마커 블록에 추가)

**모든 시각 결정은 중앙 3곳에서만 이뤄진다**: ① 테마 변수(5-S) ② helm/shared 컴포넌트(5-S-b) ③ playground(진열·baseline). 페이지·화면 레벨에서는:
- 새 색·간격·반경·그림자 값 정의 금지 — 필요하면 먼저 토큰·테마 변수에 추가 후 소비
- 일회성 CSS·인라인 스타일로 컴포넌트 겉모습 조정 금지 — variant가 필요하면 중앙에서 `.ds-*`/helm variant로 추가 후 사용
- 같은 UI를 페이지마다 재구현 금지 — REGISTRY 먼저 검색, 있으면 import, 유사하면 variant 승격
→ 목적: **분산 디자인 원천 차단** — 수정은 언제나 중앙 1곳, 전체 반영.

### 6-S. Playground 이중 블록

Step 6 절차(단일 스크롤·sections/·칩·전수 진열·REGISTRY·다크/라이트 토글·@defer) 전부 동일. 각 데모 셀의 두 블록만 치환:
- 블록 1 `[Tailwind]` — raw 유틸리티 구현
- 블록 2 `[spartan/ui]` — helm 컴포넌트 구현
두 블록이 같은 `var(--*)`를 공유하므로 시각 동일이 보장된다.

---

## 🅘 Ionic 모드 — 단계별 치환표 (MODE=ionic)

> **대원칙**: 산출물 목록·실행 절차·칩 체계·문서 골격·Red Lines는 **기본 모드와 전부 동일**하다.
> 바뀌는 것은 오직 "디자인 구현 수단" — Tailwind → **순수 SCSS(중앙 통합 테마)**, PrimeNG preset → **Ionic 테마 변수**.
> Tailwind·PrimeNG를 **설치하지도, 쓰지도 않는다.**

| 기본 모드 | Ionic 모드 치환 |
|---|---|
| Step 4 `src/styles/_tokens.css` (@theme) | **4-I** `src/theme/tokens.scss` (`:root` 변수만) |
| Step 5 PrimeNG preset (`*-preset.ts`) | **5-I** `variables.scss` `--ion-*` 매핑 + 컴포넌트 중앙 기본값 |
| (없음) | **5-I-b** `src/theme/components.scss` — 레퍼런스 시각 클래스 이식 |
| Step 6 [Tailwind]·[PrimeNG] 이중 블록 | **6-I** [Custom CSS]·[Ionic 컴포넌트] 이중 블록 |
| 핵심 원칙 2 `html { font-size: 87.5% }` | **적용 금지** (Ionic 컴포넌트 크기가 흔들림) |

### 4-I. 토큰 계층 — `src/theme/tokens.scss`

Step 1 추출 토큰(레퍼런스가 claude 디자인 export면 `_ds/*/tokens/*.css`의 `:root` 변수를 그대로)을 `src/theme/tokens.scss`에 이식하고 `global.scss` 최상단에서 import한다. 색상·반경·간격·그림자 전부 CSS 변수 — **단일 진실원** (핵심 원칙 1 동일 적용).

**토큰 3계층 구분 (중복 진실원 방지):**
```scss
:root {
  --color-blue-600: #1d4ed8;                       /* ① primitive — 색상 리터럴은 여기서만 허용 */
  --color-action-primary: var(--color-blue-600);   /* ② semantic — 용도명, var() 참조만 */
  /* ③ mapping(--ion-*)은 5-I variables.scss — var() 참조만 */
}
```
"hex 하드코딩 금지"의 정확한 의미: **primitive 선언에만 리터럴 허용**, semantic·mapping·component·페이지 계층은 `var(--*)`만.

### 5-I. Ionic 매핑 계층 — `variables.scss` (백업 후 마커 기반 · 공식 테마 사양 준수)

`src/theme/variables.scss`를 백업 후, 마커(`/* KAI-DESIGN-IONIC:START */` ~ `END`) 블록으로 추가/교체한다:

1. **모드 통일 (3플랫폼 동일 디자인의 전제)**: Ionic은 플랫폼별로 iOS/MD 두 모드의 스타일을 달리 적용한다 — 그대로 두면 **네이티브 iOS·Android·웹에서 서로 다른 모양**이 된다. 레퍼런스와 픽셀 동일이 목표이므로 `app.config.ts`(또는 main.ts)에서 **단일 모드로 고정**한다:
   ```typescript
   provideIonicAngular({ mode: 'md' })  // 전 플랫폼 동일 렌더링
   ```
   (플랫폼 네이티브 감각을 살릴 특별한 이유가 있을 때만 양 모드 유지 + `:root.ios, :root.md` 병기로 변수 통일)
   > ⚠️ **의식적 트레이드오프**: iOS에 md 고정은 Ionic의 Dynamic Font Scaling 권고(iOS=ios 모드)와 상충한다 — 픽셀 일관성을 얻는 대신 플랫폼 네이티브 타이포 최적화를 포기하는 것. 하여 **OS 글꼴 최대 배율에서 헤더/버튼 잘림·겹침이 없는지 시험**을 완료 조건에 포함한다. 같은 이유로 **root(`html`) font-size 재정의는 87.5%뿐 아니라 일체 금지**(Dynamic Font Scaling 방해).

2. **팔레트 매핑 (색상당 6종 변형 의무 — 공식 사양)**: 토큰 → Ionic 색상은 base만으로 동작하지 않는다. **반드시 6종 세트**로 정의한다:
   ```scss
   :root {
     --ion-color-primary: var(--accent);
     --ion-color-primary-rgb: {accent의 R, G, B};        /* 투명도 조합용 — rgb 삼중값 필수 */
     --ion-color-primary-contrast: var(--accent-ink);
     --ion-color-primary-contrast-rgb: {accent-ink의 R, G, B};
     --ion-color-primary-shade: var(--accent-active);     /* 눌림 상태 */
     --ion-color-primary-tint: var(--accent-hover);       /* 밝은 변형 */
   }
   ```
   토큰에 없는 색(danger·warning 등)도 동일 세트로. **커스텀 색 추가 시 `.ion-color-{이름}` 클래스가 반드시 함께** 있어야 `<ion-button color="{이름}">`이 동작한다 (공식 필수 규칙):
   ```scss
   .ion-color-brand {
     --ion-color-base: var(--ion-color-brand);
     --ion-color-base-rgb: var(--ion-color-brand-rgb);
     --ion-color-contrast: var(--ion-color-brand-contrast);
     --ion-color-contrast-rgb: var(--ion-color-brand-contrast-rgb);
     --ion-color-shade: var(--ion-color-brand-shade);
     --ion-color-tint: var(--ion-color-brand-tint);
   }
   ```

3. **애플리케이션 변수 + stepped colors 재생성 (⚠️ 누락 시 컴포넌트 깨짐)**: `--ion-background-color`·`--ion-text-color`를 토큰으로 바꾸면, Ionic 컴포넌트들이 내부적으로 쓰는 **stepped colors 두 계열(`--ion-text-color-step-50~950`·`--ion-background-color-step-50~950`)을 반드시 함께 재생성**해야 한다 — 안 하면 보더·구분선·비활성 텍스트가 기본 흑백 혼합으로 남아 테마가 어긋난다.
   **생성 방식: 스킬이 이식 시점에 혼합값을 직접 계산하여 정적 hex로 기록한다** (텍스트 스텝 = ink→bg 5% 간격 혼합, 배경 스텝 = bg→ink 5% 간격 혼합, 각 50~950 전 단계):
   ```scss
   :root {
     --ion-background-color: var(--bg);
     --ion-background-color-rgb: {bg의 R, G, B};
     --ion-text-color: var(--ink);
     --ion-text-color-rgb: {ink의 R, G, B};
     /* stepped — 이식 시점 정적 계산값 (예: ink #111827 × bg #f7f2ea) */
     --ion-text-color-step-50:  #1c2330;   /* 5% */
     --ion-text-color-step-100: #272e3a;   /* 10% */
     /* ... step-950까지 · background 계열 동일 패턴 ... */
   }
   ```
   > ⛔ `color-mix()`를 기본 생성 방식으로 쓰지 않는다 — Ionic 8 공식 지원 범위(WebView/Chrome 89+)에 color-mix 미지원 구간(89~110)이 있어 그 기기에서 스텝이 통째로 죽는다. 정적값이 기본이고, color-mix는 `@supports` 블록 안의 점진 향상으로만 선택 사용.

4. **컴포넌트 중앙 기본값 + semantic variant**: 앱이 쓰는 ion-* 컴포넌트의 디자인을 **여기서 1회 확정**한다. 단, 전역 요소 셀렉터는 alert·toolbar·modal 내부까지 전부 물들이므로 **전역에는 안전한 공통값만** 두고, 변형은 **`.ds-*` semantic variant 클래스**로 중앙 정의한다:
   ```scss
   ion-button { --border-radius: var(--radius); text-transform: none; }  /* 전역: 안전한 공통값만 */
   ion-button.ds-compact { --padding-start: 0.5rem; --padding-end: 0.5rem; min-height: 32px; }
   ion-card   { --background: var(--surface); box-shadow: var(--shadow-sm); border-radius: var(--radius-lg); }
   /* Step 2 인벤토리에 등장하는 ion-* 전 종 + 레퍼런스에 보이는 변형을 .ds-*로 커버 */
   ```
   페이지 규율: **새 시각값 정의는 금지**하되, 중앙에 정의된 `.ds-*` variant와 공개 CSS 변수의 **소비는 허용** (절대 금지로 두면 인라인 우회를 유발한다).

5. **Shadow DOM 규칙 (정밀)**: ion-* 는 Shadow/Scoped/Light DOM이 혼재한다 — **각 컴포넌트 API 문서가 공개하는 CSS 변수·Shadow Parts를 우선 사용**하고, Shadow DOM 내부 비공개 구조는 선택하지 않는다(`::ng-deep` 금지). `::part()`는 공개된 part만·체이닝 불가. 공개 API로 재현 불가한 디테일은 "공개 API 범위 내 최접근"으로 판정하고 그 사실을 데모 셀 캡션에 남긴다.

6. **다크 모드 (레퍼런스에 다크 팔레트가 있을 때)**: `@ionic/angular/css/palettes/dark.class.css`(수동 토글) 또는 `dark.system.css`(OS 추종) 택1. 배선 필수 3종: ① 다크 토큰 매핑은 **Ionic 팔레트 import "뒤"에** 같은 스코프 강도(`.ion-palette-dark` — class 방식이면 **`html` 요소에 부착**)로 정의(순서·구체성에서 밀리면 Ionic 기본 다크가 이김) ② **다크용 stepped colors도 재생성** ③ 네이티브면 Capacitor StatusBar 색을 팔레트 전환과 함께 동기화.

### 5-I-c. 3플랫폼 필수 요건 (네이티브 · 모바일웹 · 데스크탑웹)

이 앱은 세 환경에서 모두 돌아간다 — 아래를 빠뜨리면 특정 환경에서만 깨진다:

- **Safe Area (네이티브)**: 노치·홈 인디케이터 영역은 `var(--ion-safe-area-top/bottom/left/right)`로 처리한다. 레퍼런스의 `ms-*` 셸 클래스를 이식할 때 고정 헤더/풋터 패딩에 이 변수를 **합산**해 둔다 (웹에서는 0으로 해석되어 무해).
- **hover는 데스크탑 전용으로 격리**: 터치 기기에서 hover 스타일이 "끼임" 현상을 만든다 — 모든 hover 규칙은 `@media (hover: hover)` 안에만 작성한다.
- **데스크탑 셸 전략을 명시적으로 결정**: 모바일 설계 화면이 데스크탑 전폭으로 늘어지면 깨진다. 둘 중 하나를 design-rules.md에 기록한다: ① 중앙 고정폭 셸(`max-width` + 중앙 정렬 — 레퍼런스의 폰 프레임 방식) ② 브레이크포인트별 반응형 재배치. 미결정 상태로 두지 않는다.
- **스크롤은 `ion-content`에 위임**: 커스텀 `overflow` 스크롤 컨테이너를 만들지 않는다 — 네이티브 관성 스크롤·키보드 회피·pull-to-refresh가 ion-content에 묶여 있다. 레퍼런스의 스크롤 영역(`ms-scroll` 류)은 이식 시 ion-content 내부 레이아웃으로 재배치한다.
- **네이티브 시스템 UI 동기화**: 웹 CSS만으로 끝나지 않는다 — Capacitor **StatusBar 스타일/배경**(라이트·다크 각각), 스플래시 배경색 = 첫 화면 배경 토큰 일치, 키보드 열림 시 입력창·푸터 가림 여부를 확인 항목에 포함한다.
- **safe-area 적용 범위**: 고정 헤더/풋터 외에 `fullscreen` ion-content·모달/시트·FAB(fixed slot)·가로모드 좌우 노치도 대상이다 — 기본 `ion-header+content+footer` 구조를 벗어나는 화면마다 개별 확인.
- **접근성 최소선**: OS 글꼴 최대 배율에서 잘림·조작 불가 없음(픽셀 동일 기준은 기본 배율에만 적용), 애니메이션은 `@media (prefers-reduced-motion: reduce)` 존중.
- **픽셀 동일의 한계 명시**: OS별 글꼴 래스터라이징 차이로 "완전 동일 픽셀"은 불가 — 목표는 **동일 viewport 기준 시각적 회귀 없음**으로 정의하고 design-rules.md에 그리 기록한다.
- **검증 3종 세트**: Step 8 완료 전 ① 데스크탑 브라우저 ② 모바일 뷰포트(devtools 에뮬레이션) ③ 가능하면 실기기/시뮬레이터(`npx cap run` — 에뮬레이션은 네이티브 WebView를 대체하지 못함)에서 playground를 확인하고, 불가한 항목은 보고서에 **미검증으로 명시**한다.

### 5-I-b. 공유 시각 계층 — `src/theme/components.scss`

레퍼런스의 커스텀 시각 클래스(예: `ms-*`)를 **번역 없이 그대로 이식**한다 (Tailwind 유틸리티로 변환하지 않는다 — 이식이 곧 픽셀 충실). 카드·배지·리스트행 등 시각 요소는 이 계층의 완성품 클래스로 쓰고, ion-* 는 구조(내비게이션·시트·제스처)에 집중시킨다.

- **스코프 제한**: 전역 평면에 두지 않고 **`ion-app` 하위로 중첩**하여 이식한다 (`ion-app { .ms-card { ... } }`) — 타 라이브러리와의 이름 충돌·전역 누수 방지.
- **스크롤 재배치**: 레퍼런스의 자체 스크롤 클래스(`ms-scroll` 류)는 `overflow`를 제거하고 ion-content 내부 레이아웃으로 옮긴다 (5-I-c 스크롤 위임 원칙).

### 6-I. Playground 이중 블록

Step 6 절차(단일 스크롤·sections/·칩·전수 진열·REGISTRY·다크/라이트 토글·@defer) 전부 동일. 각 데모 셀의 두 블록만 치환:
- 블록 1 `[Custom CSS]` — 5-I-b 공유 클래스 구현
- 블록 2 `[Ionic]` — 동일 디자인의 ion-* 컴포넌트 구현 (5-I 중앙 변수로 스타일됨)
두 블록이 같은 `var(--*)`를 공유하므로 시각 동일이 보장된다.

**안 먹을 때 판별법 (design-rules.md·CLAUDE.md 블록에 포함시킬 것):**
> 스타일이 적용되지 않으면 — 그 요소가 **내가 쓴 일반 HTML**이면 구체성/이식 누락 문제(공유 계층 확인), **`ion-*` 태그 내부**면 Shadow DOM — 클래스가 아니라 `--ion-*` 변수·`::part()`로 전환한다.

### 7-I. 규율 (design-rules.md·CLAUDE.md 마커 블록에 추가)

- **페이지에서 인라인 스타일·일회성 CSS 정의 금지** — 필요한 디자인은 먼저 중앙(5-I/5-I-b)에 정의·수정 후 사용 (중앙 통합 테마의 성패 조건)
- 신규 ion-* 컴포넌트 도입 시: variables.scss 중앙 기본값 + playground 셀 추가까지가 한 작업

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
- ❌ **코어 스택(Angular·Tailwind·PrimeNG) 자동 설치·업그레이드** — 메이저 스택은 BLOCKED 보고만. 자동 설치는 보조 3종(tailwindcss-primeui·primeicons·@primeuix/themes)에 한정
- ❌ **보조 패키지 설치 실패 상태로 Step 4 진행** — 산출물이 빌드 불가가 됨. BLOCKED 종료
- ❌ **CLAUDE.md 마커 없이 디자인 섹션 전체 교체** — 마커 기반으로만 교체
- ❌ **단일 Playground 컴포넌트에 모든 요소 집어넣기** — 반드시 sections/ 분할
- ❌ **데모 셀에서 [Tailwind]·[PrimeNG] 중 한쪽 블록 생략** — 비교가 목적. 기술적 불가 시에만 "(단일 구현 — 사유)" 캡션으로 예외
- ❌ **인벤토리 컴포넌트 유닛을 빈도 이유로 playground에서 제외** — 전수 진열, 저빈도는 표시만
- ❌ **`references/shared-ui-playbook.md` 미참조로 칩·REGISTRY·오버레이 래퍼 방식 재발명** — 플레이북이 복제 기준

**spartan 모드 (MODE=spartan) 전용 Red Lines:**
- ❌ **PrimeNG 혼입** — 한 앱에 두 UI 컴포넌트 프레임워크 금지 (오버레이·포커스·번들 중복)
- ❌ **spartan 카탈로그에 있는 컴포넌트를 두고 자작** — 기성품 우선(helm → brain 조합 → 최후에 자작), 디자인 차이는 테마 변수로 해소
- ❌ **페이지·화면 레벨에서 시각 값(색·간격·반경) 정의** — 중앙 3곳(테마 변수·중앙 컴포넌트·playground)에서만 (7-S 분산 디자인 금지)
- ❌ **helm 파일에 색상 리터럴** — 수정 시에도 테마 변수 `var(--*)`만
- ❌ **수정된 helm을 CLI 재생성으로 무확인 덮어쓰기** — REGISTRY "(modified)" 확인 + diff 후에만
- ❌ **핵심 원칙 2·3·4(rem 87.5%·PrimeNG 폰트 오버라이드)·cssLayer를 spartan 모드에 적용** — 불필요하며 유해
- ❌ **spartan 변수를 hsl 성분값 형식으로 기록** — 현행 spartan은 전체 색값(oklch/hex) 형식

**Ionic 모드 (MODE=ionic) 전용 Red Lines:**
- ❌ **Tailwind·PrimeNG 설치/도입** — 순수 Ionic 중앙 테마가 결정사항. 유틸리티가 필요하면 5-I-b 공유 클래스로
- ❌ **root(`html`) font-size 재정의 일체** — 87.5% 트릭 포함 전면 금지. Ionic Dynamic Font Scaling·컴포넌트 크기 체계가 흔들림 (기본 모드 전용 트릭)
- ❌ **stepped colors를 `color-mix()` 기본 생성** — WebView 89~110 구간에서 통째로 죽음. 정적 계산값 기본, color-mix는 `@supports` 점진 향상만
- ❌ **`::ng-deep`·Shadow DOM 침투 시도** — ion-* 내부는 컴포넌트 CSS 변수·`::part()`만
- ❌ **커스텀 색 추가 시 `.ion-color-{이름}` 클래스 누락** — `color=` 속성이 조용히 무시됨 (공식 필수 규칙)
- ❌ **`--ion-background-color`/`--ion-text-color` 변경 시 stepped colors(50~950) 미재생성** — 보더·비활성 텍스트가 기본 흑백 혼합으로 남아 테마 어긋남
- ❌ **페이지에서 인라인 스타일·일회성 CSS 정의** — 중앙(5-I/5-I-b)에 먼저 정의 후 사용
- ❌ **hover 규칙을 `@media (hover: hover)` 밖에 작성** — 터치 기기 hover 끼임
- ❌ **커스텀 overflow 스크롤 컨테이너 생성** — 스크롤은 ion-content 위임 (네이티브 관성·키보드 회피 상실)
- ❌ **`html { font-size: 87.5% }` 누락** — PrimeNG가 16px 기준으로 동작하여 Tailwind보다 크게 보임. `_tokens.css`에 반드시 포함
- ❌ **`components.button.root`에 `paddingX/paddingY/sm/lg` 오버라이드** — `semantic.formField`의 전역 상속이 깨져 버튼만 비정상적으로 커짐. 패딩은 formField에서만 제어
- ❌ **`formField.fontSize`만 설정하고 styles.css 오버라이드 생략** — Aura button/inputtext root에 fontSize 토큰 없어 body 폰트 상속됨. PrimeNG 기본 컴포넌트 폰트는 반드시 styles.css에서 `.p-button`, `.p-inputtext` 등 직접 CSS 오버라이드 필요 (핵심 원칙 4)
- ❌ **styles.css 폰트 오버라이드에서 sm/lg 변형 제외 누락** — `.p-button { font-size: X }` 단독 작성 시 sm/lg variant도 덮어씀. `:not(.p-button-sm):not(.p-button-lg)` 반드시 추가
