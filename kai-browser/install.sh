#!/bin/bash
# kai-browser 스킬 그룹 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다.
# 본 repo를 git pull 하면 SKILL.md 수정은 자동 반영된다(링크이므로).

set -e

GROUP_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 kai-browser 설치 시작..."
echo "소스: $GROUP_DIR"
echo "대상: $TARGET_SKILLS_DIR"
echo ""

for skill in kai-browser-mcp kai-browser-node kai-browser-agent; do
  SRC_FILE="$GROUP_DIR/$skill/SKILL.md"
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

  if [ ! -f "$SRC_FILE" ]; then
    echo "❌ 오류: 소스 없음 $SRC_FILE"
    exit 1
  fi

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   백업 후 재실행: mv \"$TARGET_FILE\" \"$TARGET_FILE.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SRC_FILE" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
done

echo ""
echo "✅ kai-browser 설치 완료. 새 Claude Code 세션에서 /kai-browser-mcp, /kai-browser-node 사용 가능."
echo ""
echo "※ 전제: 글로벌 Playwright MCP(user scope) 및 글로벌 playwright 라이브러리."
echo "   확인:  claude mcp list | grep playwright        (MCP — kai-browser-mcp 용)"
echo "          node -e \"require('\$(npm root -g)/playwright')\" && echo OK   (라이브러리 — kai-browser-node 용)"
