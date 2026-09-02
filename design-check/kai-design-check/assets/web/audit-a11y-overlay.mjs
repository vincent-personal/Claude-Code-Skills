/* 오버레이 접근성 실동작 검증 — 위치가 아니라 **행동**을 잰다.
   role·이름·첫 포커스·Tab 순환·Escape·포커스 복원·배경 스크롤 잠금. */
import { chromium } from 'playwright';
import { go } from './nav.mjs';
import { cfg, BASE } from './config.mjs';
// [이름, 여는 URL, 패널 선택자, Escape 로 닫히는가]
// [이름, URL, 여는 방법(/feedback 의 버튼 번호), 패널, Escape 로 닫히는가]
// 🔴 토스트·스피너·스켈레톤은 **모달이 아니다.** 포커스 가둠·Escape 를 요구하면 거짓 결함이 난다.
//    kind 를 안 적었으면 이름·escape 로 추정한다.
const guessKind = (o) => o.kind || (
  /toast|snack|스낵|토스트/i.test(o.name) ? 'status' :
  /spinner|loading|스피너|로딩|skeleton|스켈레톤/i.test(o.name) ? 'busy' :
  /empty|빈 ?상태|error|오류/i.test(o.name) ? 'inline' : 'modal');
const CASES = cfg.overlays.map((o) => [o.name, o.url, o.openIdx ?? null, o.panel, o.escape !== false, guessKind(o)]);
if (!CASES.length) { console.error('✗ config 의 overlays 가 비어 있다'); process.exit(1); }
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const bad = [];
let opened = 0;  // 실제로 열린 수 — 예정 수와 다르면 실패다
for (const [name, url, openIdx, sel, escapes, kind] of CASES) {
  // ⚠️ 예전에는 여기서 `catch { continue }` 를 했다 — 15개가 전부 실패해도 "문제 0건"이 나왔다.
  const nav = await go(p, BASE, url, cfg.selectors);
  if (!nav.ok) { bad.push(`${name}: ${nav.why}`); continue; }
  opened++;
  if (openIdx !== null) {
    const btns = await p.$$('button');
    if (btns[openIdx]) await btns[openIdx].click();
  }
  await p.waitForTimeout(500);
  const panel = await p.$(sel);
  if (!panel) { bad.push(`${name}: 패널(${sel})이 열리지 않는다`); continue; }
  const r = await p.evaluate(({ sel }) => {
    const el = document.querySelector(sel);
    const role = el.getAttribute('role');
    const named = !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'));
    const modal = el.getAttribute('aria-modal') === 'true';
    const focusInside = el.contains(document.activeElement) || document.activeElement === el;
    const locked = getComputedStyle(document.body).overflow === 'hidden';
    const live = el.getAttribute('aria-live') || el.closest('[aria-live]')?.getAttribute('aria-live') || '';
    const busy = el.getAttribute('aria-busy') || '';
    return { role, named, modal, focusInside, locked, live, busy };
  }, { sel });
  const say = [];
  if (kind === 'modal') {
    if (!r.role || !/dialog/.test(r.role)) say.push(`role 이 dialog 계열이 아니다(${r.role})`);
    if (!r.modal) say.push('aria-modal 이 없다');
    if (!r.named) say.push('접근 가능한 이름이 없다');
    if (!r.focusInside) say.push('열릴 때 포커스가 안으로 들어오지 않는다');
    if (!r.locked) say.push('배경 스크롤이 잠기지 않는다');
  } else if (kind === 'status') {
    // 토스트·스낵바: 스크린리더가 **읽어 주어야** 한다. 포커스를 뺏으면 안 된다.
    if (!/status|alert/.test(r.role || '') && r.live !== 'polite' && r.live !== 'assertive')
      say.push(`role=status|alert 또는 aria-live 가 없다 — 스크린리더가 읽지 못한다 (현재 role=${r.role}, live=${r.live})`);
    if (r.focusInside) say.push('토스트가 포커스를 가져갔다 — 작업 흐름을 끊는다');
  } else if (kind === 'busy') {
    // 로딩: 진행 중임을 알려야 한다
    if (!/progressbar|status/.test(r.role || '') && r.busy !== 'true' && r.live !== 'polite')
      say.push(`role=progressbar|status 또는 aria-busy/aria-live 가 없다 — 로딩 중임을 알리지 못한다`);
  }

  // Tab 가둠·Escape 는 **모달에만** 요구한다
  let escaped = false;
  if (kind === 'modal') {
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Tab');
    if (!(await p.evaluate(({ sel }) => {
      const el = document.querySelector(sel);
      return !!el && (el.contains(document.activeElement) || document.activeElement === el);
    }, { sel }))) { escaped = true; break; }
  }
  }
  if (escaped) say.push('Tab 이 패널 밖으로 새어 나간다');

  if (kind === 'modal' && escapes) {
    const before = await p.evaluate(({ sel }) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').slice(0, 80) : null;
    }, { sel });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(450);
    const after = await p.evaluate(({ sel }) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').slice(0, 80) : null;
    }, { sel });
    // 닫히거나(after === null), 부모 시트로 되돌아가면(내용이 바뀌면) 정상이다
    if (after !== null && after === before) say.push('Escape 를 눌러도 아무 반응이 없다');
    if (after === null) {
      const restored = await p.evaluate(() => document.activeElement && document.activeElement !== document.body);
      if (!restored) say.push('닫은 뒤 포커스가 복원되지 않는다');
      const unlocked = await p.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden');
      if (!unlocked) say.push('닫은 뒤에도 배경 스크롤이 잠겨 있다');
    }
  }
  if (say.length) bad.push(`${name}: ${say.join(' · ')}`);
  else console.log(`✓ ${name}`);
}
await b.close();
console.log(`\n═══ 오버레이 접근성 — ${CASES.length}종 ═══`);
if (opened !== CASES.length) bad.push(`${CASES.length}종 중 ${opened}종만 열렸다 — 나머지는 검사되지 않았다`);
console.log(`실제로 연 것 ${opened}/${CASES.length}`);
console.log(bad.length ? `문제 ${bad.length}건` : '문제 0건');
bad.forEach((x) => console.log('  ✗ ' + x));

if (bad.length) process.exitCode = 1;
