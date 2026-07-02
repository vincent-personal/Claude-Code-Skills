---
name: kai-meeting-to-biz
description: |
  사업 아이디어 미팅 녹취록(들)을 5단계 다부서 페르소나 파이프라인으로 분해해
  "아이디어 정리 + 경쟁 분석 + SWOT + 비즈니스 시작 문서"를 빠짐없이 산출.
  각 단계는 fresh-context Opus role agent(전용 페르소나)가 작성하여 컨텍스트 오염 방지.
  트리거: /kai-meeting-to-biz <폴더> [--format=multi|single|hybrid] [--docs=lean,finance,gtm,pitch,prd] [--research|--no-research] [--auto] [--stage=N] [--from=N] [--include=...] [--exclude=...] [--lang=en]
  플래그 미지정 시 실행 초입에 산출형태·비즈문서·리서치 여부를 대화형으로 질문.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - WebSearch
  - WebFetch
  - TaskCreate
  - TaskUpdate
  - TaskList
---

# kai-meeting-to-biz — 사업 기획 다부서 파이프라인 마스터 오케스트레이터

## 🎯 무엇을 하는 스킬인가

사업 아이디어 회의 녹취록(잡담·자랑·맞장구 섞인 raw 전사)을 **5개의 fresh-context Opus 역할 에이전트**가 순차로 분해하여, 다음 4종 결과를 빠짐없이 빚는다:

1. **아이디어 정리** — 한 줄 요약 → Pain Point → AI 전제 → 제품 구조 → 기술 아키텍처 → 수익 모델 → GTM → 확장 비전 → 데이터 해자 → 검증 패턴
2. **경쟁 분석** — (옵션) 실제 웹 리서치를 주입한 경쟁 지형 + 빈 교집합(wedge) 식별
3. **SWOT** — 강점·약점·기회·위협 + 전략 결론(한 장 종합)
4. **비즈니스 시작 문서** — (선택) 린 캔버스 / 재무 추정 / GTM 실행 플랜 / 피치덱 / PRD

> 본 스킬의 **기준 산출 예시**: `국제학교 학생·학부모 AI 에이전트 비즈니스 — 아이디어 정리 + 경쟁 분석 + SWOT.md`(PART 1~13). 모든 role agent 템플릿은 이 예시의 13개 PART를 **1:1 역산**한 섹션 체크리스트다. "빠짐없이"가 1순위 요구다.

각 에이전트는:
- **자신만의 페르소나**로 작업 (큐레이터·전략가·시장분석가·SWOT 분석가·사업문서 작성자)
- **직전 단계까지의 산출 파일**만 입력으로 봄 (대화 history 오염 X)
- **`_TRACE.md`** 에서 사용자 게이트 피드백·이전 자동 결정을 인지
- 모호한 결정은 **`biz-advisor`** 메타 에이전트에 위임

---

## 🗂️ 산출물 구조

산출 위치는 항상 `<input-folder>/biz-output/`. **role agent는 언제나 각자의 Stage 파일을 개별로 쓴다** (한 파일 공유 write 금지 — fresh-context 충돌 방지). 형식 옵션(`--format`)은 마스터가 **사후 조립**하는 별도 단계다 (§ Step 5).

```
<input-folder>/biz-output/
├── README.md                       ← 인덱스 + 한 줄 요약 + 핵심 블로커 (마스터 직접 작성)
├── _TRACE.md                       ← 게이트 피드백 + 자동 결정 누적 (모든 role agent 필독)
├── Stage00_녹취록정제.md           ← m2b-curator
├── Stage01_아이디어정리.md         ← m2b-strategist (PART 1~10)
├── Stage02_경쟁분석.md             ← m2b-analyst  (PART 11, 리서치 옵션)
├── Stage03_SWOT.md                 ← m2b-swot     (PART 12~13)
├── biz-docs/                       ← m2b-builder  (선택된 문서만)
│   ├── 01_LeanCanvas.md
│   ├── 02_FinancialModel.md
│   ├── 03_GTM-Plan.md
│   ├── 04_PitchDeck.md
│   └── 05_PRD.md (또는 kai-meeting-to-spec 핸드오프 안내)
└── (--format=single 시) 비즈니스기획_통합.md   ← 마스터가 PART 순서로 병합
```

