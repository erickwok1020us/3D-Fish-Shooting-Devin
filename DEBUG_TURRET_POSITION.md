# DEBUG: Turret & Fish Tank Position Analysis

## 1. Default Turret vs 1x Turret -- Same Object or Different?

**Answer: They are the SAME object.**

There is no separate "default turret". At game start:
1. `gameState.currentWeapon = '1x'` (game.js line 1093)
2. `createCannon()` builds ONE turret structure
3. It immediately calls `buildCannonGeometryForWeapon('1x')` to load the 1x weapon model
4. The muzzle is initialized from `WEAPON_GLB_CONFIG.weapons['1x']`

When switching weapons, only the **barrel model** (`cannonBarrel`) and **muzzle position** (`cannonMuzzle`) are swapped. The turret base (`cannonGroup`), pitch pivot (`cannonPitchGroup`), platform mesh, and sci-fi ring all stay in place.

---

## 2. Scene Hierarchy (Single Turret Object Tree)

```
scene
 +-- cannonGroup (THREE.Group)                    <-- ROOT turret object
     +-- platform (Mesh, CylinderGeometry)         local pos: (0, 5, 0)
     +-- cannonBaseRingCore (Mesh, RingGeometry)    local pos: (0, 3, 0)
     +-- cannonBaseRingGlow (Mesh, RingGeometry)    local pos: (0, 2, 0)
     +-- cannonBaseRingInnerDisk (Mesh, Circle)     local pos: (0, 14.5, 0)
     +-- cannonPointLight (PointLight)              local pos: (0, 50, 0)
     +-- cannonFrontLight (PointLight)              local pos: (0, 30, 100)
     +-- cannonPitchGroup (THREE.Group)             local pos: (0, 25, 0)   <-- pitch rotation pivot (UNIFIED)
         +-- cannonBodyGroup (THREE.Group)           local pos: (0, 0, 0)
         |   +-- cannonBarrel (Mesh or GLB model)    local pos: (0, 25, 0) <-- UNIFIED for all weapons
         +-- cannonMuzzle (THREE.Object3D)           local pos: muzzleOffset <-- VARIES BY WEAPON
```

---

## 3. cannonGroup Position & Scale

| Property | Value | Source |
|----------|-------|--------|
| cannonGroup.position | **(0, -337.5, -500)** | `cannonGroup.position.set(0, CANNON_BASE_Y, -CANNON_RING_RADIUS_Z)` |
| CANNON_BASE_Y | **-337.5** | const definition |
| CANNON_RING_RADIUS_Z | **500** | const definition |
| cannonGroup.scale | **(1.2, 1.2, 1.2)** | `cannonGroup.scale.set(1.2, 1.2, 1.2)` |

---

## 4. Per-Weapon Barrel & Muzzle Positions (AFTER unification)

### cannonYOffset -- NOW UNIFIED to 25

| Weapon | cannonYOffset (local) | Status |
|--------|----------------------|--------|
| **1x** | **25** | was 35, changed to 25 |
| **3x** | **25** | was 20, changed to 25 |
| **5x** | **25** | was 20, changed to 25 |
| **8x** | **25** | was 20, changed to 25 |

### cannonPitchGroup.position.y -- NOW 25 (was 35)

Changed to match the unified cannonYOffset for consistency.

### muzzleOffset (muzzle local position inside cannonPitchGroup)

| Weapon | muzzleOffset (local XYZ) |
|--------|--------------------------|
| **1x** | **(0, 30, 55)** |
| **3x** | **(0, 30, 60)** |
| **5x** | **(0, 30, 65)** |
| **8x** | **(0, 30, 50)** |

---

## 5. World Coordinate Calculation (AFTER unification)

World position = cannonGroup.position + (local position chain) * cannonGroup.scale(1.2)

### cannonPitchGroup World Position
- Local: (0, 25, 0) relative to cannonGroup
- **World: (0, -337.5 + 25*1.2, -500) = (0, -307.5, -500)**

### cannonBarrel World Position (ALL weapons identical now)

| Weapon | Local chain (pitchGroup.y + barrelYOffset) | World Y |
|--------|-------------------------------------------|---------|
| **ALL** | 25 + 25 = 50 | -337.5 + 50*1.2 = **-277.5** |

### cannonMuzzle World Position

