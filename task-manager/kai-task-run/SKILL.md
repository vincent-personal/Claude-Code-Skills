---
name: kai-task-run
description: |
  docs/tasks/todo/ 의 작업을 FIFO 순서로 완수할 때까지 메인 세션 루프 실행.
  각 작업은 백그라운드 워커(독립 컨텍스트)에 위임 → 파일시스템 폴링으로 완료 감지.
  메인 세션 컨텍스트 최소 유지 · 서브에이전트 체인 없음 · 권한 문제 없음.
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

# kai-task-run — 작업 실행 스킬 (메인 루프 + 백그라운드 워커)

## 🤖 자율 실행 원칙 (최상위 규칙)

**이 스킬은 사용자 확인을 일절 요청하지 않는다. 모든 결정을 스스로 내리고 즉시 실행한다.**

- ❌ "확인이 필요합니다" / "어떻게 할까요?" 출력 금지
- ✅ 모호한 상황 → 가장 합리적인 해석으로 즉시 진행
- ✅ 파일 수정·빌드·git 커밋 → 확인 없이 즉시 실행
- ✅ 막히면 자체 해결, 완전 불가 시 `blocked/` 이동 후 다음 작업

---

## 역할 및 구조

```
메인 세션 (얇은 루프 · 컨텍스트 최소)
  ┌─ Step 0-A: 잠금확인 + 좀비복구 + todo확인 [단일 Bash]  ← 루프 시작점
  │  Step 2:   충돌없는 배치 선점 (impact_files 교집합 없는 task 묶음 → mv claim)
  │  Step 4:   배치 병렬 스폰 (BATCH의 각 task → Agent 동시 호출)
  │  Step 5:   배치 폴링 (모든 워커 done/blocked 감지까지 대기)
  └─ Step 6:   완료 보고 → Step 0-A로 루프

백그라운드 워커 (작업 1개 완수 후 조용히 종료)
  W-0: 작업 파일 Read + PROJECT_ROOT 결정
  W-1: 컨벤션 Read + 코드 구현
  W-2: 빌드 검증
  W-3: git add → pull --rebase → commit → push
  W-4: committed: 마커 + mv doing→done
  ※ Agent() 재호출 없음 — 체인 없음
```

**핵심 설계 원칙:**
- `Agent()` 는 **메인 세션에서만** 호출 (서브에이전트→서브에이전트 체인 없음)
- 메인 세션은 경로·결과만 보고 받음 → 컨텍스트 최소
- 파일시스템(done/ / blocked/)이 완료 신호 — 별도 반환값 없음

---

## ⚠️ 최우선 안전 규칙 — 워크트리 절대 금지

- ❌ `git worktree add` / `cp`·`rsync` 워크트리 동기화
- ❌ `PROJECT_ROOT` 외부 파일 수정

---

## ⚡ 메인 세션 실행 절차

### Step 0 — SESSION_ROOT 탐지

> ⛔ `git rev-parse --show-toplevel` / `pwd` 로 결정 금지.

1. **Claude Code 시스템 컨텍스트의 `Primary working directory`** 값을 그대로 사용.
2. 못 찾으면 — 상위로 올라가며 가장 상위의 `CLAUDE.md`가 있는 디렉토리:
   ```bash
   path=$(pwd); last="$path"
   while [ "$path" != "/" ]; do
     [ -f "$path/CLAUDE.md" ] && last="$path"
     path=$(dirname "$path")
   done
   echo "$last"
   ```

```bash
mkdir -p "{SESSION_ROOT}/docs/tasks"/{todo,doing,done,blocked,.staging}
```

---

### Step 0-M — 레거시 자동 마이그레이션 (1회)

`docs/check-list.md` 존재 + `docs/check-list.md.migrated` 부재 시:
각 항목(`- [ ]/[~]/[x]/[!]`)을 상태별 디렉토리로 변환 후 `check-list.md.migrated` rename.

---

### Step 0-A — 루프 준비 (단일 Bash 블록) ← **루프 시작점**

