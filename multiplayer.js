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
    // Binary protocol configuration (PDF Spec Section 4.3)
    useBinaryProtocol: true,         // Enable binary WebSocket protocol
    binaryWsPath: '/ws-game',        // Binary WebSocket endpoint path
    reconnectAttempts: 10,           // Increased for better reconnection
    reconnectDelay: 1000,
    reconnectDelayMax: 5000,         // Max delay between reconnect attempts
    interpolationDelay: 100,         // ms delay for smooth interpolation
    predictionEnabled: true,         // Enable client-side prediction
    maxPredictionTime: 200,          // Max ms to predict ahead
    snapshotBufferSize: 20,          // Number of snapshots to keep for interpolation
    networkOptimization: {
        positionPrecision: 2,        // Decimal places for position data
        anglePrecision: 3,           // Decimal places for angle data
        minUpdateInterval: 50        // Minimum ms between updates
    }
};

/**
 * Multiplayer Manager Class
 * Handles all network communication and state synchronization
 */
class MultiplayerManager {
    constructor(game) {
        this.game = game; // Reference to main game
        this.socket = null;
        this.binarySocket = null;    // BinarySocket instance (PDF Spec Section 4.3)
        this.useBinaryProtocol = MULTIPLAYER_CONFIG.useBinaryProtocol;
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
        
        // Reconnection state
        this.reconnectAttempt = 0;
        this.lastRoomCode = null;
        this.lastPlayerId = null;
        this.isReconnecting = false;
        
        // Client-side prediction
        this.pendingInputs = [];      // Inputs waiting for server confirmation
        this.lastProcessedInput = 0;  // Last input ID confirmed by server
        this.localBullets = new Map(); // Locally predicted bullets
        
        // Network optimization
        this.lastUpdateTime = 0;
        this.updateQueue = [];        // Queued updates to batch send
        
        // Callbacks
        this.onConnected = null;
        this.onReconnecting = null;
        this.onReconnected = null;
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
     * Uses BinarySocket if useBinaryProtocol is enabled, otherwise Socket.IO
     */
    connect() {
        return new Promise((resolve, reject) => {
            if ((this.socket || this.binarySocket) && this.connected) {
                resolve();
                return;
            }
            
            console.log('[MULTIPLAYER] Connecting to server:', MULTIPLAYER_CONFIG.serverUrl);
            console.log('[MULTIPLAYER] Using binary protocol:', this.useBinaryProtocol);
            
            if (this.useBinaryProtocol) {
                // Use BinarySocket (PDF Spec Section 4.3)
                this._initBinarySocket(resolve, reject);
            } else {
                // Fallback to Socket.IO
                if (typeof io === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                    script.onload = () => this._initSocket(resolve, reject);
                    script.onerror = () => reject(new Error('Failed to load Socket.IO'));
                    document.head.appendChild(script);
                } else {
                    this._initSocket(resolve, reject);
                }
            }
        });
    }
    
    /**
     * Initialize BinarySocket connection (PDF Spec Section 4.3)
     */
    _initBinarySocket(resolve, reject) {
        try {
            // Construct WebSocket URL
            const baseUrl = MULTIPLAYER_CONFIG.serverUrl.replace(/^http/, 'ws');
            const wsUrl = baseUrl + MULTIPLAYER_CONFIG.binaryWsPath;
            
            console.log('[MULTIPLAYER] Connecting to binary WebSocket:', wsUrl);
            
            this.binarySocket = new BinarySocket({
                url: wsUrl,
                maxReconnectAttempts: MULTIPLAYER_CONFIG.reconnectAttempts,
                reconnectDelay: MULTIPLAYER_CONFIG.reconnectDelay,
                autoReconnect: true
            });
            
            // Setup event handlers
            this._setupBinaryEventHandlers();
            
            // Connect
            this.binarySocket.connect()
                .then(() => {
                    console.log('[MULTIPLAYER] Binary WebSocket connected');
                    // Wait for session to be established
                })
                .catch(reject);
            
            // Resolve when session is established
            this.binarySocket.on('connected', (data) => {
                console.log('[MULTIPLAYER] Binary session established:', data.sessionId);
                this.connected = true;
                this.playerId = data.sessionId;
                this._startTimeSync();
                if (this.onConnected) this.onConnected();
                resolve();
            });
            
        } catch (error) {
            reject(error);
        }
    }
    
    /**
     * Setup BinarySocket event handlers
     */
    _setupBinaryEventHandlers() {
        // Connection events
        this.binarySocket.on('disconnect', (data) => {
            console.log('[MULTIPLAYER] Binary disconnected:', data.code, data.reason);
            this.connected = false;
            
            if (this.roomCode) {
                this.lastRoomCode = this.roomCode;
                this.lastPlayerId = this.playerId;
            }
            
            if (this.onDisconnected) this.onDisconnected(data.reason);
        });
        
        this.binarySocket.on('error', (error) => {
            console.error('[MULTIPLAYER] Binary error:', error);
            if (this.onError) this.onError(error.message || 'Connection error');
        });
        
        // Room events
        this.binarySocket.on('roomState', (data) => {
            console.log('[MULTIPLAYER] Room state:', data);
            this.roomCode = data.roomCode;
            if (data.playerId) this.playerId = data.playerId;
            if (data.slotIndex !== undefined) this.slotIndex = data.slotIndex;
            if (data.isHost !== undefined) this.isHost = data.isHost;
            if (this.onRoomState) this.onRoomState(data);
        });
        
        this.binarySocket.on('playerJoin', (data) => {
            console.log('[MULTIPLAYER] Player joined:', data);
            this.serverPlayers.set(data.playerId, data);
        });
        
        this.binarySocket.on('playerLeave', (data) => {
            console.log('[MULTIPLAYER] Player left:', data);
            this.serverPlayers.delete(data.playerId);
        });
        
        this.binarySocket.on('gameStart', (data) => {
            console.log('[MULTIPLAYER] Game started!');
            if (this.onGameStarted) this.onGameStarted(data);
        });
        
        // Game state events
        this.binarySocket.on('roomSnapshot', (data) => {
            this._handleGameState(data);
        });
        
        this.binarySocket.on('fishSpawn', (data) => {
            // Add fish to server state
            if (data.fish) {
                for (const fish of data.fish) {
                    this.serverFish.set(fish.id, fish);
                }
            }
        });
        
        this.binarySocket.on('fishDeath', (data) => {
            this._handleFishKilled(data);
        });
        
        this.binarySocket.on('fishUpdate', (data) => {
            // Update fish positions
            if (data.fish) {
                for (const fish of data.fish) {
                    this.serverFish.set(fish.id, fish);
                }
            }
            if (this.onGameState) this.onGameState({ fish: Array.from(this.serverFish.values()) });
        });
        
        this.binarySocket.on('balanceUpdate', (data) => {
            console.log('[MULTIPLAYER] Balance update:', data);
            if (this.onBalanceUpdate) this.onBalanceUpdate(data);
        });
        
        // Boss events
        this.binarySocket.on('bossSpawn', (data) => {
            console.log('[MULTIPLAYER] Boss spawned!');
            if (this.onBossWave) this.onBossWave({ active: true, ...data });
        });
        
        this.binarySocket.on('bossDeath', (data) => {
            console.log('[MULTIPLAYER] Boss defeated!');
            if (this.onBossWave) this.onBossWave({ active: false, ...data });
        });
        
        this.binarySocket.on('bossDamage', (data) => {
            console.log('[MULTIPLAYER] Boss damage:', data);
        });
        
        // Time sync
        this.binarySocket.on('timeSync', (data) => {
            this._handleTimeSync(data);
        });
        
        // Server errors
        this.binarySocket.on('serverError', (data) => {
            console.error('[MULTIPLAYER] Server error:', data);
            if (this.onError) this.onError(data.message || 'Server error');
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
                
                // Save state for reconnection
                if (this.roomCode) {
                    this.lastRoomCode = this.roomCode;
                    this.lastPlayerId = this.playerId;
                }
                
                if (this.onDisconnected) this.onDisconnected(reason);
                
                // Auto-reconnect for unexpected disconnections
                if (reason === 'io server disconnect' || reason === 'transport close') {
                    this._attemptReconnect();
                }
            });
            
            this.socket.on('reconnect_attempt', (attemptNumber) => {
                console.log('[MULTIPLAYER] Reconnection attempt:', attemptNumber);
                this.isReconnecting = true;
                this.reconnectAttempt = attemptNumber;
                if (this.onReconnecting) this.onReconnecting(attemptNumber);
            });
            
            this.socket.on('reconnect', () => {
                console.log('[MULTIPLAYER] Reconnected successfully');
                this.isReconnecting = false;
                this.reconnectAttempt = 0;
                this._startTimeSync();
                
                // Try to rejoin previous room
                if (this.lastRoomCode) {
                    this._rejoinRoom();
                }
                
                if (this.onReconnected) this.onReconnected();
            });
            
            this.socket.on('reconnect_failed', () => {
                console.error('[MULTIPLAYER] Reconnection failed after all attempts');
                this.isReconnecting = false;
                if (this.onError) this.onError('Connection lost. Please refresh the page.');
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
                if (this.useBinaryProtocol && this.binarySocket) {
                    this.binarySocket.sendTimeSyncPing(i);
                } else if (this.socket) {
                    this.socket.emit('timeSyncPing', {
                        seq: i,
                        clientSendTime: Date.now()
                    });
                }
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
        // DEBUG: Log raw payload keys to verify data structure
        if (!this._gameStateLogCounter) this._gameStateLogCounter = 0;
        this._gameStateLogCounter++;
        
        // Log every 30 updates (0.5 seconds) for better visibility
        if (this._gameStateLogCounter % 30 === 1) {
            console.log(`[MULTIPLAYER] gameState keys=${data ? Object.keys(data).join(',') : 'null'}, fish.len=${data?.fish?.length}, players.len=${data?.players?.length}`);
        }
        
        // Guard against missing fish data (required for rendering)
        if (!data || !Array.isArray(data.fish)) {
            console.warn('[MULTIPLAYER] Invalid gameState (no fish array):', data);
            return;
        }
        
        // Warn but don't block if players is missing
        if (!Array.isArray(data.players)) {
            console.warn('[MULTIPLAYER] gameState players not array:', data.players);
            // Continue processing fish even if players is malformed
        }
        
        // DEBUG: Log fish count received from server (every 60 updates to avoid spam)
        if (this._gameStateLogCounter % 60 === 1) {
            const fishTypes = {};
            for (const fish of data.fish) {
                fishTypes[fish.type] = (fishTypes[fish.type] || 0) + 1;
            }
            console.log(`[MULTIPLAYER] gameState received: fish=${data.fish.length}, bullets=${data.bullets?.length || 0}, players=${data.players?.length || 0}, types=${JSON.stringify(fishTypes)}`);
        }
        
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
        if (data.bullets && data.bullets.length > 0) {
            // Debug: Log when we receive bullets from server
            console.log(`[MULTIPLAYER] Received ${data.bullets.length} bullets from server, my playerId: ${this.playerId}`);
            for (const bullet of data.bullets) {
                this.serverBullets.set(bullet.id, bullet);
                // Log first bullet details
                if (data.bullets.indexOf(bullet) === 0) {
                    console.log(`[MULTIPLAYER] First bullet: id=${bullet.id}, owner=${bullet.owner}, weapon=${bullet.weapon}, x=${bullet.x}, z=${bullet.z}`);
                }
            }
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
        // DEBUG: Log every fishHit event received
        console.log(`[MULTIPLAYER] fishHit received: fishId=${data.fishId}, damage=${data.damage}, newHealth=${data.newHealth}, maxHealth=${data.maxHealth}, hitBy=${data.hitByPlayerId}`);
        
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
     * Server sends: fishId, typeName, topContributorId, totalReward, rewardDistribution, isBoss, position
     * We normalize field names for game.js compatibility
     */
    _handleFishKilled(data) {
        this.serverFish.delete(data.fishId);
        
        // Normalize field names from server to what game.js expects
        const killedBy = data.topContributorId;
        const reward = data.totalReward;
        
        console.log('[MULTIPLAYER] Fish killed:', data.fishId, data.typeName, 'by Player', killedBy, 'reward:', reward);
        
        // Create enriched data with normalized field names
        const enrichedData = {
            ...data,
            killedBy: killedBy,
            reward: reward
        };
        
        if (this.onFishKilled) this.onFishKilled(enrichedData);
        
        // Trigger death VFX in game
        if (this.game && this.game.triggerFishDeath) {
            this.game.triggerFishDeath(data.fishId, data.position, reward, data.isBoss);
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
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.createRoom(playerName, isPublic);
        } else if (this.socket) {
            this.socket.emit('createRoom', {
                playerName,
                isPublic
            });
        }
    }
    
    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerName) {
        if (!this.connected) {
            console.error('[MULTIPLAYER] Not connected to server');
            return;
        }
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.joinRoom(roomCode, playerName);
        } else if (this.socket) {
            this.socket.emit('joinRoom', {
                roomCode,
                playerName
            });
        }
    }
    
    /**
     * Leave current room
     */
    leaveRoom() {
        if (!this.connected || !this.roomCode) return;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.leaveRoom();
        } else if (this.socket) {
            this.socket.emit('leaveRoom');
        }
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
        
        if (this.useBinaryProtocol && this.binarySocket) {
            // Binary protocol doesn't have a separate ready packet
            // Room state is managed differently
            console.log('[MULTIPLAYER] Ready status via binary protocol');
        } else if (this.socket) {
            this.socket.emit('playerReady', { ready });
        }
    }
    
    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.connected || !this.roomCode || !this.isHost) {
            console.error('[MULTIPLAYER] Cannot start game - not host or not in room');
            return;
        }
        
        if (this.useBinaryProtocol && this.binarySocket) {
            // Binary protocol game start is handled via room state
            console.log('[MULTIPLAYER] Start game via binary protocol');
        } else if (this.socket) {
            this.socket.emit('startGame');
        }
    }
    
