// Named seeds: worlds with remarkable histories, found by mining 32 headless 40-year runs of the default
// settings (checkpoint v5, tools/mine_seeds.py). The same seed always grows the same valley and, left alone, the same history.
export interface NamedSeed {
  seed: string;
  name: string;
  blurb: string;
}

export const NAMED_SEEDS: NamedSeed[] = [
  { seed: '18', name: "Knife's edge", blurb: 'The herd falls below a hundred bison and has to claw its way back while the wolves press hard.' },
  { seed: '12', name: 'Thunder herd', blurb: 'The biggest herd of any world: nearly fifteen hundred bison at its peak.' },
  { seed: '7', name: 'Golden plenty', blurb: 'Bison and pronghorn both thrive; a rich valley that keeps the wolves busy.' },
  { seed: '11', name: 'The dry years', blurb: 'Five droughts in forty years. Watch the grass, then everything that eats it.' },
  { seed: '27', name: 'Wolf winter', blurb: 'The packs dwindle to about a dozen wolves before they rebuild.' },
  { seed: '22', name: "Pronghorn's last stand", blurb: 'The pronghorn fall to about twenty animals and find a way back.' },
  { seed: '10', name: 'Steady valley', blurb: 'The calmest world: gentle swings, a good place to start.' },
];
