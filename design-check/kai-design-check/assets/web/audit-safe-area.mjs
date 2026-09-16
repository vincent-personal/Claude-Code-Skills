/*
 * 안전영역·하단 접근성 감사 (Ionic·모바일 웹뷰)
 *
 * 두 가지를 잰다 — **브라우저에서는 둘 다 드러나지 않는 결함**이다:
 *   ① 상단 — `ion-header` 없는 화면의 첫 요소가 **노치·다이나믹 아일랜드에 가리는가**
 *   ② 하단 — 끝까지 스크롤했을 때 마지막 요소가 **부유 탭바·홈 인디케이터에 가리는가**
 *
 * 🔴 껍데기 좌표만 보면 안 된다. 실제로 **끝까지 굴린 뒤** 마지막 요소의 위치를 재고,
 *    부유 크롬(탭바·footer)과의 교차까지 본다(references/framework-ionic.md N5·N5-A).
 * ⚠️ 노치 인셋은 페이지가 **뜬 뒤** 심는다 — `addInitScript` 로 심으면 Ionic 초기화가 덮어써
 *    시험이 거짓 통과한다(실사고 2026-09-03).
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { seedAuth } from './_auth-seed.mjs';

const cfg = JSON.parse(readFileSync('ui-audit.config.json', 'utf8'));
const screens = cfg.screens.map((s) => (typeof s === 'string' ? s : s.url ?? s.path));
const BASE = `http://localhost:${cfg.port ?? 4499}`;
const WIDTHS = [320, 390];
/** 흉내 낼 상단 인셋(px) — iPhone 다이나믹 아일랜드 실측값. */
const NOTCH = 59;

