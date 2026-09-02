# Claude Code Skills Collection

Claude Code 전역 스킬 모음. 각 스킬 그룹은 독립 폴더로 관리되며, 설치 스크립트로
`~/.claude/skills/` 와 `~/.claude/agents/` 에 심볼릭 링크된다.

## 스킬 그룹

### meeting-to-spec

고객 미팅 녹취록을 다부서(BA → 운영 → 시장/마케팅 → 개발 → 사장) 파이프라인으로
분해하여 데모/MVP 직전까지 사용 가능한 사양 문서 세트(7개 파일)를 생성한다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-meeting-to-spec | `/kai-meeting-to-spec <폴더> [--auto]` | 녹취록 폴더 → output/ 7개 산출물 |

설치:
```bash
bash /Volumes/KAIFACUN/Projects/Skills/meeting-to-spec/install.sh
```

설치 스크립트는 다음을 수행:
- `~/.claude/skills/kai-meeting-to-spec/SKILL.md` 심볼릭 링크 생성
- `~/.claude/agents/spec-advisor.md` 심볼릭 링크 생성 (Opus PM/BA 자문)

대화형 모드는 단계마다 게이트 확인, `--auto` 모드는 spec-advisor에게 모호한 질문 위임.

---

---

### design-check

이미 만들어진 프론트엔드의 **화면 전부를 계측**해 디자인 결함을 찾아 순서대로 고친다.
Angular(SSR/CSR) · Ionic · React · Vue · Next · Svelte · **Flutter** · 네이티브 —
데스크탑 브라우저든 모바일 브라우저든 모바일 네이티브든 표면을 가리지 않는다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-design-check | `/kai-design-check [프로젝트경로]` | 표면 판별 → 계측 → 오탐 제거 → 레퍼런스 대조 → 수정 → 재계측 → 교차 검증 → 문서화 |

잡는 것: 화면 벗어남 · 요소 겹침 · 고정 바에 가려짐 · 글자 잘림 · **색 대비(WCAG AA)** ·
**패딩/정렬 근접 불일치(OCD 항목)** · 터치 타깃 · 오버레이(포커스·Escape·겹침) ·
애니메이션(동작 줄이기) · SSR 상태코드 · **디자인 원본과의 글자 단위 대조**

계측 어댑터 3종 + 대조기 1종:
- `web/` DOM 좌표 (Angular·Ionic·React·Vue·Next)
- `flutter/` 위젯 트리 rect + 프레임워크 오버플로 오류
- `pixel/` 스크린샷 픽셀 — **표면 무관**, 네이티브도 된다
- `refdiff/` 레퍼런스 ↔ 구현 글자 단위 대조

설치:
```bash
bash /Volumes/KAIFACUN/Projects/Skills/design-check/install.sh
```

### database  🗄️ *(도메인 그룹)*

**데이터베이스 도메인**의 스킬을 모으는 그룹. 앞으로 백업·복제·튜닝 등이 여기 붙는다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-db-migration | `/kai-db-migration {어느 DB를 · 어디에서 · 어디로}` | DB 하나를 **완전 동일하게** 이전하고 **실측으로 증명** |

스키마·테이블·컬럼·인덱스·제약·**외래키·뷰·프로시저·함수·트리거·이벤트** + **데이터 전량**을
1:1 로 옮긴다. 9개 GATE 로 되어 있고, 핵심은 **GATE 2 대소문자(`lower_case_table_names`) 판정**이다 —
이것을 먼저 재지 않으면 옮긴 뒤 앱이 `table doesn't exist` 로 깨진다. **실제로 겪었다.**

검증은 3층 전부 통과해야 완료: **객체 수(종류별)** · **전 테이블 실제 `count(*)`** ·
**🔴 앱 경로 그대로 실접속**. 행수만 맞으면 완료로 보고하지 않는다.

설치:
```bash
bash /Volumes/KAIFACUN/Projects/Skills/database/install.sh
```

---

### task-manager

**파일-per-task** 작업 관리. 어느 프로젝트에서도 `/kai-task-add`, `/kai-task-run`, `/kai-task-clear`, `/kai-task-list` 명령으로
**다중 에이전트 안전한** 작업 큐를 운영한다.

> 🧱 **작업 1개 = 파일 1개** (`docs/tasks/` 디렉터리). 상태는 디렉터리(`todo/`·`doing/`·`done/`·`blocked/`)가
> 권위이고, 전이는 `mv`(원자적 rename)로만 일어난다. 단일 `check-list.md` 공유 쓰기에서 발생하던
> **번호 선점 충돌·동시 쓰기 꼬임이 구조적으로 사라진다.**

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-task-add | `/kai-task-add {설명}` | `docs/tasks/todo/`에 task 파일 1개 추가 (영향 파일 의무, staging→원자적 mv) |
| kai-task-run | `/kai-task-run` | todo/ 의 가장 먼저 만든 작업을 `mv` 원자 선점 → 완수 → `done/` 이동 |
| kai-task-clear | `/kai-task-clear` | `done/` 완료 작업을 `done/archive/`로 정리 |
| kai-task-list | `/kai-task-list` | 미완료(todo·doing·blocked) frontmatter만 스캔하여 FIFO 요약 (읽기 전용) |

