#!/bin/bash
# task-claim-and-plan.sh — Step 2: FIFO 배치 선정 + 원자 선점
# Usage: task-claim-and-plan.sh <SESSION_ROOT> [max_batch=5]
#
# NOTE(feat/task-mcp-crossverify): Codex CLI launch+wait 블록 제거 —
#   리스크 분석은 워커가 착수 시 kai-gen MCP(kai_consult)로 직접 수행한다.
#   이 스크립트는 순수 파일시스템 연산(<1초)만 남아 Step 2 블로킹이 없다.
#
# stdout:
#   CLAIMED:<filename>   선점 성공한 task 파일명 (todo→doing 이동됨)
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
  # 주석 제거: '# ...' 외에 ' (신규 ...)' 류 괄호 주석도 잘라낸다 — 공백 토큰 분할 시
  # 주석 조각("(신규" 등)이 다른 task와 거짓 충돌(기아)을 만드는 것을 방지
  files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); gsub(/[[:space:]]*\(.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$df")
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
  # 두 YAML 형식을 모두 파싱한다 — 인라인 `predecessors: [a, b]` 와 블록 `- a` 줄.
  # 인라인을 놓치면 선행조건이 빈 값으로 읽혀 게이트가 통째로 무력화된다 (2026-07-26 실사고).
  preds=$(awk '/^---$/{c++; next}
    c==1 && /^predecessors:/{
      v=$0; sub(/^predecessors:[[:space:]]*/,"",v); sub(/[[:space:]]*#.*$/,"",v)
      if (v ~ /^\[/) { gsub(/[][,]/," ",v); print v; b=0 } else { b=1 }
      next
    }
    c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); print; next}
    c==1 && b && /^[^[:space:]]/{b=0}' "$tf")
  ok=1
  for pred in $preds; do
    echo "$done_ids" | grep -qF "$pred" || { ok=0; break; }
  done
  [ "$ok" -eq 1 ] || continue

  # ② impact_files 추출
  candidate_files=$(awk '/^---$/{c++; next} c==1 && /^impact_files:/{b=1; next} c==1 && b && /^[[:space:]]*-[[:space:]]/{gsub(/^[[:space:]]*-[[:space:]]*/,""); gsub(/[[:space:]]*#.*$/,""); gsub(/[[:space:]]*\(.*$/,""); print; next} c==1 && b && /^[^[:space:]]/{b=0}' "$tf")
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
