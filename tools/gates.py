"""The one versioned judge for balancing screens (work package S1).

    python tools/gates.py judge  <screen_dir> [--control <screen_dir>] [--burn 0.15] [--json out.json] [--strict]
    python tools/gates.py shocks <shock_dir> [--control <shock_dir>] [--json out.json]
    python tools/gates.py record <screen_dir> --name <label> --stage filter|full|shocks [--params '{...}'] [--control <dir>]

A screen dir is a batch output folder (src/headless/batch.ts --out): meta.json plus <scenario>/seed_<n>.csv and summary.json.

judge   the baseline gates exactly as tools/adoption.py applies them (its screen_stats() is imported, so the numbers
        are the same), plus the wolf CV floor from V2-PLAN.md and a "run complete" gate (an early stop, a time cut or a
        missing seed fails it). Then the population means per species (scratch/rb/means.py), extinctions by seed and
        year, the standing grass level and the causes of adult bison deaths (scratch/rb/ceiling.py). With --control,
        every mean and share is shown against the control with its percent difference and flagged outside tolerance.
shocks  the cull70, drought and wolfwipe verdicts the way scratch/rb/shocks.py and drought.py judge them: valleys
        (seeds 1 to 12) that lose their bison or wolves by year 250 and by the end, the drought lows and the bison
        budget by year around the drought (drought2.py), and the batch's own recovery share (info).
record  appends one row to review/stability/sensitivity.jsonl (date, commit, label, stage, params that differ from the
        defaults, seeds, years, every gate value, means, predation and starvation shares, verdict).

Every line is PASS or FAIL with its number, then a VERDICT line; the exit code is 1 on FAIL (judge and shocks).
Years here are valley years of 2,400 ticks (BASE_YEAR_TICKS), as in the scratch/rb scripts; the CSV "year" column
counts calendar years (1,200 ticks at calendarScale 2) and is only used where adoption.py uses it.
"""
import argparse
import csv
import datetime
import glob
import json
import math
import os
import statistics as st
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adoption  # noqa: E402  (tools/adoption.py: screen_stats, the five adoption numbers)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------------------------------------------
# thresholds and tolerances (each with the source of its value)
# ---------------------------------------------------------------------------------------------------------------
YEAR_TICKS = 2400              # valley year: BASE_YEAR_TICKS in src/sim/types.ts; YT=2400 in every scratch/rb script
BURN = 0.15                    # gate burn-in fraction: RESULT.md files, "gates by tools/adoption.py --burn 0.15"
MEANS_FROM = 0.3               # means, grass and death causes from 30% of the run: means.py and ceiling.py use years 120 to 400 of 400
PERSIST_SHARE = (30, 32)       # bison persist in ceil(n * 30/32) seeds: adoption.py (V2-PLAN.md S3 "30 of 32")
PRESENT_SHARE = (29, 32)       # wolves, pronghorn, ravens present in ceil(n * 29/32) seeds: adoption.py (V2-PLAN.md S3 "29 of 32")
PRESENCE_FRAC = 0.9            # "present" = pop > 0 in >= 90% of samples: adoption.py
STARVE_MAX = 0.5               # pronghorn starvation share of deaths after burn-in: adoption.py
CORR_MIN = 0.4                 # best corr(bison[t], wolf[t+L]), L = 1..3 years: adoption.py
WOLF_CV_MIN = 0.2              # wolf annual CV: V2-PLAN.md section 3, "A living ecosystem" row (adoption.py reports it, never gates it)
MEAN_TOL = 0.10                # control comparison: a mean more than 10% off the control is flagged (new, lead to tune)
SHARE_TOL = 0.05               # control comparison: a death share or grass level more than 5 points off is flagged (new, lead to tune)
MEAN_SPECIES = ['bison', 'wolf', 'pronghorn', 'muledeer', 'coyote', 'raven', 'prairiedog', 'cougar']  # means.py columns
EXTINCT_SPECIES = ['bison', 'wolf', 'pronghorn', 'raven', 'muledeer']  # means.py extinction check
SHOCK_SEEDS_MAX = 12           # shocks are judged on seeds 1 to 12, like for like with v10b: shocks.py
SHOCK_JUDGE_YEAR = 250         # valleys lost by year 250 decide the shock verdict: shocks.py (v10b ran 250 years)
SHOCK_MAX_LOST = {             # most valleys of seeds 1 to 12 allowed to lose bison or wolves by year 250
    'cull70': 0,               # review/stability/rebalance-2026-10-26/RESULT.md, v14: "cull70 none lost"
    'drought': 1,              # owner ruling 2026-10-28 (DECISIONS.md): 1 in 12 drought valleys is acceptable
    'wolfwipe': 1,             # same RESULT.md, v14: "wolfwipe seed 2 ends without wolves" (year 233, accepted with v14)
}
SHOCK_RECOVERY_MIN = 80.0      # bison recovered share after a shock: V2-PLAN.md S3 step 3; INFO only, recent rounds never applied it
SHOCK_RECOVERY_GATE = False    # set True to make SHOCK_RECOVERY_MIN a gate (lead to decide)
DROUGHT_FRAC = 0.4             # the drought starts at 40% of the run: src/headless/scenarios.ts
DROUGHT_TICKS = 4800           # and lasts 4,800 ticks: scenarios.ts; drought.py t1 = t0 + 4800
DROUGHT_PRE_YEARS = 10         # pre-drought level = mean of the 10 years before: drought.py
DROUGHT_POST_YEARS = 15        # the low is taken up to 15 years after the drought ends: drought.py
BUDGET_YEARS = (-2, 10)        # bison budget table, years from the drought onset: drought2.py
SENSITIVITY = os.path.join(ROOT, 'review', 'stability', 'sensitivity.jsonl')


