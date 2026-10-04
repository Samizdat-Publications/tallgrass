// Named seeds: worlds with remarkable histories, found by mining 32 headless runs of the default settings over the
// first 80 valley-years (checkpoint v5 on the 2x calendar, tools/mine_seeds.py --max-years 80). The same seed always grows
// the same valley and, left alone, the same history.
export interface NamedSeed {
  seed: string;
  name: string;
  blurb: string;
}

export const NAMED_SEEDS: NamedSeed[] = [
  { seed: '16', name: "Knife's edge", blurb: 'The herd falls below sixty bison by year 29 and spends decades on the edge while the wolves press hard.' },
  { seed: '15', name: 'Thunder herd', blurb: 'The biggest herd of any world: about seventeen hundred bison by year 76.' },
  { seed: '5', name: 'Golden plenty', blurb: 'Bison and pronghorn both thrive: the herd passes fourteen hundred and the pronghorn a thousand.' },
  { seed: '13', name: 'The dry years', blurb: 'Nine droughts in eighty years. Watch the grass, then everything that eats it.' },
  { seed: '27', name: 'Wolf winter', blurb: 'The packs dwindle to about twenty wolves around year 30 before they rebuild.' },
  { seed: '25', name: "Pronghorn's last stand", blurb: 'The pronghorn fall to about twenty animals in year 54, then boom past a thousand within a decade.' },
  { seed: '10', name: 'Steady valley', blurb: 'The calmest world: gentle swings, a good place to start.' },
];
