// Fish Shooter 3D - Clean Aquarium Version
// Using Three.js for 3D rendering

// ==================== GAME CONFIGURATION ====================
const CONFIG = {
    // Aquarium tank dimensions (rectangular glass tank) - Issue #10: 1.5X SIZE (of original)
    // Original: width=1200, height=600, depth=800, floorY=-300
    aquarium: {
        width: 1800,    // X axis (1.5x from 1200)
        height: 900,    // Y axis (1.5x from 600)
        depth: 1200,    // Z axis (1.5x from 800)
        floorY: -450,   // Bottom of tank (1.5x from -300)
        glassThickness: 20
    },
    
    // Camera settings (viewing from bottom of tank looking up)
    camera: {
        fov: 90,        // Very wide FOV for immersive feel
        near: 1,
        far: 5000,      // Adjusted for 1.5x tank
        // Camera positioned near cannon at bottom, looking up
        orbitRadius: 250,   // Close to cannon
        targetY: 0,         // Look at center/upper area of tank
        initialHeight: -380,  // Near bottom of tank (floorY is -450)
        // Issue 2 Fix: Per-mode rotation sensitivity
        rotationSensitivityThirdPerson: 0.001,  // 3RD PERSON mode sensitivity
        // FPS Sensitivity System: 10 levels (10% to 100%)
        // BUG FIX: Previous tiny values were fighting aimCannon() override
        // Now that aimCannon is disabled in FPS mode, use proper sensitivity
        // Target: 1920px drag at 100% ≈ 20° rotation (CS:GO medium sensitivity)
        // At 1920px screen width drag: Level 10 ≈ 20°, Level 5 ≈ 10°, Level 1 ≈ 2°
        // Formula: effective = base * (level / 10)
        // Math: 20° = 0.349 rad, 0.349 / 1920 = 0.000182 rad/px at 100%
        rotationSensitivityFPSBase: 0.00018,  // Standard FPS sensitivity (CS:GO-like feel)
        fpsSensitivityLevelDefault: 5           // Default level (1-10), 5 = 50%
    },
    
    // Debug/testing settings
    debug: {
        showRtpOnButtons: true  // Issue 4: Show RTP% on weapon buttons (set false for production)
    },
    
    // Fish arena - inside the aquarium tank (rectangular bounds)
    fishArena: {
        // Fish swim inside the tank with some margin from walls
        marginX: 300,
        marginY: 200,
        marginZ: 300
    },
    
    // Issue #11: 20 Fish Species System with diverse behaviors and forms
    fishTiers: {
        // ==================== LARGE SOLITARY PREDATORS (4 species) ====================
        // 1. Blue Whale - Largest, slow gentle filter feeder, solitary/pairs
        blueWhale: { 
            hp: 800, speedMin: 20, speedMax: 35, reward: 500, size: 140, 
            color: 0x4477aa, secondaryColor: 0x88aacc, count: 1, 
            pattern: 'cruise', schoolSize: [1, 2], form: 'whale',
            category: 'largePredator'
        },
        // 2. Great White Shark - Torpedo-shaped apex predator, solitary
        greatWhiteShark: { 
            hp: 600, speedMin: 60, speedMax: 120, reward: 400, size: 100, 
            color: 0x667788, secondaryColor: 0xcccccc, count: 2, 
            pattern: 'burstAttack', schoolSize: [1, 1], form: 'shark',
            category: 'largePredator'
        },
        // 3. Marlin - Long bill blue fish, solo/small groups(2-3)
        marlin: { 
            hp: 400, speedMin: 100, speedMax: 200, reward: 300, size: 80, 
            color: 0x2266aa, secondaryColor: 0x44aaff, count: 3, 
            pattern: 'burstSprint', schoolSize: [1, 3], form: 'marlin',
            category: 'largePredator'
        },
        // 4. Hammerhead Shark - T-shaped head, groups by day/solo hunts
        hammerheadShark: { 
            hp: 450, speedMin: 50, speedMax: 90, reward: 300, size: 85, 
            color: 0x556677, secondaryColor: 0x889999, count: 3, 
            pattern: 'sShape', schoolSize: [1, 4], form: 'hammerhead',
            category: 'largePredator'
        },
        
        // ==================== MEDIUM-LARGE SCHOOLING FISH (4 species) ====================
        // 5. Yellowfin Tuna - Muscular torpedo, medium schools(10-30)
        yellowfinTuna: { 
            hp: 200, speedMin: 80, speedMax: 140, reward: 250, size: 50, 
            color: 0x3355aa, secondaryColor: 0xffdd00, count: 8, 
            pattern: 'synchronizedFast', schoolSize: [5, 12], form: 'tuna',
            category: 'mediumLarge'
        },
        // 6. Mahi-Mahi/Dolphinfish - Blunt head gold-green, small schools(5-10)
        mahiMahi: { 
            hp: 150, speedMin: 70, speedMax: 130, reward: 200, size: 45, 
            color: 0x44aa44, secondaryColor: 0xffcc00, count: 6, 
            pattern: 'irregularTurns', schoolSize: [3, 8], form: 'dolphinfish',
            category: 'mediumLarge'
        },
        // 7. Barracuda - Long silver ambush predator
        barracuda: { 
            hp: 180, speedMin: 30, speedMax: 180, reward: 200, size: 55, 
            color: 0xaabbcc, secondaryColor: 0x667788, count: 5, 
            pattern: 'ambush', schoolSize: [1, 6], form: 'barracuda',
            category: 'mediumLarge'
        },
        // 8. Grouper - Wide thick body brown spots, solitary/pairs
        grouper: { 
            hp: 250, speedMin: 25, speedMax: 60, reward: 180, size: 60, 
            color: 0x886644, secondaryColor: 0x553322, count: 4, 
            pattern: 'bottomBurst', schoolSize: [1, 2], form: 'grouper',
            category: 'mediumLarge'
        },
        
        // ==================== MEDIUM COLORFUL REEF FISH (4 species) ====================
        // 9. Parrotfish - Parrot beak rainbow colors, small groups(3-8)
        parrotfish: { 
            hp: 100, speedMin: 40, speedMax: 70, reward: 150, size: 35, 
            color: 0x44ddaa, secondaryColor: 0xff66aa, count: 6, 
            pattern: 'stopAndGo', schoolSize: [3, 8], form: 'parrotfish',
            category: 'reefFish'
        },
        // 10. Angelfish - Flat disc yellow-blue stripes, pairs/small groups(3-5)
        angelfish: { 
            hp: 80, speedMin: 35, speedMax: 60, reward: 120, size: 30, 
            color: 0xffdd44, secondaryColor: 0x4488ff, count: 8, 
            pattern: 'elegantGlide', schoolSize: [2, 5], form: 'angelfish',
            category: 'reefFish'
        },
        // 11. Butterflyfish - Flat small white-black-yellow, paired
        butterflyfish: { 
            hp: 60, speedMin: 45, speedMax: 80, reward: 100, size: 22, 
            color: 0xffffaa, secondaryColor: 0x222222, count: 10, 
            pattern: 'agileWeave', schoolSize: [2, 4], form: 'butterflyfish',
            category: 'reefFish'
        },
        // 12. Blue Tang - Oval flat bright blue, small schools(5-15)
        blueTang: { 
            hp: 50, speedMin: 50, speedMax: 85, reward: 100, size: 20, 
            color: 0x2288ff, secondaryColor: 0xffff00, count: 12, 
            pattern: 'groupCoordination', schoolSize: [5, 12], form: 'tang',
            category: 'reefFish'
        },
        
        // ==================== SMALL SCHOOLING FISH (4 species) ====================
        // 13. Sardine - Small streamlined silver, huge schools
        sardine: { 
            hp: 15, speedMin: 80, speedMax: 120, reward: 50, size: 10, 
            color: 0xccddee, secondaryColor: 0x88aacc, count: 30, 
            pattern: 'waveFormation', schoolSize: [15, 30], form: 'sardine',
            category: 'smallSchool'
        },
        // 14. Anchovy - Thin silver semi-transparent, massive schools
        anchovy: { 
            hp: 10, speedMin: 90, speedMax: 140, reward: 40, size: 8, 
            color: 0xaabbcc, secondaryColor: 0x778899, count: 35, 
            pattern: 'baitBall', schoolSize: [20, 35], form: 'anchovy',
            category: 'smallSchool'
        },
        // 15. Clownfish - Round small orange-white stripes, family groups(3-6)
        clownfish: { 
            hp: 40, speedMin: 30, speedMax: 55, reward: 80, size: 15, 
            color: 0xff6600, secondaryColor: 0xffffff, count: 8, 
            pattern: 'territorial', schoolSize: [3, 6], form: 'clownfish',
            category: 'smallSchool'
        },
        // 16. Damselfish - Small oval blue-purple-yellow, loose groups(5-20)
        damselfish: { 
            hp: 30, speedMin: 55, speedMax: 90, reward: 60, size: 12, 
            color: 0x6644ff, secondaryColor: 0xffdd00, count: 15, 
            pattern: 'defensiveCharge', schoolSize: [5, 15], form: 'damselfish',
            category: 'smallSchool'
        },
        
        // ==================== SPECIAL FORM FISH (4 species) ====================
        // 17. Manta Ray - Flat wing-shaped black top white belly, solo/2-3
        mantaRay: { 
            hp: 350, speedMin: 40, speedMax: 70, reward: 280, size: 90, 
            color: 0x222233, secondaryColor: 0xeeeeee, count: 2, 
            pattern: 'wingGlide', schoolSize: [1, 3], form: 'mantaRay',
            category: 'specialForm'
        },
        // 18. Pufferfish - Round ball inflatable with spikes, solitary
        pufferfish: { 
            hp: 120, speedMin: 20, speedMax: 40, reward: 120, size: 25, 
            color: 0xddcc88, secondaryColor: 0x886644, count: 5, 
            pattern: 'slowRotation', schoolSize: [1, 1], form: 'pufferfish',
            category: 'specialForm'
        },
        // 19. Seahorse - Vertical S-shape horse head curled tail, pairs/solo
        seahorse: { 
            hp: 80, speedMin: 15, speedMax: 30, reward: 150, size: 20, 
            color: 0xffaa44, secondaryColor: 0xcc8833, count: 4, 
            pattern: 'verticalDrift', schoolSize: [1, 2], form: 'seahorse',
            category: 'specialForm'
        },
        // 20. Flying Fish - Streamlined large pectoral fins, medium schools(10-50)
        flyingFish: { 
            hp: 70, speedMin: 100, speedMax: 180, reward: 100, size: 18, 
            color: 0x4488cc, secondaryColor: 0x88ccff, count: 10, 
            pattern: 'glideJump', schoolSize: [5, 12], form: 'flyingFish',
            category: 'specialForm'
        },
        
        // ==================== SPECIAL ABILITY FISH (Phase 2) ====================
        // 21. Bomb Crab - Explodes when killed, damaging nearby fish
        bombCrab: { 
            hp: 150, speedMin: 25, speedMax: 45, reward: 200, size: 35, 
            color: 0xff4400, secondaryColor: 0xcc2200, count: 2, 
            pattern: 'slowRotation', schoolSize: [1, 1], form: 'crab',
            category: 'abilityFish',
            ability: 'bomb', // Explodes on death, damages nearby fish
            abilityRadius: 200, // Explosion radius
            abilityDamage: 300 // Damage to nearby fish
        },
        // 22. Electric Eel - Chain lightning on death
        electricEel: { 
            hp: 180, speedMin: 40, speedMax: 70, reward: 250, size: 50, 
            color: 0x00ffff, secondaryColor: 0xffff00, count: 2, 
            pattern: 'sShape', schoolSize: [1, 2], form: 'eel',
            category: 'abilityFish',
            ability: 'lightning', // Chain lightning on death
            abilityChains: 4, // Number of chain jumps
            abilityDamage: 150, // Damage per chain
            abilityDecay: 0.6 // Damage reduction per jump
        },
        // 23. Shield Turtle - Has protective shield that must be broken first
        shieldTurtle: { 
            hp: 100, speedMin: 15, speedMax: 30, reward: 180, size: 40, 
            color: 0x228844, secondaryColor: 0x44aa66, count: 3, 
            pattern: 'cruise', schoolSize: [1, 2], form: 'turtle',
            category: 'abilityFish',
            ability: 'shield', // Has protective shield
            shieldHP: 200, // Shield HP (must break shield first)
            shieldColor: 0x00ffff // Cyan shield bubble
        },
        // 24. Gold Fish - Bonus coins on death
        goldFish: { 
            hp: 60, speedMin: 60, speedMax: 100, reward: 500, size: 25, 
            color: 0xffdd00, secondaryColor: 0xffaa00, count: 1, 
            pattern: 'agileWeave', schoolSize: [1, 1], form: 'goldfish',
            category: 'abilityFish',
            ability: 'bonus', // Extra coin burst on death
            bonusCoins: 10 // Number of bonus coins
        }
    },
    
    // Weapons (multiplier-based with unique mechanics)
    // Weapons (multiplier-based with unique mechanics)
    // Issue #16 CORRECTION: All weapons have 100% accuracy - point-and-click shooting
    weapons: {
        '1x': { 
            multiplier: 1, cost: 1, speed: 800, 
            damage: 100, shotsPerSecond: 2, // cooldown = 0.5s
            type: 'projectile', color: 0xcccccc, size: 8,
            cannonColor: 0xcccccc, cannonEmissive: 0x666666
        },
        '3x': { 
            multiplier: 3, cost: 3, speed: 700, 
            damage: 180, shotsPerSecond: 1.5, // cooldown = 0.667s
            // Shotgun effect: Fire 3 bullets in fan spread pattern (-15°, 0°, +15°)
            // Each bullet does NOT penetrate - stops on hit
            type: 'spread', spreadAngle: 15,
            color: 0xffaa00, size: 10,
            cannonColor: 0xff8800, cannonEmissive: 0xff4400
        },
        '5x': { 
            multiplier: 5, cost: 5, speed: 750, 
            damage: 150, shotsPerSecond: 2, // cooldown = 0.5s
            // Issue #15: Chain lightning jumps 2-3 times with 50% damage reduction per jump
            type: 'chain', maxChains: 3, chainDecay: 0.5, chainRadius: 250,
            color: 0xffdd00, size: 12,  // Golden color for lightning
            cannonColor: 0xffcc00, cannonEmissive: 0xffaa00
        },
        '8x': { 
            multiplier: 8, cost: 8, speed: 600, 
            damage: 250, damageEdge: 100, shotsPerSecond: 2.5, // cooldown = 0.4s
            type: 'aoe', aoeRadius: 150,
            color: 0xff4444, size: 14,
            cannonColor: 0xff2222, cannonEmissive: 0xcc0000
        },
        '20x': { 
            multiplier: 20, cost: 200, speed: 900, 
            damage: 800, damageEdge: 400, shotsPerSecond: 0.5, // cooldown = 2s (slow but powerful)
            type: 'superAoe', aoeRadius: 350,
            color: 0xff00ff, size: 24,  // Purple/magenta for super weapon
            cannonColor: 0xcc00cc, cannonEmissive: 0xff00ff
        }
    },
    
    // RTP settings - Issue #16: Added 20x weapon
    rtp: {
        entertainment: { '1x': 0.915, '3x': 0.945, '5x': 0.975, '8x': 0.995, '20x': 0.999 },
        real: { '1x': 0.88, '3x': 0.91, '5x': 0.94, '8x': 0.96, '20x': 0.98 }
    },
    
    // Game settings - Issue #10: Adjusted fish count for 1.5x tank
    game: {
        initialBalance: 1000,
        maxFish: 80,  // Reduced for 1.5x tank (proportional to tank volume)
        targetFPS: 60,
        mode: 'entertainment'
    },
    
    // Boids settings - adjusted for 1.5x tank
    boids: {
        separationDistance: 50,
        cohesionDistance: 180,
        separationWeight: 1.5,
        cohesionWeight: 0.8
    }
};

// ==================== GAME STATE ====================
const gameState = {
    balance: CONFIG.game.initialBalance,
    score: 0,
    currentWeapon: '1x',
    fish: [],  // Array of fish meshes (used in multiplayer mode)
    lastWeaponKey: '1x',
    cooldown: 0,
    isLoading: true,
    isPaused: false,
    autoShoot: false,
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    // Camera view mode: 'third-person' or 'fps'
    viewMode: 'third-person',
    // Camera rotation state - horizontal (yaw) and vertical (pitch)
    cameraYaw: 0,
    cameraPitch: 0,
    targetCameraYaw: 0,
    targetCameraPitch: 0,
    maxCameraYaw: Math.PI / 6,    // ±30° horizontal (10 o'clock to 2 o'clock)
    maxCameraPitch: Math.PI / 9,  // ±20° vertical (up/down)
    // FPS mode camera state
    fpsYaw: 0,
    fpsPitch: 0,
    // FPS Sensitivity Level (1-10, where 10=100%, 5=50% default)
    fpsSensitivityLevel: 5,  // Default to level 5 (50%)
    // Right-click drag camera rotation
    isRightDragging: false,
    rightDragStartX: 0,
    rightDragStartY: 0,
    rightDragStartYaw: 0,
    rightDragStartPitch: 0,
    // FPS free mouse look state (for delta calculation)
    lastFPSMouseX: null,
    lastFPSMouseY: null,
    // Auto-panning state
    autoPanTimer: 0,
    autoPanDirection: 1,  // 1 = right, -1 = left
    autoPanInterval: 5.0,  // Pan every 5 seconds
    // Boss Fish Event System (Issue #12)
    bossSpawnTimer: 60,  // Boss spawns every 60 seconds exactly
    activeBoss: null,  // Currently active boss fish
    bossCountdown: 0,  // Countdown timer for boss event
    bossActive: false,  // Whether a boss event is currently active
    isInGameScene: false,  // Whether player is in active game (not lobby/menu)
    // Combo System (Issue #4 - Weapon System Improvements)
    comboCount: 0,           // Current consecutive kills
    comboTimer: 0,           // Time remaining to continue combo
    comboTimeWindow: 3.0,    // Seconds to get next kill to continue combo
    lastComboBonus: 0        // Last applied combo bonus percentage
};

// ==================== PERFORMANCE OPTIMIZATION CONFIG ====================
const PERFORMANCE_CONFIG = {
    // LOD (Level of Detail) settings
    lod: {
        highDetailDistance: 300,    // Full detail within 300 units
        mediumDetailDistance: 600,  // Medium detail 300-600 units
        lowDetailDistance: 1000     // Low detail beyond 600 units
    },
    // Frustum culling
    frustumCulling: {
        enabled: true,
        updateInterval: 0.1  // Update culling every 100ms
    },
    // Particle limits
    particles: {
        maxCount: 500,           // Maximum active particles
        cullDistance: 800        // Don't render particles beyond this
    },
    // Shadow map quality settings
    shadowMap: {
        low: 512,
        medium: 1024,
        high: 2048
    },
    // Fish density monitoring
    fishDensity: {
        minCount: 15,            // Minimum fish before emergency spawn
        targetCount: 20,         // Target fish count
        maxCount: 30,            // Maximum fish count
        monitorInterval: 1.0     // Check density every second
    }
};

// Performance state tracking
const performanceState = {
    frustumCullTimer: 0,
    fishDensityTimer: 0,
    currentShadowQuality: 'medium',
    visibleFishCount: 0,
    culledFishCount: 0,
    activeParticleCount: 0
};

// ==================== COMBO BONUS SYSTEM ====================
const COMBO_CONFIG = {
    // Combo tiers and their bonus percentages
    tiers: [
        { minKills: 3, bonus: 0.10, name: '3x COMBO!' },      // 3 kills = +10%
        { minKills: 5, bonus: 0.25, name: '5x COMBO!' },      // 5 kills = +25%
        { minKills: 10, bonus: 0.50, name: '10x COMBO!' },    // 10 kills = +50%
        { minKills: 20, bonus: 0.75, name: '20x MEGA COMBO!' }, // 20 kills = +75%
        { minKills: 50, bonus: 1.00, name: '50x ULTRA COMBO!' } // 50 kills = +100%
    ],
    timeWindow: 3.0,  // Seconds to continue combo
    displayDuration: 1.5  // How long to show combo notification
};

// Get current combo bonus based on kill count
function getComboBonus(killCount) {
    let bonus = 0;
    let tierName = '';
    for (const tier of COMBO_CONFIG.tiers) {
        if (killCount >= tier.minKills) {
            bonus = tier.bonus;
            tierName = tier.name;
        }
    }
    return { bonus, tierName };
}

// Update combo state after a kill
function updateComboOnKill() {
    gameState.comboCount++;
    gameState.comboTimer = COMBO_CONFIG.timeWindow;
    
    const { bonus, tierName } = getComboBonus(gameState.comboCount);
    
    // Show combo notification if we hit a new tier
    if (bonus > gameState.lastComboBonus && tierName) {
        showComboNotification(tierName, bonus);
        gameState.lastComboBonus = bonus;
    }
    
    return bonus;
}

// Reset combo when timer expires
function updateComboTimer(deltaTime) {
    if (gameState.comboCount > 0) {
        gameState.comboTimer -= deltaTime;
        if (gameState.comboTimer <= 0) {
            // Combo ended
            if (gameState.comboCount >= 3) {
                showComboEndNotification(gameState.comboCount);
            }
            gameState.comboCount = 0;
            gameState.comboTimer = 0;
            gameState.lastComboBonus = 0;
        }
    }
}

// Show combo notification
function showComboNotification(tierName, bonus) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 48px;
        font-weight: bold;
        color: #ffdd00;
        text-shadow: 0 0 20px #ff8800, 0 0 40px #ff4400, 2px 2px 4px #000;
        z-index: 1000;
        pointer-events: none;
        animation: comboPopIn 0.3s ease-out, comboFadeOut 0.5s ease-in ${COMBO_CONFIG.displayDuration - 0.5}s forwards;
    `;
    notification.textContent = `${tierName} +${Math.round(bonus * 100)}%`;
    document.body.appendChild(notification);
    
    // Add animation styles if not already present
    if (!document.getElementById('combo-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'combo-animation-styles';
        style.textContent = `
            @keyframes comboPopIn {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            @keyframes comboFadeOut {
                0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2) translateY(-30px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => notification.remove(), COMBO_CONFIG.displayDuration * 1000);
}