# ---------------------------------------------------------------------------------------------------------------
# reading a screen
# ---------------------------------------------------------------------------------------------------------------
def load_meta(d):
    p = os.path.join(d, 'meta.json')
    if not os.path.exists(p):
        return {}
    with open(p, encoding='utf8') as f:
        return json.load(f)


def load_summary(d, scenario):
    p = os.path.join(d, scenario, 'summary.json')
    if not os.path.exists(p):
        return {}
    with open(p, encoding='utf8') as f:
        return json.load(f)


def seed_of(path):
    return int(os.path.basename(path)[5:-4])


def seed_files(d, scenario):
    return sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')), key=seed_of)


def read_rows(path):
    """Rows as dicts of floats (blank cells dropped), the way drought.py reads them."""
    with open(path, encoding='utf8') as f:
        return [{k: float(v) for k, v in r.items() if v not in ('', None)} for r in csv.DictReader(f)]


def expected_seeds(meta, files):
    a = meta.get('args', {})
    if a.get('seedList'):
        return list(a['seedList'])
    if a.get('seeds'):
        base = a.get('seedBase', 1)
        return list(range(base, base + a['seeds']))
    return [seed_of(f) for f in files]


def planned_ticks(meta, rows_by_seed):
    t = meta.get('args', {}).get('ticks')
    if t and not meta.get('args', {}).get('generations'):
        return float(t)
    ends = [rows[-1]['tick'] for rows in rows_by_seed.values() if rows]
    return max(ends) if ends else 0.0


def completeness(meta, d, scenario, rows_by_seed, want_seeds):
    """The 'run complete' gate: every expected seed ran its full length, no early stop, no errors."""
    T = planned_ticks(meta, rows_by_seed)
    problems = []
    missing = [s for s in want_seeds if s not in rows_by_seed]
    if missing:
        problems.append(f"no CSV for seed(s) {', '.join(map(str, missing))}")
    summ = load_summary(d, scenario)
    short = [s['seed'] for s in summ.get('seeds', []) if s.get('endReason') in ('aborted', 'error')]
    if short:
        problems.append(f"stopped early: seed(s) {', '.join(map(str, short))}")
    ae = meta.get('abortExtinct') or {}
    trig = ae.get('triggered')
    if trig:
        problems.append(f"EARLY STOP by --abort-extinct: {trig['species']} at zero in {len(trig['seeds'])} {trig['scenario']} seed(s) "
                        f"(limit {trig['maxSeeds']}): " + ', '.join(f"seed {x['seed']} from year {x['zeroTick'] / YEAR_TICKS:.1f}" for x in trig['seeds']))
    elif meta.get('stopReason'):
        problems.append(f"batch stopped: {meta['stopReason']}")
    tasks = meta.get('tasks', {})
    if tasks.get('errors'):
        problems.append(f"{tasks['errors']} seed(s) failed with an error")
    done = len(want_seeds) - len(missing) - len(set(short))
    return {'ok': not problems, 'done': done, 'n': len(want_seeds), 'ticks': T, 'problems': problems, 'early_stop': trig}