설치:
```bash
bash {이 repo}/task-manager/install.sh
```

설치 스크립트는 다음을 수행:
- `~/.claude/skills/kai-task-{add,run,clear,list}/SKILL.md` 심볼릭 링크 생성
- `~/.claude/agents/advisor.md` 심볼릭 링크 생성 (Opus 자문 에이전트)

심볼릭 링크 방식이므로 이 repo를 수정하면 모든 프로젝트에 즉시 반영된다.
기존 `check-list.md` 가 있는 프로젝트는 add/run 첫 실행 시 자동으로 `tasks/` 로 1회 마이그레이션된다.

---

### kai-browser

VERIDA 앱을 브라우저로 검증하는 세 경로. agent-browser CLI(기본·최속) / MCP(대화형) / node 스크립트(토큰 주입·MCP 무관 폴백)를 명시적으로 분리한다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-browser-agent | `/kai-browser-agent {URL/요청}` | agent-browser(vercel-labs) CLI를 Bash로 직접 호출(가장 빠름). ⚠️node 24 필요. 사용법은 `agent-browser skills get core --full` 런타임 참조(하드카피 금지) |
| kai-browser-mcp | `/kai-browser-mcp {URL/요청}` | 글로벌 user-scope Playwright MCP(self-chromium)로 대화형 조작·시각 확인 |
| kai-browser-node | `/kai-browser-node {URL/요청}` | Playwright 라이브러리 스크립트를 node 실행, Supabase API 토큰을 localStorage에 주입(강제 로그인)한 뒤 페이지를 돌며 탐색적으로 검증(화면 덤프 보고 이동·입력·캡처) |

설치:
```bash
bash {이 repo}/kai-browser/install.sh
```

- 두 모드는 독립적이다: node 모드는 공유 프로필을 쓰지 않고 매번 자체 인증(토큰 주입)하므로 MCP의 프로필 잠금과 충돌하지 않는다.
- 전제: 글로벌 Playwright MCP(user scope) + 글로벌 `playwright` 라이브러리. 끊김 이력·재설치 경위는 `dev` 메모리 `project-playwright-mcp-setup` 참조.

### kai-peer-session

두 에이전트(Claude Code · kai-gen)로 한 작업을 나눠 할 때, 서로의 진행을 사람이 옮겨 적는 수고를 없앤다.
**같은 폴더 + 같은 세션 이름**을 열쇠로 삼아 상대 세션의 대화를 찾아 읽는다.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-peer-session-kaigen | `/kai-peer-session-kaigen` | **Claude 에서 호출** — 같은 이름의 kai-gen 세션을 읽는다 |
| kai-peer-session-claude | `/kai-peer-session-claude` | **kai-gen 에서 호출** — 같은 이름의 Claude Code 세션을 읽는다 |

설치:
```bash
bash {이 repo}/kai-peer-session/install.sh
```

- 세션 이름 저장 위치: Claude 는 `~/.claude/projects/{cwd}/{uuid}.jsonl` 안의 `custom-title` 레코드
  (파일명에 없다), kai-gen 은 `~/.kai-gen/sessions/{id}/meta.json` 의 `name`.
- 이름 자동 추정: `--name` 이 없으면 **내 쪽 에이전트에서 가장 최근 기록된 세션**을 나로 본다.
  스킬을 부르는 순간 내 대화가 기록되므로 대개 맞지만, 같은 폴더에 내 쪽 세션이 여럿이면
  첫 줄의 추정 결과를 보고 `--name` 으로 덮어쓴다.
- 진단: `python3 {이 repo}/kai-peer-session/peer-session.py --list` — 현재 폴더의 양쪽 이름 일람.
- 상대의 thinking 은 옮겨오지 않는다(사고과정은 결론이 아니다). 도구 호출·결과는 길이를 잘라 요약.

---

### sermon-correction

한국어 설교 원문을 발표 시간(10/15/20/30분)에 맞춰 축약한 **발표용 교정본**을 만든다.
색상 코딩(보존/삭제/수정/추가/성경구절/배경설명)으로 읽을 부분과 건너뛸 부분을 시각 구분한
HTML(`docs/`)과 Notion 페이지를 생성한다. 원문 전 문장 보존(삭제선 표기)·순서 불변이 원칙.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-sermon-correction | `/kai-sermon-correction` | 설교 원문 → 색상 교정본 HTML + Notion (배경설명·토의 포인트 옵션) |

설치:
```bash
bash {이 repo}/sermon-correction/install.sh
```

- 색상 규칙·검증 체크리스트: `sermon-correction/kai-sermon-correction/references/rulebook.md`
- HTML 템플릿: `sermon-correction/kai-sermon-correction/assets/template.html`

---

## 다중 에이전트 안전성 설계

### 1. 디렉터리 = 상태, `mv` = 원자적 전이

