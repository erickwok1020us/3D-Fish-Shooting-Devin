# Fish Shooting Game - Multiplayer Architecture Design

## Overview

This document outlines the architecture for implementing multiplayer mode in the fish shooting game, supporting 1-4 players with real-time synchronization and future Veral Render integration.

---

## 1. High-Level Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    VIEW LAYER (Per-Player)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │Player 1 │  │Player 2 │  │Player 3 │  │Player 4 │        │
│  │ Camera  │  │ Camera  │  │ Camera  │  │ Camera  │        │
│  │  HUD    │  │  HUD    │  │  HUD    │  │  HUD    │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        └────────────┴─────┬──────┴────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│              NETWORK SYNC LAYER (Interface)                  │
│                          │                                   │
│    ┌─────────────────────┴─────────────────────┐            │
│    │           INetworkSync Interface           │            │
│    │  - sendPlayerAction(action)                │            │
│    │  - onServerEvent(callback)                 │            │
│    │  - onStateSnapshot(callback)               │            │
│    └─────────────────────┬─────────────────────┘            │
│                          │                                   │
│    ┌─────────────┐  ┌────┴────────┐                         │
│    │LocalLoopback│  │VeralRender  │ (Future)                │
│    │Implementation│  │Implementation│                        │
│    └─────────────┘  └─────────────┘                         │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│              CORE SIMULATION LAYER (Authoritative)           │
│                          │                                   │
│    ┌─────────────────────┴─────────────────────┐            │
│    │              GameSession                   │            │
│    │  - Fish[] (id, pos, vel, hp, species)     │            │
│    │  - Players[] (id, cannon, weapon, score)  │            │
│    │  - SeededRNG (deterministic spawns)       │            │
│    │  - step(dt), applyAction(), spawnFish()   │            │
│    └───────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Structures

### 2.1 GameSession (Authoritative State)

```javascript
class GameSession {
    constructor(sessionId, seed) {
        this.sessionId = sessionId;
        this.rng = new SeededRNG(seed);  // Deterministic randomness
        this.players = new Map();         // playerId -> PlayerState
        this.fish = new Map();            // fishId -> FishState
        this.bullets = [];                // Active bullets
        this.nextFishId = 1;
        this.nextBulletId = 1;
        this.gameTime = 0;
        this.bossTimer = 60;
        this.activeBoss = null;
    }
    
    // Core methods
    step(dt) { }                          // Advance simulation
    addPlayer(playerId, slotIndex) { }    // Add player to session
    removePlayer(playerId) { }            // Remove player
    applyPlayerAction(playerId, action) { } // Process player input
    spawnFishWave() { }                   // Spawn fish using seeded RNG
    handleHit(bulletId, fishId, playerId) { } // Process hit
}
```

### 2.2 PlayerState

```javascript
class PlayerState {
    constructor(playerId, slotIndex) {
        this.playerId = playerId;
        this.slotIndex = slotIndex;       // 0-3 cannon position
        this.cannonYaw = 0;
        this.cannonPitch = 0;
        this.weapon = '1x';
        this.balance = 1000;
        this.score = 0;
        this.cooldown = 0;
        this.viewMode = 'third-person';   // 'fps' or 'third-person'
        this.isConnected = true;
    }
}
```

### 2.3 FishState

```javascript
class FishState {
    constructor(id, species, position, velocity) {
        this.id = id;
        this.species = species;           // Fish type from CONFIG
        this.position = position;         // {x, y, z}
        this.velocity = velocity;         // {x, y, z}
        this.hp = CONFIG.fishTiers[species].hp;
        this.maxHp = this.hp;
        this.lastHitBy = null;            // playerId of last hit
        this.damageByPlayer = new Map();  // playerId -> totalDamage
        this.isAlive = true;
    }
}
```

### 2.4 Room System

