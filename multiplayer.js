/**
 * 3D Fish Shooting Game - Multiplayer Client
 * Handles Socket.IO communication with the game server
 * 
 * Features:
 * - Room management (create, join, leave)
 * - Real-time fish/bullet synchronization
 * - Player state synchronization
 * - Server-driven game state
 */

// Server URL - Change this for production
const MULTIPLAYER_CONFIG = {
    serverUrl: 'https://fishing-socket-server.onrender.com',
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    interpolationDelay: 100 // ms delay for smooth interpolation
};

/**
 * Multiplayer Manager Class
 * Handles all network communication and state synchronization
 */
class MultiplayerManager {
    constructor(game) {
        this.game = game; // Reference to main game
        this.socket = null;
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.slotIndex = null;
        this.isHost = false;
        this.isSinglePlayer = false;
        
        // Server state
        this.serverFish = new Map(); // fishId -> fish data
        this.serverBullets = new Map(); // bulletId -> bullet data
        this.serverPlayers = new Map(); // playerId -> player data
        
        // Interpolation buffers
        this.fishSnapshots = []; // Array of {timestamp, fish[]}
        this.bulletSnapshots = [];
        
        // Time sync
        this.serverTimeOffset = 0;
        this.timeSyncSamples = [];
        
        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onRoomState = null;
        this.onGameStarted = null;
        this.onGameState = null;
        this.onFishKilled = null;
        this.onBalanceUpdate = null;
        this.onBossWave = null;
        this.onError = null;
    }
    
    /**
     * Connect to the multiplayer server
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.connected) {
                resolve();
                return;
            }
            
            console.log('[MULTIPLAYER] Connecting to server:', MULTIPLAYER_CONFIG.serverUrl);
            
            // Load Socket.IO if not already loaded
            if (typeof io === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                script.onload = () => this._initSocket(resolve, reject);
                script.onerror = () => reject(new Error('Failed to load Socket.IO'));
                document.head.appendChild(script);
            } else {
                this._initSocket(resolve, reject);
            }
        });
    }
    
    /**
     * Initialize Socket.IO connection
     */
    _initSocket(resolve, reject) {
        try {
            this.socket = io(MULTIPLAYER_CONFIG.serverUrl, {
                transports: ['websocket', 'polling'],
                reconnectionAttempts: MULTIPLAYER_CONFIG.reconnectAttempts,
                reconnectionDelay: MULTIPLAYER_CONFIG.reconnectDelay
            });
            
            this.socket.on('connect', () => {
                console.log('[MULTIPLAYER] Connected to server');
                this.connected = true;
                this._startTimeSync();
                if (this.onConnected) this.onConnected();
                resolve();
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('[MULTIPLAYER] Disconnected:', reason);
                this.connected = false;
                if (this.onDisconnected) this.onDisconnected(reason);
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('[MULTIPLAYER] Connection error:', error);
                reject(error);
            });
            
            // Setup all event handlers
            this._setupEventHandlers();
            
        } catch (error) {
            reject(error);
        }
    }
    
