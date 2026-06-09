#!/bin/bash
# codex-plan.sh — Codex 비대화형 구현 플랜 생성
# Usage: codex-plan.sh <PROJECT_ROOT> <PROMPT_FILE> <OUTPUT_FILE>
#
# kai-task-run Step 4-A 에서 호출됨.
# 프롬프트 파일을 stdin으로 넘기고, 마지막 응답을 OUTPUT_FILE에 저장한다.

set -e

PROJECT_ROOT="$1"
PROMPT_FILE="$2"
OUTPUT_FILE="$3"

if [ -z "$PROJECT_ROOT" ] || [ -z "$PROMPT_FILE" ] || [ -z "$OUTPUT_FILE" ]; then
  echo "Usage: $0 <PROJECT_ROOT> <PROMPT_FILE> <OUTPUT_FILE>" >&2
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "PROJECT_ROOT not found: $PROJECT_ROOT" >&2
  exit 1
fi

exec codex exec \
  -C "$PROJECT_ROOT" \
  -s read-only \
  --ephemeral \
  -o "$OUTPUT_FILE" \
  < "$PROMPT_FILE"
