#!/bin/bash
# kai-mobile-native 스킬 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다. 본 repo 를 고치면 즉시 반영된다.

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 kai-mobile-native 스킬 설치 시작..."
echo "소스: $SKILLS_DIR"
echo "대상: $TARGET_SKILLS_DIR"
echo ""

for skill in kai-mobile-native; do
  TARGET_DIR="$TARGET_SKILLS_DIR/$skill"
  TARGET_FILE="$TARGET_DIR/SKILL.md"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   백업 예: mv \"$TARGET_FILE\" \"$TARGET_FILE.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_DIR"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
done

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법:"
echo "  /kai-mobile-native /members/list   # 그 화면(+시트·서랍 등 숨은 부품)만"
echo "  /kai-mobile-native 전체            # 앱의 모든 사용 화면"
echo ""
echo "원칙: 모바일 웹 뷰만 바꾼다 — 데스크톱은 절대 변경 금지(1440 Before/After 비교 필수)"