아래 스크립트를 **한 번에** 실행한다 (잠금 확인 + 좀비 복구 + todo 카운트):

```bash
# 사용자 잠금
[ -f "{SESSION_ROOT}/.claude/user.lock" ] && echo "⏸ user.lock — 종료." && exit 0

# 완료-고아 화해 + 좀비 복구 (doing/ 파일 있을 때만 실행)
if ls "{SESSION_ROOT}"/docs/tasks/doing/*.md 2>/dev/null | grep -q .; then
  NOW=$(date +%s)
  for f in "{SESSION_ROOT}"/docs/tasks/doing/*.md; do
    [ -e "$f" ] || continue
    if awk '/^---$/{c++; next} c==1 && /^committed:[[:space:]]*[0-9a-f]/{found=1} END{exit !found}' "$f"; then
      mv "$f" "{SESSION_ROOT}/docs/tasks/done/$(basename "$f")"
      continue
    fi
    MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
    [ $((NOW - MT)) -gt 1800 ] && mv "$f" "{SESSION_ROOT}/docs/tasks/todo/$(basename "$f")"
  done
fi

# staging 고아 청소
find "{SESSION_ROOT}/docs/tasks/.staging" -type f -mmin +30 -delete 2>/dev/null

# todo 카운트
remaining=$(ls "{SESSION_ROOT}"/docs/tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "remaining=$remaining"
```

`remaining=0` → `"✅ 모든 작업 완료 — todo/ 비어있음."` 출력 후 **종료**.

---

### Step 2 — 충돌없는 배치 선정 + 원자 선점

**최대 동시 워커 수: 5개** (git push race 방지)

**준비 — 기존 doing/ 파일 잠금 목록 구성:**
```bash
done_ids=$(ls "{SESSION_ROOT}"/docs/tasks/done/ 2>/dev/null | sed 's/--.*//')
locked_files=""
for df in "{SESSION_ROOT}"/docs/tasks/doing/*.md; do
  [ -e "$df" ] || continue
  files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$df")
  locked_files="$locked_files $files"
done
BATCH=()        # 이번 루프에서 선점할 task 파일명 배열
batch_files=""  # BATCH에 포함된 task들의 impact_files 누적 (배치 내 충돌 방지용)
```

**todo/ FIFO 순회 — 배치 구성:**

각 후보 `f` 에 대해 순서대로:

**① 선행조건** — `predecessors` 의 모든 id가 `done_ids` 에 있어야 함. 아니면 skip.

**② impact_files 추출:**
```bash
candidate_files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "{SESSION_ROOT}/docs/tasks/todo/$f")
[ -z "$candidate_files" ] && mv "{SESSION_ROOT}/docs/tasks/todo/$f" "{SESSION_ROOT}/docs/tasks/blocked/$f" && continue
```

**③ 충돌 검사 — locked_files + batch_files 모두와 교집합 확인:**
```bash
overlap=0
for cf in $candidate_files; do
  echo "$locked_files $batch_files" | grep -qF "$cf" && overlap=1 && break
done
[ $overlap -eq 1 ] && continue  # 이번 배치에서 제외 (다음 루프에서 처리)
```

**④ 배치 추가:**
```bash
BATCH+=("$f")
batch_files="$batch_files $candidate_files"
[ ${#BATCH[@]} -ge 5 ] && break  # 최대 5개
```

**배치 전체 원자 선점:**
```bash
CLAIMED_BATCH=()
for f in "${BATCH[@]}"; do
  mv "{SESSION_ROOT}/docs/tasks/todo/$f" "{SESSION_ROOT}/docs/tasks/doing/$f" 2>/dev/null && CLAIMED_BATCH+=("$f")
done
```

선점 성공한 각 파일에 frontmatter `claimed_at` / `claimed_by` 기록(Edit).

`${#CLAIMED_BATCH[@]} -eq 0` → "착수 가능한 작업 없음." 출력 후 **종료**.

---

---

### Step 4 — 배치 병렬 스폰

