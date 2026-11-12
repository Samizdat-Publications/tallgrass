# ROUTING.md: who does what (Fable as head, cheaper models as hands)

The main session runs on Claude Fable 5.2. It designs, decides, looks, and integrates. It hands every token-heavy job that does not need its judgment to a subagent pinned to a cheaper model.

## The table

| Work | Who | Model |
|---|---|---|
| Vision, design, art direction, architecture, acceptance criteria | Main session | Fable |
| Looking at every capture, render and contact sheet, and deciding what is wrong | Main session | Fable |
| Hero assets where the look is the point (lookdev, materials, texture and twig atlases, a hero prop), using the headless Blender render loop below | Main session | Fable |
| Tuning look parameters against the scorecard (exposure, light balance, fog, color) | Main session | Fable |
| Final integration, commits, checkpoint messages | Main session | Fable |
| Implementing a designed task (code, scenes, shaders, data wiring, UI from an approved comp) | `builder` | Opus |
| Mechanical work: downloads, conversions, bulk edits, long test runs, log triage, batch exports, credits | `grunt` | Sonnet |
| Lookups: where is X in the code, does API Y exist in this version, is fact Z sourced | `scout` | Haiku |
| Checkpoint review with fresh eyes | `verifier` | Opus |
| Modeling one asset end to end from photos when several assets should be modeled in parallel | `modeler` | Fable |
| A hard call inside a session that runs on a cheaper model (an Opus-led project) | `fable-advisor` | Fable |

Projects made from older handoffs also have `worker` (Sonnet). Treat it like `grunt` plus simple implementation.

## Rules

1. **Never delegate a judgment about looks.** A subagent can produce the capture; Fable decides whether it is right.
2. **Delegate with a full brief.** Goal, the files to touch, the contract to honor, the exact test or capture that proves it, and what to report. A subagent starts cold.
3. **Run independent tasks in parallel.** Use git worktrees for builders that touch different areas. Merge in the main session.
4. **Keep the main context lean.** Fable never reads a long log, a full test run or a big data file. A grunt summarizes it.
5. **Model pins live in the agent files.** Do not rely on passing a model per call. If `CLAUDE_CODE_SUBAGENT_MODEL` is set in the environment it overrides every pin; it must be empty.
6. **Effort.** Fable on high for design and lookdev passes, medium for routine orchestration. Builders on medium, grunts on low.
7. **Parallel modelers.** When many assets need modeling, the main session can run two or three `modeler` subagents at once on different assets (each in its own worktree or on files no one else touches). Blender runs headless in parallel; engine captures run one at a time because they share the GPU. The main session still reviews every result against the photos before it goes in.
8. **Opus-led projects.** A project whose main session runs on Opus can still use Fable for the hard parts through `fable-advisor`. The advisor starts cold, so the brief must be self-contained. For a whole-project improvement, run Fable as the main session instead (`/fable-retrofit`).

## The headless Blender render loop (how Fable models)

This works in autonomous runs with no Blender window and no MCP:

1. Fable writes or edits a Blender Python script in `tools/blender/` that builds the asset from parameters.
2. Run it headless: `blender -b --factory-startup -P tools/blender/<script>.py -- --preview artifacts/lookdev/<asset>/` which saves the asset and renders preview PNGs (front, three-quarter, close-up, and the in-game camera distance) under fixed lights.
3. Fable opens the PNGs, compares them against the reference images, changes parameters, and repeats.
4. When it looks right, the asset is exported (glTF), placed in the engine, and checked again in an engine capture under the real lighting, because Blender's look is not the engine's look.
5. A builder does the wiring (import settings, LODs, collision, placement); Fable reviews the final capture.

The Blender MCP connected to the desktop app is fine for interactive sessions with Stewart watching, but the script loop is the default because it is repeatable and leaves the asset rebuildable from source.

## When to buy, scan or download instead of model

- People, animals, vehicles with complex organic shapes: start from a bought or CC BY model, then let Fable fix materials, fit and scale. Fable is strong at materials and hard-surface, weaker at organic sculpting from scratch.
- Real buildings and places: photogrammetry or LiDAR for shape, Fable for surfaces and cleanup.
- Plants: a plant generator (PlantFactory or similar) for structure, Fable for twig and leaf cards, atlases and shaders.
- Machines and hard-surface props (aircraft interiors, Enigma, a Bombe, fences, gates): Fable models from references and dimensions.
