#!/bin/bash
# task-skills 설치 스크립트 (kai- prefix 적용 / legacy 자동 정리)
# ~/.claude/skills/ 에 심볼릭 링크를 생성한다.
# 업데이트 시 이 repo를 git pull하면 자동으로 반영된다.

set -e

SKILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_SKILLS_DIR="$HOME/.claude/skills"
TARGET_AGENTS_DIR="$HOME/.claude/agents"

echo "📦 task-skills 설치 시작 (kai- prefix)..."
echo "소스: $SKILLS_DIR"
echo "스킬 대상: $TARGET_SKILLS_DIR"
echo "에이전트 대상: $TARGET_AGENTS_DIR"
echo ""

# 0) Legacy cleanup — 본 repo를 가리키는 비-prefix 심볼릭 링크 자동 삭제
echo "🧹 Legacy 정리 (이전 비-prefix 설치 제거)..."
LEGACY_SKILLS="task-add task-run task-clear task-list"
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

# 1) 스킬 설치 (kai- prefix)
for skill in kai-task-add kai-task-run kai-task-clear kai-task-list; do
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

# 2) advisor 에이전트 설치 (prefix 없음 — 슬래시 호출 대상 아님)
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

# 3) settings.json 권한 패치 — 워커 에이전트가 멈추지 않도록 필요한 Bash 패턴 추가
SETTINGS="$HOME/.claude/settings.json"
echo "🔐 settings.json Bash 권한 패치..."

if [ ! -f "$SETTINGS" ]; then
  echo "  ⚠️  $SETTINGS 가 없습니다. 건너뜁니다."
else
  # 추가할 패턴 목록
  PATTERNS=(
    "Bash(mv:*)"
    "Bash(stat:*)"
    "Bash(awk:*)"
    "Bash(grep:*)"
    "Bash(wc:*)"
    "Bash(sed:*)"
    "Bash(basename:*)"
    "Bash(sort:*)"
    "Bash(head:*)"
    "Bash(git checkout:*)"
    "Bash(git branch:*)"
    "Bash(git merge:*)"
  )

  for pattern in "${PATTERNS[@]}"; do
    # 이미 존재하면 건너뜀
    if grep -q "\"$pattern\"" "$SETTINGS" 2>/dev/null; then
      echo "  ✓ 이미 있음: $pattern"
    else
      # "allow": [ 배열 안 첫 번째 항목 앞에 삽입 (portable python3 사용)
      python3 - "$SETTINGS" "$pattern" <<'PYEOF'
import sys, json
path, pat = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
allow = data.setdefault("permissions", {}).setdefault("allow", [])
if pat not in allow:
    allow.append(pat)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  ✓ 추가됨: {pat}")
else:
    print(f"  ✓ 이미 있음: {pat}")
PYEOF
    fi
  done
fi

echo ""
echo "✅ 설치 완료!"
echo ""
echo "사용법 (파일-per-task 모델 · docs/tasks/):"
echo "  /kai-task-add  {작업 설명}   — docs/tasks/todo/ 에 작업 파일 1개 추가"
echo "  /kai-task-run                — todo/ 의 가장 먼저 만든 작업을 mv 선점 후 완수"
echo "  /kai-task-clear              — done/ 완료 작업을 done/archive/ 로 정리"
echo "  /kai-task-list               — 미완료 작업(todo·doing·blocked) 요약 출력"
echo ""
echo "🎯 팁: /kai 만 치시면 자동완성에 본인 스킬 전체가 노출됩니다."
echo ""
echo "백그라운드 루프 일시 정지:"
echo "  touch {PROJECT_ROOT}/.claude/user.lock"
echo "  → 사용자 작업 끝나면 rm 으로 해제"