// Show combo end notification
function showComboEndNotification(finalCount) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 24px;
        color: #aaaaaa;
        text-shadow: 1px 1px 2px #000;
        z-index: 1000;
        pointer-events: none;
        opacity: 0.8;
        animation: comboFadeOut 1s ease-in forwards;
    `;
    notification.textContent = `Combo ended: ${finalCount} kills`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 1000);
}

// ==================== PERFORMANCE OPTIMIZATION FUNCTIONS ====================

// Update frustum culling and LOD for fish
function updatePerformanceOptimizations(deltaTime) {
    if (!camera) return;
    
    performanceState.frustumCullTimer -= deltaTime;
    
    if (performanceState.frustumCullTimer <= 0) {
        performanceState.frustumCullTimer = PERFORMANCE_CONFIG.frustumCulling.updateInterval;
        
        // Create frustum from camera
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);
        
        let visibleCount = 0;
        let culledCount = 0;
        
        // Update fish visibility and LOD
        for (const fish of activeFish) {
            if (!fish || !fish.group) continue;
            
            const fishPos = fish.group.position;
            const distanceToCamera = fishPos.distanceTo(camera.position);
            
            // Frustum culling - hide fish outside view
            if (PERFORMANCE_CONFIG.frustumCulling.enabled) {
                const inFrustum = frustum.containsPoint(fishPos);
                fish.group.visible = fish.isActive && inFrustum;
                
                if (inFrustum) {
                    visibleCount++;
                } else {
                    culledCount++;
                }
            }
            
            // LOD - adjust detail based on distance
            if (fish.group.visible && fish.body) {
                const lod = PERFORMANCE_CONFIG.lod;
                if (distanceToCamera < lod.highDetailDistance) {
                    // High detail - full shadows
                    fish.body.castShadow = true;
                    if (fish.body.material) {
                        fish.body.material.flatShading = false;
                    }
                } else if (distanceToCamera < lod.mediumDetailDistance) {
                    // Medium detail - no shadows
                    fish.body.castShadow = false;
                } else {
                    // Low detail - no shadows, simplified rendering
                    fish.body.castShadow = false;
                    if (fish.body.material) {
                        fish.body.material.flatShading = true;
                    }
                }
            }
        }
        
        performanceState.visibleFishCount = visibleCount;
        performanceState.culledFishCount = culledCount;
    }
}

// Enforce particle limits to maintain performance
function enforceParticleLimits() {
    const maxParticles = PERFORMANCE_CONFIG.particles.maxCount;
    
    // Count active particles
    performanceState.activeParticleCount = activeParticles.length;
    
    // If over limit, remove oldest particles
    if (activeParticles.length > maxParticles) {
        const toRemove = activeParticles.length - maxParticles;
        for (let i = 0; i < toRemove; i++) {
            const particle = activeParticles[0];
            if (particle) {
                particle.deactivate();
                activeParticles.shift();
            }
        }
    }
    
    // Also cull distant particles
    const cullDistance = PERFORMANCE_CONFIG.particles.cullDistance;
    if (camera) {
        for (let i = activeParticles.length - 1; i >= 0; i--) {
            const particle = activeParticles[i];
            if (particle && particle.mesh) {
                const dist = particle.mesh.position.distanceTo(camera.position);
                if (dist > cullDistance) {
                    particle.deactivate();
                    activeParticles.splice(i, 1);
                }
            }
        }
    }
}

// Set shadow map quality based on performance setting
function setShadowMapQuality(quality) {
    if (!renderer) return;
    
    const size = PERFORMANCE_CONFIG.shadowMap[quality] || PERFORMANCE_CONFIG.shadowMap.medium;
    
    // Update all shadow-casting lights
    scene.traverse(obj => {
        if (obj.isLight && obj.shadow) {
            obj.shadow.mapSize.width = size;
            obj.shadow.mapSize.height = size;
            if (obj.shadow.map) {
                obj.shadow.map.dispose();
                obj.shadow.map = null;
            }
        }
    });
    
    performanceState.currentShadowQuality = quality;
    console.log(`Shadow quality set to ${quality} (${size}x${size})`);
}

// ==================== ENHANCED WEAPON VFX ====================
// Trigger weapon-specific effects on hit
function triggerWeaponHitEffects(weaponKey, position) {
    const vfx = WEAPON_VFX_CONFIG[weaponKey];
    if (!vfx) return;
    
    // Screen shake based on weapon
    if (vfx.screenShake > 0) {
        triggerScreenShakeWithStrength(vfx.screenShake);
    }
    
    // Special effects for high-tier weapons
    if (weaponKey === '20x') {
        // Red pulse border effect for 20x
        triggerRedBorder();
        // Extra screen flash
        triggerScreenFlash(0xff0000, 0.2);
    } else if (weaponKey === '8x') {
        // Orange flash for 8x
        triggerScreenFlash(0xff4400, 0.15);
    } else if (weaponKey === '5x') {
        // Subtle gold flash for 5x
        triggerScreenFlash(0xffdd00, 0.1);
    }
}

// Boss Fish Configuration (Issue #12)
const BOSS_FISH_TYPES = [
    {
        name: 'GIANT WHALE',
        baseSpecies: 'blueWhale',
        sizeMultiplier: 2.0,  // GIANT sized
        hpMultiplier: 5,
        rewardMultiplier: 5,
        speedMultiplier: 0.8,
        glowColor: 0x4488ff,
        description: 'Massive blue whale!'
    },
    {
        name: 'MEGA SHARK',
        baseSpecies: 'greatWhiteShark',
        sizeMultiplier: 1.8,  // GIANT sized
        hpMultiplier: 4,
        rewardMultiplier: 4,
        speedMultiplier: 1.2,
        glowColor: 0xff4444,
        description: 'Deadly apex predator!'
    },
    {
        name: 'GOLDEN MANTA',
        baseSpecies: 'mantaRay',
        sizeMultiplier: 2.2,  // GIANT sized
        hpMultiplier: 4,
        rewardMultiplier: 4,
        speedMultiplier: 0.9,
        glowColor: 0xffdd00,
        description: 'Majestic golden ray!'
    },
    {
        name: 'SARDINE SWARM',
        baseSpecies: 'sardine',
        sizeMultiplier: 1.0,  // Normal size but LARGE SCHOOL
        hpMultiplier: 2,
        rewardMultiplier: 3,
        speedMultiplier: 1.5,
        glowColor: 0x88ffff,
        description: 'Massive sardine school!',
        isSwarm: true,
        swarmCount: 50
    },
    {
        name: 'LIGHTNING MARLIN',
        baseSpecies: 'marlin',
        sizeMultiplier: 1.6,
        hpMultiplier: 3,
        rewardMultiplier: 3,
        speedMultiplier: 2.5,  // EXTREMELY FAST
        glowColor: 0xaa44ff,
        description: 'Blazing fast marlin!'
    }
];

// Issue #15: List of boss-only species that should NOT spawn during normal gameplay
// BUG FIX: Removed 'sardine' from boss-only list so small schooling fish appear during normal gameplay
// This fixes the "too few fish" bug - sardine has count:30 which was being excluded
const BOSS_ONLY_SPECIES = BOSS_FISH_TYPES
    .filter(boss => boss.baseSpecies !== 'sardine')  // Keep sardine for normal gameplay
    .map(boss => boss.baseSpecies);
// Result: ['blueWhale', 'greatWhiteShark', 'mantaRay', 'marlin'] - sardine now spawns normally

// ==================== WEAPON VFX SYSTEM (Issue #14) ====================
// Visual effects configuration and state for each weapon type
const WEAPON_VFX_CONFIG = {
    '1x': {
        muzzleColor: 0x88ddff,      // Light blue
        trailColor: 0xffffff,       // White
        hitColor: 0x88ddff,         // Light blue
        ringColor: 0xffffff,        // White for weapon switch
        recoilStrength: 3,
        screenShake: 0
    },
    '3x': {
        muzzleColor: 0x44ff44,      // Green
        trailColor: 0x44ff88,       // Green
        hitColor: 0x44ff44,         // Green
        ringColor: 0x44ff44,        // Green for weapon switch
        recoilStrength: 5,
        screenShake: 0
    },
    '5x': {
        muzzleColor: 0xffdd00,      // Golden yellow
        trailColor: 0xffcc00,       // Gold
        hitColor: 0xffdd00,         // Gold
        ringColor: 0xffdd00,        // Gold for weapon switch
        recoilStrength: 8,
        screenShake: 1,             // Slight shake
        chargeTime: 0.2             // 0.2s charge effect
    },
    '8x': {
        muzzleColor: 0xff4400,      // Red-orange
        trailColor: 0xff6600,       // Orange
        hitColor: 0xff2200,         // Red
        ringColor: 0xff2200,        // Red for weapon switch
        recoilStrength: 15,
        screenShake: 3,             // Strong shake
        chargeTime: 0.3             // 0.3s charge effect
    },
    '20x': {
        muzzleColor: 0xff00ff,      // Magenta/purple
        trailColor: 0xff88ff,       // Light magenta
        hitColor: 0xff00ff,         // Magenta
        ringColor: 0xff00ff,        // Magenta for weapon switch
        recoilStrength: 25,         // Massive recoil
        screenShake: 5,             // Very strong shake
        chargeTime: 0.5             // 0.5s charge effect (slow but powerful)
    }
};

// VFX state tracking
const vfxState = {
    chargeTimer: 0,
    isCharging: false,
    chargeWeapon: null,
    baseRingMesh: null,
    transientEffects: [],
    weaponSwitchAnimation: null
};

// ==================== AUDIO SYSTEM (Issue #6) ====================
// ==================== ENHANCED AUDIO SYSTEM (Issue #16) ====================
let audioContext = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let ambientGain = null;
let currentMusicState = 'normal';
let ambientLoopInterval = null;
let musicLoopInterval = null;

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create audio bus system
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.8;
        masterGain.connect(audioContext.destination);
        
        sfxGain = audioContext.createGain();
        sfxGain.gain.value = 1.0;
        sfxGain.connect(masterGain);
        
        musicGain = audioContext.createGain();
        musicGain.gain.value = 0.4;
        musicGain.connect(masterGain);
        
        ambientGain = audioContext.createGain();
        ambientGain.gain.value = 0.3;
        ambientGain.connect(masterGain);
        
        // Start ambient sounds after a short delay
        setTimeout(() => {
            startAmbientSounds();
            startBackgroundMusic('normal');
        }, 1000);
        
    } catch (e) {
        console.warn('Web Audio API not supported');
    }
}

// Issue #16: Create white noise buffer for explosion/splash sounds
function createNoiseBuffer(duration = 1) {
    if (!audioContext) return null;
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

// Issue #16: Play noise-based sound (for explosions, splashes, whooshes)
function playNoise(filterFreq, filterQ, duration, volume, filterType = 'lowpass') {
    if (!audioContext || !sfxGain) return;
    
    const noiseBuffer = createNoiseBuffer(duration);
    if (!noiseBuffer) return;
    
    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    
    source.start(now);
    source.stop(now + duration);
}

// Issue #16: Weapon-specific shooting sounds
function playWeaponShot(weaponKey) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const now = audioContext.currentTime;
    
    switch (weaponKey) {
        case '1x':
            // Light "pew" sound
            const osc1 = audioContext.createOscillator();
            const gain1 = audioContext.createGain();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(800, now);
            osc1.frequency.exponentialRampToValueAtTime(200, now + 0.08);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc1.connect(gain1);
            gain1.connect(sfxGain);
            osc1.start(now);
            osc1.stop(now + 0.08);
            break;
            
        case '3x':
            // Medium "boom" sound with multiple tones
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(300 - i * 50, audioContext.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.12);
                    gain.gain.setValueAtTime(0.15, audioContext.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.12);
                    osc.connect(gain);
                    gain.connect(sfxGain);
                    osc.start(audioContext.currentTime);
                    osc.stop(audioContext.currentTime + 0.12);
                }, i * 30);
            }
            break;
            
        case '5x':
            // Heavy "BOOM" with echo - electric zap
            const osc5 = audioContext.createOscillator();
            const gain5 = audioContext.createGain();
            osc5.type = 'sawtooth';
            osc5.frequency.setValueAtTime(1500, now);
            osc5.frequency.exponentialRampToValueAtTime(300, now + 0.15);
            gain5.gain.setValueAtTime(0.2, now);
            gain5.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc5.connect(gain5);
            gain5.connect(sfxGain);
            osc5.start(now);
            osc5.stop(now + 0.2);
            // Add echo
            setTimeout(() => {
                const echo = audioContext.createOscillator();
                const echoGain = audioContext.createGain();
                echo.type = 'sine';
                echo.frequency.setValueAtTime(800, audioContext.currentTime);
                echo.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.15);
                echoGain.gain.setValueAtTime(0.08, audioContext.currentTime);
                echoGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                echo.connect(echoGain);
                echoGain.connect(sfxGain);
                echo.start(audioContext.currentTime);
                echo.stop(audioContext.currentTime + 0.15);
            }, 100);
            break;
            
        case '8x':
            // Explosive "KABOOM!" with noise
            playNoise(200, 1, 0.4, 0.3, 'lowpass');
            const osc8 = audioContext.createOscillator();
            const gain8 = audioContext.createGain();
            osc8.type = 'sawtooth';
            osc8.frequency.setValueAtTime(150, now);
            osc8.frequency.exponentialRampToValueAtTime(30, now + 0.4);
            gain8.gain.setValueAtTime(0.25, now);
            gain8.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc8.connect(gain8);
            gain8.connect(sfxGain);
            osc8.start(now);
            osc8.stop(now + 0.4);
            break;
            
        case '20x':
            // Massive "EXPLOSION" with screen shake
            playNoise(150, 0.5, 0.6, 0.4, 'lowpass');
            // Low rumble
            const osc20a = audioContext.createOscillator();
            const gain20a = audioContext.createGain();
            osc20a.type = 'sine';
            osc20a.frequency.setValueAtTime(60, now);
            osc20a.frequency.exponentialRampToValueAtTime(20, now + 0.6);
            gain20a.gain.setValueAtTime(0.3, now);
            gain20a.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            osc20a.connect(gain20a);
            gain20a.connect(sfxGain);
            osc20a.start(now);
            osc20a.stop(now + 0.6);
            // High crack
            const osc20b = audioContext.createOscillator();
            const gain20b = audioContext.createGain();
            osc20b.type = 'sawtooth';
            osc20b.frequency.setValueAtTime(400, now);
            osc20b.frequency.exponentialRampToValueAtTime(50, now + 0.3);
            gain20b.gain.setValueAtTime(0.25, now);
            gain20b.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc20b.connect(gain20b);
            gain20b.connect(sfxGain);
            osc20b.start(now);
            osc20b.stop(now + 0.3);
            // Trigger screen shake
            triggerScreenShakeWithStrength(15, 500);
            break;
            
        default:
            // Fallback to basic shoot
            playSound('shoot');
    }
}

// Issue #16: Fish kill coin sounds based on fish size
function playCoinSound(fishSize) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const now = audioContext.currentTime;
    
    switch (fishSize) {
        case 'small':
            // Single "ding"
            const oscS = audioContext.createOscillator();
            const gainS = audioContext.createGain();
            oscS.type = 'sine';
            oscS.frequency.setValueAtTime(1200, now);
            oscS.frequency.setValueAtTime(1600, now + 0.05);
            gainS.gain.setValueAtTime(0.2, now);
            gainS.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            oscS.connect(gainS);
            gainS.connect(sfxGain);
            oscS.start(now);
            oscS.stop(now + 0.2);
            break;
            
        case 'medium':
            // Multiple "ding ding ding"
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1200 + i * 200, audioContext.currentTime);
                    osc.frequency.setValueAtTime(1600 + i * 200, audioContext.currentTime + 0.05);
                    gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                    osc.connect(gain);
                    gain.connect(sfxGain);
                    osc.start(audioContext.currentTime);
                    osc.stop(audioContext.currentTime + 0.15);
                }, i * 80);
            }
            break;
            
        case 'large':
            // "JACKPOT" chime - arpeggiated chord
            const notes = [800, 1000, 1200, 1500, 1800];
            notes.forEach((freq, i) => {
                setTimeout(() => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
                    gain.gain.setValueAtTime(0.25, audioContext.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                    osc.connect(gain);
                    gain.connect(sfxGain);
                    osc.start(audioContext.currentTime);
                    osc.stop(audioContext.currentTime + 0.4);
                }, i * 60);
            });
            break;
            
        case 'boss':
            // Epic reward fanfare (5 seconds)
            playBossFanfare();
            break;
            
        default:
            playCoinSound('small');
    }
}

// Issue #16: Epic boss kill fanfare
function playBossFanfare() {
    if (!audioContext || !sfxGain) return;
    
    // Victory chord progression
    const chords = [
        [523, 659, 784],      // C major
        [587, 740, 880],      // D major
        [659, 830, 988],      // E major
        [698, 880, 1047],     // F major
        [784, 988, 1175]      // G major
    ];
    
    chords.forEach((chord, chordIndex) => {
        setTimeout(() => {
            chord.forEach((freq, noteIndex) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = noteIndex === 0 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(freq, audioContext.currentTime);
                gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(audioContext.currentTime);
                osc.stop(audioContext.currentTime + 0.8);
            });
        }, chordIndex * 400);
    });
    
    // Final triumphant note
    setTimeout(() => {
        const finalOsc = audioContext.createOscillator();
        const finalGain = audioContext.createGain();
        finalOsc.type = 'sine';
        finalOsc.frequency.setValueAtTime(1047, audioContext.currentTime);  // High C
        finalGain.gain.setValueAtTime(0.3, audioContext.currentTime);
        finalGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
        finalOsc.connect(finalGain);
        finalGain.connect(sfxGain);
        finalOsc.start(audioContext.currentTime);
        finalOsc.stop(audioContext.currentTime + 1.5);
    }, 2000);
}

// Issue #16: Impact sounds
function playImpactSound(type) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const now = audioContext.currentTime;
    
    switch (type) {
        case 'hit':
            // Splash + damage indicator
            playNoise(1500, 2, 0.1, 0.15, 'bandpass');
            const oscH = audioContext.createOscillator();
            const gainH = audioContext.createGain();
            oscH.type = 'sine';
            oscH.frequency.setValueAtTime(600, now);
            oscH.frequency.exponentialRampToValueAtTime(200, now + 0.1);
            gainH.gain.setValueAtTime(0.15, now);
            gainH.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            oscH.connect(gainH);
            gainH.connect(sfxGain);
            oscH.start(now);
            oscH.stop(now + 0.1);
            break;
            
        case 'miss':
            // Subtle "whoosh"
            playNoise(3000, 1, 0.15, 0.08, 'highpass');
            break;
            
        case 'splash':
            // Water splash
            playNoise(800, 3, 0.2, 0.2, 'bandpass');
            break;
    }
}

// Issue #16: Background music system
function startBackgroundMusic(state) {
    if (!audioContext || !musicGain) return;
    
    // Clear existing music loop
    if (musicLoopInterval) {
        clearInterval(musicLoopInterval);
        musicLoopInterval = null;
    }
    
    currentMusicState = state;
    
    // Play music based on state
    const playMusicLoop = () => {
        if (!audioContext || audioContext.state === 'closed') return;
        
        const now = audioContext.currentTime;
        
        switch (currentMusicState) {
            case 'normal':
                // Calm underwater ambient music - slow arpeggios
                playAmbientChord([220, 277, 330], 2.0, 0.1);
                break;
                
            case 'approach':
                // Music tempo increases - faster arpeggios
                playAmbientChord([262, 330, 392], 1.0, 0.15);
                break;
                
            case 'boss':
                // Intense battle music - dramatic chords
                playBattleMusic();
                break;
                
            case 'victory':
                // Victory fanfare handled separately
                break;
        }
    };
    
    // Set loop interval based on state
    const intervals = {
        'normal': 4000,
        'approach': 2000,
        'boss': 1500,
        'victory': 0
    };
    
    if (intervals[state] > 0) {
        playMusicLoop();
        musicLoopInterval = setInterval(playMusicLoop, intervals[state]);
    }
}

// Issue #16: Play ambient chord for background music
function playAmbientChord(frequencies, duration, volume) {
    if (!audioContext || !musicGain) return;
    
    frequencies.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(volume * 0.7, audioContext.currentTime + duration * 0.7);
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + duration);
    });
}

// Issue #16: Battle music for boss mode
function playBattleMusic() {
    if (!audioContext || !musicGain) return;
    
    // Dramatic low notes
    const bassNotes = [110, 130, 110, 165];
    bassNotes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, audioContext.currentTime);
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(musicGain);
            osc.start(audioContext.currentTime);
            osc.stop(audioContext.currentTime + 0.3);
        }, i * 350);
    });
}

// Issue #16: Set music state (called from game logic)
function setMusicState(state) {
    if (currentMusicState !== state) {
        startBackgroundMusic(state);
    }
}

// Issue #16: Ambient underwater sounds
function startAmbientSounds() {
    if (!audioContext || !ambientGain) return;
    
    // Play bubble sounds periodically
    const playBubbles = () => {
        if (!audioContext || audioContext.state === 'closed') return;
        
        // Random bubble sound
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const freq = 400 + Math.random() * 400;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioContext.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ambientGain);
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.1);
    };
    
    // Play bubbles at random intervals
    ambientLoopInterval = setInterval(() => {
        if (Math.random() < 0.3) {
            playBubbles();
        }
    }, 500);
}

// Issue #16: Stop all audio
function stopAllAudio() {
    if (ambientLoopInterval) {
        clearInterval(ambientLoopInterval);
        ambientLoopInterval = null;
    }
    if (musicLoopInterval) {
        clearInterval(musicLoopInterval);
        musicLoopInterval = null;
    }
}

// Issue #16: Volume controls
function setMasterVolume(value) {
    if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, value));
}

function setSfxVolume(value) {
    if (sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, value));
}

function setMusicVolume(value) {
    if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, value));
}

function setAmbientVolume(value) {
    if (ambientGain) ambientGain.gain.value = Math.max(0, Math.min(1, value));
}

// Legacy playSound function - extended for backward compatibility
function playSound(type) {
    if (!audioContext) return;
    
    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(sfxGain || audioContext.destination);
    
    const now = audioContext.currentTime;
    
    switch (type) {
        case 'shoot':
            // Short punchy shoot sound
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(200, now);
            oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.1);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
            break;
            
        case 'hit':
            // Impact sound
            playImpactSound('hit');
            return;
            
        case 'coin':
            // Issue #5: Satisfying "ka-ching!" coin drop/collection sound
            oscillator.type = 'sine';
            // Rising "ching!" sound with sparkle
            oscillator.frequency.setValueAtTime(1200, now);
            oscillator.frequency.setValueAtTime(1800, now + 0.05);
            oscillator.frequency.setValueAtTime(2400, now + 0.1);
            oscillator.frequency.setValueAtTime(2000, now + 0.15);
            oscillator.frequency.setValueAtTime(2800, now + 0.2);
            gainNode.gain.setValueAtTime(0.25, now);  // Louder
            gainNode.gain.setValueAtTime(0.2, now + 0.1);
            gainNode.gain.setValueAtTime(0.25, now + 0.15);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            oscillator.start(now);
            oscillator.stop(now + 0.35);
            break;
            
        case 'weaponSwitch':
            // Weapon switch click
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.08);
            gainNode.gain.setValueAtTime(0.12, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            oscillator.start(now);
            oscillator.stop(now + 0.08);
            break;
            
        case 'explosion':
            // Explosion boom
            playNoise(200, 1, 0.4, 0.25, 'lowpass');
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(100, now);
            oscillator.frequency.exponentialRampToValueAtTime(30, now + 0.3);
            gainNode.gain.setValueAtTime(0.25, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            oscillator.start(now);
            oscillator.stop(now + 0.3);
            break;
            
        case 'lightning':
            // Electric zap
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(2000, now);
            oscillator.frequency.exponentialRampToValueAtTime(500, now + 0.1);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
            break;
            
        case 'rareFish':
            // Alert sound for rare fish
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(500, now);
            oscillator.frequency.setValueAtTime(700, now + 0.1);
            oscillator.frequency.setValueAtTime(500, now + 0.2);
            oscillator.frequency.setValueAtTime(900, now + 0.3);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.setValueAtTime(0.2, now + 0.3);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            oscillator.start(now);
            oscillator.stop(now + 0.5);
            break;
            
        case 'bossAlert':
            // Boss fish alert - dramatic warning sound (Issue #12)
            oscillator.type = 'sawtooth';
            // Rising alarm pattern
            oscillator.frequency.setValueAtTime(200, now);
            oscillator.frequency.setValueAtTime(400, now + 0.15);
            oscillator.frequency.setValueAtTime(200, now + 0.3);
            oscillator.frequency.setValueAtTime(600, now + 0.45);
            oscillator.frequency.setValueAtTime(300, now + 0.6);
            oscillator.frequency.setValueAtTime(800, now + 0.75);
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.setValueAtTime(0.25, now + 0.3);
            gainNode.gain.setValueAtTime(0.3, now + 0.6);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            oscillator.start(now);
            oscillator.stop(now + 1.0);
            // Start boss battle music
            setMusicState('boss');
            break;
            
        case 'bossDefeated':
            // Boss defeated victory sound
            playBossFanfare();
            setMusicState('normal');
            break;
            
        case 'miss':
            // Miss sound
            playImpactSound('miss');
            return;
    }
}

// ==================== RARE FISH EFFECTS (Issue #5) ====================
function triggerRareFishEffects(fishTier) {
    // Only trigger for tier4 (rare/boss fish)
    if (fishTier !== 'tier4') return;
    
    // Play alert sound
    playSound('rareFish');
    
    // Screen shake
    triggerScreenShake();
    
    // Show notification
    showRareFishNotification();
    
    // Red pulsing border
    triggerRedBorder();
}

function triggerScreenShake() {
    const container = document.getElementById('game-container');
    if (!container) return;
    
    container.classList.add('screen-shake');
    setTimeout(() => {
        container.classList.remove('screen-shake');
    }, 500);
}

function showRareFishNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'rare-fish-notification';
    notification.innerHTML = 'RARE FISH APPEARED!';
    document.body.appendChild(notification);
    
    // Remove after animation
    setTimeout(() => {
        notification.remove();
    }, 2000);
}

function triggerRedBorder() {
    const container = document.getElementById('game-container');
    if (!container) return;
    
    container.classList.add('red-pulse-border');
    setTimeout(() => {
        container.classList.remove('red-pulse-border');
    }, 1500);
}

// ==================== ENHANCED WEAPON VFX FUNCTIONS (Issue #14) ====================

// Enhanced screen shake with configurable strength
function triggerScreenShakeWithStrength(strength = 1) {
    const container = document.getElementById('game-container');
    if (!container || strength <= 0) return;
    
    // Create dynamic shake animation based on strength
    const intensity = Math.min(strength * 5, 20);
    const duration = Math.min(200 + strength * 100, 600);
    
    container.style.animation = `none`;
    container.offsetHeight; // Trigger reflow
    container.style.animation = `shake-${strength > 2 ? 'strong' : 'light'} ${duration}ms ease-out`;
    
    setTimeout(() => {
        container.style.animation = '';
    }, duration);
}

// Full screen flash effect (for powerful hits)
function triggerScreenFlash(color = 0xffffff, duration = 100, opacity = 0.3) {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #${color.toString(16).padStart(6, '0')};
        opacity: ${opacity};
        pointer-events: none;
        z-index: 9999;
        transition: opacity ${duration}ms ease-out;
    `;
    document.body.appendChild(flash);
    
    requestAnimationFrame(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), duration);
    });
}

// Spawn muzzle flash effect at cannon muzzle
function spawnMuzzleFlash(weaponKey, muzzlePos, direction) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config) return;
    
    if (weaponKey === '1x') {
        // Light blue energy ring expanding from barrel
        spawnExpandingRing(muzzlePos, config.muzzleColor, 15, 40, 0.3);
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 5);
        
    } else if (weaponKey === '3x') {
        // Three green energy waves from each barrel
        const offsets = [-12, 0, 12];
        offsets.forEach(offset => {
            const pos = muzzlePos.clone();
            pos.x += offset * 0.5;
            spawnExpandingRing(pos, config.muzzleColor, 12, 35, 0.25);
        });
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 10);
        // Barrel recoil/vibration handled in fireBullet
        
    } else if (weaponKey === '5x') {
        // Explosive golden lightning chain burst
        spawnExpandingRing(muzzlePos, config.muzzleColor, 20, 60, 0.4);
        spawnLightningBurst(muzzlePos, config.muzzleColor, 6);
        // Energy shield pulse around cannon base
        if (cannonGroup) {
            const basePos = cannonGroup.position.clone();
            basePos.y += 20;
            spawnExpandingRing(basePos, config.muzzleColor, 50, 100, 0.5);
        }
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 15);
        
    } else if (weaponKey === '8x') {
        // Giant red/orange fireball launch
        spawnFireballMuzzleFlash(muzzlePos, direction);
        // Shockwave rings around cannon
        if (cannonGroup) {
            const basePos = cannonGroup.position.clone();
            basePos.y += 30;
            spawnExpandingRing(basePos, 0xff4400, 40, 120, 0.6);
            spawnExpandingRing(basePos, 0xff8800, 30, 100, 0.5);
        }
        // Screen shake
        triggerScreenShakeWithStrength(config.screenShake);
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 25);
    }
}

// Spawn expanding ring effect
function spawnExpandingRing(position, color, startRadius, endRadius, duration) {
    const geometry = new THREE.TorusGeometry(startRadius, 3, 8, 32);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    
    const startTime = performance.now();
    const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        
        const scale = 1 + (endRadius / startRadius - 1) * progress;
        ring.scale.set(scale, scale, scale);
        ring.material.opacity = 0.8 * (1 - progress);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(ring);
            geometry.dispose();
            material.dispose();
        }
    };
    animate();
}

// Spawn muzzle particles
function spawnMuzzleParticles(position, direction, color, count) {
    for (let i = 0; i < count; i++) {
        const particle = particlePool.find(p => !p.isActive);
        if (!particle) continue;
        
        const spread = 0.5;
        const velocity = new THREE.Vector3(
            direction.x * 200 + (Math.random() - 0.5) * 100 * spread,
            direction.y * 200 + (Math.random() - 0.5) * 100 * spread,
            direction.z * 200 + (Math.random() - 0.5) * 100 * spread
        );
        
        particle.spawn(position.clone(), velocity, color, 0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.2);
        activeParticles.push(particle);
    }
}

// Spawn lightning burst effect (for 5x weapon)
function spawnLightningBurst(position, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const length = 30 + Math.random() * 20;
        const endPos = position.clone();
        endPos.x += Math.cos(angle) * length;
        endPos.y += (Math.random() - 0.5) * length * 0.5;
        endPos.z += Math.sin(angle) * length;
        
        spawnLightningArc(position, endPos, color);
    }
}

// Phase 2: Spawn lightning bolt between two positions (for Electric Eel ability)
function spawnLightningBoltBetween(startPos, endPos, color) {
    const points = [];
    const segments = 8;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = new THREE.Vector3().lerpVectors(startPos, endPos, t);
        
        // Add random offset for jagged lightning effect (except start and end)
        if (i > 0 && i < segments) {
            point.x += (Math.random() - 0.5) * 30;
            point.y += (Math.random() - 0.5) * 30;
            point.z += (Math.random() - 0.5) * 30;
        }
        points.push(point);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: color,
        linewidth: 3,
        transparent: true,
        opacity: 1.0
    });
    
    const lightning = new THREE.Line(geometry, material);
    scene.add(lightning);
    
    // Add glow effect
    const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 5,
        transparent: true,
        opacity: 0.5
    });
    const glow = new THREE.Line(geometry.clone(), glowMaterial);
    scene.add(glow);
    
    // Animate and remove
    let opacity = 1.0;
    const animate = () => {
        opacity -= 0.1;
        material.opacity = opacity;
        glowMaterial.opacity = opacity * 0.5;
        
        if (opacity > 0) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(lightning);
            scene.remove(glow);
            geometry.dispose();
            material.dispose();
            glowMaterial.dispose();
        }
    };
    animate();
}

