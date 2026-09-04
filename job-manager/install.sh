#!/bin/bash
# job-manager 스킬 설치 스크립트 (kai-job-add / kai-job-run 쌍)
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다.

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 job-manager 스킬 설치 시작..."
echo "소스: $SKILLS_DIR"
echo ""

for skill in kai-job-add kai-job-run; do
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
done

echo ""
echo "✅ 설치 완료!  /kai-job-add {명령}  →  /kai-job-run"
