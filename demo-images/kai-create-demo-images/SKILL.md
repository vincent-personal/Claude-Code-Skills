---
name: kai-create-demo-images
description: 앱의 기능 하나를 홍보 카드용 자료 한 벌로 만든다 — 그 프로젝트의 docs/screenshots/<기능>/ 폴더를 만들고, iOS 시뮬레이터(필요하면 안드로이드 에뮬레이터·브라우저)에서 기능을 실제로 조작하며 화면을 차례로 캡처하고, 조작 설명서(README.md)와 인스타 캐러셀용 인물 이미지 3장(시작·중간·끝)의 단독 생성 프롬프트(promo-image-prompts.md)를 쓴다. 폴더는 git 에서 뺀다. 트리거 - /kai-create-demo-images <기능 설명>, "이 기능 시연 캡처해줘", "홍보 카드 자료 만들어줘", "기능 스크린샷이랑 설명 만들어줘"
---

# kai-create-demo-images — 기능 하나를 홍보 카드 자료로

입력은 **기능에 대한 짧은 설명 한 줄**이다(예: `/kai-create-demo-images 성경 읽기 슬롯별 최근 읽은 장 기록`).
산출은 그 프로젝트의 **`docs/screenshots/<기능-슬러그>/`** 한 폴더다.

```
docs/screenshots/<slug>/
  01-....png … NN-....png     시연 화면 (순서대로)
  README.md                   조작 설명서 — 홍보 카드 문구의 원천
  promo-image-prompts.md      인물 이미지 3장(시작·중간·끝) 단독 생성 프롬프트 + 캐러셀 순서
```

도우미: `~/.claude/skills/kai-create-demo-images/assets/sim.sh` (아래 `SIM` 으로 부른다)

---

## 🔴 지켜야 할 것 (전부 실제로 밟은 것이다)

1. **저장 위치는 그 프로젝트의 `docs/screenshots/<용도>/`** 다. 스크래치패드·바탕화면 금지.
   그리고 그 프로젝트 `.gitignore` 에 `docs/screenshots/` 가 있는지 확인하고 없으면 넣는다(저장소에 넣지 않는다).
2. **실사용자 데이터를 바꾸지 않는다.** 시뮬레이터에 로그인된 계정이 사용자 본인 것일 수 있다.
   시연 조작이 서버 상태(읽던 자리·설정 등)를 바꾸면 → **시작 전 상태를 적어 두고, 끝나면 되돌리고, DB·API 로 대조**한다.
   남의 계정으로 바꿔 로그인하거나 비밀번호를 입력하지 않는다.
3. **좌표는 포인트다.** 스크린샷은 대개 3배 픽셀이다 — `SIM tappx` 를 쓰거나 `px ÷ SIM scale` 로 바꾼다.
   스크린샷을 보고 좌표를 고를 때는 **보이는 이미지의 축소 배율**까지 계산에 넣는다(표시 크기 ≠ 원본 크기).
4. **한글은 `idb ui text` 로 입력되지 않는다**(한글 자판에 먹혀 `ㅂㅁ` 처럼 나온다).
   맥 클립보드는 다른 세션과 공유되므로 함부로 쓰지 않는다. 대신 **앱 안의 칩·프리셋·최근 항목을 눌러** 같은 흐름을 보인다.
   꼭 입력해야 하면 ASCII(영문 책 이름 등)로 가능한지 먼저 본다.
5. **배포본에 그 기능이 실려 있는지 먼저 확인한다** — OTA·디버그 빌드가 옛 판이면 기능이 화면에 없다.
   (Capacitor Live Update 면 `Library/Preferences/<bundle>.plist` 의 `…previousBundleIdKey`, 또는 앱 컨테이너 `Library/NoCloud/ionic_built_snapshots/` 를 본다)
