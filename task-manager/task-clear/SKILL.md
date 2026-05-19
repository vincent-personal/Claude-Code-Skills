---
name: task-clear
description: |
  현재 프로젝트의 docs/check-list.md에서 완료된 항목을 docs/check-list-done.md로 이동하는 전역 스킬.
  트리거: /task-clear
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
---

# task-clear — 완료 항목 아카이브 스킬

## 역할

`docs/check-list.md`의 완료(`- [x]`) 항목을 `docs/check-list-done.md`로 이동하여
체크리스트를 정리한다.

> ⚠️ **이 스킬은 단일 에이전트로만 실행할 것.** 다중 동시 실행 시 done 파일에 중복 발생 가능.
> task-run 루프와는 별개로, 사용자가 수동으로 호출하는 것을 전제로 한다.

---

## ⚡ 실행 절차

### Step 0 — 프로젝트 루트 탐지

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

- 소스: `{PROJECT_ROOT}/docs/check-list.md`
- 대상: `{PROJECT_ROOT}/docs/check-list-done.md`

소스 파일이 없으면 "체크리스트가 없습니다." 보고 후 종료.

---

### Step 0-A — clear lock 확인

```bash
CLEAR_LOCK="{PROJECT_ROOT}/.claude/clear.lock"
if [ -f "$CLEAR_LOCK" ]; then
  echo "BLOCKED: 다른 task-clear 진행 중"
  exit 0
fi
touch "$CLEAR_LOCK"
trap "rm -f $CLEAR_LOCK" EXIT
```

다른 task-clear 인스턴스가 진행 중이면 종료.

---

### Step 1 — 체크리스트 읽기

`check-list.md` 전체를 Read한다.

- `- [x]` 항목이 없으면 → "이동할 완료 항목이 없습니다." 보고 후 종료
- `- [~]`(작업중) 항목이 있으면 → 경고 표시. `[x]` 항목은 정상 이동.

---

### Step 2 — 완료 항목 추출

`- [x]` 로 시작하는 항목과 해당 항목의 **들여쓰기 세부 항목 전체**(영향 파일, 완료 기록 포함)를 추출.

추출 형식 예시:
```markdown
- [x] **#3** — 제목.
  - **영향 파일**: src/foo.ts
  - 세부 항목 1
  - ✅ 완료: 완료 내용 (2026-05-19 14:30)
```

---

### Step 3 — check-list-done.md에 추가

`check-list-done.md` 파일이 없으면 아래 헤더로 새로 생성:

```markdown
# 완료된 작업 목록

---

```

파일 맨 아래에 다음 형식으로 append:

```markdown
## {YYYY-MM-DD} 아카이브 ({HH:MM})

- [x] **#N** — ...
  - **영향 파일**: ...
  - ...

---
```

같은 날짜 블록이 이미 있으면 그 안에 추가한다.

---

### Step 4 — check-list.md에서 제거

추출한 `- [x]` 항목들과 해당 세부 항목을 `check-list.md`에서 삭제.

**절대 삭제 금지:**
- `- [ ]` (미시작) 항목
- `- [~]` (작업중) 항목
- `- [!]` (확인 필요) 항목
- 파일 상단의 규칙/원칙/헤더 섹션

---

### Step 5 — 완료 보고

이동된 항목 수와 번호 목록을 사용자에게 보고.

예시: "✅ #2, #3, #5 항목 3개를 check-list-done.md로 이동하였습니다."

---

## Red Lines (절대 금지)

- ❌ `- [ ]`, `- [~]`, `- [!]` 항목 삭제
- ❌ 사용자 확인 없이 `[x]`가 아닌 항목 이동
- ❌ check-list.md의 규칙/헤더 섹션 삭제
- ❌ clear lock 없이 강제 실행
