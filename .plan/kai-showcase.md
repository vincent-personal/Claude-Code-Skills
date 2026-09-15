# kai-showcase 전역 스킬 신규 작성 — 작업 지침서

## 목표 (한 줄)
임의 프로젝트에서 `/kai-showcase` 를 부르면, 코드를 전수 분석해 초안을 채운 뒤 **사람만 아는 6가지만** 묻고,
기술 도면 · 비전문가용 도면 · LinkedIn 캐러셀 · Upwork 항목 · 케이스 스터디를 **PNG + Markdown 으로**
`<프로젝트>/showcase/` 에 산출한다. 산출 언어는 **영어 주 · 한국어 병기**.

---

## 흐름 추적 (실제로 열어 확인 완료)

| 단계 | 확인한 경로 | 사실 |
|---|---|---|
| 스킬 정의 | `Skills/design-check/kai-design-check/SKILL.md:1-6` | frontmatter 는 `name` + `description`(트리거 문구 포함) **2개만**. `allowed-tools` 는 이 저장소 실물에 **없다** — CLAUDE.md §3 은 권고이나 실물 관행을 따른다 |
| 본문 구조 | 같은 파일 `:8,33,61,87,147…` | `## 🔴 먼저 알 것` → `## 발동` → `## 역할` → `## ★ 원칙` → `## Phase 0..7` → `## Red Lines` 계열 |
| 에셋 참조 | 같은 파일 `:151,277,324` | SKILL.md 는 **`~/.claude/skills/<skill>/assets/...` 절대경로**로 부른다 (상대경로 아님) |
| 심링크 생성 | `Skills/design-check/install.sh:17-43` | `for skill in …` 루프가 `SKILL.md` 를 링크하고, `references/`·`assets/` 디렉터리가 **있을 때만** `ln -sfn` |
| 그룹 등록 | `Skills/README.md:6,32` / `Skills/CLAUDE.md:67,284-292` | README `## 스킬 그룹` 아래 `### <그룹>` 절, CLAUDE.md `## 현재 등록된 스킬 그룹` 아래. **양쪽 다** 필요 |
| 캡처 절차 | 2026-09-15 세션 실측 (OneVoice 안내문) | 아래 §캡처 함정 6가지 — 전부 실제로 밟았다 |

---

## 배선 체크 (5칸 — 이 작업의 진짜 연결선)

- **데이터 정의처**: `Skills/showcase/kai-showcase/SKILL.md` (스킬 본문) + `references/*.md` (규격·템플릿)
- **데이터 생산처**: `Skills/showcase/install.sh` — `~/.claude/skills/kai-showcase/` 에 심링크 3종 생성
- **★ 생산 호출 트리거 (최대 구멍)**:
  1. **사용자가 `bash /Volumes/KAIFACUN/Projects/Skills/showcase/install.sh` 를 직접 실행**해야 스킬이 뜬다.
     → 작업 완료 보고에 **이 명령을 반드시 안내**한다. 에이전트가 실행해도 되나, 새 세션을 열어야 목록에 뜬다.
  2. **`install.sh` 의 `for skill in kai-showcase` 목록 + `assets/`·`references/` 심링크 블록이 없으면**,
     SKILL.md 가 부르는 `~/.claude/skills/kai-showcase/assets/capture.sh` 는 **존재하지 않는 경로**가 된다.
     → design-check `install.sh:31-43` 의 두 `if [ -d ]` 블록을 **반드시 복제**한다.
  3. `capture.sh` 에 **실행 권한**(`chmod +x`)이 없으면 `bash capture.sh` 로만 돌아간다 → SKILL.md 호출문을 `bash <경로>` 로 통일한다.
- **데이터 소비처**: Claude Code 세션이 `~/.claude/skills/kai-showcase/SKILL.md` 를 읽어 발동
- **횡단 규칙**: 사극체 말투(전역) · 산출 언어 영어 주+한국어 병기 · Red Lines 절 필수 · README/CLAUDE.md **양쪽** 등록 · 워크트리 금지(git 루트에서만 수정)

---

## 파일별 변경 (체크박스)

### A. 그룹 뼈대
- [ ] `Skills/showcase/` 폴더 생성 → 검증: `ls -d` 성공
- [ ] `Skills/showcase/kai-showcase/{references,assets}/` 생성 → 검증: `find … -type d` 3줄