# ---------------------------------------------------------------------------------------------------------------
# judge: baseline gates, means, ceiling, extinctions
# ---------------------------------------------------------------------------------------------------------------
def baseline_numbers(d, burn, means_from=MEANS_FROM, scenario='baseline'):
    meta = load_meta(d)
    files = seed_files(d, scenario)
    if not files:
        raise SystemExit(f"gates.py: no {scenario}/seed_*.csv under {d}")
    rows_by_seed = {seed_of(f): read_rows(f) for f in files}
    want = expected_seeds(meta, files)
    n = len(want)
    comp = completeness(meta, d, scenario, rows_by_seed, want)
    T = comp['ticks']
    a = adoption.screen_stats(d, scenario, burn)  # the five adoption numbers, computed by adoption.py itself

    need_p = math.ceil(n * PERSIST_SHARE[0] / PERSIST_SHARE[1])
    need_pr = math.ceil(n * PRESENT_SHARE[0] / PRESENT_SHARE[1])
    gates = [
        gate('bison persist', a['persist'], a['persist'] >= need_p, f"{a['persist']}/{n} (need {need_p} of {n})",
             f"final bison > 0; ceil(n x {PERSIST_SHARE[0]}/{PERSIST_SHARE[1]}), adoption.py"),
        gate('presence >= 90%', a['present'], a['present'] >= need_pr, f"{a['present']}/{n} (need {need_pr} of {n})",
             f"wolves, pronghorn, ravens each > 0 in >= {PRESENCE_FRAC:.0%} of samples; ceil(n x {PRESENT_SHARE[0]}/{PRESENT_SHARE[1]}), adoption.py"),
        gate('pronghorn starvation', a['starve'], ok_le(a['starve'], STARVE_MAX), f"{pct(a['starve'])} (max {STARVE_MAX:.0%})",
             'median share of pronghorn deaths that are starvation after burn-in, adoption.py'),
        gate('wolf CV', a['cvw'], ok_ge(a['cvw'], WOLF_CV_MIN), f"{num(a['cvw'])} (min {WOLF_CV_MIN:.2f})",
             'median CV of annual mean wolves after burn-in (adoption.py); floor from V2-PLAN.md section 3'),
        gate('wolf-bison corr', a['corr'], ok_ge(a['corr'], CORR_MIN), f"{num(a['corr'])} (min {CORR_MIN:.2f})",
             'median best corr(bison[t], wolf[t+L]) for L = 1..3 years, adoption.py'),
        gate('run complete', comp['done'], comp['ok'], f"{comp['done']}/{n} seeds ran {T:,.0f} ticks ({T / YEAR_TICKS:.0f} years)"
             + ('' if comp['ok'] else ': ' + '; '.join(comp['problems'])), 'meta.json and summary.json of the batch'),
    ]

    # means (means.py), ceiling (ceiling.py), extinctions
    lo = means_from * T
    means = {sp: [] for sp in MEAN_SPECIES}
    peaks = []
    grass = []
    c = {k: 0.0 for k in ('starved_bison', 'starved_juv_bison', 'killed_bison', 'old_bison', 'cougar_kills_bison', 'births_bison', 'thirst_bison')}
    extinct = []
    for s, rows in sorted(rows_by_seed.items()):
        r = [x for x in rows if lo <= x['tick'] <= T]
        if r:
            for sp in MEAN_SPECIES:
                col = f'pop_{sp}'
                if col in r[0]:
                    means[sp].append(st.mean(x.get(col, 0.0) for x in r))
            peaks.append(max(x.get('pop_bison', 0.0) for x in r))
            for x in r:
                grass.append(x.get('grass_mean', 0.0))
                for k in c:
                    c[k] += x.get(k, 0.0)
        for sp in EXTINCT_SPECIES:
            col = f'pop_{sp}'
            if rows and col in rows[-1] and rows[-1][col] <= 0:
                i = len(rows) - 1
                while i > 0 and rows[i - 1].get(col, 0.0) <= 0:
                    i -= 1
                extinct.append({'seed': s, 'species': sp, 'year': round(rows[i]['tick'] / YEAR_TICKS, 1)})
    dead = c['starved_bison'] + c['killed_bison'] + c['old_bison']
    share = (lambda v: v / dead) if dead else (lambda v: float('nan'))
    deaths = {
        'deaths': dead,
        'starved': share(c['starved_bison']),
        'killed': share(c['killed_bison']),
        'wolf': share(c['killed_bison'] - c['cougar_kills_bison']),
        'cougar': share(c['cougar_kills_bison']),
        'old': share(c['old_bison']),
        'births_per_death': c['births_bison'] / dead if dead else float('nan'),
    }
    return {
        'dir': os.path.abspath(d), 'scenario': scenario, 'meta': meta, 'n': n, 'seeds': want, 'ticks': T, 'years': T / YEAR_TICKS,
        'burn': burn, 'means_from': means_from, 'adoption': a, 'gates': gates, 'complete': comp,
        'means': {sp: (st.mean(v) if v else float('nan')) for sp, v in means.items()},
        'bison_peak_median': st.median(peaks) if peaks else float('nan'), 'bison_peak_max': max(peaks) if peaks else float('nan'),
        'grass': st.mean(grass) if grass else float('nan'), 'bison_deaths': deaths, 'extinct': extinct,
    }


