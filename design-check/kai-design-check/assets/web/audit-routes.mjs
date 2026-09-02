#!/usr/bin/env node
/* 라우트 이중 관리 감시 + SSR 상태코드 검증.
 *
 * ⚠️ `app.routes.ts`(앱 라우트)와 `server.ts` 의 `KNOWN`(SSR 이 404 를 안 내는 목록)은
 *    사람이 손으로 맞춰야 한다. 새 화면을 앱에만 추가하면 **화면은 잘 나오는데 HTTP 404**
 *    가 되는 반대 방향의 결함이 생긴다. 그것을 여기서 막는다.
 *
 * 빌드된 SSR 서버를 직접 띄워 실제 상태코드를 잰다 (preview 서버는 CSR 대체본이라 못 잰다).
 */
import { spawn } from 'node:child_process';
import { cfg } from './config.mjs';

const PORT = cfg.port + 4;
if (!cfg.ssrEntry) {
  console.log('· config 에 ssrEntry 가 없다 — SSR 상태코드 검사를 건너뛴다 (SSR 이 아니면 정상)');
  process.exit(0);
}
const urls = [...new Set(cfg.screens.map((s) => s.url.split('#')[0].split('?')[0]))];

const proc = spawn('node', [cfg.ssrEntry], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const stop = () => { try { proc.kill(); } catch {} };
process.on('exit', stop);

let ready = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (await fetch(`http://localhost:${PORT}/`).then((r) => r.status < 500).catch(() => false)) { ready = true; break; }
}
if (!ready) { console.error(`✗ SSR 서버가 뜨지 않았다 — ${cfg.ssrEntry} 를 확인하고 먼저 빌드하라`); stop(); process.exit(1); }

const bad = [];
let checked = 0;
for (const u of urls) {
  const st = await fetch(`http://localhost:${PORT}${u}`).then((r) => r.status).catch(() => 0);
  checked++;
  if (st !== 200) bad.push(`${u} → HTTP ${st} (앱에는 있는데 SSR 이 200 을 주지 않는다 — 서버의 알려진-경로 목록을 확인하라)`);
}
// 없는 URL 은 반드시 404 여야 한다 (소프트 404 방지)
for (const u of cfg.unknownUrls) {
  const st = await fetch(`http://localhost:${PORT}${u}`).then((r) => r.status).catch(() => 0);
  if (st !== 404) bad.push(`${u} → HTTP ${st} (없는 URL 인데 404 가 아니다 — 소프트 404)`);
}
stop();

console.log(`\n═══ 라우트·SSR 상태코드 — 화면 ${checked}개 + 없는 URL 3개 ═══`);
console.log(bad.length ? `문제 ${bad.length}건` : '문제 0건');
bad.forEach((x) => console.log('  ✗ ' + x));
if (bad.length) process.exitCode = 1;
