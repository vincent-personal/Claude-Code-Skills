#!/bin/bash
# kai-meeting-to-biz 설치 스크립트 (kai- prefix / 심볼릭 링크 / legacy 자동 정리)

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"
TARGET_AGENTS_DIR="$HOME/.claude/agents"

echo "📦 kai-meeting-to-biz 설치 시작..."
echo "소스: $SKILLS_DIR"
echo "스킬 대상: $TARGET_SKILLS_DIR"
echo "에이전트 대상: $TARGET_AGENTS_DIR"
echo ""

# 0) Legacy cleanup — 본 repo를 가리키는 비-prefix 심볼릭 링크 자동 삭제
echo "🧹 Legacy 정리..."
LEGACY_SKILLS="meeting-to-biz"
for legacy in $LEGACY_SKILLS; do
  LEGACY_SKILL_FILE="$TARGET_SKILLS_DIR/$legacy/SKILL.md"
  if [ -L "$LEGACY_SKILL_FILE" ]; then
    LINK_TARGET="$(readlink "$LEGACY_SKILL_FILE")"
    if [[ "$LINK_TARGET" == "$SKILLS_DIR"/* ]]; then
      rm -f "$LEGACY_SKILL_FILE"
      rmdir "$TARGET_SKILLS_DIR/$legacy" 2>/dev/null || true
      echo "  ✗ 제거: $legacy (← $LINK_TARGET)"
    fi
  fi
done
echo ""

# 1) 마스터 SKILL 설치 (kai- prefix)
for skill in kai-meeting-to-biz; do
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

  if [ -e "$TARGET_FILE" ] && [ ! -L "$TARGET_FILE" ]; then
    echo "❌ 오류: $TARGET_FILE 이 이미 존재하나 심볼릭 링크가 아닙니다."
    echo "   백업 예: mv \"$TARGET_FILE\" \"$TARGET_FILE.backup\""
    exit 1
  fi

  mkdir -p "$TARGET_SKILLS_DIR/$skill"
  ln -sf "$SKILLS_DIR/$skill/SKILL.md" "$TARGET_FILE"
  echo "✓ 스킬 $skill → $TARGET_FILE"
done

# 2) biz-advisor 에이전트 (메타 자문, prefix 없음 — 슬래시 호출 대상 아님)
if [ -f "$SKILLS_DIR/biz-advisor.md" ]; then
  TARGET_ADVISOR="$TARGET_AGENTS_DIR/biz-advisor.md"
  if [ -e "$TARGET_ADVISOR" ] && [ ! -L "$TARGET_ADVISOR" ]; then
    echo "⚠️  $TARGET_ADVISOR 가 심볼릭 링크가 아닙니다. 유지."
  else
    mkdir -p "$TARGET_AGENTS_DIR"
    ln -sf "$SKILLS_DIR/biz-advisor.md" "$TARGET_ADVISOR"
    echo "✓ 에이전트 biz-advisor → $TARGET_ADVISOR"
  fi
fi

# 3) 5개 Role Agent (prefix 없음 — Agent tool subagent_type으로 호출, 슬래시 충돌 없음)
for agent in m2b-curator m2b-strategist m2b-analyst m2b-swot m2b-builder; do
  SRC="$SKILLS_DIR/agents/$agent.md"
  TARGET="$TARGET_AGENTS_DIR/$agent.md"

  if [ ! -f "$SRC" ]; then
    echo "⚠️  $SRC 없음 — 건너뜀."
    continue
  fi
  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "⚠️  $TARGET 이 심볼릭 링크가 아닙니다. 유지하고 건너뜀."
    continue
  fi

  mkdir -p "$TARGET_AGENTS_DIR"
  ln -sf "$SRC" "$TARGET"
  echo "✓ Role Agent $agent → $TARGET"
done

echo ""
echo "✅ 설치 완료!"
echo ""
echo "🎛 사용법:"
echo "  /kai-meeting-to-biz <폴더>                               — 대화형 (형식·문서·리서치 질문)"
echo "  /kai-meeting-to-biz <폴더> --auto                        — 자동 (biz-advisor 위임)"
echo "  /kai-meeting-to-biz <폴더> --format=hybrid --docs=lean,gtm --research"
echo "  /kai-meeting-to-biz <폴더> --stage=2 --research          — 경쟁 분석만 리서치 재실행"
echo "  /kai-meeting-to-biz <폴더> --stage=4 --docs=lean,finance — 비즈 문서만"
echo ""
echo "🤖 5개 Role Agent (Agent tool로 내부 호출):"
echo "  m2b-curator·m2b-strategist·m2b-analyst·m2b-swot·m2b-builder  + biz-advisor"
echo ""
echo "📂 산출 위치: <입력폴더>/biz-output/   (게이트 trace: _TRACE.md)"
echo ""
echo "💰 비용 알림: Opus role agent 다회 + (리서치 시 WebSearch 다수). 1회 추정 \$5~20."
