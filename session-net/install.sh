#!/bin/bash
# session-net 스킬 설치 스크립트 (kai-session-net)
# ~/.claude/skills/ 에 SKILL.md 와 session-net.py 를 함께 심볼릭 링크한다.
# (SKILL.md 가 ~/.claude/skills/kai-session-net/session-net.py 경로로 실행하므로 둘 다 필요)

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 session-net 스킬 설치 시작..."
echo "소스: $SKILLS_DIR"
echo ""

for f in SKILL.md session-net.py; do
  TARGET_FILE="$TARGET_SKILLS_DIR/kai-session-net/$f"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/kai-session-net"
  ln -sf "$SKILLS_DIR/kai-session-net/$f" "$TARGET_FILE"
  echo "✓ $f → $TARGET_FILE"
done

echo ""
echo "✅ 설치 완료!  워크스페이스의 아무 세션에서:  /kai-session-net"
