# Bug Log & Improvement Suggestions

## Known Bugs

### 1. 8x Non-Player Cannon GLB Path Double Extension
- **Phenomenon**: The 8x non-player cannon model filename has `.glb.glb` double extension
- **Possible Cause**: Typo in asset naming — `8x 武器模組(非玩家).glb.glb` should likely be `8x 武器模組(非玩家).glb`
- **Reproduction**: Switch to 8x weapon in multiplayer; observe non-player cannon model may fail to load
- **Location**: `WEAPON_CONFIG['8x'].glbCannonNonPlayer` (game.js ~line 658)

### 2. Auto-fire Lead Prediction Inaccurate for Fast Fish
- **Phenomenon**: Auto-fire bullets sometimes miss fast-moving fish (especially barracuda/marlin at max speed)
- **Possible Cause**: Lead prediction uses single-step linear extrapolation (`dist / speed * velocity`). For fast fish with curved paths, this undershoots.
- **Reproduction**: Enable AUTO mode with 1x weapon; observe misses on fast fish swimming at oblique angles
- **Location**: `TargetingService.tick()` lead prediction block (game.js ~line 11178-11182)

### 3. Muzzle Flash Position Drift on Rapid Weapon Switch
- **Phenomenon**: If player switches weapons rapidly while auto-firing, muzzle flash can appear at the old cannon's muzzle position for 1 frame
- **Possible Cause**: `cannonMuzzle` reference updates after the weapon model swap completes, but fire events can trigger during the swap frame
- **Reproduction**: Rapidly press 1-2-3-4 while auto-fire is on
- **Location**: `autoFireAtFish()` muzzle position read (game.js ~line 11284)

### 4. Coin Fly-Back Animation Occasionally Targets Wrong Y Position
- **Phenomenon**: Coins sometimes fly to a slightly wrong Y offset after the 4s hover period
- **Possible Cause**: Cannon Y offset differs per weapon, but coin target is captured at spawn time rather than fly-back time
- **Reproduction**: Kill a fish with 1x, quickly switch to 8x before coins fly back
- **Location**: Coin animation system (search `coinFlyBack` in game.js)

---

## Experience Optimization Suggestions (NOT to be implemented now)

### 1. Iterative Lead Prediction for Auto-fire
Replace single-step linear lead with 2-3 iteration convergence loop. Each iteration refines the flight time estimate using the updated aim point, producing significantly better accuracy for fast/curved targets.

### 2. Weapon-Specific Targeting Strategy
Allow each weapon to define its own targeting preference via `WEAPON_CONFIG`. For example, 8x laser could prefer highest-value fish, while 1x prefers nearest. This would be a `targetStrategy` field: `'nearest'`, `'highestValue'`, `'lowestHP'`.

### 3. Object Pooling for THREE.Vector3 in TargetingService
`TargetingService.tick()` and `findNearest()` still allocate `new THREE.Vector3()` per frame. Pre-allocating temp vectors (like `fireBulletTempVectors` pattern already used elsewhere) would reduce GC pressure.

### 4. Config Hot-Reload for Tuning
Add a debug panel that exposes `WEAPON_CONFIG` and `TargetingService.config` values as editable sliders. This would allow real-time tuning without code changes or page reload.

### 5. Sound Preload Verification
Add a startup check that verifies all weapon MP3 sounds loaded successfully, and logs which ones fell back to synthesized. Currently silent fallback makes it hard to diagnose missing audio assets.
