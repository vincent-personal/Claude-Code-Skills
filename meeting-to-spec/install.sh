#!/bin/bash
# meeting-to-spec 설치 스크립트 (kai- prefix 적용 / legacy 자동 정리)

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"
TARGET_AGENTS_DIR="$HOME/.claude/agents"

echo "📦 meeting-to-spec 설치 시작 (kai- prefix)..."
echo "소스: $SKILLS_DIR"
echo "스킬 대상: $TARGET_SKILLS_DIR"
echo "에이전트 대상: $TARGET_AGENTS_DIR"
echo ""

# 0) Legacy cleanup — 본 repo를 가리키는 비-prefix 심볼릭 링크 자동 삭제
echo "🧹 Legacy 정리 (이전 비-prefix 설치 제거)..."
LEGACY_SKILLS="meeting-to-spec"
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
for skill in kai-meeting-to-spec; do
  TARGET_FILE="$TARGET_SKILLS_DIR/$skill/SKILL.md"

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

# 2) spec-advisor 에이전트 (메타 자문, prefix 없음 — 슬래시 호출 대상 아님)
if [ -f "$SKILLS_DIR/spec-advisor.md" ]; then
  TARGET_ADVISOR="$TARGET_AGENTS_DIR/spec-advisor.md"

  if [ -e "$TARGET_ADVISOR" ] && [ ! -L "$TARGET_ADVISOR" ]; then
    echo ""
    echo "⚠️  $TARGET_ADVISOR 가 이미 존재하나 심볼릭 링크가 아닙니다. 유지."
  else
    mkdir -p "$TARGET_AGENTS_DIR"
    ln -sf "$SKILLS_DIR/spec-advisor.md" "$TARGET_ADVISOR"
    echo "✓ 에이전트 spec-advisor → $TARGET_ADVISOR"
  fi
fi

# 3) 7개 Role Agent (prefix 없음 — Agent tool subagent_type으로 호출되므로 슬래시 충돌 없음)
for agent in m2s-curator m2s-ba m2s-ops m2s-marketing m2s-tech m2s-ceo m2s-design; do
  SRC="$SKILLS_DIR/agents/$agent.md"
  TARGET="$TARGET_AGENTS_DIR/$agent.md"

  if [ ! -f "$SRC" ]; then
    echo "⚠️  $SRC 파일이 없어 건너뜁니다."
    continue
  fi

  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "⚠️  $TARGET 이 심볼릭 링크가 아닙니다. 유지하고 건너뜁니다."
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
echo "  /kai-meeting-to-spec <폴더>                  — 대화형 (단계마다 게이트)"
echo "  /kai-meeting-to-spec <폴더> --auto           — 자동 (spec-advisor 위임)"
echo "  /kai-meeting-to-spec <폴더> --stage=N        — 단일 단계 (0~6) 실행"
echo "  /kai-meeting-to-spec <폴더> --from=N         — N단계부터 끝까지 실행"
echo "  /kai-meeting-to-spec <폴더> --include=01,02  — 녹취록 필터"
echo ""
echo "🎯 팁: /kai 만 치시면 자동완성에 본인 스킬 전체가 노출됩니다."
echo ""
echo "🤖 7개 Role Agent (Agent tool로 내부 호출, 슬래시 무관):"
echo "  m2s-curator·m2s-ba·m2s-ops·m2s-marketing·m2s-tech·m2s-ceo·m2s-design"
echo "  + spec-advisor (메타 자문 escalation 대상)"
echo ""
echo "📂 산출 위치: <입력폴더>/output/"
echo "📋 게이트 피드백·자동 결정 trace: <입력폴더>/output/_TRACE.md"
echo ""
echo "💰 비용 알림: Opus 7회 호출 + advisor escalation. 녹취록 크기에 따라"
echo "    1회 파이프라인당 추정 \$5~15 API 비용."
