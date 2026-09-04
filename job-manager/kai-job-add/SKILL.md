---
name: kai-job-add
description: |
  사용자 명령을 최대한 빨리 다듬어 docs/jobs/todo/ 에 잡 파일 1개로 등록하는 초경량 전역 스킬.
  등록은 백그라운드 워커(sonnet)가 수행, 메인 세션은 즉시 턴 종료 — 분석·계획·구현은 전부 /kai-job-run 의 몫.
  트리거: /kai-job-add
  사용법: /kai-job-add {작업 명령}
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

# kai-job-add — 잡 등록 (초경량 · 속도 최우선 · 백그라운드)

## 역할

사용자 명령을 받아 `docs/jobs/todo/` 에 잡 파일 1개를 만들고 끝낸다.
존재 이유는 단 하나 — **빠른 세션에서 연달아 내리는 명령을 순서대로 잃지 않고 큐에 담는 것**.
메인 세션은 ID 발급과 스폰만 하고 **즉시 턴을 종료**한다 (큐의 다음 명령이 곧바로 흐른다).

> ⚠️ **절대 원칙**: 등록 전용. 구현·심층 분석·계획 수립은 일체 하지 않는다 — 전부 `/kai-job-run` 의 몫.
> kai-task-add 와 달리 **advisor·교차 검증·Tier 분류·병합 스캔·ready 플래그가 없다.** 속도의 대가가 아니라 설계다: 무거운 판단은 실행 시점(run)에 한 번만 한다.

> 🧱 저장 모델 (디렉터리 = 상태, 전이는 `mv` 만):
> ```
> docs/jobs/todo/     미시작    docs/jobs/doing/    실행중
> docs/jobs/done/     완료      docs/jobs/blocked/  막힘
> docs/jobs/.staging/ 작성 중 임시 (완성 후 원자적 mv — 부분 파일이 todo/ 에 노출되지 않음)
> ```
> 운용 전제: **run 은 단일 세션·순차 실행, add 는 다중 세션·연속 등록 허용.**

---

## ⚡ 실행 절차

### Step 0 — 세션 루트 + JOB_ID (메인 세션 · Bash 1회)

SESSION_ROOT = 시스템 컨텍스트의 `Primary working directory` 값 그대로.
(못 찾으면: 현 위치에서 상위로 올라가며 **가장 상위의 CLAUDE.md 가 있는 디렉터리**. `git rev-parse`/`pwd` 로 결정 금지 — 하위 프로젝트에 jobs/ 가 생긴다.)

```bash
mkdir -p "{SESSION_ROOT}/docs/jobs"/{todo,doing,done,blocked,.staging}
JOB_ID="$(date +%Y%m%d-%H%M%S)-$$-$(printf '%04x' $RANDOM)"
echo "JOB_ID=$JOB_ID"
```

- JOB_ID 는 **턴 시작 시 메인이 선발급** → 완료 순서와 무관하게 파일명 정렬 = 명령 순서 = run 의 FIFO.

### Step 1 — 등록 워커 스폰 (백그라운드 · sonnet 고정) → 턴 즉시 종료

```
Agent({
  run_in_background: true,
  model: "sonnet",          // 등록은 가볍다 — 빠른 모델 고정
  prompt: """
당신은 잡 등록 워커다. 아래 명령을 다듬어 잡 파일 1개를 만들고 조용히 종료한다. 구현·심층 분석 금지.

SESSION_ROOT: {SESSION_ROOT}
JOB_ID: {JOB_ID}

## 사용자 명령
{원문 그대로. 이미지가 있었으면 메인이 그 내용을 글로 풀어 여기 포함}

## 대화 맥락 보충 (메인이 채움 — 원문에 없는 직전 결정·제약이 있으면 반드시)
{없으면 "없음"}

## 절차
1. **빠른 스캔 (상한: 검색 4회 · 파일 내용 Read 0회)** — 명령에 언급된 화면·컴포넌트·기능명을
   Glob/Grep 최대 4회로 찾아 관련 파일 후보를 잡는다. 경로가 명령에 있으면 검색 생략.
   4회 안에 못 찾으면 `? {추정 키워드}` 로 남긴다 — 깊이 파지 않는다(정확한 특정은 run 의 몫).
2. **잡 파일 작성** — `{SESSION_ROOT}/docs/jobs/.staging/{JOB_ID}--{slug}.md` 에 Write 후 원자적 mv:
   (slug = title 소문자·하이픈 60자 이내, 한글 허용)
   ```
   ---
   id: {JOB_ID}
   title: {명령 한 줄 요약 60자 이내}
   created: {YYYY-MM-DD HH:MM}
   files:
     - {후보 경로 또는 "? 키워드"}
   ---

   ## 요청 (원문)
   {사용자 명령 원문 그대로}

   ## 보충
   {다듬은 요지 2~5줄: 무엇을·어디서(후보)·주의 힌트 + 위 대화 맥락 보충 반영.
    run 은 이 파일만 보고 일한다 — 여기 없는 맥락은 사라진다.}
   ```
   ```bash
   mv "{SESSION_ROOT}/docs/jobs/.staging/{파일명}" "{SESSION_ROOT}/docs/jobs/todo/{파일명}"
   ```
3. 마지막 줄 출력: `RESULT: queued | id={JOB_ID} | title={title} | files={후보,...}`
  """
})
```

**스폰 직후 (같은 턴):** `📥 등록 중 — {요약}` 한 줄만 보고하고 **턴을 즉시 종료**한다.
**완료 알림 수신 시:** `RESULT:` 를 확인해 한 줄 보고. `RESULT:` 부재·에러면 실패 보고 (잡 파일 미생성 — 재등록 안내).

---

## Red Lines (절대 금지)

- ❌ 구현·코드 수정·파일 내용 Read — 등록 전용
- ❌ advisor·kai_consult·추가 서브에이전트 호출 — run 의 몫 (등록을 느리게 만드는 원흉)
- ❌ 체크리스트/구현 계획 작성 — run 이 코드를 연 뒤에 만든다
- ❌ 검색 4회 초과 — 못 찾으면 `?` 로 넘긴다
- ❌ 기존 todo 병합 판단 — 하지 않는다 (중복은 run 이 실행 시점에 "이미 반영됨"으로 정리)
- ❌ 등록 워커를 포그라운드로 대기 — `run_in_background` 스폰 후 턴 종료
- ❌ 워커 model 을 sonnet 외로 지정 — 등록에 무거운 모델 낭비 금지
- ❌ 빈 파일 선생성 — .staging 완성본 → 원자적 mv 만
- ❌ 대화 맥락 정보를 프롬프트에 안 담고 생략 — 워커·run 은 대화를 못 본다
- ❌ `git worktree add` / `cp` / `rsync`
