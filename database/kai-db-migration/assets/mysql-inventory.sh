#!/bin/bash
# 서버 수준 실측 — GATE 1. 원본과 대상 양쪽에 돌려 diff 한다.
# 출력은 "키<탭>값" 정렬 — 값 비교가 목적이므로 diff 가 곧 판정이다.
set -euo pipefail
. "$(dirname "$0")/_conn.sh"

myq "
SELECT 'version',                    VERSION()
UNION ALL SELECT 'lower_case_table_names', @@lower_case_table_names
UNION ALL SELECT 'lower_case_file_system', @@lower_case_file_system
UNION ALL SELECT 'character_set_server',  @@character_set_server
UNION ALL SELECT 'collation_server',      @@collation_server
UNION ALL SELECT 'default_storage_engine',@@default_storage_engine
UNION ALL SELECT 'sql_mode',              @@sql_mode
UNION ALL SELECT 'time_zone',             @@time_zone
UNION ALL SELECT 'system_time_zone',      @@system_time_zone
UNION ALL SELECT 'max_allowed_packet',    @@max_allowed_packet
UNION ALL SELECT 'innodb_buffer_pool_size', @@innodb_buffer_pool_size
UNION ALL SELECT 'event_scheduler',       @@event_scheduler
"
