---
name: kai-task-run
description: |
  docs/tasks/todo/ 의 작업을 FIFO 순서로 모두 완수할 때까지 백그라운드 에이전트 체인으로 실행.
  메인 세션은 첫 워커만 시작하고 종료 → 컨텍스트 한계 없이 1,000개 이상도 처리 가능.
  작업이 없으면 자동 종료. mv 원자 claim + locked_files 충돌 검사로 다중 세션 안전성 확보.
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

# kai-task-run — 작업 실행 스킬 (백그라운드 에이전트 체인)

## 🤖 자율 실행 원칙 (최상위 규칙)

**이 스킬은 사용자 확인을 일절 요청하지 않는다. 모든 결정을 스스로 내리고 즉시 실행한다.**

- ❌ "확인이 필요합니다" / "어떻게 할까요?" 출력 금지
- ✅ 모호한 상황 → 가장 합리적인 해석으로 즉시 진행
- ✅ 파일 수정·빌드·git 커밋 → 확인 없이 즉시 실행
- ✅ 막히면 자체 해결 시도, 완전히 불가능할 때만 `blocked/` 이동 후 종료

---

## 역할 및 구조

```
메인 세션 (coordinator)
  → Step 0: SESSION_ROOT 탐지
  → Step 1: 첫 번째 워커 에이전트를 백그라운드로 시작 후 종료
             (메인 세션 컨텍스트 더 이상 소비하지 않음)

워커 에이전트 (백그라운드 · 작업 1개 처리)
  → 선점 → 구현 서브에이전트 → 커밋 → done
  → todo/ 남았으면 다음 워커를 백그라운드로 생성 후 종료
  → todo/ 비었으면 "모든 작업 완료" 출력 후 종료
```

컨텍스트 격리: 메인 세션 zero + 워커마다 fresh context + 구현마다 fresh subagent

---

## ⚠️ 최우선 안전 규칙 — 워크트리 절대 금지

- ❌ `git worktree add` / `cp`·`rsync` 워크트리 동기화
- ❌ 워크트리 내부에서만 빌드 통과 확인 후 완료 처리

모든 코드 수정은 **git 루트 아래의 원본 파일**에서만 수행한다.

---

## ⚡ 메인 세션 실행 절차

### Step 0 — SESSION_ROOT 탐지

> ⛔ `git rev-parse --show-toplevel` / `pwd` 로 결정 금지.

1. **Claude Code 시스템 컨텍스트의 `Primary working directory`** 값을 그대로 사용한다.
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

> **검증**: 경로에 하위 프로젝트 폴더명이 포함되면 잘못된 경로 — 상위로 올라간다.

---

### Step 0-M — 레거시 자동 마이그레이션 (1회)

`docs/check-list.md` 존재 + `docs/check-list.md.migrated` 부재 시:
각 항목(`- [ ]/[~]/[x]/[!]`)을 상태별 디렉토리로 변환 후 `check-list.md` → `check-list.md.migrated` rename.

---

### Step 1 — 첫 번째 워커 에이전트 시작

todo/ 가 비어있으면 → "실행할 작업이 없습니다. `/kai-task-add` 로 먼저 등록하세요." 후 종료.

있으면 → **워커 에이전트를 백그라운드로 시작**:

```
Agent({
  run_in_background: true,
  prompt: {아래 ## 워커 에이전트 지침 전체를 복사하되,
           {{SESSION_ROOT}} 를 실제 SESSION_ROOT 값으로 치환하여 삽입}
})
```

메인 세션 출력:
```
🚀 백그라운드 작업 시작됨.
   진행 상황: agents 뷰에서 확인
   일시 정지: touch {SESSION_ROOT}/.claude/user.lock
```

**이후 메인 세션은 종료한다.** (컨텍스트 소비 없음)

---

## 🔧 워커 에이전트 지침

> 이 섹션 전체가 Step 1의 `Agent({ prompt: ... })` 에 삽입된다.
> 새 워커를 생성할 때도 이 지침을 그대로 복사한다 ({{SESSION_ROOT}}는 이미 실제 값으로 치환됨).

---

당신은 kai-task-run 워커 에이전트다.
**작업 하나를 완수한 뒤, 다음 워커를 백그라운드로 생성하고 종료한다.**
사용자 확인 없이 모든 결정을 스스로 내리고 즉시 실행한다.

