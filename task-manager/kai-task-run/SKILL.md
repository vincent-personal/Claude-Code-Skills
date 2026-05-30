---
name: kai-task-run
description: |
  docs/tasks/todo/ 의 작업을 FIFO 순서로 모두 완수할 때까지 자동 반복 실행하는 전역 스킬.
  작업이 없으면 자동 종료. 다중 에이전트 환경에서 mv 원자 claim + 영향 파일 충돌 검사로 안전성 확보.
  트리거: /kai-task-run
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

# kai-task-run — 작업 실행 스킬 (파일-per-task)

## 🤖 자율 실행 원칙 (최상위 규칙 — 모든 Step보다 우선)

**이 스킬은 사용자 확인을 일절 요청하지 않는다. 모든 결정을 스스로 내리고 즉시 실행한다.**

- ❌ "확인이 필요합니다" / "어떻게 할까요?" / "진행해도 될까요?" 출력 금지
- ✅ 모호한 상황 → 가장 합리적인 해석으로 즉시 진행, 판단 근거만 기록
- ✅ 여러 선택지 → 프로젝트 컨벤션에 맞는 것 자동 선택, 사유 기록
- ✅ 파일 수정·빌드·git 커밋 → 확인 없이 즉시 실행
- ✅ 막히면 자체 해결 시도, 완전히 불가능할 때만 `blocked/` 로 이동 후 종료
- ✅ **한 작업 완료 → 즉시 커밋** (여러 작업 묶음 커밋 금지)

---

## 역할

`docs/tasks/todo/` 에서 **가장 먼저 만든**(FIFO) 작업 하나를 `doing/` 으로 **원자적으로 선점**하여
완수하고 `done/` 으로 이동한다.

다중 에이전트 안전장치:
1. **`mv` 원자 claim** — todo→doing 성공한 한 세션만 획득 (선점 충돌 불가)
2. 영향 파일(impact_files) 충돌 검사
3. 좀비 선점 자동 복구 (doing/ claimed_at 30분 timeout)
4. 빌드 lock으로 동시 빌드 직렬화

> 🧱 상태 = 디렉터리. `todo/`·`doing/`·`done/`·`blocked/`. 전이는 `mv` 로만.

---

## ⚠️ 최우선 안전 규칙 — 워크트리 절대 금지

> **이 규칙을 어기면 수십 개의 수정 사항이 분실될 수 있다. 실제로 발생한 사고다.**

- ❌ `git worktree add` 로 워크트리 생성 금지
- ❌ `cp`·`rsync` 등으로 워크트리 ↔ 원본 파일 동기화 금지
- ❌ 워크트리 내부에서만 빌드 통과 확인 후 "완료" 처리 금지

모든 코드 수정은 **git 루트 아래의 원본 파일**에서만 수행한다.

---

## ⚡ 실행 절차

### Step 0 — 세션 루트 탐지 (4스킬 공통 · 글자 그대로 동일)

> ⛔ **절대 금지**: `git rev-parse --show-toplevel` 또는 `pwd` 로 SESSION_ROOT를 결정하지 않는다.

**SESSION_ROOT 결정 방법 (우선순위 순):**

1. **Claude Code 시스템 컨텍스트의 `Primary working directory` 값**을 그대로 사용한다.
2. 못 찾으면 — 현재 디렉토리에서 상위로 올라가며 **가장 상위의 CLAUDE.md가 있는 디렉토리**:
   ```bash
   path=$(pwd); last="$path"
   while [ "$path" != "/" ]; do
     [ -f "$path/CLAUDE.md" ] && last="$path"
     path=$(dirname "$path")
   done
   echo "$last"
   ```

