---
name: kai-task-run
description: |
  현재 프로젝트의 docs/check-list.md에서 미시작 항목 하나를 선점하고 완수하는 전역 스킬.
  트리거: /kai-task-run
  다중 에이전트 환경에서 [~] 선점 마커 + 영향 파일 충돌 검사로 안전성 확보.
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

# kai-task-run — 작업 실행 스킬

## 🤖 자율 실행 원칙 (최상위 규칙 — 모든 Step보다 우선)

**이 스킬은 사용자 확인을 일절 요청하지 않는다. 모든 결정을 스스로 내리고 즉시 실행한다.**

- ❌ "확인이 필요합니다" 출력 금지
- ❌ "어떻게 할까요?" 출력 금지
- ❌ "진행해도 될까요?" 출력 금지
- ✅ 모호한 상황 → 가장 합리적인 해석으로 즉시 진행, 판단 근거만 기록
- ✅ 여러 선택지 → 프로젝트 컨벤션에 맞는 것 자동 선택, 사유 기록
- ✅ 파일 수정, 빌드 실행, git 커밋·푸시 → 모두 확인 없이 즉시 실행
- ✅ 막히면 자체 판단으로 해결 시도, 완전히 불가능한 경우에만 `[!]` 마킹 후 종료
- ✅ **한 항목 수정 완료 → 즉시 커밋** — 여러 항목을 묶어서 커밋하지 않는다. 항목 하나가 끝날 때마다 반드시 커밋한다.

---

## 역할

현재 프로젝트의 `docs/check-list.md`에서 미시작(`- [ ]`) 항목을 하나 선점하여
작업을 완수하고 완료(`- [x]`) 처리한다.

다중 에이전트 환경 안전장치:
1. `[~]` 선점 마커 + 타임스탬프
2. 영향 파일 충돌 검사
3. 좀비 선점 자동 복구 (30분 timeout)
4. 빌드 lock으로 동시 빌드 직렬화

---

## ⚠️ 최우선 안전 규칙 — 워크트리 절대 금지

> **이 규칙을 어기면 수십 개의 수정 사항이 분실될 수 있다. 실제로 발생한 사고다.**

### 금지 사항

- ❌ `git worktree add` 로 워크트리 생성 금지
- ❌ `cp`, `rsync` 등으로 워크트리 ↔ 원본 파일 동기화 금지
- ❌ 워크트리 내부에서만 빌드 통과 확인 후 "완료" 처리 금지

### 반드시 할 것

모든 코드 수정은 **git 루트(Step 0에서 탐지한 경로) 아래의 원본 파일**에서만 수행한다.

```bash
git rev-parse --show-toplevel
# 이 경로가 작업 대상 경로와 일치하는지 반드시 확인
```

---

## ⚡ 실행 절차

### Step 0 — 프로젝트 루트 탐지

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

이 경로를 `PROJECT_ROOT`로 고정한다.
체크리스트 경로: `{PROJECT_ROOT}/docs/check-list.md`

파일이 없으면 "체크리스트가 없습니다. `/kai-task-add`로 먼저 작업을 등록하세요." 보고 후 종료.

---

### Step 0-A — 사용자 작업 잠금 확인

```bash
if [ -f "{PROJECT_ROOT}/.claude/user.lock" ]; then
  echo "BLOCKED: 사용자 작업 중 — 종료"
  exit 0
fi
```

파일이 존재하면 즉시 종료. 보고: "사용자 작업 중 — 다음 루프에서 재시도".

---

### Step 0-B — 좀비 `[~]` 복구

`- [~]` 항목 중 선점 타임스탬프가 **현재 시각 - 30분 이전**이면 좀비.
좀비를 발견하면 `- [~]` → `- [ ]` 로 되돌리고 (타임스탬프 제거) 일반 후보로 포함.