```javascript
class GameRoom {
    constructor(roomId, hostPlayerId, isPublic = true) {
        this.roomId = roomId;
        this.hostPlayerId = hostPlayerId;
        this.isPublic = isPublic;
        this.maxPlayers = 4;
        this.players = new Map();         // playerId -> {name, slotIndex}
        this.gameSession = null;          // Created when game starts
        this.state = 'lobby';             // 'lobby', 'playing', 'ended'
        this.createdAt = Date.now();
    }
    
    canJoin() {
        return this.players.size < this.maxPlayers && this.state === 'lobby';
    }
    
    getNextSlot() {
        const usedSlots = new Set([...this.players.values()].map(p => p.slotIndex));
        for (let i = 0; i < 4; i++) {
            if (!usedSlots.has(i)) return i;
        }
        return -1;
    }
}
```

---

## 3. Network Sync Interface

### 3.1 INetworkSync Interface

```javascript
// Abstract interface for network synchronization
// Implementations: LocalLoopback (now), VeralRender (future)

const INetworkSync = {
    // Client -> Server
    sendPlayerAction: (action) => {},
    joinRoom: (roomId, playerName) => {},
    leaveRoom: () => {},
    createRoom: (isPublic) => {},
    
    // Server -> Client (callbacks)
    onServerEvent: (callback) => {},      // FishKilled, PlayerJoined, etc.
    onStateSnapshot: (callback) => {},    // Periodic state updates
    onRoomUpdate: (callback) => {},       // Room state changes
};
```

### 3.2 Player Actions (Client -> Server)

```javascript
// Action types sent from client to server
const PlayerActionTypes = {
    SHOOT: 'shoot',           // {weaponType, origin, direction, timestamp}
    CHANGE_WEAPON: 'weapon',  // {weaponType}
    ROTATE_CANNON: 'rotate',  // {yaw, pitch}
    TOGGLE_VIEW: 'view',      // {viewMode}
    CENTER_VIEW: 'center',    // {}
};
```

### 3.3 Server Events (Server -> Client)

```javascript
// Event types sent from server to clients
const ServerEventTypes = {
    // Game events
    FISH_SPAWNED: 'fish_spawned',     // {fish[]}
    FISH_HIT: 'fish_hit',             // {fishId, damage, newHp, byPlayerId}
    FISH_KILLED: 'fish_killed',       // {fishId, killedBy, reward}
    BULLET_FIRED: 'bullet_fired',     // {bulletId, playerId, origin, direction}
    BOSS_SPAWNED: 'boss_spawned',     // {bossData}
    BOSS_KILLED: 'boss_killed',       // {bossId, killedBy, rewards}
    
    // Player events
    PLAYER_JOINED: 'player_joined',   // {playerId, name, slotIndex}
    PLAYER_LEFT: 'player_left',       // {playerId}
    PLAYER_SCORE: 'player_score',     // {playerId, score, balance}
    
    // Room events
    ROOM_CREATED: 'room_created',     // {roomId}
    GAME_STARTED: 'game_started',     // {seed, players[]}
    GAME_ENDED: 'game_ended',         // {finalScores}
};
```

### 3.4 State Snapshot (Periodic Sync)

```javascript
// Sent at 10-20 Hz for position synchronization
const StateSnapshot = {
    timestamp: 0,
    fish: [
        // Compressed fish data
        {id, x, y, z, vx, vy, vz, hp}
    ],
    players: [
        // Player cannon states
        {id, yaw, pitch, weapon, score}
    ]
};
```

---

## 4. Kill Attribution System

### Design: Last-Hit-Wins with Damage Tracking

```javascript
handleHit(bulletId, fishId, playerId, damage) {
    const fish = this.fish.get(fishId);
    if (!fish || !fish.isAlive) return null;
    
    // Track damage per player (for future assist rewards)
    const currentDamage = fish.damageByPlayer.get(playerId) || 0;
    fish.damageByPlayer.set(playerId, currentDamage + damage);
    
    // Record last hit
    fish.lastHitBy = playerId;
    
    // Apply damage
    fish.hp -= damage;
    
    if (fish.hp <= 0) {
        fish.isAlive = false;
        
        // Award kill to last hit player
        const killer = this.players.get(fish.lastHitBy);
        const reward = CONFIG.fishTiers[fish.species].reward;
        killer.score += reward;
        killer.balance += reward;
        
        return {
            type: 'FISH_KILLED',
            fishId: fishId,
            killedBy: fish.lastHitBy,
            reward: reward,
            position: fish.position
        };
    }
    
    return {
        type: 'FISH_HIT',
        fishId: fishId,
        damage: damage,
        newHp: fish.hp,
        byPlayerId: playerId
    };
}
```

