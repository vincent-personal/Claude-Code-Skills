#!/usr/bin/env node
/**
 * 감사 전용 정적 미리보기 서버.
 * ⚠️ 전하의 dev 서버(4400)를 건드리지 않기 위해 **별도 포트**에 띄운다.
 *   node scripts/preview-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = Number(process.argv[2] || 4499);
const ROOT = 'dist/goeasy-buyer/browser';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = join(ROOT, url);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const idx = join(ROOT, url.replace(/\/$/, ''), 'index.html');
    file = existsSync(idx) ? idx : join(ROOT, 'index.csr.html');
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}  (root=${ROOT})`));
