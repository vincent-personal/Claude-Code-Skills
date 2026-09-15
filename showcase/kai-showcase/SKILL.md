---
name: kai-showcase
description: 임의의 프로젝트(소프트웨어·하드웨어·시스템)를 분석해 **레퍼런스 자료 한 벌**을 통째로 만들어 주는 스킬. 기술 아키텍처 도면 + IT 를 전혀 모르는 사람용 사용법 도면을 그려 PNG 로 굽고, LinkedIn 캐러셀(1080×1350)·Upwork 포트폴리오 항목·케이스 스터디(Problem→Approach→Process→Artifacts→Impact→Learnings)·이력서 bullet 까지 산출해 `<프로젝트>/showcase/` 에 저장한다. 프로젝트를 끝내고도 레퍼런스를 못 만들어 나중에 못 올리는 문제를 푼다. 트리거 - /kai-showcase [프로젝트경로], "레퍼런스 만들어줘", "포트폴리오 자료 만들어줘", "이 프로젝트 케이스 스터디 써줘", "링크드인에 올릴 자료", "업워크 포트폴리오"
---

# kai-showcase — 프로젝트를 레퍼런스 자료 한 벌로

## 🔴 이 스킬이 실패하는 길은 하나뿐이다

사용자의 실제 병증은 *"문서를 못 만든다"* 가 아니라 **"매번 까먹어서 나중엔 만들 수 없다"** 이다.
그러므로 **질문이 많으면 이 스킬은 실패한다.** 다음 프로젝트에서 또 안 쓰게 되기 때문이다.

> ### ★ 제1원칙 — 코드가 답할 수 있는 것은 **절대 묻지 않는다.**
>
> 스택·규모·기능·아키텍처·배포·기간·"왜 이렇게 했는가"는 **프로젝트 안에 이미 있다.**
> 먼저 전부 캐내어 **초안을 채운 뒤**, 사람만 아는 **6개만** 묻는다.
> 답을 안 주면 `🔶 확인필요` 로 남기고 **그대로 산출한다** — 미완이라도 남기는 것이 목적이다.

---

## 발동

```
/kai-showcase                      # 현재 작업 디렉터리
/kai-showcase /path/to/project     # 임의의 프로젝트
/kai-showcase . --quick            # 도면 2종만 (캐러셀·텍스트 생략)
/kai-showcase . --text-only        # 텍스트만 (이미지 생략 — Chrome 없는 환경)
```

## 역할

프로젝트 하나를 **리크루터·클라이언트가 실제로 읽는 형태**로 번역한다.
코드를 읽어 사실을 모으고, 도면을 그리고, 채널 규격에 맞춰 굽는다.
**지어내지 않는다** — 수치는 실측한 것만 쓰고 나머지는 `🔶` 로 남긴다.

## 참고 문서 (실행 전에 읽는다)

| 무엇 | 어디 |
|---|---|
| 채널 규격 (리크루터·Upwork·LinkedIn) 과 그 근거 | `references/channel-specs.md` |
| 인터뷰 — 캐낼 것 vs 물을 것 6개, 무응답 기본값 | `references/interview.md` |
| 케이스 스터디 골격 · **트레이드오프 문장틀** | `references/case-study.md` |
| 도면 두 벌 레시피 · 캐러셀 슬라이드 뼈대 · 캡처 | `references/diagram-recipes.md` |

---

## ⚡ 실행 절차

### Phase 0 — 프로젝트 전수 분석 (묻기 전에 전부 캐낸다)

`references/interview.md` §A 의 표대로 캐낸다. 특히 **마지막 줄이 이 스킬의 값어치다** —
`CLAUDE.md` · `docs/` · `SESSION_HANDOFF.md` · ADR · **긴 커밋 메시지**에 "왜 이렇게 했는가"가
대개 이미 적혀 있다. 트레이드오프 후보를 여기서 건진다.

아키텍처는 **진입점부터 저장소까지 실제로 따라가며** 파악한다 — 추측으로 그리지 않는다.

### Phase 1 — 이전 답변 적재 (재실행 멱등)

`<프로젝트>/showcase/INTERVIEW.md` 가 있으면 읽어들이고 **바뀐 것만** 묻는다.
없으면 새로 만든다.

### Phase 2 — 초안 제시 → 6개만 질문

