#!/bin/bash
# 테이블별 **데이터 내용** 체크섬 — GATE 7-2B.  사용: mysql-checksum.sh <DB>
# ⚠️ count(*) 일치는 내용 일치의 증거가 아니다. 한 행이 지워지고 다른 행이 들어가도 수는 같다.
#
# 방법: 각 테이블에 CHECKSUM TABLE 을 돌린다. MySQL 이 행 내용 기반으로 계산하므로
#       삽입·삭제·값 변경을 모두 잡는다. 양쪽 엔진·버전이 같은 계열일 때 유효하다.
# ⚠️ 한계: 엔진/행 포맷이 다르면 값이 달라질 수 있다. 그때는 불일치 테이블만
#          PK 순 정렬 후 내용 해시로 재확인한다 (references/queries.md 참조).
set -uo pipefail
DB="${1:?DB 이름 필요}"
. "$(dirname "$0")/_conn.sh"

for t in $(myq "SELECT TABLE_NAME FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA='$DB' AND TABLE_TYPE='BASE TABLE' ORDER BY BINARY TABLE_NAME"); do
  myq "CHECKSUM TABLE \`$DB\`.\`$t\` EXTENDED"
done
