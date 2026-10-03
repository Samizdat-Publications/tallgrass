// Unit tests for the pure audio policy. Run: npx tsx src/audio/mix.test.ts   (also accepts --selftest, which is the default)
import { Weather } from '../sim/types';
import {
  BED_NAMES, bedMix, clamp01, distanceCutoff, distanceGain, eventAttenuation, eventDistance01, nextDelay, randomWindow, segmentClip,
  spotPlan, sunHeight, winterWeight,
} from './mix';
import type { MixEnv, Nearby } from './mix';
import { countNearby, nearWater01 } from './inputs';
import { AGENT_STRIDE, Sp } from '../sim/types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const SUMMER = 1.5;
const WINTER = 3.5;
const env = (over: Partial<MixEnv> = {}): MixEnv => ({
  season: SUMMER, dayFrac: 0.5, weather: Weather.Clear, rain: 0, windStrength: 0.5, warmth: 0.9, ...over,
});
const none: Nearby = { bison: 0, wolf: 0, raven: 0, pronghorn: 0 };

// ---- helpers
ok(clamp01(NaN) === 0 && clamp01(-3) === 0 && clamp01(7) === 1 && clamp01(0.4) === 0.4, 'clamp01 handles NaN, below, above');
ok(Math.abs(sunHeight(0.5) - 1) < 1e-9 && Math.abs(sunHeight(0) + 1) < 1e-9 && Math.abs(sunHeight(0.25)) < 1e-9, 'sunHeight: noon 1, midnight -1, sunrise 0');
ok(winterWeight(WINTER) === 1 && winterWeight(SUMMER) === 0 && winterWeight(3.999) > 0.9 && winterWeight(0.05) > winterWeight(0.5), 'winterWeight shape');
ok(Math.abs(winterWeight(0.2) - winterWeight(4.2)) < 1e-9, 'winterWeight wraps');

// ---- bed mix: basic scenes
const noon = bedMix(env(), 40, 0);
ok(noon.wind > 0.3, 'summer noon: wind bed is up (' + noon.wind.toFixed(2) + ')');
ok(noon.crickets === 0, 'summer noon: no crickets');
ok(noon.rain === 0 && noon.winter === 0 && noon.creek === 0, 'summer noon: no rain, winter wind or creek');
ok(noon.birds > 0.2, 'summer noon: some birds');

const midnight = bedMix(env({ dayFrac: 0 }), 40, 0);
ok(midnight.crickets > 0.6, 'summer midnight: crickets (' + midnight.crickets.toFixed(2) + ')');
ok(midnight.birds === 0, 'summer midnight: no birds');
ok(midnight.wind < noon.wind, 'summer midnight: wind bed softer than noon');

for (const d of [0.3, 0.7]) {
  const g = bedMix(env({ dayFrac: d }), 40, 0);
  ok(g.birds > 0.4, 'golden hour ' + d + ': birds ' + g.birds.toFixed(2));
}
ok(bedMix(env({ dayFrac: 0.3 }), 40, 0).birds > bedMix(env({ dayFrac: 0.5 }), 40, 0).birds, 'birds are louder at golden hour than at noon');
ok(bedMix(env({ dayFrac: 0.8 }), 40, 0).crickets > 0.3, 'crickets already up an hour after sunset');

const winterNight = bedMix(env({ season: WINTER, dayFrac: 0, warmth: 0.05 }), 40, 0);
ok(winterNight.crickets === 0, 'winter night: no crickets');
ok(winterNight.winter > 0.3 && winterNight.wind < 0.1, 'winter: winter wind replaces grass wind (' + winterNight.winter.toFixed(2) + ' / ' + winterNight.wind.toFixed(2) + ')');
ok(bedMix(env({ season: WINTER }), 40, 0).birds < 0.1, 'winter noon: almost no birds');

