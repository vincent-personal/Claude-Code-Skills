---
name: kai-meeting-to-spec
description: |
  고객 미팅 녹취록(들)을 7단계 다부서 페르소나 파이프라인으로 분해.
  각 단계는 fresh-context Opus role agent(전용 페르소나)가 작성하여 컨텍스트 오염 방지.
  트리거: /kai-meeting-to-spec <폴더> [--auto] [--stage=N] [--from=N] [--include=...] [--exclude=...]
  단계마다 게이트 확인 / --auto는 spec-advisor 위임 / --stage·--from은 단일/부분 실행.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
---

# kai-meeting-to-spec — 다부서 파이프라인 마스터 오케스트레이터

## 🎯 무엇을 하는 스킬인가

화자 분리 안 된 raw 미팅 녹취록을 **7개의 fresh-context Opus 역할 에이전트**가 순차로 분해. 각 에이전트는:
- **자신만의 페르소나**로 작업 (BA·운영·마케팅·테크·CEO·디자인)
- **직전 단계까지의 산출 파일**만 입력으로 봄 (대화 history 오염 X)
- **`_TRACE.md`** 에서 사용자 게이트 피드백·이전 자동 결정을 인지
- 모호한 결정은 **`spec-advisor`** 메타 에이전트에 위임

---

## 🗂️ 산출물 구조

```
<input-folder>/output/
├── README.md                           ← 인덱스 + 블로커 Top 3
├── _TRACE.md                           ← 게이트 피드백 + 자동 결정 누적 (모든 role agent 필독)
├── Stage00_녹취록정제.md               ← m2s-curator
├── Stage01_기획팀_기능분해.md          ← m2s-ba
├── Stage02_운영팀_워크플로우.md        ← m2s-ops
├── Stage03_시장마케팅팀_가치명제.md    ← m2s-marketing
├── Stage04_개발팀_기술설계.md          ← m2s-tech
├── Stage05_사장승인_MVP로드맵.md       ← m2s-ceo
└── apps/                               ← m2s-design
    ├── AppDecomposition.md
    └── {NN_AppName}/
        ├── DesignBrief.md
        └── FeatureSpec.md
```

---

## 🎛️ 모드 & 플래그

| 모드 | 트리거 | 동작 |
|------|--------|------|
| **대화형 (기본)** | `/kai-meeting-to-spec <폴더>` | 단계마다 게이트 (사용자 확인) |
| **자동** | `+ --auto` | 게이트 생략, 모호한 결정은 spec-advisor 위임 |
| **단일 단계** | `+ --stage=N` (0~6) | 해당 단계만 실행. 전제 조건 검증 |
| **재개** | `+ --from=N` | N단계부터 끝까지 실행 |
| **혼합** | 대화 중 "쭉 진행해" 발화 | 그 시점부터 자동 |

---

## 🤖 7개 Role Agent 일람

| Stage | Role Agent | 페르소나 | 산출 파일 |
|-------|-----------|---------|----------|
| 0 | `m2s-curator` | 전사·담화분석 큐레이터 | `Stage00_녹취록정제.md` |
| 1 | `m2s-ba` | 시니어 Business Analyst | `Stage01_기획팀_기능분해.md` |
| 2 | `m2s-ops` | Operations Manager | `Stage02_운영팀_워크플로우.md` |
| 3 | `m2s-marketing` | Market & Marketing Strategist | `Stage03_시장마케팅팀_가치명제.md` |
| 4 | `m2s-tech` | Tech Lead + Solution Architect | `Stage04_개발팀_기술설계.md` |
| 5 | `m2s-ceo` | CEO/Founder | `Stage05_사장승인_MVP로드맵.md` |
| 6 | `m2s-design` | Product Design Lead | `apps/...` 다수 파일 |

각 role agent는 **Opus 4.7**로 fresh context. 메타 자문 필요 시 `spec-advisor` 호출.

---

## ⚡ 실행 절차

### Step 0 — 인자 파싱

```
인자 검증:
  <input-folder> 필수
  --auto (boolean)
  --stage=N (0~6, 단일 단계)
  --from=N (0~6, 재개)
  --include=01,02 (파일 화이트리스트)
  --exclude=03 (파일 블랙리스트)
  --lang=en (산출물 영어, 기본 한국어)
  --stack="..." (Stage 4 스택 명시)
  --html (전 단계 후 통합 HTML 생성)
```

인자 누락:
```
사용법:
  /kai-meeting-to-spec <폴더> [--auto] [--stage=N] [--from=N] [--include=...] [--exclude=...]
```

---

### Step 1 — 녹취록 탐색 + 환경 준비

1. `ls <폴더>/*.{txt,md,vtt,srt}` 탐색 + include/exclude 적용
2. 파일 0개 → "녹취록 없음. .txt/.md/.vtt/.srt 필요" 종료
3. 사용 파일 보고:
   ```
   📂 입력 폴더: /path/to/folder
   📄 사용 녹취록: 01.txt (517줄), 02.txt (734줄)
   📍 산출 경로: /path/to/folder/output/
   🎛 모드: 대화형 / 자동 / 단일Stage=N / Resume from N
   ```