```bash
date +"%Y-%m-%d %H:%M"     # 현재 시각
# 비교: "2026-05-19 14:30" 형식의 두 문자열 비교
```

좀비 복구 후 변경 사항을 즉시 파일에 반영하고 다음 단계로 진행.

---

### Step 1 — 체크리스트 전체 읽기

파일 전체를 Read한다.

항목 상태 수집:
- **활성 `[~]` 목록**: 좀비 아닌 모든 `- [~]` 항목과 그 **영향 파일**
- **`[ ]` 후보 목록**: 모든 `- [ ]` 항목과 그 **영향 파일**
- **완료 `[x]` 목록**: 개수 파악 (다음 단계 자동 아카이브용)

`[ ]` 후보가 없으면 → "실행할 항목이 없습니다." 보고 후 종료.

---

### Step 1-Z — 완료 항목 자동 아카이브 (컨텍스트 누적 방지)

`- [x]` 항목 개수가 **10개 이상**이면, 가장 오래된 것부터 자동 아카이브하여 **최근 5개만 남긴다**.

#### 절차

1. 파일 내 `- [x]` 항목들을 등장 순서대로 나열 (오래된 것이 위)
2. 개수 ≥ 10 이면 → 위에서부터 `(개수 - 5)` 개를 추출
3. 추출한 항목들(세부 항목 포함)을 `{PROJECT_ROOT}/docs/check-list-done.md` 에 append
   - 파일 없으면 헤더 생성 후 추가
   - 형식: `## {YYYY-MM-DD} 자동 아카이브` 섹션 아래
4. `check-list.md` 에서 추출한 항목 제거
5. 콘솔에 "🗄️ 완료 항목 N개 자동 아카이브" 보고

**절대 건드리지 않을 것:**
- `- [ ]`, `- [~]`, `- [!]` 항목
- 파일 상단 규칙/원칙 섹션
- 최근 5개의 `- [x]` (Tier 2 자문 참조용으로 보존)

아카이브 후 변경된 파일 상태를 다시 Read하여 이후 단계 진행.

---

### Step 2 — 영향 파일 충돌 검사

활성 `[~]` 항목들의 영향 파일을 모두 합쳐 `locked_files` 집합 구성.

```
locked_files = ⋃ (각 [~] 항목의 영향 파일)
```

`[ ]` 후보들을 순서대로 검사:

1. 후보의 영향 파일 ∩ locked_files = ∅ → **선점 가능**
2. 교집합 존재 → skip, 다음 후보로
3. 영향 파일 미기재 후보 → skip하고 task-add를 통한 보강 필요 (해당 항목에 `[!] 영향 파일 미기재` 코멘트 추가)

모든 후보가 충돌하면 → "현재 모든 후보가 다른 에이전트의 영향 파일과 충돌함." 보고 후 종료.

---

### Step 3 — 즉시 선점 (타임스탬프 포함)

선택한 항목을 다음 형식으로 변경:

```
- [~] **#N** — 제목. (선점: 2026-05-19 14:30)
```

타임스탬프는 `date +"%Y-%m-%d %H:%M"` 결과 사용.

#### 선점 실패 시 복구 절차

Edit이 실패하면 (다른 에이전트가 동시에 같은 항목 선점):

1. 파일을 다시 Read
2. Step 2부터 재시작 (충돌 검사 → 다음 후보)
3. 모든 후보 소진 시 종료

#### 선점 후 검증

선점 Edit 성공 후 즉시 파일을 다시 Read하여 해당 줄이 정확히 `- [~]` + 본인 타임스탬프인지 확인.
검증 실패 시 위 복구 절차 실행.

---

### Step 4 — 작업 분류 (Tier 판단)

착수 전 작업 유형을 스스로 분류. **판단이 애매하면 한 단계 위 Tier로.**

