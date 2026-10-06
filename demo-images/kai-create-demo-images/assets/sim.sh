#!/bin/bash
# kai-create-demo-images — iOS 시뮬레이터 조작·캡처 도우미
#
# 사용:
#   sim.sh idb                         idb 실행 파일 경로를 찾아 출력(없으면 설치)
#   sim.sh booted                      켜진 시뮬레이터 목록(UDID 이름)
#   sim.sh scale <udid>                스크린샷 픽셀 → 포인트 배율(예: 3)
#   sim.sh shot <udid> <out.png>       스크린샷 저장
#   sim.sh tap <udid> <x> <y>          포인트 좌표 탭
#   sim.sh tappx <udid> <px> <py>      스크린샷 픽셀 좌표로 탭(배율 자동 환산)
#   sim.sh swipe <udid> x1 y1 x2 y2    포인트 좌표 스와이프
#   sim.sh text <udid> "<ascii>"       ASCII 글자 입력(🔴 한글 불가 — SKILL.md 참조)
#
# ⚠️ 좌표는 **포인트**다. 스크린샷은 레티나 배율(대개 3배) 픽셀이라 그대로 넣으면 엉뚱한 곳을 누른다.
set -e

find_idb() {
  for c in "$(command -v idb 2>/dev/null)" "$HOME/.local/share/idbenv/bin/idb" /private/tmp/claude-501/idbenv/bin/idb; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return 0; }
  done
  command -v idb_companion >/dev/null || brew install idb-companion >&2
  python3 -m venv "$HOME/.local/share/idbenv" >&2 && "$HOME/.local/share/idbenv/bin/pip" install -q fb-idb >&2
  echo "$HOME/.local/share/idbenv/bin/idb"
}

scale_of() {
  # 스크린샷 폭(px) ÷ 화면 폭(pt). describe-point 로 화면 크기를 직접 재지 않고, 알려진 폭으로 가른다.
  local tmp; tmp=$(mktemp -t simscale).png
  xcrun simctl io "$1" screenshot "$tmp" >/dev/null 2>&1
  local w; w=$(sips -g pixelWidth "$tmp" | awk '/pixelWidth/{print $2}'); rm -f "$tmp"
  case "$w" in
    1179|1206|1290|1320|1170|1284|1242|1125|1080) echo 3 ;;
    750|828|640|1536|1620|1640|1668|2048|2064|1488) echo 2 ;;
    *) echo 3 ;;
  esac
}

cmd="$1"; shift || true
case "$cmd" in
  idb) find_idb ;;
  booted) xcrun simctl list devices | grep Booted | sed -E 's/^ *(.*) \(([0-9A-F-]{36})\) \(Booted\).*/\2 \1/' ;;
  scale) scale_of "$1" ;;
  shot) xcrun simctl io "$1" screenshot "$2" >/dev/null 2>&1 && echo "$2" ;;
  tap) "$(find_idb)" ui tap --udid "$1" "$2" "$3" ;;
  tappx) s=$(scale_of "$1"); "$(find_idb)" ui tap --udid "$1" $(( $2 / s )) $(( $3 / s )) ;;
  swipe) "$(find_idb)" ui swipe --udid "$1" "$2" "$3" "$4" "$5" ;;
  text) "$(find_idb)" ui text --udid "$1" "$2" ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