    /**
     * Start single player mode
     */
    startSinglePlayer(playerName) {
        if (!this.connected) {
            console.error('[MULTIPLAYER] Not connected to server');
            return;
        }
        
        if (this.useBinaryProtocol && this.binarySocket) {
            // For binary protocol, create a single-player room
            this.isSinglePlayer = true;
            this.binarySocket.createRoom(playerName, false);
        } else if (this.socket) {
            this.socket.emit('startSinglePlayer', { playerName });
        }
    }
    
    // ============ GAME ACTIONS ============
    
    /**
     * Send shoot action to server
     * @param {number} targetX - Target X position in 2D plane
     * @param {number} targetZ - Target Z position in 2D plane
     */
    shoot(targetX, targetZ) {
        if (!this.connected || !this.roomCode) return;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.shoot({
                targetX,
                targetZ,
                playerId: this.playerId,
                weapon: this.currentWeapon || '1x'
            });
        } else if (this.socket) {
            this.socket.emit('shoot', {
                targetX,
                targetZ
            });
        }
    }
    
    /**
     * Change weapon
     * @param {string} weapon - Weapon type ('1x', '3x', '5x', '8x')
     */
    changeWeapon(weapon) {
        if (!this.connected || !this.roomCode) return;
        
        this.currentWeapon = weapon;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.switchWeapon(this.playerId, weapon);
        } else if (this.socket) {
            this.socket.emit('changeWeapon', { weapon });
        }
    }
    
    /**
     * Update cannon rotation (for visual sync)
     */
    updateCannon(yaw, pitch) {
        if (!this.connected || !this.roomCode) return;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.sendMovement({
                playerId: this.playerId,
                yaw,
                pitch
            });
        } else if (this.socket) {
            this.socket.emit('updateCannon', { yaw, pitch });
        }
    }
    
    /**
     * Toggle view mode
     */
    toggleView(viewMode) {
        if (!this.connected || !this.roomCode) return;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            // View mode is client-side only, no need to send to server
            console.log('[MULTIPLAYER] View mode toggled:', viewMode);
        } else if (this.socket) {
            this.socket.emit('toggleView', { viewMode });
        }
    }
    
    /**
     * Request current state (for reconnection)
     */
    requestState() {
        if (!this.connected || !this.roomCode) return;
        
        if (this.useBinaryProtocol && this.binarySocket) {
            // Binary protocol sends state automatically via roomSnapshot
            console.log('[MULTIPLAYER] State request via binary protocol');
        } else if (this.socket) {
            this.socket.emit('requestState');
        }
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
     * Attempt to reconnect to server
     */
    _attemptReconnect() {
        if (this.isReconnecting) return;
        
        this.isReconnecting = true;
        console.log('[MULTIPLAYER] Attempting to reconnect...');
        
        // Socket.IO handles reconnection automatically, but we can trigger it manually
        if (this.socket && !this.socket.connected) {
            this.socket.connect();
        }
    }
    
    /**
     * Rejoin previous room after reconnection
     */
    _rejoinRoom() {
        if (!this.lastRoomCode || !this.socket) return;
        
        console.log('[MULTIPLAYER] Attempting to rejoin room:', this.lastRoomCode);
        
        this.socket.emit('rejoinRoom', {
            roomCode: this.lastRoomCode,
            playerId: this.lastPlayerId
        });
        
        // Listen for rejoin result
        this.socket.once('rejoinSuccess', (data) => {
            console.log('[MULTIPLAYER] Rejoined room successfully:', data);
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.slotIndex = data.slotIndex;
            this.isHost = data.isHost;
            this.lastRoomCode = null;
            this.lastPlayerId = null;
        });
        
        this.socket.once('rejoinError', (data) => {
            console.error('[MULTIPLAYER] Failed to rejoin room:', data.message);
            this.lastRoomCode = null;
            this.lastPlayerId = null;
            if (this.onError) this.onError('Could not rejoin game: ' + data.message);
        });
    }
    
    /**
     * Predict fish position for smoother movement
     * Uses velocity to extrapolate position between server updates
     */
    predictFishPosition(fish, deltaTime) {
        if (!MULTIPLAYER_CONFIG.predictionEnabled) return fish;
        
        const predicted = { ...fish };
        if (fish.velocity) {
            predicted.x += fish.velocity.x * deltaTime;
            predicted.y += fish.velocity.y * deltaTime;
            predicted.z += fish.velocity.z * deltaTime;
        }
        return predicted;
    }
    
    /**
     * Optimize network data by reducing precision
     */
    optimizeNetworkData(data) {
        const opt = MULTIPLAYER_CONFIG.networkOptimization;
        const optimized = {};
        
        if (data.x !== undefined) optimized.x = parseFloat(data.x.toFixed(opt.positionPrecision));
        if (data.y !== undefined) optimized.y = parseFloat(data.y.toFixed(opt.positionPrecision));
        if (data.z !== undefined) optimized.z = parseFloat(data.z.toFixed(opt.positionPrecision));
        if (data.yaw !== undefined) optimized.yaw = parseFloat(data.yaw.toFixed(opt.anglePrecision));
        if (data.pitch !== undefined) optimized.pitch = parseFloat(data.pitch.toFixed(opt.anglePrecision));
        
        // Copy other properties as-is
        for (const key of Object.keys(data)) {
            if (optimized[key] === undefined) {
                optimized[key] = data[key];
            }
        }
        
        return optimized;
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.useBinaryProtocol && this.binarySocket) {
            this.binarySocket.disconnect();
            this.binarySocket = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        this.roomCode = null;
        this.playerId = null;
        this.slotIndex = null;
        this.isHost = false;
        this.lastRoomCode = null;
        this.lastPlayerId = null;
        this.isReconnecting = false;
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
