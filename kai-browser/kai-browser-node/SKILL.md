---
name: kai-browser-node
description: |
  Playwright "라이브러리" 스크립트를 node 로 직접 실행해 VERIDA 앱을 탐색적으로 검증한다.
  MCP를 거치지 않고 별도 Chromium 창을 띄우고, Supabase Auth API 토큰을 localStorage 에
  주입해 강제 로그인한 뒤, 요청에 따라 페이지(라우터)를 이동하며 캡처·입력·확인을 이어간다.
  미리 정해진 고정 시나리오가 아니라, 화면을 덤프해 보고 다음 동작을 판단하는 증분 탐색이다.
  MCP 연결 상태와 무관해 끊김의 폴백이 된다.
  트리거: /kai-browser-node {URL 또는 검증 요청}
  ⚠️ MCP 도구로 한 동작씩 대화형으로 하고 싶으면 /kai-browser-mcp.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# kai-browser-node — node 스크립트 탐색적 브라우저 검증 (세션 주입)

> 이 스킬은 **Playwright 라이브러리**(`playwright` npm)로 짠 스크립트를 `node` 로 직접 실행한다.
> 인증은 **Supabase Auth API → `localStorage` 세션 주입** 방식(전하 검증 방식)이라 로그인 폼 UI에
> 의존하지 않고, 그 뒤로는 **요청에 맞춰 페이지를 돌아다니며 탐색적으로** 확인한다.
> **MCP·공유 프로필을 일절 쓰지 않는다.**

## 역할

- "이 화면/흐름 테스트해줘"를 받아, **직접 Chromium 창을 띄워 페이지를 돌아다니며** 캡처·입력·확인한다.
  미리 짜둔 고정 시나리오를 재생하는 게 아니라, **화면을 덤프해 보고 다음 동작을 정하는
  탐색적·증분적** 검증이다.
- node 프로세스로 Playwright 를 직접 다루므로 **MCP 연결과 무관** — 끊김의 폴백이 된다.
  스크립트로 여러 동작을 묶어 실행하고 산출물(스크린샷·텍스트 덤프)을 한 번에 회수한다.
- MCP 도구로 한 동작씩 대화형 진행을 원하면 → `/kai-browser-mcp`.

## 작업 방식 (핵심 — 증분 탐색)

한 방에 전체 흐름을 다 짜려 하지 않는다. **돌리고 → 화면 보고 → 다음을 정한다:**

1. **1차 실행**: 로그인 주입 + 목표 화면 진입 + `dump()`(URL·본문 텍스트)·`shot()`(스크린샷)까지만.
2. **회수·판단**: stdout 덤프와 `dev/qa/*.png` 로 실제 화면 구조·셀렉터·상태를 파악한다.
3. **이어가기**: 파악한 셀렉터로 다음 동작(라우터 이동·클릭·입력)을 **스크립트에 덧붙여 재실행**.
   매 실행은 자족적이다(토큰 주입이 빠르니 재진입 비용이 작다) → 필요한 만큼 반복해 흐름을 따라간다.

> 셀렉터를 추측하지 않는다. `dump()` 출력으로 **실제 화면을 본 뒤** 동작을 정한다(추측 = 깨짐의 근원).

## 공통 상수 (VERIDA)

```
포트 → 프로젝트:
  4200 verida-order | 4201 verida-landing | 4202 verida-ops
  4203 verida-pulse | 4204 verida-store   | 4205 verida-driver

Supabase:
  URL      https://jexlxbzrpapryytdlzxz.supabase.co
  ANON_KEY (publishable/anon 공개키 — service_role 아님, 아래 템플릿에 포함)
  LS_KEY   sb-jexlxbzrpapryytdlzxz-auth-token   (supabase-js v2 세션 저장 키)

테스트 계정:
  veridadev@proton.me / Veridadev@2026    (비밀번호 → grant_type=password)
  veridadriver@yopmail.com                (OTP → yopmail 수신 후 verify)
  kimnamseng@yopmail.com / Veridadev@2026 (pulse supplier·Neogen — 2026-07-15 비번 설정)
  sarang@yopmail.com / Veridadev@2026     (store 사용자 — 2026-07-15 비번 설정)

글로벌 playwright (절대경로 import — ⚠️ nvm node 버전에 묶임):
  /Users/kaifacun/.nvm/versions/node/v24.13.0/lib/node_modules/playwright/index.mjs
  → `nvm use` 로 node 버전을 바꾸면 이 경로가 깨진다. 그때는
    `node -e "console.log(require('child_process').execSync('npm root -g').toString().trim())"`
    로 현재 버전의 글로벌 root 를 구해 `…/playwright/index.mjs` 로 갱신하거나,
    그 버전에서 `npm i -g playwright` 후 경로를 갱신한다.

스크립트 거처: scratchpad (세션 임시 디렉토리)
산출물(스크린샷): /Volumes/KAIFACUN/Projects/VERIDA-V5/dev/qa/   (루트 금지)
```

