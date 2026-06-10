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

# Codex 리스크 분석 → done task 본문에 첨부 + .plans 임시파일 정리
# done task: codex 성공 시 첨부, 실패해도 prompt.txt/codex.md 항상 정리
# blocked/timeout task: 두 파일 보존 (다음 시도 재사용 또는 Step 0-A 60분 GC)
for f in "${CLAIMED_BATCH[@]}"; do
  plan="$PLANDIR/$f.codex.md"
  dt="$DONE/$f"
  [ -f "$dt" ] || continue   # done 아니면 보존 (blocked/timeout 재시도용)
  if [ -f "$plan" ]; then
    {
      echo
      echo "## Codex 리스크 분석 (참고)"
      echo "> Codex가 독립 수행한 적대적 리뷰(치명적 위험·사각지대·대안 접근). 실제 구현은 워커(Claude)가 이를 자체 플랜과 종합·최종판단한 결과이므로 이와 다를 수 있다."
      echo
      cat "$plan"
    } >> "$dt"
  fi
  # done task는 codex 성공/실패 무관하게 임시파일 항상 정리
  find "$PLANDIR" -maxdepth 1 -type f \( -name "$f.codex.md" -o -name "$f.prompt.txt" \) -delete 2>/dev/null || true
done

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
