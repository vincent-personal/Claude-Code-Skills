#!/bin/bash
# kai-create-demo-images 스킬 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 만든다. 이 저장소를 고치면 즉시 반영된다.
set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 kai-create-demo-images 스킬 설치 시작..."
for skill in kai-create-demo-images; do
  TARGET_DIR="$TARGET_SKILLS_DIR/$skill"
  TARGET_FILE="$TARGET_DIR/SKILL.md"
  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    exit 1
  fi
  mkdir -p "$TARGET_DIR"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
  if [ -d "$SKILLS_DIR/$skill/assets" ]; then
    ln -sfn "$SKILLS_DIR/$skill/assets" "$TARGET_DIR/assets"
    chmod +x "$SKILLS_DIR/$skill/assets/"*.sh 2>/dev/null || true
    echo "✓ 도우미 $skill/assets"
  fi
done

echo ""
echo "✅ 설치 완료!  사용법: /kai-create-demo-images <기능 설명>"
echo "산출물: <프로젝트>/docs/screenshots/<기능>/ (NN-*.png · README.md · promo-image-prompts.md)"
echo "⚠️ 새 스킬은 Claude Code 세션을 새로 열거나 /reload-skills 해야 목록에 뜹니다."
