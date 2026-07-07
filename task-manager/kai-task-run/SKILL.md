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
메인 세션 (얇은 루프 · 컨텍스트 최소 · 슬롯 리필)
  ┌─ Step 0-A: 잠금확인 + 좀비복구 + finalize sweep + todo확인 [단일 Bash]  ← 진입 1회
  │  ── 리필 루프 (INFLIGHT = 도는 워커 목록을 메인 세션이 유지) ──
  │  Step 2:   가용 슬롯만큼 선점(available = N − 도는 워커 수) + Codex launch+wait  [한 Bash]
  │  Step 4:   이번에 새로 선점한 것만 스폰
  │  Step 5:   INFLIGHT 중 하나라도 완료 시 반환(빈 슬롯 리필 신호) + Codex 첨부  [한 Bash]
  └─ Step 6:   완료분 보고 → Step 2로 (슬롯 재충전). INFLIGHT 비고 Step2 NONE이면 종료

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

> `.plans/` — tier≥2 task의 Codex 리스크분석(`*.codex.md`)을 임시 저장하는 공간 (Step 2 선점 Bash가 생성, codex 가용 시에만). 워커 구현 후 Step 5(폴링 종료 직후) 또는 **다음 run의 Step 0-A finalize sweep**이 분석을 done 본문에 첨부하고 원본을 삭제한다 → `.plans/`는 비워진다. poll을 못 거친 고아도 다음 run 진입 시 sweep이 복구하며, prompt.txt만 남은 잔여는 60분 GC가 backstop.

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
      # .plans 는 여기서 지우지 않는다 — 아래 finalize sweep이 done 본문에 Codex 분석을
      # 첨부한 뒤 삭제한다. 조기 삭제하면 첨부할 원본이 사라져 분석이 유실된다.
      continue
    fi
    MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
    [ $((NOW - MT)) -gt 1800 ] && mv "$f" "{SESSION_ROOT}/docs/tasks/todo/$(basename "$f")"
  done
fi

# Codex 분석 종결 sweep — poll(Step 5)을 못 거친 .plans 고아를 loop 시작 시 복구한다.
#   done/archive면 (미첨부 시) Codex 분석을 done 본문에 첨부 후 삭제, blocked면 삭제,
#   todo/doing(진행중)이면 건드리지 않음. poll(Step 5)과 같은 헬퍼를 공유(첨부 포맷 단일화).
#   위 화해 경로가 done으로 옮긴 것도 여기서 첨부된다(그래서 화해가 .plans를 지우지 않았다).
#   ※ 완전 예방이 아니라 다음 run 진입 시 자동 복구다 — 현재 run이 또 끊기면 새 고아가
#     생기고 다음 run sweep이 걷어낸다.
FINALIZE="$HOME/.claude/tools/task-finalize-codex.sh"
[ -x "$FINALIZE" ] && bash "$FINALIZE" "{SESSION_ROOT}"

# staging / codex 고아 backstop 청소 (codex 실패로 prompt.txt만 남은 경우 등)
find "{SESSION_ROOT}/docs/tasks/.staging" -type f -mmin +30 -delete 2>/dev/null
find "{SESSION_ROOT}/docs/tasks/.plans" -type f -mmin +60 -delete 2>/dev/null

