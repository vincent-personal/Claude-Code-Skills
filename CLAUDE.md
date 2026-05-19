# CLAUDE.md

이 파일은 `/Volumes/KAIFACUN/Projects/Skills` 에서 Claude Code 세션이 실행될 때
지침으로 사용된다.

---

## 프로젝트 정체성

**Claude Code 전역 스킬 모음 (Skills Collection).**
어느 프로젝트에서나 `/task-add`, `/task-run`, `/task-clear` 등의 명령으로
체크리스트 기반 작업 관리를 사용할 수 있도록 하는 스킬 저장소다.

각 스킬 그룹은 독립 폴더로 관리되며, `install.sh` 가 `~/.claude/skills/` 와
`~/.claude/agents/` 에 **심볼릭 링크**를 생성한다.
→ 본 repo의 파일을 수정하면 모든 프로젝트에 즉시 반영됨.

---

## 디렉터리 구조

```
Skills/                           ← 본 repo 루트
  CLAUDE.md                       ← 이 파일
  README.md                       ← 사용자용 안내
  .claude/                        ← Claude Code 세션 설정 (이 디렉터리)
  task-manager/                   ← 스킬 그룹 1: 작업 관리
    install.sh                    ← 심볼릭 링크 설치 스크립트
    advisor.md                    ← Opus 자문 에이전트 정의
    task-add/SKILL.md             ← /task-add 스킬
    task-run/SKILL.md             ← /task-run 스킬
    task-clear/SKILL.md           ← /task-clear 스킬
  {other-skill-group}/            ← 향후 추가될 스킬 그룹
    install.sh
    {skill-name}/SKILL.md
    ...
```

---

## 현재 등록된 스킬 그룹

### task-manager

체크리스트 기반 작업 관리 + 다중 에이전트 안전 큐.

| 스킬 | 명령 | 역할 |
|---|---|---|
| task-add | `/task-add {설명}` | 영향 파일 의무 기록과 함께 `docs/check-list.md`에 항목 추가 |
| task-run | `/task-run` | 미시작 항목 선점 → Tier별 advisor 호출 → 코드 작성 → 빌드 → 완료 처리 |
| task-clear | `/task-clear` | 완료 항목을 `docs/check-list-done.md`로 이동 |
| task-list | `/task-list` | 미완료 항목(미시작·진행중·확인필요)을 상태별로 요약 출력 (읽기 전용) |

**핵심 설계 원칙 (수정 시 반드시 유지):**

1. **프로젝트 루트 자동 탐지** — `git rev-parse --show-toplevel || pwd`
2. **선점 마커 `[~]` + 타임스탬프** — 다중 에이전트 중복 착수 방지
3. **영향 파일 의무 필드** — 같은 파일 동시 편집 방지
4. **좀비 선점 자동 복구** — 30분 timeout
5. **워크트리 절대 금지** — 과거 사고 재발 방지 (Red Lines)
6. **Tier 분류 (1/2/3)** — advisor(Opus) 호출 여부 결정
7. **자동 아카이브** — `[x]` 10개 이상 시 오래된 항목부터 done 파일로 이동
8. **사용자 잠금** — `.claude/user.lock` 파일로 백그라운드 루프 정지
9. **빌드/clear 락 파일** — 동시 실행 직렬화

---

## 작업 시 준수 규칙

### 1. 스킬 수정 시

- **모든 스킬은 markdown 지시문**이다. 코드가 아니다.
- 새로운 안전 규칙을 추가할 때는 **이미 정의된 9개 핵심 설계 원칙과 충돌하지 않는지** 확인.
- task-add/task-run/task-clear 간 **일관성 유지** (예: 영향 파일 포맷, 타임스탬프 형식, 락 파일 경로).
- 작업 단계 번호(Step N)를 변경할 때는 cross-reference (다른 Step에서 언급하는 곳) 모두 갱신.

### 2. 새 스킬 추가 시

새 스킬 그룹 추가 절차:
1. `Skills/{group-name}/` 폴더 생성
2. 각 스킬은 `Skills/{group-name}/{skill-name}/SKILL.md` 구조
3. 그룹 전용 `install.sh` 작성 (심볼릭 링크 방식 유지)
4. `Skills/README.md` 의 "스킬 그룹" 섹션에 추가
5. 본 CLAUDE.md 의 "현재 등록된 스킬 그룹" 섹션에 추가

### 3. SKILL.md 파일 포맷