---

## 🎛️ 모드 & 플래그

| 구분 | 플래그 | 동작 |
|------|--------|------|
| **산출 형태** | `--format=multi` (기본) | 단계별 개별 파일 + `biz-docs/` 폴더 |
| | `--format=single` | 마스터가 전 단계를 PART 순서로 1개 .md 병합 |
| | `--format=hybrid` | 통합 요약 1장 + `biz-docs/` 부속 파일 |
| **비즈 문서** | `--docs=lean,finance,gtm,pitch,prd` | Stage 4에서 만들 문서 화이트리스트 (생략 시 Stage 4 건너뜀 또는 질문) |
| **리서치** | `--research` / `--no-research` | Stage 2 웹 리서치 ON/OFF (기본 권장 = ON) |
| **자동** | `--auto` | 게이트 생략, 모호한 결정은 biz-advisor 위임 |
| **단일 단계** | `--stage=N` (0~4) | 해당 단계만 실행. 전제 조건 검증 |
| **재개** | `--from=N` | N단계부터 끝까지 실행 |
| **언어** | `--lang=en` | 산출물 영어 (대화는 한국어 유지) |
| **녹취록 필터** | `--include=01,02` / `--exclude=03` | 입력 파일 화이트/블랙리스트 |

> **세 가지 핵심 옵션(`--format`·`--docs`·`--research`)이 플래그로 주어지지 않으면**, 실행 초입(Step 1.5)에 `AskUserQuestion`으로 **자세한 설명과 함께** 반드시 물어본다. (사용자 지시: "옵션이 불가능하면 처음에 물어봐 줬으면 좋겠어.")

---

## 🤖 5개 Role Agent 일람

| Stage | Role Agent | 페르소나 | 산출 | 출처(Provenance) |
|-------|-----------|---------|------|------------------|
| 0 | `m2b-curator` | 전사·담화분석 큐레이터 | `Stage00_녹취록정제.md` | 녹취록 only |
| 1 | `m2b-strategist` | 시니어 사업 전략가 | `Stage01_아이디어정리.md` (PART 1~10) | 녹취록 추출 only (환각 금지) |
| 2 | `m2b-analyst` | 시장·경쟁 분석가 | `Stage02_경쟁분석.md` (PART 11) | **외부 웹 리서치 주입** (URL 표기, 미확인 🔶) |
| 3 | `m2b-swot` | SWOT 전략 분석가 | `Stage03_SWOT.md` (PART 12~13) | Stage1+2 종합 (사분면 출처 라벨) |
| 4 | `m2b-builder` | 사업 문서 작성자 | `biz-docs/*.md` | **신규 합성** (숫자는 녹취록 값에 앵커, 추정은 🔶) |

각 role agent는 **Opus**로 fresh context. 메타 자문 필요 시 `biz-advisor` 호출.

### ⚠️ 단계별 출처 규율 (provenance — 환각 방지의 핵심)

- **Stage 1 (전략)**: 추출 전용. 녹취록에 있는 것만, 라인 인용 동반. 외부 사실 작성 금지.
- **Stage 2 (경쟁분석)**: 외부 리서치를 *의도적으로 주입*하는 유일한 단계. 모든 경쟁사·시장 수치에 출처 URL, 미확인은 🔶. 리서치 OFF면 "녹취록에 언급된 경쟁사만" 처리하고 **결과가 얇아짐을 산출물에 명시**.
- **Stage 3 (SWOT)**: Threats/Opportunities는 대부분 Stage 2 외부 산물 → 각 항목에 `[녹취록]` / `[리서치]` 출처 라벨. 리서치 OFF면 외부 사분면이 빈다고 경고.
- **Stage 4 (비즈 문서)**: 예시에 없는 신규 생성물. 숫자는 녹취록 실제 값(예: $30→$100→$1,000 구독, 1,000명=연 $100만, 학원 커미션 20%, 검증 15→10명)에 앵커. 나머지 추정은 전부 가정(🔶)으로 라벨.

---

## ⚡ 실행 절차

