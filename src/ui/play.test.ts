// Play UI checks (R12): valley setup params, settings normalising, the title card gate, the field guide's 60 m check.
// Pure logic only (no DOM). Run: npx tsx src/ui/play.test.ts
import { applyOverrides, defaultParams } from '../sim/params';
import { SPECIES } from '../sim/species';
import { St } from '../sim/types';
import { FieldGuide, GUIDE, guidePages, scanFrame, WITNESS_RADIUS } from './fieldguide';
import { DEFAULT_SETTINGS, normalizeSettings, UI_SCALE_MAX, UI_SCALE_MIN } from './settings';
import { buildSetupParams, countRange, defaultSetup, initialKey, openKey, setupSpecies } from './setup';
import { titleWanted } from './title';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}
const EM_DASH = String.fromCharCode(0x2014);

// ---- valley setup -----------------------------------------------------------------------------------------------------
const names = setupSpecies().map((s) => s.key);
ok(['bison', 'wolf', 'raven', 'pronghorn', 'cougar'].every((k) => names.includes(k)), `setup offers bison, wolf, raven, pronghorn, cougar (got ${names.join(',')})`);
ok(!names.includes('rabbit'), 'setup leaves the rabbit out');
ok(Object.keys(buildSetupParams(defaultSetup())).length === 0, 'the standard setup gives no overrides');

const st = defaultSetup();
const bison = SPECIES.find((s) => s.key === 'bison')!;
const cougar = SPECIES.find((s) => s.key === 'cougar')!;
const pron = SPECIES.find((s) => s.key === 'pronghorn')!;
st.counts[bison.id] = 300;
st.counts[cougar.id] = 4;
st.counts[pron.id] = 0;
const p1 = buildSetupParams(st);
ok(p1['bison.initial'] === 300 && p1['cougar.initial'] === 4 && p1['deer.initial'] === 0, 'counts become <prefix>.initial (pronghorn is deer)');
ok(initialKey(pron.id) === 'deer.initial', 'pronghorn count key');

const st2 = defaultSetup();
st2.climate = 'drier';
st2.winters = 'harsher';
st2.calendar = 'quick';
const p2 = buildSetupParams(st2);
const d = defaultParams();
ok(Math.abs(p2.grassGrowth - d.grassGrowth * 0.85) < 1e-6, 'drier lowers grassGrowth');
ok(p2.droughtGrowth < d.droughtGrowth, 'drier deepens droughts');
ok(p2.winterDieback > d.winterDieback, 'harsher raises winterDieback');
ok(p2.calendarScale === 4, 'quick years: calendarScale 4');
const st3 = defaultSetup();
st3.climate = 'wetter';
st3.winters = 'milder';
st3.calendar = 'slow';
const p3 = buildSetupParams(st3);
ok(p3.grassGrowth > d.grassGrowth && p3.winterDieback < d.winterDieback && p3.calendarScale === 1, 'wetter, milder, long years');

// every key it can emit must be a real param (applyOverrides throws on an unknown one)
const all = defaultSetup();
for (const s of setupSpecies()) all.counts[s.id] = 7;
all.climate = 'wetter';
all.winters = 'harsher';
all.open = false; // the standard valley is open, so closing it is the override
all.calendar = 'slow';
let threw = '';
try {
  applyOverrides(defaultParams(), buildSetupParams(all));
} catch (e) {
  threw = (e as Error).message;
}
ok(threw === '', `every setup key is a real param (${threw})`);
const ok0 = openKey();
ok(ok0 === null || buildSetupParams(all)[ok0] === 0, 'a closed valley sets the open param to 0 when the sim has one');
ok(ok0 === null || buildSetupParams({ ...all, open: true })[ok0] === undefined, 'an open valley (the standard one) needs no override');
ok(buildSetupParams({ ...all, raptors: false }).raptors === 0 && buildSetupParams({ ...all, raptors: true }).raptors === undefined, 'raptors off is the only raptor override');
ok(defaultSetup().raptors === (defaultParams().raptors > 0) && defaultSetup().open === (ok0 !== null && Number((defaultParams() as unknown as Record<string, unknown>)[ok0]) > 0), 'the setup defaults match the standard valley');
ok(ok0 !== null || buildSetupParams(all)['openPrairie'] === undefined, 'no open param yet: the toggle changes nothing');
for (const s of setupSpecies()) {
  const r = countRange(s);
  ok(r.max >= (defaultParams().species[s.id]?.initial ?? 0) && r.step >= 1, `count range for ${s.key}`);
}

// ---- settings ---------------------------------------------------------------------------------------------------------
ok(JSON.stringify(normalizeSettings(null)) === JSON.stringify(DEFAULT_SETTINGS), 'no saved settings gives the defaults');
const n = normalizeSettings({ quality: 'ultra', master: 5, music: -2, uiScale: 9, idleDim: 'yes', autoCamera: false, bogus: 1 });
ok(n.quality === 'ultra' && n.master === 1 && n.music === 0 && n.uiScale === UI_SCALE_MAX, 'settings are clamped');
ok(n.idleDim === DEFAULT_SETTINGS.idleDim && n.autoCamera === false, 'bad booleans fall back, good ones stay');
ok(normalizeSettings({ quality: 'ludicrous' }).quality === 'high', 'unknown quality falls back to High');
ok(normalizeSettings({ uiScale: 0.1 }).uiScale === UI_SCALE_MIN, 'ui scale floor');
ok(DEFAULT_SETTINGS.quality === 'high', 'High is the default quality');