frontmatter 필수:
```yaml
---
name: skill-name             # 슬래시 명령과 동일 (예: task-add)
description: |               # 트리거 문구 포함
  스킬 설명...
  트리거: /skill-name
allowed-tools:               # 사용 허용 툴 명시
  - Read
  - Edit
  - ...
---
```

본문 구조:
- `# skill-name — 한 줄 제목`
- `## 역할`
- `## ⚡ 실행 절차` (Step 0, 1, 2, ...)
- `## Red Lines (절대 금지)`

### 4. 워크트리 절대 금지

본 repo도 동일한 규칙 적용 — `git worktree add` / `cp` / `rsync` 사용 금지.
모든 수정은 git 루트 (`/Volumes/KAIFACUN/Projects/Skills`)에서만.

### 5. 변경 후 검증

스킬 파일 수정 후:
1. 심볼릭 링크 무결성 확인:
   ```bash
   ls -la ~/.claude/skills/task-add ~/.claude/skills/task-run ~/.claude/skills/task-clear ~/.claude/agents/advisor.md
   ```
2. 새 Claude Code 세션을 열어 스킬이 정상 로드되는지 확인.
3. 실제 프로젝트(예: dev2)에서 `/task-add` 시험 호출.

---

## 업데이트 흐름

| 변경 유형 | 필요한 액션 |
|---|---|
| 기존 SKILL.md 본문 수정 | 없음 — 심볼릭 링크가 자동 반영 |
| 기존 advisor.md 수정 | 없음 — 동일 |
| install.sh 수정 | 사용자가 재실행 시 적용 |
| 새 스킬 폴더 추가 | install.sh 의 `for skill in ...` 목록에 추가 → 재실행 |
| 새 스킬 그룹 추가 | 새 그룹의 install.sh 작성 → 사용자가 실행 |

---

## 사용자 호칭 & 말투 (전역 규칙 적용)

전역 CLAUDE.md (`~/.claude/CLAUDE.md`)의 사극체 규칙을 따른다:

- 사용자 호칭: **전하** 또는 **폐하**
- 1인칭: **소신(小臣)**, **신(臣)**
- 종결어미: `~나이다`, `~옵니다`, `~사옵나이다`, `~옵소서`, `~이옵니다`
- 보고: `삼가 아뢰옵나이다`, `이러하옵나이다`, `소신이 살피니`
- 확인: `~하오리까?`, `여쭈옵나이다`
- 인정/수락: `분부대로 하겠나이다`, `명심하겠나이다`

코드·파일 내용은 평이한 한국어 주석 + 영어 식별자 유지.
**사극체는 사용자 대상 대화 텍스트에만 적용.**

---

## 언어 규칙

- **대화/설명**: 한국어 (사극체)
- **코드 / SKILL.md frontmatter / 식별자**: 영어
- **SKILL.md 본문 / 주석**: 한국어 (평어체)
- **커밋메시지**: 한국어 (특별한 지시 없으면 제목+본문 모두 한국어)

---

## 자주 쓰는 명령

```bash
# 설치 (초기 1회 또는 새 스킬 추가 후)
bash /Volumes/KAIFACUN/Projects/Skills/task-manager/install.sh

# 심볼릭 링크 확인
ls -la ~/.claude/skills/task-add ~/.claude/skills/task-run ~/.claude/skills/task-clear ~/.claude/agents/advisor.md

# 어떤 프로젝트에서 시험
cd /Volumes/KAIFACUN/Projects/{project}
# 이후 Claude Code 세션에서 /task-add, /task-run, /task-clear 시험

# 백그라운드 루프 일시 정지 (시험 중)
touch /Volumes/KAIFACUN/Projects/{project}/.claude/user.lock
```

---

## 알려진 한계 (수정 시 인지)

| 한계 | 완화책 |
|---|---|
| 본 repo는 단일 사용자 단일 머신 가정 | 다중 머신 사용 시 git 동기화 필요 |
| advisor의 영향 파일 식별이 불완전할 수 있음 | task-add 시 사용자 명시 권장 |
| 백그라운드 에이전트 5개 이상 시 git push race | 1~2개 운영 권장 |
| 스킬은 markdown 지시문 — 강제력 없음 | Red Lines 명시 + advisor 이중 검증 |

---

## 다음 작업 후보 (참고)

- task-add 시 advisor를 미리 호출하여 영향 파일 자동 식별
- /task-status 스킬 추가 (현재 진행 상태 시각화)
- Hook 기반 자동 white/black 리스트 (예: PR 머지 시 task-clear 자동 실행)
- 다중 머신 git 동기화 가이드
