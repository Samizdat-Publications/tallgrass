// Named seeds: worlds with remarkable histories, found by mining 32 headless 40-year runs of the default
// settings (checkpoint v4). The same seed always grows the same valley and, left alone, the same history.
export interface NamedSeed {
  seed: string;
  name: string;
  blurb: string;
}

export const NAMED_SEEDS: NamedSeed[] = [
  { seed: '18', name: "Knife's edge", blurb: 'The herd falls to a few dozen animals and has to claw its way back while the wolves press hard.' },
  { seed: '21', name: 'Thunder herd', blurb: 'The biggest herd of any world: nearly three thousand bison at its peak.' },
  { seed: '7', name: 'Golden plenty', blurb: 'Bison and pronghorn both boom; a rich valley that keeps the wolves busy.' },
  { seed: '11', name: 'The dry years', blurb: 'Drought after drought. Watch the grass, then everything that eats it.' },
  { seed: '4', name: 'Wolf winter', blurb: 'The packs dwindle to a handful of wolves before they rebuild.' },
  { seed: '25', name: "Pronghorn's last stand", blurb: 'The pronghorn fall to single digits and find a way back.' },
  { seed: '23', name: 'Steady valley', blurb: 'The calmest world: gentle swings, a good place to start.' },
];