// Phase 2: Show ability notification (for special fish abilities)
function showAbilityNotification(text, color) {
    const notification = document.createElement('div');
    const hexColor = '#' + color.toString(16).padStart(6, '0');
    
    notification.style.cssText = `
        position: fixed;
        top: 30%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 28px;
        font-weight: bold;
        color: ${hexColor};
        text-shadow: 0 0 10px ${hexColor}, 0 0 20px ${hexColor}, 2px 2px 4px rgba(0,0,0,0.8);
        z-index: 1000;
        pointer-events: none;
        animation: abilityNotification 1.5s ease-out forwards;
        font-family: 'Arial Black', sans-serif;
        letter-spacing: 2px;
    `;
    notification.textContent = text;
    document.body.appendChild(notification);
    
    // Add animation keyframes if not already added
    if (!document.getElementById('ability-notification-style')) {
        const style = document.createElement('style');
        style.id = 'ability-notification-style';
        style.textContent = `
            @keyframes abilityNotification {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                40% { transform: translate(-50%, -50%) scale(1.0); }
                100% { opacity: 0; transform: translate(-50%, -80%) scale(1.0); }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Remove after animation
    setTimeout(() => {
        notification.remove();
    }, 1500);
}

// Spawn fireball muzzle flash (for 8x weapon)
function spawnFireballMuzzleFlash(position, direction) {
    // Create fireball sphere
    const geometry = new THREE.SphereGeometry(25, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.9
    });
    
    const fireball = new THREE.Mesh(geometry, material);
    fireball.position.copy(position);
    scene.add(fireball);
    
    // Inner bright core
    const coreGeometry = new THREE.SphereGeometry(15, 12, 12);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff88,
        transparent: true,
        opacity: 1
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.copy(position);
    scene.add(core);
    
    let scale = 1;
    let opacity = 0.9;
    const animate = () => {
        scale += 0.15;
        opacity -= 0.08;
        
        fireball.scale.set(scale, scale, scale);
        fireball.material.opacity = Math.max(0, opacity);
        core.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
        core.material.opacity = Math.max(0, opacity * 1.2);
        
        if (opacity > 0) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(fireball);
            scene.remove(core);
            geometry.dispose();
            material.dispose();
            coreGeometry.dispose();
            coreMaterial.dispose();
        }
    };
    animate();
}

// Enhanced hit effect based on weapon type
function spawnWeaponHitEffect(weaponKey, hitPos, hitFish) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config) return;
    
    if (weaponKey === '1x') {
        // Small water splash + white light ring explosion
        spawnWaterSplash(hitPos, 20);
        spawnExpandingRing(hitPos, 0xffffff, 10, 30, 0.3);
        createHitParticles(hitPos, config.hitColor, 8);
        
    } else if (weaponKey === '3x') {
        // Medium green energy explosion + electric chain effect + water ripples
        spawnExpandingRing(hitPos, config.hitColor, 15, 50, 0.4);
        spawnWaterSplash(hitPos, 35);
        // Electric arc effects around impact
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const endPos = hitPos.clone();
            endPos.x += Math.cos(angle) * 40;
            endPos.z += Math.sin(angle) * 40;
            spawnLightningArc(hitPos, endPos, config.hitColor);
        }
        createHitParticles(hitPos, config.hitColor, 12);
        
    } else if (weaponKey === '5x') {
        // Large golden thunder explosion
        spawnExpandingRing(hitPos, config.hitColor, 25, 80, 0.5);
        spawnExpandingRing(hitPos, 0xffffaa, 20, 60, 0.4);
        spawnWaterSplash(hitPos, 50);
        // Screen edge flash
        triggerScreenFlash(config.hitColor, 100, 0.2);
        // Golden shockwave
        spawnShockwave(hitPos, config.hitColor, 100);
        createHitParticles(hitPos, config.hitColor, 20);
        // Slight screen shake
        triggerScreenShakeWithStrength(1);
        
    } else if (weaponKey === '8x') {
        // THREE-STAGE EXPLOSION
        spawnMegaExplosion(hitPos);
        // Strong screen shake
        triggerScreenShakeWithStrength(3);
        // Full-screen white flash
        triggerScreenFlash(0xffffff, 100, 0.4);
        // Massive water column
        spawnWaterColumn(hitPos, 80);
        // Knockback nearby fish
        applyExplosionKnockback(hitPos, 200, 150);
    }
}

// Spawn water splash effect
function spawnWaterSplash(position, size) {
    // Create splash ring on water surface
    const surfaceY = CONFIG.aquarium.height / 2 - 50;
    const splashPos = position.clone();
    splashPos.y = Math.min(splashPos.y, surfaceY);
    
    const geometry = new THREE.RingGeometry(size * 0.3, size, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0xaaddff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    
    const splash = new THREE.Mesh(geometry, material);
    splash.position.copy(splashPos);
    splash.rotation.x = -Math.PI / 2;
    scene.add(splash);
    
    let scale = 1;
    let opacity = 0.6;
    const animate = () => {
        scale += 0.1;
        opacity -= 0.05;
        
        splash.scale.set(scale, scale, scale);
        splash.material.opacity = Math.max(0, opacity);
        
        if (opacity > 0) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(splash);
            geometry.dispose();
            material.dispose();
        }
    };
    animate();
    
    // Spawn upward splash particles
    for (let i = 0; i < 8; i++) {
        const particle = particlePool.find(p => !p.isActive);
        if (!particle) continue;
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 50,
            50 + Math.random() * 80,
            (Math.random() - 0.5) * 50
        );
        
        particle.spawn(splashPos.clone(), velocity, 0xaaddff, 0.8, 0.5);
        activeParticles.push(particle);
    }
}

// Spawn shockwave effect (for 5x weapon)
function spawnShockwave(position, color, radius) {
    const geometry = new THREE.RingGeometry(1, 5, 32);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const shockwave = new THREE.Mesh(geometry, material);
    shockwave.position.copy(position);
    shockwave.rotation.x = -Math.PI / 2;
    scene.add(shockwave);
    
    const startTime = performance.now();
    const duration = 0.5;
    const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        
        const scale = 1 + (radius / 5) * progress;
        shockwave.scale.set(scale, scale, scale);
        shockwave.material.opacity = 0.7 * (1 - progress);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(shockwave);
            geometry.dispose();
            material.dispose();
        }
    };
    animate();
}

// Spawn mega explosion (three-stage for 8x weapon)
function spawnMegaExplosion(position) {
    // Stage 1: Core white flash (0-0.1s)
    const coreGeometry = new THREE.SphereGeometry(20, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.copy(position);
    scene.add(core);
    
    // Stage 2: Orange-red fireball (0.05-0.4s)
    setTimeout(() => {
        const fireballGeometry = new THREE.SphereGeometry(30, 16, 16);
        const fireballMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.8
        });
        const fireball = new THREE.Mesh(fireballGeometry, fireballMaterial);
        fireball.position.copy(position);
        scene.add(fireball);
        
        // Inner orange core
        const innerGeometry = new THREE.SphereGeometry(20, 12, 12);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.9
        });
        const inner = new THREE.Mesh(innerGeometry, innerMaterial);
        inner.position.copy(position);
        scene.add(inner);
        
        let scale = 1;
        let opacity = 0.8;
        const animateFireball = () => {
            scale += 0.12;
            opacity -= 0.03;
            
            fireball.scale.set(scale, scale, scale);
            fireball.material.opacity = Math.max(0, opacity);
            inner.scale.set(scale * 0.7, scale * 0.7, scale * 0.7);
            inner.material.opacity = Math.max(0, opacity * 1.1);
            
            if (opacity > 0) {
                requestAnimationFrame(animateFireball);
            } else {
                scene.remove(fireball);
                scene.remove(inner);
                fireballGeometry.dispose();
                fireballMaterial.dispose();
                innerGeometry.dispose();
                innerMaterial.dispose();
            }
        };
        animateFireball();
    }, 50);
    
    // Stage 3: Black smoke lingering (0.2-2s)
    setTimeout(() => {
        for (let i = 0; i < 15; i++) {
            const smokeGeometry = new THREE.SphereGeometry(15 + Math.random() * 10, 8, 8);
            const smokeMaterial = new THREE.MeshBasicMaterial({
                color: 0x333333,
                transparent: true,
                opacity: 0.4
            });
            const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
            smoke.position.copy(position);
            smoke.position.x += (Math.random() - 0.5) * 40;
            smoke.position.y += Math.random() * 30;
            smoke.position.z += (Math.random() - 0.5) * 40;
            scene.add(smoke);
            
            const riseSpeed = 20 + Math.random() * 30;
            const startTime = performance.now();
            const duration = 1.5 + Math.random() * 0.5;
            
            const animateSmoke = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                
                smoke.position.y += riseSpeed * 0.016;
                smoke.scale.setScalar(1 + progress * 0.5);
                smoke.material.opacity = 0.4 * (1 - progress);
                
                if (progress < 1) {
                    requestAnimationFrame(animateSmoke);
                } else {
                    scene.remove(smoke);
                    smokeGeometry.dispose();
                    smokeMaterial.dispose();
                }
            };
            animateSmoke();
        }
    }, 200);
    
    // Animate core flash
    let coreScale = 1;
    let coreOpacity = 1;
    const animateCore = () => {
        coreScale += 0.3;
        coreOpacity -= 0.15;
        
        core.scale.set(coreScale, coreScale, coreScale);
        core.material.opacity = Math.max(0, coreOpacity);
        
        if (coreOpacity > 0) {
            requestAnimationFrame(animateCore);
        } else {
            scene.remove(core);
            coreGeometry.dispose();
            coreMaterial.dispose();
        }
    };
    animateCore();
    
    // Spawn flame particles that remain at impact
    for (let i = 0; i < 30; i++) {
        const particle = particlePool.find(p => !p.isActive);
        if (!particle) continue;
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            Math.random() * 80,
            (Math.random() - 0.5) * 100
        );
        
        const colors = [0xff4400, 0xff6600, 0xffaa00, 0xff2200];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        particle.spawn(position.clone(), velocity, color, 1 + Math.random(), 1.5 + Math.random() * 0.5);
        activeParticles.push(particle);
    }
}

// Spawn water column (for 8x weapon)
function spawnWaterColumn(position, height) {
    const surfaceY = CONFIG.aquarium.height / 2 - 50;
    const columnPos = position.clone();
    columnPos.y = surfaceY;
    
    // Create column of water particles rising up
    for (let i = 0; i < 20; i++) {
        const particle = particlePool.find(p => !p.isActive);
        if (!particle) continue;
        
        const startPos = columnPos.clone();
        startPos.x += (Math.random() - 0.5) * 30;
        startPos.z += (Math.random() - 0.5) * 30;
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            height + Math.random() * height * 0.5,
            (Math.random() - 0.5) * 20
        );
        
        particle.spawn(startPos, velocity, 0x88ccff, 1.5, 1.0);
        activeParticles.push(particle);
    }
}

// Apply knockback to nearby fish from explosion
// Issue #16: Enhanced fish death explosion effects based on fish size
function spawnFishDeathEffect(position, fishSize, color) {
    if (!scene) return;
    
    switch (fishSize) {
        case 'small':
            // Small splash particles + water ripple
            spawnWaterSplash(position.clone(), 0.5);
            createHitParticles(position, color, 8);
            break;
            
        case 'medium':
            // Larger explosion + gold coins fly out
            spawnWaterSplash(position.clone(), 0.8);
            createHitParticles(position, color, 15);
            spawnCoinBurst(position.clone(), 5);
            spawnExpandingRing(position.clone(), 0x44aaff, 30, 80);
            break;
            
        case 'large':
            // Huge explosion + screen flash + coins shower
            spawnWaterSplash(position.clone(), 1.2);
            createHitParticles(position, color, 25);
            spawnCoinBurst(position.clone(), 12);
            spawnExpandingRing(position.clone(), 0xffdd44, 50, 150);
            triggerScreenFlash(0xffffcc, 0.3, 150);
            triggerScreenShakeWithStrength(5, 200);
            break;
            
        case 'boss':
            // Massive explosion + light pillar + coin rain + screen shake
            spawnBossDeathEffect(position.clone(), color);
            break;
    }
}

// Issue #16: Spawn gold coins burst from fish death
function spawnCoinBurst(position, count) {
    if (!particleGroup) return;
    
    for (let i = 0; i < count; i++) {
        const coinGeometry = new THREE.CylinderGeometry(8, 8, 3, 8);
        const coinMaterial = new THREE.MeshBasicMaterial({
            color: 0xffd700,
            transparent: true,
            opacity: 1
        });
        const coin = new THREE.Mesh(coinGeometry, coinMaterial);
        coin.position.copy(position);
        coin.rotation.x = Math.PI / 2;
        
        // Random velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 200,
            Math.random() * 150 + 50,
            (Math.random() - 0.5) * 200
        );
        
        particleGroup.add(coin);
        
        // Animate coin flying and fading
        let time = 0;
        const animate = () => {
            time += 0.016;
            coin.position.add(velocity.clone().multiplyScalar(0.016));
            velocity.y -= 300 * 0.016; // Gravity
            coin.rotation.z += 0.2;
            coin.material.opacity = Math.max(0, 1 - time * 1.5);
            coin.scale.setScalar(Math.max(0.1, 1 - time));
            
            if (time < 1.0 && coin.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                particleGroup.remove(coin);
                coinGeometry.dispose();
                coinMaterial.dispose();
            }
        };
        animate();
    }
}

// Issue #16: Coin fly animation to cannon (bottom-center)
function spawnCoinFlyToScore(startPosition, coinCount, reward) {
    if (!particleGroup || !cannon) return;
    
    // Get cannon position as target
    const cannonPos = new THREE.Vector3();
    cannon.getWorldPosition(cannonPos);
    
    for (let i = 0; i < Math.min(coinCount, 15); i++) {
        setTimeout(() => {
            const coinGeometry = new THREE.SphereGeometry(12, 8, 8);
            const coinMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 1
            });
            const coin = new THREE.Mesh(coinGeometry, coinMaterial);
            
            // Start position with slight random offset
            coin.position.copy(startPosition);
            coin.position.x += (Math.random() - 0.5) * 50;
            coin.position.y += (Math.random() - 0.5) * 50;
            coin.position.z += (Math.random() - 0.5) * 50;
            
            particleGroup.add(coin);
            
            // Create glowing trail
            const trailGeometry = new THREE.SphereGeometry(8, 6, 6);
            const trailMaterial = new THREE.MeshBasicMaterial({
                color: 0xffee88,
                transparent: true,
                opacity: 0.6
            });
            const trail = new THREE.Mesh(trailGeometry, trailMaterial);
            trail.position.copy(coin.position);
            particleGroup.add(trail);
            
            // Animation variables
            let time = 0;
            const duration = 0.6 + Math.random() * 0.2;  // Slightly faster
            const startPos = coin.position.clone();
            
            // Calculate arc trajectory toward cannon
            const midPoint = startPos.clone().lerp(cannonPos, 0.5);
            midPoint.y += 100 + Math.random() * 50;  // Arc upward at midpoint
            
            // Target position is the cannon
            const targetPos = cannonPos.clone();
            targetPos.y += 50;  // Slightly above cannon base
            
            const animate = () => {
                time += 0.016;
                const t = Math.min(time / duration, 1);
                
                // Bezier curve for arc trajectory
                const t2 = t * t;
                const t3 = t2 * t;
                const mt = 1 - t;
                const mt2 = mt * mt;
                
                // Quadratic bezier
                coin.position.x = mt2 * startPos.x + 2 * mt * t * midPoint.x + t2 * targetPos.x;
                coin.position.y = mt2 * startPos.y + 2 * mt * t * midPoint.y + t2 * targetPos.y;
                coin.position.z = mt2 * startPos.z + 2 * mt * t * midPoint.z + t2 * targetPos.z;
                
                // Trail follows with delay
                trail.position.lerp(coin.position, 0.3);
                
                // Scale up as it gets closer (magnetic effect)
                const scale = 1 + t * 0.5;
                coin.scale.setScalar(scale);
                
                // Spin the coin
                coin.rotation.x += 0.3;
                coin.rotation.y += 0.2;
                
                // Fade trail
                trailMaterial.opacity = 0.6 * (1 - t);
                
                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Coin reached score - create pop effect
                    spawnScorePopEffect();
                    
                    // Clean up
                    particleGroup.remove(coin);
                    particleGroup.remove(trail);
                    coinGeometry.dispose();
                    coinMaterial.dispose();
                    trailGeometry.dispose();
                    trailMaterial.dispose();
                }
            };
            animate();
        }, i * 50);  // Stagger coin spawns
    }
}

// Issue #16: Score pop effect when coins arrive at cannon
function spawnScorePopEffect() {
    // Create a DOM element for the pop effect at cannon location (bottom-center)
    const pop = document.createElement('div');
    pop.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 60px;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.9), rgba(255, 200, 0, 0.5), transparent);
        border-radius: 50%;
        pointer-events: none;
        z-index: 1000;
        animation: scorePop 0.4s ease-out forwards;
    `;
    document.body.appendChild(pop);
    
    // Add animation keyframes if not already added
    if (!document.getElementById('score-pop-style')) {
        const style = document.createElement('style');
        style.id = 'score-pop-style';
        style.textContent = `
            @keyframes scorePop {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(2); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Remove after animation
    setTimeout(() => {
        document.body.removeChild(pop);
    }, 300);
}

// Issue #16: Boss death spectacular effect
function spawnBossDeathEffect(position, color) {
    // Massive explosion
    spawnMegaExplosion(position.clone(), 2.0);
    
    // Light pillar shooting up
    const pillarGeometry = new THREE.CylinderGeometry(30, 60, 800, 16);
    const pillarMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffaa,
        transparent: true,
        opacity: 0.8
    });
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    pillar.position.copy(position);
    pillar.position.y += 400;
    scene.add(pillar);
    
    // Coin rain
    spawnCoinBurst(position.clone(), 30);
    
    // Multiple expanding rings
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            spawnExpandingRing(position.clone(), 0xffdd00, 80 + i * 30, 200 + i * 50);
        }, i * 150);
    }
    
    // Screen effects
    triggerScreenFlash(0xffff88, 0.5, 300);
    triggerScreenShakeWithStrength(15, 500);
    
    // Animate pillar
    let opacity = 0.8;
    const animatePillar = () => {
        opacity -= 0.02;
        pillarMaterial.opacity = opacity;
        pillar.scale.x *= 1.02;
        pillar.scale.z *= 1.02;
        pillar.position.y += 10;
        
        if (opacity > 0) {
            requestAnimationFrame(animatePillar);
        } else {
            scene.remove(pillar);
            pillarGeometry.dispose();
            pillarMaterial.dispose();
        }
    };
    animatePillar();
}

function applyExplosionKnockback(center, radius, strength) {
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        
        const distance = center.distanceTo(fish.group.position);
        if (distance < radius && distance > 0) {
            // Calculate knockback direction and strength
            const dir = fish.group.position.clone().sub(center).normalize();
            const knockbackStrength = strength * (1 - distance / radius);
            
            // Apply knockback velocity
            if (!fish.knockbackVelocity) {
                fish.knockbackVelocity = new THREE.Vector3();
            }
            fish.knockbackVelocity.add(dir.multiplyScalar(knockbackStrength));
            fish.knockbackTime = 0.5; // Knockback lasts 0.5 seconds
        }
    }
}

// Weapon switch animation
function playWeaponSwitchAnimation(weaponKey) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config || !cannonGroup) return;
    
    // Animate base ring color change
    const ring = cannonGroup.children.find(child => 
        child.geometry && child.geometry.type === 'TorusGeometry'
    );
    if (ring && ring.material) {
        ring.material.color.setHex(config.ringColor);
    }
    
    // Cannon transformation animation (slight bounce)
    const originalScale = cannonGroup.scale.clone();
    cannonGroup.scale.set(
        originalScale.x * 0.9,
        originalScale.y * 1.1,
        originalScale.z * 0.9
    );
    
    setTimeout(() => {
        cannonGroup.scale.copy(originalScale);
    }, 100);
    
    // Spawn ring effect at cannon base
    const basePos = cannonGroup.position.clone();
    basePos.y += 30;
    spawnExpandingRing(basePos, config.ringColor, 30, 60, 0.3);
}

// Cannon charge effect (for 5x and 8x weapons)
function startCannonChargeEffect(weaponKey) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config || !config.chargeTime) return;
    
    vfxState.isCharging = true;
    vfxState.chargeWeapon = weaponKey;
    vfxState.chargeTimer = config.chargeTime;
    
    // Visual charge effect on cannon barrel
    if (cannonBarrel && cannonBarrel.material) {
        const originalEmissive = cannonBarrel.material.emissive ? 
            cannonBarrel.material.emissive.getHex() : 0x000000;
        
        if (weaponKey === '5x') {
            // Golden glow-up
            cannonBarrel.material.emissive = new THREE.Color(0xffdd00);
            cannonBarrel.material.emissiveIntensity = 0.8;
        } else if (weaponKey === '8x') {
            // Red warning glow + flashing
            cannonBarrel.material.emissive = new THREE.Color(0xff2200);
            cannonBarrel.material.emissiveIntensity = 1.0;
            
            // Spawn particles pulling INTO the barrel
            if (cannonMuzzle) {
                const muzzlePos = new THREE.Vector3();
                cannonMuzzle.getWorldPosition(muzzlePos);
                
                for (let i = 0; i < 10; i++) {
                    const particle = particlePool.find(p => !p.isActive);
                    if (!particle) continue;
                    
                    // Start position around the muzzle
                    const startPos = muzzlePos.clone();
                    startPos.x += (Math.random() - 0.5) * 100;
                    startPos.y += (Math.random() - 0.5) * 100;
                    startPos.z += (Math.random() - 0.5) * 100;
                    
                    // Velocity pointing toward muzzle
                    const velocity = muzzlePos.clone().sub(startPos).normalize().multiplyScalar(150);
                    
                    particle.spawn(startPos, velocity, 0xff4400, 0.8, config.chargeTime);
                    activeParticles.push(particle);
                }
            }
        }
        
        // Reset after charge time
        setTimeout(() => {
            if (cannonBarrel && cannonBarrel.material) {
                cannonBarrel.material.emissiveIntensity = 0.2;
            }
            vfxState.isCharging = false;
        }, config.chargeTime * 1000);
    }
}

// Update transient VFX effects (called in game loop)
function updateWeaponVFX(deltaTime) {
    // Update fish knockback
    for (const fish of activeFish) {
        if (fish.knockbackTime && fish.knockbackTime > 0 && fish.knockbackVelocity) {
            fish.knockbackTime -= deltaTime;
            
            // Apply knockback velocity with decay
            fish.group.position.add(
                fish.knockbackVelocity.clone().multiplyScalar(deltaTime)
            );
            
            // Decay knockback velocity
            fish.knockbackVelocity.multiplyScalar(0.9);
            
            // Clamp to aquarium bounds
            const { width, height, depth } = CONFIG.aquarium;
            fish.group.position.x = Math.max(-width/2 + 50, Math.min(width/2 - 50, fish.group.position.x));
            fish.group.position.y = Math.max(-height/2 + 50, Math.min(height/2 - 50, fish.group.position.y));
            fish.group.position.z = Math.max(-depth/2 + 50, Math.min(depth/2 - 50, fish.group.position.z));
            
            if (fish.knockbackTime <= 0) {
                fish.knockbackVelocity = null;
            }
        }
    }
}

// ==================== THREE.JS SETUP ====================
let scene, camera, renderer;
let tunnelGroup, fishGroup, bulletGroup, particleGroup;
let cannonGroup, cannonBarrel;
let raycaster, mouse;

// Object pools
const fishPool = [];
const bulletPool = [];
const particlePool = [];
const activeFish = [];
const activeBullets = [];
const activeParticles = [];

// Timing
let lastTime = 0;
let deltaTime = 0;
let fpsCounter = 0;
let fpsTime = 0;
let autoShootTimer = 0;

// ==================== INITIALIZATION ====================
// Flag to track if game scene has been initialized
let gameSceneInitialized = false;

function init() {
    // Lazy initialization: Only set gameLoaded flag, defer heavy Three.js initialization
    // This prevents the game scene from flashing before the lobby is shown
    console.log('Lobby initialized - game scene deferred until game start');
    window.gameLoaded = true;
}

// Full game scene initialization - called when game actually starts
function initGameScene() {
    // Prevent double initialization
    if (gameSceneInitialized) {
        console.log('Game scene already initialized');
        return;
    }
    gameSceneInitialized = true;
    
    console.log('Initializing game scene...');
    
    // Show loading screen
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
    
    updateLoadingProgress(10, 'Initializing Three.js...');
    
    // Issue #6: Initialize audio system
    initAudio();
    
    // Create scene
    scene = new THREE.Scene();
    // Issue #3: LIGHT BLUE background for clear aquarium feel (淺藍色)
    scene.background = new THREE.Color(0x5599cc);  // Light blue aquarium background
    scene.fog = new THREE.Fog(0x5599cc, 800, 6000);  // Subtle fog for depth
    
    // Create camera (viewing from outside the tank)
    camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        CONFIG.camera.near,
        CONFIG.camera.far
    );
    // Position camera outside the tank, looking at center
    const { orbitRadius, targetY, initialHeight } = CONFIG.camera;
    camera.position.set(0, initialHeight, -orbitRadius);
    camera.lookAt(0, targetY, 0);  // Look at tank center
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Raycaster for shooting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    updateLoadingProgress(30, 'Creating underwater tunnel...');
    createTunnelScene();
    
    updateLoadingProgress(50, 'Setting up lights...');
    createLights();
    
    updateLoadingProgress(60, 'Creating cannon...');
    createCannon();
    
    // Create static decorative cannons at 3, 6, 9 o'clock positions
    createAllCannons();
    
    updateLoadingProgress(70, 'Spawning fish...');
    createFishPool();
    spawnInitialFish();
    
    updateLoadingProgress(85, 'Creating particle systems...');
    createParticleSystems();
    
    updateLoadingProgress(95, 'Setting up controls...');
    setupEventListeners();
    
    updateLoadingProgress(100, 'Ready!');
    
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        gameState.isLoading = false;
        lastTime = performance.now();
        
        // Issue 1 Fix: Use dedicated reset function on init
        // This sets the canonical 3RD PERSON camera position with absolute values
        resetThirdPersonCamera();
        
        // Apply RTP labels to weapon buttons if enabled
        applyRtpLabels();
        
        // Initialize settings UI and apply saved settings
        initSettingsUI();
        applyAllSettings();
        
        animate();
    }, 500);
}

// Start single player game - called from lobby
window.startSinglePlayerGame = function() {
    console.log('Starting single player game...');
    
    // Show game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    }
    
    // Mark that we're now in the game scene (not lobby)
    gameState.isInGameScene = true;
    
    // Reset boss event timers for fresh game start
    gameState.bossSpawnTimer = 60;
    gameState.bossActive = false;
    gameState.bossCountdown = 0;
    gameState.activeBoss = null;
    hideBossUI();
    hideBossWaitingUI();
    
    // Initialize game scene if not already done
    initGameScene();
};

// Start multiplayer game - called from lobby
window.startMultiplayerGame = function(manager) {
    console.log('Starting multiplayer game...');
    
    // Show game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'block';
    }
    
    // Store multiplayer reference
    window.multiplayer = manager;
    
    // Mark that we're now in the game scene (not lobby)
    gameState.isInGameScene = true;
    
    // Reset boss event timers for fresh game start
    gameState.bossSpawnTimer = 60;
    gameState.bossActive = false;
    gameState.bossCountdown = 0;
    gameState.activeBoss = null;
    hideBossUI();
    hideBossWaitingUI();
    
    // Set multiplayer mode state (must be before initGameScene)
    multiplayerMode = true;
    multiplayerManager = manager;
    
    // Setup multiplayer callbacks
    if (multiplayerManager) {
        // Handle game state updates from server
        multiplayerManager.onGameState = function(data) {
            // Update fish from server state
            updateFishFromServer(data.fish);
            
            // Update bullets from server state
            updateBulletsFromServer(data.bullets);
            
            // Update other players
            updatePlayersFromServer(data.players);
        };
        
        // Handle fish killed events
        // Server sends: fishId, typeName, topContributorId (normalized to killedBy), totalReward (normalized to reward), isBoss, position
        multiplayerManager.onFishKilled = function(data) {
            console.log('[GAME] Fish killed event received:', data.fishId, data.typeName, 'killedBy:', data.killedBy, 'reward:', data.reward);
            
            const fish = gameState.fish.find(f => f.userData && f.userData.serverId === data.fishId);
            if (fish) {
                console.log('[GAME] Found fish mesh to remove:', data.fishId);
                
                // Play death effects
                spawnFishDeathEffect(fish.position.clone(), fish.userData.size || 30, fish.userData.color || 0xffffff);
                
                // Show reward if we killed it (or contributed to the kill)
                if (data.killedBy === multiplayerManager.playerId) {
                    spawnCoinFlyToScore(fish.position.clone(), data.reward);
                    playSound('coin');
                }
                
                // Remove fish from scene
                scene.remove(fish);
                const index = gameState.fish.indexOf(fish);
                if (index > -1) {
                    gameState.fish.splice(index, 1);
                    console.log('[GAME] Fish removed from gameState.fish, remaining:', gameState.fish.length);
                }
            } else {
                console.log('[GAME] Fish mesh not found for fishId:', data.fishId, '- may have already been removed by gameState update');
            }
        };
        
        // Handle balance updates
        multiplayerManager.onBalanceUpdate = function(data) {
            gameState.balance = data.balance;
            updateUI();
        };
        
        // Handle boss wave events
        multiplayerManager.onBossWave = function(data) {
            if (data.state === 'starting') {
                playBossFanfare();
                showRareFishNotification('BOSS WAVE INCOMING!');
            }
        };
    }
    
    console.log('Multiplayer game started with manager:', manager);
    
    // Initialize game scene if not already done
    initGameScene();
};

function updateLoadingProgress(percent, text) {
    document.getElementById('loading-progress').style.width = percent + '%';
    document.getElementById('loading-text').textContent = text;
}

// ==================== 3D MAP LOADING ====================
const MAP_URL = 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/MAP.glb';
let loadedMapScene = null;  // Cache loaded map to avoid reloading

function loadMap3D(onComplete) {
    // Check if map is already loaded
    if (loadedMapScene) {
        console.log('[MAP] Using cached map');
        onComplete(loadedMapScene.clone());
        return;
    }
    
    const overlay = document.getElementById('map-loading-overlay');
    const bar = document.getElementById('map-loading-bar');
    const percent = document.getElementById('map-loading-percent');
    const sizeInfo = document.getElementById('map-loading-size');
    
    // Show loading overlay
    overlay.style.display = 'flex';
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        MAP_URL,
        // onLoad callback
        (gltf) => {
            console.log('[MAP] Map loaded successfully');
            loadedMapScene = gltf.scene;
            
            // Setup map materials and shadows
            setupMapMaterials(gltf.scene);
            
            // Hide loading overlay
            overlay.style.display = 'none';
            
            onComplete(gltf.scene);
        },
        // onProgress callback
        (xhr) => {
            if (xhr.total) {
                const percentValue = (xhr.loaded / xhr.total) * 100;
                bar.style.width = percentValue.toFixed(1) + '%';
                percent.textContent = percentValue.toFixed(0) + '%';
                
                // Update size info
                const loadedMB = (xhr.loaded / 1024 / 1024).toFixed(1);
                const totalMB = (xhr.total / 1024 / 1024).toFixed(1);
                sizeInfo.textContent = loadedMB + ' / ' + totalMB + ' MB';
            } else {
                // Indeterminate progress
                percent.textContent = 'Loading...';
            }
        },
        // onError callback
        (error) => {
            console.error('[MAP] Failed to load map:', error);
            overlay.style.display = 'none';
            // Fall back to procedural aquarium
            createProceduralAquarium();
        }
    );
}

function setupMapMaterials(mapScene) {
    // Preserve original materials, only adjust rendering settings
    mapScene.traverse((obj) => {
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            
            // Ensure textures use correct color space
            if (obj.material) {
                const mat = obj.material;
                if (mat.map && mat.map.isTexture) {
                    mat.map.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
                }
            }
        }
    });
}

function scaleAndPositionMap(mapScene) {
    const { width, height, depth, floorY } = CONFIG.aquarium;
    
    // Calculate map bounding box
    const box = new THREE.Box3().setFromObject(mapScene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    
    console.log('[MAP] Original size:', size);
    console.log('[MAP] Original center:', center);
    
    // Center the map at origin first
    mapScene.position.sub(center);
    
    // Calculate uniform scale to fit aquarium while preserving aspect ratio
    const scaleX = width / size.x;
    const scaleZ = depth / size.z;
    const uniformScale = Math.min(scaleX, scaleZ);
    
    mapScene.scale.setScalar(uniformScale);
    
    console.log('[MAP] Applied scale:', uniformScale);
    
    // Recalculate bounds after scaling
    const scaledBox = new THREE.Box3().setFromObject(mapScene);
    
    // Position so bottom of map aligns with aquarium floor
    const deltaY = floorY - scaledBox.min.y;
    mapScene.position.y += deltaY;
    
    console.log('[MAP] Final position:', mapScene.position);
    
    return mapScene;
}

// ==================== CLEAN AQUARIUM SCENE ====================
function createTunnelScene() {
    // Renamed but kept for compatibility - now creates aquarium
    createAquariumScene();
}

function createAquariumScene() {
    tunnelGroup = new THREE.Group();
    scene.add(tunnelGroup);
    
    // Load 3D map from R2
    loadMap3D((mapScene) => {
        // Scale and position the map to fit aquarium bounds
        scaleAndPositionMap(mapScene);
        tunnelGroup.add(mapScene);
        console.log('[MAP] 3D map added to scene');
    });
}

// Fallback procedural aquarium (used if map fails to load)
function createProceduralAquarium() {
    const { width, height, depth, floorY } = CONFIG.aquarium;
    
    // Room background (outside the tank)
    createRoomBackground();
    
    // Glass tank walls
    createGlassTank(width, height, depth, floorY);
    
    // Water volume inside tank
    createWaterVolume(width, height, depth, floorY);
    
    // Clean flat floor inside tank (light sand color)
    const tankFloorGeometry = new THREE.PlaneGeometry(width - 20, depth - 20);
    const tankFloorMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4c4a8,  // Light sand color
        roughness: 0.9,
        metalness: 0.0
    });
    const tankFloor = new THREE.Mesh(tankFloorGeometry, tankFloorMaterial);
    tankFloor.rotation.x = -Math.PI / 2;
    tankFloor.position.y = floorY + 5;
    tankFloor.receiveShadow = true;
    tunnelGroup.add(tankFloor);
}

function createRoomBackground() {
    // Room background removed per user request - pure black background
    // Only the aquarium tank should be visible
}

function createGlassTank(width, height, depth, floorY) {
    // Glass material - transparent with slight reflection
    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        roughness: 0.05,
        metalness: 0.0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.5
    });
    
    const centerY = floorY + height / 2;
    const thickness = CONFIG.aquarium.glassThickness;
    
    // Front glass (facing camera)
    const frontGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        glassMaterial.clone()
    );
    frontGlass.position.set(0, centerY, -depth / 2);
    tunnelGroup.add(frontGlass);
    
    // Back glass
    const backGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        glassMaterial.clone()
    );
    backGlass.position.set(0, centerY, depth / 2);
    backGlass.rotation.y = Math.PI;
    tunnelGroup.add(backGlass);
    
    // Left glass
    const leftGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(depth, height),
        glassMaterial.clone()
    );
    leftGlass.position.set(-width / 2, centerY, 0);
    leftGlass.rotation.y = Math.PI / 2;
    tunnelGroup.add(leftGlass);
    
    // Right glass
    const rightGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(depth, height),
        glassMaterial.clone()
    );
    rightGlass.position.set(width / 2, centerY, 0);
    rightGlass.rotation.y = -Math.PI / 2;
    tunnelGroup.add(rightGlass);
    
    // Frame borders removed per user request - clean aquarium look
}

function createWaterVolume(width, height, depth, floorY) {
    // Issue #3: Water volume - LIGHT BLUE/CYAN aquarium water (淺藍色)
    // Bright, clear aquarium water - NOT deep ocean blue
    const waterGeometry = new THREE.BoxGeometry(width - 30, height - 30, depth - 30);
    const waterMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xaaddff,  // LIGHT BLUE - bright cyan aquarium water (淺藍色)
        transparent: true,
        opacity: 0.2,     // Clear water tint
        roughness: 0.0,
        metalness: 0.0,
        depthWrite: false
    });
    
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.set(0, floorY + height / 2, 0);
    water.renderOrder = -1;  // Render before fish
    tunnelGroup.add(water);
    
    // Water surface at top - light blue shimmer
    const surfaceGeometry = new THREE.PlaneGeometry(width - 20, depth - 20);
    const surfaceMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xbbddff,  // Light cyan surface
        transparent: true,
        opacity: 0.25,    // Subtle surface
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = floorY + height - 10;
    tunnelGroup.add(surface);
}

function createRockFormations() {
    // CLEAN AQUARIUM - no rocks or decorations
}

function createSeaweed() {
    // CLEAN AQUARIUM - no seaweed for cleaner look
}

// ==================== LIGHTING ====================
function createLights() {
    const { width, height, depth, floorY } = CONFIG.aquarium;
    
    // Reduced ambient light - pure black background needs less ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    
    // Remove hemisphere light - it creates grey background
    // Only use focused lights on the aquarium
    
    // Aquarium tank light (from above the tank) - main light source
    const tankLight = new THREE.SpotLight(0xaaddff, 2.0, 1500, Math.PI / 3, 0.3, 1);
    tankLight.position.set(0, floorY + height + 400, 0);
    tankLight.target.position.set(0, floorY + height / 2, 0);
    tankLight.castShadow = true;
    scene.add(tankLight);
    scene.add(tankLight.target);
    
    // Side lights for better fish visibility - focused on tank
    const leftLight = new THREE.SpotLight(0xffffff, 0.8, 1200, Math.PI / 4, 0.5, 1);
    leftLight.position.set(-width * 0.8, floorY + height / 2, 0);
    leftLight.target.position.set(0, floorY + height / 2, 0);
    scene.add(leftLight);
    scene.add(leftLight.target);
    
    const rightLight = new THREE.SpotLight(0xffffff, 0.8, 1200, Math.PI / 4, 0.5, 1);
    rightLight.position.set(width * 0.8, floorY + height / 2, 0);
    rightLight.target.position.set(0, floorY + height / 2, 0);
    scene.add(rightLight);
    scene.add(rightLight.target);
    
    // Front light for camera view - focused on tank
    const frontLight = new THREE.SpotLight(0xffffff, 0.6, 1500, Math.PI / 4, 0.5, 1);
    frontLight.position.set(0, 100, -900);
    frontLight.target.position.set(0, floorY + height / 2, 0);
    scene.add(frontLight);
    scene.add(frontLight.target);
}

// ==================== CANNON ====================
let cannonBodyGroup, cannonMuzzle;

// Issue #10: Global pitch group for cannon aiming - muzzle rotates with barrel
let cannonPitchGroup = null;

// Static decorative cannons for 4-player layout
let staticCannons = [];

// Create a static decorative cannon (no functionality, just visual)
function createStaticCannon(position, rotationY, color = 0x888888) {
    const staticCannonGroup = new THREE.Group();
    
    // Platform base (same as player cannon but slightly different color)
    const platformGeometry = new THREE.CylinderGeometry(50, 60, 15, 16);
    const platformMaterial = new THREE.MeshBasicMaterial({
        color: 0x556688  // Slightly darker blue for static cannons
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 5;
    staticCannonGroup.add(platform);
    
    // Glowing ring (dimmer for static cannons)
    const ringGeometry = new THREE.TorusGeometry(65, 6, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x3399bb  // Dimmer cyan for static cannons
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2;
    staticCannonGroup.add(ring);
    
    // Static cannon barrel (simple cylinder)
    const barrelGroup = new THREE.Group();
    barrelGroup.position.y = 30;
    
    // Main barrel
    const barrelGeometry = new THREE.CylinderGeometry(8, 12, 50, 8);
    const barrelMaterial = new THREE.MeshBasicMaterial({
        color: color  // Custom color per cannon position
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 25;
    barrelGroup.add(barrel);
    
    // Barrel base/housing
    const housingGeometry = new THREE.SphereGeometry(18, 8, 8);
    const housingMaterial = new THREE.MeshBasicMaterial({
        color: 0x445566
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    barrelGroup.add(housing);
    
    // Add barrel to cannon group
    staticCannonGroup.add(barrelGroup);
    
    // Position and rotate the cannon
    staticCannonGroup.position.copy(position);
    staticCannonGroup.rotation.y = rotationY;
    staticCannonGroup.scale.set(1.0, 1.0, 1.0);  // Slightly smaller than player cannon
    
    scene.add(staticCannonGroup);
    staticCannons.push(staticCannonGroup);
    
    return staticCannonGroup;
}

// Separate radii for rectangular platform (width=1780, depth=1180)
// Platform is NOT circular, so we need different distances for X and Z axes
const CANNON_RING_RADIUS_Z = 500;  // For 12 o'clock and 6 o'clock (front/back) - user said "還可以"
const CANNON_RING_RADIUS_X = 800;  // For 3 o'clock and 9 o'clock (left/right) - increased to reach edge

// Cannon Y position - lowered again to be closer to the floor
// Previous: Y=-225 (midpoint between water middle Y=0 and floor Y=-450)
// New position: midpoint between -225 and -450 = -337.5 (closer to floor)
const CANNON_BASE_Y = -337.5;  // 3/4 depth, closer to floor

// Create all 4 cannons (1 player + 3 static)
function createAllCannons() {
    // Use CANNON_BASE_Y for water middle position
    const cannonY = CANNON_BASE_Y;
    
    // 4 cannon positions at 90-degree intervals on the platform EDGE
    // Platform is rectangular, so X and Z distances differ
    // 12 o'clock = player (bottom of screen, Z negative) - created by createCannon()
    // 3 o'clock = right side (X positive)
    // 6 o'clock = top of screen (Z positive)
    // 9 o'clock = left side (X negative)
    
    // Static cannon at 3 o'clock (X positive, facing left toward center)
    createStaticCannon(
        new THREE.Vector3(CANNON_RING_RADIUS_X, cannonY, 0),
        -Math.PI / 2,  // Rotate to face center (left)
        0x99aa88  // Greenish tint
    );
    
    // Static cannon at 6 o'clock (Z positive, facing down toward center)
    createStaticCannon(
        new THREE.Vector3(0, cannonY, CANNON_RING_RADIUS_Z),
        Math.PI,  // Rotate to face center (down)
        0xaa8899  // Pinkish tint
    );
    
    // Static cannon at 9 o'clock (X negative, facing right toward center)
    createStaticCannon(
        new THREE.Vector3(-CANNON_RING_RADIUS_X, cannonY, 0),
        Math.PI / 2,  // Rotate to face center (right)
        0x8899aa  // Bluish tint
    );
}

function createCannon() {
    cannonGroup = new THREE.Group();
    
    // Issue #13: Cannon base structure corrected
    // REMOVED: The upper disc (base cylinder at y=20) that was blocking barrel rotation
    // KEPT: The middle platform and cyan ring
    
    // Middle platform - the grey/blue platform structure (RESTORED)
    const platformGeometry = new THREE.CylinderGeometry(60, 70, 18, 16);
    const platformMaterial = new THREE.MeshBasicMaterial({
        color: 0x6699bb  // Medium blue - always visible
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 5;
    cannonGroup.add(platform);
    
    // Add BRIGHT glowing ring around base for visibility (cyan/turquoise ring)
    const ringGeometry = new THREE.TorusGeometry(75, 8, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x44ddff  // Bright cyan - always visible
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2;
    cannonGroup.add(ring);
    
    // Issue #10: Create pitch group - this rotates for vertical aiming
    // Both barrel and muzzle are children of this group so they rotate together
    cannonPitchGroup = new THREE.Group();
    cannonPitchGroup.position.y = 35;
    cannonGroup.add(cannonPitchGroup);
    
    // Cannon body group (will be replaced per weapon) - child of pitch group
    cannonBodyGroup = new THREE.Group();
    cannonPitchGroup.add(cannonBodyGroup);
    
    // Issue #10: Cannon muzzle point (for bullet spawning) - child of pitch group
    // This ensures muzzle rotates with barrel when pitching
    cannonMuzzle = new THREE.Object3D();
    cannonMuzzle.position.set(0, 25, 60);  // At end of barrel along +Z axis
    cannonPitchGroup.add(cannonMuzzle);
    
    // Build initial cannon geometry
    buildCannonGeometryForWeapon('1x');
    
    // Position player cannon at 12 o'clock (Z negative) on platform EDGE
    // Uses CANNON_BASE_Y for water middle height, CANNON_RING_RADIUS_Z for front/back positioning
    cannonGroup.position.set(0, CANNON_BASE_Y, -CANNON_RING_RADIUS_Z);  // 12 o'clock position (bottom edge)
    cannonGroup.scale.set(1.2, 1.2, 1.2);  // Slightly larger for visibility
    scene.add(cannonGroup);
    
    // Add STRONG point light directly on cannon for visibility
    const cannonPointLight = new THREE.PointLight(0xffffff, 3.0, 800);
    cannonPointLight.position.set(0, 50, 0);
    cannonGroup.add(cannonPointLight);
    
    // Add second point light from front
    const cannonFrontLight = new THREE.PointLight(0xaaddff, 2.0, 600);
    cannonFrontLight.position.set(0, 30, 100);
    cannonGroup.add(cannonFrontLight);
    
    // Add spotlight from behind camera pointing at cannon
    const cannonSpotLight = new THREE.SpotLight(0xffffff, 2.5, 1000, Math.PI / 4, 0.5, 1);
    cannonSpotLight.position.set(0, CANNON_BASE_Y + 200, -200);  // Use CANNON_BASE_Y for water middle
    cannonSpotLight.target = cannonGroup;
    scene.add(cannonSpotLight);
}

function buildCannonGeometryForWeapon(weaponKey) {
    // Clear existing cannon body
    while (cannonBodyGroup.children.length > 0) {
        const child = cannonBodyGroup.children[0];
        cannonBodyGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }
    
    const weapon = CONFIG.weapons[weaponKey];
    
    if (weaponKey === '1x') {
        // Silver basic cannon - single barrel
        // Issue #10: Rotate geometry so +Z is forward (cylinder default is +Y)
        const barrelGeometry = new THREE.CylinderGeometry(12, 18, 60, 12);
        barrelGeometry.rotateX(Math.PI / 2);  // Now barrel points along +Z
        const barrelMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.9,
            roughness: 0.2,
            emissive: 0x666666,
            emissiveIntensity: 0.2
        });
        cannonBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        cannonBarrel.position.set(0, 20, 0);
        // Issue #10: No initial rotation - pitch group handles all rotation
        cannonBodyGroup.add(cannonBarrel);
        
        // Silver ring
        const ringGeometry = new THREE.TorusGeometry(20, 3, 8, 24);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            emissive: 0x666666,
            emissiveIntensity: 0.3,
            metalness: 0.9,
            roughness: 0.1
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.y = 5;
        ring.rotation.x = Math.PI / 2;
        cannonBodyGroup.add(ring);
        
    } else if (weaponKey === '3x') {
        // Orange 3-barrel cannon - Issue #5: All 3 barrels rotate together
        const barrelMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            metalness: 0.7,
            roughness: 0.3,
            emissive: 0xff4400,
            emissiveIntensity: 0.3
        });
        
        // Create a barrel group to hold all 3 barrels - they rotate together
        const barrelGroup = new THREE.Group();
        barrelGroup.position.y = 20;
        
        // Create 3 barrels inside the group
        // Issue #10: Rotate geometry so +Z is forward
        [-12, 0, 12].forEach((xOffset, i) => {
            const barrelGeometry = new THREE.CylinderGeometry(8, 12, 55, 10);
            barrelGeometry.rotateX(Math.PI / 2);  // Now barrel points along +Z
            const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial.clone());
            barrel.position.set(xOffset, 0, 0);
            // Issue #10: No initial rotation
            barrelGroup.add(barrel);
        });
        
        // Set the barrel group as cannonBarrel so all 3 rotate together
        cannonBarrel = barrelGroup;
        cannonBodyGroup.add(barrelGroup);
        
        // Orange housing
        const housingGeometry = new THREE.BoxGeometry(45, 25, 30);
        const housingMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc6600,
            metalness: 0.6,
            roughness: 0.4
        });
        const housing = new THREE.Mesh(housingGeometry, housingMaterial);
        housing.position.y = 0;
        cannonBodyGroup.add(housing);
        
    } else if (weaponKey === '5x') {
        // Purple electric cannon with arc decoration
        // Issue #10: Rotate geometry so +Z is forward
        const barrelGeometry = new THREE.CylinderGeometry(14, 20, 65, 12);
        barrelGeometry.rotateX(Math.PI / 2);  // Now barrel points along +Z
        const barrelMaterial = new THREE.MeshStandardMaterial({
            color: 0x8833ff,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x6622cc,
            emissiveIntensity: 0.4
        });
        cannonBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        cannonBarrel.position.set(0, 22, 0);
        // Issue #10: No initial rotation
        cannonBodyGroup.add(cannonBarrel);
        
        // Electric arc decorations (coils)
        const coilMaterial = new THREE.MeshStandardMaterial({
            color: 0xaa66ff,
            emissive: 0x8844ff,
            emissiveIntensity: 0.6,
            metalness: 0.9,
            roughness: 0.1
        });
        
        for (let i = 0; i < 3; i++) {
            const coilGeometry = new THREE.TorusGeometry(16 + i * 2, 2, 8, 16);
            const coil = new THREE.Mesh(coilGeometry, coilMaterial.clone());
            coil.position.y = 10 + i * 12;
            coil.rotation.x = Math.PI / 2;
            cannonBodyGroup.add(coil);
        }
        
        // Electric orb at tip
        const orbGeometry = new THREE.SphereGeometry(8, 16, 16);
        const orbMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc88ff,
            emissive: 0xaa66ff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.8
        });
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        orb.position.set(0, 45, 20);
        cannonBodyGroup.add(orb);
        
    } else if (weaponKey === '8x') {
        // Red flame cannon with black armor
        // Issue #10: Rotate geometry so +Z is forward
        const barrelGeometry = new THREE.CylinderGeometry(16, 24, 70, 12);
        barrelGeometry.rotateX(Math.PI / 2);  // Now barrel points along +Z
        const barrelMaterial = new THREE.MeshStandardMaterial({
            color: 0xff2222,
            metalness: 0.7,
            roughness: 0.3,
            emissive: 0xcc0000,
            emissiveIntensity: 0.4
        });
        cannonBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        cannonBarrel.position.set(0, 25, 0);
        // Issue #10: No initial rotation
        cannonBodyGroup.add(cannonBarrel);
        
        // Black armor plates
        const armorMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.9,
            roughness: 0.4
        });
        
        // Side armor
        [-1, 1].forEach(side => {
            const armorGeometry = new THREE.BoxGeometry(8, 50, 25);
            const armor = new THREE.Mesh(armorGeometry, armorMaterial);
            armor.position.set(side * 22, 15, 0);
            cannonBodyGroup.add(armor);
        });
        
        // Issue #13: Removed topArmor (red/black top piece) that user said "looks wrong"
        // The barrel should be fully visible without any plate-like obstruction on top
        
        // Flame ring
        const flameRingGeometry = new THREE.TorusGeometry(22, 4, 8, 24);
        const flameRingMaterial = new THREE.MeshStandardMaterial({
            color: 0xff4400,
            emissive: 0xff2200,
            emissiveIntensity: 0.7,
            metalness: 0.5,
            roughness: 0.3
        });
        const flameRing = new THREE.Mesh(flameRingGeometry, flameRingMaterial);
        flameRing.position.y = 5;
        flameRing.rotation.x = Math.PI / 2;
        cannonBodyGroup.add(flameRing);
    }
}

function updateCannonVisual() {
    // This function is now replaced by buildCannonGeometryForWeapon
    // Keep for backward compatibility but redirect to new function
    buildCannonGeometryForWeapon(gameState.currentWeapon);
}

// Get aim direction from mouse position (shared by cannon aiming and bullet firing)
function getAimDirectionFromMouse(targetX, targetY) {
    // Convert screen coordinates to normalized device coordinates
    const mouseNDC = new THREE.Vector2(
        (targetX / window.innerWidth) * 2 - 1,
        -(targetY / window.innerHeight) * 2 + 1
    );
    
    // Use raycaster to get direction from camera through mouse point
    raycaster.setFromCamera(mouseNDC, camera);
    
    // Get cannon muzzle position
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    // Find target point along the ray (at a reasonable distance into the tank)
    const targetPoint = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(1500)
    );
    
    // Calculate direction from muzzle to target point
    const direction = targetPoint.sub(muzzlePos).normalize();
    
    return direction;
}

function aimCannon(targetX, targetY) {
    // Don't aim if AUTO mode is on
    if (gameState.autoShoot) return;
    
    // FPS MODE FIX: In FPS mode, cannon rotation is controlled by right-drag only
    // This prevents aimCannon from overriding the sensitivity-based rotation system
    if (gameState.viewMode === 'fps') return;
    
    // Get aim direction using shared function
    const direction = getAimDirectionFromMouse(targetX, targetY);
    
    // Calculate yaw and pitch from direction
    const yaw = Math.atan2(direction.x, direction.z);
    const pitch = Math.asin(direction.y);
    
    // FPS mode: Limited to ±90° yaw (180° total) - cannon can only face outward
    // 3RD PERSON mode: Unlimited 360° rotation
    // FPS Pitch Limits: Different limits for FPS mode vs 3RD PERSON mode
    let minPitch, maxPitch;
    let clampedYaw = yaw;
    const maxYaw = Math.PI / 2;  // 90 degrees
    
    if (gameState.viewMode === 'fps') {
        // FPS mode: 40° up ensures platform occupies lower 1/3 of screen
        // Player cannot see directly overhead
        minPitch = -30 * (Math.PI / 180);   // -30° (down)
        maxPitch = 40 * (Math.PI / 180);    // +40° (up) - platform visible at bottom
        // Limit yaw to ±90° in FPS mode
        clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, yaw));
    } else {
        // 3RD PERSON mode: Full range for shooting fish anywhere
        minPitch = -Math.PI / 2;   // -90° (full downward)
        maxPitch = Math.PI / 2;    // 90° (full upward)
    }
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    
    // Issue #10: Apply rotation to cannon group (yaw) and PITCH GROUP (pitch)
    // The pitch group contains both barrel and muzzle, so they rotate together
    cannonGroup.rotation.y = clampedYaw;  // Clamped to ±90° in FPS mode
    if (cannonPitchGroup) {
        // Issue #10: Rotate pitch group so barrel AND muzzle move together
        cannonPitchGroup.rotation.x = -clampedPitch;
    }
}

// Auto-aim at nearest fish (for AUTO mode) - Issue #2: 360° rotation support
function autoAimAtNearestFish() {
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    let bestFish = null;
    let bestDistSq = Infinity;
    
    // Issue #2: Find nearest fish in ANY direction (360°)
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        const pos = fish.group.position;
        
        const dx = pos.x - muzzlePos.x;
        const dy = pos.y - muzzlePos.y;
        const dz = pos.z - muzzlePos.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestFish = fish;
        }
    }
    
    return bestFish;
}

// Aim cannon at specific fish - Issue #2: 360° rotation support
function aimCannonAtFish(fish) {
    if (!fish) return;
    
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    const dir = fish.group.position.clone().sub(muzzlePos).normalize();
    
    // Calculate yaw and pitch from direction
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(dir.y);
    
    // FPS mode: Limited to ±90° yaw (180° total) - cannon can only face outward
    // 3RD PERSON mode: Unlimited 360° rotation
    // FPS Pitch Limits: Different limits for FPS mode vs 3RD PERSON mode
    let minPitch, maxPitch;
    let clampedYaw = yaw;
    const maxYaw = Math.PI / 2;  // 90 degrees
    
    if (gameState.viewMode === 'fps') {
        // FPS mode: 40° up ensures platform occupies lower 1/3 of screen
        // Player cannot see directly overhead
        minPitch = -30 * (Math.PI / 180);   // -30° (down)
        maxPitch = 40 * (Math.PI / 180);    // +40° (up) - platform visible at bottom
        // Limit yaw to ±90° in FPS mode
        clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, yaw));
    } else {
        // 3RD PERSON mode: Full range for shooting fish anywhere
        minPitch = -Math.PI / 2;   // -90° (full downward)
        maxPitch = Math.PI / 2;    // 90° (full upward)
    }
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    
    // Issue #10: Apply rotation to cannon group (yaw) and PITCH GROUP (pitch)
    cannonGroup.rotation.y = clampedYaw;  // Clamped to ±90° in FPS mode
    if (cannonPitchGroup) {
        // Issue #10: Rotate pitch group so barrel AND muzzle move together
        cannonPitchGroup.rotation.x = -clampedPitch;
    }
    
    return dir;
}

// Auto-fire at fish (for AUTO mode - bypasses mouse-based fireBullet)
function autoFireAtFish(targetFish) {
    const weaponKey = gameState.currentWeapon;
    const weapon = CONFIG.weapons[weaponKey];
    
    // Check cooldown
    if (gameState.cooldown > 0) return false;
    
    // Check balance
    if (gameState.balance < weapon.cost) return false;
    
    // Deduct cost
    gameState.balance -= weapon.cost;
    
    // Set cooldown
    gameState.cooldown = 1 / weapon.shotsPerSecond;
    
    // Track last weapon used
    gameState.lastWeaponKey = weaponKey;
    
    // Get cannon muzzle position
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    // Calculate direction to fish
    const direction = targetFish.group.position.clone().sub(muzzlePos).normalize();
    
    // Fire based on weapon type
    if (weapon.type === 'spread') {
        // 3x weapon: Fire 3 bullets in fan spread pattern
        const spreadAngle = weapon.spreadAngle * (Math.PI / 180);
        
        spawnBulletFromDirection(muzzlePos, direction, weaponKey);
        
        const leftDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle);
        spawnBulletFromDirection(muzzlePos, leftDir, weaponKey);
        
        const rightDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -spreadAngle);
        spawnBulletFromDirection(muzzlePos, rightDir, weaponKey);
    } else {
        spawnBulletFromDirection(muzzlePos, direction, weaponKey);
    }
    
    // Cannon recoil animation
    if (cannonBarrel) {
        const originalY = cannonBarrel.position.y;
        cannonBarrel.position.y -= 3;
        setTimeout(() => {
            if (cannonBarrel) cannonBarrel.position.y = originalY;
        }, 50);
    }
    
    return true;
}

// ==================== FISH SYSTEM ====================
class Fish {
    constructor(tier, tierConfig) {
        this.tier = tier;
        this.config = tierConfig;
        this.hp = tierConfig.hp;
        this.maxHp = tierConfig.hp;
        this.speed = tierConfig.speedMin + Math.random() * (tierConfig.speedMax - tierConfig.speedMin);
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.isFrozen = false;
        this.freezeTimer = 0;
        this.isActive = false;
        
        // Phase 2: Initialize shield HP for Shield Turtle
        if (tierConfig.ability === 'shield' && tierConfig.shieldHP) {
            this.shieldHP = tierConfig.shieldHP;
        }
        
        this.createMesh();
    }
    
    createMesh() {
        this.group = new THREE.Group();
        
        const size = this.config.size;
        const color = this.config.color;
        const secondaryColor = this.config.secondaryColor || color;
        const form = this.config.form || 'standard';
        
        // Create materials
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.3,
            metalness: 0.2,
            emissive: color,
            emissiveIntensity: 0.1
        });
        const secondaryMaterial = new THREE.MeshStandardMaterial({
            color: secondaryColor,
            roughness: 0.3,
            metalness: 0.2
        });
        
        // Create mesh based on form type
        switch (form) {
            case 'whale':
                this.createWhaleMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'shark':
                this.createSharkMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'marlin':
                this.createMarlinMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'hammerhead':
                this.createHammerheadMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'tuna':
                this.createTunaMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'dolphinfish':
                this.createDolphinfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'barracuda':
                this.createBarracudaMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'grouper':
                this.createGrouperMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'parrotfish':
                this.createParrotfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'angelfish':
                this.createAngelfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'butterflyfish':
                this.createButterflyfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'tang':
                this.createTangMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'sardine':
            case 'anchovy':
                this.createSmallSchoolFishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'clownfish':
                this.createClownfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'damselfish':
                this.createDamselfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'mantaRay':
                this.createMantaRayMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'pufferfish':
                this.createPufferfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'seahorse':
                this.createSeahorseMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'flyingFish':
                this.createFlyingFishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            // Phase 2: Special Ability Fish
            case 'crab':
                this.createCrabMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'eel':
                this.createEelMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'turtle':
                this.createTurtleMesh(size, bodyMaterial, secondaryMaterial);
                break;
            case 'goldfish':
                this.createGoldfishMesh(size, bodyMaterial, secondaryMaterial);
                break;
            default:
                this.createStandardFishMesh(size, bodyMaterial, secondaryMaterial);
        }
        
        // Bounding sphere for collision
        this.boundingRadius = size * 0.8;
        
        fishGroup.add(this.group);
    }
    
    // Standard fish mesh (default)
    createStandardFishMesh(size, bodyMaterial, secondaryMaterial) {
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.5, 0.8, 0.6);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Tail
        const tailGeometry = new THREE.ConeGeometry(size / 3, size / 2, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.7;
        this.group.add(this.tail);
        
        this.addEyes(size);
        this.addFins(size, secondaryMaterial);
    }
    
    // Blue Whale - Massive elongated body
    createWhaleMesh(size, bodyMaterial, secondaryMaterial) {
        // Main body - very elongated
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 20, 16);
        bodyGeometry.scale(2.5, 0.7, 0.8);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Head bulge
        const headGeometry = new THREE.SphereGeometry(size / 3, 16, 12);
        headGeometry.scale(1.2, 1, 1);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.x = size * 0.9;
        this.group.add(head);
        
        // Belly (lighter color)
        const bellyGeometry = new THREE.SphereGeometry(size / 2.5, 16, 12);
        bellyGeometry.scale(2, 0.5, 0.6);
        const belly = new THREE.Mesh(bellyGeometry, secondaryMaterial);
        belly.position.y = -size * 0.15;
        this.group.add(belly);
        
        // Tail flukes (horizontal)
        const flukeGeometry = new THREE.BoxGeometry(size * 0.3, size * 0.05, size * 0.8);
        this.tail = new THREE.Mesh(flukeGeometry, bodyMaterial);
        this.tail.position.x = -size * 1.2;
        this.group.add(this.tail);
        
        // Dorsal fin (small for whale)
        const dorsalGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.2, 4);
        const dorsal = new THREE.Mesh(dorsalGeometry, bodyMaterial);
        dorsal.position.set(-size * 0.3, size * 0.35, 0);
        this.group.add(dorsal);
        
        this.addEyes(size, 0.8, 0.15);
    }
    
    // Great White Shark - Torpedo shape with prominent dorsal fin
    createSharkMesh(size, bodyMaterial, secondaryMaterial) {
        // Torpedo body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(2, 0.8, 0.7);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Pointed snout
        const snoutGeometry = new THREE.ConeGeometry(size * 0.25, size * 0.6, 8);
        const snout = new THREE.Mesh(snoutGeometry, bodyMaterial);
        snout.rotation.z = -Math.PI / 2;
        snout.position.x = size * 0.9;
        this.group.add(snout);
        
        // White belly
        const bellyGeometry = new THREE.SphereGeometry(size / 2.5, 12, 8);
        bellyGeometry.scale(1.8, 0.5, 0.5);
        const belly = new THREE.Mesh(bellyGeometry, secondaryMaterial);
        belly.position.y = -size * 0.2;
        this.group.add(belly);
        
        // Large dorsal fin
        const dorsalGeometry = new THREE.ConeGeometry(size * 0.2, size * 0.5, 4);
        const dorsal = new THREE.Mesh(dorsalGeometry, bodyMaterial);
        dorsal.position.set(0, size * 0.4, 0);
        dorsal.rotation.x = -0.2;
        this.group.add(dorsal);
        
        // Tail fin (vertical crescent)
        const tailGeometry = new THREE.ConeGeometry(size * 0.3, size * 0.6, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.9;
        this.group.add(this.tail);
        
        // Pectoral fins
        [-1, 1].forEach(side => {
            const finGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.4, 3);
            const fin = new THREE.Mesh(finGeometry, bodyMaterial);
            fin.rotation.z = side * Math.PI / 3;
            fin.rotation.x = side * 0.3;
            fin.position.set(size * 0.2, -size * 0.2, side * size * 0.35);
            this.group.add(fin);
        });
        
        this.addEyes(size, 0.6, 0.1);
    }
    
    // Marlin - Long bill, streamlined body
    createMarlinMesh(size, bodyMaterial, secondaryMaterial) {
        // Streamlined body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(2.2, 0.6, 0.5);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Long bill/sword
        const billGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.8, 8);
        const bill = new THREE.Mesh(billGeometry, secondaryMaterial);
        bill.rotation.z = -Math.PI / 2;
        bill.position.x = size * 1.2;
        this.group.add(bill);
        
        // Tall dorsal fin (sail-like)
        const dorsalGeometry = new THREE.BoxGeometry(size * 0.8, size * 0.4, size * 0.02);
        const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
        dorsal.position.set(0, size * 0.35, 0);
        this.group.add(dorsal);
        
        // Crescent tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.25, size * 0.5, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.9;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.5, 0.1);
    }
    
    // Hammerhead Shark - T-shaped head
    createHammerheadMesh(size, bodyMaterial, secondaryMaterial) {
        // Body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.8, 0.7, 0.6);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Hammer head (T-shape)
        const hammerGeometry = new THREE.BoxGeometry(size * 0.2, size * 0.15, size * 0.8);
        const hammer = new THREE.Mesh(hammerGeometry, bodyMaterial);
        hammer.position.x = size * 0.7;
        this.group.add(hammer);
        
        // Eyes at ends of hammer
        const eyeGeometry = new THREE.SphereGeometry(size / 12, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        [-1, 1].forEach(side => {
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.75, 0, side * size * 0.35);
            this.group.add(eye);
        });
        
        // Dorsal fin
        const dorsalGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.4, 4);
        const dorsal = new THREE.Mesh(dorsalGeometry, bodyMaterial);
        dorsal.position.set(0, size * 0.35, 0);
        this.group.add(dorsal);
        
        // Tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.25, size * 0.5, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.8;
        this.group.add(this.tail);
    }
    
    // Yellowfin Tuna - Muscular torpedo with yellow fins
    createTunaMesh(size, bodyMaterial, secondaryMaterial) {
        // Muscular torpedo body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.8, 0.9, 0.7);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Yellow dorsal fin
        const dorsalGeometry = new THREE.ConeGeometry(size * 0.12, size * 0.35, 4);
        const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
        dorsal.position.set(0, size * 0.4, 0);
        this.group.add(dorsal);
        
        // Yellow pectoral fins (long)
        [-1, 1].forEach(side => {
            const finGeometry = new THREE.ConeGeometry(size * 0.08, size * 0.5, 3);
            const fin = new THREE.Mesh(finGeometry, secondaryMaterial);
            fin.rotation.z = side * Math.PI / 2.5;
            fin.position.set(size * 0.3, -size * 0.1, side * size * 0.3);
            this.group.add(fin);
        });
        
        // Crescent tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.2, size * 0.4, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.8;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.6, 0.15);
    }
    
    // Mahi-Mahi/Dolphinfish - Blunt head, colorful
    createDolphinfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Body with blunt head
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.6, 0.9, 0.6);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Blunt forehead
        const foreheadGeometry = new THREE.SphereGeometry(size / 3, 12, 8);
        const forehead = new THREE.Mesh(foreheadGeometry, bodyMaterial);
        forehead.position.set(size * 0.5, size * 0.1, 0);
        this.group.add(forehead);
        
        // Long dorsal fin (runs length of body)
        const dorsalGeometry = new THREE.BoxGeometry(size * 1.2, size * 0.25, size * 0.02);
        const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
        dorsal.position.set(0, size * 0.35, 0);
        this.group.add(dorsal);
        
        // Forked tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.2, size * 0.4, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.7;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.5, 0.15);
    }
    
    // Barracuda - Long, slender, silver
    createBarracudaMesh(size, bodyMaterial, secondaryMaterial) {
        // Very elongated body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(3, 0.4, 0.4);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Pointed head with underbite
        const headGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.4, 8);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.rotation.z = -Math.PI / 2;
        head.position.x = size * 1.2;
        this.group.add(head);
        
        // Small dorsal fins (two)
        [0.2, -0.3].forEach(xPos => {
            const dorsalGeometry = new THREE.ConeGeometry(size * 0.08, size * 0.2, 4);
            const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
            dorsal.position.set(size * xPos, size * 0.25, 0);
            this.group.add(dorsal);
        });
        
        // Forked tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.15, size * 0.3, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 1.2;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.9, 0.08);
    }
    
    // Grouper - Wide, thick body
    createGrouperMesh(size, bodyMaterial, secondaryMaterial) {
        // Wide thick body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.3, 1.1, 0.9);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Large mouth area
        const mouthGeometry = new THREE.SphereGeometry(size / 3, 12, 8);
        const mouth = new THREE.Mesh(mouthGeometry, bodyMaterial);
        mouth.position.set(size * 0.4, -size * 0.1, 0);
        this.group.add(mouth);
        
        // Spots (darker patches)
        for (let i = 0; i < 5; i++) {
            const spotGeometry = new THREE.SphereGeometry(size * 0.08, 8, 8);
            const spot = new THREE.Mesh(spotGeometry, secondaryMaterial);
            spot.position.set(
                (Math.random() - 0.5) * size * 0.8,
                (Math.random() - 0.3) * size * 0.5,
                (Math.random() - 0.5) * size * 0.4
            );
            this.group.add(spot);
        }
        
        // Rounded tail
        const tailGeometry = new THREE.SphereGeometry(size * 0.2, 8, 8);
        tailGeometry.scale(1, 1.5, 0.3);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.position.x = -size * 0.5;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.35, 0.2);
        this.addFins(size, secondaryMaterial);
    }
    
    // Parrotfish - Parrot-like beak, colorful
    createParrotfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Oval body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.4, 0.9, 0.7);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Parrot beak
        const beakGeometry = new THREE.BoxGeometry(size * 0.2, size * 0.15, size * 0.2);
        const beak = new THREE.Mesh(beakGeometry, secondaryMaterial);
        beak.position.set(size * 0.55, 0, 0);
        this.group.add(beak);
        
        // Colorful scales (secondary color patches)
        const scaleGeometry = new THREE.SphereGeometry(size * 0.15, 8, 8);
        [-0.2, 0.1, 0.3].forEach(x => {
            const scale = new THREE.Mesh(scaleGeometry, secondaryMaterial);
            scale.position.set(size * x, size * 0.1, 0);
            this.group.add(scale);
        });
        
        // Rounded tail
        const tailGeometry = new THREE.SphereGeometry(size * 0.2, 8, 8);
        tailGeometry.scale(0.8, 1.2, 0.3);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.position.x = -size * 0.6;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.4, 0.15);
    }
    
    // Angelfish - Flat disc shape with stripes
    createAngelfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Flat disc body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(0.8, 1.2, 0.3);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Vertical stripes
        for (let i = -2; i <= 2; i++) {
            const stripeGeometry = new THREE.BoxGeometry(size * 0.02, size * 0.8, size * 0.15);
            const stripe = new THREE.Mesh(stripeGeometry, secondaryMaterial);
            stripe.position.set(size * i * 0.12, 0, 0);
            this.group.add(stripe);
        }
        
        // Tall dorsal and anal fins
        const dorsalGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.4, 4);
        const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
        dorsal.position.set(0, size * 0.5, 0);
        this.group.add(dorsal);
        
        const analGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.3, 4);
        const anal = new THREE.Mesh(analGeometry, secondaryMaterial);
        anal.position.set(0, -size * 0.4, 0);
        anal.rotation.x = Math.PI;
        this.group.add(anal);
        
        // Small tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.2, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.4;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.25, 0.2);
    }
    
    // Butterflyfish - Small flat disc
    createButterflyfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Small flat disc body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(0.9, 1, 0.25);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Eye spot (false eye near tail)
        const eyeSpotGeometry = new THREE.SphereGeometry(size * 0.1, 8, 8);
        const eyeSpot = new THREE.Mesh(eyeSpotGeometry, secondaryMaterial);
        eyeSpot.position.set(-size * 0.2, size * 0.1, size * 0.1);
        this.group.add(eyeSpot);
        
        // Pointed snout
        const snoutGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.2, 8);
        const snout = new THREE.Mesh(snoutGeometry, bodyMaterial);
        snout.rotation.z = -Math.PI / 2;
        snout.position.x = size * 0.45;
        this.group.add(snout);
        
        // Small tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.08, size * 0.15, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.4;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.3, 0.15);
    }
    
    // Blue Tang - Oval flat bright blue
    createTangMesh(size, bodyMaterial, secondaryMaterial) {
        // Oval flat body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.1, 0.9, 0.3);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Yellow tail marking
        const tailMarkGeometry = new THREE.BoxGeometry(size * 0.15, size * 0.3, size * 0.12);
        const tailMark = new THREE.Mesh(tailMarkGeometry, secondaryMaterial);
        tailMark.position.set(-size * 0.35, 0, 0);
        this.group.add(tailMark);
        
        // Dorsal fin
        const dorsalGeometry = new THREE.BoxGeometry(size * 0.5, size * 0.15, size * 0.02);
        const dorsal = new THREE.Mesh(dorsalGeometry, bodyMaterial);
        dorsal.position.set(0, size * 0.35, 0);
        this.group.add(dorsal);
        
        // Tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.2, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.5;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.3, 0.15);
    }
    
    // Small schooling fish (sardine, anchovy)
    createSmallSchoolFishMesh(size, bodyMaterial, secondaryMaterial) {
        // Small streamlined body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 12, 8);
        bodyGeometry.scale(2, 0.5, 0.4);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Silver stripe
        const stripeGeometry = new THREE.BoxGeometry(size * 0.8, size * 0.05, size * 0.2);
        const stripe = new THREE.Mesh(stripeGeometry, secondaryMaterial);
        stripe.position.y = 0;
        this.group.add(stripe);
        
        // Small forked tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.15, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.5;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.4, 0.08);
    }
    
    // Clownfish - Orange with white stripes
    createClownfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Round body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.2, 0.9, 0.6);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // White stripes (3 vertical bands)
        [-0.25, 0, 0.25].forEach(x => {
            const stripeGeometry = new THREE.BoxGeometry(size * 0.05, size * 0.6, size * 0.35);
            const stripe = new THREE.Mesh(stripeGeometry, secondaryMaterial);
            stripe.position.set(size * x, 0, 0);
            this.group.add(stripe);
        });
        
        // Rounded fins
        const finGeometry = new THREE.SphereGeometry(size * 0.12, 8, 8);
        finGeometry.scale(1, 1.5, 0.3);
        [-1, 1].forEach(side => {
            const fin = new THREE.Mesh(finGeometry, bodyMaterial);
            fin.position.set(0, side * size * 0.25, side * size * 0.2);
            this.group.add(fin);
        });
        
        // Rounded tail
        const tailGeometry = new THREE.SphereGeometry(size * 0.15, 8, 8);
        tailGeometry.scale(0.8, 1.2, 0.3);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.position.x = -size * 0.5;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.35, 0.15);
    }
    
    // Damselfish - Small oval
    createDamselfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Small oval body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 12, 10);
        bodyGeometry.scale(1.1, 0.9, 0.5);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Yellow accent
        const accentGeometry = new THREE.SphereGeometry(size * 0.15, 8, 8);
        const accent = new THREE.Mesh(accentGeometry, secondaryMaterial);
        accent.position.set(0, size * 0.2, 0);
        this.group.add(accent);
        
        // Small tail
        const tailGeometry = new THREE.ConeGeometry(size * 0.1, size * 0.15, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.45;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.3, 0.12);
    }
    
    // Manta Ray - Flat wing shape
    createMantaRayMesh(size, bodyMaterial, secondaryMaterial) {
        // Flat diamond body
        const bodyGeometry = new THREE.BoxGeometry(size * 0.8, size * 0.1, size * 1.5);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Wings (extended sides)
        [-1, 1].forEach(side => {
            const wingGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.05, size * 0.8);
            const wing = new THREE.Mesh(wingGeometry, bodyMaterial);
            wing.position.set(size * 0.1, 0, side * size * 0.9);
            wing.rotation.x = side * 0.2;
            this.group.add(wing);
        });
        
        // White belly
        const bellyGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.05, size * 1.2);
        const belly = new THREE.Mesh(bellyGeometry, secondaryMaterial);
        belly.position.y = -size * 0.05;
        this.group.add(belly);
        
        // Cephalic fins (horn-like)
        [-1, 1].forEach(side => {
            const hornGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.3, 8);
            const horn = new THREE.Mesh(hornGeometry, bodyMaterial);
            horn.rotation.z = -Math.PI / 2;
            horn.position.set(size * 0.5, 0, side * size * 0.2);
            this.group.add(horn);
        });
        
        // Long thin tail
        const tailGeometry = new THREE.CylinderGeometry(size * 0.02, size * 0.01, size * 0.8, 8);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.7;
        this.group.add(this.tail);
        
        // Eyes on sides
        const eyeGeometry = new THREE.SphereGeometry(size * 0.05, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        [-1, 1].forEach(side => {
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.3, size * 0.05, side * size * 0.3);
            this.group.add(eye);
        });
    }
    
    // Pufferfish - Round ball with spikes
    createPufferfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Round ball body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 16);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Spikes all around
        for (let i = 0; i < 20; i++) {
            const spikeGeometry = new THREE.ConeGeometry(size * 0.03, size * 0.15, 4);
            const spike = new THREE.Mesh(spikeGeometry, secondaryMaterial);
            
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            
            spike.position.set(
                size * 0.45 * Math.sin(phi) * Math.cos(theta),
                size * 0.45 * Math.sin(phi) * Math.sin(theta),
                size * 0.45 * Math.cos(phi)
            );
            spike.lookAt(0, 0, 0);
            spike.rotation.x += Math.PI;
            this.group.add(spike);
        }
        
        // Small fins
        const finGeometry = new THREE.SphereGeometry(size * 0.08, 8, 8);
        finGeometry.scale(1, 1.5, 0.3);
        [-1, 1].forEach(side => {
            const fin = new THREE.Mesh(finGeometry, bodyMaterial);
            fin.position.set(0, 0, side * size * 0.4);
            this.group.add(fin);
        });
        
        // Small tail
        const tailGeometry = new THREE.SphereGeometry(size * 0.1, 8, 8);
        tailGeometry.scale(0.8, 1.2, 0.3);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.position.x = -size * 0.4;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.25, 0.2);
    }
    
    // Seahorse - Vertical S-shape
    createSeahorseMesh(size, bodyMaterial, secondaryMaterial) {
        // Vertical body (S-curve approximation)
        const bodyGeometry = new THREE.CylinderGeometry(size * 0.15, size * 0.1, size * 0.8, 12);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Horse-like head
        const headGeometry = new THREE.SphereGeometry(size * 0.15, 12, 8);
        headGeometry.scale(1.5, 1, 0.8);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(size * 0.15, size * 0.35, 0);
        this.group.add(head);
        
        // Snout
        const snoutGeometry = new THREE.CylinderGeometry(size * 0.03, size * 0.02, size * 0.2, 8);
        const snout = new THREE.Mesh(snoutGeometry, bodyMaterial);
        snout.rotation.z = -Math.PI / 2;
        snout.position.set(size * 0.35, size * 0.35, 0);
        this.group.add(snout);
        
        // Curled tail
        const tailGeometry = new THREE.TorusGeometry(size * 0.15, size * 0.03, 8, 16, Math.PI * 1.5);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.position.set(-size * 0.1, -size * 0.5, 0);
        this.tail.rotation.y = Math.PI / 2;
        this.group.add(this.tail);
        
        // Dorsal fin (small, on back)
        const dorsalGeometry = new THREE.BoxGeometry(size * 0.02, size * 0.15, size * 0.1);
        const dorsal = new THREE.Mesh(dorsalGeometry, secondaryMaterial);
        dorsal.position.set(-size * 0.12, size * 0.1, 0);
        this.group.add(dorsal);
        
        // Eye
        const eyeGeometry = new THREE.SphereGeometry(size * 0.04, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        eye.position.set(size * 0.2, size * 0.4, size * 0.08);
        this.group.add(eye);
        
        // Rotate entire seahorse to swim vertically
        this.group.rotation.z = Math.PI / 6;
    }
    
    // Flying Fish - Large pectoral fins
    createFlyingFishMesh(size, bodyMaterial, secondaryMaterial) {
        // Streamlined body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.8, 0.5, 0.4);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Large wing-like pectoral fins
        [-1, 1].forEach(side => {
            const wingGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.02, size * 0.4);
            const wing = new THREE.Mesh(wingGeometry, secondaryMaterial);
            wing.position.set(size * 0.1, 0, side * size * 0.35);
            wing.rotation.x = side * 0.3;
            this.group.add(wing);
        });
        
        // Forked tail (lower lobe longer)
        const tailGeometry = new THREE.ConeGeometry(size * 0.12, size * 0.3, 4);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.7;
        this.group.add(this.tail);
        
        // Lower tail lobe (longer)
        const lowerTailGeometry = new THREE.ConeGeometry(size * 0.08, size * 0.25, 4);
        const lowerTail = new THREE.Mesh(lowerTailGeometry, bodyMaterial);
        lowerTail.rotation.z = Math.PI / 2 + 0.5;
        lowerTail.position.set(-size * 0.65, -size * 0.1, 0);
        this.group.add(lowerTail);
        
        this.addEyes(size, 0.5, 0.1);
    }
    
    // ==================== SPECIAL ABILITY FISH MESHES (Phase 2) ====================
    
    // Bomb Crab - Round body with claws, red/orange color
    createCrabMesh(size, bodyMaterial, secondaryMaterial) {
        // Round crab body (shell)
        const shellGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        shellGeometry.scale(1.2, 0.6, 1.0);
        this.body = new THREE.Mesh(shellGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Shell texture bumps
        for (let i = 0; i < 5; i++) {
            const bumpGeometry = new THREE.SphereGeometry(size * 0.08, 8, 8);
            const bump = new THREE.Mesh(bumpGeometry, bodyMaterial);
            bump.position.set(
                (Math.random() - 0.5) * size * 0.5,
                size * 0.25,
                (Math.random() - 0.5) * size * 0.4
            );
            this.group.add(bump);
        }
        
        // Large claws (pincers)
        [-1, 1].forEach(side => {
            // Claw arm
            const armGeometry = new THREE.CylinderGeometry(size * 0.08, size * 0.1, size * 0.4, 8);
            const arm = new THREE.Mesh(armGeometry, secondaryMaterial);
            arm.rotation.z = side * Math.PI / 3;
            arm.position.set(size * 0.4, 0, side * size * 0.4);
            this.group.add(arm);
            
            // Pincer (two parts)
            const pincerGeometry = new THREE.BoxGeometry(size * 0.25, size * 0.08, size * 0.15);
            const pincer1 = new THREE.Mesh(pincerGeometry, bodyMaterial);
            pincer1.position.set(size * 0.65, size * 0.1, side * size * 0.4);
            this.group.add(pincer1);
            
            const pincer2 = new THREE.Mesh(pincerGeometry, bodyMaterial);
            pincer2.position.set(size * 0.65, -size * 0.05, side * size * 0.4);
            this.group.add(pincer2);
        });
        
        // Legs (4 on each side)
        [-1, 1].forEach(side => {
            for (let i = 0; i < 4; i++) {
                const legGeometry = new THREE.CylinderGeometry(size * 0.03, size * 0.02, size * 0.3, 6);
                const leg = new THREE.Mesh(legGeometry, secondaryMaterial);
                leg.rotation.z = side * Math.PI / 2.5;
                leg.position.set(-size * 0.1 + i * size * 0.15, -size * 0.2, side * size * 0.35);
                this.group.add(leg);
            }
        });
        
        // Eye stalks
        [-1, 1].forEach(side => {
            const stalkGeometry = new THREE.CylinderGeometry(size * 0.03, size * 0.03, size * 0.15, 8);
            const stalk = new THREE.Mesh(stalkGeometry, secondaryMaterial);
            stalk.position.set(size * 0.3, size * 0.35, side * size * 0.15);
            this.group.add(stalk);
            
            const eyeGeometry = new THREE.SphereGeometry(size * 0.06, 8, 8);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.3, size * 0.45, side * size * 0.15);
            this.group.add(eye);
        });
        
        // Bomb indicator (glowing core visible through shell)
        const bombCoreGeometry = new THREE.SphereGeometry(size * 0.2, 12, 12);
        const bombCoreMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400,
            emissiveIntensity: 0.8
        });
        this.bombCore = new THREE.Mesh(bombCoreGeometry, bombCoreMaterial);
        this.bombCore.position.y = size * 0.1;
        this.group.add(this.bombCore);
    }
    
    // Electric Eel - Long serpentine body with electric glow
    createEelMesh(size, bodyMaterial, secondaryMaterial) {
        // Long serpentine body made of segments
        const segments = 8;
        const segmentLength = size * 0.3;
        
        for (let i = 0; i < segments; i++) {
            const segmentSize = size * 0.15 * (1 - i * 0.08); // Tapers toward tail
            const segmentGeometry = new THREE.SphereGeometry(segmentSize, 12, 8);
            segmentGeometry.scale(1.5, 1, 1);
            const segment = new THREE.Mesh(segmentGeometry, i === 0 ? bodyMaterial : secondaryMaterial);
            segment.position.x = -i * segmentLength * 0.7;
            segment.castShadow = true;
            this.group.add(segment);
            
            if (i === 0) this.body = segment;
        }
        
        // Head (larger, flattened)
        const headGeometry = new THREE.SphereGeometry(size * 0.2, 12, 10);
        headGeometry.scale(1.3, 0.8, 1);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.x = size * 0.25;
        this.group.add(head);
        
        // Electric glow spots along body
        for (let i = 0; i < 6; i++) {
            const glowGeometry = new THREE.SphereGeometry(size * 0.05, 8, 8);
            const glowMaterial = new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 1.0
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.set(-i * size * 0.25, size * 0.08, 0);
            this.group.add(glow);
        }
        
        // Dorsal fin (continuous along back)
        const finGeometry = new THREE.BoxGeometry(size * 1.2, size * 0.15, size * 0.02);
        const fin = new THREE.Mesh(finGeometry, secondaryMaterial);
        fin.position.set(-size * 0.4, size * 0.12, 0);
        this.group.add(fin);
        
        // Eyes
        [-1, 1].forEach(side => {
            const eyeGeometry = new THREE.SphereGeometry(size * 0.04, 8, 8);
            const eyeMaterial = new THREE.MeshStandardMaterial({ 
                color: 0xffff00,
                emissive: 0xffff00,
                emissiveIntensity: 0.5
            });
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.35, size * 0.05, side * size * 0.1);
            this.group.add(eye);
        });
        
        // Tail fin
        const tailGeometry = new THREE.ConeGeometry(size * 0.08, size * 0.2, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 1.4;
        this.group.add(this.tail);
    }
    
    // Shield Turtle - Round shell with protective dome
    createTurtleMesh(size, bodyMaterial, secondaryMaterial) {
        // Dome shell (top)
        const shellGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        shellGeometry.scale(1.2, 0.6, 1.0);
        this.body = new THREE.Mesh(shellGeometry, bodyMaterial);
        this.body.position.y = size * 0.1;
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Shell pattern (hexagonal segments)
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const patternGeometry = new THREE.CylinderGeometry(size * 0.12, size * 0.12, size * 0.05, 6);
            const patternMaterial = new THREE.MeshStandardMaterial({
                color: 0x115522,
                roughness: 0.8
            });
            const pattern = new THREE.Mesh(patternGeometry, patternMaterial);
            pattern.position.set(
                Math.cos(angle) * size * 0.25,
                size * 0.35,
                Math.sin(angle) * size * 0.25
            );
            pattern.rotation.x = Math.PI / 2;
            this.group.add(pattern);
        }
        
        // Belly (plastron)
        const bellyGeometry = new THREE.CylinderGeometry(size * 0.45, size * 0.45, size * 0.1, 16);
        const belly = new THREE.Mesh(bellyGeometry, secondaryMaterial);
        belly.position.y = -size * 0.1;
        this.group.add(belly);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(size * 0.15, 12, 10);
        headGeometry.scale(1.3, 1, 1);
        const head = new THREE.Mesh(headGeometry, secondaryMaterial);
        head.position.set(size * 0.5, 0, 0);
        this.group.add(head);
        
        // Flippers (4)
        const flipperPositions = [
            { x: 0.35, z: 0.35, rot: 0.5 },
            { x: 0.35, z: -0.35, rot: -0.5 },
            { x: -0.3, z: 0.3, rot: 0.3 },
            { x: -0.3, z: -0.3, rot: -0.3 }
        ];
        flipperPositions.forEach(pos => {
            const flipperGeometry = new THREE.BoxGeometry(size * 0.25, size * 0.05, size * 0.15);
            const flipper = new THREE.Mesh(flipperGeometry, secondaryMaterial);
            flipper.position.set(pos.x * size, -size * 0.15, pos.z * size);
            flipper.rotation.y = pos.rot;
            this.group.add(flipper);
        });
        
        // Tail (small)
        const tailGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.15, 4);
        this.tail = new THREE.Mesh(tailGeometry, secondaryMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.set(-size * 0.55, -size * 0.1, 0);
        this.group.add(this.tail);
        
        // Eyes
        [-1, 1].forEach(side => {
            const eyeGeometry = new THREE.SphereGeometry(size * 0.04, 8, 8);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.6, size * 0.05, side * size * 0.08);
            this.group.add(eye);
        });
        
        // Shield bubble (will be toggled based on shield HP)
        const shieldGeometry = new THREE.SphereGeometry(size * 0.8, 24, 16);
        const shieldMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3,
            emissive: 0x00ffff,
            emissiveIntensity: 0.3,
            side: THREE.DoubleSide
        });
        this.shieldBubble = new THREE.Mesh(shieldGeometry, shieldMaterial);
        this.shieldBubble.position.y = size * 0.1;
        this.group.add(this.shieldBubble);
    }
    
    // Gold Fish - Fancy flowing fins, golden color
    createGoldfishMesh(size, bodyMaterial, secondaryMaterial) {
        // Round body
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 12);
        bodyGeometry.scale(1.2, 1.0, 0.8);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
        // Flowing tail (multiple layers for fancy effect)
        for (let i = 0; i < 3; i++) {
            const tailGeometry = new THREE.BoxGeometry(size * 0.5, size * (0.6 - i * 0.15), size * 0.02);
            const tailMaterial = new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.8 - i * 0.2,
                emissive: 0xffaa00,
                emissiveIntensity: 0.3
            });
            const tail = new THREE.Mesh(tailGeometry, tailMaterial);
            tail.position.set(-size * 0.5 - i * size * 0.1, 0, 0);
            tail.rotation.z = (Math.random() - 0.5) * 0.3;
            this.group.add(tail);
            if (i === 0) this.tail = tail;
        }
        
        // Flowing dorsal fin
        const dorsalGeometry = new THREE.BoxGeometry(size * 0.4, size * 0.4, size * 0.02);
        const dorsalMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdd00,
            transparent: true,
            opacity: 0.7,
            emissive: 0xffaa00,
            emissiveIntensity: 0.3
        });
        const dorsal = new THREE.Mesh(dorsalGeometry, dorsalMaterial);
        dorsal.position.set(0, size * 0.45, 0);
        this.group.add(dorsal);
        
        // Flowing pectoral fins
        [-1, 1].forEach(side => {
            const finGeometry = new THREE.BoxGeometry(size * 0.3, size * 0.02, size * 0.25);
            const finMaterial = new THREE.MeshStandardMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.6,
                emissive: 0xffaa00,
                emissiveIntensity: 0.2
            });
            const fin = new THREE.Mesh(finGeometry, finMaterial);
            fin.position.set(size * 0.1, -size * 0.1, side * size * 0.35);
            fin.rotation.x = side * 0.4;
            this.group.add(fin);
        });
        
        // Bulging eyes (goldfish characteristic)
        [-1, 1].forEach(side => {
            const eyeGeometry = new THREE.SphereGeometry(size * 0.1, 10, 10);
            const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.4, size * 0.15, side * size * 0.25);
            this.group.add(eye);
            
            const pupilGeometry = new THREE.SphereGeometry(size * 0.05, 8, 8);
            const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
            const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            pupil.position.set(size * 0.48, size * 0.15, side * size * 0.28);
            this.group.add(pupil);
        });
        
        // Golden sparkle particles
        for (let i = 0; i < 5; i++) {
            const sparkleGeometry = new THREE.SphereGeometry(size * 0.03, 6, 6);
            const sparkleMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffff00,
                emissiveIntensity: 1.0
            });
            const sparkle = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
            sparkle.position.set(
                (Math.random() - 0.5) * size * 0.8,
                (Math.random() - 0.5) * size * 0.6,
                (Math.random() - 0.5) * size * 0.4
            );
            this.group.add(sparkle);
        }
    }
    
    // Helper: Add eyes to fish
    addEyes(size, xPos = 0.7, yPos = 0.1) {
        const eyeGeometry = new THREE.SphereGeometry(size / 12, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const pupilGeometry = new THREE.SphereGeometry(size / 18, 8, 8);
        const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        [-1, 1].forEach(side => {
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * xPos, size * yPos, side * size * 0.15);
            this.group.add(eye);
            
            const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
            pupil.position.set(size * (xPos + 0.05), size * yPos, side * size * 0.18);
            this.group.add(pupil);
        });
    }
    
    // Helper: Add side fins
    addFins(size, material) {
        const finGeometry = new THREE.ConeGeometry(size / 4, size / 3, 3);
        [-1, 1].forEach(side => {
            const fin = new THREE.Mesh(finGeometry, material);
            fin.rotation.z = side * Math.PI / 3;
            fin.position.set(0, side * size * 0.2, side * size * 0.25);
            this.group.add(fin);
        });
    }
    
    spawn(position) {
        this.group.position.copy(position);
        this.hp = this.config.hp;
        this.isActive = true;
        this.isFrozen = false;
        this.group.visible = true;
        
        // Random initial velocity
        this.velocity.set(
            (Math.random() - 0.5) * this.speed,
            (Math.random() - 0.5) * this.speed * 0.3,
            (Math.random() - 0.5) * this.speed
        );
        
        // Reset material
        this.body.material.emissiveIntensity = 0.1;
        
        // Issue #5: Trigger rare fish effects for tier4 (boss fish)
        triggerRareFishEffects(this.tier);
    }
    
    update(deltaTime, allFish) {
        if (!this.isActive) return;
        
        // Handle freeze
        if (this.isFrozen) {
            this.freezeTimer -= deltaTime;
            if (this.freezeTimer <= 0) {
                this.isFrozen = false;
                this.body.material.emissive.setHex(this.config.color);
                this.body.material.emissiveIntensity = 0.1;
            }
            return;
        }
        
        // Initialize pattern state if needed
        if (!this.patternState) {
            this.patternState = {
                timer: 0,
                phase: 'normal',
                burstTimer: 0,
                waveOffset: Math.random() * Math.PI * 2,
                circleAngle: Math.random() * Math.PI * 2,
                stopTimer: 0,
                territoryCenter: this.group.position.clone(),
                jumpPhase: 0
            };
        }
        
        // Reset acceleration
        this.acceleration.set(0, 0, 0);
        
        // Apply pattern-specific behavior
        const pattern = this.config.pattern || 'cruise';
        this.applySwimmingPattern(pattern, deltaTime, allFish);
        
        // Apply boids behavior (stronger for schooling fish)
        const category = this.config.category || 'standard';
        if (category === 'smallSchool' || pattern === 'waveFormation' || pattern === 'baitBall' || pattern === 'groupCoordination') {
            this.applyBoids(allFish, 2.0); // Stronger schooling
        } else if (category === 'mediumLarge' || category === 'reefFish') {
            this.applyBoids(allFish, 1.0); // Normal schooling
        } else {
            this.applyBoids(allFish, 0.3); // Weak schooling for solitary fish
        }
        
        // Apply boundary forces
        this.applyBoundaryForces();
        
        // Update velocity
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
        
        // Limit speed based on pattern
        let maxSpeed = this.speed;
        if (this.patternState.phase === 'burst') {
            maxSpeed = this.config.speedMax * 1.5; // Burst speed
        } else if (this.patternState.phase === 'stop') {
            maxSpeed = this.speed * 0.1; // Almost stopped
        }
        
        const currentSpeed = this.velocity.length();
        if (currentSpeed > maxSpeed) {
            this.velocity.multiplyScalar(maxSpeed / currentSpeed);
        }
        
        // Update position
        this.group.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Update rotation to face movement direction
        this.updateRotation();
        
        // Animate tail
        this.animateTail(deltaTime);
        
        // Update pattern timer
        this.patternState.timer += deltaTime;
    }
    
    // Apply swimming pattern based on species
    applySwimmingPattern(pattern, deltaTime, allFish) {
        const time = performance.now() * 0.001;
        
        switch (pattern) {
            case 'cruise':
                // Continuous slow cruise (whale, sharks, tuna)
                // Maintain steady direction with slight variations
                if (Math.random() < 0.01) {
                    this.acceleration.x += (Math.random() - 0.5) * 20;
                    this.acceleration.z += (Math.random() - 0.5) * 20;
                }
                break;
                
            case 'burstAttack':
            case 'burstSprint':
                // Burst sprint pattern (shark, marlin, barracuda)
                this.patternState.burstTimer -= deltaTime;
                if (this.patternState.burstTimer <= 0) {
                    if (this.patternState.phase === 'normal') {
                        // Start burst
                        this.patternState.phase = 'burst';
                        this.patternState.burstTimer = 0.5 + Math.random() * 1.0;
                        // Pick random direction for burst
                        this.acceleration.x += (Math.random() - 0.5) * 200;
                        this.acceleration.z += (Math.random() - 0.5) * 200;
                    } else {
                        // End burst, return to normal
                        this.patternState.phase = 'normal';
                        this.patternState.burstTimer = 3 + Math.random() * 5;
                    }
                }
                break;
                
            case 'sShape':
                // S-shaped swimming (hammerhead)
                const sWave = Math.sin(time * 2 + this.patternState.waveOffset) * 30;
                this.acceleration.z += sWave;
                break;
                
            case 'synchronizedFast':
                // Fast synchronized swimming (tuna)
                // Strong alignment with nearby fish
                this.acceleration.x += Math.sin(time * 3) * 10;
                break;
                
            case 'irregularTurns':
                // Fast irregular paths with sudden turns (mahi-mahi)
                if (Math.random() < 0.02) {
                    this.acceleration.x += (Math.random() - 0.5) * 150;
                    this.acceleration.z += (Math.random() - 0.5) * 150;
                }
                break;
                
            case 'ambush':
                // Still waiting + explosive sprints (barracuda)
                this.patternState.burstTimer -= deltaTime;
                if (this.patternState.phase === 'normal') {
                    // Almost stationary
                    this.velocity.multiplyScalar(0.95);
                    if (this.patternState.burstTimer <= 0 && Math.random() < 0.01) {
                        this.patternState.phase = 'burst';
                        this.patternState.burstTimer = 0.3 + Math.random() * 0.5;
                        this.acceleration.x += (Math.random() - 0.5) * 300;
                        this.acceleration.z += (Math.random() - 0.5) * 300;
                    }
                } else {
                    if (this.patternState.burstTimer <= 0) {
                        this.patternState.phase = 'normal';
                        this.patternState.burstTimer = 2 + Math.random() * 4;
                    }
                }
                break;
                
            case 'bottomBurst':
                // Slow bottom movement + short bursts (grouper)
                this.acceleration.y -= 5; // Tendency to stay low
                if (Math.random() < 0.005) {
                    this.acceleration.x += (Math.random() - 0.5) * 100;
                    this.acceleration.z += (Math.random() - 0.5) * 100;
                }
                break;
                
            case 'stopAndGo':
                // Rowing motion stop-and-go (parrotfish)
                this.patternState.stopTimer -= deltaTime;
                if (this.patternState.stopTimer <= 0) {
                    if (this.patternState.phase === 'normal') {
                        this.patternState.phase = 'stop';
                        this.patternState.stopTimer = 0.5 + Math.random() * 1.0;
                    } else {
                        this.patternState.phase = 'normal';
                        this.patternState.stopTimer = 1 + Math.random() * 2;
                        // Push forward after stop
                        this.acceleration.x += this.velocity.x > 0 ? 50 : -50;
                        this.acceleration.z += this.velocity.z > 0 ? 50 : -50;
                    }
                }
                if (this.patternState.phase === 'stop') {
                    this.velocity.multiplyScalar(0.9);
                }
                break;
                
            case 'elegantGlide':
                // Elegant gliding + vertical movement (angelfish)
                this.acceleration.y += Math.sin(time * 1.5 + this.patternState.waveOffset) * 15;
                break;
                
            case 'agileWeave':
                // Agile weaving + quick short moves (butterflyfish)
                this.acceleration.x += Math.sin(time * 4 + this.patternState.waveOffset) * 25;
                this.acceleration.z += Math.cos(time * 3 + this.patternState.waveOffset) * 25;
                break;
                
            case 'groupCoordination':
                // Light up-down swimming + group coordination (blue tang)
                this.acceleration.y += Math.sin(time * 2 + this.patternState.waveOffset) * 20;
                break;
                
            case 'waveFormation':
                // Dense synchronized wave formations (sardine)
                const waveX = Math.sin(time * 3 + this.group.position.z * 0.01) * 20;
                const waveY = Math.cos(time * 2 + this.group.position.x * 0.01) * 10;
                this.acceleration.x += waveX;
                this.acceleration.y += waveY;
                break;
                
            case 'baitBall':
                // Fast synchronized turns forming "bait balls" (anchovy)
                // Tendency to form tight groups
                const centerX = 0;
                const centerZ = 0;
                const toCenterX = centerX - this.group.position.x;
                const toCenterZ = centerZ - this.group.position.z;
                this.acceleration.x += toCenterX * 0.05;
                this.acceleration.z += toCenterZ * 0.05;
                // Add swirling motion
                this.acceleration.x += Math.sin(time * 4) * 15;
                this.acceleration.z += Math.cos(time * 4) * 15;
                break;
                
            case 'territorial':
                // Short distance swimming near territory (clownfish)
                const toTerritoryX = this.patternState.territoryCenter.x - this.group.position.x;
                const toTerritoryZ = this.patternState.territoryCenter.z - this.group.position.z;
                const distFromTerritory = Math.sqrt(toTerritoryX * toTerritoryX + toTerritoryZ * toTerritoryZ);
                if (distFromTerritory > 100) {
                    this.acceleration.x += toTerritoryX * 0.5;
                    this.acceleration.z += toTerritoryZ * 0.5;
                }
                // Quick darting movements
                if (Math.random() < 0.03) {
                    this.acceleration.x += (Math.random() - 0.5) * 80;
                    this.acceleration.z += (Math.random() - 0.5) * 80;
                }
                break;
                
            case 'defensiveCharge':
                // Quick up-down defensive charges (damselfish)
                if (Math.random() < 0.02) {
                    this.acceleration.y += (Math.random() - 0.5) * 100;
                }
                this.acceleration.x += Math.sin(time * 3) * 10;
                break;
                
            case 'wingGlide':
                // Wing flapping gliding flight (manta ray)
                // Smooth gliding with gentle up-down motion
                this.acceleration.y += Math.sin(time * 0.8 + this.patternState.waveOffset) * 8;
                // Gentle banking turns
                if (Math.random() < 0.005) {
                    this.acceleration.x += (Math.random() - 0.5) * 30;
                }
                break;
                
            case 'slowRotation':
                // Fin-propulsion slow rotation (pufferfish)
                this.velocity.multiplyScalar(0.98); // Very slow
                // Gentle rotation
                this.group.rotation.y += deltaTime * 0.2;
                if (Math.random() < 0.01) {
                    this.acceleration.x += (Math.random() - 0.5) * 20;
                    this.acceleration.z += (Math.random() - 0.5) * 20;
                }
                break;
                
            case 'verticalDrift':
                // Dorsal fin vibration vertical movement (seahorse)
                // Primarily vertical movement
                this.acceleration.y += Math.sin(time * 2 + this.patternState.waveOffset) * 15;
                // Very slow horizontal drift
                this.acceleration.x += Math.sin(time * 0.5) * 3;
                this.acceleration.z += Math.cos(time * 0.5) * 3;
                break;
                
            case 'glideJump':
                // Underwater sprint + gliding above water (flying fish)
                this.patternState.burstTimer -= deltaTime;
                if (this.patternState.phase === 'normal') {
                    // Normal swimming
                    if (this.patternState.burstTimer <= 0 && Math.random() < 0.005) {
                        this.patternState.phase = 'burst';
                        this.patternState.burstTimer = 1.5;
                        this.patternState.jumpPhase = 0;
                        // Jump upward
                        this.acceleration.y += 200;
                        this.acceleration.x += (Math.random() - 0.5) * 100;
                    }
                } else {
                    this.patternState.jumpPhase += deltaTime;
                    if (this.patternState.jumpPhase > 0.5) {
                        // Gliding phase - spread wings
                        this.acceleration.y -= 30; // Gentle descent
                    }
                    if (this.patternState.burstTimer <= 0) {
                        this.patternState.phase = 'normal';
                        this.patternState.burstTimer = 3 + Math.random() * 5;
                    }
                }
                break;
                
            default:
                // Default straight swimming with slight variation
                if (Math.random() < 0.02) {
                    this.acceleration.x += (Math.random() - 0.5) * 30;
                    this.acceleration.z += (Math.random() - 0.5) * 30;
                }
        }
    }
    
    applyBoids(allFish, strength = 1.0) {
        const sepDistSq = CONFIG.boids.separationDistance * CONFIG.boids.separationDistance;
        const cohDistSq = CONFIG.boids.cohesionDistance * CONFIG.boids.cohesionDistance;
        
        let sepX = 0, sepY = 0, sepZ = 0, sepCount = 0;
        let cohX = 0, cohY = 0, cohZ = 0, cohCount = 0;
        
        const myPos = this.group.position;
        
        for (let i = 0; i < allFish.length; i++) {
            const other = allFish[i];
            if (other === this || !other.isActive || other.tier !== this.tier) continue;
            
            const otherPos = other.group.position;
            const dx = myPos.x - otherPos.x;
            const dy = myPos.y - otherPos.y;
            const dz = myPos.z - otherPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            
            if (distSq < sepDistSq && distSq > 0) {
                const invDist = 1 / Math.sqrt(distSq);
                sepX += dx * invDist;
                sepY += dy * invDist;
                sepZ += dz * invDist;
                sepCount++;
            }
            
            if (distSq < cohDistSq) {
                cohX += otherPos.x;
                cohY += otherPos.y;
                cohZ += otherPos.z;
                cohCount++;
            }
        }
        
        if (sepCount > 0) {
            this.acceleration.x += (sepX / sepCount) * CONFIG.boids.separationWeight * strength;
            this.acceleration.y += (sepY / sepCount) * CONFIG.boids.separationWeight * strength;
            this.acceleration.z += (sepZ / sepCount) * CONFIG.boids.separationWeight * strength;
        }
        
        if (cohCount > 0) {
            const centerX = cohX / cohCount - myPos.x;
            const centerY = cohY / cohCount - myPos.y;
            const centerZ = cohZ / cohCount - myPos.z;
            this.acceleration.x += centerX * 0.01 * CONFIG.boids.cohesionWeight * strength;
            this.acceleration.y += centerY * 0.01 * CONFIG.boids.cohesionWeight * strength;
            this.acceleration.z += centerZ * 0.01 * CONFIG.boids.cohesionWeight * strength;
        }
    }
    
    applyBoundaryForces() {
        // Use rectangular bounds for aquarium tank
        const { width, height, depth, floorY } = CONFIG.aquarium;
        const { marginX, marginY, marginZ } = CONFIG.fishArena;
        const pos = this.group.position;
        const force = new THREE.Vector3();
        
        // Calculate bounds inside the tank with margins
        const minX = -width / 2 + marginX;
        const maxX = width / 2 - marginX;
        const minY = floorY + marginY;
        const maxY = floorY + height - marginY;
        const minZ = -depth / 2 + marginZ;
        const maxZ = depth / 2 - marginZ;
        
        // X boundaries (left/right walls)
        if (pos.x < minX) {
            const t = (minX - pos.x) / marginX;
            force.x += t * 4.0;
        } else if (pos.x > maxX) {
            const t = (pos.x - maxX) / marginX;
            force.x -= t * 4.0;
        }
        
        // Y boundaries (floor/ceiling)
        if (pos.y < minY) {
            const t = (minY - pos.y) / marginY;
            force.y += t * 4.0;
        } else if (pos.y > maxY) {
            const t = (pos.y - maxY) / marginY;
            force.y -= t * 4.0;
        }
        
        // Z boundaries (front/back walls)
        if (pos.z < minZ) {
            const t = (minZ - pos.z) / marginZ;
            force.z += t * 4.0;
        } else if (pos.z > maxZ) {
            const t = (pos.z - maxZ) / marginZ;
            force.z -= t * 4.0;
        }
        
        this.acceleration.add(force.multiplyScalar(60));
    }
    
    updateRotation() {
        if (this.velocity.length() > 0.1) {
            const targetRotation = Math.atan2(-this.velocity.z, this.velocity.x);
            this.group.rotation.y = targetRotation;
            
            const tiltAmount = Math.atan2(this.velocity.y, Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z));
            this.group.rotation.z = -tiltAmount * 0.5;
        }
    }
    
    animateTail(deltaTime) {
        // Only animate tail if the fish has one (some special fish forms don't have tails)
        if (!this.tail) return;
        const time = performance.now() * 0.01;
        this.tail.rotation.y = Math.sin(time + this.group.position.x) * 0.3;
    }
    
    takeDamage(damage, weaponKey) {
        // BUG FIX: Guard against taking damage when already dead
        // This prevents multiple die() calls and duplicate respawn timers
        if (!this.isActive) return false;
        
        // Phase 2: Shield Turtle - check if fish has shield
        if (this.config.ability === 'shield' && this.shieldHP > 0) {
            // Damage shield first
            this.shieldHP -= damage;
            
            // Shield hit effect
            if (this.shieldBubble) {
                this.shieldBubble.material.emissiveIntensity = 1.0;
                setTimeout(() => {
                    if (this.shieldBubble) {
                        this.shieldBubble.material.emissiveIntensity = 0.3;
                    }
                }, 100);
                
                // Update shield opacity based on remaining HP
                const shieldPercent = Math.max(0, this.shieldHP / this.config.shieldHP);
                this.shieldBubble.material.opacity = 0.3 * shieldPercent;
                
                // Shield broken
                if (this.shieldHP <= 0) {
                    this.shieldBubble.visible = false;
                    // Play shield break sound
                    playImpactSound('shieldBreak');
                    // Screen flash for shield break
                    triggerScreenFlash(0x00ffff, 0.2);
                }
            }
            return false; // Shield absorbed damage, fish not killed
        }
        
        this.hp -= damage;
        
        // Flash effect
        this.body.material.emissiveIntensity = 0.8;
        setTimeout(() => {
            if (this.isActive) {
                this.body.material.emissiveIntensity = 0.1;
            }
        }, 100);
        
        if (this.hp <= 0) {
            this.die(weaponKey);
            return true;
        }
        return false;
    }
    
    die(weaponKey) {
        this.isActive = false;
        this.group.visible = false;
        
        const deathPosition = this.group.position.clone();
        
        // Issue #16: Play impact sound
        playImpactSound('hit');
        
        // Phase 2: Trigger special abilities on death
        if (this.config.ability) {
            this.triggerAbility(deathPosition, weaponKey);
        }
        
        // COMBO SYSTEM: Update combo and get bonus
        const comboBonus = updateComboOnKill();
        
        // NEW RTP SYSTEM: Casino-standard kill rate calculation
        // Kill Rate = Target RTP / Effective Payout
        // This ensures long-term RTP converges to target (30-40% based on weapon)
        const weapon = CONFIG.weapons[weaponKey];
        const fishReward = this.config.reward;
        const effectivePayout = fishReward * weapon.multiplier;
        
        // Calculate kill rate using new RTP system
        const killRate = calculateKillRate(fishReward, weaponKey);
        
        // Determine if this kill awards a payout based on kill rate
        const isKill = Math.random() < killRate;
        // Apply combo bonus to winnings
        const baseWin = isKill ? effectivePayout : 0;
        const win = baseWin > 0 ? Math.floor(baseWin * (1 + comboBonus)) : 0;
        
        // Record the win for RTP tracking (bet was already recorded when shot was fired)
        if (win > 0) {
            recordWin(win);
            gameState.balance += win;
            gameState.score += Math.floor(win);
            
            // Issue #16: Play size-based coin sound
            // Determine fish size from tier
            let fishSize = 'small';
            if (this.tier === 'tier4' || this.isBoss) {
                fishSize = 'boss';
            } else if (this.tier === 'tier3') {
                fishSize = 'large';
            } else if (this.tier === 'tier2') {
                fishSize = 'medium';
            }
            playCoinSound(fishSize);
            
            // Show reward popup
            showRewardPopup(deathPosition, win);
            
            // Issue #16: Enhanced death explosion effects based on fish size
            spawnFishDeathEffect(deathPosition, fishSize, this.config.color);
            
            // Issue #16: Coin fly animation to score counter
            const coinCount = fishSize === 'boss' ? 10 : fishSize === 'large' ? 6 : fishSize === 'medium' ? 3 : 1;
            spawnCoinFlyToScore(deathPosition, coinCount, win);
        } else {
            createHitParticles(deathPosition, 0x666666, 5);
            // Issue #16: Play miss sound when no reward
            playImpactSound('miss');
        }
        
        // Respawn after delay
        setTimeout(() => this.respawn(), 2000 + Math.random() * 3000);
    }
    
    // Phase 2: Trigger special ability when fish dies
    triggerAbility(position, weaponKey) {
        switch (this.config.ability) {
            case 'bomb':
                // Bomb Crab: Explode and damage nearby fish
                this.triggerBombExplosion(position, weaponKey);
                break;
            case 'lightning':
                // Electric Eel: Chain lightning to nearby fish
                this.triggerChainLightningAbility(position, weaponKey);
                break;
            case 'bonus':
                // Gold Fish: Extra coin burst
                this.triggerBonusCoins(position);
                break;
            // Shield ability is handled in takeDamage, not on death
        }
    }
    
    // Bomb Crab explosion - damages nearby fish
    triggerBombExplosion(position, weaponKey) {
        const radius = this.config.abilityRadius || 200;
        const damage = this.config.abilityDamage || 300;
        
        // Visual explosion effect (orange/red)
        spawnMegaExplosion(position, 0xff4400);
        triggerScreenShakeWithStrength(4);
        triggerScreenFlash(0xff4400, 0.3);
        
        // Play explosion sound
        playImpactSound('explosion');
        
        // Damage all fish in radius
        activeFish.forEach(fish => {
            if (fish.isActive && fish !== this) {
                const dist = fish.group.position.distanceTo(position);
                if (dist < radius) {
                    // Damage falls off with distance
                    const falloff = 1 - (dist / radius);
                    const actualDamage = damage * falloff;
                    fish.takeDamage(actualDamage, weaponKey);
                }
            }
        });
        
        // Show ability notification
        showAbilityNotification('BOMB CRAB EXPLOSION!', 0xff4400);
    }
    
    // Electric Eel chain lightning - jumps to nearby fish
    triggerChainLightningAbility(position, weaponKey) {
        const maxChains = this.config.abilityChains || 4;
        const baseDamage = this.config.abilityDamage || 150;
        const decay = this.config.abilityDecay || 0.6;
        
        // Find nearby fish to chain to
        let currentPos = position.clone();
        let chainedFish = new Set();
        let currentDamage = baseDamage;
        
        for (let i = 0; i < maxChains; i++) {
            // Find nearest unchained fish
            let nearestFish = null;
            let nearestDist = 300; // Max chain distance
            
            activeFish.forEach(fish => {
                if (fish.isActive && !chainedFish.has(fish)) {
                    const dist = fish.group.position.distanceTo(currentPos);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestFish = fish;
                    }
                }
            });
            
            if (nearestFish) {
                chainedFish.add(nearestFish);
                
                // Draw lightning bolt between positions
                setTimeout(() => {
                    spawnLightningBoltBetween(currentPos.clone(), nearestFish.group.position.clone(), 0x00ffff);
                }, i * 150);
                
                // Damage the fish
                setTimeout(() => {
                    if (nearestFish.isActive) {
                        nearestFish.takeDamage(currentDamage, weaponKey);
                    }
                }, i * 150 + 50);
                
                currentPos = nearestFish.group.position.clone();
                currentDamage *= decay;
            } else {
                break; // No more fish to chain to
            }
        }
        
        // Visual and audio effects
        triggerScreenFlash(0x00ffff, 0.2);
        playImpactSound('lightning');
        
        // Show ability notification
        if (chainedFish.size > 0) {
            showAbilityNotification(`ELECTRIC EEL! ${chainedFish.size} fish shocked!`, 0x00ffff);
        }
    }
    
    // Gold Fish bonus coins
    triggerBonusCoins(position) {
        const bonusCoins = this.config.bonusCoins || 10;
        
        // Spawn extra coin burst
        spawnCoinBurst(position, bonusCoins);
        
        // Golden flash effect
        triggerScreenFlash(0xffdd00, 0.2);
        
        // Play special coin sound
        playCoinSound('boss');
        
        // Show ability notification
        showAbilityNotification('GOLD FISH BONUS!', 0xffdd00);
    }
    
    respawn() {
        // Issue #1: Respawn fish in full 3D space around cannon (immersive 360°)
        const position = getRandomFishPositionIn3DSpace();
        this.spawn(position);
        // BUG FIX: Only push if not already in activeFish to prevent duplicates
        // This fixes the "fish freeze after 30 minutes" bug caused by array corruption
        if (!activeFish.includes(this)) {
            activeFish.push(this);
        }
    }
}

function createFishPool() {
    fishGroup = new THREE.Group();
    scene.add(fishGroup);
    
    bulletGroup = new THREE.Group();
    scene.add(bulletGroup);
    
    particleGroup = new THREE.Group();
    scene.add(particleGroup);
    
    // Issue #15: Create fish for each tier, EXCLUDING boss-only species
    // Boss fish (blueWhale, greatWhiteShark, mantaRay, sardine, marlin) only spawn during Boss Mode
    Object.entries(CONFIG.fishTiers).forEach(([tier, config]) => {
        // Skip boss-only species during normal gameplay
        if (BOSS_ONLY_SPECIES.includes(tier)) {
            return; // Don't create these fish in the normal pool
        }
        
        for (let i = 0; i < config.count; i++) {
            const fish = new Fish(tier, config);
            fishPool.push(fish);
        }
    });
}

// Get random position inside the aquarium tank (rectangular bounds)
// Issue #1: Fish spawn in full 3D space around cannon (which is in center)
function getRandomFishPositionIn3DSpace() {
    const { width, height, depth, floorY } = CONFIG.aquarium;
    const { marginX, marginY, marginZ } = CONFIG.fishArena;
    
    // Calculate bounds inside the tank with margins
    const minX = -width / 2 + marginX;
    const maxX = width / 2 - marginX;
    // Fish spawn ABOVE the cannon (which is at bottom floor)
    // Cannon is at floorY + 30, so fish spawn from floorY + 300 upward
    const cannonY = floorY + 30;
    const minY = cannonY + 250;  // Fish spawn at least 250 units above cannon
    const maxY = floorY + height - marginY;
    const minZ = -depth / 2 + marginZ;
    const maxZ = depth / 2 - marginZ;
    
    // Minimum horizontal distance from cannon center (X=0, Z=0)
    const minHorizontalDistFromCannon = 150;
    
    let x, y, z, horizontalDist;
    do {
        // Random position inside the tank (above cannon)
        x = minX + Math.random() * (maxX - minX);
        y = minY + Math.random() * (maxY - minY);
        z = minZ + Math.random() * (maxZ - minZ);
        horizontalDist = Math.sqrt(x*x + z*z);
    } while (horizontalDist < minHorizontalDistFromCannon);  // Ensure fish don't spawn directly above cannon
    
    return new THREE.Vector3(x, y, z);
}

function spawnInitialFish() {
    // MULTIPLAYER: Skip local fish spawning in multiplayer mode - fish come from server
    if (multiplayerMode) {
        console.log('[GAME] Skipping local fish spawn - multiplayer mode uses server fish');
        return;
    }
    
    fishPool.forEach(fish => {
        // Issue #1: Spawn fish in full 3D space around cannon (immersive 360°)
        const position = getRandomFishPositionIn3DSpace();
        fish.spawn(position);
        activeFish.push(fish);
    });
}

// ==================== DYNAMIC FISH RESPAWN SYSTEM ====================
// Maintains target fish count and adjusts spawn rate based on kill rate
const FISH_SPAWN_CONFIG = {
    targetCount: 20,        // Target number of fish on screen
    minCount: 15,           // Minimum fish count before emergency spawn
    maxCount: 30,           // Maximum fish count
    normalSpawnInterval: 1.0,    // Normal spawn interval (seconds)
    emergencySpawnInterval: 0.3, // Emergency spawn interval when fish < minCount
    maintainSpawnInterval: 2.0   // Slow spawn when at target
};

let dynamicSpawnTimer = 0;

function updateDynamicFishSpawn(deltaTime) {
    // MULTIPLAYER: Skip local fish spawning in multiplayer mode - fish come from server
    if (multiplayerMode) return;
    
    dynamicSpawnTimer -= deltaTime;
    
    const currentFishCount = activeFish.length;
    let spawnInterval;
    
    // Determine spawn interval based on current fish count
    if (currentFishCount < FISH_SPAWN_CONFIG.minCount) {
        // Emergency: spawn quickly
        spawnInterval = FISH_SPAWN_CONFIG.emergencySpawnInterval;
    } else if (currentFishCount < FISH_SPAWN_CONFIG.targetCount) {
        // Below target: spawn normally
        spawnInterval = FISH_SPAWN_CONFIG.normalSpawnInterval;
    } else if (currentFishCount < FISH_SPAWN_CONFIG.maxCount) {
        // At target: slow spawn
        spawnInterval = FISH_SPAWN_CONFIG.maintainSpawnInterval;
    } else {
        // At max: don't spawn
        return;
    }
    
    if (dynamicSpawnTimer <= 0) {
        // Find an inactive fish from the pool to spawn
        const inactiveFish = fishPool.find(f => !f.isActive);
        if (inactiveFish) {
            const position = getRandomFishPositionIn3DSpace();
            inactiveFish.spawn(position);
            // Only push if not already in activeFish
            if (!activeFish.includes(inactiveFish)) {
                activeFish.push(inactiveFish);
            }
        }
        dynamicSpawnTimer = spawnInterval;
    }
}

// ==================== RTP (RETURN TO PLAYER) SYSTEM ====================
// Casino-standard RTP calculation: RTP = (Total Wins / Total Bets) * 100%
// Kill Rate = Target RTP / Fish Multiplier (based on fish reward, not weapon)
// 
// Fish-based RTP system (higher multiplier fish = slightly higher RTP):
// - 1x fish: 90% RTP (kill rate = 90%)
// - 3x fish: 92% RTP (kill rate = 30.67%)
// - 5x fish: 93% RTP (kill rate = 18.6%)
// - 8x fish: 94% RTP (kill rate = 11.75%)
// - 20x fish: 95% RTP (kill rate = 4.75%)

const RTP_CONFIG = {
    // RTP targets by FISH REWARD MULTIPLIER (not weapon)
    // Higher multiplier fish have slightly better RTP to encourage targeting them
    fishRTP: {
        1: 0.90,    // 1x fish: 90% RTP, killRate = 90%
        2: 0.91,    // 2x fish: 91% RTP, killRate = 45.5%
        3: 0.92,    // 3x fish: 92% RTP, killRate = 30.67%
        5: 0.93,    // 5x fish: 93% RTP, killRate = 18.6%
        8: 0.94,    // 8x fish: 94% RTP, killRate = 11.75%
        10: 0.94,   // 10x fish: 94% RTP, killRate = 9.4%
        15: 0.945,  // 15x fish: 94.5% RTP, killRate = 6.3%
        20: 0.95,   // 20x fish: 95% RTP, killRate = 4.75%
        30: 0.95,   // 30x fish: 95% RTP, killRate = 3.17%
        50: 0.95,   // 50x fish: 95% RTP, killRate = 1.9%
        100: 0.95,  // 100x fish: 95% RTP, killRate = 0.95%
        200: 0.95,  // 200x fish: 95% RTP, killRate = 0.475%
        500: 0.95   // 500x fish: 95% RTP, killRate = 0.19%
    },
    // Dynamic RTP adjustment bounds (90-95% market standard)
    minRTP: 0.88,     // Minimum RTP (88%) - increase kill rate if below
    maxRTP: 0.96,     // Maximum RTP (96%) - decrease kill rate if above
    // Tracking
    sessionStats: {
        totalBets: 0,
        totalWins: 0,
        shotsFired: 0,
        fishKilled: 0
    }
};

// Get RTP target for a fish based on its reward multiplier
function getFishRTP(fishReward) {
    // Find the closest matching multiplier in our RTP table
    const multipliers = Object.keys(RTP_CONFIG.fishRTP).map(Number).sort((a, b) => a - b);
    
    // Find the closest multiplier that's <= fishReward
    let closestMultiplier = 1;
    for (const mult of multipliers) {
        if (mult <= fishReward) {
            closestMultiplier = mult;
        } else {
            break;
        }
    }
    
    return RTP_CONFIG.fishRTP[closestMultiplier] || 0.90;
}

// Calculate kill rate based on fish reward multiplier
// Formula: killRate = targetRTP / fishReward
function calculateKillRate(fishReward, weaponKey) {
    // Get RTP based on fish reward (not weapon)
    const targetRTP = getFishRTP(fishReward);
    
    // Kill rate formula: killRate = targetRTP / multiplier
    // Example: 20x fish with 95% RTP → killRate = 0.95 / 20 = 4.75%
    let killRate = targetRTP / fishReward;
    
    // Dynamic adjustment based on current session RTP
    const currentRTP = getCurrentSessionRTP();
    if (currentRTP > 0) {
        if (currentRTP > RTP_CONFIG.maxRTP) {
            // Player winning too much - reduce kill rate by 10%
            killRate *= 0.9;
        } else if (currentRTP < RTP_CONFIG.minRTP) {
            // Player losing too much - increase kill rate by 10%
            killRate *= 1.1;
        }
    }
    
    // Clamp kill rate to reasonable bounds (0.1% to 95%)
    return Math.max(0.001, Math.min(0.95, killRate));
}

// Get current session RTP
function getCurrentSessionRTP() {
    if (RTP_CONFIG.sessionStats.totalBets <= 0) return 0;
    return RTP_CONFIG.sessionStats.totalWins / RTP_CONFIG.sessionStats.totalBets;
}

// Record a bet (shot fired)
function recordBet(weaponKey) {
    const weapon = CONFIG.weapons[weaponKey];
    const betAmount = weapon.cost;
    RTP_CONFIG.sessionStats.totalBets += betAmount;
    RTP_CONFIG.sessionStats.shotsFired++;
}

// Record a win (fish killed)
function recordWin(amount) {
    RTP_CONFIG.sessionStats.totalWins += amount;
    RTP_CONFIG.sessionStats.fishKilled++;
}

// Get RTP stats for debugging/display
function getRTPStats() {
    const stats = RTP_CONFIG.sessionStats;
    return {
        totalBets: stats.totalBets.toFixed(2),
        totalWins: stats.totalWins.toFixed(2),
        currentRTP: (getCurrentSessionRTP() * 100).toFixed(1) + '%',
        shotsFired: stats.shotsFired,
        fishKilled: stats.fishKilled,
        hitRate: stats.shotsFired > 0 ? ((stats.fishKilled / stats.shotsFired) * 100).toFixed(1) + '%' : '0%'
    };
}

// ==================== BULLET SYSTEM ====================
class Bullet {
    constructor() {
        this.isActive = false;
        this.weaponKey = '1x';
        this.velocity = new THREE.Vector3();
        this.lifetime = 0;
        
        this.createMesh();
    }
    
    createMesh() {
        this.group = new THREE.Group();
        
        // Main bullet - smaller to match reduced cannon (Issue #3)
        const bulletGeometry = new THREE.SphereGeometry(5, 10, 6);
        const bulletMaterial = new THREE.MeshStandardMaterial({
            color: 0x66ff66,
            emissive: 0x66ff66,
            emissiveIntensity: 0.8,
            metalness: 0.5,
            roughness: 0.2
        });
        this.bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        this.group.add(this.bullet);
        
        // Trail - smaller
        const trailGeometry = new THREE.ConeGeometry(3, 12, 6);
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0x66ff66,
            transparent: true,
            opacity: 0.5
        });
        this.trail = new THREE.Mesh(trailGeometry, trailMaterial);
        this.trail.rotation.x = Math.PI / 2;
        this.trail.position.z = -10;
        this.group.add(this.trail);
        
        this.group.visible = false;
        bulletGroup.add(this.group);
    }
    
    fire(origin, direction, weaponKey) {
        this.weaponKey = weaponKey;
        const weapon = CONFIG.weapons[weaponKey];
        this.isGrenade = (weapon.type === 'aoe' || weapon.type === 'superAoe');  // Issue #4: Track if this is a grenade (8x or 20x)
        
        this.group.position.copy(origin);
        this.velocity.copy(direction).normalize().multiplyScalar(weapon.speed);
        
        // Issue #4: Add upward arc for grenades
        if (this.isGrenade) {
            this.velocity.y += 200;  // Initial upward boost for arc trajectory
        }
        
        this.lifetime = 4;
        this.isActive = true;
        this.group.visible = true;
        
        // Update visual based on weapon
        this.bullet.material.color.setHex(weapon.color);
        this.bullet.material.emissive.setHex(weapon.color);
        this.trail.material.color.setHex(weapon.color);
        
        const scale = weapon.size / 8;
        this.bullet.scale.set(scale, scale, scale);
        this.trail.scale.set(scale, scale, scale);
        
        // Orient bullet in direction of travel
        this.group.lookAt(this.group.position.clone().add(direction));
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0) {
            this.deactivate();
            return;
        }
        
        // Issue #4: Apply gravity only for grenades (8x weapon) for arc trajectory
        if (this.isGrenade) {
            this.velocity.y -= 400 * deltaTime;  // Gravity pulls grenade down
            // Re-orient grenade to face direction of travel
            const lookTarget = this.group.position.clone().add(this.velocity.clone().normalize());
            this.group.lookAt(lookTarget);
        }
        
        // Update position
        this.group.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Check boundaries - very lenient to allow bullets to reach fish
        const { width, height, depth, floorY } = CONFIG.aquarium;
        const pos = this.group.position;
        // Allow bullets to travel within aquarium bounds with generous margins
        if (pos.y < floorY - 100 || pos.y > floorY + height + 200 ||
            pos.z > depth + 500 || pos.z < -1200 ||
            Math.abs(pos.x) > width / 2 + 300) {
            this.deactivate();
            return;
        }
        
        // Check fish collisions
        this.checkFishCollision();
    }
    
    checkFishCollision() {
        const weapon = CONFIG.weapons[this.weaponKey];
        
        for (const fish of activeFish) {
            if (!fish.isActive) continue;
            
            const distance = this.group.position.distanceTo(fish.group.position);
            // Very large collision radius for reliable hit detection (100 units + fish size)
            if (distance < fish.boundingRadius + 100) {
                const hitPos = this.group.position.clone();
                
                // Handle different weapon types
                if (weapon.type === 'chain') {
                    // Chain lightning: hit first fish, then chain to nearby fish
                    const killed = fish.takeDamage(weapon.damage, this.weaponKey);
                    createHitParticles(hitPos, weapon.color, 8);
                    
                    // Trigger chain lightning effect
                    triggerChainLightning(fish, this.weaponKey, weapon.damage);
                    
                    // Issue #14: Enhanced 5x hit effect
                    spawnWeaponHitEffect(this.weaponKey, hitPos, fish);
                    
                } else if (weapon.type === 'aoe' || weapon.type === 'superAoe') {
                    // AOE/SuperAOE explosion: damage all fish in radius
                    triggerExplosion(hitPos, this.weaponKey);
                    
                    // Issue #14/16: Enhanced 8x/20x hit effect (mega explosion)
                    spawnWeaponHitEffect(this.weaponKey, hitPos, fish);
                    
                    // Issue #16: Extra screen shake for 20x super weapon
                    if (weapon.type === 'superAoe') {
                        triggerScreenShakeWithStrength(5);
                        triggerScreenFlash(0xff00ff, 0.3);  // Purple flash
                    }
                    
                } else {
                    // Standard projectile or spread: single target damage
                    const killed = fish.takeDamage(weapon.damage, this.weaponKey);
                    if (!killed) {
                        createHitParticles(hitPos, weapon.color, 5);
                    }
                    
                    // Issue #14: Enhanced 1x/3x hit effect
                    spawnWeaponHitEffect(this.weaponKey, hitPos, fish);
                }
                
                this.deactivate();
                return;
            }
        }
    }
    
    deactivate() {
        this.isActive = false;
        this.group.visible = false;
        
        // For AOE/SuperAOE weapons, trigger explosion when bullet expires or goes out of bounds
        const weapon = CONFIG.weapons[this.weaponKey];
        if ((weapon.type === 'aoe' || weapon.type === 'superAoe') && this.lifetime <= 0) {
            // Don't trigger on normal deactivation from collision (already handled)
        }
    }
}

function createBulletPool() {
    for (let i = 0; i < 50; i++) {
        bulletPool.push(new Bullet());
    }
}

// Helper function to spawn a bullet in a specific direction
function spawnBulletFromDirection(origin, direction, weaponKey) {
    const bullet = bulletPool.find(b => !b.isActive);
    if (!bullet) return null;
    
    bullet.fire(origin.clone(), direction.clone(), weaponKey);
    activeBullets.push(bullet);
    return bullet;
}

function fireBullet(targetX, targetY) {
    const weaponKey = gameState.currentWeapon;
    const weapon = CONFIG.weapons[weaponKey];
    
    // Check cooldown - use shotsPerSecond to calculate cooldown
    if (gameState.cooldown > 0) return false;
    
    // MULTIPLAYER MODE: Send shoot to server, don't do local balance/cost handling
    // Server handles balance deduction and collision detection
    if (multiplayerMode && multiplayerManager) {
        // Calculate aim direction in 3D
        let aimX = targetX;
        let aimY = targetY;
        if (gameState.viewMode === 'fps') {
            aimX = window.innerWidth / 2;
            aimY = window.innerHeight / 2;
        }
        const direction3D = getAimDirectionFromMouse(aimX, aimY);
        
        // Get cannon muzzle position for local effects
        const muzzlePos = new THREE.Vector3();
        cannonMuzzle.getWorldPosition(muzzlePos);
        
        // RAY-PLANE INTERSECTION: Find where aim ray hits the fish plane (Y=0)
        // This gives us a concrete 3D world point that we can convert to server coordinates
        // Fish swim at Y=0 in 3D world, so we intersect with that plane
        // Ray equation: P(t) = muzzlePos + direction3D * t
        // Plane equation: Y = 0
        // Solve: muzzlePos.y + direction3D.y * t = 0 => t = -muzzlePos.y / direction3D.y
        
        // Check if ray can intersect the fish plane (direction.y must be positive to aim upward toward fish)
        if (direction3D.y <= 0.001) {
            // Aiming downward or horizontal - can't hit fish plane
            // Still play local effects but don't send to server
            console.log(`[GAME] Multiplayer shoot: aiming away from fish plane (dir.y=${direction3D.y.toFixed(3)}), skipping server shot`);
            gameState.cooldown = 1 / weapon.shotsPerSecond;
            playWeaponShot(weaponKey);
            spawnMuzzleFlash(weaponKey, muzzlePos.clone(), direction3D.clone());
            return true;
        }
        
        // Calculate intersection parameter t
        const t = -muzzlePos.y / direction3D.y;
        
        if (t <= 0) {
            // Intersection is behind the muzzle - shouldn't happen if direction.y > 0 and muzzle.y < 0
            console.log(`[GAME] Multiplayer shoot: intersection behind muzzle (t=${t.toFixed(3)}), skipping server shot`);
            gameState.cooldown = 1 / weapon.shotsPerSecond;
            playWeaponShot(weaponKey);
            spawnMuzzleFlash(weaponKey, muzzlePos.clone(), direction3D.clone());
            return true;
        }
        
        // Calculate intersection point in 3D world coordinates
        const intersectionX = muzzlePos.x + direction3D.x * t;
        const intersectionZ = muzzlePos.z + direction3D.z * t;
        
        // Convert to server coordinates using the same mapping as fish rendering (divide by 10)
        // Client: world = server * 10, so server = world / 10
        const serverTargetX = intersectionX / 10;
        const serverTargetZ = intersectionZ / 10;
        
        // Clamp to server MAP_BOUNDS to avoid shooting way off-map
        const clampedX = Math.max(-90, Math.min(90, serverTargetX));
        const clampedZ = Math.max(-60, Math.min(60, serverTargetZ));
        
        console.log(`[GAME] Multiplayer shoot: muzzle=(${muzzlePos.x.toFixed(1)},${muzzlePos.y.toFixed(1)},${muzzlePos.z.toFixed(1)}) dir=(${direction3D.x.toFixed(3)},${direction3D.y.toFixed(3)},${direction3D.z.toFixed(3)}) t=${t.toFixed(1)} intersection=(${intersectionX.toFixed(1)},${intersectionZ.toFixed(1)}) -> server=(${clampedX.toFixed(1)},${clampedZ.toFixed(1)})`);
        
        // Send target coordinates to server (not direction vector)
        // Server will calculate bullet trajectory from its cannon position to this target
        multiplayerManager.shoot(clampedX, clampedZ);
        
        // Set cooldown locally for responsiveness
        gameState.cooldown = 1 / weapon.shotsPerSecond;
        
        // Play local effects immediately for responsiveness
        playWeaponShot(weaponKey);
        spawnMuzzleFlash(weaponKey, muzzlePos.clone(), direction3D.clone());
        
        return true;
    }
    
    // SINGLE PLAYER MODE: Original logic
    // Check balance
    if (gameState.balance < weapon.cost) return false;
    
    // Deduct cost
    gameState.balance -= weapon.cost;
    
    // Record bet for RTP tracking
    recordBet(weaponKey);
    
    // Set cooldown based on shotsPerSecond
    gameState.cooldown = 1 / weapon.shotsPerSecond;
    
    // Issue #16: Play weapon-specific shooting sound
    playWeaponShot(weaponKey);
    
    // Track last weapon used for reward calculation
    gameState.lastWeaponKey = weaponKey;
    
    // Issue #9: Use SAME direction calculation as cannon aiming for perfect alignment
    // This ensures bullets go exactly where the cannon barrel points
    // Issue #16 CORRECTION: All weapons have 100% accuracy - point-and-click shooting
    // FPS MODE FIX: In FPS mode, bullets go toward screen center (where crosshair is)
    // In 3RD PERSON mode, bullets go where you click
    let aimX = targetX;
    let aimY = targetY;
    if (gameState.viewMode === 'fps') {
        // FPS: Fire toward screen center (crosshair position)
        aimX = window.innerWidth / 2;
        aimY = window.innerHeight / 2;
    }
    const direction = getAimDirectionFromMouse(aimX, aimY);
    
    // Get cannon muzzle position for bullet spawn
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    // Fire based on weapon type
    if (weapon.type === 'spread') {
        // 3x weapon: Fire 3 bullets in fan spread pattern
        const spreadAngle = weapon.spreadAngle * (Math.PI / 180); // Convert to radians
        
        // Center bullet
        spawnBulletFromDirection(muzzlePos, direction, weaponKey);
        
        // Left bullet (rotate around Y axis)
        const leftDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle);
        spawnBulletFromDirection(muzzlePos, leftDir, weaponKey);
        
        // Right bullet (rotate around Y axis)
        const rightDir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -spreadAngle);
        spawnBulletFromDirection(muzzlePos, rightDir, weaponKey);
        
    } else {
        // Single bullet for projectile, chain, and aoe types
        spawnBulletFromDirection(muzzlePos, direction, weaponKey);
    }
    
    // Issue #14: Enhanced muzzle flash VFX
    spawnMuzzleFlash(weaponKey, muzzlePos.clone(), direction.clone());
    
    // Issue #14: Start charge effect for 5x and 8x weapons (visual only, doesn't delay shot)
    if (weaponKey === '5x' || weaponKey === '8x') {
        startCannonChargeEffect(weaponKey);
    }
    
    // Issue #14: Enhanced cannon recoil animation based on weapon
    const config = WEAPON_VFX_CONFIG[weaponKey];
    const recoilStrength = config ? config.recoilStrength : 5;
    
    if (cannonBarrel) {
        const originalY = cannonBarrel.position.y;
        cannonBarrel.position.y -= recoilStrength;
        
        // 3x weapon: Add barrel vibration/shake
        if (weaponKey === '3x') {
            const shakeIntensity = 2;
            let shakeCount = 0;
            const shake = () => {
                if (shakeCount < 4) {
                    cannonBarrel.position.x += (Math.random() - 0.5) * shakeIntensity;
                    cannonBarrel.position.z += (Math.random() - 0.5) * shakeIntensity;
                    shakeCount++;
                    setTimeout(shake, 20);
                } else {
                    cannonBarrel.position.x = 0;
                    cannonBarrel.position.z = 0;
                }
            };
            shake();
        }
        
        setTimeout(() => {
            if (cannonBarrel) cannonBarrel.position.y = originalY;
        }, 50 + recoilStrength * 5);
    }
    
    return true;
}

// ==================== PARTICLE SYSTEM ====================
class Particle {
    constructor() {
        const geometry = new THREE.SphereGeometry(3, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.visible = false;
        this.velocity = new THREE.Vector3();
        this.lifetime = 0;
        this.maxLifetime = 1;
        this.isActive = false;
        
        particleGroup.add(this.mesh);
    }
    
    spawn(position, velocity, color, size, lifetime) {
        this.mesh.position.copy(position);
        this.velocity.copy(velocity);
        this.mesh.material.color.setHex(color);
        this.mesh.scale.set(size, size, size);
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.isActive = true;
        this.mesh.visible = true;
        this.mesh.material.opacity = 1;
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0) {
            this.deactivate();
            return;
        }
        
        // Apply gravity and drag
        this.velocity.y -= 100 * deltaTime;
        this.velocity.multiplyScalar(0.98);
        
        this.mesh.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        this.mesh.material.opacity = this.lifetime / this.maxLifetime;
    }
    
    deactivate() {
        this.isActive = false;
        this.mesh.visible = false;
    }
}

function createParticleSystems() {
    createBulletPool();
    
    for (let i = 0; i < 200; i++) {
        particlePool.push(new Particle());
    }
    
    // Bubble system
    createBubbleSystem();
}

function createBubbleSystem() {
    setInterval(() => {
        if (gameState.isLoading || gameState.isPaused) return;
        
        const { width, depth, floorY, height } = CONFIG.aquarium;
        
        const particle = particlePool.find(p => !p.isActive);
        if (particle) {
            particle.spawn(
                new THREE.Vector3(
                    (Math.random() - 0.5) * width * 0.8,
                    floorY + 10,
                    (Math.random() - 0.5) * depth * 0.5
                ),
                new THREE.Vector3(
                    (Math.random() - 0.5) * 15,
                    40 + Math.random() * 30,
                    (Math.random() - 0.5) * 15
                ),
                0x88ccff,
                2 + Math.random() * 2,
                3 + Math.random() * 3
            );
            activeParticles.push(particle);
        }
    }, 600);
}

function createHitParticles(position, color, count) {
    for (let i = 0; i < count; i++) {
        const particle = particlePool.find(p => !p.isActive);
        if (particle) {
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 150
            );
            particle.spawn(position.clone(), velocity, color, 2 + Math.random() * 3, 0.8);
            activeParticles.push(particle);
        }
    }
}

// ==================== SPECIAL WEAPON EFFECTS ====================

// Chain Lightning Effect (5x weapon)
function triggerChainLightning(initialFish, weaponKey, initialDamage) {
    // Issue #6: Play lightning sound
    playSound('lightning');
    
    const weapon = CONFIG.weapons[weaponKey];
    const maxChains = weapon.maxChains || 5;
    const chainDecay = weapon.chainDecay || 0.8;
    const chainRadius = weapon.chainRadius || 200;
    
    const visitedFish = new Set();
    visitedFish.add(initialFish);
    
    let currentFish = initialFish;
    let currentDamage = initialDamage;
    let chainCount = 0;
    
    // Chain to nearby fish
    const chainToNext = () => {
        if (chainCount >= maxChains) return;
        
        // Find nearest unvisited fish within chain radius
        let nearestFish = null;
        let nearestDistance = chainRadius;
        
        for (const fish of activeFish) {
            if (!fish.isActive || visitedFish.has(fish)) continue;
            
            const distance = currentFish.group.position.distanceTo(fish.group.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestFish = fish;
            }
        }
        
        if (nearestFish) {
            // Apply decayed damage
            currentDamage *= chainDecay;
            const killed = nearestFish.takeDamage(Math.floor(currentDamage), weaponKey);
            
            // Spawn lightning arc visual
            spawnLightningArc(currentFish.group.position, nearestFish.group.position, weapon.color);
            
            // Create particles at hit location
            createHitParticles(nearestFish.group.position, weapon.color, 5);
            
            visitedFish.add(nearestFish);
            currentFish = nearestFish;
            chainCount++;
            
            // Issue #15: Increased delay between chain jumps for more visible effect (100ms instead of 50ms)
            setTimeout(chainToNext, 100);
        }
    };
    
    // Start chaining after initial hit
    setTimeout(chainToNext, 50);
}

// Spawn lightning arc visual between two points - Issue #3 & #15: Enhanced visuals with golden chain lightning
function spawnLightningArc(startPos, endPos, color) {
    const points = [];
    const segments = 16;  // More segments for more detail
    const direction = endPos.clone().sub(startPos);
    const length = direction.length();
    direction.normalize();
    
    // Create jagged lightning path with more dramatic zigzag
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = startPos.clone().add(direction.clone().multiplyScalar(length * t));
        
        // Add random offset for middle segments (not start/end) - larger offsets
        if (i > 0 && i < segments) {
            const jitter = 70 * (1 - Math.abs(t - 0.5) * 2);  // More jitter in middle
            point.x += (Math.random() - 0.5) * jitter;
            point.y += (Math.random() - 0.5) * jitter;
            point.z += (Math.random() - 0.5) * jitter;
        }
        
        points.push(point);
    }
    
    // Issue #15: Create main lightning bolt with bright golden-white core
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0xffffcc,  // Very bright golden-white core
        linewidth: 3,
        transparent: true,
        opacity: 1
    });
    
    const lightning = new THREE.Line(geometry, material);
    scene.add(lightning);
    
    // Issue #15: Create golden glow effect (second line with offset for fake thickness)
    const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffdd00,  // Golden glow
        linewidth: 6,
        transparent: true,
        opacity: 0.8
    });
    const glowLightning = new THREE.Line(geometry.clone(), glowMaterial);
    scene.add(glowLightning);
    
    // Issue #15: Create third line slightly offset for more thickness (WebGL line width workaround)
    const outerGlowMaterial = new THREE.LineBasicMaterial({
        color: 0xffaa00,  // Darker golden outer glow
        linewidth: 8,
        transparent: true,
        opacity: 0.5
    });
    const outerGlowLightning = new THREE.Line(geometry.clone(), outerGlowMaterial);
    outerGlowLightning.position.x += 2;
    outerGlowLightning.position.y += 2;
    scene.add(outerGlowLightning);
    
    // Issue #15: Add larger golden flash at hit point
    const flashGeometry = new THREE.SphereGeometry(40, 12, 12);  // Larger flash
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffee00,  // Bright golden flash
        transparent: true,
        opacity: 1.0
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(endPos);
    scene.add(flash);
    
    // Issue #15: Add golden spark particles along the lightning path
    const sparkGroup = new THREE.Group();
    for (let i = 0; i < 8; i++) {
        const sparkGeometry = new THREE.SphereGeometry(8, 6, 6);
        const sparkMaterial = new THREE.MeshBasicMaterial({
            color: 0xffdd00,
            transparent: true,
            opacity: 0.9
        });
        const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
        const t = Math.random();
        spark.position.copy(startPos.clone().lerp(endPos, t));
        spark.position.x += (Math.random() - 0.5) * 30;
        spark.position.y += (Math.random() - 0.5) * 30;
        spark.position.z += (Math.random() - 0.5) * 30;
        sparkGroup.add(spark);
    }
    scene.add(sparkGroup);
    
    // Issue #15: Slower fade out for more visible effect (400ms instead of 200ms)
    let opacity = 1;
    const fadeSpeed = 0.025;  // Slower fade (was 0.08)
    const fadeOut = () => {
        opacity -= fadeSpeed;
        material.opacity = opacity;
        glowMaterial.opacity = opacity * 0.7;
        outerGlowMaterial.opacity = opacity * 0.4;
        flashMaterial.opacity = opacity * 0.9;
        flash.scale.setScalar(1 + (1 - opacity) * 3);  // Expand flash more
        
        // Fade sparks
        sparkGroup.children.forEach(spark => {
            spark.material.opacity = opacity * 0.8;
            spark.scale.setScalar(1 + (1 - opacity) * 2);
        });
        
        if (opacity > 0) {
            requestAnimationFrame(fadeOut);
        } else {
            scene.remove(lightning);
            scene.remove(glowLightning);
            scene.remove(outerGlowLightning);
            scene.remove(flash);
            scene.remove(sparkGroup);
            geometry.dispose();
            material.dispose();
            glowMaterial.dispose();
            outerGlowMaterial.dispose();
            flashGeometry.dispose();
            flashMaterial.dispose();
            sparkGroup.children.forEach(spark => {
                spark.geometry.dispose();
                spark.material.dispose();
            });
        }
    };
    setTimeout(fadeOut, 80);
}

// AOE Explosion Effect (8x weapon)
function triggerExplosion(center, weaponKey) {
    // Issue #6: Play explosion sound
    playSound('explosion');
    
    const weapon = CONFIG.weapons[weaponKey];
    const aoeRadius = weapon.aoeRadius || 150;
    const damageCenter = weapon.damage || 250;
    const damageEdge = weapon.damageEdge || 100;
    
    // Spawn explosion visual
    spawnExplosionEffect(center, aoeRadius, weapon.color);
    
    // Damage all fish within radius
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        
        const distance = center.distanceTo(fish.group.position);
        if (distance <= aoeRadius) {
            // Calculate damage based on distance (linear falloff)
            const t = distance / aoeRadius; // 0 at center, 1 at edge
            const damage = Math.floor(damageCenter - (damageCenter - damageEdge) * t);
            
            fish.takeDamage(damage, weaponKey);
            createHitParticles(fish.group.position, weapon.color, 3);
        }
    }
}

// Spawn explosion visual effect
function spawnExplosionEffect(center, radius, color) {
    // Create expanding sphere
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    
    const explosion = new THREE.Mesh(geometry, material);
    explosion.position.copy(center);
    scene.add(explosion);
    
    // Create ring effect
    const ringGeometry = new THREE.TorusGeometry(1, 5, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(center);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    
    // Animate expansion
    let scale = 1;
    let opacity = 0.6;
    const maxScale = radius;
    
    const animate = () => {
        scale += radius * 0.08;
        opacity -= 0.05;
        
        explosion.scale.set(scale, scale, scale);
        explosion.material.opacity = Math.max(0, opacity);
        
        ring.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
        ring.material.opacity = Math.max(0, opacity);
        
        if (opacity > 0 && scale < maxScale) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(explosion);
            scene.remove(ring);
            geometry.dispose();
            material.dispose();
            ringGeometry.dispose();
            ringMaterial.dispose();
        }
    };
    
    animate();
    
    // Spawn burst particles
    createHitParticles(center, color, 20);
    createHitParticles(center, 0xffaa00, 15);
}

// ==================== UI FUNCTIONS ====================
function updateUI() {
    document.getElementById('balance-value').textContent = gameState.balance.toFixed(2);
    document.getElementById('fps-counter').textContent = `FPS: ${Math.round(1 / deltaTime) || 60}`;
}

function selectWeapon(weaponKey) {
    gameState.currentWeapon = weaponKey;
    
    // Issue #6: Play weapon switch sound
    playSound('weaponSwitch');
    
    document.querySelectorAll('.weapon-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.weapon === weaponKey) {
            btn.classList.add('active');
        }
    });
    
    updateCannonVisual();
    
    // Issue #14: Play weapon switch animation with ring color change
    playWeaponSwitchAnimation(weaponKey);
    
    // Issue #16: Update crosshair size based on weapon spread
    updateCrosshairForWeapon(weaponKey);
}

// Issue #16 CORRECTION: Simple crosshair color update (no size change - all weapons 100% accurate)
function updateCrosshairForWeapon(weaponKey) {
    const crosshair = document.getElementById('crosshair');
    if (!crosshair) return;
    
    // Fixed crosshair size for all weapons (100% accuracy)
    crosshair.style.width = '40px';
    crosshair.style.height = '40px';
    
    // Update crosshair color class based on weapon
    // IMPORTANT: Preserve fps-mode class if present (don't use className = which replaces all)
    const hasFpsMode = crosshair.classList.contains('fps-mode');
    crosshair.className = 'weapon-' + weaponKey;
    if (hasFpsMode) {
        crosshair.classList.add('fps-mode');
    }
}

function showRewardPopup(position, amount) {
    // Project 3D position to screen
    const vector = position.clone();
    vector.project(camera);
    
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
    
    const popup = document.createElement('div');
    popup.className = 'reward-popup';
    // Issue #6: Show whole numbers only, no decimals
    popup.textContent = `+${Math.round(amount)}`;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.getElementById('ui-overlay').appendChild(popup);
    
    setTimeout(() => popup.remove(), 1500);
}

// Issue 4: Apply RTP labels to weapon buttons (for testing/debugging)
function applyRtpLabels() {
    if (!CONFIG.debug || !CONFIG.debug.showRtpOnButtons) return;
    
    const rtpTable = CONFIG.rtp.entertainment;
    
    document.querySelectorAll('.weapon-btn').forEach(btn => {
        const weaponKey = btn.dataset.weapon;
        if (!weaponKey || !rtpTable[weaponKey]) return;
        
        const rtpValue = rtpTable[weaponKey];
        
        // Create RTP label element
        const rtpLabel = document.createElement('div');
        rtpLabel.className = 'rtp-label';
        rtpLabel.textContent = `RTP: ${(rtpValue * 100).toFixed(1)}%`;
        rtpLabel.style.cssText = `
            font-size: 9px;
            color: #ffff00;
            opacity: 0.9;
            margin-top: 2px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        `;
        
        btn.appendChild(rtpLabel);
    });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const container = document.getElementById('game-container');
    
    // Mouse move for aiming
    container.addEventListener('mousemove', (e) => {
        gameState.mouseX = e.clientX;
        gameState.mouseY = e.clientY;
        
        // FPS MODE: Free mouse look (no button required)
        if (gameState.viewMode === 'fps') {
            // Use Pointer Lock API if available and locked
            // movementX/Y gives raw mouse delta even when cursor is locked
            let deltaX, deltaY;
            
            if (document.pointerLockElement === container) {
                // Pointer is locked - use movementX/Y directly
                deltaX = e.movementX || 0;
                deltaY = e.movementY || 0;
            } else {
                // Fallback: track position manually (for browsers without pointer lock)
                if (gameState.lastFPSMouseX === null) {
                    gameState.lastFPSMouseX = e.clientX;
                    gameState.lastFPSMouseY = e.clientY;
                    return;
                }
                deltaX = e.clientX - gameState.lastFPSMouseX;
                deltaY = e.clientY - gameState.lastFPSMouseY;
                gameState.lastFPSMouseX = e.clientX;
                gameState.lastFPSMouseY = e.clientY;
            }
            
            // Apply rotation using same sensitivity as right-drag
            // FPS free-look uses higher sensitivity for comfortable gameplay
            // Increased multiplier from 10.0 to 30.0 for better responsiveness
            const fpsLevel = Math.max(1, Math.min(10, gameState.fpsSensitivityLevel || 5));
            const rotationSensitivity = CONFIG.camera.rotationSensitivityFPSBase * (fpsLevel / 10) * 30.0 * 1.2;
            
            // Calculate new yaw (horizontal rotation)
            // FIX: Negate deltaX so mouse right = view right (standard FPS controls)
            // In Three.js, positive rotation.y = counter-clockwise = turn left
            // So we need: mouse right (positive deltaX) -> decrease yaw -> turn right
            let newYaw = (cannonGroup ? cannonGroup.rotation.y : 0) - deltaX * rotationSensitivity;
            
            // Clamp yaw using centralized constant FPS_YAW_MAX (±50°)
            newYaw = Math.max(-FPS_YAW_MAX, Math.min(FPS_YAW_MAX, newYaw));
            
            // Calculate new pitch (vertical rotation)
            // IMPORTANT: Use correct sign convention - rotation.x = -pitch (same as rest of codebase)
            // Get current logical pitch (positive = look up, same as debug overlay)
            let currentPitch = cannonPitchGroup ? -cannonPitchGroup.rotation.x : 0;
            // Apply mouse delta: mouse up (negative deltaY) = look up (positive pitch)
            let newPitch = currentPitch - deltaY * rotationSensitivity;
            
            // Clamp logical pitch using centralized constants FPS_PITCH_MIN/MAX
            newPitch = Math.max(FPS_PITCH_MIN, Math.min(FPS_PITCH_MAX, newPitch));
            
            // Apply rotation to cannon
            if (cannonGroup) cannonGroup.rotation.y = newYaw;
            // Store using the shared convention: rotation.x = -pitch
            if (cannonPitchGroup) cannonPitchGroup.rotation.x = -newPitch;
            
            // Update camera to follow cannon
            updateFPSCamera();
            
            // Update crosshair (centered in FPS mode via CSS)
            const crosshair = document.getElementById('crosshair');
            if (crosshair) {
                // FPS MODE: Crosshair centered via CSS class (more robust)
                // No JS positioning needed - CSS handles it
            }
            return;
        }
        
        // 3RD PERSON MODE: Aim cannon at mouse position
        aimCannon(e.clientX, e.clientY);
        
        // Issue #16: Update crosshair position based on view mode
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            // 3RD PERSON MODE: Crosshair follows mouse
            crosshair.style.left = e.clientX + 'px';
            crosshair.style.top = e.clientY + 'px';
        }
    });
    
    // FPS mode: Reset mouse tracking when mouse leaves the container
    // This prevents giant rotation jumps when mouse re-enters
    container.addEventListener('mouseleave', () => {
        if (gameState.viewMode === 'fps') {
            gameState.lastFPSMouseX = null;
            gameState.lastFPSMouseY = null;
        }
    });
    
    // Left click to shoot
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        
        // Don't shoot if clicking on UI elements
        if (e.target.closest('#weapon-panel') || 
            e.target.closest('#auto-shoot-btn') ||
            e.target.closest('#settings-btn')) {
            return;
        }
        
        fireBullet(e.clientX, e.clientY);
    });
    
    // Weapon selection buttons
    document.querySelectorAll('.weapon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectWeapon(btn.dataset.weapon);
        });
    });
    
    // Auto-shoot toggle
    document.getElementById('auto-shoot-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        gameState.autoShoot = !gameState.autoShoot;
        const btn = e.target;
        btn.textContent = gameState.autoShoot ? 'AUTO ON' : 'AUTO OFF';
        btn.classList.toggle('active', gameState.autoShoot);
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Prevent context menu
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Right-click drag for camera rotation (horizontal + vertical)
    container.addEventListener('mousedown', (e) => {
        if (e.button === 2) {  // Right mouse button
            gameState.isRightDragging = true;
            gameState.rightDragStartX = e.clientX;
            gameState.rightDragStartY = e.clientY;
            // Store start values based on view mode
            if (gameState.viewMode === 'fps') {
                // In FPS mode, read cannon's current rotation as start values
                gameState.rightDragStartYaw = cannonGroup ? cannonGroup.rotation.y : 0;
                gameState.rightDragStartPitch = cannonPitchGroup ? cannonPitchGroup.rotation.x : 0;
            } else {
                gameState.rightDragStartYaw = gameState.cameraYaw;
                gameState.rightDragStartPitch = gameState.cameraPitch;
            }
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (gameState.isRightDragging) {
            // Issue 2 Fix: Use per-mode sensitivity from CONFIG
            // FPS mode uses level-based sensitivity (1-10 levels, each level = 10%)
            // SAFEGUARD: Ensure fpsSensitivityLevel is always valid (1-10, default 5)
            const fpsLevel = Math.max(1, Math.min(10, gameState.fpsSensitivityLevel || 5));
            const rotationSensitivity = gameState.viewMode === 'fps'
                ? CONFIG.camera.rotationSensitivityFPSBase * (fpsLevel / 10)
                : CONFIG.camera.rotationSensitivityThirdPerson;
            
            // Horizontal drag = yaw rotation (UNLIMITED 360°)
            // FIX: Negate dragDeltaX so drag right = view right (standard FPS controls)
            const dragDeltaX = e.clientX - gameState.rightDragStartX;
            let newYaw = gameState.rightDragStartYaw - dragDeltaX * rotationSensitivity;
            
            // Normalize yaw to [-PI, PI] to prevent unbounded growth
            while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
            while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
            
            // Vertical drag = pitch rotation (inverted: drag up = look up)
            const dragDeltaY = e.clientY - gameState.rightDragStartY;
            const newPitch = gameState.rightDragStartPitch - dragDeltaY * rotationSensitivity;
            
            // Update based on view mode
            if (gameState.viewMode === 'fps') {
                // In FPS mode, directly rotate the cannon (camera follows automatically)
                // Limit yaw to ±90° (180° total) - cannon can only face outward (fish area)
                // Player cannon is at 6 o'clock, facing -Z (yaw=0), so limit to [-90°, +90°]
                const maxYaw = Math.PI / 2;  // 90 degrees
                const clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, newYaw));
                
                if (cannonGroup) {
                    cannonGroup.rotation.y = clampedYaw;
                }
                if (cannonPitchGroup) {
                    // FPS Pitch Limits: Use centralized constants (FPS_PITCH_MIN/MAX)
                    // Note: cannonPitchGroup.rotation.x = -pitch (negated)
                    // FPS_PITCH_MIN = -35° (up limit), FPS_PITCH_MAX = +50° (down limit)
                    // For rotation.x: min = -35° (looking up), max = +50° (looking down)
                    const minRotationX = -35 * (Math.PI / 180);   // -35° up limit (prevents looking at ceiling)
                    const maxRotationX = 50 * (Math.PI / 180);    // +50° down limit (generous for fish)
                    cannonPitchGroup.rotation.x = Math.max(minRotationX, Math.min(maxRotationX, newPitch));
                }
                updateFPSCamera();
            } else {
                // Issue #9: NO CLAMPING for yaw - unlimited 360° rotation
                gameState.targetCameraYaw = newYaw;
                gameState.cameraYaw = newYaw;
                
                // Clamp pitch to ±45° (up/down range - keep some limit for vertical)
                gameState.targetCameraPitch = Math.max(-gameState.maxCameraPitch, Math.min(gameState.maxCameraPitch, newPitch));
                gameState.cameraPitch = gameState.targetCameraPitch;
                
                updateCameraRotation();
            }
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) {  // Right mouse button
            gameState.isRightDragging = false;
        }
    });
    
    // CENTER VIEW button handler
    document.getElementById('center-view-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        centerCameraView();
        // Update camera based on current view mode
        if (gameState.viewMode === 'fps') {
            updateFPSCamera();
        } else {
            updateCameraRotation();
        }
    });
    
    // VIEW MODE toggle button handler
    const viewModeBtn = document.getElementById('view-mode-btn');
    if (viewModeBtn) {
        viewModeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleViewMode();
        });
    }
    
    // Keyboard controls - Complete shortcut system for FPS mode
    // In FPS mode, mouse is locked for view control, so keyboard shortcuts are essential
    window.addEventListener('keydown', (e) => {
        // Weapon switching: 1-5 keys
        if (e.key === '1') {
            selectWeapon('1x');
            highlightButton('.weapon-btn[data-weapon="1x"]');
            return;
        } else if (e.key === '2') {
            selectWeapon('3x');
            highlightButton('.weapon-btn[data-weapon="3x"]');
            return;
        } else if (e.key === '3') {
            selectWeapon('5x');
            highlightButton('.weapon-btn[data-weapon="5x"]');
            return;
        } else if (e.key === '4') {
            selectWeapon('8x');
            highlightButton('.weapon-btn[data-weapon="8x"]');
            return;
        } else if (e.key === '5') {
            selectWeapon('20x');
            highlightButton('.weapon-btn[data-weapon="20x"]');
            return;
        }
        
        // Function toggle keys
        if (e.key === 'a' || e.key === 'A') {
            // A key: Toggle AUTO mode
            toggleAutoShoot();
            highlightButton('#auto-shoot-btn');
            return;
        } else if (e.key === ' ') {
            // Space key: Toggle view mode (FPS <-> 3RD PERSON)
            e.preventDefault(); // Prevent page scroll
            toggleViewMode();
            highlightButton('#view-mode-btn');
            return;
        } else if (e.key === 'c' || e.key === 'C') {
            // C key: Center view
            centerCameraView();
            if (gameState.viewMode === 'fps') {
                updateFPSCamera();
            } else {
                updateCameraRotation();
            }
            highlightButton('#center-view-btn');
            return;
        } else if (e.key === 'Escape') {
            // ESC key: Toggle settings panel
            toggleSettingsPanel();
            highlightButton('#settings-btn');
            return;
        } else if (e.key === 'h' || e.key === 'H' || e.key === 'F1') {
            // H or F1 key: Toggle help panel
            e.preventDefault();
            toggleHelpPanel();
            return;
        }
        
        // Camera rotation with D key (A is now for Auto toggle)
        // Use Q/E or arrow keys for camera rotation instead
        const rotationSpeed = 0.05;
        const maxYaw = Math.PI / 2;
        
        if (e.key === 'q' || e.key === 'Q' || e.key === 'ArrowLeft') {
            // Rotate camera left
            // FIX: In Three.js, increase yaw = turn left (counter-clockwise from above)
            if (gameState.viewMode === 'fps') {
                if (cannonGroup) {
                    let newYaw = cannonGroup.rotation.y + rotationSpeed;
                    cannonGroup.rotation.y = Math.max(-maxYaw, Math.min(maxYaw, newYaw));
                }
                updateFPSCamera();
            } else {
                let newYaw = gameState.cameraYaw + rotationSpeed;
                if (newYaw > Math.PI) newYaw -= 2 * Math.PI;
                gameState.targetCameraYaw = newYaw;
                gameState.cameraYaw = newYaw;
                updateCameraRotation();
            }
        } else if (e.key === 'd' || e.key === 'D' || e.key === 'e' || e.key === 'E' || e.key === 'ArrowRight') {
            // Rotate camera right
            // FIX: In Three.js, decrease yaw = turn right (clockwise from above)
            if (gameState.viewMode === 'fps') {
                if (cannonGroup) {
                    let newYaw = cannonGroup.rotation.y - rotationSpeed;
                    cannonGroup.rotation.y = Math.max(-maxYaw, Math.min(maxYaw, newYaw));
                }
                updateFPSCamera();
            } else {
                let newYaw = gameState.cameraYaw - rotationSpeed;
                if (newYaw < -Math.PI) newYaw += 2 * Math.PI;
                gameState.targetCameraYaw = newYaw;
                gameState.cameraYaw = newYaw;
                updateCameraRotation();
            }
        }else if (e.key === 'v' || e.key === 'V') {
            // V key also toggles view mode (legacy support)
            toggleViewMode();
            highlightButton('#view-mode-btn');
        }
    });
}

// Toggle AUTO shoot mode
function toggleAutoShoot() {
    gameState.autoShoot = !gameState.autoShoot;
    const btn = document.getElementById('auto-shoot-btn');
    if (btn) {
        btn.textContent = gameState.autoShoot ? 'AUTO ON (A)' : 'AUTO OFF (A)';
        btn.classList.toggle('active', gameState.autoShoot);
    }
    playSound('weaponSwitch'); // Audio feedback
}

// Toggle settings panel
function toggleSettingsPanel() {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
        settingsPanel.classList.toggle('visible');
    }
}

// Toggle help panel showing all shortcuts
function toggleHelpPanel() {
    let helpPanel = document.getElementById('help-panel');
    if (!helpPanel) {
        // Create help panel if it doesn't exist
        helpPanel = document.createElement('div');
        helpPanel.id = 'help-panel';
        helpPanel.innerHTML = `
            <div class="help-content">
                <h3>Keyboard Shortcuts</h3>
                <div class="help-section">
                    <h4>Weapon Selection</h4>
                    <div class="help-row"><span class="key">1</span> Weapon 1x</div>
                    <div class="help-row"><span class="key">2</span> Weapon 3x</div>
                    <div class="help-row"><span class="key">3</span> Weapon 5x</div>
                    <div class="help-row"><span class="key">4</span> Weapon 8x</div>
                    <div class="help-row"><span class="key">5</span> Weapon 20x</div>
                </div>
                <div class="help-section">
                    <h4>Controls</h4>
                    <div class="help-row"><span class="key">A</span> Toggle Auto Fire</div>
                    <div class="help-row"><span class="key">Space</span> Toggle View Mode</div>
                    <div class="help-row"><span class="key">C</span> Center View</div>
                    <div class="help-row"><span class="key">ESC</span> Settings</div>
                    <div class="help-row"><span class="key">H</span> This Help</div>
                </div>
                <div class="help-section">
                    <h4>Camera</h4>
                    <div class="help-row"><span class="key">Q/E</span> Rotate Left/Right</div>
                    <div class="help-row"><span class="key">D</span> Rotate Right</div>
                    <div class="help-row"><span class="key">Arrows</span> Rotate Camera</div>
                </div>
                <button id="help-close-btn">Close (H)</button>
            </div>
        `;
        document.getElementById('ui-overlay').appendChild(helpPanel);
        
        // Close button handler
        document.getElementById('help-close-btn').addEventListener('click', () => {
            helpPanel.classList.remove('visible');
        });
    }
    helpPanel.classList.toggle('visible');
}

// Visual feedback when pressing shortcut keys
function highlightButton(selector) {
    const btn = document.querySelector(selector);
    if (btn) {
        btn.classList.add('shortcut-highlight');
        setTimeout(() => {
            btn.classList.remove('shortcut-highlight');
        }, 200);
    }
}

// Update camera rotation based on yaw and pitch (orbit around cannon at bottom)
function updateCameraRotation() {
    if (!camera) return;
    
    const { orbitRadius } = CONFIG.camera;
    const yaw = gameState.cameraYaw;
    const pitch = gameState.cameraPitch;
    
    // Cannon is now at water middle (Y = 0)
    const cannonY = CANNON_BASE_Y;  // 0 (water middle)
    
    // Camera positioned FAR BEHIND and ABOVE the cannon for arcade fish game view
    // This gives a "viewing from outside the aquarium" perspective
    const cameraDistance = 1300;  // Much further back (was 500)
    const cameraHeight = cannonY + 550;  // Higher up: 0 + 550 = +550 (above tank center)
    
    const x = cameraDistance * Math.sin(yaw);
    const y = cameraHeight;
    const z = -cameraDistance * Math.cos(yaw);  // Behind cannon
    
    camera.position.set(x, y, z);
    
    // Look DOWN toward the cannon/platform area
    // This keeps cannon and blue platform visible at bottom of screen
    const lookAtY = cannonY + 150;  // -270: between cannon and center
    camera.lookAt(0, lookAtY, 180);  // Look toward center of tank
}

// Issue 1 Fix: Dedicated reset function for 3RD PERSON camera
// This sets ABSOLUTE values - no relative adjustments, no snapshots
// Called on init and every time we switch back from FPS
// Values MUST match updateCameraRotation() for consistency
function resetThirdPersonCamera() {
    // Cannon is now at water middle (Y = 0)
    const cannonY = CANNON_BASE_Y;  // 0 (water middle)
    
    // Camera positioned FAR BEHIND and ABOVE the cannon for arcade fish game view
    // These values MUST match updateCameraRotation() exactly
    const cameraDistance = 1300;  // Much further back (was 500)
    const cameraHeight = cannonY + 550;  // Higher up: 0 + 550 = +550 (above tank center)
    
    // Reset all yaw/pitch state to canonical center view
    gameState.cameraYaw = 0;
    gameState.cameraPitch = 0;
    gameState.targetCameraYaw = 0;
    gameState.targetCameraPitch = 0;
    
    // Explicit absolute camera position (yaw=0 means z is negative)
    const x = 0;
    const y = cameraHeight;
    const z = -cameraDistance;
    camera.position.set(x, y, z);
    
    // Look DOWN toward the cannon/platform area
    // This keeps cannon and blue platform visible at bottom of screen
    const lookAtY = cannonY + 150;  // -270: between cannon and center
    camera.lookAt(0, lookAtY, 180);  // Look toward center of tank
    
    // Reset FOV to 3RD PERSON default
    camera.fov = 60;
    camera.updateProjectionMatrix();
}

// Center camera view with smooth animation
function centerCameraView() {
    gameState.targetCameraYaw = 0;
    gameState.targetCameraPitch = 0;
    gameState.fpsYaw = 0;
    gameState.fpsPitch = 0;
    // Also reset actual yaw/pitch to prevent drift
    gameState.cameraYaw = 0;
    gameState.cameraPitch = 0;
    // Smooth transition will be handled in animate loop
}

// Toggle between FPS and third-person view modes
function toggleViewMode() {
    const crosshair = document.getElementById('crosshair');
    
    if (gameState.viewMode === 'third-person') {
        gameState.viewMode = 'fps';
        // Keep cannon visible in FPS mode - gun barrel should be visible
        if (cannonGroup) {
            cannonGroup.visible = true;
            // FPS VIEW Optimization: Reduced scale from 2.5 to 1.5
            // This makes the gun smaller so it doesn't dominate the screen
            cannonGroup.scale.set(1.5, 1.5, 1.5);
            // Hide cannon lights in FPS mode to prevent glare/bloom
            cannonGroup.children.forEach(child => {
                if (child.isLight) child.visible = false;
            });
        }
        // Initialize FPS yaw/pitch to CENTER position (0, 0)
        // User requested: "一開始是在正中間的位置"
        gameState.fpsYaw = 0;
        gameState.fpsPitch = 0;
        // Apply initial rotation to cannon (center position)
        if (cannonGroup) cannonGroup.rotation.y = 0;
        if (cannonPitchGroup) cannonPitchGroup.rotation.x = 0;
        // Hide mouse cursor in FPS mode (only crosshair visible)
        const container = document.getElementById('game-container');
        if (container) container.classList.add('fps-hide-cursor');
        // Request Pointer Lock to keep mouse inside window
        if (container && container.requestPointerLock) {
            container.requestPointerLock();
        }
        // Reset FPS mouse tracking (will be initialized on first mouse move)
        gameState.lastFPSMouseX = null;
        gameState.lastFPSMouseY = null;
        // Wider FOV in FPS mode for better fish visibility (視野更廣)
        camera.fov = 75;
        camera.updateProjectionMatrix();
        // FPS MODE: Add CSS class to center crosshair (more robust than JS positioning)
        if (crosshair) crosshair.classList.add('fps-mode');
        updateFPSCamera();
    } else {
        gameState.viewMode = 'third-person';
        // Show cannon in third-person mode with normal scale
        if (cannonGroup) {
            cannonGroup.visible = true;
            cannonGroup.scale.set(1.2, 1.2, 1.2);
            // Reset cannon rotation to center (facing forward)
            cannonGroup.rotation.y = 0;
            // Restore cannon lights in 3RD PERSON mode
            cannonGroup.children.forEach(child => {
                if (child.isLight) child.visible = true;
            });
        }
        if (cannonPitchGroup) {
            cannonPitchGroup.rotation.x = 0;
        }
        // 3RD PERSON MODE: Remove CSS class so crosshair follows mouse
        if (crosshair) crosshair.classList.remove('fps-mode');
        // Show mouse cursor again in 3RD PERSON mode
        const container = document.getElementById('game-container');
        if (container) container.classList.remove('fps-hide-cursor');
        // Release Pointer Lock when exiting FPS mode
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
        // Hide FPS debug overlay when switching to 3RD PERSON mode
        hideFPSDebugOverlay();
        
        // Issue 1 Fix: Use dedicated reset function with ABSOLUTE values
        // This ensures the camera always returns to the exact same position
        resetThirdPersonCamera();
    }
    updateViewModeButton();
}

// Update the view mode button text
function updateViewModeButton() {
    const btn = document.getElementById('view-mode-btn');
    if (btn) {
        if (gameState.viewMode === 'fps') {
            btn.textContent = 'FPS VIEW (Space)';
            btn.classList.add('active');
        } else {
            btn.textContent = '3RD PERSON (Space)';
            btn.classList.remove('active');
        }
    }
}

// FPS Pitch Limits - centralized constants (single source of truth)
// FPS rotation limits - user requested: 180° horizontal, 80° vertical
const FPS_YAW_MAX = 90 * (Math.PI / 180);     // ±90° yaw (180° total horizontal)
const FPS_PITCH_MIN = -47.5 * (Math.PI / 180);  // -47.5° (look down)
const FPS_PITCH_MAX = 47.5 * (Math.PI / 180);   // +47.5° (look up) - total 95° vertical

// FPS Camera positioning constants (CS:GO style - barrel visible at bottom)
const FPS_CAMERA_BACK_DIST = 70;     // Distance behind muzzle (was 100, reduced to show more barrel)
const FPS_CAMERA_UP_OFFSET_Y = 25;   // Height above muzzle (was 45, reduced to lower camera)

// Update FPS camera position and rotation
// Camera follows the cannon's muzzle - cannon rotation is the single source of truth
// This ensures camera follows gun when aiming (aimCannon, aimCannonAtFish, auto-aim)
function updateFPSCamera() {
    if (!camera || gameState.viewMode !== 'fps') return;
    if (!cannonMuzzle || !cannonGroup || !cannonPitchGroup) return;
    
    // FPS Roll Fix v2: Use cannon's yaw/pitch directly instead of extracting from quaternion
    // This completely avoids gimbal lock and roll issues when looking up/down
    
    // Get yaw and pitch directly from cannon rotation (single source of truth)
    const yaw = cannonGroup.rotation.y;
    // Note: cannonPitchGroup.rotation.x is negative of the actual pitch angle
    let pitch = -cannonPitchGroup.rotation.x;
    
    // SAFETY NET: Always clamp pitch to FPS limits
    // This catches any out-of-range values from 3RD PERSON mode or other sources
    const clampedPitch = Math.max(FPS_PITCH_MIN, Math.min(FPS_PITCH_MAX, pitch));
    if (pitch !== clampedPitch) {
        pitch = clampedPitch;
        // Write back the clamped value to the cannon
        cannonPitchGroup.rotation.x = -clampedPitch;
        gameState.fpsPitch = clampedPitch;
    }
    
    // Calculate forward direction from yaw/pitch (spherical to cartesian)
    // This is mathematically guaranteed to have no roll component
    const forward = new THREE.Vector3(
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw)
    );
    
    // Get muzzle world position for camera positioning
    const muzzleWorldPos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzleWorldPos);
    
    // Calculate camera offset in world space - CS:GO style FPS view
    // Camera positioned BEHIND the cannon body so barrel is visible in front
    // Using tunable constants for easy adjustment of barrel visibility
    const backwardDir = forward.clone().negate();
    const upOffset = new THREE.Vector3(0, FPS_CAMERA_UP_OFFSET_Y, 0);   // Height above muzzle
    const backOffset = backwardDir.multiplyScalar(FPS_CAMERA_BACK_DIST);  // Distance behind muzzle
    
    camera.position.copy(muzzleWorldPos).add(backOffset).add(upOffset);
    
    // Always keep camera upright in world space (locked to world Y axis)
    // This MUST be set before lookAt() to prevent roll
    camera.up.set(0, 1, 0);
    
    // Look at a point in front of the camera along the forward direction
    // IMPORTANT: Use the same pitch as cannon (no offset) to ensure "what you see is what you can shoot"
    // The +0.1 offset was causing the camera to look ~5.7° higher than the cannon,
    // making 80° pitch appear like ~86° visually (almost 90° top-down view)
    const lookTarget = camera.position.clone().add(forward.clone().multiplyScalar(1000));
    camera.lookAt(lookTarget);
    
    // Re-enforce up vector after lookAt (belt and suspenders)
    camera.up.set(0, 1, 0);
}

// Smooth camera transition (called in animate loop)
function updateSmoothCameraTransition(deltaTime) {
    // Issue 1 Fix: Only run in 3RD PERSON mode to prevent overwriting camera position
    if (gameState.viewMode !== 'third-person') return;
    
    const transitionSpeed = 3.0;  // Speed of smooth transition
    
    // Smooth yaw transition
    const yawDiff = gameState.targetCameraYaw - gameState.cameraYaw;
    if (Math.abs(yawDiff) > 0.001) {
        gameState.cameraYaw += yawDiff * transitionSpeed * deltaTime;
    }
    
    // Smooth pitch transition
    const pitchDiff = gameState.targetCameraPitch - gameState.cameraPitch;
    if (Math.abs(pitchDiff) > 0.001) {
        gameState.cameraPitch += pitchDiff * transitionSpeed * deltaTime;
    }
    
    // Update camera if either changed
    if (Math.abs(yawDiff) > 0.001 || Math.abs(pitchDiff) > 0.001) {
        updateCameraRotation();
    }
}

// Auto-pan camera in AUTO mode to hunt for fish - Issue #9: Unlimited 360°
function updateAutoPanning(deltaTime) {
    // Issue 1 Fix: Only run in 3RD PERSON mode
    if (gameState.viewMode !== 'third-person') return;
    
    if (!gameState.autoShoot) {
        gameState.autoPanTimer = 0;
        return;
    }
    
    gameState.autoPanTimer += deltaTime;
    
    // Pan every 5 seconds
    if (gameState.autoPanTimer >= gameState.autoPanInterval) {
        gameState.autoPanTimer = 0;
        
        // Smooth pan to a new direction (fixed amount, no clamping)
        const panAmount = Math.PI / 6;  // Pan 30° each time
        
        // Randomly pick direction for more natural hunting behavior
        gameState.autoPanDirection = Math.random() < 0.5 ? -1 : 1;
        
        // Calculate new yaw without clamping (unlimited 360°)
        let newYaw = gameState.cameraYaw + gameState.autoPanDirection * panAmount;
        
        // Normalize to [-PI, PI]
        while (newYaw > Math.PI) newYaw -= 2 * Math.PI;
        while (newYaw < -Math.PI) newYaw += 2 * Math.PI;
        
        gameState.targetCameraYaw = newYaw;
    }
}

// ==================== DEBUG OVERLAY ====================
// DEBUG: Temporary overlay to diagnose cannon rotation issue
// Shows cannon and camera rotation values in real-time
function updateFPSDebugOverlay() {
    if (gameState.viewMode !== 'fps') return;
    
    let overlay = document.getElementById('fps-debug-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fps-debug-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 80px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 8px;
            border-radius: 4px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(overlay);
    }
    
    const deg = r => (r * 180 / Math.PI).toFixed(1);
    const cannonYaw = cannonGroup ? deg(cannonGroup.rotation.y) : 'N/A';
    const cannonPitch = cannonPitchGroup ? deg(-cannonPitchGroup.rotation.x) : 'N/A';
    const isDragging = gameState.isRightDragging ? 'YES' : 'no';
    
    overlay.innerHTML = `
        <div>Cannon Yaw: ${cannonYaw} deg</div>
        <div>Cannon Pitch: ${cannonPitch} deg</div>
        <div>Right-Dragging: ${isDragging}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Build: fps-95-v1</div>
    `;
}

// Hide debug overlay when not in FPS mode
function hideFPSDebugOverlay() {
    const overlay = document.getElementById('fps-debug-overlay');
    if (overlay) overlay.remove();
}

// ==================== GAME LOOP ====================
function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now();
    deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    
    if (gameState.isLoading || gameState.isPaused) return;
    
    // Update cooldown
    if (gameState.cooldown > 0) {
        gameState.cooldown -= deltaTime;
    }
    
    // Smooth camera transitions (for CENTER VIEW button and auto-panning)
    updateSmoothCameraTransition(deltaTime);
    
    // Auto-pan camera in AUTO mode to hunt for fish
    updateAutoPanning(deltaTime);
    
    // In FPS mode, always update camera to follow cannon rotation
    // This ensures camera follows when aiming (click) or auto-aim rotates the cannon
    if (gameState.viewMode === 'fps') {
        updateFPSCamera();
        // DEBUG: Update rotation debug overlay (temporary for diagnosing cannon rotation issue)
        updateFPSDebugOverlay();
    }
    
    // Auto-shoot with auto-aim (Issue #3 - fully automatic without mouse following)
    if (gameState.autoShoot) {
        autoShootTimer -= deltaTime;
        if (autoShootTimer <= 0) {
            // Find nearest fish and aim at it
            const targetFish = autoAimAtNearestFish();
            if (targetFish) {
                // Aim cannon at fish and fire
                const dir = aimCannonAtFish(targetFish);
                if (dir) {
                    autoFireAtFish(targetFish);
                }
            }
            const weapon = CONFIG.weapons[gameState.currentWeapon];
            autoShootTimer = (1 / weapon.shotsPerSecond) + 0.05;
        }
    }
    
    // Update fish with error handling to prevent freeze bugs
    // MULTIPLAYER: Skip local fish updates in multiplayer mode - fish come from server
    if (!multiplayerMode) {
        let fishUpdateErrors = 0;
        for (let i = activeFish.length - 1; i >= 0; i--) {
            const fish = activeFish[i];
            if (fish && fish.isActive) {
                try {
                    fish.update(deltaTime, activeFish);
                } catch (e) {
                    fishUpdateErrors++;
                    if (fishUpdateErrors <= 3) {
                        console.error('Fish update error:', e, 'Fish:', fish.tier, fish.species);
                    }
                    // Attempt recovery: reset fish state
                    fish.velocity.set(0, 0, 0);
                    fish.acceleration.set(0, 0, 0);
                }
            } else if (fish && !fish.isActive) {
                activeFish.splice(i, 1);
            } else {
                // Invalid fish reference - remove it
                activeFish.splice(i, 1);
            }
        }
        
        // Dynamic fish respawn system - maintain target fish count (single-player only)
        updateDynamicFishSpawn(deltaTime);
    }
    
    // Update bullets
    for (let i = activeBullets.length - 1; i >= 0; i--) {
        const bullet = activeBullets[i];
        if (bullet.isActive) {
            bullet.update(deltaTime);
        } else {
            activeBullets.splice(i, 1);
        }
    }
    
    // Update particles
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const particle = activeParticles[i];
        if (particle.isActive) {
            particle.update(deltaTime);
        } else {
            activeParticles.splice(i, 1);
        }
    }
    
    // Issue #14: Update weapon VFX (transient effects, knockback, etc.)
    updateWeaponVFX(deltaTime);
    
    // COMBO SYSTEM: Update combo timer
    updateComboTimer(deltaTime);
    
    // PERFORMANCE: Update frustum culling and LOD
    updatePerformanceOptimizations(deltaTime);
    
    // PERFORMANCE: Enforce particle limits
    enforceParticleLimits();
    
        // Animate seaweed
        animateSeaweed();
    
        // Animate caustic lights
        animateCausticLights();
    
        // Update Boss Fish Event System (Issue #12)
        updateBossEvent(deltaTime);
    
        // Update UI
        updateUI();
    
        // Render
        renderer.render(scene, camera);
}

function animateSeaweed() {
    const time = performance.now() * 0.001;
    
    tunnelGroup.children.forEach(child => {
        if (child.userData.isSeaweed) {
            const offset = child.userData.swayOffset || 0;
            child.rotation.x = Math.sin(time + offset) * 0.08;
            child.rotation.z = Math.cos(time * 0.7 + offset) * 0.04;
        }
    });
}

function animateCausticLights() {
    const time = performance.now() * 0.001;
    
    scene.children.forEach(child => {
        if (child.isPointLight && child.userData.originalY !== undefined) {
            child.position.y = child.userData.originalY + Math.sin(time + child.userData.offset) * 15;
            child.intensity = 0.25 + Math.sin(time * 2 + child.userData.offset) * 0.1;
        }
    });
}

// ==================== BOSS FISH EVENT SYSTEM (Issue #12) ====================
let bossUIContainer = null;
let bossCrosshair = null;
let bossGlowEffect = null;
let bossWaitingUI = null;  // Issue #15: Separate UI for waiting period countdown (60s → 16s)

function createBossUI() {
    // Issue #15: Create boss event UI container - positioned at TOP CENTER
    bossUIContainer = document.createElement('div');
    bossUIContainer.id = 'boss-ui';
    bossUIContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        pointer-events: none;
        z-index: 1000;
        display: none;
        background: linear-gradient(180deg, rgba(255, 0, 0, 0.3), rgba(100, 0, 0, 0.2));
        border: 3px solid #ff4444;
        border-radius: 15px;
        padding: 15px 40px;
        box-shadow: 0 0 30px rgba(255, 0, 0, 0.5);
    `;
    
    // Issue #15: Boss Mode countdown with "BOSS MODE! Xs remaining" format
    const countdown = document.createElement('div');
    countdown.id = 'boss-countdown';
    countdown.style.cssText = `
        font-size: 32px;
        font-weight: bold;
        color: #ffffff;
        text-shadow: 0 0 15px #ff4444, 0 0 30px #ff0000, 2px 2px 4px #000;
    `;
    bossUIContainer.appendChild(countdown);
    
    // Boss description (smaller, below countdown)
    const descText = document.createElement('div');
    descText.id = 'boss-desc';
    descText.style.cssText = `
        font-size: 16px;
        color: #ffdd00;
        text-shadow: 0 0 10px #ffaa00, 2px 2px 4px #000;
        margin-top: 8px;
    `;
    bossUIContainer.appendChild(descText);
    
    // Hidden alert text (used for victory/escape messages)
    const alertText = document.createElement('div');
    alertText.id = 'boss-alert';
    alertText.style.cssText = `
        font-size: 28px;
        font-weight: bold;
        color: #ff4444;
        text-shadow: 0 0 20px #ff0000, 0 0 40px #ff0000, 2px 2px 4px #000;
        display: none;
    `;
    bossUIContainer.appendChild(alertText);
    
    document.body.appendChild(bossUIContainer);
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes bossAlert {
            0% { transform: scale(1); }
            100% { transform: scale(1.1); }
        }
        @keyframes bossPulse {
            0% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.2); }
            100% { opacity: 0.3; transform: scale(1); }
        }
        @keyframes crosshairSpin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Issue #15: Create separate UI for waiting period countdown (60s → 16s)
function createBossWaitingUI() {
    bossWaitingUI = document.createElement('div');
    bossWaitingUI.id = 'boss-waiting-timer';
    bossWaitingUI.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 900;
        pointer-events: none;
        text-align: center;
        display: none;
        background: linear-gradient(180deg, rgba(255, 200, 0, 0.3), rgba(200, 150, 0, 0.2));
        border: 2px solid #ffcc00;
        border-radius: 10px;
        padding: 10px 30px;
        box-shadow: 0 0 20px rgba(255, 200, 0, 0.4);
    `;
    
    // Timer text
    const timerText = document.createElement('div');
    timerText.id = 'boss-waiting-text';
    timerText.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        color: #ffdd00;
        text-shadow: 0 0 10px #ffaa00, 2px 2px 4px #000;
    `;
    bossWaitingUI.appendChild(timerText);
    
    // Label text
    const labelText = document.createElement('div');
    labelText.style.cssText = `
        font-size: 12px;
        color: #ffffff;
        text-shadow: 1px 1px 2px #000;
        margin-top: 4px;
    `;
    labelText.textContent = 'Next Boss In';
    bossWaitingUI.appendChild(labelText);
    
    document.body.appendChild(bossWaitingUI);
}

// Issue #15: Update waiting timer UI (shows 60s → 16s, hides when boss mode starts)
function updateBossWaitingTimerUI(secondsLeft) {
    // Guard: Don't show boss waiting UI when not in game scene
    if (!gameState.isInGameScene) return;
    if (!bossWaitingUI) createBossWaitingUI();
    
    const s = Math.ceil(secondsLeft);
    const timerText = document.getElementById('boss-waiting-text');
    
    // Show timer when waiting (60s down to 16s), hide when boss mode is about to start
    if (s > 15 && !gameState.bossActive) {
        if (timerText) timerText.textContent = `${s}s`;
        bossWaitingUI.style.display = 'block';
        
        // Change color as time gets closer to boss spawn
        if (s <= 20) {
            bossWaitingUI.style.borderColor = '#ff6600';
            bossWaitingUI.style.boxShadow = '0 0 25px rgba(255, 100, 0, 0.5)';
            if (timerText) timerText.style.color = '#ff8800';
        } else if (s <= 30) {
            bossWaitingUI.style.borderColor = '#ffaa00';
            bossWaitingUI.style.boxShadow = '0 0 22px rgba(255, 170, 0, 0.45)';
            if (timerText) timerText.style.color = '#ffcc00';
        } else {
            bossWaitingUI.style.borderColor = '#ffcc00';
            bossWaitingUI.style.boxShadow = '0 0 20px rgba(255, 200, 0, 0.4)';
            if (timerText) timerText.style.color = '#ffdd00';
        }
    } else {
        bossWaitingUI.style.display = 'none';
    }
}

// Issue #15: Hide waiting timer when boss mode starts
function hideBossWaitingUI() {
    if (bossWaitingUI) {
        bossWaitingUI.style.display = 'none';
    }
}

function showBossAlert(bossType) {
    if (!bossUIContainer) createBossUI();
    
    // Issue #15: Show "BOSS MODE! 15s remaining" format at top center
    document.getElementById('boss-countdown').textContent = `BOSS MODE! 15s remaining`;
    document.getElementById('boss-desc').textContent = `${bossType.name} - ${bossType.description}`;
    
    // Show alert text briefly for initial announcement
    const alertEl = document.getElementById('boss-alert');
    alertEl.textContent = `BOSS FISH APPEARED!`;
    alertEl.style.display = 'block';
    setTimeout(() => {
        alertEl.style.display = 'none';
    }, 2000);
    
    bossUIContainer.style.display = 'block';
    
    // Play boss alert sound
    playSound('bossAlert');
}

function updateBossCountdownUI(timeLeft) {
    // Guard: Don't show boss UI when not in game scene
    if (!gameState.isInGameScene) return;
    if (!bossUIContainer) return;
    const countdownEl = document.getElementById('boss-countdown');
    if (countdownEl) {
        // Issue #15: Show "BOSS MODE! Xs remaining" format
        const seconds = Math.ceil(timeLeft);
        countdownEl.textContent = `BOSS MODE! ${seconds}s remaining`;
        
        // Change color as time runs out
        if (timeLeft <= 5) {
            countdownEl.style.color = '#ff0000';
        } else if (timeLeft <= 10) {
            countdownEl.style.color = '#ffaa00';
        } else {
            countdownEl.style.color = '#ffffff';
        }
    }
}

function hideBossUI() {
    if (bossUIContainer) {
        bossUIContainer.style.display = 'none';
    }
    removeBossCrosshair();
    removeBossGlowEffect();
}

function createBossCrosshair(bossFish) {
    // Create 3D crosshair that follows the boss fish
    const crosshairGroup = new THREE.Group();
    
    // Outer ring
    const outerRingGeometry = new THREE.TorusGeometry(bossFish.config.size * 1.5, 3, 8, 32);
    const outerRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.8
    });
    const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    crosshairGroup.add(outerRing);
    
    // Inner ring
    const innerRingGeometry = new THREE.TorusGeometry(bossFish.config.size * 0.8, 2, 8, 32);
    const innerRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.9
    });
    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    crosshairGroup.add(innerRing);
    
    // Crosshair lines
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
    const lineLength = bossFish.config.size * 2;
    
    // Horizontal line
    const hPoints = [new THREE.Vector3(-lineLength, 0, 0), new THREE.Vector3(lineLength, 0, 0)];
    const hGeometry = new THREE.BufferGeometry().setFromPoints(hPoints);
    const hLine = new THREE.Line(hGeometry, lineMaterial);
    crosshairGroup.add(hLine);
    
    // Vertical line
    const vPoints = [new THREE.Vector3(0, -lineLength, 0), new THREE.Vector3(0, lineLength, 0)];
    const vGeometry = new THREE.BufferGeometry().setFromPoints(vPoints);
    const vLine = new THREE.Line(vGeometry, lineMaterial);
    crosshairGroup.add(vLine);
    
    // Corner brackets
    const bracketSize = bossFish.config.size * 1.2;
    const bracketMaterial = new THREE.LineBasicMaterial({ color: 0xffdd00, linewidth: 3 });
    
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dx, dy]) => {
        const bracketPoints = [
            new THREE.Vector3(dx * bracketSize, dy * bracketSize * 0.7, 0),
            new THREE.Vector3(dx * bracketSize, dy * bracketSize, 0),
            new THREE.Vector3(dx * bracketSize * 0.7, dy * bracketSize, 0)
        ];
        const bracketGeometry = new THREE.BufferGeometry().setFromPoints(bracketPoints);
        const bracket = new THREE.Line(bracketGeometry, bracketMaterial);
        crosshairGroup.add(bracket);
    });
    
    crosshairGroup.userData.targetFish = bossFish;
    crosshairGroup.userData.rotationSpeed = 1;
    
    scene.add(crosshairGroup);
    bossCrosshair = crosshairGroup;
}