### B. 캡처 하네스 (★ 오늘 실측한 함정을 여기에 굳힌다)
- [ ] `Skills/showcase/kai-showcase/assets/capture.sh` 작성 → 검증: 아무 HTML 로 PNG 생성 성공
  - 인자: `capture.sh <input.html> <output.png> [--mode=page|fixed] [--size=WxH] [--scale=N]`
  - `--mode=page` (기본): 폭 1100 · 높이 3200 으로 찍고 **하단 여백 트림**
  - `--mode=fixed --size=1080x1350`: 캐러셀용 — **트림하지 않는다**
  - 내부 절차 (6함정 대응):
    1. **Artifact 스켈레톤 래퍼**를 임시 생성 — `<!doctype html><html lang="ko" data-theme="light">` + `body{margin:0;background:#fafaf9}` + viewport `viewport-fit=cover`. 감싸지 않으면 화면과 다르게 나온다.
       래퍼가 **함께 강제할 것** (교차검증 지적 — 전부 캡처 흔들림의 원인):
       - `data-theme="light"` 로 테마 고정 (시스템이 다크면 다크로 찍힌다)
       - `*{animation-play-state:paused !important; transition:none !important}` — 애니메이션 중간 상태 캡처 방지
       - 본문 끝 인라인 스크립트: `document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.loading='eager')`
         + `document.getAnimations?.().forEach(a=>{try{a.finish()}catch(e){}})` — lazy 이미지 빈칸·애니메이션 중간 상태 제거
    2. Chrome 경로: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (없으면 중단하고 보고)
    3. **`--user-data-dir=<임시>` 필수** — 사용자가 쓰는 Chrome 을 건드리지 않는다
    4. 플래그: `--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --force-device-scale-factor=2 --virtual-time-budget=10000 --timeout=15000`
       - `--hide-scrollbars` 는 **fixed 모드에서 특히 필수** — 스크롤바 15px 가 껴서 1080 이 1065 로 렌더되는 사례가 있다
       - **웹폰트 레이스**: `--virtual-time-budget` 이 네트워크 대기를 포함하므로 Google Fonts 는 10초면 충분하다
         (2026-09-15 실측 — Noto Serif KR·IBM Plex Sans KR 정상 렌더). 그래도 **폴백 폰트로 찍혔거든 budget 을 올려 재캡처**한다.
         모든 `font-family` 에 **실제 폴백 스택**을 반드시 두어 최악의 경우에도 읽히게 한다
    5. **★ Chrome 이 캡처 후에도 종료되지 않는다(실측)** → **삼중 방어**로 막는다:
       ① `--timeout=15000` 을 함께 준다 — Chrome 이 그 시각에 스스로 찍고 끝낸다
       ② `&` 로 띄워 **`PID=$!` 로 PID 를 잡고**, PNG 가 생길 때까지 최대 30초 폴링 → `kill "$PID"`
       ③ **`pkill -f` 는 최후 수단으로만** — `kill -0 "$PID"` 로 아직 살아 있을 때에만 쓴다.
       ⚠️ `pkill -f "user-data-dir=…"` 를 1차 수단으로 쓰면 사용자가 띄운 다른 Chrome 을 죽일 수 있고,
       경로에 정규식 특수문자가 있으면 패턴이 어긋난다 (교차검증 지적)
       ④ PNG 가 생긴 뒤 **1초 대기**하고 kill — 쓰기 도중에 죽이면 깨진 PNG 가 남는다
    6. `--mode=page` 면 Python(Pillow)으로 **하단 단색 여백 트림** (배경색은 좌하단 픽셀에서 읽고, 20px 간격 샘플링, 아래 여백 140px 남김)
  - **playwright 로 `file:` 을 열지 않는다** — 차단된다(실측). Chrome 직접 호출만.
  - **의존성 사전 점검 (없으면 조용히 죽는다)**:
    - Chrome 없음 → **중단하고 사용자에게 보고** (대체 경로 없음)
    - `python3 -c "import PIL"` 실패 → **트림만 생략하고 캡처는 진행**, 경고 1줄 + `pip3 install pillow` 안내.
      트림 실패가 산출 전체를 막지 않게 한다
  - **`--batch <디렉터리>` 모드** (캐러셀 6~10장용): 디렉터리의 `*.html` 을 정렬 순서로 전부 캡처.
    ★ 프로필 디렉터리에 **파일 번호를 넣어**(`<tmp>/prof-01`) `pkill -f "user-data-dir=<그 경로>"` 가
    다른 슬라이드의 Chrome 을 죽이지 않게 한다. 장당 순차 실행(병렬 금지 — 8GB 맥에서 Chrome 10개는 위험)
- [ ] `chmod +x` → 검증: `ls -l` 에 `x` 비트