6. **사용자가 말한 기능만 찍는다.** 앱 전체 둘러보기가 아니다. 그 기능이 다른 진입점(검색·장 이동 등)에서도 동작한다면 **그 경로도 찍는다**.
7. **캡처마다 이미지를 직접 열어 확인한다** — 탭이 빗나갔거나, 모달이 닫히는 중이었거나, 로딩 중인 화면을 그대로 저장하지 않는다.
   확인용 임시 파일(`_probe.png` 등)은 끝나기 전에 지운다.
8. 보고할 때 경로는 **절대경로**로.

---

## 절차

### ① 기능 이해 (코드에서 먼저 — 묻지 않는다)

- 설명에서 키워드를 뽑아 그 프로젝트 코드에서 화면·컴포넌트·i18n 문구를 grep 한다.
- **진입점 → 동작 → 결과**를 3~6단계 시나리오로 적는다. 이것이 캡처 순서이자 README 의 '어떻게 쓰나요' 표가 된다.
- 기능이 데이터가 쌓여야 보이는 종류(기록·목록)면, 시연 중에 **데이터를 쌓는 단계부터** 넣는다.
- 슬러그는 영어 kebab-case(예: `slot-history`).

### ② 폴더 준비

```bash
ROOT=<그 프로젝트 루트>        # 모노 워크스페이스면 기능이 사는 하위 프로젝트(예: 앱 저장소)
SLUG=<slug>
OUT="$ROOT/docs/screenshots/$SLUG"; mkdir -p "$OUT"
grep -qx "docs/screenshots/" "$ROOT/.gitignore" 2>/dev/null || printf '\n# 시연·홍보용 스크린샷 — 저장소에 넣지 않는다\ndocs/screenshots/\n' >> "$ROOT/.gitignore"
git -C "$ROOT" check-ignore -q "$OUT/x.png" && echo "ignored OK"
```
`.gitignore` 를 바꿨으면 그 한 줄만 따로 커밋한다(`chore: keep docs/screenshots out of the repo`).

### ③ 기기 고르기

```bash
SIM=~/.claude/skills/kai-create-demo-images/assets/sim.sh
$SIM booted                     # 켜진 시뮬레이터
xcrun simctl list devices | grep -E "iPhone"   # 꺼진 것 중 고를 때
```
- 앱이 설치되어 있고 **필요한 로그인 상태**인 기기를 고른다. 꺼져 있으면 `xcrun simctl boot <udid>` 후 `open -a Simulator`.
- 로그인된 계정이 누구 것인지 모르면 확인한다(토큰 값을 출력하지 말 것 — 식별자만).
  사용자 본인 계정이면 🔴②대로 **시작 전 상태 기록 → 끝나고 복원 → 대조**.
- 안드로이드가 필요하면 `adb shell input tap <px>`(기기 픽셀), 화면은 `adb exec-out screencap -p > x.png`.
- 웹 기능이면 Playwright(헤드리스)로 390×844 에서 찍는다.

### ④ 시연·캡처

```bash
$SIM shot <udid> "$OUT/_probe.png"     # 현재 화면 확인 → 이미지를 열어 좌표를 잡는다
$SIM tap <udid> <x_pt> <y_pt>; sleep 6  # 서버 응답·애니메이션을 기다린다
$SIM shot <udid> "$OUT/01-<what>.png"
```
- 파일 이름: `NN-<무엇을-보여주는지>.png` (두 자리 순번, 영어 kebab-case).
- 화면마다 **한 가지 사실**만 보여 준다(누르기 전 / 누른 뒤 / 결과).
- 상태가 바뀌는 조작 뒤에는 넉넉히 기다린다(네트워크 왕복). 빈 스켈레톤이 찍혔으면 다시 찍는다.
- 끝나면 `_probe.png` 를 지우고, 🔴②의 복원·대조를 한다.

### ⑤ README.md — 조작 설명서 (홍보 카드 문구의 원천)

사용자 눈높이의 말로 쓴다(개발 용어 금지). 이 구성을 따른다:

```markdown
# <기능 이름> — <한 줄 효용>
> <앱 이름> · <화면 위치> (웹 vX.Y.Z)
> 화면: <기기> · <언어>

## 한 줄 소개
## 이런 분께 좋아요          (3개 안팎)
## 어떻게 쓰나요             | 순서 | 할 일 | 화면(파일명) |
### <다른 진입점에서도>       (있으면 같은 표)
## 알아 두면 좋은 점         (규칙·한계·저장 위치·오프라인 등 — 코드에서 확인한 사실만)
## 홍보 문구 예시            (3~4개, 첫 줄은 굵게 — 카드 표지용)
## 화면 파일                | 파일 | 내용 |
```

### ⑥ promo-image-prompts.md — 인물 이미지 3장

- **3장: 시작(문제 상황) · 중간(기능을 쓰는 순간) · 끝(해결된 편안함)**. 캐러셀의 처음·가운데·마지막에 들어간다.
- 인물은 사용자가 따로 말하지 않으면 **30대 초반 한국 여성**.
- 🔴 **각 프롬프트는 단독으로 완결**되어야 한다 — 다른 프롬프트를 참조하지 않는다.
  같은 사람처럼 보이도록 **인물 묘사 문단(나이·머리·옷)을 세 프롬프트에 글자 그대로** 넣는다.
- **휴대폰 화면은 보이지 않게**(뒤집기·눈부심·각도) — 생성기가 앱 UI·글자를 엉터리로 그린다. 실제 화면은 캡처 카드가 맡는다.
- **문구를 얹을 빈자리**(위 또는 아래 1/3)를 지정한다. 비율 **4:5 (1080×1350)**.
- 프롬프트는 **영어**(생성 품질이 가장 안정적), 장면마다 **한국어 요약**을 붙인다.
- 🔴 **이미지마다 코드 블록은 딱 하나** — 사용자가 그대로 복사해 쓴다. 네거티브 프롬프트를 따로 두지 말고
  피해야 할 것은 프롬프트 **끝의 `Avoid: …` 문장**으로 넣는다(화면 글자·로고·워터마크·손가락 왜곡·과한 화장·스튜디오 배경·만화풍 등).
- 문서 앞부분에 **캐러셀 순서 제안 표**(인물 A → 캡처들 → 인물 B → 캡처들 → 인물 C, 장마다 얹을 문구)를 둔다.
- 문서 끝에 **생성 뒤 확인할 것**: 같은 사람인지 · 손가락·폰 잡은 모양 · 화면에 가짜 글자 · 문구 자리 · 실존 인물과 닮지 않았는지.

프롬프트 한 장의 골격:

```
A warm, natural lifestyle photograph of a Korean woman in her early 30s <장소·시간>. <인물 묘사 문단 — 세 장 동일>.
She holds a smartphone <화면이 보이지 않는 방식>. <표정·동작 — 이 장의 감정>. <소품 2개 안팎>.
<빛·색감·렌즈·분위기>, authentic and unposed. Leave clean empty space in the <upper|lower> third of the frame for text overlay. Vertical 4:5 composition. Avoid: visible phone screen, app interface, text, letters, logos, watermark, extra fingers, distorted hands, <이 장에서 특히 피할 것>, cartoon, illustration.
```

### ⑦ 보고

- 폴더 **절대경로**, 캡처 목록(파일 · 장면) 표, 만든 문서 두 개.
- 사용자 계정을 썼다면 **복원했고 대조했다**는 사실.
- 찍지 못한 장면이 있으면 그 이유(예: 한글 입력 불가 → 칩으로 대신).

---

## 설치·준비물

- idb: `$SIM idb` 가 찾고, 없으면 `brew install idb-companion` + `~/.local/share/idbenv` 에 `fb-idb` 를 설치한다.
- Xcode 시뮬레이터(`xcrun simctl`), 안드로이드는 `adb`, 웹은 Python Playwright.
