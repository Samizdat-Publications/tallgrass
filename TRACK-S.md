# Track S status (simulation and ecology)

Only Track S writes this file (V2-PLAN.md section 4.3). Track R reads it with `git show origin/v2-sim:TRACK-S.md`.

## Cloud smoke test
Not run yet (V2-PLAN.md section 4.5). Record: node -v, nproc, npm ci, typecheck, the 2,400-tick headless run, pip install, npm test.

## Done
None yet.

## Decisions
Track S judgment calls, one line each (decision | why | rejected alternative). Track R copies them into DECISIONS.md when it merges.

## Requests for Track R
For example: "run the 1,000-generation acceptance for v2-sim@abc1234 on the local CPU".

## Next
1. S0 Foundations (V2-PLAN.md section 7).
