---
name: kai-job-run
description: |
  docs/jobs/todo/ 의 잡을 FIFO 로 하나씩 완수하는 전역 스킬 (kai-job-add 와 쌍).
  메인 세션은 얇은 루프(선점·난이도 판정·스폰·결과 확인)만, 분석·작업 목록·구현·커밋은
  난이도별 모델(sonnet/opus/fable)로 라우팅된 백그라운드 워커가 수행.
  트리거: /kai-job-run
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - Grep
  - Glob
  - Agent
---

# kai-job-run — 잡 실행 (얇은 루프 + 난이도 라우팅 백그라운드 워커)

## 🤖 자율 실행 원칙 (최상위)

**사용자 확인을 일절 요청하지 않는다.** 모호하면 가장 합리적인 해석으로 즉시 진행, 막히면 자체 해결, 완전 불가만 `blocked/` 이동 후 다음 잡.

## 구조

```
메인 세션 (얇은 루프 · 잡당 Bash 1~2회 + 스폰 1회)
  Step 0: 화해(doing 잔류 정리) + user.lock 확인          ← 진입 1회
  Step 1: FIFO 선점 (todo 최고참 → mv doing) + 병합 스캔(중복·동일범위·연속수정 ≤4건 함께)
  Step 2: 난이도 판정(frontmatter+보충만) → 모델 선택
  Step 3: 워커 스폰(run_in_background) → 턴 종료 대기
  Step 4: 완료 알림 → done/blocked 확인·보고 → Step 1 로

백그라운드 워커 (잡 1개 완수 후 조용히 종료 · Agent() 재호출 없음)
  W-1: 코드 추적 → 잡 파일에 ## 작업 목록 작성 (추적 기반 체크리스트)
  W-2: (난이도 시) kai_consult 교차 검증 1회
  W-3: 목록 순회 구현 (- [ ] → 구현 → - [x])
  W-4: 빌드 검증 → 커밋
  W-5: 작업 목록 삭제 + ## 결과 요약 → mv done/
```

> **순차 1개 = 설계다.** 병렬 슬롯·영향파일 충돌 검사·폴링 스크립트가 전부 불필요해진다.
> 순서 보존(등록 순서대로 실행)이 이 쌍의 존재 이유이며, 워커 격리로 메인 컨텍스트는 최소로 유지된다.

---

## ⚡ 메인 세션 절차

### Step 0 — 진입 (Bash 1회)

SESSION_ROOT = `Primary working directory` (kai-job-add 와 동일 규칙).

```bash
[ -f "{SESSION_ROOT}/.claude/user.lock" ] && echo "⏸ user.lock — 종료" && exit 0
mkdir -p "{SESSION_ROOT}/docs/jobs"/{todo,doing,done,blocked,.staging}
# 화해: doing/ 잔류(이전 세션 중단) — 결과에 커밋 해시가 있으면 done, 없으면 todo 복귀(재실행)
for f in "{SESSION_ROOT}"/docs/jobs/doing/*.md; do
  [ -e "$f" ] || continue
  if grep -q "^- 커밋: [0-9a-f]" "$f"; then mv "$f" "{SESSION_ROOT}/docs/jobs/done/$(basename "$f")"
  else mv "$f" "{SESSION_ROOT}/docs/jobs/todo/$(basename "$f")"; fi
done
# 고아 staging 청소 (30분+)
find "{SESSION_ROOT}/docs/jobs/.staging" -type f -mmin +30 -delete 2>/dev/null
ls "{SESSION_ROOT}"/docs/jobs/todo/*.md 2>/dev/null | wc -l
```

0개면 `"✅ 잡 없음"` 출력 후 종료.

### Step 1 — FIFO 선점 + 병합 스캔 (Bash 1~2회)

```bash
f=$(ls "{SESSION_ROOT}"/docs/jobs/todo/*.md 2>/dev/null | sort | head -1)
[ -z "$f" ] && echo "NONE" || { mv "$f" "{SESSION_ROOT}/docs/jobs/doing/$(basename "$f")" && echo "CLAIMED:$(basename "$f")"; }
```

`NONE` → `"✅ 모든 잡 완료"` 후 종료.

**1-M. 병합 스캔** — 남은 todo 가 있으면 frontmatter 만 훑어 (본문 Read 금지):
```bash
for t in "{SESSION_ROOT}"/docs/jobs/todo/*.md; do
  [ -e "$t" ] || continue
  echo "== $(basename "$t")"; awk '/^---$/{c++;next} c==1' "$t"
done
```
선점한 잡(title·files)과 **아래 기준 중 하나**에 해당하는 잡을 병합 대상으로 판단한다 (보수적으로 — 애매하면 병합하지 않는다):
- **중복**: 사실상 같은 요구
- **동일 범위**: 같은 파일/컴포넌트/화면을 고치는 요구
- **연속 수정**: 같은 기능에 대한 이어지는 개선 (뒤 잡이 앞 잡의 결과를 덮어쓰는 관계 포함)