4. **대화형**: AskUserQuestion으로 확인 / **자동**: 즉시 다음 단계
5. `mkdir -p <폴더>/output/apps/`
6. `_TRACE.md` 초기화 (없으면 생성, 있으면 그대로):
   ```markdown
   # _TRACE.md — 게이트 피드백 + 자동 결정 누적

   > 모든 role agent는 작업 전 본 파일을 읽어야 함.

   ## 실행 이력
   - YYYY-MM-DD HH:MM — Pipeline started (mode: ...)

   ## 사용자 게이트 피드백
   (없음)

   ## 자동 결정 (advisor escalations)
   (없음)
   ```

---

### Step 2 — 실행할 단계 결정

```
실행 단계 산출:
  --stage=N 이면 [N] 만
  --from=N 이면 [N, N+1, ..., 6]
  둘 다 없으면 [0, 1, 2, 3, 4, 5, 6]
```

`TaskCreate`로 실행 대상만 task 생성 (이미 생성된 task가 있으면 재사용).

전제 조건 검증:
- Stage 1 실행 시 Stage 0 산출 파일 존재 확인
- Stage 2 실행 시 Stage 0+1 존재
- ... (각 단계는 직전 단계 필수)
- 없으면: "Stage N-1 산출 필요. /kai-meeting-to-spec --from=0 또는 --stage=N-1 먼저"

---

### Step 3 — 각 단계 실행 (반복)

각 Stage N에 대해:

#### 3-A. 해당 Role Agent 호출

```
Agent(
  description: "Stage N — {role} 페르소나로 산출",
  subagent_type: "m2s-{role}",
  prompt: """
  Input folder: <input-folder>

  Read these inputs in order:
  - <input-folder>/output/_TRACE.md  (필수, 게이트 피드백·과거 결정)
  - <input-folder>/output/Stage00_녹취록정제.md  (Stage 1 이상)
  - ... (해당 stage 이전 산출물 모두)
  - <input-folder>/*.{txt,md,vtt,srt}  (필요 시 원본 재참조)

  Mode: {interactive | auto}

  Produce: <input-folder>/output/StageNN_...md
  (Stage 6은 apps/ 디렉터리 다수 파일)

  Auto mode rules:
  - spec-advisor 호출 결정은 _TRACE.md에 append
  - 게이트 출력 생략, 즉시 산출 보고

  Interactive mode rules:
  - 산출 후 요약 + 핵심 결정 사항만 보고
  - 사용자 게이트는 마스터 오케스트레이터가 처리

  Return: 산출 파일 경로 + 핵심 요약 (5~10줄)
  """
)
```

#### 3-B. TaskUpdate completed

#### 3-C. (대화형만) 게이트 출력 + 사용자 입력 대기

```
✅ Stage N 완료
   산출: <input-folder>/output/StageNN_...md
   {role agent가 반환한 요약}

분부를 내려주시옵소서:
  1) "다음 단계 진행"
  2) "수정/보완" (구체 항목 → _TRACE.md에 기록)
  3) "여기서 멈춤"
  4) "지금부터 자동" → 이후 모든 단계 auto 전환
```

사용자 응답이 수정 지시이면:
```
_TRACE.md의 "사용자 게이트 피드백" 섹션에 append:

## GATE-S{N}-{seq}
- 일시: YYYY-MM-DD HH:MM
- 단계: Stage N
- 사용자 피드백: "{원문}"
- 처리: 해당 Stage N role agent 재호출 (_TRACE.md 변경 반영)
```

그 후 Step 3-A 재실행 (재산출).

#### 3-D. (자동) 다음 단계로 즉시 진입

---

### Step 4 — README.md 생성 (전 단계 완료 후)

본 마스터 오케스트레이터가 직접 작성 (role agent 호출 X). 단 m2s-curator 등을 호출하지 않음 (메타 작업).

```markdown
# 다부서 분석 파이프라인 — 최종 인덱스

> 입력: <파일 목록>
> 생성일: <오늘>
> 산출: 7단계 다부서 산출물 + 앱 분해

## 🚨 BO에게 즉시 답을 받아야 (전체 일정 게이트)
- Stage 5-7에서 추출한 Top 3 블로킹 질문

## 📂 산출물 인덱스
- 7개 Stage 파일 표 (라인 수·산출 role agent 표시)
- apps/ 폴더 5개 앱 (또는 N개)

## 🎯 한 줄 요약 (Stage 3 또는 5에서 추출)

## 🚦 권고 진행

## 🎨 디자인·구현 다음 단계

## 📌 사용 방법 — 대상자별 우선 읽을 파일

## 🔄 변경 이력
```

---

### Step 5 — (옵션) HTML 통합본 생성

`--html` 플래그 시:
- pandoc 사용 (설치 가정)
- 7개 MD를 하나의 HTML로 합쳐 `output/_combined.html`
- 단순 표지 + 목차 + 각 stage 내용

---

### Step 6 — 최종 보고