const heavyRain = bedMix(env({ rain: 0.8, weather: Weather.Rain }), 40, 0);
ok(heavyRain.rain > 0.6, 'rain 0.8: rain bed up (' + heavyRain.rain.toFixed(2) + ')');
ok(heavyRain.birds < 0.2 * noon.birds + 0.05, 'rain 0.8: birds suppressed');
ok(bedMix(env({ rain: 0.1 }), 40, 0).rain < 0.05, 'rain 0.1: rain bed stays out');
ok(bedMix(env({ rain: 0.2 }), 40, 0).rain > 0.05 && bedMix(env({ rain: 0.2 }), 40, 0).rain < 0.4, 'rain 0.2: rain bed just fading in');
ok(bedMix(env({ season: WINTER, rain: 0.6, weather: Weather.Snow }), 40, 0).rain === 0, 'snow never plays the rain bed');
ok(bedMix(env({ weather: Weather.Storm, rain: 0.9 }), 40, 0).wind > bedMix(env({ rain: 0.9 }), 40, 0).wind, 'storm raises the wind bed');

// ---- camera height
const low = bedMix(env({ dayFrac: 0.3 }), 10, 1);
const high = bedMix(env({ dayFrac: 0.3 }), 500, 1);
ok(high.birds < 0.1 * low.birds + 0.01, 'very high camera: birds nearly gone');
ok(high.creek < 0.05, 'very high camera: creek nearly gone');
ok(high.wind > low.wind, 'higher camera: more wind (' + low.wind.toFixed(2) + ' -> ' + high.wind.toFixed(2) + ')');
ok(bedMix(env({ dayFrac: 0 }), 500, 0).crickets < 0.1, 'very high camera: crickets nearly gone');
ok(high.wind >= Math.max(...BED_NAMES.map((n) => high[n])), 'very high camera: wind is the dominant bed');

// ---- water
ok(bedMix(env(), 10, 1).creek > 0.5, 'next to water: creek bed up');
ok(bedMix(env(), 10, 0).creek === 0, 'away from water: creek silent');
ok(bedMix(env(), 10, 0.5).creek > 0 && bedMix(env(), 10, 0.5).creek < bedMix(env(), 10, 1).creek, 'creek follows proximity');
ok(bedMix(env({ season: WINTER }), 10, 1).creek < bedMix(env(), 10, 1).creek, 'creek is thinner in winter');

// ---- wind
ok(bedMix(env({ windStrength: 0.9 }), 40, 0).wind > bedMix(env({ windStrength: 0.2 }), 40, 0).wind, 'wind bed follows windStrength');

// ---- sweep: always finite and in 0..1; smooth in time
let sweepOk = true;
for (let day = 0; day <= 1.0001; day += 0.05)
  for (let season = 0; season <= 4; season += 0.25)
    for (const rain of [0, 0.3, 0.6, 1])
      for (const windStrength of [0, 0.5, 1])
        for (const cam of [0, 5, 60, 300, 5000])
          for (const water of [0, 0.5, 1])
            for (const weather of [0, 1, 2, 3, 4] as const) {
              const m = bedMix({ season, dayFrac: day, weather, rain, windStrength, warmth: 0.5 }, cam, water);
              for (const n of BED_NAMES) if (!(m[n] >= 0 && m[n] <= 1 && Number.isFinite(m[n]))) sweepOk = false;
            }
ok(sweepOk, 'bedMix always returns finite gains in 0..1 across the whole sweep');
const weird = bedMix({ season: NaN, dayFrac: NaN, weather: 0, rain: NaN, windStrength: NaN, warmth: NaN }, NaN, NaN);
ok(BED_NAMES.every((n) => Number.isFinite(weird[n]) && weird[n] >= 0 && weird[n] <= 1), 'bedMix survives NaN inputs');

let maxStep = 0;
for (let day = 0; day < 1; day += 0.002) {
  const a = bedMix(env({ dayFrac: day }), 40, 0.5);
  const b = bedMix(env({ dayFrac: day + 0.002 }), 40, 0.5);
  for (const n of BED_NAMES) maxStep = Math.max(maxStep, Math.abs(a[n] - b[n]));
}
ok(maxStep < 0.05, 'bed gains change smoothly through the day (max step ' + maxStep.toFixed(4) + ')');
let seasonStep = 0;
for (let s = 0; s < 4; s += 0.01) {
  const a = bedMix(env({ season: s }), 40, 0.5);
  const b = bedMix(env({ season: s + 0.01 }), 40, 0.5);
  for (const n of BED_NAMES) seasonStep = Math.max(seasonStep, Math.abs(a[n] - b[n]));
}
ok(seasonStep < 0.05, 'bed gains change smoothly through the seasons (max step ' + seasonStep.toFixed(4) + ')');

