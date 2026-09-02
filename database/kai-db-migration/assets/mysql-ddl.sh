#!/bin/bash
# 객체 **정의 본문** 추출 — GATE 7-1B.  사용: mysql-ddl.sh <DB>
# 개수와 이름이 같아도 본문(컬럼 기본값·CHECK·파티션·generated 식·뷰 SQL·
# 프로시저 본문·트리거 본문)이 다를 수 있다. 이름 대조만으로는 못 잡는다.
set -uo pipefail
DB="${1:?DB 이름 필요}"
. "$(dirname "$0")/_conn.sh"

norm() {
  # 환경 차이로 당연히 달라지는 것만 정규화한다.
  # ⚠️ DEFINER·SQL SECURITY·sql_mode·charset·collation 은 **지우지 않는다** — 진짜 차이다.
  sed -E 's/AUTO_INCREMENT=[0-9]+ ?//g'
}

for t in $(myq "SELECT TABLE_NAME FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA='$DB' AND TABLE_TYPE='BASE TABLE' ORDER BY BINARY TABLE_NAME"); do
  echo "===== TABLE $t"; myq "SHOW CREATE TABLE \`$DB\`.\`$t\`" | cut -f2- | norm
done
for v in $(myq "SELECT TABLE_NAME FROM information_schema.VIEWS
                 WHERE TABLE_SCHEMA='$DB' ORDER BY BINARY TABLE_NAME"); do
  echo "===== VIEW $v"; myq "SHOW CREATE VIEW \`$DB\`.\`$v\`" | cut -f2-3
done
for r in $(myq "SELECT ROUTINE_NAME FROM information_schema.ROUTINES
                 WHERE ROUTINE_SCHEMA='$DB' AND ROUTINE_TYPE='PROCEDURE' ORDER BY BINARY ROUTINE_NAME"); do
  echo "===== PROCEDURE $r"; myq "SHOW CREATE PROCEDURE \`$DB\`.\`$r\`" | cut -f2-
done
for f in $(myq "SELECT ROUTINE_NAME FROM information_schema.ROUTINES
                 WHERE ROUTINE_SCHEMA='$DB' AND ROUTINE_TYPE='FUNCTION' ORDER BY BINARY ROUTINE_NAME"); do
  echo "===== FUNCTION $f"; myq "SHOW CREATE FUNCTION \`$DB\`.\`$f\`" | cut -f2-
done
# 트리거는 **순서까지** 의미가 있다 (같은 테이블·타이밍에 여럿이면 실행 순서가 동작을 바꾼다)
myq "SELECT CONCAT('===== TRIGGER ', TRIGGER_NAME, ' [', ACTION_TIMING, ' ', EVENT_MANIPULATION,
            ' ON ', EVENT_OBJECT_TABLE, ' order=', ACTION_ORDER, ']\n', ACTION_STATEMENT)
       FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$DB'
       ORDER BY BINARY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER"
myq "SELECT CONCAT('===== EVENT ', EVENT_NAME, ' [', STATUS, ' ', IFNULL(EVENT_DEFINITION,''), ']')
       FROM information_schema.EVENTS WHERE EVENT_SCHEMA='$DB' ORDER BY BINARY EVENT_NAME"
