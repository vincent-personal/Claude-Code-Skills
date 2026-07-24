#!/bin/bash
# task-claim-and-plan.sh — Step 2: FIFO 배치 선정 + 원자 선점 + Codex 리스크 분석
# Usage: task-claim-and-plan.sh <SESSION_ROOT> [max_batch=5]
#
# stdout:
#   CLAIMED:<filename>   선점 성공한 task 파일명 (todo→doing 이동됨)
#   CODEX:<n>            codex 리스크 분석 완료 건수
#   NONE                 착수 가능한 작업 없음

SESSION_ROOT="${1:-}"
MAX_BATCH="${2:-5}"   # 전역 동시성 상한 N — 슬롯 리필 시 '도는 워커 포함' 최대 N (배치 최대치가 아님)

[ -z "$SESSION_ROOT" ] && { echo "Usage: $0 <SESSION_ROOT> [max_batch]" >&2; exit 1; }

TASKS="$SESSION_ROOT/docs/tasks"
TODO="$TASKS/todo"
DOING="$TASKS/doing"
DONE="$TASKS/done"
BLOCKED="$TASKS/blocked"
PLANDIR="$TASKS/.plans"
mkdir -p "$TODO" "$DOING" "$DONE" "$BLOCKED" "$TASKS/.staging" "$PLANDIR"

# done IDs (predecessors 검사용 — '--' 이전 prefix만 추출)
# done/ 최상위 + done/archive/ 모두 포함 — 아카이브된 완료 작업도 predecessor로 인정해야 함
# (아카이브 후 predecessor 미인식으로 후속 task가 영원히 선점되지 않는 버그 방지)
done_ids=$( { ls "$DONE/" 2>/dev/null; ls "$DONE/archive/" 2>/dev/null; } | sed 's/--.*//' )

