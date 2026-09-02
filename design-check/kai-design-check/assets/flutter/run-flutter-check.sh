#!/bin/bash
# Flutter 디자인 감사 실행기
#   ./run-flutter-check.sh [기기ID]
# 스크린샷까지 찍은 뒤 픽셀 감사(정렬·간격)를 이어 돌린다.
set -e
DEV="${1:-}"
echo "① 정적 분석"
flutter analyze || true

echo "② 위젯 계측 (오버플로·터치·잘림·접근성)"
if [ -n "$DEV" ]; then
  flutter test integration_test/design_check_test.dart -d "$DEV"
else
  echo "   ⚠️ 기기를 지정하지 않았다. 시뮬레이터/에뮬레이터가 필요하다: flutter devices"
  flutter test integration_test/design_check_test.dart || true
fi

echo "③ 픽셀 감사 (정렬 근접 불일치·여백 리듬)"
if [ -d ".ui-audit/shots" ] && command -v node >/dev/null; then
  node scripts/audit-pixel.mjs .ui-audit/shots || true
else
  echo "   · 스크린샷이 없거나 node 가 없다 — 건너뛴다"
fi

echo "④ 골든 테스트 (시각 회귀)"
if ls test/**/*_golden_test.dart >/dev/null 2>&1; then
  flutter test --update-goldens=false || true
else
  echo "   · 골든 테스트가 없다. 시각 회귀를 잡으려면 만들 것 (references/framework-flutter.md)"
fi
