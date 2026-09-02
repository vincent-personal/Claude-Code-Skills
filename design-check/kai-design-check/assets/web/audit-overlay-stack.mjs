/* 오버레이를 겹쳐 띄웠을 때 — 새 겹침 카운터·포커스 가둠·z-index 가 실제로 버티는지.
   단독으로 열어 보는 검사로는 절대 드러나지 않는 종류다. */
import { chromium } from 'playwright';
import { cfg, BASE } from './config.mjs';
const MODALS = cfg.modalPanels;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const bad = [];
// ⚠️ 두 번째 오버레이를 열려면 첫 오버레이의 스크림을 뚫어야 한다.
// 사용자 클릭으로는 불가능하므로(그게 정상이다) JS 로 직접 눌러 상태만 만든다.
const clickNth = async (n) => {
  await p.evaluate((i) => { const bs = document.querySelectorAll('button'); bs[i]?.click(); }, n);
  await p.waitForTimeout(450);
};
const state = () => p.evaluate(() => ({
  locked: getComputedStyle(document.body).overflow === 'hidden',
  pad: document.body.style.paddingRight,
  layers: [...document.querySelectorAll('${MODALS},[data-overlay]')]
    .map((el) => ({
      k: el.className || el.tagName,
      z: (() => { for (let n = el; n; n = n.parentElement) { const z = getComputedStyle(n).zIndex; if (z !== 'auto') return +z; } return 0; })(),
      top: el.getBoundingClientRect().top,
    })),
}));

const CASES = cfg.stacks.map((st) => [st.name, async () => {
  await p.goto(BASE + st.url, { waitUntil: 'networkidle' });
  for (const n of st.clicks) await clickNth(n);
}]);
if (!CASES.length) { console.error('· config 의 stacks 가 비어 있다 — 겹침 검사를 건너뛴다'); process.exit(0); }


for (const [name, open] of CASES) {
  try { await open(); } catch (e) { bad.push(`${name}: 여는 중 오류 ${e.message.slice(0, 60)}`); continue; }
  const s = await state();
  const say = [];
  if (s.layers.length < 2) say.push(`겹치지 않았다(${s.layers.length}겹) — 시나리오 확인 필요`);
  if (s.modals > 0 && !s.locked) say.push('모달이 열렸는데 배경 스크롤이 잠기지 않았다');
  // 나중에 연 것이 위에 있어야 한다
  const zs = s.layers.map((l) => l.z);
  if (s.layers.length >= 2 && Math.max(...zs) === Math.min(...zs))
    say.push(`z-index 가 모두 같다(${zs[0]}) — 쌓임 순서가 우연에 맡겨진다`);
  // 맨 위 오버레이 안에 포커스가 있어야 한다
  const focusOk = await p.evaluate(() => {
    const els = [...document.querySelectorAll(MODALS)];
    if (!els.length) return true;
    // ⚠️ DOM 순서가 아니라 **z-index** 가 맨 위를 정한다 (세션 만료는 DOM 상 먼저 온다)
    const z = (el) => { for (let n = el; n; n = n.parentElement) { const v = getComputedStyle(n).zIndex; if (v !== 'auto') return +v; } return 0; };
    const top = els.reduce((a, b) => (z(b) >= z(a) ? b : a));
    return top.contains(document.activeElement) || document.activeElement === top;
  });
  if (!focusOk) say.push('맨 위 오버레이 밖에 포커스가 있다');

  // 하나를 닫아도 나머지가 열려 있는 동안 스크롤이 풀리면 안 된다
  await p.keyboard.press('Escape');
  await p.waitForTimeout(420);
  const s2 = await state();
  // 핵심: Escape 한 번에 **한 겹만** 닫혀야 한다
  if (s.modals >= 2 && s2.modals === 0) say.push(`Escape 한 번에 ${s.modals}겹이 한꺼번에 닫혔다`);
  if (s2.modals > 0 && !s2.locked) say.push('모달이 남았는데 스크롤이 풀렸다');
  // 전부 닫으면 반드시 풀려야 한다
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  const s3 = await state();
  if (s3.modals === 0) {
    if (s3.locked) say.push('전부 닫혔는데 배경 스크롤이 잠긴 채다');
    if (s3.pad) say.push(`전부 닫혔는데 padding-right 가 남았다(${s3.pad})`);
  }
  if (say.length) bad.push(`${name}: ${say.join(' · ')}`);
  else console.log(`✓ ${name}  (${s.layers.length}겹, z=${zs.join('/')})`);
}
await b.close();
console.log(`\n═══ 오버레이 겹침 — ${CASES.length}조합 ═══`);
console.log(bad.length ? `문제 ${bad.length}건` : '문제 0건');
bad.forEach((x) => console.log('  ✗ ' + x));
if (bad.length) process.exitCode = 1;
