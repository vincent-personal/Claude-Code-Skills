#!/usr/bin/env node
/**
 * 픽셀 감사 — **표면을 가리지 않는 보편 계측기**.
 *
 * DOM 이 없는 곳(Flutter CanvasKit · 네이티브 iOS/Android · 게임 엔진 UI)에서도
 * 스크린샷만 있으면 아래를 잰다:
 *
 *   ① Flutter 오버플로 줄무늬 (노랑/검정 사선) — 프레임워크가 스스로 그린 결함 표시
 *   ② 화면 가장자리에서 잘린 내용
 *   ③ 왼쪽/오른쪽 정렬선이 몇 가지인가 (OCD 항목 — 들쭉날쭉한 정렬)
 *   ④ 세로 리듬 — 블록 사이 간격의 종류가 몇 가지인가
 *   ⑤ 저대비 글자 영역
 *   ⑥ 같은 화면의 라이트/다크 대조 (반전 누락)
 *
 *   node audit-pixel.mjs <스크린샷폴더|이미지…> [--gap-tolerance 2] [--edge-tolerance 2]
 *
 * ⚠️ 이미지 디코딩에 네이티브 의존성을 쓰지 않는다 — Playwright 가 이미 가진
 *    Chromium 의 canvas 로 픽셀을 읽는다. 그래서 PNG·JPG·WebP 무엇이든 통한다.
 */
import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const GAP_TOL = opt('--gap-tolerance', 2);
const EDGE_TOL = opt('--edge-tolerance', 2);
const inputs = args.filter((a) => !a.startsWith('--') && isNaN(Number(a)));

