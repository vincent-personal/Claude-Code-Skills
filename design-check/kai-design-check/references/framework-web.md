# Angular · React · Vue · Next — 고유 함정

## Angular

### W1. `:host { display: contents }` 🔴
컴포넌트 호스트에 상자가 없어 `my-button { width: 100% }` 같은 부모 스타일이
**오류 없이 조용히 무시**된다. 실제 상자를 준다.

### W2. 뷰 캡슐화 때문에 자식 스타일이 안 먹음
`::ng-deep` 남용 대신 **CSS 변수**로 내려보낸다. `::ng-deep` 은 전역 누수다.

### W3. zoneless 에서 화면이 안 갱신됨
외부 콜백(`setTimeout`·구독·서드파티)에서 필드를 바꿔도 안 그려진다. `signal` 로 둔다.

### W4. `@for` 의 `track` 🔴
번역 문자열 금지(언어 전환 시 DOM 전파괴), **`$index` 도 안정 키가 아니다**.

### W5. SSR — 상태코드를 프레임워크가 덮어씀 🔴
`res.statusCode` 를 바꿔도 `writeResponseToNodeResponse` 가 `response.status` 로 덮는다.
**`Response` 객체 자체**를 다시 만든다.

### W6. `allowedHosts: []` 가 SSR 서버를 전부 400 으로 막음 🔴
`angular.json` 의 `security.allowedHosts` 가 비면 **빌드된 서버도** 모든 요청을 거부한다.

### W7. `RenderMode.Prerender` 기본값
CLI 가 `{ path:'**', renderMode: Prerender }` 를 만든다. 동적 경로가 있으면 빌드가 깨지거나
서버 렌더가 안 된다. 경로별로 갈라 준다.

---

## React · Next

### W8. `key` 에 index
Angular 의 `track $index` 와 같은 문제. 목록이 바뀌면 입력값·포커스가 다른 행으로 샌다.

### W9. Portal 오버레이의 z-index / 스크롤 잠금
`createPortal` 로 body 에 붙이면 부모의 stacking context 를 벗어난다.
겹칠 때를 반드시 시험한다(§겹침 감사).

### W10. `useEffect` 정리 누락
타이머·구독·이벤트 리스너를 `return () => …` 로 정리한다.

### W11. Next 이미지·폰트 최적화가 CLS 를 만듦
`next/image` 에 `width`/`height` 또는 `fill` + `sizes` 를 준다.
`next/font` 로 폰트를 self-host 하면 로드 후 밀림이 사라진다.

### W12. 하이드레이션 불일치
서버/클라이언트가 다른 것을 그리면 레이아웃이 튄다.
`typeof window` 분기·`Date.now()`·랜덤을 렌더에 쓰지 않는다.

---

## Vue · Nuxt

### W13. scoped 스타일이 자식 루트에만 적용
`:deep()` 을 쓰되 범위를 좁힌다.

### W14. `v-for` 의 `:key`
위와 동일.

---

## 공통 (모든 웹)

### W15. 하단 고정 바의 `translateX(-50%)` 🔴
등장 애니메이션의 `transform` 과 충돌해 바가 화면 밖으로 나간다.
`left:0;right:0;width:min(100%,var(--col));margin-inline:auto`.

### W16. 인라인 `<a>` 의 패딩이 줄 높이에 반영 안 됨
히트영역이 위아래로 겹친다. `display: block`.

### W17. 격자/플렉스 자식의 `min-width: auto`
내용이 칸보다 넓으면 칸이 늘어나 `1fr 1fr` 이 무색해진다. `min-width: 0`.

### W18. `minmax(320px, 1fr)`
좁은 화면에서 최소값이 남은 폭보다 크다. `minmax(min(320px, 100%), 1fr)`.

### W19. `100vh` 가 모바일에서 틀림
주소창 때문에 실제보다 크다. **`100dvh`**.

### W20. `overflow: hidden` 은 결함을 숨긴 것일 수도
"잘린 게 안 보인다"와 "잘리지 않았다"는 다르다. 긴 값으로 눌러 본다.