#### 🟢 Tier 1 — advisor 생략 (Sonnet 단독 처리)
- typo, 포맷팅, 주석, import 정리
- 1~5줄 미세 수정 (로직 변경 없음)
- 변수명/메서드명 리네이밍
- `[skip-advisor]` 태그가 있는 항목

→ Step 4-B로.

#### 🟡 Tier 2 — 기존 패턴 참조 (advisor 생략 가능)
- 같은 파일에 대한 추가 수정
- 7일 이내 동일/유사 작업에 대한 advisor 자문이 존재
- 기존 컴포넌트와 동일 패턴 반복

→ 관련 파일과 기존 구현 패턴을 Read한 후 Step 4-B로.

#### 🔴 Tier 3 — advisor 호출 필수 (Opus 계획 → Sonnet 구현)
- 새 기능/모듈 구현
- 기존 코드의 구조적 변경
- 외부 라이브러리/서비스 통합
- DB 스키마 변경
- 인증/결제/보안 관련 코드

→ Step 4-A 후 Step 4-B로.

---

### Step 4-A — advisor 호출 (Tier 3 전용)

**⚡ advisor 재호출 생략 조건**: 항목 제목에 `[advisor:done]` 태그가 있으면 task-add 시점에 이미 advisor 자문이 완료된 것이다. → advisor 호출을 **생략**하고 체크리스트에 기술된 구현 방안을 그대로 사용하여 Step 4-B로 진행.

태그가 없는 경우에만 아래 절차를 실행한다:

```
Agent({
  subagent_type: "advisor",
  prompt: `
    작업 항목: {체크리스트 항목 전문 (영향 파일 포함)}
    프로젝트 루트: {PROJECT_ROOT}
    관련 파일: {파악한 관련 파일 경로들}
    제약 조건: {CLAUDE.md 컨벤션 중 관련 항목}
  `
})
```

advisor 응답의 "영향 범위"에서 **새로 발견된 파일**이 있으면:
1. 체크리스트 항목의 **영향 파일** 목록에 즉시 append (Edit으로 파일 갱신)
2. 충돌 재검사 — 새 파일이 다른 `[~]`의 영향 파일과 겹치면 즉시 작업 중단, `[~]` → `[ ]` 복귀, 다음 루프에 재시도

**advisor 에이전트가 없는 경우**: `~/.claude/agents/advisor.md` 가 설치되지 않음.
→ `task-manager/install.sh` 재실행 또는 Plan 에이전트 fallback (`subagent_type: "Plan"`).

---

### Step 4-B — 화면 작업 여부 확인

항목의 영향 파일 또는 작업 설명에서 아래 조건을 확인한다:

**화면 작업 감지 조건:**
- 영향 파일 확장자에 `.html`, `.scss`, `.css`, `.component.ts` 포함
- 작업 설명에 "화면", "UI", "컴포넌트", "뷰", "스타일", "레이아웃", "페이지", "모달", "드로어", "폼", "버튼", "카드", "테이블" 등 UI 키워드 포함
- 항목 세부 내용에 `[화면 작업 필수]` 태그 존재

**화면 작업인 경우 — Step 5 전에 반드시 아래 순서를 따른다:**

1. **브라우저 확인 (구현 전)**: Playwright MCP(`mcp__plugin_ecc_playwright__`) 또는 `/browse` 스킬로 현재 화면 상태를 스크린샷으로 확인한다.
2. **레퍼런스 조회**: `ecc:docs-lookup` 또는 Context7 MCP로 사용 중인 UI 프레임워크·라이브러리의 최신 API를 확인한다.
3. **구현 후 브라우저 검증**: 코드 작성(Step 5) 완료 후 Playwright MCP로 실제 화면을 다시 확인하고, 의도한 UI가 렌더링되는지 검증한다.
4. **디자인 검토**: `design-review` 또는 `ecc:frontend-design` 스킬로 디자인 일관성을 검토한다.

---

### Step 4-C — 프로젝트 컨벤션 파일 확인 (필수 — 코드 작성 전)