SESSION_ROOT: {{SESSION_ROOT}}

---

### W-0A — 사용자 잠금 확인

```bash
[ -f "{{SESSION_ROOT}}/.claude/user.lock" ] && echo "PAUSED" && exit 0
```
존재하면 즉시 종료 (잠금 해제 후 다음 워커가 재개).

---

### W-0B — 완료-고아 화해 + 좀비 복구 + 스테이징 청소

```bash
NOW=$(date +%s)
for f in "{{SESSION_ROOT}}"/docs/tasks/doing/*.md; do
  [ -e "$f" ] || continue
  # 1) committed: 마커 → done/ 화해 (재실행 금지)
  if awk '/^---$/{c++; next} c==1 && /^committed:[[:space:]]*[0-9a-f]/{found=1} END{exit !found}' "$f"; then
    mv "$f" "{{SESSION_ROOT}}/docs/tasks/done/$(basename "$f")"
    continue
  fi
  # 2) committed 없음 + 30분 경과 → todo/ 복귀
  MT=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")
  [ $((NOW - MT)) -gt 1800 ] && mv "$f" "{{SESSION_ROOT}}/docs/tasks/todo/$(basename "$f")"
done
find "{{SESSION_ROOT}}/docs/tasks/.staging" -type f -mmin +30 -delete 2>/dev/null
```

---

### W-1 — 상태 수집

```bash
# done/ id 목록
done_ids=$(ls "{{SESSION_ROOT}}"/docs/tasks/done/ 2>/dev/null | sed 's/--.*//')

# locked_files — doing/ 의 impact_files 합집합
locked_files=""
for df in "{{SESSION_ROOT}}"/docs/tasks/doing/*.md; do
  [ -e "$df" ] || continue
  files=$(awk '
    /^---$/{c++; next}
    c==1 && /^impact_files:/{b=1; next}
    c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
    c==1 && b && /^[^[:space:]]/{b=0}
  ' "$df")
  locked_files="$locked_files $files"
done
```

todo/ 가 비어있으면 → **W-7(완료)** 로 바로 이동.

---

### W-2 — 후보 선정 + 원자 선점

todo/ 를 파일명 정렬순(FIFO)으로 순회. 각 후보 `f` 에 대해:

**① 선행조건** — `predecessors` 의 모든 id가 `done_ids` 에 있어야 함. 없으면 skip.

**② impact_files 추출 + locked_files 겹침 검사** (단일 패스):
```bash
candidate_files=$(awk '
  /^---$/{c++; next}
  c==1 && /^impact_files:/{b=1; next}
  c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
  c==1 && b && /^[^[:space:]]/{b=0}
' "{{SESSION_ROOT}}/docs/tasks/todo/$f")

# 비어있으면 blocked/
[ -z "$candidate_files" ] && mv "{{SESSION_ROOT}}/docs/tasks/todo/$f" \
  "{{SESSION_ROOT}}/docs/tasks/blocked/$f" && continue

# locked_files 겹침 → skip
overlap=0
for cf in $candidate_files; do
  for lf in $locked_files; do
    [ "$cf" = "$lf" ] && overlap=1 && break 2
  done
done
[ $overlap -eq 1 ] && continue
```

**③ 원자 선점**:
```bash
mv "{{SESSION_ROOT}}/docs/tasks/todo/$f" "{{SESSION_ROOT}}/docs/tasks/doing/$f" 2>/dev/null \
  || continue   # 다른 세션이 가져감 → 다음 후보
CLAIMED="$f"
```

**④ 선점 후 충돌 재검사** (TOCTOU 보루):
claim 직후 doing/ 재스캔 → 내 impact_files ∩ 타 doing 파일 겹침 발견 + 내 id > 상대 id → `mv doing→todo` 롤백 + continue.

선점 성공 시 frontmatter에 `claimed_at`·`claimed_by` 기록(Edit).

모든 후보 실패 → **W-7(완료)** 로 이동.

---

### W-3 — Tier 판단 + 사전 준비

frontmatter `tier` 값 읽기. **애매하면 한 단계 위 Tier.**

**Tier 3 + `advisor: done` 아닌 경우** → advisor Agent 호출:
```
Agent({
  subagent_type: "advisor",
  prompt: "작업: {task 전체} | PROJECT_ROOT: {PROJECT_ROOT} | 요청: 완전한 impact_files + 구현방안 + 엣지케이스"
})
```
응답 수신 후 impact_files 업데이트, 충돌 재검사, `advisor: done` 기록.