function updateBossCrosshair() {
    if (!bossCrosshair || !bossCrosshair.userData.targetFish) return;
    
    const targetFish = bossCrosshair.userData.targetFish;
    if (!targetFish.isActive) {
        removeBossCrosshair();
        return;
    }
    
    // Follow the boss fish
    bossCrosshair.position.copy(targetFish.group.position);
    
    // Face the camera
    bossCrosshair.lookAt(camera.position);
    
    // Rotate the crosshair
    bossCrosshair.children[0].rotation.z += 0.02;  // Outer ring spins
    bossCrosshair.children[1].rotation.z -= 0.03;  // Inner ring spins opposite
}

function removeBossCrosshair() {
    if (bossCrosshair) {
        scene.remove(bossCrosshair);
        bossCrosshair.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        bossCrosshair = null;
    }
}

function addBossGlowEffect(bossFish, glowColor) {
    // Add pulsing glow effect to boss fish
    const glowGeometry = new THREE.SphereGeometry(bossFish.config.size * 1.3, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.userData.pulseTime = 0;
    glow.userData.glowColor = glowColor;
    
    bossFish.group.add(glow);
    bossGlowEffect = glow;
    
    // Also make the fish body emissive
    bossFish.group.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.emissive = new THREE.Color(glowColor);
            child.material.emissiveIntensity = 0.5;
        }
    });
}