---

## 5. Cannon Positioning

### Layout: Bottom Edge, Side-by-Side

```
        ┌─────────────────────────────────────┐
        │                                     │
        │           FISH ARENA                │
        │                                     │
        │     🐟  🐠  🐡  🦈  🐋  🐟          │
        │                                     │
        │                                     │
        └─────────────────────────────────────┘
        
        ┌─────┬─────┬─────┬─────┐
        │  P1 │  P2 │  P3 │  P4 │
        │  🔫 │  🔫 │  🔫 │  🔫 │
        └─────┴─────┴─────┴─────┘
        
Cannon X positions (slotIndex):
  Slot 0: x = -600  (leftmost)
  Slot 1: x = -200
  Slot 2: x = +200
  Slot 3: x = +600  (rightmost)
```

```javascript
const CANNON_POSITIONS = [
    { x: -600, y: -450, z: 0 },  // Slot 0
    { x: -200, y: -450, z: 0 },  // Slot 1
    { x:  200, y: -450, z: 0 },  // Slot 2
    { x:  600, y: -450, z: 0 },  // Slot 3
];
```

---

## 6. Split-Screen Rendering

### Viewport Layout

```javascript
function getViewportLayout(playerCount) {
    const layouts = {
        1: [{ x: 0, y: 0, w: 1, h: 1 }],
        2: [
            { x: 0, y: 0.5, w: 1, h: 0.5 },    // Top
            { x: 0, y: 0,   w: 1, h: 0.5 }     // Bottom
        ],
        3: [
            { x: 0,   y: 0.5, w: 0.5, h: 0.5 }, // Top-left
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, // Top-right
            { x: 0.25, y: 0, w: 0.5, h: 0.5 }   // Bottom-center
        ],
        4: [
            { x: 0,   y: 0.5, w: 0.5, h: 0.5 }, // Top-left
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, // Top-right
            { x: 0,   y: 0,   w: 0.5, h: 0.5 }, // Bottom-left
            { x: 0.5, y: 0,   w: 0.5, h: 0.5 }  // Bottom-right
        ]
    };
    return layouts[playerCount] || layouts[1];
}

// Render loop for split-screen
function renderSplitScreen() {
    const layout = getViewportLayout(activePlayerCount);
    
    for (let i = 0; i < activePlayerCount; i++) {
        const vp = layout[i];
        const x = vp.x * window.innerWidth;
        const y = vp.y * window.innerHeight;
        const w = vp.w * window.innerWidth;
        const h = vp.h * window.innerHeight;
        
        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
        renderer.setScissorTest(true);
        
        // Update camera aspect ratio
        playerCameras[i].aspect = w / h;
        playerCameras[i].updateProjectionMatrix();
        
        renderer.render(scene, playerCameras[i]);
    }
}
```

---

## 7. Local Input Mapping (Test Mode)

### Keyboard Controls for 4 Players

```javascript
const INPUT_MAPPINGS = {
    player1: {
        // Mouse + WASD (primary player)
        rotateLeft: 'KeyA',
        rotateRight: 'KeyD',
        shoot: 'mouse0',           // Left click
        weapon1: 'Digit1',
        weapon2: 'Digit2',
        weapon3: 'Digit3',
        weapon4: 'Digit4',
        weapon5: 'Digit5',
        toggleView: 'Space'
    },
    player2: {
        // Arrow keys + numpad
        rotateLeft: 'ArrowLeft',
        rotateRight: 'ArrowRight',
        shoot: 'Enter',
        weapon1: 'Numpad1',
        weapon2: 'Numpad2',
        weapon3: 'Numpad3',
        weapon4: 'Numpad4',
        weapon5: 'Numpad5',
        toggleView: 'Numpad0'
    },
    player3: {
        // IJKL cluster
        rotateLeft: 'KeyJ',
        rotateRight: 'KeyL',
        shoot: 'KeyI',
        toggleView: 'KeyK'
    },
    player4: {
        // Auto-AI for testing (or gamepad if available)
        mode: 'auto'
    }
};
```

---

