---
name: kai-task-run
description: |
  현재 세션의 docs/tasks/todo/ 에서 가장 먼저 만든 작업 하나를 원자적으로 선점(mv)하여 완수하는 전역 스킬.
  트리거: /kai-task-run
  다중 에이전트 환경에서 mv 원자 claim + 영향 파일 충돌 검사로 안전성 확보.
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
3. id 접두를 `00000000-000000-{4자리순번}` 로 부여(FIFO에서 신규보다 먼저), kai-task-add Step 4 포맷으로 변환
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

### Step 1 — 후보 선정 (FIFO · frontmatter만 읽기)

> 💡 **컨텍스트 절감**: 본문을 통째로 읽지 않는다. frontmatter만 추출:
> `awk '/^---$/{c++; next} c==1' <file>`

```bash
# 선행조건 만족 집합 = done/ 에 존재하는 id 목록
done_ids=$(ls "{SESSION_ROOT}"/docs/tasks/done/ 2>/dev/null | sed 's/--.*//')
# 작업중(doing/) impact_files 합집합 = locked_files
#   각 doing/*.md 의 frontmatter에서 impact_files 추출하여 합친다
```

`todo/` 를 **파일명 정렬순(= 생성순 = FIFO)** 으로 순회한다:
```bash
for f in $(ls "{SESSION_ROOT}"/docs/tasks/todo/ 2>/dev/null | sort); do ... done
```
todo/ 가 비어있으면 → "실행할 작업이 없습니다." 보고 후 종료.

---

### Step 2 — 후보 검사 → 원자적 선점 (mv claim)

각 후보 `f` 에 대해 순서대로:

1. **선행조건 검사** — frontmatter `predecessors` 의 모든 id가 `done_ids` 에 있어야 한다. 하나라도 없으면 **skip(다음 후보)**.
   인라인 `[]`·멀티라인 배열 모두 처리하는 추출:
   ```bash
   preds=$(awk '
     /^---$/{c++; next}
     c==1 && /^predecessors:[[:space:]]*\[/ {next}              # 인라인 [] → 선행조건 없음
     c==1 && /^predecessors:[[:space:]]*$/ {inp=1; next}        # 멀티라인 시작
     c==1 && inp && /^[[:space:]]*-[[:space:]]/ {gsub(/^[[:space:]]*-[[:space:]]*/,""); print; next}
     c==1 && inp && /^[^[:space:]-]/ {inp=0}
   ' "{SESSION_ROOT}/docs/tasks/todo/$f")
   # preds 의 각 id가 done_ids 에 모두 포함되는지 확인 — 하나라도 빠지면 continue
   ```
2. **영향 파일 기재 검사** — `impact_files` 가 비어있으면 skip하고 `blocked/` 로 이동 + 사유 "영향 파일 미기재" 기록(task-add 보강 필요).
3. **원자적 선점** — `mv` 시도. 성공하면 내가 획득, 실패(다른 세션이 가져감)하면 다음 후보:
   ```bash
   if mv "{SESSION_ROOT}/docs/tasks/todo/$f" "{SESSION_ROOT}/docs/tasks/doing/$f" 2>/dev/null; then
     CLAIMED="$f"
   else
     continue   # 경쟁에서 짐 → 다음 후보
   fi
   ```
4. **선점 후 충돌 재검사** — 방금 claim한 파일의 `impact_files` ∩ (다른 doing/ 파일들의 impact_files) ≠ ∅ 이면 충돌:
   - **tie-break: id가 더 작은(먼저 만든) 쪽이 우선권**. 내 id가 더 크면 양보 → `mv doing→todo` 롤백 후 다음 후보.
   - 내 id가 더 작으면 유지하고 진행.

모든 후보가 선행조건 미충족/충돌/경쟁패배면 → "현재 착수 가능한 작업이 없습니다." 보고 후 종료.

선점 성공 시 frontmatter에 기록(Edit):
```yaml
claimed_at: {YYYY-MM-DD HH:MM}
claimed_by: {세션 식별자 (예: date+pid)}
```

---

### Step 3 — 작업 분류 (Tier 판단)

선점한 작업의 frontmatter `tier` 를 신뢰하되, 본문을 보고 재판단. **애매하면 한 단계 위로.**

- 🟢 **Tier 1** (advisor 생략): typo·포맷·주석·import·1~5줄 미세 수정·리네이밍·`[skip-advisor]` → Step 4로
- 🟡 **Tier 2** (생략 가능): 같은 파일 추가 수정·7일 내 유사 자문 존재·동일 패턴 반복 → 관련 파일/패턴 Read 후 Step 4로
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

