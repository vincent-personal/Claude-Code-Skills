---
name: kai-peer-session-claude
description: |
  kai-gen(또는 Claude 아닌 에이전트)에서 호출한다. 지금 이 세션과 **같은 이름·같은 폴더**를 쓰는
  Claude Code 세션을 찾아 그쪽이 무엇을 했는지 읽고 숙지한다. 두 에이전트로 한 작업을 나눠 할 때,
  서로의 진행을 사람이 옮겨 적는 수고를 없앤다. 사용자가 두 세션에 같은 이름을 붙이는 습관이 곧 열쇠다.
  "클로드 쪽에서 뭐 했는지 봐줘", "짝 세션 확인해줘" 같은 요청에도 사용.
---

# kai-peer-session-claude — 짝 Claude Code 세션 읽기

## 실행

```bash
python3 ~/.claude/skills/kai-peer-session-claude/peer-session.py --to claude
```

작업 폴더에서 실행한다(현재 폴더가 곧 짝 판정의 조건이다).
kai-gen 에서 쓴다면 이 저장소 경로로 직접 불러도 된다 —
`python3 /Volumes/VINCENT/vincent-dev/Claude-Code-Skills/kai-peer-session/peer-session.py --to claude`

| 인자 | 용도 |
|---|---|
| *(기본)* | 내 세션 이름을 자동 추정해 같은 이름의 Claude 세션을 읽는다 |
| `--name <이름>` | 자동 추정이 틀렸거나 다른 이름을 콕 집을 때 |
| `--list` | 양쪽의 이름 붙은 세션 일람 (짝을 못 찾을 때 진단) |
| `--max-msgs N` | 최근 N개 메시지 (기본 120, `0`=전체) |
| `--cwd DIR` | 다른 폴더를 볼 때만. **원칙적으로 건드리지 않는다** |

출력이 길면 `--max-msgs 60`, 더 필요하면 `--max-msgs 0`.

## 이름 자동 추정의 근거와 한계

`--name` 이 없으면 **이 폴더의 kai-gen 세션 중 가장 최근에 기록된 것**을 나 자신으로 본다.
스킬을 부르는 순간 내 대화가 방금 기록되므로 대개 어긋나지 않는다.

같은 폴더에서 **여러 kai-gen 세션을 동시에 굴리는 중**이라면 흔들릴 수 있다.
출력 첫 줄 `# 내 세션 이름 추정: …` 이 내 세션 이름과 다르면 `--name` 으로 지정할 것.

## 읽은 뒤에 할 일

1. **무엇을 이미 했는지** 확인하고 같은 일을 되풀이하지 않는다
2. **상대의 결론·판정·미결 사항**을 내 작업의 전제로 삼는다
3. 상대의 결론과 내 판단이 어긋나면 **덮어쓰지 말고 사용자에게 알린다** —
   두 에이전트가 서로 다른 근거를 봤을 수 있다
4. 상대 화면에만 있던 사실(로그·측정값)은 **출처를 밝힌다** ("Claude 세션에 따르면 …")

상대의 thinking 블록은 애초에 옮겨오지 않는다 — 사고과정은 결론이 아니고,
남의 중간 추측을 전제로 삼으면 틀린 판단이 옮는다.

## 저장 구조 (참고)

```
Claude Code  ~/.claude/projects/{cwd 의 / 를 - 로 치환}/{uuid}.jsonl
             이름은 파일명에 없다 → {"type":"custom-title","customTitle":…} 레코드
             (없으면 {"type":"agent-name","agentName":…})
kai-gen      ~/.kai-gen/sessions/{ts}-{id}/meta.json  → name·cwd·roleId·modelRef
             대화 = 같은 폴더의 transcript.jsonl
```

## 짝을 못 찾을 때

| 증상 | 원인·조치 |
|---|---|
| `'X' 이름의 claude 세션을 찾지 못했다` | 이름이 서로 다르거나 Claude 가 그 폴더에서 돈 적 없음 → `--list` |
| 이름 추정이 엉뚱함 | 같은 폴더에 kai-gen 세션이 여럿 → `--name` 지정 |
| `(이름없음)` 만 나옴 | 세션에 이름을 붙이지 않았음 → 사용자에게 이름 지정 요청 |