## ⚡ 실행 절차

### Step 0 — 사전조건 확인 (라이브러리 require 가능 여부)

```bash
node -e "require('$(npm root -g)/playwright'); console.log('playwright OK')"
```
실패하면 그 node 버전에 `npm i -g playwright`. chromium 미설치 에러면 `npx playwright install chromium`.

**그리고 반드시 `LEARNINGS.md` 를 읽는다** (절대경로 `/Volumes/KAIFACUN/Projects/Skills/kai-browser/kai-browser-node/LEARNINGS.md`).
과거에 막혔다가 통한 방법이 누적돼 있다 — 같은 함정(셀렉터·타이밍·세션 주입 형식 등)을 **처음부터 피한다**.

### Step 1 — 대상·계정 식별

요청 URL의 포트로 프로젝트를 식별하고(매핑표), 검증에 쓸 계정을 고른다.
비밀번호 계정이면 `authPassword`, yopmail 계정이면 `authOtp`(아래 템플릿).

### Step 2 — 1차 스크립트 작성·실행 (로그인 + 진입 + 덤프)

아래 **자족적 템플릿**을 scratchpad 에 `.mjs` 로 쓴다. 경로·상수·인증·주입은 그대로 두고,
`// ── 탐색 동작 ──` 블록엔 **우선 목표 화면 진입 + `dump()`·`shot()` 까지만** 넣어 실행한다.
이 1차 실행의 목적은 **화면 구조를 회수**하는 것이다.

### Step 3 — 회수 → 다음 동작 덧붙여 재실행 (반복)

`dump()` 출력과 스크린샷으로 셀렉터·상태를 파악한 뒤, 다음 동작(라우터 이동·클릭·입력)을
`// ── 탐색 동작 ──` 블록에 **덧붙여 같은 스크립트를 다시 실행**한다. 요청한 흐름을 다 따라갈 때까지 반복.
(각 실행은 토큰 재주입으로 처음부터 시작하므로 항상 같은 상태에서 출발한다.)

### Step 4 — 결과 보고

stdout 로그와 `dev/qa/*.png` 산출물로 검증 결과를 보고한다. 인증/주입 실패 시 `inject-failed.png` 와
오류 메시지로 원인(LS_KEY 형식, 계정 비번 여부)을 짚는다.

### Step 5 — 학습 기록 (필수 — 이번에 막혔다가 통했으면)

이번 작업에서 **한 번이라도 실패한 뒤 다른 방법으로 성공했다면**, 그 함정→해법을 `LEARNINGS.md` 형식대로
**append** 한다(절대경로 `/Volumes/KAIFACUN/Projects/Skills/kai-browser/kai-browser-node/LEARNINGS.md`).
- 같은 증상이 이미 있으면 새로 만들지 말고 그 항목을 **보강**한다.
- 일반화 가능한 패턴(셀렉터 전략·대기 방식·주입 형식 등)이면 위 **자족적 템플릿에도 반영**을 고려한다.
- 첫 시도에 매끄럽게 됐으면 기록할 것이 없다 — 억지로 만들지 않는다.

## 자족적 템플릿