    /**
     * Setup all Socket.IO event handlers
     */
    _setupEventHandlers() {
        // Time sync
        this.socket.on('timeSyncPong', (data) => {
            this._handleTimeSync(data);
        });
        
        // Room events
        this.socket.on('roomCreated', (data) => {
            console.log('[MULTIPLAYER] Room created:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.slotIndex = data.slotIndex;
            this.isHost = data.isHost;
            if (this.onRoomCreated) this.onRoomCreated(data);
        });
        
        this.socket.on('joinSuccess', (data) => {
            console.log('[MULTIPLAYER] Joined room:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.slotIndex = data.slotIndex;
            this.isHost = data.isHost;
            if (this.onRoomJoined) this.onRoomJoined(data);
        });
        
        this.socket.on('joinError', (data) => {
            console.error('[MULTIPLAYER] Join error:', data.message);
            if (this.onError) this.onError(data.message);
        });
        
        this.socket.on('roomState', (data) => {
            console.log('[MULTIPLAYER] Room state:', data);
            if (this.onRoomState) this.onRoomState(data);
        });
        
        this.socket.on('playerJoined', (data) => {
            console.log('[MULTIPLAYER] Player joined:', data);
            this.serverPlayers.set(data.playerId, data);
        });
        
        this.socket.on('playerLeft', (data) => {
            console.log('[MULTIPLAYER] Player left:', data);
            this.serverPlayers.delete(data.playerId);
        });
        
        this.socket.on('roomClosed', (data) => {
            console.log('[MULTIPLAYER] Room closed:', data.reason);
            this.roomCode = null;
            if (this.onError) this.onError('Room closed: ' + data.reason);
        });
        
        // Game events
        this.socket.on('gameStarting', (data) => {
            console.log('[MULTIPLAYER] Game starting in', data.countdown, 'seconds');
        });
        
        this.socket.on('gameStarted', (data) => {
            console.log('[MULTIPLAYER] Game started!');
            if (this.onGameStarted) this.onGameStarted(data);
        });
        
        this.socket.on('singlePlayerStarted', (data) => {
            console.log('[MULTIPLAYER] Single player started:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.slotIndex = data.slotIndex;
            this.isSinglePlayer = true;
            if (this.onGameStarted) this.onGameStarted(data);
        });
        
        // Game state updates
        this.socket.on('gameState', (data) => {
            this._handleGameState(data);
        });
        
        this.socket.on('bulletSpawned', (data) => {
            this._handleBulletSpawned(data);
        });
        
        this.socket.on('fishHit', (data) => {
            this._handleFishHit(data);
        });
        
        this.socket.on('fishKilled', (data) => {
            this._handleFishKilled(data);
        });
        
        this.socket.on('balanceUpdate', (data) => {
            console.log('[MULTIPLAYER] Balance update:', data);
            if (this.onBalanceUpdate) this.onBalanceUpdate(data);
        });
        
        this.socket.on('bossWaveStarted', (data) => {
            console.log('[MULTIPLAYER] Boss wave started!');
            if (this.onBossWave) this.onBossWave({ active: true, ...data });
        });
        
        this.socket.on('bossWaveEnded', (data) => {
            console.log('[MULTIPLAYER] Boss wave ended');
            if (this.onBossWave) this.onBossWave({ active: false });
        });
        
        this.socket.on('bombExplosion', (data) => {
            console.log('[MULTIPLAYER] Bomb explosion at:', data.position);
            // Trigger explosion VFX in game
            if (this.game && this.game.triggerExplosion) {
                this.game.triggerExplosion(data.position, data.radius);
            }
        });
        
        this.socket.on('playerWeaponChanged', (data) => {
            console.log('[MULTIPLAYER] Player', data.playerId, 'changed weapon to', data.weapon);
        });
        
        this.socket.on('playerCannonUpdate', (data) => {
            // Update other player's cannon rotation
            const player = this.serverPlayers.get(data.playerId);
            if (player) {
                player.yaw = data.yaw;
                player.pitch = data.pitch;
            }
        });
        
        this.socket.on('insufficientBalance', (data) => {
            console.warn('[MULTIPLAYER] Insufficient balance:', data);
            if (this.onError) this.onError('Insufficient balance! Need ' + data.required + ' coins');
        });
    }
    
    /**
     * Start time synchronization
     */
    _startTimeSync() {
        this.timeSyncSamples = [];
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.socket.emit('timeSyncPing', {
                    seq: i,
                    clientSendTime: Date.now()
                });
            }, i * 200);
        }
    }
    
    /**
     * Handle time sync response
     */
    _handleTimeSync(data) {
        const now = Date.now();
        const rtt = now - data.clientSendTime;
        const serverTime = data.serverTime + rtt / 2;
        const offset = serverTime - now;
        
        this.timeSyncSamples.push(offset);
        
        if (this.timeSyncSamples.length >= 5) {
            // Use median offset
            this.timeSyncSamples.sort((a, b) => a - b);
            this.serverTimeOffset = this.timeSyncSamples[2];
            console.log('[MULTIPLAYER] Time sync complete, offset:', this.serverTimeOffset, 'ms');
        }
    }
    