function updateBossGlowEffect(deltaTime) {
    if (!bossGlowEffect) return;
    
    bossGlowEffect.userData.pulseTime += deltaTime * 3;
    const pulse = 0.3 + Math.sin(bossGlowEffect.userData.pulseTime) * 0.2;
    bossGlowEffect.material.opacity = pulse;
    
    const scale = 1 + Math.sin(bossGlowEffect.userData.pulseTime * 0.5) * 0.1;
    bossGlowEffect.scale.setScalar(scale);
}

function removeBossGlowEffect() {
    if (bossGlowEffect && bossGlowEffect.parent) {
        bossGlowEffect.parent.remove(bossGlowEffect);
        bossGlowEffect.geometry.dispose();
        bossGlowEffect.material.dispose();
        bossGlowEffect = null;
    }
}

function spawnBossFish() {
    // Select random boss type
    const bossType = BOSS_FISH_TYPES[Math.floor(Math.random() * BOSS_FISH_TYPES.length)];
    const baseConfig = CONFIG.fishTiers[bossType.baseSpecies];
    
    if (!baseConfig) {
        console.error('Boss base species not found:', bossType.baseSpecies);
        return;
    }
    
    // Create boss fish config with multipliers
    const bossConfig = {
        ...baseConfig,
        hp: baseConfig.hp * bossType.hpMultiplier,
        reward: baseConfig.reward * bossType.rewardMultiplier,
        size: baseConfig.size * bossType.sizeMultiplier,
        speedMin: baseConfig.speedMin * bossType.speedMultiplier,
        speedMax: baseConfig.speedMax * bossType.speedMultiplier,
        isBoss: true,
        bossType: bossType
    };
    
    // Show boss alert UI
    showBossAlert(bossType);
    
    if (bossType.isSwarm) {
        // Spawn a swarm of fish as the boss
        const swarmFish = [];
        const centerPos = getRandomFishPositionIn3DSpace();
        
        for (let i = 0; i < bossType.swarmCount; i++) {
            const fish = fishPool.find(f => !f.isActive);
            if (fish) {
                fish.config = bossConfig;
                fish.createMesh();
                
                // Position around center
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 100,
                    (Math.random() - 0.5) * 200
                );
                fish.spawn(centerPos.clone().add(offset));
                fish.isBoss = true;
                // BUG FIX: Only push if not already in activeFish to prevent duplicates
                if (!activeFish.includes(fish)) {
                    activeFish.push(fish);
                }
                swarmFish.push(fish);
            }
        }
        
        // Mark first fish as the main boss target
        if (swarmFish.length > 0) {
            gameState.activeBoss = swarmFish[0];
            createBossCrosshair(swarmFish[0]);
            addBossGlowEffect(swarmFish[0], bossType.glowColor);
        }
    } else {
        // Spawn single boss fish
        const fish = fishPool.find(f => !f.isActive);
        if (fish) {
            fish.config = bossConfig;
            fish.createMesh();
            fish.spawn(getRandomFishPositionIn3DSpace());
            fish.isBoss = true;
            // BUG FIX: Only push if not already in activeFish to prevent duplicates
            if (!activeFish.includes(fish)) {
                activeFish.push(fish);
            }
            
            gameState.activeBoss = fish;
            createBossCrosshair(fish);
            addBossGlowEffect(fish, bossType.glowColor);
        }
    }
    
    // Start countdown
    gameState.bossCountdown = 15;
    gameState.bossActive = true;
}