const browser = await chromium.launch();
let bad = 0, checked = 0, noRoom = 0;
const lines = [];

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await seedAuth(page);
  for (const url of screens) {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(450);
    // ★ 노치를 흉내 낸다 — **페이지가 뜬 뒤**여야 한다.
    //   `addInitScript` 로 심으면 Ionic 초기화가 덮어써 시험이 거짓 통과한다(실사고 2026-09-03).
    await page.evaluate((v) => document.documentElement.style.setProperty('--ion-safe-area-top', v), `${NOTCH}px`);
    await page.waitForTimeout(150);
    const r = await page.evaluate(async () => {
      // 지금 보이는 화면 — 아웃렛이 둘(루트 + 탭)이라 **가장 깊은** 것을 잡는다.
      const pages = [...document.querySelectorAll('ion-router-outlet > .ion-page:not(.ion-page-hidden)')];
      const host = pages[pages.length - 1];
      if (!host) return null;
      // 🔴 **직계 자식만 찾으면 안 된다.** 화면 프레임을 공용 컴포넌트로 뽑아 쓰는 앱에서는
      //    `app-화면.ion-page > pk-screen > ion-content` 처럼 **한 단계 끼어 있다.**
      //    실사고(2026-09-03): `:scope > ion-content` 라서 86회 중 **84회가 조용히 스킵**되고
      //    "검사 2건 · 결함 0건"이 나왔다 — 0건은 결함이 없다는 뜻이 아니었다.
      //    후손까지 보되, **중첩된 다른 페이지의 것**은 `closest('.ion-page')` 로 배제한다.
      const content = host.querySelector(':scope > ion-content')
        || [...host.querySelectorAll('ion-content')].find((c) => c.closest('.ion-page') === host);
      if (!content) return { none: true };

      /*
       * ── 상단: 헤더가 없는 화면의 첫 요소가 노치 아래로 내려갔는가 (N5-A) ──
       * 🔴 **반드시 스크롤 전에** 잰다. 끝까지 굴린 뒤 재면 첫 요소가 화면 위로 밀려나
       *    `top` 이 음수가 되어 "657px 가림" 같은 거짓 결함이 나온다(실측 오탐 2026-09-03).
       */
      const hasHeader = !!(host.querySelector(':scope > ion-header')
        || [...host.querySelectorAll('ion-header')].find((h) => h.closest('.ion-page') === host));
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ion-safe-area-top')) || 0;
      let notchCut = 0;
      if (!hasHeader && safeTop > 0) {
        // 🔴 **빈 스페이서를 "첫 요소"로 세면 안 된다.** 안전영역을 확보하려고 둔
        //    `padding-top` 뿐인 빈 div 는 자기 top 이 0 이라, 정작 **내용은 노치 아래로 내려갔는데도**
        //    "가림"으로 판정된다 (실측 2026-09-03: 시트가 top=59 로 잘 내려갔는데 결함 14건이 그대로였다).
        //    보이는 것이 하나도 없는 요소 — 글자·배경칠·테두리·이미지가 다 없는 것 — 은 건너뛴다.
        const isSpacer = (e) => {
          const cs = getComputedStyle(e);
          const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const hasFill = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
          const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
          const hasImg = cs.backgroundImage !== 'none' || ['IMG', 'SVG', 'CANVAS', 'VIDEO'].includes(e.tagName);
          return !hasText && !hasFill && !hasBorder && !hasImg && e.children.length === 0;
        };
        const first = [...content.querySelectorAll('*')].find((e) => {
          const b = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          if (!(b.height > 4 && b.width > 4)) return false;
          if (cs.visibility === 'hidden' || cs.position === 'fixed') return false;
          return !isSpacer(e);
        });
        if (first) notchCut = Math.round(safeTop - first.getBoundingClientRect().top);
      }

      const se = await content.getScrollElement();
      // 끝까지 굴린다 — 한 번으로는 부족하다(늦게 그려지는 블록이 높이를 늘린다).
      for (let i = 0; i < 6; i++) {
        const before = se.scrollTop;
        se.scrollTop = se.scrollHeight;
        await new Promise((res) => setTimeout(res, 180));
        if (Math.abs(se.scrollTop - before) < 1 && se.scrollTop + se.clientHeight >= se.scrollHeight - 2) break;
      }

      const shellOver = Math.round(content.getBoundingClientRect().bottom - window.innerHeight);

      const room = se.scrollHeight - se.clientHeight;
      const atEnd = se.scrollTop + se.clientHeight >= se.scrollHeight - 2;

      // 부유 크롬 — 탭바처럼 내용 위에 떠서 가리는 것들.
      const chrome = [...document.querySelectorAll('kfc-glass-tab-bar-host, kfc-glass-tab-bar, ion-footer')]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.height > 0);
      const chromeTop = chrome.length ? Math.min(...chrome.map((b) => b.top)) : window.innerHeight;

      // 마지막으로 의미 있는(글자나 조작을 가진) 요소를 고른다.
      // ⚠️ `getScrollElement()` 는 **섀도우 안의 div** 다 — 페이지 내용은 거기에 슬롯으로 꽂힐 뿐
      //    자손이 아니다. 여기서 찾으면 언제나 0개가 나와 "판정 불가"만 쌓인다(실측).
      //    그래서 라이트 DOM 인 `ion-content` 에서 찾는다.
      const candidates = [...content.querySelectorAll('button, a, input, p, span, strong, h1, h2, h3, li, dd')]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.height <= 0 || b.width <= 0) return false;
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
          // 스크롤을 따라 움직이지 않는 것(고정 배지 등)은 하단 판정에서 뺀다.
          if (cs.position === 'fixed') return false;
          return (e.textContent ?? '').trim().length > 0 || e.tagName === 'INPUT' || e.tagName === 'BUTTON';
        });
      let last = null;
      for (const e of candidates) {
        const b = e.getBoundingClientRect();
        if (!last || b.bottom > last.bottom) last = { bottom: b.bottom, tag: e.tagName, text: (e.textContent ?? '').trim().slice(0, 20) };
      }
      return { shellOver, room, atEnd, chromeTop, last, notchCut, hasHeader, limit: Math.min(window.innerHeight, chromeTop) };
    });

    if (!r) { lines.push(`!  ${width} ${url} — 화면을 찾지 못함`); bad++; continue; }
    if (r.none) { lines.push(`·  ${width} ${url} — ion-content 없음`); continue; }
    checked++;
    if (r.shellOver > 1) { bad++; lines.push(`✗  ${width} ${url} — ion-content 가 ${r.shellOver}px 화면 밖`); continue; }
    if (r.notchCut > 0) {
      bad++;
      lines.push(`✗  ${width} ${url} — 첫 요소가 노치에 ${r.notchCut}px 가림 (ion-header 없는 화면 · N5-A)`);
    }
    if (!r.atEnd) { bad++; lines.push(`✗  ${width} ${url} — 끝까지 스크롤되지 않는다`); continue; }
    if (!r.last) { noRoom++; continue; }
    const cut = Math.round(r.last.bottom - r.limit);
    if (cut > 1) {
      bad++;
      lines.push(`✗  ${width} ${url} — 마지막 "${r.last.text}" 가 ${cut}px 잘림 (한계 ${Math.round(r.limit)})`);
    }
  }
  await page.close();
}

console.log(lines.join('\n'));
console.log(`\n═══ 안전영역·하단 접근성 — 화면 ${screens.length} × 폭 ${WIDTHS.join('/')} · 검사 ${checked}건 · 판정 불가 ${noRoom}건 · 결함 ${bad}건 ═══`);
await browser.close();
if (bad) process.exitCode = 1;
