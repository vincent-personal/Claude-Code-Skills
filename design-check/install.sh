#!/bin/bash
# kai-design-check 스킬 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다. 본 repo 를 고치면 즉시 반영된다.

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 kai-design-check 스킬 설치 시작..."
echo "소스: $SKILLS_DIR"
echo "대상: $TARGET_SKILLS_DIR"
echo ""

for skill in kai-design-check; do
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

  # 참조 문서 (SKILL.md 가 references/* 를 상대 경로로 읽는다)
  if [ -d "$SKILLS_DIR/$skill/references" ]; then
    ln -sfn "$SKILLS_DIR/$skill/references" "$TARGET_DIR/references"
    echo "✓ 참조 $skill/references"
  fi

  # 계측 하네스 (프로젝트로 복사해 쓴다)
  if [ -d "$SKILLS_DIR/$skill/assets" ]; then
    ln -sfn "$SKILLS_DIR/$skill/assets" "$TARGET_DIR/assets"
    echo "✓ 하네스 $skill/assets"
  fi
done

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법:"
echo "  /kai-design-check                    # 현재 프로젝트"
echo "  /kai-design-check /path/to/project   # 임의의 프로젝트"
echo "  /kai-design-check . --quick          # 계측만 (수정 없이 보고)"
echo ""
echo "지원 표면: Angular(SSR/CSR) · Ionic · React · Vue · Next · Svelte · Flutter · 네이티브(스크린샷)"
echo ""
echo "하네스 위치: $TARGET_SKILLS_DIR/kai-design-check/assets/"
echo "  web/     DOM 계측 (Angular·Ionic·React·Vue·Next)"
echo "  flutter/ 위젯 트리 계측"
echo "  pixel/   스크린샷 픽셀 계측 (표면 무관 — 정렬·간격·잘림)"
