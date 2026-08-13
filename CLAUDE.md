# CLAUDE.md

이 파일은 `/Volumes/KAIFACUN/Projects/Skills` 에서 Claude Code 세션이 실행될 때
지침으로 사용된다.

---

## 프로젝트 정체성

**Claude Code 전역 스킬 모음 (Skills Collection).**
어느 프로젝트에서나 `/kai-task-add`, `/kai-task-run`, `/kai-task-clear` 등의 명령으로
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
  task-manager/                   ← 스킬 그룹 1: 작업 관리 (파일-per-task)
    install.sh                    ← 심볼릭 링크 설치 스크립트
    advisor.md                    ← Opus 자문 에이전트 정의
    REFACTOR-file-per-task.md     ← 파일-per-task 아키텍처 설계 자문안 (검증 완료)
    kai-task-add/SKILL.md             ← /kai-task-add 스킬
    kai-task-run/SKILL.md             ← /kai-task-run 스킬
    kai-task-clear/SKILL.md           ← /kai-task-clear 스킬
    kai-task-list/SKILL.md            ← /kai-task-list 스킬
  meeting-to-spec/                ← 스킬 그룹 2: 미팅 노트 → 시스템 사양
    install.sh                    ← 심볼릭 링크 설치 스크립트
    spec-advisor.md               ← Opus 메타 자문 에이전트 정의 (모든 role agent escalation 대상)
    kai-meeting-to-spec/SKILL.md  ← /kai-meeting-to-spec 마스터 오케스트레이터
    agents/                       ← 7개 fresh-context Opus role agent (Stage 0~6)
      m2s-curator.md              ← Stage 0: Transcript Curator
      m2s-ba.md                   ← Stage 1: Business Analyst
      m2s-ops.md                  ← Stage 2: Operations Manager
      m2s-marketing.md            ← Stage 3: Market & Marketing Strategist
      m2s-tech.md                 ← Stage 4: Tech Lead + Solution Architect
      m2s-ceo.md                  ← Stage 5: CEO/Founder
      m2s-design.md               ← Stage 6: Product Design Lead
  {other-skill-group}/            ← 향후 추가될 스킬 그룹
    install.sh
    {skill-name}/SKILL.md
    ...
