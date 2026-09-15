# 케이스 스터디 — Problem → Approach → Process → Artifacts → Impact → Learnings

> 리크루터가 실제로 읽는 순서다. 이 여섯 절을 비우지 말 것.
> 본문은 **영어**, 각 절 끝에 `> 🇰🇷` 인용블록으로 한국어 요약 한 문단.

## 골격

```markdown
# <Buyer-language title>            ← Upwork 제목으로 그대로 쓸 수 있게
<one-line what it is> · <role> · <period> · <stack>

## Problem
Who was hurting, and how. Concrete enough that a stranger feels it.
> 🇰🇷 <한국어 요약 한 문단>

## Approach
The shape you chose and **why that shape**. Architecture diagram goes here.
> 🇰🇷 …

## Process
How it actually went — what you tried, what you dropped.
> 🇰🇷 …

## Artifacts
Diagrams, screens, the thing itself. (assets/ 의 PNG 를 건다)
> 🇰🇷 …

## Impact
What changed. Numbers if you have them, plain outcomes if you don't.
> 🇰🇷 …

## Learnings
What you'd do differently. Honest beats impressive.
> 🇰🇷 …
```

## ★ 트레이드오프 — 이 한 절이 full-stack 을 증명한다

`Approach` 안에 **레이어마다 한 문장씩** 넣는다. 기술 나열과 갈리는 지점이다.

> **Why X over Y**: We chose `<X>` over `<Y>` because `<constraint>`.
> It cost us `<what we gave up>`, which was acceptable because `<why>`.

실제 예 (OneVoice):
> **Why server-side turn boundaries over the model's**: Gemini Live streams without turn
> markers, so the server cuts a turn at 3 s of audio or 600 ms of silence. It costs us a
> few seconds of latency, acceptable because a sermon is monologue, not conversation.

> **Why two Socket.IO rooms over one**: Subtitles go to everyone; MP3 audio goes only to
> `sessionId:audio`. It costs a little bookkeeping, and it keeps listeners who muted the
> voice from paying for audio they never play.

레이어 후보: 저장소 · 전송/프로토콜 · 렌더링(SSR/CSR) · 인증 · 배포 · 비용

## 파생 산출물

| 파일 | 만드는 법 |
|---|---|
| `upwork.md` | Problem 1~2문장 + Approach 요약 + Impact. **전 필드**(제목·역할·설명·스킬·미디어·썸네일)를 채운 형태로 |
| `linkedin.md` | 포스트 본문 + 슬라이드 8장 원고 (`channel-specs.md` 구성) |
| `resume-bullets.md` | 3줄. `<동사> <무엇을> <제약 아래> — <결과>` 꼴. 수치 없으면 정성으로 |

## 금지
- 안 해본 것을 쓰지 않는다
- 측정하지 않은 수치를 쓰지 않는다 (`🔶` 로 남긴다)
- "혁신적인 · 최첨단" 같은 형용사 대신 **무엇을 했는지**를 쓴다
