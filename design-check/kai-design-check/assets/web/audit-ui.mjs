#!/usr/bin/env node
/**
 * 전 화면 레이아웃 감사기.
 * 이미 떠 있는 dev 서버에 붙어(서버를 시작·종료하지 않는다) 모든 화면을
 * 여러 폭에서 열고 DOM 을 계측해 아래를 잡아낸다.
 *
 *   ① 가로 오버플로   화면 밖으로 삐져나간 요소
 *   ② 겹침            상호작용 요소끼리 포개짐
 *   ③ 가려짐          하단 고정 바에 내용이 잘림
 *   ④ 텍스트 잘림     말줄임 없이 넘침
 *   ⑤ 작은 터치 타깃  44px 미만
 *   ⑥ 콘솔 오류
 *
 *   node scripts/audit-ui.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { go } from './nav.mjs';
import { cfg, BASE, applyTheme, themeQuery } from './config.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const WIDTHS = cfg.widths;
const THEMES = cfg.themes;
const SEL = cfg.selectors;
const seen = new Set();
const targets = cfg.screens
  .filter((r) => (seen.has(r.url) ? false : seen.add(r.url)))
  .map((r) => ({ label: r.name, url: r.url }));
if (!targets.length) {
  console.error('✗ ui-audit.config.json 의 screens 가 비어 있다 — 검사할 화면이 없다');
  process.exit(1);
}

const AUDIT = (SEL) => {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const name = (el) => {
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.02;
  };

  // ① 문서 자체가 가로로 넘치는가 (진짜 결함 — 가로 스크롤바가 생긴다)
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1)
    issues.push({ t: 'page-scroll-x', el: 'document', d: `scrollWidth=${de.scrollWidth} > ${de.clientWidth}` });

  // ② 가로 오버플로 — 단, 가로 스크롤 레일 안의 요소는 정상이므로 제외
  const inScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el) || inScroller(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.right > vw + 1.5) issues.push({ t: 'overflow-x', el: name(el), d: `right=${Math.round(r.right)} > vw=${vw}` });
    else if (r.left < -1.5) issues.push({ t: 'overflow-x', el: name(el), d: `left=${Math.round(r.left)}` });
  });

  // ② 상호작용 요소 겹침 (fixed 오버레이는 제외 — 의도된 겹침)
  const inFixed = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement)
      if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  };
  const acts = [...document.querySelectorAll('button, a[href], input, select, textarea')]
    .filter((e) => visible(e) && !inFixed(e))
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter((b) => b.r.width > 2 && b.r.height > 2);
  for (let i = 0; i < acts.length; i++)
    for (let j = i + 1; j < acts.length; j++) {
      const a = acts[i], b = acts[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 2 && oy > 2)
        issues.push({ t: 'overlap', el: name(a.e), d: `↔ ${name(b.e)} (${Math.round(ox)}×${Math.round(oy)}px) "${(a.e.textContent||a.e.getAttribute('aria-label')||'').trim().slice(0,12)}"` });
    }

  // ③ 하단 고정 바에 가려진 내용
  // 전체를 덮는 스크림(시트·다이얼로그)은 바가 아니다 — 제외
  const bars = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || !visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > window.innerHeight - 4 && r.height < window.innerHeight * 0.4;
  });
  if (bars.length) {
    const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top));
    const last = [...document.querySelectorAll(SEL.main)].pop();
    if (last) {
      const r = last.getBoundingClientRect();
      const docBottom = r.bottom + window.scrollY;
      const pageH = document.documentElement.scrollHeight;
      const pad = parseFloat(getComputedStyle(last).paddingBottom) || 0;
      const need = window.innerHeight - barTop;
      if (pad + 4 < need && pageH > window.innerHeight)
        issues.push({ t: 'covered', el: name(last), d: `하단 여백 ${Math.round(pad)}px < 고정바 높이 ${Math.round(need)}px` });
    }
  }

  // ④ 텍스트 잘림 (말줄임 없이 넘침)
  document.querySelectorAll('span, p, h1, h2, h3, h4, button, a').forEach((el) => {
    if (!visible(el) || el.children.length) return;
    if (!el.textContent.trim()) return; // 글자가 없으면 잘릴 것도 없다 (히트영역 ::after 오탐 방지)
    const s = getComputedStyle(el);
    if (s.overflow === 'hidden' || s.textOverflow === 'ellipsis') return;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      issues.push({ t: 'text-clip', el: name(el), d: `${el.scrollWidth}>${el.clientWidth} "${el.textContent.trim().slice(0,20)}"` });
  });

  // ⑤ 작은 터치 타깃 — 실제로 클릭 핸들러가 걸린 요소만 (본문 속 링크 제외)
  // WCAG 2.5.5 는 44×44 를 요구한다. 링크·네이티브 인풋·role=button·tabindex 도 대상이다.
  const TAP = 44;  // WCAG 2.5.5 (AAA) · Apple HIG 44pt · Material 48dp
  const AA = 24;   // WCAG 2.5.8 (AA) — 이것을 못 넘기면 진짜 결함이다
  const clickable = [
    ...document.querySelectorAll(
      'button, a[href], select, summary,' +
        ' input:not([type=hidden]):not([type=text]):not([type=email]):not([type=tel]):not([type=password]):not([type=search]):not([type=number]),' +
        ' [role=checkbox], [role=radio], [role=switch], [role=button], [role=link], [role=tab], [role=menuitem],' +
        ' [tabindex]:not([tabindex="-1"])',
    ),
  ];
  // ::after 등으로 넓힌 히트영역은 rect 에 잡히지 않는다.
  // 실제로 눌리는지 좌표로 확인한다 (요소 중심에서 상하좌우 16px 지점).
  const half = 22; // 44px 의 절반 — 이 거리까지 눌려야 한다
  const hits = (el, dx, dy) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 + dx;
    const y = r.top + r.height / 2 + dy;
    if (x < 0 || y < 0 || x > vw || y > window.innerHeight) return true; // 화면 밖은 판정 보류
    const hit = document.elementFromPoint(x, y);
    // ⚠️ 조상(hit.contains(el))은 통과로 치면 안 된다 — 조상을 눌러도 버튼은 눌리지 않는다
    return !!hit && (hit === el || el.contains(hit));
  };
  clickable.forEach((raw) => {
    if (!visible(raw)) return;
    // role=checkbox/radio/switch 가 <label> 안에 있으면 라벨 전체가 클릭 대상이다
    const lab = raw.closest('label');
    const el = (lab && raw.getAttribute('role')) ? lab : raw;
    const r = el.getBoundingClientRect();
    if (r.width < 1) return;
    if (r.height >= TAP && r.width >= TAP) return;
    const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14);
    const size = `${Math.round(r.width)}×${Math.round(r.height)}`;
    // ⚠️ 중심을 눌렀는데 **다른 상호작용 요소**가 잡히면, 그 요소(대개 이웃의 넓힌
    //    ::after 히트영역)가 이 컨트롤의 클릭을 가로채고 있다는 뜻이다.
    //    조용히 건너뛰면 안 된다 — 넓히기가 만든 가장 위험한 부작용이다.
    if (!hits(el, 0, 0)) {
      const r0 = el.getBoundingClientRect();
      const thief = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
      const interactive = thief && thief.closest('button, a[href], input, select, textarea, label, [role=button], [tabindex]:not([tabindex="-1"])');
      // 모달·스크림에 가려진 것은 정상이다
      // 고정 탭바·하단바·오버레이가 위를 덮은 것은 정상이다(스크롤하면 드러난다).
      // ⚠️ 조상까지 봐야 한다 — 탭바 '버튼' 자체는 static 이고 탭바 컨테이너가 fixed 다.
      let covered = !!(thief && thief.closest(SEL.scrim + ', [role=dialog], [role=alertdialog]'));
      for (let n = thief; n && !covered && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') covered = true;
      }
      if (interactive && !covered && !el.contains(thief))
        issues.push({ t: 'tap-stolen', el: name(el), d: `중심 클릭을 ${name(interactive)} 가 가로챈다 "${label}"` });
      return;
    }
    // 실효 히트영역을 두 기준으로 잰다
    const okAA = (r.height >= AA || (hits(el, 0, -12) && hits(el, 0, 12)))
              && (r.width  >= AA || (hits(el, -12, 0) && hits(el, 12, 0)));
    const okY = r.height >= TAP || (hits(el, 0, -half) && hits(el, 0, half));
    const okX = r.width >= TAP || (hits(el, -half, 0) && hits(el, half, 0));
    // 인라인 링크는 WCAG 2.5.8 의 명시적 면제 대상이다 (문장 안에 흐르는 링크)
    const inlineLink = el.tagName === 'A' && getComputedStyle(el).display.startsWith('inline')
      && !!el.closest('p, li, blockquote, td');
    if (!okAA && !inlineLink)
      issues.push({ t: 'tap-aa', el: name(el), d: `${size} — WCAG 2.5.8(AA) 24px 미달 "${label}"` });
    else if ((!okY || !okX) && !inlineLink)
      issues.push({ t: 'tap-touch', el: name(el), d: `${size} ${okX?'가로OK':'가로좁음'}/${okY?'세로OK':'세로좁음'} — 44px(AAA·모바일 권고) 미달 "${label}"` });
  });

  // ⑤-b 요소는 있는데 **완전히 가려짐**
  //  🔴 Ionic 의 `[fullscreen]="true"` + 일반 <header> 조합이 상단 앱바를 통째로 덮는 사고가 있었다.
  //     "탑 네비게이션이 없다"는 지적의 정체였는데, DOM 에는 있으므로 다른 검사로는 안 잡힌다.
  //  ⚠️ **선택자가 안 맞으면 검사가 조용히 0건이 된다** (T10-b). 몇 개를 봤는지 반드시 찍는다.
  const landmarks = [...document.querySelectorAll(SEL.landmarks ||
    'header, nav, [role=banner], [role=navigation], [role=search], ion-header,' +
    ' [class*=appbar i], [class*=app-bar i], [class*=topbar i], [class*=top-bar i], [class*=navbar i]')];
  issues.push({ t: '_stat', el: 'landmarks', d: String(landmarks.length) });
  landmarks.forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 12) return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;   // 스크롤 밖은 판정 보류
    // 다섯 지점을 찍어 **전부** 이 요소 밖의 것이 잡히면 완전히 덮인 것이다
    const pts = [[.2, .3], [.5, .3], [.8, .3], [.35, .7], [.65, .7]];
    let coveredN = 0, by = null;
    for (const [fx, fy] of pts) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > vw || y > window.innerHeight) { coveredN++; continue; }
      const hit = document.elementFromPoint(x, y);
      if (hit && !el.contains(hit) && hit !== el) { coveredN++; by = by || name(hit); }
    }
    if (coveredN === pts.length && by)
      issues.push({ t: 'hidden-behind', el: name(el),
        d: `요소는 있으나 ${by} 에 완전히 덮여 보이지 않는다 (${Math.round(r.width)}×${Math.round(r.height)})` });
  });

  // ⑥ 대비 — 글자와 실제 배경의 명암비 (WCAG AA 4.5:1, 큰 글자 3:1)
  // ⚠️ `color-mix()` 의 계산 결과는 `color(srgb 0.98 0.98 0.98 / .62)` 로 나온다.
  //    0~255 로 가정하고 읽으면 흰색을 검정으로 읽어 대비를 거꾸로 계산한다 —
  //    실제로 그 버그로 없는 결함이 보고된 적이 있다. 두 형식을 모두 읽는다.
  const parse = (c) => {
    if (!c || c === 'transparent') return null;
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const n = m.map(Number);
    const srgb = /^color\(\s*srgb/i.test(c);
    const [r, g, b] = srgb ? [n[0] * 255, n[1] * 255, n[2] * 255] : [n[0], n[1], n[2]];
    const a = n[3] === undefined ? 1 : n[3];
    return { r, g, b, a };
  };
  const relLum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // 반투명 색을 아래 색 위에 합성한다 (알파를 버리지 않는다)
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const p = parse(c);
    if (!p || p.a < 0.5) return null;
    return relLum(p);
  };
  /**
   * 실제로 보이는 배경색. 반투명 배경은 **아래 층에 합성**해 내려간다.
   * ⚠️ 예전에는 알파 0.5 미만을 통째로 무시하고 0.5 이상은 불투명 취급했다 —
   *    합성 함수를 만들어 두고 부르지 않았다(죽은 코드였다).
   */
  const bgStack = (el) => {
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      layers.push(c);
      if (c.a >= 0.999) break; // 불투명한 층을 만나면 멈춘다
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    layers.push(root && root.a >= 0.999 ? root : { r: 255, g: 255, b: 255, a: 1 });
    // 아래에서 위로 합성한다
    let acc = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  const bgOf = (el) => relLum(bgStack(el));
;
  document.querySelectorAll('span, p, h1, h2, h3, h4, button, a, label').forEach((el) => {
    if (!visible(el) || el.children.length) return;
    const txt = el.textContent.trim();
    if (!txt) return;
    if (el.closest('[disabled], [aria-disabled="true"]')) return; // 비활성 컨트롤은 WCAG 면제
    const cs = getComputedStyle(el);
    const fgRaw = parse(cs.color);
    if (!fgRaw) return;
    const bgc = bgStack(el);
    // 반투명 글자는 배경에 합성한 실제 표시색으로 재야 한다
    const fl = relLum(fgRaw.a >= 0.999 ? fgRaw : over(fgRaw, bgc));
    const bl = relLum(bgc);
    const ratio = (Math.max(fl, bl) + 0.05) / (Math.min(fl, bl) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    // VERSO 는 --text-tertiary 를 캡션에 의도적으로 쓴다(흰 배경에서 3.24:1).
    // 그 디자인 선택까지 결함으로 세면 신호가 묻히므로, **실제로 읽기 어려운 3:1 미만**만 잡는다.
    // (AA 기준 미달 목록 전체는 docs/design-system.md 에 소견으로 남겨 두었다)
    const need = large ? 3 : 4.5;
    // AA 기준 전체를 잰다. 3:1 미만은 '읽기 어려움'으로 따로 표시해 우선순위를 가른다.
    if (ratio < need)
      issues.push({
        t: ratio < 3 ? 'contrast-hard' : 'contrast-aa',
        el: name(el),
        d: `${ratio.toFixed(2)}:1 (AA 필요 ${need}) ${Math.round(size)}px "${txt.slice(0, 18)}"`,
      });
  });

  return issues;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 160)));

