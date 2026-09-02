# 인벤토리·검증 SQL 모음

`{DB}` 를 실제 스키마명으로 바꿔 쓴다. 헬퍼(`assets/*.sh`)가 이 쿼리들을 감싼 것이다.

## 서버 실측 (GATE 1)

```sql
SELECT VERSION(), @@lower_case_table_names, @@lower_case_file_system,
       @@character_set_server, @@collation_server, @@sql_mode,
       @@default_storage_engine, @@time_zone, @@system_time_zone,
       @@max_allowed_packet, @@event_scheduler;
```

## 스키마 존재·콜레이션

```sql
SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
  FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '{DB}';
```

## 엔진 분포 (`--single-transaction` 가능 여부)

```sql
SELECT ENGINE, COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA='{DB}' AND TABLE_TYPE='BASE TABLE' GROUP BY ENGINE;
```

## 종류별 객체 수 — **프로시저와 함수를 분리**

```sql
SELECT 'table' k, COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA='{DB}' AND TABLE_TYPE='BASE TABLE'
UNION ALL SELECT 'view',      COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA='{DB}' AND TABLE_TYPE='VIEW'
UNION ALL SELECT 'procedure', COUNT(*) FROM information_schema.ROUTINES
  WHERE ROUTINE_SCHEMA='{DB}' AND ROUTINE_TYPE='PROCEDURE'
UNION ALL SELECT 'function',  COUNT(*) FROM information_schema.ROUTINES
  WHERE ROUTINE_SCHEMA='{DB}' AND ROUTINE_TYPE='FUNCTION'
UNION ALL SELECT 'trigger',   COUNT(*) FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA='{DB}'
UNION ALL SELECT 'event',     COUNT(*) FROM information_schema.EVENTS
  WHERE EVENT_SCHEMA='{DB}'
UNION ALL SELECT 'foreign_key', COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA='{DB}' AND CONSTRAINT_TYPE='FOREIGN KEY';
```

## 외래키 중 **8.4 가 거부할 것** 미리 찾기

참조 대상 컬럼에 UNIQUE/PRIMARY 인덱스가 없는 외래키를 미리 잡아낸다.

```sql
SELECT k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME,
       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE k
 WHERE k.TABLE_SCHEMA='{DB}' AND k.REFERENCED_TABLE_NAME IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.STATISTICS s
      WHERE s.TABLE_SCHEMA=k.TABLE_SCHEMA
        AND s.TABLE_NAME=k.REFERENCED_TABLE_NAME
        AND s.COLUMN_NAME=k.REFERENCED_COLUMN_NAME
        AND s.NON_UNIQUE=0 AND s.SEQ_IN_INDEX=1);
```

승격 가능한지 판단:

```sql
SELECT COUNT(*) rows_, COUNT(DISTINCT `{컬럼}`) distinct_ FROM `{DB}`.`{부모테이블}`;
-- rows_ = distinct_ 이면 UNIQUE 승격 가능. 다르면 제약 제거가 유일한 길
```

## 인증 플러그인 (8.4 호환성)

```sql
SELECT user, host, plugin FROM mysql.user ORDER BY user;
-- plugin = 'mysql_native_password' 인 계정은 8.4 에서 접속 불가
```

## DEFINER 전수

```sql
SELECT 'routine' t, ROUTINE_NAME n, DEFINER FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='{DB}'
UNION ALL SELECT 'view',    TABLE_NAME,   DEFINER FROM information_schema.VIEWS    WHERE TABLE_SCHEMA='{DB}'
UNION ALL SELECT 'trigger', TRIGGER_NAME, DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='{DB}'
UNION ALL SELECT 'event',   EVENT_NAME,   DEFINER FROM information_schema.EVENTS   WHERE EVENT_SCHEMA='{DB}';
```

## 전 테이블 실제 행수 (추정치 금지)

`assets/mysql-rowcount.sh` 가 아래를 자동 생성해 돌린다.

```sql
SELECT GROUP_CONCAT(
    CONCAT('SELECT ''', TABLE_NAME, ''' t, COUNT(*) c FROM `{DB}`.`', TABLE_NAME, '`')
    SEPARATOR ' UNION ALL ')
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA='{DB}' AND TABLE_TYPE='BASE TABLE';
-- 출력된 SQL 을 그대로 실행하면 전 테이블 count(*) 가 한 번에 나온다
```

⚠️ 테이블이 매우 많으면 `group_concat_max_len` 을 먼저 올린다.

```sql
SET SESSION group_concat_max_len = 1024*1024;
```

## 실접속 검증 (GATE 7-3)

앱이 붙을 **그 경로 그대로**:

```bash
docker run --rm --network {앱네트워크} -e MYSQL_PWD='...' mysql:8.4 \
  mysql -h {컨테이너명} -u {앱계정} -e "SELECT COUNT(*) FROM \`{DB}\`.\`{대표테이블}\`;"
```

- 대표 테이블 조회
- **프로시저 1개 실제 호출** (`CALL ...`)
- 뷰 1개 조회
