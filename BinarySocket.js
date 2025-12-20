/**
 * BinarySocket - Frontend Binary Protocol Client
 * 
 * Implements the binary WebSocket protocol as specified in PDF Section 4.3 & 6.
 * Uses AES-256-GCM encryption and HMAC-SHA256 for secure communication.
 * 
 * Packet Structure:
 * [Header (16 bytes)] + [Encrypted Payload] + [GCM Tag (16 bytes)] + [HMAC (32 bytes)]
 * 
 * Header Structure (16 bytes):
 * - protocolVersion: uint8 (1 byte)
 * - packetId: uint8 (1 byte)
 * - payloadLength: uint32 (4 bytes, big-endian)
 * - checksum: uint32 (4 bytes, CRC32)
 * - nonce: uint48 (6 bytes, monotonically increasing)
 */

class BinarySocket {
    constructor(options = {}) {
        this.url = options.url || 'wss://localhost:3000/ws-game';
        this.ws = null;
        this.connected = false;
        this.sessionId = null;
        
        // Encryption keys (received from handshake)
        this.encryptionKey = null;
        this.hmacKey = null;
        
        // Nonce tracking
        this.clientNonce = 0;
        this.lastServerNonce = 0;
        
        // Event handlers
        this.handlers = new Map();
        
        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 1000;
        this.autoReconnect = options.autoReconnect !== false;
        
        // Protocol constants
        this.PROTOCOL_VERSION = 1;
        this.HEADER_SIZE = 16;
        this.GCM_TAG_SIZE = 16;
        this.HMAC_SIZE = 32;
        this.NONCE_SIZE = 12;
        
        // Packet IDs (must match backend)
        this.PacketId = {
            HANDSHAKE_REQUEST: 0x01,
            HANDSHAKE_RESPONSE: 0x02,
            SESSION_INIT: 0x03,
            SESSION_ACK: 0x04,
            
            SHOT_FIRED: 0x10,
            HIT_RESULT: 0x11,
            BALANCE_UPDATE: 0x12,
            WEAPON_SWITCH: 0x13,
            
            ROOM_SNAPSHOT: 0x20,
            FISH_SPAWN: 0x21,
            FISH_DEATH: 0x22,
            FISH_UPDATE: 0x23,
            
            BOSS_SPAWN: 0x30,
            BOSS_DEATH: 0x31,
            BOSS_DAMAGE: 0x32,
            
            PLAYER_JOIN: 0x40,
            PLAYER_LEAVE: 0x41,
            PLAYER_MOVEMENT: 0x42,
            
            ROOM_CREATE: 0x50,
            ROOM_JOIN: 0x51,
            ROOM_LEAVE: 0x52,
            ROOM_STATE: 0x53,
            GAME_START: 0x54,
            
            TIME_SYNC_PING: 0x60,
            TIME_SYNC_PONG: 0x61,
            
            ERROR: 0xF0,
            DISCONNECT: 0xFF
        };
        
        // CRC32 table (pre-computed for performance)
        this.crcTable = this._generateCRCTable();
        
        // Pending shot callbacks
        this.pendingShots = new Map();
        this.shotSequenceId = 0;
    }
    