**코드를 한 줄이라도 작성하기 전에 반드시 컨벤션 파일을 읽는다.**
컨벤션 파일이 정한 네이밍·폴더 구조·store 패턴을 따르지 않으면 리뷰 거부 사유가 된다.

작업 항목의 **영향 파일 경로**에서 앱을 탐지한다 (예: `verida-ops/...` → verida-ops).

읽는 순서:
1. `{SESSION_ROOT}/CLAUDE.md` — 워크스페이스 공통 컨벤션 (`★ 공통 프론트엔드 컨벤션` 섹션 필독)
2. `{SESSION_ROOT}/{앱}/CLAUDE.md` — 앱 레벨 컨벤션
3. `{SESSION_ROOT}/{앱}/docs/FRONTEND-CONVENTIONS.md` — 상세 프론트엔드 규칙 **(파일이 있으면 반드시 읽음)**

```bash
# 앱 디렉토리 예시 (영향 파일 경로 기반 탐지)
APP_DIR="{SESSION_ROOT}/verida-ops"   # 또는 verida-order, verida-pulse 등

CONV="${APP_DIR}/docs/FRONTEND-CONVENTIONS.md"
[ -f "$CONV" ] && echo "컨벤션 파일 존재 — 읽기 필수"
```

**코드 작성 전 반드시 확인할 항목 (컨벤션 파일에서):**
- 컴포넌트 네이밍: `view-{domain}`, `drawer-{action}`, `dialog-{purpose}` 접두사
- 4-파일 세트: `.ts` + `.html` + `.scss`(항상) + `.store.ts`(UI 상태 있을 때)
- 클래스명: `View{X}Component`, `Drawer{Y}Component`
- Store 패턴: `signalStore()` + `withDevtools()`
- Store 배치: UI 상태 → 컴포넌트 폴더, 도메인 데이터 → `core/stores/`
- 금지 사항 (Red Lines): hex 하드코딩, `@Injectable + plain signal`, `.scss` 생략 등

파일이 존재하지 않으면 이 단계를 건너뛴다.

---

### Step 5 — 코드 작성 (Sonnet 구현)

advisor 자문(Tier 3) 또는 자체 분석(Tier 1/2)을 바탕으로 코드 작성.
**Step 4-C에서 읽은 컨벤션 파일의 규칙을 그대로 적용한다.**

**파일 수정 전 반드시 확인:**

```bash
# 1. 워크트리 검증 — 수정 대상 파일이 PROJECT_ROOT 아래에 있는지
realpath {수정할 파일 경로} 2>/dev/null || (cd "$(dirname {파일})" && pwd -P)
# 결과가 PROJECT_ROOT 하위 경로 아니면 즉시 중단

# 2. 영향 파일 등록 확인 — 새로 수정하는 파일이 체크리스트 항목의 "영향 파일"에 있는지
# 없으면: 항목의 영향 파일에 먼저 append (다른 에이전트가 보호받도록)
```

작업 중 막히는 경우:
- 80% 이상 진행 가능하면 자체 판단으로 계속 진행
- 완전히 불가능한 경우에만 `- [~]` → `- [!]` 로 변경 후 사유 기록

---

### Step 6 — 빌드/검증 (build lock 사용)

```bash
BUILD_LOCK="{PROJECT_ROOT}/.claude/build.lock"

# 다른 에이전트가 빌드 중이면 최대 5분 대기
WAITED=0
while [ -f "$BUILD_LOCK" ] && [ $WAITED -lt 300 ]; do
  sleep 5
  WAITED=$((WAITED + 5))
done

# 락 획득 후 빌드 실행
touch "$BUILD_LOCK"
cd {PROJECT_ROOT} && npm run build 2>&1
BUILD_RESULT=$?

# 락 해제 (trap 미사용 — Claude Code 확인 팝업 방지)
rm -f "$BUILD_LOCK"

exit $BUILD_RESULT
```

