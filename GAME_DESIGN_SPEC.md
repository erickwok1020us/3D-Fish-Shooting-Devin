# 3D Fish Shooting Game - Complete Design Specification

## Overview
This document serves as the Single Source of Truth for the 3D Fish Shooting Game. It contains all game mechanics, systems, and specifications needed to recreate the game.

---

## 1. Weapon System

### Weapon RTP (Return to Player) Values
| Weapon | Cost (USDT) | RTP | Type | Description |
|--------|-------------|-----|------|-------------|
| 1x | 1 | 91% | Projectile | Standard single-target bullet |
| 3x | 3 | 92% | Spread | Shotgun effect - 3 bullets in fan pattern |
| 5x | 5 | 93% | Chain | Chain lightning - jumps to nearby fish |
| 8x | 8 | 94% | AOE | Area explosion - damages fish in radius |
| 20x | 200 | 97% | Piercing Laser | Penetrates up to 5 fish |

### 20x Piercing Laser Weapon Specification
- **Visual Effect**: Blue-white energy beam with electric arc effects
- **Color**: `0x88ccff` (blue-white), Glow: `0x00aaff` (electric blue)
- **Mechanism**: Penetrates up to 5 fish in a line
- **Damage Pattern**:
  - 1st fish: 100% damage (500)
  - 2nd fish: 80% damage (400)
  - 3rd fish: 60% damage (300)
  - 4th fish: 40% damage (200)
  - 5th fish: 20% damage (100)
- **Cost**: 200 USDT per shot
- **Fire Rate**: 0.5 shots/second (2 second cooldown)
- **Speed**: 1200 units/second

### Weapon Configuration Code Reference
```javascript
weapons: {
    '1x': { multiplier: 1, cost: 1, rtp: 0.91, type: 'projectile' },
    '3x': { multiplier: 3, cost: 3, rtp: 0.92, type: 'spread' },
    '5x': { multiplier: 5, cost: 5, rtp: 0.93, type: 'chain' },
    '8x': { multiplier: 8, cost: 8, rtp: 0.94, type: 'aoe' },
    '20x': { 
        multiplier: 20, cost: 200, rtp: 0.97, 
        type: 'piercingLaser',
        maxPenetrations: 5,
        penetrationDamageDecay: [1.0, 0.8, 0.6, 0.4, 0.2]
    }
}
```

---

## 2. Fish Value System (6 Tiers)

### Tier Overview
| Tier | Category | Point Value | Spawn Rate | Description |
|------|----------|-------------|------------|-------------|
| 1 | Small | 2-3 points | 40% | Fast, numerous, easy targets |
| 2 | Normal | 5-8 points | 30% | Standard fish, moderate HP |
| 3 | Medium | 10-15 points | 15% | Colorful reef fish |
| 4 | Large | 20-30 points | 10% | Big fish, high HP |
| 5 | Rare | 40-60 points | 4% | Special fish, valuable |
| 6 | Boss | 100-200 points | 1% | Special event only |

### Tier 1: Small Fish (40% spawn rate)
| Variant | HP | Speed | Reward | Size | Form |
|---------|-----|-------|--------|------|------|
| Anchovy | 10 | 90-140 | 2 | 8 | anchovy |
| Sardine | 12 | 80-120 | 2 | 10 | sardine |
| Damselfish | 15 | 55-90 | 3 | 12 | damselfish |

### Tier 2: Normal Fish (30% spawn rate)
| Variant | HP | Speed | Reward | Size | Form |
|---------|-----|-------|--------|------|------|
| Clownfish | 30 | 30-55 | 5 | 15 | clownfish |
| Blue Tang | 35 | 50-85 | 6 | 20 | tang |
| Butterflyfish | 40 | 45-80 | 8 | 22 | butterflyfish |

### Tier 3: Medium Fish (15% spawn rate)
| Variant | HP | Speed | Reward | Size | Form |
|---------|-----|-------|--------|------|------|
| Angelfish | 60 | 35-60 | 10 | 30 | angelfish |
| Parrotfish | 70 | 40-70 | 12 | 35 | parrotfish |
| Pufferfish | 80 | 20-40 | 15 | 25 | pufferfish |

### Tier 4: Large Fish (10% spawn rate)
| Variant | HP | Speed | Reward | Size | Form |
|---------|-----|-------|--------|------|------|
| Grouper | 150 | 25-60 | 20 | 60 | grouper |
| Barracuda | 120 | 30-180 | 25 | 55 | barracuda |
| Yellowfin Tuna | 140 | 80-140 | 30 | 50 | tuna |

### Tier 5: Rare Fish (4% spawn rate)
| Variant | HP | Speed | Reward | Size | Form | Special |
|---------|-----|-------|--------|------|------|---------|
| Seahorse | 100 | 15-30 | 40 | 20 | seahorse | - |
| Flying Fish | 90 | 100-180 | 50 | 18 | flyingFish | - |
| Gold Fish | 80 | 60-100 | 60 | 25 | goldfish | Bonus coins |

