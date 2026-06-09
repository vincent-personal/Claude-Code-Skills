---
name: kai-task-add
description: |
  현재 세션의 docs/tasks/todo/ 에 새 작업을 파일 1개로 추가하는 전역 스킬.
  트리거: /kai-task-add
  사용법: /kai-task-add {작업 설명}
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
---

# kai-task-add — 작업 추가 스킬 (파일-per-task)

## 역할

사용자가 지시한 작업을 **직접 실행하지 않고**, `docs/tasks/todo/` 에 **작업 1개 = 파일 1개**로 추가한다.
**영향 파일을 frontmatter에 의무 기록**하여 다중 에이전트 환경에서 파일 충돌을 방지한다.

> ⚠️ **절대 원칙**: 이 스킬은 **작업 등록 전용**이다.
> 사용자가 "구현해줘", "만들어줘", "코드 짜줘" 등 무엇을 요청해도,
> 이 스킬은 task 파일을 **생성하고 종료**한다.
> 코드 생성·파일 편집·빌드·테스트 등 구현 행위는 **일체 하지 않는다**.
> 구현 실행은 `/kai-task-run` 스킬의 역할이다.

> 🧱 **저장 모델**: 단일 check-list.md 공유 쓰기를 폐기하고, 디렉터리가 곧 상태다.
> ```
> docs/tasks/todo/      미시작
> docs/tasks/doing/     선점·작업중
> docs/tasks/done/      완료
> docs/tasks/blocked/   확인필요·막힘
> docs/tasks/.staging/  작성 중 임시 (완성 후 원자적 mv로 todo/ 투입)
> ```
> 상태 전이는 `mv`(원자적 rename)로만 일어난다. **번호 선점·동시 쓰기 충돌이 구조적으로 불가능**하다.

---

## ⚡ 실행 절차

### Step 0 — 세션 루트 탐지 (4스킬 공통 · 글자 그대로 동일)

> ⛔ **절대 금지**: `git rev-parse --show-toplevel` 또는 `pwd` 로 SESSION_ROOT를 결정하지 않는다.
> 이 명령은 하위 프로젝트의 git root를 반환하므로 하위 프로젝트 폴더에 tasks/ 가 생성된다.

**작업 디렉터리는 반드시 Claude Code 세션이 열린 폴더(= 워크스페이스 루트)에 둔다.**

**SESSION_ROOT 결정 방법 (우선순위 순):**

1. **Claude Code 시스템 컨텍스트의 `Primary working directory` 값**을 그대로 사용한다.
   - 대화 시작 시 시스템 프롬프트에 `Primary working directory: /path/to/workspace` 형태로 명시됨.
2. 못 찾으면 — 현재 디렉토리에서 상위로 올라가며 **가장 상위의 CLAUDE.md가 있는 디렉토리**:
   ```bash
   path=$(pwd); last="$path"
   while [ "$path" != "/" ]; do
     [ -f "$path/CLAUDE.md" ] && last="$path"
     path=$(dirname "$path")
   done
   echo "$last"
   ```

작업 디렉터리: `{SESSION_ROOT}/docs/tasks/`

> **검증**: 경로에 하위 프로젝트 폴더명(`verida-ops/`, `verida-order/` 등)이 포함되어 있으면 잘못된 경로다 — 상위로 올라간다.

---

### Step 0-F — TASK_ID 사전 생성 (메인 세션 Bash 실행 · 필수)

> 랜덤·타이밍 값은 LLM이 추론할 수 없으므로, **메인 세션이 직접 bash로 생성하여 서브에이전트에 전달**한다.

```bash
NS=$(date +%N 2>/dev/null); case "$NS" in ''|*[!0-9]*) NS=000000000;; esac
TASK_ID="$(date +%Y%m%d-%H%M%S)-${NS}-$$-$(printf '%04x' $RANDOM)"
echo "TASK_ID=$TASK_ID"
```

출력된 `TASK_ID=` 값을 Step 1 프롬프트의 `TASK_ID` 자리에 그대로 넣는다.

---

### Step 1 — 등록 서브에이전트 위임 (컨텍스트 격리 · 필수)

