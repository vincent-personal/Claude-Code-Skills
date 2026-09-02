# MySQL 이전 함정 — 전부 실제로 겪은 것

> 출처: `AHAJA_BIBLE` Azure(Windows · MySQL 8.0.33) → Helsinki(Linux 컨테이너 · MySQL 8.4.11)
> 이전, 2026-08-31. 추측으로 적은 항목은 없다.

---

## 1. 🔴 `lower_case_table_names` — 값을 치른 함정

**증상.** 이전은 "완벽" 했다. 테이블 93개, 행수 754,586 전수 대조 통과.
그런데 **백엔드를 붙이자 깨졌다.** 사용자가 앱 코드의 대소문자를 손봐야 했다.

**원인.**

| | 원본 (Windows) | 대상 (Linux) |
|---|---|---|
| `lower_case_table_names` | **1** | **0** (기본) |
| 이름 저장 | 소문자로 강제 저장 | 선언한 그대로 |
| 이름 비교 | **대소문자 무시** | **구분** |

Windows 에서 `SELECT * FROM UserTable` 이든 `usertable` 이든 다 됐다.
Linux 에서는 **저장된 철자와 정확히 같아야** 한다.

**핵심.** 이 값은 **데이터 디렉터리를 처음 만들 때만 정할 수 있다.**
이미 돌고 있는 인스턴스에서는 **바꿀 수 없다.** `my.cnf` 에 적고 재시작하면
MySQL 8.0+ 는 아예 **기동을 거부**한다(데이터 디렉터리 초기화 값과 불일치).

**대응.** 컨테이너면 데이터 볼륨을 비우고 `command: --lower-case-table-names=1` 로
**재초기화**한다. ⚠️ **그 인스턴스에 다른 스키마가 들어 있으면 함께 죽는다** —
운영 중인 공유 인스턴스에서는 불가능하다. 그때는 전용 인스턴스를 새로 띄우거나,
불일치를 감수하고 **앱 코드를 고친다(사용자 동의 필수)**.

**교훈.** 잰 다음 옮긴다. 옮긴 다음 재면 늦는다.

> 컬럼명은 어느 설정에서도 **대소문자를 구분하지 않는다.** 문제가 되는 것은
> **테이블명과 스키마명**이다. 다만 덤프·복원은 선언 철자를 보존하므로,
> 검증 때 `ORDER BY BINARY name` 으로 **철자까지 대조**한다.

---

## 2. 🔴 `mysql_native_password` — 8.4 에서 **기본 비활성화** (제거는 9.0)

원본 `root` 가 이 플러그인을 쓰고 있었다.

> ⚠️ **정정.** 처음엔 "8.4 에서 제거" 라 적었으나 **틀렸다.**
> **8.4 = 기본 비활성화**(`--mysql-native-password=ON` 으로 되살릴 수는 있으나 deprecated),
> **9.0 = 완전 제거**. 결과적으로 대상에서 접속이 막히는 것은 같으나 **원인과 선택지가 다르다.**
> (2026-09-02 타 모델 교차 검증에서 잡힌 사실 오류)

**대응.** 대상에 `caching_sha2_password` 로 **새 계정**을 만든다.
Pomelo/MySqlConnector·JDBC 최신 드라이버는 전부 지원한다.
⚠️ 다만 `caching_sha2_password` 는 **첫 접속에 TLS 또는 RSA 공개키 교환**이 필요하다.
드라이버 설정(`AllowPublicKeyRetrieval` 등)을 함께 확인한다.

```sql
CREATE USER 'app'@'%' IDENTIFIED WITH caching_sha2_password BY '...';
GRANT ALL PRIVILEGES ON `DBNAME`.* TO 'app'@'%';
```

> 곁들여: 앱에 `root` 를 주지 않는다. 스키마 한정 계정을 만든다.

---

## 3. 🔴 유일하지 않은 컬럼을 참조하는 외래키 — 8.0 허용 / 8.4 **기본값에서** 거부

> ⚠️ **먼저 볼 것: `@@restrict_fk_on_non_standard_key`** (8.4 신설, 기본 `ON`).
> **`OFF` 로 두면 제약을 지우지 않고 그대로 이전할 수 있다.** 아래 "제약 제거" 는
> 이 설정을 쓸 수 없을 때의 **최후 수단**이다. 지난번엔 이 변수를 몰라 곧바로 제거했다.
> (2026-09-02 교차 검증에서 지적)

```
user_bible_verse_title.VIDEO_TAG → bible_verse_video.VIDEO_TAG
```

부모 컬럼 `bible_verse_video.VIDEO_TAG` 에 **UNIQUE 가 없었다**(일반 인덱스만).
외래키는 참조 컬럼이 유일해야 하는데, **8.0 은 레거시 InnoDB 동작으로 허용**했고
**8.4 는 거부**한다. **원본 스키마의 결함**이다.

**조사 → 판단.** UNIQUE 로 승격 가능한지 먼저 본다.

```sql
SELECT COUNT(*) rows_, COUNT(DISTINCT VIDEO_TAG) distinct_ FROM bible_verse_video;
-- 625행 / 고유값 71 → 승격 불가
```

**대응.** `CONSTRAINT` 줄만 제거하고 **`KEY` 인덱스는 남겼다** (조회 성능 유지).
애초에 유일하지 않은 부모를 가리켰으니 **실질적 무결성 보장도 못 하던 제약**이다.

**반드시 보고한다.** 161건 중 160건 이전, 1건 제외 — 무엇을 왜 뺐는지 명시.
조용히 빼면 그 자체가 사고다.

---

## 4. `--routines` 는 프로시저와 함수를 **둘 다** 담는다 — 검증은 **따로** 세라

