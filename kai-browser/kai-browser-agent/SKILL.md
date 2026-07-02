---
name: kai-browser-agent
description: |
  agent-browser(vercel-labs) CLI로 VERIDA 앱을 빠르게 탐색·테스트한다. 독립 CLI 바이너리를
  Bash로 직접 호출한다(node 스크립트 아님) — open/snapshot/click/fill/close. ref(@e1,@e2)로 상호작용.
  정확한 명령 사용법은 항상 `agent-browser skills get core --full`(CLI 내장·버전 매칭·최신)을 먼저 읽는다.
  트리거: /kai-browser-agent {URL 또는 검증 요청}
  ⚠️ MCP 도구 방식은 /kai-browser-mcp, Playwright 라이브러리 스크립트는 /kai-browser-node.
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# kai-browser-agent — agent-browser CLI 탐색 검증

> 이 스킬은 **agent-browser**(vercel-labs)라는 **독립 CLI 바이너리**로 브라우저를 띄워 VERIDA 앱을
> 탐색적으로 검증한다. `npm i -g`로 설치했을 뿐 **node 스크립트가 아니다**(=`/kai-browser-node`와 무관).
> 가장 빠른 경로다.

## 역할

- "이 화면/흐름 테스트해줘"를 받아, agent-browser 로 창을 띄워 페이지를 돌며 캡처·입력·확인한다.
- 세 브라우저 스킬 중 **가장 빠름**. MCP 연결도, node 스크립트 작성도 필요 없다 — CLI 명령을 Bash로 친다.

## 0. 먼저 사용법을 로드한다 (최신·버전 매칭 — 하드카피 금지)

작업 시작 시 **반드시 한 번** 아래를 실행해 권위 있는 최신 사용법(ref 규칙·플래그·템플릿)을 로드한다.
이 SKILL 은 트리거와 VERIDA 규약만 담는다 — **명령 사용법의 단일 출처는 CLI**다(버전이 바뀌어도 자동 최신):

```bash
agent-browser skills get core --full     # 핵심 사용 가이드 (반드시 먼저)
agent-browser skills list                # electron / slack / dogfood 등 특수 스킬
```

> ❌ `node_modules/agent-browser/skills` 의 SKILL.md 를 복사해 두지 않는다 — 버전이 어긋난다.
> 항상 위 CLI 명령으로 그 자리에서 읽는다.

## ⚠️ 실행 환경 (node 24 — 빠뜨리면 "command not found")

agent-browser 는 **node>=24** 를 요구하며, **node 24 의 글로벌 bin**에 설치돼 있다.
Claude Code 의 Bash 셸이 node 22 로 떠 있으면 `agent-browser` 명령을 **찾지 못한다.**

- **이미 Claude Code 를 node 24 에서 실행 중이면** 그냥 `agent-browser …` 로 쓴다.
- **아니면(=이 Bash 가 22 면)** 매 호출 앞에 24 를 활성화한다:
  ```bash
  export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 24 >/dev/null 2>&1
  agent-browser open http://localhost:4200
  ```
- 확인: `node -v` 가 `v24.*` 인지. 아니면 위 프리픽스를 붙인다.

> ⛔ **agent-browser 가 안 잡힌다고 `/kai-browser-node`(Playwright)나 다른 방법으로 몰래 폴백하지 않는다.**
> 이 스킬은 agent-browser 로 끝까지 한다. 정 안 되면 멈추고 원인(node 버전/설치)을 사용자에게 알린다.

## 화면 표시 — 기본 **headed**(보이게)

agent-browser는 기본이 headless(창 없이 백그라운드)지만, **이 스킬은 항상 `--headed`로 띄운다** —
전하께서 **검증을 눈으로 보며** 하시기 때문이다(verify-driver의 `headless:false`와 동일 취지).
- 첫 `open` 에 `--headed` 를 붙인다: `agent-browser open <url> --headed`
- 또는 세션 내내 보이게: `export AGENT_BROWSER_HEADED=1` 후 명령들(이러면 이후 open에 플래그 불필요).
- ⚠️ **데몬이 이미 headless로 떠 있으면 `--headed`가 무시된다** — 먼저 `agent-browser close --all` 후 `--headed`로 다시 open.
- 빠른 백그라운드(창 불필요)만 명시적으로 원할 때만 `--headed`를 뺀다.

## 핵심 워크플로

1. `agent-browser open <url> --headed` — 페이지 이동(보이는 창)
2. `agent-browser snapshot -i` — 인터랙티브 요소를 **ref(e1, e2…)** 와 함께 획득
3. `agent-browser click @e1` / `agent-browser fill @e2 "텍스트"` — **ref로** 상호작용
4. **페이지가 바뀌면(네비게이션/리렌더) 반드시 re-snapshot** — ref는 스냅샷마다 새로 발급되고 금방 stale
5. 상호작용 **전에 항상 snapshot** 으로 현재 상태를 먼저 확인
6. 끝나면 `agent-browser close`

스크린샷이 필요하면 `agent-browser screenshot /Volumes/KAIFACUN/Projects/VERIDA-V5/dev/qa/{이름}.png`.

## VERIDA 규약

```
포트 → 프로젝트:
  4200 verida-order | 4201 verida-landing | 4202 verida-ops
  4203 verida-pulse | 4204 verida-store   | 4205 verida-driver

로그인: 세션/프로필로 유지 — 한 번 로그인 후 재사용, 매번 재로그인 금지.
        테스트 계정만(veridadev@proton.me / Veridadev@2026 등). 운영 자격증명 절대 금지.
스크린샷: /Volumes/KAIFACUN/Projects/VERIDA-V5/dev/qa/   (워크스페이스 루트 금지)
```

## Red Lines (절대 금지)

1. **node 24 미활성 상태로 실행하지 않는다** — 22면 `agent-browser`가 없다(위 프리픽스 또는 24로 재시작).
2. **agent-browser 가 안 되면 다른 도구로 폴백하지 않는다** — 멈추고 원인을 알린다(폴백은 "왜 딴 걸로 도냐"의 원흉).
3. **명령 사용법을 추측하지 않는다** — `agent-browser skills get core --full` 을 먼저 읽는다.
4. **운영 자격증명 금지, 테스트 계정만.** 상호작용 전 항상 snapshot.
5. **스크린샷은 `dev/qa/`** — 루트 금지.
6. **dev 서버를 직접 시작하지 않는다** — 사용자 터미널에서 실행 중. 안 떠 있으면 사용자에게 청한다.