**PROJECT_ROOT 결정** (서브에이전트 위임 전 필수):
```bash
FIRST_FILE="{impact_files 첫 번째}"
PROJECT_ROOT=$(cd "$(dirname "$FIRST_FILE")" && git rev-parse --show-toplevel 2>/dev/null \
  || echo "{{SESSION_ROOT}}")
```

**screen_work 확인**: `screen_work: true` 또는 `.html`·`.scss`·`.css`·`.component.ts` 포함 시:
→ Playwright MCP로 구현 전 스크린샷 + ecc:docs-lookup API 확인
→ 결과를 구현 서브에이전트 프롬프트 `## 화면 작업 컨텍스트`에 포함.

---

### W-4 — 구현 서브에이전트 위임

```
Agent({
  prompt: """
  당신은 아래 task를 완전히 자율 실행하는 구현 에이전트다.

  SESSION_ROOT: {{SESSION_ROOT}}
  PROJECT_ROOT: {PROJECT_ROOT}
  CLAIMED_FILE: {CLAIMED}  ← 현재 {{SESSION_ROOT}}/docs/tasks/doing/ 에 있음

  ## Task 내용 (전체)
  {task 파일 전체 내용}

  ## 컨벤션 파일 (코드 작성 전 반드시 Read)
  - {{SESSION_ROOT}}/CLAUDE.md
  - {PROJECT_ROOT}/CLAUDE.md            (있으면)
  - {PROJECT_ROOT}/docs/FRONTEND-CONVENTIONS.md  (있으면)

  ## 화면 작업 컨텍스트 (screen_work: true인 경우만)
  {W-3에서 촬영한 스크린샷 요약 + API 참고사항}

  ## 수행 절차

  ### I. 코드 작성
  1. 컨벤션 파일 Read
  2. impact_files Read — task 설명과 실제 파일 상태 비교·재해석
     (A→C인데 파일이 B면 B→C로 구현; 재해석 불가면 mv doing→blocked + "BLOCKED: 시점불일치" 반환)
  3. 파일 수정 전: realpath 워크트리 검증 + 새 파일이면 impact_files에 append(Edit)
  4. 구현 체크리스트 있으면 순회 모드: - [ ] 항목 구현 → - [x] Edit → 반복
     없으면 일괄 구현
  5. 막히면 80% 가능 시 자체 판단; 완전 불가 시 mv doing→blocked + "BLOCKED: {사유}" 반환

  ### II. 빌드 검증
  BUILD_LOCK="{PROJECT_ROOT}/.claude/build.lock"
  while [ -f "$BUILD_LOCK" ]; do sleep 5; done; touch "$BUILD_LOCK"
  cd {PROJECT_ROOT} && npm run build 2>&1; BUILD_RESULT=$?; rm -f "$BUILD_LOCK"
  실패 시 자체 수정 최대 3회. 3회 실패 → mv doing→blocked + "BLOCKED: 빌드실패" 반환

  ### III. appVersion bump (environment.ts 있을 때)
  MINOR(신규기능) / MAJOR(아키텍처) / PATCH(기본값)

  ### IV. Git 커밋
  cd {PROJECT_ROOT} && git pull --rebase
  git add {영향 파일만}  # git add -A 금지
  git commit -m "feat(ops {id접미}): {제목}\n\n{bullet요약}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  실패 시 3회 재시도. 3회 실패 → mv doing→blocked + "BLOCKED: 커밋실패" 반환

  ### V. committed: 마커 + mv doing→done
  HASH=$(cd {PROJECT_ROOT} && git rev-parse --short HEAD)
  # frontmatter Edit: committed: {HASH}
  # 본문 append: ## 완료 기록\n✅ 완료: {요약} ({YYYY-MM-DD HH:MM})
  mv "{{SESSION_ROOT}}/docs/tasks/doing/{CLAIMED}" "{{SESSION_ROOT}}/docs/tasks/done/{CLAIMED}"
  ls "{{SESSION_ROOT}}/docs/tasks/done/{CLAIMED}" && echo "DONE_OK" || echo "DONE_FAIL"

  ## 반환 형식 (마지막 줄)
  성공: RESULT: done | commit={HASH} | files={수정파일목록}
  실패: RESULT: blocked | reason={사유}
  """
})
```

