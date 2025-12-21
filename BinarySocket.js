/**
 * BinarySocket - Frontend Binary Protocol Client (Protocol V2)
 * 
 * Implements the binary WebSocket protocol as specified in PDF Section 4.3 & 6.
 * Uses AES-256-GCM encryption and HMAC-SHA256 for secure communication.
 * Uses ECDH (P-256) + HKDF-SHA256 for key derivation.
 * 
 * Packet Structure:
 * [Header (19 bytes)] + [Encrypted Payload] + [GCM Tag (16 bytes)] + [HMAC (32 bytes)]
 * 
 * Header Structure (19 bytes) - Exact PDF Specification:
 * - protocolVersion: uint8 (1 byte)
 * - packetId: uint16 (2 bytes, big-endian)
 * - payloadLength: uint32 (4 bytes, big-endian)
 * - checksum: uint32 (4 bytes, CRC32)
 * - nonce: uint64 (8 bytes, big-endian, monotonically increasing)
 */

class BinarySocket {
    constructor(options = {}) {
        this.url = options.url || 'wss://localhost:3000/ws-game';
        this.ws = null;
        this.connected = false;
        this.sessionId = null;
        
        // Encryption keys (derived from ECDH + HKDF)
        this.encryptionKey = null;
        this.hmacKey = null;
        
        // ECDH keypair for handshake
        this.ecdhKeyPair = null;
        this.clientNonce32 = null;
        
        // Nonce tracking (using BigInt for uint64)
        this.clientNonce = BigInt(0);
        this.lastServerNonce = BigInt(0);
        
        // Event handlers
        this.handlers = new Map();
        
        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 1000;
        this.autoReconnect = options.autoReconnect !== false;
        
        // Protocol constants (V2) - Exact PDF Specification
        this.PROTOCOL_VERSION = 2;
        this.HEADER_SIZE = 19;
        this.GCM_TAG_SIZE = 16;
        this.HMAC_SIZE = 32;
        this.NONCE_SIZE = 12;
        
        // Packet IDs (uint16, must match backend Protocol V2)
        this.PacketId = {
            // Handshake & Session (0x0001 - 0x000F)
            HANDSHAKE_REQUEST: 0x0001,
            HANDSHAKE_RESPONSE: 0x0002,
            SESSION_INIT: 0x0003,
            SESSION_ACK: 0x0004,
            
            // Game Actions (0x0010 - 0x001F)
            SHOT_FIRED: 0x0010,
            HIT_RESULT: 0x0011,
            BALANCE_UPDATE: 0x0012,
            WEAPON_SWITCH: 0x0013,
            
            // Fish State (0x0020 - 0x002F)
            ROOM_SNAPSHOT: 0x0020,
            FISH_SPAWN: 0x0021,
            FISH_DEATH: 0x0022,
            FISH_UPDATE: 0x0023,
            
            // Boss Events (0x0030 - 0x003F)
            BOSS_SPAWN: 0x0030,
            BOSS_DEATH: 0x0031,
            BOSS_DAMAGE: 0x0032,
            
            // Player Events (0x0040 - 0x004F)
            PLAYER_JOIN: 0x0040,
            PLAYER_LEAVE: 0x0041,
            PLAYER_MOVEMENT: 0x0042,
            
            // Room Management (0x0050 - 0x005F)
            ROOM_CREATE: 0x0050,
            ROOM_JOIN: 0x0051,
            ROOM_LEAVE: 0x0052,
            ROOM_STATE: 0x0053,
            GAME_START: 0x0054,
            
            // Time Sync (0x0060 - 0x006F)
            TIME_SYNC_PING: 0x0060,
            TIME_SYNC_PONG: 0x0061,
            
            // System (0x00F0 - 0x00FF)
            ERROR: 0x00F0,
            DISCONNECT: 0x00FF
        };
        
        // Binary field sizes for payload encoding (must match backend packets.js)
        this.BinaryFieldSizes = {
            PLAYER_ID: 16,      // Backend: 16 bytes
            FISH_ID: 8,         // Backend: 8 bytes
            ROOM_CODE: 6,       // Backend: 6 bytes
            PLAYER_NAME: 32,    // Backend: 32 bytes
            SESSION_ID: 16,     // 16 bytes hex string
            WEAPON_ID: 1,
            FLOAT32: 4,
            UINT8: 1,
            UINT16: 2,
            UINT32: 4,
            UINT64: 8,
            TIMESTAMP: 8,
            PUBLIC_KEY: 65,
            NONCE_32: 32,
            SALT: 32
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
                    // Clear session state on close to allow fresh handshake on reconnect
                    this.encryptionKey = null;
                    this.hmacKey = null;
                    this.sessionId = null;
                    this.lastServerNonce = BigInt(0);
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
     * Send ECDH handshake request to server (Protocol V2)
     */
    async _sendHandshake() {
        try {
            // Generate ECDH keypair using P-256 curve
            this.ecdhKeyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveBits']
            );
            
            // Export public key in uncompressed format
            const publicKeyRaw = await crypto.subtle.exportKey('raw', this.ecdhKeyPair.publicKey);
            const publicKeyBytes = new Uint8Array(publicKeyRaw);
            
            // Generate 32-byte client nonce
            this.clientNonce32 = crypto.getRandomValues(new Uint8Array(32));
            
            // Build binary handshake request payload
            // Format: [publicKey (65 bytes)] + [clientNonce (32 bytes)] + [protocolVersion (1 byte)]
            const payloadSize = this.BinaryFieldSizes.PUBLIC_KEY + this.BinaryFieldSizes.NONCE_32 + 1;
            const payload = new Uint8Array(payloadSize);
            let offset = 0;
            
            // Write public key (65 bytes for uncompressed P-256)
            payload.set(publicKeyBytes, offset);
            offset += this.BinaryFieldSizes.PUBLIC_KEY;
            
            // Write client nonce (32 bytes)
            payload.set(this.clientNonce32, offset);
            offset += this.BinaryFieldSizes.NONCE_32;
            
            // Write protocol version (1 byte)
            payload[offset] = this.PROTOCOL_VERSION;
            
            // Create unencrypted handshake header
            // Format: [version (1)] + [reserved (1)] + [payloadLength (2)]
            const header = new Uint8Array(4);
            header[0] = this.PROTOCOL_VERSION;
            header[1] = 0; // reserved
            const headerView = new DataView(header.buffer);
            headerView.setUint16(2, payload.length, false); // big-endian
            
            // Send handshake request
            const packet = this._concatBuffers(header, payload);
            this.ws.send(packet);
            
            console.log('[BinarySocket] ECDH handshake request sent');
        } catch (error) {
            console.error('[BinarySocket] Failed to generate ECDH keypair:', error);
            this._emit('error', { type: 'handshake_error', message: error.message });
        }
    }
    
    /**
     * Handle incoming message (Protocol V2)
     */
    async _handleMessage(data) {
        if (!(data instanceof ArrayBuffer)) {
            console.warn('[BinarySocket] Received non-binary message, ignoring');
            return;
        }
        
        // Check if this is a handshake response (before encryption is established)
        // Handshake response header: [version (1)] + [reserved (1)] + [payloadLength (2)]
        if (!this.encryptionKey && data.byteLength >= 4) {
            const view = new DataView(data);
            const version = view.getUint8(0);
            const payloadLength = view.getUint16(2, false);
            
            // Verify this looks like a handshake response
            if (version === this.PROTOCOL_VERSION && data.byteLength === 4 + payloadLength) {
                const payload = data.slice(4);
                await this._handleHandshakeResponse(payload);
                return;
            }
        }
        
        // Process encrypted binary packet
        await this._processBinaryPacket(data);
    }
    
    /**
     * Handle ECDH handshake response from server (Protocol V2)
     * Derives session keys using ECDH shared secret + HKDF
     */
    async _handleHandshakeResponse(buffer) {
        console.log('[BinarySocket] Processing ECDH handshake response');
        
        try {
            // Parse handshake response payload
            // Format: [serverPublicKey (65)] + [serverNonce (32)] + [salt (32)] + [sessionId (36)]
            const view = new Uint8Array(buffer);
            let offset = 0;
            
            // Read server public key (65 bytes)
            const serverPublicKeyBytes = view.slice(offset, offset + this.BinaryFieldSizes.PUBLIC_KEY);
            offset += this.BinaryFieldSizes.PUBLIC_KEY;
            
            // Read server nonce (32 bytes)
            const serverNonce = view.slice(offset, offset + this.BinaryFieldSizes.NONCE_32);
            offset += this.BinaryFieldSizes.NONCE_32;
            
            // Read salt (32 bytes)
            const salt = view.slice(offset, offset + this.BinaryFieldSizes.SALT);
            offset += this.BinaryFieldSizes.SALT;
            
            // Read session ID (36 bytes, null-terminated string)
            const sessionIdBytes = view.slice(offset, offset + this.BinaryFieldSizes.SESSION_ID);
            this.sessionId = new TextDecoder().decode(sessionIdBytes).replace(/\0+$/, '');
            
            // Import server's public key
            const serverPublicKey = await crypto.subtle.importKey(
                'raw',
                serverPublicKeyBytes,
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            );
            
            // Compute ECDH shared secret
            const sharedSecretBits = await crypto.subtle.deriveBits(
                { name: 'ECDH', public: serverPublicKey },
                this.ecdhKeyPair.privateKey,
                256
            );
            const sharedSecret = new Uint8Array(sharedSecretBits);
            
            // Compute transcript hash for key binding
            const transcriptHash = await this._computeTranscriptHash(
                await crypto.subtle.exportKey('raw', this.ecdhKeyPair.publicKey),
                serverPublicKeyBytes,
                this.clientNonce32,
                serverNonce,
                this.PROTOCOL_VERSION
            );
            
            // Derive session keys using HKDF
            const sessionKeys = await this._deriveSessionKeys(sharedSecret, salt, transcriptHash);
            
            // Import derived keys for Web Crypto API
            this.encryptionKey = await crypto.subtle.importKey(
                'raw',
                sessionKeys.encryptionKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            this.hmacKey = await crypto.subtle.importKey(
                'raw',
                sessionKeys.hmacKey,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign', 'verify']
            );
            
            console.log('[BinarySocket] ECDH session established:', this.sessionId);
            this._emit('connected', { sessionId: this.sessionId });
            
        } catch (error) {
            console.error('[BinarySocket] Failed to process handshake response:', error);
            this._emit('error', { type: 'handshake_error', message: error.message });
        }
    }
    
    /**
     * Compute transcript hash for key binding
     */
    async _computeTranscriptHash(clientPublicKey, serverPublicKey, clientNonce, serverNonce, protocolVersion) {
        const clientPubBytes = new Uint8Array(clientPublicKey);
        const serverPubBytes = new Uint8Array(serverPublicKey);
        
        // Concatenate: clientPubKey + serverPubKey + clientNonce + serverNonce + version
        const totalLength = clientPubBytes.length + serverPubBytes.length + 
                           clientNonce.length + serverNonce.length + 1;
        const data = new Uint8Array(totalLength);
        let offset = 0;
        
        data.set(clientPubBytes, offset);
        offset += clientPubBytes.length;
        data.set(serverPubBytes, offset);
        offset += serverPubBytes.length;
        data.set(clientNonce, offset);
        offset += clientNonce.length;
        data.set(serverNonce, offset);
        offset += serverNonce.length;
        data[offset] = protocolVersion;
        
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
    }
    
    /**
     * Derive session keys using HKDF-SHA256
     */
    async _deriveSessionKeys(sharedSecret, salt, transcriptHash) {
        // HKDF info string
        const info = this._concatBuffers(
            transcriptHash,
            new TextEncoder().encode('fishshoot-v2 session keys')
        );
        
        // Import shared secret as HKDF key material
        const hkdfKey = await crypto.subtle.importKey(
            'raw',
            sharedSecret,
            'HKDF',
            false,
            ['deriveBits']
        );
        
        // Derive 64 bytes (32 for AES, 32 for HMAC)
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: salt,
                info: info
            },
            hkdfKey,
            512 // 64 bytes * 8 bits
        );
        
        const derivedBytes = new Uint8Array(derivedBits);
        
        return {
            encryptionKey: derivedBytes.slice(0, 32),
            hmacKey: derivedBytes.slice(32, 64)
        };
    }
    
