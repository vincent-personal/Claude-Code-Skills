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

```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/todo" \
         "{SESSION_ROOT}/docs/tasks/doing" \
         "{SESSION_ROOT}/docs/tasks/done" \
         "{SESSION_ROOT}/docs/tasks/blocked" \
         "{SESSION_ROOT}/docs/tasks/.staging"
```

---

### Step 0-M — 레거시 자동 마이그레이션 (1회 · add/run 공통)

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
| 독립 기능 혼재 | "그리고/또한/추가로" 로 연결된 **서로 독립적인 기능** 2개 이상 |
| 레이어 혼재 | 백엔드 API + 프론트 UI + DB 스키마 등 **서로 다른 레이어** 동시 |
| 영향 파일 과다 | 영향 파일 **8개 이상**으로 추정 + 논리적으로 안 묶이는 파일 포함 |
| 단계 의존성 명확 | "A 완료 후 B" 라는 **순차 의존** 구조 |

**분할 원칙:** 각 하위 작업은 독립적으로 완료·빌드 가능. 분할 수는 최소화(자연스러운 경계에서만).
순차 의존이 있으면 후행 작업 frontmatter의 `predecessors:` 에 **선행 작업의 id**를 기재한다.
(task-run은 predecessors가 모두 done/ 에 있어야 후행을 착수한다.)

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
> (작성 중 파일이 run에 의해 malformed claim되는 윈도우를 제거)

```bash
TITLE="{한 줄 요약 제목}"
slug=$(printf '%s' "$TITLE" | tr '/[:space:]' '-' | tr -cd '[:alnum:]가-힣._-' | cut -c1-60)
slug=${slug#.}                                              # 선행 '.' 제거, 빈 slug면 'task'
[ -z "$slug" ] && slug=task
# ID = 정렬가능 시각 + 나노초(GNU date) + 랜덤. ★ macOS BSD date는 %N 미지원 → 감지 후 fallback
NS=$(date +%N 2>/dev/null); case "$NS" in ''|*[!0-9]*) NS=000000000;; esac
ID="$(date +%Y%m%d-%H%M%S)-${NS}-$$-$(printf '%04x' $RANDOM)"   # $$(pid)로 동시 add 유일성 보장
STAGE="{SESSION_ROOT}/docs/tasks/.staging/${ID}--${slug}.md"
```

> ★ `%N` 미지원 환경에선 나노초가 `000000000` 으로 고정되어 동일초 FIFO 해상도가 떨어지지만,
> `$$`(프로세스 pid) + `$RANDOM` 이 **서로 다른 세션 간 유일성**을 보장한다(동시 add 충돌 불가).

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
mv "$STAGE" "{SESSION_ROOT}/docs/tasks/todo/${ID}--${slug}.md"
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
- ❌ task 파일을 `done/` 등 todo/ 외 디렉터리에 생성
- ❌ **빈 파일 선생성**(noclobber 등) — 반드시 staging 완성본 → 원자적 mv
- ❌ **병합 시 Write로 todo 파일 재생성** — Edit-only, 실패 시 신규파일 fallback
- ❌ **영향 파일(impact_files) 없이 생성** (충돌 검사 무력화)
- ❌ frontmatter에 `status` 필드 추가 (디렉터리가 권위 — drift 유발)
- ❌ 세부 내용 없이 제목만 생성
- ❌ `git worktree add` / `cp` / `rsync`

---

## ⚡ 역할 경계 (최우선 원칙)

> **이 스킬의 유일한 출력은 `docs/tasks/todo/` 의 task 파일 생성(또는 기존 파일 병합)뿐이다.**

- `/kai-task-add` → 파일 생성 후 **즉시 종료** (구현 금지)
- 사용자가 구현을 요청해도 → 파일 추가 + "구현하려면 `/kai-task-run`을 실행하세요" 안내 후 종료