frontmatter `screen_work: true` 이거나 impact_files 확장자(`.html`·`.scss`·`.css`·`.component.ts`)·설명에 UI 키워드("화면/UI/컴포넌트/뷰/스타일/레이아웃/페이지/모달/드로어/폼/버튼/카드/테이블") 포함 시 — **Step 5 전에 반드시:**

1. **브라우저 확인(구현 전)**: Playwright MCP(`mcp__plugin_ecc_playwright__`) 또는 `/browse` 로 현재 화면 스크린샷
2. **레퍼런스 조회**: `ecc:docs-lookup` 또는 Context7 MCP로 UI 프레임워크 최신 API 확인
3. **구현 후 브라우저 검증**: 코드 작성(Step 5) 후 Playwright MCP로 실제 화면 재확인
4. **디자인 검토**: `design-review` 또는 `ecc:frontend-design` 로 일관성 검토

---

### Step 3-C — 프로젝트 컨벤션 파일 확인 (필수 — 코드 작성 전)

**코드를 한 줄이라도 작성하기 전에 반드시 컨벤션 파일을 읽는다.**
impact_files 경로에서 앱을 탐지(예 `verida-ops/...` → verida-ops)한 뒤:
1. `{SESSION_ROOT}/CLAUDE.md` (`★ 공통 프론트엔드 컨벤션` 필독)
2. `{SESSION_ROOT}/{앱}/CLAUDE.md`
3. `{SESSION_ROOT}/{앱}/docs/FRONTEND-CONVENTIONS.md` (있으면 반드시)

**확인 항목:** 컴포넌트 네이밍(`view-{domain}`/`drawer-{action}`/`dialog-{purpose}`), 4-파일 세트(`.ts`+`.html`+`.scss`+`.store.ts`), 클래스명(`View{X}Component`), Store 패턴(`signalStore()`+`withDevtools()`), Store 배치, Red Lines(hex 하드코딩·`@Injectable+plain signal`·`.scss` 생략 금지). 없으면 건너뛴다.

---

### Step 4 — 코드 작성 (Sonnet 구현)

advisor 자문(Tier 3) 또는 자체 분석(Tier 1/2)을 바탕으로 코드 작성. **Step 3-C 컨벤션을 그대로 적용.**

**파일 수정 전 반드시:**
```bash
# 1) 워크트리 검증 — 수정 대상이 PROJECT_ROOT 아래인지
realpath {수정할 파일} 2>/dev/null || (cd "$(dirname {파일})" && pwd -P)
#    결과가 PROJECT_ROOT 하위가 아니면 즉시 중단
# 2) 영향 파일 등록 — 새로 수정하는 파일이 task 파일 impact_files에 없으면 먼저 append(Edit)
```
막히면: 80% 이상 가능하면 자체 판단으로 계속. 완전히 불가능할 때만 `mv doing→blocked` + 본문에 사유 기록 후 종료.

---

### Step 5 — 빌드/검증 (build lock)

```bash
BUILD_LOCK="{PROJECT_ROOT}/.claude/build.lock"
WAITED=0
while [ -f "$BUILD_LOCK" ] && [ $WAITED -lt 300 ]; do sleep 5; WAITED=$((WAITED+5)); done
touch "$BUILD_LOCK"
cd {PROJECT_ROOT} && npm run build 2>&1
BUILD_RESULT=$?
rm -f "$BUILD_LOCK"        # trap 미사용 — Claude Code 확인 팝업 방지
exit $BUILD_RESULT
```
빌드 실패 시 자체 수정 최대 3회. 3회 실패 시 `mv doing→blocked` + 사유 기록. **빌드는 반드시 PROJECT_ROOT에서.**

---

### Step 6 — Git 커밋 (필수 — 작업 하나 완료 = 커밋 하나)

> ⚠️ **선택이 아니다.** 빌드 통과한 작업은 반드시 커밋. **작업 하나가 끝나면 즉시 커밋**(묶음 금지). push는 사용자 명시 요청 시에만.

#### 6-A — appVersion 증가 (앱 CLAUDE.md 규칙)

`src/environments/environment.ts`(+`.prod.ts`)가 있으면 bump. 없으면 생략.