    /**
     * Generate CRC32 lookup table
     */
    _generateCRCTable() {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            table[n] = c >>> 0;
        }
        return table;
    }
    
    /**
     * Calculate CRC32 checksum
     */
    _calculateCRC32(buffer) {
        let crc = 0xFFFFFFFF;
        const view = new Uint8Array(buffer);
        for (let i = 0; i < view.length; i++) {
            crc = (crc >>> 8) ^ this.crcTable[(crc ^ view[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    
    /**
     * Connect to the binary WebSocket server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                this.ws.binaryType = 'arraybuffer';
                
                this.ws.onopen = () => {
                    console.log('[BinarySocket] Connected to server');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this._sendHandshake();
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data);
                };
                
                this.ws.onclose = (event) => {
                    console.log('[BinarySocket] Connection closed:', event.code, event.reason);
                    this.connected = false;
                    this._emit('disconnect', { code: event.code, reason: event.reason });
                    
                    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this._scheduleReconnect();
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('[BinarySocket] WebSocket error:', error);
                    this._emit('error', error);
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Disconnect from the server
     */
    disconnect() {
        this.autoReconnect = false;
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
        this.connected = false;
        this.encryptionKey = null;
        this.hmacKey = null;
        this.sessionId = null;
    }
    
    /**
     * Schedule reconnection attempt
     */
    _scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`[BinarySocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.connected) {
                this.connect().catch(err => {
                    console.error('[BinarySocket] Reconnection failed:', err);
                });
            }
        }, delay);
    }
    
    /**
     * Send handshake request to server
     */
    _sendHandshake() {
        const handshakeData = {
            clientVersion: '1.0.0',
            timestamp: Date.now(),
            capabilities: ['aes-256-gcm', 'hmac-sha256']
        };
        
        // Handshake is sent as plain JSON (before encryption is established)
        const message = JSON.stringify({
            type: 'handshake',
            data: handshakeData
        });
        
        this.ws.send(message);
        console.log('[BinarySocket] Handshake request sent');
    }
    
    /**
     * Handle incoming message
     */
    async _handleMessage(data) {
        // Try JSON handshake first (server sends pure JSON for handshake_response)
        if (typeof data === 'string' || data instanceof ArrayBuffer) {
            try {
                let tryJson = false;
                if (typeof data === 'string') {
                    tryJson = true;
                } else if (data instanceof ArrayBuffer) {
                    const firstByte = new Uint8Array(data, 0, 1)[0];
                    // '{' = 0x7B, quick check to avoid decoding binary packets
                    if (firstByte === 0x7B) tryJson = true;
                }
                if (tryJson) {
                    const jsonStr = typeof data === 'string' ? data : new TextDecoder().decode(data);
                    const message = JSON.parse(jsonStr);
                    if (message && message.type === 'handshake_response') {
                        await this._handleHandshakeResponse(message);
                        return;
                    }
                }
            } catch (e) {
                // Not JSON or not a handshake, continue with binary processing
            }
        }
        
        // Process binary packet (only if keys are ready)
        if (data instanceof ArrayBuffer) {
            if (!this.encryptionKey || !this.hmacKey) {
                console.warn('[BinarySocket] Binary packet received before session is ready; dropping');
                return;
            }
            await this._processBinaryPacket(data);
        }
    }
    
    /**
     * Handle handshake response from server
     */
    async _handleHandshakeResponse(message) {
        console.log('[BinarySocket] Received handshake response');
        
        this.sessionId = message.sessionId;
        
        // Import encryption keys from base64
        const encKeyBytes = this._base64ToArrayBuffer(message.encryptionKey);
        const hmacKeyBytes = this._base64ToArrayBuffer(message.hmacKey);
        
        // Import keys for Web Crypto API
        this.encryptionKey = await crypto.subtle.importKey(
            'raw',
            encKeyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        
        this.hmacKey = await crypto.subtle.importKey(
            'raw',
            hmacKeyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );
        
        console.log('[BinarySocket] Session established:', this.sessionId);
        this._emit('connected', { sessionId: this.sessionId });
    }
    
    /**
     * Process binary packet with full security pipeline
     */
    async _processBinaryPacket(buffer) {
        try {
            const view = new DataView(buffer);
            
            // Step 1: Read Header
            if (buffer.byteLength < this.HEADER_SIZE) {
                throw new Error('Packet too small for header');
            }
            
            const protocolVersion = view.getUint8(0);
            const packetId = view.getUint8(1);
            const payloadLength = view.getUint32(2, false); // big-endian
            const checksum = view.getUint32(6, false);
            const nonceHigh = view.getUint16(10, false);
            const nonceLow = view.getUint32(12, false);
            const nonce = nonceHigh * 0x100000000 + nonceLow;
            
            // Step 2: Validate protocol version
            if (protocolVersion !== this.PROTOCOL_VERSION) {
                throw new Error('Invalid protocol version');
            }
            
            // Step 3: Verify checksum
            const headerWithoutChecksum = new Uint8Array(buffer, 0, 6);
            const encryptedPayloadWithTag = new Uint8Array(buffer, this.HEADER_SIZE, payloadLength + this.GCM_TAG_SIZE);
            const dataForChecksum = this._concatBuffers(headerWithoutChecksum, encryptedPayloadWithTag);
            const calculatedChecksum = this._calculateCRC32(dataForChecksum);
            
            if (calculatedChecksum !== checksum) {
                throw new Error('Checksum mismatch');
            }
            
            // Step 4: Verify HMAC
            const dataEnd = this.HEADER_SIZE + payloadLength + this.GCM_TAG_SIZE;
            const dataForHMAC = new Uint8Array(buffer, 0, dataEnd);
            const receivedHMAC = new Uint8Array(buffer, dataEnd, this.HMAC_SIZE);
            
            const isValidHMAC = await this._verifyHMAC(dataForHMAC, receivedHMAC);
            if (!isValidHMAC) {
                throw new Error('HMAC verification failed');
            }
            
            // Step 5: Decrypt AES-GCM payload
            const encrypted = new Uint8Array(buffer, this.HEADER_SIZE, payloadLength);
            const authTag = new Uint8Array(buffer, this.HEADER_SIZE + payloadLength, this.GCM_TAG_SIZE);
            
            const decrypted = await this._decryptPayload(encrypted, authTag, nonce);
            
            // Step 6: Validate nonce (monotonic)
            if (nonce <= this.lastServerNonce) {
                throw new Error('Invalid nonce (replay attack detected)');
            }
            this.lastServerNonce = nonce;
            
            // Step 7: Parse payload and dispatch
            const payload = JSON.parse(new TextDecoder().decode(decrypted));
            this._dispatchPacket(packetId, payload);
            
        } catch (error) {
            console.error('[BinarySocket] Error processing packet:', error);
            this._emit('error', { type: 'packet_error', message: error.message });
        }
    }
    
    /**
     * Decrypt payload using AES-256-GCM
     */
    async _decryptPayload(encrypted, authTag, nonce) {
        // Create IV from nonce
        const iv = new Uint8Array(this.NONCE_SIZE);
        const nonceHigh = Math.floor(nonce / 0x100000000);
        const nonceLow = nonce % 0x100000000;
        
        const ivView = new DataView(iv.buffer);
        ivView.setUint32(0, 0, false);
        ivView.setUint16(4, nonceHigh & 0xFFFF, false);
        ivView.setUint32(6, nonceLow, false);
        ivView.setUint16(10, 0, false);
        
        // Combine encrypted data and auth tag for Web Crypto API
        const ciphertext = this._concatBuffers(encrypted, authTag);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            ciphertext
        );
        
        return new Uint8Array(decrypted);
    }
    
    /**
     * Encrypt payload using AES-256-GCM
     */
    async _encryptPayload(plaintext, nonce) {
        // Create IV from nonce
        const iv = new Uint8Array(this.NONCE_SIZE);
        const nonceHigh = Math.floor(nonce / 0x100000000);
        const nonceLow = nonce % 0x100000000;
        
        const ivView = new DataView(iv.buffer);
        ivView.setUint32(0, 0, false);
        ivView.setUint16(4, nonceHigh & 0xFFFF, false);
        ivView.setUint32(6, nonceLow, false);
        ivView.setUint16(10, 0, false);
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            this.encryptionKey,
            plaintext
        );
        
        // Web Crypto API appends the auth tag to the ciphertext
        const encryptedArray = new Uint8Array(encrypted);
        const ciphertext = encryptedArray.slice(0, -this.GCM_TAG_SIZE);
        const authTag = encryptedArray.slice(-this.GCM_TAG_SIZE);
        
        return { ciphertext, authTag };
    }
    
    /**
     * Compute HMAC-SHA256
     */
    async _computeHMAC(data) {
        const signature = await crypto.subtle.sign(
            'HMAC',
            this.hmacKey,
            data
        );
        return new Uint8Array(signature);
    }
    
    /**
     * Verify HMAC-SHA256
     */
    async _verifyHMAC(data, expectedHMAC) {
        const computed = await this._computeHMAC(data);
        
        if (computed.length !== expectedHMAC.length) {
            return false;
        }
        
        // Constant-time comparison
        let result = 0;
        for (let i = 0; i < computed.length; i++) {
            result |= computed[i] ^ expectedHMAC[i];
        }
        return result === 0;
    }
    
    /**
     * Create packet header
     */
    _createHeader(packetId, payloadLength, nonce) {
        const header = new ArrayBuffer(this.HEADER_SIZE);
        const view = new DataView(header);
        
        view.setUint8(0, this.PROTOCOL_VERSION);
        view.setUint8(1, packetId);
        view.setUint32(2, payloadLength, false); // big-endian
        view.setUint32(6, 0, false); // checksum placeholder
        
        const nonceHigh = Math.floor(nonce / 0x100000000);
        const nonceLow = nonce % 0x100000000;
        view.setUint16(10, nonceHigh & 0xFFFF, false);
        view.setUint32(12, nonceLow, false);
        
        return new Uint8Array(header);
    }
    
    /**
     * Serialize and send a packet
     */
    async sendPacket(packetId, payload) {
        if (!this.connected || !this.encryptionKey || !this.hmacKey) {
            throw new Error('Not connected or session not established');
        }
        
        // Increment nonce
        this.clientNonce++;
        const nonce = this.clientNonce;
        
        // Serialize payload to JSON
        const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
        
        // Encrypt payload
        const { ciphertext, authTag } = await this._encryptPayload(payloadBytes, nonce);
        
        // Create header
        const header = this._createHeader(packetId, ciphertext.length, nonce);
        
        // Calculate checksum
        const headerWithoutChecksum = header.slice(0, 6);
        const dataForChecksum = this._concatBuffers(headerWithoutChecksum, this._concatBuffers(ciphertext, authTag));
        const checksum = this._calculateCRC32(dataForChecksum);
        
        // Write checksum to header
        const headerView = new DataView(header.buffer);
        headerView.setUint32(6, checksum, false);
        
        // Compute HMAC
        const dataForHMAC = this._concatBuffers(header, this._concatBuffers(ciphertext, authTag));
        const hmac = await this._computeHMAC(dataForHMAC);
        
        // Combine all parts
        const packet = this._concatBuffers(
            this._concatBuffers(header, this._concatBuffers(ciphertext, authTag)),
            hmac
        );
        
        // Send packet
        this.ws.send(packet);
    }
    
    /**
     * Dispatch packet to appropriate handler
     */
    _dispatchPacket(packetId, payload) {
        const packetName = this._getPacketName(packetId);
        console.log(`[BinarySocket] Received ${packetName}:`, payload);
        
        switch (packetId) {
            case this.PacketId.HIT_RESULT:
                this._handleHitResult(payload);
                break;
            case this.PacketId.BALANCE_UPDATE:
                this._emit('balanceUpdate', payload);
                break;
            case this.PacketId.ROOM_SNAPSHOT:
                this._emit('roomSnapshot', payload);
                break;
            case this.PacketId.FISH_SPAWN:
                this._emit('fishSpawn', payload);
                break;
            case this.PacketId.FISH_DEATH:
                this._emit('fishDeath', payload);
                break;
            case this.PacketId.FISH_UPDATE:
                this._emit('fishUpdate', payload);
                break;
            case this.PacketId.BOSS_SPAWN:
                this._emit('bossSpawn', payload);
                break;
            case this.PacketId.BOSS_DEATH:
                this._emit('bossDeath', payload);
                break;
            case this.PacketId.BOSS_DAMAGE:
                this._emit('bossDamage', payload);
                break;
            case this.PacketId.PLAYER_JOIN:
                this._emit('playerJoin', payload);
                break;
            case this.PacketId.PLAYER_LEAVE:
                this._emit('playerLeave', payload);
                break;
            case this.PacketId.ROOM_STATE:
                this._emit('roomState', payload);
                break;
            case this.PacketId.GAME_START:
                this._emit('gameStart', payload);
                break;
            case this.PacketId.TIME_SYNC_PONG:
                this._handleTimeSyncPong(payload);
                break;
            case this.PacketId.ERROR:
                this._emit('serverError', payload);
                break;
            default:
                console.warn(`[BinarySocket] Unknown packet ID: ${packetId}`);
        }
    }
    
    /**
     * Get packet name from ID
     */
    _getPacketName(packetId) {
        for (const [name, id] of Object.entries(this.PacketId)) {
            if (id === packetId) return name;
        }
        return `UNKNOWN(0x${packetId.toString(16)})`;
    }
    
    /**
     * Handle hit result from server
     */
    _handleHitResult(payload) {
        const callback = this.pendingShots.get(payload.shotSequenceId);
        if (callback) {
            callback(payload);
            this.pendingShots.delete(payload.shotSequenceId);
        }
        this._emit('hitResult', payload);
    }
    
    /**
     * Handle time sync pong
     */
    _handleTimeSyncPong(payload) {
        const rtt = Date.now() - payload.clientSendTime;
        const serverTime = payload.serverTime + rtt / 2;
        this._emit('timeSync', { rtt, serverTime, seq: payload.seq });
    }
    
    // ==================== Game Actions ====================
    
    /**
     * Send shot fired event
     */
    async shoot(data) {
        this.shotSequenceId++;
        const shotSequenceId = this.shotSequenceId;
        
        const payload = {
            playerId: data.playerId,
            weaponId: data.weaponId,
            targetX: data.targetX,
            targetY: data.targetY,
            targetZ: data.targetZ,
            directionX: data.directionX,
            directionY: data.directionY,
            directionZ: data.directionZ,
            shotSequenceId: shotSequenceId,
            timestamp: Date.now()
        };
        
        await this.sendPacket(this.PacketId.SHOT_FIRED, payload);
        
        return new Promise((resolve) => {
            this.pendingShots.set(shotSequenceId, resolve);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.pendingShots.has(shotSequenceId)) {
                    this.pendingShots.delete(shotSequenceId);
                    resolve({ timeout: true, shotSequenceId });
                }
            }, 5000);
        });
    }
    
    /**
     * Switch weapon
     */
    async switchWeapon(playerId, weaponId) {
        await this.sendPacket(this.PacketId.WEAPON_SWITCH, {
            playerId,
            weaponId,
            timestamp: Date.now()
        });
    }
    
    /**
     * Create room
     */
    async createRoom(playerName, isPublic = true) {
        await this.sendPacket(this.PacketId.ROOM_CREATE, {
            playerName,
            isPublic,
            timestamp: Date.now()
        });
    }
    
    /**
     * Join room
     */
    async joinRoom(roomCode, playerName) {
        await this.sendPacket(this.PacketId.ROOM_JOIN, {
            roomCode,
            playerName,
            timestamp: Date.now()
        });
    }
    
    /**
     * Leave room
     */
    async leaveRoom() {
        await this.sendPacket(this.PacketId.ROOM_LEAVE, {
            timestamp: Date.now()
        });
    }
    
    /**
     * Send player movement
     */
    async sendMovement(data) {
        await this.sendPacket(this.PacketId.PLAYER_MOVEMENT, {
            playerId: data.playerId,
            x: data.x,
            y: data.y,
            z: data.z,
            yaw: data.yaw,
            pitch: data.pitch,
            timestamp: Date.now()
        });
    }
    
    /**
     * Send time sync ping
     */
    async sendTimeSyncPing(seq) {
        await this.sendPacket(this.PacketId.TIME_SYNC_PING, {
            seq,
            clientSendTime: Date.now()
        });
    }
    
    // ==================== Event System ====================
    
    /**
     * Register event handler
     */
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }
    
    /**
     * Remove event handler
     */
    off(event, handler) {
        if (this.handlers.has(event)) {
            const handlers = this.handlers.get(event);
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    /**
     * Emit event to handlers
     */
    _emit(event, data) {
        if (this.handlers.has(event)) {
            for (const handler of this.handlers.get(event)) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[BinarySocket] Error in ${event} handler:`, error);
                }
            }
        }
    }
    
    // ==================== Utility Functions ====================
    
    /**
     * Convert base64 string to ArrayBuffer
     */
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    /**
     * Concatenate two ArrayBuffers/Uint8Arrays
     */
    _concatBuffers(a, b) {
        const aArray = a instanceof Uint8Array ? a : new Uint8Array(a);
        const bArray = b instanceof Uint8Array ? b : new Uint8Array(b);
        const result = new Uint8Array(aArray.length + bArray.length);
        result.set(aArray, 0);
        result.set(bArray, aArray.length);
        return result;
    }
    
    /**
     * Check if connected and session established
     */
    isReady() {
        return this.connected && this.encryptionKey !== null && this.hmacKey !== null;
    }
    
    /**
     * Get session ID
     */
    getSessionId() {
        return this.sessionId;
    }
}

// Export for use in game.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinarySocket;
}
