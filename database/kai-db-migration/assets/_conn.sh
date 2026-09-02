#!/bin/bash
# 공통 접속 계층.
#
# 🔴 암호는 **argv 에도 env 에도 올리지 않는다.** stdin 으로만 넘긴다.
#    - `mysql -p비밀`        → 프로세스 목록에 뜬다 (널리 알려진 함정)
#    - `docker exec -e PW=비밀` → **똑같이 프로세스 목록에 뜬다** ← 실제로 겪었다.
#      `-e` 는 안전해 보이나 값이 docker CLI 의 argv 에 그대로 들어간다
#    그래서 컨테이너 안 셸이 stdin 에서 한 줄 읽어 export 하는 방식을 쓴다.
#
# 사용:
#   export MY_USER=root MYSQL_PWD='...'          # 암호는 절대 echo 하지 않는다
#   export MY_HOST=52.230.39.64 MY_PORT=3306
#   export MY_DOCKER=mysql                       # mysql 클라이언트를 담은 컨테이너 (선택)
#   . _conn.sh ; myq "select 1"

: "${MY_USER:?MY_USER 필요}"
: "${MYSQL_PWD:?MYSQL_PWD 필요 — 값을 출력하지 말 것}"
MY_HOST="${MY_HOST:-127.0.0.1}"
MY_PORT="${MY_PORT:-3306}"
MY_SUDO="${MY_SUDO:-sudo}"

# $1 = SQL. 결과는 탭 구분·헤더 없음(-N -B) — diff 로 대조하기 좋다
myq() {
  if [ -n "${MY_DOCKER:-}" ]; then
    printf '%s\n' "$MYSQL_PWD" | $MY_SUDO docker exec -i "$MY_DOCKER" \
      sh -c 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -h"$1" -P"$2" -u"$3" -N -B --default-character-set=utf8mb4 -e "$4" </dev/null' \
      _ "$MY_HOST" "$MY_PORT" "$MY_USER" "$1"
  else
    MYSQL_PWD="$MYSQL_PWD" mysql -h"$MY_HOST" -P"$MY_PORT" -u"$MY_USER" \
      -N -B --default-character-set=utf8mb4 -e "$1" < /dev/null
  fi
}

# mysqldump / mysql 복원처럼 stdout·stdin 을 쓰는 명령용.
# $@ = mysqldump 인자. 암호는 여기서도 stdin 으로만 간다.
mydump() {
  printf '%s\n' "$MYSQL_PWD" | $MY_SUDO docker exec -i "${MY_DOCKER:?MY_DOCKER 필요}" \
    sh -c 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysqldump "$@"' _ \
    -h"$MY_HOST" -P"$MY_PORT" -u"$MY_USER" "$@"
}
