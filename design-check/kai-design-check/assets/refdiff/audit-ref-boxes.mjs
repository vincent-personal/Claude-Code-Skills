#!/usr/bin/env node
/**
 * 레퍼런스 ↔ 구현 **상자** 대조 — 배경·테두리·반경·그림자.
 *
 * `audit-ref-diff.mjs` 는 **직계 텍스트 노드가 있는 요소만** 잰다. 그래서
 * 카드 바탕 · 배지 알약 · 스위치 트랙 · 아바타 원 · 구분선 같은
 * **글자 없는 시각 요소가 통째로 빠진다.** 여기서 그것만 본다.
 *
 * 짝짓기: 글자로는 못 맞추므로 **화면 안 상대 위치와 크기**로 맞춘다(±3px).
 * 완벽하지 않으므로 **짝을 못 찾은 것도 그대로 보고**한다 — 숨기면 계측기가 거짓말한다.
 *
 *   node audit-ref-boxes.mjs [--dark] [--only=화면조각] [--hairlines]
 *
 * `--hairlines` 는 **1px 선만** 따로 본다. 레퍼런스는 구분선을 별도 `<span>` 으로,
 * 구현은 `border-bottom` 으로 그리는 일이 잦아 섞어 재면 잡음이 된다.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CFG = process.env.UI_AUDIT_CONFIG || 'ui-audit.config.json';
const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const R = cfg.reference;
if (!R?.url || !R.map?.length) { console.error('✗ config 에 reference 가 없다 — 건너뛴다'); process.exit(0); }
const args = process.argv.slice(2);
const dark = args.includes('--dark');
const hairMode = args.includes('--hairlines');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const BASE = cfg.appBase || `http://localhost:${cfg.port}`;
const MAP = R.map.filter(([l]) => !only || l.includes(only));
const FRAME = R.frame || { width: 390, height: 844 };

const COLLECT = function (root, originTop, originLeft, opt) {
  const { hairMode, skipSel } = opt;
  const out = [];
  root.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    // QR 격자처럼 잘게 반복되는 칸은 자리로 짝지을 수 없다 — 의미도 없으니 뺀다
    if (r.width < 24 || r.height < 14) return;
    // 닫힌 서랍도 DOM 에 남아 있다 — 같은 크기의 줄이 많아 짝짓기를 어지럽힌다
    if (skipSel && el.closest(skipSel)) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    const side = (s) => (parseFloat(cs[`border${s}Width`]) || 0);
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((s) => side(s) > 0 && cs[`border${s}Style`] !== 'none');
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (!hasBg && !hasBorder && !hasShadow) return;

    // 🔴 **바로 뒤에 깔린 색과 같은 칠**은 눈에 보이지 않는다 — 양쪽에서 똑같이 뺀다.
    //    ⚠️ 「화면 바탕과 같은 색」으로 판정하면 안 된다 — 라이트 팔레트에서
    //       흰 판이 페이지 바탕과 같은 흰색이라 통째로 사라진 적이 있다.
    //       **부모가 실제로 칠한 색**과 견준다.
    if (hasBg && !hasBorder && !hasShadow) {
      let behind = '';
      for (let n = el.parentElement; n; n = n.parentElement) {
        const pb = getComputedStyle(n).backgroundColor;
        if (pb && pb !== 'rgba(0, 0, 0, 0)') { behind = pb; break; }
      }
      if (bg === behind) return;
    }

    // 위·아래 1px 선만 가진 상자는 **가는 선**이다. 모드에 따라 갈라 낸다.
    const onlyHair = hasBorder && !hasBg && !hasShadow
      && side('Left') === 0 && side('Right') === 0 && side('Top') <= 1.5 && side('Bottom') <= 1.5;
    const thinBox = !hasBorder && !hasShadow && hasBg && r.height <= 2;   // <span> 으로 그린 선
    const isHair = onlyHair || thinBox;
    if (hairMode !== isHair) return;

    out.push({
      x: Math.round(r.left - originLeft), y: Math.round(r.top - originTop),
      w: Math.round(r.width), h: Math.round(r.height),
      bg: hasBg ? bg : '',
      bd: hasBorder ? `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}` : '',
      br: cs.borderRadius,
      sh: hasShadow ? cs.boxShadow.replace(/\s+/g, ' ').slice(0, 60) : '',
    });
  });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
};

const browser = await chromium.launch();
const refPage = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await refPage.emulateMedia({ reducedMotion: 'reduce' });
await refPage.goto(R.url, { waitUntil: 'networkidle' });
await refPage.waitForTimeout(2000);
await refPage.evaluate(() => document.fonts.ready);
if (R.themeToggle) {
  const sel = dark ? R.themeToggle.dark : R.themeToggle.light;
  if (sel) await refPage.evaluate((s) => document.querySelector(s)?.click(), sel);
  await refPage.waitForTimeout(400);
}
const ctx = await browser.newContext({
  viewport: { width: FRAME.width, height: FRAME.height - (R.statusBar ? 44 : 0) },
  colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce',
});
if (R.safeAreaBottom) await ctx.addInitScript((px) => {
  addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = `:root{--ion-safe-area-bottom:${px}px;--safe-bottom:${px}px}`;
    document.head.appendChild(s);
  });
}, R.safeAreaBottom);
const appPage = await ctx.newPage();

const kind = hairMode ? '가는 선' : '상자';
const lines = [`# 레퍼런스 ↔ 구현 **${kind}** 대조 (${dark ? '다크' : '라이트'})`, '',
  `> 같은 자리·같은 크기끼리 짝짓는다(±3px). **짝을 못 찾은 것도 그대로 적는다.**`,
  '> 뒤에 깔린 색과 같은 칠은 눈에 안 보이므로 양쪽에서 똑같이 뺐다.', ''];
let total = 0, checked = 0;

for (const [label, route] of MAP) {
  const ok = await refPage.evaluate(({ sel, l }) => {
    const hit = [...document.querySelectorAll(sel)].find((b) => (b.textContent || '').includes(l));
    if (hit) { hit.click(); return true; } return false;
  }, { sel: R.screenSwitch || 'aside button', l: label });
  if (!ok) { console.log(`${label.padEnd(18)} ← 레퍼런스에서 못 찾음`); continue; }
  await refPage.waitForTimeout(600);

  const ref = await refPage.evaluate(({ collect, frame, statusBar, opt }) => {
    const surface = [...document.querySelectorAll('main *, body *')].find((el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.width - frame.width) < 3 && Math.abs(r.height - frame.height) < 3;
    });
    if (!surface) return [];
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
    const fn = new Function('root', 'a', 'b', 'o', `return (${collect})(root, a, b, o)`);
    return fn(surface, r.top + statusH, r.left, opt).filter((e) => e.y >= 0);
  }, { collect: COLLECT.toString(), frame: FRAME, statusBar: !!R.statusBar, opt: { hairMode, skipSel: R.skipInBoxes || '' } });

  await appPage.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
  await appPage.waitForTimeout(500);
  await appPage.evaluate(() => document.fonts.ready);
  const app = await appPage.evaluate(({ collect, rootSel, opt }) => {
    const fn = new Function('root', 'a', 'b', 'o', `return (${collect})(root, a, b, o)`);
    return fn(document.querySelector(rootSel) ?? document.body, 0, 0, opt);
  }, { collect: COLLECT.toString(), rootSel: R.appRoot || 'body', opt: { hairMode, skipSel: R.skipInBoxes || '' } });

  checked += ref.length;
  // ── 자리·크기로 짝짓기
  const pool = [...app];
  const diffs = [], onlyRef = [];
  for (const r of ref) {
    let best = -1, bestD = 1e9;
    for (let j = 0; j < pool.length; j++) {
      const a = pool[j];
      const d = Math.abs(a.x - r.x) + Math.abs(a.y - r.y) + Math.abs(a.w - r.w) + Math.abs(a.h - r.h);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best < 0 || bestD > 12) { onlyRef.push(r); continue; }
    const a = pool.splice(best, 1)[0];
    const d = [];
    if (r.bg !== a.bg) d.push(`칠 ${r.bg || '없음'} → ${a.bg || '없음'}`);
    if (r.bd !== a.bd) d.push(`선 ${r.bd || '없음'} → ${a.bd || '없음'}`);
    if (r.br !== a.br) d.push(`반경 ${r.br} → ${a.br}`);
    if (r.sh !== a.sh) d.push(`그림자 ${r.sh || '없음'} → ${a.sh || '없음'}`);
    if (Math.abs(r.w - a.w) > 2 || Math.abs(r.h - a.h) > 2) d.push(`크기 ${r.w}×${r.h} → ${a.w}×${a.h}`);
    if (d.length) diffs.push({ r, d });
  }
  const n = diffs.length + onlyRef.length + pool.length;
  total += n;
  if (!n) { lines.push(`## ✓ ${label} (${route}) — ${kind} ${ref.length}개 모두 일치`, ''); continue; }
  lines.push(`## ${label} (${route}) — 편차 ${n}건 / ${kind} ${ref.length}개`, '');
  if (diffs.length) {
    lines.push('| 자리 | 크기 | 차이 |', '|---|---|---|');
    for (const x of diffs.slice(0, 30)) lines.push(`| ${x.r.x},${x.r.y} | ${x.r.w}×${x.r.h} | ${x.d.join(' · ')} |`);
    lines.push('');
  }
  if (onlyRef.length) lines.push(`**레퍼런스에만 있음 ${onlyRef.length}개** — ` +
    onlyRef.slice(0, 8).map((e) => `${e.x},${e.y} ${e.w}×${e.h}`).join(' · '), '');
  if (pool.length) lines.push(`**구현에만 있음 ${pool.length}개** — ` +
    pool.slice(0, 8).map((e) => `${e.x},${e.y} ${e.w}×${e.h}`).join(' · '), '');
}
await browser.close();

mkdirSync('.ui-audit', { recursive: true });
const out = `.ui-audit/ref-${hairMode ? 'hairlines' : 'boxes'}${dark ? '-dark' : ''}.md`;
writeFileSync(out, lines.join('\n'));
console.log(`\n═══ 레퍼런스 ${kind} 대조 (${dark ? '다크' : '라이트'}) ═══`);
console.log(`화면 ${MAP.length}개 · ${kind} ${checked}개 검사 · 편차 ${total}건 → ${out}`);
if (checked === 0) console.log(`⚠️ 검사 대상이 **0개**다 — 선택자나 frame 크기가 안 맞는다 (검사가 사실상 꺼져 있다)`);
if (total) process.exitCode = 1;