function updateBossEvent(deltaTime) {
    // Guard: Only run boss system when in active game scene (not lobby/menu)
    if (!gameState.isInGameScene) {
        // Ensure boss system is fully dormant on lobby
        if (gameState.bossActive || gameState.bossCountdown > 0) {
            gameState.bossActive = false;
            gameState.activeBoss = null;
            gameState.bossCountdown = 0;
            gameState.bossSpawnTimer = 60;
            hideBossUI();
            hideBossWaitingUI();
        }
        return;
    }
    
    // MULTIPLAYER: Skip local boss timer in multiplayer mode - boss events come from server
    if (multiplayerMode) {
        // In multiplayer, boss events are controlled by server via onBossWave callback
        // Only update visual effects if boss is active (set by server)
        if (gameState.bossActive) {
            updateBossCrosshair();
            updateBossGlowEffect(deltaTime);
        }
        return;
    }
    
    // Update boss spawn timer
    if (!gameState.bossActive) {
        gameState.bossSpawnTimer -= deltaTime;
        
        // Issue #15: Update waiting timer UI (shows 60s → 16s countdown)
        updateBossWaitingTimerUI(gameState.bossSpawnTimer);
        
        // Issue #16: Update music state based on boss approach
        if (gameState.bossSpawnTimer <= 30 && gameState.bossSpawnTimer > 15) {
            setMusicState('approach');
        } else if (gameState.bossSpawnTimer > 30) {
            setMusicState('normal');
        }
        
        if (gameState.bossSpawnTimer <= 0) {
            hideBossWaitingUI();  // Hide waiting timer when boss spawns
            spawnBossFish();
            gameState.bossSpawnTimer = 60;  // Next boss in exactly 60 seconds
        }
    } else {
        // Update boss countdown
        gameState.bossCountdown -= deltaTime;
        updateBossCountdownUI(gameState.bossCountdown);
        
        // Update visual effects
        updateBossCrosshair();
        updateBossGlowEffect(deltaTime);
        
        // Check if boss was killed
        if (gameState.activeBoss && !gameState.activeBoss.isActive) {
            // Boss killed! Show victory message
            showBossKilledMessage();
            endBossEvent();
        }
        
        // Check if time ran out
        if (gameState.bossCountdown <= 0) {
            // Boss escaped
            showBossEscapedMessage();
            endBossEvent();
        }
    }
}