작업 디렉터리: `{SESSION_ROOT}/docs/tasks/`. 없으면 생성:
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks"/{todo,doing,done,blocked,.staging}
```
todo/ 와 doing/ 둘 다 비어있으면 "실행할 작업이 없습니다. `/kai-task-add` 로 먼저 등록하세요." 보고 후 종료.

> **검증**: 경로에 하위 프로젝트 폴더명이 포함되면 잘못된 경로 — 상위로 올라간다.

> **코드 작업 대상의 git 루트(PROJECT_ROOT)** 는 별도다 — 빌드·커밋은 수정 파일이 속한 git 루트에서 수행한다.

---

### Step 0-M — 레거시 자동 마이그레이션 (1회 · add/run 공통)

**가드**: `docs/check-list.md` 가 **존재**하고 `docs/check-list.md.migrated` 가 **부재**하면 변환(todo/ 비어있음으로 판단 금지):
1. 각 항목(`- [ ]/[~]/[x]/[!]`)을 등장 순서대로 파싱
2. `[ ]`·`[~]`→`todo/`(선점 해제), `[x]`→`done/`, `[!]`→`blocked/`
3. id 접두를 `00000000-000000-{4자리순번}` 로 부여(FIFO에서 신규보다 먼저), kai-task-add의 task 파일 포맷으로 변환
4. `check-list.md` → `check-list.md.migrated` rename, "🔄 레거시 N건 마이그레이션 완료" 보고

---

### Step 0-A — 사용자 작업 잠금 확인

```bash
if [ -f "{SESSION_ROOT}/.claude/user.lock" ]; then
  echo "BLOCKED: 사용자 작업 중 — 종료"; exit 0
fi
```
존재하면 즉시 종료. 보고: "사용자 작업 중 — 다음 루프에서 재시도".

---

### Step 0-B — 완료-고아 화해 + 좀비 복구 + staging 고아 청소

> ⚖️ **화해(reconciliation) 우선**: `doing/` 에 남은 파일이 `committed:` 마커를 가지면, 이는
> "커밋은 됐으나 done/ 이동만 누락된 완료-고아"다. **재실행 없이 곧장 done/ 으로** 보낸다.
> `committed:` 가 없는 것만 시간 기준 좀비로 본다. (중복 실행·중복 커밋 방지)

```bash
NOW=$(date +%s)
for f in "{SESSION_ROOT}"/docs/tasks/doing/*.md; do
  [ -e "$f" ] || continue
  # 1) 완료-고아: committed: 마커 존재 → 나이 무관하게 done/ 으로 화해 (재실행 금지)
  if awk '/^---$/{c++; next} c==1 && /^committed:[[:space:]]*[0-9a-f]/{found=1} END{exit !found}' "$f"; then
    mv "$f" "{SESSION_ROOT}/docs/tasks/done/$(basename "$f")"     # 완료 화해
    continue
  fi
  # 2) 진짜 좀비: committed 없음 + mtime 30분 경과 → todo/ 로 복귀
  MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
  if [ $((NOW - MT)) -gt 1800 ]; then
    mv "$f" "{SESSION_ROOT}/docs/tasks/todo/$(basename "$f")"     # 좀비 복구
  fi
done
# 3) .staging/ 고아: 30분 경과한 미투입 temp 삭제
find "{SESSION_ROOT}/docs/tasks/.staging" -type f -mmin +30 -delete 2>/dev/null
```
좀비로 todo/ 에 복구된 파일은 frontmatter의 `claimed_at`/`claimed_by` 를 비운다(committed 화해 건은 그대로 둔다).

---

### Step 1 — 사전 상태 수집 (FIFO 순회 전 준비)

> 💡 **컨텍스트 절감**: 본문을 통째로 읽지 않는다. frontmatter만 추출:
> `awk '/^---$/{c++; next} c==1' <file>`

```bash
# 1) 선행조건 만족 집합 — done/ 파일명에서 id 부분만 추출
done_ids=$(ls "{SESSION_ROOT}"/docs/tasks/done/ 2>/dev/null | sed 's/--.*//')

