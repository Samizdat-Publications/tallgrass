# Checkpoint v10b: acceptance and shocks (2026-10-09, adopted 13:00)

Candidate: v10 + pronghorn maxLitter 2, wolf sprint cost 0.3 under evolution2, raven.initial 250, coyote.initial 30. Frozen commit 1f3f658 (same sim as 97eef97 plus the bit-identical speedup).

Acceptance (20 worlds x 1,200 valley years): every gate passes (tools/adoption.py eligible). Bison persist 20/20; wolves, pronghorn and ravens >= 90% present in 20/20; prairie dogs 19/20, every other species 20/20. Wolf CV 0.26, wolf to bison lag corr 0.54, pronghorn starvation 39%. Means: bison 549, wolves 33 (1:17), pronghorn 368, mule deer 70 (v10: 19), coyotes 79, ravens 515. Bison follow the climate index at 0.53.

Shocks (12 worlds x 500 years): bison, wolves and pronghorn persist 12/12 and recover in 100% after cull70 (bison median 12 years), drought (22) and wolfwipe (43).