**① bump 레벨 (우선순위):**
1. task 본문에 명시("MINOR/MAJOR/PATCH bump") → 그대로
2. 명시 없으면 앱 CLAUDE.md `## ★ 버전 관리 규칙` 참조 후 자체 판단
   - **MINOR**: 신규 페이지·기능·주요 UI 추가 / **MAJOR**: 아키텍처 변경·대규모 리팩토링 / **PATCH**: 버그픽스·CSS·문구·소규모
   - 경계 애매 → **PATCH**(보수적)

**② 계산:** `PATCH: Z+1 (Z≥99→Y+1.0)` / `MINOR: Y+1.0 (Y≥99→X+1.0.0)` / `MAJOR: X+1.0.0`

**③ 적용 (BUMP_LEVEL):**
```bash
VERSION_FILE="{PROJECT_ROOT}/src/environments/environment.ts"
PROD_FILE="{PROJECT_ROOT}/src/environments/environment.prod.ts"
[ -f "$VERSION_FILE" ] || echo "버전 파일 없음 — skip"
CURRENT=$(grep "appVersion" "$VERSION_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
case "$BUMP_LEVEL" in
  MAJOR) MAJ=$((MAJ+1)); MIN=0; PAT=0 ;;
  MINOR) MIN=$((MIN+1)); PAT=0; [ "$MIN" -ge 99 ] && { MAJ=$((MAJ+1)); MIN=0; } ;;
  *)     PAT=$((PAT+1)); [ "$PAT" -ge 99 ] && { MIN=$((MIN+1)); PAT=0; }; [ "$MIN" -ge 99 ] && { MAJ=$((MAJ+1)); MIN=0; } ;;
esac
NEW_VERSION="$MAJ.$MIN.$PAT"
sed -i '' "s/appVersion: '${CURRENT}'/appVersion: '${NEW_VERSION}'/" "$VERSION_FILE"
[ -f "$PROD_FILE" ] && sed -i '' "s/appVersion: '${CURRENT}'/appVersion: '${NEW_VERSION}'/" "$PROD_FILE"
git add "$VERSION_FILE" "$PROD_FILE" 2>/dev/null
echo "버전 ${CURRENT} → ${NEW_VERSION} (${BUMP_LEVEL})"
```

#### 6-B — 커밋

```bash
cd {PROJECT_ROOT}
git pull --rebase
git add {Step 4에서 수정·생성한 파일들만}      # 영향 파일 기준, git add -A 금지
git commit -m "$(cat <<'EOF'
feat(ops {id접미}): {제목 한 줄 요약}

{변경 내용 2~4줄 bullet 요약}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
- 메시지 형식: `feat(ops {id 짧은 접미, 예 a3f}): 제목` — 순차 #N 대신 task id 접미로 traceability 유지
- `git add -A`/`git add .` 금지 — 영향 파일만 stage(버전 파일 포함)

#### 6-C — ★ 커밋 해시 마커 기록 (mv 이전 · 필수)

커밋 **성공 직후, Step 7의 mv 이전에** task 파일 frontmatter에 커밋 해시를 기록한다(Edit).
이 마커가 있어야, 혹시 mv가 누락돼도 Step 0-B 화해가 **재실행 없이** done/ 으로 보낼 수 있다.
```bash
HASH=$(cd {PROJECT_ROOT} && git rev-parse --short HEAD)
# task 파일 frontmatter에 추가:  committed: {HASH}
```

#### 6-D — 커밋 실패 처리 (분기 명확화)

> ⚠️ 어느 경우든 **doing/ 에 작업을 남긴 채 종료하지 않는다.**

- `git pull --rebase` 또는 commit 실패 → 최대 3회 재시도
- **3회 모두 실패** → `committed:` 마커를 쓰지 **않고** `mv doing→blocked` + 본문에 사유 기록 후 종료 (done 금지)
- **커밋 성공** → 6-C로 마커 기록 → Step 7(done 이동)
- 즉, **커밋 성공이면 done, 실패면 blocked.** "doing 잔류"는 어느 분기에도 없다.

---

### Step 7 — 완료 처리 (mv doing→done) ★ 완료를 정의하는 행위

> 🔒 **이 mv가 곧 "완료"의 정의다.** 파일이 `done/` 에 들어가기 전에는 **절대 "완료" 보고를 하지 않는다.**
> 산문으로 "작업을 마쳤습니다" 라고 말하기 전에 반드시 아래 mv를 먼저 실행한다.
> (완료 mv 누락이 가장 흔한 사고다 — 이 단계를 건너뛰면 run은 끝난 것이 아니다.)

```bash
# 1) 본문 끝에 완료 기록 append(Edit):  ## 완료 기록\n✅ 완료: {요약} ({YYYY-MM-DD HH:MM})
# 2) done/ 으로 이동 (완료 정의 행위)
mv "{SESSION_ROOT}/docs/tasks/doing/$CLAIMED" "{SESSION_ROOT}/docs/tasks/done/$CLAIMED"
```
`claimed_at`/`claimed_by`/`committed:` 는 그대로 두어 완료 이력으로 보존한다.

#### Step 7-V — 완료 검증 (필수 · 선점-검증과 대칭)

mv 직후, **`doing/` 에 본 작업 파일이 남아있지 않은지** 반드시 확인한다:
```bash
if [ -e "{SESSION_ROOT}/docs/tasks/doing/$CLAIMED" ]; then
  # 아직 남아있음 → mv 재시도. 그래도 실패하면 사유와 함께 BLOCKED 보고
  mv "{SESSION_ROOT}/docs/tasks/doing/$CLAIMED" "{SESSION_ROOT}/docs/tasks/done/$CLAIMED"