// ---- spot plans
const night = env({ dayFrac: 0.95 });
const farWolves = spotPlan(night, 40, none, 1);
const nearWolves = spotPlan(night, 40, { ...none, wolf: 6 }, 1);
ok(Number.isFinite(farWolves.wolf.mean) && Number.isFinite(nearWolves.wolf.mean), 'wolves howl at night');
ok(nearWolves.wolf.mean < farWolves.wolf.mean, 'nearby wolves howl more often');
ok(nearWolves.wolf.gain > farWolves.wolf.gain && nearWolves.wolf.distance < farWolves.wolf.distance, 'nearby wolves are louder and closer');
ok(!Number.isFinite(spotPlan(env({ dayFrac: 0.5 }), 40, { ...none, wolf: 6 }, 1).wolf.mean), 'no wolf howls at noon');
ok(Number.isFinite(spotPlan(env({ dayFrac: 0.78 }), 40, none, 1).wolf.mean), 'wolf howls allowed at dusk');
ok(spotPlan(night, 500, { ...none, wolf: 6 }, 1).wolf.gain < nearWolves.wolf.gain, 'very high camera quiets the wolves');

ok(!Number.isFinite(spotPlan(env(), 40, { ...none, raven: 3 }, 1).raven.mean), 'ravens need more than 3 nearby');
ok(Number.isFinite(spotPlan(env(), 40, { ...none, raven: 4 }, 1).raven.mean), 'ravens call with 4 nearby');
ok(!Number.isFinite(spotPlan(night, 40, { ...none, raven: 12 }, 1).raven.mean), 'ravens roost at night');
ok(spotPlan(env(), 40, { ...none, raven: 20 }, 1).raven.mean < spotPlan(env(), 40, { ...none, raven: 5 }, 1).raven.mean, 'more ravens call more often');

ok(!Number.isFinite(spotPlan(env(), 40, { ...none, bison: 5 }, 1).bison.mean), 'bison need more than 5 nearby');
ok(Number.isFinite(spotPlan(env(), 40, { ...none, bison: 6 }, 1).bison.mean), 'bison grunt with 6 nearby and a low camera');
ok(!Number.isFinite(spotPlan(env(), 60, { ...none, bison: 30 }, 1).bison.mean), 'no bison grunts when the camera is at 60 m or higher');
ok(spotPlan(env(), 5, { ...none, bison: 30 }, 1).bison.gain > spotPlan(env(), 55, { ...none, bison: 30 }, 1).bison.gain, 'bison grunts are louder closer to the ground');

ok(!Number.isFinite(spotPlan(env(), 40, none, 1).thunder.mean), 'no thunder in clear weather');
ok(Number.isFinite(spotPlan(env({ weather: Weather.Storm, rain: 0.9 }), 40, none, 1).thunder.mean), 'thunder in a storm');
ok(!Number.isFinite(spotPlan(env({ weather: Weather.Rain, rain: 0.9 }), 40, none, 1).thunder.mean), 'no thunder in plain rain');

const busy = { bison: 30, wolf: 6, raven: 12, pronghorn: 10 };
const stormy = env({ dayFrac: 0.8, weather: Weather.Storm, rain: 0.9 });
const slow = spotPlan(stormy, 10, busy, 1);
const fast = spotPlan(stormy, 10, busy, 10);
const paused = spotPlan(stormy, 10, busy, 0);
ok(fast.wolf.mean === 4 * slow.wolf.mean && fast.bison.mean === 4 * slow.bison.mean && fast.thunder.mean === 4 * slow.thunder.mean, 'speed >= 10 makes spot sounds four times rarer');
ok(fast.wolf.gain < slow.wolf.gain, 'speed >= 10 makes spot sounds a little quieter');
ok(spotPlan(env({ dayFrac: 0.8 }), 10, busy, 9.9).wolf.mean === spotPlan(env({ dayFrac: 0.8 }), 10, busy, 1).wolf.mean, 'speed 9.9 is not thinned');
ok(Object.values(paused).every((r) => !Number.isFinite(r.mean)), 'paused (speed 0): no spot sounds');

// ---- delays: random, never zero, mean is right
let sum = 0;
let min = Infinity;
const N = 20000;
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < N; i++) {
  const d = nextDelay(30, rnd());
  sum += d;
  min = Math.min(min, d);
}
ok(min >= 12 - 1e-9, 'nextDelay never below 0.4 x mean (min ' + min.toFixed(2) + ')');
ok(Math.abs(sum / N - 30) < 2.5, 'nextDelay averages about the mean (' + (sum / N).toFixed(2) + ')');
ok(nextDelay(Infinity, 0.5) === Infinity, 'nextDelay of an off rule is Infinity');