    /**
     * Process binary packet with full security pipeline (Protocol V2)
     * Header (19 bytes): [version (1)] + [packetId (2)] + [payloadLength (4)] + [checksum (4)] + [nonce (8)]
     */
    async _processBinaryPacket(buffer) {
        try {
            const view = new DataView(buffer);
            
            // Step 1: Read Header (19 bytes)
            if (buffer.byteLength < this.HEADER_SIZE) {
                throw new Error('Packet too small for header');
            }
            
            // Parse 19-byte header (exact PDF specification)
            const protocolVersion = view.getUint8(0);
            const packetId = view.getUint16(1, false); // uint16 big-endian at offset 1
            const payloadLength = view.getUint32(3, false); // big-endian at offset 3
            const checksum = view.getUint32(7, false); // at offset 7
            const nonce = view.getBigUint64(11, false); // uint64 big-endian at offset 11
            
            // Step 2: Validate protocol version
            if (protocolVersion !== this.PROTOCOL_VERSION) {
                throw new Error(`Invalid protocol version: ${protocolVersion}, expected ${this.PROTOCOL_VERSION}`);
            }
            
            // Step 3: Verify checksum (over first 7 bytes of header + encrypted payload + tag)
            const headerForChecksum = new Uint8Array(buffer, 0, 7);
            const encryptedPayloadWithTag = new Uint8Array(buffer, this.HEADER_SIZE, payloadLength + this.GCM_TAG_SIZE);
            const dataForChecksum = this._concatBuffers(headerForChecksum, encryptedPayloadWithTag);
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
            
            // Step 6: Validate nonce (monotonic) using BigInt comparison
            if (nonce <= this.lastServerNonce) {
                throw new Error('Invalid nonce (replay attack detected)');
            }
            this.lastServerNonce = nonce;
            
            // Step 7: Parse binary payload and dispatch
            const payload = this._decodeBinaryPayload(packetId, decrypted);
            this._dispatchPacket(packetId, payload);
            
        } catch (error) {
            console.error('[BinarySocket] Error processing packet:', error);
            this._emit('error', { type: 'packet_error', message: error.message });
        }
    }
    
