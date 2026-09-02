#!/bin/bash
# 공통 접속 계층. 암호는 명령줄이 아니라 MYSQL_PWD 환경변수로만 전달한다
# (명령줄 -p 는 서버의 프로세스 목록에 그대로 노출된다).
#
# 사용:
#   export MY_USER=root MYSQL_PWD='...'          # 암호는 절대 echo 하지 않는다
#   export MY_HOST=52.230.39.64 MY_PORT=3306     # 원격일 때
#   export MY_DOCKER=mysql                       # mysql 클라이언트를 담은 컨테이너 (선택)
#   . _conn.sh ; myq "select 1"
#
# MY_DOCKER 를 주면 그 컨테이너 안의 mysql 클라이언트를 쓴다.
# (호스트에 클라이언트가 없어도 되고, 도커 네트워크 내부 이름으로 붙을 수 있다)

: "${MY_USER:?MY_USER 필요}"
: "${MYSQL_PWD:?MYSQL_PWD 필요 — 값을 출력하지 말 것}"
MY_HOST="${MY_HOST:-127.0.0.1}"
MY_PORT="${MY_PORT:-3306}"
MY_SUDO="${MY_SUDO:-sudo}"

myq() {
  # $1 = SQL. 결과는 탭 구분·헤더 없음(-N -B) — diff 로 대조하기 좋다
  if [ -n "${MY_DOCKER:-}" ]; then
    # ⚠️ -i 를 붙이지 않는다. SQL 은 -e 로 넘기므로 stdin 이 필요 없고,
    #    -i 를 붙이면 docker exec 가 stdin 을 삼켜 **호출한 스크립트의 나머지 줄이 사라진다**
    #    (ssh 'bash -s' <<EOF 처럼 스크립트를 stdin 으로 먹이는 경우 실제로 겪었다).
    $MY_SUDO docker exec -e MYSQL_PWD="$MYSQL_PWD" "$MY_DOCKER" \
      mysql -h"$MY_HOST" -P"$MY_PORT" -u"$MY_USER" -N -B --default-character-set=utf8mb4 -e "$1" < /dev/null
  else
    MYSQL_PWD="$MYSQL_PWD" mysql -h"$MY_HOST" -P"$MY_PORT" -u"$MY_USER" \
      -N -B --default-character-set=utf8mb4 -e "$1" < /dev/null
  fi
}
