# Ecology truth table: DRAFT, not verified (S2, 11/12/2026)

Status: a first web pass by the scout (Haiku) from search-result snippets only. **No value here has been checked against
the source paper.** Nothing in `tools/gates.py` uses these numbers yet. Next step (S2 in `_PLAN.md`): open each source,
confirm the number, pick the target ranges (Fable), then wire them into `gates.py` as a report table.

| # | Quantity | Snippet value | Population, place, years | Source | Notes |
|---|---|---|---|---|---|
| 1 | Share of adult bison deaths caused by wolves | not found | | | The key v15 target (today the sim says 4 to 6%). Look in Wood Buffalo (Carbyn, Joly) and Yellowstone bison mortality studies. |
| 1b | Bison share of Yellowstone wolf kills | 18.8 to 22.3% (2022 to 2024); of 2024 bison kills: 30% calves, 9% yearlings, 36% adult females, 19% adult males | Yellowstone northern range | https://www.nps.gov/yell/learn/upload/FINAL-4_7_25-2024-Wolf-Report_compressed.pdf | Kill composition, not share of bison deaths. |
| 2 | Bison change with vs without wolves | not found (Wood Buffalo fell from about 11,000 in 1971 to about 2,300 in 1998: disease plus predation, no wolf-free contrast) | Wood Buffalo NP | https://openpolar.no/Record/crcansciencepubl:10.1139%2Fz05-106 | v15 target "removing wolves changes the bison mean by at least 20%" has no source yet. |
| 3 | Calves per 100 cows | Yellowstone about 44 (long-run 43, high 51); National Bison Range 33 (2008); Konza 62 per 100 mature females | Yellowstone 2017/2019; Montana 2008 to 2010; Konza 2000 to 2017 | https://buffalofieldcampaign.org/images/what-we-do/species-of-conservation-concern/bfc-objections/Geremia-et-al-Status-Report-on-the-Yellowstone-Bison-Population-September-2017.pdf ; https://scholarworks.montana.edu/handle/1/950 ; https://lter.konza.ksu.edu/outreach/BisonFact17.pdf | Best supported item. |
| 4 | Bison adult survival, growth when food-limited vs not | not found | | | |
| 5 | Wolves per 1,000 ungulates; pack size on bison range | not found | | | |
| 6 | Wolf kill rate; bison share where bison are main prey | winter bison 1.6% of kills (Yellowstone); summer intake 8.4 to 4.1 kg per wolf per day | Yellowstone northern range | https://digitalcommons.mtu.edu/michigantech-p/11307 ; https://www.nps.gov/articles/temporal-variation-in-wolf-predation-dynamics.htm | Yellowstone wolves are elk specialists; a bison-prey system (Wood Buffalo) fits the valley better. |
| 7 | Pronghorn fawn survival; coyote share | coyotes up to 79% of fawn predation; fawn survival about 10% (no wolves, many coyotes) vs about 34% (wolves present) | Yellowstone northern range (about 2009); Grand Teton | https://bioone.org/journals/western-north-american-naturalist/volume-69/issue-2/064.069.0207/Predator-Specific-Mortality-of-Pronghorn-on-Yellowstones-Northern-Range/10.3398/064.069.0207.full | |
| 8 | Wolf annual CV; prey to wolf lag | not found as numbers (Isle Royale swings 50 to 14 wolves in two years, disease) | Isle Royale | https://www.michiganpublic.org/environment-science/2015-04-17/wolf-population-on-isle-royale-drops-to-3-lowest-ever-observed-in-57-year-study | |
| 9 | Drought effect on bison | no die-off figure; Wind Cave bison about 16 kg lighter in drought; Henry Mountains density effect stronger in dry years | Wind Cave; Henry Mountains | https://digitalcommons.usu.edu/wild_facpub/2013/ | |
| 10 | Ravens at wolf kills | 48.5% of wolf kills visited by a tagged raven within 7 days | Yellowstone, 69 GPS ravens | https://www.eurekalert.org:443/news-releases/1118990 | |

## Second pass, sources opened (11/12/2026, scout; quotes checked on the page)

- Wood Buffalo NP, field work 1989 to 1996 (Carbyn et al., https://www.bisoncentre.com/resources/resource-library/bison-research/ecology-bison-and-environment/trends-distribution-and-abundance-bison-wood-buffalo-national-park/): "We recorded wolf predation in 25 calves and 2 adult cows during 301 days of field work between 1989 and 1996." About 93% of the recorded wolf kills were calves (our arithmetic; observed kills, not a population death share).
- Yellowstone northern range, about 1995 to 2015 (NPS, https://www.nps.gov/yell/learn/ys-24-1-temporal-variation-in-wolf-predation-dynamics-in-yellowstone-lessons-learned-from-two-decades-of-research.htm): "wolves rarely kill bison during winter (1.6% of wolf kills)"; bison 5% of spring-summer kills; bison 6% (1995 to 2004) then 20% (2005 to 2014) of the biomass wolves acquire in winter; "wolf-killed bison neonates are being increasingly detected".
- Not opened (leads only): Joly and Messier 2004 (Can. J. Zool., doi 10.1139/z04-072, predation plus disease holding Wood Buffalo bison at low density); Prince Albert Sturgeon River herd (Shave et al. 2020; Simon and Fortin 2019: harvest, not predation, the main limit).

**Implication for v15 (lead's reading, for Fable to judge):** in real bison-wolf systems wolves take mostly calves and rarely adults. The v15 target in `_PLAN.md` ("wolves cause 15 to 30% of adult bison deaths") is not supported by these sources; a target on calves (wolves' share of calf deaths, or calves per 100 cows near Yellowstone's 43 to 51) may be both more realistic and a cleaner lever. The question to settle before S3 to S5: what should "predation matters" mean in numbers.