### C. 참조 문서 4종
- [ ] `references/channel-specs.md` — LinkedIn 캐러셀 **1080×1350(4:5) · 6~10장 · 1장 훅 · 끝 CTA** / Upwork **8초 스캔 · 미니 케이스 스터디 · 제목·역할·설명·스킬·미디어·썸네일 전 필드 · 제안서용 3종(관련/결과/프로세스)** / 리크루터 **깊이>넓이 · 아키텍처 도면 · 레이어별 트레이드오프 1개** + 출처 URL 6개
- [ ] `references/interview.md` — **자동 추출 목록**(스택·규모·기능·아키텍처·배포·기간·트레이드오프 후보) vs **사람에게만 물을 6개**(왜 시작/내 역할/고비/결과 수치/공개 범위/노리는 자리). 질문은 **초안을 보여준 뒤** 던진다. 무응답은 `🔶 확인필요` 로 남기고 진행
- [ ] `references/case-study.md` — **Problem → Approach → Process → Artifacts → Impact → Learnings** 템플릿, 레이어별 트레이드오프 문장틀, 영어 주/한국어 병기 형식
- [ ] `references/diagram-recipes.md` — ① **기술 도면**: 레인(브라우저/서버/외부 서비스/소비자) + 업스트림·다운스트림 색 분리 + 화살표 라벨에 실제 수치 ② **비전문가 도면**: 큰 세리프 번호 3단계 + 화면 스케치 + "알아두면 좋은 것" ③ **한국어 `word-break: keep-all` 필수**(조사 파절 방지 — 실측) ④ 라이트/다크 토큰 양쪽 정의, `body` 배경 명시
  ⑤ **★ 캐러셀 슬라이드 HTML 뼈대** — `html,body{height:100%;margin:0;overflow:hidden}` +
  슬라이드 루트 `width:1080px;height:1350px` 고정. 없으면 스크롤바·여백이 끼어 규격이 깨진다.
  1장=훅(프로젝트 한 줄 + 대표 도면) / 중간=문제·접근·기술·고비 / 끝=CTA. **캐러셀은 영어만**(§언어 규약)

### D. 스킬 본문
- [ ] `Skills/showcase/kai-showcase/SKILL.md` 작성 → 검증: frontmatter 2키 + 아래 절 전부 존재
  - frontmatter: `name: kai-showcase` / `description:`(트리거 `/kai-showcase [프로젝트경로]` 포함, "포트폴리오·레퍼런스·LinkedIn·Upwork·케이스 스터디" 어휘 포함)
  - `## 발동` — `/kai-showcase` · `/kai-showcase /path` · `--quick`(도면만) · `--text-only`(이미지 생략)
  - `## 역할`
  - `## ★ 원칙` — **1번이 "코드가 답할 수 있는 것은 묻지 않는다"**
  - `## Phase 0` 프로젝트 전수 분석 (코드·git·배포·CLAUDE.md·핸드오프에서 "왜"를 캐냄)
  - `## Phase 1` `showcase/INTERVIEW.md` 있으면 읽어 **바뀐 것만** 묻는다 (재실행 멱등)
  - `## Phase 2` 초안 제시 → 빈칸 6개만 질문 (AskUserQuestion 1회로 묶는다)
  - `## Phase 3` 도면 2종 HTML 작성 → `capture.sh --mode=page`
    ★ **정본은 `showcase/src/*.html` 과 PNG 다** — Artifact URL 이 아니다(세션 밖에서 재생성 불가).
    Artifact 도구를 쓸 수 있으면 **공유 링크 목적으로 발행**하고, 없으면 **건너뛴다** — 산출 완결성에 영향 없음
  - `## Phase 4` 캐러셀 6~10장 HTML → `capture.sh --mode=fixed --size=1080x1350`
  - `## Phase 5` 텍스트 4종 산출
  - `## Phase 6` 저장·절대경로 보고 + 채널별 사용법 한 줄씩
  - `## advisor 게이트` — 도면 구조·케이스 스터디 논지가 흔들리면 advisor 호출
  - `## Red Lines` — 아래 5개
- [ ] 산출 폴더 규약을 SKILL.md 에 명시 → `<프로젝트>/showcase/{assets,src}/`, `CASE-STUDY.md`, `linkedin.md`, `upwork.md`, `resume-bullets.md`, `INTERVIEW.md`

### E. 설치·등록 (★ 여기를 빠뜨리면 스킬이 뜨지 않는다)
- [ ] `Skills/showcase/install.sh` 작성 (design-check `install.sh` 복제 후 `for skill in kai-showcase`) → 검증: 실행 후 `ls -la ~/.claude/skills/kai-showcase/` 에 **SKILL.md · references · assets 3개 심링크**
- [ ] `Skills/README.md` `## 스킬 그룹` 아래 `### showcase` 절 추가 → 검증: `grep -n "^### showcase" README.md`
- [ ] `Skills/CLAUDE.md` `## 현재 등록된 스킬 그룹` 아래 동일 절 추가 → 검증: `grep -n "kai-showcase" CLAUDE.md`
- [ ] 커밋 — **`showcase/` · README.md · CLAUDE.md 만 경로 지정**. `design-check/` 의 미커밋 변경은 **다른 작업분이므로 건드리지 않는다**