### Step 0 — 인자 파싱

```
<input-folder> 필수
--format=multi|single|hybrid   (없으면 질문)
--docs=lean,finance,gtm,pitch,prd  (없으면 질문)
--research | --no-research     (없으면 질문)
--auto                         (boolean)
--stage=N (0~4) | --from=N (0~4)
--include=01,02 / --exclude=03
--lang=en
```

인자 누락(폴더 자체가 없음):
```
사용법:
  /kai-meeting-to-biz <폴더> [--format=...] [--docs=...] [--research] [--auto] [--stage=N] [--from=N]
```

### Step 1 — 녹취록 탐색 + 환경 준비

1. `ls <폴더>/*.{txt,md,vtt,srt}` 탐색 + include/exclude 적용
2. 파일 0개 → "녹취록 없음. .txt/.md/.vtt/.srt 필요" 종료
3. 사용 파일 보고:
   ```
   📂 입력 폴더: /path/to/folder
   📄 사용 녹취록: 01.txt (2416줄), 02.txt (556줄)
   📍 산출 경로: /path/to/folder/biz-output/
   🎛 모드: 대화형 / 자동 / 단일Stage=N / Resume from N
   ```
4. `mkdir -p <폴더>/biz-output/biz-docs/`
5. `_TRACE.md` 초기화 (없으면 생성, 있으면 그대로):
   ```markdown
   # _TRACE.md — 게이트 피드백 + 자동 결정 누적

   > 모든 role agent는 작업 전 본 파일을 읽어야 함.

   ## 실행 이력
   - YYYY-MM-DD HH:MM — Pipeline started (mode: ..., format: ..., research: ...)

   ## 사용자 게이트 피드백
   (없음)

   ## 자동 결정 (biz-advisor escalations)
   (없음)

   ## 실행 옵션 (모든 stage 공유)
   - format: multi|single|hybrid
   - docs: [lean, finance, ...] (또는 없음)
   - research: on|off
   - lang: ko|en
   ```

### Step 1.5 — 대화형 옵션 질문 (플래그 미지정 항목만)

`--auto`가 아니면서 아래 옵션이 **플래그로 주어지지 않은 경우에만** `AskUserQuestion`으로 묻는다. 이미 플래그로 받은 항목은 묻지 않는다. `--auto`면 기본값(format=multi, research=on, docs=lean+gtm) 적용 + biz-advisor 위임.

질문 1 — **산출 형태** (`--format` 없을 때):
> "산출물을 어떤 형태로 받으시겠습니까?"
> - 단계별 다중 파일 (권장): `biz-output/`에 Stage별 .md + `biz-docs/` 폴더. 각 단계가 깊이 있게.
> - 단일 통합 문서: 기준 예시처럼 PART 1~N 하나의 .md로 병합.
> - 통합 1장 + 부속 문서: 핵심 요약 1장 + 실무 문서는 별도 파일.

질문 2 — **비즈 문서 종류** (`--docs` 없을 때, 복수 선택):
> "비즈니스 시작 문서로 무엇을 산출하시겠습니까?"
> - 린 캔버스 / 비즈니스 모델: 문제·해결·가치제안·고객·채널·수익·비용·해자를 1장 캔버스로.
> - 재무 추정 / 유닛 이코노믹스: 구독가·CAC·LTV·손익분기, 규모별 연매출 시나리오.
> - GTM 실행 플랜: 인바이트온리·도그푸딩·검증목표를 주차별 실행 체크리스트로.
> - 투자 피치덱 / PRD: 피치덱 골자, 또는 PRD(후자는 kai-meeting-to-spec 핸드오프 권장).
> (아무것도 선택 안 하면 Stage 4 건너뜀.)

질문 3 — **리서치 여부** (`--research`/`--no-research` 없을 때):
> "경쟁 분석 단계에서 실제 웹 리서치를 자동 수행하시겠습니까?"
> - 자동 웹 리서치 수행 (권장): 실제 경쟁사·시장 규모를 조사해 근거 기반 경쟁 지형 + SWOT 외부 사분면을 채움.
> - 끄기: 녹취록에 언급된 경쟁사만 정리. ⚠️ **경쟁 분석과 SWOT의 외부 위협·기회 사분면이 비게 됩니다** (기준 예시의 PART 11·12 외부 항목은 대부분 리서치 산물).

