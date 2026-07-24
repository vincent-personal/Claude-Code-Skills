#!/bin/bash
# ⚠️ NOTE(feat/task-mcp-crossverify): 레거시 전환기 전용 — 이 브랜치는 새 .codex.md 를
#   생성하지 않는다(교차 검증은 워커가 kai_consult로 수행·본문 직접 기록). 구 파이프라인이
#   남긴 .plans 고아만 종결하며, 고아 소진 후엔 완전 no-op. 잔존 확인 후 제거 후보.
# task-finalize-codex.sh — Codex 리스크 분석의 종결(본문 첨부 + .plans 청소)을 멱등 복구
#
# 두 호출자가 이 하나의 로직을 공유한다(DRY — 첨부 포맷 드리프트 방지):
#   1) task-poll-and-attach.sh (Step 5)   — 방금 처리한 배치를 종결 (task 파일명 인자)
#   2) kai-task-run Step 0-A (loop 시작)  — poll을 못 거친 .plans 고아를 sweep (인자 없음 = 전체)
#
# 왜 필요한가: 첨부·삭제가 poll(Step 5) 단일 지점에만 있으면, run 루프가 그 지점을
#   통과하지 못할 때(세션 종료·사용자 개입·크래시) codex.md/prompt.txt가 고아로 남고
#   Codex 분석이 done 본문에 첨부되지 못한 채 유실된다. 이 헬퍼를 loop 시작 시에도
#   돌려, 어느 종료 경로에서든 다음 run 진입 때 자동 복구(첨부→청소)한다.
#
# Usage:
#   task-finalize-codex.sh <SESSION_ROOT> [task_filename ...]
#     인자 있음  → 그 task들만 종결        (poll 모드)
#     인자 없음  → .plans/*.codex.md 전체   (sweep 모드)
#
# 각 task 종결 규칙 (task 파일명 f):
#   done/ 또는 done/archive/ 에 존재 → (미첨부일 때만) codex 분석 본문 첨부 → codex.md+prompt.txt 삭제
#   blocked/ 에 존재                 → 삭제만 (재시도 시 task-claim-and-plan.sh 가 재생성)
#   todo/·doing/·부재                → skip (현재 run 진행 중 — sweep이 방해하지 않음)

SESSION_ROOT="${1:-}"
[ -z "$SESSION_ROOT" ] && { echo "Usage: $0 <SESSION_ROOT> [task_filename ...]" >&2; exit 1; }
shift

TASKS="$SESSION_ROOT/docs/tasks"
DONE="$TASKS/done"
ARCHIVE="$TASKS/done/archive"
BLOCKED="$TASKS/blocked"
PLANDIR="$TASKS/.plans"
[ -d "$PLANDIR" ] || exit 0

# 종결 대상 task 파일명 목록
TARGETS=()
if [ "$#" -gt 0 ]; then
  TARGETS=("$@")                          # poll 모드: 명시된 배치
else
  for p in "$PLANDIR"/*.codex.md; do      # sweep 모드: codex.md 가 있는 전체 고아
    [ -e "$p" ] || continue
    b=$(basename "$p")
    TARGETS+=("${b%.codex.md}")
  done
fi

cleanup() {  # $1 = task 파일명 f — .plans 임시파일 삭제
  find "$PLANDIR" -maxdepth 1 -type f \
    \( -name "$1.codex.md" -o -name "$1.prompt.txt" \) -delete 2>/dev/null || true
}

for f in "${TARGETS[@]}"; do
  plan="$PLANDIR/$f.codex.md"

  # 완료 파일 위치 판정 (done/ 우선, 없으면 archive/)
  dt=""
  [ -f "$DONE/$f" ] && dt="$DONE/$f"
  [ -z "$dt" ] && [ -f "$ARCHIVE/$f" ] && dt="$ARCHIVE/$f"

  if [ -n "$dt" ]; then
    # done(또는 archive): 원본이 있고 아직 첨부 안 됐으면 첨부 (멱등 가드)
    if [ -f "$plan" ] && ! grep -q "Codex 리스크 분석" "$dt"; then
      {
        echo
        echo "## Codex 리스크 분석 (참고)"
        echo "> Codex가 독립 수행한 적대적 리뷰(치명적 위험·사각지대·대안 접근). 실제 구현은 워커(Claude)가 이를 자체 플랜과 종합·최종판단한 결과이므로 이와 다를 수 있다."
        echo
        cat "$plan"
      } >> "$dt"
    fi
    cleanup "$f"
  elif [ -f "$BLOCKED/$f" ]; then
    # blocked: 삭제만 (poll 실제 동작과 일치)
    cleanup "$f"
  fi
  # else: todo/·doing/·부재 → skip (진행 중이므로 건드리지 않음)
done
