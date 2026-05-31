---
name: kai-task-unblock
description: |
  blocked/ 의 작업을 분석하여 자동 복귀 또는 advisor 자문으로 재설정한다.
  단순 문제 → 즉시 todo/ 복귀.
  복잡한 문제(시점불일치·완전불가·빌드실패) → advisor 호출 후 구현 방안 재설정 → todo/ 복귀.
  커밋실패 등 인프라 문제 → 해결 방법 안내.
  트리거: /kai-task-unblock
allowed-tools:
  - Read
  - Edit
  - Bash
  - Grep
  - Agent
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

### Step 3 — 🟢 자동 복귀 처리

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

### Step 3-A — 🔴 복잡한 작업 advisor 자문 + 재설정

**Step 2에서 🔴 판정된 작업 중 아래에 해당하면 advisor 호출:**

| 사유 | advisor 호출 여부 |
|---|---|
| `BLOCKED: 시점불일치` | ✅ 호출 — 현재 파일 상태 기반 새 구현 방안 필요 |
| `BLOCKED: 완전불가` | ✅ 호출 — 새 접근법 도출 필요 |
| `BLOCKED: 빌드실패` | ✅ 호출 — 자체 수정 3회 실패 = 설계 문제 가능성 |
| `BLOCKED: 커밋실패` | ❌ 생략 — git/인프라 문제, advisor 불필요 |
| 기타/불명 | ✅ 호출 — 원인 파악부터 필요 |

**advisor 호출:**

```
Agent({
  subagent_type: "advisor",
  prompt: """
작업 파일: {CLAIMED_FILE 전체 내용}
blocked 사유: {frontmatter 또는 본문의 BLOCKED: 메시지}

요청:
1. blocked 원인 분석
2. 수정된 impact_files (현재 파일 실제 상태 기반)
3. 새로운 구현 방안 (기존 방안의 문제점 해소)
4. 주의해야 할 엣지케이스
"""
})
```

**advisor 응답 수신 후 task 파일 업데이트 (Edit):**
1. frontmatter `impact_files` 갱신
2. frontmatter `advisor: done` 기록
3. 본문에 `## 재설정 구현 방안 (advisor)\n{advisor 응답}` 추가
4. blocked 사유 주석으로 보존: `<!-- BLOCKED 이력: {사유} -->`

**todo/ 로 복귀:**
```bash
mv "{SESSION_ROOT}/docs/tasks/blocked/{f}" "{SESSION_ROOT}/docs/tasks/todo/{f}"
```

> `BLOCKED: 커밋실패` 는 advisor 없이 Step 4 수동 안내로만 처리.

---

### Step 4 — 결과 보고

아래 형식으로 출력:

```
📋 blocked/ 진단 결과 ({N}건)

✅ 자동 복귀:
  - [{id접미}] {제목} → todo/ (사유: impact_files 추가)
  - [{id접미}] {제목} → done/ (사유: committed: 마커 발견)

🤖 advisor 재설정 후 복귀:
  - [{id접미}] {제목} → todo/ (advisor 새 구현 방안 설정 완료)

🔧 수동 처리 필요 (커밋실패 등 인프라 문제):
  ─────────────────────────────────
  [{id접미}] {제목}
  원인: BLOCKED: 커밋실패

  해결 방법:
  1. {구체적 원인 안내}
  2. 해결 후 아래 명령으로 todo 복귀:
     mv "{경로}/blocked/{파일명}" "{경로}/todo/{파일명}"
  3. /kai-task-run 으로 재실행
  ─────────────────────────────────
```

---

## Red Lines

- ❌ blocked 파일 삭제 금지 (항상 이동만)
- ❌ `committed:` 있는 작업을 todo로 이동 금지 (done으로만)
- ❌ 수동 처리 필요 작업을 사용자 확인 없이 todo로 이동 금지
- ❌ doing/ 파일 수정 금지 (blocked/ 만 대상)