```
✅ 파이프라인 완료
   실행 단계: {0, 1, 2, ...} (또는 단일 / resume)
   산출 위치: <input-folder>/output/
   파일 수: N개
   라인 수: N줄
   자동 결정: N건 (_TRACE.md 참조)
   사용자 게이트 피드백: N건

다음 단계:
  - BO 검토 미팅 (Top 3 블로킹 질문)
  - Phase 0 데모 코딩 시작
  - 디자이너 핸드오프 (apps/{앱}/DesignBrief.md)

API 비용 알림: 본 실행은 Opus role agent N회 호출 + advisor M회 escalation으로
  추정 $A~B 비용 발생 (정확한 값은 Anthropic 콘솔에서 확인 가능).
```

---

## 🤖 자동 모드 상세

### 사용자 위임 발화 감지 (대화형 중 자동 전환)
"쭉 다 진행해", "끝까지 다 해", "알아서 진행해", "니가 판단해", "전부 advisor 위임" 등.

### Role Agent → spec-advisor 호출 패턴
각 role agent의 SKILL 내부 가이드에 따름. 마스터는 개입 X.

### 자동 모드 안전망 (모든 role agent 공통)
- **금전·법적·외부 발송 결정은 자동화 금지** → `🔶 BO 확인 필수`로만 표시
- 모든 advisor 결정은 `_TRACE.md`에 누적 (감사 가능)

---

## 📋 게이트 피드백 trace (_TRACE.md) 운용

### 형식
```markdown
# _TRACE.md

## 실행 이력
- 2026-MM-DD HH:MM — Pipeline started (auto mode)
- 2026-MM-DD HH:MM — Stage 1 completed
- ...

## 사용자 게이트 피드백
### GATE-S1-001 (2026-MM-DD HH:MM)
- 단계: Stage 1
- 사용자 피드백 원문: "Buyer 직원은 별도 페르소나로 분리해줘"
- 처리: m2s-ba 재호출, P7 페르소나 명시 강조

### GATE-S2-001 (...)
- ...

## 자동 결정 (advisor escalations)
### D-S3-001
- 단계: Stage 3
- 질문 (m2s-marketing → spec-advisor): "경쟁사 정보 없는데 차별점 D8 명시 가능?"
- spec-advisor 답: 🔶 확인 필요 표시만, 추측 금지
- 반영: Stage03 § 3-3 D8 row
```

### 모든 role agent의 의무
- 작업 시작 전 `_TRACE.md` 반드시 읽기 (해당 Stage GATE-S{N}-* + 관련 D-S{N}-* 모두)
- 자동 결정 시 본 파일에 append
- 사용자 피드백을 발견하면 **자신의 1차 판단보다 우선** 적용

---

## 🚫 금지 사항

- 사용자 작업 폴더 외부 수정 금지 — 산출은 항상 `<input-folder>/output/` 안
- 녹취록 원본 변경 금지
- `--stage=N` 실행 시 다른 stage 산출물 수정 금지
- `_TRACE.md` 임의 삭제 금지 (append-only)
- role agent 컨텍스트를 마스터가 오염시키지 말 것 — 각 호출은 fresh context

---

## 🧪 실패 모드

| 상황 | 대응 |
|------|------|
| 녹취록 1MB 초과 | role agent가 청크로 Read 여러 번 |
| 외국어 녹취록 | role agent가 한국어 요약 병기 |
| 빈 파일 | 종료 |
| 중간 취소 | 완료된 Stage 산출 보존 → `--from=N`으로 이어 진행 |
| role agent 응답 모호 | 한 번 더 호출 (prompt에 "단일 답만 주세요" 추가). 두 번째도 모호하면 `🔶 사용자 확인 필수` |
| 파일 쓰기 실패 | 즉시 보고 + 종료. 부분 산출 보존 |
| spec-advisor 무응답 | 5초 timeout → fallback to "도메인 컨벤션 기본값" |

---

## 🎁 옵션 플래그 상세

- `--lang=en` — 산출물 영어 (대화는 한국어 유지)
- `--stack="React+NestJS+MongoDB"` — m2s-tech에 전달
- `--html` — pandoc으로 통합 HTML (옵션)
- `--include=...` / `--exclude=...` — 녹취록 파일 필터

---

## 💡 사용 예

### 기본 (대화형, 전체)
```
/kai-meeting-to-spec ~/Downloads/customer-meeting-2026-Q2
```

### 자동 (전체)
```
/kai-meeting-to-spec ~/Downloads/meeting --auto
```

### 단일 단계 (Stage 3만 재실행)
```
/kai-meeting-to-spec ~/Downloads/meeting --stage=3 --auto
```

### Stage 4부터 끝까지
```
/kai-meeting-to-spec ~/Downloads/meeting --from=4
```

### 자동 + 영어 + 통합 HTML
```
/kai-meeting-to-spec ~/Downloads/meeting --auto --lang=en --html
```

---

## 📖 본 스킬의 산물 예시

- `/Users/kaifacun/Downloads/transcripts_v3/output/` — 첫 사례 (단일 에이전트 버전)
- (앞으로) — 다부서 fresh-context 버전
