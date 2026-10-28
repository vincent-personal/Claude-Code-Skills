#!/usr/bin/env python3
"""워크스페이스 세션 수집 — kai-session-net 의 스캔 전용 도구 (읽기만 한다).

~/.claude/projects 전체를 훑어, 작업 폴더(cwd)가 주어진 워크스페이스 안인
Claude Code 세션들의 이름·폴더·최종 기록 시각을 모아 출력한다.

실측 근거 (2026-10-24 직접 확인):
  - 세션 기록: ~/.claude/projects/{cwd 를 - 로 치환}/{uuid}.jsonl
  - 매 레코드에 "cwd":"/실/제/경/로" 필드가 있다 → 폴더명 인코딩 역산 불필요
  - 세션 이름: {"type":"custom-title","customTitle":...} (사용자 /rename),
    없으면 {"type":"agent-name","agentName":...}
  - ListAgents 의 [ref] 는 디스크 어디에도 없다 → ref 대응은 스킬(LLM)이
    브로드캐스트 ACK 로 확정한다. 이 스크립트는 후보만 내놓는다.

사용:
  session-net.py --workspace /path/to/ws [--days 7] [--json]
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

ROOT = os.path.expanduser('~/.claude/projects')
CWD_RE = re.compile(r'"cwd"\s*:\s*"([^"]*)"')
TS_RE = re.compile(r'"timestamp"\s*:\s*"([^"]+)"')


def first_meta(path):
    """세션 파일 앞쪽에서 cwd 와 시작 시각(첫 timestamp)을 함께 읽는다.
    시작 시각은 ListAgents 의 'started X ago' 와 대조해 동명 ref 를 소거하는 재료다."""
    cwd, start = None, None
    try:
        with open(path, encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i > 50 or (cwd and start):
                    break
                if not cwd:
                    m = CWD_RE.search(line)
                    if m:
                        cwd = m.group(1)
                if not start:
                    m = TS_RE.search(line)
                    if m:
                        start = m.group(1)
    except OSError:
        pass
    return cwd, start


def session_name(path):
    """세션 이름 — custom-title(사용자가 붙인 이름) 우선, agent-name 보조.
    이름 레코드 줄만 골라 파싱해 큰 파일에서도 비용을 낮춘다 (peer-session.py 와 동일)."""
    name = None
    try:
        with open(path, encoding='utf-8') as f:
            for line in f:
                if '"custom-title"' not in line and '"agent-name"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get('type') == 'custom-title' and rec.get('customTitle'):
                    name = rec['customTitle']  # 뒤의 /rename 이 앞의 것을 덮는다
                elif rec.get('type') == 'agent-name' and rec.get('agentName') and not name:
                    name = rec['agentName']
    except OSError:
        pass
    return name


def iter_sessions(days):
    """머신 전체(~/.claude/projects)의 최근 days 일 세션을 (이름 제외하고) 돈다."""
    cutoff = time.time() - days * 86400
    if not os.path.isdir(ROOT):
        return
    for d in os.listdir(ROOT):
        pdir = os.path.join(ROOT, d)
        if not os.path.isdir(pdir):
            continue
        for fn in os.listdir(pdir):
            if not fn.endswith('.jsonl'):
                continue
            path = os.path.join(pdir, fn)
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            if mtime < cutoff:
                continue
            cwd, start = first_meta(path)
            if not cwd:
                continue
            yield path, fn[:-6], cwd, start, mtime


def scan(workspace, days):
    """최근 days 일 안에 기록된 세션 중 cwd 가 workspace(또는 그 아래)인 것."""
    ws = os.path.realpath(workspace)
    rows = []
    for path, sid, cwd, start, mtime in iter_sessions(days):
        rcwd = os.path.realpath(cwd)
        if rcwd != ws and not rcwd.startswith(ws + os.sep):
            continue
        rows.append({
            'name': session_name(path),
            'cwd': cwd,
            'id': sid,
            'start': start,
            'mtime': mtime,
        })
    # 같은 이름은 최신 기록 하나만 남기되(재시작·과거 세션 파일 정리),
    # 동명 개수를 함께 보고한다 — 같은 워크스페이스 안 동명은 이름 주소 체계의 한계이므로
    # 조용히 버리지 말고 사용자에게 이름 구분을 권해야 한다.
    best = {}
    dup = {}
    for r in rows:
        key = r['name'] or f"(이름없음:{r['id'][:8]})"
        dup[key] = dup.get(key, 0) + 1
        if key not in best or r['mtime'] > best[key]['mtime']:
            best[key] = r
    out = sorted(best.values(), key=lambda r: -r['mtime'])
    for r in out:
        key = r['name'] or f"(이름없음:{r['id'][:8]})"
        r['dup'] = dup[key]  # 1 이면 유일, 2+ 면 같은 이름 기록이 여럿(최신만 표시)
    return out


def scan_names(names, days):
    """머신 전체에서 주어진 이름들의 세션을 cwd 불문 수집 — 동명 ref 소거법의 재료.
    같은 (이름, cwd) 는 최신 하나만 남긴다 (cwd 별로는 모두 남긴다 — 소거가 목적이므로)."""
    want = set(names)
    best = {}
    for path, sid, cwd, start, mtime in iter_sessions(days):
        nm = session_name(path)
        if nm not in want:
            continue
        key = (nm, os.path.realpath(cwd))
        if key not in best or mtime > best[key]['mtime']:
            best[key] = {'name': nm, 'cwd': cwd, 'id': sid, 'start': start, 'mtime': mtime}
    return sorted(best.values(), key=lambda r: (r['name'], -r['mtime']))


def main():
    ap = argparse.ArgumentParser(description='워크스페이스 안 Claude Code 세션 후보 수집 (읽기 전용)')
    ap.add_argument('--workspace', default=os.getcwd(), help='워크스페이스 루트 (기본: 현재 폴더)')
    ap.add_argument('--days', type=int, default=7, help='최근 N일 기록만 (기본 7)')
    ap.add_argument('--names', help='쉼표로 구분한 세션 이름들 — 머신 전체에서 그 이름의 세션을 cwd 불문 나열(동명 ref 소거용)')
    ap.add_argument('--json', action='store_true', help='JSON 으로 출력')
    args = ap.parse_args()

    if args.names:
        rows = scan_names([n.strip() for n in args.names.split(',') if n.strip()], args.days)
        if args.json:
            print(json.dumps(rows, ensure_ascii=False, indent=1))
            return 0
        print(f"# 머신 전체 동명 세션 (최근 {args.days}일) — ListAgents 'started' 와 시작 시각을 대조해 소거하라")
        for r in rows:
            st = (r['start'] or '?')[:16]
            print(f"  {r['name']:<16} 시작 {st}  {r['cwd']}")
        return 0

    rows = scan(args.workspace, args.days)
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return 0

    print(f"# 워크스페이스: {os.path.realpath(args.workspace)}  (최근 {args.days}일)")
    if not rows:
        print('  (세션 기록 없음)')
        return 0
    for r in rows:
        ts = datetime.fromtimestamp(r['mtime']).strftime('%m-%d %H:%M')
        nm = r['name'] or '(이름없음)'
        st = (r['start'] or '?')[:16]
        mark = f"  ⚠동명기록 {r['dup']}개(최신만 표시)" if r.get('dup', 1) > 1 else ''
        print(f"  {ts}  {nm:<20} 시작 {st}  {r['id'][:12]}  {r['cwd']}{mark}")
    print(f"# 합계 {len(rows)}개 — 이름 없는 세션은 SendMessage 주소가 없어 명부에서 빠진다")
    print("# ⚠동명 표시가 있으면 이름 구분(예: 검증-콘솔/검증-API)을 권한다 — 이름이 곧 주소다")
    return 0


if __name__ == '__main__':
    sys.exit(main())
