#!/bin/bash
# kai-peer-session 스킬 그룹 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다.
# 본 repo를 git pull 하면 SKILL.md 수정은 자동 반영된다(링크이므로).
#
# 이 그룹은 SKILL.md 외에 조회 스크립트(peer-session.py)를 함께 쓴다.
# 스킬 폴더마다 같은 파일을 링크해 두어, SKILL.md 에 적힌 경로 그대로 실행되게 한다.

set -e

GROUP_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"
SRC_SCRIPT="$GROUP_DIR/peer-session.py"

echo "📦 kai-peer-session 설치 시작..."
echo "소스: $GROUP_DIR"
echo "대상: $TARGET_SKILLS_DIR"
echo ""

if [ ! -f "$SRC_SCRIPT" ]; then
  echo "❌ 오류: 조회 스크립트 없음 $SRC_SCRIPT"
  exit 1
fi

for skill in kai-peer-session-claude kai-peer-session-kaigen; do
  SRC_FILE="$GROUP_DIR/$skill/SKILL.md"
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"
  TARGET_SCRIPT="$TARGET_SKILLS_DIR/$skill/peer-session.py"

  if [ ! -f "$SRC_FILE" ]; then
    echo "❌ 오류: 소스 없음 $SRC_FILE"
    exit 1
  fi

  for T in "$TARGET_FILE" "$TARGET_SCRIPT"; do
    if [ -e "$T" ] && [ ! -L "$T" ]; then
      echo "❌ 오류: $T 이 이미 존재하나 심볼릭 링크가 아닙니다."
      echo "   백업 후 재실행: mv \"$T\" \"$T.backup\""
      exit 1
    fi
  done

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SRC_FILE"   "$TARGET_FILE"
  ln -sf "$SRC_SCRIPT" "$TARGET_SCRIPT"
  echo "✓ 스킬 $skill → $TARGET_FILE"
  echo "  └ 스크립트 → $TARGET_SCRIPT"
done

echo ""
echo "✅ kai-peer-session 설치 완료. 새 세션에서 /kai-peer-session-kaigen, /kai-peer-session-claude 사용 가능."
echo ""
echo "※ 전제: 두 에이전트 세션에 **같은 이름**을 붙여 두어야 짝을 찾는다."
echo "   확인:  python3 \"$SRC_SCRIPT\" --list      (현재 폴더의 양쪽 세션 이름 일람)"