> 🧹 **컨텍스트 누적 방지**: task-add를 반복 실행하면 todo 스캔 결과·파일 탐색·advisor 응답이 메인 세션에 쌓인다.
> Step 0에서 SESSION_ROOT를 확정한 직후, **이하 모든 등록 작업을 fresh Agent 서브에이전트에 위임**한다.
> 메인 세션은 SESSION_ROOT 탐지와 결과 수신만 담당 → 반복 add 시에도 컨텍스트가 최소로 유지된다.

```
Agent({
  prompt: """
당신은 task 등록 전용 에이전트다. 아래 작업 설명을 분석하여 task 파일을 생성하고 결과만 반환한다.
구현은 절대 하지 않는다 — 오직 파일 등록만.

## 환경
SESSION_ROOT: {SESSION_ROOT}
TASK_ID: {Step 0-F에서 생성된 값 — 예: 20260531-154040-919185000-47878-3eed}

## 사용자 작업 설명
{사용자 원문 그대로}

## 수행 절차 (순서대로)

### A. 디렉터리 초기화
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks"/{todo,doing,done,blocked,.staging}
```

### B. 레거시 마이그레이션 (1회)
`docs/check-list.md` 존재 + `docs/check-list.md.migrated` 부재 시:
각 항목(`- [ ]/[~]/[x]/[!]`)을 상태별 디렉터리로 변환 후 `check-list.md` → `check-list.md.migrated` rename.

### C. 컨벤션 파일 확인
1. `{SESSION_ROOT}/CLAUDE.md`
2. 해당 앱의 `CLAUDE.md` (impact_files 경로로 앱 탐지)
3. `docs/FRONTEND-CONVENTIONS.md` (있으면)
읽은 내용을 D~F 단계에 반영한다.

### D. 기존 todo 스캔 (frontmatter만)
```bash
for f in "{SESSION_ROOT}"/docs/tasks/todo/*.md; do
  [ -e "$f" ] || continue
  awk '/^---$/{c++; next} c==1' "$f"
done
```
수집: title + impact_files. 새 작업과 **동일 파일·컴포넌트·기능 범위** 항목이 있으면 신규 생성 대신 Edit으로 병합.
(Edit 실패 = 파일이 doing/으로 이동됨 → 병합 포기하고 신규 생성)

### E. 작업 분할 판단
아래 중 하나라도 해당하면 여러 task 파일로 분할:
- 독립 기능 2개 이상 혼재 / 레이어 혼재(백엔드+프론트+DB) / 영향 파일 8개 이상 / 순차 의존성 명확
- **다중 git 저장소 혼재** — impact_files가 서로 다른 git 저장소에 걸치면 **저장소 1개 = task 1개**로 반드시 분할

저장소 감지:
```bash
for f in {impact_files}; do
  git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null
done | sort -u
```
출력 줄 수 > 1 이면 다중 저장소 → 분할 필수.

분할 시 후행 작업 frontmatter의 `predecessors:`에 선행 id 기재.

### F. 영향 파일 식별 + Tier 판단
영향 파일: Glob/Grep으로 탐색. 불명확 파일은 `?` 표시.
Tier 기준:
- 🟢 1: typo·포맷·1~5줄 수정·`[skip-advisor]`
- 🟡 2: 동일 패턴 반복·7일 내 유사 자문
- 🔴 3: 새 기능·구조 변경·외부 통합·DB·인증·결제·보안·`?` 파일 2개 이상

Tier 3이면 advisor 에이전트(Opus) 호출:
```
Agent({subagent_type:"advisor", prompt:"[작업설명] ... [초안 영향파일] ... [요청] 1)완전한 파일목록 2)구현방안 3)엣지케이스 4)정답지(PDF/디자인/HTML 템플릿)가 주어졌다면 기존 구현 vs 템플릿 갭 분석"})
```
응답 수신 후: `?` 제거, 파일 병합, frontmatter `advisor: done` 설정, 구현 방안 본문 반영.