```

---

## 현재 등록된 스킬 그룹

### task-manager

**파일-per-task** 작업 관리 + 다중 에이전트 안전 큐 (`docs/tasks/` 디렉터리 모델).

> 🧱 단일 `check-list.md` 공유 read/modify/write를 폐기하고 **작업 1개 = 파일 1개**로 전환.
> 상태는 디렉터리(`todo/`·`doing/`·`done/`·`blocked/`)가 권위이며 전이는 `mv`(원자적 rename)로만.
> → 번호 선점 충돌·동시 쓰기 꼬임이 **구조적으로 불가능**. 설계 상세: `task-manager/REFACTOR-file-per-task.md`.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-task-add | `/kai-task-add {설명}` | 영향 파일(impact_files) 의무 기록과 함께 `docs/tasks/todo/`에 task 파일 1개 추가 (staging→원자적 mv · 등록은 백그라운드 Agent — 턴 즉시 종료) |
| kai-task-run | `/kai-task-run` | todo/ 의 가장 먼저 만든 작업을 `mv` 원자 선점 → Tier별 advisor → 코드 → 빌드 → `done/` 이동 |
| kai-task-clear | `/kai-task-clear` | `done/` 완료 작업을 `done/archive/`로 정리 (읽기/이동 전용) |
| kai-task-list | `/kai-task-list` | 미완료(todo·doing·blocked)를 frontmatter만 스캔하여 FIFO 요약 출력 (읽기 전용) |

**핵심 설계 원칙 (수정 시 반드시 유지):**

1. **SESSION_ROOT 통일 탐지** — Primary working dir 우선, fallback 최상위 CLAUDE.md. **4스킬 Step 0 블록 글자 그대로 동일** (git root 사용 금지)
2. **`mv` 원자 claim** — `todo→doing` 성공한 한 세션만 획득. 구 `[~]`마커+Edit재시도 기계장치 대체
3. **시각기반 고유 ID** — `YYYYMMDD-HHMMSS-{NS}-$$-rand` (NS=나노초, **BSD date `%N` 미지원 시 감지→`000000000` fallback**, pid로 유일성 보장). 파일명 정렬 = 생성순 = **FIFO 실행**. 순차 `#N` 폐기(조율 제거)
4. **영향 파일 의무 필드** — frontmatter `impact_files`. doing/ 합집합과 교집합 검사로 동시 편집 방지
5. **상태=디렉터리(유일 권위)** — frontmatter에 `status` 필드 금지(drift 방지)
6. **staging→원자적 mv 생성** — 빈 파일 선생성 금지. 병합은 Edit-only, 실패 시 신규파일 fallback (split-brain 방지)
7. **predecessors 선행조건** — claim 전 선행 id가 모두 `done/`에 있어야 착수
8. **좀비/고아 자동 복구 + 완료 화해** — doing/ 의 `committed:` 마커 있으면 곧장 done/ 으로 화해(재실행 금지), 없고 30분 경과면 todo/ 복귀, `.staging/` 고아 청소
9. **워크트리 절대 금지** — 과거 사고 재발 방지 (Red Lines)
10. **Tier 분류 (1/2/3)** — Tier 3 advisor(Opus) 자문은 **add 전용**(등록 시 구현방안·impact_files 확정 — 충돌 게이트 입력은 claim 이전에 완성돼야 함). **Tier 3 워커는 `model: "opus"` 로 스폰**(구현 자체가 난제인 부류의 탈출구), tier 1·2 워커는 세션 모델(경량) 상속. 워커 3.7 advisor 게이트는 `advisor: done` + 스펙-코드 일치 시 재호출 생략(중복 자문 방지)
10-b. **kai-gen MCP 교차 검증 (bash Codex CLI 대체)** — 리스크 분석은 bash CLI·`.plans/` 중간 파일 없이 **LLM이 `mcp__kai-gen__kai_consult` 를 직접 호출**: add 등록 에이전트는 Tier 3 스펙(`· 등록` 섹션)을, run 워커는 tier≥2 구현 플랜(`· 구현` 섹션)을 반박 우선 검증(단일 호출·4부 압축 context·최대 10분 허용·거절한 치명 지적도 기록). 실패는 기록 후 자체 플랜 진행(soft-fail), 성공 기록만 멱등 skip. claim 스크립트는 순수 파일 연산으로 복귀(Step 2 블로킹 해소)
11. **아카이브 일원화** — 완료 정리는 **task-run에서만**(`[x]` 생산 주체가 run). add에서 제거
12. **레거시 자동 마이그레이션** — add/run Step 0에서 기존 `check-list.md` → `tasks/` 1회 변환
13. **컨텍스트 절감** — 본문 통째 읽기 금지, frontmatter만 `awk '/^---$/{c++;next}c==1'` 추출
14. **사용자 잠금** — `.claude/user.lock` 파일로 백그라운드 루프 정지
15. **빌드 락 파일** — `.claude/build.lock` 으로 동시 빌드 직렬화
16. **완료 무결성** — `mv doing→done` 이 곧 "완료"의 정의(보고 전 Step 7-V 검증 필수). 커밋 성공 직후 `committed:` 해시 마커 기록 → mv 누락돼도 다음 run이 재실행 없이 done/ 으로 화해. doing/ 잔류는 어떤 분기에서도 금지(성공=done, 실패=blocked)
17. **add 등록 백그라운드화 + 세션 운용 전제** — add의 등록 Agent는 `run_in_background` 스폰 후 턴 즉시 종료(큐·다중 세션 add 병렬 처리). TASK_ID 선발급(Step 0-F)으로 FIFO 보존, ready 게이트 + 30분 고아 sweep이 미완성 보호. 운용 전제: **run은 항상 단일 세션, add는 다중 세션 허용**

---

### design-sync

레퍼런스(HTML 파일 또는 프로젝트)에서 디자인 시스템을 추출하여 Angular V21 + Tailwind V4 + PrimeNG V21 프로젝트에 완전히 동일한 테마로 적용하는 파이프라인.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-design-sync | `/kai-design-sync <레퍼런스> [<타겟>]` | 디자인 추출 → 토큰 적용 → Playground 생성 → 규칙 문서화 |

**핵심 설계 원칙 (수정 시 반드시 유지):**

