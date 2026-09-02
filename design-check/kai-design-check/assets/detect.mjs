#!/usr/bin/env node
/**
 * Step 0 자동 조사 — 프로젝트를 훑어 `ui-audit.config.json` 초안을 만든다.
 *
 *   node detect.mjs [프로젝트경로]
 *
 * 프레임워크·빌드 명령·산출물 경로·라우트·테마 방식·사용 중인 포트를 **코드에서** 읽는다.
 * 추측한 항목은 `"?"` 로 표시해 사람이 확인하게 한다.
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
const has = (p) => existsSync(join(ROOT, p));
const pkg = (() => { try { return JSON.parse(read('package.json') || '{}'); } catch { return {}; } })();
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

// ── 프레임워크 판별
let fw = 'unknown';
if (deps['@ionic/angular'] || deps['@ionic/react'] || deps['@ionic/vue']) fw = 'ionic';
else if (deps['next']) fw = 'next';
else if (deps['nuxt']) fw = 'nuxt';
else if (deps['@angular/core']) fw = 'angular';
else if (deps['react']) fw = 'react';
else if (deps['vue']) fw = 'vue';
else if (deps['svelte']) fw = 'svelte';
if (has('pubspec.yaml')) fw = 'flutter';

// ── 빌드 명령 · 산출물
const scripts = pkg.scripts || {};
let buildCommand = scripts.build ? 'npm run build' : 'npx ng build';
if (fw === 'flutter') buildCommand = 'flutter build web';

const findDist = () => {
  const guesses = ['dist/browser', 'dist', 'build', 'out', '.next', 'www', 'build/web', 'public'];
  for (const g of guesses) {
    if (!has(g)) continue;
    if (has(join(g, 'index.html')) || has(join(g, 'index.csr.html'))) return g;
    try {
      for (const e of readdirSync(join(ROOT, g))) {
        const sub = join(g, e);
        if (statSync(join(ROOT, sub)).isDirectory() && (has(join(sub, 'index.html')) || has(join(sub, 'browser', 'index.html'))))
          return has(join(sub, 'browser', 'index.html')) ? join(sub, 'browser') : sub;
      }
    } catch {}
  }
  return '?';
};

// ── SSR 엔트리
const findSsr = () => {
  for (const g of ['dist', 'build', '.next']) {
    if (!has(g)) continue;
    const stack = [g];
    while (stack.length) {
      const d = stack.pop();
      let ents = [];
      try { ents = readdirSync(join(ROOT, d), { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const p = join(d, e.name);
        if (e.isDirectory() && stack.length < 40) stack.push(p);
        else if (/^server\.m?js$/.test(e.name)) return p;
      }
    }
  }
  return null;
};

// ── 라우트 수집
const walk = (dir, out = [], depth = 0) => {
  if (depth > 8) return out;
  let ents = [];
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (['node_modules', '.git', 'dist', 'build', '.next', 'www', '.angular'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (/\.(ts|tsx|js|jsx|vue|svelte)$/.test(e.name)) out.push(p);
  }
  return out;
};
const files = walk('src').concat(has('app') ? walk('app') : []);
const routes = new Set();
for (const f of files) {
  const s = read(f);
  if (!/route|Route/.test(s)) continue;
  for (const m of s.matchAll(/path:\s*'([^']*)'/g)) routes.add(m[1]);
  for (const m of s.matchAll(/<Route[^>]*path=["']([^"']+)["']/g)) routes.add(m[1]);
}
// Next/Nuxt 는 파일 기반
if (fw === 'next' || fw === 'nuxt') {
  const pagesDir = has('app') ? 'app' : has('pages') ? 'pages' : has('src/pages') ? 'src/pages' : null;
  if (pagesDir) for (const f of walk(pagesDir))
    if (/\/(page|index)\.(tsx?|jsx?|vue)$/.test(f))
      routes.add('/' + relative(pagesDir, f).replace(/\/?(page|index)\.\w+$/, ''));
}

// ── 테마 방식
const allSrc = files.slice(0, 400).map(read).join('\n') + read('src/index.html') + read('index.html');
let themes = [{ name: 'default' }];
if (/data-theme/.test(allSrc)) themes = [
  { name: 'light', attr: { name: 'data-theme', value: 'light' } },
  { name: 'dark', attr: { name: 'data-theme', value: 'dark' } },
];
else if (/classList\.(add|toggle)\(['"]dark/.test(allSrc) || /\bdark:/.test(allSrc)) themes = [
  { name: 'light' }, { name: 'dark', class: 'dark' },
];
// 🔑 Ionic 은 iOS/Material 모드가 패딩·높이·폰트가 달라 **양쪽을 다 재야** 한다.
if (fw === 'ionic') {
  const darkClass = /ion-palette-dark/.test(allSrc) ? 'ion-palette-dark' : 'dark';
  themes = [
    { name: 'ios-light', url: '?ionic:mode=ios' },
    { name: 'md-light', url: '?ionic:mode=md' },
    { name: 'ios-dark', url: '?ionic:mode=ios', class: darkClass },
    { name: 'md-dark', url: '?ionic:mode=md', class: darkClass },
  ];
}

// ── 앱 루트 선택자
const appRoot = fw === 'angular' || fw === 'ionic'
  ? (read('src/index.html').match(/<(app-[\w-]+)/)?.[1] || 'app-root')
  : fw === 'next' ? '#__next, body > div' : '#root, #app, body > div';

// ── 사용 중인 포트 (감사 포트가 비켜가야 한다)
const used = new Set();
for (const m of (read('angular.json') + JSON.stringify(scripts) + read('vite.config.ts') + read('vite.config.js')).matchAll(/port["'\s:=]+(\d{4,5})/g))
  used.add(Number(m[1]));
let port = 4499;
while (used.has(port)) port += 1;

const cfg = {
  $생성: `kai-design-check detect.mjs 자동 생성 — "?" 는 사람이 확인해야 한다`,
  $framework: fw,
  port,
  buildCommand,
  distDir: findDist(),
  ssrEntry: findSsr(),
  srcDir: has('src') ? 'src' : has('lib') ? 'lib' : '.',
  widths: [320, 390, 768, 1440],
  shortViewportAt: 320,
  themes,
  selectors: {
    appRoot,
    main: fw === 'ionic' ? 'ion-content, main, [role=main]' : 'main, [role=main]',
    scrim: fw === 'ionic' ? 'ion-backdrop, [aria-modal=true]' : '[aria-modal=true], .scrim, [data-scrim]',
    // '요소는 있는데 덮여 보이지 않음' 검사 대상. **프로젝트의 실제 앱바 선택자를 넣어야 한다.**
    // 안 맞으면 검사가 조용히 0건이 되므로, audit-ui 가 대상 수를 찍어 알려 준다.
    landmarks: (fw === 'ionic' ? 'ion-header, ' : '') +
      'header, nav, [role=banner], [role=navigation], [role=search],' +
      [...new Set([...allSrc.matchAll(/<(app-[\w-]*(?:top-?bar|app-?bar|header|nav)[\w-]*)/gi)].map((m) => m[1].toLowerCase()))].join(', ') ||
      'header, nav, [role=banner]',
  },
  modalPanels: fw === 'ionic'
    ? 'ion-modal, ion-popover, ion-action-sheet, ion-alert, [role=dialog], [role=alertdialog]'
    : '[role=dialog], [role=alertdialog], .sheet, .modal, .drawer',
  screens: [...routes]
    .filter((r) => r && r !== '**' && !r.includes('*'))
    .map((r) => ({ name: r || '/', url: r.startsWith('/') ? r : '/' + r, $파라미터확인: /:|\[/.test(r) || undefined }))
    .sort((a, b) => a.url.localeCompare(b.url)),
  overlays: [],
  stacks: [],
  advisory: ['tap-touch'],
  unknownUrls: ['/definitely-not-a-real-route'],
};

const OUT = process.env.UI_AUDIT_CONFIG || join(ROOT, 'ui-audit.config.json');
writeFileSync(OUT, JSON.stringify(cfg, null, 2) + '\n');
console.log(`✓ ${OUT} 생성`);
console.log(`  프레임워크 ${fw} · 포트 ${port} · dist ${cfg.distDir} · SSR ${cfg.ssrEntry || '아님'}`);
console.log(`  라우트 ${cfg.screens.length}개 · 테마 ${themes.map((t) => t.name).join('/')}`);
console.log(`\n⚠️ 반드시 사람이 확인할 것:`);
console.log(`  · "?" 로 표시된 항목`);
console.log(`  · $파라미터확인 이 붙은 라우트 — :id·[slug] 를 **실제 값**으로 바꿔야 한다`);
console.log(`  · overlays / stacks 는 비어 있다 — 시트·모달·서랍을 직접 채워야 검사된다`);