`CLAIMED_BATCH`의 각 task에 대해 **하나의 응답에서 Agent를 동시 호출**한다:

```
# CLAIMED_BATCH의 각 f에 대해 동시에 (parallel):
Agent({
  subagent_type: "kai-task-worker",
  run_in_background: true,
  prompt: """
SESSION_ROOT: {SESSION_ROOT}
CLAIMED_FILE: {SESSION_ROOT}/docs/tasks/doing/{f}
  """
})
```

> 워커 지침은 `~/.claude/agents/kai-task-worker.md` 에서 자동 로드됨.
> PROJECT_ROOT는 워커가 CLAIMED_FILE의 impact_files에서 직접 결정한다.

모든 Agent 호출 후 즉시 Step 5(폴링)로 이동. 워커 반환값을 기다리지 않는다.

---

### Step 5 — 배치 폴링

```bash
MAX=3600; ELAPSED=0
while true; do
  PENDING=0
  for f in "${CLAIMED_BATCH[@]}"; do
    ls "{SESSION_ROOT}/docs/tasks/done/$f" 2>/dev/null && continue
    ls "{SESSION_ROOT}/docs/tasks/blocked/$f" 2>/dev/null && continue
    PENDING=$((PENDING + 1))
  done
  [ $PENDING -eq 0 ] && break   # 모두 완료
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  [ $ELAPSED -ge $MAX ] && break  # timeout
done
```

timeout 시: 남은 doing/ 파일 각각 → committed: 있으면 done/ 화해, 없으면 blocked/ 이동.

---

### Step 6 — 완료 보고 + 아카이브 + 루프

CLAIMED_BATCH의 각 task 결과를 출력:
```
✅ [{id접미}] {제목}          (done/)
⚠️ [{id접미}] {제목} — blocked  (blocked/)
🕐 [{id접미}] {제목} — timeout  (timeout)
```

