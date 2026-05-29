---
name: kai-task-list
description: |
  현재 세션의 docs/tasks/ 디렉터리를 스캔하여 미완료 작업(todo·doing·blocked)을 요약 출력하는 전역 스킬.
  트리거: /kai-task-list
allowed-tools:
  - Read
  - Bash
---

# kai-task-list — 미완료 작업 목록 조회 스킬 (파일-per-task)

## 역할

`docs/tasks/` 디렉터리를 스캔하여 **미완료 작업**만 추려 사용자에게 보고한다.
파일 수정 없이 **읽기 전용**으로만 동작한다.

> 💡 **컨텍스트 절감**: 작업 본문을 통째로 읽지 않는다. 각 파일의 frontmatter만 추출한다.
> 표준 추출: `awk '/^---$/{c++; next} c==1' <file>`

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
디렉터리가 없으면 "아직 작업이 없습니다. `/kai-task-add` 로 첫 작업을 추가하세요." 보고 후 종료.

> **검증**: 경로에 하위 프로젝트 폴더명이 포함되면 잘못된 경로 — 상위로.

---

### Step 1 — 디렉터리 스캔 (frontmatter만)

각 상태 디렉터리를 **파일명 정렬순(= 생성순 = FIFO)** 으로 스캔하여 frontmatter만 추출한다:

```bash
for d in todo doing blocked; do
  for f in $(ls "{SESSION_ROOT}/docs/tasks/$d/" 2>/dev/null | sort); do
    awk '/^---$/{c++; next} c==1' "{SESSION_ROOT}/docs/tasks/$d/$f"   # title/impact_files/claimed_at 등
  done
done
done_cnt=$(ls "{SESSION_ROOT}"/docs/tasks/done/*.md 2>/dev/null | wc -l)
```

추출 필드: `title`, `impact_files`, (doing의 경우) `claimed_at`. 본문은 읽지 않는다.

| 디렉터리 | 의미 |
|---|---|
| `todo/` | 미시작 |
| `doing/` | 진행중 (선점됨) |
| `blocked/` | 확인필요·막힘 |
| `done/` | 완료 → **목록에서 제외**(개수만 보고) |

---

### Step 2 — 요약 보고 (FIFO 순)

아래 형식으로 출력한다. 항목이 없는 상태 그룹은 섹션을 생략한다.
실행 순서를 알 수 있도록 **todo는 생성순(가장 먼저 만든 것이 맨 위 = 다음 실행 대상)** 으로 나열한다.

```
📋 미완료 작업 목록 — {SESSION_ROOT 기준 프로젝트명}

🔵 미시작 todo (N개)  ※ 위에서부터 실행됨(FIFO)
  1. {title}  [파일: foo.ts, bar.scss]   (id: a3f)
  2. {title}  [파일: baz.ts]             (id: b7d)

🟡 진행중 doing (N개)
  • {title}  [파일: qux.ts]  (선점: YYYY-MM-DD HH:MM)

⚠️  확인필요 blocked (N개)
  • {title}  [파일: abc.ts]

✅ 완료 done: N개 (상세는 docs/tasks/done/ 또는 /kai-task-clear 참고)
```

모든 미완료가 비어있으면:
```
✅ 미완료 작업이 없습니다. 모든 작업이 완료되었거나 아직 등록된 작업이 없습니다.
```

---

## Red Lines (절대 금지)

- ❌ 파일 수정·생성·삭제·이동(mv) 행위 (읽기 전용 스킬)
- ❌ 작업 파일 본문을 통째로 Read (frontmatter만 awk 추출 — 컨텍스트 절감)
- ❌ 완료(done/) 작업을 미완료 목록에 포함시켜 혼동 유발
