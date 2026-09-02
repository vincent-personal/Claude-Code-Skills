#!/usr/bin/env node
/**
 * 실제로 돌고 있는 앱을 크롤해 **도달 가능한 URL 전수**를 찾는다.
 *
 *   node crawl.mjs http://localhost:4499 [최대개수]
 *
 * 정적 분석(detect.mjs)이 못 푸는 것을 푼다:
 *  · 중첩 라우트 조립 (`:id` → `/product/1042/edit` 같은 실제 경로)
 *  · 파라미터의 **실제 값** (링크에 이미 채워져 있다)
 *  · 파일 기반 라우팅의 동적 세그먼트
 *
 * 찾은 URL 을 ui-audit.config.json 의 screens 에 **합쳐 준다**(덮어쓰지 않는다).
 * ⚠️ 링크로 닿지 않는 화면(딥링크 전용·조건부)은 못 찾는다 — 사람이 보태야 한다.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4499';
const MAX = Number(process.argv[3] || 200);
const CFG = process.env.UI_AUDIT_CONFIG || 'ui-audit.config.json';

const norm = (u) => {
  try {
    const x = new URL(u, BASE);
    if (x.origin !== new URL(BASE).origin) return null;
    // 프래그먼트는 시트·오버레이라 별도 관리한다 — 여기서는 경로만 모은다
    return (x.pathname.replace(/\/+$/, '') || '/') + (x.search || '');
  } catch { return null; }
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const seen = new Set(['/']);
const queue = ['/'];
const ok = [];
const dead = [];

while (queue.length && ok.length < MAX) {
  const path = queue.shift();
  let res;
  try { res = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 }); }
  catch { dead.push([path, '이동 실패']); continue; }
  if (res && res.status() >= 400) { dead.push([path, `HTTP ${res.status()}`]); continue; }
  ok.push(path);
  process.stderr.write('.');

  // ① 앵커 · ② 라우터 링크 속성 · ③ data-* 로 심어 둔 경로
  const found = await page.evaluate(() => {
    const out = new Set();
    for (const a of document.querySelectorAll('a[href]')) out.add(a.getAttribute('href'));
    for (const a of document.querySelectorAll('[routerLink],[href],[to],[data-href]')) {
      for (const k of ['routerLink', 'href', 'to', 'data-href']) {
        const v = a.getAttribute(k);
        if (v) out.add(v);
      }
    }
    return [...out].filter(Boolean);
  });
  for (const raw of found) {
    if (/^(https?:|mailto:|tel:|javascript:|#)/.test(raw)) continue;
    const n = norm(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    queue.push(n);
  }
}
await b.close();

console.log(`\n═══ 크롤 결과 ═══`);
console.log(`도달 ${ok.length}개 · 실패 ${dead.length}개`);
dead.forEach(([u, w]) => console.log(`  ✗ ${u} — ${w}`));

if (existsSync(CFG)) {
  const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
  const have = new Set((cfg.screens || []).map((s) => s.url));
  const added = ok.filter((u) => !have.has(u)).map((u) => ({ name: u, url: u }));
  // 파라미터가 안 채워진 기존 항목은 크롤이 실물을 찾았으므로 걷어낸다
  cfg.screens = [
    ...(cfg.screens || []).filter((s) => !/[:[]/.test(s.url)),
    ...added,
  ].sort((a, b2) => a.url.localeCompare(b2.url));
  writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`✓ ${CFG} 의 screens 를 ${cfg.screens.length}개로 갱신 (새로 ${added.length}개)`);
} else {
  console.log('· config 가 없어 화면 목록만 출력한다:');
  ok.forEach((u) => console.log('   ', u));
}
console.log(`\n⚠️ 링크로 닿지 않는 화면(딥링크 전용·조건부 분기)은 크롤이 못 찾는다. 직접 보탤 것.`);