const report = [];
let opened = 0;
const statTally = new Map();  // 검사 대상 수 — 0 이면 선택자가 안 맞는 것이다
const expected = targets.length * WIDTHS.length * THEMES.length;
for (const t of targets) {
  for (const w of WIDTHS) {
   for (const theme of THEMES) {
    await page.setViewportSize({ width: w, height: w === cfg.shortViewportAt ? 568 : 900 });
    consoleErrors.length = 0;
    await applyTheme(page, BASE, theme);
    // ⚠️ 예전에는 실패해도 그냥 진행해 **직전 화면의 DOM** 을 이 화면의 결과로 기록했다.
    const q = themeQuery(theme);
    const url = q ? t.url + (t.url.includes('?') ? '&' : '?') + q.replace(/^\?/, '') : t.url;
    const nav = await go(page, BASE, url, SEL);
    if (!nav.ok) {
      report.push({ screen: t.label, url: t.url, w, theme: theme.name, issues: [{ t: 'nav-fail', el: '-', d: nav.why }] });
      continue;
    }
    opened++;
    await page.waitForTimeout(450); // 진입 애니메이션 종료 대기
    let issues = [];
    try { issues = await page.evaluate(AUDIT, SEL); } catch (e) { issues = [{ t: 'audit-fail', el: '-', d: String(e).slice(0, 100) }]; }
    for (const e of consoleErrors) issues.push({ t: 'console', el: '-', d: e });
    const stats = issues.filter((i) => i.t === '_stat');
    issues = issues.filter((i) => i.t !== '_stat');
    for (const st of stats) statTally.set(st.el, (statTally.get(st.el) || 0) + Number(st.d));
    if (issues.length) report.push({ screen: `${t.label} (${t.url})`, w: `${w}·${theme.name}`, issues });
   }
  }
  process.stderr.write('.');
}
await browser.close();

