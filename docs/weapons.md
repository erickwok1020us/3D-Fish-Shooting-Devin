# Weapon Data & Auto-Fire Logic

## Weapon Configuration

| Property | 1x | 3x | 5x | 8x |
|---|---|---|---|---|
| **Multiplier** | 1 | 3 | 5 | 8 |
| **Cost per shot** | 1 | 3 | 5 | 8 |
| **Damage** | 100 | 100 | 200 | 350 |
| **Shots/sec** | 2.5 | 2.5 | 2.5 | 1.0 |
| **Type** | projectile | spread | rocket | laser |
| **Speed** | 2000 | 2000 | 2000 | 0 (hitscan) |
| **Piercing** | No | No | No | Yes |
| **Spread angle** | 0 | 15 | 0 | 0 |
| **AOE radius** | 0 | 0 | 120 | 0 |
| **AOE edge damage** | 0 | 0 | 80 | 0 |
| **Laser width** | 0 | 0 | 0 | 8 |
| **Convergence dist** | 1400 | 1400 | 1400 | 1400 |
| **Charge time (s)** | 0 | 0 | 0.2 | 0.3 |
| **Recoil strength** | 5 | 8 | 12 | 15 |
| **Screen shake on hit** | 0.5 | 1.0 | 1.5 | 3 |
| **Sound volume** | 1.0 | 1.0 | 1.0 | 0.5 |
| **Fire screen shake** | 0/0 | 0/0 | 0/0 | 6/200ms |

## GLB Assets

| Weapon | Cannon GLB | Bullet GLB | Hit Effect GLB |
|---|---|---|---|
| 1x | `1x 武器模組` | `1x 子彈模組` | `1x 擊中特效` |
| 3x | `3x 武器模組` | `1x 子彈模組` | `3x 擊中特效` |
| 5x | `5x 武器模組` | `5x 子彈模組` | `5x 擊中特效` |
| 8x | `8x 武器模組` | `8x 子彈模組` | `8x 擊中特效` |

## Visual Properties

| Weapon | Scale | Bullet Scale | Hit Effect Scale | Emissive Boost | Cannon Y Offset | Muzzle Offset (x,y,z) |
|---|---|---|---|---|---|---|
| 1x | 1.0 | 0.5 | 0.6 | 0.4 | 40 | 0, 49, 55 |
| 3x | 1.1 | 0.6 | 0.7 | 0.4 | 25 | 0, 30, 60 |
| 5x | 1.3 | 0.7 | 0.9 | 0.4 | 25 | 0, 30, 65 |
| 8x | 1.0 | 0.9 | 1.2 | 0.3 | 25 | 0, 30, 50 |

## RTP (Return to Player)

| Weapon | Entertainment | Real |
|---|---|---|
| 1x | 91% | 91% |
| 3x | 93% | 93% |
| 5x | 94% | 94% |
| 8x | 95% | 95% |

## Hit Paths by Weapon

| Weapon | Type | Hit Detection | Damage Application |
|---|---|---|---|
| 1x | Single projectile | Ellipsoid collision per bullet | `fish.takeDamage(damage, weaponKey)` |
| 3x | 3-bullet spread | Ellipsoid collision per bullet (3 spread indices) | `fish.takeDamage(damage, weaponKey, spreadIndex)` |
| 5x | Rocket + AOE | Projectile hit triggers `triggerExplosion()` | Non-MP: `fish.hp -= damage` + `fish.flashHit()`; MP: `fish.takeDamage()` |
| 8x | Hitscan laser | Ray-ellipsoid intersection on all fish in beam path | Non-MP: `fish.hp -= damage` + `fish.flashHit()`; MP: `fish.takeDamage()` |

## Auto-Fire (TargetingService)

### Configuration

| Parameter | Value | Description |
|---|---|---|
| `yawLimit` | 46.75 deg | Max horizontal aim angle from center |
| `pitchMax` | 42.5 deg | Max upward aim angle |
| `pitchMin` | -29.75 deg | Max downward aim angle |
| `trackSpeed` | 22.0 | Exponential smoothing speed |
| `maxRotSpeed` | 2.0 rad/s | Maximum rotation speed per frame |
| `initialLockMs` | 250 ms | Time to lock onto first target |
| `transitionMs` | 200 ms | Time to transition between targets |

### State Machine

```
idle --> locking --> firing --> transition --> firing
                      |                        |
                      +--- (target dies) -------+
                      |
                      +--- (no targets) --> idle
```

**Phases:**
- `idle` - No target. Scans each tick for nearest valid fish.
- `locking` - Smoothstep interpolation from current angle to target over `initialLockMs`. Cannot fire.
- `firing` - Exponential tracking with `maxRotSpeed` clamp. Can fire every tick.
- `transition` - Target died or boss appeared. Smoothstep to new target over `transitionMs`. Cannot fire until complete.

### Target Selection Priority

1. **Boss fish** always take priority when `gameState.bossActive` is true.
2. Among non-boss fish, nearest fish (squared distance) is selected.
3. **Hysteresis**: Current locked target distance is multiplied by 0.85 to prevent jitter switching.
4. If current target dies, the system picks the next nearest fish (primary or fallback).

### Lead Prediction

When the weapon has `speed > 0` (projectile weapons), the system predicts where the fish will be:
```
aimPos = fishPos + fishVelocity * (distance / bulletSpeed)
```
This does not apply to 8x laser (speed = 0, hitscan).

### Cannon Rotation

After computing the desired yaw/pitch, the system directly sets:
- `cannonGroup.rotation.y = currentYaw`
- `cannonPitchGroup.rotation.x = -currentPitch`

### Fire Rate

Auto-fire uses the same `shotsPerSecond` from `WEAPON_CONFIG`:
- 1x/3x/5x: 2.5 shots/sec (400ms cooldown)
- 8x: 1.0 shot/sec (1000ms cooldown)

---

*Source: `game.js` lines 585-706 (WEAPON_CONFIG), 11214-11413 (TargetingService)*