# ready 마이그레이션 (레거시 1회·멱등) — ready: 필드가 없는 todo 파일에 ready: true stamp.
#   strict claim 게이트(task-claim-and-plan.sh ⓪)가 ready 부재 파일을 얼리지 않도록,
#   ready 도입 이전 세대 파일만 승격한다. add가 만든 신규 파일은 항상 ready 필드를
#   가지므로 이 루프에서 건드려지지 않는다(멱등 — 매 run 시작 실행해도 무해).
for tf in "{SESSION_ROOT}"/docs/tasks/todo/*.md; do
  [ -e "$tf" ] || continue
  awk '/^---$/{c++;next} c==1 && /^ready:/{f=1} c>=2{exit} END{exit !f}' "$tf" && continue
  awk 'NR==1 && /^---$/{print; print "ready: true"; next} {print}' "$tf" > "$tf.rdytmp" \
    && mv "$tf.rdytmp" "$tf"
done

# ready:false 고아 sweep — add가 후처리 도중 중단되어 미완성(ready:false)으로 30분+
#   방치된 todo 파일을 blocked/로 격리한다. 기존 kai-task-unblock 기계가 진단·처리한다.
NOW2=$(date +%s)
for tf in "{SESSION_ROOT}"/docs/tasks/todo/*.md; do
  [ -e "$tf" ] || continue
  rv=$(awk '/^---$/{c++;next} c==1 && /^ready:/{v=$2; gsub(/[[:space:]]/,"",v); print v; exit}' "$tf")
  [ "$rv" = "false" ] || continue
  MT=$(stat -f %m "$tf" 2>/dev/null || stat -c %Y "$tf")
  [ $((NOW2 - MT)) -gt 1800 ] || continue
  printf '\n<!-- BLOCKED: add 미완성 (ready:false 30분+ 고아) -->\n' >> "$tf"
  mv "$tf" "{SESSION_ROOT}/docs/tasks/blocked/$(basename "$tf")"
done

# todo 카운트 (claimable = ready:true — 위 마이그레이션 후 부재는 남지 않음)
remaining=$(ls "{SESSION_ROOT}"/docs/tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "remaining=$remaining"
```

`remaining=0` → `"✅ 모든 작업 완료 — todo/ 비어있음."` 출력 후 **종료**.

> ℹ️ `remaining>0` 이어도 전부 `ready:false`(add 미완성·아직 후처리 중)면 Step 2 선점이 `NONE`을 반환한다 — strict 게이트가 정상 동작한 것이며, 착수 가능한 준비완료 작업이 없다는 뜻이다.

---

### Step 2 — 슬롯 채우기 (가용 슬롯만큼 선점) + Codex 리스크 분석

> **모든 로직은 `task-claim-and-plan.sh` 가 수행한다** — FIFO 선정·슬롯 인식(가용 = N − 도는 워커 수)·mv 선점·Codex launch+wait 를 하나의 실행 파일에 담아, LLM이 단계를 쪼개거나 건너뛸 수 없게 한다.
> `task-claim-and-plan.sh` 미설치 시 `[ -x ]` 가 false → 전체 skip (원래 동작).
>
> ⚠️ **이 Bash 호출은 `timeout: 600000`(10분) 으로 실행한다** — Codex 가 수십 초~수 분 걸릴 수 있어 기본 2분에 끊기지 않게 한다.

```bash
# 리필 루프 매 회전 시작: 사용자 잠금 확인 (Step 0-A는 진입 1회이므로 여기서 반응)
[ -f "{SESSION_ROOT}/.claude/user.lock" ] && echo "⏸ user.lock — 새 선점 중단(도는 워커는 자체 완료)." && exit 0

output=$(bash "$HOME/.claude/tools/task-claim-and-plan.sh" "{SESSION_ROOT}" 5)
echo "$output"
```

> `INFLIGHT` = 현재 도는 워커의 task 파일명 목록. 메인 세션이 리필 루프 내내 유지한다(Step 2 선점으로 추가, Step 6 완료 보고로 제거). 첫 진입 시 빈 배열. claim 스크립트는 doing/ 을 세어 `available = N − doing_count` 만큼만 선점하므로 동시 워커가 N을 넘지 않는다.

`output` 파싱:
- `CLAIMED:<f>` 줄 → **이번 회전 스폰 대상**(`SPAWN` 배열)에 추가 **및 `INFLIGHT` 에 추가** (`f`=파일명). 각 파일에 frontmatter `claimed_at`/`claimed_by` 기록(Edit).
- `NONE`:
  - `INFLIGHT` 가 **비었으면** → `"✅ 모든 작업 완료."` 출력 후 **종료**.
  - `INFLIGHT` 가 **있으면**(도는 워커 존재) → 이번엔 `SPAWN` 없이 곧장 **Step 5(대기)로**. (파일 충돌·슬롯이 풀리면 다음 회전에 선점된다 — 충돌·기아 해소)
- `CODEX:<n>` → 로그 출력 (`n`건 Codex 완료)

---

---

### Step 4 — 이번 회전 스폰 (새로 선점한 것만)

> **Codex 리스크 분석은 Step 2가 이미 완료했다.** 스폰 시점엔 `.plans/{f}.codex.md` 가 (codex 가용·tier≥2 시) 이미 디스크에 있다. 여기서는 **이번에 새로 선점한 `SPAWN`의 워커만** 띄운다 — 이미 도는 `INFLIGHT` 워커는 그대로 둔다. (codex 미설치·저tier면 `.codex.md` 가 없을 뿐, 워커는 정상 진행)

`SPAWN` 이 비어있으면(Step 2에서 `NONE` + `INFLIGHT` 있음) 스폰 없이 Step 5로 간다. 아니면 `SPAWN`의 각 task에 대해 **하나의 응답에서 Agent를 동시 호출**한다:

```
# SPAWN의 각 f에 대해 동시에 (parallel):
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

모든 Agent 호출 후 즉시 Step 5로 이동. 워커 반환값을 기다리지 않는다.

---

### Step 5 — 하나라도 완료될 때까지 대기 (슬롯 리필) + Codex 첨부

> **`task-poll-and-attach.sh` 가 `INFLIGHT` 중 하나라도 종료되면 즉시 반환**한다(빈 슬롯 리필 신호). 진행중은 `RUNNING`. timeout 처리(MAX 1시간 동안 아무도 안 끝남)·Codex 첨부도 이 스크립트가 수행하므로, 첨부 단계를 건너뛸 수 없다.
>
> ⚠️ **이 Bash 호출은 `timeout: 3660000`(61분) 으로 실행한다** — 폴링 MAX(3600초) + 여유 시간.

```bash
output=$(bash "$HOME/.claude/tools/task-poll-and-attach.sh" "{SESSION_ROOT}" "${INFLIGHT[@]}")
echo "$output"
```

`output` 파싱:
- `DONE:<f>` / `BLOCKED:<f>` → **`INFLIGHT` 에서 제거** + Step 6 보고에 누적.
- `RUNNING:<f>` → `INFLIGHT` 유지(아직 도는 중 — 다음 회전 Step 5에 다시 넘어간다).

> 종결(첨부+청소)은 `task-finalize-codex.sh` 가 수행한다(Step 0-A sweep과 공유). done/archive면 미첨부 시 Codex 분석을 본문에 첨부 후 삭제, blocked면 삭제한다. poll을 못 거친 고아(세션 중단 등)는 다음 run **Step 0-A finalize sweep**이 복구하고, codex 실패로 prompt.txt만 남은 잔여는 60분 GC가 backstop 처리한다.

---

### Step 6 — 완료분 보고 + 리필 루프

이번 회전에 종료된(Step 5의 `DONE`/`BLOCKED`) task 결과만 출력:
```
✅ [{id접미}] {제목}          (done/)
⚠️ [{id접미}] {제목} — blocked  (blocked/)
```
(MAX 초과 좀비 정리분은 committed 여부에 따라 done/blocked 로 이미 분류되어 위와 동일하게 보고된다.)

**아카이브** (done/ > 30개 시 오래된 것부터 done/archive/ 이동):
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/done/archive"
cnt=$(ls "{SESSION_ROOT}"/docs/tasks/done/*.md 2>/dev/null | wc -l | tr -d ' ')
# cnt > 30 이면 (cnt-30)개를 done/archive/ 로 mv (이름순 정렬 앞에서부터)
```

**→ Step 2로 돌아가 빈 슬롯을 다시 채운다** (리필 루프). Step 2가 `NONE` 이고 `INFLIGHT` 가 비면 그때 종료한다.
> 배치 배리어와 달리, 한 워커가 오래 걸려도 다른 슬롯은 Step 2·5·6을 계속 돌며 새 작업을 착수한다 — 긴 작업이 짧은 작업을 막지 않는다. Step 0-A(무거운 좀비복구·sweep)는 재진입하지 않는다(진입 시 1회). 좀비는 Step 5의 MAX(61분) timeout이 커버한다.

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