**아카이브** (done/ > 30개 시 오래된 것부터 done/archive/ 이동):
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/done/archive"
cnt=$(ls "{SESSION_ROOT}"/docs/tasks/done/*.md 2>/dev/null | wc -l | tr -d ' ')
# cnt > 30 이면 (cnt-30)개를 done/archive/ 로 mv (이름순 정렬 앞에서부터)
```

**→ Step 0-A로 돌아가 다음 작업 처리.**

---

## 🔧 백그라운드 워커 지침

> 이 섹션 전체가 Step 4의 `Agent({ prompt: ... })` 에 삽입된다.
> `{{SESSION_ROOT}}` / `{{CLAIMED}}` 는 Step 4에서 이미 실제 값으로 치환됨.
> PROJECT_ROOT는 워커가 W-0에서 impact_files 경로로 직접 결정한다 (메인 세션 전달 없음).

---

당신은 kai-task-run 백그라운드 워커다.
**작업 하나를 완수하고 조용히 종료한다. Agent()를 절대 호출하지 않는다.**

SESSION_ROOT: {{SESSION_ROOT}}
CLAIMED_FILE: {{SESSION_ROOT}}/docs/tasks/doing/{{CLAIMED}}

---

### W-0 — 작업 파일 Read + PROJECT_ROOT 결정

작업 파일 전체 Read:
```
{{SESSION_ROOT}}/docs/tasks/doing/{{CLAIMED}}
```

`impact_files`, `tier`, `skip_build`, `predecessors` 파악.

PROJECT_ROOT 결정:
```bash
FIRST_FILE="{impact_files 첫 번째 파일 절대경로}"
PROJECT_ROOT=$(cd "$(dirname "$FIRST_FILE")" && git rev-parse --show-toplevel 2>/dev/null || echo "{{SESSION_ROOT}}")
```

---

### W-1 — 컨벤션 Read + 코드 구현

1. Read (있는 것만):
   - `{{SESSION_ROOT}}/CLAUDE.md`
   - `{PROJECT_ROOT}/CLAUDE.md`
   - `{PROJECT_ROOT}/docs/FRONTEND-CONVENTIONS.md`

2. impact_files Read — task 설명과 실제 파일 상태 비교·재해석
   (A→C인데 실제 파일이 B면 B→C로 구현; 재해석 불가 → `mv doing→blocked` + "BLOCKED: 시점불일치" 후 종료)

3. 새 파일 생성 시 impact_files에 append(Edit)

4. 구현 체크리스트 있으면 순회: `- [ ]` 구현 → `- [x]` Edit → 반복. 없으면 일괄 구현.

5. 막히면 80% 가능 시 자체 판단; 완전 불가 → `mv doing→blocked` + "BLOCKED: {사유}" 후 종료.

---

### W-2 — 빌드 검증 (`skip_build: true` frontmatter 없는 경우)

```bash
BUILD_LOCK="{PROJECT_ROOT}/.claude/build.lock"
while [ -f "$BUILD_LOCK" ]; do sleep 5; done
touch "$BUILD_LOCK"
cd {PROJECT_ROOT} && npm run build 2>&1
BUILD_RESULT=$?
rm -f "$BUILD_LOCK"
```

실패 시 자체 수정 최대 3회. 3회 실패 → `mv doing→blocked` + "BLOCKED: 빌드실패" 후 종료.

---

### W-3 — Git 커밋

```bash
cd {PROJECT_ROOT}
git add {영향 파일만}   # git add -A / git add . 금지
git pull --rebase 2>/dev/null || true
TITLE="feat({id접미}): {제목}"
BODY="- {bullet 요약}"
CO="Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git commit -m "$TITLE" -m "$BODY" -m "$CO"
git push
```

**금지 패턴 (classifier 차단):**
- `git commit -m "$(cat <<'EOF'"` — heredoc
- `MSG="..." && git commit -m "$MSG"` — 긴 변수 할당
- `git commit --no-edit`

실패 시 3회 재시도. 3회 실패 → `mv doing→blocked` + "BLOCKED: 커밋실패" 후 종료.

---

### W-4 — 완료 처리

```bash
HASH=$(cd {PROJECT_ROOT} && git rev-parse --short HEAD)
# frontmatter Edit: committed: {HASH}
# 본문 append: ## 완료 기록\n✅ 완료: {요약} ({YYYY-MM-DD HH:MM})
mv "{{SESSION_ROOT}}/docs/tasks/doing/{{CLAIMED}}" "{{SESSION_ROOT}}/docs/tasks/done/{{CLAIMED}}"
ls "{{SESSION_ROOT}}/docs/tasks/done/{{CLAIMED}}" || mv "{{SESSION_ROOT}}/docs/tasks/doing/{{CLAIMED}}" "{{SESSION_ROOT}}/docs/tasks/blocked/{{CLAIMED}}"
```

**종료. Agent() 호출 없음.**

---

## Red Lines (절대 금지)

### 워크트리·경로
- ❌ `git worktree add` / 워크트리 동기화
- ❌ `PROJECT_ROOT` 외부 파일 수정

### 선점·충돌
- ❌ mv claim 없이 작업 시작
- ❌ locked_files 겹침 검사(Step 2) 생략
- ❌ 한 워커에서 두 개 이상 작업 처리

### 완료 처리
- ❌ doing/ 에 작업 남긴 채 워커 종료 — 반드시 done/ 또는 blocked/
- ❌ committed: 마커 기록 생략
- ❌ committed: 있는 doing/ 고아 재실행 (Step 0-A에서 done/ 화해)

### 체인 (워커 전용 — 가장 중요)
- ❌ **워커 안에서 `Agent()` 호출** — 서브에이전트에서 절대 불가
- ❌ Skill 도구 호출

### 커밋
- ❌ `git add -A` / `git add .`
- ❌ heredoc commit (`cat <<'EOF'`)
- ❌ 긴 변수 할당 commit (`MSG="긴텍스트..."`)
- ❌ `git commit --no-edit`
- ❌ 빌드 통과 후 커밋 생략

### 잠금
- ❌ user.lock 무시
- ❌ build.lock 무시하고 동시 빌드
