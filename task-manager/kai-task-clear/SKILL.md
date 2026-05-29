---
name: kai-task-clear
description: |
  현재 세션의 docs/tasks/done/ 의 완료 작업 파일을 done/archive/ 로 옮겨 정리하는 전역 스킬.
  트리거: /kai-task-clear
allowed-tools:
  - Read
  - Bash
---

# kai-task-clear — 완료 작업 정리 스킬 (파일-per-task)

## 역할

`docs/tasks/done/` 직하의 완료 작업 파일을 `docs/tasks/done/archive/` 로 이동하여 정리한다.

> 🧱 파일-per-task 모델에서는 완료 작업이 이미 `done/` 에 격리되어 있어 **컨텍스트를 더는 점유하지 않는다.**
> 따라서 이 스킬은 "정리(보관)" 위생 작업이며, 사용자가 수동 호출하는 것을 전제로 한다.
> per-file `mv` 이동이라 다중 실행 시에도 항목 중복/꼬임 위험이 구조적으로 없다.

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

작업 디렉터리: `{SESSION_ROOT}/docs/tasks/`
`done/` 이 없거나 비어있으면 "정리할 완료 작업이 없습니다." 보고 후 종료.

> **검증**: 경로에 하위 프로젝트 폴더명이 포함되면 잘못된 경로 — 상위로.

---

### Step 1 — 완료 작업 이동 (done/ → done/archive/)

```bash
mkdir -p "{SESSION_ROOT}/docs/tasks/done/archive"
moved=0
for f in "{SESSION_ROOT}"/docs/tasks/done/*.md; do
  [ -e "$f" ] || continue                                  # 파일 없으면 skip
  mv "$f" "{SESSION_ROOT}/docs/tasks/done/archive/$(basename "$f")" && moved=$((moved+1))
done
echo "이동: $moved 건"
```

> 옵션: 사용자가 "최근 N개는 남겨줘" 라고 하면, 파일명 정렬 역순 상위 N개를 제외하고 이동한다.

**절대 건드리지 않을 것:**
- `todo/`, `doing/`, `blocked/` 의 모든 파일
- `done/archive/` 안의 기존 파일

---

### Step 2 — 완료 보고

이동한 작업 수와 id(또는 제목) 목록을 사용자에게 보고한다.
예시: "✅ 완료 작업 3건을 done/archive/ 로 정리하였습니다. (a3f, b7d, c1e)"

---

## Red Lines (절대 금지)

- ❌ `todo/`·`doing/`·`blocked/` 의 파일 이동·삭제
- ❌ 작업 파일 내용 수정 (이동만 수행)
- ❌ `done/archive/` 의 기존 파일 덮어쓰기·삭제
- ❌ `git worktree add` / `cp` / `rsync`