function endBossEvent() {
    gameState.bossActive = false;
    gameState.activeBoss = null;
    hideBossUI();
    
    // Remove any remaining boss fish
    activeFish.forEach(fish => {
        if (fish.isBoss && fish.isActive) {
            fish.isActive = false;
            scene.remove(fish.group);
        }
    });
}

function showBossKilledMessage() {
    if (!bossUIContainer) return;
    
    document.getElementById('boss-alert').textContent = 'BOSS DEFEATED!';
    document.getElementById('boss-alert').style.color = '#44ff44';
    document.getElementById('boss-desc').textContent = 'Bonus rewards earned!';
    document.getElementById('boss-countdown').textContent = '';
    
    // Issue #16: Play boss defeated victory fanfare
    playSound('bossDefeated');
    
    // Hide after 2 seconds
    setTimeout(() => {
        hideBossUI();
    }, 2000);
}

function showBossEscapedMessage() {
    if (!bossUIContainer) return;
    
    document.getElementById('boss-alert').textContent = 'BOSS ESCAPED!';
    document.getElementById('boss-alert').style.color = '#ff8844';
    document.getElementById('boss-desc').textContent = 'Better luck next time...';
    document.getElementById('boss-countdown').textContent = '';
    
    // Hide after 2 seconds
    setTimeout(() => {
        hideBossUI();
    }, 2000);
}

