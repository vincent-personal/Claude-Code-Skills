#!/bin/bash
# 전 테이블 실제 count(*) — GATE 3 / GATE 7-2.  사용: mysql-rowcount.sh <DB>
# ⚠️ information_schema.TABLE_ROWS 는 InnoDB 추정치라 틀린다. 절대 쓰지 않는다.
# ⚠️ GROUP_CONCAT 은 기본 1024바이트에서 **말없이 잘린다** — 테이블이 수십 개만 돼도
#    생성된 SQL 이 깨진다. 반드시 같은 세션(-e 한 번)에서 group_concat_max_len 을 올린다. (실제로 겪음)
set -uo pipefail
DB="${1:?DB 이름 필요}"
. "$(dirname "$0")/_conn.sh"

SQL=$(myq "
SET SESSION group_concat_max_len = 64*1024*1024;
SELECT GROUP_CONCAT(
         CONCAT('SELECT ''', REPLACE(TABLE_NAME,'''',''''''), ''' t, COUNT(*) c FROM \`$DB\`.\`', TABLE_NAME, '\`')
         SEPARATOR ' UNION ALL ')
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA='$DB' AND TABLE_TYPE='BASE TABLE';")

[ -n "$SQL" ] && [ "$SQL" != "NULL" ] || { echo "테이블이 없다: $DB" >&2; exit 1; }
case "$SQL" in *"SELECT"*) : ;; *) echo "생성된 SQL 이 이상하다 (잘렸을 수 있다)" >&2; exit 1;; esac

myq "SELECT t, c FROM ($SQL) x ORDER BY BINARY t;"
myq "SELECT '__TOTAL__', SUM(c) FROM ($SQL) y;"