> 응답을 임시로 보유했다가 다음 Step 1.6에서 일괄 확정·기록한다.

### Step 1.6 — 실행 옵션 확정 및 `_TRACE.md` 기록 (⚠️ 모드 무관, 필수 배선)

**이 단계를 건너뛰면 auto 모드에서 다운스트림 에이전트가 `research: on|off` 같은 미해결 문자열을 읽어 리서치 분기가 깨진다.** 따라서 대화형/자동/단일단계 **모든 경로에서** 반드시 수행한다.

세 옵션을 다음 우선순위로 **구체값으로 해결(resolve)**한다:
```
format   = 플래그(--format) → Step 1.5 답변 → (auto/미응답) 기본값 multi
research = 플래그(--research/--no-research) → Step 1.5 답변 → (auto/미응답) 기본값 on
docs     = 플래그(--docs) → Step 1.5 답변 → (auto) 기본값 [lean, gtm] / (미응답) 빈 목록=Stage4 skip
lang     = 플래그(--lang) → 기본값 ko
```

해결된 구체값으로 `_TRACE.md`의 "실행 옵션" placeholder 줄을 **Edit로 덮어쓴다** (예: `- research: on`, `- format: hybrid`, `- docs: [lean, gtm]`, `- lang: ko`). 미해결 토큰(`on|off`, `multi|single|hybrid`, `[...]`)이 한 줄도 남으면 안 된다.

> **이중화**: Step 3-A에서 각 role agent를 호출할 때, 프롬프트에도 해결된 옵션값을 명시적으로 실어 보낸다 (아래 3-A 참조). `_TRACE.md` 파싱 단일 의존을 없애 견고하게.

### Step 2 — 실행할 단계 결정

```
--stage=N 이면 [N] 만
--from=N 이면 [N, N+1, ..., 4]
둘 다 없으면 [0, 1, 2, 3, 4]  (Stage 4는 --docs/질문 결과가 비면 자동 skip)
```

`TaskCreate`로 실행 대상 task 생성. 전제 조건 검증:
- Stage 1 → Stage 0 산출 존재
- Stage 2 → Stage 0+1 존재
- Stage 3 → Stage 0+1+2 존재
- Stage 4 → Stage 1(필수)+2+3 존재
- 없으면: "Stage N-1 산출 필요. `--from=0` 또는 `--stage=N-1` 먼저"

### Step 3 — 각 단계 실행 (반복)

각 Stage N에 대해:

#### 3-A. 해당 Role Agent 호출

```
Agent(
  description: "Stage N — {role} 페르소나로 산출",
  subagent_type: "m2b-{role}",
  prompt: """
  Input folder: <input-folder>

  Read these inputs in order:
  - <input-folder>/biz-output/_TRACE.md  (필수: 게이트 피드백·실행 옵션·과거 결정)
  - <input-folder>/biz-output/Stage00_녹취록정제.md  (Stage 1 이상)
  - ... (해당 stage 이전 산출물 모두)
  - <input-folder>/*.{txt,md,vtt,srt}  (필요 시 원본 재참조)

  Mode: {interactive | auto}
  실행 옵션 (Step 1.6에서 해결된 구체값 — _TRACE.md와 동일, 이중화):
    - research: {on|off 중 해결된 값}
    - format: {multi|single|hybrid 중 해결된 값}
    - docs: {[lean, gtm, ...] 또는 빈 목록}
    - lang: {ko|en}
  (불일치 시 _TRACE.md "실행 옵션" 섹션을 정본으로 본다.)

  Produce: <input-folder>/biz-output/StageNN_...md
  (Stage 4는 biz-docs/ 내 선택된 문서들)

  Auto mode rules:
  - biz-advisor 호출 결정은 _TRACE.md에 append
  - 게이트 출력 생략, 즉시 산출 보고

  Interactive mode rules:
  - 산출 후 요약 + 핵심 결정 사항만 보고 (게이트는 마스터가 처리)

  Return: 산출 파일 경로 + 핵심 요약 (5~10줄)
  """
)
```