Phase 0 으로 채운 **초안 요약을 먼저 보여주고**, 빈칸 6개를 **AskUserQuestion 한 번**으로 묶어 묻는다.
(왜 시작했나 / 내 역할 / 고비 / 결과 수치 / 공개 범위 / 노리는 자리)
답을 `showcase/INTERVIEW.md` 에 기록한다. 무응답은 `references/interview.md` §C 의 기본값을 따른다.

### Phase 3 — 도면 2종

`references/diagram-recipes.md` ①② 를 따라 HTML 조각 2개를 `showcase/src/` 에 쓴다.

```bash
CAP=~/.claude/skills/kai-showcase/assets/capture.sh
bash "$CAP" showcase/src/01-architecture.html showcase/assets/01-architecture.png
bash "$CAP" showcase/src/02-how-it-works.html showcase/assets/02-how-it-works.png
```

> **정본은 `showcase/src/*.html` 과 PNG 다.** Artifact 도구를 쓸 수 있으면 공유 링크 목적으로
> 발행하고, 없으면 **건너뛴다** — 산출 완결성에는 영향이 없다 (Artifact URL 은 세션 밖에서 재생성 못 한다).

### Phase 4 — LinkedIn 캐러셀

`channel-specs.md` §3 구성으로 **6~10장**, `diagram-recipes.md` ③ 뼈대로 `showcase/src/linkedin/slide-01.html …`.
**영어만** 쓴다.

```bash
bash "$CAP" --batch showcase/src/linkedin --mode=fixed
mkdir -p showcase/assets/linkedin && mv showcase/src/linkedin/*.png showcase/assets/linkedin/
```

### Phase 5 — 텍스트 4종

`references/case-study.md` 골격으로 — 본문 **영어**, 각 절 끝에 `> 🇰🇷` 한국어 요약.
- `CASE-STUDY.md` — 여섯 절 + **레이어별 트레이드오프**
- `upwork.md` — 전 필드(제목·역할·설명·스킬·미디어·썸네일) + 제안서용 3종 표시
- `linkedin.md` — 포스트 본문 + 슬라이드별 원고
- `resume-bullets.md` — 3줄

### Phase 6 — 저장·보고

```
<프로젝트>/showcase/
├── assets/{01-architecture.png, 02-how-it-works.png, linkedin/slide-*.png}
├── src/                  HTML 원본 (수정 후 재캡처 가능)
├── CASE-STUDY.md · upwork.md · linkedin.md · resume-bullets.md
└── INTERVIEW.md          답변 기록 (재실행 시 다시 묻지 않기 위함)
```

보고에 넣을 것: **절대경로** · 이미지 크기 · `🔶` 로 남긴 항목 목록 · 채널별 사용법 한 줄씩.

---

## advisor 게이트

도면 구조가 안 잡히거나, 케이스 스터디의 논지(무엇이 핵심 성취인가)가 흔들리거나,
트레이드오프를 무엇으로 고를지 모르겠으면 — **추측하지 말고 `advisor` 서브에이전트(Opus)에게 묻는다.**

## Red Lines (절대 금지)

1. **숫자 날조 금지** — 수치는 코드·git·배포에서 실측한 것만. 못 구한 것은 `🔶 확인필요`, 추정은 추정이라 적는다
2. **공개 범위 미응답 시 익명화가 기본** — 고객명·로고·도메인·실데이터를 임의로 쓰지 않는다
3. **프로젝트 소스 수정 금지** — `showcase/` 폴더 밖을 건드리지 않는다
4. **자동 게시 금지** — LinkedIn·Upwork 에 올리는 것은 사용자 몫. 산출까지만 한다
5. **서버 실행 금지** — dev 서버·watch 프로세스를 띄우지 않는다 (전역 규칙)
6. **질문 6개를 넘기지 않는다** — 늘리는 순간 이 스킬은 쓰이지 않게 된다

## 이 스킬이 못 하는 것 (함께 아뢴다)

- **도면은 완전 자동이 아니다** — 코드를 추적한 뒤 템플릿에 채우는 방식이다. 구조 판단은 사람(또는 advisor)의 몫
- **Chrome 이 없으면 이미지를 못 만든다** — `--text-only` 로 텍스트만 산출한다
- **Pillow 가 없으면 하단 여백이 남는다** — 캡처 자체는 된다 (`pip3 install pillow`)
