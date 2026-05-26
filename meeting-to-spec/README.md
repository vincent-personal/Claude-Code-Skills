# kai-meeting-to-spec — 다부서 페르소나 파이프라인

고객 미팅 녹취록(들)을 **7개의 fresh-context Opus role agent**가 순차로 분해하여, 데모/MVP 직전까지 사용 가능한 사양 문서 세트를 생성하는 전역 Claude Code 스킬.

기존 단일-에이전트 버전(모자만 바꿔쓰던 방식)과 달리, **각 단계마다 진짜 다른 역할의 사람이 fresh context로 작업하는** 것처럼 동작. 페르소나 간 컨텍스트 오염을 방지.

---

## 🚀 설치

```bash
bash /Volumes/KAIFACUN/Projects/Skills/meeting-to-spec/install.sh
```

설치 스크립트는 다음을 수행:
- `~/.claude/skills/kai-meeting-to-spec/SKILL.md` 심볼릭 링크 (마스터 오케스트레이터)
- `~/.claude/agents/spec-advisor.md` 심볼릭 링크 (메타 자문 Opus)
- `~/.claude/agents/m2s-{curator,ba,ops,marketing,tech,ceo,design}.md` 심볼릭 링크 (7 role agent)

---

## 📖 사용법

### 가장 단순 (대화형 — 단계마다 게이트)

```
/kai-meeting-to-spec ~/Downloads/customer-meeting-2026-Q2
```

7개 role agent가 순차로 호출되며, 각 단계 종료 시 산출 요약 + 다음 분부 대기.

### 자동 모드 (게이트 생략, advisor 위임)

```
/kai-meeting-to-spec ~/Downloads/meeting --auto
```

모든 단계 자동 진행. 도중 모호한 결정은 `spec-advisor` Opus에게 위임. 단 **금전·법적·외부 발송**은 자동화하지 않고 `🔶 BO 확인 필수`로 표시만.

### 단일 단계 / 부분 실행

```
/kai-meeting-to-spec ~/Downloads/meeting --stage=3        # Stage 3만 (전제 Stage 0~2 존재 확인)
/kai-meeting-to-spec ~/Downloads/meeting --from=4         # Stage 4부터 끝까지
/kai-meeting-to-spec ~/Downloads/meeting --stage=1 --auto # Stage 1만 자동
```

### 옵션 플래그

| 플래그 | 동작 |
|--------|------|
| `--auto` | 자동 (spec-advisor 위임) |
| `--stage=N` | 단일 단계 (0~6) |
| `--from=N` | N단계부터 끝까지 |
| `--include=01,02` | 특정 녹취록만 |
| `--exclude=03` | 특정 녹취록 제외 |
| `--lang=en` | 산출물 영어 (대화는 한국어) |
| `--stack="..."` | Stage 4 스택 명시 (Tech agent에 전달) |
| `--html` | 통합 HTML 추가 산출 |

---

## 🤖 7개 Role Agent (각 단계 = fresh context Opus 페르소나)

| Stage | Role Agent | 페르소나 | 산출 파일 |
|-------|-----------|---------|----------|
| 0 | `m2s-curator` | 전사·담화분석 큐레이터 | `Stage00_녹취록정제.md` |
| 1 | `m2s-ba` | 시니어 Business Analyst | `Stage01_기획팀_기능분해.md` |
| 2 | `m2s-ops` | Operations Manager | `Stage02_운영팀_워크플로우.md` |
| 3 | `m2s-marketing` | Market & Marketing Strategist | `Stage03_시장마케팅팀_가치명제.md` |
| 4 | `m2s-tech` | Tech Lead + Solution Architect | `Stage04_개발팀_기술설계.md` |
| 5 | `m2s-ceo` | CEO/Founder | `Stage05_사장승인_MVP로드맵.md` |
| 6 | `m2s-design` | Product Design Lead | `apps/...` (DesignBrief + FeatureSpec) |
| 🤝 | `spec-advisor` | **메타** 자문 (모호 시 7명의 role agent가 호출) | — |