---

## 무응답 기본값 (interview.md · case-study.md 에 문장틀로 박을 것)
- **결과 수치 미응답** → Impact 절은 **정성 결과만** 쓰고 숫자 자리에 `🔶`.
  예: `Cut the manual step entirely (🔶 time saved not measured)`
- **공개 범위 미응답** → **익명화가 기본**: 프로젝트명은 일반명사화(`church management portal`),
  도메인·고객 로고·스크린샷 속 실명·실데이터는 마스킹. 실명 사용은 **명시 허락이 있을 때만**

## 언어 규약 (하나로 고정 — 구현자가 즉흥 판단하지 않게)
- **본문은 영어**, 각 절 끝에 `> 🇰🇷 …` **인용블록으로 한국어 요약** 한 문단.
  LinkedIn·Upwork 에 붙일 때 인용블록만 지우면 되므로 가장 실용적이다
- **캐러셀 이미지는 영어만** — 1080×1350 에 두 언어를 넣으면 글자가 작아져 규격 이점이 사라진다.
  한국어판이 필요하면 `--lang=ko` 로 재실행(차후 과제)
- 대화·보고는 전역 규칙대로 **한국어 사극체**

## Red Lines (SKILL.md 에 그대로 넣을 것)
1. **숫자 날조 금지** — 수치는 코드·git·배포에서 실측한 것만. 못 구한 것은 `🔶 확인필요`, 추정은 추정이라 적는다
2. **공개 범위 미응답 시 익명화가 기본** — 고객명·로고·실데이터를 임의로 쓰지 않는다
3. **프로젝트 소스 수정 금지** — `showcase/` 폴더 밖을 쓰지 않는다
4. **자동 게시 금지** — LinkedIn·Upwork 에 올리는 것은 사용자 몫. 산출까지만
5. **서버 실행 금지** — dev 서버·watch 프로세스를 띄우지 않는다 (전역 규칙)

---

## 완료 조건 (DoD — 관측 가능)
- [ ] `bash Skills/showcase/install.sh` 실행 → `ls -la ~/.claude/skills/kai-showcase/` 에 심링크 **3개** 확인
- [ ] `bash ~/.claude/skills/kai-showcase/assets/capture.sh <샘플.html> /tmp/t.png` → **PNG 생성 + Chrome 프로세스 잔존 0** (`pgrep -f "user-data-dir" | wc -l` 확인)
- [ ] `--mode=fixed --size=1080x1350` → **실측으로 픽셀 확인**. `--force-device-scale-factor=2` 면
      2160×2700 이 기대값이나 headless 창 보정이 끼면 어긋난다 — **어긋나면 capture.sh 에 보정값을 박고 재확인**
- [ ] 새 세션에서 `/kai-showcase` 가 스킬 목록에 뜬다
- [ ] **실시험**: OneVoice 프로젝트에서 실행 → `showcase/` 에 PNG·MD 전량 생성, 오늘 손으로 만든 두 도면과 견줘 품질 저하 없음
- [ ] `Skills/README.md`·`CLAUDE.md` 양쪽에 `kai-showcase` 등장

## 구현 중 불분명 시
추측으로 진행하지 말고 `advisor` 서브에이전트(Opus)를 호출해 확인한다. §5 🔴 항목은 빠짐없이 반영한다.
SKILL.md 완성본은 **kai-openai 교차검증**을 거친 뒤 확정한다 (전역 CLAUDE.md 고위험 게이트).

---

## 차후 과제 (이번 범위 밖 — 스코프 크리프 방지)
- `--lang=ko` — 한국어판 캐러셀 재생성
- Upwork 전용 썸네일 비율 — 첫 판은 캐러셀 1장을 재사용한다
- `INTERVIEW.md` 변경 감지 고도화(이전 실행 대비 diff 요약)
- **CDP 배치 드라이버** — 교차검증(kai-gen)은 `--remote-debugging-port` + CDP `Page.captureScreenshot`
  (`captureBeyondViewport:true`)로 바꾸면 ① fullPage 가 네이티브라 **Pillow 트림이 불필요**하고
  ② Chrome 을 **한 번만** 띄워 캐러셀 10장을 처리하며 ③ `deviceScaleFactor` 가 정확하다고 권고했다.
  **이번 판에서는 채택하지 않는다** — CDP 는 WebSocket 클라이언트가 필요한데 python 표준 라이브러리에 없어
  `websockets`/`pychrome` 의존이 생긴다. 이 스킬의 이식성(= Chrome 하나만 있으면 돈다)을 지키는 쪽을 택했다.
  캐러셀 장수가 늘거나 속도가 문제되면 그때 전환한다.