    /**
     * Decode binary payload based on packet type
     */
    _decodeBinaryPayload(packetId, buffer) {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        switch (packetId) {
            case this.PacketId.HIT_RESULT:
                return this._decodeHitResult(view, buffer);
            case this.PacketId.BALANCE_UPDATE:
                return this._decodeBalanceUpdate(view, buffer);
            case this.PacketId.FISH_SPAWN:
                return this._decodeFishSpawn(view, buffer);
            case this.PacketId.FISH_DEATH:
                return this._decodeFishDeath(view, buffer);
            case this.PacketId.PLAYER_JOIN:
                return this._decodePlayerJoin(view, buffer);
            case this.PacketId.PLAYER_LEAVE:
                return this._decodePlayerLeave(view, buffer);
            case this.PacketId.ROOM_STATE:
                return this._decodeRoomState(view, buffer);
            case this.PacketId.TIME_SYNC_PONG:
                return this._decodeTimeSyncPong(view, buffer);
            case this.PacketId.ERROR:
                return this._decodeError(view, buffer);
            default:
                // Fallback to JSON for unknown packet types
                try {
                    return JSON.parse(new TextDecoder().decode(buffer));
                } catch (e) {
                    console.warn(`[BinarySocket] Unknown packet type 0x${packetId.toString(16)}, raw decode failed`);
                    return { raw: buffer };
                }
        }
    }
    
