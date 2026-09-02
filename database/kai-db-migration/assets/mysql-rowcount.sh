#!/bin/bash
# 전 테이블 실제 count(*) — GATE 3 / GATE 7-2.  사용: mysql-rowcount.sh <DB>
# ⚠️ information_schema.TABLE_ROWS 는 InnoDB 추정치라 틀린다. 절대 쓰지 않는다.
set -euo pipefail
DB="${1:?DB 이름 필요}"
. "$(dirname "$0")/_conn.sh"

# 테이블마다 count(*) 를 UNION 으로 엮은 SQL 을 만들어 한 번에 돌린다
SQL=$(myq "
SELECT GROUP_CONCAT(
         CONCAT('SELECT ''', REPLACE(TABLE_NAME,'''',''''''), ''' t, COUNT(*) c FROM \`$DB\`.\`', TABLE_NAME, '\`')
         SEPARATOR ' UNION ALL ')
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA='$DB' AND TABLE_TYPE='BASE TABLE';")

[ -n "$SQL" ] && [ "$SQL" != "NULL" ] || { echo "테이블이 없다: $DB" >&2; exit 1; }

myq "SELECT CONCAT(t, '\t', c) FROM ($SQL) x ORDER BY BINARY t;"
myq "SELECT CONCAT('__TOTAL__\t', SUM(c)) FROM ($SQL) y;"
