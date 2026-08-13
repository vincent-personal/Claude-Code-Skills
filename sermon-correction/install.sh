#!/bin/bash
# sermon-correction 스킬 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다 (SKILL.md + references/ + assets/).

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 sermon-correction 스킬 설치 시작..."
echo "소스: $SKILLS_DIR"
echo "스킬 대상: $TARGET_SKILLS_DIR"
echo ""

for skill in kai-sermon-correction; do
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   백업 예: mv \"$TARGET_SKILLS_DIR/$skill\" \"$TARGET_SKILLS_DIR/$skill.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"

  # 참조/에셋 디렉터리도 함께 링크 (SKILL.md가 상대 경로로 읽음)
  for sub in references assets; do
    if [ -d "$SKILLS_DIR/$skill/$sub" ]; then
      ln -sfn "$SKILLS_DIR/$skill/$sub" "$TARGET_SKILLS_DIR/$skill/$sub"
      echo "✓ $skill/$sub → $TARGET_SKILLS_DIR/$skill/$sub"
    fi
  done
done

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법: /kai-sermon-correction  (설교 원문·발표 시간 제공)"
