# kai-meeting-to-biz

사업 아이디어 **미팅 녹취록**을 넣으면, 5단계 fresh-context 페르소나 파이프라인이
**아이디어 정리 + 경쟁 분석 + SWOT + 비즈니스 시작 문서**를 빠짐없이 산출하는 Claude Code 스킬.

> 자매 스킬 `kai-meeting-to-spec`(구현 스펙 7단계)과 짝을 이룬다.
> - **kai-meeting-to-biz** = "이 사업이 될까?" (기획·검증)
> - **kai-meeting-to-spec** = "무엇을 어떻게 구현할까?" (기술 사양)

---

## 설치

```bash
bash /Volumes/KAIFACUN/Projects/Skills/meeting-to-biz/install.sh
```

- 마스터 스킬 `kai-meeting-to-biz` → `~/.claude/skills/`
- role agent 5개 + `biz-advisor` → `~/.claude/agents/`
- 모두 심볼릭 링크 (소스 수정 시 즉시 반영)

설치 후 Claude Code에서 `/kai` 만 쳐도 자동완성에 노출된다.

---

## 사용법

```
/kai-meeting-to-biz <녹취록폴더> [옵션]
```

옵션을 안 주면 실행 초입에 **세 가지를 대화형으로 질문**한다(자세한 설명 포함):
1. **산출 형태** — `--format=multi`(다중 파일+폴더, 기본) / `single`(1개 통합 .md) / `hybrid`(요약 1장 + 부속)
2. **비즈 문서** — `--docs=lean,finance,gtm,pitch,prd` (복수 선택, 생략 시 Stage 4 skip)
3. **리서치** — `--research`(권장) / `--no-research` (끄면 경쟁분석·SWOT 외부 사분면이 빔)

기타: `--auto`(질문·게이트 생략) · `--stage=N` · `--from=N` · `--include=` / `--exclude=` · `--lang=en`

### 예시
```
/kai-meeting-to-biz ~/Downloads/idea-meeting
/kai-meeting-to-biz ~/Downloads/idea-meeting --auto
/kai-meeting-to-biz ~/Downloads/idea-meeting --format=hybrid --docs=lean,finance,gtm,pitch --research --auto
/kai-meeting-to-biz ~/Downloads/idea-meeting --stage=2 --research   # 경쟁 분석만 재실행
```

---

## 5단계 파이프라인

| Stage | Role Agent | 산출 | 출처 |
|-------|-----------|------|------|
| 0 | `m2b-curator` | `Stage00_녹취록정제.md` | 녹취록 only (잡담 제거) |
| 1 | `m2b-strategist` | `Stage01_아이디어정리.md` (PART 1~10) | 녹취록 추출 only |
| 2 | `m2b-analyst` | `Stage02_경쟁분석.md` (PART 11) | **웹 리서치 주입** (URL·🔶) |
| 3 | `m2b-swot` | `Stage03_SWOT.md` (PART 12~13) | Stage1+2 종합 (출처 라벨) |
| 4 | `m2b-builder` | `biz-docs/*.md` | 신규 합성 (숫자 앵커·🔶 가정) |

각 단계는 직전 산출 파일만 보고 fresh context로 작동(컨텍스트 오염 방지). 모호한 결정은 `biz-advisor`에 위임하며 모든 결정은 `_TRACE.md`에 누적된다.

---

## 산출물 구조

```
<폴더>/biz-output/
├── README.md  _TRACE.md
├── Stage00_녹취록정제.md
├── Stage01_아이디어정리.md      # PART 1~10
├── Stage02_경쟁분석.md          # PART 11 (리서치 옵션)
├── Stage03_SWOT.md              # PART 12~13
├── biz-docs/                    # 선택된 문서만
│   ├── 01_LeanCanvas.md   02_FinancialModel.md
│   ├── 03_GTM-Plan.md     04_PitchDeck.md   05_PRD.md
└── (single 형식 시) 비즈니스기획_통합.md
```

---

## 설계 원칙

- **예시 = 완전성 스펙.** 모든 템플릿은 기준 예시(`국제학교…SWOT.md`)의 PART 1~13을 1:1 역산. "빠짐없이"가 1순위.
- **단계별 출처 규율.** Stage 1 추출 전용 / Stage 2 외부 주입(유일) / Stage 4 신규 생성(숫자는 앵커, 추정은 🔶).
- **리서치 OFF → SWOT 약화 경고.** 외부 사분면이 빈다는 사실을 산출물에 명시.
- **형식은 마스터가 사후 조립.** role agent는 각자 Stage 파일만 쓴다(동시 write 충돌 방지).

---

## 비용

Opus role agent 다회 호출 + (리서치 시) WebSearch 다수. 1회 파이프라인 추정 **$5~20** (녹취록 크기·리서치 깊이에 따라). 정확한 값은 Anthropic 콘솔에서 확인.