> ⚠️ **템플릿/디자인 정답지 가드 (필수)**: PDF·디자인·HTML·이미지 템플릿(예: `docs/template`)이 "정답지"로 주어진 작업은,
> **동일 이름의 기존 컴포넌트/코드가 이미 존재하더라도 "마크업 보존"·"리팩토링만" 같은 단정을 절대 하지 않는다.**
> 기존 구현이 정답지와 일치한다고 가정하는 것이 이번 부류 작업의 가장 흔한 실패 원인이다. 반드시:
> 1) 정답지(템플릿)를 **직접 Read하여 레이아웃·필드·섹션·서브라인을 항목화**하고,
> 2) advisor에게 **"기존 구현 vs 템플릿 갭 분석"을 명시적으로 요청**한 뒤,
> 3) 구현 체크리스트는 **"보존"이 아니라 "템플릿 기준 전면 재현(불일치 시 재작성)"** 을 기본값으로 작성한다.
> 일치 여부가 검증되지 않았으면, 추정을 사실처럼 frontmatter/체크리스트에 적지 않는다.

> ⚠️ **impact_files는 반드시 frontmatter 배열로 기록한다. 본문에만 쓰는 것은 무효.**
>
> ❌ 잘못된 예 (본문에만):
> ```markdown
> ## 영향 파일
> - src/app/pages/products/view-products.html
> ```
>
> ✅ 올바른 예 (frontmatter 배열):
> ```yaml
> impact_files:
>   - src/app/pages/products/view-products/view-products.html
> ```
> 본문에 영향 파일을 설명하는 것은 가능하나, frontmatter `impact_files:` 배열이 **반드시 함께** 있어야 한다.

### G. 화면 작업 감지
영향 파일 확장자에 `.html`·`.scss`·`.css`·`.component.ts` 포함 또는 UI 키워드 포함 시:
frontmatter `screen_work: true` + 본문에 `[화면 작업 필수]` 지침 추가.

### H. 구현 체크리스트 생성 (Tier 2/3 또는 영향 파일 3개 이상)
```markdown
## 구현 체크리스트
- [ ] {구체적 구현 내용 — 파일 단위·의존 순}
- [ ] ...
```
최소 3개 ~ 최대 10개. Tier 1 또는 조건 미충족 시 생략.

### I. task 파일 생성 (staging → 원자적 mv)

**⚠️ ID는 환경에서 제공된 TASK_ID를 사용한다. 직접 생성하거나 추론하지 않는다.**

**I-a. slug 생성 (Bash 툴로 실행):**
```bash
TITLE="{H단계에서 결정한 최종 제목}"
slug=$(printf '%s' "$TITLE" | tr '/[:space:]' '-' | tr -cd '[:alnum:]가-힣._-' | cut -c1-60)
slug=${slug#.}; [ -z "$slug" ] && slug=task
echo "FILENAME={TASK_ID}--${slug}.md"
```
Bash 출력의 `FILENAME=` 값이 최종 파일명이다. **이 값 외 다른 파일명 절대 사용 금지.**

**I-b. staging Write + 원자적 mv:**
```bash
STAGE="{SESSION_ROOT}/docs/tasks/.staging/{FILENAME}"
# 위 STAGE 경로에 완성된 내용 전체를 Write한 후:
mv "$STAGE" "{SESSION_ROOT}/docs/tasks/todo/{FILENAME}"
```

**I-c. 생성 후 impact_files 필수 검증 (Bash 툴로 실행):**
```bash
FILE="{SESSION_ROOT}/docs/tasks/todo/{FILENAME}"
awk '/^---$/{c++; next} c==1 && /^impact_files:/{found=1} END{exit !found}' "$FILE" \
  && echo "OK: impact_files 확인" \
  || echo "ERROR: impact_files 누락 — 즉시 Edit으로 추가 후 재검증"
```
`ERROR` 출력 시 → `impact_files:` 배열을 frontmatter에 Edit으로 추가 → 재검증 통과 후에만 `RESULT:` 반환.

포맷:
```
---
id: {ID}
title: {제목}
created: {YYYY-MM-DD HH:MM}
tier: {1|2|3}
advisor: {done|skipped|pending}
screen_work: {true|false}
impact_files:
  - path/to/file.ts
predecessors: []
claimed_at:
claimed_by:
committed:
---
## 작업 설명
{What / How / Note}
## 구현 방안 (advisor)
{Tier 3 시 기재, 아니면 생략}
## 구현 체크리스트
{H단계 조건 충족 시 기재}
- [ ] ...
```