| Weapon | Local Y chain (pitchGroup.y + muzzle.y) | World Y | Local Z (muzzle.z) | World Z |
|--------|----------------------------------------|---------|---------------------|---------|
| **1x** | 25 + 30 = 55 | -337.5 + 55*1.2 = **-271.5** | 55 | -500 + 55*1.2 = **-434** |
| **3x** | 25 + 30 = 55 | **-271.5** | 60 | -500 + 60*1.2 = **-428** |
| **5x** | 25 + 30 = 55 | **-271.5** | 65 | -500 + 65*1.2 = **-422** |
| **8x** | 25 + 30 = 55 | **-271.5** | 50 | -500 + 50*1.2 = **-440** |

---

## 6. Fish Tank (Aquarium) Dimensions

| Property | Value | Source |
|----------|-------|--------|
| width (X axis) | **1800** | CONFIG.aquarium |
| height (Y axis) | **900** | CONFIG.aquarium |
| depth (Z axis) | **1200** | CONFIG.aquarium |
| floorY (bottom) | **-450** | CONFIG.aquarium |
| **topY (top)** | **-450 + 900 = 450** | calculated |
| **centerY** | **0** | calculated |

### Fish Activity Area (spawn bounds)

From `getRandomFishPositionIn3DSpace()`:

| Property | Value | Calculation |
|----------|-------|-------------|
| Fish minY | **-170** | cannonY(-420) + 250 = -170 |
| Fish maxY | **250** | floorY(-450) + height(900) - marginY(200) = 250 |
| Fish minX | **-600** | -width/2 + marginX = -900 + 300 |
| Fish maxX | **600** | width/2 - marginX = 900 - 300 |
| Fish minZ | **-300** | -depth/2 + marginZ = -600 + 300 |
| Fish maxZ | **300** | depth/2 - marginZ = 600 - 300 |

### Depth Bands

| Band | Y Range | Description |
|------|---------|-------------|
| surface | 100 to 350 | Flying fish, mahi-mahi |
| midWater | -100 to 150 | Medium predators |
| reef | -280 to -50 | Coral reef fish, small schooling |
| bottom | -350 to -150 | Grouper, seahorse |
| fullColumn | -300 to 300 | Large predators |

---

## 7. Turret Position Relative to Fish Tank (AFTER unification)

```
Y=450  +-------- Tank Top ---------+
       |                           |
Y=350  |  .... surface band ....   |
       |                           |
Y=250  |  ---- fish maxY ------   |
       |                           |
Y=150  |  .... midWater .....     |
       |                           |
Y=0    |  ====== Tank Center ===  |
       |                           |
Y=-50  |  .... reef band .....    |
       |                           |
Y=-170 |  ---- fish minY ------   |
       |                           |
Y=-271 |  * ALL muzzles world Y   |  <-- unified
Y=-277 |  * ALL barrels world Y   |  <-- unified (cannonYOffset=25)
Y=-307 |  o cannonPitchGroup Y    |
Y=-337 |  # cannonGroup base Y    |  <-- CANNON_BASE_Y
       |                           |
Y=-450 +-------- Tank Floor -------+
```

### Summary Percentages (from tank bottom Y=-450 to top Y=450, range=900)

| Object | World Y | % from bottom |
|--------|---------|---------------|
| Tank top | 450 | 100% |
| Fish maxY | 250 | 77.8% |
| Tank center | 0 | 50% |
| Fish minY | -170 | 31.1% |
| **ALL barrels (unified)** | **-277.5** | **19.2%** |
| **ALL muzzles** | **-271.5** | **19.8%** |
| cannonPitchGroup | -307.5 | 15.8% |
| cannonGroup base | -337.5 | 12.5% |
| Tank floor | -450 | 0% |

---

## 8. Bug Analysis: "Pressing 1 to switch back to 1x causes sinking"

### Root Cause: TWO bugs found

**Bug A: Scale reset from 1.2 to 1.0 on weapon switch**

- `createCannon()` sets `cannonGroup.scale.set(1.2, 1.2, 1.2)`
- `playWeaponSwitchAnimation()` used `const baseScale = 1.0`
- After bounce animation (100ms), scale was restored to `(1.0, 1.0, 1.0)` instead of `(1.2, 1.2, 1.2)`
- This made the ENTIRE cannon 20% smaller after ANY weapon switch
- Effect: cannon appears to "shrink" and "sink" because all local offsets are multiplied by a smaller scale