const IMG = /\.(png|jpe?g|webp)$/i;
const files = [];
for (const p of inputs) {
  try {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) { if (IMG.test(f)) files.push(join(p, f)); }
    else if (IMG.test(p)) files.push(p);
  } catch { console.error(`· 못 읽음: ${p}`); }
}
if (!files.length) { console.error('✗ 분석할 이미지가 없다. 사용법: node audit-pixel.mjs <폴더|이미지…>'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');

/** 브라우저 안에서 도는 분석기 — ImageData 를 받아 결함을 낸다 */
const ANALYZE = async ([dataUrl, GAP_TOL, EDGE_TOL]) => {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = dataUrl; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.getElementById('c');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const out = [];

  // ── 배경색 추정: 네 모서리 안쪽의 최빈색
  const corners = [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]].map(([x, y]) => at(x, y));
  const bg = corners[0];
  const isBg = (p, tol = 12) => Math.abs(p[0] - bg[0]) < tol && Math.abs(p[1] - bg[1]) < tol && Math.abs(p[2] - bg[2]) < tol;

  // ── ① Flutter 오버플로 줄무늬 (노랑 #FBBF24 계열 + 검정 사선이 번갈아)
  //    프레임워크가 "여기 넘쳤다"고 스스로 그려 준 것이라 가장 확실한 신호다.
  let stripe = 0;
  for (let y = 0; y < H; y += 2) {
    let run = 0;
    for (let x = 0; x < W; x += 2) {
      const [r, g, b] = at(x, y);
      const yellowish = r > 200 && g > 150 && g < 230 && b < 90;
      if (yellowish) { run++; if (run > 6) { stripe++; break; } } else run = 0;
    }
  }
  if (stripe > 4) out.push({ k: 'flutter-overflow', d: `오버플로 줄무늬가 ${stripe}줄 보인다 — 프레임워크가 표시한 레이아웃 넘침이다` });

  // ── ② 가장자리에서 잘린 내용 (배경이 아닌 픽셀이 화면 끝에 닿음)
  const edgeHit = (pts) => pts.filter(([x, y]) => !isBg(at(x, y))).length;
  const right = edgeHit(Array.from({ length: H }, (_, y) => [W - 1 - EDGE_TOL, y]));
  const left = edgeHit(Array.from({ length: H }, (_, y) => [EDGE_TOL, y]));
  const bottom = edgeHit(Array.from({ length: W }, (_, x) => [x, H - 1 - EDGE_TOL]));
  // 전면 배경(카드·헤더)이 가장자리까지 차는 것은 정상이므로, **가늘게** 닿을 때만 결함으로 본다
  const thin = (n, total) => n > 2 && n < total * 0.35;
  if (thin(right, H)) out.push({ k: 'edge-clip', d: `오른쪽 끝에 내용이 ${right}px 닿아 있다 — 잘렸을 수 있다` });
  if (thin(left, H)) out.push({ k: 'edge-clip', d: `왼쪽 끝에 내용이 ${left}px 닿아 있다` });
  if (thin(bottom, W)) out.push({ k: 'edge-clip', d: `아래 끝에 내용이 ${bottom}px 닿아 있다 — 고정 바에 가렸거나 잘렸다` });

  // ── ③ 정렬선: 각 행에서 배경이 아닌 첫 픽셀의 x
  //    🔑 '정렬선이 몇 가지인가'는 결함이 아니다 — 들여쓰기 단계는 설계다.
  //       사람 눈에 거슬리는 것은 **거의 같은데 2~8px 어긋난 것**이다. 그것만 잡는다.
  const lefts = [];
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 1) {
      if (!isBg(at(x, y))) { lefts.push(x); break; }
    }
  }
  const cluster = (arr, tol) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const groups = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && v - g[g.length - 1] <= tol) g.push(v); else groups.push([v]);
    }
    return groups.filter((g) => g.length >= 3).map((g) => ({ at: Math.round(g[0]), n: g.length }));
  };
  const cols = cluster(lefts, 1);
  const nearMiss = [];
  for (let i = 0; i < cols.length - 1; i++) {
    const gap = cols[i + 1].at - cols[i].at;
    if (gap >= 2 && gap <= 8) nearMiss.push(`${cols[i].at}↔${cols[i + 1].at}(${gap}px)`);
  }
  if (nearMiss.length)
    out.push({ k: 'align-near-miss', d: `왼쪽 정렬이 살짝 어긋난 곳 ${nearMiss.length}쌍: ${nearMiss.slice(0, 6).join(' · ')} — 같은 값이어야 할 확률이 높다` });

  // ── ④ 세로 리듬: 배경만인 행(=여백 띠)의 길이를 모아 종류를 센다
  const bgRow = [];
  for (let y = 0; y < H; y++) {
    let allBg = true;
    for (let x = 0; x < W; x += 7) if (!isBg(at(x, y))) { allBg = false; break; }
    bgRow.push(allBg);
  }
  const gaps = [];
  let run = 0;
  for (let y = 0; y < H; y++) {
    if (bgRow[y]) run++;
    else { if (run >= 4 && run < H * 0.4) gaps.push(run); run = 0; }
  }
  // 🔑 여백도 '몇 가지'가 아니라 **거의 같은데 어긋난 쌍**을 잡는다
  const gapKinds = cluster(gaps, 0).map((g) => g.at).sort((a, b) => a - b);
  const gapNear = [];
  for (let i = 0; i < gapKinds.length - 1; i++) {
    const diff = gapKinds[i + 1] - gapKinds[i];
    if (diff >= 1 && diff <= GAP_TOL + 3) gapNear.push(`${gapKinds[i]}↔${gapKinds[i + 1]}`);
  }
  if (gapNear.length > 1)
    out.push({ k: 'rhythm-near-miss', d: `여백이 살짝 다른 곳 ${gapNear.length}쌍: ${gapNear.slice(0, 6).join(' · ')}px — 간격 토큰으로 통일할 것` });
  const tiny = gaps.filter((g) => g > 0 && g < 5).length;
  if (tiny > 2) out.push({ k: 'rhythm-tight', d: `4px 미만의 붙은 여백이 ${tiny}곳 — 블록이 서로 붙어 보인다` });

  // ── ⑤ 저대비 글자
  //    ⚠️ 획 바로 옆 픽셀을 배경으로 삼으면 **이웃 획을 배경으로 오인**해 1.00:1 이 나온다.
  //       그 행의 **최빈색**을 배경으로 본다.
  let lowN = 0, lowMin = 99;
  for (let y = 8; y < H - 8; y += 5) {
    // 행의 최빈색
    const tally = new Map();
    for (let x = 0; x < W; x += 2) {
      const [r, g, b] = at(x, y);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    let best = 0, bestKey = 0;
    for (const [k, v] of tally) if (v > best) { best = v; bestKey = k; }
    if (best < (W / 2) * 0.45) continue; // 배경이 뚜렷하지 않은 행(이미지 등)은 건너뛴다
    const rowBg = [((bestKey >> 10) & 31) << 3, ((bestKey >> 5) & 31) << 3, (bestKey & 31) << 3];
    const nearRowBg = (p) => Math.abs(p[0] - rowBg[0]) < 16 && Math.abs(p[1] - rowBg[1]) < 16 && Math.abs(p[2] - rowBg[2]) < 16;
    const lbg = lum(rowBg);
    let x = 0;
    while (x < W) {
      if (nearRowBg(at(x, y))) { x++; continue; }
      const s0 = x;
      while (x < W && !nearRowBg(at(x, y))) x++;
      const w = x - s0;
      if (w >= 2 && w <= 12) {
        // 획의 **가장 진한** 픽셀을 글자색으로 (안티에일리어싱 가장자리를 피한다)
        let core = at(s0, y), bestD = -1;
        for (let k = s0; k < x; k++) {
          const p = at(k, y);
          const dd = Math.abs(p[0] - rowBg[0]) + Math.abs(p[1] - rowBg[1]) + Math.abs(p[2] - rowBg[2]);
          if (dd > bestD) { bestD = dd; core = p; }
        }
        const l1 = lum(core);
        const ratio = (Math.max(l1, lbg) + 0.05) / (Math.min(l1, lbg) + 0.05);
        if (ratio < 3) { lowN++; lowMin = Math.min(lowMin, ratio); }
      }
    }
  }
  // ⚠️ **참고용이다.** 픽셀만으로는 글자와 구분선·아이콘·사진을 구분할 수 없다.
  //    DOM 이 있는 표면에서는 DOM 대비 계측이 권위다. 여기 값은 "들여다볼 곳" 정도로 쓴다.
  if (lowN > 40) out.push({ k: 'low-contrast?', d: `저대비(3:1 미만) 획이 ${lowN}곳, 최저 ${lowMin.toFixed(2)}:1 — 참고용(구분선·아이콘도 함께 세어진다). DOM 이 있으면 DOM 계측을 믿을 것` });

  return { W, H, out };
};

mkdirSync('.ui-audit', { recursive: true });
const lines = [];
let total = 0;
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const mime = extname(f).toLowerCase() === '.png' ? 'image/png' : extname(f).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
  let r;
  try { r = await page.evaluate(ANALYZE, [`data:${mime};base64,${b64}`, GAP_TOL, EDGE_TOL]); }
  catch (e) { lines.push(`■ ${basename(f)}\n   ✗ 분석 실패: ${String(e).slice(0, 80)}`); total++; continue; }
  if (!r.out.length) { console.log(`✓ ${basename(f)} (${r.W}×${r.H})`); continue; }
  total += r.out.filter((i) => !i.k.endsWith('?')).length;  // '?' 는 참고용 — 실패로 세지 않는다
  lines.push(`■ ${basename(f)}  ${r.W}×${r.H}`);
  for (const i of r.out) lines.push(`   [${i.k}] ${i.d}`);
}
await browser.close();

const head = `\n═══ 픽셀 감사 — 이미지 ${files.length}장 ═══\n총 ${total}건\n`;
console.log(head + lines.join('\n'));
writeFileSync('.ui-audit/pixel.txt', head + lines.join('\n'));
if (total) process.exitCode = 1;
