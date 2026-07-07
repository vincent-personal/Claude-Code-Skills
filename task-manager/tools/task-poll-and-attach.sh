#!/bin/bash
# task-poll-and-attach.sh — Step 5 (슬롯 리필판): 추적 중인 워커 중 "하나라도 종료되면 즉시 반환"
# Usage: task-poll-and-attach.sh <SESSION_ROOT> <f1> [f2] ...
#   f들 = 현재 INFLIGHT (도는 워커의 task 파일명)
#
# stdout (run 루프가 파싱):
#   DONE:<f>      이번 회전에 done/ 도달
#   BLOCKED:<f>   이번 회전에 blocked/ 도달
#   RUNNING:<f>   아직 doing/ (INFLIGHT 유지)
#
# 슬롯 리필 설계:
#   - 배리어(구): PENDING=0(배치 전부)까지 대기.
#   - 리필(현) : pending < 진입시(=하나라도 완료) 즉시 반환 → 빈 슬롯을 run이 곧바로 리필.
#   - 진행중(doing 잔존)은 RUNNING으로 보고 → run이 다음 회전 poll에 다시 넘긴다.
#   - MAX(1시간) 동안 아무도 안 끝나면 좀비 정리(committed면 done, 아니면 blocked).

SESSION_ROOT="${1:-}"
shift
CLAIMED_BATCH=("$@")

[ -z "$SESSION_ROOT" ] && { echo "Usage: $0 <SESSION_ROOT> <f1> [f2]..." >&2; exit 1; }
[ "${#CLAIMED_BATCH[@]}" -eq 0 ] && { echo "Usage: $0 <SESSION_ROOT> <f1> [f2]..." >&2; exit 1; }

TASKS="$SESSION_ROOT/docs/tasks"
DONE="$TASKS/done"
BLOCKED="$TASKS/blocked"
DOING="$TASKS/doing"

# 미완(doing 잔존) 개수
count_pending() {
  local p=0 f
  for f in "${CLAIMED_BATCH[@]}"; do
    [ -f "$DONE/$f" ] && continue
    [ -f "$BLOCKED/$f" ] && continue
    p=$((p + 1))
  done
  echo "$p"
}

pending0=$(count_pending)

# 미완이 있으면: 하나라도 완료될 때까지(또는 MAX) 대기
if [ "$pending0" -gt 0 ]; then
  MAX=3600; ELAPSED=0
  while true; do
    pending=$(count_pending)
    # ★ 하나라도 완료(pending 감소) → 즉시 반환 (빈 슬롯 리필 신호)
    [ "$pending" -lt "$pending0" ] && break
    [ "$pending" -eq 0 ] && break
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    [ "$ELAPSED" -ge "$MAX" ] && break
  done
fi

# MAX 도달(아무도 안 끝남) 시에만: 남은 doing → committed면 done, 아니면 blocked (좀비 정리)
if [ "$pending0" -gt 0 ] && [ "$(count_pending)" -eq "$pending0" ]; then
  for f in "${CLAIMED_BATCH[@]}"; do
    tf="$DOING/$f"
    [ -f "$tf" ] || continue
    if awk '/^---$/{c++; next} c==1 && /^committed:[[:space:]]*[0-9a-f]/{found=1} END{exit !found}' "$tf" 2>/dev/null; then
      mv "$tf" "$DONE/$f" 2>/dev/null || true
    else
      mv "$tf" "$BLOCKED/$f" 2>/dev/null || true
    fi
  done
fi

# Codex 종결(첨부+청소) — 공용 헬퍼. done/archive면 첨부 후 삭제, blocked면 삭제, 진행중이면 skip.
FINALIZE="$HOME/.claude/tools/task-finalize-codex.sh"
if [ -x "$FINALIZE" ]; then
  bash "$FINALIZE" "$SESSION_ROOT" "${CLAIMED_BATCH[@]}"
fi

# 결과 출력: 종료분(DONE/BLOCKED) + 진행중(RUNNING)
for f in "${CLAIMED_BATCH[@]}"; do
  if [ -f "$DONE/$f" ]; then
    echo "DONE:$f"
  elif [ -f "$BLOCKED/$f" ]; then
    echo "BLOCKED:$f"
  elif [ -f "$DOING/$f" ]; then
    echo "RUNNING:$f"
  else
    # doing/done/blocked 어디에도 없음(mv 순간 등) — 안전하게 진행중 취급
    echo "RUNNING:$f"
  fi
done
