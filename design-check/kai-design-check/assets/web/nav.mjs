/**
 * 감사기 공용 이동 헬퍼 — **거짓 통과를 막는 핵심 부품**.
 *
 * ⚠️ 두 가지를 동시에 만족해야 한다.
 *  1) 탐색 실패를 삼키면 안 된다. `catch { continue }` 로 넘기면 실패한 화면이
 *     조용히 사라져 **0개를 검사하고도 "0건 통과"** 가 나온다. 실제로 그렇게 되어 있었다.
 *  2) **프래그먼트만 다른 이동은 응답이 null 이다**(같은 문서 안 이동).
 *     응답 유무로 판정하면 `/orders` → `/orders#pay` 같은 정상 이동이 전부 오탐이 된다.
 *
 * 그래서 응답이 아니라 **결과 상태**로 본다: 앱이 붙어 있고, 최종 경로가 요청과 같은가.
 */
export async function go(page, base, url, selectors = {}, timeout = 20000) {
  const rootSel = selectors.appRoot || 'body';
  let res = null;
  try {
    res = await page.goto(base + url, { waitUntil: 'networkidle', timeout });
  } catch (e) {
    return { ok: false, why: `이동 실패 — ${String(e).slice(0, 70)}` };
  }
  if (res && res.status() >= 400) return { ok: false, why: `HTTP ${res.status()}` };

  const want = url.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
  const got = await page.evaluate((sel) => ({
    mounted: !!document.querySelector(sel) && document.body.children.length > 0,
    path: location.pathname.replace(/\/+$/, '') || '/',
  }), rootSel);
  if (!got.mounted) return { ok: false, why: `앱이 붙지 않았다 (${rootSel} 없음)` };
  if (got.path !== want) return { ok: false, why: `경로가 다르다 — 요청 ${want} · 실제 ${got.path}` };
  return { ok: true };
}
