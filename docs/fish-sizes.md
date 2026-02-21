# Fish Species Data & Collider Sizes

## Fish Species Table

| Species | Form | Category | HP | Speed Min | Speed Max | Reward | Size | Count | School Size | Pattern |
|---|---|---|---|---|---|---|---|---|---|---|
| Blue Whale | whale | largePredator | 800 | 20 | 42 | 500 | 140 | 1 | 1-2 | cruise |
| Killer Whale | killerWhale | largePredator | 700 | 50 | 88 | 450 | 120 | 1 | 2-4 | burstAttack |
| Great White Shark | shark | largePredator | 600 | 65 | 188 | 400 | 100 | 1 | 1-1 | burstAttack |
| Marlin | marlin | largePredator | 400 | 110 | 310 | 300 | 80 | 2 | 1-2 | burstSprint |
| Hammerhead Shark | hammerhead | largePredator | 450 | 56 | 110 | 300 | 85 | 3 | 3-8 | sShape |
| Yellowfin Tuna | tuna | mediumLarge | 200 | 75 | 138 | 220 | 50 | 6 | 6-15 | synchronizedFast |
| Mahi-Mahi | dolphinfish | mediumLarge | 160 | 69 | 125 | 180 | 45 | 5 | 3-8 | irregularTurns |
| Grouper | grouper | mediumLarge | 250 | 19 | 56 | 200 | 60 | 3 | 1-1 | bottomBurst |
| Parrotfish | parrotfish | reefFish | 120 | 38 | 69 | 140 | 35 | 6 | 3-6 | stopAndGo |
| Angelfish | angelfish | reefFish | 90 | 31 | 63 | 110 | 30 | 8 | 2-4 | elegantGlide |
| Lionfish | lionfish | reefFish | 80 | 25 | 56 | 100 | 28 | 8 | 1-2 | ambush |
| Blue Tang | tang | reefFish | 60 | 40 | 70 | 80 | 20 | 12 | 5-12 | groupCoordination |
| Sardine | sardine | smallSchool | 20 | 45 | 70 | 30 | 10 | 15 | 20-40 | waveFormation |
| Anchovy | anchovy | smallSchool | 15 | 50 | 85 | 25 | 8 | 15 | 25-45 | baitBall |
| Clownfish | clownfish | smallSchool | 50 | 20 | 40 | 70 | 15 | 6 | 2-3 | territorial |
| Damselfish | damselfish | smallSchool | 40 | 35 | 60 | 55 | 12 | 12 | 3-6 | defensiveCharge |
| Manta Ray | mantaRay | specialForm | 350 | 50 | 88 | 280 | 90 | 2 | 1-2 | wingGlide |
| Pufferfish | pufferfish | specialForm | 100 | 13 | 38 | 120 | 25 | 4 | 1-1 | slowRotation |
| Seahorse | seahorse | specialForm | 80 | 10 | 25 | 130 | 20 | 4 | 1-2 | verticalDrift |

## Boids / Schooling Strength

| Species | boidsStrength | maxTurnRate | Notes |
|---|---|---|---|
| Blue Whale | 0.1 | 0.3 | Almost no schooling, mother-calf only |
| Killer Whale | 1.8 | 0.6 | Strong pod coordination |
| Great White Shark | 0 | 0.8 | Strictly solitary |
| Marlin | 0 | 0.6 | Strictly solitary, slow turning at high speed |
| Hammerhead Shark | 1.5 | 0.7 | School by day (unique among sharks) |
| Yellowfin Tuna | 2.0 | - | Tight synchronized schooling |
| Mahi-Mahi | 1.0 | - | Loose schooling |
| Grouper | 0 | - | Strictly solitary and territorial |
| Parrotfish | 1.2 | - | Loose harem grouping |
| Angelfish | 0.8 | - | Paired/small group |
| Lionfish | 0.2 | - | Mostly solitary |
| Blue Tang | 2.0 | - | Strong schooling for grazing |
| Sardine | 3.0 | - | Extremely tight schooling |
| Anchovy | 3.5 | - | Tightest schooling (bait ball) |
| Clownfish | 1.0 | - | Family group stays together |
| Damselfish | 0.8 | - | Loose territorial grouping |
| Manta Ray | 0.3 | - | Mostly solitary, occasional pairs |
| Pufferfish | 0 | - | Strictly solitary |
| Seahorse | 1.2 | - | Monogamous pair bonding |

## Ellipsoid Collider Ratios (FISH_ELLIPSOID_RATIOS)

Half-extents as fraction of the fish `size` value. Actual collider = `size * ratio * glbModelScaleMultiplier`.

`glbModelScaleMultiplier` = 3.0

| Form | X (length) | Y (height) | Z (width) | Notes |
|---|---|---|---|---|
| whale | 0.55 | 0.34 | 0.34 | Long body, round cross-section |
| killerWhale | 0.50 | 0.32 | 0.32 | Slightly shorter than whale |
| shark | 0.55 | 0.30 | 0.30 | Torpedo shape |
| marlin | 0.58 | 0.26 | 0.26 | Longest, thinnest body |
| hammerhead | 0.56 | 0.32 | 0.54 | Wide Z for hammer-shaped head |
| tuna | 0.48 | 0.30 | 0.30 | Compact torpedo |
| dolphinfish | 0.48 | 0.30 | 0.30 | Same as tuna |
| pufferfish | 0.42 | 0.42 | 0.42 | Spherical (equal all axes) |
| grouper | 0.46 | 0.36 | 0.36 | Thick body |
| parrotfish | 0.50 | 0.40 | 0.36 | Slightly tall |
| angelfish | 0.42 | 0.50 | 0.30 | Tall and flat (disc body) |
| lionfish | 0.46 | 0.44 | 0.44 | Bulky with spines |
| tang | 0.48 | 0.50 | 0.36 | Tall oval, flat |
| sardine | 0.64 | 0.38 | 0.38 | Very elongated |
| anchovy | 0.64 | 0.38 | 0.38 | Same as sardine |
| clownfish | 0.52 | 0.46 | 0.38 | Oval body |
| damselfish | 0.52 | 0.46 | 0.38 | Same as clownfish |
| mantaRay | 0.38 | 0.22 | 0.54 | Widest Z (wing span), very flat Y |
| seahorse | 0.34 | 0.58 | 0.36 | Tallest Y (vertical posture) |
| crab | 0.38 | 0.34 | 0.44 | Wide, low profile |
| eel | 0.66 | 0.32 | 0.32 | Longest body |
| turtle | 0.44 | 0.36 | 0.48 | Wide shell |
| goldfish | 0.48 | 0.46 | 0.38 | Round body |
| standard | 0.42 | 0.30 | 0.30 | Default fallback |

## Collider Size Examples

Actual half-extent = `size * ratio * 3.0`

| Species | Size | X half | Y half | Z half |
|---|---|---|---|---|
| Blue Whale | 140 | 231 | 142.8 | 142.8 |
| Great White Shark | 100 | 165 | 90 | 90 |
| Marlin | 80 | 139.2 | 62.4 | 62.4 |
| Yellowfin Tuna | 50 | 72 | 45 | 45 |
| Sardine | 10 | 19.2 | 11.4 | 11.4 |
| Anchovy | 8 | 15.36 | 9.12 | 9.12 |
| Manta Ray | 90 | 102.6 | 59.4 | 145.8 |
| Seahorse | 20 | 20.4 | 34.8 | 21.6 |

---

*Source: `game.js` lines 847-1061 (fishTiers), 2536-2561 (FISH_ELLIPSOID_RATIOS)*
