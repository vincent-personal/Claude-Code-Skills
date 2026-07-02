---
name: kai-browser-mcp
description: |
  글로벌 user-scope Playwright MCP(우리가 설치·등록한 self-chromium, --extension 아님)로
  브라우저를 대화형으로 띄워 VERIDA 앱을 검증한다. 페이지를 보고(snapshot) 클릭·입력하며
  즉흥 디버깅·시각 확인을 한다. 익스텐션·탭 승인·외부 Chrome에 의존하지 않는다.
  트리거: /kai-browser-mcp {URL 또는 검증 요청}
  ⚠️ MCP 연결이 불안정하거나, node로 직접 띄워(MCP 비경유) 화면을 돌며 검증하려면 /kai-browser-node.
allowed-tools:
  - Read
  - Bash
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_select_option
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_console_messages
  - mcp__playwright__browser_network_requests
  - mcp__playwright__browser_tabs
  - mcp__playwright__browser_navigate_back
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_close
---

# kai-browser-mcp — MCP 대화형 브라우저 검증

> 이 스킬은 **글로벌 user-scope `playwright` MCP**(self-chromium)로 브라우저를 직접 띄워
> VERIDA 앱 화면을 **대화형으로** 확인·조작한다. 도구 네임스페이스는 `mcp__playwright__*`.

## 역할

- 화면을 눈으로 확인하고(snapshot/screenshot), 클릭·입력하며 흐름을 따라간다.
- 빠른 시각 확인, 즉흥 디버깅, "여기 눌러보고 뭐가 나오나" 식 탐색에 적합하다.
- **MCP 연결이 불안정하거나**, node로 직접 띄워(MCP 비경유) 화면을 돌며 검증하려면 → `/kai-browser-node`
  (그쪽도 탐색적이다 — 고정 시나리오 재생이 아니라 화면 덤프 보고 다음 동작을 정함).

## 공통 상수 (VERIDA)

```
포트 → 프로젝트:
  4200 verida-order | 4201 verida-landing | 4202 verida-ops
  4203 verida-pulse | 4204 verida-store   | 4205 verida-driver

테스트 계정:
  veridadev@proton.me / Veridadev@2026     (비밀번호 로그인)
  veridadriver@yopmail.com                 (OTP — yopmail 수신, 비번 없음)

스크린샷 저장: /Volumes/KAIFACUN/Projects/VERIDA-V5/dev/qa/  (루트 금지)
공유 프로필:   ~/.cache/playwright-mcp-profile  (MCP가 persistent 로 사용)
```

## ⚡ 실행 절차

### Step 0 — 사전조건 확인 (MCP 도구 로드 여부)

`mcp__playwright__*` 도구가 보이지 않으면, 글로벌 등록은 돼 있으나 **현재 세션에 아직 로드되지 않은 것**이다.
사용자에게 **Claude Code 재시작**을 청한다(등록 자체는 `claude mcp list`에서 `playwright ✔ Connected`로 확인 가능).
재등록이 필요하면 → `Skills/kai-browser/install.sh` 의 안내 또는 메모리 `project-playwright-mcp-setup` 참조.

⛔ **`mcp__playwright__*` 도구가 없다고 Bash로 node/playwright를 돌려 "대신" 테스트하지 않는다.**
그러면 `/kai-browser-mcp`라 시켰는데 `/kai-browser-node`처럼 도는 혼란이 생긴다(바로 그 증상의 원인이다).
도구가 없으면 **멈추고 재시작을 청하거나**, 사용자가 원하면 **명시적으로** `/kai-browser-node`·`/kai-browser-agent`로 전환한다.

### Step 1 — 대상 식별

요청의 URL에서 포트로 프로젝트를 식별한다(위 매핑표). 예: `localhost:4205/...` → verida-driver.

### Step 2 — 페이지 진입

`browser_navigate` 로 대상 URL을 연다. 첫 진입 시 self-chromium 창이 뜬다(익스텐션·승인 불필요).

### Step 3 — 인증 (둘 중 하나)

- **이미 공유 프로필에 로그인돼 있으면** 그대로 진행(persistent 프로필이라 이전 로그인이 유지될 수 있음).
- **로그인 화면이면**: 비밀번호 계정은 `browser_fill_form`/`browser_type` 으로 이메일·비번 입력 후 제출.
  OTP 계정(yopmail)은 대화형 검증에 부적합 → 그 경우 `/kai-browser-node`(API 토큰 주입)를 권한다.

### Step 4 — 조작·검증

`browser_snapshot`(구조 파악) → `browser_click`/`browser_type`/`browser_select_option` 으로 흐름을 따라간다.
콘솔 오류는 `browser_console_messages`, 네트워크는 `browser_network_requests` 로 확인한다.

### Step 5 — 산출물

확인이 필요한 화면은 `browser_take_screenshot` 으로 `dev/qa/{설명}.png` 에 저장한다.

### Step 6 — 정리 (필수)

검증이 끝나면 **반드시 `browser_close`** 로 브라우저를 닫는다.
→ persistent 프로필의 `SingletonLock` 을 해제해야 이후 `/kai-browser-node` 가 같은 프로필을 열 수 있다(잠금 충돌 방지).

## Red Lines (절대 금지)

1. **dev 서버를 직접 시작하지 않는다** — 사용자 터미널에서 이미 실행 중. 안 떠 있으면 사용자에게 시작을 청한다.
2. **스크린샷을 워크스페이스 루트(`dev/`)에 두지 않는다** — 반드시 `dev/qa/`.
3. **검증 후 `browser_close` 를 생략하지 않는다** — 프로필 잠금이 남아 node 모드를 막는다.
4. **외부 Chrome·익스텐션 모드(`--extension`)로 되돌리지 않는다** — self-chromium 이 이 스킬의 전제다.
5. **MCP 도구가 없을 때 다른 방법(Bash node 등)으로 몰래 폴백하지 않는다** — 멈추고 알린다. 폴백이 "왜 node로 도냐"의 원흉이다.