## 반환 형식 (마지막 줄에 반드시 출력)
신규 생성: `RESULT: created | id={ID} | title={제목} | tier={Tier} | impact_files={파일1,파일2,...}`
기존 병합: `RESULT: merged  | file={파일명} | title={제목} | impact_files={파일1,...}`
분할 생성: `RESULT: split   | count={N} | titles={제목1,제목2,...} | impact_files={파일1,...}`
  """
})
```

**서브에이전트 반환 후 메인 세션 처리:**
반환된 `RESULT:` 에서 `impact_files=` 필드가 없으면 → 실패로 간주하고 사용자에게 오류 보고.
있으면 → `RESULT:` 한 줄을 사용자에게 보고하고 종료한다.

---

## 📋 서브에이전트 내부 절차 상세 (참고용 — 메인 세션에서 직접 실행하지 않음)

> 아래 단계들은 Step 1의 Agent 프롬프트 안에서 서브에이전트가 실행한다.
> 메인 세션은 Step 0 + Step 1(위임) + 결과 수신만 처리한다.

---

### (참고) Step 0-M — 레거시 자동 마이그레이션 (1회 · add/run 공통)

**가드**: `docs/check-list.md` 가 **존재**하고 `docs/check-list.md.migrated` 가 **부재**하면 변환한다.
(todo/ 비어있음 여부로 판단하지 않는다 — 사용자가 신규 add를 먼저 해도 기존 작업이 누락되지 않도록.)
> 본 스킬들은 심볼릭 링크로 모든 프로젝트에 즉시 반영된다. 이 단계를 빠뜨리면 기존 프로젝트의 진행 중 작업이 일제히 사라진 것처럼 보인다.

1. `check-list.md` 의 각 항목(`- [ ]/[~]/[x]/[!]`)을 등장 순서대로 파싱.
2. 상태 매핑: `[ ]`·`[~]`→`todo/`(선점 해제), `[x]`→`done/`, `[!]`→`blocked/`.
3. 항목마다 task 파일 생성 (§Step 4 포맷). **등장 순서 보존**을 위해 id 접두를 옛 작업임이 드러나도록 부여:
   - `id: 00000000-000000-{4자리순번}` (예 `00000000-000000-0001`) → FIFO에서 신규보다 먼저 선택됨.
4. 변환 완료 후 `check-list.md` → `check-list.md.migrated` 로 rename (재실행 방지).
5. "🔄 레거시 N건 마이그레이션 완료" 보고.

---

### Step 0-C — 프로젝트 컨벤션 파일 확인 (필수)

**컨벤션 파일이 존재하면 반드시 읽는다. 영향 파일 식별·작업 설명 작성의 기준이 된다.**

읽는 순서:
1. `{SESSION_ROOT}/CLAUDE.md` — 워크스페이스 공통 컨벤션 (항상)
2. `{SESSION_ROOT}/{앱}/CLAUDE.md` — 앱 레벨 컨벤션 (해당 앱 작업 시)
3. `{SESSION_ROOT}/{앱}/docs/FRONTEND-CONVENTIONS.md` — 상세 프론트엔드 규칙 (있으면)

**확인 항목:** 컴포넌트 네이밍 규칙(`view-`/`drawer-`/`dialog-` 접두사 등), 4-파일 세트 규칙, 폴더 구조 및 store 배치, 금지 사항(Red Lines).
파일이 없으면 이 단계를 건너뛴다. 읽은 내용은 Step 2(영향 파일)·Step 3(설명)에 반영한다.

---

### Step 1 — 기존 todo 스캔 (병합 판단용 · frontmatter만)

> 💡 **컨텍스트 절감**: 파일 본문을 통째로 읽지 않는다. frontmatter만 `awk`로 추출한다.
> 표준 추출: `awk '/^---$/{c++; next} c==1' <file>`

```bash
for f in "{SESSION_ROOT}"/docs/tasks/todo/*.md; do
  [ -e "$f" ] || continue
  awk '/^---$/{c++; next} c==1' "$f"   # title / impact_files 등만 확인
done
```

수집: 각 todo 항목의 **title** 과 **impact_files**. (완료·작업중 항목은 병합 대상이 아니므로 읽지 않는다.)

---

### Step 1-A — 미시작 항목과 접목 가능 여부 확인 (★병합은 Edit-only)

todo/ 항목 중 새 작업과 **동일 파일·동일 컴포넌트·동일 기능 범위**인 항목이 있으면 신규 생성 대신 **그 파일에 세부를 병합**한다.

> ⚠️ **반드시 Edit으로만 병합한다.** Write로 파일을 재생성하지 않는다.
> 병합 도중 그 파일이 task-run에 의해 `doing/`으로 claim되어 사라질 수 있다(split-brain).
> **Edit이 실패하면(=파일이 이동됨) 병합을 포기하고 신규 task 파일을 생성**한다(Step 2~4).

병합 시:
- 기존 파일의 본문에 세부 항목만 추가.
- `impact_files` 는 두 작업의 **합집합**으로 갱신.
- 완전히 다른 범위면 별도 신규 파일로 추가한다.

---

### Step 1-B — 작업 분할 판단

아래 중 하나라도 해당하면 단일 파일이 아닌 **여러 task 파일로 분할**한다.

| 조건 | 설명 |
|---|---|
| **다중 git 저장소** | impact_files가 서로 다른 git 저장소에 걸침 → **저장소 1개 = task 1개** (최우선 분할 조건) |
| 독립 기능 혼재 | "그리고/또한/추가로" 로 연결된 **서로 독립적인 기능** 2개 이상 |
| 레이어 혼재 | 백엔드 API + 프론트 UI + DB 스키마 등 **서로 다른 레이어** 동시 |
| 영향 파일 과다 | 영향 파일 **8개 이상**으로 추정 + 논리적으로 안 묶이는 파일 포함 |
| 단계 의존성 명확 | "A 완료 후 B" 라는 **순차 의존** 구조 |

**다중 git 저장소 감지:**
```bash
for f in {impact_files 목록}; do
  git -C "$(dirname "$f")" rev-parse --show-toplevel 2>/dev/null
done | sort -u
# 출력 줄 수 > 1 → 다중 저장소 → 분할 필수
```

**분할 원칙:** 각 하위 작업은 독립적으로 완료·빌드 가능. 분할 수는 최소화(자연스러운 경계에서만).
순차 의존이 있으면 후행 작업 frontmatter의 `predecessors:` 에 **선행 작업의 id**를 기재한다.
(task-run은 predecessors가 모두 done/ 에 있어야 후행을 착수한다.)

> 예시: `verida_api` DB 마이그레이션 → `verida-shared-model` 모델 업데이트 → `verida-order` npm update
> → task 3개, predecessors 체인으로 순서 보장.

---

### Step 2 — 영향 파일 식별 (의무)

사용자 설명을 분석하여 작업이 수정/생성할 파일의 목록을 만든다.
1. 경로 명시 → 그대로 사용
2. 컴포넌트/기능 이름만 → `Glob`/`Grep` 으로 후보 탐색 (import/의존 관계 파일도 포함)
3. 불명확 파일은 `?` 표시 후 Step 2-A 에서 advisor로 확정

**최소 1개 이상의 영향 파일이 반드시 기록되어야 한다.** 경로는 SESSION_ROOT 기준 상대경로.

---

### Step 2-A — Tier 판단 및 advisor 호출

**애매하면 한 단계 위 Tier로.**

| Tier | 조건 | advisor |
|---|---|---|
| 🟢 1 | typo·포맷·주석·import 정리·1~5줄 미세 수정·리네이밍·`[skip-advisor]` | ❌ 생략 |
| 🟡 2 | 동일 패턴 반복·같은 파일 추가 수정·7일 내 유사 자문 존재 | ❌ 생략 가능 |
| 🔴 3 | 새 기능/모듈·구조 변경·외부 통합·DB 스키마·인증/결제/보안·Step 2에서 `?` 파일 2개 이상 | ✅ **필수** |

> "영향 파일 개수"는 Tier 기준에서 제외 — 많아도 동일 패턴 반복이면 Tier 2.

**Tier 3 — advisor 호출 절차:** `advisor` 에이전트(Opus)를 호출하며 전달:
```
[작업 설명] {사용자 원문}
[초안 영향 파일] {Step 2 목록 (? 포함)}
[요청] 1) 빠진 영향 파일 확인·완전한 목록  2) 단계별 구현 방안  3) 엣지 케이스/주의사항
```
응답 수신 후:
- `impact_files`: advisor가 추가한 파일 병합, `?` 제거
- 구현 방안: Step 3 본문 `## 구현 방안 (advisor)` 에 반영
- 주의사항: 본문 세부 항목에 추가
- frontmatter `advisor: done` 설정 → task-run이 이 값을 보고 advisor 재호출을 생략한다.

> ⚠️ **템플릿/디자인 정답지 가드 (필수)**: PDF·디자인·HTML·이미지 템플릿이 "정답지"로 주어진 작업은,
> 동일 이름의 기존 코드가 존재하더라도 **"마크업 보존"·"리팩토링만"으로 단정하지 않는다.**
> ① 템플릿을 직접 Read하여 레이아웃·필드·섹션을 항목화 → ② advisor 요청에 **"기존 구현 vs 템플릿 갭 분석"** 명시
> → ③ 체크리스트 기본값은 **"템플릿 기준 전면 재현(불일치 시 재작성)"**. 검증 안 된 일치 추정을 사실처럼 적지 않는다.

---

### Step 3 — 작업 설명 작성

사용자 원문 + advisor 응답(Tier 3)을 바탕으로 **명확하고 실행 가능한** 설명을 작성한다.
- **무엇을(What)** / **어떻게(How)** / **주의(Note)**
- 세부 분량 기준: Tier 1 최소 2개 / Tier 2 최소 3개 / Tier 3 최소 5개(영향파일+구현단계 3+주의 1)

---

### Step 3-A — 화면 작업 여부 감지

아래 중 하나라도 해당하면 **화면 작업**으로 판단:
- 영향 파일 확장자에 `.html`·`.scss`·`.css`·`.component.ts` 포함
- 설명에 "화면/UI/컴포넌트/뷰/스타일/레이아웃/페이지/모달/드로어/폼/버튼/카드/테이블" 등 포함

→ frontmatter `screen_work: true` 설정 + 본문에 다음 지침 추가:
```markdown
  - **[화면 작업 필수]** task-run 시: 1) Playwright MCP/`/browse`로 구현 전후 검증
    2) Context7/`ecc:docs-lookup`로 UI 라이브러리 최신 API 확인
    3) `design-review`/`ecc:frontend-design`로 디자인 일관성 검토
```

---

### Step 3-B — 구현 체크리스트 생성

아래 조건 중 하나라도 해당하면 작업 파일에 `## 구현 체크리스트` 섹션을 추가한다:
- **Tier 2/3** 작업
- 구현 단계가 **3개 이상**으로 판단되는 경우
- 영향 파일이 **3개 이상**인 경우

**항목 작성 원칙:**
- 각 항목은 **하나의 독립적 구현 단위** (단일 파일 수정 또는 단일 기능 범위)
- 항목당 1줄, **행동 동사로 시작** (예: "UserStore에 fetchUser 액션 추가", "user-detail.html 프로필 카드 마크업 작성")
- **영향 파일 기준으로 묶기** — 동일 파일 내 여러 수정은 한 항목으로
- **순서는 의존 관계 순** — 선행 구현이 필요한 항목이 먼저
- 최소 3개 ~ 최대 10개 (너무 잘게 쪼개지 않는다)

**포맷 (task 파일 본문에 추가):**
```markdown
## 구현 체크리스트
- [ ] {구체적 구현 내용 — 어떤 파일에 무엇을}
- [ ] {구체적 구현 내용}
- [ ] ...
```

> `task-run`은 이 목록을 순서대로 하나씩 구현하며 완료 즉시 `- [x]`로 체크한다.
> Tier 1 단순 작업·조건 미충족 시 이 섹션을 생략해도 된다.

---

### Step 4 — task 파일 생성 (staging → 원자적 mv)

> ★ **빈 파일을 먼저 만들지 않는다.** 완성본을 `.staging/` 에 쓴 뒤 원자적 `mv`로 todo/ 에 투입한다.

**TASK_ID는 Step 0-F에서 메인 세션이 생성한 값을 사용한다. 서브에이전트가 새로 생성하지 않는다.**

slug 생성 (Bash 툴 실행):
```bash
TITLE="{최종 결정 제목}"
slug=$(printf '%s' "$TITLE" | tr '/[:space:]' '-' | tr -cd '[:alnum:]가-힣._-' | cut -c1-60)
slug=${slug#.}; [ -z "$slug" ] && slug=task
echo "FILENAME={TASK_ID}--${slug}.md"
```

`.staging/` 에 아래 **완성된 내용 전체**를 Write한 다음, 원자적으로 이동한다:

```markdown
---
id: {ID}
title: {제목}
created: {YYYY-MM-DD HH:MM}
tier: {1|2|3}
advisor: {done|skipped|pending}
screen_work: {true|false}
impact_files:
  - path/to/file1.ts
  - path/to/file2.scss
predecessors: []
claimed_at:
claimed_by:
committed:        # 커밋 성공 시 task-run이 해시 기록 (완료-고아 화해용)
---

## 작업 설명
{What / How / Note}

## 구현 방안 (advisor)
{Tier 3일 때 advisor 단계별 방안. 아니면 생략}

## 구현 체크리스트
{Step 3-B 조건 충족 시 자동 생성. 아니면 이 섹션 생략}
- [ ] {구현 내용 1}
- [ ] {구현 내용 2}
- [ ] ...
```

```bash
STAGE="{SESSION_ROOT}/docs/tasks/.staging/{FILENAME}"
mv "$STAGE" "{SESSION_ROOT}/docs/tasks/todo/{FILENAME}"
```

**frontmatter 규칙:**
- `status` 필드는 두지 않는다 — **디렉터리 위치가 상태의 유일 권위**.
- `impact_files` 는 **의무**. 최소 1개. 없으면 task-run 충돌 검사가 동작하지 않는다.
- `predecessors` 는 선행 작업 id 배열(없으면 `[]`).

---

### Step 5 — 완료 보고

생성한 파일명(또는 병합 대상), title, impact_files, Tier 를 사용자에게 보고한다.
분할했으면 생성된 모든 파일을 나열한다.

---

## Red Lines (절대 금지)

- ❌ **작업을 직접 실행하거나 코드를 수정하는 행위** — 이 스킬은 작업 등록 **전용**
- ❌ **스스로 구현 시작** — 구현은 `/kai-task-run` 담당
- ❌ **todo 스캔·파일 탐색·advisor 호출을 메인 세션에서 직접 실행** — Step 1 Agent 서브에이전트에 위임 (컨텍스트 누적 방지)
- ❌ task 파일을 `done/` 등 todo/ 외 디렉터리에 생성
- ❌ **빈 파일 선생성**(noclobber 등) — 반드시 staging 완성본 → 원자적 mv
- ❌ **TASK_ID를 서브에이전트가 직접 생성** — Step 0-F 메인 세션 bash 출력값만 사용
- ❌ **`--{slug}` 구분자 생략** — slug 없어도 `--task` 필수 (`{ID}.md` 형식 금지)
- ❌ **impact_files를 본문에만 기재** — frontmatter `impact_files:` 배열이 반드시 있어야 함 (I-c 검증 필수)
- ❌ **impact_files 없이 RESULT: 반환** — I-c 통과 후에만 RESULT: 출력 가능
- ❌ **병합 시 Write로 todo 파일 재생성** — Edit-only, 실패 시 신규파일 fallback
- ❌ **영향 파일(impact_files) 없이 생성** (충돌 검사 무력화)
- ❌ frontmatter에 `status` 필드 추가 (디렉터리가 권위 — drift 유발)
- ❌ 세부 내용 없이 제목만 생성
- ❌ **정답지(PDF/디자인/HTML 템플릿)가 있는데 "마크업 보존"·"리팩토링만"으로 단정** — 템플릿 직접 Read + 갭 분석 없이 기존 구현이 정답지와 일치한다고 가정 금지
- ❌ `git worktree add` / `cp` / `rsync`
- ❌ **단일 task에 복수 git 저장소 혼재** — 반드시 저장소별 task로 분할 (워커는 단일 저장소만 처리)

---

## ⚡ 역할 경계 (최우선 원칙)

> **이 스킬의 유일한 출력은 `docs/tasks/todo/` 의 task 파일 생성(또는 기존 파일 병합)뿐이다.**

- `/kai-task-add` → 파일 생성 후 **즉시 종료** (구현 금지)
- 사용자가 구현을 요청해도 → 파일 추가 + "구현하려면 `/kai-task-run`을 실행하세요" 안내 후 종료
