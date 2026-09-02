#!/bin/bash
# database 스킬 그룹 설치 스크립트
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다. 본 repo 를 고치면 즉시 반영된다.

set -e

GROUP_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"

echo "📦 database 스킬 그룹 설치 시작..."
echo "소스: $GROUP_DIR"
echo "대상: $TARGET_SKILLS_DIR"
echo ""

for skill in kai-db-migration; do
  TARGET_DIR="$TARGET_SKILLS_DIR/$skill"
  TARGET_FILE="$TARGET_DIR/SKILL.md"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   백업 예: mv \"$TARGET_FILE\" \"$TARGET_FILE.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_DIR"
  ln -sf "$GROUP_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"

  if [ -d "$GROUP_DIR/$skill/references" ]; then
    ln -sfn "$GROUP_DIR/$skill/references" "$TARGET_DIR/references"
    echo "✓ 참조 $skill/references"
  fi

  if [ -d "$GROUP_DIR/$skill/assets" ]; then
    ln -sfn "$GROUP_DIR/$skill/assets" "$TARGET_DIR/assets"
    echo "✓ 계측 헬퍼 $skill/assets"
  fi
done

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법:"
echo "  /kai-db-migration {어느 DB를 · 어디에서 · 어디로}"
echo "  예) /kai-db-migration GO_EASY 를 azure 52.230.39.64:3306 에서 헬싱키 mysql 컨테이너로"
echo ""
echo "명세가 부족하면 스킬이 먼저 되묻는다 (GATE 0). 추측으로 진행하지 않는다."
echo ""
echo "계측 헬퍼: $TARGET_SKILLS_DIR/kai-db-migration/assets/"
echo "  mysql-inventory.sh  서버 실측 (버전·lower_case_table_names·sql_mode…)"
echo "  mysql-objects.sh    객체 인벤토리 (테이블·뷰·프로시저·함수·트리거·이벤트·FK·인덱스)"
echo "  mysql-rowcount.sh   전 테이블 실제 count(*)"