## 8. Seeded Random Number Generator

### Deterministic Fish Spawning

```javascript
class SeededRNG {
    constructor(seed) {
        this.seed = seed;
    }
    
    // Mulberry32 algorithm
    next() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    
    // Random integer in range [min, max]
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    
    // Random float in range [min, max]
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }
    
    // Pick random element from array
    pick(array) {
        return array[Math.floor(this.next() * array.length)];
    }
}
```

---

## 9. Anti-Cheat Considerations

### Server Authority Rules

1. **Fish State**: Only server can modify fish HP, position, and alive status
2. **Score/Balance**: Only server can award coins/points
3. **Hit Detection**: Server validates all hits using authoritative fish positions
4. **Spawn Control**: Only server can spawn fish using seeded RNG

### Client Prediction (Visual Only)

1. **Muzzle Flash**: Instant client-side visual
2. **Bullet Trail**: Client-side visual, server validates hit
3. **Camera Rotation**: Fully client-side
4. **Sound Effects**: Client-side

---

## 10. Performance Considerations

### Fish Count Scaling

```javascript
const FISH_COUNT_BY_PLAYERS = {
    1: 1.0,    // 100% fish count
    2: 1.2,    // 120% fish count
    3: 1.4,    // 140% fish count
    4: 1.5     // 150% fish count (not 4x to avoid performance issues)
};
```

### Network Optimization

- State snapshots: 10-20 Hz
- Delta compression for fish positions
- Only sync fish within player view frustum
- Batch multiple events per frame

---

## 11. Implementation Phases

### Phase 1: Core Refactoring (Current)
- [ ] Extract GameSession class from game.js
- [ ] Extract PlayerState class
- [ ] Implement SeededRNG
- [ ] Create INetworkSync interface with LocalLoopback

### Phase 2: Local Multiplayer
- [ ] Implement split-screen rendering
- [ ] Add multiple cannon positions
- [ ] Implement local input mapping
- [ ] Test with 2-4 local players

### Phase 3: Room System
- [ ] Implement GameRoom class
- [ ] Create lobby UI
- [ ] Handle player join/leave
- [ ] Implement game start/end flow

### Phase 4: Network Sync
- [ ] Implement fish synchronization
- [ ] Implement combat synchronization
- [ ] Implement score synchronization
- [ ] Add latency compensation

### Phase 5: Veral Render Integration
- [ ] Create VeralRender implementation of INetworkSync
- [ ] Test real network play
- [ ] Optimize bandwidth usage
- [ ] Add reconnection handling

---

## 12. API Reference (For Veral Render Integration)

### Messages: Client -> Server

```json
// Join room
{"type": "join_room", "roomId": "abc123", "playerName": "Player1"}

// Create room
{"type": "create_room", "isPublic": true}

// Player action
{"type": "action", "action": "shoot", "data": {"weapon": "1x", "direction": [0.1, 0.8, 0.2]}}

// Leave room
{"type": "leave_room"}
```

### Messages: Server -> Client

```json
// Room joined
{"type": "room_joined", "roomId": "abc123", "playerId": "p1", "slotIndex": 0}

// Game started
{"type": "game_started", "seed": 12345, "players": [...]}

// State snapshot (periodic)
{"type": "snapshot", "ts": 1234567890, "fish": [...], "players": [...]}

// Fish killed
{"type": "fish_killed", "fishId": 42, "killedBy": "p1", "reward": 100}
```

---

## Appendix: File Structure

```
fish-shooting-game/
├── index.html              # Main HTML (add multiplayer UI)
├── game.js                 # Main game (refactor to use GameSession)
├── multiplayer/
│   ├── GameSession.js      # Core simulation class
│   ├── PlayerState.js      # Player state class
│   ├── FishState.js        # Fish state class
│   ├── GameRoom.js         # Room management
│   ├── SeededRNG.js        # Deterministic RNG
│   ├── NetworkSync.js      # INetworkSync interface
│   ├── LocalLoopback.js    # Local implementation
│   └── VeralRender.js      # Future: Veral Render implementation
├── MULTIPLAYER_ARCHITECTURE.md  # This document
└── DEVELOPMENT_PROGRESS.md      # Development log
```
