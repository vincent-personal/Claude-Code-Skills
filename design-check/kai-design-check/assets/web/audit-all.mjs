#!/usr/bin/env node
/* 감사 일괄 실행 — 빌드가 최신인지 보장하고, **감사 전용** 서버(4499)를 직접 띄웠다 내린다.
   ⚠️ 전하의 dev 서버(4400)는 건드리지 않는다. 이 스크립트가 띄운 자식만 정리한다.
   예전에는 `audit:all` 이 이미 떠 있는 4499 를 조회하기만 해서,
   **낡은 dist** 나 **엉뚱한 앱**을 검사하고도 통과할 수 있었다. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { cfg } from './config.mjs';
const PORT = cfg.port;
const DIST = cfg.distDir;

const newestMtime = (dir) => {
  let t = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else t = Math.max(t, statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return t;
};

// ① 빌드가 소스보다 오래됐으면 다시 빌드한다
const srcT = newestMtime(cfg.srcDir || 'src');
const distT = existsSync(DIST) ? newestMtime(DIST) : 0;
if (distT < srcT) {
  console.log('· 빌드가 소스보다 낡았다 → 다시 빌드한다');
  const [bin, ...args] = cfg.buildCommand.split(' ');
  const r = spawnSync(bin, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('✗ 빌드 실패 — 감사를 진행하지 않는다'); process.exit(1); }
} else {
  console.log('· 빌드는 최신이다');
}

// ② 감사 전용 서버를 띄운다. 이미 누가 쓰고 있으면 **멈춘다** (엉뚱한 앱 검사 방지)
const inUse = await fetch(`http://localhost:${PORT}/`).then(() => true).catch(() => false);
if (inUse) {
  console.error(`✗ ${PORT} 를 이미 누군가 쓰고 있다. 무엇을 검사하는지 확신할 수 없어 멈춘다.`);
  console.error(`  (직접 띄운 감사 서버라면 내린 뒤 다시 실행하시라)`);
  process.exit(1);
}
const server = spawn('node', [new URL('./preview-server.mjs', import.meta.url).pathname, String(PORT), DIST], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });

// ③ 뜰 때까지 기다린다
let ready = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(`http://localhost:${PORT}/`).then((r) => r.ok).catch(() => false)) { ready = true; break; }
}
if (!ready) { console.error('✗ 감사 서버가 뜨지 않았다'); stop(); process.exit(1); }
console.log(`· 감사 서버 준비됨 :${PORT}\n`);

// ④ 감사기를 차례로 돌린다
const here = (f) => new URL(`./${f}`, import.meta.url).pathname;
const AUDITS = [
  ['화면 전수', 'audit-ui.mjs'],
  ['숨은 컴포넌트', 'audit-overlays.mjs'],
  ['오버레이 접근성', 'audit-a11y-overlay.mjs'],
  ['오버레이 겹침', 'audit-overlay-stack.mjs'],
  ['긴 값', 'audit-longtext.mjs'],
  ['동작 줄이기', 'audit-motion.mjs'],
  ['라우트·SSR 상태', 'audit-routes.mjs'],
];
let failed = [];
for (const [label, script] of AUDITS) {
  const r = spawnSync('node', [here(script), `http://localhost:${PORT}`], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(label);
}
stop();
console.log(`\n══════ 종합 ══════`);
console.log(failed.length ? `✗ 실패: ${failed.join(', ')}` : '✓ 모든 감사 통과');
process.exit(failed.length ? 1 : 0);
