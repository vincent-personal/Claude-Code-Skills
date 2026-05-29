# task-manager 리팩토링 자문안 — 파일-per-task 아키텍처

> 브랜치: `refactor/task-per-file`
> 목적: **충돌 방지(only)**. 기존 기획·실행 능력과 규칙은 **단 하나도 제거하지 않는다.**
> 핵심 변경: 단일 `check-list.md` 공유 read/modify/write → **task 1개 = 파일 1개** + 디렉터리 상태 모델.

---

## 1. 동기 (왜 바꾸는가)

현행 구조의 단일 `docs/check-list.md`는 모든 세션이 읽고/수정/재작성하는 **공유 변경 지점**이라
다중 세션·다중 에이전트 환경에서 세 가지 문제가 있다:

1. **번호 선점 충돌** — `read max → +1 → append`가 원자적이지 않아 동시 add 시 `#N` 중복.
2. **동시 쓰기 꼬임/유실** — 특히 신규 생성(전체 Write) 동시 실행 시 clobber.
3. **컨텍스트 낭비** — 작업 1건 처리에도 list.md 전체를 읽어야 함. 완료·무관 항목까지 매번 로드.

→ 경합의 **원인(공유 파일)** 을 제거한다. 검증된 패턴(Maildir / git loose object / todo-per-file).

---

## 2. 새 저장 모델

### 2-1. 디렉터리 = 상태 (source of truth)

```
docs/tasks/
  todo/      <id>--<slug>.md      미시작
  doing/     <id>--<slug>.md      선점·작업중   (구 [~])
  done/      <id>--<slug>.md      완료          (구 [x], done/ 자체가 아카이브)
  blocked/   <id>--<slug>.md      확인필요·막힘  (구 [!])
```

- **상태 전이 = `mv`(원자적 rename)**. 구 `[ ]→[~]→[x]/[!]` 마커 전환을 대체.
- `done/`가 곧 아카이브이므로 구 "10개 누적 자동 아카이브" 복잡도가 사라진다.

### 2-2. ID = 시각기반 정렬가능 고유키 (조율 불필요)

```
<id> = YYYYMMDD-HHMMSS-<4hex랜덤>      예: 20260529-143000-a3f
파일명 = <id>--<slug>.md               예: 20260529-143000-a3f--로그인-폼-구현.md
```

- **파일명 정렬 = 생성순서 = 실행순서(FIFO).** → `ls todo/ | sort | head -1` = 가장 먼저 만든 것.
- 순차 `#N`을 버린다(=조율 제거). 사람이 부를 번호는 task-list가 즉석에서 1,2,3… 매김.
- 커밋 traceability용 참조: id 또는 그 짧은 접미(`a3f`) 사용 → `feat(ops a3f): 제목`.

### 2-3. 충돌 없는 생성 (staging + 원자적 mv) ★advisor 교정 A

> ❌ `noclobber`로 빈 파일을 먼저 만드는 방식 폐기 — 빈 파일↔내용 채움 사이 윈도우에
> 다른 run이 집어 malformed claim 발생. 앞서 도출한 staging 통찰을 그대로 적용한다.

```bash
mkdir -p docs/tasks/{todo,doing,done,blocked} docs/tasks/.staging
slug=$(printf '%s' "$TITLE" | tr '/[:space:]' '-' | tr -cd '[:alnum:]가-힣._-' | cut -c1-60)
slug=${slug#.}                                   # 선행 '.' 제거
ID="$(date +%Y%m%d-%H%M%S-%N)-$(printf '%04x' $RANDOM)"   # %N=나노초로 동일초 FIFO 보존
STAGE="docs/tasks/.staging/${ID}--${slug}.md"
# 1) .staging/ 에 완성된 내용을 전부 기록 (같은 파일시스템 — /tmp 금지: mv가 비원자적)
#    ...frontmatter + 본문 전체 작성...
# 2) 완성본만 원자적 투입
mv "$STAGE" "docs/tasks/todo/${ID}--${slug}.md"
```

→ id가 유일성을, rename이 "완성된 것만 보인다"는 원자성을 보장.
→ `.staging/` 고아 temp는 task-run 시 일정시간 경과분 청소.

### 2-4. task 파일 포맷 (frontmatter + 본문)

```markdown
---
id: 20260529-143000-a3f
title: 로그인 폼 구현
# status 필드 없음 — 디렉터리 위치가 유일 권위(★advisor Q1: drift 원천 제거)
created: 2026-05-29 14:30
tier: 3                 # 1|2|3
advisor: done           # done|skipped|pending  (구 [advisor:done] 태그)
screen_work: true       # 구 [화면 작업 필수]
impact_files:           # 구 "영향 파일" (의무 필드)
  - verida-ops/src/app/.../login.component.ts
predecessors: []        # 구 "선행 조건" (#N 의존 → id 의존)
claimed_at:             # 선점 시각 (좀비 복구용)
claimed_by:             # 선점 세션 식별
---

## 작업 설명
{What / How / Note}

## 구현 방안 (advisor)   # Tier 3일 때 advisor 단계별 방안 그대로
...

## 완료 기록            # 완료 시 append
✅ 완료: {요약} (YYYY-MM-DD HH:MM)
```

