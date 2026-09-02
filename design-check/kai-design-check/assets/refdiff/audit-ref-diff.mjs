#!/usr/bin/env node
/**
 * 레퍼런스 ↔ 구현 **글자 단위** 스타일 대조.
 *
 * 스크린샷 육안 대조로는 12.5px 와 13px 을 가릴 수 없고, 접힌 화면 아래는 보이지도 않는다.
 * 여기서는 양쪽 DOM 을 **같은 규칙으로** 읽으므로 스크롤과 무관하게 전부 잰다.
 *
 * 비교 항목: 글자 크기 · 굵기 · 색 · 가로 위치 · **이웃 간 세로 간격**
 *
 *   node audit-ref-diff.mjs [--dark] [--only=화면조각]
 *
 * 설정(ui-audit.config.json 의 `reference` 블록):
 * {
 *   "reference": {
 *     "url": "file:///…/디자인.html"  또는 "http://localhost:6006/…",
 *     "frame": { "width": 390, "height": 844 },   // 레퍼런스 안의 기기 화면 크기
 *     "screenSwitch": "aside button",             // 화면 전환 버튼 선택자 (텍스트로 찾는다)
 *     "themeToggle": { "dark": "button[aria-label='dark theme']",
 *                      "light": "button[aria-label='light theme']" },
 *     "statusBar": true,                          // 상태바(시계)를 원점에서 뺀다
 *     "appRoot": "ion-app",                       // 앱 쪽 측정 루트
 *     "floating": "ion-footer, ion-tab-bar, .toast",  // 세로 간격 비교에서 뺄 부유 크롬
 *     "safeAreaBottom": 34,                       // 레퍼런스가 흉내 내는 안전영역
 *     "iconsReady": "app-icon",                   // 이 요소들의 svg 가 찰 때까지 기다린다
 *     "map": [["대시보드", "/tabs/home"], ["주문", "/tabs/orders"]]
 *   }
 * }
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CFG = process.env.UI_AUDIT_CONFIG || 'ui-audit.config.json';
const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const R = cfg.reference;
if (!R || !R.url || !R.map?.length) {
  console.error('✗ config 에 reference.url / reference.map 이 없다 — 레퍼런스 대조를 건너뛴다');
  process.exit(0);
}
const args = process.argv.slice(2);
const dark = args.includes('--dark');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const BASE = cfg.appBase || `http://localhost:${cfg.port}`;
// map 항목은 [이름, 경로] 또는 [이름, 경로, 앱쪽_여는_버튼번호].
// 🔴 오버레이(서랍·시트·다이얼로그·토스트)도 **반드시** map 에 넣는다 —
//    레퍼런스 캔버스는 대개 오버레이를 별도 '화면'으로 그려 두므로 같은 방식으로 대조된다.
const MAP = R.map.filter(([l]) => !only || l.includes(only));
const FRAME = R.frame || { width: 390, height: 844 };
const FLOAT = R.floating || '';

/**
 * 양쪽에서 **똑같은 규칙으로** 글자를 줍는다 — 직계 텍스트 노드를 가진 요소만.
 *
 * 🔴 상자가 아니라 **실제 글리프가 놓인 자리**를 잰다(Range.getClientRects).
 *    한쪽은 배지 상자(패딩 포함)를, 다른 쪽은 그 안의 글자 span 을 재면
 *    똑같이 그려진 화면도 매번 어긋난 것으로 나온다.
 */
const COLLECT = function (root, originTop, originLeft, floatSel) {
  const out = [];
  root.querySelectorAll('*').forEach((el) => {
    // 인접 텍스트 노드는 붙여서 읽는다 — 레퍼런스가 "+"·값·"%" 를 쪼개 두는 일이 잦다
    const direct = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join('').replace(/\s+/g, ' ');
    if (!direct) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;

    let gl = Infinity, gr = -Infinity, gt = Infinity, gb = -Infinity;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) {
        if (b.width < 0.5) continue;
        gl = Math.min(gl, b.left); gr = Math.max(gr, b.right);
        gt = Math.min(gt, b.top);  gb = Math.max(gb, b.bottom);
      }
    }
    if (!isFinite(gl)) return;

    // 🔴 `position` 으로 부유 요소를 판정하면 안 된다 — 프레임워크가 페이지마다 붙이는
    //    래퍼가 absolute 인 경우가 있어(Ionic 의 `.ion-page`) 그렇게 잡으면
    //    **모든 화면에서 세로 간격 검사가 통째로 꺼진다.** 선택자로 지목한다.
    const floating = floatSel ? !!el.closest(floatSel) : false;
    out.push({
      t: direct,
      fs: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      fw: String(cs.fontWeight),
      c: cs.color,
      ta: cs.textAlign,
      // 왼끝·오른끝을 다 담는다. 서체 폭이 다르면 반대쪽 끝은 당연히 어긋난다
      ax: Math.round(gl - originLeft), bx: Math.round(gr - originLeft),
      y: Math.round(gt - originTop), yb: Math.round(gb - originTop),
      floating,
    });
  });
  return out.sort((a, b) => a.y - b.y || a.ax - b.ax);
};

