"""Re-validate every challenge against the current default sim: each one hands-off (should usually fail) and with the
scripted player from tools/challenge_check.ts (should be winnable within the budget).

Usage: .venv/Scripts/python tools/challenge_suite.py [--jobs 6] [--out scratch/challenges/suite.jsonl]
"""
import argparse
import concurrent.futures as cf
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def challenge_ids():
    src = (ROOT / 'src' / 'challenges.ts').read_text(encoding='utf-8')
    return re.findall(r"^\s{4}id: '([^']+)'", src, flags=re.M)


def run(cid, policy, params=None):
    npx = shutil.which('npx') or 'npx'  # npx.cmd on Windows; no shell needed
    cmd = [npx, 'tsx', 'tools/challenge_check.ts', '--challenge', cid] + (['--policy'] if policy else []) + (['--params', params] if params else [])
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=3600)
    for line in out.stdout.splitlines()[::-1]:
        if line.startswith('{'):
            return json.loads(line)
    return {'challenge': cid, 'policy': policy, 'state': 'error', 'reason': (out.stderr or out.stdout)[-300:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=6)
    ap.add_argument('--out', default='scratch/challenges/suite.jsonl')
    ap.add_argument('--params', default=None, help='JSON sim params on top of each scenario, e.g. {"calendarScale":2}')
    a = ap.parse_args()
    ids = challenge_ids()
    jobs = [(c, p) for c in ids for p in (False, True)]
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        results = list(ex.map(lambda j: run(*j, a.params), jobs))
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(json.dumps(r) for r in results), encoding='utf-8')
    print(f"{'challenge':<12} {'hands-off':<34} {'scripted player':<44}")
    for c in ids:
        h = next(r for r in results if r['challenge'] == c and not r.get('policy'))
        s = next(r for r in results if r['challenge'] == c and r.get('policy'))
        fmt = lambda r: f"{r['state']} y{r.get('year', '?')}" + (f" tools {r.get('toolsUsed')}" if r.get('policy') else '')
        print(f"{c:<12} {fmt(h):<34} {fmt(s):<44}")
        print(f"{'':<12} {h.get('reason', '')[:60]:<34} {s.get('reason', '')[:60]}")
    good = all(
        next(r for r in results if r['challenge'] == c and r.get('policy'))['state'] == 'won'
        and next(r for r in results if r['challenge'] == c and not r.get('policy'))['state'] == 'lost'
        for c in ids
    )
    print('\nall challenges fail hands-off and are winnable by the scripted player' if good else '\nsome challenges need retuning')


if __name__ == '__main__':
    main()