```js
import { chromium } from '/Users/kaifacun/.nvm/versions/node/v24.13.0/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const QA = '/Volumes/KAIFACUN/Projects/VERIDA-V5/dev/qa';
mkdirSync(QA, { recursive: true });

const SUPABASE_URL = 'https://jexlxbzrpapryytdlzxz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpleGx4YnpycGFwcnl5dGRsenh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTcyMzMsImV4cCI6MjA5NTI5MzIzM30.a8-XfSrcr_PAUVAv0oRRKSMdsYbkVMRKZz0DKUUZ6jw';
const LS_KEY = 'sb-jexlxbzrpapryytdlzxz-auth-token';

// ── 설정: 대상 앱 + 계정 (요청에 맞게 수정) ──────────────────────
const APP_URL = 'http://localhost:4205';            // 포트로 프로젝트 결정
const EMAIL = 'veridadev@proton.me';
const PASSWORD = 'Veridadev@2026';                   // 비번 계정이면 채움
const USE_OTP = false;                                // yopmail 계정이면 true
const MOBILE = APP_URL.includes('4205');             // driver=모바일 뷰포트

const shot = async (page, name) => {
  await page.screenshot({ path: `${QA}/${name}.png`, fullPage: false });
  console.log(`📸 ${name}`);
};
// 화면 구조 회수 — 다음 동작의 셀렉터를 "보고" 정하기 위함
const dump = async (page, label) => {
  console.log(`\n=== ${label} | URL: ${page.url()} ===`);
  console.log((await page.locator('body').innerText()).slice(0, 1800));
};

// ── 인증 A: 비밀번호 grant ───────────────────────────────────────
async function authPassword(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error('auth(password) 실패: ' + (data.error_description || data.msg || res.status));
  return data; // { access_token, refresh_token, expires_at, expires_in, user, ... }
}

// ── 인증 B: OTP (yopmail) — 비번 없는 계정용 ─────────────────────
async function authOtp(email, ctx) {
  await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });
  const user = email.split('@')[0];
  const yo = await ctx.newPage();
  await yo.goto('https://yopmail.com/en/', { waitUntil: 'load', timeout: 60000 });
  await yo.locator('#login').fill(user);
  await yo.keyboard.press('Enter');
  await yo.waitForTimeout(5000);
  await yo.frameLocator('#ifinbox').locator('.m').first().click();
  await yo.waitForTimeout(4000);
  let otp = null;
  for (const f of yo.frames()) {
    if (f.name() === 'ifmobmail') {
      try { const t = await f.locator('body').innerText({ timeout: 5000 }); const m = t.match(/\b(\d{6})\b/); if (m) { otp = m[1]; break; } } catch {}
    }
  }
  await yo.close();
  if (!otp) throw new Error('yopmail OTP 추출 실패');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token: otp, type: 'email' }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error('auth(otp) 검증 실패: ' + (data.error || data.msg));
  return data;
}

// ── 메인 ─────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: false, slowMo: 0 });
const ctx = await browser.newContext({
  viewport: MOBILE ? { width: 430, height: 932 } : { width: 1280, height: 900 },
});

try {
  const session = USE_OTP ? await authOtp(EMAIL, ctx) : await authPassword(EMAIL, PASSWORD);
  console.log('✅ 인증:', session.user?.email, '| id:', session.user?.id?.slice(0, 8) + '…');

  // 세션 주입: 앱 오리진에서 localStorage 에 supabase-js v2 형식으로 기록 → reload
  const page = await ctx.newPage();
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, s }) => localStorage.setItem(key, JSON.stringify(s)), {
    key: LS_KEY,
    s: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in ?? 3600,
      token_type: 'bearer',
      user: session.user,
    },
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  if (page.url().includes('login')) {
    await shot(page, 'inject-failed');
    throw new Error('세션 주입 실패 — 로그인 화면으로 튕김 (LS_KEY/형식 확인)');
  }

  // ── 탐색 동작 ────────────────────────────────────────────────
  // 1차 실행: 우선 진입 화면을 회수만 한다 (dump + shot).
  await dump(page, '진입 화면');
  await shot(page, '01-home');

  // 2차부터: 위 dump 로 본 실제 셀렉터로 이동·입력·캡처를 "덧붙여" 재실행한다. 예)
  //   await page.goto(`${APP_URL}/runs`, { waitUntil: 'domcontentloaded' });   // 라우터 이동
  //   await page.locator('탭/버튼 셀렉터').click(); await page.waitForTimeout(1500);
  //   await page.locator('input[...]').fill('값');
  //   await dump(page, '다음 화면'); await shot(page, '02-next');

  console.log('\n✅ 이번 실행 완료');
} catch (e) {
  console.error('❌', e.message);
} finally {
  await browser.close();
}
```

## Red Lines (절대 금지)

1. **공유 프로필(`~/.cache/playwright-mcp-profile`)을 `userDataDir` 로 쓰지 않는다** — MCP가 점유 중이면
   `SingletonLock` 충돌로 깨진다. node 모드는 **항상 자체 인증(토큰 주입)** 으로 독립한다.
2. **셀렉터·흐름을 추측해 한 방에 몰아 쓰지 않는다** — `dump()` 로 실제 화면을 본 뒤 동작을 정한다(증분 탐색).
3. **`service_role` 키를 쓰지 않는다** — 인증은 반드시 **anon/publishable 공개키**로만(service_role 은 RLS 우회).
4. **dev 서버를 직접 시작하지 않는다** — 사용자 터미널에서 실행 중. 안 떠 있으면 사용자에게 청한다.
5. **스크린샷을 워크스페이스 루트에 두지 않는다** — 반드시 `dev/qa/`.
6. **playwright import 경로를 추측하지 않는다** — Step 0 로 실제 경로를 확인하고, nvm 버전이 바뀌면 갱신한다.
7. **막혔다가 통한 방법을 기록 없이 끝내지 않는다** — `LEARNINGS.md` 에 남겨 다음 실행이 같은 실수를 반복하지 않게 한다(이 스킬의 자기개선 장치). 작업 전 필독, 작업 후 append.
```