1. **PrimeNG preset 색상값 하드코딩 금지** — 반드시 `var(--*)` CSS 변수 참조 (Tailwind와 단일 소스 공유)
2. **소스코드 우선 추출** — Playwright는 검증 보조용, dev 서버 자동 시작 금지
3. **백업 후 수정** — `styles.css`, `app.config.ts`, `CLAUDE.md` 수정 전 `.design-sync/backup-{ts}/` 생성
4. **멱등성 보장** — CLAUDE.md 마커(`<!-- KAI-DESIGN-RULES:START/END -->`) 기반 교체로 재실행 안전
5. **Playground lazy load** — `loadComponent: () => import(...)` 방식 강제
6. **sections/ 분할** — 카테고리별 컴포넌트 분리 (tokens/buttons/forms/data-display/feedback/navigation/overlay)
7. **폰트 복사 금지** — 외부 폰트 URL만 기록, 라이선스 확인은 사용자 몫
8. **레퍼런스 읽기 전용** — 레퍼런스 프로젝트 파일 쓰기 금지
9. **이중 구현·전수 진열·칩 주소 체계** — playground 데모 셀은 Tailwind·PrimeNG 양쪽 구현 필수(한쪽 생략 금지), 인벤토리는 레퍼런스+타겟 코드베이스 컴포넌트 유닛 전수 검색(빈도로 제외 금지), 셀마다 `pg://` 칩(클릭=복사). 방법론 원본: `design-sync/kai-design-sync/references/shared-ui-playbook.md` (install.sh가 references/도 링크)
10. **Ionic 모드 (타겟에 `@ionic/angular` 감지 시)** — 절차·산출물·칩 체계는 동일하되 구현 수단만 치환: Tailwind·PrimeNG **불설치·불사용**, 순수 Ionic 중앙 통합 테마(`theme/tokens.scss` 단일 진실원 → `variables.scss` `--ion-*` 매핑 · 색상 6종 변형+`.ion-color-*` 클래스 · stepped colors 재생성 → `components.scss` 레퍼런스 시각 클래스 무번역 이식). 3플랫폼(네이티브·모바일웹·데스크탑웹) 요건 필수: 모드 통일(`mode:'md'`)·safe-area·`@media(hover:hover)` 격리·ion-content 스크롤 위임·데스크탑 셸 전략 명시
11. **3모드 + 모드 확정 질문 (spartan 우선 추천)** — primeng/spartan/ionic. Ionic 감지 시 무질문, 그 외(**Tailwind-only·순수 Angular 타겟 포함 — 추정 진행 금지, 반드시 질문**)에는 AskUserQuestion으로 모드 확정(기설치 스택이 기본값, **신규(UI 라이브러리 없음)는 spartan이 "(Recommended)" 1순위** — PrimeNG 유료 전환·spartan 오픈소스 정책 · **질문에서 선택됨 = 미설치 스택 설치 승인** — 확정 모드에서 빠진 패키지는 설치 후 진행, Angular 부재·구버전만 BLOCKED). spartan 모드: shadcn식 `:root`/`.dark` 변수(**전체 색값 형식** — hsl 성분 아님) 매핑 + **기성품 우선 원칙**(자작 전에 helm 카탈로그→brain 조합 순으로 탐색, 디자인은 테마 변수로 일치) + helm copy-in 수정 2단 규율(색·간격은 테마 변수만, helm 수정은 variant 추가 시만 + REGISTRY "(modified)" · CLI 재생성 전 diff 필수) + **중앙 관리 규율 7-S**(시각 결정은 테마 변수·중앙 컴포넌트·playground 3곳에서만 — 페이지 분산 정의 금지) · PrimeNG 정렬 트릭(원칙 2·3·4·cssLayer) 미적용
12. **모드별 보완 문서 (references/00~03)** — 규칙 문서 산출·검증 체크리스트 작성 시 `references/00-common-design-system-rules.md`(공통) + 실행 모드 문서 1부(`01-ionic` / `02-tailwind-primeng` / `03-tailwind-spartan`)를 참고. 보완재이므로 **스킬 규정과 충돌 시 스킬 규정 우선**

---

### meeting-to-spec

미팅 녹취록을 다부서(BA → 운영 → 시장/마케팅 → 개발 → 사장) 페르소나로 분해하여
데모/MVP 직전까지 사용 가능한 7개 산출물을 생성하는 파이프라인.

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-meeting-to-spec | `/kai-meeting-to-spec <폴더> [--auto]` | 녹취록 폴더 → output/ 7개 산출물 |

**핵심 설계 원칙 (수정 시 반드시 유지):**

1. **Fresh context per stage** — 각 Stage = 별도 role agent Opus 호출. 페르소나 간 컨텍스트 오염 차단
2. **_TRACE.md 필독** — 모든 role agent는 작업 전 게이트 피드백·과거 결정 누적 파일 필독
3. **단일 spec-advisor** — 7개로 쪼개지 않음 (role agent가 페르소나, advisor는 generic meta)
4. **모든 인용에 원문 라인 번호** — 환각 방지, 후속 검증 가능
5. **3계층 + 1특수 태깅** — 🟢 명시 / 🟡 암묵 / 🔴 누락추가 / 🔶 확인 필요
6. **녹취록 외부 데이터 환각 금지** — 시장 규모·경쟁사 등은 🔶로만 표시
7. **자동 모드 안전망** — 금전·법적·외부 발송 결정은 자동화 금지 (BO 확인 필수로만 표시)
8. **재현성** — 동일 입력 → 동일 파일명·구조 (Stage00~Stage06 + README + apps/)
9. **단일/부분 실행** — `--stage=N` / `--from=N` 지원 (단 전제 단계 산출 검증)
10. **단계 순서 엄수** — Stage 0 → 1 → 2 → 3 → 4 → 5 → 6 (m2s-design)

