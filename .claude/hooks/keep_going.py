#!/usr/bin/env python3
"""
Overnight keep-going Stop hook.

Blocks the main agent from ending its turn until the local time in
run_until.txt (format: YYYY-MM-DD HH:MM), unless a file named STOP exists
in the project root. Every decision is logged to keep_going.log so the
owner can see in the morning how often it fired.

Owner controls:
  - Create a file named STOP in the project folder to let the agent stop.
  - Edit run_until.txt to change the deadline, or put a per-session deadline in
    run_until.local.txt (gitignored, read first when it exists).
  - Interrupting the session in the app always works regardless of this hook.
"""
import datetime
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LOG = HERE / "keep_going.log"
STATE = HERE / ".keep_going_state.json"


def log(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
    except Exception:
        pass


def load_recent_blocks(now):
    try:
        stamps = json.loads(STATE.read_text(encoding="utf-8"))
        return [s for s in stamps if now.timestamp() - s < 600]
    except Exception:
        return []


def save_blocks(stamps):
    try:
        STATE.write_text(json.dumps(stamps), encoding="utf-8")
    except Exception:
        pass


def main():
    try:
        json.load(sys.stdin)
    except Exception:
        pass

    if (ROOT / "STOP").exists():
        log("STOP file present: allowing stop")
        return 0

    try:
        # A per-session deadline (gitignored, set from the owner's kickoff prompt) wins over the shared file,
        # so a local session and a cloud session can each have their own without git conflicts.
        local = HERE / "run_until.local.txt"
        src = local if local.exists() else HERE / "run_until.txt"
        txt = src.read_text(encoding="utf-8").strip()
        deadline = datetime.datetime.strptime(txt, "%Y-%m-%d %H:%M")
    except Exception:
        log("run_until.txt missing or unreadable: allowing stop")
        return 0

    now = datetime.datetime.now()
    if now >= deadline:
        log("deadline reached: allowing stop")
        return 0

    recent = load_recent_blocks(now)
    recent.append(now.timestamp())
    save_blocks(recent)

    reason = (
        f"Do not stop. It is {now:%H:%M} and the unattended overnight run continues "
        f"until {deadline:%Y-%m-%d %H:%M}. The owner is asleep. "
        "Re-read NEXT-SESSION.md and _PLAN.md, pick the highest-value next item, and keep working. "
        "If the plan is finished, start a new improve cycle: capture fresh stills and charts, "
        "run a fresh blind-critic round (or a Gemini video round if one is due), triage, fix the top 3 issues, "
        "re-run the stability suite, commit, and update MORNING.md."
    )
    if len(recent) >= 4:
        reason += (
            " You have tried to stop several times in the last 10 minutes without much work in between. "
            "Take on a larger backlog item now (a new species or system, a visual upgrade, a gamification feature, "
            "or a deeper balancing pass) instead of small touch-ups."
        )

    log(f"blocked stop ({len(recent)} in last 10 min)")
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
