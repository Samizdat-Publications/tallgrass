// Eight more field notes for the new life of the valley (R3 item 10): coyote pups, a mousing leap, an alarm wave, a plague in the
// dog town, wolves coming back on their own, pronghorn on the move, mange and a boom of hares.
//
// The notebook itself (fieldnotes.ts) belongs to Track S, so these live here, in Track R's file. Importing this module appends the
// eight definitions to the shared NOTES list (once), so the panel, the storage and the toast see them like any other note, and
// NOTE_TOTAL is the count to show. `trackR3` is the detector for the ones that come from sim events; the mousing leap and the alarm
// wave are ticked from the render layers (main.ts). If Track S would rather own all of it, move NOTES_R3 into fieldnotes.ts, add
// the cases of trackR3 to NoteTracker.update and change the count the tests expect (18 to 26).
import type { SimEvent } from '../sim/sim';
import { NOTES } from './fieldnotes';
import type { FieldNotes, NoteDef, NotePlace } from './fieldnotes';

export const NOTES_R3: NoteDef[] = [
  { id: 'coyotePups', title: 'Pups in the grass', hint: 'Wait for a coyote den to have its first litter.' },
  { id: 'mousingLeap', title: 'The mousing leap', hint: 'Find a coyote standing very still in the grass, and watch it spring.' },
  { id: 'alarmWave', title: 'An alarm sweeps the town', hint: 'Let a predator walk up to a prairie dog town and watch the dogs dive in a wave.' },
  { id: 'townPlague', title: 'Plague in the dog town', hint: 'Sylvatic plague can empty a prairie dog town. Let a summer pass.' },
  { id: 'wolvesOwn', title: 'The wolves come back on their own', hint: 'With the prairie open, a pair of wolves walks in from outside.' },
  { id: 'pronghornMigration', title: 'Pronghorn on the move', hint: 'Watch pronghorn walk in or out through a corridor in the edge of the valley.' },
  { id: 'mangeSeen', title: 'Mange', hint: 'A wolf or coyote loses its coat to mange: patchy, thin, and a sign a family is struggling.' },
  { id: 'hareBoom', title: 'A boom of hares', hint: 'The jackrabbits boom in a good grass year.' },
];

// append once, however many times the module is loaded
for (const n of NOTES_R3) if (!NOTES.some((x) => x.id === n.id)) NOTES.push(n);

/** How many notes there are to find in all (the 18 of fieldnotes.ts and these eight). */
export const NOTE_TOTAL = NOTES.length;

const SP_WOLF = 1;
const SP_PRONGHORN = 3;

/** Tick the notes that come from sim events. Call with each frame's events (the same list NoteTracker.update gets). */
export function trackR3(notes: FieldNotes, events: SimEvent[], year: number): void {
  for (const e of events) {
    const at: NotePlace = { x: e.x, y: e.y }; // (0, 0) means the event has no place: its toast is never held for the camera
    switch (e.kind) {
      case 'coyotePups': notes.earn('coyotePups', year, at); break;
      case 'sylvaticPlague': notes.earn('townPlague', year, at); break;
      case 'immigrated':
        if (e.sp === SP_WOLF) notes.earn('wolvesOwn', year, at);
        else if (e.sp === SP_PRONGHORN) notes.earn('pronghornMigration', year, at);
        break;
      case 'emigrated': if (e.sp === SP_PRONGHORN) notes.earn('pronghornMigration', year, at); break;
      case 'mange': notes.earn('mangeSeen', year, at); break;
      case 'hareBoom': notes.earn('hareBoom', year); break;
      default: break;
    }
  }
}