fi
# done/ 에 존재 확인되어야 비로소 "완료"
ls "{SESSION_ROOT}/docs/tasks/done/$CLAIMED" >/dev/null 2>&1 && echo "✅ done 확인" || echo "🚨 완료 이동 실패"
```
`done/` 에 존재가 확인되어야만 Step 8(보고)로 진행한다.

---

### Step 7-Z — 완료 디렉터리 정리 (아카이브 일원화 · run에서만)

> 자동 아카이브는 **task-run에서만** 수행한다(task-add에서 제거됨 — `[x]`를 생산하는 주체가 run이므로).
> 단, 본문을 읽지 않으므로 컨텍스트 부담은 사실상 없다 — 정리는 선택적 위생 작업이다.

`done/` 파일 수가 **30개 초과**면 가장 오래된(파일명 정렬 앞) 것부터 `done/archive/` 로 이동하여 **최근 30개만** done/ 직하에 남긴다.
```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/done/archive"
cnt=$(ls "{SESSION_ROOT}"/docs/tasks/done/*.md 2>/dev/null | wc -l)
# cnt>30 이면 오래된 (cnt-30)개를 done/archive/ 로 mv
```

---

### Step 8 — 완료 보고

완수한 작업 id·제목·수정 파일 목록을 사용자에게 보고한다.

---

## Red Lines (절대 금지)

- ❌ `git worktree add` / `cp`·`rsync` 워크트리 동기화
- ❌ `PROJECT_ROOT` 외부 경로 파일 수정
- ❌ `doing/` 에 이미 있는(=다른 세션 작업 중) 파일 착수
- ❌ **mv claim 없이 작업 시작** — 반드시 todo→doing 원자 선점 성공 후 착수
- ❌ **영향 파일(impact_files) 충돌 검사 생략** — 다중 에이전트 환경에서 치명적
- ❌ 영향 파일 미기재 작업 임의 처리 (blocked/ 이동 후 보강)
- ❌ mv claim 실패를 오류로 보고 종료 (다음 후보로 진행해야 함)
- ❌ 워크트리에서만 빌드 통과 확인 후 완료 처리
- ❌ 작업 실패 시 done/ 으로 이동 (실패는 blocked/)
- ❌ **`doing/` 에 작업을 남긴 채 run 종료** — 반드시 done/(커밋 성공) 또는 blocked/(3회 실패)로 이동. 잔류 = 사고
- ❌ **`done/` 이동(Step 7) 전에 "완료" 보고** — mv가 완료의 정의. 검증(Step 7-V)까지 통과해야 보고
- ❌ 커밋 성공 후 `committed:` 마커 기록 생략 (Step 6-C) — 마커 없으면 완료-고아 화해 불가
- ❌ **`committed:` 마커가 있는 doing/ 고아를 재실행** — Step 0-B에서 곧장 done/ 으로 화해할 것 (중복 커밋 방지)
- ❌ 한 번에 두 개 이상 작업 동시 착수
- ❌ Tier 3 작업을 advisor 없이 착수 (`advisor: done` 이면 생략 정상)
- ❌ `.claude/user.lock` 존재 시 무시하고 진행
- ❌ 빌드 lock 무시하고 동시 빌드
- ❌ Step 4에서 수정하지 않은 파일까지 `git add` / `git add -A`·`git add .`
- ❌ 빌드 통과 후 커밋 생략 — Step 6은 매 작업 필수
- ❌ 여러 작업 묶음 커밋 — 작업 하나당 커밋 하나
- ❌ 버전 파일이 있는데 PATCH 증가 생략
