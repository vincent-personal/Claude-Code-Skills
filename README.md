# Claude Code Skills Collection

Claude Code 전역 스킬 모음. 각 스킬 그룹은 독립 폴더로 관리되며, 설치 스크립트로
`~/.claude/skills/` 와 `~/.claude/agents/` 에 심볼릭 링크된다.

## 스킬 그룹

### task-manager

체크리스트 기반 작업 관리. 어느 프로젝트에서도 `/task-add`, `/task-run`, `/task-clear` 명령으로
**다중 에이전트 안전한** 작업 큐를 운영한다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| task-add | `/task-add {설명}` | `docs/check-list.md`에 항목 추가 (영향 파일 의무 기록) |
| task-run | `/task-run` | 미시작 항목 선점 → 완수 → 완료 처리 |
| task-clear | `/task-clear` | 완료 항목 → `docs/check-list-done.md`로 이동 |

설치:
```bash
bash /Volumes/KAIFACUN/Projects/Skills/task-manager/install.sh
```

설치 스크립트는 다음을 수행:
- `~/.claude/skills/{task-add,task-run,task-clear}/SKILL.md` 심볼릭 링크 생성
- `~/.claude/agents/advisor.md` 심볼릭 링크 생성 (Opus 자문 에이전트)

심볼릭 링크 방식이므로 이 repo를 수정하면 모든 프로젝트에 즉시 반영된다.

---

## 다중 에이전트 안전성 설계

### 1. 선점 마커 + 타임스탬프

| 마커 | 의미 |
|---|---|
| `- [ ]` | 미시작 — 착수 가능 |
| `- [~]` | 작업중 — `(선점: YYYY-MM-DD HH:MM)` 포함 |
| `- [x]` | 완료 |
| `- [!]` | 자체 판단으로 진행했으나 사후 확인 권장 |

Edit 툴의 unique-string matching이 자연스러운 락 역할.
선점 실패 시(다른 에이전트가 동시 선점) 다음 후보로 자동 재시도.

### 2. 영향 파일 충돌 검사

각 작업 항목은 **영향 파일** 필드를 의무적으로 갖는다.
task-run은 모든 활성 `[~]` 항목의 영향 파일을 합집합으로 모은 뒤,
후보 `[ ]` 항목과 교집합이 있으면 skip한다.

```markdown
- [ ] **#5** — Header 리팩터링.
  - **영향 파일**: src/header.ts, src/header.scss
  - 세부 설명...
```

→ 5개 백그라운드 에이전트가 동시 운영되어도 같은 파일을 두 에이전트가 동시 편집하지 않음.

### 3. 좀비 선점 자동 복구

`- [~]` 의 선점 타임스탬프가 30분 이상 경과하면 좀비로 간주, `- [ ]` 로 복귀.
에이전트 충돌·중단으로 인한 영구 락을 방지.

### 4. Build Lock

`.claude/build.lock` 파일로 동시 빌드 직렬화.
다른 에이전트가 빌드 중이면 최대 5분 대기 후 진행.

### 5. 사용자 작업 잠금

`{PROJECT_ROOT}/.claude/user.lock` 파일 존재 시 task-run 즉시 종료.
```bash
touch .claude/user.lock    # 사용자 작업 시작
rm .claude/user.lock        # 작업 끝나면 해제
```

### 6. Git 충돌 완화

task-run의 git 단계는 `pull --rebase` 후 push, 실패 시 최대 3회 재시도.

### 7. 컨텍스트 누적 자동 방지

`- [x]` 항목이 10개 이상이면 task-add/task-run 실행 시 자동으로 오래된 것부터 `check-list-done.md` 로 이동.
**최근 5개**는 Tier 2 자문 참조용으로 보존.
사용자가 `/task-clear` 를 까먹어도 매 호출마다 누적되어 컨텍스트가 폭증하는 사고를 방지.

---

## 워크트리 절대 금지

과거 사고로 검증된 규칙: `git worktree add` 와 워크트리/원본 동기화 금지.
모든 작업은 git 루트의 원본 파일에서만 수행. `realpath` 로 검증 강제.

---

## Tier 기반 advisor 호출

| Tier | 조건 | 처리 |
|---|---|---|
| 🟢 1 | 5줄 이하 미세 수정, 리네이밍 | Sonnet 단독 |
| 🟡 2 | 기존 패턴 반복, 7일 내 유사 자문 | 기존 파일 참조 |
| 🔴 3 | 새 기능, 구조 변경, DB, 보안 | **advisor(Opus) 계획 → Sonnet 구현** |

`advisor.md` 가 `~/.claude/agents/` 에 자동 설치되어 Tier 3 작업의 Opus 자문 제공.
advisor 응답에서 새로 발견된 영향 파일은 체크리스트에 즉시 append.

---

## 프로젝트 루트 자동 탐지

각 스킬은 실행 시점에 git 루트를 탐지:
```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```
탐지된 루트 기준으로 `docs/check-list.md` 와 `docs/check-list-done.md` 를 관리.

---

## 새 스킬 그룹 추가

`Skills/` 아래에 새 폴더를 만들고 동일한 구조로 작성:
```
Skills/
  task-manager/      ← 기존
  some-other-group/  ← 새로 추가
    install.sh
    skill-name/
      SKILL.md
    ...
```

---

## 알려진 한계

| 한계 | 완화 방법 |
|---|---|
| advisor의 영향 파일 식별이 불완전할 수 있음 | task-add 단계에서 사용자가 명시 |
| git push race condition (5개+ 에이전트) | `pull --rebase` + 3회 재시도, 그래도 빈번하면 에이전트 수 줄이기 |
| 영향 파일 미기재 항목은 안전망 우회 | task-add가 의무화하지만 사용자가 임의 편집 시 무력화 |
| 백그라운드 에이전트 5개 운영 시 충돌률↑ | **1~2개 운영 권장** |