const browser = await chromium.launch();

// ── 레퍼런스 ──────────────────────────────────────────────────────────────
const refPage = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await refPage.emulateMedia({ reducedMotion: 'reduce' });
await refPage.goto(R.url, { waitUntil: 'networkidle' });
await refPage.waitForTimeout(2000);
await refPage.evaluate(() => document.fonts.ready);
// 🔴 팔레트는 **레퍼런스 자신의 토글 버튼을 눌러** 맞춘다.
//    속성을 직접 쓰면 프레임워크가 다시 그릴 때 되돌린다.
if (R.themeToggle) {
  const sel = dark ? R.themeToggle.dark : R.themeToggle.light;
  if (sel) await refPage.evaluate((s) => document.querySelector(s)?.click(), sel);
  await refPage.waitForTimeout(400);
}

// ── 앱 ───────────────────────────────────────────────────────────────────
const appCtx = await browser.newContext({
  viewport: { width: FRAME.width, height: FRAME.height - (R.statusBar ? 44 : 0) },
  colorScheme: dark ? 'dark' : 'light',
  reducedMotion: 'reduce',
});
// 레퍼런스가 안전영역을 숫자로 흉내 낸다면 앱에도 같은 값을 심어야
// 하단 고정 바가 같은 자리에 선다 (브라우저에는 안전영역이 없다)
if (R.safeAreaBottom) {
  await appCtx.addInitScript((px) => {
    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = `:root{--ion-safe-area-bottom:${px}px;--safe-bottom:${px}px}`;
      document.head.appendChild(s);
    });
  }, R.safeAreaBottom);
}
for (const t of (R.appInit || [])) await appCtx.addInitScript(t);
const appPage = await appCtx.newPage();

const results = [];
for (const [label, route, openIdx] of MAP) {
  const ok = await refPage.evaluate(({ sel, l }) => {
    const hit = [...document.querySelectorAll(sel)].find((b) => (b.textContent || '').includes(l));
    if (hit) { hit.click(); return true; }
    return false;
  }, { sel: R.screenSwitch || 'aside button', l: label });
  if (!ok) { console.log(`${label.padEnd(20)} ← 레퍼런스에서 못 찾음`); continue; }
  await refPage.waitForTimeout(600);

  const ref = await refPage.evaluate(({ collect, frame, statusBar, floatSel }) => {
    // 🔴 **기기 화면면 안쪽만** 읽는다 — 캔버스 사이드바·제목까지 주우면 대조가 무의미해진다
    const surface = [...document.querySelectorAll('main *, body *')].find((el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.width - frame.width) < 3 && Math.abs(r.height - frame.height) < 3;
    });
    if (!surface) return null;
    const r = surface.getBoundingClientRect();
    let statusH = 0;
    if (statusBar) {
      const clock = [...surface.querySelectorAll('*')]
        .find((e) => e.children.length === 0 && /^\d{1,2}:\d{2}$/.test((e.textContent || '').trim()));
      for (let n = clock; n && n !== surface; n = n.parentElement) {
        const nr = n.getBoundingClientRect();
        if (Math.abs(nr.top - r.top) < 2 && nr.height > 8 && nr.height < 120) statusH = Math.max(statusH, Math.round(nr.height));
      }
    }
    const fn = new Function('root', 'oT', 'oL', 'fs', `return (${collect})(root, oT, oL, fs)`);
    return fn(surface, r.top + statusH, r.left, floatSel).filter((e) => e.y >= 0);
  }, { collect: COLLECT.toString(), frame: FRAME, statusBar: !!R.statusBar, floatSel: FLOAT });

  await appPage.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
  await appPage.waitForTimeout(500);
  // 오버레이라면 눌러서 연다 (스크림에 막히므로 JS 로 직접 누른다)
  if (openIdx !== undefined && openIdx !== null) {
    await appPage.evaluate((i) => document.querySelectorAll('button')[i]?.click(), openIdx);
    await appPage.waitForTimeout(500);
  }
  await appPage.evaluate(() => document.fonts.ready);
  // 🔴 아이콘이 자리를 잡을 때까지 기다린다. 폭 0 인 채로 재면
  //    그 옆 글자가 아이콘 너비만큼 밀린 것으로 **잘못** 잡힌다.
  if (R.iconsReady) {
    const ready = await appPage.evaluate(async (sel) => {
      for (let i = 0; i < 60; i++) {
        const els = [...document.querySelectorAll(sel)];
        if (els.length && els.every((e) => e.querySelector('svg')?.innerHTML.trim())) return true;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return [...document.querySelectorAll(sel)].every((e) => e.querySelector('svg')?.innerHTML.trim());
    }, R.iconsReady);
    if (!ready) console.log(`  ⚠️ ${label}: 빈 아이콘이 남았다 — 가로 위치 비교를 믿지 말 것`);
  }
  const app = await appPage.evaluate(({ collect, rootSel, floatSel }) => {
    const fn = new Function('root', 'oT', 'oL', 'fs', `return (${collect})(root, oT, oL, fs)`);
    return fn(document.querySelector(rootSel) ?? document.body, 0, 0, floatSel);
  }, { collect: COLLECT.toString(), rootSel: R.appRoot || 'body', floatSel: FLOAT });

  results.push({ label, route, ref: ref ?? [], app });
  console.log(`${label.padEnd(20)} ref ${String((ref ?? []).length).padStart(3)}줄 / app ${String(app.length).padStart(3)}줄`);
}
await browser.close();