### Tier 6: Boss Fish (1% - Special Event)
| Variant | HP | Speed | Reward | Size | Form |
|---------|-----|-------|--------|------|------|
| Blue Whale | 800 | 20-35 | 200 | 140 | whale |
| Great White Shark | 600 | 60-120 | 150 | 100 | shark |
| Manta Ray | 500 | 40-70 | 120 | 90 | mantaRay |
| Marlin | 450 | 100-200 | 100 | 80 | marlin |
| Hammerhead Shark | 550 | 50-90 | 130 | 85 | hammerhead |

### Special Ability Fish
| Fish | HP | Reward | Ability | Effect |
|------|-----|--------|---------|--------|
| Bomb Crab | 100 | 25 | Explosion | 300 damage in 200 radius on death |
| Electric Eel | 120 | 30 | Lightning | Chain 4 times, 150 damage, 60% decay |
| Shield Turtle | 80 | 20 | Shield | 150 HP shield must be broken first |

---

## 3. Fish Respawn & Density Balance System

### Base Parameters
```javascript
FISH_SPAWN_CONFIG = {
    targetCount: 50,        // Target fish on screen
    minCount: 40,           // Minimum before emergency spawn
    maxCount: 60,           // Maximum fish count
    emergencyRefillTarget: 45,  // Refill to this during emergency
    autoPlayMaxRefill: 55   // Max during 20x auto-play
}
```

### Respawn Logic
1. **Normal State** (fish >= 50): Slow respawn, 2x normal interval
2. **Below Target** (40 <= fish < 50): Normal respawn rate
3. **Emergency** (fish < 40): Immediate batch spawn to 45 fish

### Weapon-Adaptive Respawn Rates
| Weapon | Respawn Delay | Notes |
|--------|---------------|-------|
| 1x-3x | 1.0-2.0 seconds | Normal speed |
| 5x-8x | 0.5-1.0 seconds | Fast respawn |
| 20x Laser | 0.2-0.5 seconds | Fastest respawn |

### 20x Auto-Play Special Rules
- Respawn count = number of fish killed by laser
- Maximum refill to 55 fish
- Batch respawn with 2 second cooldown

### Anti-Overflow Protection
- Maximum 10 fish per single respawn batch
- 2 second cooldown between batch spawns

---

## 4. RTP Calculation Formula

### Basic RTP Formula
```
RTP = (Total Wins / Total Bets) * 100%
```

### Kill Rate Calculation
```
Kill Rate = Target RTP / Fish Reward Multiplier
```

### Example Calculations
| Weapon | RTP | Fish Reward | Kill Rate |
|--------|-----|-------------|-----------|
| 1x | 91% | 2 points | 45.5% |
| 3x | 92% | 5 points | 18.4% |
| 5x | 93% | 10 points | 9.3% |
| 8x | 94% | 20 points | 4.7% |
| 20x | 97% | 50 points | 1.94% |

### RTP Bounds
- Minimum RTP: 88%
- Maximum RTP: 96%
- Target Range: 91-97% (based on weapon)

---

## 5. Visual & Audio Specifications

### 20x Piercing Laser Visual Effects
- **Beam Color**: Blue-white (`0x88ccff`)
- **Glow Color**: Electric blue (`0x00aaff`)
- **Cannon Color**: `0x4488ff`
- **Cannon Emissive**: `0x00ccff`
- **Hit Effect**: Lightning burst + screen shake
- **Screen Flash**: Blue-white (`0x88ccff`, 15% opacity)

### Fish Tier Visual Indicators
- Tier 1-2: Standard fish models
- Tier 3-4: Larger models with enhanced colors
- Tier 5: Golden/special glow effects
- Tier 6 (Boss): Massive models with particle effects

---

## 6. Technical Implementation Notes

### File Structure
- `game.js` - Main game logic (9000+ lines)
- `multiplayer.js` - Multiplayer networking
- `index.html` - Entry point

### Key Constants Location
- Weapon config: `CONFIG.weapons` (lines 249-297)
- Fish tiers: `CONFIG.fishTiers` (lines 69-260)
- Spawn rates: `CONFIG.fishSpawnRates` (lines 60-67)
- Respawn config: `FISH_SPAWN_CONFIG` (lines 5967-5990)

### Multiplayer Considerations
- Fish spawning handled by server in multiplayer mode
- Single-player uses local dynamic spawn system
- Boss fish spawn during special events only

---

## Version History
- **v1.0**: Initial 6-tier fish system, weapon RTP updates, piercing laser
- **Date**: December 2025

---

*This document is the Single Source of Truth for game development. Any AI or developer should be able to recreate the game using these specifications.*
