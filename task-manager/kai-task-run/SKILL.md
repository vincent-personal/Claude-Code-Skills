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
  │  Step 2:   배치 선점 + (tier≥2+codex) Codex 리스크분석 launch+wait  [한 Bash · codex 없으면 자동skip]
  │  Step 4:   배치 병렬 스폰
  │  Step 5:   배치 폴링 + (종료 직후) Codex 분석 done 첨부·정리  [한 Bash]
  └─ Step 6:   완료 보고 + 아카이브 → Step 0-A로 루프

백그라운드 워커 (작업 1개 완수 후 조용히 종료)
  W-0:   작업 파일 Read + PROJECT_ROOT 결정
  W-1:   컨벤션 Read + 자체 플랜 + (메인이 띄운)Codex 플랜 참조·종합 + 코드 구현
  W-2:   빌드 검증
  W-3:   git add → pull --rebase → commit → push
  W-4:   committed: 마커 + mv doing→done   (Codex 분석 첨부는 메인 Step 5)
  ※ Agent() 재호출 없음 — 체인 없음 (codex는 CLI라 Bash 호출 = 체인 아님)
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
mkdir -p "{SESSION_ROOT}/docs/tasks"/{todo,doing,done,blocked,.staging,.plans}
```

> `.plans/` — tier≥2 task의 Codex 리스크분석(`*.codex.md`)을 임시 저장하는 공간 (Step 2 선점 Bash가 생성, codex 가용 시에만). 워커 구현 후 Step 5(폴링 종료 직후)가 분석을 done task 본문에 첨부하고 원본은 삭제 → `.plans/`는 비워지며, 잔여물은 다음 run 시작 시 60분 GC.

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
      bn="$(basename "$f")"
      mv "$f" "{SESSION_ROOT}/docs/tasks/done/$bn"
      # 화해 경로도 대응 .plans 임시파일 정리 (Step 5를 못 거친 누락분)
      find "{SESSION_ROOT}/docs/tasks/.plans" -maxdepth 1 -type f \( -name "$bn.codex.md" -o -name "$bn.prompt.txt" \) -delete 2>/dev/null || true
      continue
    fi
    MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
    [ $((NOW - MT)) -gt 1800 ] && mv "$f" "{SESSION_ROOT}/docs/tasks/todo/$(basename "$f")"
  done
fi

# staging / 오래된 codex 플랜 고아 청소
find "{SESSION_ROOT}/docs/tasks/.staging" -type f -mmin +30 -delete 2>/dev/null
find "{SESSION_ROOT}/docs/tasks/.plans" -type f -mmin +60 -delete 2>/dev/null

# todo 카운트
remaining=$(ls "{SESSION_ROOT}"/docs/tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "remaining=$remaining"
```

`remaining=0` → `"✅ 모든 작업 완료 — todo/ 비어있음."` 출력 후 **종료**.

---

### Step 2 — 배치 선점 + Codex 리스크 분석

> **모든 로직은 `task-claim-and-plan.sh` 가 수행한다** — FIFO 선정·mv 선점·Codex launch+wait 를 하나의 실행 파일에 담아, LLM이 단계를 쪼개거나 건너뛸 수 없게 한다.
> `task-claim-and-plan.sh` 미설치 시 `[ -x ]` 가 false → 전체 skip (원래 동작).
>
> ⚠️ **이 Bash 호출은 `timeout: 600000`(10분) 으로 실행한다** — Codex 가 수십 초~수 분 걸릴 수 있어 기본 2분에 끊기지 않게 한다.

```bash
output=$(bash "$HOME/.claude/tools/task-claim-and-plan.sh" "{SESSION_ROOT}" 5)
echo "$output"
```

`output` 파싱:
- `NONE` → **"착수 가능한 작업 없음."** 출력 후 **종료**
- `CLAIMED:<f>` 줄 → `CLAIMED_BATCH` 배열에 추가 (`f` = 파일명)
- `CODEX:<n>` → 로그 출력 (`n`건 Codex 완료)

선점 성공한 각 파일에 frontmatter `claimed_at` / `claimed_by` 기록(Edit).

---

---

### Step 4 — 배치 병렬 스폰

> **Codex 리스크 분석은 Step 2(`task-claim-and-plan.sh`)가 이미 완료했다.** 워커 스폰 시점엔 `.plans/{f}.codex.md` 가 (codex 가용·tier≥2 시) 이미 디스크에 있다. 여기서는 워커만 띄운다. (codex 미설치·저tier면 `.codex.md` 가 없을 뿐, 워커는 정상 진행)

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
> Codex 리스크분석(Step 2 선점 Bash에서 띄움·대기 완료)은 워커 W-1이 `.plans/{f}.codex.md` 로 참조한다.

모든 Agent 호출 후 즉시 Step 5(폴링)로 이동. 워커 반환값을 기다리지 않는다.

---

### Step 5 — 배치 폴링 + Codex 첨부

> **폴링·timeout 처리·Codex 첨부 모두 `task-poll-and-attach.sh` 가 수행한다** — 폴링 종료 직후 첨부까지 한 실행 파일에서 처리하므로, 첨부 단계를 건너뛸 수 없다.
>
> ⚠️ **이 Bash 호출은 `timeout: 3660000`(61분) 으로 실행한다** — 폴링 MAX(3600초) + 여유 시간.

```bash
output=$(bash "$HOME/.claude/tools/task-poll-and-attach.sh" "{SESSION_ROOT}" "${CLAIMED_BATCH[@]}")
echo "$output"
```

`output` 파싱 (Step 6 보고용):
- `DONE:<f>` / `BLOCKED:<f>` / `TIMEOUT:<f>`

> blocked/timeout task의 `.codex.md` 는 스크립트가 done 확인 후 남겨 둠 → 다음 시도 재사용 또는 Step 0-A 60분 GC로 정리.

---

### Step 6 — 완료 보고 + 아카이브 + 루프

### Step 6 — 완료 보고

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

### W-0.5 — Codex 플랜은 **메인 세션(Step 2)이 띄운다** (워커는 안 띄움)

워커는 Codex 플랜을 **띄우지 않는다**. tier≥2+codex 가용 시 메인 세션이 Step 2에서 백그라운드로 띄워 `docs/tasks/.plans/{{CLAIMED}}.codex.md` 를 생성하고, 첨부·정리는 Step 5가 한다. 워커는 W-1에서 그 파일을 **참조만** 한다.
> **권위 정의는 `~/.claude/agents/kai-task-worker.md` 의 W-1(3·3.5)** 를 따른다 (~90초 대기·종합 규칙). 상충 시 에이전트 파일 우선.

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

**커밋 포맷 결정 (W-1에서 읽은 CLAUDE.md 기준):**

W-1에서 읽은 `{PROJECT_ROOT}/CLAUDE.md` 의 커밋메시지 규칙을 확인한다:
- 언어 규칙 (한국어/영어)
- 타입 사용 여부 (`feat:`, `fix:` 등 Conventional Commits 여부)
- 제목/본문 포맷 특이사항

규칙이 없으면 기본 포맷(`feat({id접미}): {제목}`) 사용.

```bash
cd {PROJECT_ROOT}
git add {영향 파일만}   # git add -A / git add . 금지
git pull --rebase 2>/dev/null || true
# TITLE / BODY 는 위에서 확인한 프로젝트 커밋 컨벤션을 따라 작성
TITLE="feat({id접미}): {제목}"   # 컨벤션에 맞게 조정
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
