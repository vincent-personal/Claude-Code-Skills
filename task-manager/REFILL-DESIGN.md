# kai-task-run: 배치 배리어 → 슬롯 리필(A) 설계

## 목표
배치 5개 스폰 → 전부 끝날 때까지 대기(배리어) → 다음 배치.
이 구조를 **슬롯 리필**로: 워커 하나 끝나면 즉시 빈 슬롯을 다음 todo로 채움.
안전 정책: **(a) 동적 append 잔여위험 수용** — 선언 파일은 충돌검사가 막고, 드문 동적
append 겹침은 git rebase가 backstop(같은 줄 충돌→커밋 실패→blocked, 조용한 유실 아님).
※ per-repo-1 격리는 철회 — same-repo 작업을 직렬화해 오늘보다 느려지는 과잉교정(build.lock은
  빌드만 묶고 impl·advisor게이트·git은 배치에서 병렬인데 그걸 죽임). (a) 선택과도 모순.

## 불변식 (보존 필수)
1. 동일 task 이중 claim 불가 — 원자적 `mv` 선점 (claim L78). 유지.
2. 선언된 impact_files 동시 편집 방지 — doing-스캔 충돌검사 (claim L26-32,64-69). 유지+활성화.
3. repo당 빌드 직렬 — build.lock (worker W-2). 유지.
4. predecessor 순서 (claim L49-55). 유지.
5. ready:true만 착수 (claim L42-47). 유지.

## 전역 상한
N = 5 (동시 워커 수). 실질 동시성 = min(N, 서로 다른 repo 수).

## 변경 ① task-claim-and-plan.sh — 슬롯 수 인식 (repo 판정 없음)
인자: `SESSION_ROOT N` (기존과 동일 시그니처, N=전역 상한 = 기존 MAX_BATCH).
- doing 스캔 시 (기존 locked_files 수집과 함께): doing_count 세기.
- 가용슬롯 available = N - doing_count. ≤0 → NONE(더 못 띄움).
- FIFO 순회: ready·pred·impact + **파일충돌검사(기존 L64-69)** 그대로 → 선점.
  - 배치 상한을 MAX_BATCH → **available** 로 (L74).
- 반환: CLAIMED(새 선점분만) + CODEX:n.
- **하위호환**: doing 비면 doing_count=0 → available=N → 기존과 **완전 동일**.
  리필에선 도는 워커 수만큼 available 감소 → 그만큼만 새로 선점 → 동시성 N 유지.
- ★ repo 판정 삭제(과잉). 동일파일 방지는 기존 doing-스캔 충돌검사가 담당(doing 상시 차서 활성화).
  동적 append 겹침 = (a) 수용, git rebase backstop.

## 변경 ② task-poll-and-attach.sh — 리필 반환
목표: 배치 전부 대기 → **하나라도 완료(슬롯 빔) 시 반환**.
인자: `SESSION_ROOT [f...]` (추적 대상 = 현재 INFLIGHT).
- 진입 시 pending(추적 f 중 doing에 아직 있는 것) 개수 기록.
- 루프: pending이 진입 시보다 줄면(=하나라도 done/blocked/timeout) 반환. 전부 종료도 반환. MAX 타임아웃.
- timeout 처리(기존 L39-47: doing 잔존 → committed면 done, 아니면 blocked) — 단, INFLIGHT 중 MAX 넘긴 것만.
- codex 종결(finalize 헬퍼) — 이번에 완료된 것에 대해.
- 반환: DONE/BLOCKED/TIMEOUT (이번 회전 종료분).

## 변경 ③ run SKILL — 리필 루프 재구성
```
Step 0-A (준비: 잠금·좀비복구·마이그레이션·finalize sweep·ready sweep) — 루프 진입 시 1회
INFLIGHT=()
loop:
  Step 2: out=claim(N)
    - NONE + INFLIGHT 비었으면 → 종료
    - NONE + INFLIGHT 있으면 → Step 5 (재선점 없이 완료 대기)
    - CLAIMED:<f> → 스폰대상, INFLIGHT += f, claimed_at/by 기록
  Step 4: 이번 CLAIMED만 스폰 (run_in_background)
  Step 5: poll(INFLIGHT) → 하나라도 완료 시 반환. 완료 f를 INFLIGHT에서 제거.
  Step 6: 완료분 보고.
  → loop
```
종료: todo claimable 없음(claim NONE) AND INFLIGHT 비면.

## 엣지케이스
- claim NONE + INFLIGHT 있음(전부 busy_repo/충돌, 또는 빈 큐지만 도는 중):
  poll로 완료 대기 → repo/슬롯 풀림 → 다음 claim 성공. **충돌·기아 해소**.