---

### W-4V — done 존재 검증

```bash
ls "{{SESSION_ROOT}}/docs/tasks/done/$CLAIMED" >/dev/null 2>&1 \
  || { echo "🚨 done 이동 실패 — 화해 필요"; exit 1; }
```

| 반환값 | 처리 |
|---|---|
| `RESULT: done` | W-4V 검증 → W-5 → W-6 → W-7 |
| `RESULT: blocked` | "blocked 처리: {reason}" 출력 → W-7 |
| 없음/오류 | doing/ 확인 → committed: 있으면 done/ 화해, 없으면 blocked/ 이동 → W-7 |

---

### W-5 — 아카이브

`done/` 파일 수 > 30 이면 오래된 것부터 `done/archive/` 로 이동 (30개 유지):
```bash
mkdir -p "{{SESSION_ROOT}}/docs/tasks/done/archive"
cnt=$(ls "{{SESSION_ROOT}}"/docs/tasks/done/*.md 2>/dev/null | wc -l | tr -d ' ')
# cnt>30 이면 (cnt-30)개를 done/archive/ 로 mv
```

---

### W-6 — 완료 보고

```
✅ [{id접미}] {제목} | commit={HASH}
```

---

### W-7 — 다음 워커 체인 / 자동 종료 (핵심)

> ⛔ **절대 금지**: `Skill(kai-task-run)` 또는 `/kai-task-run` 호출 금지.
> 백그라운드 에이전트에서 Skill 도구는 차단된다. 반드시 아래 절차대로 `Agent()` 직접 호출.

```bash
# user.lock 재확인
[ -f "{{SESSION_ROOT}}/.claude/user.lock" ] && echo "⏸ user.lock — 일시 정지" && exit 0

remaining=$(ls "{{SESSION_ROOT}}"/docs/tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ')
```

**remaining = 0** → `"✅ 모든 작업 완료 — todo/ 비어있음."` 출력 후 종료.

**remaining > 0** → 다음 워커 생성:

1. SKILL.md 파일을 Read로 읽는다:
   ```bash
   SKILL_PATH="$HOME/.claude/skills/kai-task-run/SKILL.md"
   ```
2. `## 🔧 워커 에이전트 지침` 섹션부터 `## Red Lines` 직전까지를 추출한다.
3. 추출한 텍스트의 `{{SESSION_ROOT}}`가 이미 실제 경로로 치환되어 있는지 확인 (아니면 치환).
4. `Agent()` 도구로 직접 호출:
   ```
   Agent({
     run_in_background: true,
     prompt: {위에서 추출한 워커 지침 텍스트 전체}
   })
   ```
5. 즉시 종료.

---

## Red Lines (절대 금지)

### 워크트리·경로
- ❌ `git worktree add` / `cp`·`rsync` 워크트리 동기화
- ❌ `PROJECT_ROOT` 외부 경로 파일 수정

### 선점·충돌
- ❌ mv claim 없이 작업 시작
- ❌ locked_files 겹침 검사(W-2②) + 선점 후 재검사(W-2④) 생략
- ❌ mv claim 실패를 오류로 종료 (다음 후보로 진행)
- ❌ 한 워커에서 두 개 이상 작업 처리

### 완료 처리
- ❌ doing/ 에 작업 남긴 채 워커 종료 — 반드시 done/ 또는 blocked/
- ❌ done/ 이동(W-4V) 전에 "완료" 보고
- ❌ committed: 마커 기록 생략
- ❌ committed: 있는 doing/ 고아 재실행 (W-0B에서 done/ 화해)

### 체인
- ❌ **`Skill(kai-task-run)` 또는 `/kai-task-run` 호출** — 백그라운드에서 차단됨. 반드시 `Agent()` 직접 사용
- ❌ W-7에서 SKILL.md Read 없이 다음 워커 생성 시도

### 구현
- ❌ 코드 작성·빌드·커밋을 워커 에이전트 레벨에서 직접 실행 — W-4 구현 서브에이전트에 위임
- ❌ task 설명 그대로 믿고 구현 — 실제 파일 상태 Read 후 재해석
- ❌ git add -A / git add .
- ❌ 빌드 통과 후 커밋 생략
- ❌ 버전 파일 있는데 PATCH 증가 생략

### 잠금
- ❌ user.lock 무시
- ❌ build.lock 무시하고 동시 빌드
