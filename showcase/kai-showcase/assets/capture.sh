#!/usr/bin/env bash
# ============================================================================
# kai-showcase 캡처 하네스 — HTML 을 PNG 로 굽는다 (macOS · Chrome headless)
#
# 이 파일의 모든 방어책은 2026-09-15 세션에서 "실제로 밟은 함정"에서 나왔다.
# 고치기 전에 아래 주석을 읽을 것 — 없애면 그 함정을 다시 밟는다.
#
#   ① Playwright 는 file: 을 차단한다 → Chrome 바이너리를 직접 부른다
#   ② Chrome 이 캡처 후에도 안 죽는다 → --timeout + PID kill + 폴링, 삼중 방어
#   ③ 사용자 Chrome 과 충돌 → --user-data-dir 을 임시로 분리
#   ④ --screenshot 은 fullPage 가 없다 → 넉넉히 찍고 Pillow 로 하단 여백 트림
#   ⑤ 시스템 다크모드·애니메이션·lazy 이미지가 캡처를 흔든다 → 래퍼가 강제로 고정
#   ⑥ 한국어가 조사에서 줄바꿈된다 → 래퍼가 word-break:keep-all 을 깔아 준다
# ============================================================================
set -uo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

usage() {
  cat <<'USAGE'
사용법
  capture.sh <input.html> <output.png> [옵션]
  capture.sh --batch <디렉터리> [옵션]      # 그 폴더의 *.html 전부 → 같은 이름 .png

옵션
  --mode=page|fixed   page(기본) = 넉넉히 찍고 하단 여백 트림
                      fixed      = 고정 크기 그대로, 트림하지 않음 (캐러셀용)
  --size=WxH          기본: page=1100x3200 · fixed=1080x1350
  --scale=N           device scale factor (기본 2 — 2배 선명도)
  --budget=MS         virtual-time-budget, 웹폰트 대기 포함 (기본 10000)
  --no-wrap           Artifact 스켈레톤 래퍼를 씌우지 않는다 (이미 완전한 HTML 문서일 때)

예
  capture.sh diagram.html out.png
  capture.sh slide.html s1.png --mode=fixed --size=1080x1350
  capture.sh --batch ./slides --mode=fixed
USAGE
}

MODE=page; SIZE=""; SCALE=2; BUDGET=10000; WRAP=1; BATCH=""
IN=""; OUT=""

for arg in "$@"; do
  case "$arg" in
    --batch) BATCH="__next__" ;;
    --mode=*)   MODE="${arg#*=}" ;;
    --size=*)   SIZE="${arg#*=}" ;;
    --scale=*)  SCALE="${arg#*=}" ;;
    --budget=*) BUDGET="${arg#*=}" ;;
    --no-wrap)  WRAP=0 ;;
    -h|--help)  usage; exit 0 ;;
    *)
      if [ "$BATCH" = "__next__" ]; then BATCH="$arg"
      elif [ -z "$IN" ]; then IN="$arg"
      elif [ -z "$OUT" ]; then OUT="$arg"
      fi ;;
  esac
done

[ -z "$SIZE" ] && { [ "$MODE" = "fixed" ] && SIZE="1080x1350" || SIZE="1100x3200"; }
W="${SIZE%x*}"; H="${SIZE#*x}"

# ── 의존성 점검 ─────────────────────────────────────────────────────────────
if [ ! -x "$CHROME" ]; then
  echo "❌ Chrome 을 찾지 못했습니다: $CHROME" >&2
  echo "   Google Chrome 을 설치한 뒤 다시 실행하시옵소서. (대체 경로 없음 — 여기서 중단합니다)" >&2
  exit 1
fi
HAVE_PIL=1
python3 -c "import PIL" 2>/dev/null || HAVE_PIL=0

TMP="$(mktemp -d "${TMPDIR:-/tmp}/kai-showcase.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ── Artifact 스켈레톤 래퍼 ──────────────────────────────────────────────────
# 발행된 Artifact 와 같은 조건으로 렌더한다. 동시에 캡처를 흔드는 것들을 잠근다.
make_wrapper() {          # $1=원본 html  $2=결과 html
  local extra=""
  [ "$MODE" = "fixed" ] && extra="html,body{height:100%;overflow:hidden}"
  {
    cat <<HEAD
<!doctype html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px system-ui, -apple-system, sans-serif; background: #fafaf9;
         word-break: keep-all; overflow-wrap: break-word; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
  /* 캡처 안정화 — 전이·애니메이션이 중간 상태로 찍히는 것을 막는다 */
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
  }
  $extra
</style>
</head>
<body>
HEAD
    cat "$1"
    cat <<'FOOT'
<script>
  /* lazy 이미지는 뷰포트 밖이면 로드되지 않아 빈칸으로 찍힌다 — 강제로 즉시 로드 */
  document.querySelectorAll('img[loading="lazy"]').forEach(function (i) { i.loading = 'eager'; });
  /* 진행 중인 애니메이션을 끝 상태로 */
  if (document.getAnimations) {
    document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });
  }