// ==================== SETTINGS SYSTEM ====================

// Default settings
const DEFAULT_SETTINGS = {
    graphicsQuality: 'medium',
    shadowQuality: 'medium',
    // Audio volume settings (0-100%)
    musicVolume: 50,      // Background music volume (default 50%)
    sfxVolume: 70,        // Sound effects volume (default 70%)
    thirdPersonSensitivity: 1.0,
    // FPS Sensitivity: 10 levels (1-10), where level 10 = 100% of base sensitivity
    // Default is level 5 (50%) for more precise aiming
    fpsSensitivityLevel: 5
};

// Current settings (will be loaded from localStorage)
let gameSettings = { ...DEFAULT_SETTINGS };

// Base sensitivity values (these are multiplied by the user's sensitivity setting)
const BASE_SENSITIVITY = {
    thirdPerson: 0.001,
    fps: 0.000175
};

// Load settings from localStorage
function loadSettings() {
    try {
        const saved = localStorage.getItem('fishShooterSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
            gameSettings = { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
        gameSettings = { ...DEFAULT_SETTINGS };
    }
    return gameSettings;
}

// Save settings to localStorage
function saveSettings() {
    try {
        localStorage.setItem('fishShooterSettings', JSON.stringify(gameSettings));
    } catch (e) {
        console.warn('Failed to save settings:', e);
    }
}

// Apply graphics quality settings
// User-requested optimization for FPS performance:
// - Low: No shadows + 30% particles (Target: 80+ FPS)
// - Medium: No shadows + 60% particles (Target: 60+ FPS)
// - High: Full shadows + 100% particles (Target: 50+ FPS)
function applyGraphicsQuality(quality) {
    gameSettings.graphicsQuality = quality;
    
    // Base particle count for 100% (high quality)
    const BASE_PARTICLE_COUNT = 200;
    
    switch (quality) {
        case 'low':
            // LOW: Best performance - No shadows, 30% particles
            if (renderer) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
            }
            CONFIG.particles = { 
                maxCount: Math.floor(BASE_PARTICLE_COUNT * 0.3), // 30% = 60 particles
                enabled: true,
                qualityMultiplier: 0.3
            };
            // Disable shadows for low quality
            applyShadowQuality('off');
            break;
            
        case 'medium':
            // MEDIUM: Balanced - No shadows, 60% particles
            if (renderer) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            }
            CONFIG.particles = { 
                maxCount: Math.floor(BASE_PARTICLE_COUNT * 0.6), // 60% = 120 particles
                enabled: true,
                qualityMultiplier: 0.6
            };
            // Disable shadows for medium quality
            applyShadowQuality('off');
            break;
            
        case 'high':
            // HIGH: Best visuals - Full shadows, 100% particles
            if (renderer) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }
            CONFIG.particles = { 
                maxCount: BASE_PARTICLE_COUNT, // 100% = 200 particles
                enabled: true,
                qualityMultiplier: 1.0
            };
            // Enable high quality shadows
            applyShadowQuality('high');
            break;
    }
    
    saveSettings();
    
    // Log quality change for debugging
    console.log(`Graphics Quality set to: ${quality} (Particles: ${CONFIG.particles.maxCount}, Shadows: ${quality === 'high' ? 'ON' : 'OFF'})`);
}

// Apply shadow quality settings
function applyShadowQuality(quality) {
    gameSettings.shadowQuality = quality;
    
    if (!renderer) return;
    
    // Shadow quality levels:
    // - off: No shadows
    // - low: BasicShadowMap, 512x512 (fastest, hard edges)
    // - medium: PCFShadowMap, 1024x1024 (balanced)
    // - high: PCFSoftShadowMap, 2048x2048 (best quality, soft edges)
    
    switch (quality) {
        case 'off':
            renderer.shadowMap.enabled = false;
            break;
        case 'low':
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.BasicShadowMap;
            break;
        case 'medium':
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFShadowMap;
            break;
        case 'high':
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            break;
    }
    
    // Force shadow map refresh when changing type
    renderer.shadowMap.needsUpdate = true;
    
    // Update all lights that cast shadows
    if (scene) {
        scene.traverse((obj) => {
            if (obj.isLight && obj.shadow) {
                obj.castShadow = quality !== 'off';
                
                // Dispose old shadow map to force recreation with new size
                if (obj.shadow.map) {
                    obj.shadow.map.dispose();
                    obj.shadow.map = null;
                }
                
                if (quality === 'high') {
                    obj.shadow.mapSize.width = 2048;
                    obj.shadow.mapSize.height = 2048;
                } else if (quality === 'medium') {
                    obj.shadow.mapSize.width = 1024;
                    obj.shadow.mapSize.height = 1024;
                } else {
                    obj.shadow.mapSize.width = 512;
                    obj.shadow.mapSize.height = 512;
                }
                
                // Mark shadow as needing update
                obj.shadow.needsUpdate = true;
            }
        });
    }
    
    saveSettings();
}

// Apply sensitivity settings
function applyThirdPersonSensitivity(multiplier) {
    gameSettings.thirdPersonSensitivity = multiplier;
    CONFIG.camera.rotationSensitivityThirdPerson = BASE_SENSITIVITY.thirdPerson * multiplier;
    saveSettings();
}

// Apply FPS sensitivity level (1-10, where 10 = 100% of base sensitivity)
function applyFpsSensitivityLevel(level) {
    // Clamp level to 1-10
    level = Math.max(1, Math.min(10, Math.round(level)));
    gameSettings.fpsSensitivityLevel = level;
    // Update gameState for real-time use in mouse handler
    gameState.fpsSensitivityLevel = level;
    saveSettings();
}

// Apply background music volume (0-100%)
function applyMusicVolumePercent(percent) {
    // Clamp to 0-100
    percent = Math.max(0, Math.min(100, Math.round(percent)));
    gameSettings.musicVolume = percent;
    // Convert percentage to 0-1 range for audio API
    const volume = percent / 100;
    setMusicVolume(volume);
    setAmbientVolume(volume); // Also apply to ambient sounds
    saveSettings();
    console.log(`Music Volume set to: ${percent}%`);
}

// Apply sound effects volume (0-100%)
function applySfxVolumePercent(percent) {
    // Clamp to 0-100
    percent = Math.max(0, Math.min(100, Math.round(percent)));
    gameSettings.sfxVolume = percent;
    // Convert percentage to 0-1 range for audio API
    const volume = percent / 100;
    setSfxVolume(volume);
    saveSettings();
    console.log(`SFX Volume set to: ${percent}%`);
}

// Initialize settings UI
function initSettingsUI() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeBtn = document.getElementById('settings-close-btn');
    
    // Early return if settings panel doesn't exist
    if (!settingsPanel) {
        console.warn('Settings panel not found in DOM');
        return;
    }
    
    // Toggle settings panel
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.toggle('visible');
        });
    }
    
    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.remove('visible');
        });
    }
    
    // Graphics quality dropdown
    const graphicsSelect = document.getElementById('graphics-quality');
    if (graphicsSelect) {
        graphicsSelect.value = gameSettings.graphicsQuality;
        graphicsSelect.addEventListener('change', (e) => {
            applyGraphicsQuality(e.target.value);
        });
    }
    
    // Shadow quality dropdown
    const shadowSelect = document.getElementById('shadow-quality');
    if (shadowSelect) {
        shadowSelect.value = gameSettings.shadowQuality;
        shadowSelect.addEventListener('change', (e) => {
            applyShadowQuality(e.target.value);
        });
    }
    
    // Background Music Volume slider (0-100%)
    const musicSlider = document.getElementById('music-volume');
    const musicValue = document.getElementById('music-volume-value');
    if (musicSlider && musicValue) {
        musicSlider.value = gameSettings.musicVolume;
        musicValue.textContent = gameSettings.musicVolume + '%';
        musicSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            musicValue.textContent = value + '%';
            applyMusicVolumePercent(value);
        });
    }
    
    // Sound Effects Volume slider (0-100%)
    const sfxSlider = document.getElementById('sfx-volume');
    const sfxValue = document.getElementById('sfx-volume-value');
    if (sfxSlider && sfxValue) {
        sfxSlider.value = gameSettings.sfxVolume;
        sfxValue.textContent = gameSettings.sfxVolume + '%';
        sfxSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            sfxValue.textContent = value + '%';
            applySfxVolumePercent(value);
        });
    }
    
    // Third person sensitivity slider
    const thirdPersonSlider = document.getElementById('third-person-sensitivity');
    const thirdPersonValue = document.getElementById('third-person-sensitivity-value');
    if (thirdPersonSlider && thirdPersonValue) {
        thirdPersonSlider.value = gameSettings.thirdPersonSensitivity;
        thirdPersonValue.textContent = gameSettings.thirdPersonSensitivity.toFixed(1) + 'x';
        thirdPersonSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            thirdPersonValue.textContent = value.toFixed(1) + 'x';
            applyThirdPersonSensitivity(value);
        });
    }
    
    // FPS sensitivity slider (10 levels: 1-10, where 10 = 100%)
    const fpsSlider = document.getElementById('fps-sensitivity');
    const fpsValue = document.getElementById('fps-sensitivity-value');
    if (fpsSlider && fpsValue) {
        // Set slider to use levels 1-10
        fpsSlider.min = 1;
        fpsSlider.max = 10;
        fpsSlider.step = 1;
        fpsSlider.value = gameSettings.fpsSensitivityLevel || 5;
        fpsValue.textContent = (gameSettings.fpsSensitivityLevel * 10) + '%';
        fpsSlider.addEventListener('input', (e) => {
            const level = parseInt(e.target.value);
            fpsValue.textContent = (level * 10) + '%';
            applyFpsSensitivityLevel(level);
        });
    }
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (settingsPanel && settingsPanel.classList.contains('visible')) {
            if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
                settingsPanel.classList.remove('visible');
            }
        }
    });
}

// Apply all saved settings on game load
function applyAllSettings() {
    applyGraphicsQuality(gameSettings.graphicsQuality);
    applyShadowQuality(gameSettings.shadowQuality);
    applyMusicVolumePercent(gameSettings.musicVolume);
    applySfxVolumePercent(gameSettings.sfxVolume);
    applyThirdPersonSensitivity(gameSettings.thirdPersonSensitivity);
    applyFpsSensitivityLevel(gameSettings.fpsSensitivityLevel || 5);
}

// Load settings before game starts
loadSettings();

// ==================== MULTIPLAYER INTEGRATION ====================
// Flag to indicate game has finished loading
window.gameLoaded = false;

// Multiplayer mode state
let multiplayerMode = false;
let multiplayerManager = null;

// Note: startMultiplayerGame is defined earlier in the file (around line 2695)
// It handles: showing game container, setting isInGameScene, resetting boss timers,
// setting multiplayerMode/multiplayerManager, setting up callbacks, and calling initGameScene()

// Update fish positions from server state
function updateFishFromServer(serverFish) {
    if (!serverFish || !Array.isArray(serverFish)) return;
    
    // DEBUG: Log fish counts for debugging multiplayer fish spawn issue
    console.log(`[GAME] updateFishFromServer: serverFish.len=${serverFish.length}, meshes.before=${gameState.fish.length}`);
    
    // Create a map of existing fish by server ID
    const existingFish = new Map();
    gameState.fish.forEach(fish => {
        if (fish.userData && fish.userData.serverId) {
            existingFish.set(fish.userData.serverId, fish);
        }
    });
    
    // Update or create fish
    let created = 0, updated = 0, unknown = 0;
    serverFish.forEach(sf => {
        let fish = existingFish.get(sf.id);
        
        if (fish) {
            // Update existing fish position (convert from server 2D to 3D)
            // Server uses x, z coordinates; we add Y for visual depth
            const targetX = sf.x * 10; // Scale factor
            const targetZ = sf.z * 10;
            const targetY = sf.y !== undefined ? sf.y * 10 : fish.position.y;
            
            // Smooth interpolation
            fish.position.x += (targetX - fish.position.x) * 0.1;
            fish.position.y += (targetY - fish.position.y) * 0.1;
            fish.position.z += (targetZ - fish.position.z) * 0.1;
            
            // Update rotation to face movement direction
            if (sf.vx !== undefined && sf.vz !== undefined) {
                const angle = Math.atan2(sf.vx, sf.vz);
                fish.rotation.y = angle;
            }
            
            // Update HP
            if (fish.userData) {
                fish.userData.hp = sf.hp;
            }
            
            existingFish.delete(sf.id);
            updated++;
        } else {
            // Create new fish from server data
            // Server sends 'type' field, not 'species' - use sf.type for lookup
            const fishType = sf.type || sf.species;
            const fishConfig = CONFIG.fishTiers[fishType];
            if (fishConfig) {
                const newFish = createFishMesh(fishType, fishConfig);
                newFish.position.set(sf.x * 10, (sf.y || 0) * 10, sf.z * 10);
                newFish.userData.serverId = sf.id;
                newFish.userData.hp = sf.hp;
                newFish.userData.maxHp = sf.maxHp;
                newFish.userData.isBoss = sf.isBoss;
                scene.add(newFish);
                gameState.fish.push(newFish);
                created++;
            } else {
                console.warn(`[GAME] Unknown fish type from server: ${fishType}`);
                unknown++;
            }
        }
    });
    
    // Remove fish that no longer exist on server
    let removed = 0;
    existingFish.forEach((fish, id) => {
        scene.remove(fish);
        const index = gameState.fish.indexOf(fish);
        if (index > -1) {
            gameState.fish.splice(index, 1);
        }
        removed++;
    });
    
    // DEBUG: Log summary of fish update
    if (created > 0 || removed > 0 || unknown > 0) {
        console.log(`[GAME] Fish update: created=${created}, updated=${updated}, removed=${removed}, unknown=${unknown}, meshes.after=${gameState.fish.length}`);
    }
}

// Track server bullets for multiplayer sync
let serverBulletMeshes = new Map(); // bulletId -> { group, bullet, trail }

// Create bullet mesh for other players (same style as local bullets but with transparency)
function createServerBulletMesh(weaponKey) {
    const weapon = CONFIG.weapons[weaponKey] || CONFIG.weapons['1x'];
    const group = new THREE.Group();
    
    // Main bullet - same as local bullet but with transparency
    const bulletGeometry = new THREE.SphereGeometry(5, 10, 6);
    const bulletMaterial = new THREE.MeshStandardMaterial({
        color: weapon.color,
        emissive: weapon.color,
        emissiveIntensity: 0.6,
        metalness: 0.5,
        roughness: 0.2,
        transparent: true,
        opacity: 0.6  // 60% opacity to distinguish from own bullets
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    group.add(bullet);
    
    // Trail - same as local bullet but with transparency
    const trailGeometry = new THREE.ConeGeometry(3, 12, 6);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: weapon.color,
        transparent: true,
        opacity: 0.3  // More transparent trail
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -10;
    group.add(trail);
    
    // Scale based on weapon size
    const scale = weapon.size / 8;
    bullet.scale.set(scale, scale, scale);
    trail.scale.set(scale, scale, scale);
    
    return { group, bullet, trail, weaponKey };
}

// Update bullets from server state
function updateBulletsFromServer(serverBullets) {
    if (!serverBullets || !Array.isArray(serverBullets)) return;
    
    // Debug: Log when we receive bullets
    if (serverBullets.length > 0) {
        console.log(`[GAME] updateBulletsFromServer called with ${serverBullets.length} bullets, my playerId: ${multiplayerManager ? multiplayerManager.playerId : 'none'}`);
    }
    
    // Create a set of current server bullet IDs
    const currentBulletIds = new Set(serverBullets.map(b => b.id));
    
    // Remove bullets that no longer exist on server
    for (const [bulletId, bulletData] of serverBulletMeshes) {
        if (!currentBulletIds.has(bulletId)) {
            scene.remove(bulletData.group);
            serverBulletMeshes.delete(bulletId);
        }
    }
    
    // Update or create bullets
    serverBullets.forEach(sb => {
        let bulletData = serverBulletMeshes.get(sb.id);
        
        if (bulletData) {
            // Update existing bullet position (convert from server 2D to 3D)
            const targetX = sb.x * 10;
            const targetZ = sb.z * 10;
            
            // Smooth interpolation for bullet movement
            bulletData.group.position.x += (targetX - bulletData.group.position.x) * 0.3;
            bulletData.group.position.z += (targetZ - bulletData.group.position.z) * 0.3;
            
            // Update rotation to face movement direction
            if (sb.vx !== undefined && sb.vz !== undefined) {
                const direction = new THREE.Vector3(sb.vx, 0, sb.vz).normalize();
                if (direction.length() > 0.01) {
                    bulletData.group.lookAt(bulletData.group.position.clone().add(direction));
                }
            }
        } else {
            // Create new bullet mesh for other players' bullets
            // Skip our own bullets (we already have local visuals)
            if (multiplayerManager && sb.owner === multiplayerManager.playerId) {
                console.log(`[GAME] Skipping own bullet: owner=${sb.owner}, myId=${multiplayerManager.playerId}`);
                return;
            }
            
            // Debug: Log when creating bullet for other player
            console.log(`[GAME] Creating bullet mesh for other player: id=${sb.id}, owner=${sb.owner}, weapon=${sb.weapon}, pos=(${sb.x}, ${sb.z})`);
            
            // Create bullet with same visual style as local bullets
            // Use weapon info from server if available, default to '1x'
            const weaponKey = sb.weapon || '1x';
            const newBulletData = createServerBulletMesh(weaponKey);
            
            // Use proper Y coordinate - check CONFIG.aquarium.floorY for reference
            const bulletY = CONFIG.aquarium.floorY - 50;  // Slightly above floor level
            newBulletData.group.position.set(sb.x * 10, bulletY, sb.z * 10);
            newBulletData.group.userData.serverId = sb.id;
            newBulletData.group.userData.owner = sb.owner;
            
            console.log(`[GAME] Bullet mesh created at position: (${sb.x * 10}, ${bulletY}, ${sb.z * 10})`);
            
            // Orient bullet in direction of travel
            if (sb.vx !== undefined && sb.vz !== undefined) {
                const direction = new THREE.Vector3(sb.vx, 0, sb.vz).normalize();
                if (direction.length() > 0.01) {
                    newBulletData.group.lookAt(newBulletData.group.position.clone().add(direction));
                }
            }
            
            scene.add(newBulletData.group);
            serverBulletMeshes.set(sb.id, newBulletData);
        }
    });
}

// Update other players from server state
function updatePlayersFromServer(serverPlayers) {
    if (!serverPlayers || !Array.isArray(serverPlayers)) return;
    
    // Update other player cannons/positions
    serverPlayers.forEach(player => {
        if (player.id !== multiplayerManager.playerId) {
            // Update other player's cannon rotation if visible
            // This would require creating visual representations of other players' cannons
        }
    });
}

// Override shoot function for multiplayer
const originalShoot = typeof shoot === 'function' ? shoot : null;

function multiplayerShoot(targetX, targetZ) {
    if (!multiplayerMode || !multiplayerManager) {
        // Single player mode - use original shoot
        return;
    }
    
    // Send shoot request to server
    multiplayerManager.shoot(targetX, targetZ);
    
    // Play local effects immediately for responsiveness
    playWeaponShot(gameState.currentWeapon);
    spawnMuzzleFlash();
}

// Cleanup function for when leaving multiplayer game
window.cleanupMultiplayerGame = function() {
    console.log('[GAME] Cleaning up multiplayer game state...');
    
    // Reset multiplayer mode flag
    multiplayerMode = false;
    multiplayerManager = null;
    
    // Reset game scene flag to prevent boss UI from appearing on menu
    gameState.isInGameScene = false;
    
    // Reset boss event state
    gameState.bossActive = false;
    gameState.activeBoss = null;
    gameState.bossCountdown = 0;
    gameState.bossSpawnTimer = 60;
    hideBossUI();
    hideBossWaitingUI();
    
    // Clear server fish
    gameState.fish.forEach(fish => {
        if (fish && scene) scene.remove(fish);
    });
    gameState.fish = [];
    
    // Clear server bullet meshes
    for (const [bulletId, bulletData] of serverBulletMeshes) {
        if (bulletData && bulletData.group && scene) scene.remove(bulletData.group);
    }
    serverBulletMeshes.clear();
    
    console.log('[GAME] Multiplayer cleanup complete');
};

// Expose game reference for multiplayer manager
window.game = {
    scene: null,
    camera: null,
    gameState: gameState,
    CONFIG: CONFIG
};

// ==================== START GAME ====================
init();

// Mark game as loaded after init completes
setTimeout(() => {
    window.gameLoaded = true;
    window.game.scene = scene;
    window.game.camera = camera;
}, 1000);
