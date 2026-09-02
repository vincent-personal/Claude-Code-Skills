#!/usr/bin/env node
/**
 * 숨겨진 컴포넌트 감사 — 시트·다이얼로그·서랍·토스트·쿠키배너·세션만료를
 * 실제로 **열어서** 데스크탑/모바일 폭에서 제대로 보이는지 계측한다.
 *
 *   node scripts/audit-overlays.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cfg, BASE } from './config.mjs';
import { writeFileSync } from 'node:fs';

const WIDTHS = [cfg.widths[1] ?? 390, cfg.widths[cfg.widths.length - 1]];

/** [화면, 여는 방법, 기대 오버레이 셀렉터, 이름] */
const CASES = cfg.overlays.map((o) => [o.url, o.openIdx ?? null, o.panel, o.name]);
if (!CASES.length) { console.error('· config 의 overlays 가 비어 있다'); process.exit(0); }


// 여는 방법은 config 의 openIdx 가 정한다

const MEASURE = (sel) => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const issues = [];
  if (r.width < 2 || r.height < 2) issues.push('크기 0 — 보이지 않는다');
  if (r.right > vw + 1) issues.push(`오른쪽 넘침 right=${Math.round(r.right)} > ${vw}`);
  if (r.left < -1) issues.push(`왼쪽 넘침 left=${Math.round(r.left)}`);
  if (r.top > vh - 8) issues.push(`화면 아래로 벗어남 top=${Math.round(r.top)} (vh=${vh})`);
  if (r.bottom < 8) issues.push(`화면 위로 벗어남 bottom=${Math.round(r.bottom)}`);
  // 가운데 정렬 확인 (좌우 여백 차이 4px 이내여야 한다)
  const lm = r.left, rm = vw - r.right;
  const centered = Math.abs(lm - rm) <= 4;
  // 문서 가로 스크롤
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) issues.push(`문서 가로 스크롤 ${de.scrollWidth}>${de.clientWidth}`);
  // 모달이면 스크림이 뷰포트 전체를 덮어야 한다
  const scrim = el.closest('.ds-sheet-scrim, .ds-dialog-scrim, .dw-scrim, .se-scrim');
  if (scrim) {
    const sr = scrim.getBoundingClientRect();
    if (sr.width < vw - 1 || sr.height < vh - 1)
      issues.push(`스크림이 화면을 다 덮지 않음 ${Math.round(sr.width)}×${Math.round(sr.height)} (화면 ${vw}×${vh})`);
    if (getComputedStyle(scrim).position !== 'fixed')
      issues.push(`스크림이 fixed 가 아님 (${getComputedStyle(scrim).position}) — 긴 페이지에서 화면 밖에 뜬다`);
  }
  return {
    box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
    여백: `왼쪽 ${Math.round(lm)} / 오른쪽 ${Math.round(rm)}`,
    가운데정렬: centered,
    position: cs.position,
    zIndex: cs.zIndex,
    issues,
  };
};

const browser = await chromium.launch();
const page = await browser.newPage();
const lines = [];
let bad = 0;

for (const [url, action, sel, label] of CASES) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    try { await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 20000 }); } catch {}
    await page.waitForTimeout(300);
    if (action) {
      const idx = action;
      const btns = await page.$$('.fb-row ds-button button');
      if (btns[idx]) { await btns[idx].click(); await page.waitForTimeout(450); }
    } else {
      await page.waitForTimeout(300);
    }
    let m;
    try { m = await page.evaluate(MEASURE, sel); } catch (e) { m = { missing: true, err: String(e).slice(0,80) }; }
    if (m.missing) { lines.push(`❌ ${label} @${w}px — 요소를 찾지 못함 (${sel})`); bad++; continue; }
    const flag = m.issues.length ? '❌' : (m.가운데정렬 || w === 390 ? '✓' : '·');
    if (m.issues.length) bad++;
    lines.push(`${flag} ${label} @${w}px  ${m.box}  ${m.여백}  ${m.position}/z${m.zIndex}${m.issues.length ? '\n     → ' + m.issues.join(' · ') : ''}`);
  }
  process.stderr.write('.');
}
await browser.close();
mkdirSync('.ui-audit', { recursive: true });
const head = `\n═══ 숨겨진 컴포넌트 감사 — ${CASES.length}종 × ${WIDTHS.join('/')}px ═══\n문제 ${bad}건\n`;
console.log(head + lines.join('\n'));
writeFileSync('.ui-audit/overlays.txt', head + lines.join('\n'));
if (bad) process.exitCode = 1;