- **Stage 2 호출 시**: `_TRACE.md`의 research=on이면 m2b-analyst가 WebSearch/WebFetch로 직접 리서치. (마스터는 도구를 대신 호출하지 않음 — fresh context 유지.)

#### 3-B. TaskUpdate completed

#### 3-C. (대화형만) 게이트 출력 + 사용자 입력 대기

```
✅ Stage N 완료
   산출: <input-folder>/biz-output/StageNN_...md
   {role agent가 반환한 요약}

분부를 내려주시옵소서:
  1) "다음 단계 진행"
  2) "수정/보완" (구체 항목 → _TRACE.md에 기록 후 재호출)
  3) "여기서 멈춤"
  4) "지금부터 자동" → 이후 전부 auto
```

사용자 응답이 수정 지시이면 `_TRACE.md` "사용자 게이트 피드백"에 append 후 Step 3-A 재실행:
```
## GATE-S{N}-{seq}
- 일시: YYYY-MM-DD HH:MM
- 단계: Stage N
- 사용자 피드백: "{원문}"
- 처리: 해당 Stage N role agent 재호출 (_TRACE.md 변경 반영)
```

#### 3-D. (자동) 다음 단계로 즉시 진입

### Step 4 — README.md 생성 (전 단계 완료 후, 마스터 직접 작성)

role agent 호출 없이 마스터가 직접:
```markdown
# 사업 기획 파이프라인 — 최종 인덱스

> 입력: <파일 목록>
> 생성일: <오늘>
> 산출: 아이디어 정리 + 경쟁 분석 + SWOT + 비즈 문서
> 옵션: format=... / research=... / docs=...

## 🎯 한 줄 요약 (Stage 1 PART 1에서 추출)

## 🚨 즉시 결정이 필요한 블로커 Top 3

## 📂 산출물 인덱스
- Stage 파일 표 (라인 수·산출 role agent)
- biz-docs/ 문서 목록

## 🚦 권고 진행 (다음 액션)

## ⚠️ 리서치 OFF 시 보완 필요 영역 (해당 시)

## 🔄 변경 이력
```

### Step 5 — 형식 사후 조립 (`--format` 분기, 마스터 직접 수행)

**누가/언제/무엇으로 조립하는가**: role agent가 아니라 **마스터**가, 전 Stage 산출이 끝난 뒤, 이미 쓰여진 Stage 파일을 읽어 조립한다.

- `--format=multi` (기본): 추가 조립 없음. Stage 파일 + `biz-docs/` 그대로.
- `--format=single`: Stage00~03 + biz-docs 파일들을 **PART 순서로 읽어** 한 파일 `비즈니스기획_통합.md`로 병합 (표지 + 목차 + 각 섹션). 개별 Stage 파일은 보존.
- `--format=hybrid`: 마스터가 통합 요약 1장(`비즈니스기획_요약.md`: 한 줄 요약 + Pain + wedge + SWOT 한 장 + 추천 액션)을 작성하고, 상세는 `biz-docs/` 및 Stage 파일로 링크.

### Step 6 — 최종 보고

```
✅ 파이프라인 완료
   실행 단계: {0,1,2,3,4} (또는 단일/resume)
   산출 위치: <input-folder>/biz-output/
   형식: multi|single|hybrid
   리서치: on|off
   비즈 문서: [lean, gtm, ...]
   파일 수: N개 / 라인 수: N줄
   자동 결정: N건 / 사용자 게이트: N건 (_TRACE.md 참조)

다음 단계:
  - 비즈 문서 검토 (블로커 Top 3)
  - (PRD 선택 시) /kai-meeting-to-spec <폴더> 로 구현 스펙 핸드오프
  - (리서치 off였다면) --stage=2 --research 로 경쟁 지형 보강 권장

💰 비용 알림: Opus role agent N회 + (리서치 시 WebSearch 다수) + biz-advisor escalation.
   1회 파이프라인당 추정 $A~B (정확한 값은 Anthropic 콘솔에서 확인).
```

---

## 🤖 자동 모드 상세