### 왜 fresh context인가
단일 에이전트가 7개 모자를 바꿔쓰면 이전 단계의 컨텍스트·편향·말투가 다음 단계에 전이됨. 각 role agent를 **별도의 Opus 호출**로 분리하면, 각 단계가 진짜로 다른 사람이 본 양 산출됨.

### 컨텍스트 분리의 안전망 — `_TRACE.md`
Fresh context는 amnesia 위험. `<input-folder>/output/_TRACE.md`에 사용자 게이트 피드백·과거 advisor 결정을 누적. 모든 role agent는 **작업 전 본 파일 필독**.

---

## 📂 산출물 구조

```
<input-folder>/output/
├── README.md                           ← 인덱스 + 블로커 Top 3
├── _TRACE.md                           ← 게이트 피드백 + 자동 결정 누적
├── Stage00_녹취록정제.md               ← m2s-curator
├── Stage01_기획팀_기능분해.md          ← m2s-ba
├── Stage02_운영팀_워크플로우.md        ← m2s-ops
├── Stage03_시장마케팅팀_가치명제.md    ← m2s-marketing
├── Stage04_개발팀_기술설계.md          ← m2s-tech
├── Stage05_사장승인_MVP로드맵.md       ← m2s-ceo
└── apps/                               ← m2s-design
    ├── AppDecomposition.md
    └── {NN_AppName}/
        ├── DesignBrief.md              ← claude.ai/design 디자이너용
        └── FeatureSpec.md              ← 본인 구현 시 누락 화면 점검용
```

---

## 🎛️ 핵심 설계 원칙

1. **Fresh context per stage** — 각 role agent는 자신의 단계 입력만, 다른 단계 결과/대화는 안 봄
2. **_TRACE.md 필독** — 게이트 피드백·과거 결정 누적, fresh-context의 amnesia 방지
3. **단일 spec-advisor** — 7개로 쪼개지 않음. role agent가 페르소나, advisor는 generic meta
4. **모든 인용에 원문 라인 번호** — 환각 방지, 후속 검증 가능
5. **🟢/🟡/🔴/🔶 4종 태깅** — 명시 / 암묵 / 누락추가 / 확인필요
6. **외부 데이터 환각 금지** — 시장 규모·경쟁사 등은 🔶로만
7. **자동 모드 안전망** — 금전·법적·외부 발송은 자동화 금지
8. **단일/부분 실행 지원** — `--stage=N` / `--from=N`로 재실행 자유

---

## 💰 비용

7회 Opus role agent 호출 + advisor escalation. 녹취록 크기에 따라:
- 작은 녹취록 (1~2개, 1MB 이하): 약 $5
- 중간 (3~5개): 약 $10
- 큰 (1MB+, 다수): 약 $15

정확한 비용은 Anthropic 콘솔에서 확인.

---

## 📝 예시 산물

본 스킬 이전 버전(단일 에이전트)으로 만든 산물:
- `/Users/kaifacun/Downloads/transcripts_v3/output/` (1,918+ 줄, 17 파일)

---

## 🔄 업데이트

이 repo 수정 시 심볼릭 링크로 즉시 반영 (재설치 불필요).

```bash
cd /Volumes/KAIFACUN/Projects/Skills
git pull
```

---

## 🆚 v1 (단일 에이전트) vs v2 (다부서 fresh context)

| 항목 | v1 | v2 (현재) |
|------|----|----|
| 단계별 페르소나 | 동일 에이전트가 모자만 변경 | 7개 fresh-context Opus role agent |
| 컨텍스트 오염 | 이전 단계 말투·편향 전이 | 분리됨 |
| 단일/부분 실행 | 불가 (전체만) | `--stage=N` / `--from=N` |
| Trace 기록 | `_DECISIONS.md` (자동만) | `_TRACE.md` (게이트+자동 통합) |
| 비용 | 1회 Opus 세션 | 7회 Opus 호출 |
| 일관성 | 높음 (단일 두뇌) | 진짜 다른 관점 |

용도에 따라 선택. v2는 진짜 다부서 인사이트가 필요할 때.