// ── 출력
const byType = {};
let total = 0;
const lines = [];
for (const r of report) {
  lines.push(`\n■ ${r.screen}  @${r.w}px`);
  const grouped = {};
  for (const i of r.issues) (grouped[i.t] ??= []).push(i);
  for (const [t, list] of Object.entries(grouped)) {
    byType[t] = (byType[t] || 0) + list.length;
    total += list.length;
    const uniq = [...new Map(list.map((i) => [i.el + i.d, i])).values()];
    lines.push(`  [${t}] ${uniq.length}건`);
    for (const i of uniq.slice(0, 6)) lines.push(`     ${i.el}  ${i.d}`);
    if (uniq.length > 6) lines.push(`     … 외 ${uniq.length - 6}건`);
  }
}
const head = `\n═══ UI 감사 — 화면 ${targets.length} × 폭 ${WIDTHS.join('/')} ═══\n총 ${total}건\n` +
  Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `  ${t}: ${n}`).join('\n');
console.log(`실제로 연 화면 ${opened}/${expected}`);
for (const [k, v] of statTally) {
  console.log(v === 0
    ? `⚠️ ${k} 검사 대상이 **0개**다 — selectors.${k} 가 이 프로젝트와 안 맞는다 (검사가 사실상 꺼져 있다)`
    : `· ${k} 검사 대상 ${v}개`);
}
console.log(head);
console.log(lines.join('\n'));
mkdirSync('.ui-audit', { recursive: true });
writeFileSync('.ui-audit/ui.txt', head + '\n' + lines.join('\n'));
console.log('\n→ .ui-audit/ui.txt 에 저장');

// CI 가 막을 수 있도록 종료코드를 낸다.
// tap-touch 는 WCAG AAA·모바일 권고라 '경고'로 두고, 나머지는 전부 실패로 본다.
if (opened !== expected) {
  console.error(`\n✗ ${expected}회 중 ${opened}회만 화면이 열렸다 — 나머지는 검사되지 않았다`);
  process.exitCode = 1;
}
const ADVISORY = new Set(cfg.advisory);
const blocking = Object.entries(byType).filter(([t]) => !ADVISORY.has(t));
if (blocking.length) {
  console.error(`\n✗ 막아야 할 결함 ${blocking.reduce((a, [, n]) => a + n, 0)}건: ${blocking.map(([t, n]) => `${t} ${n}`).join(', ')}`);
  process.exitCode = 1;
} else {
  const warn = byType['tap-touch'] || 0;
  console.log(warn ? `\n✓ 막아야 할 결함 없음 (44px 권고 미달 ${warn}건은 경고)` : '\n✓ 결함 없음');
}