### 사용자 위임 발화 감지 (대화형 중 자동 전환)
"쭉 다 진행해", "끝까지 다 해", "알아서 진행해", "니가 판단해", "전부 advisor 위임" 등.

### 자동 모드 안전망 (모든 role agent 공통)
- **금전·법적·외부 발송 결정은 자동화 금지** → `🔶 확인 필수`로만 표시
- 모든 biz-advisor 결정은 `_TRACE.md`에 누적 (감사 가능)
- 리서치 결과의 시장 수치·경쟁사 진위가 불확실하면 🔶 표기, 단정 금지

---

## 📋 _TRACE.md 운용

append-only. 형식:
```markdown
## 사용자 게이트 피드백
### GATE-S1-001 (2026-MM-DD HH:MM)
- 단계: Stage 1
- 사용자 피드백 원문: "수익 모델에 B2B 학교 판매도 PART로 빼줘"
- 처리: m2b-strategist 재호출, PART 6에 B2B 항목 강조

## 자동 결정 (biz-advisor escalations)
### D-S2-001
- 단계: Stage 2
- 질문 (m2b-analyst → biz-advisor): "경쟁사 X가 실제로 음성 브리핑을 하는지 출처 불명확"
- biz-advisor 답: 🔶 미확인 표시 + 출처 없으면 단정 금지
- 반영: Stage02 § 11-B X-row
```

### 모든 role agent의 의무
- 작업 전 `_TRACE.md` 반드시 읽기 (해당 Stage GATE-* + 관련 D-* + 실행 옵션)
- 자동 결정 시 append
- 사용자 피드백을 발견하면 **자신의 1차 판단보다 우선** 적용

---

## 🚫 금지 사항

- 사용자 작업 폴더 외부 수정 금지 — 산출은 항상 `<input-folder>/biz-output/` 안
- 녹취록 원본 변경 금지
- `--stage=N` 실행 시 다른 stage 산출물 수정 금지
- `_TRACE.md` 임의 삭제 금지 (append-only)
- role agent들이 **같은 파일을 동시 write 금지** — 각자 자기 Stage 파일만. 형식 병합은 마스터 전담.
- Stage 1·3·0은 외부 사실 작성 금지 (리서치는 오직 Stage 2)

---

## 🧪 실패 모드

| 상황 | 대응 |
|------|------|
| 녹취록 1MB 초과 | role agent가 청크로 Read 여러 번 |
| 외국어 녹취록 | role agent가 한국어 요약 병기 |
| 빈 파일 | 종료 |
| 중간 취소 | 완료 Stage 보존 → `--from=N`으로 이어 진행 |
| 리서치 결과 빈약 | 🔶로 표시, 단정 금지, README에 "보강 필요" 명시 |
| role agent 응답 모호 | 한 번 더 호출("단일 답만"). 두 번째도 모호하면 `🔶 사용자 확인 필수` |
| 파일 쓰기 실패 | 즉시 보고 + 종료. 부분 산출 보존 |

---

## 💡 사용 예

### 기본 (대화형 — 형식·문서·리서치를 질문)
```
/kai-meeting-to-biz ~/Downloads/idea-meeting
```

### 자동 (전체, 기본 옵션)
```
/kai-meeting-to-biz ~/Downloads/idea-meeting --auto
```

### 전체 옵션 명시 (질문 없이)
```
/kai-meeting-to-biz ~/Downloads/idea-meeting --format=hybrid --docs=lean,finance,gtm,pitch --research --auto
```

### 경쟁 분석만 리서치 켜서 재실행
```
/kai-meeting-to-biz ~/Downloads/idea-meeting --stage=2 --research --auto
```

### 비즈 문서만 (Stage 1~3 이미 있을 때)
```
/kai-meeting-to-biz ~/Downloads/idea-meeting --stage=4 --docs=lean,gtm --auto
```

---

## 📖 기준 산출 예시

- `docs/국제학교 학생·학부모 AI 에이전트 비즈니스 — 아이디어 정리 + 경쟁 분석 + SWOT.md` (PART 1~13)
  — 본 스킬의 모든 템플릿이 역산된 원본. 새 녹취록이 이 수준 이상으로 재현되어야 한다.
