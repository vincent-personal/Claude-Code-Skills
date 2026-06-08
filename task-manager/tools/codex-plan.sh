#!/usr/bin/env bash
#region codex-plan.sh — Codex로 task 구현 플랜 생성 (kai-task-run 워커 보조)
# 사용: codex-plan.sh <work_dir> <prompt_file> <out_file>
#   <work_dir>     : codex가 탐색할 git 프로젝트 루트 (-C)
#   <prompt_file>  : 플랜 요청 프롬프트 (산문, 코드 인라인 금지 — codex가 직접 파일을 읽음)
#   <out_file>     : 성공 시 플랜 본문을 기록할 파일
#
# 종료 코드 (비0 = 워커는 자체 플랜으로 진행 = 원래 동작):
#   0  성공 — out_file에 플랜 기록됨
#   2  인자/경로 오류
#   3  codex 미설치 또는 미로그인  ← "codex 없으면 원래대로"
#   4  세션/rollout 캡처 실패
#   5  codex가 완료되지 않음(task_complete 없음) 또는 플랜 본문 없음 ← 배회/중단 방어
#endregion
set -u

WORK="${1:-}"; PF="${2:-}"; OUT="${3:-}"
[ -n "$WORK" ] && [ -n "$PF" ] && [ -n "$OUT" ] || { echo "usage: codex-plan.sh <work_dir> <prompt_file> <out_file>" >&2; exit 2; }
[ -d "$WORK" ] && [ -f "$PF" ] || exit 2

#region 가용성 게이트 — codex 없으면 즉시 비0 (워커 원래 동작)
command -v codex >/dev/null 2>&1 || exit 3
codex login status >/dev/null 2>&1 || exit 3
#endregion

#region 검수 실행 — 프롬프트는 stdin(-)으로 전달(셸 인용 문제 회피), read-only 샌드박스
meta=$(codex exec -C "$WORK" -s read-only - < "$PF" 2>&1)
sid=$(printf '%s' "$meta" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
[ -n "$sid" ] || exit 4
roll=$(find "$HOME/.codex/sessions" -name "*$sid*.jsonl" 2>/dev/null | head -1)
[ -f "$roll" ] || exit 4
#endregion

#region 플랜 추출 — 반드시 task_complete 이벤트의 last_agent_message (서두 agent_message 아님)
plan=$(python3 - "$roll" <<'PY'
import sys, json
roll = sys.argv[1]
done = False; plan = None
with open(roll, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        p = o.get("payload", {}) or {}
        if p.get("type") == "task_complete":
            done = True
            plan = p.get("last_agent_message")
# task_complete 없음 = codex 미완료(배회/중단) → 비0로 폴백 신호
if not done or not plan or not plan.strip():
    sys.exit(5)
print(plan)
PY
) || exit 5
#endregion

#region 원자적 저장
tmp="$OUT.tmp.$$"
printf '%s\n' "$plan" > "$tmp" && mv "$tmp" "$OUT" || exit 2
#endregion
exit 0
