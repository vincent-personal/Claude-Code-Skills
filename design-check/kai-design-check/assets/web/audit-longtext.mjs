/* 긴 값 스트레스 — 모든 인풋/텍스트영역에 과도한 문자열을 넣고 넘침을 잰다.
   정적 감사가 못 잡는 종류다(빈 인풋은 절대 안 넘친다). */
import { chromium } from 'playwright';
import { go } from './nav.mjs';
import { cfg, BASE } from './config.mjs';
const SCREENS = cfg.screens;
const LONG = 'Kuala'.repeat(1) + 'Lumpur-Jalan-Bukit-Bintang-No-123-Level-45-Unit-A-' .repeat(3);
const LONGNOSPACE = 'A'.repeat(120);
const b = await chromium.launch();
const issues = [];
for (const w of cfg.widths.filter((w) => w !== 768)) {  // 320 을 반드시 포함한다
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  for (const s of SCREENS) {
    const nav = await go(p, BASE, s.url, cfg.selectors);
    if (!nav.ok) { issues.push({ k: 'nav-fail', d: nav.why, screen: s.name, url: s.url, w }); continue; }
    const n = await p.evaluate(({ LONG, LONGNOSPACE }) => {
      let filled = 0;
      for (const el of document.querySelectorAll('input,textarea')) {
        if (el.type === 'checkbox' || el.type === 'radio' || el.disabled) continue;
        const v = el.type === 'tel' || el.inputMode === 'numeric' ? '9'.repeat(40)
                : el.maxLength > 0 && el.maxLength < 20 ? 'X'.repeat(el.maxLength)
                : (filled % 2 ? LONGNOSPACE : LONG);
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      }
      return filled;
    }, { LONG, LONGNOSPACE });
    if (!n) continue;
    await p.waitForTimeout(180);
    const r = await p.evaluate(() => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1)
        out.push({ k: 'page-scroll-x', d: `문서가 ${de.scrollWidth - de.clientWidth}px 넘침` });
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        // 가로 스크롤 레일(칩 필터 등) 안의 항목은 넘치는 것이 설계다 — 제외한다
        let inRail = false;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll') { inRail = true; break; }
        }
        if (!inRail && b.right > de.clientWidth + 1)
          out.push({ k: 'overflow-x', d: `${el.tagName.toLowerCase()}.${String(el.className).slice(0,32)} 우측 ${Math.round(b.right - de.clientWidth)}px 초과` });
        const cs = getComputedStyle(el);
        // 글자가 상자를 넘는데 잘라내거나 줄바꿈하지 않는 경우
        // 글자가 없는 요소(체크박스 상자 등)는 '글자 넘침'이 아니다 —
        // ::after 로 넓힌 히트영역이 scrollWidth 를 부풀린 것뿐이다
        if (el.children.length === 0 && (el.textContent || '').trim() &&
            el.scrollWidth > el.clientWidth + 2 &&
            cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis')
          out.push({ k: 'text-spill', d: `${el.tagName.toLowerCase()}.${String(el.className).slice(0,32)} 글자가 ${el.scrollWidth - el.clientWidth}px 넘쳐 흐른다` });
      }
      return out;  // 잘라내지 않는다 — 7번째 이후의 서로 다른 결함이 사라졌었다
    });
    for (const x of r) issues.push({ ...x, screen: s.name, url: s.url, w });
  }
  await ctx.close();
}
await b.close();
const seen = new Set();
const uniq = issues.filter(i => { const k = i.screen + i.k + i.d; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`\n═══ 긴 값 스트레스 — 인풋 있는 화면 ═══`);
console.log(`총 ${uniq.length}건`);
for (const i of uniq) console.log(`  [${i.w}px] ${i.screen} (${i.url})\n      ${i.k}: ${i.d}`);

if (uniq.length) process.exitCode = 1;