# 2) locked_files — 현재 doing/ 의 모든 impact_files 합집합
#    다른 세션이 작업 중인 파일 목록. mv claim 전 사전 필터에 사용.
locked_files=""
for df in "{SESSION_ROOT}"/docs/tasks/doing/*.md; do
  [ -e "$df" ] || continue
  # impact_files: 블록만 추출 (다른 배열 필드와 혼동 방지)
  files=$(awk '
    /^---$/{c++; next}
    c==1 && /^impact_files:/{in_block=1; next}
    c==1 && in_block && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
    c==1 && in_block && /^[^[:space:]]/{in_block=0}
  ' "$df")
  locked_files="$locked_files $files"
done
# locked_files: 공백 구분 파일 경로 목록 (중복 무방)
```

`todo/` 를 **파일명 정렬순(= 생성순 = FIFO)** 으로 순회한다:
```bash
for f in $(ls "{SESSION_ROOT}"/docs/tasks/todo/ 2>/dev/null | sort); do ... done
```
todo/ 가 비어있으면 → "실행할 작업이 없습니다." 보고 후 종료.

---

### Step 2 — 후보 검사 → 원자적 선점 (mv claim)

각 후보 `f` 에 대해 **순서대로** 검사한다. 어느 단계든 조건 불충족 시 `continue`(다음 후보).

#### 2-1. 선행조건 검사

frontmatter `predecessors` 의 모든 id가 `done_ids` 에 있어야 한다:
```bash
preds=$(awk '
  /^---$/{c++; next}
  c==1 && /^predecessors:[[:space:]]*\[/ {next}
  c==1 && /^predecessors:[[:space:]]*$/ {inp=1; next}
  c==1 && inp && /^[[:space:]]*-[[:space:]]/ {gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
  c==1 && inp && /^[^[:space:]-]/ {inp=0}
' "{SESSION_ROOT}/docs/tasks/todo/$f")
# preds 각 id가 done_ids에 없으면 → continue
```

#### 2-2+2-3. ★ 영향 파일 추출 + locked_files 겹침 검사 (mv 시도 전 · 단일 패스)

> frontmatter를 한 번만 읽어 "기재 여부 확인"과 "locked_files 겹침 검사"를 동시에 처리한다.

```bash
candidate_files=$(awk '
  /^---$/{c++; next}
  c==1 && /^impact_files:/{in_block=1; next}
  c==1 && in_block && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
  c==1 && in_block && /^[^[:space:]]/{in_block=0}
' "{SESSION_ROOT}/docs/tasks/todo/$f")

# 2-2: 기재 검사 — 비어있으면 blocked/ 이동
if [ -z "$candidate_files" ]; then
  mv "{SESSION_ROOT}/docs/tasks/todo/$f" "{SESSION_ROOT}/docs/tasks/blocked/$f"
  # frontmatter에 사유 Edit: "영향 파일 미기재 — task-add 보강 필요"
  continue
fi

# 2-3: locked_files 겹침 검사 (1차 방어선)
overlap=0
for cf in $candidate_files; do
  for lf in $locked_files; do
    [ "$cf" = "$lf" ] && overlap=1 && break 2
  done
done
[ $overlap -eq 1 ] && continue   # 다른 세션이 같은 파일 작업 중 → 다음 후보
```

#### 2-4. 원자적 선점 (mv claim)

```bash
if mv "{SESSION_ROOT}/docs/tasks/todo/$f" "{SESSION_ROOT}/docs/tasks/doing/$f" 2>/dev/null; then
  CLAIMED="$f"
else
  continue   # 다른 세션이 동시에 가져감 → 다음 후보
fi
```

#### 2-5. 선점 후 충돌 재검사 (경쟁 조건 최종 보루)

> 2-3 검사와 2-4 mv 사이에 다른 세션이 같은 파일을 claim했을 수 있다(TOCTOU).
> 이 검사가 **최종 보루**다.

claim 직후 doing/ 전체를 다시 읽어 내 `impact_files` ∩ 타 doing 파일 impact_files 를 검사:
- **겹침 발견 + 내 task id > 상대 task id** → 내가 나중에 등록된 작업이므로 양보:
  `mv doing→todo` 롤백 후 `continue`
- **겹침 발견 + 내 task id < 상대 task id** → 내가 먼저 등록된 작업이므로 유지하고 진행
- **겹침 없음** → 그대로 진행

---

모든 후보가 선행조건 미충족/locked 겹침/경쟁패배/충돌 양보 → "현재 착수 가능한 작업이 없습니다." 보고 후 종료.

선점 성공 시 frontmatter에 기록(Edit):
```yaml
claimed_at: {YYYY-MM-DD HH:MM}
claimed_by: {세션 식별자 (예: date+pid)}
```

---

### Step 3 — 작업 분류 (Tier 판단)

선점한 작업의 frontmatter `tier` 를 읽어 판단한다. **애매하면 한 단계 위 Tier로.**
> 파일 본문을 통째로 읽지 않는다 — frontmatter의 `tier` 값을 그대로 사용한다.

- 🟢 **Tier 1** (advisor 생략): typo·포맷·주석·import·1~5줄 미세 수정·리네이밍·`[skip-advisor]` → Step 4로
- 🟡 **Tier 2** (생략 가능): 같은 파일 추가 수정·7일 내 유사 자문·동일 패턴 반복 → Step 4로
- 🔴 **Tier 3** (advisor 필수): 새 기능/모듈·구조 변경·외부 통합·DB 스키마·인증/결제/보안 → Step 3-A 후 Step 4로

---

### Step 3-A — advisor 호출 (Tier 3 전용)

**⚡ 생략 조건**: frontmatter `advisor: done` 이면 task-add 시점에 이미 자문 완료 → 호출 생략, 본문 `## 구현 방안 (advisor)` 를 그대로 사용하고 Step 4로.

`advisor: done` 이 아닌 경우에만:
```
Agent({
  subagent_type: "advisor",
  prompt: `
    작업: {task 파일 본문 + impact_files}
    프로젝트 루트: {PROJECT_ROOT}
    관련 파일: {파악한 경로들}
    제약 조건: {CLAUDE.md 컨벤션 중 관련 항목}
  `
})
```
응답의 "영향 범위"에서 **새 파일** 발견 시:
1. task 파일 `impact_files` 에 즉시 append (Edit)
2. 충돌 재검사 — 새 파일이 다른 doing/ 의 impact_files와 겹치면 즉시 중단, `mv doing→todo` 롤백, 다음 루프 재시도

> advisor 에이전트 없음 → `task-manager/install.sh` 재실행 또는 `subagent_type: "Plan"` fallback.

---

### Step 3-B — 화면 작업 여부 확인

frontmatter `screen_work: true` 이거나 impact_files 확장자(`.html`·`.scss`·`.css`·`.component.ts`)·설명에 UI 키워드("화면/UI/컴포넌트/뷰/스타일/레이아웃/페이지/모달/드로어/폼/버튼/카드/테이블") 포함 시:

**Step 4 서브에이전트 위임 전(메인 세션에서):**
1. **브라우저 확인(구현 전)**: Playwright MCP(`mcp__plugin_ecc_playwright__`) 또는 `/browse` 로 현재 화면 스크린샷
2. **레퍼런스 조회**: `ecc:docs-lookup` 또는 Context7 MCP로 UI 프레임워크 최신 API 확인

→ 결과를 Step 4 서브에이전트 프롬프트의 **`## 화면 작업 컨텍스트`** 섹션에 기재하여 전달한다.

---

### Step 3-C — 프로젝트 컨벤션 파일 확인 (서브에이전트 전달용)

> 컨벤션 파일은 **서브에이전트가 직접 읽도록 경로를 프롬프트에 포함**한다.
> 메인 세션에서 직접 읽어 요약하면 컨텍스트만 낭비되고 서브에이전트엔 전달이 안 된다.

impact_files 경로에서 앱을 탐지(예: `verida-ops/src/...` → `{SESSION_ROOT}/verida-ops`)한 뒤,
Step 4 서브에이전트 프롬프트의 `## 컨벤션 파일` 항목에 아래 경로들을 기재한다:

```
## 컨벤션 파일 (코드 작성 전 반드시 Read)
- {SESSION_ROOT}/CLAUDE.md
- {PROJECT_ROOT}/CLAUDE.md              (있으면)
- {PROJECT_ROOT}/docs/FRONTEND-CONVENTIONS.md   (있으면)
```

서브에이전트가 위 경로들을 직접 Read하여 규칙을 파악·적용한다.
메인 세션은 경로만 전달하고 내용을 읽지 않는다.

---

### Step 3-C-2 — PROJECT_ROOT 확정 (서브에이전트 위임 전 필수)

서브에이전트 프롬프트에 `PROJECT_ROOT`를 넘겨야 하므로, **Step 4 호출 전에 반드시 결정**한다.

```bash
# impact_files 첫 번째 경로에서 git 루트 탐지
FIRST_FILE="{impact_files 중 첫 번째}"
PROJECT_ROOT=$(cd "$(dirname "$FIRST_FILE")" && git rev-parse --show-toplevel 2>/dev/null || echo "{SESSION_ROOT}")
```

> SESSION_ROOT(tasks 위치) ≠ PROJECT_ROOT(코드·빌드 위치). 혼용 금지.

---

### Step 4 — 구현 서브에이전트 위임 (컨텍스트 격리 · 필수)

> 🧹 **컨텍스트 누적 방지 설계**
> 코드 읽기·빌드 출력·커밋 로그가 메인 세션에 쌓이면, 루프로 반복 실행 시 컨텍스트 한계를 초과하여 중단된다.
> **코드 작성·빌드·커밋·완료 처리(Steps 4-I~4-V)를 전부 fresh Agent 서브에이전트에 위임한다.**
> 메인 세션은 선점(mv claim)과 결과 수신·검증만 담당 → 루프 전체에 걸쳐 컨텍스트가 최소로 유지된다.

**서브에이전트 호출:**

```
Agent({
  prompt: """
당신은 아래 task를 완전히 자율 실행하는 구현 에이전트다.
사용자 확인 없이 모든 결정을 스스로 내리고 즉시 실행한다.

## 환경
SESSION_ROOT: {SESSION_ROOT}
PROJECT_ROOT: {PROJECT_ROOT}
CLAIMED_FILE: {CLAIMED}   ← 현재 {SESSION_ROOT}/docs/tasks/doing/ 에 있음

## Task 내용 (전체)
{task 파일 전체 내용을 여기에 인라인으로 붙여넣기}

## 컨벤션 파일 (코드 작성 전 반드시 Read)
- {SESSION_ROOT}/CLAUDE.md
- {PROJECT_ROOT}/CLAUDE.md              (있으면)
- {PROJECT_ROOT}/docs/FRONTEND-CONVENTIONS.md   (있으면)

## 화면 작업 컨텍스트 (screen_work: true인 경우만 기재, 아니면 생략)
{Step 3-B에서 촬영한 구현 전 스크린샷 요약 및 API 참고사항}

## 수행 절차 (순서대로 · 생략 불가)

### I. 코드 작성

**① 시작 전 준비 (순서대로)**
1. 컨벤션 파일 Read (위 경로 목록)
2. impact_files 전체 Read — **task 설명의 "현재 상태"와 실제 파일이 일치하는지 확인**:
   - task에 "A 함수 없으므로 추가"라고 적혔는데 이미 있으면 → 건너뛰거나 다른 방향으로 재해석
   - A→C 작업인데 파일이 이미 B 상태면 → **B→C로 재해석**하여 구현
   - 재해석 불가 수준으로 의미가 달라졌으면 → `mv doing→blocked` + 사유 기록 후 "BLOCKED: 시점 불일치" 반환
3. 파일 수정 전: 워크트리 검증(`realpath`) + 새 파일이면 impact_files에 append(Edit)

**② 구현**
- task 파일에 `## 구현 체크리스트` 섹션이 있으면 **체크리스트 순회 모드**:
  첫 번째 `- [ ]` 항목 구현 → 완료 즉시 `- [x]` Edit → 다음 항목 반복 → 모두 완료 시 다음 단계
- 체크리스트가 없으면 일괄 구현
- 막히면 80% 가능 시 자체 판단으로 계속; 완전 불가 시 `mv doing→blocked` + 사유 기록 후 "BLOCKED: {사유}" 반환

### II. 빌드 검증
```bash
BUILD_LOCK="{PROJECT_ROOT}/.claude/build.lock"
WAITED=0
while [ -f "$BUILD_LOCK" ] && [ $WAITED -lt 300 ]; do sleep 5; WAITED=$((WAITED+5)); done
touch "$BUILD_LOCK"
cd {PROJECT_ROOT} && npm run build 2>&1
BUILD_RESULT=$?
rm -f "$BUILD_LOCK"
```
빌드 실패 시 자체 수정 최대 3회. 3회 실패 → `mv doing→blocked` + 사유 기록 후 "BLOCKED: 빌드 실패" 반환

### III. appVersion 증가 (environment.ts 있을 때만)
- MINOR(신규 기능·페이지) / MAJOR(아키텍처) / PATCH(나머지, 기본값)
- `sed`로 environment.ts + environment.prod.ts 동시 bump

### IV. Git 커밋
```bash
cd {PROJECT_ROOT} && git pull --rebase
git add {수정·생성한 영향 파일들만}   # git add -A 금지
git commit -m "feat(ops {id접미}): {제목}\n\n{bullet 요약}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
실패 시 최대 3회 재시도. 3회 모두 실패 → `mv doing→blocked` 후 "BLOCKED: 커밋 실패" 반환

### V. committed: 마커 기록 + mv doing→done
```bash
HASH=$(cd {PROJECT_ROOT} && git rev-parse --short HEAD)
# task 파일 frontmatter에 Edit: committed: {HASH}
# 완료 기록 append: ## 완료 기록\n✅ 완료: {요약} ({YYYY-MM-DD HH:MM})
mv "{SESSION_ROOT}/docs/tasks/doing/{CLAIMED}" "{SESSION_ROOT}/docs/tasks/done/{CLAIMED}"
# 검증
ls "{SESSION_ROOT}/docs/tasks/done/{CLAIMED}" && echo "DONE_OK" || echo "DONE_FAIL"
```

## 반환 형식 (마지막 줄에 반드시 출력)
성공: `RESULT: done | commit={HASH} | files={수정파일목록}`
실패: `RESULT: blocked | reason={사유}`
  """
})
```

**서브에이전트 반환 후 메인 세션 처리:**

| 반환값 | 메인 세션 동작 |
|---|---|
| `RESULT: done` | Step 4-V (done 존재 검증) 후 Step 5(아카이브) → Step 6(완료 보고) |
| `RESULT: blocked` | "blocked 처리 완료 — 사유: {reason}" 보고 후 종료 |
| 응답 없음/오류 | doing/ 직접 확인 → `committed:` 있으면 화해(done 이동), 없으면 blocked 이동 |

#### Step 4-V — done 존재 검증 (메인 세션 · 서브에이전트 완료 후)

```bash
ls "{SESSION_ROOT}/docs/tasks/done/$CLAIMED" >/dev/null 2>&1 \
  && echo "✅ done 확인" \
  || { echo "🚨 done 이동 실패 — 수동 화해 필요"; exit 1; }
```
존재 확인 후에만 Step 5(아카이브) → Step 6(완료 보고)로 진행한다.

---

### Step 5 — 완료 디렉터리 정리 (아카이브 일원화 · run에서만)

> 자동 아카이브는 **task-run에서만** 수행한다(task-add에서 제거됨 — `[x]`를 생산하는 주체가 run이므로).
> 단, 본문을 읽지 않으므로 컨텍스트 부담은 사실상 없다 — 정리는 선택적 위생 작업이다.

`done/` 파일 수가 **30개 초과**면 가장 오래된(파일명 정렬 앞) 것부터 `done/archive/` 로 이동하여 **최근 30개만** done/ 직하에 남긴다.
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/done/archive"
cnt=$(ls "{SESSION_ROOT}"/docs/tasks/done/*.md 2>/dev/null | wc -l)
# cnt>30 이면 오래된 (cnt-30)개를 done/archive/ 로 mv
```

---

### Step 6 — 완료 보고 + 루프 계속 여부 확인

완수한 작업 id·제목·커밋 해시·수정 파일 목록을 한 줄로 보고한다.

```
✅ [{id 접미}] {제목} | commit={HASH}
```

보고 직후 **todo/ 잔여 항목을 확인**하여 루프를 계속할지 결정한다:

```bash
remaining=$(ls "{SESSION_ROOT}"/docs/tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ')
```

| 결과 | 동작 |
|---|---|
| `remaining > 0` | user.lock 재확인(Step 0-A) 후 **Step 1로 복귀** (다음 작업 선점) |
| `remaining = 0` | `"✅ 모든 작업 완료 — todo/ 비어있음."` 보고 후 **종료** |

> 루프 반복 시 메인 세션 컨텍스트 증가는 미미하다 (작업 선점·결과 수신만; 구현·빌드·커밋은 서브에이전트).
> user.lock 파일을 생성하면 다음 루프에서 일시 정지된다: `touch {SESSION_ROOT}/.claude/user.lock`

---

## Red Lines (절대 금지)

### 워크트리·경로
- ❌ `git worktree add` / `cp`·`rsync` 워크트리 동기화
- ❌ `PROJECT_ROOT` 외부 경로 파일 수정
- ❌ 워크트리에서만 빌드 통과 확인 후 완료 처리

### 선점·충돌
- ❌ **mv claim 없이 작업 시작** — 반드시 todo→doing 원자 선점 성공 후 착수
- ❌ **영향 파일(impact_files) 충돌 검사 생략** (2-3·2-5) — 다중 에이전트 환경에서 치명적
- ❌ `doing/` 에 이미 있는 파일 착수 — locked_files 사전 검사(2-3)로 방지
- ❌ 영향 파일 미기재 작업 임의 처리 (blocked/ 이동 후 보강)
- ❌ mv claim 실패를 오류로 보고 종료 (다음 후보로 진행해야 함)
- ❌ 한 번에 두 개 이상 작업 동시 착수

### 완료 처리
- ❌ 작업 실패 시 done/ 으로 이동 (실패는 blocked/)
- ❌ **`doing/` 에 작업을 남긴 채 run 종료** — done/(커밋 성공) 또는 blocked/(3회 실패)로 반드시 이동
- ❌ **done/ 이동(Step 4-V 검증) 전에 "완료" 보고** — mv가 완료의 정의
- ❌ 커밋 성공 후 `committed:` 마커 기록 생략 — 마커 없으면 완료-고아 화해 불가
- ❌ **`committed:` 마커가 있는 doing/ 고아를 재실행** — Step 0-B에서 done/ 으로 화해할 것 (중복 커밋 방지)

### 구현·빌드·커밋 (서브에이전트 내부 규칙 — 서브에이전트가 준수)
- ❌ **코드 작성·빌드·커밋을 메인 세션에서 직접 실행** — 반드시 Step 4 Agent 서브에이전트에 위임
- ❌ Tier 3 작업을 advisor 없이 착수 (`advisor: done` 이면 생략 정상)
- ❌ 수정하지 않은 파일까지 `git add` / `git add -A`·`git add .`
- ❌ 빌드 통과 후 커밋 생략 — 작업 완료 = 커밋 필수
- ❌ 여러 작업 묶음 커밋 — 작업 하나당 커밋 하나
- ❌ 버전 파일이 있는데 PATCH 증가 생략

### 잠금
- ❌ `.claude/user.lock` 존재 시 무시하고 진행
- ❌ 빌드 lock 무시하고 동시 빌드

### 시점 불일치
- ❌ **task 설명의 "현재 상태"를 그대로 믿고 구현 시작** — 서브에이전트 Step I에서 impact_files를 Read로 직접 확인 후 실제 상태 기준으로 구현
- ❌ **시점 불일치 무시** — A→C 태스크라도 실제 파일이 B 상태면 B→C로 재해석해야 함
