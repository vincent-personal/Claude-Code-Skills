#!/bin/bash
# task-poll-and-attach.sh — Step 5: 배치 폴링 + timeout 처리 + Codex 분석 첨부
# Usage: task-poll-and-attach.sh <SESSION_ROOT> <f1> [f2] ...
#
# stdout:
#   DONE:<filename>
#   BLOCKED:<filename>
#   TIMEOUT:<filename>

SESSION_ROOT="${1:-}"
shift
CLAIMED_BATCH=("$@")

[ -z "$SESSION_ROOT" ] && { echo "Usage: $0 <SESSION_ROOT> <f1> [f2]..." >&2; exit 1; }
[ "${#CLAIMED_BATCH[@]}" -eq 0 ] && { echo "Usage: $0 <SESSION_ROOT> <f1> [f2]..." >&2; exit 1; }

TASKS="$SESSION_ROOT/docs/tasks"
DONE="$TASKS/done"
BLOCKED="$TASKS/blocked"
DOING="$TASKS/doing"
PLANDIR="$TASKS/.plans"

# 폴링 — 모든 task가 done/ 또는 blocked/ 에 도달할 때까지 대기
MAX=3600; ELAPSED=0
while true; do
  PENDING=0
  for f in "${CLAIMED_BATCH[@]}"; do
    [ -f "$DONE/$f" ] && continue
    [ -f "$BLOCKED/$f" ] && continue
    PENDING=$((PENDING + 1))
  done
  [ "$PENDING" -eq 0 ] && break
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  [ "$ELAPSED" -ge "$MAX" ] && break
done

# timeout 처리 — 남은 doing/ 파일: committed: 있으면 done, 없으면 blocked
for f in "${CLAIMED_BATCH[@]}"; do
  tf="$DOING/$f"
  [ -f "$tf" ] || continue
  if awk '/^---$/{c++; next} c==1 && /^committed:[[:space:]]*[0-9a-f]/{found=1} END{exit !found}' "$tf" 2>/dev/null; then
    mv "$tf" "$DONE/$f" 2>/dev/null || true
  else
    mv "$tf" "$BLOCKED/$f" 2>/dev/null || true
  fi
done

# Codex 리스크 분석 종결(본문 첨부 + .plans 청소) — 공용 헬퍼로 위임.
# loop 시작 sweep(kai-task-run Step 0-A)과 동일 로직을 공유해 첨부 포맷 드리프트를 막는다.
# done/archive면 (미첨부 시) 첨부 후 삭제, blocked면 삭제 — 종료 상태 판정은 헬퍼가 수행.
FINALIZE="$HOME/.claude/tools/task-finalize-codex.sh"
if [ -x "$FINALIZE" ]; then
  bash "$FINALIZE" "$SESSION_ROOT" "${CLAIMED_BATCH[@]}"
fi

# 결과 출력
for f in "${CLAIMED_BATCH[@]}"; do
  if [ -f "$DONE/$f" ]; then
    echo "DONE:$f"
  elif [ -f "$BLOCKED/$f" ]; then
    echo "BLOCKED:$f"
  else
    echo "TIMEOUT:$f"
  fi
done