def gate(name, value, ok, text, source):
    return {'name': name, 'value': value, 'pass': bool(ok), 'text': text, 'source': source}


def ok_le(v, hi):
    return not math.isnan(v) and v <= hi


def ok_ge(v, lo):
    return not math.isnan(v) and v >= lo


def pct(v):
    return 'n/a' if v is None or (isinstance(v, float) and math.isnan(v)) else f'{v:.0%}'


def num(v, f='.2f'):
    return 'n/a' if v is None or (isinstance(v, float) and math.isnan(v)) else format(v, f)


def compare(cur, ctl):
    """Means and shares against the control: (key, value, control, diff text, flagged)."""
    out = []
    for sp in MEAN_SPECIES:
        v, c0 = cur['means'][sp], ctl['means'][sp]
        if math.isnan(v) or math.isnan(c0):
            continue
        d = (v - c0) / c0 if c0 else (0.0 if v == 0 else float('inf'))
        # a species averaging under 1 animal in both screens is noise, not a difference
        flag = abs(d) > MEAN_TOL and max(v, c0) >= 1
        out.append({'key': f'mean {sp}', 'value': v, 'control': c0, 'diff': d, 'kind': 'rel', 'flag': flag})
    for key, v, c0 in [('grass', cur['grass'], ctl['grass']),
                       ('bison deaths: starved', cur['bison_deaths']['starved'], ctl['bison_deaths']['starved']),
                       ('bison deaths: wolves', cur['bison_deaths']['wolf'], ctl['bison_deaths']['wolf'])]:
        if math.isnan(v) or math.isnan(c0):
            continue
        out.append({'key': key, 'value': v, 'control': c0, 'diff': v - c0, 'kind': 'abs', 'flag': abs(v - c0) > SHARE_TOL})
    return out


def judge(d, control=None, burn=BURN, strict=False):
    res = baseline_numbers(d, burn)
    res['kind'] = 'judge'
    if control:
        ctl = baseline_numbers(control, burn)
        res['control'] = {'dir': ctl['dir'], 'years': ctl['years'], 'n': ctl['n'], 'compare': compare(res, ctl),
                          'gates': {g['name']: g['value'] for g in ctl['gates']}}
    failed = [g['name'] for g in res['gates'] if not g['pass']]
    flags = [c['key'] for c in res.get('control', {}).get('compare', []) if c['flag']]
    res['failed'] = failed
    res['flags'] = flags
    res['verdict'] = 'FAIL' if failed or (strict and flags) else 'PASS'
    return res