빌드 실패 시 자체 수정 시도 (최대 3회). 3회 실패 시 `- [~]` → `- [!]` 마킹.

**빌드는 반드시 `PROJECT_ROOT`에서 실행한다.**

---

### Step 7 — Git 커밋 (필수 — 항목 하나 완료 = 커밋 하나)

> ⚠️ **이 단계는 선택이 아니다.** 빌드가 통과한 모든 작업은 반드시 커밋한다.
> **한 항목 수정이 끝나면 즉시 커밋한다. 여러 항목 완료 후 한꺼번에 커밋하지 않는다.**
> push는 사용자가 명시적으로 요청할 때만 실행한다 (기본: 커밋만).

**절차:**

#### 7-A — appVersion 증가 (앱 CLAUDE.md 규칙 적용)

커밋 직전, 프로젝트에 `src/environments/environment.ts` + `environment.prod.ts` 버전 파일이 존재하면 아래 절차로 버전을 올린다. **파일이 없으면 이 단계를 생략한다.**

**① bump 레벨 결정 (우선순위 순):**

1. **체크리스트 항목 본문에 명시된 경우 → 그것을 따른다**
   - "MINOR 증가" 또는 "MINOR bump" 포함 → **MINOR**
   - "MAJOR 증가" 또는 "MAJOR bump" 포함 → **MAJOR**
   - "PATCH 증가" 또는 아무 명시 없음 → **PATCH**

2. **명시 없으면 → 프로젝트 하위 앱 CLAUDE.md의 버전 규칙 참조 후 자체 판단**
   - 파일 위치: `{PROJECT_ROOT}/verida-ops/CLAUDE.md` (또는 해당 하위 앱 CLAUDE.md) 내 `## ★ 버전 관리 규칙` 섹션
   - verida-ops 기준:

     | bump | 증가 조건 | 판단 기준 |
     |---|---|---|
     | **MINOR** | 신규 페이지·신규 기능·주요 UI 추가 | 새 `.ts`+`.html` 페이지 파일 생성, 신규 store/드로어/다이얼로그 컴포넌트 추가 |
     | **MAJOR** | 전체 아키텍처 변경·대규모 리팩토링·정식 릴리스 | 폴더 구조 변경, 스택 교체, 전체 리팩토링 |
     | **PATCH** | 버그픽스·CSS 수정·문구 변경·소규모 개선 | 기존 파일 수정, 스타일 조정, 오타 수정 |

   - 판단이 MINOR/PATCH 경계에서 애매하면 → **PATCH** 선택 (보수적)

**② 버전 계산 규칙:**

```
PATCH: X.Y.Z → X.Y.(Z+1)      Z ≥ 99이면 → X.(Y+1).0
MINOR: X.Y.Z → X.(Y+1).0      Y ≥ 99이면 → (X+1).0.0
MAJOR: X.Y.Z → (X+1).0.0
```

**③ bash 적용 (BUMP_LEVEL = "PATCH" | "MINOR" | "MAJOR"):**

```bash
VERSION_FILE="{PROJECT_ROOT}/src/environments/environment.ts"
PROD_FILE="{PROJECT_ROOT}/src/environments/environment.prod.ts"

[ -f "$VERSION_FILE" ] || { echo "버전 파일 없음 — skip"; }

CURRENT=$(grep "appVersion" "$VERSION_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"

case "$BUMP_LEVEL" in
  MAJOR)
    MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
  MINOR)
    MIN=$((MIN + 1)); PAT=0
    [ "$MIN" -ge 99 ] && { MAJ=$((MAJ + 1)); MIN=0; } ;;
  *)  # PATCH 기본
    PAT=$((PAT + 1))
    [ "$PAT" -ge 99 ] && { MIN=$((MIN + 1)); PAT=0; }
    [ "$MIN" -ge 99 ] && { MAJ=$((MAJ + 1)); MIN=0; } ;;
esac
NEW_VERSION="$MAJ.$MIN.$PAT"

sed -i '' "s/appVersion: '${CURRENT}'/appVersion: '${NEW_VERSION}'/" "$VERSION_FILE"
[ -f "$PROD_FILE" ] && sed -i '' "s/appVersion: '${CURRENT}'/appVersion: '${NEW_VERSION}'/" "$PROD_FILE"

git add "$VERSION_FILE" "$PROD_FILE" 2>/dev/null
echo "버전 ${CURRENT} → ${NEW_VERSION} (${BUMP_LEVEL})"
```

