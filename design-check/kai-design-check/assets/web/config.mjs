/** 프로젝트별 설정을 읽는다. 없으면 최소 기본값으로 돈다. */
import { readFileSync, existsSync } from 'node:fs';

const DEFAULTS = {
  port: 4499,
  buildCommand: 'npm run build',
  distDir: 'dist',
  ssrEntry: null,
  widths: [320, 390, 768, 1440],
  shortViewportAt: 320,
  themes: [{ name: 'default' }],
  selectors: { appRoot: 'body', main: 'main, [role=main]', scrim: '[aria-modal=true]' },
  screens: [],
  overlays: [],
  stacks: [],
  modalPanels: '[role=dialog], [role=alertdialog]',
  advisory: ['tap-touch'],
  unknownUrls: ['/definitely-not-a-real-route'],
};

const path = process.env.UI_AUDIT_CONFIG || 'ui-audit.config.json';
let user = {};
if (existsSync(path)) {
  user = JSON.parse(readFileSync(path, 'utf8'));
  for (const k of Object.keys(user)) if (k.startsWith('$')) delete user[k];
} else {
  console.error(`⚠️  ${path} 이 없다. 기본값으로 돈다 — 화면 목록이 비어 아무것도 검사하지 못한다.`);
}
export const cfg = { ...DEFAULTS, ...user, selectors: { ...DEFAULTS.selectors, ...(user.selectors || {}) } };
export const BASE = process.argv[2] || `http://localhost:${cfg.port}`;

/**
 * 테마/모드를 적용한다.
 *  cookie · attr(data-*) · class · **url**(?ionic:mode=ios 같은 쿼리 접미사)
 * Ionic 은 iOS/Material 모드가 패딩·높이가 달라 **양쪽을 다 재야** 한다.
 */
export function themeQuery(theme) {
  return theme && theme.url ? theme.url : '';
}
export async function applyTheme(page, base, theme) {
  if (!theme || theme.name === 'default') return;
  if (theme.cookie) {
    await page.context().addCookies([{ ...theme.cookie, url: base }]);
  }
  if (theme.attr) {
    await page.addInitScript(
      ([k, v]) => document.documentElement.setAttribute(k, v),
      [theme.attr.name, theme.attr.value],
    );
  }
  if (theme.class) {
    await page.addInitScript((c) => document.documentElement.classList.add(c), theme.class);
  }
}