    _decodeHitResult(view, buffer) {
        let offset = 0;
        const shotSequenceId = view.getUint32(offset, false); offset += 4;
        const hitCount = view.getUint8(offset); offset += 1;
        const hits = [];
        for (let i = 0; i < hitCount; i++) {
            const fishIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 16);
            const fishId = new TextDecoder().decode(fishIdBytes).replace(/\0+$/, '');
            offset += 16;
            const damage = view.getUint16(offset, false); offset += 2;
            const newHealth = view.getUint16(offset, false); offset += 2;
            hits.push({ fishId, damage, newHealth });
        }
        const totalDamage = view.getUint16(offset, false); offset += 2;
        const totalReward = view.getUint32(offset, false); offset += 4;
        const newBalance = view.getFloat64(offset, false); offset += 8;
        return { shotSequenceId, hits, totalDamage, totalReward, newBalance };
    }
    
    _decodeBalanceUpdate(view, buffer) {
        let offset = 0;
        const playerIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 32);
        const playerId = new TextDecoder().decode(playerIdBytes).replace(/\0+$/, '');
        offset += 32;
        const balance = view.getFloat64(offset, false); offset += 8;
        const change = view.getInt32(offset, false); offset += 4;
        const reasonCode = view.getUint8(offset); offset += 1;
        return { playerId, balance, change, reasonCode };
    }
    
    _decodeFishSpawn(view, buffer) {
        let offset = 0;
        const fishIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 16);
        const fishId = new TextDecoder().decode(fishIdBytes).replace(/\0+$/, '');
        offset += 16;
        const type = view.getUint8(offset); offset += 1;
        const x = view.getFloat32(offset, false); offset += 4;
        const y = view.getFloat32(offset, false); offset += 4;
        const z = view.getFloat32(offset, false); offset += 4;
        const hp = view.getUint16(offset, false); offset += 2;
        const maxHp = view.getUint16(offset, false); offset += 2;
        const reward = view.getUint16(offset, false); offset += 2;
        const velocityX = view.getFloat32(offset, false); offset += 4;
        const velocityY = view.getFloat32(offset, false); offset += 4;
        const velocityZ = view.getFloat32(offset, false); offset += 4;
        const isBoss = view.getUint8(offset) === 1; offset += 1;
        return { fishId, type, x, y, z, hp, maxHp, reward, velocityX, velocityY, velocityZ, isBoss };
    }
    
    _decodeFishDeath(view, buffer) {
        let offset = 0;
        const fishIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 16);
        const fishId = new TextDecoder().decode(fishIdBytes).replace(/\0+$/, '');
        offset += 16;
        const killedByBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 32);
        const killedBy = new TextDecoder().decode(killedByBytes).replace(/\0+$/, '');
        offset += 32;
        const reward = view.getUint32(offset, false); offset += 4;
        return { fishId, killedBy, reward };
    }
    
    _decodePlayerJoin(view, buffer) {
        let offset = 0;
        const playerIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 32);
        const playerId = new TextDecoder().decode(playerIdBytes).replace(/\0+$/, '');
        offset += 32;
        const playerNameBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 32);
        const playerName = new TextDecoder().decode(playerNameBytes).replace(/\0+$/, '');
        offset += 32;
        const position = view.getUint8(offset); offset += 1;
        const balance = view.getFloat64(offset, false); offset += 8;
        const weapon = view.getUint8(offset); offset += 1;
        return { playerId, playerName, position, balance, weapon };
    }
    
    _decodePlayerLeave(view, buffer) {
        let offset = 0;
        const playerIdBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 32);
        const playerId = new TextDecoder().decode(playerIdBytes).replace(/\0+$/, '');
        offset += 32;
        const reasonBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 16);
        const reason = new TextDecoder().decode(reasonBytes).replace(/\0+$/, '');
        offset += 16;
        return { playerId, reason };
    }
    
    _decodeRoomState(view, buffer) {
        let offset = 0;
        const roomCodeBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 8);
        const roomCode = new TextDecoder().decode(roomCodeBytes).replace(/\0+$/, '');
        offset += 8;
        const playerCount = view.getUint8(offset); offset += 1;
        const gameStarted = view.getUint8(offset) === 1; offset += 1;
        return { roomCode, playerCount, gameStarted };
    }
    
    _decodeTimeSyncPong(view, buffer) {
        let offset = 0;
        const seq = view.getUint32(offset, false); offset += 4;
        const serverTime = Number(view.getBigUint64(offset, false)); offset += 8;
        const clientSendTime = Number(view.getBigUint64(offset, false)); offset += 8;
        return { seq, serverTime, clientSendTime };
    }
    
    _decodeError(view, buffer) {
        let offset = 0;
        const code = view.getUint8(offset); offset += 1;
        const messageBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, 128);
        const message = new TextDecoder().decode(messageBytes).replace(/\0+$/, '');
        return { code, message };
    }
    
    // ==================== Binary Encoders (Client-to-Server) ====================
    
    /**
     * Write a fixed-length string to buffer (null-padded)
     */
    _writeString(view, offset, str, maxLength) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str || '');
        const dataView = new Uint8Array(view.buffer, view.byteOffset + offset, maxLength);
        dataView.fill(0);
        dataView.set(bytes.slice(0, maxLength));
        return offset + maxLength;
    }
    
    /**
     * Write a player ID (16 bytes fixed, matches backend)
     */
    _writePlayerId(view, offset, playerId) {
        return this._writeString(view, offset, playerId, this.BinaryFieldSizes.PLAYER_ID);
    }
    
    /**
     * Write a float32 value (big-endian)
     */
    _writeFloat32(dataView, offset, value) {
        dataView.setFloat32(offset, value || 0, false);
        return offset + 4;
    }
    
    /**
     * Write a uint64 value (big-endian)
     */
    _writeUint64(dataView, offset, value) {
        dataView.setBigUint64(offset, BigInt(value || 0), false);
        return offset + 8;
    }
    
    /**
     * Encode SHOT_FIRED packet (53 bytes, matches backend PayloadSizeLimits)
     * Format: playerId(16) + weaponId(1) + targetX(4) + targetY(4) + targetZ(4) + 
     *         directionX(4) + directionY(4) + directionZ(4) + shotSequenceId(4) + timestamp(8)
     */
    _encodeShotFired(data) {
        const buffer = new ArrayBuffer(53); // 16 + 1 + 24 + 4 + 8 = 53
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        let offset = 0;
        
        offset = this._writePlayerId(uint8View, offset, data.playerId);
        view.setUint8(offset, data.weaponId || 1); offset += 1;
        offset = this._writeFloat32(view, offset, data.targetX);
        offset = this._writeFloat32(view, offset, data.targetY);
        offset = this._writeFloat32(view, offset, data.targetZ);
        offset = this._writeFloat32(view, offset, data.directionX);
        offset = this._writeFloat32(view, offset, data.directionY);
        offset = this._writeFloat32(view, offset, data.directionZ);
        view.setUint32(offset, data.shotSequenceId || 0, false); offset += 4;
        this._writeUint64(view, offset, data.timestamp || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode WEAPON_SWITCH packet (25 bytes, matches backend PayloadSizeLimits)
     * Format: playerId(16) + weaponId(1) + timestamp(8)
     */
    _encodeWeaponSwitch(data) {
        const buffer = new ArrayBuffer(25); // 16 + 1 + 8 = 25
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        let offset = 0;
        
        offset = this._writePlayerId(uint8View, offset, data.playerId);
        view.setUint8(offset, data.weaponId || 1); offset += 1;
        this._writeUint64(view, offset, data.timestamp || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode ROOM_CREATE packet (41 bytes)
     * Format: playerName(32) + isPublic(1) + timestamp(8)
     */
    _encodeRoomCreate(data) {
        const buffer = new ArrayBuffer(41);
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        let offset = 0;
        
        offset = this._writeString(uint8View, offset, data.playerName, this.BinaryFieldSizes.PLAYER_NAME);
        view.setUint8(offset, data.isPublic ? 1 : 0); offset += 1;
        this._writeUint64(view, offset, data.timestamp || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode ROOM_JOIN packet (46 bytes, matches backend PayloadSizeLimits)
     * Format: roomCode(6) + playerName(32) + timestamp(8)
     */
    _encodeRoomJoin(data) {
        const buffer = new ArrayBuffer(46); // 6 + 32 + 8 = 46
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        let offset = 0;
        
        offset = this._writeString(uint8View, offset, data.roomCode, this.BinaryFieldSizes.ROOM_CODE);
        offset = this._writeString(uint8View, offset, data.playerName, this.BinaryFieldSizes.PLAYER_NAME);
        this._writeUint64(view, offset, data.timestamp || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode ROOM_LEAVE packet (8 bytes)
     * Format: timestamp(8)
     */
    _encodeRoomLeave(data) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        
        this._writeUint64(view, 0, data.timestamp || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode PLAYER_MOVEMENT packet (32 bytes, matches backend PayloadSizeLimits)
     * Format: playerId(16) + x(4) + y(4) + z(4) + timestamp(4) - simplified for 32 bytes
     * Note: Backend expects 32 bytes, so we use uint32 timestamp instead of uint64
     */
    _encodePlayerMovement(data) {
        const buffer = new ArrayBuffer(32); // 16 + 4 + 4 + 4 + 4 = 32
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        let offset = 0;
        
        offset = this._writePlayerId(uint8View, offset, data.playerId);
        offset = this._writeFloat32(view, offset, data.x);
        offset = this._writeFloat32(view, offset, data.y);
        offset = this._writeFloat32(view, offset, data.z);
        // Use uint32 timestamp to fit 32 bytes (low 32 bits of timestamp)
        view.setUint32(offset, (data.timestamp || Date.now()) & 0xFFFFFFFF, false);
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode TIME_SYNC_PING packet (12 bytes)
     * Format: seq(4) + clientSendTime(8)
     */
    _encodeTimeSyncPing(data) {
        const buffer = new ArrayBuffer(12);
        const view = new DataView(buffer);
        
        view.setUint32(0, data.seq || 0, false);
        this._writeUint64(view, 4, data.clientSendTime || Date.now());
        
        return new Uint8Array(buffer);
    }
    
    /**
     * Encode payload based on packet type (binary encoding)
     */
    _encodeBinaryPayload(packetId, payload) {
        switch (packetId) {
            case this.PacketId.SHOT_FIRED:
                return this._encodeShotFired(payload);
            case this.PacketId.WEAPON_SWITCH:
                return this._encodeWeaponSwitch(payload);
            case this.PacketId.ROOM_CREATE:
                return this._encodeRoomCreate(payload);
            case this.PacketId.ROOM_JOIN:
                return this._encodeRoomJoin(payload);
            case this.PacketId.ROOM_LEAVE:
                return this._encodeRoomLeave(payload);
            case this.PacketId.PLAYER_MOVEMENT:
                return this._encodePlayerMovement(payload);
            case this.PacketId.TIME_SYNC_PING:
                return this._encodeTimeSyncPing(payload);
            default:
                // Fallback to JSON for unknown packet types (should not happen in production)
                console.warn(`[BinarySocket] No binary encoder for packet ID 0x${packetId.toString(16)}, using JSON fallback`);
                return new TextEncoder().encode(JSON.stringify(payload));
        }
    }
    
    /**
     * Decrypt payload using AES-256-GCM (Protocol V2 with uint64 nonce)
     */
    async _decryptPayload(encrypted, authTag, nonce) {
        // Create IV from uint64 nonce (BigInt)
        // IV format: [8 bytes nonce big-endian] + [4 bytes zero padding]
        // Must match backend serializer.js encryptPayload()
        const iv = new Uint8Array(this.NONCE_SIZE);
        const ivView = new DataView(iv.buffer);
        
        // Write uint64 nonce as big-endian at offset 0, then 4 bytes of zeros at offset 8
        ivView.setBigUint64(0, nonce, false);
        ivView.setUint32(8, 0, false);
        
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
     * Encrypt payload using AES-256-GCM (Protocol V2 with uint64 nonce)
     */
    async _encryptPayload(plaintext, nonce) {
        // Create IV from uint64 nonce (BigInt)
        // IV format: [8 bytes nonce big-endian] + [4 bytes zero padding]
        // Must match backend serializer.js encryptPayload()
        const iv = new Uint8Array(this.NONCE_SIZE);
        const ivView = new DataView(iv.buffer);
        
        // Write uint64 nonce as big-endian at offset 0, then 4 bytes of zeros at offset 8
        ivView.setBigUint64(0, nonce, false);
        ivView.setUint32(8, 0, false);
        
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
     * Create packet header (Protocol V2 - 19 bytes, Exact PDF Specification)
     * Format: [version (1)] + [packetId (2)] + [payloadLength (4)] + [checksum (4)] + [nonce (8)]
     */
    _createHeader(packetId, payloadLength, nonce) {
        const header = new ArrayBuffer(this.HEADER_SIZE);
        const view = new DataView(header);
        
        // uint8 protocolVersion (offset 0)
        view.setUint8(0, this.PROTOCOL_VERSION);
        // uint16 packetId (offset 1, big-endian)
        view.setUint16(1, packetId, false);
        // uint32 payloadLength (offset 3, big-endian)
        view.setUint32(3, payloadLength, false);
        // uint32 checksum placeholder (offset 7)
        view.setUint32(7, 0, false);
        // uint64 nonce (offset 11, big-endian)
        view.setBigUint64(11, nonce, false);
        
        return new Uint8Array(header);
    }
    
    /**
     * Serialize and send a packet (Protocol V2)
     */
    async sendPacket(packetId, payload) {
        if (!this.connected || !this.encryptionKey || !this.hmacKey) {
            throw new Error('Not connected or session not established');
        }
        
        // Increment nonce (BigInt for uint64)
        this.clientNonce = this.clientNonce + BigInt(1);
        const nonce = this.clientNonce;
        
        // Serialize payload using binary encoder (100% PDF compliance - no JSON)
        const payloadBytes = this._encodeBinaryPayload(packetId, payload);
        
        // Encrypt payload
        const { ciphertext, authTag } = await this._encryptPayload(payloadBytes, nonce);
        
        // Create header
        const header = this._createHeader(packetId, ciphertext.length, nonce);
        
        // Calculate checksum (over first 7 bytes of header + encrypted payload + tag)
        const headerForChecksum = header.slice(0, 7);
        const dataForChecksum = this._concatBuffers(headerForChecksum, this._concatBuffers(ciphertext, authTag));
        const checksum = this._calculateCRC32(dataForChecksum);
        
        // Write checksum to header at offset 7 (19-byte header)
        const headerView = new DataView(header.buffer);
        headerView.setUint32(7, checksum, false);
        
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