    /**
     * Get estimated server time
     */
    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }
    
    /**
     * Handle game state update from server
     */
    _handleGameState(data) {
        // Store snapshot for interpolation
        this.fishSnapshots.push({
            timestamp: data.timestamp,
            fish: data.fish
        });
        
        // Keep only last 10 snapshots
        if (this.fishSnapshots.length > 10) {
            this.fishSnapshots.shift();
        }
        
        // Update server state
        this.serverFish.clear();
        for (const fish of data.fish) {
            this.serverFish.set(fish.id, fish);
        }
        
        this.serverBullets.clear();
        for (const bullet of data.bullets) {
            this.serverBullets.set(bullet.id, bullet);
        }
        
        this.serverPlayers.clear();
        for (const player of data.players) {
            this.serverPlayers.set(player.id, player);
        }
        
        if (this.onGameState) this.onGameState(data);
    }
    
    /**
     * Handle bullet spawned event
     */
    _handleBulletSpawned(data) {
        this.serverBullets.set(data.bulletId, {
            id: data.bulletId,
            owner: data.ownerId,
            x: data.x,
            z: data.z,
            vx: data.velocityX,
            vz: data.velocityZ,
            rot: data.rotation,
            weapon: data.weapon
        });
    }
    
    /**
     * Handle fish hit event
     */
    _handleFishHit(data) {
        const fish = this.serverFish.get(data.fishId);
        if (fish) {
            fish.hp = data.newHealth;
        }
        
        // Trigger hit VFX in game
        if (this.game && this.game.triggerFishHit) {
            this.game.triggerFishHit(data.fishId, data.damage, data.hitByPlayerId);
        }
    }
    
    /**
     * Handle fish killed event
     */
    _handleFishKilled(data) {
        this.serverFish.delete(data.fishId);
        
        console.log('[MULTIPLAYER] Fish killed:', data.typeName, 'by Player', data.killedByPlayerId, 'reward:', data.reward);
        
        if (this.onFishKilled) this.onFishKilled(data);
        
        // Trigger death VFX in game
        if (this.game && this.game.triggerFishDeath) {
            this.game.triggerFishDeath(data.fishId, data.position, data.reward, data.isBoss);
        }
    }
    
    /**
     * Get interpolated fish positions
     */
    getInterpolatedFish() {
        if (this.fishSnapshots.length < 2) {
            return Array.from(this.serverFish.values());
        }
        
        const renderTime = this.getServerTime() - MULTIPLAYER_CONFIG.interpolationDelay;
        
        // Find two snapshots to interpolate between
        let before = null;
        let after = null;
        
        for (let i = 0; i < this.fishSnapshots.length - 1; i++) {
            if (this.fishSnapshots[i].timestamp <= renderTime &&
                this.fishSnapshots[i + 1].timestamp >= renderTime) {
                before = this.fishSnapshots[i];
                after = this.fishSnapshots[i + 1];
                break;
            }
        }
        
        if (!before || !after) {
            return Array.from(this.serverFish.values());
        }
        
        // Interpolate
        const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
        const interpolatedFish = [];
        
        for (const afterFish of after.fish) {
            const beforeFish = before.fish.find(f => f.id === afterFish.id);
            
            if (beforeFish) {
                interpolatedFish.push({
                    ...afterFish,
                    x: beforeFish.x + (afterFish.x - beforeFish.x) * t,
                    z: beforeFish.z + (afterFish.z - beforeFish.z) * t
                });
            } else {
                interpolatedFish.push(afterFish);
            }
        }
        
        return interpolatedFish;
    }
    
    // ============ ROOM ACTIONS ============
    
    /**
     * Create a new room
     */
    createRoom(playerName, isPublic = true) {
        if (!this.connected) {
            console.error('[MULTIPLAYER] Not connected to server');
            return;
        }
        
        this.socket.emit('createRoom', {
            playerName,
            isPublic
        });
    }
    
    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerName) {
        if (!this.connected) {
            console.error('[MULTIPLAYER] Not connected to server');
            return;
        }
        
        this.socket.emit('joinRoom', {
            roomCode,
            playerName
        });
    }
    
    /**
     * Leave current room
     */
    leaveRoom() {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('leaveRoom');
        this.roomCode = null;
        this.playerId = null;
        this.slotIndex = null;
        this.isHost = false;
    }
    
    /**
     * Set ready status
     */
    setReady(ready) {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('playerReady', { ready });
    }
    
    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.connected || !this.roomCode || !this.isHost) {
            console.error('[MULTIPLAYER] Cannot start game - not host or not in room');
            return;
        }
        
        this.socket.emit('startGame');
    }
    
    /**
     * Start single player mode
     */
    startSinglePlayer(playerName) {
        if (!this.connected) {
            console.error('[MULTIPLAYER] Not connected to server');
            return;
        }
        
        this.socket.emit('startSinglePlayer', { playerName });
    }
    
    // ============ GAME ACTIONS ============
    
    /**
     * Send shoot action to server
     * @param {number} targetX - Target X position in 2D plane
     * @param {number} targetZ - Target Z position in 2D plane
     */
    shoot(targetX, targetZ) {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('shoot', {
            targetX,
            targetZ
        });
    }
    
    /**
     * Change weapon
     * @param {string} weapon - Weapon type ('1x', '3x', '5x', '8x', '20x')
     */
    changeWeapon(weapon) {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('changeWeapon', { weapon });
    }
    
    /**
     * Update cannon rotation (for visual sync)
     */
    updateCannon(yaw, pitch) {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('updateCannon', { yaw, pitch });
    }
    
    /**
     * Toggle view mode
     */
    toggleView(viewMode) {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('toggleView', { viewMode });
    }
    
    /**
     * Request current state (for reconnection)
     */
    requestState() {
        if (!this.connected || !this.roomCode) return;
        
        this.socket.emit('requestState');
    }
    
    // ============ UTILITY ============
    
    /**
     * Convert 3D world position to 2D server coordinates
     * @param {THREE.Vector3} worldPos - 3D world position
     * @returns {{x: number, z: number}} 2D server coordinates
     */
    worldToServer(worldPos) {
        // 3D aquarium: width=1800, depth=1200, centered at origin
        // Server 2D: x∈[-90,90], z∈[-60,60]
        // Scale factor: 1800/180 = 10, 1200/120 = 10
        return {
            x: worldPos.x / 10,
            z: worldPos.z / 10
        };
    }
    
    /**
     * Convert 2D server coordinates to 3D world position
     * @param {number} x - Server X coordinate
     * @param {number} z - Server Z coordinate
     * @param {number} y - Optional Y height (default: 0)
     * @returns {{x: number, y: number, z: number}} 3D world position
     */
    serverToWorld(x, z, y = 0) {
        return {
            x: x * 10,
            y: y,
            z: z * 10
        };
    }
    
    /**
     * Get cannon position for a slot
     * @param {number} slotIndex - Player slot (0-3)
     * @returns {{x: number, y: number, z: number}} 3D cannon position
     */
    getCannonPosition(slotIndex) {
        // Server cannon positions scaled to 3D
        const positions = [
            { x: -600, y: -450, z: 550 },  // Slot 0: Left
            { x: -200, y: -450, z: 550 },  // Slot 1: Mid-left
            { x:  200, y: -450, z: 550 },  // Slot 2: Mid-right
            { x:  600, y: -450, z: 550 }   // Slot 3: Right
        ];
        return positions[slotIndex] || positions[0];
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.slotIndex = null;
        this.isHost = false;
    }
}

// Export for use in game.js
if (typeof window !== 'undefined') {
    window.MultiplayerManager = MultiplayerManager;
    window.MULTIPLAYER_CONFIG = MULTIPLAYER_CONFIG;
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MultiplayerManager, MULTIPLAYER_CONFIG };
}