def print_judge(res):
    print(f"judge {res['dir']}  ({res['n']} seeds, {res['years']:.0f} valley years, gate burn-in {res['burn']:.2f}, means from year {res['means_from'] * res['years']:.0f})")
    for g in res['gates']:
        print(f"{'PASS' if g['pass'] else 'FAIL'}  {g['name']:22s} {g['text']}")
    m = res['means']
    print('means: ' + '  '.join(f"{sp} {num(m[sp], '.0f') if m[sp] >= 10 else num(m[sp], '.1f')}" for sp in MEAN_SPECIES)
          + f"  | bison peak median {num(res['bison_peak_median'], '.0f')} max {num(res['bison_peak_max'], '.0f')}")
    bd = res['bison_deaths']
    print(f"grass {num(res['grass'], '.3f')} | adult bison deaths (ceiling.py: starved + killed + old): wolves {pct(bd['wolf'])}, "
          f"cougars {pct(bd['cougar'])}, starved {pct(bd['starved'])}, old {pct(bd['old'])} | births/deaths {num(bd['births_per_death'])}")
    ext = res['extinct']
    if ext:
        by = {}
        for e in ext:
            by.setdefault(e['seed'], []).append(f"{e['species']} y{e['year']:.0f}")
        print('extinct at end: ' + '; '.join(f"seed {s}: {', '.join(v)}" for s, v in sorted(by.items())))
    else:
        print('extinct at end: none')
    if 'control' in res:
        c = res['control']
        print(f"against control {c['dir']} ({c['n']} seeds, {c['years']:.0f} years; flag outside {MEAN_TOL:.0%} for means, {SHARE_TOL * 100:.0f} points for shares):")
        for x in c['compare']:
            if x['kind'] == 'rel':
                txt = f"{x['value']:8.1f} vs {x['control']:8.1f}  {x['diff']:+.0%}"
            else:
                txt = f"{x['value']:8.3f} vs {x['control']:8.3f}  {x['diff'] * 100:+.1f} pts"
            print(f"  {'FLAG' if x['flag'] else 'ok  '}  {x['key']:24s} {txt}")
    tail = []
    if res['failed']:
        tail.append('failed: ' + ', '.join(res['failed']))
    if res['flags']:
        tail.append(f"{len(res['flags'])} value(s) outside tolerance against the control: " + ', '.join(res['flags']))
    print(f"VERDICT: {res['verdict']}" + (f" ({'; '.join(tail)})" if tail else ''))


# ---------------------------------------------------------------------------------------------------------------
# shocks: cull70, drought, wolfwipe
# ---------------------------------------------------------------------------------------------------------------
def shock_numbers(d):
    meta = load_meta(d)
    out = {'dir': os.path.abspath(d), 'scenarios': {}}
    for sc in ('cull70', 'drought', 'wolfwipe'):
        files = seed_files(d, sc)
        if not files:
            continue
        rows_by_seed = {seed_of(f): read_rows(f) for f in files}
        want = [s for s in expected_seeds(meta, files)]
        comp = completeness(meta, d, sc, rows_by_seed, want)
        T = comp['ticks']
        judge_tick = min(SHOCK_JUDGE_YEAR * YEAR_TICKS, T)
        lost_j, lost_end, judged = [], [], []
        for s, rows in sorted(rows_by_seed.items()):
            if not rows:
                continue
            at = [x for x in rows if x['tick'] <= judge_tick] or rows[:1]
            b, w = at[-1].get('pop_bison', 0.0), at[-1].get('pop_wolf', 0.0)
            if s <= SHOCK_SEEDS_MAX:
                judged.append(s)
                if b <= 0 or w <= 0:
                    lost_j.append({'seed': s, 'bison': b <= 0, 'wolves': w <= 0})
            be, we = rows[-1].get('pop_bison', 0.0), rows[-1].get('pop_wolf', 0.0)
            if be <= 0 or we <= 0:
                lost_end.append({'seed': s, 'bison': be <= 0, 'wolves': we <= 0})
        summ = load_summary(d, sc)
        bis = summ.get('aggregate', {}).get('species', {}).get('bison', {})
        rec = bis.get('recoveredPct')
        rec_years = bis.get('medianRecoveryTicks')
        sc_out = {'seeds': sorted(rows_by_seed), 'judged': judged, 'judge_year': judge_tick / YEAR_TICKS, 'end_year': T / YEAR_TICKS,
                  'lost': lost_j, 'lost_end': lost_end, 'recovered_pct': rec,
                  'recovery_years': (rec_years / YEAR_TICKS if rec_years is not None else None), 'complete': comp}
        if sc == 'drought':
            sample = meta.get('args', {}).get('sampleEvery') or 1
            t0 = max(sample, round(DROUGHT_FRAC * T / sample) * sample)
            sc_out['drought'] = drought_detail(rows_by_seed, t0)
            sc_out['budget'] = drought_budget(rows_by_seed, t0)
            sc_out['onset_year'] = t0 / YEAR_TICKS
        out['scenarios'][sc] = sc_out
    return out


