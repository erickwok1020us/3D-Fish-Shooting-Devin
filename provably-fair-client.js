const ProvablyFairClient = (function() {
    const BACKEND_URL = 'https://app-mrylmfcn.fly.dev';
    
    let socket = null;
    let playerId = null;
    let isConnected = false;
    let serverBalance = 0;
    let pendingShots = new Map();
    let shotSequence = 0;
    let receipts = [];
    let onBalanceUpdate = null;
    let onReceiptCreated = null;
    let onConnectionChange = null;
    let shadowMode = true;
    
    function generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function connect(initialBalance = 1000) {
        if (socket && isConnected) {
            console.log('[PF-CLIENT] Already connected');
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            console.log('[PF-CLIENT] Connecting to backend:', BACKEND_URL);
            
            socket = io(BACKEND_URL, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            socket.on('connect', () => {
                console.log('[PF-CLIENT] Socket connected, SID:', socket.id);
                isConnected = true;
                
                playerId = generatePlayerId();
                socket.emit('join_game', {
                    player_id: playerId,
                    initial_balance: initialBalance
                });
            });
            
            socket.on('join_success', (data) => {
                console.log('[PF-CLIENT] Joined game:', data);
                serverBalance = data.balance;
                if (onBalanceUpdate) onBalanceUpdate(serverBalance);
                if (onConnectionChange) onConnectionChange(true);
                resolve();
            });
            
            socket.on('shot_accepted', (data) => {
                console.log('[PF-CLIENT] Shot accepted:', data);
                handleShotResult(data);
            });
            
            socket.on('shot_rejected', (data) => {
                console.log('[PF-CLIENT] Shot rejected:', data);
                handleShotRejected(data);
            });
            
            socket.on('balance_update', (data) => {
                console.log('[PF-CLIENT] Balance update:', data);
                serverBalance = data.balance;
                if (onBalanceUpdate) onBalanceUpdate(serverBalance);
            });
            
            socket.on('receipt', (data) => {
                console.log('[PF-CLIENT] Receipt received:', data);
                receipts.push(data);
                if (onReceiptCreated) onReceiptCreated(data);
            });
            
            socket.on('disconnect', () => {
                console.log('[PF-CLIENT] Disconnected');
                isConnected = false;
                if (onConnectionChange) onConnectionChange(false);
            });
            
            socket.on('connect_error', (error) => {
                console.error('[PF-CLIENT] Connection error:', error);
                isConnected = false;
                if (onConnectionChange) onConnectionChange(false);
                reject(error);
            });
            
            setTimeout(() => {
                if (!isConnected) {
                    console.warn('[PF-CLIENT] Connection timeout, running in offline mode');
                    resolve();
                }
            }, 5000);
        });
    }
    
    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
            isConnected = false;
            playerId = null;
        }
    }
    
    function sendShotIntent(fishId, weaponKey, targetPosition) {
        if (!isConnected || !socket) {
            console.log('[PF-CLIENT] Not connected, shot processed locally');
            return null;
        }
        
        shotSequence++;
        const intentId = `shot_${shotSequence}_${Date.now()}`;
        
        const shotIntent = {
            intent_id: intentId,
            player_id: playerId,
            fish_id: fishId,
            weapon_key: weaponKey,
            target_position: targetPosition,
            timestamp: Date.now() / 1000,
            sequence: shotSequence
        };
        
        pendingShots.set(intentId, {
            intent: shotIntent,
            sentAt: Date.now()
        });
        
        socket.emit('shot_intent', shotIntent);
        
        return intentId;
    }
    
    function handleShotResult(data) {
        const intentId = data.intent_id;
        const pending = pendingShots.get(intentId);
        
        if (pending) {
            pendingShots.delete(intentId);
        }
        
        serverBalance = data.new_balance;
        if (onBalanceUpdate) onBalanceUpdate(serverBalance);
        
        if (data.hit && data.fish_killed) {
            console.log('[PF-CLIENT] Fish killed! Reward:', data.reward);
        }
    }
    
    function handleShotRejected(data) {
        const intentId = data.intent_id;
        pendingShots.delete(intentId);
        
        console.warn('[PF-CLIENT] Shot rejected:', data.reason);
        
        if (data.reason === 'quarantined') {
            console.error('[PF-CLIENT] Player is quarantined for anti-cheat violation');
        }
    }
    
    function spawnFish(fishType, position) {
        if (!isConnected || !socket) return null;
        
        socket.emit('spawn_fish', {
            fish_type: fishType,
            position: position
        });
    }
    
    function getServerState() {
        return new Promise((resolve) => {
            if (!isConnected || !socket) {
                resolve(null);
                return;
            }
            
            socket.emit('get_state', {}, (response) => {
                resolve(response);
            });
        });
    }
    
    async function getFairnessInfo() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/fairness`);
            return await response.json();
        } catch (error) {
            console.error('[PF-CLIENT] Failed to get fairness info:', error);
            return null;
        }
    }
    
    async function verifyReceipt(receiptHash) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/verify/${receiptHash}`);
            return await response.json();
        } catch (error) {
            console.error('[PF-CLIENT] Failed to verify receipt:', error);
            return null;
        }
    }
    
    async function getPlayerReceipts() {
        if (!playerId) return [];
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/player/${playerId}/receipts`);
            const data = await response.json();
            return data.receipts || [];
        } catch (error) {
            console.error('[PF-CLIENT] Failed to get receipts:', error);
            return [];
        }
    }
    
    async function getPlayerViolations() {
        if (!playerId) return [];
        
        try {
            const response = await fetch(`${BACKEND_URL}/api/player/${playerId}/violations`);
            const data = await response.json();
            return data.violations || [];
        } catch (error) {
            console.error('[PF-CLIENT] Failed to get violations:', error);
            return [];
        }
    }
    
    function setOnBalanceUpdate(callback) {
        onBalanceUpdate = callback;
    }
    
    function setOnReceiptCreated(callback) {
        onReceiptCreated = callback;
    }
    
    function setOnConnectionChange(callback) {
        onConnectionChange = callback;
    }
    
    function getBalance() {
        return serverBalance;
    }
    
    function getPlayerId() {
        return playerId;
    }
    
    function isOnline() {
        return isConnected;
    }
    
    function getReceipts() {
        return receipts;
    }
    
    function setShadowMode(enabled) {
        shadowMode = enabled;
    }
    
    function isShadowMode() {
        return shadowMode;
    }
    
    return {
        connect,
        disconnect,
        sendShotIntent,
        spawnFish,
        getServerState,
        getFairnessInfo,
        verifyReceipt,
        getPlayerReceipts,
        getPlayerViolations,
        setOnBalanceUpdate,
        setOnReceiptCreated,
        setOnConnectionChange,
        getBalance,
        getPlayerId,
        isOnline,
        getReceipts,
        setShadowMode,
        isShadowMode,
        BACKEND_URL
    };
})();

window.ProvablyFairClient = ProvablyFairClient;