- 좀비/워커 죽음: poll timeout(MAX)이 잡아 blocked/done 처리. INFLIGHT에서 제거.
- Step 0-A(무거운 좀비복구·sweep) 빈도: 진입 1회. 리필 루프는 Step 2~6만.
  좀비는 poll timeout이 커버. (검토점: 장시간 루프면 주기적 Step 0-A 필요?)

## 단계적 구현 (회귀 방지)
- Phase 1: claim 슬롯/repo 인식화. 하위호환 → 단독 배포·실증 가능. 진행 세션 안전(더 보수적).
- Phase 2: poll 리필 + run 루프 재구성. **짝 변경**(poll↔run SKILL 동시). 진행 run 있으면 불일치 위험 → 진행 run 종료 후 배포.

## 운영 리스크
스크립트는 심링크 원본이라 즉시 반영. 지금 다른 run 세션이 doing에서 돎(payments task).
- Phase 1: 안전(하위호환).
- Phase 2: 진행 run의 옛 SKILL 지침 + 새 poll = 불일치. → 진행 run 없을 때 반영 권장.

## Phase 2 구현 상태 (2026-07-07)
- ✅ poll 리필판 작성·실증: `scratchpad/task-poll-refill.sh` (A/B/C 시나리오 통과).
  - "하나라도 완료 시 즉시 반환" + 진행중은 `RUNNING:` 보고. MAX 도달 시에만 좀비 정리.
- ⏸ 원본 반영 대기: 지금 다른 run 세션이 doing 2·todo 14 돌리는 중 → **세션 종료 후** 반영(전하 지시).

## Phase 2 반영 절차 (도는 run 없을 때 = doing·todo 비고 활동 정지 확인 후)
1. **poll 교체**: `tools/task-poll-and-attach.sh` 내용을 `scratchpad/task-poll-refill.sh` 로 재작성
   (파일명 유지 → run SKILL 호출 경로 불변). finalize 헬퍼 호출은 동일.
2. **run SKILL Step 2~6 → 리필 루프 재구성** (아래).
3. claim 슬롯 인식은 Phase 1로 이미 반영됨.
4. 반영 후 실증: 소규모 todo 여러 건으로 리필 동작(긴 워커가 짧은 걸 안 막음) 확인.

## run SKILL 리필 루프 지침 (Step 2~6 대체안)
```
Step 0-A (준비: 잠금·좀비복구·마이그레이션·finalize sweep·ready sweep) — 진입 시 1회
INFLIGHT=()   # 도는 워커 task 파일명 (메인 세션 대화 상태로 유지)

── 리필 루프 ──
loop:
  # (2) 빈 슬롯 채우기: claim(N) — available=N-doing_count 만큼 새 선점
  out = bash task-claim-and-plan.sh SESSION_ROOT N   (timeout 10분)
    - CLAIMED:<f> 각각 → claimed_at/by 기록(Edit), INFLIGHT += f, 이번 스폰 대상
    - NONE 이고 INFLIGHT 비었으면 → "✅ 전부 완료" 종료
    - NONE 이고 INFLIGHT 있으면 → 이번엔 스폰 없이 (5)로
  # (4) 이번 CLAIMED 만 스폰
  각 새 CLAIMED f → Agent(kai-task-worker, run_in_background) 동시 호출
  # (5) 하나라도 완료될 때까지 대기
  pout = bash task-poll-and-attach.sh SESSION_ROOT "${INFLIGHT[@]}"   (timeout 61분)
    - DONE:<f> / BLOCKED:<f> → INFLIGHT 에서 제거, 보고 누적
    - RUNNING:<f> → INFLIGHT 유지
  # (6) 완료분 보고 (+ done>30 시 주기적 아카이브)
  → loop
종료: claim NONE ∧ INFLIGHT 비면.
```
- 첫 회전: INFLIGHT 비어 doing 빔 → claim N개 스폰 → poll 하나 완료 → 리필. 이후 슬롯 지속 충전.
- claim NONE + INFLIGHT 있음(전부 파일충돌 or 빈 큐지만 도는 중) → poll로 완료 대기 → 슬롯/충돌 풀리면 다음 claim 성공 (충돌·기아 해소).
- Step 0-A(무거운 좀비복구·sweep)는 진입 1회. 좀비는 poll MAX(61분)가 커버. 루프 안엔 user.lock 가벼운 체크만(선택).

## 메인 컨텍스트 비용 (수용)
완료마다 Step 2~6 회전 → 배치 대비 회전수 증가. 각 회전은 작음(claim/스폰/poll/보고).
효율↔컨텍스트 트레이드오프 — 전하가 A 선택으로 수용.
