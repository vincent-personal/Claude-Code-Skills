---
name: kai-task-unblock
description: |
  blocked/ 의 작업을 분석하여 해결 방법을 안내하고,
  자동 해결 가능한 경우 todo/ 로 즉시 복귀시킨다.
  해결 불가한 경우 정확한 원인과 조치 방법을 설명한다.
  트리거: /kai-task-unblock
allowed-tools:
  - Read
  - Edit
  - Bash
  - Grep
---

# kai-task-unblock — blocked 작업 진단 + 복귀

## 역할

`docs/tasks/blocked/` 의 각 작업을 읽고:
1. **자동 복귀 가능** → 즉시 수정 + `mv blocked→todo`
2. **수동 처리 필요** → 원인과 해결 방법을 정확히 설명

---

## ⚡ 실행 절차

### Step 0 — SESSION_ROOT 탐지

Primary working directory 값 사용.
없으면 상위로 올라가며 가장 상위의 `CLAUDE.md` 있는 디렉터리.

```bash
mkdir -p "{SESSION_ROOT}/docs/tasks"/{todo,doing,done,blocked,.staging}
```

---

### Step 1 — blocked 목록 수집

```bash
ls "{SESSION_ROOT}/docs/tasks/blocked/"*.md 2>/dev/null
```

없으면 → "blocked/ 가 비어있습니다." 출력 후 종료.

---

### Step 2 — 각 작업 진단

각 blocked 파일에 대해 **frontmatter + 본문 전체 Read** 후 아래 기준으로 분류:

#### 🟢 자동 복귀 가능 (즉시 mv → todo)

| 원인 패턴 | 판단 기준 |
|---|---|
| `impact_files` 없음 | frontmatter에 impact_files 키가 없거나 비어있음 |
| 완료된 doing 고아 | `committed:` 해시 있음 → done/ 이동 (todo 아님) |
| committed 없는 stale | doing에서 넘어온 좀비 (blocked 사유 불명) |

#### 🔴 수동 처리 필요

| 원인 패턴 | 안내 내용 |
|---|---|
| `BLOCKED: 빌드실패` | 빌드 오류 메시지 + 수정해야 할 파일·줄 안내 |
| `BLOCKED: 커밋실패` | git 상태 확인 방법 + 권한 문제면 settings.json 패치 안내 |
| `BLOCKED: 시점불일치` | task 설명과 실제 파일 현재 상태 비교 후 task 수정 방법 안내 |
| `BLOCKED: 완전불가` | 워커가 판단 불가였던 이유 + 사람 판단 필요 항목 명시 |
| 기타/불명 | 파일 내용 전체를 보여주고 사용자 판단 요청 |

---

### Step 3 — 자동 복귀 처리

**Step 2에서 🟢 판정된 작업:**

`impact_files` 없는 경우 → task 본문에서 영향 파일 추출 후 frontmatter에 추가(Edit):
```yaml
impact_files:
  - /절대/경로/파일1.ts
  - /절대/경로/파일2.html
```

`committed:` 있는 고아 → `done/` 으로 이동:
```bash
mv "{SESSION_ROOT}/docs/tasks/blocked/{f}" "{SESSION_ROOT}/docs/tasks/done/{f}"
```

나머지 자동 복귀 대상 → `todo/` 로 이동:
```bash
mv "{SESSION_ROOT}/docs/tasks/blocked/{f}" "{SESSION_ROOT}/docs/tasks/todo/{f}"
```

---

### Step 4 — 결과 보고

아래 형식으로 출력:

```
📋 blocked/ 진단 결과 ({N}건)

✅ 자동 복귀 완료:
  - [{id접미}] {제목} → todo/ (사유: impact_files 추가)
  - [{id접미}] {제목} → done/ (사유: committed: 마커 발견)

🔧 수동 처리 필요:
  ─────────────────────────────────
  [{id접미}] {제목}
  원인: BLOCKED: 빌드실패
  
  해결 방법:
  1. {구체적 파일명}:{줄번호} 에서 {오류 내용} 수정
  2. 수정 후 아래 명령으로 todo 복귀:
     mv "{경로}/blocked/{파일명}" "{경로}/todo/{파일명}"
  3. /kai-task-run 으로 재실행
  ─────────────────────────────────
  [{id접미}] {제목}
  원인: {사유}
  ...
```

---

## Red Lines

- ❌ blocked 파일 삭제 금지 (항상 이동만)
- ❌ `committed:` 있는 작업을 todo로 이동 금지 (done으로만)
- ❌ 수동 처리 필요 작업을 사용자 확인 없이 todo로 이동 금지
- ❌ doing/ 파일 수정 금지 (blocked/ 만 대상)