// ---- distance
ok(eventAttenuation(0) === 1 && eventAttenuation(700) >= 0.12 && eventAttenuation(100) > eventAttenuation(400), 'event attenuation falls with distance, floors at 0.12');
ok(eventDistance01(0) === 0 && eventDistance01(1e6) === 1, 'eventDistance01 clamps');
ok(distanceCutoff(0) > 15000 && Math.abs(distanceCutoff(1) - 700) < 1 && distanceCutoff(0.5) < distanceCutoff(0.2), 'distance low-pass gets duller with distance');
ok(distanceGain(0) === 1 && distanceGain(1) > 0.1 && distanceGain(1) < distanceGain(0.3), 'distanceGain falls but never to silence');

// ---- segmentation of a synthetic clip: three bursts separated by silence
{
  const sr = 8000;
  const data = new Float32Array(sr * 4);
  const burst = (t0: number, t1: number) => {
    for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) data[i] = 0.6 * Math.sin(i * 0.3) * (i % 7 === 0 ? 1 : 0.8);
  };
  burst(0.2, 0.7);
  burst(1.4, 2.1);
  burst(3.0, 3.4);
  const segs = segmentClip(data, sr);
  ok(segs.length === 3, 'segmentClip finds 3 bursts (found ' + segs.length + ')');
  ok(segs.length === 3 && segs[0].start < 0.25 && segs[0].end > 0.65 && segs[1].start > 1.2 && segs[2].end < 3.6, 'segment bounds are sensible');
  const steady = new Float32Array(sr * 2).fill(0.2);
  ok(segmentClip(steady, sr).length === 1, 'a steady sound stays one segment');
  ok(segmentClip(new Float32Array(sr), sr).length === 1, 'silence returns the whole clip');
  const w = randomWindow(3.3, 1.0, 1.8, 0.5, 0.5);
  ok(w.start >= 0 && w.end <= 3.3 && Math.abs(w.end - w.start - 1.4) < 1e-9, 'randomWindow stays inside the clip');
  const w2 = randomWindow(0.8, 1.0, 1.8, 1, 1);
  ok(w2.start === 0 && Math.abs(w2.end - 0.8) < 1e-9, 'randomWindow of a short clip is the whole clip');
}

// ---- inputs helpers
{
  const agents = new Float32Array(AGENT_STRIDE * 6);
  const put = (i: number, sp: number, x: number, y: number) => {
    agents[i * AGENT_STRIDE] = sp;
    agents[i * AGENT_STRIDE + 1] = x;
    agents[i * AGENT_STRIDE + 2] = y;
  };
  put(0, Sp.Bison, 100, 100);
  put(1, Sp.Bison, 120, 130);
  put(2, Sp.Wolf, 90, 90);
  put(3, Sp.Raven, 110, 105);
  put(4, Sp.Deer, 400, 400); // far away
  put(5, Sp.Rabbit, 100, 100); // not counted
  const n = countNearby(agents, 6, 100, 100, 100);
  ok(n.bison === 2 && n.wolf === 1 && n.raven === 1 && n.pronghorn === 0, 'countNearby counts species inside the radius only');
  const n2 = countNearby(agents, 6, 400, 400, 50);
  ok(n2.pronghorn === 1 && n2.bison === 0, 'countNearby follows the camera');
  ok(countNearby(agents, 0, 0, 0).bison === 0, 'countNearby with zero animals');
  const waterDist = new Float32Array(16);
  for (let k = 0; k < 16; k++) waterDist[k] = k * 20; // 0..300 m
  const w = { size: 400, n: 4, cell: 100, waterDist };
  ok(nearWater01(w, 50, 50) === 1, 'nearWater01 is 1 on a water cell');
  ok(nearWater01(w, 350, 350) === 0, 'nearWater01 is 0 far from water');
  ok(nearWater01(w, 150, 0) > 0 && nearWater01(w, 150, 0) < 1, 'nearWater01 falls off between');
  ok(nearWater01(w, -50, 9999) >= 0, 'nearWater01 clamps positions outside the world');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