</script>
</body>
</html>
FOOT
  } > "$2"
}

# ── 한 장 캡처 ──────────────────────────────────────────────────────────────
shoot() {                 # $1=input.html  $2=output.png  $3=일련번호(프로필 격리용)
  local src="$1" out="$2" seq="$3"
  local page="$src"

  if [ "$WRAP" = "1" ]; then
    page="$TMP/wrapped-$seq.html"
    make_wrapper "$src" "$page"
  fi

  # ③ 프로필을 장마다 따로 — 사용자 Chrome 과도, 다른 슬라이드와도 섞이지 않는다
  local prof="$TMP/prof-$seq"
  mkdir -p "$prof"
  rm -f "$out"

  # ② 삼중 방어 그 첫째: --timeout 으로 Chrome 이 스스로 찍고 끝내게 한다
  "$CHROME" \
    --headless=new --disable-gpu --hide-scrollbars \
    --no-first-run --no-default-browser-check \
    --user-data-dir="$prof" \
    --force-device-scale-factor="$SCALE" \
    --window-size="$W,$H" \
    --virtual-time-budget="$BUDGET" \
    --timeout=15000 \
    --screenshot="$out" \
    "file://$page" >/dev/null 2>&1 &
  local pid=$!

  # 둘째: PNG 가 생길 때까지 폴링 (최대 30초)
  local i
  for i in $(seq 1 30); do
    [ -s "$out" ] && break
    sleep 1
  done

  # 파일을 다 쓰기 전에 죽이면 깨진 PNG 가 남는다 — 1초 여유를 준다
  [ -s "$out" ] && sleep 1

  # 셋째: PID 로 정확히 죽인다. pkill 은 살아 있을 때에만, 최후 수단으로.
  #   ⚠️ pkill -f 를 1차 수단으로 쓰면 사용자가 띄운 다른 Chrome 까지 죽을 수 있다.
  kill "$pid" 2>/dev/null
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    pkill -f "user-data-dir=$prof" 2>/dev/null
  fi

  if [ ! -s "$out" ]; then
    echo "❌ 캡처 실패: $src" >&2
    return 1
  fi

  # ④ page 모드만 하단 여백 트림. fixed(캐러셀)는 규격이 곧 생명이라 건드리지 않는다.
  if [ "$MODE" = "page" ]; then
    if [ "$HAVE_PIL" = "1" ]; then
      python3 - "$out" <<'PY'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGB")
w, h = im.size
px = im.load()
bg = px[5, h - 5]                       # 맨 아래 = 확실한 배경색
def row_is_bg(y):
    for x in range(0, w, 20):           # 20px 간격 샘플링
        r, g, b = px[x, y]
        if abs(r-bg[0]) > 6 or abs(g-bg[1]) > 6 or abs(b-bg[2]) > 6:
            return False
    return True
last = h - 1
while last > 0 and row_is_bg(last):
    last -= 1
im.crop((0, 0, w, min(h, last + 140))).save(p, optimize=True)
PY
    else
      echo "⚠️  Pillow 가 없어 하단 여백을 트림하지 못했습니다 (캡처 자체는 성공)." >&2
      echo "    트림하려면: pip3 install pillow" >&2
    fi
  fi

  python3 - "$out" <<'PY' 2>/dev/null || echo "✓ $2"
import sys
try:
    from PIL import Image
    print("✓ %s  %dx%d" % (sys.argv[1], *Image.open(sys.argv[1]).size))
except Exception:
    print("✓ %s" % sys.argv[1])
PY
}

# ── 실행 ────────────────────────────────────────────────────────────────────
if [ -n "$BATCH" ] && [ "$BATCH" != "__next__" ]; then
  [ -d "$BATCH" ] || { echo "❌ 폴더가 없습니다: $BATCH" >&2; exit 1; }
  n=0; fail=0
  for f in "$BATCH"/*.html; do
    [ -e "$f" ] || { echo "❌ $BATCH 에 .html 이 없습니다" >&2; exit 1; }
    n=$((n+1))
    seq=$(printf "%02d" "$n")
    shoot "$f" "${f%.html}.png" "$seq" || fail=$((fail+1))
  done
  echo "── 배치 완료: $n 장 중 $((n-fail)) 장 성공"
  [ "$fail" -gt 0 ] && exit 1
  exit 0
fi

[ -z "$IN" ] || [ -z "$OUT" ] && { usage; exit 1; }
[ -f "$IN" ] || { echo "❌ 입력 파일이 없습니다: $IN" >&2; exit 1; }
shoot "$IN" "$OUT" "01"