def drought_detail(rows_by_seed, t0):
    """drought.py: per seed, bison and wolves before the drought, the lows during and after, and when each hit zero."""
    t1 = t0 + DROUGHT_TICKS
    res = []
    for s, rows in sorted(rows_by_seed.items()):
        if s > SHOCK_SEEDS_MAX or not rows:
            continue
        pre = [x for x in rows if t0 - DROUGHT_PRE_YEARS * YEAR_TICKS <= x['tick'] < t0]
        dur = [x for x in rows if t0 <= x['tick'] < t1 + DROUGHT_POST_YEARS * YEAR_TICKS]
        if not pre or not dur:
            continue
        bmin = min(dur, key=lambda x: x.get('pop_bison', 0.0))
        z = next((x['tick'] for x in rows if x['tick'] >= t0 and x.get('pop_bison', 0.0) <= 0), None)
        wz = next((x['tick'] for x in rows if x['tick'] >= t0 and x.get('pop_wolf', 0.0) <= 0), None)
        res.append({
            'seed': s, 'pre_bison': st.mean(x.get('pop_bison', 0.0) for x in pre), 'pre_wolves': st.mean(x.get('pop_wolf', 0.0) for x in pre),
            'low_bison': bmin.get('pop_bison', 0.0), 'low_bison_at': (bmin['tick'] - t0) / YEAR_TICKS,
            'low_wolves': min(x.get('pop_wolf', 0.0) for x in dur),
            'bison_zero_at': None if z is None else (z - t0) / YEAR_TICKS, 'wolves_zero_at': None if wz is None else (wz - t0) / YEAR_TICKS,
        })
    return res


BUDGET_COLS = ['births_bison', 'starved_bison', 'starved_juv_bison', 'killed_bison', 'kills', 'cougar_kills_bison', 'old_bison', 'thirst_bison', 'emig_bison', 'imm_bison']