#### 7-B — 커밋

```bash
cd {PROJECT_ROOT}
git pull --rebase                              # 다른 에이전트의 push 동기화
git add {Step 5에서 수정·생성한 파일들만}       # 영향 파일 목록 기준, git add -A 금지
git commit -m "$(cat <<'EOF'
feat(ops #N): {제목 한 줄 요약}

{변경 내용 2~4줄 bullet 요약}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**커밋 규칙:**
- 메시지 형식: `feat(ops #N): 제목` (N = 작업 번호)
- `git add -A` / `git add .` 금지 — 영향 파일만 stage (버전 파일 포함)
- `git pull --rebase` 실패 시 최대 3회 재시도
- push는 사용자 명시 요청 시에만 실행

**커밋 실패 시:**
- rebase 충돌 → 충돌 파일 확인 후 자체 해결, 최대 3회
- 3회 모두 실패 시 커밋 없이 `[!]` 마킹 후 사유 기록
- 커밋 성공 여부와 무관하게 Step 8(완료 처리)은 반드시 실행

---

### Step 8 — 완료 처리

성공 시 `- [~]` → `- [x]` 로 변경하고 완료 내용 기록. **선점 타임스탬프 제거.**

```markdown
- [x] **#N** — {제목}.
  - **영향 파일**: {기존 목록}
  - {기존 세부 항목들}
  - ✅ 완료: {완료 내용 한 줄 요약} ({YYYY-MM-DD HH:MM})
```

---

### Step 9 — 완료 보고

완수한 항목 번호, 제목, 수정된 파일 목록을 사용자에게 보고.

---

## Red Lines (절대 금지)

- ❌ `git worktree add` 사용
- ❌ `cp` / `rsync` 로 워크트리 ↔ 원본 파일 동기화
- ❌ `PROJECT_ROOT` 외부 경로의 파일 수정
- ❌ `- [~]` 상태인 항목 착수
- ❌ 선점(`- [~]`) + 타임스탬프 없이 작업 시작
- ❌ **영향 파일 충돌 검사 생략** — 다중 에이전트 환경에서 치명적
- ❌ 영향 파일 미기재 항목 임의 처리 (보강 후 재시도)
- ❌ 선점 Edit 한 번 실패로 전체 종료 (반드시 재시도)
- ❌ 워크트리에서만 빌드 통과 확인 후 완료 처리
- ❌ 작업 실패 시 `- [x]` 표시
- ❌ 한 번에 두 개 이상의 항목 동시 착수
- ❌ Tier 3 작업을 advisor 없이 착수
- ❌ `.claude/user.lock` 존재 시 무시하고 진행
- ❌ 빌드 lock 무시하고 동시 빌드 강행
- ❌ Step 5에서 수정하지 않은 파일까지 `git add`
- ❌ 빌드 통과 후 커밋 생략 — Step 7은 매 작업마다 필수
- ❌ `git add -A` 또는 `git add .` 사용 — 영향 파일만 stage
- ❌ 여러 항목을 묶어서 커밋 — 반드시 항목 하나당 커밋 하나 (1 item = 1 commit)
- ❌ 버전 파일이 존재하는데 PATCH 증가 생략 — 커밋마다 반드시 appVersion PATCH를 올린다