---

## 3. 선점·실행 (task-run) — 원자적 claim

```bash
# 0) 선행조건 만족 집합 = done/ 에 있는 모든 id
done_ids=$(ls docs/tasks/done/ 2>/dev/null | sed 's/--.*//')
# 1) FIFO 순회 (가장 먼저 만든 것 우선)
for f in $(ls docs/tasks/todo/ 2>/dev/null | sort); do
  # 2) ★advisor C: predecessors 전원이 done/에 있어야 후보 (선행조건 규칙 보존)
  preds=$(awk '/^---$/{n++;next} n==1 && /^predecessors:/{...}' "docs/tasks/todo/$f")
  # preds 중 done_ids에 없는 게 하나라도 있으면 → continue
  # 3) 원자적 선점: mv 성공 = 내가 획득, 실패 = 남이 가져감 → 다음 후보
  if mv "docs/tasks/todo/$f" "docs/tasks/doing/$f" 2>/dev/null; then
     # 4) 선점 후 영향파일 충돌 재검사 (doing/의 다른 파일 frontmatter만 awk 추출)
     #    충돌이면: mv 되돌리기(todo/로) 후 다음 후보. id 작은 쪽이 양보(tie-break, 수렴 보장)
     break
  fi
done
```

- 구 `[~]`마커 + Edit재시도 + "선점 후 Read 검증" 기계장치를 `mv` 원자성이 대체.
- **좀비 복구**: `doing/`의 `claimed_at`이 30분 경과 → `mv doing→todo` 후 일반 후보 편입 (규칙 유지).
- **충돌 검사**: 현행 `locked_files = ⋃ 각 doing 항목 impact_files`, 후보 ∩ locked = ∅ 필요 (규칙 유지).
  단 in-flight(doing/)만 읽으므로 컨텍스트 경량.
- **★advisor Q8: 컨텍스트 절감은 frontmatter를 `awk`로 뽑을 때만 실현.** Read 툴로 통째 읽으면 절감이 샌다.
  frontmatter 추출 표준 명령: `awk '/^---$/{c++; next} c==1' <file>`.

---

## 4. 컨텍스트 절감 (사용자 핵심 요구)

| 스킬 | 현행 | 신규 |
|---|---|---|
| add | list.md 전체 read | 신규 파일 생성 + (병합 판단 시) todo/ frontmatter만 스캔 |
| run | list.md 전체 read | doing/ frontmatter(충돌) + **선점한 1개 파일 본문**만 read |
| list | list.md 전체 read | 각 파일 frontmatter만 read |

→ 완료·무관 항목 본문을 다시는 읽지 않는다.

---

## 5. ⚠️ 기존 규칙 보존 매핑 (단 하나도 누락 금지)

### task-add
| 기존 규칙 | 신규 처리 |
|---|---|
| 역할 경계(추가 전용, 구현 금지) | 유지 |
| Step 0 SESSION_ROOT 탐지(Primary working dir 우선, git root 아님) | 유지 — **4스킬 통일**(현행 run/clear/list는 git root라 불일치 → SESSION_ROOT로 통일 제안) |
| Step 0-A 신규 생성 | `mkdir -p docs/tasks/{...}` 로 대체 |
| (신규) ★advisor D 마이그레이션 | Step 0에서 `docs/check-list.md` 존재 & `docs/tasks/` 부재 시 → 항목 파싱해 task 파일로 1회 변환 후 `check-list.md.migrated`로 rename. 심볼릭 링크 전역 배포라 미적용 시 기존 프로젝트 작업이 일제히 안 보임 |
| Step 0-C 컨벤션 파일 확인(CLAUDE.md/앱/FRONTEND-CONVENTIONS) | 유지(동일) |
| Step 1-A 미시작 항목 병합 | 유지 — **★advisor B: 병합은 Edit으로만**. Edit 실패(=파일이 claim되어 doing/으로 이동) 시 **신규 task 파일 생성으로 fallback** (split-brain 방지, Write 재생성 금지) |
| Step 1-B 작업 분할 | 유지 — 분할 시 task 파일 N개 생성 |
| Step 2 영향 파일 식별(의무, Glob/Grep) | 유지 — frontmatter `impact_files` |
| Step 2-A Tier 판단 + advisor + `[advisor:done]` | 유지 — frontmatter `tier`/`advisor` |
| Step 3 작업 설명(What/How/Note, 세부항목 수 기준) | 유지 — 본문 |
| Step 3-A 화면 작업 감지 | 유지 — frontmatter `screen_work` + 본문 지침 |
| Step 1-Z 자동 아카이브 | **제거 → task-run으로 일원화** (사용자 지시) |
| user.lock 확인 | 유지 |
| 영향 파일 없이 추가 금지 | 유지 |