`information_schema.ROUTINES` 에 프로시저와 함수가 섞여 있다.
합계만 세면 **함수가 통째로 빠져도 숫자가 맞아 보인다.**
`ROUTINE_TYPE` 으로 갈라서 센다.

## 5. `--events` 를 빠뜨리면 스케줄이 조용히 사라진다

이벤트는 눈에 안 띈다. 옮긴 직후엔 아무 증상이 없다가
**"배치가 안 돈다"** 로 며칠 뒤 발견된다. 덤프 플래그에 반드시 넣고,
대상에서 `@@event_scheduler` 가 **켜져 있는지도** 확인한다(꺼져 있으면 안 돈다).

## 6. DEFINER 계정이 대상에 없으면 실행 시점에 터진다

덤프는 `DEFINER='root'@'localhost'` 를 **그대로** 담는다.
객체는 만들어지지만 `SQL SECURITY DEFINER` 인 뷰·프로시저는 **호출할 때** 권한 오류를 낸다.
→ GATE 3 에서 DEFINER 목록을 뽑아, 대상에 그 계정을 만들거나 치환한다.

## 7. 덤프가 중간에 끊겨도 파일은 남는다

크기만 보고 성공으로 치지 않는다. 정상 종료된 덤프는 **끝줄에 `Dump completed`** 가 있다.

```bash
tail -2 dump.sql | grep -q 'Dump completed' || echo "❌ 덤프 불완전"
```

## 8. `information_schema.TABLE_ROWS` 는 **추정치**다

InnoDB 는 통계 기반 추정을 돌려준다. 수천 행이 틀릴 수 있다.
검증은 **전 테이블 `count(*)` 실행**으로만 한다.

## 9. `--single-transaction` 은 InnoDB 전용

MyISAM 이 섞여 있으면 그 테이블은 **일관성이 보장되지 않는다.**
엔진 분포를 먼저 확인하고, 섞여 있으면 `--lock-tables` 를 고려한다.

```sql
SELECT ENGINE, COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA='DBNAME' GROUP BY ENGINE;
```

## 10. `sql_mode` 가 다르면 데이터가 아니라 **쿼리**가 깨진다

`ONLY_FULL_GROUP_BY` · `STRICT_TRANS_TABLES` · `NO_ZERO_DATE` 가
원본엔 없고 대상엔 있으면, 이전은 성공해도 **앱 쿼리가 런타임에 거부**된다.
GATE 1 에서 양쪽 `sql_mode` 를 반드시 대조한다.

## 11. 암호를 명령줄에 붙이지 마라

`mysql -uroot -p'비밀'` 은 **서버의 프로세스 목록에 그대로 뜬다.**
`MYSQL_PWD` 환경변수나 옵션 파일(권한 600)을 쓴다.
문서·로그·커밋에는 **값이 아니라 보관 위치**만 적는다.

## 12. 타임존

`@@time_zone` 이 다르면 `TIMESTAMP` 컬럼의 표시값이 달라진다
(`DATETIME` 은 영향 없음). 양쪽을 대조하고, 다르면 앱 동작을 확인한다.


---

## 13. 정지되지 않은 원본에서 뜬 덤프는 검증이 불가능하다

`--single-transaction` 이 보장하는 것은 **InnoDB 행 데이터의 일관된 읽기**뿐이다.
다음은 같은 스냅샷으로 고정되지 **않는다**:

- 덤프 도중의 `ALTER` / `CREATE` / `DROP` / `RENAME` / `TRUNCATE`
- 뷰·루틴·트리거·이벤트의 변경
- 사용자·권한·DEFINER 변경
- 비트랜잭션(MyISAM 등) 테이블 데이터
- **GATE 3 인벤토리와 GATE 4 덤프 사이에 생긴 모든 변경**

따라서 검증에서 차이가 나와도 **이전 실패인지 정상 운영 변경인지 판별할 수 없다.**
컷오버 덤프는 **쓰기·DDL 을 멈춘 구간 안에서** 뜬다.

## 14. `CHECKSUM TABLE` 이 잡고 `count(*)` 가 못 잡는 것

행수가 같아도 아래는 전부 통과한다 — **행수는 내용의 증거가 아니다.**

- 한 행이 지워지고 다른 행이 추가됨 (PK 는 같은데 값이 다름)
- 문자열 끝 공백·`NULL` ↔ 빈 문자열
- 시간대 변환으로 `TIMESTAMP` 가 어긋남
- charset 변환으로 문자가 대체됨 (emoji·CJK)
- BLOB / JSON / BIT / 부동소수점 값 변질

## 15. 운영 중인 공유 인스턴스를 첫 복원 시험장으로 쓰지 마라

복원은 **오류·경고를 처음 보는 자리**다. 같은 버전·같은 `lcs` 의 **임시 인스턴스**에
먼저 복원해 전부 해소한 뒤 대상을 건드린다.
공유 인스턴스에서는 복원 부하가 **기존 운영 DB 의 성능**에도 영향을 준다.

## 16. 파이프라인 종료코드가 오류를 삼킨다

```bash
cat dump.sql | mysql ... | tee restore.log     # ❌ tee 만 성공해도 전체 성공으로 보인다
```

리다이렉트를 쓰거나 `PIPESTATUS` 를 검사한다. `--force` 는 쓰지 않는다.

## 17. `docker exec -i` 가 스크립트를 삼킨다

`ssh host 'bash -s' <<EOF ... EOF` 로 스크립트를 stdin 에 먹이는 중에 `docker exec -i` 를
부르면, **`-i` 가 남은 스크립트를 통째로 읽어 가서 그 뒤 줄이 조용히 실행되지 않는다.**
SQL 을 `-e` 로 넘길 때는 `-i` 를 붙이지 않고 `< /dev/null` 을 둔다. **실제로 겪었다.**