---

### kai-browser

VERIDA 앱 브라우저 검증을 **세 경로로 명시적으로 분리**한다 — agent-browser CLI(기본·최속) / Playwright MCP 도구(대화형) / Playwright node 스크립트(Supabase 토큰 주입·MCP 무관 폴백).

| 스킬 | 명령 | 역할 |
|---|---|---|
| kai-browser-agent | `/kai-browser-agent {URL/요청}` | agent-browser(vercel-labs) CLI를 Bash로 직접 호출(가장 빠름). ⚠️node 24 필요. 사용법은 `agent-browser skills get core --full` 런타임 참조(하드카피 금지) |
| kai-browser-mcp | `/kai-browser-mcp {URL/요청}` | 글로벌 user-scope Playwright MCP(self-chromium, --extension 아님)로 대화형 조작·시각 확인 |
| kai-browser-node | `/kai-browser-node {URL/요청}` | Playwright 라이브러리 스크립트를 node 실행, Supabase Auth API 토큰을 localStorage 주입(강제 로그인)한 뒤 페이지를 돌며 탐색적으로 검증(화면 덤프 보고 이동·입력·캡처) |

**핵심 설계 원칙 (수정 시 반드시 유지):**

1. **두 모드의 프로필 분리** — MCP는 persistent 공유 프로필(`~/.cache/playwright-mcp-profile`), node는 **공유 프로필 미사용**(매번 자체 토큰 주입). node가 공유 프로필을 열면 MCP의 `SingletonLock` 과 충돌하므로 금지
2. **MCP 모드는 끝나면 `browser_close`** — 프로필 잠금 해제(node 모드가 이어서 못 여는 것 방지)
3. **node 인증 = Supabase Auth API → `localStorage['sb-jexlxbzrpapryytdlzxz-auth-token']` 주입 → reload** — 폼 UI 비의존, 결정적. 비번 계정은 `grant_type=password`, yopmail 계정은 OTP
4. **playwright import 절대경로 고정** — 글로벌 라이브러리, ⚠️ nvm node 버전에 묶임(버전 전환 시 경로 갱신)
5. **anon/publishable 공개키만** — service_role 금지(RLS 우회)
6. **산출물은 `dev/qa/`** — 워크스페이스 루트 금지
7. **dev 서버 직접 시작 금지** — 사용자 터미널에서 실행 중
8. **kai-browser-agent = agent-browser CLI(node 24 필수)** — bin이 node 24 글로벌. Bash가 22면 `nvm use 24` 프리픽스, 또는 Claude Code를 24로 실행. 사용법은 `agent-browser skills get core --full` 런타임 참조(node_modules 하드카피 금지)
9. **요청한 스킬 방식을 임의로 바꾸지 않는다** — `/kai-browser-mcp`인데 MCP 도구가 없다고 Bash node로 몰래 폴백 금지(멈추고 알림). 폴백이 "왜 다른 걸로 도냐"의 원흉
10. **node 24 통일** — agent-browser가 node>=24 요구 → 기본 node 24. playwright MCP·lib도 24 글로벌. nvm 전환 시 경로 갱신(메모리 `project-playwright-mcp-setup` 참조)

설치: `bash {repo}/kai-browser/install.sh` → `~/.claude/skills/kai-browser-{agent,mcp,node}/SKILL.md` 링크.
전제: 글로벌 Playwright MCP(user scope) + 글로벌 `playwright` 라이브러리. 설정 경위는 dev 메모리 `project-playwright-mcp-setup`.

---

## 작업 시 준수 규칙

### 1. 스킬 수정 시

- **모든 스킬은 markdown 지시문**이다. 코드가 아니다.
- 새로운 안전 규칙을 추가할 때는 **이미 정의된 task-manager 16개 핵심 설계 원칙과 충돌하지 않는지** 확인.
- task-add/kai-task-run/kai-task-clear 간 **일관성 유지** (예: 영향 파일 포맷, 타임스탬프 형식, 락 파일 경로).
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
   ls -la ~/.claude/skills/kai-task-add ~/.claude/skills/kai-task-run ~/.claude/skills/kai-task-clear ~/.claude/agents/advisor.md
   ```
2. 새 Claude Code 세션을 열어 스킬이 정상 로드되는지 확인.
3. 실제 프로젝트(예: dev2)에서 `/kai-task-add` 시험 호출.

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
ls -la ~/.claude/skills/kai-task-add ~/.claude/skills/kai-task-run ~/.claude/skills/kai-task-clear ~/.claude/agents/advisor.md

# 어떤 프로젝트에서 시험
cd /Volumes/KAIFACUN/Projects/{project}
# 이후 Claude Code 세션에서 /kai-task-add, /kai-task-run, /kai-task-clear 시험

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