| 디렉터리 | 의미 |
|---|---|
| `todo/` | 미시작 — 착수 가능 |
| `doing/` | 작업중 — 선점됨 (frontmatter `claimed_at`) |
| `done/` | 완료 |
| `blocked/` | 자체 판단으로 막힘 — 사후 확인 권장 |

선점은 `mv todo/X doing/X`. **rename(2)은 원자적**이라 두 에이전트가 같은 작업을 동시에 집어도
한쪽만 성공하고 다른 쪽은 자연히 다음 후보로 넘어간다. (구 `[~]`마커 + Edit재시도 기계장치를 대체)
작업 생성은 `.staging/` 에 완성본을 쓴 뒤 원자적 `mv`로 todo/ 투입 → 부분 작성 파일이 보이는 윈도우 제거.

### 2. 영향 파일 충돌 검사

각 task 파일은 frontmatter `impact_files` 를 의무적으로 갖는다.
task-run은 작업중(`doing/`) 파일들의 impact_files 합집합과 후보의 교집합이 있으면 양보한다(id 작은 쪽 우선).

```yaml
---
id: 20260529-143000-a3f
title: Header 리팩터링
impact_files:
  - src/header.ts
  - src/header.scss
predecessors: []
---
```

→ 여러 백그라운드 에이전트가 동시 운영되어도 같은 파일을 두 에이전트가 동시 편집하지 않음.

### 3. FIFO 실행 + 선행조건

ID가 `YYYYMMDD-HHMMSS-...` 라 **파일명 정렬 = 생성순 = 실행순**. 가장 먼저 만든 작업이 먼저 실행된다.
frontmatter `predecessors` 에 선행 작업 id를 적으면, 그 작업들이 모두 `done/` 에 들어오기 전까지 후행은 착수되지 않는다.

### 4. 좀비 선점 자동 복구

`doing/` 파일이 30분 이상 갱신되지 않으면 좀비로 간주, `todo/` 로 되돌린다.
에이전트 충돌·중단으로 인한 영구 락을 방지. `.staging/` 의 고아 temp도 함께 청소.

### 5. Build Lock

`.claude/build.lock` 파일로 동시 빌드 직렬화. 다른 에이전트가 빌드 중이면 최대 5분 대기 후 진행.

### 6. 사용자 작업 잠금

`{SESSION_ROOT}/.claude/user.lock` 파일 존재 시 task-run 즉시 종료.
```bash
touch .claude/user.lock    # 사용자 작업 시작
rm .claude/user.lock        # 작업 끝나면 해제
```

### 7. Git 충돌 완화

task-run의 git 단계는 `pull --rebase` 후 커밋, 실패 시 최대 3회 재시도. 커밋 메시지는 `feat(ops {id접미}): 제목`.

### 8. 컨텍스트 절감

완료 작업은 `done/` 에 격리되어 더는 읽히지 않는다. add/run/list 모두 **본문을 통째로 읽지 않고**
frontmatter만 `awk '/^---$/{c++;next} c==1'` 로 추출한다. 작업 1건 처리에 전체 목록을 로드하던 낭비가 사라진다.
완료 정리(아카이브)는 **task-run에서만** 수행한다.

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
advisor 응답에서 새로 발견된 영향 파일은 task 파일의 `impact_files` 에 즉시 append.

---

## 세션 루트 자동 탐지 (SESSION_ROOT)

각 스킬은 git 루트가 아니라 **세션 루트**를 탐지한다 (하위 프로젝트에 tasks/ 가 생기는 것을 방지):
1. Claude Code 시스템 컨텍스트의 `Primary working directory` 값 우선
2. 없으면 현재 위치에서 상위로 올라가며 **가장 상위의 CLAUDE.md** 디렉터리

4개 스킬의 Step 0 탐지 블록은 **글자 그대로 동일**하다 (미묘한 차이가 곧 "파일이 두 곳에 생기는" 버그).
탐지된 루트 기준으로 `docs/tasks/` 디렉터리를 관리한다.

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

### kai-openai — 타 모델 교차 검증·토론

Claude 의 결론을 **비-Anthropic 계열 모델**(OpenAI·DeepSeek·GLM 등)에게 적대적으로 검증받고,
불일치 시 최대 3라운드 토론으로 수렴시킨다. kai-gen MCP 서버를 통해 호출한다.

- 서버 둘: 로컬 `mcp__kai-gen__*`(stdio, 파일 읽기 가능) / 원격 `mcp__kai-gen-remote__*`(https://kaigen.kaifacun.com/mcp, 파일 못 읽음)
- 전제: 그 기기의 Claude Code 에 kai-gen MCP 가 등록되어 있어야 한다(`/mcp` 로 확인).
  원격은 Bearer 토큰이 필요하며, 토큰은 git 에 두지 않는다(kai-gen 저장소의 `.kaigen-remote.env`).

설치:
```bash
ln -s {이 repo}/kai-openai/SKILL.md ~/.claude/skills/kai-openai/SKILL.md
```