### task-run
| 기존 규칙 | 신규 처리 |
|---|---|
| 자율 실행 원칙(확인 금지, 1 item=1 commit) | 유지 |
| 워크트리 절대 금지 | 유지(Red Line) |
| Step 0 루트 / Step 0-A user.lock | 유지 |
| Step 0-B 좀비 [~] 30분 복구 | 유지 — doing/ claimed_at 기준 |
| Step 2 영향파일 충돌 검사 | 유지 — doing/ frontmatter 기반 |
| Step 3 선점 + 타임스탬프 + 실패복구 + 선점후검증 | **mv 원자 claim으로 대체**(의도 보존) |
| Step 4 Tier / 4-A advisor(`[advisor:done]` 생략) | 유지 |
| Step 4-B 화면작업(Playwright/Context7/design-review) | 유지 |
| Step 4-C 컨벤션 파일 확인 | 유지 |
| Step 5 코드작성 + 워크트리 검증 + 영향파일 등록 | 유지 |
| Step 6 빌드(build lock) | 유지 — build.lock은 공유 자원이라 존속(touch→mkdir 개선 검토) |
| Step 7 Git 커밋 + appVersion bump + add 영향파일만 | 유지 — `#N`→id 참조만 변경 |
| Step 1-Z 자동 아카이브 | 유지(여기로 일원화) — done/ 정리(N개 초과 시 archive/ 이동) |
| Step 8 완료처리 [~]→[x] | `mv doing→done` + frontmatter + 완료기록 |
| 모든 Red Lines | 유지(문구만 디렉터리 모델로 갱신) |

### task-clear
| 기존 | 신규 |
|---|---|
| clear lock / done 이동 / 보호항목 삭제금지 | done/ → archive/(또는 done-archive.md) 이동. per-file이라 충돌 위험 자체가 감소 |

### task-list
| 기존 | 신규 |
|---|---|
| 읽기전용 / 4상태 분류 / 요약 | 유지 — 디렉터리 스캔 + frontmatter만, FIFO 순 정렬 출력 |

---

## 6. advisor 검증 결과 (확정)

판정: **진행 가능(GO)**. 단 아래 구멍 4개를 §2~§5에 반영 완료(★ 표시).

| 구멍 | 내용 | 반영 위치 |
|---|---|---|
| **A** | noclobber 빈파일 → staging+원자mv로 교체 (malformed claim 방지) | §2-3 |
| **B** | 병합은 Edit-only + 실패 시 신규파일 fallback (split-brain 방지) | §5 task-add |
| **C** | claim 루프에 predecessors∈done/ 검사 (선행조건 보존) | §3 |
| **D** | Step 0 lazy auto-migration (전역 배포 시 기존 작업 실종 방지) | §5 task-add |

확정된 판별:
1. **상태 모델**: 디렉터리가 **유일 권위**. frontmatter `status` 필드 제거. `claimed_at/by`는 소유자만 써서 무경쟁.
2. **claim 순서**: claim 후 충돌 재검사 + id 작은 쪽 양보 tie-break → 수렴 보장. 채택.
3. **#N 폐기**: id 짧은 접미(`a3f`) 참조로 commit traceability 유지. 채택.
4. **인덱스 파일**: 영구 인덱스 없음. task-list 즉석 렌더(공유 쓰기 0). 채택.
5. **루트 통일**: SESSION_ROOT로 통일. **Step 0 탐지 블록을 4스킬에 글자 그대로 동일 복붙**.
6. **좀비/고아**: doing/ 30분 좀비 복구 유지. 구멍 A 수정으로 todo/ 고아 원인 소멸. `.staging/` 고아만 task-run 시 청소.
7. **마이그레이션**: 구멍 D로 해결(lazy, 1회).
8. **누락**: predecessors(C) 외 — 컨텍스트 절감은 frontmatter를 `awk`로 추출할 때만 실현(§3에 표준 명령 명시).

비-블로커(스코프 외): build.lock touch→mkdir 개선은 별도 PR. slug 살균은 §2-3에 반영.

## 7. 2차 검증 결과 (실증 + advisor 재검토)

실제 실행으로 확인(❗ markdown 리뷰가 아닌 empirical):
- **mv claim 경쟁**: 동시 2회 시도 → 정확히 하나만 성공 ✅
- **`%N`**: 현재 머신은 GNU date라 동작하나, **stock macOS BSD date는 미지원** → 감지 후 `000000000` fallback + `$$`(pid)로 유일성 보장하도록 §2-3 수정.
- **predecessors awk**: 멀티라인/인라인`[]` 모두 정상 추출 ✅ (task-run Step 2에 실동작 명령 반영)
- **마이그레이션 가드**: `todo/ 비어있음` → `check-list.md 존재 AND .migrated 부재` 로 강화 (신규 add 선행 시 기존작업 누락 방지)

**Soft guarantee (인지 — 회귀 아님, 구 설계도 동일):**
- **충돌검사 TOCTOU**: 서로 다른 충돌 작업을 두 러너가 거의 동시에 claim하면 둘 다 통과해 동시 실행될 수 있다. **동일 작업 claim(핵심 관심사)은 mv 원자성으로 견고**. 완전 차단은 lockfile 필요 — 차기 스코프.
- **장시간 작업 좀비 오인**: 30분 초과 작업 중 doing/ mtime 미변경 시 회수 가능(구 설계 동일 30분 고정).