# doing/ 에서 잠긴 파일 목록 + 점유 슬롯 수 수집
locked_files=""
doing_count=0
for df in "$DOING"/*.md; do
  [ -e "$df" ] || continue
  doing_count=$((doing_count + 1))
  files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$df")
  locked_files="$locked_files $files"
done

# 가용 슬롯 = 전역 동시성 상한(MAX_BATCH=N) − 현재 도는 워커 수.
#   배치 모델(호출 시 doing 비어있음)에선 available=N → 기존과 완전 동일(하위호환).
#   슬롯 리필 모델에선 도는 워커 수만큼 줄어, 그만큼만 새로 선점 → 동시성 N 유지.
available=$((MAX_BATCH - doing_count))
if [ "$available" -le 0 ]; then
  echo "NONE"
  exit 0
fi

# FIFO 순회 — 배치 구성
BATCH=()
batch_files=""

for tf in $(ls "$TODO"/*.md 2>/dev/null | sort); do
  [ -e "$tf" ] || continue
  f=$(basename "$tf")

  # ⓪ ready 게이트 (strict) — add 후처리 완료 표식(ready:true)만 착수한다.
  #    부재·false·기타 값은 전부 skip → add 진행중/미완성/크래시 파일이 실행되지 않음.
  #    (레거시 ready 부재 파일은 kai-task-run Step 0-A가 ready:true로 1회 stamp함)
  #    frontmatter 스코프(c==1)로만 검사 — 본문에 우연히 'ready:'가 있어도 무시.
  ready=$(awk '/^---$/{c++;next} c==1 && /^ready:/{v=$2; gsub(/[[:space:]]/,"",v); print v; exit}' "$tf")
  [ "$ready" = "true" ] || continue

  # ① 선행조건 — predecessors 모두 done에 있어야 함
  preds=$(awk '/^---$/{c++; next} c==1 && /^predecessors:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$tf")
  ok=1
  for pred in $preds; do
    echo "$done_ids" | grep -qF "$pred" || { ok=0; break; }
  done
  [ "$ok" -eq 1 ] || continue

  # ② impact_files 추출
  candidate_files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$tf")
  if [ -z "$candidate_files" ]; then
    mv "$tf" "$BLOCKED/$f" 2>/dev/null || true
    continue
  fi

  # ③ 충돌 검사 — locked_files + batch_files 교집합
  overlap=0
  for cf in $candidate_files; do
    echo "$locked_files $batch_files" | grep -qF "$cf" && overlap=1 && break
  done
  [ "$overlap" -eq 1 ] && continue

  # ④ 배치 추가
  BATCH+=("$f")
  batch_files="$batch_files $candidate_files"
  [ "${#BATCH[@]}" -ge "$available" ] && break
done

if [ "${#BATCH[@]}" -eq 0 ]; then
  echo "NONE"
  exit 0
fi

# 원자 선점 (mv)
CLAIMED_BATCH=()
for f in "${BATCH[@]}"; do
  mv "$TODO/$f" "$DOING/$f" 2>/dev/null && CLAIMED_BATCH+=("$f") || true
done

if [ "${#CLAIMED_BATCH[@]}" -eq 0 ]; then
  echo "NONE"
  exit 0
fi

# 선점 결과 출력
for f in "${CLAIMED_BATCH[@]}"; do
  echo "CLAIMED:$f"
done

# Codex 리스크 분석 — tier≥2 + codex-plan.sh 가용 시
HELPER="$HOME/.claude/tools/codex-plan.sh"

resolve_abs() {
  local rel="$1"
  case "$rel" in
    /*) [ -e "$rel" ] && { printf '%s' "$rel"; return; } ;;
  esac
  for b in "$SESSION_ROOT" "$(dirname "$SESSION_ROOT")" "$(pwd)"; do
    [ -e "$b/$rel" ] && { printf '%s' "$b/$rel"; return; }
  done
}

PIDS=()
if [ -x "$HELPER" ]; then
  for f in "${CLAIMED_BATCH[@]}"; do
    tf="$DOING/$f"
    tier=$(awk -F: '/^tier:/{gsub(/ /,"",$2); print $2; exit}' "$tf" 2>/dev/null)
    # tier 값이 없거나 숫자가 아니면 1로 처리 → skip
    [ -n "$tier" ] && [ "$tier" -ge 2 ] 2>/dev/null || continue

    # impact_files 절대경로화
    abs=""; first=""
    while IFS= read -r rel; do
      [ -z "$rel" ] && continue
      a=$(resolve_abs "$rel")
      [ -z "$a" ] && continue
      [ -z "$first" ] && first="$a"
      abs="${abs}${a}"$'\n'
    done < <(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$tf")

    [ -z "$first" ] && continue
    ROOT=$(cd "$(dirname "$first")" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) || continue
    [ -z "$ROOT" ] && continue

    PF="$PLANDIR/$f.prompt.txt"
    {
      echo "너는 20년차 시니어 스태프 엔지니어이자 적대적 코드 리뷰어다."
      echo "다른 엔지니어(Claude)가 이 task를 곧 구현한다. 너의 임무는 '또 하나의 구현안'을 내는 게 아니라, 그가 놓치기 쉬운 치명적 함정과 다른 시각을 짚어내는 것이다."
      echo "코드를 수정하지 말고, 아래 명시된 파일만 읽어 현재 상태를 파악한 뒤 다음을 한국어로 간결히 제시하라:"
      echo "1. 치명적 위험(CRITICAL): 데이터 손실, 보안 구멍, 동시성/레이스, SSR·하이드레이션 깨짐, 상태 누수, 마이그레이션 비가역성 등 — 놓치면 프로덕션이 깨지는 것."
      echo "2. 놓치기 쉬운 엣지케이스: null/빈값/대용량/동시요청/권한경계/실패경로/롤백."
      echo "3. 완전히 다른 접근: 명시적 요구를 만족하는 더 단순하거나 견고한 대안이 있다면 그 트레이드오프."
      echo "4. 검증 포인트: 구현 후 반드시 확인해야 할 항목(테스트·수동검증)."
      echo "이미 자명한 일반론은 적지 마라. 이 task·이 코드에 특정한 위험만 날카롭게 짚어라. 구현 단계 나열은 최소화하고 함정과 사각지대에 집중하라."
      echo
      awk 'BEGIN{c=0}/^---$/{c++;next} c>=2{print}' "$tf"
      echo; echo "[관련 파일]"; printf '%s' "$abs"
    } > "$PF"

    "$HELPER" "$ROOT" "$PF" "$PLANDIR/$f.codex.md" >/dev/null 2>&1 &
    PIDS+=($!)
  done

  [ "${#PIDS[@]}" -gt 0 ] && wait "${PIDS[@]}"
fi

codex_count=$(ls "$PLANDIR"/*.codex.md 2>/dev/null | wc -l | tr -d ' ')
echo "CODEX:${codex_count}"