// ── 대조 ─────────────────────────────────────────────────────────────────
const norm = (s) => s.replace(/\s+/g, ' ').trim().replace(/^#(?=\S)/, '');
const junk = (s) => /^[#·:,]$/.test(s.trim());
const lines = [`# 레퍼런스 ↔ 구현 대조 (${dark ? '다크' : '라이트'})`, '',
  `> 자동 생성 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  '> 같은 글자를 짝지어 계산된 스타일을 비교한다. **글자 폭 차이는 비교하지 않는다**',
  '> (서체 대체 때문에 정상적으로 다르다). 가로는 왼끝·오른끝 중 하나만 맞으면 통과.', ''];
const rollup = new Map();   // 같은 편차가 여러 화면에 나오면 **한 곳에서 고칠** 신호다
let totalMismatch = 0;

for (const { label, route, ref, app } of results) {
  const byText = (arr) => {
    const m = new Map();
    for (const e of arr) { if (junk(e.t)) continue; const k = norm(e.t); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return m;
  };
  const refByText = byText(ref), appByText = byText(app);
  const mismatch = [], onlyRef = [], onlyApp = [], pairs = [];

  for (const [k, rs] of refByText) {
    const pool = [...(appByText.get(k) ?? [])];
    for (const r of rs) {
      if (!pool.length) { onlyRef.push(r); continue; }
      // 같은 글자가 여럿이면 **세로로 가장 가까운 것**끼리 짝짓는다
      let best = 0;
      for (let j = 1; j < pool.length; j++)
        if (Math.abs(pool[j].y - r.y) < Math.abs(pool[best].y - r.y)) best = j;
      const a = pool.splice(best, 1)[0];
      pairs.push({ k, r, a });
      const d = [];
      if (Math.abs(r.fs - a.fs) > 0.6) d.push(`크기 ${r.fs}→${a.fs}`);
      if (r.fw !== a.fw) d.push(`굵기 ${r.fw}→${a.fw}`);
      if (r.c !== a.c) d.push(`색 ${r.c}→${a.c}`);
      const centered = r.ta === 'center' || a.ta === 'center';
      const off = centered
        ? Math.abs((r.ax + r.bx) / 2 - (a.ax + a.bx) / 2) > 2
        : Math.abs(r.ax - a.ax) > 2 && Math.abs(r.bx - a.bx) > 2;
      if (off) d.push(`가로 ${r.ax}→${a.ax}`);
      if (d.length) { mismatch.push({ t: k, d, y: r.y }); for (const one of d) {
        const key = one.replace(/\d+(\.\d+)?→\d+(\.\d+)?/, '어긋남').replace(/rgb\([^)]*\)→rgb\([^)]*\)/, '어긋남');
        if (!rollup.has(key)) rollup.set(key, new Set());
        rollup.get(key).add(label);
      } }
    }
    onlyApp.push(...pool);
  }
  for (const [k, as] of appByText) if (!refByText.has(k)) onlyApp.push(...as);

  // ── 이웃 간 **세로 간격** — 전하께서 가장 예민해하시는 항목
  //    부유 크롬(탭바·토스트)은 문서 순서가 양쪽에서 어긋나므로 뺀다.
  const gapDiffs = [];
  const seq = pairs.filter((p) => !p.r.floating && !p.a.floating).sort((x, y) => x.r.y - y.r.y);
  // 🔴 필터가 검사를 **통째로 끄는** 사고를 막는다.
  //    실제로 `.ion-page` 가 absolute 라 전 화면의 세로 간격 검사가 꺼진 채
  //    "편차 0" 을 보고한 적이 있다. 몇 개를 걸렀는지 반드시 찍는다.
  const excluded = pairs.length - seq.length;
  if (pairs.length && seq.length < pairs.length * 0.5)
    console.log(`  ⚠️ ${label}: 짝 ${pairs.length}개 중 ${excluded}개가 '부유'로 제외됐다 — ` +
                `floating 선택자가 너무 넓지 않은지 확인하라 (세로 간격 검사가 사실상 꺼진다)`);
  for (let i = 0; i < seq.length - 1; i++) {
    const rg = seq[i + 1].r.y - seq[i].r.yb;
    const ag = seq[i + 1].a.y - seq[i].a.yb;
    if (rg < -4 || ag < -4) continue;           // 같은 줄에 나란한 글자
    if (Math.abs(rg - ag) > 2)
      gapDiffs.push(`"${seq[i].k.slice(0, 14)}" ↔ "${seq[i + 1].k.slice(0, 14)}" 사이 여백 ${rg}→${ag}px`);
  }

  const n = mismatch.length + gapDiffs.length;
  totalMismatch += n;
  if (!n && !onlyRef.length && !onlyApp.length) { lines.push(`## ✓ ${label} (${route})`, ''); continue; }
  lines.push(`## ${label} (${route}) — 편차 ${n}건`, '');
  if (mismatch.length) {
    lines.push('| y | 글자 | 차이 |', '|---|---|---|');
    for (const m of mismatch.slice(0, 40)) lines.push(`| ${m.y} | ${m.t.slice(0, 26)} | ${m.d.join(' · ')} |`);
    if (mismatch.length > 40) lines.push(`| … | 외 ${mismatch.length - 40}건 | |`);
    lines.push('');
  }
  if (gapDiffs.length) {
    lines.push(`**세로 간격 어긋남** (비교 대상 ${seq.length}쌍 · 부유 제외 ${excluded}개)`, '');
    for (const g of gapDiffs.slice(0, 20)) lines.push(`- ${g}`);
    lines.push('');
  }
  if (onlyRef.length) { lines.push(`**레퍼런스에만 있음 ${onlyRef.length}건** — 구현 누락 의심`, ''); lines.push(onlyRef.slice(0, 12).map((e) => `- \`${e.t.slice(0, 30)}\``).join('\n'), ''); }
  if (onlyApp.length) { lines.push(`**구현에만 있음 ${onlyApp.length}건** — 레퍼런스에 없는 것`, ''); lines.push(onlyApp.slice(0, 12).map((e) => `- \`${e.t.slice(0, 30)}\``).join('\n'), ''); }
}

if (rollup.size) {
  lines.push('---', '', '## 여러 화면에 반복되는 편차 — **한 곳에서 고칠 것**', '');
  lines.push('| 편차 | 화면 수 | 화면 |', '|---|---|---|');
  for (const [k, set] of [...rollup].sort((a, b) => b[1].size - a[1].size))
    lines.push(`| ${k} | ${set.size} | ${[...set].slice(0, 6).join(', ')}${set.size > 6 ? ' …' : ''} |`);
}

mkdirSync('.ui-audit', { recursive: true });
const out = `.ui-audit/ref-diff${dark ? '-dark' : ''}.md`;
writeFileSync(out, lines.join('\n'));
console.log(`\n═══ 레퍼런스 대조 (${dark ? '다크' : '라이트'}) ═══`);
console.log(`화면 ${results.length}개 · 편차 ${totalMismatch}건 → ${out}`);
if (totalMismatch) process.exitCode = 1;
