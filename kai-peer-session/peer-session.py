#!/usr/bin/env python3
"""
동료 에이전트 세션 조회 — 같은 폴더 · 같은 세션 이름으로 상대 에이전트의 대화를 찾아 읽는다.

두 에이전트(Claude Code · kai-gen)가 한 작업을 나눠 할 때, 서로 무엇을 했는지 옮겨 적는 일이
번거롭다. 사용자가 두 세션에 **같은 이름**을 붙여 쓰는 습관을 그대로 열쇠로 삼는다.

저장 위치 (직접 확인한 실제 구조):
  Claude Code  ~/.claude/projects/{cwd 를 -로 치환}/{uuid}.jsonl
               이름 = 레코드 {"type":"custom-title","customTitle":...} (없으면 agent-name)
  kai-gen      ~/.kai-gen/sessions/{ts}-{id}/{meta.json,transcript.jsonl}
               이름 = meta.json 의 name, 폴더 = meta.json 의 cwd

사용:
  peer-session.py --to kaigen                  # 내 세션 이름과 같은 kai-gen 세션을 읽는다
  peer-session.py --to claude --name QR앱      # 이름을 직접 지정
  peer-session.py --list                       # 양쪽의 이름 붙은 세션 일람 (진단용)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

HOME = os.path.expanduser('~')
CLAUDE_ROOT = os.path.join(HOME, '.claude', 'projects')
KAIGEN_SESSIONS = os.path.join(HOME, '.kai-gen', 'sessions')


# region 세션 수집 — 두 저장소를 같은 모양(dict)으로 정규화
def _encode_cwd(cwd: str) -> str:
    """Claude 는 cwd 의 구분자를 '-' 로 바꿔 폴더 이름으로 쓴다. /a/b → -a-b"""
    return cwd.replace('/', '-')


def collect_claude(cwd: str):
    """이 폴더의 Claude Code 세션 목록. 이름은 파일 안 레코드에만 있어 전부 훑어야 한다."""
    d = os.path.join(CLAUDE_ROOT, _encode_cwd(cwd))
    if not os.path.isdir(d):
        return []
    out = []
    for fn in os.listdir(d):
        if not fn.endswith('.jsonl'):
            continue
        path = os.path.join(d, fn)
        name = None
        try:
            with open(path, encoding='utf-8') as f:
                for line in f:
                    # 이름 레코드는 파일 앞쪽에 몰려 있으나 위치가 보장되진 않는다.
                    # 이름 관련 줄만 골라 파싱해 큰 파일에서도 비용을 낮춘다.
                    if '"custom-title"' not in line and '"agent-name"' not in line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get('type') == 'custom-title' and rec.get('customTitle'):
                        name = rec['customTitle']          # 사용자가 붙인 이름이 우선
                    elif rec.get('type') == 'agent-name' and rec.get('agentName') and not name:
                        name = rec['agentName']
        except OSError:
            continue
        out.append({
            'agent': 'claude',
            'id': fn[:-6],
            'name': name,
            'cwd': cwd,
            'path': path,
            'mtime': os.path.getmtime(path),
        })
    return out


def collect_kaigen(cwd: str):
    """kai-gen 세션 목록. meta.json 에 name·cwd 가 그대로 있어 훨씬 싸다."""
    if not os.path.isdir(KAIGEN_SESSIONS):
        return []
    out = []
    for sid in os.listdir(KAIGEN_SESSIONS):
        sdir = os.path.join(KAIGEN_SESSIONS, sid)
        meta_path = os.path.join(sdir, 'meta.json')
        tr = os.path.join(sdir, 'transcript.jsonl')
        if not os.path.isfile(meta_path):
            continue
        try:
            with open(meta_path, encoding='utf-8') as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        if os.path.realpath(meta.get('cwd', '')) != os.path.realpath(cwd):
            continue
        out.append({
            'agent': 'kaigen',
            'id': meta.get('id', sid),
            'name': meta.get('name'),
            'cwd': meta.get('cwd'),
            'path': tr,
            'mtime': os.path.getmtime(tr) if os.path.isfile(tr) else 0,
            'role': meta.get('roleId'),
            'model': meta.get('modelRef'),
        })
    return out


def collect(agent: str, cwd: str):
    return collect_claude(cwd) if agent == 'claude' else collect_kaigen(cwd)
# endregion


# region 대화 렌더링 — 두 형식을 한 모양으로 펴서 읽기 좋게
def _clip(s, n):
    s = ' '.join(str(s).split())
    return s if len(s) <= n else s[:n] + ' …'


def _render_blocks(content, tool_chars):
    """content 가 문자열이든 블록 배열이든 (역할표시용 텍스트) 조각들로 편다."""
    if isinstance(content, str):
        return [('text', content)]
    parts = []
    for b in content or []:
        if not isinstance(b, dict):
            continue
        t = b.get('type')
        if t == 'text':
            parts.append(('text', b.get('text', '')))
        elif t == 'thinking':
            continue                                   # 상대의 사고과정은 옮기지 않는다
        elif t in ('tool_use', 'tool_call'):
            args = b.get('input') or b.get('args') or {}
            parts.append(('tool', f"{b.get('name','?')}({_clip(json.dumps(args, ensure_ascii=False), tool_chars)})"))
        elif t == 'tool_result':
            body = b.get('content') or b.get('text') or ''
            if isinstance(body, list):
                body = ' '.join(x.get('text', '') for x in body if isinstance(x, dict))
            parts.append(('result', _clip(body, tool_chars)))
    return parts


def read_claude(path):
    msgs = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get('type') not in ('user', 'assistant'):
                continue
            m = rec.get('message') or {}
            msgs.append((rec.get('type'), m.get('content'), rec.get('timestamp')))
    return msgs


def read_kaigen(path):
    msgs = []
    if not os.path.isfile(path):
        return msgs
    with open(path, encoding='utf-8') as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            role = rec.get('role')
            if role not in ('user', 'assistant', 'tool'):
                continue
            msgs.append((role, rec.get('content'), rec.get('at')))
    return msgs


def digest(session, max_msgs, tool_chars, text_chars):
    """최근 대화를 사람이 읽는 형태로. 최신 쪽이 중요하므로 뒤에서 잘라 온다."""
    msgs = read_claude(session['path']) if session['agent'] == 'claude' else read_kaigen(session['path'])
    tail = msgs[-max_msgs:] if max_msgs > 0 else msgs
    lines = []
    for role, content, ts in tail:
        when = ''
        if ts:
            try:
                when = datetime.fromisoformat(str(ts).replace('Z', '+00:00')) \
                    .astimezone().strftime('%m-%d %H:%M')
            except ValueError:
                when = ''
        for kind, body in _render_blocks(content, tool_chars):
            if not str(body).strip():
                continue
            if kind == 'text':
                mark = '사용자' if role == 'user' else '에이전트'
                stamp = f"[{when}] " if when else ''      # 시각이 없는 레코드도 있다(빈 대괄호 방지)
                lines.append(f"{stamp}{mark}: {_clip(body, text_chars)}")
            elif kind == 'tool':
                lines.append(f"        · 도구 {body}")
            else:
                lines.append(f"        → {body}")
    return lines, len(msgs)
# endregion


def main():
    ap = argparse.ArgumentParser(description='같은 이름·같은 폴더의 동료 에이전트 세션을 읽는다')
    ap.add_argument('--to', choices=['claude', 'kaigen'], help='읽어올 상대 에이전트')
    ap.add_argument('--name', help='세션 이름 (생략 시 내 세션 이름을 자동 추정)')
    ap.add_argument('--cwd', default=os.getcwd(), help='작업 폴더 (기본: 현재 폴더)')
    ap.add_argument('--max-msgs', type=int, default=120, help='최근 메시지 수 (0=전체)')
    ap.add_argument('--tool-chars', type=int, default=200, help='도구 호출/결과 1건 최대 길이')
    ap.add_argument('--text-chars', type=int, default=1200, help='대화 1건 최대 길이')
    ap.add_argument('--list', action='store_true', help='양쪽 세션 일람만 출력')
    args = ap.parse_args()

    cwd = os.path.realpath(args.cwd)

    if args.list or not args.to:
        for agent in ('claude', 'kaigen'):
            rows = sorted(collect(agent, cwd), key=lambda r: -r['mtime'])
            print(f"\n=== {agent} · {cwd} ===")
            if not rows:
                print('  (없음)')
            for r in rows[:15]:
                ts = datetime.fromtimestamp(r['mtime']).strftime('%m-%d %H:%M')
                print(f"  {ts}  {str(r['name'] or '(이름없음)'):<20} {r['id'][:28]}")
        return 0

    #region 이름 결정 — 지정이 없으면 '내 쪽에서 가장 최근에 쓰인 세션'이 곧 나다
    # 호출하는 순간 내 대화가 방금 기록되므로, 내 에이전트 안에서는 이 판정이 어긋나기 어렵다.
    me = 'kaigen' if args.to == 'claude' else 'claude'
    name = args.name
    if not name:
        mine = sorted([s for s in collect(me, cwd) if s['name']], key=lambda r: -r['mtime'])
        if not mine:
            print(f"[!] 내 쪽({me})에 이름 붙은 세션이 없어 이름을 추정할 수 없다. --name 으로 지정할 것.",
                  file=sys.stderr)
            return 2
        name = mine[0]['name']
        print(f"# 내 세션 이름 추정: {name}  ({me}, {mine[0]['id'][:12]})")
    #endregion

    peers = [s for s in collect(args.to, cwd) if (s['name'] or '') == name]
    if not peers:
        print(f"[!] '{name}' 이름의 {args.to} 세션을 {cwd} 에서 찾지 못했다.", file=sys.stderr)
        print(f"    --list 로 양쪽 이름을 확인할 것.", file=sys.stderr)
        return 3
    peers.sort(key=lambda r: -r['mtime'])
    s = peers[0]

    print(f"# 동료 세션: {args.to} / 이름 '{name}' / id {s['id']}")
    print(f"# 폴더: {s['cwd']}")
    if s.get('role') or s.get('model'):
        print(f"# 역할: {s.get('role')} / 모델: {s.get('model')}")
    print(f"# 최종 기록: {datetime.fromtimestamp(s['mtime']).strftime('%Y-%m-%d %H:%M:%S')}")
    if len(peers) > 1:
        print(f"# ⚠ 같은 이름 세션 {len(peers)}개 — 가장 최근 것을 읽는다")
    lines, total = digest(s, args.max_msgs, args.tool_chars, args.text_chars)
    print(f"# 전체 {total}개 메시지 중 최근 {args.max_msgs if args.max_msgs>0 else total}개")
    print('-' * 78)
    print('\n'.join(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main())