**Bug B: Inconsistent cannonYOffset between weapons**

- 1x had `cannonYOffset: 35`, all others had `cannonYOffset: 20`
- When switching from 1x to another weapon, the barrel dropped 15 local units (18 world units)
- When switching from another weapon BACK to 1x, the barrel jumped up 15 local units
- Combined with Bug A, switching to 1x showed both the scale shrink AND a barrel position change

### Fixes Applied

| Bug | Before | After | Location |
|-----|--------|-------|----------|
| Scale reset | `baseScale = 1.0` | `baseScale = 1.2` | `playWeaponSwitchAnimation()` |
| 1x cannonYOffset | `35` | `25` | WEAPON_CONFIG['1x'] |
| 3x cannonYOffset | `20` | `25` | WEAPON_CONFIG['3x'] |
| 5x cannonYOffset | `20` | `25` | WEAPON_CONFIG['5x'] |
| 8x cannonYOffset | `20` | `25` | WEAPON_CONFIG['8x'] |
| cannonPitchGroup.y | `35` | `25` | createCannon() |
| 3x procedural barrel | `barrelGroup.position.y = 20` | `= 25` | buildCannonGeometryForWeapon() |
| Non-player cannon Y | hardcoded `20` | reads from config (default 25) | createStaticCannon() |

### Expected Console Logs (after fix)

**On game init:**
```
[TURRET-DEBUG][INIT] createCannon() complete: {
  cannonGroup_pos: [0, -337.5, -500],
  cannonGroup_scale: [1.2, 1.2, 1.2],
  cannonGroup_rot: [0, 0, 0],
  pitchGroup_pos: [0, 25, 0],
  pitchGroup_rot: [0, 0, 0],
  barrel_pos: [0, 25, 0],
  muzzle_pos: [0, 30, 55],
  weapon: '1x'
}
```

**On pressing "1" to switch to 1x:**
```
[TURRET-DEBUG][SWITCH] selectWeapon(1x) complete: {
  cannonGroup_pos: [0, -337.5, -500],
  cannonGroup_scale: [1.08, 1.32, 1.08],   // mid-bounce, restores to [1.2, 1.2, 1.2] after 100ms
  cannonGroup_rot: [0, <current_yaw>, 0],
  pitchGroup_pos: [0, 25, 0],
  pitchGroup_rot: [<current_pitch>, 0, 0],
  barrel_pos: [0, 25, 0],                   // same as init
  muzzle_pos: [0, 30, 55],                  // same as init
  weapon: '1x'
}
```

Both logs should show identical `pitchGroup_pos`, `barrel_pos`, and `muzzle_pos` values. The `cannonGroup_scale` will differ momentarily during the bounce animation but settles to `[1.2, 1.2, 1.2]`.

---

## 9. Fish Tank Height vs Turret Position -- Design Analysis (no changes made)

### Current Layout

- Turret barrel at ~19% from tank bottom
- Fish activity zone at 31%-78% from tank bottom
- Gap between barrel top and fish bottom: ~106 world units (11.8% of tank height)

### Is this a problem?

The current layout is **reasonable for an arcade fish-shooting game** with a bottom-mounted cannon looking upward at fish. However, there are two potential concerns:

1. **Camera angle can feel steep**: Since the cannon is near the floor and fish swim in the upper 50-70% of the tank, the player must aim upward most of the time. This can make the FPS camera feel like it's always looking up.

2. **Bottom-dwelling fish are close to cannon**: The "bottom" depth band (Y=-350 to -150) overlaps with the cannon barrel's Y range (-277.5). Fish in the bottom band may swim very close to or at the same height as the barrel, creating awkward close-range encounters.

### Improvement Suggestions (NOT implemented, for reference only)

**Option A: Raise cannon by ~100 units**
- Change `CANNON_BASE_Y` from -337.5 to -237.5
- This moves the barrel from Y=-277.5 to Y=-177.5 (closer to fish minY=-170)
- Effect: less steep aiming angle, fish feel more "in front of" rather than "above" the cannon
- Risk: cannon may look like it's floating if not visually anchored

**Option B: Lower fish spawn area by ~50 units**
- Change fish minY from -170 to -220 (by adjusting the margin from 250 to 200)
- Effect: more fish at eye-level, denser shooting feel
- Risk: fish may clip into the cannon platform visually
