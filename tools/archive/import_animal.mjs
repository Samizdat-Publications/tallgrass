// One command per species: Blender stage 1 (tools/import_animal.py: import, orient, decimate, unwrap, bake) then stage 2
// (tools/label_animal.py: retarget the legs onto our rig, label the parts, write public/models/a3/<species>.bin/.json + textures).
//   node tools/import_animal.mjs bison [--skip-bake]      (the species config is tools/animals/<species>.json)
// --skip-bake reruns only stage 2 (fast: edit the labels, the rig numbers or the AO in the config and rerun). Blender is run under a timeout.
import { execFileSync } from 'node:child_process';
const [species, ...rest] = process.argv.slice(2);
if (!species) { console.error('usage: node tools/import_animal.mjs <species> [--skip-bake]'); process.exit(2); }
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe';
const cfg = `tools/animals/${species}.json`;
if (!rest.includes('--skip-bake')) {
  execFileSync(BLENDER, ['-b', '--factory-startup', '-P', 'tools/import_animal.py', '--', cfg], { stdio: 'inherit', timeout: 15 * 60 * 1000 });
}
execFileSync(process.env.PYTHON ?? 'python', ['tools/label_animal.py', cfg], { stdio: 'inherit', timeout: 5 * 60 * 1000 });
