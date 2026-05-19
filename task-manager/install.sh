#!/bin/bash
# task-skills 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다.
# 업데이트 시 이 repo를 git pull하면 자동으로 반영된다.

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"
TARGET_AGENTS_DIR="$HOME/.claude/agents"

echo "📦 task-skills 설치 시작..."
echo "소스: $SKILLS_DIR"
echo "스킬 대상: $TARGET_SKILLS_DIR"
echo "에이전트 대상: $TARGET_AGENTS_DIR"
echo ""

# 스킬 설치
for skill in task-add task-run task-clear task-list; do
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

  # 기존 파일이 심볼릭 링크가 아니면 안전상 중단
  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   기존 파일을 직접 백업하거나 삭제한 후 재실행하세요."
    echo "   백업 예: mv \"$TARGET_FILE\" \"$TARGET_FILE.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
done

# advisor 에이전트 설치 (전역)
if [ -f "$SKILLS_DIR/advisor.md" ]; then
  TARGET_ADVISOR="$TARGET_AGENTS_DIR/advisor.md"

  if [ -e "$TARGET_ADVISOR" ] && [ ! -L "$TARGET_ADVISOR" ]; then
    echo ""
    echo "⚠️  $TARGET_ADVISOR 가 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   기존 advisor를 유지합니다. 덮어쓰려면 백업 후 재실행하세요."
  else
    mkdir -p "$TARGET_AGENTS_DIR"
    ln -sf "$SKILLS_DIR/advisor.md" "$TARGET_ADVISOR"
    echo "✓ 에이전트 advisor → $TARGET_ADVISOR"
  fi
fi

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법:"
echo "  /task-add  {작업 설명}   — 체크리스트에 항목 추가"
echo "  /task-run                — 미시작 항목 하나 선점 후 완수"
echo "  /task-clear              — 완료 항목을 check-list-done.md로 이동"
echo "  /task-list               — 미완료 항목(미시작·진행중·확인필요) 요약 출력"
echo ""
echo "백그라운드 루프 일시 정지:"
echo "  touch {PROJECT_ROOT}/.claude/user.lock"
echo "  → 사용자 작업 끝나면 rm 으로 해제"