def drought_budget(rows_by_seed, t0):
    """drought2.py: the bison budget by year from the drought onset, summed over seeds 1 to 12 (pop = mean)."""
    acc, pop = {}, {}
    for s, rows in rows_by_seed.items():
        if s > SHOCK_SEEDS_MAX:
            continue
        for x in rows:
            y = int((x['tick'] - t0) // YEAR_TICKS)
            if BUDGET_YEARS[0] <= y < BUDGET_YEARS[1]:
                a = acc.setdefault(y, {c: 0.0 for c in BUDGET_COLS})
                for c in BUDGET_COLS:
                    a[c] += x.get(c, 0.0)
                p = pop.setdefault(y, [0.0, 0.0, 0.0, 0])
                p[0] += x.get('pop_bison', 0.0)
                p[1] += x.get('pop_wolf', 0.0)
                p[2] += x.get('grass_mean', 0.0)
                p[3] += 1
    return [{'year': y, 'bison': pop[y][0] / pop[y][3], 'wolves': pop[y][1] / pop[y][3], 'grass': pop[y][2] / pop[y][3], **acc[y]} for y in sorted(acc)]


def shocks(d, control=None):
    res = shock_numbers(d)
    res['kind'] = 'shocks'
    ctl = shock_numbers(control) if control else None
    gates = []
    for sc, s in res['scenarios'].items():
        lim = SHOCK_MAX_LOST[sc]
        n_lost = len(s['lost'])
        lost_txt = ', '.join(f"{x['seed']}{'b' if x['bison'] else ''}{'w' if x['wolves'] else ''}" for x in s['lost']) or 'none'
        txt = f"{n_lost} of {len(s['judged'])} valleys lost bison or wolves by year {s['judge_year']:.0f} ({lost_txt}); max {lim}"
        ok = n_lost <= lim
        if ctl and sc in ctl['scenarios']:
            c_lost = len(ctl['scenarios'][sc]['lost'])
            txt += f"; control {c_lost}"
            ok = ok and n_lost <= c_lost
            s['control_lost'] = c_lost
        gates.append(gate(f'{sc} valleys lost', n_lost, ok, txt, 'shocks.py; limits in SHOCK_MAX_LOST'))
        if SHOCK_RECOVERY_GATE and s['recovered_pct'] is not None:
            gates.append(gate(f'{sc} bison recovered', s['recovered_pct'], s['recovered_pct'] >= SHOCK_RECOVERY_MIN,
                              f"{s['recovered_pct']:.0f}% (min {SHOCK_RECOVERY_MIN:.0f}%)", 'V2-PLAN.md S3 step 3'))
        comp = s['complete']
        gates.append(gate(f'{sc} run complete', comp['done'], comp['ok'], f"{comp['done']}/{comp['n']} seeds ran {comp['ticks']:,.0f} ticks"
                          + ('' if comp['ok'] else ': ' + '; '.join(comp['problems'])), 'meta.json and summary.json of the batch'))
    if not res['scenarios']:
        gates.append(gate('shock scenarios present', 0, False, 'no cull70, drought or wolfwipe folder', ''))
    res['gates'] = gates
    res['failed'] = [g['name'] for g in gates if not g['pass']]
    res['flags'] = []
    res['verdict'] = 'FAIL' if res['failed'] else 'PASS'
    return res


def print_shocks(res):
    print(f"shocks {res['dir']}")
    for sc, s in res['scenarios'].items():
        rec = 'n/a' if s['recovered_pct'] is None else f"{s['recovered_pct']:.0f}%"
        ry = '' if s['recovery_years'] is None else f", median {s['recovery_years']:.1f} years"
        le = ', '.join(f"{x['seed']}{'b' if x['bison'] else ''}{'w' if x['wolves'] else ''}" for x in s['lost_end']) or 'none'
        print(f"  {sc:9s} all {len(s['seeds'])} seeds at year {s['end_year']:.0f} lost: {le} | bison recovered {rec}{ry} "
              f"({'gate' if SHOCK_RECOVERY_GATE else 'info'}, V2-PLAN bar {SHOCK_RECOVERY_MIN:.0f}%)")
        if 'drought' in s:
            print(f"  drought from year {s['onset_year']:.0f} (drought.py): seed, pre bison / wolves, low bison (when), low wolves, bison zero, wolves zero")
            f2 = lambda t: '-' if t is None else f'{t:+.1f}y'
            for x in s['drought']:
                print(f"    seed {x['seed']:2d} pre {x['pre_bison']:5.0f} / {x['pre_wolves']:4.0f} | low bison {x['low_bison']:4.0f} at {f2(x['low_bison_at'])} "
                      f"wolves {x['low_wolves']:3.0f} | bison zero {f2(x['bison_zero_at'])} wolves zero {f2(x['wolves_zero_at'])}")
            print('  bison budget by year from the onset (drought2.py; sums over seeds 1 to 12, pop = mean)')
            print('    yr  bison wolves grass | ' + ' '.join(f'{c[:12]:>12s}' for c in BUDGET_COLS))
            for b in s['budget']:
                print(f"    {b['year']:+3d} {b['bison']:6.0f} {b['wolves']:6.1f} {b['grass']:5.2f} | " + ' '.join(f'{b[c]:12.0f}' for c in BUDGET_COLS))
    for g in res['gates']:
        print(f"{'PASS' if g['pass'] else 'FAIL'}  {g['name']:24s} {g['text']}")
    print(f"VERDICT: {res['verdict']}" + (f" (failed: {', '.join(res['failed'])})" if res['failed'] else ''))


# ---------------------------------------------------------------------------------------------------------------
# record: one row in review/stability/sensitivity.jsonl
# ---------------------------------------------------------------------------------------------------------------
def param_defaults(keys):
    """Default values of the given param keys, read from src/sim/params.ts through tsx. None when node is unavailable."""
    if not keys:
        return {}
    js = ("import('./src/sim/params.ts').then(async (m) => { const { PARAM_PREFIX } = await import('./src/sim/species.ts');"
          " const p = m.applyOverrides(m.defaultParams(), {}); const out = {};"
          " for (const k of JSON.parse(process.argv[1])) { const i = k.indexOf('.');"
          " out[k] = i > 0 ? (p.species[PARAM_PREFIX.indexOf(k.slice(0, i))] || {})[k.slice(i + 1)] ?? null : (p[k] ?? null); }"
          " console.log(JSON.stringify(out)); })")
    try:
        r = subprocess.run(['node', '--import', 'tsx', '-e', js, json.dumps(list(keys))], cwd=ROOT, capture_output=True, text=True, timeout=120)
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001 (record all params rather than fail)
        return None


def git_head():
    try:
        return subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:  # noqa: BLE001
        return 'unknown'


def clean(v):
    if isinstance(v, float):
        return None if math.isnan(v) or math.isinf(v) else round(v, 4)
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def record_row(res, name, stage, params):
    meta = load_meta(res['dir'])
    if params is None:
        params = meta.get('args', {}).get('params', {}) or {}
    defaults = param_defaults(params.keys())
    differ = params if defaults is None else {k: v for k, v in params.items() if defaults.get(k) != v}
    row = {
        'date': datetime.datetime.now().astimezone().isoformat(timespec='seconds'),
        'commit': meta.get('commit') or git_head(),
        'label': name,
        'stage': stage,
        'params': differ,
        'dir': os.path.relpath(res['dir'], ROOT).replace('\\', '/'),
        'gates': {g['name']: g['value'] for g in res['gates']},
        'gates_pass': {g['name']: g['pass'] for g in res['gates']},
        'verdict': res['verdict'],
        'failed': res['failed'],
    }
    if res['kind'] == 'judge':
        row.update({
            'seeds': res['seeds'], 'years': res['years'], 'means': res['means'], 'grass': res['grass'],
            'bison_peak_median': res['bison_peak_median'],
            'bison_deaths_wolf_share': res['bison_deaths']['wolf'], 'bison_deaths_predation_share': res['bison_deaths']['killed'],
            'bison_deaths_starved_share': res['bison_deaths']['starved'],
            'extinct': res['extinct'], 'flags': res['flags'],
        })
        if res['complete']['early_stop']:
            row['early_stop'] = res['complete']['early_stop']
    else:
        row.update({
            'seeds': sorted({s for sc in res['scenarios'].values() for s in sc['seeds']}),
            'years': max((sc['end_year'] for sc in res['scenarios'].values()), default=0),
            'shocks': {sc: {'lost': s['lost'], 'lost_end': s['lost_end'], 'recovered_pct': s['recovered_pct']} for sc, s in res['scenarios'].items()},
        })
    row = clean(row)
    os.makedirs(os.path.dirname(SENSITIVITY), exist_ok=True)
    with open(SENSITIVITY, 'a', encoding='utf8', newline='\n') as f:
        f.write(json.dumps(row, separators=(',', ':')) + '\n')
    return row


# ---------------------------------------------------------------------------------------------------------------
def write_json(res, path):
    if not path:
        return
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    out = {k: v for k, v in res.items() if k != 'meta'}
    with open(path, 'w', encoding='utf8') as f:
        json.dump(clean(out), f, indent=1)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    j = sub.add_parser('judge', help='baseline gates, means, ceiling and extinctions of one screen')
    j.add_argument('dir')
    j.add_argument('--control')
    j.add_argument('--burn', type=float, default=BURN)
    j.add_argument('--json')
    j.add_argument('--strict', action='store_true', help='a value outside tolerance against the control also fails')
    s = sub.add_parser('shocks', help='cull70, drought and wolfwipe verdicts of one shock screen')
    s.add_argument('dir')
    s.add_argument('--control')
    s.add_argument('--json')
    r = sub.add_parser('record', help='append one row to review/stability/sensitivity.jsonl')
    r.add_argument('dir')
    r.add_argument('--name', required=True)
    r.add_argument('--stage', required=True, choices=['filter', 'full', 'shocks'])
    r.add_argument('--params', help='JSON object of the params the screen ran with (default: from meta.json)')
    r.add_argument('--control', help='control for the flags column (judge stages only)')
    r.add_argument('--burn', type=float, default=BURN)
    a = ap.parse_args()

    if a.cmd == 'judge':
        res = judge(a.dir, a.control, a.burn, a.strict)
        print_judge(res)
        write_json(res, a.json)
        sys.exit(1 if res['verdict'] == 'FAIL' else 0)
    if a.cmd == 'shocks':
        res = shocks(a.dir, a.control)
        print_shocks(res)
        write_json(res, a.json)
        sys.exit(1 if res['verdict'] == 'FAIL' else 0)
    if a.cmd == 'record':
        params = json.loads(a.params) if a.params else None
        res = shocks(a.dir, a.control) if a.stage == 'shocks' else judge(a.dir, a.control, a.burn)
        row = record_row(res, a.name, a.stage, params)
        print(f"recorded {a.name} ({a.stage}): {row['verdict']} -> {os.path.relpath(SENSITIVITY, ROOT)}")


if __name__ == '__main__':
    main()