병합 대상은 **최대 4개까지**(선점분 포함 5개) 함께 선점한다:
```bash
mv "{SESSION_ROOT}/docs/jobs/todo/{대상}" "{SESSION_ROOT}/docs/jobs/doing/{대상}"
```
→ `MERGE` 목록에 담아 Step 3 워커에 전달. `🔗 병합: {N}건 — {제목들}` 한 줄 보고.
서로 무관한 잡은 절대 묶지 않는다 (실패 시 동반 blocked 되는 비용이 이득보다 크다).

### Step 2 — 난이도 판정 → 모델 라우팅 (파일 본문 전체를 읽지 않는다 — frontmatter + ## 보충 까지만)

| 판정 | 기준 | 워커 model |
|---|---|---|
| 🟢 easy | 단일 파일·텍스트/스타일/단순 수정·명확한 요구 | `"sonnet"` |
| 🟡 hard | 새 기능·다중 파일 배선·리팩토링·`?` 파일 존재·요구 모호 | `"opus"` |
| 🔴 max | DB 스키마·인증/결제/보안·구조 변경·대규모(파일 8개+ 추정) | `"fable"` |

애매하면 한 단계 위로. 판정 결과를 한 줄 로그로 남긴다: `⚙️ {title} → {easy|hard|max}`.

### Step 3 — 워커 스폰 (백그라운드) → 턴 종료

```
Agent({
  run_in_background: true,
  model: "{Step 2 선택값}",
  prompt: """
당신은 kai-job-run 실행 워커다. 잡 1개를 완수하고 조용히 종료한다. Agent() 를 절대 호출하지 않는다.
사용자 확인 없이 모든 결정을 스스로 내린다.

SESSION_ROOT: {SESSION_ROOT}
JOB_FILE: {SESSION_ROOT}/docs/jobs/doing/{CLAIMED}
MERGE_FILES: {병합 대상 doing/ 경로들 — 없으면 "없음"}
난이도: {easy|hard|max — 병합 시 전체 합산 기준}

## W-0.5 — 병합 (MERGE_FILES 있을 때만)
MERGE_FILES 전부 Read → 요구를 JOB_FILE 기준으로 통합 이해한다:
- 중복 요구는 1회로, 연속 수정은 **최종 상태 기준**으로 (앞 잡을 만들고 뒤 잡이 덮어쓰는 낭비 금지).
- 상충하면 **나중 등록(파일명 뒤쪽)이 우선** — 사용자의 더 최신 의사다.
- 작업 목록·구현·결과는 JOB_FILE(최고참) 하나에서 진행한다.

## W-1 — 분석 + 작업 목록 (추측 금지 · 추적 필수)
1. JOB_FILE 전체 Read. files 후보(`?` 포함)를 Grep/Glob 로 실제 파일로 확정.
2. PROJECT_ROOT = 첫 대상 파일 기준 `git rev-parse --show-toplevel`. `{PROJECT_ROOT}/CLAUDE.md` 있으면 Read(컨벤션).
3. 대상 파일들을 실제로 열어 **전체 경로를 추적**한다 — 데이터를 누가 채우고, 그 호출이 어디서
   실행되는지(초기화/이벤트/라우트 진입) 확인. "호출되겠지" 가정 금지.
4. JOB_FILE 에 `## 작업 목록` 섹션을 Edit 로 추가 — 한 항목 = 한 검증 가능 단위:
   `- [ ] {파일}: {변경 내용} → {확인 방법}`
   배선(생산 호출 트리거)이 필요한 변경은 그 트리거 추가를 **별도 항목**으로 반드시 넣는다.
   마지막에 `- DoD: {관측 가능한 종료 상태 1줄}`.

## W-2 — 교차 검증 (난이도 hard·max 만 · easy 는 건너뜀)
ToolSearch `select:mcp__kai-gen__kai_consult` (없으면 `mcp__kai-gen-remote__kai_consult`).
- context = ① 요청 요약 ② 코드에서 확인한 사실(핵심 발췌 ~60줄) ③ 작업 목록 ④ 불확실 지점. 원문 통째 덤프 금지.
- question = "다른 AI 의 실행 계획이다. 동의하지 말고 먼저 반박하라. 누락된 파일·호출 트리거·실패 경로를 찾아라. 반박 실패 지점만 '검증됨'."
- effort = "medium". 최대 10분 정상 — 백그라운드 전환 시 알림을 기다린다. 실패 시 재시도 1회 → 그래도 실패면 목록에 `- 검증: 미가용, 자체 진행` 한 줄 남기고 진행.
- 유효 지적만 작업 목록에 반영 (오탐 무시 — 최종 판단은 워커).

