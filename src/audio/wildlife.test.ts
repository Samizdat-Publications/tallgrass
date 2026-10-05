// Unit tests for the R3 wildlife audio policy (wildlife.ts). Run: npx tsx src/audio/wildlife.test.ts
import { Weather } from '../sim/types';
import type { MixEnv } from './mix';
import { POSITIONAL_MAX_HEIGHT, WILD_FILES, larkSpot, pickCoyoteClip, placement, thunderPlan, wildPlan } from './wildlife';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const env = (over: Partial<MixEnv> = {}): MixEnv => ({ season: 0.5, dayFrac: 0.32, weather: Weather.Clear, rain: 0, windStrength: 0.3, warmth: 0.8, ...over });

// ---- coyotes: dusk and night, only with coyotes about
const dusk = env({ dayFrac: 0.8 });
ok(Number.isFinite(wildPlan(dusk, 20, 3, 1).coyote.mean), 'coyotes call at dusk when some are near');
ok(!Number.isFinite(wildPlan(dusk, 20, 0, 1).coyote.mean), 'no coyote calls with no coyotes near');
ok(!Number.isFinite(wildPlan(env({ dayFrac: 0.5 }), 20, 6, 1).coyote.mean), 'no coyote calls at noon');
ok(wildPlan(dusk, 20, 8, 1).coyote.mean < wildPlan(dusk, 20, 1, 1).coyote.mean, 'more coyotes call more often');
ok(wildPlan(dusk, 500, 4, 1).coyote.gain < wildPlan(dusk, 20, 4, 1).coyote.gain, 'a very high camera quiets the coyotes');
ok(wildPlan(dusk, 20, 4, 10).coyote.mean > wildPlan(dusk, 20, 4, 1).coyote.mean, 'fast forward thins the coyote calls');
ok(!Number.isFinite(wildPlan(dusk, 20, 4, 0).coyote.mean), 'paused is silent');

// ---- meadowlark: spring and summer mornings, low camera, dry
const morning = env({ season: 0.6, dayFrac: 0.33 });
ok(Number.isFinite(wildPlan(morning, 10, 0, 1).lark.mean), 'a meadowlark sings on a spring morning with the camera low');
ok(Number.isFinite(wildPlan(env({ season: 1.4, dayFrac: 0.3 }), 10, 0, 1).lark.mean), 'and on a summer morning');
ok(!Number.isFinite(wildPlan(env({ season: 2.6, dayFrac: 0.33 }), 10, 0, 1).lark.mean), 'not in autumn');
ok(!Number.isFinite(wildPlan(env({ season: 3.6, dayFrac: 0.33 }), 10, 0, 1).lark.mean), 'not in winter');
ok(!Number.isFinite(wildPlan(env({ season: 0.6, dayFrac: 0.7 }), 10, 0, 1).lark.mean), 'not in the evening');
ok(!Number.isFinite(wildPlan(env({ season: 0.6, dayFrac: 0.05 }), 10, 0, 1).lark.mean), 'not at night');
ok(!Number.isFinite(wildPlan(morning, 90, 0, 1).lark.mean), 'not with the camera high above the grass');
ok(!Number.isFinite(wildPlan({ ...morning, rain: 0.7, weather: Weather.Rain }, 10, 0, 1).lark.mean), 'not in the rain');
ok(wildPlan(morning, 5, 0, 1).lark.gain > wildPlan(morning, 40, 0, 1).lark.gain, 'louder nearer the ground');

// ---- thunder
const near = thunderPlan(80, 0.2), mid = thunderPlan(700, 0.2), far = thunderPlan(3000, 0.2);
ok(near.clip === 'crack1' && thunderPlan(80, 0.9).clip === 'crack2', 'a close strike cracks, with two takes to choose from');
ok(far.clip === 'rumble', 'a far strike only rumbles');
ok(near.gain > mid.gain && mid.gain > 0, 'closer thunder is louder');
ok(near.cutoffD01 < mid.cutoffD01, 'closer thunder is brighter');
ok(thunderPlan(NaN, 0.5).clip !== undefined && Number.isFinite(thunderPlan(NaN, 0.5).gain), 'an unknown distance is handled');
ok(thunderPlan(0, 0.1).gain <= 1 && thunderPlan(0, 0.1).gain > 0.9, 'a strike on top of the camera is full volume but never clips');

// ---- placement
ok(placement(5, 40).positional && placement(POSITIONAL_MAX_HEIGHT - 1, 40).positional, 'a low camera places sounds in the world');
ok(!placement(POSITIONAL_MAX_HEIGHT + 1, 40).positional && !placement(300, 40).positional, 'a high camera hears plain sounds');
ok(placement(300, 100).distance01 < placement(300, 400).distance01 && placement(300, 9999).distance01 === 1, 'distance grows with the ground distance, capped at 1');

// ---- the rest
const seen = new Set([pickCoyoteClip(0.1), pickCoyoteClip(0.6), pickCoyoteClip(0.9)]);
ok(seen.size === 3, 'coyote calls pick all three clips');
const s = larkSpot(100, 200, 0, 0), s2 = larkSpot(100, 200, Math.PI, 1);
ok(Math.abs(s.x - 120) < 1e-9 && Math.abs(s.z - 200) < 1e-9 && Math.abs(s2.x - 30) < 1e-9, 'the lark sits 20 to 70 m from the camera');
ok(Object.keys(WILD_FILES).length === 8, 'eight wildlife clips are listed');

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
