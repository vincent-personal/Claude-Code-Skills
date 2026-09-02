import { chromium } from 'playwright';
import { go } from './nav.mjs';
import { cfg, BASE as B } from './config.mjs';
const b=await chromium.launch();
const ctx=await b.newContext({reducedMotion:'reduce',viewport:{width:1440,height:900}});
const p=await ctx.newPage();
let bad=0, opened=0;
const URLS = [...new Set(cfg.screens.map((x) => x.url))];
for (const u of URLS) {
  const nav = await go(p, B, u, cfg.selectors);
  if (!nav.ok) { bad++; console.log('✗', u, nav.why); continue; }
  opened++;
  await p.waitForTimeout(250);  // 애니메이션이 끝난 뒤에 잰다 (경합 방지)
  const r=await p.evaluate(()=>{
    const out=[];
    const name=(el)=>el.tagName.toLowerCase()+(el.className&&el.className.baseVal===undefined?'.'+String(el.className).slice(0,30):'');
    for (const el of document.querySelectorAll('body *')) {
      const cs=getComputedStyle(el);
      const rect=el.getBoundingClientRect();
      if (rect.height<=4) continue;
      const animated = cs.animationName!=='none';
      // ① fill-mode:both 로 opacity 0 에 갇힌 요소가 없어야 한다
      if (animated && parseFloat(cs.opacity)<0.9)
        out.push(`${name(el)} 가 보이지 않는다 (opacity ${cs.opacity})`);
      // ② 정책이 실제로 걸렸는가 — 길게 도는 애니메이션·전이가 남아 있으면 안 된다
      const dur=(v)=>Math.max(...String(v).split(',').map(x=>parseFloat(x)*(x.includes('ms')?1:1000)||0));
      if (animated && dur(cs.animationDuration)>100 && cs.animationIterationCount!=='infinite')
        out.push(`${name(el)} 애니메이션이 ${cs.animationDuration} 로 여전히 길다`);
      if (animated && cs.animationIterationCount==='infinite' && dur(cs.animationDuration)>100 && rect.width>2)
        out.push(`${name(el)} 가 무한 반복 애니메이션을 계속 돌린다 (${cs.animationDuration})`);
      if (cs.transitionProperty!=='none' && cs.transitionProperty!=='all' && dur(cs.transitionDuration)>100)
        out.push(`${name(el)} 전이가 ${cs.transitionDuration} 로 여전히 길다`);
    }
    if (getComputedStyle(document.documentElement).scrollBehavior==='smooth')
      out.push('문서의 scroll-behavior 가 여전히 smooth 다');
    return [...new Set(out)].slice(0,4);
  });
  if (r.length) { bad+=r.length; console.log('✗',u,r); }
}
if (opened !== URLS.length) { bad++; console.log(`✗ ${URLS.length}화면 중 ${opened}화면만 열렸다`); }
console.log(bad? `동작줄이기 문제 ${bad}건 (연 화면 ${opened}/${URLS.length})` : `✓ 동작 줄이기: ${opened}화면 모두 정상 표시된다`);
if (bad) process.exitCode = 1;
await b.close();
