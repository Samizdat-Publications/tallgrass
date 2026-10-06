# v7b screen (2026-10-06), 32 seeds x 200 valley years, frozen a6b02bb

v7b = v7a params plus raptorDogPref (eagle and hawk preference for prairie dogs). Stats from year 5.

```
zen/c9c3f5a/review/stability/v7diag/full                     n=32  pd presence>=90%: 27  mean presence 0.968  mean pd 22  bison alive 32
c9c3f5a/review/stability/v7diag/noraptor                     n=32  pd presence>=90%: 31  mean presence 0.992  mean pd 37  bison alive 32
ozen/a6b02bb/review/stability/v7b/pref50                     n=32  pd presence>=90%: 29  mean presence 0.969  mean pd 28  bison alive 32
ozen/a6b02bb/review/stability/v7b/pref25                     n=32  pd presence>=90%: 31  mean presence 0.990  mean pd 36  bison alive 32
```

pref25 (dynamics.py): bison, wolf, raven, pronghorn, jackrabbit, cougar, coyote, hawk, mule deer 32/32, prairie dogs 31/32 (present 100%), wolf CV 0.26 (lag 2 yr, corr 0.74). Eagles are winter visitors: present in 99% of years at every setting (mean 1.9), hawks mean 5.9, unchanged.

Chosen: raptorDogPref 0.25. 20-seed x 1,000-generation acceptance started 18:38 from frozen a6b02bb, out scratch/frozen/a6b02bb/review/stability/v7b-a6b02bb, log scratch/accept_v7b.log (ETA about 3 h).