## W-3 — 구현 (목록 순회)
`- [ ]` 항목을 위에서부터: 구현 → JOB_FILE 에 `- [x]` Edit → 다음. 목록 밖 작업 금지(스코프 크리프).
새 파일을 만들면 frontmatter files 에 append.

## W-4 — 빌드 + 커밋
- 빌드 명령이 있으면(`package.json` scripts.build 등) 1회 실행. 실패 시 자체 수정 최대 3회 → 실패면
  JOB_FILE 에 사유 기록 후 `mv doing→blocked` + 종료.
- dev 서버 시작 금지. `.claude/build.lock` 존재 시 대기 후 진행·종료 시 삭제.
- 커밋: `cd {PROJECT_ROOT}` → `git add {변경 파일만}` (`-A` 금지) → 프로젝트 커밋 컨벤션(CLAUDE.md)
  으로 커밋 → push (실패 3회 → blocked).

## W-5 — 마무리
1. JOB_FILE 에서 `## 작업 목록` 섹션 **전체 삭제** (Edit).
2. `## 결과` 섹션 append:
   ```
   ## 결과
   - {무엇을 바꿨는지 2~4줄}
   - 커밋: {short hash}
   ```
3. MERGE_FILES 가 있으면 각 부속 파일에도 `## 결과` append 후 함께 이동:
   ```
   ## 결과
   - {JOB_FILE 의 id} 에 병합 처리됨
   - 커밋: {short hash}
   ```
4. `mv "{JOB_FILE}" "{SESSION_ROOT}/docs/jobs/done/$(basename {JOB_FILE})"` (부속 파일도 전부 done/) → 확인 후 조용히 종료.
doing/ 에 남긴 채 종료 절대 금지 (성공=done, 실패=blocked — **병합분 전원 동일 상태**, blocked 시 각 파일에 사유 기록).
  """
})
```

스폰 후 `⏳ 실행 중: {title} ({모델})` 한 줄 보고하고 턴 종료 — 완료 알림을 기다린다.

### Step 4 — 완료 확인 → 다음 잡

완료 알림 수신 시 (Bash 1회):
```bash
b="{CLAIMED}"
if [ -e "{SESSION_ROOT}/docs/jobs/done/$b" ]; then echo "DONE"; tail -6 "{SESSION_ROOT}/docs/jobs/done/$b"
elif [ -e "{SESSION_ROOT}/docs/jobs/blocked/$b" ]; then echo "BLOCKED"; tail -4 "{SESSION_ROOT}/docs/jobs/blocked/$b"
else echo "STALE"; for d in "{SESSION_ROOT}"/docs/jobs/doing/*.md; do [ -e "$d" ] && mv "$d" "{SESSION_ROOT}/docs/jobs/todo/$(basename "$d")"; done; fi
```
(STALE = 워커가 결과 없이 죽음 — 병합 부속 포함 doing 잔류 전부를 todo 복귀시켜 재실행)
`✅/⚠️ {title}` 한 줄 보고 (STALE 은 todo 복귀 보고) → **Step 1 로 돌아가 다음 잡** (user.lock 재확인). todo 가 비면 종료.

---

## Red Lines (절대 금지)

- ❌ 워커가 `Agent()` 호출 (체인 금지) / 메인이 구현·분석을 직접 수행 (컨텍스트 오염)
- ❌ 병렬 스폰 — 워커는 언제나 동시 1개 (순서 보존이 존재 이유. 병합은 워커 1개가 여러 잡 파일을 처리하는 것 — 병렬이 아니다)
- ❌ 무관한 잡 병합·5개 초과 병합 — 중복/동일 범위/연속 수정만, 애매하면 각자 처리
- ❌ 작업 목록 없이 구현 착수 / 목록 밖 스코프 확장
- ❌ easy 잡에 kai_consult·opus/fable 낭비 — 라우팅 표를 따른다 (애매하면 위로)
- ❌ `git add -A` · heredoc 커밋 · dev 서버 시작 · `git worktree add`/`cp`/`rsync`
- ❌ doing/ 잔류 종료 — 성공=done, 실패=blocked, 그 외 없음
- ❌ 작업 목록을 done 파일에 남김 — 삭제 후 `## 결과` 요약만 (컨텍스트·저장 절약)
- ❌ 다른 스킬·에이전트 정의 파일 의존 — 이 쌍은 자체 완결 (kai-gen MCP 는 있으면 쓰는 선택 도구)