// ---- title card gate --------------------------------------------------------------------------------------------------
ok(titleWanted('', false), 'a plain visit gets the title card');
ok(!titleWanted('?autocam=0', false), 'autocam=0 skips the title card');
ok(!titleWanted('?notitle=1', false), 'notitle=1 skips the title card');
ok(!titleWanted('?w=abc', false), 'a share link skips the title card');
ok(!titleWanted('?seed=prairie-1', false), 'a chosen seed skips the title card');
ok(!titleWanted('?challenge=herd', false), 'a challenge skips the title card');
ok(!titleWanted('?autoscale=0&autocam=0&seed=x', false), 'tool query strings skip it');
ok(!titleWanted('', true), 'an automated browser skips it');
ok(titleWanted('?title=1', true), 'title=1 forces it even then');
ok(!titleWanted('?title=1&notitle=1', false), 'notitle wins');

// ---- field guide ------------------------------------------------------------------------------------------------------
const pages = guidePages();
const wolf = SPECIES.find((s) => s.key === 'wolf')!;
ok(['bison', 'wolf', 'raven', 'pronghorn', 'cougar'].every((k) => pages.some((p) => p.sp.key === k)), 'a page for each living species');
ok(!pages.some((p) => p.sp.key === 'rabbit'), 'no rabbit page');
for (const p of pages) {
  ok(p.behaviours.length >= 2 && p.behaviours.length <= 6, `${p.sp.key} has 2 to 6 behaviours (${p.behaviours.length})`);
  ok(new Set(p.behaviours.map((b) => b.id)).size === p.behaviours.length, `${p.sp.key} behaviour ids are unique`);
  ok(p.note.length > 40 && !p.note.includes(EM_DASH), `${p.sp.key} note is plain text`);
  for (const b of p.behaviours) ok(!b.label.includes(EM_DASH) && b.states.length > 0, `${p.sp.key}/${b.id} label and states`);
}
for (const k of Object.keys(GUIDE)) ok(GUIDE[k].behaviours.length >= 4 && GUIDE[k].behaviours.length <= 6, `${k} hand-written page has 4 to 6 behaviours`);
const sentences = (t: string) => t.split(/[.!?]\s/).length;
for (const k of Object.keys(GUIDE)) ok(sentences(GUIDE[k].note) >= 2 && sentences(GUIDE[k].note) <= 4, `${k} note is 2 to 3 sentences`);

// agents: stride 12, [sp, x, y, ..., state at 7]
function agents(rows: [number, number, number, number][]): Float32Array {
  const a = new Float32Array(rows.length * 12);
  rows.forEach(([sp, x, y, state], i) => {
    a[i * 12] = sp;
    a[i * 12 + 1] = x;
    a[i * 12 + 2] = y;
    a[i * 12 + 7] = state;
  });
  return a;
}
const A = agents([
  [wolf.id, 500, 500, St.Stalk], // 30 m from the focus: counts
  [wolf.id, 500 + WITNESS_RADIUS + 20, 500, St.Chase], // too far
  [bison.id, 520, 500, St.Graze],
]);
const scan = scanFrame(A, 3, 500, 530);
ok(scan.counts[wolf.id * 16 + St.Stalk] === 1, 'a wolf 30 m away is in frame');
ok(scan.counts[wolf.id * 16 + St.Chase] === 0, 'a wolf beyond the radius is not');
ok(scan.inFrame.has(wolf.id) && scan.inFrame.has(bison.id), 'species in frame');

const guide = new FieldGuide();
guide.yearNow = 3;
let witnessed = '';
guide.onWitness = (page, b) => (witnessed += `${page.sp.key}:${b.id};`);
const fresh = guide.observe(A, 3, 500, 530);
ok(fresh.some((b) => b.id === 'stalk') && fresh.some((b) => b.id === 'graze'), 'stalking wolf and grazing bison are witnessed');
ok(guide.seen('wolf', 'stalk') && guide.seenYear('wolf', 'stalk') === 3, 'recorded with the year');
ok(!guide.seen('wolf', 'chase'), 'the far chase is not recorded');
ok(witnessed.includes('wolf:stalk;'), 'onWitness fires');
ok(guide.observe(A, 3, 500, 530).length === 0, 'nothing is witnessed twice');
const tags = guide.tagsNow();
ok(tags.species.includes(wolf.id) && tags.behaviours.includes('wolf:stalk'), 'a photograph is tagged with species in frame and behaviours shown');
guide.notePhotograph(tags.behaviours);
ok(guide.photographed('wolf', 'stalk') === 1, 'photographs are counted');
// a flock needs enough animals
const raven = SPECIES.find((s) => s.key === 'raven')!;
const few = agents(Array.from({ length: 3 }, (_, i) => [raven.id, 100 + i, 100, St.Fly] as [number, number, number, number]));
const g2 = new FieldGuide();
g2.observe(few, 3, 100, 100, true);
ok(g2.seen('raven', 'fly') && !g2.seen('raven', 'flock'), 'three ravens fly, but are not a flock');
const many = agents(Array.from({ length: 7 }, (_, i) => [raven.id, 100 + i, 100, St.Fly] as [number, number, number, number]));
g2.observe(many, 7, 100, 100, true);
ok(g2.seen('raven', 'flock'), 'seven ravens are a flock');
const tot = g2.total();
ok(tot.seen === 2 && tot.total === pages.reduce((n2, p) => n2 + p.behaviours.length, 0), 'totals count behaviours across pages');

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
