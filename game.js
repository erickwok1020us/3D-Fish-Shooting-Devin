// Fish Shooter 3D - Clean Aquarium Version
// Using Three.js for 3D rendering

// ==================== RESPONSIVE UI SCALING SYSTEM ====================
const UI_REF_W = 1920;
const UI_REF_H = 1080;

function updateUIScale() {
    const scale = Math.min(window.innerWidth / UI_REF_W, window.innerHeight / UI_REF_H);
    document.documentElement.style.setProperty('--ui-scale', scale);
}
updateUIScale();
window.addEventListener('resize', updateUIScale);

// ==================== SPHERICAL PANORAMA BACKGROUND SYSTEM ====================
// Sky-sphere mesh approach for full control over panorama positioning and animation
// Benefits: Can tilt to show seafloor, add dynamic rotation, wider effective view
// 8K HD Quality: Uses R2 cloud image with anisotropic filtering and mipmaps
const PANORAMA_CONFIG = {
    enabled: true,
    // 8K HD panorama from R2 bucket
    imageUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/background.jpg',
    // Fallback to local image if R2 fails
    fallbackUrl: 'assets/underwater_panorama.jpg',
    fogColor: 0x0a4d6c,
    fogNear: 600,
    fogFar: 3500,
    // Sky-sphere settings
    skySphere: {
        radius: 4000,           // Large sphere to encompass entire scene
        segments: 128,          // Increased sphere detail for 8K quality
        tiltX: -15 * (Math.PI / 180),  // Tilt panorama down so seafloor appears at bottom (-15°)
        // Dynamic animation settings
        rotationSpeedY: 0.0005,  // Very slow Y-axis rotation (rad/frame) for subtle movement
        bobAmplitude: 0.003,     // Subtle X-axis bobbing amplitude
        bobSpeed: 0.0003         // Bobbing speed
    },
    // 8K HD texture quality settings
    textureQuality: {
        anisotropy: 16,         // Max anisotropic filtering (will be clamped to GPU max)
        generateMipmaps: true,  // Enable mipmaps for better quality at distance
        minFilter: 'LinearMipmapLinearFilter',  // Trilinear filtering
        magFilter: 'LinearFilter'               // Linear magnification
    },
    dynamicEffects: {
        floatingParticles: true,
        particleCount: 80,
        particleMinSize: 1,
        particleMaxSize: 4,
        particleSpeed: 0.15,
        particleSpread: 1500
    }
};

let panoramaTexture = null;
let panoramaSkySphere = null;  // Sky-sphere mesh for panorama
let underwaterParticleSystem = null;
let underwaterParticles = [];

// ==================== VIDEO BACKGROUND SYSTEM ====================
// Video background for home page and loading screen
// Stops and hides when transitioning to game scene
let videoBackgroundElement = null;

// Stop and hide video background when entering game
function stopVideoBackground() {
    const video = document.getElementById('video-background');
    if (video) {
        console.log('[VIDEO-BG] Stopping video background');
        video.pause();
        video.style.display = 'none';
        video.src = ''; // Release video resource
        videoBackgroundElement = null;
    }
}

// Initialize video background (called on page load)
function initVideoBackground() {
    const video = document.getElementById('video-background');
    if (video) {
        videoBackgroundElement = video;
        video.style.display = 'block';
        
        // Set video properties programmatically (some browsers need this)
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.loop = true;
        
        // Load the video first, then play
        video.load();
        
        // Wait for video to be ready before playing
        video.addEventListener('canplaythrough', function onCanPlay() {
            video.removeEventListener('canplaythrough', onCanPlay);
            video.play().then(() => {
                console.log('[VIDEO-BG] Video playing successfully');
            }).catch(e => {
                console.log('[VIDEO-BG] Autoplay blocked, will play on user interaction:', e.message);
            });
        }, { once: true });
        
        // Also try to play immediately (for browsers that support it)
        video.play().catch(e => {
            console.log('[VIDEO-BG] Initial autoplay blocked, waiting for canplaythrough or user interaction');
        });
        
        console.log('[VIDEO-BG] Video background initialized');
    }
}

// ==================== EARLY AUDIO INITIALIZATION ====================
// Start background music from home page (before game scene loads)
let earlyAudioInitialized = false;

function initEarlyAudio() {
    if (earlyAudioInitialized) return;
    earlyAudioInitialized = true;
    
    console.log('[AUDIO] Initializing early audio for home page...');
    
    // Initialize audio context if not already done
    if (!audioContext) {
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
            
            console.log('[AUDIO] Audio context created for early init');
        } catch (e) {
            console.warn('[AUDIO] Web Audio API not supported for early init');
            return;
        }
    }
    
    // Preload and start background music
    preloadAllAudio().then(() => {
        console.log('[AUDIO] Audio preloaded, starting background music from home page');
        startBackgroundMusicMP3();
    });
}

// Handle user interaction to resume audio context (required by browsers)
function handleUserInteractionForAudio() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[AUDIO] Audio context resumed after user interaction');
        });
    }
    
    // Also try to play video if it was blocked
    const video = document.getElementById('video-background');
    if (video && video.paused && video.style.display !== 'none') {
        // Ensure video is loaded before playing
        if (video.readyState < 3) {
            video.load();
        }
        video.play().then(() => {
            console.log('[VIDEO-BG] Video started after user interaction');
        }).catch(() => {});
    }
}

// Initialize early audio and video on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('[INIT] Page loaded, initializing video background and early audio');
    initVideoBackground();
    
    // Add click listener to handle audio context resume
    document.addEventListener('click', handleUserInteractionForAudio, { once: true });
    document.addEventListener('touchstart', handleUserInteractionForAudio, { once: true });
    document.addEventListener('keydown', handleUserInteractionForAudio, { once: true });
    
    // Try to init early audio (may be blocked until user interaction)
    initEarlyAudio();
});

// Load and create sky-sphere panorama background
// Uses inverted sphere mesh for full control over positioning and animation
// 8K HD Quality: Applies anisotropic filtering and mipmaps for maximum sharpness
function loadPanoramaBackground() {
    if (!PANORAMA_CONFIG.enabled) return;
    
    const loader = new THREE.TextureLoader();
    // Enable cross-origin for R2 bucket images
    loader.setCrossOrigin('anonymous');
    
    // Helper function to create sky-sphere with loaded texture
    function createSkySphereWithTexture(texture, imageUrl) {
        // Apply 8K HD quality settings
        texture.colorSpace = THREE.SRGBColorSpace;
        
        // Apply texture quality settings for maximum sharpness
        const qualityConfig = PANORAMA_CONFIG.textureQuality;
        if (qualityConfig) {
            // Anisotropic filtering - clamp to GPU maximum
            if (renderer && renderer.capabilities) {
                const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
                texture.anisotropy = Math.min(qualityConfig.anisotropy || 16, maxAnisotropy);
                console.log('[PANORAMA] Anisotropic filtering:', texture.anisotropy, '(GPU max:', maxAnisotropy + ')');
            }
            
            // Mipmaps for better quality at distance
            texture.generateMipmaps = qualityConfig.generateMipmaps !== false;
            
            // Texture filtering
            texture.minFilter = THREE.LinearMipmapLinearFilter;  // Trilinear filtering
            texture.magFilter = THREE.LinearFilter;
        }
        
        // Force texture update
        texture.needsUpdate = true;
        
        panoramaTexture = texture;
        
        // FIX: Set scene.background as RELIABLE FALLBACK using EquirectangularReflectionMapping
        // This ensures the panorama is ALWAYS visible even if sky-sphere fails to render
        const bgTexture = texture.clone();
        bgTexture.mapping = THREE.EquirectangularReflectionMapping;
        bgTexture.needsUpdate = true;
        scene.background = bgTexture;
        console.log('[PANORAMA] Set scene.background with EquirectangularReflectionMapping as fallback');
        
        // Create sky-sphere geometry - FIX: Use BackSide instead of scale(-1,1,1) for better compatibility
        // Some GPU drivers have issues with negative scale + FrontSide face culling
        const config = PANORAMA_CONFIG.skySphere;
        const geometry = new THREE.SphereGeometry(config.radius, config.segments, config.segments);
        // Don't use geometry.scale(-1, 1, 1) - use BackSide instead for cross-device compatibility
        
        // FIX: Create material with robust settings for cross-device compatibility
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            fog: false,
            depthWrite: false,
            depthTest: false,      // FIX: Disable depth test for background mesh
            side: THREE.BackSide   // FIX: Use BackSide instead of scale(-1,1,1) + FrontSide
        });
        
        // Create sky-sphere mesh
        panoramaSkySphere = new THREE.Mesh(geometry, material);
        panoramaSkySphere.name = 'panoramaSkySphere';
        panoramaSkySphere.frustumCulled = false;  // FIX: Prevent frustum culling issues
        
        // Apply initial tilt to position seafloor at bottom of view
        panoramaSkySphere.rotation.x = config.tiltX;
        
        // Render order: -1000 ensures it renders first (behind everything)
        panoramaSkySphere.renderOrder = -1000;
        
        scene.add(panoramaSkySphere);
        
        // DIAGNOSTIC: Comprehensive logging to identify texture quality issues
        if (texture.image) {
            const imgWidth = texture.image.width;
            const imgHeight = texture.image.height;
            console.log('[PANORAMA] === TEXTURE DIAGNOSTIC ===');
            console.log('[PANORAMA] Image loaded:', imgWidth + 'x' + imgHeight, 'from', imageUrl);
            
            // Check GPU texture size limit
            if (renderer && renderer.capabilities) {
                const maxTexSize = renderer.capabilities.maxTextureSize;
                console.log('[PANORAMA] GPU maxTextureSize:', maxTexSize);
                if (imgWidth > maxTexSize || imgHeight > maxTexSize) {
                    console.warn('[PANORAMA] WARNING: Image exceeds GPU limit! Will be downscaled to', 
                        Math.min(imgWidth, maxTexSize) + 'x' + Math.min(imgHeight, maxTexSize));
                }
            }
            
            // Check renderer pixel ratio
            if (renderer) {
                console.log('[PANORAMA] Renderer pixelRatio:', renderer.getPixelRatio());
                console.log('[PANORAMA] Canvas size:', renderer.domElement.width + 'x' + renderer.domElement.height);
            }
            
            // Check graphics quality setting
            console.log('[PANORAMA] Graphics quality:', performanceState.graphicsQuality);
            console.log('[PANORAMA] === END DIAGNOSTIC ===');
        }
        console.log('[PANORAMA] Sky-sphere created with tilt:', config.tiltX * (180/Math.PI), 'degrees, segments:', config.segments);
        
        // Update fog to match panorama colors
        scene.fog = new THREE.Fog(
            PANORAMA_CONFIG.fogColor,
            PANORAMA_CONFIG.fogNear,
            PANORAMA_CONFIG.fogFar
        );
        
        // FIX: Keep scene.background as fallback - don't set to null
        // The sky-sphere renders on top, but scene.background provides a safety net
        // for devices where the sky-sphere might not render correctly
    }
    
    // Load primary 8K image from R2 (with cache-bust to ensure fresh load)
    const cacheBust = '?v=' + Date.now();
    const imageUrlWithCacheBust = PANORAMA_CONFIG.imageUrl + cacheBust;
    console.log('[PANORAMA] Loading from:', imageUrlWithCacheBust);
    
    loader.load(
        imageUrlWithCacheBust,
        (texture) => {
            createSkySphereWithTexture(texture, PANORAMA_CONFIG.imageUrl);
        },
        undefined,
        (error) => {
            console.warn('[PANORAMA] Failed to load 8K panorama from R2:', error.message || error);
            
            // Try fallback URL if available
            if (PANORAMA_CONFIG.fallbackUrl) {
                console.log('[PANORAMA] Trying fallback image:', PANORAMA_CONFIG.fallbackUrl);
                loader.load(
                    PANORAMA_CONFIG.fallbackUrl,
                    (texture) => {
                        createSkySphereWithTexture(texture, PANORAMA_CONFIG.fallbackUrl);
                    },
                    undefined,
                    (fallbackError) => {
                        console.warn('[PANORAMA] Fallback also failed, using solid color:', fallbackError);
                        scene.background = new THREE.Color(PANORAMA_CONFIG.fogColor);
                    }
                );
            } else {
                scene.background = new THREE.Color(PANORAMA_CONFIG.fogColor);
            }
        }
    );
}

// Update sky-sphere animation (called from animate loop)
// Adds subtle dynamic movement: slow Y rotation + gentle X bobbing
function updatePanoramaAnimation(deltaTime) {
    if (!panoramaSkySphere) return;
    
    const config = PANORAMA_CONFIG.skySphere;
    const time = performance.now();
    
    // Slow Y-axis rotation for subtle movement
    panoramaSkySphere.rotation.y += config.rotationSpeedY * deltaTime * 60;
    
    // Gentle X-axis bobbing (simulates underwater current)
    const bobOffset = Math.sin(time * config.bobSpeed) * config.bobAmplitude;
    panoramaSkySphere.rotation.x = config.tiltX + bobOffset;
    
    // Keep sky-sphere centered on camera position (so it always surrounds the viewer)
    if (camera) {
        panoramaSkySphere.position.copy(camera.position);
    }
}

// Create floating underwater particles for dynamic atmosphere
// ==================== GPU PARTICLE BUBBLE SYSTEM (Fresnel Rim + Soft Fade) ====================
const BUBBLE_PARAMS = {
    count: 500,
    riseSpeed: 0.57,
    wobbleAmp: 0.15,
    opacity: 0.33,
    fresnelPower: 2.5,
    innerAlpha: 0.092
};

let _bubblePositions = null;
let _bubbleSizes = null;
let _bubbleVelocities = [];

function createUnderwaterParticles() {
    const { width, depth, floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const N = BUBBLE_PARAMS.count;

    const geo = new THREE.BufferGeometry();
    _bubblePositions = new Float32Array(N * 3);
    _bubbleSizes = new Float32Array(N);
    _bubbleVelocities = [];

    for (let i = 0; i < N; i++) {
        _bubblePositions[i * 3]     = (Math.random() - 0.5) * width;
        _bubblePositions[i * 3 + 1] = floorY + Math.random() * (topY - floorY);
        _bubblePositions[i * 3 + 2] = (Math.random() - 0.5) * depth;
        _bubbleSizes[i] = (0.15 + Math.random() * 1.65) * 12.0;
        _bubbleVelocities.push({
            vy: 0.2 + Math.random() * 0.6,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleFreq: 0.4 + Math.random() * 1.2,
            wobbleAmpX: 0.05 + Math.random() * 0.15,
            wobbleAmpZ: 0.03 + Math.random() * 0.1
        });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(_bubblePositions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(_bubbleSizes, 1));

    const bvs = [
        'attribute float size;',
        'varying float vSize;',
        'void main() {',
        '  vSize = size;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * (300.0 / -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    const bfs = [
        'uniform float uOpacity;',
        'uniform float uFresnelPower;',
        'uniform float uInnerAlpha;',
        'uniform vec3 uColor;',
        'uniform vec3 uRimColor;',
        'varying float vSize;',
        'void main() {',
        '  vec2 uv = gl_PointCoord * 2.0 - 1.0;',
        '  float d = length(uv);',
        '  if (d > 1.0) discard;',
        '  float rim = pow(d, uFresnelPower);',
        '  float innerFade = smoothstep(0.0, 0.5, d);',
        '  float outerFade = 1.0 - smoothstep(0.85, 1.0, d);',
        '  vec3 col = mix(uColor * uInnerAlpha, uRimColor, rim);',
        '  float alpha = (innerFade * 0.3 + rim * 0.7) * outerFade * uOpacity;',
        '  float hl = pow(max(0.0, 1.0 - length(uv - vec2(-0.3, -0.3))), 8.0) * 0.6;',
        '  col += vec3(hl);',
        '  float hl2 = pow(max(0.0, 1.0 - length(uv - vec2(0.2, 0.25))), 10.0) * 0.25;',
        '  col += vec3(hl2);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
    ].join('\n');

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uOpacity:      { value: BUBBLE_PARAMS.opacity },
            uFresnelPower: { value: BUBBLE_PARAMS.fresnelPower },
            uInnerAlpha:   { value: BUBBLE_PARAMS.innerAlpha },
            uColor:        { value: new THREE.Color(0.55, 0.82, 1.0) },
            uRimColor:     { value: new THREE.Color(0.85, 0.95, 1.0) }
        },
        vertexShader: bvs,
        fragmentShader: bfs,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    underwaterParticleSystem = new THREE.Points(geo, mat);
    scene.add(underwaterParticleSystem);
    console.log(`[ATMOSPHERE] Created ${N} GPU particle bubbles (fresnel rim + soft fade)`);
}

function updateUnderwaterParticles(deltaTime) {
    if (!underwaterParticleSystem) return;

    const { floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const { width, depth } = CONFIG.aquarium;
    const time = performance.now() * 0.001;
    const pos = _bubblePositions;

    for (let i = 0; i < _bubbleVelocities.length; i++) {
        const v = _bubbleVelocities[i];
        const i3 = i * 3;
        pos[i3 + 1] += v.vy * BUBBLE_PARAMS.riseSpeed * deltaTime * 60;
        pos[i3]     += Math.sin(time * v.wobbleFreq + v.wobblePhase) * v.wobbleAmpX * BUBBLE_PARAMS.wobbleAmp * deltaTime * 60;
        pos[i3 + 2] += Math.cos(time * v.wobbleFreq * 0.7 + v.wobblePhase) * v.wobbleAmpZ * BUBBLE_PARAMS.wobbleAmp * deltaTime * 60;
        if (pos[i3 + 1] > topY) {
            pos[i3]     = (Math.random() - 0.5) * width;
            pos[i3 + 1] = floorY;
            pos[i3 + 2] = (Math.random() - 0.5) * depth;
        }
    }
    underwaterParticleSystem.geometry.attributes.position.needsUpdate = true;
    underwaterParticleSystem.material.uniforms.uOpacity.value      = BUBBLE_PARAMS.opacity;
    underwaterParticleSystem.material.uniforms.uFresnelPower.value = BUBBLE_PARAMS.fresnelPower;
    underwaterParticleSystem.material.uniforms.uInnerAlpha.value   = BUBBLE_PARAMS.innerAlpha;
}

// ==================== UNDERWATER GOD RAYS (Light Shafts from Surface) ====================
let godRayGroup = null;
const GOD_RAY_CONFIG = {
    count: 5,
    topY: 800,
    bottomY: -600,
    spread: 1800,
    minWidth: 8,
    maxWidth: 30,
    color: 0x80d8f0,
    opacity: 0.018,
    driftSpeed: 0.04,
    pulseSpeed: 0.15,
    fpsFadeStartDist: 200,
    fpsFadeEndDist: 80
};

const godRayShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            float vFade = vUv.y * (1.0 - vUv.y) * 4.0;
            vFade = pow(vFade, 1.5);
            float hFade = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
            float alpha = uOpacity * vFade * hFade;
            gl_FragColor = vec4(uColor, alpha);
        }
    `
};

function createGodRays() {
    godRayGroup = new THREE.Group();
    godRayGroup.name = 'godRays';

    const c = new THREE.Color(GOD_RAY_CONFIG.color);

    for (let i = 0; i < GOD_RAY_CONFIG.count; i++) {
        const w = GOD_RAY_CONFIG.minWidth + Math.random() * (GOD_RAY_CONFIG.maxWidth - GOD_RAY_CONFIG.minWidth);
        const h = GOD_RAY_CONFIG.topY - GOD_RAY_CONFIG.bottomY;
        const geo = new THREE.PlaneGeometry(w, h);
        const baseOpacity = GOD_RAY_CONFIG.opacity * (0.6 + Math.random() * 0.4);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: c },
                uOpacity: { value: baseOpacity }
            },
            vertexShader: godRayShader.vertexShader,
            fragmentShader: godRayShader.fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        const xPos = (Math.random() - 0.5) * GOD_RAY_CONFIG.spread;
        mesh.position.set(xPos, (GOD_RAY_CONFIG.topY + GOD_RAY_CONFIG.bottomY) / 2, (Math.random() - 0.5) * 400);
        mesh.rotation.z = (Math.random() - 0.5) * 0.08;
        mesh.userData.baseX = xPos;
        mesh.userData.baseOpacity = baseOpacity;
        mesh.userData.phase = Math.random() * Math.PI * 2;
        mesh.userData.driftPhase = Math.random() * Math.PI * 2;
        mesh.renderOrder = -500;
        godRayGroup.add(mesh);
    }
    scene.add(godRayGroup);
    console.log(`[ATMOSPHERE] Created ${GOD_RAY_CONFIG.count} subtle god ray light shafts`);
}

const _godRayTempDir = new THREE.Vector3();
const _godRayTempPos = new THREE.Vector3();

function updateGodRays(time) {
    if (!godRayGroup) return;
    const isFps = gameState.viewMode === 'fps';
    const camPos = camera ? camera.position : null;

    for (let i = 0; i < godRayGroup.children.length; i++) {
        const ray = godRayGroup.children[i];
        ray.position.x = ray.userData.baseX + Math.sin(time * GOD_RAY_CONFIG.driftSpeed + ray.userData.driftPhase) * 40;
        const pulse = 0.75 + 0.25 * Math.sin(time * GOD_RAY_CONFIG.pulseSpeed + ray.userData.phase);
        let opacity = ray.userData.baseOpacity * pulse;

        if (isFps && camPos) {
            _godRayTempPos.set(ray.position.x, camPos.y, ray.position.z);
            const dist = camPos.distanceTo(_godRayTempPos);
            if (dist < GOD_RAY_CONFIG.fpsFadeStartDist) {
                const t = Math.max(0, (dist - GOD_RAY_CONFIG.fpsFadeEndDist) /
                    (GOD_RAY_CONFIG.fpsFadeStartDist - GOD_RAY_CONFIG.fpsFadeEndDist));
                opacity *= t;
            }
            _godRayTempDir.subVectors(ray.position, camPos).normalize();
            const camForward = camera.getWorldDirection(_godRayTempPos);
            const dot = Math.abs(_godRayTempDir.dot(camForward));
            const angleFade = Math.min(1, dot * 3);
            opacity *= angleFade;
        }

        ray.material.uniforms.uOpacity.value = opacity;
    }
}

// ==================== VOLUMETRIC GOD RAY PARTICLES ====================
const RAY_PARTICLE_PARAMS = {
    count: 2000,
    speed: 0.39,
    size: 3.5,
    opacity: 0.63,
    beamCount: 10
};

let _rayParticlePoints = null;
let _rayParticleGeo = null;
let _rayPositions = null;
let _rayVelocities = [];

function createGodRayParticles() {
    const { width, depth, floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const N = RAY_PARTICLE_PARAMS.count;

    _rayParticleGeo = new THREE.BufferGeometry();
    _rayPositions = new Float32Array(N * 3);
    _rayVelocities = [];
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        const bi = Math.floor(Math.random() * RAY_PARTICLE_PARAMS.beamCount);
        const bx = (bi / RAY_PARTICLE_PARAMS.beamCount - 0.5) * width + (Math.random() - 0.5) * 30;
        const by = floorY + Math.random() * (topY - floorY);
        const bz = (Math.random() - 0.5) * depth * 0.5 - 50;
        _rayPositions[i * 3]     = bx;
        _rayPositions[i * 3 + 1] = by;
        _rayPositions[i * 3 + 2] = bz;
        sizes[i] = (1.0 + Math.random() * 2.5) * RAY_PARTICLE_PARAMS.size;
        _rayVelocities.push({
            vy: -(0.1 + Math.random() * 0.3),
            drift: (Math.random() - 0.5) * 0.05,
            beamX: bx,
            beamZ: bz,
            scatter: 10 + Math.random() * 20,
            phase: Math.random() * Math.PI * 2
        });
    }
    _rayParticleGeo.setAttribute('position', new THREE.BufferAttribute(_rayPositions, 3));
    _rayParticleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const rvs = [
        'attribute float size;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * (250.0 / -mv.z);',
        '  vAlpha = smoothstep(-450.0, 400.0, position.y);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    const rfs = [
        'uniform float uOpacity;',
        'uniform vec3 uColor;',
        'varying float vAlpha;',
        'void main() {',
        '  float d = length(gl_PointCoord * 2.0 - 1.0);',
        '  if (d > 1.0) discard;',
        '  float soft = 1.0 - d * d;',
        '  float glow = exp(-d * 3.0) * 0.6;',
        '  float alpha = (soft * 0.4 + glow) * vAlpha * uOpacity;',
        '  gl_FragColor = vec4(uColor, alpha);',
        '}'
    ].join('\n');

    const rayMat = new THREE.ShaderMaterial({
        uniforms: {
            uOpacity: { value: RAY_PARTICLE_PARAMS.opacity },
            uColor:   { value: new THREE.Color(0.5, 0.8, 1.0) }
        },
        vertexShader: rvs,
        fragmentShader: rfs,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    _rayParticlePoints = new THREE.Points(_rayParticleGeo, rayMat);
    scene.add(_rayParticlePoints);
    console.log(`[ATMOSPHERE] Created ${N} volumetric god ray particles`);
}

function updateGodRayParticles(time, deltaTime) {
    if (!_rayParticlePoints) return;
    const { floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const pos = _rayPositions;

    for (let i = 0; i < _rayVelocities.length; i++) {
        const v = _rayVelocities[i];
        const i3 = i * 3;
        pos[i3 + 1] += v.vy * RAY_PARTICLE_PARAMS.speed * deltaTime * 60;
        pos[i3]     += Math.sin(time * 0.3 + v.phase) * v.drift * deltaTime * 60;
        if (pos[i3 + 1] < floorY) {
            pos[i3]     = v.beamX + (Math.random() - 0.5) * v.scatter;
            pos[i3 + 1] = topY;
            pos[i3 + 2] = v.beamZ + (Math.random() - 0.5) * v.scatter;
        }
    }
    _rayParticleGeo.attributes.position.needsUpdate = true;
    _rayParticlePoints.material.uniforms.uOpacity.value = RAY_PARTICLE_PARAMS.opacity;
}

// ==================== FLOATING DUST PARTICLES ====================
const DUST_PARAMS = {
    count: 600,
    size: 2.0,
    opacity: 0.2,
    speed: 0.08
};

let _dustPoints = null;
let _dustGeo = null;
let _dustPositions = null;
let _dustVelocities = [];

function createDustParticles() {
    const { width, depth, floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const N = DUST_PARAMS.count;

    _dustGeo = new THREE.BufferGeometry();
    _dustPositions = new Float32Array(N * 3);
    _dustVelocities = [];
    const sizes = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        _dustPositions[i * 3]     = (Math.random() - 0.5) * width;
        _dustPositions[i * 3 + 1] = floorY + Math.random() * (topY - floorY);
        _dustPositions[i * 3 + 2] = (Math.random() - 0.5) * depth;
        sizes[i] = (0.5 + Math.random() * 1.5) * DUST_PARAMS.size;
        _dustVelocities.push({
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.04,
            vz: (Math.random() - 0.5) * 0.06,
            phase: Math.random() * Math.PI * 2
        });
    }
    _dustGeo.setAttribute('position', new THREE.BufferAttribute(_dustPositions, 3));
    _dustGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const dvs = [
        'attribute float size;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = size * (200.0 / -mv.z);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    const dfs = [
        'uniform float uOpacity;',
        'void main() {',
        '  float d = length(gl_PointCoord * 2.0 - 1.0);',
        '  if (d > 1.0) discard;',
        '  float a = exp(-d * d * 4.0) * uOpacity;',
        '  gl_FragColor = vec4(0.6, 0.8, 0.95, a);',
        '}'
    ].join('\n');

    const dustMat = new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: DUST_PARAMS.opacity } },
        vertexShader: dvs,
        fragmentShader: dfs,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    _dustPoints = new THREE.Points(_dustGeo, dustMat);
    scene.add(_dustPoints);
    console.log(`[ATMOSPHERE] Created ${N} floating dust particles`);
}

function updateDustParticles(time, deltaTime) {
    if (!_dustPoints) return;
    const { width, depth, floorY } = CONFIG.aquarium;
    const topY = floorY + CONFIG.aquarium.height;
    const halfW = width / 2;
    const halfD = depth / 2;
    const pos = _dustPositions;

    for (let i = 0; i < _dustVelocities.length; i++) {
        const v = _dustVelocities[i];
        const i3 = i * 3;
        pos[i3]     += (v.vx + Math.sin(time * 0.15 + v.phase) * 0.02) * DUST_PARAMS.speed * deltaTime * 60;
        pos[i3 + 1] += (v.vy + Math.cos(time * 0.1  + v.phase) * 0.01) * DUST_PARAMS.speed * deltaTime * 60;
        pos[i3 + 2] += (v.vz + Math.sin(time * 0.12 + v.phase * 1.3) * 0.015) * DUST_PARAMS.speed * deltaTime * 60;
        if (Math.abs(pos[i3]) > halfW || pos[i3 + 1] > topY || pos[i3 + 1] < floorY || Math.abs(pos[i3 + 2]) > halfD) {
            pos[i3]     = (Math.random() - 0.5) * width * 0.8;
            pos[i3 + 1] = floorY + Math.random() * (topY - floorY);
            pos[i3 + 2] = (Math.random() - 0.5) * depth * 0.8;
        }
    }
    _dustGeo.attributes.position.needsUpdate = true;
    _dustPoints.material.uniforms.uOpacity.value = DUST_PARAMS.opacity;
}

// ==================== EFFECT COMPOSER POST-PROCESSING ====================
const POST_PARAMS = {
    bloomStrength: 0.57,
    bloomRadius: 0.54,
    bloomThreshold: 0.75,
    godRayIntensity: 0.5,
    depthTintStrength: 0.13,
    causticIntensity: 0.21,
    distortionIntensity: 0.0,
    distortionFrequency: 5.0,
    distortionSpeed: 0.25
};

let _effectComposer = null;
let _underwaterPass = null;
let _bloomPass = null;

function setupEffectComposer() {
    if (!renderer || !scene || !camera) return;
    if (typeof THREE.EffectComposer === 'undefined') {
        console.warn('[ATMOSPHERE] EffectComposer not loaded, skipping post-processing');
        return;
    }

    _effectComposer = new THREE.EffectComposer(renderer);
    _effectComposer.addPass(new THREE.RenderPass(scene, camera));

    _bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        POST_PARAMS.bloomStrength,
        POST_PARAMS.bloomRadius,
        POST_PARAMS.bloomThreshold
    );
    _effectComposer.addPass(_bloomPass);

    const wvs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

    const wfs = [
        'uniform sampler2D tDiffuse;',
        'uniform float uTime;',
        'uniform float uIntensity;',
        'uniform float uFrequency;',
        'uniform float uSpeed;',
        'uniform float uGodRayIntensity;',
        'uniform float uDepthTintStrength;',
        'uniform float uCausticIntensity;',
        'varying vec2 vUv;',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p) {',
        '  vec2 i = floor(p), f = fract(p);',
        '  f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);',
        '}',
        'void main() {',
        '  vec2 uv = vUv;',
        '  float r1 = sin(uv.x * uFrequency + uTime * uSpeed) * cos(uv.y * uFrequency * 0.8 + uTime * uSpeed * 0.7);',
        '  float r2 = sin(uv.y * uFrequency * 1.2 - uTime * uSpeed * 0.9) * cos(uv.x * uFrequency * 0.6 + uTime * uSpeed * 0.5);',
        '  uv += vec2(r1, r2) * uIntensity;',
        '  vec4 col = texture2D(tDiffuse, uv);',
        '  float rayAcc = 0.0;',
        '  vec2 lp = vec2(0.5, 0.0);',
        '  vec2 d = (uv - lp) * 0.012;',
        '  vec2 sp = uv;',
        '  float dc = 1.0;',
        '  for (int i = 0; i < 28; i++) {',
        '    sp -= d;',
        '    rayAcc += texture2D(tDiffuse, clamp(sp, 0.0, 1.0)).g * dc;',
        '    dc *= 0.965;',
        '  }',
        '  rayAcc /= 28.0;',
        '  col.rgb += vec3(0.3, 0.6, 0.9) * rayAcc * uGodRayIntensity * smoothstep(0.55, 0.0, uv.y);',
        '  float c1 = noise(uv * 16.0 + uTime * vec2(0.22, 0.13));',
        '  float c2 = noise(uv * 22.0 - uTime * vec2(0.16, 0.28));',
        '  col.rgb += vec3(0.2, 0.5, 0.7) * pow(abs(c1 - c2), 1.5) * uCausticIntensity * smoothstep(0.3, 0.85, uv.y);',
        '  col.rgb = mix(col.rgb, vec3(0.01, 0.1, 0.25), smoothstep(0.15, 0.9, uv.y) * uDepthTintStrength);',
        '  vec2 vig = (vUv - 0.5) * 2.0;',
        '  col.rgb *= clamp(1.0 - dot(vig, vig) * 0.2, 0.0, 1.0);',
        '  gl_FragColor = col;',
        '}'
    ].join('\n');

    _underwaterPass = new THREE.ShaderPass({
        uniforms: {
            tDiffuse:           { value: null },
            uTime:              { value: 0 },
            uIntensity:         { value: POST_PARAMS.distortionIntensity },
            uFrequency:         { value: POST_PARAMS.distortionFrequency },
            uSpeed:             { value: POST_PARAMS.distortionSpeed },
            uGodRayIntensity:   { value: POST_PARAMS.godRayIntensity },
            uDepthTintStrength: { value: POST_PARAMS.depthTintStrength },
            uCausticIntensity:  { value: POST_PARAMS.causticIntensity }
        },
        vertexShader: wvs,
        fragmentShader: wfs
    });
    _effectComposer.addPass(_underwaterPass);

    console.log('[ATMOSPHERE] EffectComposer initialized (Bloom + Underwater Shader)');
}

function updatePostProcessing(time) {
    if (!_underwaterPass) return;
    const u = _underwaterPass.uniforms;
    u.uTime.value              = time;
    u.uIntensity.value         = POST_PARAMS.distortionIntensity;
    u.uFrequency.value         = POST_PARAMS.distortionFrequency;
    u.uSpeed.value             = POST_PARAMS.distortionSpeed;
    u.uGodRayIntensity.value   = POST_PARAMS.godRayIntensity;
    u.uDepthTintStrength.value = POST_PARAMS.depthTintStrength;
    u.uCausticIntensity.value  = POST_PARAMS.causticIntensity;
}

// ==================== UNDERWATER CSS OVERLAY (Vignette + Color Tint) ====================
function createUnderwaterOverlay() {
    if (document.getElementById('underwater-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'underwater-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        z-index: 5;
        background: radial-gradient(ellipse at center,
            rgba(10,80,100,0) 0%,
            rgba(10,80,100,0) 55%,
            rgba(8,60,80,0.08) 80%,
            rgba(5,40,60,0.15) 100%
        );
        mix-blend-mode: multiply;
    `;
    document.body.appendChild(overlay);
    console.log('[ATMOSPHERE] Created underwater CSS overlay (light vignette)');
}

let causticsPlane = null;
let causticsCanvas = null;
let causticsCtx = null;
let causticsTexture = null;

function createCaustics() {
    causticsCanvas = document.createElement('canvas');
    causticsCanvas.width = 256;
    causticsCanvas.height = 256;
    causticsCtx = causticsCanvas.getContext('2d');
    causticsTexture = new THREE.CanvasTexture(causticsCanvas);
    causticsTexture.wrapS = THREE.RepeatWrapping;
    causticsTexture.wrapT = THREE.RepeatWrapping;
    causticsTexture.repeat.set(3, 3);

    const { width, depth, floorY } = CONFIG.aquarium;
    const geo = new THREE.PlaneGeometry(width * 1.5, depth * 1.5);
    const mat = new THREE.MeshBasicMaterial({
        map: causticsTexture,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    causticsPlane = new THREE.Mesh(geo, mat);
    causticsPlane.rotation.x = -Math.PI / 2;
    causticsPlane.position.y = floorY + 10;
    causticsPlane.renderOrder = -400;
    scene.add(causticsPlane);
    console.log('[ATMOSPHERE] Created caustics light pattern on floor');
}

function updateCaustics(time) {
    if (!causticsCtx) return;
    const w = 256, h = 256;
    causticsCtx.clearRect(0, 0, w, h);
    const t = time * 0.4;
    for (let i = 0; i < 18; i++) {
        const cx = (w / 2) + Math.sin(t + i * 1.3) * (w * 0.35);
        const cy = (h / 2) + Math.cos(t * 0.7 + i * 0.9) * (h * 0.35);
        const r = 30 + Math.sin(t * 0.5 + i * 2.1) * 15;
        const grad = causticsCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(180,230,255,0.25)');
        grad.addColorStop(0.5, 'rgba(150,210,240,0.10)');
        grad.addColorStop(1, 'rgba(120,200,230,0)');
        causticsCtx.fillStyle = grad;
        causticsCtx.beginPath();
        causticsCtx.arc(cx, cy, r, 0, Math.PI * 2);
        causticsCtx.fill();
    }
    causticsTexture.needsUpdate = true;
}

// ==================== UNIFIED WEAPON CONFIGURATION ====================
// Single source of truth for ALL weapon parameters.
// To adjust any weapon, edit ONLY this object.
// Legacy configs (CONFIG.weapons, WEAPON_GLB_CONFIG, WEAPON_VFX_CONFIG) are
// auto-generated from WEAPON_CONFIG for backward compatibility.
const WEAPON_CONFIG = {
    '1x': {
        multiplier: 1, cost: 1, damage: 100, shotsPerSecond: 2.5,
        type: 'projectile', speed: 4000,
        piercing: false, spreadAngle: 0, aoeRadius: 0, damageEdge: 0, laserWidth: 0,
        convergenceDistance: 1400,

        soundVolume: 1.0,
        fireScreenShake: { strength: 0, duration: 0 },

        glbCannon: '1x 武器模組',
        glbCannonNonPlayer: '1x 武器模組(非玩家).glb',
        glbBullet: '1x 子彈模組',
        glbHitEffect: '1x 擊中特效',
        scale: 1.0, bulletScale: 0.5, hitEffectScale: 0.3,
                muzzleOffset: new THREE.Vector3(0, 30, 55),
                cannonYOffset: 25,
        cannonRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        bulletRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        hitEffectRotationFix: false, hitEffectPlanar: true,
        bulletTint: null,
        fpsCameraBackDist: 115, fpsCameraUpOffset: 75,
        emissiveBoost: 0.4,

        color: 0xcccccc, size: 0.8,
        cannonColor: 0xcccccc, cannonEmissive: 0x666666,
        muzzleColor: 0x88ddff, trailColor: 0xffffff,
        hitColor: 0x88ddff, ringColor: 0xffffff,
        recoilStrength: 5, screenShakeOnHit: 0.5,
        chargeTime: 0,
    },
    '3x': {
        multiplier: 3, cost: 3, damage: 100, shotsPerSecond: 2.5,
        type: 'spread', speed: 4000,
        piercing: false, spreadAngle: 15, aoeRadius: 0, damageEdge: 0, laserWidth: 0,
        convergenceDistance: 1400,

        soundVolume: 1.0,
        fireScreenShake: { strength: 0, duration: 0 },

        glbCannon: '3x 武器模組',
        glbCannonNonPlayer: '3x 武器模組(非玩家).glb',
        glbBullet: '1x 子彈模組',
        glbHitEffect: '3x 擊中特效',
        scale: 1.1, bulletScale: 0.6, hitEffectScale: 0.35,
        muzzleOffset: new THREE.Vector3(0, 30, 60),
        cannonYOffset: 25,
        cannonRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        bulletRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        hitEffectRotationFix: false, hitEffectPlanar: true,
        bulletTint: 0xffaaaa,
        fpsCameraBackDist: 125, fpsCameraUpOffset: 75,
        emissiveBoost: 0.4,

        color: 0xffaaaa, size: 0.8,
        cannonColor: 0xff8888, cannonEmissive: 0xff6666,
        muzzleColor: 0xffaaaa, trailColor: 0xffbbbb,
        hitColor: 0xffaaaa, ringColor: 0xffaaaa,
        recoilStrength: 8, screenShakeOnHit: 1.0,
        chargeTime: 0,
    },
    '5x': {
        multiplier: 5, cost: 5, damage: 200, shotsPerSecond: 2.5,
        type: 'rocket', speed: 4000,
        piercing: false, spreadAngle: 0, aoeRadius: 120, damageEdge: 80, laserWidth: 0,
        convergenceDistance: 1400,

        soundVolume: 1.0,
        fireScreenShake: { strength: 0, duration: 0 },

        glbCannon: '5x 武器模組',
        glbCannonNonPlayer: '5x 武器模組(非玩家).glb',
        glbBullet: '5x 子彈模組',
        glbHitEffect: '5x 擊中特效',
        scale: 1.3, bulletScale: 0.7, hitEffectScale: 0.45,
        muzzleOffset: new THREE.Vector3(0, 30, 65),
        cannonYOffset: 25,
        cannonRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        bulletRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        hitEffectRotationFix: false, hitEffectPlanar: false,
        bulletTint: null,
        fpsCameraBackDist: 150, fpsCameraUpOffset: 75,
        emissiveBoost: 0.4,

        color: 0xffdd00, size: 0.8,
        cannonColor: 0xffcc00, cannonEmissive: 0xffaa00,
        muzzleColor: 0xffdd00, trailColor: 0xffcc00,
        hitColor: 0xffdd00, ringColor: 0xffdd00,
        recoilStrength: 12, screenShakeOnHit: 1.5,
        chargeTime: 0.2,
    },
    '8x': {
        multiplier: 8, cost: 8, damage: 350, shotsPerSecond: 1.0,
        type: 'laser', speed: 0,
        piercing: true, spreadAngle: 0, aoeRadius: 0, damageEdge: 0, laserWidth: 8,
        convergenceDistance: 1400,

        soundVolume: 0.5,
        fireScreenShake: { strength: 6, duration: 200 },

        glbCannon: '8x 武器模組',
        glbCannonNonPlayer: '8x 武器模組(非玩家).glb.glb',
        glbBullet: '8x 子彈模組',
        glbHitEffect: '8x 擊中特效',
        scale: 1.0, bulletScale: 0.9, hitEffectScale: 0.6,
        muzzleOffset: new THREE.Vector3(0, 30, 50),
        cannonYOffset: 25,
        cannonRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        bulletRotationFix: new THREE.Euler(0, Math.PI / 2, 0),
        hitEffectRotationFix: false, hitEffectPlanar: false,
        bulletTint: null,
        fpsCameraBackDist: 150, fpsCameraUpOffset: 75,
        emissiveBoost: 0.3,

        color: 0xff4444, size: 16,
        cannonColor: 0xff2222, cannonEmissive: 0xcc0000,
        muzzleColor: 0xff4400, trailColor: 0xff6600,
        hitColor: 0xff2200, ringColor: 0xff2200,
        recoilStrength: 15, screenShakeOnHit: 3,
        chargeTime: 0.3,
    },
};

function _buildLegacyWeaponsConfig() {
    const result = {};
    for (const [key, w] of Object.entries(WEAPON_CONFIG)) {
        const entry = {
            multiplier: w.multiplier, cost: w.cost,
            damage: w.damage, shotsPerSecond: w.shotsPerSecond,
            type: w.type, color: w.color, size: w.size,
            cannonColor: w.cannonColor, cannonEmissive: w.cannonEmissive,
            convergenceDistance: w.convergenceDistance,
        };
        if (w.speed > 0) entry.speed = w.speed;
        if (w.type === 'spread') entry.spreadAngle = w.spreadAngle;
        if (w.type === 'rocket') { entry.aoeRadius = w.aoeRadius; entry.damageEdge = w.damageEdge; }
        if (w.type === 'laser') { entry.piercing = w.piercing; entry.laserWidth = w.laserWidth; }
        result[key] = entry;
    }
    return result;
}

function _buildLegacyGLBWeapons() {
    const result = {};
    for (const [key, w] of Object.entries(WEAPON_CONFIG)) {
        const entry = {
            cannon: w.glbCannon,
            cannonNonPlayer: w.glbCannonNonPlayer,
            bullet: w.glbBullet,
            hitEffect: w.glbHitEffect,
            scale: w.scale, bulletScale: w.bulletScale, hitEffectScale: w.hitEffectScale,
            muzzleOffset: w.muzzleOffset,
            cannonYOffset: w.cannonYOffset,
            cannonRotationFix: w.cannonRotationFix,
            bulletRotationFix: w.bulletRotationFix,
            hitEffectRotationFix: w.hitEffectRotationFix,
            hitEffectPlanar: w.hitEffectPlanar,
            fpsCameraBackDist: w.fpsCameraBackDist,
            fpsCameraUpOffset: w.fpsCameraUpOffset,
            emissiveBoost: w.emissiveBoost,
        };
        if (w.bulletTint) entry.bulletTint = w.bulletTint;
        result[key] = entry;
    }
    return result;
}

function _buildLegacyVFXConfig() {
    const result = {};
    for (const [key, w] of Object.entries(WEAPON_CONFIG)) {
        const entry = {
            muzzleColor: w.muzzleColor, trailColor: w.trailColor,
            hitColor: w.hitColor, ringColor: w.ringColor,
            recoilStrength: w.recoilStrength, screenShake: w.screenShakeOnHit,
        };
        if (w.chargeTime > 0) entry.chargeTime = w.chargeTime;
        result[key] = entry;
    }
    return result;
}

const WeaponSystem = {
    getConfig(weaponKey) {
        return WEAPON_CONFIG[weaponKey] || WEAPON_CONFIG['1x'];
    },
    getCooldown(weaponKey) {
        const w = this.getConfig(weaponKey);
        return 1 / w.shotsPerSecond;
    },
    getSoundVolume(weaponKey) {
        return this.getConfig(weaponKey).soundVolume;
    },
    getFireScreenShake(weaponKey) {
        return this.getConfig(weaponKey).fireScreenShake;
    },
    isHitscan(weaponKey) {
        return this.getConfig(weaponKey).type === 'laser';
    },
    getAllKeys() {
        return Object.keys(WEAPON_CONFIG);
    },
};

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
        showRtpOnButtons: false
    },
    
    // GLB Model Scale Multiplier - applies to all fish GLB models
    // Increase this value to make all fish larger (e.g., 3.0 = 3x bigger)
    // This affects both GLB models and procedural fallback meshes
    glbModelScaleMultiplier: 3.0,
    
    // Fish arena - inside the aquarium tank (rectangular bounds)
    fishArena: {
        // Fish swim inside the tank with some margin from walls
        marginX: 300,
        marginY: 200,
        marginZ: 300
    },
    
    // Issue #11: 20 Fish Species System with diverse behaviors and forms
    // ECOLOGY UPDATE: Adjusted for realistic marine behavior + RTP balance + casino feel
    // Design principles:
    // - HP breakpoints: 1x kills in 1 shot (HP<100), 3x advantage (HP 100-200), 5x/8x for big fish (HP>300)
    // - School sizes: Based on real marine biology
    // - Spawn counts: Baitfish dominant, reef fish common, predators rare
    // - Patterns: Match real swimming behaviors
    // - boidsStrength: 0 = strictly solitary, 0.3 = weak grouping, 1.0 = normal, 2.0 = tight schooling, 3.0 = bait ball
    fishTiers: {
        // ==================== LARGE SOLITARY PREDATORS (4 species) ====================
        // Boss Mode only - rare apex predators
        // 1. Blue Whale - Largest marine mammal, slow gentle filter feeder
        // ECOLOGY: Solitary or mother-calf pairs, cruise at 5-20 km/h
        // SWIMMING: Slow, steady, majestic cruise with minimal direction changes
        blueWhale: { 
            hp: 800, speedMin: 20, speedMax: 42, reward: 500, size: 140, 
            color: 0x4477aa, secondaryColor: 0x88aacc, count: 1, 
            pattern: 'cruise', schoolSize: [1, 2], form: 'whale',
            category: 'largePredator',
            boidsStrength: 0.1,  // Almost no schooling, mother-calf only
            maxTurnRate: 0.3    // Very slow turning - majestic cruise
        },
        // 1b. Killer Whale (Orca) - Apex predator, pack hunter
        // ECOLOGY: Pods of 5-30, highly intelligent coordinated hunters
        // SWIMMING: Fast, agile, coordinated pack attacks
        killerWhale: { 
            hp: 700, speedMin: 50, speedMax: 88, reward: 450, size: 120, 
            color: 0x111111, secondaryColor: 0xffffff, count: 1, 
            pattern: 'burstAttack', schoolSize: [2, 4], form: 'killerWhale',
            category: 'largePredator',
            boidsStrength: 1.8,  // Strong pod coordination
            maxTurnRate: 0.6    // More agile than blue whale
        },
        // 2. Great White Shark - Apex predator, torpedo-shaped
        // ECOLOGY: Strictly solitary hunters, burst speeds up to 56 km/h
        // SWIMMING: Slow patrol + explosive burst attacks
        greatWhiteShark: { 
            hp: 600, speedMin: 65, speedMax: 188, reward: 400, size: 100, 
            color: 0x667788, secondaryColor: 0xcccccc, count: 1, 
            pattern: 'burstAttack', schoolSize: [1, 1], form: 'shark',
            category: 'largePredator',
            boidsStrength: 0,   // Strictly solitary
            maxTurnRate: 0.8    // Moderate turning - steady predator
        },
        // 3. Marlin - Fastest fish, long bill for slashing prey
        // ECOLOGY: Solitary hunters, burst speeds up to 130 km/h
        // SWIMMING: High-speed sprints, fastest fish in the ocean
        marlin: { 
            hp: 400, speedMin: 110, speedMax: 310, reward: 300, size: 80, 
            color: 0x2266aa, secondaryColor: 0x44aaff, count: 2, 
            pattern: 'burstSprint', schoolSize: [1, 2], form: 'marlin',
            category: 'largePredator',
            boidsStrength: 0,   // Strictly solitary
            maxTurnRate: 0.6    // Slow turning - long body, high speed
        },
        // 4. Hammerhead Shark - T-shaped head for enhanced electroreception
        // ECOLOGY: School by day (up to 100+), hunt solo at night
        // SWIMMING: S-shaped head sweeping motion for prey detection
        hammerheadShark: { 
            hp: 450, speedMin: 56, speedMax: 110, reward: 300, size: 85, 
            color: 0x556677, secondaryColor: 0x889999, count: 3, 
            pattern: 'sShape', schoolSize: [3, 8], form: 'hammerhead',
            category: 'largePredator',
            boidsStrength: 1.5, // School by day (unique among sharks)
            maxTurnRate: 0.7    // Moderate turning - schooling shark
        },
        
        // ==================== MEDIUM-LARGE PELAGIC FISH (4 species) ====================
        // Open water swimmers, good targets for 3x/5x weapons
        // 5. Yellowfin Tuna - Powerful torpedo body, warm-blooded
        // ECOLOGY: Schools of 10-100, cruise at 50-80 km/h, synchronized swimming
        // SWIMMING: Fast, powerful, highly synchronized with school
        yellowfinTuna: { 
            hp: 200, speedMin: 75, speedMax: 138, reward: 220, size: 50, 
            color: 0x3355aa, secondaryColor: 0xffdd00, count: 6, 
            pattern: 'synchronizedFast', schoolSize: [6, 15], form: 'tuna',
            category: 'mediumLarge',
            boidsStrength: 2.0  // Tight synchronized schooling
        },
        // 6. Mahi-Mahi/Dolphinfish - Blunt head, brilliant gold-green
        // ECOLOGY: Small schools of 3-10, surface dwellers, erratic movements
        // SWIMMING: Fast, erratic, unpredictable direction changes
        mahiMahi: { 
            hp: 160, speedMin: 69, speedMax: 125, reward: 180, size: 45, 
            color: 0x44aa44, secondaryColor: 0xffcc00, count: 5, 
            pattern: 'irregularTurns', schoolSize: [3, 8], form: 'dolphinfish',
            category: 'mediumLarge',
            boidsStrength: 1.0  // Loose schooling
        },
        // 8. Grouper - Wide thick body, bottom dweller
        // ECOLOGY: Strictly solitary and territorial, ambush from reef holes
        // SWIMMING: Slow bottom patrol + sudden short bursts
        grouper: { 
            hp: 250, speedMin: 19, speedMax: 56, reward: 200, size: 60, 
            color: 0x886644, secondaryColor: 0x553322, count: 3, 
            pattern: 'bottomBurst', schoolSize: [1, 1], form: 'grouper',
            category: 'mediumLarge',
            boidsStrength: 0  // Strictly solitary and territorial
        },
        
        // ==================== MEDIUM COLORFUL REEF FISH (4 species) ====================
        // Coral reef dwellers, good targets for 1x/3x weapons
        // 9. Parrotfish - Parrot-like beak for scraping coral
        // ECOLOGY: Small harems of 3-8, stop-and-go grazing behavior
        // SWIMMING: Stop to graze, swim to next spot, repeat
        parrotfish: { 
            hp: 120, speedMin: 38, speedMax: 69, reward: 140, size: 35, 
            color: 0x44ddaa, secondaryColor: 0xff66aa, count: 6, 
            pattern: 'stopAndGo', schoolSize: [3, 6], form: 'parrotfish',
            category: 'reefFish',
            boidsStrength: 1.2  // Loose harem grouping
        },
        // 10. Angelfish - Flat disc body, elegant swimmers
        // ECOLOGY: Monogamous pairs or small groups of 3-5, graceful gliding
        // SWIMMING: Slow, elegant, vertical undulation
        angelfish: { 
            hp: 90, speedMin: 31, speedMax: 63, reward: 110, size: 30, 
            color: 0xffdd44, secondaryColor: 0x4488ff, count: 8, 
            pattern: 'elegantGlide', schoolSize: [2, 4], form: 'angelfish',
            category: 'reefFish',
            boidsStrength: 0.8  // Paired/small group
        },
        // 11. Lionfish - Venomous spines, striking appearance
        // ECOLOGY: Solitary ambush predators, slow deliberate movements
        // SWIMMING: Slow, deliberate, hovering near reef structures
        lionfish: { 
            hp: 80, speedMin: 25, speedMax: 56, reward: 100, size: 28, 
            color: 0xcc3333, secondaryColor: 0xffffff, count: 8, 
            pattern: 'ambush', schoolSize: [1, 2], form: 'lionfish',
            category: 'reefFish',
            boidsStrength: 0.2  // Mostly solitary
        },
        // 12. Blue Tang - Oval flat body, schooling herbivore
        // ECOLOGY: Schools of 5-20 for grazing, coordinated movements
        // SWIMMING: Coordinated group movement, gentle up-down motion
        blueTang: { 
            hp: 60, speedMin: 40, speedMax: 70, reward: 80, size: 20, 
            color: 0x2288ff, secondaryColor: 0xffff00, count: 12, 
            pattern: 'groupCoordination', schoolSize: [5, 12], form: 'tang',
            category: 'reefFish',
            boidsStrength: 2.0  // Strong schooling for grazing
        },
        
        // ==================== SMALL SCHOOLING FISH (4 species) ====================
        // Baitfish - abundant, fast, perfect for 1x weapon spray
        // 13. Sardine - Small streamlined silver, huge schools
        // ECOLOGY: Massive schools of 100-1000+, wave-like synchronized movement
        // SWIMMING: Tight synchronized waves, rapid direction changes
        sardine: { 
            hp: 20, speedMin: 45, speedMax: 70, reward: 30, size: 10,
            color: 0xccddee, secondaryColor: 0x88aacc, count: 15, 
            pattern: 'waveFormation', schoolSize: [20, 40], form: 'sardine',
            category: 'smallSchool',
            boidsStrength: 3.0  // Extremely tight schooling
        },
        // 14. Anchovy - Thin silver semi-transparent, bait balls
        // ECOLOGY: Massive schools, form defensive bait balls when threatened
        // SWIMMING: Swirling bait ball formation, very tight grouping
        anchovy: { 
            hp: 15, speedMin: 50, speedMax: 85, reward: 25, size: 8,
            color: 0xaabbcc, secondaryColor: 0x778899, count: 15, 
            pattern: 'baitBall', schoolSize: [25, 45], form: 'anchovy',
            category: 'smallSchool',
            boidsStrength: 3.5  // Tightest schooling (bait ball)
        },
        // 15. Clownfish - Orange-white stripes, anemone dwellers
        // ECOLOGY: Family groups of 2-4 around single anemone, territorial
        // SWIMMING: Short darting movements within territory
        clownfish: { 
            hp: 50, speedMin: 20, speedMax: 40, reward: 70, size: 15, 
            color: 0xff6600, secondaryColor: 0xffffff, count: 6, 
            pattern: 'territorial', schoolSize: [2, 3], form: 'clownfish',
            category: 'smallSchool',
            boidsStrength: 1.0  // Family group stays together
        },
        // 16. Damselfish - Small oval, aggressive territory defenders
        // ECOLOGY: Territorial, loose groups of 3-8 near reef patches
        // SWIMMING: Quick defensive charges, aggressive darting
        damselfish: { 
            hp: 40, speedMin: 35, speedMax: 60, reward: 55, size: 12,
            color: 0x6644ff, secondaryColor: 0xffdd00, count: 12, 
            pattern: 'defensiveCharge', schoolSize: [3, 6], form: 'damselfish',
            category: 'smallSchool',
            boidsStrength: 0.8  // Loose territorial grouping
        },
        
        // ==================== SPECIAL FORM FISH (3 species) ====================
        // Unique body shapes and swimming styles
        // 17. Manta Ray - Flat wing-shaped, graceful gliders
        // ECOLOGY: Solitary or small groups of 2-3, slow wing-like flapping
        // SWIMMING: Slow, majestic wing flapping, gentle banking turns
        mantaRay: { 
            hp: 350, speedMin: 50, speedMax: 88, reward: 280, size: 90, 
            color: 0x222233, secondaryColor: 0xeeeeee, count: 2, 
            pattern: 'wingGlide', schoolSize: [1, 2], form: 'mantaRay',
            category: 'specialForm',
            boidsStrength: 0.3  // Mostly solitary, occasional pairs
        },
        // 18. Pufferfish - Round inflatable body, slow swimmers
        // ECOLOGY: Strictly solitary, slow deliberate movements
        // SWIMMING: Very slow, gentle rotation, fin-propelled
        pufferfish: { 
            hp: 100, speedMin: 13, speedMax: 38, reward: 120, size: 25, 
            color: 0xddcc88, secondaryColor: 0x886644, count: 4, 
            pattern: 'slowRotation', schoolSize: [1, 1], form: 'pufferfish',
            category: 'specialForm',
            boidsStrength: 0  // Strictly solitary
        },
        // 19. Seahorse - Vertical posture, curled tail
        // ECOLOGY: Monogamous pairs, vertical drifting, very slow
        // SWIMMING: Vertical posture, dorsal fin vibration, drift with current
        seahorse: { 
            hp: 80, speedMin: 10, speedMax: 25, reward: 130, size: 20, 
            color: 0xffaa44, secondaryColor: 0xcc8833, count: 4, 
            pattern: 'verticalDrift', schoolSize: [1, 2], form: 'seahorse',
            category: 'specialForm',
            boidsStrength: 1.2  // Monogamous pair bonding
        },
        
        // ==================== SPECIAL ABILITY FISH (Phase 2 - Reserved for future GLB models) ====================
        // NOTE: Ability fish (bombCrab, electricEel, shieldTurtle, goldFish) removed until GLB models are available
        // These can be re-added when corresponding GLB models are uploaded to R2
    },
    
    // Weapons - auto-generated from WEAPON_CONFIG (single source of truth)
    weapons: _buildLegacyWeaponsConfig(),
    
    // RTP settings - Updated weapon configuration
    // 1x: 91%, 3x: 93%, 5x: 94%, 8x: 95%
    rtp: {
        entertainment: { '1x': 0.91, '3x': 0.93, '5x': 0.94, '8x': 0.95 },
        real: { '1x': 0.91, '3x': 0.93, '5x': 0.94, '8x': 0.95 }
    },
    
    // Game settings - Issue #10: Adjusted fish count for 1.5x tank
    game: {
        initialBalance: 1000,
        maxFish: 200,  // Increased to 180-200 for impressive visual density
        targetFPS: 60,
        mode: 'entertainment'
    },
    
    // Boids settings - adjusted for 1.5x tank
    boids: {
        separationDistance: 80,
        cohesionDistance: 180,
        separationWeight: 2.5,
        cohesionWeight: 0.8
    },
    dodge: {
        detectSizeFactor: 0.85,
        speedBoostFactor: 1.3,
        lateralStrength: 40,
        decayRate: 2.5,
        rampUpRate: 6.0
    },
    terrainAvoidance: {
        minObstacleRadius: 15,
        avoidMargin: 40,
        avoidStrength: 120,
        lookAheadTime: 1.2,
        predictiveStrength: 60
    },
    hardSeparation: {
        radiusFactor: 1.4,
        largeFishRadiusFactor: 1.8,
        largeFishSizeThreshold: 50,
        pushStrength: 160,
        largeFishPushStrength: 280,
        maxPushAccel: 400,
        predictTime: 0.8,
        ellipsoidMargin: 1.3,
        yawSteerStrength: 2.0
    },
    terrainHardStop: {
        enabled: true,
        penetrationThreshold: 0.85,
        emergencyYawRange: Math.PI * 0.6,
        rollbackDamping: 0.3
    }
};

// ==================== BALANCE SCALE (Fixed-Point Integer Math) ====================
// All balance arithmetic uses integer millicredits to avoid IEEE 754 float drift.
// BALANCE_SCALE matches RTP_MONEY_SCALE (1000) so RTP rewardFp can be added directly.
// Only divide by BALANCE_SCALE when rendering to innerHTML.
const BALANCE_SCALE = 1000;

// ==================== GAME STATE ====================
const gameState = {
    balance: CONFIG.game.initialBalance * BALANCE_SCALE,
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
    viewMode: 'fps',
    // Camera rotation state - horizontal (yaw) and vertical (pitch)
    cameraYaw: 0,
    cameraPitch: 0,
    targetCameraYaw: 0,
    targetCameraPitch: 0,
    maxCameraYaw: Math.PI / 6,    // ±30° horizontal (10 o'clock to 2 o'clock)
    maxCameraPitch: Math.PI / 9,  // ±20° vertical (up/down)
    // FPS mode camera state
    // Initial pitch set to 35 degrees upward (0.611 radians) for optimal fish viewing
    fpsYaw: 0,
    fpsPitch: 35 * (Math.PI / 180),  // 35 degrees upward
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
    bossSpawnTimer: 45,  // Boss spawns every 45 seconds exactly
    activeBoss: null,  // Currently active boss fish
    bossCountdown: 0,  // Countdown timer for boss event
    bossActive: false,  // Whether a boss event is currently active
    isInGameScene: false,  // Whether player is in active game (not lobby/menu)
    // Combo System (Issue #4 - Weapon System Improvements)
    comboCount: 0,           // Current consecutive kills
    comboTimer: 0,           // Time remaining to continue combo
    comboTimeWindow: 3.0,    // Seconds to get next kill to continue combo
    lastComboBonus: 0,       // Last applied combo bonus percentage
    fpsCannonSide: 'right',  // FPS weapon hand side (fixed right)
    isScoping: false,        // Right-click scope zoom active
    scopeTargetFov: 60,      // Target FOV for scope zoom (60=normal FPS, 30=zoomed)
    weaponSelected: false    // Plan B: true after player picks initial weapon
};

// ==================== BALANCE AUDIT GUARD (T1 Regression) ====================
// INVARIANT: In multiplayer mode, gameState.balance may ONLY be set by:
//   1. onBalanceUpdate (server SSOT): gameState.balance = Math.round(data.balance * BALANCE_SCALE)
// INVARIANT: In single-player mode, gameState.balance may ONLY be modified by:
//   1. fireBullet (cost deduction): gameState.balance -= weapon.cost * BALANCE_SCALE
//   2. autoFireAtFish (cost deduction): gameState.balance -= weapon.cost * BALANCE_SCALE
//   3. Fish.die() (payout): gameState.balance += rewardFp (integer, from RTP engine)
// FORBIDDEN: coin-fly animations must NEVER modify balance (LEAK-1 fix)
// FORBIDDEN: spawnCoinFlyToScore must NEVER add reward to balance
//
// To verify: run `node scripts/balance-invariant-check.js` (grep-based static check)

const _balanceAudit = {
    lastServerBalance: null,
    serverUpdateCount: 0,
    enabled: false,
    log: [],
    start(initialBalance) {
        this.lastServerBalance = initialBalance;
        this.serverUpdateCount = 0;
        this.enabled = true;
        this.log = [];
    },
    onServerUpdate(serverBalance) {
        if (!this.enabled) return;
        this.serverUpdateCount++;
        const clientBal = gameState.balance / BALANCE_SCALE;
        const drift = clientBal - serverBalance;
        this.lastServerBalance = serverBalance;
        if (Math.abs(drift) > 0.01) {
            const entry = {
                t: Date.now(),
                server: serverBalance,
                client: clientBal,
                drift: drift,
                updateNum: this.serverUpdateCount
            };
            this.log.push(entry);
            console.warn('[BALANCE-AUDIT] drift detected:', entry);
        }
    },
    getReport() {
        return {
            serverUpdates: this.serverUpdateCount,
            driftEvents: this.log.length,
            maxDrift: this.log.reduce((m, e) => Math.max(m, Math.abs(e.drift)), 0),
            log: this.log.slice(-50)
        };
    }
};
window._balanceAudit = _balanceAudit;

// ==================== GLB FISH MODEL LOADER (PDF Spec Compliant) ====================
const glbLoaderState = {
    manifest: null,
    manifestLoaded: false,
    modelCache: new Map(),
    loadingPromises: new Map(),
    enabled: true,
    manifestUrl: '/assets/fish/fish_models.json',
    // FIX: Use same pattern as weapons - baseUrl + encodeURI(filename) at runtime
    baseUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/',
    // FIX: Track which models have skinned meshes for proper cloning
    skinnedModelUrls: new Set(),
    // FIX: Form-to-variant lookup map for O(1) lookup by fish form name
    // This ensures each fish form gets its correct GLB model regardless of tier
    formToVariant: new Map(),
    // Animation cache: stores gltf.animations arrays keyed by URL
    // Separate from modelCache because animations are not cloned, they're shared
    animationCache: new Map()
};

// DEBUG: GLB swap statistics for diagnosing rendering issues
const glbSwapStats = {
    totalSpawned: 0,           // Total fish spawned
    tryLoadCalled: 0,          // Times tryLoadGLBModel was called
    manifestNotReady: 0,       // Blocked because manifest not loaded
    tokenMismatch: 0,          // Blocked because loadToken changed (fish recycled)
    fishInactive: 0,           // Blocked because fish became inactive
    groupMissing: 0,           // Blocked because group or parent missing
    glbModelNull: 0,           // GLB model returned null (no model for this form)
    glbModelNullByForm: {},    // Track which forms returned null (for diagnosing missing models)
    swapSuccess: 0,            // Successfully swapped to GLB
    swapSuccessByForm: {},     // Track which forms successfully swapped
    skeletonUtilsAvailable: null,  // Track if SkeletonUtils is available
    // NEW: Track eligible vs ineligible attempts for clearer metrics
    eligibleAttempts: 0,       // Fish forms that have a GLB model configured
    noVariantFound: 0,         // Fish forms with no GLB model in manifest
    loadFailed: 0              // GLB load attempted but failed (network/parse error)
};

// DEBUG: Create on-screen debug display for GLB swap stats
function createGlbDebugDisplay() {
    let debugDiv = document.getElementById('glb-debug-display');
    if (!debugDiv) {
        debugDiv = document.createElement('div');
        debugDiv.id = 'glb-debug-display';
        debugDiv.style.cssText = `
            position: relative;
            z-index: 1;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: monospace;
            font-size: 9px;
            line-height: 1.15;
            padding: 6px;
            border-radius: 4px;
            max-width: 200px;
            max-height: 30vh;
            overflow-y: auto;
            pointer-events: none;
        `;
        var wrapper = document.getElementById('debug-middle-right');
        (wrapper || document.body).appendChild(debugDiv);
    }
    return debugDiv;
}

// DEBUG: Update the on-screen debug display
function updateGlbDebugDisplay() {
    const debugDiv = createGlbDebugDisplay();
    
    // NEW: Calculate clearer metrics
    // Coverage: % of fish forms that have a GLB model configured (6/20 = 30%)
    const glbFormsAvailable = glbLoaderState.formToVariant ? glbLoaderState.formToVariant.size : 0;
    const totalFishForms = 21; // CONFIG.fishTiers has 21 species (20 base + killerWhale)
    const coveragePercent = ((glbFormsAvailable / totalFishForms) * 100).toFixed(0);
    
    // Eligible success rate: % of eligible attempts that succeeded
    const eligibleSuccessRate = glbSwapStats.eligibleAttempts > 0 
        ? ((glbSwapStats.swapSuccess / glbSwapStats.eligibleAttempts) * 100).toFixed(1) 
        : '0.0';
    
    // Overall rate (for comparison with old metric)
    const overallRate = glbSwapStats.tryLoadCalled > 0 
        ? ((glbSwapStats.swapSuccess / glbSwapStats.tryLoadCalled) * 100).toFixed(1) 
        : '0.0';
    
    // Check SkeletonUtils availability
    const skeletonUtilsOk = typeof THREE !== 'undefined' && typeof THREE.SkeletonUtils !== 'undefined';
    const skeletonStatus = skeletonUtilsOk 
        ? '<span style="color: #00ff00;">OK</span>' 
        : '<span style="color: #ff0000;">MISSING!</span>';
    
    const formStats = Object.entries(glbSwapStats.swapSuccessByForm)
        .map(([form, count]) => `  ${form}: ${count}`)
        .join('\n');
    
    const nullFormStats = Object.entries(glbSwapStats.glbModelNullByForm || {})
        .map(([form, count]) => `  ${form}: ${count}`)
        .join('\n');
    
    // PERFORMANCE: Add real-time fish count stats to help diagnose population issues
    const currentActive = typeof activeFish !== 'undefined' ? activeFish.length : 0;
    const currentFree = typeof freeFish !== 'undefined' ? freeFish.length : 0;
    const poolSize = typeof fishPool !== 'undefined' ? fishPool.length : 0;
    const maxCount = typeof FISH_SPAWN_CONFIG !== 'undefined' ? FISH_SPAWN_CONFIG.maxCount : '?';
    
    debugDiv.innerHTML = `
        <div style="color: #ffff00; font-weight: bold;">GLB Debug Stats</div>
        <div>SkeletonUtils: ${skeletonStatus}</div>
        <div style="color: #00ffff; font-weight: bold;">--- Fish Population ---</div>
        <div style="color: #00ff00;">Active: ${currentActive} / ${maxCount} max</div>
        <div>Free pool: ${currentFree}</div>
        <div>Total pool: ${poolSize}</div>
        <div style="color: #00ffff; font-weight: bold;">--- GLB Coverage ---</div>
        <div style="color: #ffff00;">GLB models: ${glbFormsAvailable}/${totalFishForms} forms (${coveragePercent}%)</div>
        <div style="color: #00ff00;">Eligible success: ${glbSwapStats.swapSuccess}/${glbSwapStats.eligibleAttempts} (${eligibleSuccessRate}%)</div>
        <div>No GLB available: ${glbSwapStats.noVariantFound}</div>
        <div>Load failed: ${glbSwapStats.loadFailed}</div>
        <div style="color: #888888;">Overall: ${glbSwapStats.swapSuccess}/${glbSwapStats.tryLoadCalled} (${overallRate}%)</div>
        <div style="color: #ff6666;">Other blocks:</div>
        <div>  manifest: ${glbSwapStats.manifestNotReady}</div>
        <div>  token: ${glbSwapStats.tokenMismatch}</div>
        <div>  inactive: ${glbSwapStats.fishInactive}</div>
        <div style="color: #66ff66;">Success by form:</div>
        <pre style="margin: 0; font-size: 10px;">${formStats || '  (none yet)'}</pre>
    `;
}

// DEBUG: Reset stats (call when starting new game)
// PERFORMANCE: Create on-screen performance display (for users who can't open DevTools)
function createPerfDisplay() {
    let perfDiv = document.getElementById('perf-display');
    if (!perfDiv) {
        perfDiv = document.createElement('div');
        perfDiv.id = 'perf-display';
        perfDiv.style.cssText = `
            position: relative;
            z-index: 2;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            font-family: monospace;
            font-size: 9px;
            line-height: 1.15;
            padding: 6px;
            border-radius: 4px;
            min-width: 170px;
            max-height: 28vh;
            overflow-y: auto;
            pointer-events: none;
            border: 1px solid #00ff00;
        `;
        var wrapper = document.getElementById('debug-middle-right');
        (wrapper || document.body).appendChild(perfDiv);
    }
    return perfDiv;
}

// PERFORMANCE: Update the on-screen performance display
let perfDisplayData = {
    fps: 0,
    fpsHistory: [],
    lastUpdate: 0,
    // Cached triangle counts by category (updated every 500ms)
    trianglesByCategory: {
        scene: 0,      // Map + Panorama + UI + Other
        fish: 0,       // All fish meshes
        cannon: 0      // Cannon + Bullets + Hit effects
    }
};

// Helper function to get triangle count from geometry
function getTriangleCountFromGeometry(geometry) {
    if (!geometry) return 0;
    if (geometry.index) {
        return geometry.index.count / 3;
    } else if (geometry.attributes && geometry.attributes.position) {
        return geometry.attributes.position.count / 3;
    }
    return 0;
}

// Calculate triangles by category with detailed subcategories
function calculateTrianglesByCategory() {
    const result = { 
        scene: 0, 
        fish: 0, 
        cannon: 0,
        // Detailed subcategories
        sceneDetail: { map: 0, panorama: 0, particles: 0, ui: 0, other: 0 },
        cannonDetail: { playerTurret: 0, nonPlayerTurret: 0, bullets: 0, hitEffects: 0 },
        // Fish statistics
        fishStats: {
            count: 0,
            perFishTriangles: [],  // Array of {form, triangles} for each fish
            byForm: {},            // Triangles by fish form
            highest: { form: '', triangles: 0 },
            lowest: { form: '', triangles: Infinity },
            avg: 0,
            median: 0
        }
    };
    if (!scene) return result;
    
    // Track triangles per fish instance (by parent group)
    const fishTrianglesByGroup = new Map();
    
    scene.traverse((obj) => {
        if (!obj.isMesh || !obj.visible) return;
        
        const triangles = getTriangleCountFromGeometry(obj.geometry);
        if (triangles === 0) return;
        
        const name = (obj.name || '').toLowerCase();
        
        // Check parent hierarchy for categorization and userData
        let parent = obj.parent;
        let parentNames = [];
        let parentIsFish = false;
        let fishForm = obj.userData?.fishForm || '';
        let fishGroup = null;
        
        while (parent) {
            if (parent.name) parentNames.push(parent.name.toLowerCase());
            // Check if any parent has isFish userData
            if (parent.userData?.isFish) {
                parentIsFish = true;
                if (!fishForm && parent.userData?.fishForm) {
                    fishForm = parent.userData.fishForm;
                }
            }
            // Find the fish group (top-level group for this fish)
            if (parent.userData?.fishForm && !fishGroup) {
                fishGroup = parent;
                fishForm = parent.userData.fishForm;
            }
            parent = parent.parent;
        }
        const allNames = [name, ...parentNames].join(' ');
        
        // Categorize: Fish - check both direct userData and parent hierarchy
        const isFish = allNames.includes('fish') || allNames.includes('glbmodel') || 
            obj.userData?.isFish || obj.userData?.fishId !== undefined || parentIsFish;
        
        if (isFish) {
            result.fish += triangles;
            
            // Track per-fish triangles using the fish group as key
            if (fishGroup) {
                if (!fishTrianglesByGroup.has(fishGroup)) {
                    fishTrianglesByGroup.set(fishGroup, { form: fishForm, triangles: 0 });
                }
                fishTrianglesByGroup.get(fishGroup).triangles += triangles;
            }
            
            // Track by form
            if (fishForm) {
                if (!result.fishStats.byForm[fishForm]) {
                    result.fishStats.byForm[fishForm] = { triangles: 0, count: 0 };
                }
                result.fishStats.byForm[fishForm].triangles += triangles;
            }
        }
        // Categorize: Cannon (including bullets and hit effects) with subcategories
        else if (allNames.includes('cannon') || allNames.includes('weapon') || 
                 allNames.includes('bullet') || allNames.includes('muzzle') ||
                 allNames.includes('hiteffect') || allNames.includes('projectile') ||
                 obj.userData?.isBullet || obj.userData?.isWeapon || obj.userData?.isHitEffect) {
            result.cannon += triangles;
            
            // Subcategorize cannon
            if (allNames.includes('bullet') || allNames.includes('projectile') || obj.userData?.isBullet) {
                result.cannonDetail.bullets += triangles;
            } else if (allNames.includes('hiteffect') || allNames.includes('hit_effect') || 
                       allNames.includes('splash') || obj.userData?.isHitEffect) {
                result.cannonDetail.hitEffects += triangles;
            } else {
                // Turret (cannon/weapon body) - distinguish player vs non-player
                // Non-player turrets have "nonplayer" or "非玩家" in their name/parent names
                if (allNames.includes('nonplayer') || allNames.includes('非玩家')) {
                    result.cannonDetail.nonPlayerTurret += triangles;
                } else {
                    result.cannonDetail.playerTurret += triangles;
                }
            }
        }
        // Categorize: Scene (map, panorama, particles, UI, other) with subcategories
        else {
            result.scene += triangles;
            
            // Subcategorize scene
            // Check userData.isMap first (set when map GLB is loaded), then fall back to name matching
            if (obj.userData?.isMap || allNames.includes('map') || allNames.includes('coral') || allNames.includes('rock') || 
                allNames.includes('sand') || allNames.includes('terrain') || allNames.includes('decoration') ||
                allNames.includes('plant') || allNames.includes('seaweed') || allNames.includes('shell') ||
                allNames.includes('chest') || allNames.includes('anchor') || allNames.includes('barrel') ||
                allNames.includes('floor') || allNames.includes('wall')) {
                result.sceneDetail.map += triangles;
            } else if (allNames.includes('sky') || allNames.includes('panorama') || allNames.includes('background') ||
                       (allNames.includes('sphere') && obj.geometry && obj.geometry.parameters && 
                        obj.geometry.parameters.radius > 1000)) {
                result.sceneDetail.panorama += triangles;
            } else if (allNames.includes('particle') || allNames.includes('bubble') || 
                       allNames.includes('dust') || allNames.includes('sparkle')) {
                result.sceneDetail.particles += triangles;
            } else if (allNames.includes('ui') || allNames.includes('crosshair') || allNames.includes('hud') ||
                       allNames.includes('cursor') || allNames.includes('reticle')) {
                result.sceneDetail.ui += triangles;
            } else {
                result.sceneDetail.other += triangles;
            }
        }
    });
    
    // Calculate fish statistics from collected data
    if (fishTrianglesByGroup.size > 0) {
        const fishData = Array.from(fishTrianglesByGroup.values());
        result.fishStats.count = fishData.length;
        result.fishStats.perFishTriangles = fishData;
        
        // Calculate per-form counts
        fishData.forEach(fd => {
            if (fd.form && result.fishStats.byForm[fd.form]) {
                result.fishStats.byForm[fd.form].count++;
            }
        });
        
        // Sort by triangles to find highest/lowest
        const sortedByTriangles = [...fishData].sort((a, b) => b.triangles - a.triangles);
        
        if (sortedByTriangles.length > 0) {
            result.fishStats.highest = sortedByTriangles[0];
            result.fishStats.lowest = sortedByTriangles[sortedByTriangles.length - 1];
            
            // Calculate average
            const totalTriangles = fishData.reduce((sum, fd) => sum + fd.triangles, 0);
            result.fishStats.avg = Math.round(totalTriangles / fishData.length);
            
            // Calculate median
            const midIndex = Math.floor(sortedByTriangles.length / 2);
            if (sortedByTriangles.length % 2 === 0) {
                result.fishStats.median = Math.round((sortedByTriangles[midIndex - 1].triangles + sortedByTriangles[midIndex].triangles) / 2);
            } else {
                result.fishStats.median = sortedByTriangles[midIndex].triangles;
            }
        }
    }
    
    return result;
}

function updatePerfDisplay() {
    const perfDiv = createPerfDisplay();
    const now = performance.now();
    
    // Update FPS history for averaging
    const currentFps = deltaTime > 0 ? Math.round(1 / deltaTime) : 0;
    perfDisplayData.fpsHistory.push(currentFps);
    if (perfDisplayData.fpsHistory.length > 30) {
        perfDisplayData.fpsHistory.shift();
    }
    const avgFps = Math.round(perfDisplayData.fpsHistory.reduce((a, b) => a + b, 0) / perfDisplayData.fpsHistory.length);
    
    // Only update display every 500ms to avoid performance impact
    if (now - perfDisplayData.lastUpdate < 500) return;
    perfDisplayData.lastUpdate = now;
    
    // Get renderer info
    const drawCalls = renderer ? renderer.info.render.calls : 0;
    const triangles = renderer ? renderer.info.render.triangles : 0;
    const textures = renderer ? renderer.info.memory.textures : 0;
    const geometries = renderer ? renderer.info.memory.geometries : 0;
    
    // Calculate triangles by category (Scene/Fish/Cannon)
    const triByCategory = calculateTrianglesByCategory();
    perfDisplayData.trianglesByCategory = triByCategory;
    
    // Count fish with animations (check for glbAction which is the actual animation action)
    let fishWithAnimations = 0;
    let fishWithMixers = 0;
    for (const fish of activeFish) {
        // FIX: Check fish.glbMixer (not fish.mixer) - this was causing GLB Mixers to always show 0
        if (fish && fish.glbMixer) {
            fishWithMixers++;
            // Check for glbAction (the actual swimming animation) instead of private _actions
            if (fish.glbAction) {
                fishWithAnimations++;
            }
        }
    }
    
    // Get max fish count from FISH_SPAWN_CONFIG (the actual runtime limit)
    const maxFishCount = typeof FISH_SPAWN_CONFIG !== 'undefined' ? FISH_SPAWN_CONFIG.maxCount : '?';
    
    // Color code FPS
    let fpsColor = '#00ff00'; // Green for good
    if (avgFps < 30) fpsColor = '#ffff00'; // Yellow for warning
    if (avgFps < 20) fpsColor = '#ff0000'; // Red for bad
    
    // Color code draw calls (high = bad)
    let drawCallColor = '#00ff00';
    if (drawCalls > 500) drawCallColor = '#ffff00';
    if (drawCalls > 1000) drawCallColor = '#ff0000';
    
    // Color code triangles (high = bad)
    let triColor = '#00ff00';
    if (triangles > 1000000) triColor = '#ffff00';
    if (triangles > 3000000) triColor = '#ff0000';
    
    // Get subcategory details
    const sceneDetail = triByCategory.sceneDetail || { map: 0, panorama: 0, particles: 0, ui: 0, other: 0 };
    const cannonDetail = triByCategory.cannonDetail || { playerTurret: 0, nonPlayerTurret: 0, bullets: 0, hitEffects: 0 };
    const fishStats = triByCategory.fishStats || { count: 0, avg: 0, median: 0, highest: { form: '', triangles: 0 }, lowest: { form: '', triangles: 0 } };
    
    // Format fish stats for display
    const fishStatsHtml = fishStats.count > 0 ? `
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Count: ${fishStats.count} fish</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Avg/fish: ${fishStats.avg.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Median: ${fishStats.median.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Highest: ${fishStats.highest.triangles.toLocaleString()} (${fishStats.highest.form || '?'})</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Lowest: ${fishStats.lowest.triangles.toLocaleString()} (${fishStats.lowest.form || '?'})</div>
    ` : '';
    
    // Calculate scene total (all triangles in scene graph)
    const sceneTotal = triByCategory.scene + triByCategory.fish + triByCategory.cannon;
    
    perfDiv.innerHTML = `
        <div style="color: #00ffff; font-weight: bold; border-bottom: 1px solid #00ffff; padding-bottom: 4px; margin-bottom: 4px;">Performance Monitor</div>
        <div style="color: ${fpsColor}; font-size: 16px; font-weight: bold;">FPS: ${avgFps}</div>
        <div style="margin-top: 6px; color: #888;">--- GPU ---</div>
        <div style="color: ${drawCallColor};">Draw Calls: ${drawCalls}</div>
        <div style="color: ${triColor};">Rendered Tri: ${triangles.toLocaleString()}</div>
        <div style="margin-left: 10px; color: #777; font-size: 10px;">Scene Total: ${sceneTotal.toLocaleString()}</div>
        <div style="margin-left: 10px; color: #aaa; font-size: 11px;">Scene: ${triByCategory.scene.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Map: ${sceneDetail.map.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Panorama: ${sceneDetail.panorama.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Particles: ${sceneDetail.particles.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">UI: ${sceneDetail.ui.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Other: ${sceneDetail.other.toLocaleString()}</div>
        <div style="margin-left: 10px; color: #aaa; font-size: 11px;">Fish: ${triByCategory.fish.toLocaleString()}</div>
        ${fishStatsHtml}
        <div style="margin-left: 10px; color: #aaa; font-size: 11px;">Cannon: ${triByCategory.cannon.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Player Turret: ${cannonDetail.playerTurret.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Non-Player Turret: ${cannonDetail.nonPlayerTurret.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">Bullets: ${cannonDetail.bullets.toLocaleString()}</div>
        <div style="margin-left: 20px; color: #777; font-size: 10px;">HitEffects: ${cannonDetail.hitEffects.toLocaleString()}</div>
        <div>Textures: ${textures}</div>
        <div>Geometries: ${geometries}</div>
        <div style="margin-top: 6px; color: #888;">--- CPU ---</div>
        <div>Fish: ${activeFish.length} / ${maxFishCount}</div>
        <div>GLB Mixers: ${fishWithMixers}</div>
        <div>Animated: ${fishWithAnimations}</div>
        <div>Bullets: ${activeBullets.length}</div>
        <div>Particles: ${activeParticles.length}</div>
    `;
}

function analyzeSceneTriangles() {
    if (!scene) {
        console.log('[TRI-ANALYSIS] Scene not available');
        return;
    }
    
    const stats = {
        total: 0,
        byCategory: {
            map: { triangles: 0, meshes: 0, objects: [] },
            fish: { triangles: 0, meshes: 0, byForm: {} },
            weapon: { triangles: 0, meshes: 0, objects: [] },
            panorama: { triangles: 0, meshes: 0, objects: [] },
            ui: { triangles: 0, meshes: 0, objects: [] },
            other: { triangles: 0, meshes: 0, objects: [] }
        },
        topContributors: [],
        geometryReuse: new Map()
    };
    
    function getTriangleCount(geometry) {
        if (!geometry) return 0;
        if (geometry.index) {
            return geometry.index.count / 3;
        } else if (geometry.attributes && geometry.attributes.position) {
            return geometry.attributes.position.count / 3;
        }
        return 0;
    }
    
    function categorizeObject(obj) {
        const name = (obj.name || '').toLowerCase();
        const parentNames = [];
        let parent = obj.parent;
        while (parent) {
            if (parent.name) parentNames.push(parent.name.toLowerCase());
            parent = parent.parent;
        }
        const allNames = [name, ...parentNames].join(' ');
        
        if (allNames.includes('fish') || allNames.includes('sardine') || allNames.includes('shark') || 
            allNames.includes('whale') || allNames.includes('tuna') || allNames.includes('manta') ||
            allNames.includes('puffer') || allNames.includes('grouper') || allNames.includes('clown') ||
            allNames.includes('angel') || allNames.includes('tang') || allNames.includes('lion') ||
            allNames.includes('parrot') || allNames.includes('puffer') || allNames.includes('seahorse') ||
            allNames.includes('anchovy') || allNames.includes('damsel') || allNames.includes('marlin') ||
            allNames.includes('dolphin') || allNames.includes('flying') || allNames.includes('hammerhead') ||
            allNames.includes('killer')) {
            return 'fish';
        }
        if (allNames.includes('map') || allNames.includes('coral') || allNames.includes('rock') || 
            allNames.includes('sand') || allNames.includes('terrain') || allNames.includes('decoration') ||
            allNames.includes('plant') || allNames.includes('seaweed') || allNames.includes('shell') ||
            allNames.includes('chest') || allNames.includes('anchor') || allNames.includes('barrel')) {
            return 'map';
        }
        if (allNames.includes('cannon') || allNames.includes('weapon') || allNames.includes('gun') ||
            allNames.includes('bullet') || allNames.includes('muzzle')) {
            return 'weapon';
        }
        if (allNames.includes('sky') || allNames.includes('panorama') || allNames.includes('background') ||
            allNames.includes('sphere') && obj.geometry && obj.geometry.parameters && obj.geometry.parameters.radius > 1000) {
            return 'panorama';
        }
        if (allNames.includes('ui') || allNames.includes('crosshair') || allNames.includes('hud')) {
            return 'ui';
        }
        return 'other';
    }
    
    scene.traverse((obj) => {
        if (obj.isMesh || obj.isSkinnedMesh) {
            const triangles = getTriangleCount(obj.geometry);
            const category = categorizeObject(obj);
            
            stats.total += triangles;
            stats.byCategory[category].triangles += triangles;
            stats.byCategory[category].meshes++;
            
            if (category === 'fish') {
                let fishForm = 'unknown';
                let parent = obj.parent;
                while (parent) {
                    if (parent.userData && parent.userData.fishForm) {
                        fishForm = parent.userData.fishForm;
                        break;
                    }
                    if (parent.name && parent.name.includes('fish_')) {
                        fishForm = parent.name.split('_')[1] || 'unknown';
                        break;
                    }
                    parent = parent.parent;
                }
                if (!stats.byCategory.fish.byForm[fishForm]) {
                    stats.byCategory.fish.byForm[fishForm] = { triangles: 0, count: 0 };
                }
                stats.byCategory.fish.byForm[fishForm].triangles += triangles;
                stats.byCategory.fish.byForm[fishForm].count++;
            }
            
            const geoId = obj.geometry ? obj.geometry.uuid : 'none';
            if (!stats.geometryReuse.has(geoId)) {
                stats.geometryReuse.set(geoId, { triangles, uses: 0, category });
            }
            stats.geometryReuse.get(geoId).uses++;
            
            if (triangles > 10000) {
                stats.topContributors.push({
                    name: obj.name || 'unnamed',
                    type: obj.isSkinnedMesh ? 'SkinnedMesh' : 'Mesh',
                    triangles,
                    category,
                    visible: obj.visible,
                    frustumCulled: obj.frustumCulled,
                    geoId: geoId.substring(0, 8)
                });
            }
            
            if (category !== 'fish' && triangles > 0) {
                stats.byCategory[category].objects.push({
                    name: obj.name || 'unnamed',
                    triangles,
                    visible: obj.visible
                });
            }
        }
    });
    
    stats.topContributors.sort((a, b) => b.triangles - a.triangles);
    stats.topContributors = stats.topContributors.slice(0, 20);
    
    for (const cat of Object.keys(stats.byCategory)) {
        if (stats.byCategory[cat].objects) {
            stats.byCategory[cat].objects.sort((a, b) => b.triangles - a.triangles);
            stats.byCategory[cat].objects = stats.byCategory[cat].objects.slice(0, 10);
        }
    }
    
    console.log('='.repeat(60));
    console.log('[TRI-ANALYSIS] Scene Triangle Analysis Report');
    console.log('='.repeat(60));
    console.log(`Total Scene Triangles: ${stats.total.toLocaleString()}`);
    console.log(`Renderer Triangles: ${renderer ? renderer.info.render.triangles.toLocaleString() : 'N/A'}`);
    console.log('');
    console.log('--- BY CATEGORY ---');
    for (const [cat, data] of Object.entries(stats.byCategory)) {
        const pct = stats.total > 0 ? ((data.triangles / stats.total) * 100).toFixed(1) : 0;
        console.log(`${cat.toUpperCase()}: ${data.triangles.toLocaleString()} triangles (${pct}%), ${data.meshes} meshes`);
    }
    console.log('');
    console.log('--- FISH BY FORM ---');
    const fishForms = Object.entries(stats.byCategory.fish.byForm).sort((a, b) => b[1].triangles - a[1].triangles);
    for (const [form, data] of fishForms) {
        const avgTri = data.count > 0 ? Math.round(data.triangles / data.count) : 0;
        console.log(`  ${form}: ${data.triangles.toLocaleString()} total, ${data.count} fish, ~${avgTri.toLocaleString()} avg/fish`);
    }
    console.log('');
    console.log('--- TOP 20 TRIANGLE CONTRIBUTORS ---');
    for (const obj of stats.topContributors) {
        console.log(`  ${obj.name}: ${obj.triangles.toLocaleString()} (${obj.category}, ${obj.type}, vis=${obj.visible})`);
    }
    console.log('');
    console.log('--- MAP OBJECTS (Top 10) ---');
    for (const obj of stats.byCategory.map.objects) {
        console.log(`  ${obj.name}: ${obj.triangles.toLocaleString()} (vis=${obj.visible})`);
    }
    console.log('');
    console.log('--- GEOMETRY REUSE ---');
    const highReuseGeos = Array.from(stats.geometryReuse.entries())
        .filter(([id, data]) => data.uses > 1 && data.triangles > 1000)
        .sort((a, b) => b[1].triangles * b[1].uses - a[1].triangles * a[1].uses)
        .slice(0, 10);
    for (const [id, data] of highReuseGeos) {
        console.log(`  Geo ${id.substring(0, 8)}: ${data.triangles.toLocaleString()} tri x ${data.uses} uses = ${(data.triangles * data.uses).toLocaleString()} total (${data.category})`);
    }
    console.log('='.repeat(60));
    
    return stats;
}

window.analyzeSceneTriangles = analyzeSceneTriangles;

// Analyze weapon GLB triangle counts for performance optimization
function analyzeWeaponGLBTriangles() {
    console.log('='.repeat(60));
    console.log('[WEAPON-GLB-ANALYSIS] Weapon GLB Triangle Count Report');
    console.log('='.repeat(60));
    
    const triangleCounts = weaponGLBState.triangleCounts;
    
    if (triangleCounts.size === 0) {
        console.log('No weapon GLB models loaded yet. Try switching weapons or wait for models to load.');
        console.log('='.repeat(60));
        return null;
    }
    
    const byType = { cannon: [], bullet: [], hitEffect: [] };
    let grandTotal = 0;
    
    for (const [key, data] of triangleCounts) {
        byType[data.type].push(data);
        grandTotal += data.triangles;
    }
    
    console.log('');
    console.log('--- CANNON MODELS ---');
    let cannonTotal = 0;
    for (const data of byType.cannon) {
        console.log(`  ${data.weaponKey}: ${data.triangles.toLocaleString()} triangles, ${data.vertices.toLocaleString()} vertices, ${data.meshes} meshes`);
        cannonTotal += data.triangles;
    }
    console.log(`  SUBTOTAL: ${cannonTotal.toLocaleString()} triangles`);
    
    console.log('');
    console.log('--- BULLET MODELS ---');
    let bulletTotal = 0;
    for (const data of byType.bullet) {
        console.log(`  ${data.weaponKey}: ${data.triangles.toLocaleString()} triangles, ${data.vertices.toLocaleString()} vertices, ${data.meshes} meshes`);
        bulletTotal += data.triangles;
    }
    console.log(`  SUBTOTAL: ${bulletTotal.toLocaleString()} triangles`);
    
    console.log('');
    console.log('--- HIT EFFECT MODELS ---');
    let hitEffectTotal = 0;
    for (const data of byType.hitEffect) {
        console.log(`  ${data.weaponKey}: ${data.triangles.toLocaleString()} triangles, ${data.vertices.toLocaleString()} vertices, ${data.meshes} meshes`);
        hitEffectTotal += data.triangles;
    }
    console.log(`  SUBTOTAL: ${hitEffectTotal.toLocaleString()} triangles`);
    
    console.log('');
    console.log('--- MULTIPLAYER IMPACT ESTIMATE ---');
    console.log(`  4 cannons (worst case all different): ${(cannonTotal).toLocaleString()} triangles`);
    console.log(`  10 bullets per player x 4 players: ${(bulletTotal * 10).toLocaleString()} triangles (if all weapons active)`);
    console.log(`  5 hit effects per player x 4 players: ${(hitEffectTotal * 5).toLocaleString()} triangles (if all weapons active)`);
    
    console.log('');
    console.log('--- SUMMARY ---');
    console.log(`  Total unique GLB triangles loaded: ${grandTotal.toLocaleString()}`);
    console.log(`  Static cannons (3): ${(cannonTotal * 3 / byType.cannon.length || 0).toLocaleString()} triangles (avg per cannon x 3)`);
    
    console.log('='.repeat(60));
    
    return {
        byType,
        cannonTotal,
        bulletTotal,
        hitEffectTotal,
        grandTotal
    };
}

window.analyzeWeaponGLBTriangles = analyzeWeaponGLBTriangles;

function resetGlbSwapStats() {
    glbSwapStats.totalSpawned = 0;
    glbSwapStats.tryLoadCalled = 0;
    glbSwapStats.manifestNotReady = 0;
    glbSwapStats.tokenMismatch = 0;
    glbSwapStats.fishInactive = 0;
    glbSwapStats.groupMissing = 0;
    glbSwapStats.glbModelNull = 0;
    glbSwapStats.glbModelNullByForm = {};
    glbSwapStats.swapSuccess = 0;
    glbSwapStats.swapSuccessByForm = {};
    // NEW: Reset clearer metrics
    glbSwapStats.eligibleAttempts = 0;
    glbSwapStats.noVariantFound = 0;
    glbSwapStats.loadFailed = 0;
    // Check SkeletonUtils availability on reset
    glbSwapStats.skeletonUtilsAvailable = typeof THREE !== 'undefined' && typeof THREE.SkeletonUtils !== 'undefined';
}

// FIX: Helper function to properly clone GLB models
// For skinned meshes, we need to use SkeletonUtils.clone() instead of Object3D.clone()
// This ensures skeleton bindings and animations work correctly
function cloneGLBModel(model, url) {
    const isSkinned = glbLoaderState.skinnedModelUrls.has(url);
    let clone;
    
    if (isSkinned) {
        if (typeof THREE.SkeletonUtils !== 'undefined') {
            // Use SkeletonUtils.clone for skinned meshes - this properly clones skeleton bindings
            clone = THREE.SkeletonUtils.clone(model);
            // Copy userData manually since SkeletonUtils.clone may not preserve it
            clone.userData = JSON.parse(JSON.stringify(model.userData));
            console.log(`[GLB-LOADER] Cloned skinned mesh using SkeletonUtils: ${url}`);
        } else {
            // CRITICAL WARNING: SkeletonUtils not available - skinned mesh will NOT move correctly!
            // The mesh will render at the original skeleton's location instead of following the parent
            console.error(`[GLB-LOADER] CRITICAL: SkeletonUtils not available for skinned mesh ${url}! Fish will appear stuck at origin. Make sure SkeletonUtils.js is loaded.`);
            clone = model.clone();
        }
    } else {
        // Regular clone for non-skinned meshes
        clone = model.clone();
    }
    
    // FIX: Deep clone materials to prevent shared material issues
    // Without this, all cloned fish share the same material instances,
    // which can cause texture/color corruption (e.g., normal map displayed as color map)
    clone.traverse((child) => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material = child.material.map(mat => mat.clone());
            } else {
                child.material = child.material.clone();
            }
        }
    });
    
    return clone;
}

async function loadFishManifest() {
    if (glbLoaderState.manifestLoaded) return glbLoaderState.manifest;
    
    try {
        const response = await fetch(glbLoaderState.manifestUrl);
        if (!response.ok) {
            console.warn('[GLB-LOADER] Manifest not found, using procedural meshes');
            glbLoaderState.enabled = false;
            return null;
        }
        glbLoaderState.manifest = await response.json();
        glbLoaderState.manifestLoaded = true;
        
        // FIX: Build form-to-variant lookup map for O(1) lookup by fish form name
        // This ensures each fish form gets its correct GLB model regardless of tier
        glbLoaderState.formToVariant.clear();
        const tiers = glbLoaderState.manifest.tiers;
        for (const tierName of Object.keys(tiers)) {
            const tier = tiers[tierName];
            if (!tier.variants) continue;
            for (const variant of tier.variants) {
                if (variant.form && variant.url) {
                    // Only add if not already mapped (first occurrence wins)
                    if (!glbLoaderState.formToVariant.has(variant.form)) {
                        glbLoaderState.formToVariant.set(variant.form, variant);
                        console.log(`[GLB-LOADER] Mapped form '${variant.form}' -> '${variant.url}'`);
                    }
                }
            }
        }
        
        console.log('[GLB-LOADER] Fish manifest loaded:', Object.keys(tiers).length, 'tiers,', glbLoaderState.formToVariant.size, 'form mappings');
        return glbLoaderState.manifest;
    } catch (error) {
        console.warn('[GLB-LOADER] Failed to load manifest:', error.message);
        glbLoaderState.enabled = false;
        return null;
    }
}

function getTierFromConfig(tierConfig) {
    const tierName = tierConfig.tier || 'tier1';
    if (tierName.startsWith('tier')) return tierName;
    const tierNum = parseInt(tierName) || 1;
    return `tier${tierNum}`;
}

// FIX: Completely rewritten to use form-driven lookup instead of tier-based lookup
// This ensures each fish form gets its correct GLB model regardless of tier
// The old implementation had a bug where all fish were mapped to tier1 (Sardine)
function getVariantForForm(tierName, form) {
    if (!glbLoaderState.manifest || !glbLoaderState.manifest.tiers) return null;
    
    // FIX: Use the form-to-variant lookup map for O(1) lookup
    // This searches ALL tiers for the matching form, not just the specified tier
    if (glbLoaderState.formToVariant.has(form)) {
        const variant = glbLoaderState.formToVariant.get(form);
        console.log(`[GLB-LOADER] Found variant for form '${form}': ${variant.url}`);
        return variant;
    }
    
    // FIX: No fallback to random variant - if form not found, return null
    // This prevents wrong models from being attached to fish
    console.log(`[GLB-LOADER] No variant found for form '${form}' - using procedural mesh`);
    return null;
}

async function loadGLBModel(urlOrKey) {
    // FIX: Support both full URLs and R2 keys (filenames) like weapons do
    // - Full URL: starts with 'https://' or 'http://' - use as-is
    // - Local path: starts with '/' - use as-is (will 404 for missing local files)
    // - R2 key: anything else - construct URL using baseUrl + encodeURI(key)
    let url;
    if (urlOrKey.startsWith('https://') || urlOrKey.startsWith('http://') || urlOrKey.startsWith('/')) {
        url = urlOrKey;
    } else {
        // R2 key mode: baseUrl + encodeURI(key) - like weapons do
        // Use encodeURI (not encodeURIComponent) to preserve '/' for subfolders
        url = glbLoaderState.baseUrl + encodeURI(urlOrKey);
        console.log(`[GLB-LOADER] Constructed URL from key: ${urlOrKey} -> ${url}`);
    }
    
    if (glbLoaderState.modelCache.has(url)) {
        // FIX: Use cloneGLBModel helper for proper skinned mesh cloning
        console.log(`[GLB-LOADER] Cache hit for: ${url}`);
        const clone = cloneGLBModel(glbLoaderState.modelCache.get(url), url);
        console.log(`[GLB-LOADER] Cloned model from cache: ${clone ? 'success' : 'null'}`);
        return clone;
    }
    
    if (glbLoaderState.loadingPromises.has(url)) {
        const model = await glbLoaderState.loadingPromises.get(url);
        // FIX: Use cloneGLBModel helper for proper skinned mesh cloning
        return model ? cloneGLBModel(model, url) : null;
    }
    
    const loadPromise = new Promise((resolve) => {
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('[GLB-LOADER] GLTFLoader not available');
            resolve(null);
            return;
        }
        
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                
                // FIX: Detect if model contains skinned meshes for proper cloning later
                let hasSkinned = false;
                let hasAnimations = gltf.animations && gltf.animations.length > 0;
                
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        // FIX: Ensure materials are visible
                        if (child.material) {
                            child.material.visible = true;
                            child.material.needsUpdate = true;
                        }
                        // FIX: Disable frustum culling for fish meshes to prevent disappearing
                        child.frustumCulled = false;
                    }
                    // FIX: Detect skinned meshes
                    if (child.isSkinnedMesh) {
                        hasSkinned = true;
                    }
                });
                
                // FIX: Track skinned models for proper cloning
                if (hasSkinned || hasAnimations) {
                    glbLoaderState.skinnedModelUrls.add(url);
                    console.log(`[GLB-LOADER] Model has skinned meshes or animations: ${url}`);
                }
                
                // Store animations in separate cache (not cloned, shared across instances)
                if (hasAnimations) {
                    glbLoaderState.animationCache.set(url, gltf.animations);
                    const clipNames = gltf.animations.map(clip => `${clip.name}(${clip.duration.toFixed(2)}s)`).join(', ');
                    console.log(`[GLB-LOADER] Cached ${gltf.animations.length} animation(s) for ${url}: ${clipNames}`);
                }
                
                // FIX: Normalize fish GLB model like weapons - compute bounding box and center
                const box = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                const maxDimension = Math.max(size.x, size.y, size.z);
                
                // FIX: Store bounding info as plain arrays (NOT Vector3 objects!)
                // Object3D.clone() serializes userData via JSON, which loses Vector3 prototype methods
                // Storing as arrays ensures the data survives cloning
                model.userData.originalMaxDim = maxDimension;
                model.userData.originalCenter = center.toArray(); // [x, y, z] array
                model.userData.originalSize = size.toArray(); // [x, y, z] array
                model.userData.hasSkinned = hasSkinned;
                model.userData.hasAnimations = hasAnimations;
                model.userData.glbUrl = url; // Store URL for animation lookup
                
                console.log(`[GLB-LOADER] Loaded model: ${url}, maxDim=${maxDimension.toFixed(2)}, center=[${center.toArray().map(v => v.toFixed(2)).join(',')}], skinned=${hasSkinned}, animations=${hasAnimations}`);
                
                glbLoaderState.modelCache.set(url, model);
                resolve(model);
            },
            undefined,
            (error) => {
                console.warn('[GLB-LOADER] Failed to load model:', url, error.message);
                resolve(null);
            }
        );
    });
    
    glbLoaderState.loadingPromises.set(url, loadPromise);
    const model = await loadPromise;
    glbLoaderState.loadingPromises.delete(url);
    
    // FIX: Use cloneGLBModel helper for proper skinned mesh cloning
    return model ? cloneGLBModel(model, url) : null;
}

async function tryLoadGLBForFish(tierConfig, form) {
    if (!glbLoaderState.enabled || !glbLoaderState.manifest) {
        return null;
    }
    
    const tierName = getTierFromConfig(tierConfig);
    const variant = getVariantForForm(tierName, form);
    
    // NEW: Track whether this form has a GLB model configured
    if (!variant || !variant.url) {
        glbSwapStats.noVariantFound++;
        return null;
    }
    
    // NEW: This is an eligible attempt (form has a GLB model configured)
    glbSwapStats.eligibleAttempts++;
    
    try {
        console.log(`[FISH-GLB] About to call loadGLBModel for variant.url='${variant.url}'`);
        const model = await loadGLBModel(variant.url);
        console.log(`[FISH-GLB] loadGLBModel returned: ${model ? 'model object' : 'null'}, userData=${model ? JSON.stringify(model.userData) : 'N/A'}`);
        if (model) {
            // FIX: Use bounding box normalization like weapons instead of magic scale numbers
            // This ensures fish GLB models are always visible regardless of their original size
            // Apply global scale multiplier to make fish larger/smaller as needed
            const baseTargetSize = tierConfig.size || 20; // Target fish size in game units
            const scaleMultiplier = CONFIG.glbModelScaleMultiplier || 1.0;
            const targetSize = baseTargetSize * scaleMultiplier;
            const originalMaxDim = model.userData.originalMaxDim || 1;
            const originalCenterArray = model.userData.originalCenter; // [x, y, z] array
            
            console.log(`[FISH-GLB] Before normalization: targetSize=${targetSize}, originalMaxDim=${originalMaxDim}, originalCenterArray=${JSON.stringify(originalCenterArray)}`);
            
            // Calculate auto-scale to normalize to target size
            let autoScale = 1;
            if (originalMaxDim > 0.001) {
                autoScale = targetSize / originalMaxDim;
                // Clamp to reasonable range
                autoScale = Math.max(0.01, Math.min(autoScale, 1000));
            }
            
            // Apply normalization scale
            model.scale.setScalar(autoScale);
            
            // Center the model (offset by original center)
            // FIX: Reconstruct Vector3 from array since clone() serializes userData via JSON
            if (originalCenterArray && Array.isArray(originalCenterArray)) {
                const centerVec = new THREE.Vector3().fromArray(originalCenterArray);
                model.position.sub(centerVec.multiplyScalar(autoScale));
            }
            
            console.log(`[FISH-GLB] Normalized ${form}: targetSize=${targetSize}, originalMaxDim=${originalMaxDim.toFixed(2)}, autoScale=${autoScale.toFixed(2)}`);
            
            return model;
        } else {
            console.log(`[FISH-GLB] loadGLBModel returned null/undefined for ${form}`);
            // NEW: Track load failures (model exists in manifest but failed to load)
            glbSwapStats.loadFailed++;
        }
    } catch (error) {
        console.warn('[GLB-LOADER] Error loading GLB for', form, ':', error.message, error.stack);
        // NEW: Track load failures (network/parse error)
        glbSwapStats.loadFailed++;
    }
    
    return null;
}

function getGLBLoaderStats() {
    return {
        enabled: glbLoaderState.enabled,
        manifestLoaded: glbLoaderState.manifestLoaded,
        cachedModels: glbLoaderState.modelCache.size,
        pendingLoads: glbLoaderState.loadingPromises.size
    };
}

// Get animations for a GLB model by URL or key
// Returns the animation clips array or null if no animations
function getGLBAnimations(urlOrKey) {
    // Construct full URL if needed (same logic as loadGLBModel)
    let url;
    if (urlOrKey.startsWith('https://') || urlOrKey.startsWith('http://') || urlOrKey.startsWith('/')) {
        url = urlOrKey;
    } else {
        url = glbLoaderState.baseUrl + encodeURI(urlOrKey);
    }
    return glbLoaderState.animationCache.get(url) || null;
}

// FIX: Preload fish GLB models at startup to prevent lag during gameplay
// Now correctly handles R2 keys (filenames without '/') in addition to full URLs
async function preloadFishGLBModels() {
    if (!glbLoaderState.enabled || !glbLoaderState.manifest) {
        console.log('[FISH-GLB] Skipping preload - manifest not loaded');
        return;
    }
    
    console.log('[FISH-GLB] Starting fish GLB preload...');
    const tiers = glbLoaderState.manifest.tiers;
    let loadedCount = 0;
    
    for (const tierName of Object.keys(tiers)) {
        const tier = tiers[tierName];
        if (!tier.variants) continue;
        
        for (const variant of tier.variants) {
            // FIX: Preload R2 keys (filenames) AND full URLs, but skip local paths (start with '/')
            // R2 keys are filenames like "Sardine fish.glb" that don't start with '/' or 'http'
            // Local paths start with '/' and will 404 since they don't exist
            const isR2Key = variant.url && !variant.url.startsWith('/') && !variant.url.startsWith('http');
            const isFullUrl = variant.url && variant.url.startsWith('https://');
            
            if (isR2Key || isFullUrl) {
                try {
                    await loadGLBModel(variant.url);
                    loadedCount++;
                    console.log(`[FISH-GLB] Preloaded: ${variant.form} -> ${variant.url}`);
                } catch (error) {
                    console.warn(`[FISH-GLB] Failed to preload ${variant.form}:`, error.message);
                }
            }
        }
    }
    
    console.log(`[FISH-GLB] Preload complete: ${loadedCount} fish models cached`);
}

// ==================== WEAPON GLB MODEL LOADER ====================
// Auto-generated from WEAPON_CONFIG (single source of truth)
const WEAPON_GLB_CONFIG = {
    baseUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/',
    weapons: _buildLegacyGLBWeapons()
};

const weaponGLBState = {
    cannonCache: new Map(),
    bulletCache: new Map(),
    hitEffectCache: new Map(),
    loadingPromises: new Map(),
    enabled: true,
    currentWeaponModel: null,
    preloadedWeapons: new Set(),
    // Pre-cloned bullet models ready for immediate use (no async needed)
    bulletModelPool: new Map(),  // Map<weaponKey, THREE.Group[]>
    // PERFORMANCE: Pre-cloned hit effect models for instant spawning (no clone on hit)
    hitEffectPool: new Map(),     // Map<weaponKey, {model, materials, inUse}[]>
    // Triangle count tracking for performance analysis
    triangleCounts: new Map(),    // Map<"weaponKey_type", {triangles, meshes, vertices}>
    // PERFORMANCE: Pre-cloned cannon models for instant weapon switching (no clone/dispose on switch)
    preClonedCannons: new Map(),  // Map<weaponKey, THREE.Group> - pre-cloned and added to scene
    currentWeaponKey: null,       // Track current weapon for show/hide switching
    shadersWarmedUp: false        // Track if shaders have been warmed up
};

// ==================== COIN GLB MODEL SYSTEM ====================
// Uses Coin.glb from R2 for coin drop effects instead of procedural geometry
const COIN_GLB_CONFIG = {
    baseUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/',
    filename: 'Coin.glb',
    scale: 7,  // Scale factor for the coin model (47% of original 15)
    rotationSpeed: 12  // Rotation speed for spinning animation
};

const coinGLBState = {
    model: null,
    loaded: false,
    loading: false,
    loadPromise: null
};

// Load Coin GLB model
async function loadCoinGLB() {
    if (coinGLBState.loaded || coinGLBState.loading) {
        return coinGLBState.loadPromise;
    }
    
    coinGLBState.loading = true;
    
    coinGLBState.loadPromise = new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        const url = COIN_GLB_CONFIG.baseUrl + COIN_GLB_CONFIG.filename;
        
        loader.load(url,
            (gltf) => {
                coinGLBState.model = gltf.scene;
                coinGLBState.model.scale.setScalar(COIN_GLB_CONFIG.scale);
                coinGLBState.loaded = true;
                coinGLBState.loading = false;
                console.log('[COIN-GLB] Coin model loaded successfully');
                resolve(coinGLBState.model);
            },
            undefined,
            (error) => {
                console.warn('[COIN-GLB] Failed to load Coin.glb:', error);
                coinGLBState.loading = false;
                resolve(null);
            }
        );
    });
    
    return coinGLBState.loadPromise;
}

// Clone coin model for use in effects
// Pre-cloned coin model pool to avoid cloning on every spawn (reduces stutter)
const coinModelPool = {
    models: [],
    maxSize: 60,  // Increased from 30: Boss death (30) + flying coins (15) + buffer
    initialized: false
};

function initCoinModelPool() {
    if (coinModelPool.initialized || !coinGLBState.model) return;
    for (let i = 0; i < coinModelPool.maxSize; i++) {
        const clone = createCoinModelClone();
        if (clone) {
            clone.visible = false;
            coinModelPool.models.push(clone);
        }
    }
    coinModelPool.initialized = true;
}

function createCoinModelClone() {
    if (!coinGLBState.model) return null;
    const clone = coinGLBState.model.clone();
    clone.traverse((child) => {
        if (child.isMesh && child.material) {
            // Clone the original material to preserve all PBR properties from the GLB
            child.material = child.material.clone();
            child.material.side = THREE.DoubleSide;
            
            // CASINO GAME OPTIMIZATION: Use bright golden yellow emissive to enhance coin visibility
            // while preserving texture details from the GLB model
            if (child.material.emissive) {
                child.material.emissive = new THREE.Color(0xFFD700);  // Pure gold color (more yellow)
                child.material.emissiveIntensity = 0.35;  // Slightly increased for better golden glow
            }
            // Also tint the base color slightly more golden
            if (child.material.color) {
                child.material.color.lerp(new THREE.Color(0xFFD700), 0.3);  // Blend 30% gold into base color
            }
        }
    });
    return clone;
}

function getCoinModelFromPool() {
    // Try to get from pool first
    for (let i = 0; i < coinModelPool.models.length; i++) {
        if (!coinModelPool.models[i].visible) {
            coinModelPool.models[i].visible = true;
            return coinModelPool.models[i];
        }
    }
    // Pool exhausted, create new one (fallback)
    return createCoinModelClone();
}

function returnCoinModelToPool(model) {
    if (!model) return;
    model.visible = false;
    // Reset position but keep the original scale from COIN_GLB_CONFIG
    model.position.set(0, 0, 0);
    model.scale.setScalar(COIN_GLB_CONFIG.scale);  // Restore original scale (50)
}

function cloneCoinModel() {
    // Use pooled model for better performance
    return getCoinModelFromPool();
}

// Warm up coin shaders by rendering once off-screen (forces GPU shader compilation)
function warmUpCoinShaders() {
    if (!coinModelPool.initialized || coinModelPool.models.length === 0) return;
    if (!scene || !camera || !renderer) return;
    
    // Get a coin from pool, position it off-screen, render once, then return
    const coin = coinModelPool.models[0];
    const originalVisible = coin.visible;
    const originalPosition = coin.position.clone();
    
    // Position far off-screen but in frustum
    coin.position.set(0, 0, -10000);
    coin.visible = true;
    scene.add(coin);
    
    // Render one frame to compile shaders
    renderer.render(scene, camera);
    
    // Restore original state
    scene.remove(coin);
    coin.position.copy(originalPosition);
    coin.visible = originalVisible;
    
    console.log('[PRELOAD] Coin shaders warmed up');
}

// Temp vectors for bullet calculations - reused to avoid per-frame allocations
const bulletTempVectors = {
    lookTarget: new THREE.Vector3(),
    velocityScaled: new THREE.Vector3(),
    fishToBullet: new THREE.Vector3(),
    hitPos: new THREE.Vector3(),
    bulletDir: new THREE.Vector3(),
    // Segment-sphere collision temp vectors
    segmentDir: new THREE.Vector3(),
    toCenter: new THREE.Vector3(),
    closestPoint: new THREE.Vector3()
};

// COLLISION OPTIMIZATION: Segment-sphere intersection for accurate bullet collision
// This replaces the old point-sphere + 100 buffer approach which caused inaccurate hitboxes
// Returns: { hit: boolean, t: number (0-1 along segment), point: Vector3 (closest point) }
function segmentIntersectsSphere(p0, p1, center, radius, outPoint) {
    // Segment direction vector: d = p1 - p0
    bulletTempVectors.segmentDir.subVectors(p1, p0);
    const segLengthSq = bulletTempVectors.segmentDir.lengthSq();
    
    // Handle degenerate case (bullet didn't move)
    if (segLengthSq < 0.0001) {
        const distSq = p0.distanceToSquared(center);
        if (distSq <= radius * radius) {
            if (outPoint) outPoint.copy(p0);
            return { hit: true, t: 0 };
        }
        return { hit: false, t: -1 };
    }
    
    // Vector from segment start to sphere center: w = center - p0
    bulletTempVectors.toCenter.subVectors(center, p0);
    
    // Project w onto segment direction to find closest point parameter t
    // t = dot(w, d) / dot(d, d), clamped to [0, 1]
    const t = Math.max(0, Math.min(1, 
        bulletTempVectors.toCenter.dot(bulletTempVectors.segmentDir) / segLengthSq
    ));
    
    // Calculate closest point on segment: Q = p0 + t * d
    bulletTempVectors.closestPoint.copy(p0).addScaledVector(bulletTempVectors.segmentDir, t);
    
    // Check if closest point is within sphere radius
    const distSq = bulletTempVectors.closestPoint.distanceToSquared(center);
    
    if (distSq <= radius * radius) {
        if (outPoint) outPoint.copy(bulletTempVectors.closestPoint);
        return { hit: true, t: t };
    }
    
    return { hit: false, t: -1 };
}

// ELLIPSOID COLLISION SYSTEM: Per-form aspect ratios for accurate fish hitboxes
// [halfLength, halfHeight, halfWidth] as fractions of 'size' (= config.size * glbModelScaleMultiplier)
// halfLength: along fish body axis (head to tail)
// halfHeight: vertical (dorsal to ventral)
// halfWidth: horizontal perpendicular to body
const FISH_ELLIPSOID_RATIOS = {
    whale:       [0.55, 0.34, 0.34],
    killerWhale: [0.50, 0.32, 0.32],
    shark:       [0.55, 0.30, 0.30],
    marlin:      [0.58, 0.26, 0.26],
    hammerhead:  [0.56, 0.32, 0.54],
    tuna:        [0.48, 0.30, 0.30],
    dolphinfish: [0.48, 0.30, 0.30],
    pufferfish:  [0.42, 0.42, 0.42],
    grouper:     [0.46, 0.36, 0.36],
    parrotfish:  [0.50, 0.40, 0.36],
    angelfish:   [0.42, 0.50, 0.30],
    lionfish:    [0.46, 0.44, 0.44],
    tang:        [0.48, 0.50, 0.36],
    sardine:     [0.64, 0.38, 0.38],
    anchovy:     [0.64, 0.38, 0.38],
    clownfish:   [0.52, 0.46, 0.38],
    damselfish:  [0.52, 0.46, 0.38],
    mantaRay:    [0.38, 0.22, 0.54],
    seahorse:    [0.34, 0.58, 0.36],
    crab:        [0.38, 0.34, 0.44],
    eel:         [0.66, 0.32, 0.32],
    turtle:      [0.44, 0.36, 0.48],
    goldfish:    [0.48, 0.46, 0.38],
    standard:    [0.42, 0.30, 0.30],
};

const ellipsoidTempVectors = {
    relP0: new THREE.Vector3(),
    relP1: new THREE.Vector3(),
    scaledP0: new THREE.Vector3(),
    scaledP1: new THREE.Vector3(),
    segDir: new THREE.Vector3(),
    toCenter: new THREE.Vector3(),
    closestPoint: new THREE.Vector3(),
};

function segmentIntersectsEllipsoid(p0, p1, center, halfExtents, yaw, outPoint) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    const r0 = ellipsoidTempVectors.relP0;
    const r1 = ellipsoidTempVectors.relP1;
    r0.subVectors(p0, center);
    r1.subVectors(p1, center);

    const hx = halfExtents.x, hy = halfExtents.y, hz = halfExtents.z;
    const sp0 = ellipsoidTempVectors.scaledP0;
    const sp1 = ellipsoidTempVectors.scaledP1;
    sp0.set((r0.x * cosYaw - r0.z * sinYaw) / hx, r0.y / hy, (r0.x * sinYaw + r0.z * cosYaw) / hz);
    sp1.set((r1.x * cosYaw - r1.z * sinYaw) / hx, r1.y / hy, (r1.x * sinYaw + r1.z * cosYaw) / hz);

    const sd = ellipsoidTempVectors.segDir;
    sd.subVectors(sp1, sp0);
    const segLenSq = sd.lengthSq();

    if (segLenSq < 0.0001) {
        if (sp0.lengthSq() <= 1.0) {
            if (outPoint) outPoint.copy(p0);
            return { hit: true, t: 0 };
        }
        return { hit: false, t: -1 };
    }

    ellipsoidTempVectors.toCenter.copy(sp0).negate();
    const t = Math.max(0, Math.min(1,
        ellipsoidTempVectors.toCenter.dot(sd) / segLenSq
    ));
    ellipsoidTempVectors.closestPoint.copy(sp0).addScaledVector(sd, t);

    if (ellipsoidTempVectors.closestPoint.lengthSq() <= 1.0) {
        if (outPoint) outPoint.lerpVectors(p0, p1, t);
        return { hit: true, t: t };
    }
    return { hit: false, t: -1 };
}

function rayHitsEllipsoid(rayOrigin, rayDir, fishCenter, halfExtents, yaw, tolerance) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const eX = halfExtents.x + tolerance;
    const eY = halfExtents.y + tolerance;
    const eZ = halfExtents.z + tolerance;

    const relX = rayOrigin.x - fishCenter.x;
    const relY = rayOrigin.y - fishCenter.y;
    const relZ = rayOrigin.z - fishCenter.z;

    const oX = (relX * cosYaw - relZ * sinYaw) / eX;
    const oY = relY / eY;
    const oZ = (relX * sinYaw + relZ * cosYaw) / eZ;

    const dX = (rayDir.x * cosYaw - rayDir.z * sinYaw) / eX;
    const dY = rayDir.y / eY;
    const dZ = (rayDir.x * sinYaw + rayDir.z * cosYaw) / eZ;

    const a = dX * dX + dY * dY + dZ * dZ;
    const b = 2 * (oX * dX + oY * dY + oZ * dZ);
    const c = oX * oX + oY * oY + oZ * oZ - 1;
    const disc = b * b - 4 * a * c;

    if (disc < 0) return { hit: false, t: -1 };

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t2 < 0) return { hit: false, t: -1 };
    const tEntry = t1 > 0 ? t1 : t2;

    return { hit: true, t: tEntry };
}

// PERFORMANCE: Temp vectors for fireBullet - reused to avoid per-shot allocations
const fireBulletTempVectors = {
    leftDir: new THREE.Vector3(),
    rightDir: new THREE.Vector3(),
    yAxis: new THREE.Vector3(0, 1, 0),  // Constant Y axis for rotation
    muzzlePos: new THREE.Vector3(),
    // PERFORMANCE: Additional temp vectors for multiplayer mode (avoids new Vector3() per shot)
    multiplayerMuzzlePos: new THREE.Vector3(),
    multiplayerDir: new THREE.Vector3(),
    // ACCURATE AIMING: Temp vectors for target point calculation
    targetPoint: new THREE.Vector3()
};

// ACCURATE AIMING: Constants for parabolic trajectory (8x weapon)
const GRENADE_GRAVITY = 400;  // Same as in Bullet.update()

// ACCURATE AIMING: Calculate compensated velocity for parabolic trajectory
// Given start position, target position, and gravity, calculate initial velocity
// that will make the projectile land exactly on the target
// Physics: x(t) = x0 + vx*t, y(t) = y0 + vy*t - 0.5*g*t², z(t) = z0 + vz*t
function calculateParabolicVelocity(startPos, targetPos, baseSpeed, outVelocity) {
    // Calculate horizontal distance
    const dx = targetPos.x - startPos.x;
    const dy = targetPos.y - startPos.y;
    const dz = targetPos.z - startPos.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    
    // Calculate flight time based on horizontal distance and base speed
    // T = horizontalDist / horizontalSpeed
    // We want consistent horizontal speed for predictable gameplay
    const T = horizontalDist / baseSpeed;
    
    // Prevent division by zero for very close targets
    if (T < 0.01) {
        // Target is very close, just use straight line
        outVelocity.set(dx, dy, dz).normalize().multiplyScalar(baseSpeed);
        return;
    }
    
    // Calculate velocity components
    // vx = dx / T, vz = dz / T (horizontal components)
    // vy = dy / T + 0.5 * g * T (vertical component with gravity compensation)
    const vx = dx / T;
    const vz = dz / T;
    const vy = dy / T + 0.5 * GRENADE_GRAVITY * T;
    
    outVelocity.set(vx, vy, vz);
}

// PERFORMANCE: Temp vectors for getAimDirectionFromMouse - reused to avoid per-call allocations
// This is critical for third-person mode where aimCannon is called on every mouse move
const aimTempVectors = {
    mouseNDC: new THREE.Vector2(),
    muzzlePos: new THREE.Vector3(),
    targetPoint: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    rayDirection: new THREE.Vector3(),
    parallaxHitPoint: new THREE.Vector3(),
    parallaxScreenPos: new THREE.Vector3()
};

// PERFORMANCE: Throttle state for aimCannon - limits calls to once per animation frame
const aimThrottleState = {
    pendingAim: false,
    lastTargetX: 0,
    lastTargetY: 0
};

// PERFORMANCE: Barrel recoil state for animation loop (replaces setTimeout)
// IMPROVED: Two-phase recoil animation (kick + return) with easing for realistic feel
const barrelRecoilState = {
    active: false,
    phase: 'idle',  // 'idle', 'kick', 'return'
    originalPosition: new THREE.Vector3(),
    recoilVector: new THREE.Vector3(),  // Direction of recoil (opposite to firing direction)
    kickStartTime: 0,
    kickDuration: 40,   // Fast kick back (40ms)
    returnDuration: 120, // Slower return (120ms)
    recoilDistance: 0,
    // Temp vector for calculations (avoid allocations)
    tempVec: new THREE.Vector3()
};

// FPS Camera recoil state for visual feedback in FPS mode
// Uses camera pitch offset (kick up + return) without moving camera position
const fpsCameraRecoilState = {
    active: false,
    phase: 'idle',  // 'idle', 'kick', 'return'
    pitchOffset: 0,  // Current pitch offset in radians
    maxPitchOffset: 0,  // Target pitch offset for kick phase
    kickStartTime: 0,
    kickDuration: 40,   // Fast kick up (40ms)
    returnDuration: 150  // Slower return (150ms)
};

// Sci-fi base ring state for animation
// Stores references to the dual-layer ring meshes for rotation/pulse animation
let cannonBaseRingCore = null;
let cannonBaseRingGlow = null;
let cannonBaseRingInnerDisk = null;  // Black inner disk to cover gray platform area
let cannonBaseRingSegmentTexture = null;
let currentRingColor = 0x44ddff;  // Track current weapon ring color for defensive checks

// Create sci-fi segmented texture for base ring (called once at init)
function createSciFiRingTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Clear with transparent background
    ctx.clearRect(0, 0, size, size);
    
    const centerX = size / 2;
    const centerY = size / 2;
    const outerRadius = size / 2 - 4;
    const innerRadius = size / 2 - 40;
    
    // Draw segmented ring pattern (16 segments with gaps)
    const segments = 16;
    const gapAngle = Math.PI / 48;  // Small gap between segments
    const segmentAngle = (Math.PI * 2 / segments) - gapAngle;
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 28;
    ctx.lineCap = 'butt';
    
    for (let i = 0; i < segments; i++) {
        const startAngle = i * (Math.PI * 2 / segments);
        const endAngle = startAngle + segmentAngle;
        
        // Main segment arc
        ctx.beginPath();
        ctx.arc(centerX, centerY, (outerRadius + innerRadius) / 2, startAngle, endAngle);
        ctx.stroke();
        
        // Add tick marks at segment centers
        const tickAngle = startAngle + segmentAngle / 2;
        const tickInner = innerRadius + 8;
        const tickOuter = outerRadius - 8;
        ctx.beginPath();
        ctx.moveTo(
            centerX + Math.cos(tickAngle) * tickInner,
            centerY + Math.sin(tickAngle) * tickInner
        );
        ctx.lineTo(
            centerX + Math.cos(tickAngle) * tickOuter,
            centerY + Math.sin(tickAngle) * tickOuter
        );
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 28;
    }
    
    // Add inner ring detail
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius + 5, 0, Math.PI * 2);
    ctx.stroke();
    
    // Add outer ring detail
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius - 5, 0, Math.PI * 2);
    ctx.stroke();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// Update sci-fi base ring animation (rotation + pulse)
// Called from animate loop - no allocations, just mutates existing meshes
function updateSciFiBaseRing(time) {
    if (!cannonBaseRingCore || !cannonBaseRingGlow) return;
    
    // Slow rotation for tech feel (core rotates one way, glow rotates opposite)
    const rotationSpeed = 0.15;  // Radians per second
    cannonBaseRingCore.rotation.z = time * rotationSpeed;
    cannonBaseRingGlow.rotation.z = -time * rotationSpeed * 0.7;  // Slower, opposite direction
    
    // Gentle opacity pulse for "powered" energy effect
    const pulseSpeed = 2.0;  // Cycles per second
    const corePulse = 0.85 + 0.15 * Math.sin(time * pulseSpeed);
    const glowPulse = 0.30 + 0.15 * Math.sin(time * pulseSpeed + Math.PI * 0.5);  // Phase offset
    
    cannonBaseRingCore.material.opacity = 0.9 * corePulse;
    cannonBaseRingGlow.material.opacity = glowPulse;
}

// Debug flag for shooting logs (set to false for production)
const DEBUG_SHOOTING = false;

// Debug flag for aim direction verification (set to true to verify crosshair accuracy)
// When enabled, logs aim direction data to console for all 4 weapons
// In FPS mode, rayDir and direction should be identical (diff = 0)
const DEBUG_AIM = true;

// PERFORMANCE: Cached geometry and pooled meshes for muzzle flash rings
// IMPROVED: Object pool to avoid per-shot material creation (reduces GC stutter)
const muzzleFlashCache = {
    ringGeometry: null,  // Shared TorusGeometry (radius=1, scaled per use)
    initialized: false,
    // Ring mesh pool - each has its own material to avoid opacity conflicts
    ringPool: [],
    ringPoolSize: 20,  // Pre-create 20 rings (enough for rapid fire)
    freeRings: []  // Free-list for O(1) allocation
};

function initMuzzleFlashCache() {
    if (muzzleFlashCache.initialized) return;
    // Create a unit torus that will be scaled for different ring sizes
    muzzleFlashCache.ringGeometry = new THREE.TorusGeometry(1, 0.15, 8, 32);
    
    // Pre-create ring meshes with their own materials
    for (let i = 0; i < muzzleFlashCache.ringPoolSize; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,  // Will be set per use
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(muzzleFlashCache.ringGeometry, material);
        mesh.visible = false;
        muzzleFlashCache.ringPool.push({ mesh, material, inUse: false });
        muzzleFlashCache.freeRings.push(i);
    }
    
    muzzleFlashCache.initialized = true;
}

// Get a ring from the pool (O(1) allocation)
function getRingFromPool() {
    initMuzzleFlashCache();
    
    if (muzzleFlashCache.freeRings.length > 0) {
        const idx = muzzleFlashCache.freeRings.pop();
        const poolItem = muzzleFlashCache.ringPool[idx];
        poolItem.inUse = true;
        poolItem.poolIndex = idx;
        return poolItem;
    }
    
    // Pool exhausted - create new (fallback, should rarely happen)
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(muzzleFlashCache.ringGeometry, material);
    return { mesh, material, inUse: true, poolIndex: -1 };
}

// Return a ring to the pool
function returnRingToPool(poolItem) {
    if (poolItem.poolIndex >= 0) {
        poolItem.inUse = false;
        poolItem.mesh.visible = false;
        muzzleFlashCache.freeRings.push(poolItem.poolIndex);
    } else {
        // Fallback item - dispose it
        poolItem.material.dispose();
    }
}

async function loadWeaponGLB(weaponKey, type) {
    const config = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (!config) {
        console.warn('[WEAPON-GLB] Unknown weapon:', weaponKey);
        return null;
    }
    
    let filename, cache;
    switch (type) {
        case 'cannon':
            filename = config.cannon;
            cache = weaponGLBState.cannonCache;
            break;
        case 'cannonNonPlayer':
            // Low-poly cannon for non-player (other players in multiplayer)
            // Falls back to regular cannon if non-player version not available
            filename = config.cannonNonPlayer || config.cannon;
            cache = weaponGLBState.cannonCache;
            break;
        case 'bullet':
            filename = config.bullet;
            cache = weaponGLBState.bulletCache;
            break;
        case 'hitEffect':
            filename = config.hitEffect;
            cache = weaponGLBState.hitEffectCache;
            break;
        default:
            console.warn('[WEAPON-GLB] Unknown type:', type);
            return null;
    }
    
    // Properly encode the filename for URL (handles Chinese characters and spaces)
    const encodedFilename = encodeURIComponent(filename);
    const url = WEAPON_GLB_CONFIG.baseUrl + encodedFilename;
    const cacheKey = `${weaponKey}_${type}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        return cached.clone();
    }
    
    if (weaponGLBState.loadingPromises.has(cacheKey)) {
        const model = await weaponGLBState.loadingPromises.get(cacheKey);
        return model ? model.clone() : null;
    }
    
    console.log(`[WEAPON-GLB] Loading ${type} for ${weaponKey}:`, url);
    
    const loadPromise = new Promise((resolve) => {
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('[WEAPON-GLB] GLTFLoader not available');
            resolve(null);
            return;
        }
        
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                const model = gltf.scene;
                
                let meshCount = 0;
                let hasSkinnedMesh = false;
                let totalTriangles = 0;
                let totalVertices = 0;
                const lightsToRemove = [];
                model.traverse((child) => {
                    if (child.isMesh) {
                        meshCount++;
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.frustumCulled = false;
                        
                        // Count triangles and vertices for performance analysis
                        if (child.geometry) {
                            if (child.geometry.index) {
                                totalTriangles += child.geometry.index.count / 3;
                            } else if (child.geometry.attributes && child.geometry.attributes.position) {
                                totalTriangles += child.geometry.attributes.position.count / 3;
                            }
                            if (child.geometry.attributes && child.geometry.attributes.position) {
                                totalVertices += child.geometry.attributes.position.count;
                            }
                        }
                        
                        if (child.material) {
                            child.material.transparent = false;
                            child.material.opacity = 1;
                            child.material.visible = true;
                            child.material.side = THREE.DoubleSide;
                            
                            if (child.material.metalness !== undefined) {
                                child.material.metalness = 0.15;
                            }
                            if (child.material.roughness !== undefined) {
                                child.material.roughness = 0.7;
                            }
                            
                            var emBoost = config.emissiveBoost || 0.2;
                            if (child.material.emissive) {
                                child.material.emissive.setHex(0x222222);
                                child.material.emissiveIntensity = emBoost;
                            }
                        }
                    }
                    if (child.isSkinnedMesh) hasSkinnedMesh = true;
                    if (child.isLight) {
                        lightsToRemove.push(child);
                        console.log(`[WEAPON-GLB] Removing embedded light from ${weaponKey} ${type}: ${child.type}`);
                    }
                });
                
                // Store triangle count for performance analysis
                weaponGLBState.triangleCounts.set(cacheKey, {
                    triangles: totalTriangles,
                    vertices: totalVertices,
                    meshes: meshCount,
                    weaponKey: weaponKey,
                    type: type
                });
                console.log(`[WEAPON-GLB-TRIANGLES] ${weaponKey} ${type}: ${totalTriangles.toLocaleString()} triangles, ${totalVertices.toLocaleString()} vertices, ${meshCount} meshes`);
                
                lightsToRemove.forEach(light => {
                    if (light.parent) light.parent.remove(light);
                });
                
                // Calculate bounding box and center
                const box = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                
                // Target sizes for different types (in game units)
                const targetSizes = {
                    cannon: 80,  // Cannon size ~80 units (larger for visibility)
                    bullet: 20,  // Bullet size ~20 units
                    hitEffect: 50 // Hit effect size ~50 units
                };
                
                // ALWAYS normalize model to target size (not just for extreme cases)
                // This ensures models of any original size will be visible in the game
                const maxDimension = Math.max(size.x, size.y, size.z);
                const targetSize = targetSizes[type] || 80;
                let autoScale = 1;
                
                if (maxDimension > 0.001) {
                    // Always scale to target size
                    autoScale = targetSize / maxDimension;
                    // Clamp to reasonable range to avoid extreme values
                    autoScale = Math.max(0.01, Math.min(autoScale, 10000));
                }
                
                console.log(`[WEAPON-GLB] Normalizing ${type} for ${weaponKey}: original maxDim=${maxDimension.toFixed(4)}, target=${targetSize}, autoScale=${autoScale.toFixed(4)}`);
                
                // Apply auto-scale to model
                model.scale.multiplyScalar(autoScale);
                // Recalculate bounding box after scaling
                box.setFromObject(model);
                box.getCenter(center);
                box.getSize(size);
                
                // Create a wrapper group to preserve centering when external code sets position
                const wrapper = new THREE.Group();
                wrapper.name = `${weaponKey}_${type}_wrapper`;
                
                // Center the model within the wrapper
                model.position.sub(center);
                model.position.y += center.y; // Keep model on ground plane
                
                wrapper.add(model);
                
                // Apply rotation fix from config (corrects GLB model orientation to match game coordinate system)
                // This is applied AFTER centering so it doesn't affect bounding box calculations
                const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
                if (glbConfig) {
                    if ((type === 'cannon' || type === 'cannonNonPlayer') && glbConfig.cannonRotationFix) {
                        wrapper.rotation.copy(glbConfig.cannonRotationFix);
                        console.log(`[WEAPON-GLB] Applied cannon rotation fix for ${weaponKey}: y=${(glbConfig.cannonRotationFix.y * 180 / Math.PI).toFixed(1)}°`);
                    } else if (type === 'bullet' && glbConfig.bulletRotationFix) {
                        wrapper.rotation.copy(glbConfig.bulletRotationFix);
                    }
                }
                
                cache.set(cacheKey, wrapper);
                // Log with flat string values for easy debugging (no need to expand Array(3))
                console.log(`[WEAPON-GLB] Loaded ${type} for ${weaponKey}: size=[${size.toArray().map(v => v.toFixed(2)).join(',')}], center=[${center.toArray().map(v => v.toFixed(2)).join(',')}], meshCount=${meshCount}, autoScale=${autoScale.toFixed(4)}`);
                resolve(wrapper);
            },
            (xhr) => {
                if (xhr.total) {
                    const percent = (xhr.loaded / xhr.total * 100).toFixed(1);
                    console.log(`[WEAPON-GLB] Loading ${weaponKey} ${type}: ${percent}%`);
                }
            },
            (error) => {
                console.warn(`[WEAPON-GLB] Failed to load ${type} for ${weaponKey}:`, error.message);
                resolve(null);
            }
        );
    });
    
    weaponGLBState.loadingPromises.set(cacheKey, loadPromise);
    const model = await loadPromise;
    weaponGLBState.loadingPromises.delete(cacheKey);
    
    return model ? model.clone() : null;
}

async function preloadWeaponGLB(weaponKey) {
    if (weaponGLBState.preloadedWeapons.has(weaponKey)) {
        return;
    }
    
    console.log(`[WEAPON-GLB] Preloading weapon: ${weaponKey}`);
    
    await Promise.all([
        loadWeaponGLB(weaponKey, 'cannon'),
        loadWeaponGLB(weaponKey, 'bullet'),
        loadWeaponGLB(weaponKey, 'hitEffect')
    ]);
    
    // Pre-clone bullet models for the pool (PERFORMANCE: avoids async clone during fire())
    // Create 10 pre-cloned bullet models per weapon type for immediate use
    const BULLET_POOL_SIZE = 10;
    if (!weaponGLBState.bulletModelPool.has(weaponKey)) {
        weaponGLBState.bulletModelPool.set(weaponKey, []);
    }
    const pool = weaponGLBState.bulletModelPool.get(weaponKey);
    const cacheKey = `${weaponKey}_bullet`;
    if (weaponGLBState.bulletCache.has(cacheKey)) {
        const cachedModel = weaponGLBState.bulletCache.get(cacheKey);
        for (let i = pool.length; i < BULLET_POOL_SIZE; i++) {
            pool.push(cachedModel.clone());
        }
        console.log(`[WEAPON-GLB] Pre-cloned ${BULLET_POOL_SIZE} bullet models for ${weaponKey}`);
    }
    
    // PERFORMANCE: Pre-clone hit effect models (avoids clone on every hit)
    await preloadHitEffectPool(weaponKey);
    
    // PERFORMANCE: Pre-clone cannon model for instant weapon switching (no clone/dispose on switch)
    await preCloneCannonForInstantSwitch(weaponKey);
    
    weaponGLBState.preloadedWeapons.add(weaponKey);
    console.log(`[WEAPON-GLB] Preloaded weapon: ${weaponKey}`);
}

// Preload non-player (low-poly) cannon models for multiplayer
// These are optimized versions (~5k triangles) for other players' cannons
async function preloadNonPlayerCannons() {
    console.log('[WEAPON-GLB] Preloading non-player cannon models for multiplayer...');
    const weaponKeys = ['1x', '3x', '5x', '8x'];
    
    await Promise.all(weaponKeys.map(async (weaponKey) => {
        const model = await loadWeaponGLB(weaponKey, 'cannonNonPlayer');
        if (model) {
            console.log(`[WEAPON-GLB] Preloaded non-player cannon for ${weaponKey}`);
        }
    }));
    
    console.log('[WEAPON-GLB] Non-player cannon preloading complete');
}

// Get a non-player cannon model for multiplayer (returns cloned model)
async function getNonPlayerCannonModel(weaponKey) {
    const model = await loadWeaponGLB(weaponKey, 'cannonNonPlayer');
    return model;
}

// PERFORMANCE: Pre-clone cannon model and add to scene (hidden) for instant weapon switching
// This eliminates the clone() and dispose() overhead during weapon switch
async function preCloneCannonForInstantSwitch(weaponKey) {
    if (weaponGLBState.preClonedCannons.has(weaponKey)) {
        return; // Already pre-cloned
    }
    
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (!glbConfig) return;
    
    const cannonCacheKey = `${weaponKey}_cannon`;
    if (!weaponGLBState.cannonCache.has(cannonCacheKey)) {
        console.warn(`[WEAPON-GLB] Cannot pre-clone cannon for ${weaponKey}: not in cache`);
        return;
    }
    
    // Clone the cannon model
    const cannonModel = weaponGLBState.cannonCache.get(cannonCacheKey).clone();
    
    // Apply scale and position from config
    const scale = glbConfig.scale;
    cannonModel.scale.set(scale, scale, scale);
    const yOffset = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 20;
    cannonModel.position.set(0, yOffset, 0);
    
    // Start hidden - will be shown when weapon is selected
    cannonModel.visible = false;
    
    // Store reference
    weaponGLBState.preClonedCannons.set(weaponKey, cannonModel);
    
    console.log(`[WEAPON-GLB] Pre-cloned cannon for instant switch: ${weaponKey}`);
}

// PERFORMANCE: Warm up shaders by rendering each pre-cloned weapon once
// This compiles shaders ahead of time to avoid stutter on first weapon switch
function warmUpWeaponShaders() {
    if (weaponGLBState.shadersWarmedUp || !renderer || !scene || !camera) {
        return;
    }
    
    console.log('[WEAPON-GLB] Warming up weapon shaders...');
    
    // Temporarily show all pre-cloned cannons to compile their shaders
    const visibilityState = new Map();
    
    weaponGLBState.preClonedCannons.forEach((cannon, weaponKey) => {
        visibilityState.set(weaponKey, cannon.visible);
        cannon.visible = true;
        
        // Add to scene temporarily if not already added
        if (cannonBodyGroup && !cannonBodyGroup.children.includes(cannon)) {
            cannonBodyGroup.add(cannon);
        }
    });
    
    // Render one frame to compile shaders
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    
    // Clean up ALL non-pre-cloned (stale fallback) models from cannonBodyGroup
    // These were created by the initial buildCannonGeometryForWeapon('1x') before pre-cloning completed
    if (cannonBodyGroup) {
        const preClonedSet = new Set(weaponGLBState.preClonedCannons.values());
        for (let i = cannonBodyGroup.children.length - 1; i >= 0; i--) {
            const child = cannonBodyGroup.children[i];
            if (!preClonedSet.has(child)) {
                cannonBodyGroup.remove(child);
                disposeObject3D(child);
            }
        }
    }
    
    // After warmup, hide all cannons first
    weaponGLBState.preClonedCannons.forEach((cannon) => {
        cannon.visible = false;
    });
    
    // Then show only the currently selected weapon's cannon
    const currentWeapon = gameState.currentWeapon || '1x';
    const currentCannon = weaponGLBState.preClonedCannons.get(currentWeapon);
    if (currentCannon) {
        currentCannon.visible = true;
        cannonBarrel = currentCannon;
        weaponGLBState.currentWeaponModel = currentCannon;
        weaponGLBState.currentWeaponKey = currentWeapon;
        
        // Update muzzle position for current weapon
        const glbConfig = WEAPON_GLB_CONFIG.weapons[currentWeapon];
        if (cannonMuzzle && glbConfig && glbConfig.muzzleOffset) {
            cannonMuzzle.position.copy(glbConfig.muzzleOffset);
        }
        
        console.log(`[WEAPON-GLB] Shader warmup: showing current weapon ${currentWeapon}`);
    }
    
    weaponGLBState.shadersWarmedUp = true;
    console.log('[WEAPON-GLB] Shader warmup complete');
}

// Get a pre-cloned bullet model from the pool (synchronous, no async needed)
function getBulletModelFromPool(weaponKey) {
    const pool = weaponGLBState.bulletModelPool.get(weaponKey);
    if (pool && pool.length > 0) {
        return pool.pop();
    }
    // Fallback: clone from cache if pool is empty
    const cacheKey = `${weaponKey}_bullet`;
    if (weaponGLBState.bulletCache.has(cacheKey)) {
        return weaponGLBState.bulletCache.get(cacheKey).clone();
    }
    return null;
}

// Return a bullet model to the pool for reuse
function returnBulletModelToPool(weaponKey, model) {
    if (!model) return;
    let pool = weaponGLBState.bulletModelPool.get(weaponKey);
    if (!pool) {
        pool = [];
        weaponGLBState.bulletModelPool.set(weaponKey, pool);
    }
    // Limit pool size to prevent memory bloat
    if (pool.length < 20) {
        model.visible = false;
        pool.push(model);
    }
}

// PERFORMANCE: Hit effect pool management - avoids clone() on every hit
// Weapon-specific pool sizes based on fire rate and effect duration (800ms)
// Formula: shots/sec * bullets/shot * duration + buffer for aoe/chain multi-hit
const HIT_EFFECT_POOL_SIZES = {
    '1x': 8,   // 2 shots/sec * 1 bullet * 0.8s = 1.6 concurrent, buffer for safety
    '3x': 12,  // 1.5 shots/sec * 3 bullets * 0.8s = 3.6 concurrent, extra buffer
    '5x': 10,  // 2 shots/sec * 1 bullet * 0.8s = 1.6, but chain can hit multiple fish
    '8x': 12   // 2.5 shots/sec * 1 bullet * 0.8s = 2, but aoe can hit multiple fish
};

// Pool usage monitoring for debugging and optimization
const hitEffectPoolStats = {
    maxConcurrentByWeapon: { '1x': 0, '3x': 0, '5x': 0, '8x': 0 },
    exhaustionCountByWeapon: { '1x': 0, '3x': 0, '5x': 0, '8x': 0 },
    lastExhaustedAt: null
};

// Get pool stats for debugging
function getHitEffectPoolStats() {
    return {
        ...hitEffectPoolStats,
        poolSizes: HIT_EFFECT_POOL_SIZES,
        currentUsage: {}
    };
}

// Temp vectors for hit effect calculations - reused to avoid per-hit allocations
const hitEffectTempVectors = {
    dir: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    rotationFixQuat: new THREE.Quaternion()
};

// Get a pre-cloned hit effect from pool (synchronous, no async/clone needed)
function getHitEffectFromPool(weaponKey) {
    const pool = weaponGLBState.hitEffectPool.get(weaponKey);
    if (!pool) return null;
    
    // Count current usage for monitoring
    let inUseCount = 0;
    let availableItem = null;
    
    for (const item of pool) {
        if (item.inUse) {
            inUseCount++;
        } else if (!availableItem) {
            availableItem = item;
        }
    }
    
    // Update max concurrent stats
    if (inUseCount + 1 > hitEffectPoolStats.maxConcurrentByWeapon[weaponKey]) {
        hitEffectPoolStats.maxConcurrentByWeapon[weaponKey] = inUseCount + 1;
    }
    
    if (availableItem) {
        availableItem.inUse = true;
        availableItem.model.visible = true;
        return availableItem;
    }
    
    // Pool exhausted - track for monitoring
    hitEffectPoolStats.exhaustionCountByWeapon[weaponKey]++;
    hitEffectPoolStats.lastExhaustedAt = Date.now();
    return null;
}

// Return hit effect to pool for reuse (no dispose!)
function returnHitEffectToPool(weaponKey, item) {
    if (!item) return;
    
    // Reset state for reuse
    item.inUse = false;
    item.model.visible = false;
    
    item.materials.forEach((mat) => {
        mat.opacity = 0.5;
        mat.transparent = true;
    });
    
    // Reset scale to initial
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (glbConfig) {
        const scale = glbConfig.hitEffectScale;
        item.model.scale.set(scale, scale, scale);
    }
}

// Pre-clone hit effects during preload (called from preloadWeaponGLB)
async function preloadHitEffectPool(weaponKey) {
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (!glbConfig) return;
    
    const cacheKey = `${weaponKey}_hitEffect`;
    if (!weaponGLBState.hitEffectCache.has(cacheKey)) {
        // Load the hit effect first
        await loadWeaponGLB(weaponKey, 'hitEffect');
    }
    
    const cachedModel = weaponGLBState.hitEffectCache.get(cacheKey);
    if (!cachedModel) return;
    
    // Initialize pool for this weapon
    if (!weaponGLBState.hitEffectPool.has(weaponKey)) {
        weaponGLBState.hitEffectPool.set(weaponKey, []);
    }
    
    const pool = weaponGLBState.hitEffectPool.get(weaponKey);
    const scale = glbConfig.hitEffectScale;
    const poolSize = HIT_EFFECT_POOL_SIZES[weaponKey] || 8;
    
    // Pre-clone hit effect models
    for (let i = pool.length; i < poolSize; i++) {
        const model = cachedModel.clone();
        model.visible = false;
        model.scale.set(scale, scale, scale);
        
        // Pre-clone materials and store references (avoid traverse on hit)
        const materials = [];
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                materials.push(child.material);
                // Pre-set DoubleSide for planar effects
                if (glbConfig.hitEffectPlanar) {
                    child.material.side = THREE.DoubleSide;
                }
            }
        });
        
        pool.push({
            model: model,
            materials: materials,
            inUse: false,
            weaponKey: weaponKey
        });
    }
    
    console.log(`[WEAPON-GLB] Pre-cloned ${poolSize} hit effects for ${weaponKey}`);
}

async function preloadAllWeapons() {
    console.log('[WEAPON-GLB] Starting preload of all weapons...');
    
    // PERFORMANCE: Preload all weapons synchronously (not with setTimeout delays)
    // This ensures all weapons are ready before the game starts, eliminating first-switch lag
    await preloadWeaponGLB('1x');
    await preloadWeaponGLB('3x');
    await preloadWeaponGLB('5x');
    await preloadWeaponGLB('8x');
    
    console.log('[WEAPON-GLB] All weapons preloaded, warming up shaders...');
    
    // PERFORMANCE: Warm up shaders after all weapons are preloaded
    // This compiles shaders ahead of time to avoid stutter on first weapon switch
    // Note: warmUpWeaponShaders() needs renderer/scene/camera to be ready
    // It will be called again from init() if not ready here
    warmUpWeaponShaders();
    
    // ROBUST FIX: Re-initialize the current weapon using the pre-cloned path
    // This definitively fixes cannon visibility regardless of race conditions with
    // the initial buildCannonGeometryForWeapon('1x') call during init
    const currentWeapon = gameState.currentWeapon || '1x';
    if (weaponGLBState.preClonedCannons.has(currentWeapon)) {
        buildCannonGeometryForWeapon(currentWeapon);
        console.log(`[WEAPON-GLB] Re-initialized ${currentWeapon} cannon after preload`);
    }
}

function getWeaponGLBStats() {
    return {
        enabled: weaponGLBState.enabled,
        cachedCannons: weaponGLBState.cannonCache.size,
        cachedBullets: weaponGLBState.bulletCache.size,
        cachedHitEffects: weaponGLBState.hitEffectCache.size,
        preloadedWeapons: Array.from(weaponGLBState.preloadedWeapons),
        pendingLoads: weaponGLBState.loadingPromises.size
    };
}

// ==================== PERFORMANCE OPTIMIZATION CONFIG ====================
const PERFORMANCE_CONFIG = {
    // Graphics quality presets (low/medium/high)
    graphicsQuality: {
        // Pixel ratio limits for each quality level
        pixelRatio: {
            low: 0.75,
            medium: 1.0,
            high: 1.5
        },
        // Texture anisotropy for each quality level
        textureAnisotropy: {
            low: 1,
            medium: 2,
            high: 4
        },
        // Whether to enable shadows for each quality level
        shadowsEnabled: {
            low: false,
            medium: true,
            high: true
        },
        // Shadow map type for each quality level
        shadowMapType: {
            low: 'basic',      // No shadows
            medium: 'pcf',     // THREE.PCFShadowMap
            high: 'pcfsoft'    // THREE.PCFSoftShadowMap
        },
        // Number of lights for each quality level
        lightCount: {
            low: 2,      // Ambient + 1 main light
            medium: 3,   // Ambient + main + 1 side
            high: 5      // All lights
        }
    },
    // LOD (Level of Detail) settings
    lod: {
        highDetailDistance: 300,    // Full detail within 300 units
        mediumDetailDistance: 600,  // Medium detail 300-600 units
        lowDetailDistance: 1200,    // Low detail 600-1200 units
        maxRenderDistance: 2500     // Max render distance (beyond this = invisible)
                                    // Aquarium is 1800x900x1200, so 2500 covers diagonal
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
        off: 0,
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
    activeParticleCount: 0,
    graphicsQuality: 'medium',  // 'low', 'medium', or 'high'
    // PERFORMANCE: Shadow update throttling
    shadowUpdateTimer: 0,
    shadowUpdateInterval: 0.1,  // Update shadows every 100ms instead of every frame
    // PERFORMANCE: LOD state tracking
    lodHighCount: 0,
    lodMediumCount: 0,
    lodLowCount: 0
};

// PERFORMANCE: Pre-allocated frustum and matrix for culling (avoid per-frame allocation)
const frustumCullingCache = {
    frustum: new THREE.Frustum(),
    projScreenMatrix: new THREE.Matrix4()
};

// ==================== OPTIMIZATION 1: OBJECT POOLING SYSTEM ====================
// Reduces GC pressure by reusing objects instead of creating/destroying them

// Coin Pool - Pre-created coin objects for fish death effects
const coinPool = {
    pool: [],
    poolSize: 50,
    freeList: [],
    initialized: false
};

// Effect Pool - Pre-created effect objects (explosions, water splashes, etc.)
const effectPool = {
    pool: [],
    poolSize: 10,
    freeList: [],
    maxConcurrent: 10,
    initialized: false
};

// Initialize coin pool
function initCoinPool() {
    if (coinPool.initialized) return;
    
    const geometry = new THREE.CylinderGeometry(8, 8, 3, 8);
    
    for (let i = 0; i < coinPool.poolSize; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffd700,
            transparent: true,
            opacity: 1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.rotation.x = Math.PI / 2;
        
        const coinItem = {
            mesh: mesh,
            material: material,
            velocity: new THREE.Vector3(),
            inUse: false,
            elapsedTime: 0,
            poolIndex: i
        };
        
        coinPool.pool.push(coinItem);
        coinPool.freeList.push(i);
    }
    
    coinPool.initialized = true;
}

// Get coin from pool
function getCoinFromPool() {
    if (!coinPool.initialized) initCoinPool();
    
    if (coinPool.freeList.length > 0) {
        const idx = coinPool.freeList.pop();
        const item = coinPool.pool[idx];
        item.inUse = true;
        item.elapsedTime = 0;
        item.material.opacity = 1;
        item.mesh.scale.setScalar(1);
        return item;
    }
    
    return null;
}

// Return coin to pool
function returnCoinToPool(item) {
    if (!item || !item.inUse) return;
    
    item.inUse = false;
    item.mesh.visible = false;
    if (item.mesh.parent) {
        item.mesh.parent.remove(item.mesh);
    }
    coinPool.freeList.push(item.poolIndex);
}

// Initialize effect pool
function initEffectPool() {
    if (effectPool.initialized) return;
    
    const sphereGeometry = new THREE.SphereGeometry(15, 8, 8);
    
    for (let i = 0; i < effectPool.poolSize; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.8
        });
        const mesh = new THREE.Mesh(sphereGeometry, material);
        mesh.visible = false;
        
        const effectItem = {
            mesh: mesh,
            material: material,
            inUse: false,
            elapsedTime: 0,
            poolIndex: i,
            type: 'explosion'
        };
        
        effectPool.pool.push(effectItem);
        effectPool.freeList.push(i);
    }
    
    effectPool.initialized = true;
}

// Get effect from pool
function getEffectFromPool() {
    if (!effectPool.initialized) initEffectPool();
    
    // Enforce max concurrent limit
    const inUseCount = effectPool.pool.filter(e => e.inUse).length;
    if (inUseCount >= effectPool.maxConcurrent) {
        return null;
    }
    
    if (effectPool.freeList.length > 0) {
        const idx = effectPool.freeList.pop();
        const item = effectPool.pool[idx];
        item.inUse = true;
        item.elapsedTime = 0;
        item.material.opacity = 0.8;
        item.mesh.scale.setScalar(1);
        return item;
    }
    
    return null;
}

// Return effect to pool
function returnEffectToPool(item) {
    if (!item || !item.inUse) return;
    
    item.inUse = false;
    item.mesh.visible = false;
    if (item.mesh.parent) {
        item.mesh.parent.remove(item.mesh);
    }
    effectPool.freeList.push(item.poolIndex);
}

// ==================== LOD SYSTEM REMOVED ====================
// LOD was removed in PR #103 because it modified shared materials,
// causing all fish to be affected when any fish's LOD changed.
// DO NOT RE-IMPLEMENT without cloning materials per fish instance.

// ==================== OPTIMIZATION 3: SHARED GEOMETRIES & MATERIALS ====================
// Same fish types share geometry and materials to reduce memory

const SHARED_GEOMETRIES = {};
const SHARED_MATERIALS = {};

// Get or create shared geometry for fish type
function getSharedGeometry(fishType, size) {
    const key = `${fishType}_${Math.round(size)}`;
    
    if (!SHARED_GEOMETRIES[key]) {
        // Create geometry based on fish type
        switch (fishType) {
            case 'sardine':
            case 'anchovy':
                SHARED_GEOMETRIES[key] = new THREE.SphereGeometry(size * 0.4, 8, 6);
                break;
            case 'shark':
            case 'whale':
                SHARED_GEOMETRIES[key] = new THREE.SphereGeometry(size * 0.5, 12, 8);
                break;
            default:
                SHARED_GEOMETRIES[key] = new THREE.SphereGeometry(size * 0.45, 10, 7);
        }
    }
    
    return SHARED_GEOMETRIES[key];
}

// Get or create shared material for fish color
function getSharedMaterial(color, metalness, roughness) {
    const key = `${color}_${metalness}_${roughness}`;
    
    if (!SHARED_MATERIALS[key]) {
        SHARED_MATERIALS[key] = new THREE.MeshStandardMaterial({
            color: color,
            metalness: metalness || 0.3,
            roughness: roughness || 0.2
        });
    }
    
    return SHARED_MATERIALS[key];
}

// ==================== OPTIMIZATION 4: BATCH FISH ANIMATION UPDATES ====================
// Distribute fish updates across multiple frames to reduce per-frame workload

const BATCH_UPDATE_CONFIG = {
    batchCount: 4,              // Divide fish into 4 batches
    currentBatch: 0,            // Current batch being updated
    frameCounter: 0,
    distanceUpdateThreshold: 50, // Fish beyond this distance update less frequently
    farFishUpdateInterval: 3     // Far fish update every 3 frames
};

// Get batch index for a fish based on its pool index
function getFishBatchIndex(fishIndex) {
    return fishIndex % BATCH_UPDATE_CONFIG.batchCount;
}

// Check if fish should update this frame
function shouldFishUpdateThisFrame(fishIndex, distance) {
    const batchIndex = getFishBatchIndex(fishIndex);
    const isCurrentBatch = batchIndex === BATCH_UPDATE_CONFIG.currentBatch;
    
    // Near fish always update when it's their batch turn
    if (distance < BATCH_UPDATE_CONFIG.distanceUpdateThreshold) {
        return isCurrentBatch;
    }
    
    // Far fish update less frequently
    return isCurrentBatch && 
           (BATCH_UPDATE_CONFIG.frameCounter % BATCH_UPDATE_CONFIG.farFishUpdateInterval === 0);
}

// Advance to next batch (called each frame)
function advanceFishBatch() {
    BATCH_UPDATE_CONFIG.frameCounter++;
    BATCH_UPDATE_CONFIG.currentBatch = 
        (BATCH_UPDATE_CONFIG.currentBatch + 1) % BATCH_UPDATE_CONFIG.batchCount;
}

// Get pool stats for debugging
function getPoolStats() {
    return {
        coinPool: {
            total: coinPool.poolSize,
            free: coinPool.freeList.length,
            inUse: coinPool.poolSize - coinPool.freeList.length
        },
        effectPool: {
            total: effectPool.poolSize,
            free: effectPool.freeList.length,
            inUse: effectPool.poolSize - effectPool.freeList.length,
            maxConcurrent: effectPool.maxConcurrent
        },
        sharedGeometries: Object.keys(SHARED_GEOMETRIES).length,
        sharedMaterials: Object.keys(SHARED_MATERIALS).length,
        lodConfig: LOD_CONFIG,
        batchConfig: BATCH_UPDATE_CONFIG
    };
}

// ==================== FISH BEHAVIOR SYSTEM ====================
// Smooth value noise for natural swimming paths
// Uses hash-based approach for performance (no allocations)

// Simple hash function for noise
function hashNoise(x, y, z) {
    // Fast integer hash
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h & 0x7fffffff) / 0x7fffffff; // 0 to 1
}

// Smooth interpolation (smoothstep)
function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

// 3D Value noise with smooth interpolation
// Returns value in range [-1, 1]
function valueNoise3D(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = smoothstep(x - xi);
    const yf = smoothstep(y - yi);
    const zf = smoothstep(z - zi);
    
    // Sample 8 corners of the cube
    const c000 = hashNoise(xi, yi, zi);
    const c100 = hashNoise(xi + 1, yi, zi);
    const c010 = hashNoise(xi, yi + 1, zi);
    const c110 = hashNoise(xi + 1, yi + 1, zi);
    const c001 = hashNoise(xi, yi, zi + 1);
    const c101 = hashNoise(xi + 1, yi, zi + 1);
    const c011 = hashNoise(xi, yi + 1, zi + 1);
    const c111 = hashNoise(xi + 1, yi + 1, zi + 1);
    
    // Trilinear interpolation
    const c00 = c000 + xf * (c100 - c000);
    const c10 = c010 + xf * (c110 - c010);
    const c01 = c001 + xf * (c101 - c001);
    const c11 = c011 + xf * (c111 - c011);
    const c0 = c00 + yf * (c10 - c00);
    const c1 = c01 + yf * (c11 - c01);
    
    return (c0 + zf * (c1 - c0)) * 2 - 1; // Map to [-1, 1]
}

// 2D Value noise (for horizontal wander)
function valueNoise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smoothstep(x - xi);
    const yf = smoothstep(y - yi);
    
    const c00 = hashNoise(xi, yi, 0);
    const c10 = hashNoise(xi + 1, yi, 0);
    const c01 = hashNoise(xi, yi + 1, 0);
    const c11 = hashNoise(xi + 1, yi + 1, 0);
    
    const c0 = c00 + xf * (c10 - c00);
    const c1 = c01 + xf * (c11 - c01);
    
    return (c0 + yf * (c1 - c0)) * 2 - 1;
}

// Fish behavior configuration by category
// Each species can override these defaults
const FISH_BEHAVIOR_CONFIG = {
    // Depth bands (Y coordinates relative to tank)
    // Tank: floorY=-450, height=900, so range is -450 to 450
    depthBands: {
        surface: { min: 100, max: 350 },      // Near top (flying fish, mahi-mahi)
        midWater: { min: -100, max: 150 },    // Middle (medium predators)
        reef: { min: -280, max: -50 },        // Reef zone (coral reef fish, small schooling fish)
        bottom: { min: -350, max: -150 },     // Near bottom (grouper, seahorse)
        fullColumn: { min: -300, max: 300 }   // Anywhere (large predators)
    },
    
    // Default behavior parameters by category
    categoryDefaults: {
        largePredator: {
            depthBand: 'fullColumn',
            verticalAmplitude: 40,      // Gentle up-down
            noiseScale: 0.003,          // Very slow wander
            noiseDrift: 0.15,           // Slow time evolution
            wanderStrength: 15          // Gentle steering
        },
        mediumLarge: {
            depthBand: 'midWater',
            verticalAmplitude: 30,
            noiseScale: 0.005,
            noiseDrift: 0.25,
            wanderStrength: 25
        },
        reefFish: {
            depthBand: 'reef',           // FIX: Changed from midWater to reef - coral reef fish should swim near the reef
            verticalAmplitude: 20,
            noiseScale: 0.008,
            noiseDrift: 0.4,
            wanderStrength: 35
        },
        smallSchool: {
            depthBand: 'reef',           // FIX: Changed from midWater to reef - schooling fish should swim near the reef
            verticalAmplitude: 25,
            noiseScale: 0.01,
            noiseDrift: 0.5,
            wanderStrength: 40
        },
        specialForm: {
            depthBand: 'midWater',
            verticalAmplitude: 15,
            noiseScale: 0.004,
            noiseDrift: 0.2,
            wanderStrength: 20
        }
    },
    
    // Species-specific overrides
    speciesOverrides: {
        // Bottom dwellers
        grouper: { depthBand: 'bottom', verticalAmplitude: 10 },
        seahorse: { depthBand: 'bottom', verticalAmplitude: 8 },
        // Surface dwellers
        mahiMahi: { depthBand: 'surface', verticalAmplitude: 35 },
        // Full column predators
        blueWhale: { depthBand: 'fullColumn', verticalAmplitude: 60, noiseScale: 0.002 },
        greatWhiteShark: { depthBand: 'fullColumn', verticalAmplitude: 45 },
        marlin: { depthBand: 'fullColumn', verticalAmplitude: 40 },
        // Manta ray - graceful glider
        mantaRay: { depthBand: 'midWater', verticalAmplitude: 50, noiseScale: 0.003 }
    }
};

// Get behavior config for a fish species
function getFishBehaviorConfig(species, category) {
    const defaults = FISH_BEHAVIOR_CONFIG.categoryDefaults[category] || FISH_BEHAVIOR_CONFIG.categoryDefaults.reefFish;
    const overrides = FISH_BEHAVIOR_CONFIG.speciesOverrides[species] || {};
    return { ...defaults, ...overrides };
}

// Get depth band bounds
function getDepthBandBounds(bandName) {
    return FISH_BEHAVIOR_CONFIG.depthBands[bandName] || FISH_BEHAVIOR_CONFIG.depthBands.midWater;
}

// ==================== LEADER-FOLLOWER SCHOOLING SYSTEM ====================
// For tight schooling fish (sardine, anchovy), assign leaders that followers track
// This creates more cohesive school movement than pure boids

// Track school leaders by tier (species)
const schoolLeaders = new Map();

// Get or assign a leader for a school of fish of the same tier
function getSchoolLeader(tier, allFish) {
    // Check if we have a valid leader
    const existingLeader = schoolLeaders.get(tier);
    if (existingLeader && existingLeader.isActive) {
        return existingLeader;
    }
    
    // Find a new leader from active fish of this tier
    for (let i = 0; i < allFish.length; i++) {
        const fish = allFish[i];
        if (fish.isActive && fish.tier === tier) {
            schoolLeaders.set(tier, fish);
            fish.isSchoolLeader = true;
            return fish;
        }
    }
    
    return null;
}

// Clear school leader when fish dies or despawns
function clearSchoolLeader(fish) {
    if (fish.isSchoolLeader) {
        schoolLeaders.delete(fish.tier);
        fish.isSchoolLeader = false;
    }
}

// ==================== SPATIAL HASH FOR BOIDS OPTIMIZATION ====================
// Cell size should be >= cohesionDistance (180) for correct neighbor lookup
const SPATIAL_HASH_CELL_SIZE = 180;
const spatialHashGrid = new Map();

// Pre-allocated temporary vectors for Fish.update() to avoid allocations
const fishTempVectors = {
    acceleration: new THREE.Vector3(),
    boundaryForce: new THREE.Vector3()
};

// Clear and rebuild spatial hash grid
function rebuildSpatialHash(fishArray) {
    spatialHashGrid.clear();
    for (let i = 0; i < fishArray.length; i++) {
        const fish = fishArray[i];
        if (!fish.isActive) continue;
        
        const pos = fish.group.position;
        const cellX = Math.floor(pos.x / SPATIAL_HASH_CELL_SIZE);
        const cellY = Math.floor(pos.y / SPATIAL_HASH_CELL_SIZE);
        const cellZ = Math.floor(pos.z / SPATIAL_HASH_CELL_SIZE);
        const key = `${cellX},${cellY},${cellZ}`;
        
        if (!spatialHashGrid.has(key)) {
            spatialHashGrid.set(key, []);
        }
        spatialHashGrid.get(key).push(fish);
    }
}

// Get nearby fish from spatial hash (checks current cell + 26 neighbors)
function getNearbyFish(fish) {
    const pos = fish.group.position;
    const cellX = Math.floor(pos.x / SPATIAL_HASH_CELL_SIZE);
    const cellY = Math.floor(pos.y / SPATIAL_HASH_CELL_SIZE);
    const cellZ = Math.floor(pos.z / SPATIAL_HASH_CELL_SIZE);
    
    const nearby = [];
    // Check 3x3x3 cube of cells (current + 26 neighbors)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
                const cell = spatialHashGrid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        nearby.push(cell[i]);
                    }
                }
            }
        }
    }
    return nearby;
}

// PERFORMANCE: Get nearby fish for bullet collision using spatial hash
// This reduces bullet collision from O(bullets * fish) to O(bullets * k) where k is nearby fish
// FIX: Query both lastPos and currentPos to prevent bullets skipping fish at low FPS
// When bullet moves fast (low FPS), the segment lastPos->currentPos can span multiple cells.
// Querying only currentPos could miss fish near lastPos that the segment passes through.
function getNearbyFishForBullet(lastPos, currentPos) {
    const cellX0 = Math.floor(lastPos.x / SPATIAL_HASH_CELL_SIZE);
    const cellY0 = Math.floor(lastPos.y / SPATIAL_HASH_CELL_SIZE);
    const cellZ0 = Math.floor(lastPos.z / SPATIAL_HASH_CELL_SIZE);
    const cellX1 = Math.floor(currentPos.x / SPATIAL_HASH_CELL_SIZE);
    const cellY1 = Math.floor(currentPos.y / SPATIAL_HASH_CELL_SIZE);
    const cellZ1 = Math.floor(currentPos.z / SPATIAL_HASH_CELL_SIZE);
    
    const minCX = Math.min(cellX0, cellX1) - 1;
    const maxCX = Math.max(cellX0, cellX1) + 1;
    const minCY = Math.min(cellY0, cellY1) - 1;
    const maxCY = Math.max(cellY0, cellY1) + 1;
    const minCZ = Math.min(cellZ0, cellZ1) - 1;
    const maxCZ = Math.max(cellZ0, cellZ1) + 1;
    
    const nearby = [];
    const seen = new Set();
    for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                const key = `${cx},${cy},${cz}`;
                const cell = spatialHashGrid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        const fish = cell[i];
                        if (!seen.has(fish)) {
                            seen.add(fish);
                            nearby.push(fish);
                        }
                    }
                }
            }
        }
    }
    return nearby;
}

function getNearbyFishAtPosition(pos) {
    const cellX = Math.floor(pos.x / SPATIAL_HASH_CELL_SIZE);
    const cellY = Math.floor(pos.y / SPATIAL_HASH_CELL_SIZE);
    const cellZ = Math.floor(pos.z / SPATIAL_HASH_CELL_SIZE);
    
    const nearby = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
                const cell = spatialHashGrid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        nearby.push(cell[i]);
                    }
                }
            }
        }
    }
    return nearby;
}

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
// NOTE: COMBO is now visual-only - no monetary bonus to ensure RTP compliance
function updateComboOnKill() {
    gameState.comboCount++;
    gameState.comboTimer = COMBO_CONFIG.timeWindow;
    
    const { bonus, tierName } = getComboBonus(gameState.comboCount);
    
    // Show combo notification if we hit a new tier (visual feedback only)
    if (bonus > gameState.lastComboBonus && tierName) {
        showComboNotification(tierName, bonus);
        gameState.lastComboBonus = bonus;
    }
    
    // Return 0 instead of bonus - COMBO no longer affects rewards for RTP compliance
    // Visual effects (notifications) still work, but no monetary multiplier
    return 0;
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

// Show combo notification - DISABLED: notifications hidden per user request
// The combo system still tracks kills internally but no longer shows visual notifications
function showComboNotification(tierName, bonus) {
    // Combo notifications disabled - return early without showing anything
    return;
}

// Show combo end notification - DISABLED: notifications hidden per user request
function showComboEndNotification(finalCount) {
    // Combo end notifications disabled - return early without showing anything
    return;
}

// ==================== PERFORMANCE OPTIMIZATION FUNCTIONS ====================

// FIX: Helper function to recursively set mesh visibility
// This handles nested wrapper structures like Manta Ray's mantaCorrectionWrapper -> mantaPitchWrapper -> meshes
function setMeshVisibilityRecursive(object, visible, exceptMesh = null) {
    if (!object) return;
    
    if (object.isMesh) {
        if (object !== exceptMesh) {
            object.visible = visible;
        }
    }
    
    if (object.children && object.children.length > 0) {
        for (let i = 0; i < object.children.length; i++) {
            setMeshVisibilityRecursive(object.children[i], visible, exceptMesh);
        }
    }
}

// FIX: Helper function to recursively dispose mesh geometries in a subtree
// This properly cleans up nested structures like Manta Ray when GLB model loads
// Note: Does NOT dispose materials as they are cached and shared across fish
function disposeMeshSubtreeGeometries(object) {
    if (!object) return;
    
    if (object.isMesh && object.geometry) {
        object.geometry.dispose();
    }
    
    if (object.children && object.children.length > 0) {
        for (let i = 0; i < object.children.length; i++) {
            disposeMeshSubtreeGeometries(object.children[i]);
        }
    }
}

// Update frustum culling and LOD for fish
function updatePerformanceOptimizations(deltaTime) {
    if (!camera) return;
    
    performanceState.frustumCullTimer -= deltaTime;
    
    if (performanceState.frustumCullTimer <= 0) {
        performanceState.frustumCullTimer = PERFORMANCE_CONFIG.frustumCulling.updateInterval;
        
        // PERFORMANCE: Reuse pre-allocated frustum and matrix (avoid per-frame allocation)
        frustumCullingCache.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustumCullingCache.frustum.setFromProjectionMatrix(frustumCullingCache.projScreenMatrix);
        
        let visibleCount = 0;
        let culledCount = 0;
        let lodHighCount = 0;
        let lodMediumCount = 0;
        let lodLowCount = 0;
        
        const cameraPos = camera.position;
        const camX = cameraPos.x;
        const camY = cameraPos.y;
        const camZ = cameraPos.z;
        const lod = PERFORMANCE_CONFIG.lod;
        const frustum = frustumCullingCache.frustum;
        
        // PERFORMANCE: Pre-compute squared distances ONCE outside the loop
        const highDistSq = lod.highDetailDistance * lod.highDetailDistance;
        const medDistSq = lod.mediumDetailDistance * lod.mediumDetailDistance;
        const lowDistSq = lod.lowDetailDistance * lod.lowDetailDistance;
        const maxRenderDistSq = lod.maxRenderDistance * lod.maxRenderDistance;
        const frustumEnabled = PERFORMANCE_CONFIG.frustumCulling.enabled;
        const fishCount = activeFish.length;
        
        // Update fish visibility and LOD
        for (let i = 0; i < fishCount; i++) {
            const fish = activeFish[i];
            if (!fish || !fish.group) continue;
            
            const fishPos = fish.group.position;
            
            // PERFORMANCE: Calculate distance squared to avoid sqrt (faster comparison)
            const dx = fishPos.x - camX;
            const dy = fishPos.y - camY;
            const dz = fishPos.z - camZ;
            const distanceSquared = dx * dx + dy * dy + dz * dz;
            
            // PERFORMANCE: Distance-based culling - hide fish beyond max render distance
            // Fish beyond maxRenderDistance are invisible (saves GPU draw calls)
            // Fish within maxRenderDistance but beyond lowDetailDistance use lowest LOD
            if (distanceSquared > maxRenderDistSq) {
                fish.group.visible = false;
                fish.currentLodLevel = 3; // Mark as culled
                culledCount++;
                continue;
            }
            
            // Frustum culling - hide fish outside view
            if (frustumEnabled) {
                const inFrustum = frustum.containsPoint(fishPos);
                fish.group.visible = fish.isActive && inFrustum;
                
                if (inFrustum) {
                    visibleCount++;
                } else {
                    fish.currentLodLevel = 3; // Mark as culled
                    culledCount++;
                    continue;  // Skip LOD processing for culled fish
                }
            }
            
            // PERFORMANCE: Stateful LOD - determine new LOD level
            let newLodLevel;
            if (distanceSquared < highDistSq) {
                newLodLevel = 0; // High detail
            } else if (distanceSquared < medDistSq) {
                newLodLevel = 1; // Medium detail
            } else {
                newLodLevel = 2; // Low detail
            }
            
            // PERFORMANCE: Only update LOD if level changed (stateful optimization)
            if (fish.group.visible && fish.body && fish.currentLodLevel !== newLodLevel) {
                fish.currentLodLevel = newLodLevel;
                const children = fish.group.children;
                const childCount = children.length;
                
                if (newLodLevel === 0) {
                    // High detail - full shadows
                    // FIX: Removed flatShading modification - it was modifying shared cached materials
                    // which caused all fish using the same material to be affected
                    fish.body.castShadow = true;
                    // PERFORMANCE: Show all child meshes at high detail
                    // FIX: Use recursive helper to handle nested wrappers (e.g., Manta Ray)
                    setMeshVisibilityRecursive(fish.group, true);
                } else if (newLodLevel === 1) {
                    // Medium detail - no shadows
                    // FIX: Removed flatShading modification - shared materials issue
                    fish.body.castShadow = false;
                    // PERFORMANCE: Show all meshes at medium detail (simplified from size-based hiding)
                    // FIX: Use recursive helper to handle nested wrappers
                    setMeshVisibilityRecursive(fish.group, true);
                } else {
                    // Low detail - no shadows, minimal geometry
                    // FIX: Removed flatShading modification - shared materials issue
                    fish.body.castShadow = false;
                    // PERFORMANCE: Only show body at low detail
                    // FIX: Use recursive helper to handle nested wrappers
                    setMeshVisibilityRecursive(fish.group, false, fish.body);
                }
            }
            
            // Count LOD levels
            if (fish.currentLodLevel === 0) lodHighCount++;
            else if (fish.currentLodLevel === 1) lodMediumCount++;
            else if (fish.currentLodLevel === 2) lodLowCount++;
        }
        
        performanceState.visibleFishCount = visibleCount;
        performanceState.culledFishCount = culledCount;
        performanceState.lodHighCount = lodHighCount;
        performanceState.lodMediumCount = lodMediumCount;
        performanceState.lodLowCount = lodLowCount;
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

// PERFORMANCE: Throttled shadow update - only update shadows every N frames
// This significantly reduces GPU load since shadow map rendering is expensive
let shadowUpdateFrameCounter = 0;
const SHADOW_UPDATE_FRAME_INTERVAL = 3;  // Update shadows every 3 frames (20 FPS shadow updates at 60 FPS)

function updateThrottledShadows(deltaTime) {
    if (!renderer) return;
    
    shadowUpdateFrameCounter++;
    
    // Only update shadows every N frames
    if (shadowUpdateFrameCounter >= SHADOW_UPDATE_FRAME_INTERVAL) {
        shadowUpdateFrameCounter = 0;
        
        // Enable shadow map for this frame
        renderer.shadowMap.autoUpdate = true;
        renderer.shadowMap.needsUpdate = true;
    } else {
        // Skip shadow map update for this frame
        renderer.shadowMap.autoUpdate = false;
    }
}

// ==================== GRAPHICS QUALITY SYSTEM ====================
// Set overall graphics quality (low/medium/high)
function setGraphicsQuality(quality) {
    if (!['low', 'medium', 'high'].includes(quality)) {
        console.warn('[PERF] Invalid quality level:', quality);
        return;
    }
    
    performanceState.graphicsQuality = quality;
    console.log(`[PERF] Setting graphics quality to: ${quality}`);
    
    // Apply all quality-dependent settings
    updateRendererPixelRatio();
    updateShadowSettings();
    
    // Save preference to localStorage
    try {
        localStorage.setItem('graphicsQuality', quality);
    } catch (e) {
        console.warn('[PERF] Could not save graphics quality preference');
    }
}

// Load saved graphics quality preference
function loadGraphicsQualityPreference() {
    try {
        const saved = localStorage.getItem('graphicsQuality');
        if (saved && ['low', 'medium', 'high'].includes(saved)) {
            performanceState.graphicsQuality = saved;
            console.log(`[PERF] Loaded saved graphics quality: ${saved}`);
        }
    } catch (e) {
        console.warn('[PERF] Could not load graphics quality preference');
    }
}

// Update renderer pixel ratio based on quality
function updateRendererPixelRatio() {
    if (!renderer) return;
    
    const quality = performanceState.graphicsQuality;
    const baseRatio = window.devicePixelRatio || 1;
    const maxRatio = PERFORMANCE_CONFIG.graphicsQuality.pixelRatio[quality] || 1.0;
    
    const ratio = Math.min(baseRatio, maxRatio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    console.log(`[PERF] Pixel ratio set to ${ratio.toFixed(2)} (quality: ${quality})`);
}

// Update shadow settings based on quality
function updateShadowSettings() {
    if (!renderer) return;
    
    const quality = performanceState.graphicsQuality;
    const shadowsEnabled = PERFORMANCE_CONFIG.graphicsQuality.shadowsEnabled[quality];
    const shadowMapType = PERFORMANCE_CONFIG.graphicsQuality.shadowMapType[quality];
    
    // Enable/disable shadows globally
    renderer.shadowMap.enabled = shadowsEnabled;
    
    // Set shadow map type
    if (shadowsEnabled) {
        if (shadowMapType === 'pcfsoft') {
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        } else {
            renderer.shadowMap.type = THREE.PCFShadowMap;
        }
    }
    
    // Update shadow map size
    const shadowSize = shadowsEnabled ? PERFORMANCE_CONFIG.shadowMap[quality] : 0;
    scene.traverse(obj => {
        if (obj.isLight && obj.shadow) {
            obj.castShadow = shadowsEnabled;
            if (shadowsEnabled) {
                obj.shadow.mapSize.width = shadowSize;
                obj.shadow.mapSize.height = shadowSize;
            }
            if (obj.shadow.map) {
                obj.shadow.map.dispose();
                obj.shadow.map = null;
            }
        }
    });
    
    console.log(`[PERF] Shadows ${shadowsEnabled ? 'enabled' : 'disabled'} (quality: ${quality})`);
}

// Optimize texture sampling for map materials
function optimizeMapTextures(mapScene) {
    const quality = performanceState.graphicsQuality;
    const maxAnisotropy = PERFORMANCE_CONFIG.graphicsQuality.textureAnisotropy[quality] || 2;
    
    let textureCount = 0;
    mapScene.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        
        materials.forEach((mat) => {
            ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((key) => {
                const tex = mat[key];
                if (tex && tex.isTexture) {
                    // Reduce anisotropy for lower quality
                    tex.anisotropy = Math.min(tex.anisotropy || maxAnisotropy, maxAnisotropy);
                    
                    // Use cheaper filtering for low quality
                    if (quality === 'low') {
                        tex.magFilter = THREE.LinearFilter;
                        tex.minFilter = THREE.LinearFilter;
                    } else {
                        tex.magFilter = THREE.LinearFilter;
                        tex.minFilter = THREE.LinearMipMapLinearFilter;
                    }
                    
                    tex.needsUpdate = true;
                    textureCount++;
                }
            });
        });
    });
    
    console.log(`[PERF] Optimized ${textureCount} textures (anisotropy: ${maxAnisotropy})`);
}

// Downscale a texture using canvas (for low quality mode)
function downscaleTexture(texture, scale) {
    if (!texture || !texture.image) return texture;
    
    const img = texture.image;
    const width = Math.max(1, Math.floor(img.width * scale));
    const height = Math.max(1, Math.floor(img.height * scale));
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.wrapS = texture.wrapS;
    newTex.wrapT = texture.wrapT;
    newTex.repeat.copy(texture.repeat);
    newTex.offset.copy(texture.offset);
    newTex.rotation = texture.rotation;
    newTex.flipY = texture.flipY;
    newTex.colorSpace = texture.colorSpace || THREE.SRGBColorSpace;
    newTex.anisotropy = 1;
    
    texture.dispose();
    return newTex;
}

// Downscale all map textures (for low quality mode)
function downscaleMapTextures(mapScene, scale) {
    if (scale >= 1.0) return;
    
    let downscaledCount = 0;
    mapScene.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        
        materials.forEach((mat) => {
            ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((key) => {
                if (mat[key] && mat[key].isTexture && mat[key].image) {
                    mat[key] = downscaleTexture(mat[key], scale);
                    downscaledCount++;
                }
            });
        });
    });
    
    console.log(`[PERF] Downscaled ${downscaledCount} textures by ${(scale * 100).toFixed(0)}%`);
}

// Setup map materials with quality-dependent shadow settings
function setupMapMaterialsWithQuality(mapScene) {
    const quality = performanceState.graphicsQuality;
    
    mapScene.traverse((obj) => {
        if (!obj.isMesh) return;
        
        // Mark this mesh as part of the map for triangle categorization
        obj.userData.isMap = true;
        
        // Quality-dependent shadow settings
        if (quality === 'high') {
            obj.castShadow = true;
            obj.receiveShadow = true;
        } else if (quality === 'medium') {
            obj.castShadow = false;    // Only main objects cast shadows
            obj.receiveShadow = true;  // Map still receives shadows
        } else { // low
            obj.castShadow = false;
            obj.receiveShadow = false; // No shadows at all
        }
        
        // Ensure textures use correct color space
        if (obj.material) {
            const mat = obj.material;
            if (mat.map && mat.map.isTexture) {
                mat.map.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
            }
        }
    });
    
    console.log(`[PERF] Map materials configured for ${quality} quality`);
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
    if (weaponKey === '8x') {
        // Red pulse border effect for 8x (highest tier)
        triggerRedBorder();
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
        name: 'ALPHA ORCA',
        baseSpecies: 'killerWhale',
        sizeMultiplier: 1.8,  // GIANT sized
        hpMultiplier: 4,
        rewardMultiplier: 4,
        speedMultiplier: 1.3,
        glowColor: 0x000000,
        description: 'Deadly pack leader!'
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
// FIX: Added 'killerWhale' to boss-only list - Orca should only appear during Boss Mode
// This prevents confusion where Orca appears after Boss Mode ends (it was spawning as normal fish)
const BOSS_ONLY_SPECIES = BOSS_FISH_TYPES
    .filter(boss => boss.baseSpecies !== 'sardine')  // Keep sardine for normal gameplay
    .map(boss => boss.baseSpecies)
    .concat(['killerWhale']);  // Orca is boss-only even though it's not in BOSS_FISH_TYPES base list
// Result: ['blueWhale', 'greatWhiteShark', 'mantaRay', 'marlin', 'killerWhale'] - sardine now spawns normally

// RTP FIX: List of ability fish that should NOT spawn during normal gameplay
// These fish have special abilities (bomb, lightning, bonus, shield) that can trigger
// chain kills without corresponding bets, causing RTP to exceed 100%
// TODO: Re-enable these fish once ability reward mechanics are properly designed
const ABILITY_FISH_EXCLUDED = ['bombCrab', 'electricEel', 'goldFish', 'shieldTurtle'];

// ==================== WEAPON VFX SYSTEM (Issue #14) ====================
// Visual effects configuration and state for each weapon type
// Auto-generated from WEAPON_CONFIG (single source of truth)
const WEAPON_VFX_CONFIG = _buildLegacyVFXConfig();

// ==================== 3X WEAPON FIRE PARTICLE SYSTEM ====================
// Uses Unity-extracted textures for fire trail and hit effects
const FIRE_PARTICLE_CONFIG = {
    baseUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/',
    textures: {
        // PNG textures with alpha channel for proper transparency
        // New descriptive file names from Unity asset extraction
        mainTex: '3x%20%E6%AD%A6%E5%99%A8%E6%96%B0%E7%89%B9%E6%95%88%20MainTex.png',           // Main flame texture with alpha
        dissolve: '3x%20%E6%AD%A6%E5%99%A8%E6%96%B0%E7%89%B9%E6%95%88%20Dissolve%20Texture.png', // Dissolve effect texture
        distortion: '3x%20%E6%AD%A6%E5%99%A8%E6%96%B0%E7%89%B9%E6%95%88%20Distortion%20Texture.png', // Distortion effect texture
        mask: '3x%20%E6%AD%A6%E5%99%A8%E6%96%B0%E7%89%B9%E6%95%88%20mask.png'                  // Alpha mask for soft edges
    },
    trail: {
        spawnRate: 0.015,         // Spawn particle every 15ms (more frequent)
        particleCount: 20,        // Max particles per bullet trail
        particleSize: 25,         // Base particle size (larger for visibility)
        particleLife: 0.5,        // Particle lifetime in seconds
        colors: {
            start: 0xffaa00,      // Orange-yellow (fire core)
            mid: 0xff6600,        // Orange (fire body)
            end: 0xff2200         // Red-orange (fire tail)
        },
        fadeSpeed: 2.0,           // How fast particles fade
        shrinkSpeed: 1.2          // How fast particles shrink
    },
    hit: {
        burstCount: 25,           // Particles in hit burst
        burstSize: 30,            // Size of burst particles (larger)
        burstLife: 0.7,           // Burst particle lifetime
        burstSpeed: 120           // Burst particle speed
    }
};

// Fire particle texture cache
const fireParticleTextures = {
    mainTex: null,      // Main flame texture with alpha
    dissolve: null,     // Dissolve effect texture
    distortion: null,   // Distortion effect texture
    mask: null,         // Alpha mask for soft edges
    loaded: false,
    loading: false
};

// Fire particle pool for 3x weapon trail
const fireParticlePool = {
    particles: [],
    activeCount: 0,
    maxParticles: 100,
    geometry: null,
    material: null,
    initialized: false
};

// Load fire particle textures
async function loadFireParticleTextures() {
    if (fireParticleTextures.loaded || fireParticleTextures.loading) return;
    fireParticleTextures.loading = true;
    
    const textureLoader = new THREE.TextureLoader();
    const config = FIRE_PARTICLE_CONFIG;
    
    try {
        const loadTexture = (key) => {
            return new Promise((resolve, reject) => {
                const url = config.baseUrl + config.textures[key];
                textureLoader.load(url, 
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        fireParticleTextures[key] = texture;
                        resolve(texture);
                    },
                    undefined,
                    (error) => {
                        console.warn(`[FIRE-VFX] Failed to load texture ${key}:`, error);
                        resolve(null);
                    }
                );
            });
        };
        
        await Promise.all([
            loadTexture('mainTex'),
            loadTexture('dissolve'),
            loadTexture('distortion'),
            loadTexture('mask')
        ]);
        
        fireParticleTextures.loaded = true;
        console.log('[FIRE-VFX] Fire particle textures loaded');
        
        // Initialize fire particle pool after textures are loaded
        initFireParticlePool();
    } catch (error) {
        console.error('[FIRE-VFX] Error loading fire particle textures:', error);
    }
    
    fireParticleTextures.loading = false;
}

// Initialize fire particle pool
function initFireParticlePool() {
    if (fireParticlePool.initialized) return;
    
    // Create shared geometry (plane for billboard particles)
    fireParticlePool.geometry = new THREE.PlaneGeometry(1, 1);
    
    // Create material using mainTex (flame shape) with alpha channel
    // mainTex has the actual flame shape with proper alpha transparency
    const mainTexture = fireParticleTextures.mainTex;
    const fallbackTexture = fireParticleTextures.mask || fireParticleTextures.dissolve;
    
    // Use mainTex as primary (has proper alpha for fire effect)
    const texture = mainTexture || fallbackTexture;
    
    fireParticlePool.material = new THREE.MeshBasicMaterial({
        map: texture,
        color: FIRE_PARTICLE_CONFIG.trail.colors.start,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    // Pre-create particle pool
    for (let i = 0; i < fireParticlePool.maxParticles; i++) {
        const particle = {
            mesh: new THREE.Mesh(
                fireParticlePool.geometry,
                fireParticlePool.material.clone()
            ),
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 0,
            size: 0,
            active: false
        };
        particle.mesh.visible = false;
        fireParticlePool.particles.push(particle);
    }
    
    fireParticlePool.initialized = true;
    console.log('[FIRE-VFX] Fire particle pool initialized with', fireParticlePool.maxParticles, 'particles');
}

// Get an inactive fire particle from pool
function getFireParticle() {
    for (const particle of fireParticlePool.particles) {
        if (!particle.active) {
            return particle;
        }
    }
    return null; // Pool exhausted
}

// Spawn fire trail particle at position
function spawnFireTrailParticle(position, bulletVelocity) {
    if (!fireParticlePool.initialized) return;
    
    const particle = getFireParticle();
    if (!particle) return;
    
    const config = FIRE_PARTICLE_CONFIG.trail;
    
    // Activate particle
    particle.active = true;
    particle.life = config.particleLife;
    particle.maxLife = config.particleLife;
    particle.size = config.particleSize * (0.8 + Math.random() * 0.4);
    
    // Position at bullet location with slight random offset
    particle.mesh.position.copy(position);
    particle.mesh.position.x += (Math.random() - 0.5) * 5;
    particle.mesh.position.y += (Math.random() - 0.5) * 5;
    particle.mesh.position.z += (Math.random() - 0.5) * 5;
    
    // Velocity - opposite to bullet direction with some spread
    particle.velocity.copy(bulletVelocity).normalize().multiplyScalar(-30);
    particle.velocity.x += (Math.random() - 0.5) * 20;
    particle.velocity.y += (Math.random() - 0.5) * 20 + 10; // Slight upward drift
    particle.velocity.z += (Math.random() - 0.5) * 20;
    
    // Set initial scale and color
    particle.mesh.scale.set(particle.size, particle.size, 1);
    particle.mesh.material.color.setHex(config.colors.start);
    particle.mesh.material.opacity = 1.0;
    particle.mesh.visible = true;
    
    // Add to scene if not already
    if (!particle.mesh.parent) {
        scene.add(particle.mesh);
    }
    
    fireParticlePool.activeCount++;
}

// Spawn fire burst for hit effect
function spawnFireHitBurst(position) {
    if (!fireParticlePool.initialized) return;
    
    const config = FIRE_PARTICLE_CONFIG.hit;
    
    for (let i = 0; i < config.burstCount; i++) {
        const particle = getFireParticle();
        if (!particle) break;
        
        // Activate particle
        particle.active = true;
        particle.life = config.burstLife * (0.7 + Math.random() * 0.6);
        particle.maxLife = particle.life;
        particle.size = config.burstSize * (0.6 + Math.random() * 0.8);
        
        // Position at hit location
        particle.mesh.position.copy(position);
        
        // Random spherical velocity for burst
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = config.burstSpeed * (0.5 + Math.random() * 0.5);
        
        particle.velocity.set(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.sin(phi) * Math.sin(theta) * speed + 50, // Upward bias
            Math.cos(phi) * speed
        );
        
        // Set initial scale and color
        particle.mesh.scale.set(particle.size, particle.size, 1);
        particle.mesh.material.color.setHex(FIRE_PARTICLE_CONFIG.trail.colors.start);
        particle.mesh.material.opacity = 1.0;
        particle.mesh.visible = true;
        
        // Add to scene if not already
        if (!particle.mesh.parent) {
            scene.add(particle.mesh);
        }
        
        fireParticlePool.activeCount++;
    }
}

// Update all active fire particles (called from main animate loop)
function updateFireParticles(deltaTime) {
    if (!fireParticlePool.initialized) return;
    
    const config = FIRE_PARTICLE_CONFIG.trail;
    
    for (const particle of fireParticlePool.particles) {
        if (!particle.active) continue;
        
        // Update life
        particle.life -= deltaTime;
        
        if (particle.life <= 0) {
            // Deactivate particle
            particle.active = false;
            particle.mesh.visible = false;
            fireParticlePool.activeCount--;
            continue;
        }
        
        // Calculate life progress (0 = just spawned, 1 = about to die)
        const lifeProgress = 1 - (particle.life / particle.maxLife);
        
        // Update position
        particle.mesh.position.x += particle.velocity.x * deltaTime;
        particle.mesh.position.y += particle.velocity.y * deltaTime;
        particle.mesh.position.z += particle.velocity.z * deltaTime;
        
        // Slow down velocity (drag)
        particle.velocity.multiplyScalar(0.95);
        
        // Update scale (shrink over time)
        const scale = particle.size * (1 - lifeProgress * config.shrinkSpeed * 0.5);
        particle.mesh.scale.set(Math.max(0.1, scale), Math.max(0.1, scale), 1);
        
        // Update opacity (fade out)
        particle.mesh.material.opacity = Math.max(0, 1 - lifeProgress * config.fadeSpeed * 0.5);
        
        // Update color (orange -> red gradient)
        if (lifeProgress < 0.3) {
            particle.mesh.material.color.setHex(config.colors.start);
        } else if (lifeProgress < 0.6) {
            particle.mesh.material.color.setHex(config.colors.mid);
        } else {
            particle.mesh.material.color.setHex(config.colors.end);
        }
        
        // Billboard - always face camera
        if (camera) {
            particle.mesh.quaternion.copy(camera.quaternion);
        }
    }
}


// VFX state tracking
const vfxState = {
    chargeTimer: 0,
    isCharging: false,
    chargeWeapon: null,
    baseRingMesh: null,
    transientEffects: [],
    weaponSwitchAnimation: null
};

// ==================== CENTRALIZED VFX MANAGER (Performance Fix) ====================
// All visual effects are now updated from the main animate() loop instead of having
// their own requestAnimationFrame loops. This eliminates the "N effects = N RAF callbacks"
// problem that was causing severe FPS drops (10-27 FPS) during combat.

// Array to track all active VFX effects
const activeVfxEffects = [];

// Cached geometries to avoid creating new ones per effect (reduces GC pressure)
const vfxGeometryCache = {
    ring: null,           // TorusGeometry for expanding rings
    sphere: null,         // SphereGeometry for fireballs/cores
    smallSphere: null,    // Smaller sphere for trails
    shockwaveRing: null,  // RingGeometry for shockwaves
    coinCylinder: null,   // CylinderGeometry for coins
    coinSphere: null,     // SphereGeometry for flying coins
    smokeCloud: null,     // SphereGeometry for smoke
    // PERFORMANCE: Additional cached geometries for VFX effects
    fireballSphere: null,     // SphereGeometry(25, 16, 16) for fireball muzzle flash
    fireballCore: null,       // SphereGeometry(15, 12, 12) for fireball core
    megaCore: null,           // SphereGeometry(20, 16, 16) for mega explosion core
    megaFireball: null,       // SphereGeometry(30, 16, 16) for mega explosion fireball
    megaInner: null           // SphereGeometry(20, 12, 12) for mega explosion inner
};

// PERFORMANCE: Temp vectors for particle velocity calculations (avoids per-particle allocations)
const particleTempVectors = {
    velocity: new THREE.Vector3(),
    startPos: new THREE.Vector3(),
    direction: new THREE.Vector3()
};

// PERFORMANCE: Shared materials cache for common materials (reduces GPU state changes)
const sharedMaterialsCache = {
    coinGold: null,           // Gold coin material
    eyeWhite: null,           // White eye material (shared across all fish)
    eyeBlack: null,           // Black pupil material (shared across all fish)
    waterBlue: null,          // Blue water splash material
    initialized: false
};

// PERFORMANCE: Geometry cache for fish (same form/size share geometry - reduces memory and draw call setup)
// Key format: "form_size" (e.g., "whale_15", "shark_10")
const fishGeometryCache = new Map();

// PERFORMANCE: Material cache for fish (same color share materials - reduces GPU state changes)
// Key format: "color_roughness_metalness" (e.g., "0x4169e1_0.3_0.2")
const fishMaterialCache = new Map();

// Get or create cached geometry for fish
function getCachedFishGeometry(form, size, geometryCreator) {
    const key = `${form}_${size}`;
    if (!fishGeometryCache.has(key)) {
        const geometry = geometryCreator();
        fishGeometryCache.set(key, geometry);
    }
    return fishGeometryCache.get(key);
}

// Get or create cached material for fish
function getCachedFishMaterial(color, roughness = 0.3, metalness = 0.2, emissive = null, emissiveIntensity = 0.1) {
    const emissiveKey = emissive !== null ? emissive : color;
    const key = `${color}_${roughness}_${metalness}_${emissiveKey}_${emissiveIntensity}`;
    if (!fishMaterialCache.has(key)) {
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness,
            metalness: metalness,
            emissive: emissiveKey,
            emissiveIntensity: emissiveIntensity
        });
        fishMaterialCache.set(key, material);
    }
    return fishMaterialCache.get(key);
}

// Get fish geometry/material cache stats
function getFishCacheStats() {
    return {
        geometries: fishGeometryCache.size,
        materials: fishMaterialCache.size
    };
}

// PERFORMANCE: Temp vectors for VFX functions (avoid per-call allocations)
const vfxTempVectors = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3()
};

// PERFORMANCE: Temp vectors for autoFireAtFish (avoid per-call allocations)
const autoFireTempVectors = {
    muzzlePos: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    crosshairDir: new THREE.Vector3()
};

// Initialize shared materials (called once when scene is ready)
function initSharedMaterials() {
    if (sharedMaterialsCache.initialized) return;
    
    sharedMaterialsCache.coinGold = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 1
    });
    sharedMaterialsCache.eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff });
    sharedMaterialsCache.eyeBlack = new THREE.MeshStandardMaterial({ color: 0x000000 });
    sharedMaterialsCache.waterBlue = new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.7
    });
    sharedMaterialsCache.initialized = true;
    console.log('[PERF] Shared materials cache initialized');
}

// Maximum active VFX effects to prevent performance collapse during Boss Mode
const MAX_VFX_EFFECTS = 100;

// Temp vectors to avoid per-frame allocations
const vfxTempVec3 = new THREE.Vector3();

// Initialize cached geometries (called once when scene is ready)
function initVfxGeometryCache() {
    // PERFORMANCE: Also initialize shared materials
    initSharedMaterials();
    
    vfxGeometryCache.ring = new THREE.TorusGeometry(1, 3, 8, 32);
    vfxGeometryCache.sphere = new THREE.SphereGeometry(1, 16, 16);
    vfxGeometryCache.smallSphere = new THREE.SphereGeometry(1, 8, 8);
    vfxGeometryCache.shockwaveRing = new THREE.RingGeometry(1, 5, 32);
    vfxGeometryCache.coinCylinder = new THREE.CylinderGeometry(8, 8, 3, 8);
    vfxGeometryCache.coinSphere = new THREE.SphereGeometry(12, 8, 8);
    vfxGeometryCache.smokeCloud = new THREE.SphereGeometry(1, 8, 8);
    // PERFORMANCE: Additional cached geometries for VFX effects
    vfxGeometryCache.fireballSphere = new THREE.SphereGeometry(1, 16, 16);  // Scale to 25 for fireball
    vfxGeometryCache.fireballCore = new THREE.SphereGeometry(1, 12, 12);    // Scale to 15 for core
    vfxGeometryCache.megaCore = new THREE.SphereGeometry(1, 16, 16);        // Scale to 20 for mega core
    vfxGeometryCache.megaFireball = new THREE.SphereGeometry(1, 16, 16);    // Scale to 30 for mega fireball
    vfxGeometryCache.megaInner = new THREE.SphereGeometry(1, 12, 12);       // Scale to 20 for mega inner
    console.log('[VFX] Geometry cache initialized with extended geometries');
}

// Update all active VFX effects from main animate() loop
// This is called once per frame with deltaTime
function updateVfxEffects(dt, now) {
    // Iterate backwards to safely remove finished effects
    for (let i = activeVfxEffects.length - 1; i >= 0; i--) {
        const effect = activeVfxEffects[i];
        
        // Calculate elapsed time for this effect
        const elapsed = now - effect.startTime;
        
        // Call the effect's update function
        // Returns true if effect should continue, false if done
        const shouldContinue = effect.update(dt, elapsed);
        
        if (!shouldContinue) {
            // Effect is done - clean up and remove
            if (effect.cleanup) {
                effect.cleanup();
            }
            activeVfxEffects.splice(i, 1);
        }
    }
}

// Helper to add a new VFX effect with overflow protection
function addVfxEffect(effect) {
    // Enforce maximum effect count to prevent performance collapse
    if (activeVfxEffects.length >= MAX_VFX_EFFECTS) {
        // Remove oldest effects to make room
        const toRemove = activeVfxEffects.splice(0, 10);
        toRemove.forEach(e => {
            if (e.cleanup) e.cleanup();
        });
        console.warn('[VFX] Effect limit reached, removed 10 oldest effects');
    }
    
    effect.startTime = performance.now();
    activeVfxEffects.push(effect);
}

// Get VFX stats for debugging
function getVfxStats() {
    return {
        activeEffects: activeVfxEffects.length,
        maxEffects: MAX_VFX_EFFECTS,
        effectTypes: activeVfxEffects.reduce((acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
        }, {})
    };
}

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

// MP3 Audio System - R2 bucket sound effects
const AUDIO_CONFIG = {
    baseUrl: 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/',
    sounds: {
        weapon1x: '1X 發射音效.mp3',
        weapon3x: '3X 發射音效.mp3',
        weapon5x: '5X 發射音效.mp3',
        weapon8x: '8X 發射音效.wav',
        hit3x: '3X 武器擊中音效.mp3',
        hit5x: '5X 武器擊中音效.mp3',
        hit8x: '8X 發射音效.wav',
        bossTime: 'Boss time.mp3',
        bossDead: 'Boss dead.mp3',
        coinDrop: 'Coin-Fish dead.mp3',    // Sound when fish dies and coins appear
        coinReceive: 'Coin receive.wav',   // Sound when coins reach cannon muzzle
        coinCasino: 'Coin receive.wav',
        background: 'background.mp3',
        menuClick: 'Click.mp3'  // Button click sound for all menu buttons
    },
    volumes: {
        weapon1x: 0.4,
        weapon3x: 0.5,
        weapon5x: 0.6,
        weapon8x: 0.7,
        hit3x: 0.5,
        hit5x: 0.6,
        hit8x: 0.7,
        bossTime: 0.5,
        bossDead: 0.7,
        coinDrop: 0.51,     // Volume for coin drop sound (reduced 15%)
        coinReceive: 0.6,
        coinCasino: 0.5,
        background: 0.3,
        menuClick: 0.5      // Volume for menu button clicks
    }
};

// Audio buffer cache for MP3 files
const audioBufferCache = new Map();
let backgroundMusicSource = null;
let bossMusicSource = null;
let isBackgroundMusicPlaying = false;
let isBossMusicPlaying = false;

// Load MP3 audio file and cache it
async function loadAudioBuffer(soundKey) {
    if (audioBufferCache.has(soundKey)) {
        return audioBufferCache.get(soundKey);
    }
    
    const filename = AUDIO_CONFIG.sounds[soundKey];
    if (!filename) {
        console.warn('[AUDIO] Unknown sound key:', soundKey);
        return null;
    }
    
    const url = AUDIO_CONFIG.baseUrl + encodeURIComponent(filename);
    
    try {
        console.log('[AUDIO] Loading:', soundKey, url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBufferCache.set(soundKey, audioBuffer);
        console.log('[AUDIO] Loaded:', soundKey);
        return audioBuffer;
    } catch (error) {
        console.error('[AUDIO] Failed to load:', soundKey, error);
        return null;
    }
}

// Preload all audio files
async function preloadAllAudio() {
    if (!audioContext) return;
    
    console.log('[AUDIO] Preloading all sound effects...');
    const loadPromises = Object.keys(AUDIO_CONFIG.sounds).map(key => loadAudioBuffer(key));
    await Promise.all(loadPromises);
    console.log('[AUDIO] All sound effects preloaded');
}

// ==================== AUDIO GAIN NODE POOL ====================
// PERFORMANCE FIX: Pre-create GainNodes to avoid per-shot allocation
// BufferSource must be created per-shot (Web Audio limitation), but GainNode can be pooled
const AUDIO_GAIN_POOL_SIZE = 16;  // Max concurrent sounds
const audioGainPool = {
    nodes: [],
    freeList: [],
    initialized: false
};

function initAudioGainPool() {
    if (audioGainPool.initialized || !audioContext || !sfxGain) return;
    
    for (let i = 0; i < AUDIO_GAIN_POOL_SIZE; i++) {
        const gainNode = audioContext.createGain();
        gainNode.connect(sfxGain);
        audioGainPool.nodes.push(gainNode);
        audioGainPool.freeList.push(gainNode);
    }
    
    audioGainPool.initialized = true;
}

function getGainNodeFromPool() {
    if (!audioGainPool.initialized) initAudioGainPool();
    
    // If pool is exhausted, create a new node (graceful degradation)
    if (audioGainPool.freeList.length === 0) {
        const gainNode = audioContext.createGain();
        gainNode.connect(sfxGain);
        return gainNode;
    }
    
    return audioGainPool.freeList.pop();
}

function returnGainNodeToPool(gainNode) {
    // Only return pooled nodes (check if it's in our pool)
    if (audioGainPool.nodes.includes(gainNode)) {
        audioGainPool.freeList.push(gainNode);
    }
    // Non-pooled nodes will be garbage collected
}

// Play MP3 sound effect (one-shot)
// PERFORMANCE: Uses pooled GainNodes to reduce per-shot allocations
function playMP3Sound(soundKey, volumeMultiplier = 1.0) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const buffer = audioBufferCache.get(soundKey);
    if (!buffer) {
        console.warn('[AUDIO] Buffer not loaded:', soundKey);
        return null;
    }
    
    // BufferSource must be created per-shot (Web Audio limitation - can only start once)
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // PERFORMANCE: Get GainNode from pool instead of creating new one
    const gainNode = getGainNodeFromPool();
    const baseVolume = AUDIO_CONFIG.volumes[soundKey] || 0.5;
    gainNode.gain.value = baseVolume * volumeMultiplier;
    
    source.connect(gainNode);
    // Note: gainNode is already connected to sfxGain in pool initialization
    source.start(0);
    
    // Return gain node to pool when sound finishes
    source.onended = () => {
        source.disconnect();
        returnGainNodeToPool(gainNode);
    };
    
    return source;
}

// Play menu click sound - exposed globally for lobby UI
// Uses Click.mp3 from R2 bucket for all menu button clicks
function playMenuClick() {
    playMP3Sound('menuClick');
}
window.playMenuClick = playMenuClick;

// Play coin collect sound with pitch adjustment for rising pitch effect
// coinIndex: 0-based index of the coin in the collection sequence
// totalCoins: total number of coins being collected
function playCoinCollectSoundWithPitch(coinIndex, totalCoins) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const buffer = audioBufferCache.get('coinReceive');
    if (!buffer) {
        return;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Calculate pitch multiplier: starts at 1.0, rises to 1.5 over the sequence
    // This creates the "money keeps coming" excitement effect
    const pitchMultiplier = 1.0 + (coinIndex / Math.max(totalCoins - 1, 1)) * 0.5;
    source.playbackRate.value = pitchMultiplier;
    
    const gainNode = getGainNodeFromPool();
    // Lower volume (0.3) since multiple coins will play in sequence
    // Slightly increase volume as pitch rises for better perception
    const volumeMultiplier = 0.25 + (coinIndex / Math.max(totalCoins - 1, 1)) * 0.15;
    const baseVolume = AUDIO_CONFIG.volumes['coinReceive'] || 0.6;
    gainNode.gain.value = baseVolume * volumeMultiplier;
    
    source.connect(gainNode);
    source.start(0);
    
    source.onended = () => {
        source.disconnect();
        returnGainNodeToPool(gainNode);
    };
    
    return source;
}

// Start background music (looping)
function startBackgroundMusicMP3() {
    if (!audioContext || !musicGain) return;
    if (isBackgroundMusicPlaying) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const buffer = audioBufferCache.get('background');
    if (!buffer) {
        console.warn('[AUDIO] Background music not loaded');
        return;
    }
    
    backgroundMusicSource = audioContext.createBufferSource();
    backgroundMusicSource.buffer = buffer;
    backgroundMusicSource.loop = true;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = AUDIO_CONFIG.volumes.background;
    
    backgroundMusicSource.connect(gainNode);
    gainNode.connect(musicGain);
    backgroundMusicSource.start(0);
    isBackgroundMusicPlaying = true;
    
    console.log('[AUDIO] Background music started (looping)');
}

// Stop background music
function stopBackgroundMusicMP3() {
    if (backgroundMusicSource) {
        try {
            backgroundMusicSource.stop();
        } catch (e) {}
        backgroundMusicSource = null;
    }
    isBackgroundMusicPlaying = false;
}

// Start boss time music
function startBossMusicMP3() {
    if (!audioContext || !musicGain) return;
    if (isBossMusicPlaying) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const buffer = audioBufferCache.get('bossTime');
    if (!buffer) {
        console.warn('[AUDIO] Boss time music not loaded');
        return;
    }
    
    // Lower background music volume during boss
    if (backgroundMusicSource) {
        try {
            backgroundMusicSource.playbackRate.value = 1.0;
        } catch (e) {}
    }
    
    bossMusicSource = audioContext.createBufferSource();
    bossMusicSource.buffer = buffer;
    bossMusicSource.loop = true;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = AUDIO_CONFIG.volumes.bossTime;
    
    bossMusicSource.connect(gainNode);
    gainNode.connect(musicGain);
    bossMusicSource.start(0);
    isBossMusicPlaying = true;
    
    console.log('[AUDIO] Boss time music started');
}

// Stop boss time music
function stopBossMusicMP3() {
    if (bossMusicSource) {
        try {
            bossMusicSource.stop();
        } catch (e) {}
        bossMusicSource = null;
    }
    isBossMusicPlaying = false;
    console.log('[AUDIO] Boss time music stopped');
}

// Play Boss Dead sound effect when boss is killed in Boss Mode
function playBossDeadSound() {
    if (!audioContext || !musicGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const buffer = audioBufferCache.get('bossDead');
    if (!buffer) {
        console.warn('[AUDIO] Boss dead sound not loaded');
        return;
    }
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = AUDIO_CONFIG.volumes.bossDead;
    
    source.connect(gainNode);
    gainNode.connect(musicGain);
    source.start(0);
    
    console.log('[AUDIO] Boss dead sound played');
}

function initAudio() {
    // Skip if audio was already initialized from home page (early audio init)
    if (earlyAudioInitialized && audioContext) {
        console.log('[AUDIO] Audio already initialized from home page, skipping re-init');
        // Just start ambient sounds if not already playing
        startAmbientSounds();
        return;
    }
    
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
        
        // Preload MP3 audio files and start background music
        preloadAllAudio().then(() => {
            // Start background music after preloading
            setTimeout(() => {
                startBackgroundMusicMP3();
                startAmbientSounds();
            }, 1000);
        });
        
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
    
    // Use MP3 sound effects from R2 bucket
    const soundKeyMap = {
        '1x': 'weapon1x',
        '3x': 'weapon3x',
        '5x': 'weapon5x',
        '8x': 'weapon8x'
    };
    
    const soundKey = soundKeyMap[weaponKey];
    if (soundKey && audioBufferCache.has(soundKey)) {
        playMP3Sound(soundKey, WeaponSystem.getSoundVolume(weaponKey));
        
        const shake = WeaponSystem.getFireScreenShake(weaponKey);
        if (shake.strength > 0) {
            triggerScreenShakeWithStrength(shake.strength, shake.duration);
        }
    } else {
        // Fallback to synthesized sounds if MP3 not loaded
        playWeaponShotSynthesized(weaponKey);
    }
}

// Fallback synthesized weapon sounds (used if MP3 not loaded)
function playWeaponShotSynthesized(weaponKey) {
    if (!audioContext || !sfxGain) return;
    
    const now = audioContext.currentTime;
    
    switch (weaponKey) {
        case '1x':
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
            for (let i = 0; i < 3; i++) {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const startTime = now + i * 0.03;
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300 - i * 50, startTime);
                osc.frequency.exponentialRampToValueAtTime(80, startTime + 0.12);
                gain.gain.setValueAtTime(0.15, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.12);
                osc.connect(gain);
                gain.connect(sfxGain);
                osc.start(startTime);
                osc.stop(startTime + 0.12);
            }
            break;
            
        case '5x':
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
            const echoStartTime = now + 0.1;
            const echo5 = audioContext.createOscillator();
            const echoGain5 = audioContext.createGain();
            echo5.type = 'sine';
            echo5.frequency.setValueAtTime(800, echoStartTime);
            echo5.frequency.exponentialRampToValueAtTime(200, echoStartTime + 0.15);
            echoGain5.gain.setValueAtTime(0.08, echoStartTime);
            echoGain5.gain.exponentialRampToValueAtTime(0.01, echoStartTime + 0.15);
            echo5.connect(echoGain5);
            echoGain5.connect(sfxGain);
            echo5.start(echoStartTime);
            echo5.stop(echoStartTime + 0.15);
            break;
            
        case '8x':
            playNoise(200, 1, 0.4, 0.15, 'lowpass');
            const osc8 = audioContext.createOscillator();
            const gain8 = audioContext.createGain();
            osc8.type = 'sawtooth';
            osc8.frequency.setValueAtTime(150, now);
            osc8.frequency.exponentialRampToValueAtTime(30, now + 0.3);
            gain8.gain.setValueAtTime(0.12, now);
            gain8.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc8.connect(gain8);
            gain8.connect(sfxGain);
            osc8.start(now);
            osc8.stop(now + 0.3);
            triggerScreenShakeWithStrength(6, 200);
            break;
            
        default:
            playSound('shoot');
    }
}

// Issue #16: Fish kill coin sounds based on fish size
// This plays when fish dies and coins appear (Coin-Fish dead.mp3)
function playCoinSound(fishSize) {
    if (!audioContext || !sfxGain) return;
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Use coinDrop sound (Coin-Fish dead.mp3) for when fish dies and coins appear
    if (audioBufferCache.has('coinDrop')) {
        // Adjust volume based on fish size
        const volumeMultiplier = {
            'small': 0.6,
            'medium': 0.8,
            'large': 1.0,
            'boss': 1.2
        }[fishSize] || 0.6;
        
        playMP3Sound('coinDrop', volumeMultiplier);
        
        // FIX: Removed playBossFanfare() call - it was causing duplicate audio
        // The MP3 coin sound is sufficient for boss kills
    } else {
        // Fallback to synthesized sounds
        playCoinSoundSynthesized(fishSize);
    }
}

// Fallback synthesized coin sounds (used if MP3 not loaded)
function playCoinSoundSynthesized(fishSize) {
    if (!audioContext || !sfxGain) return;
    
    const now = audioContext.currentTime;
    
    switch (fishSize) {
        case 'small':
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
            // FIX: Removed playBossFanfare() - old synthesized audio system disabled
            // Boss kills use the coin MP3 sound with higher volume instead
            break;
            
        default:
            playCoinSoundSynthesized('small');
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
            // Splash + damage indicator (fallback for 1x weapon)
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

// Play weapon-specific hit sound effect (MP3 from R2)
// For 3x, 5x, 8x weapons, play the custom hit sound
// For 1x weapon, fall back to procedural sound
function playWeaponHitSound(weaponKey) {
    const hitSoundKey = `hit${weaponKey}`;
    
    // Check if we have a custom hit sound for this weapon
    if (AUDIO_CONFIG.sounds[hitSoundKey]) {
        playMP3Sound(hitSoundKey);
    } else {
        // Fallback to procedural hit sound for 1x weapon
        playImpactSound('hit');
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
// FIX: Disabled old synthesized music system - now using MP3 from R2 bucket
// Background music is handled by startBackgroundMusicMP3() and boss music by startBossMusicMP3()
function setMusicState(state) {
    // No-op: Old synthesized music system disabled to prevent duplicate audio
    // The MP3 system (startBackgroundMusicMP3/startBossMusicMP3) handles all music now
    currentMusicState = state;
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
            // Volume reduced by 30% per user request
            oscillator.type = 'sine';
            // Rising "ching!" sound with sparkle
            oscillator.frequency.setValueAtTime(1200, now);
            oscillator.frequency.setValueAtTime(1800, now + 0.05);
            oscillator.frequency.setValueAtTime(2400, now + 0.1);
            oscillator.frequency.setValueAtTime(2000, now + 0.15);
            oscillator.frequency.setValueAtTime(2800, now + 0.2);
            gainNode.gain.setValueAtTime(0.175, now);  // Reduced by 30% (was 0.25)
            gainNode.gain.setValueAtTime(0.14, now + 0.1);  // Reduced by 30% (was 0.2)
            gainNode.gain.setValueAtTime(0.175, now + 0.15);  // Reduced by 30% (was 0.25)
            gainNode.gain.exponentialRampToValueAtTime(0.007, now + 0.35);  // Reduced by 30% (was 0.01)
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
            // FIX: Removed playBossFanfare() - it was causing duplicate audio with MP3 system
            // The coin sound from playCoinSound() handles boss defeat audio now
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

var _govNotifTimer = null;
var _govNotifEl = null;
function showGovernanceNotification(message, level) {
    if (_govNotifTimer) { clearTimeout(_govNotifTimer); }
    if (_govNotifEl && _govNotifEl.parentNode) { _govNotifEl.remove(); }
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%) scale(var(--ui-scale));transform-origin:top center;z-index:10000;' +
        'padding:10px 24px;border-radius:8px;font-family:sans-serif;font-size:14px;font-weight:600;' +
        'pointer-events:none;opacity:0;transition:opacity 0.3s;' +
        (level === 'error'
            ? 'background:rgba(220,38,38,0.9);color:#fff;border:1px solid #f87171;'
            : 'background:rgba(234,179,8,0.9);color:#000;border:1px solid #facc15;');
    el.textContent = message;
    document.body.appendChild(el);
    _govNotifEl = el;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    _govNotifTimer = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
        _govNotifTimer = null;
        _govNotifEl = null;
    }, 3000);
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

const pelletStates = [
    { hit: false, timer: 0 },
    { hit: false, timer: 0 },
    { hit: false, timer: 0 }
];
function get3xCrosshairSpreadPx() {
    const spreadDeg = CONFIG.weapons['3x'].spreadAngle;
    const spreadRad = spreadDeg * Math.PI / 180;
    const fov = camera ? camera.fov : 60;
    const halfFovRad = (fov / 2) * Math.PI / 180;
    const aspect = window.innerWidth / window.innerHeight;
    const halfHFovRad = Math.atan(Math.tan(halfFovRad) * aspect);
    return Math.tan(spreadRad) / Math.tan(halfHFovRad) * (window.innerWidth / 2);
}
let crosshairCanvas = null;
let crosshairCtx = null;
let crosshairCanvasLastTime = 0;

function initCrosshairCanvas() {
    crosshairCanvas = document.getElementById('crosshair-canvas');
    if (!crosshairCanvas) return;
    crosshairCtx = crosshairCanvas.getContext('2d');
    resizeCrosshairCanvas();
    window.addEventListener('resize', resizeCrosshairCanvas);
}

function resizeCrosshairCanvas() {
    if (!crosshairCanvas) return;
    crosshairCanvas.width = window.innerWidth * window.devicePixelRatio;
    crosshairCanvas.height = window.innerHeight * window.devicePixelRatio;
    crosshairCanvas.style.width = window.innerWidth + 'px';
    crosshairCanvas.style.height = window.innerHeight + 'px';
    if (crosshairCtx) {
        crosshairCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    }
}

function drawCrosshairB(ctx, w, h, cx, cy, time, dt) {
    const spread = get3xCrosshairSpreadPx();
    const pts = [
        { x: cx - spread, y: cy },
        { x: cx, y: cy },
        { x: cx + spread, y: cy }
    ];

    const basePulse = 1 + Math.sin(time * 0.004) * 0.04;

    pts.forEach((p, i) => {
        const mainColor = i === 1 ? 'rgba(170,255,204,0.9)' : 'rgba(170,255,204,0.65)';
        const glowColor = 'rgba(170,255,204,0.2)';
        const dotColor = 'rgba(255,255,255,0.9)';
        const sizeMultiplier = basePulse;

        const size = (i === 1 ? 20 : 16) * sizeMultiplier;
        const arm = size;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.5);
        glow.addColorStop(0, glowColor);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - size * 2.5, p.y - size * 2.5, size * 5, size * 5);

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1;
        const gap = 5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - arm); ctx.lineTo(p.x, p.y - gap);
        ctx.moveTo(p.x, p.y + gap); ctx.lineTo(p.x, p.y + arm);
        ctx.moveTo(p.x - arm, p.y); ctx.lineTo(p.x - gap, p.y);
        ctx.moveTo(p.x + gap, p.y); ctx.lineTo(p.x + arm, p.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

    });
}

function updateCrosshairCanvasOverlay(currentTime) {
    if (!crosshairCtx || !crosshairCanvas) return;
    if (gameState.currentWeapon !== '3x') return;
    if (crosshairCanvas.style.display === 'none') return;

    const dt = crosshairCanvasLastTime ? currentTime - crosshairCanvasLastTime : 16;
    crosshairCanvasLastTime = currentTime;

    const w = window.innerWidth;
    const h = window.innerHeight;

    crosshairCtx.clearRect(0, 0, w, h);

    let cx, cy;
    if (gameState.viewMode === 'fps') {
        cx = w / 2;
        cy = h / 2;
    } else {
        const mainCH = document.getElementById('crosshair');
        if (mainCH) {
            cx = parseFloat(mainCH.style.left) || w / 2;
            cy = parseFloat(mainCH.style.top) || h / 2;
        } else {
            cx = w / 2;
            cy = h / 2;
        }
    }

    drawCrosshairB(crosshairCtx, w, h, cx, cy, currentTime, dt);
}

function update3xSideCrosshairPositions() {
    if (gameState.currentWeapon !== '3x') return;
    const sideL = document.getElementById('crosshair-3x-left');
    const sideR = document.getElementById('crosshair-3x-right');
    if (!sideL || !sideR) return;
    const w = window.innerWidth;
    const spread = get3xCrosshairSpreadPx();
    let cx, cy;
    if (gameState.viewMode === 'fps') {
        cx = w / 2;
        cy = window.innerHeight / 2;
    } else {
        const mainCH = document.getElementById('crosshair');
        if (mainCH) {
            cx = parseFloat(mainCH.style.left) || w / 2;
            cy = parseFloat(mainCH.style.top) || window.innerHeight / 2;
        } else {
            cx = w / 2;
            cy = window.innerHeight / 2;
        }
    }
    sideL.style.left = (cx - spread) + 'px';
    sideL.style.top = cy + 'px';
    sideR.style.left = (cx + spread) + 'px';
    sideR.style.top = cy + 'px';
}

const _hitMarkerProjVec = new THREE.Vector3();
const HIT_MARKER_MIN_SIZE = 14;
const HIT_MARKER_MAX_SIZE = 36;
const HIT_MARKER_NEAR_DIST = 100;
const HIT_MARKER_FAR_DIST = 800;
const HIT_COMBO_COLORS = [
    '#ff4444',
    '#ffaa00',
    '#ffff00',
    '#44ff44',
    '#44ddff',
    '#aa88ff',
    '#ff66cc'
];
function showHitMarker(spreadIndex, fishWorldPos, fish) {
    return;
    const el = document.createElement('div');
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight / 2;
    let fontSize = 26;

    if (fishWorldPos && camera) {
        _hitMarkerProjVec.copy(fishWorldPos);
        const dist = camera.position.distanceTo(fishWorldPos);
        const t_dist = Math.max(0, Math.min(1, (dist - HIT_MARKER_NEAR_DIST) / (HIT_MARKER_FAR_DIST - HIT_MARKER_NEAR_DIST)));
        fontSize = HIT_MARKER_MAX_SIZE - t_dist * (HIT_MARKER_MAX_SIZE - HIT_MARKER_MIN_SIZE);

        _hitMarkerProjVec.project(camera);
        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;
        const sx = _hitMarkerProjVec.x * hw + hw;
        const sy = -_hitMarkerProjVec.y * hh + hh;
        if (_hitMarkerProjVec.z > 0 && _hitMarkerProjVec.z < 1) {
            startX = sx;
            startY = sy;
        }
    }

    let hitCount = 1;
    if (fish) {
        fish._comboHitCount = (fish._comboHitCount || 0) + 1;
        hitCount = fish._comboHitCount;
    }
    const comboColor = HIT_COMBO_COLORS[(hitCount - 1) % HIT_COMBO_COLORS.length];

    el.style.cssText = `
        position: fixed;
        top: ${startY}px;
        left: ${startX}px;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10000;
        opacity: 1;
        font-size: ${fontSize}px;
        color: ${comboColor};
        font-weight: bold;
        text-shadow: 0 0 8px ${comboColor}99, 0 0 3px #fff;
    `;
    el.textContent = String(hitCount);
    document.body.appendChild(el);

    const start = performance.now();
    const duration = 450;
    function animateMarker(now) {
        const t = Math.min((now - start) / duration, 1);
        el.style.transform = `translate(calc(-50% + ${t * 40}px), calc(-50% - ${t * 50}px)) scale(${1 + t * 0.3})`;
        el.style.opacity = String(1 - t * t);
        if (t < 1) {
            requestAnimationFrame(animateMarker);
        } else {
            el.remove();
        }
    }
    requestAnimationFrame(animateMarker);
}

let _lastRingFlashTime = 0;
let _lastRingFlashTimeLeft = 0;
let _lastRingFlashTimeRight = 0;
function showCrosshairRingFlash(spreadIndex) {
    const now = performance.now();
    var targetEl = null;
    var cx, cy;
    var is3x = gameState.currentWeapon === '3x';

    if (is3x && spreadIndex === -1) {
        if (now - _lastRingFlashTimeLeft < 150) return;
        _lastRingFlashTimeLeft = now;
        targetEl = document.getElementById('crosshair-3x-left');
    } else if (is3x && spreadIndex === 1) {
        if (now - _lastRingFlashTimeRight < 150) return;
        _lastRingFlashTimeRight = now;
        targetEl = document.getElementById('crosshair-3x-right');
    } else {
        if (now - _lastRingFlashTime < 150) return;
        _lastRingFlashTime = now;
        targetEl = document.getElementById('crosshair');
    }

    if (targetEl) {
        cx = parseFloat(targetEl.style.left);
        cy = parseFloat(targetEl.style.top);
    }
    if (!cx || !cy) {
        if (gameState.viewMode === 'fps') {
            cx = window.innerWidth / 2;
            cy = window.innerHeight / 2;
        } else {
            var chEl = document.getElementById('crosshair');
            cx = chEl ? (parseFloat(chEl.style.left) || window.innerWidth / 2) : window.innerWidth / 2;
            cy = chEl ? (parseFloat(chEl.style.top) || window.innerHeight / 2) : window.innerHeight / 2;
        }
    }
    const ring = document.createElement('div');
    const ringSz = 24;
    ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${ringSz}px;height:${ringSz}px;border:1.5px solid rgba(255,20,60,0.95);border-radius:50%;background:transparent;transform:translate(-50%,-50%);pointer-events:none;z-index:10001;box-shadow:0 0 6px rgba(255,20,60,0.7),0 0 12px rgba(255,60,80,0.35);`;
    document.body.appendChild(ring);
    if (targetEl) {
        targetEl.classList.add('hit-flash');
        setTimeout(function() { targetEl.classList.remove('hit-flash'); }, 250);
    }
    const startT = performance.now();
    function animRing(t) {
        const p = Math.min((t - startT) / 250, 1);
        ring.style.transform = `translate(-50%,-50%) scale(${1 + p * 0.6})`;
        ring.style.opacity = String(1 - p * p);
        if (p < 1) requestAnimationFrame(animRing); else ring.remove();
    }
    requestAnimationFrame(animRing);
}

function showKillSkull() {
    var cx, cy;
    if (gameState.viewMode === 'fps') {
        cx = window.innerWidth / 2;
        cy = window.innerHeight / 2;
    } else {
        var chEl = document.getElementById('crosshair');
        cx = chEl ? (parseFloat(chEl.style.left) || window.innerWidth / 2) : window.innerWidth / 2;
        cy = chEl ? (parseFloat(chEl.style.top) || window.innerHeight / 2) : window.innerHeight / 2;
    }
    const skull = document.createElement('div');
    skull.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="rgba(255,40,60,0.95)"><path d="M12 2C6.48 2 2 6.48 2 12c0 3.07 1.39 5.81 3.57 7.63L5 22h3l.5-2h7l.5 2h3l-.57-2.37C20.61 17.81 22 15.07 22 12c0-5.52-4.48-10-10-10zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>';
    skull.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) scale(0.2);pointer-events:none;z-index:10002;opacity:0;background:transparent;filter:drop-shadow(0 0 6px rgba(255,20,60,0.9)) drop-shadow(0 0 12px rgba(255,60,80,0.5));`;
    document.body.appendChild(skull);
    const startT = performance.now();
    function animSkull(t) {
        const elapsed = t - startT;
        const p = Math.min(elapsed / 350, 1);
        if (p < 0.25) {
            const ep = p / 0.25;
            skull.style.transform = `translate(-50%,-50%) scale(${0.2 + ep * 1.2})`;
            skull.style.opacity = String(ep);
        } else {
            const ep = (p - 0.25) / 0.75;
            skull.style.transform = `translate(-50%,-50%) scale(${1.4 - ep * 0.4})`;
            skull.style.opacity = String(1 - ep * 0.05);
        }
        if (p >= 1) {
            const fadeP = Math.min((elapsed - 350) / 150, 1);
            skull.style.opacity = String(0.95 * (1 - fadeP));
            if (fadeP >= 1) { skull.remove(); return; }
        }
        requestAnimationFrame(animSkull);
    }
    requestAnimationFrame(animSkull);
}

let _rewardPopupYOffset = 0;
let _rewardPopupResetTimer = null;
let _rewardPopupStyle = 'gold_spring';

function onScoreConfirmed(fishForm, rewardAmount) {
    const rewardInt = Math.round(rewardAmount);
    if (rewardInt <= 0) return;
    addKillFeedEntry(fishForm, rewardInt);
    showRewardFloat(rewardInt);
    updateUI();
}

function showRewardFloat(amount) {
    if (!amount || amount <= 0) return;
    const intAmount = Math.round(amount);
    if (intAmount <= 0) return;
    if (_rewardPopupStyle === 'gold_spring') {
        _showGoldSpring(intAmount);
    } else if (_rewardPopupStyle === 'arcade_jump') {
        _showArcadeJump(intAmount);
    } else if (_rewardPopupStyle === 'neon_pulse') {
        _showNeonPulse(intAmount);
    }
}

function _showGoldSpring(intAmount) {
    const bd = document.getElementById('balance-display');
    if (!bd) return;
    const rect = bd.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.textContent = '+' + intAmount.toLocaleString();
    const yOff = _rewardPopupYOffset * 35;
    _rewardPopupYOffset++;
    if (_rewardPopupResetTimer) clearTimeout(_rewardPopupResetTimer);
    _rewardPopupResetTimer = setTimeout(function() { _rewardPopupYOffset = 0; _rewardPopupResetTimer = null; }, 600);
    popup.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 10 - yOff}px;font-family:'Orbitron',monospace;font-size:28px;font-weight:900;color:#ffd700;-webkit-text-stroke:1.5px #fff;text-shadow:0 0 16px rgba(255,215,0,0.9),0 2px 4px rgba(0,0,0,0.6);pointer-events:none;z-index:99999;white-space:nowrap;transform-origin:center bottom;`;
    document.body.appendChild(popup);
    const startT = performance.now();
    function animGold(t) {
        const elapsed = t - startT;
        const p = Math.min(elapsed / 1400, 1);
        let scaleVal, yMove, shakeX = 0;
        if (p < 0.12) {
            scaleVal = (p / 0.12) * 1.5;
            yMove = 0;
        } else if (p < 0.25) {
            const sp = (p - 0.12) / 0.13;
            scaleVal = 1.5 - sp * 0.5;
            yMove = -sp * 10;
            shakeX = (Math.random() - 0.5) * 4;
        } else if (p < 0.45) {
            const sp = (p - 0.25) / 0.2;
            scaleVal = 1.0;
            yMove = -10 - sp * 30;
            shakeX = (Math.random() - 0.5) * 2 * (1 - sp);
        } else {
            scaleVal = 1.0;
            yMove = -40 - (p - 0.45) * 20;
        }
        const opacity = p < 0.4 ? 1 : Math.max(0, 1 - ((p - 0.4) / 0.6));
        popup.style.transform = `translate(${shakeX}px, ${yMove}px) scale(${scaleVal})`;
        popup.style.opacity = String(opacity);
        if (p < 1) requestAnimationFrame(animGold); else popup.remove();
    }
    requestAnimationFrame(animGold);
}

function _showArcadeJump(intAmount) {
    const bd = document.getElementById('balance-display');
    if (!bd) return;
    const rect = bd.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.textContent = '+' + intAmount.toLocaleString();
    const yOff = _rewardPopupYOffset * 30;
    _rewardPopupYOffset++;
    if (_rewardPopupResetTimer) clearTimeout(_rewardPopupResetTimer);
    _rewardPopupResetTimer = setTimeout(function() { _rewardPopupYOffset = 0; _rewardPopupResetTimer = null; }, 600);
    popup.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 5 - yOff}px;font-family:'Orbitron',monospace;font-size:28px;font-weight:900;color:#ffe600;text-shadow:3px 3px 0 #000,0 0 8px rgba(255,230,0,0.5);pointer-events:none;z-index:99999;white-space:nowrap;`;
    document.body.appendChild(popup);
    const startT = performance.now();
    const duration = 1200;
    const peakHeight = 80 + yOff * 0.5;
    const driftX = (Math.random() - 0.5) * 60;
    function animJump(t) {
        const p = Math.min((t - startT) / duration, 1);
        const yParabola = -4 * peakHeight * p * (p - 1);
        const xDrift = driftX * p;
        const rotation = p * 8;
        const opacity = p < 0.7 ? 1 : Math.max(0, 1 - ((p - 0.7) / 0.3));
        const scale = p < 0.15 ? 0.5 + p / 0.15 * 0.5 : 1;
        popup.style.transform = `translate(${xDrift}px, ${-yParabola}px) rotate(${rotation}deg) scale(${scale})`;
        popup.style.opacity = String(opacity);
        if (p < 1) requestAnimationFrame(animJump); else popup.remove();
    }
    requestAnimationFrame(animJump);
}

function _showNeonPulse(intAmount) {
    const bd = document.getElementById('balance-display');
    if (!bd) return;
    const rect = bd.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.textContent = '+' + intAmount.toLocaleString();
    const yOff = _rewardPopupYOffset * 35;
    _rewardPopupYOffset++;
    if (_rewardPopupResetTimer) clearTimeout(_rewardPopupResetTimer);
    _rewardPopupResetTimer = setTimeout(function() { _rewardPopupYOffset = 0; _rewardPopupResetTimer = null; }, 600);
    popup.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top - 12 - yOff}px;font-family:'Orbitron',monospace;font-size:28px;font-weight:900;color:#39ff14;text-shadow:0 0 10px #39ff14,0 0 20px #39ff14,0 0 40px rgba(57,255,20,0.4);pointer-events:none;z-index:99999;white-space:nowrap;`;
    document.body.appendChild(popup);
    const startT = performance.now();
    const duration = 1600;
    _animateBalanceCountUp(intAmount);
    function animNeon(t) {
        const elapsed = t - startT;
        const p = Math.min(elapsed / duration, 1);
        const pulseFreq = Math.sin(elapsed * 0.015) * 0.15;
        const scale = 1 + pulseFreq * (1 - p);
        const glow = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
        const opacity = p < 0.6 ? 1 : Math.max(0, 1 - ((p - 0.6) / 0.4));
        popup.style.transform = `translateY(${-p * 30}px) scale(${scale})`;
        popup.style.opacity = String(opacity);
        popup.style.textShadow = `0 0 ${10 + glow * 15}px #39ff14,0 0 ${20 + glow * 25}px #39ff14,0 0 ${40 + glow * 30}px rgba(57,255,20,${0.4 * glow})`;
        if (p < 1) requestAnimationFrame(animNeon); else popup.remove();
    }
    requestAnimationFrame(animNeon);
}

function _animateBalanceCountUp(addAmount) {
    const balanceEl = document.getElementById('balance-value');
    if (!balanceEl) return;
    const startVal = parseInt(balanceEl.textContent.replace(/,/g, '')) || 0;
    const endVal = startVal + addAmount;
    const startT = performance.now();
    const dur = 400;
    function tick(t) {
        const p = Math.min((t - startT) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 2);
        const current = Math.round(startVal + (endVal - startVal) * ease);
        balanceEl.textContent = String(current);
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// Temp vectors for muzzle flash barrel direction calculation(avoid per-shot allocations)
const muzzleFlashTemp = {
    barrelForward: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
    localForward: new THREE.Vector3(0, 0, 1)  // Barrel points along +Z in local space
};

// Spawn muzzle flash effect at cannon muzzle
// Ring follows barrel direction (like collar around barrel) in BOTH view modes
// This ensures FPS and third-person views have consistent muzzle flash appearance
function spawnMuzzleFlash(weaponKey, muzzlePos, direction) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config) return;
    
    // Get barrel forward direction from cannonMuzzle's world orientation
    // This ensures ring "wraps around" the barrel regardless of where bullets go
    // FIX: Use barrel direction for BOTH FPS and third-person modes for visual consistency
    // cannonMuzzle's world quaternion is properly updated in FPS mode (used by updateFPSCamera)
    let barrelDirection = direction;  // Fallback to bullet direction if cannonMuzzle unavailable
    
    if (cannonMuzzle) {
        // Use barrel direction for consistent ring orientation in both view modes
        cannonMuzzle.getWorldQuaternion(muzzleFlashTemp.worldQuat);
        muzzleFlashTemp.barrelForward.copy(muzzleFlashTemp.localForward)
            .applyQuaternion(muzzleFlashTemp.worldQuat);
        barrelDirection = muzzleFlashTemp.barrelForward;
    }
    
    if (weaponKey === '1x') {
        // FIX: Removed muzzle flash ring (user feedback: remove all ring effects)
        // Keep particles only
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 5);
        
    } else if (weaponKey === '3x') {
        // FIX: Removed muzzle flash ring (user feedback: remove all ring effects)
        // Keep particles only
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 6);
        
    } else if (weaponKey === '5x') {
        // FIX: Removed muzzle flash ring for 5x weapon (user feedback: too distracting)
        // Keep lightning burst and particles only
        // PERFORMANCE: Reduced lightning burst count from 4 to 2 to reduce stutter
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 4);
        
    } else if (weaponKey === '8x') {
        spawnFireballMuzzleFlash(muzzlePos, direction);
        // FIX: Removed muzzle flash ring (user feedback: remove all ring effects)
        triggerScreenShakeWithStrength(config.screenShake);
        spawnMuzzleParticles(muzzlePos, direction, config.muzzleColor, 25);
    }
}

// Spawn expanding ring effect - REFACTORED to use centralized VFX manager
function spawnExpandingRing(position, color, startRadius, endRadius, duration) {
    if (!scene) return;
    
    // Create geometry (not cached because startRadius varies)
    const geometry = new THREE.TorusGeometry(startRadius, 3, 8, 32);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    
    // Register with VFX manager instead of using own RAF loop
    addVfxEffect({
        type: 'expandingRing',
        mesh: ring,
        geometry: geometry,
        material: material,
        duration: duration * 1000, // Convert to ms
        startRadius: startRadius,
        endRadius: endRadius,
        
        update(dt, elapsed) {
            const progress = Math.min(elapsed / this.duration, 1);
            const scale = 1 + (this.endRadius / this.startRadius - 1) * progress;
            this.mesh.scale.set(scale, scale, scale);
            this.material.opacity = 0.25 * (1 - progress);
            return progress < 1;
        },
        
        cleanup() {
            scene.remove(this.mesh);
            this.geometry.dispose();
            this.material.dispose();
        }
    });
}

// PERFORMANCE: Optimized expanding ring using cached geometry
// Uses a unit torus (radius=1) and scales it, avoiding per-shot geometry creation
// IMPROVED: Optional direction parameter to orient ring toward bullet direction
// Temp vectors for ring orientation (avoid per-shot allocations)
const ringOrientationTemp = {
    quaternion: new THREE.Quaternion(),
    baseNormal: new THREE.Vector3(0, 1, 0),  // Torus default normal (up)
    targetDir: new THREE.Vector3()
};

function spawnExpandingRingOptimized(position, color, startRadius, endRadius, duration, direction = null) {
    if (!scene) return;
    
    // PERFORMANCE: Get ring from pool instead of creating new material per shot
    // This eliminates GC stutter on rapid fire (3x/5x weapons)
    const poolItem = getRingFromPool();
    const ring = poolItem.mesh;
    const material = poolItem.material;
    
    // Configure the pooled ring
    material.color.setHex(color);
    material.opacity = 0.25;
    ring.position.copy(position);
    
    // IMPROVED: Orient ring to face bullet direction if provided
    if (direction) {
        // Normalize direction and use quaternion to rotate from base normal to target direction
        ringOrientationTemp.targetDir.copy(direction).normalize();
        ringOrientationTemp.quaternion.setFromUnitVectors(
            ringOrientationTemp.baseNormal,
            ringOrientationTemp.targetDir
        );
        ring.quaternion.copy(ringOrientationTemp.quaternion);
    } else {
        // Default: horizontal ring (backward compatible)
        ring.quaternion.set(0, 0, 0, 1);  // Reset quaternion
        ring.rotation.x = Math.PI / 2;
    }
    
    // Scale to startRadius (geometry is unit size)
    ring.scale.set(startRadius, startRadius, startRadius);
    ring.visible = true;
    scene.add(ring);
    
    // Register with VFX manager
    addVfxEffect({
        type: 'expandingRingOptimized',
        mesh: ring,
        material: material,
        poolItem: poolItem,  // Store pool reference for return
        duration: duration * 1000,
        startRadius: startRadius,
        endRadius: endRadius,
        
        update(dt, elapsed) {
            const progress = Math.min(elapsed / this.duration, 1);
            // Scale from startRadius to endRadius
            const currentRadius = this.startRadius + (this.endRadius - this.startRadius) * progress;
            this.mesh.scale.set(currentRadius, currentRadius, currentRadius);
            this.material.opacity = 0.25 * (1 - progress);
            return progress < 1;
        },
        
        cleanup() {
            scene.remove(this.mesh);
            returnRingToPool(this.poolItem);
        }
    });
}

// PERFORMANCE: Temp vector for muzzle particle velocity - reused to avoid per-particle allocations
const muzzleParticleTempVelocity = new THREE.Vector3();

// Spawn muzzle particles
function spawnMuzzleParticles(position, direction, color, count) {
    for (let i = 0; i < count; i++) {
        // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
        const particle = freeParticles.pop();
        if (!particle) continue;
        
        const spread = 0.5;
        // PERFORMANCE: Reuse temp vector instead of new THREE.Vector3() per particle
        muzzleParticleTempVelocity.set(
            direction.x * 200 + (Math.random() - 0.5) * 100 * spread,
            direction.y * 200 + (Math.random() - 0.5) * 100 * spread,
            direction.z * 200 + (Math.random() - 0.5) * 100 * spread
        );
        
        // PERFORMANCE: No clone() needed - Particle.spawn() uses copy() internally
        particle.spawn(position, muzzleParticleTempVelocity, color, 0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.2);
        activeParticles.push(particle);
    }
}

// PERFORMANCE: Temp vector for lightning burst end position - reused to avoid per-arc allocations
const lightningBurstTempEndPos = new THREE.Vector3();

// Spawn lightning burst effect (for 5x weapon)
function spawnLightningBurst(position, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const length = 30 + Math.random() * 20;
        // PERFORMANCE: Reuse temp vector instead of position.clone() per arc
        lightningBurstTempEndPos.copy(position);
        lightningBurstTempEndPos.x += Math.cos(angle) * length;
        lightningBurstTempEndPos.y += (Math.random() - 0.5) * length * 0.5;
        lightningBurstTempEndPos.z += Math.sin(angle) * length;
        
        spawnLightningArc(position, lightningBurstTempEndPos, color);
    }
}

// Phase 2: Spawn lightning bolt between two positions - REFACTORED to use VFX manager
function spawnLightningBoltBetween(startPos, endPos, color) {
    if (!scene) return;
    
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
        opacity: 0.3
    });
    
    const lightning = new THREE.Line(geometry, material);
    scene.add(lightning);
    
    const glowGeometry = geometry.clone();
    const glowMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 5,
        transparent: true,
        opacity: 0.15
    });
    const glow = new THREE.Line(glowGeometry, glowMaterial);
    scene.add(glow);
    
    // Register with VFX manager instead of using own RAF loop
    addVfxEffect({
        type: 'lightning',
        lightning: lightning,
        glow: glow,
        geometry: geometry,
        glowGeometry: glowGeometry,
        material: material,
        glowMaterial: glowMaterial,
        fadeSpeed: 6, // Opacity units per second (was 0.1 per frame at 60fps = 6/s)
        
        update(dt, elapsed) {
            // Fade out over time
            this.material.opacity -= this.fadeSpeed * dt;
            this.glowMaterial.opacity = this.material.opacity * 0.5;
            return this.material.opacity > 0;
        },
        
        cleanup() {
            scene.remove(this.lightning);
            scene.remove(this.glow);
            this.geometry.dispose();
            this.glowGeometry.dispose();
            this.material.dispose();
            this.glowMaterial.dispose();
        }
    });
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

// PERFORMANCE: Fireball material pool to avoid creating new materials per shot
const fireballMaterialPool = {
    fireballPool: [],      // Pool of {mesh, material} for outer fireball
    corePool: [],          // Pool of {mesh, material} for inner core
    poolSize: 5            // Pre-allocate 5 of each (8x weapon fires slowly)
};

// Initialize fireball material pool
function initFireballMaterialPool() {
    if (!vfxGeometryCache.fireballSphere) initVfxGeometryCache();
    
    for (let i = 0; i < fireballMaterialPool.poolSize; i++) {
        // Outer fireball
        const fireballMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.25
        });
        const fireballMesh = new THREE.Mesh(vfxGeometryCache.fireballSphere, fireballMaterial);
        fireballMesh.visible = false;
        fireballMaterialPool.fireballPool.push({ mesh: fireballMesh, material: fireballMaterial });
        
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff88,
            transparent: true,
            opacity: 0.3
        });
        const coreMesh = new THREE.Mesh(vfxGeometryCache.fireballCore, coreMaterial);
        coreMesh.visible = false;
        fireballMaterialPool.corePool.push({ mesh: coreMesh, material: coreMaterial });
    }
}

// Get fireball from pool or create new one
function getFireballFromPool() {
    let item = fireballMaterialPool.fireballPool.pop();
    if (!item) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.25
        });
        const mesh = new THREE.Mesh(vfxGeometryCache.fireballSphere, material);
        item = { mesh, material };
    }
    return item;
}

// Get core from pool or create new one
function getCoreFromPool() {
    let item = fireballMaterialPool.corePool.pop();
    if (!item) {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff88,
            transparent: true,
            opacity: 0.3
        });
        const mesh = new THREE.Mesh(vfxGeometryCache.fireballCore, material);
        item = { mesh, material };
    }
    return item;
}

// Return fireball to pool
function returnFireballToPool(item) {
    item.mesh.visible = false;
    if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
    // Reset material properties
    item.material.opacity = 0.25;
    item.material.color.setHex(0xff4400);
    fireballMaterialPool.fireballPool.push(item);
}

// Return core to pool
function returnCoreToPool(item) {
    item.mesh.visible = false;
    if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
    // Reset material properties
    item.material.opacity = 0.3;
    item.material.color.setHex(0xffff88);
    fireballMaterialPool.corePool.push(item);
}

// Spawn fireball muzzle flash (for 8x weapon) - REFACTORED to use VFX manager
// PERFORMANCE: Uses cached geometry with scaling AND pooled materials
function spawnFireballMuzzleFlash(position, direction) {
    if (!scene) return;
    
    // Ensure geometry cache is initialized
    if (!vfxGeometryCache.fireballSphere) initVfxGeometryCache();
    
    // PERFORMANCE: Get from pool instead of creating new materials per shot
    const fireballItem = getFireballFromPool();
    const fireball = fireballItem.mesh;
    const material = fireballItem.material;
    
    fireball.position.copy(position);
    fireball.scale.set(12, 12, 12);
    fireball.visible = true;
    scene.add(fireball);
    
    const coreItem = getCoreFromPool();
    const core = coreItem.mesh;
    const coreMaterial = coreItem.material;
    
    core.position.copy(position);
    core.scale.set(7, 7, 7);
    core.visible = true;
    scene.add(core);
    
    // Register with VFX manager instead of using own RAF loop
    addVfxEffect({
        type: 'fireballFlash',
        fireball: fireball,
        core: core,
        fireballItem: fireballItem,  // Store pool reference
        coreItem: coreItem,          // Store pool reference
        material: material,
        coreMaterial: coreMaterial,
        baseFireballScale: 12,
        baseCoreScale: 7,
        currentScaleMultiplier: 1,
        currentOpacity: 0.25,
        scaleSpeed: 9, // was 0.15 per frame at 60fps = 9/s
        fadeSpeed: 4.8, // was 0.08 per frame at 60fps = 4.8/s
        
        update(dt, elapsed) {
            this.currentScaleMultiplier += this.scaleSpeed * dt;
            this.currentOpacity -= this.fadeSpeed * dt;
            
            const fireballScale = this.baseFireballScale * this.currentScaleMultiplier;
            this.fireball.scale.set(fireballScale, fireballScale, fireballScale);
            this.material.opacity = Math.max(0, this.currentOpacity);
            const coreScale = this.baseCoreScale * this.currentScaleMultiplier * 0.8;
            this.core.scale.set(coreScale, coreScale, coreScale);
            this.coreMaterial.opacity = Math.max(0, this.currentOpacity * 1.2);
            
            return this.currentOpacity > 0;
        },
        
        cleanup() {
            scene.remove(this.fireball);
            scene.remove(this.core);
            // PERFORMANCE: Return to pool instead of disposing
            returnFireballToPool(this.fireballItem);
            returnCoreToPool(this.coreItem);
        }
    });
}

// Enhanced hit effect based on weapon type
async function spawnWeaponHitEffect(weaponKey, hitPos, hitFish, bulletDirection) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (!config) return;
    
    // Try to spawn GLB hit effect first
    if (weaponGLBState.enabled && glbConfig) {
        const glbSpawned = await spawnGLBHitEffect(weaponKey, hitPos, bulletDirection, hitFish);
        if (glbSpawned) {
            // GLB effect spawned, still add some procedural effects for extra visual impact
            if (weaponKey === '5x' || weaponKey === '8x') {
                triggerScreenShakeWithStrength(weaponKey === '8x' ? 3 : 1);
            }
            // 3X WEAPON: Fire particle burst DISABLED - using original 3x bullet GLB model
            // if (weaponKey === '3x' && fireParticlePool.initialized) {
            //     spawnFireHitBurst(hitPos);
            // }
            return;
        }
    }
    
    // Fallback to procedural effects
    if (weaponKey === '1x') {
        // Small water splash (ring removed per user feedback)
        spawnWaterSplash(hitPos, 10);
        createHitParticles(hitPos, config.hitColor, 2);
        
    } else if (weaponKey === '3x') {
        // Medium fire explosion - fire particle burst DISABLED (using original 3x bullet GLB model)
        // FIX: Removed expanding ring (user feedback: remove all ring effects)
        spawnWaterSplash(hitPos, 17);
        for (let i = 0; i < 2; i++) {
            const angle = (i / 2) * Math.PI * 2;
            const endPos = hitPos.clone();
            endPos.x += Math.cos(angle) * 20;
            endPos.z += Math.sin(angle) * 20;
            spawnLightningArc(hitPos, endPos, config.hitColor);
        }
        createHitParticles(hitPos, config.hitColor, 4);
        
    } else if (weaponKey === '5x') {
        // FIX: Remove ring effects for 5x hit (keep water splash, shockwave, particles)
        spawnWaterSplash(hitPos, 25);
        triggerScreenFlash(config.hitColor, 100, 0.1);
        spawnShockwave(hitPos, config.hitColor, 50);
        createHitParticles(hitPos, config.hitColor, 6);
        // Slight screen shake
        triggerScreenShakeWithStrength(1);
        
    } else if (weaponKey === '8x') {
        // THREE-STAGE EXPLOSION
        spawnMegaExplosion(hitPos);
        // Strong screen shake
        triggerScreenShakeWithStrength(3);
        // Full-screen white flash
        triggerScreenFlash(0xffffff, 100, 0.15);
        spawnWaterColumn(hitPos, 40);
        // Knockback nearby fish
        applyExplosionKnockback(hitPos, 200, 150);
    }
}

// Spawn GLB hit effect model - REFACTORED to use VFX manager
// PERFORMANCE: Synchronous hit effect spawning using pre-cloned pool
// Eliminates: async/await, model.clone(), material.clone(), traverse(), disposeObject3D()
function spawnGLBHitEffect(weaponKey, hitPos, bulletDirection, hitFish) {
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (!glbConfig) return false;
    
    // Get pre-cloned hit effect from pool (synchronous, no async needed)
    const poolItem = getHitEffectFromPool(weaponKey);
    if (!poolItem) {
        console.warn(`[WEAPON-GLB] Hit effect pool exhausted for ${weaponKey}`);
        return false;
    }
    
    const hitEffectModel = poolItem.model;
    const materials = poolItem.materials;
    
    // Apply scale from config
    const scale = glbConfig.hitEffectScale;
    hitEffectModel.scale.set(scale, scale, scale);
    
    // Position at hit location
    hitEffectModel.position.copy(hitPos);
    
    if (camera) {
        hitEffectModel.lookAt(camera.position);
    }
    // Add slight random rotation around the facing axis for visual variety
    hitEffectModel.rotateZ(Math.random() * Math.PI * 2);
    
    // Add to scene
    scene.add(hitEffectModel);
    
    // Register with VFX manager instead of using own RAF loop
    const duration = 200; // 200ms - ultra-short pop
    const initialScale = scale * 0.15;
    const maxScale = scale * 0.5;
    const maxOpacity = 0.25;
    
    materials.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = maxOpacity;
    });
    
    addVfxEffect({
        type: 'glbHitEffect',
        model: hitEffectModel,
        materials: materials,
        poolItem: poolItem,
        weaponKey: weaponKey,
        duration: duration,
        initialScale: initialScale,
        maxScale: maxScale,
        maxOpacity: maxOpacity,
        
        update(dt, elapsed) {
            const progress = Math.min(elapsed / this.duration, 1);
            
            if (progress < 0.3) {
                const scaleProgress = progress / 0.3;
                const currentScale = this.initialScale + (this.maxScale - this.initialScale) * scaleProgress;
                this.model.scale.set(currentScale, currentScale, currentScale);
            } else {
                const fadeProgress = (progress - 0.3) / 0.7;
                this.materials.forEach((mat) => {
                    mat.opacity = this.maxOpacity * (1 - fadeProgress);
                });
            }
            
            return progress < 1;
        },
        
        cleanup() {
            // PERFORMANCE: Return to pool instead of dispose (reuse model)
            scene.remove(this.model);
            returnHitEffectToPool(this.weaponKey, this.poolItem);
        }
    });
    
    return true;
}

// Spawn water splash effect - REFACTORED to use VFX manager
// FIX: Removed ring geometry (user feedback: remove all ring effects)
// Keep only upward splash particles
function spawnWaterSplash(position, size) {
    if (!scene) return;
    
    // Calculate splash position on water surface
    const surfaceY = CONFIG.aquarium.height / 2 - 50;
    const splashPos = position.clone();
    splashPos.y = Math.min(splashPos.y, surfaceY);
    
    // FIX: Removed RingGeometry splash ring (user feedback: remove all ring effects)
    
    // Spawn upward splash particles (these use the existing particle pool system)
    for (let i = 0; i < 3; i++) {
        const particle = freeParticles.pop();
        if (!particle) continue;
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 50,
            50 + Math.random() * 80,
            (Math.random() - 0.5) * 50
        );
        
        particle.spawn(splashPos, velocity, 0xaaddff, 0.8, 0.2);
        activeParticles.push(particle);
    }
}

// Spawn shockwave effect (for 5x weapon) - PARTICLE-BASED VERSION
// Replaced RingGeometry with expanding particle ring for better visual quality
function spawnShockwave(position, color, radius) {
    if (!scene) return;
    
    const particleCount = 15;
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
        
        velocities.push({
            x: Math.cos(angle) * radius * 0.8,
            y: (Math.random() - 0.5) * 10,
            z: Math.sin(angle) * radius * 0.8
        });
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: 2,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    
    addVfxEffect({
        type: 'shockwaveParticles',
        mesh: particles,
        geometry: geometry,
        material: material,
        velocities: velocities,
        duration: 200,
        
        update(dt, elapsed) {
            const progress = Math.min(elapsed / this.duration, 1);
            const positions = this.geometry.attributes.position.array;
            
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += this.velocities[i].x * dt;
                positions[i * 3 + 1] += this.velocities[i].y * dt;
                positions[i * 3 + 2] += this.velocities[i].z * dt;
            }
            this.geometry.attributes.position.needsUpdate = true;
            
            this.material.opacity = 0.2 * (1 - progress);
            this.material.size = 2 + progress * 3;
            
            return progress < 1;
        },
        
        cleanup() {
            scene.remove(this.mesh);
            this.geometry.dispose();
            this.material.dispose();
        }
    });
}

// Spawn mega explosion (three-stage for 8x weapon) - REFACTORED to use VFX manager
// PERFORMANCE: Uses cached geometry with scaling instead of creating new geometry each time
function spawnMegaExplosion(position) {
    if (!scene) return;
    
    // Ensure geometry cache is initialized
    if (!vfxGeometryCache.megaCore) initVfxGeometryCache();
    
    // Stage 1: Core white flash - PERFORMANCE: Use cached geometry
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25
    });
    const core = new THREE.Mesh(vfxGeometryCache.megaCore, coreMaterial);
    core.position.copy(position);
    core.scale.set(5, 5, 5);
    scene.add(core);
    
    addVfxEffect({
        type: 'megaExplosionCore',
        mesh: core,
        material: coreMaterial,
        baseScale: 5,
        currentScaleMultiplier: 1,
        currentOpacity: 0.25,
        scaleSpeed: 18,
        fadeSpeed: 9,
        
        update(dt, elapsed) {
            this.currentScaleMultiplier += this.scaleSpeed * dt;
            this.currentOpacity -= this.fadeSpeed * dt;
            const scale = this.baseScale * this.currentScaleMultiplier;
            this.mesh.scale.set(scale, scale, scale);
            this.material.opacity = Math.max(0, this.currentOpacity);
            return this.currentOpacity > 0;
        },
        
        cleanup() {
            scene.remove(this.mesh);
            // PERFORMANCE: Only dispose material, geometry is cached
            this.material.dispose();
        }
    });
    
    // Stage 2: Orange-red fireball (delayed by 50ms) - PERFORMANCE: Use cached geometry
    // PERFORMANCE: Use temp vector instead of clone()
    const positionCopy = particleTempVectors.startPos.copy(position);
    const posX = positionCopy.x, posY = positionCopy.y, posZ = positionCopy.z;
    addVfxEffect({
        type: 'megaExplosionFireball',
        delayMs: 50,
        started: false,
        fireball: null,
        inner: null,
        fireballMaterial: null,
        innerMaterial: null,
        posX: posX,
        posY: posY,
        posZ: posZ,
        baseFireballScale: 7,
        baseInnerScale: 5,
        currentScaleMultiplier: 1,
        currentOpacity: 0.2,
        scaleSpeed: 7.2, // was 0.12 per frame at 60fps = 7.2/s
        fadeSpeed: 1.8, // was 0.03 per frame at 60fps = 1.8/s
        
        update(dt, elapsed) {
            // Wait for delay before starting
            if (!this.started) {
                if (elapsed < this.delayMs) return true;
                
                // PERFORMANCE: Use cached geometry with scaling
                this.fireballMaterial = new THREE.MeshBasicMaterial({
                    color: 0xff4400,
                    transparent: true,
                    opacity: 0.2
                });
                this.fireball = new THREE.Mesh(vfxGeometryCache.megaFireball, this.fireballMaterial);
                this.fireball.position.set(this.posX, this.posY, this.posZ);
                this.fireball.scale.set(this.baseFireballScale, this.baseFireballScale, this.baseFireballScale);
                scene.add(this.fireball);
                
                this.innerMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffaa00,
                    transparent: true,
                    opacity: 0.2
                });
                this.inner = new THREE.Mesh(vfxGeometryCache.megaInner, this.innerMaterial);
                this.inner.position.set(this.posX, this.posY, this.posZ);
                this.inner.scale.set(this.baseInnerScale, this.baseInnerScale, this.baseInnerScale);
                scene.add(this.inner);
                
                this.started = true;
            }
            
            // Animate fireball
            this.currentScaleMultiplier += this.scaleSpeed * dt;
            this.currentOpacity -= this.fadeSpeed * dt;
            
            const fireballScale = this.baseFireballScale * this.currentScaleMultiplier;
            this.fireball.scale.set(fireballScale, fireballScale, fireballScale);
            this.fireballMaterial.opacity = Math.max(0, this.currentOpacity);
            const innerScale = this.baseInnerScale * this.currentScaleMultiplier * 0.7;
            this.inner.scale.set(innerScale, innerScale, innerScale);
            this.innerMaterial.opacity = Math.max(0, this.currentOpacity * 1.1);
            
            return this.currentOpacity > 0;
        },
        
        cleanup() {
            if (this.fireball) {
                scene.remove(this.fireball);
                // PERFORMANCE: Only dispose material, geometry is cached
                this.fireballMaterial.dispose();
            }
            if (this.inner) {
                scene.remove(this.inner);
                this.innerMaterial.dispose();
            }
        }
    });
    
    // Stage 3: Black smoke REMOVED (user feedback: muddies the screen)
    
    // Spawn flame particles at impact (reduced 70%)
    for (let i = 0; i < 9; i++) {
        // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
        const particle = freeParticles.pop();
        if (!particle) continue;
        
        // PERFORMANCE: Reuse temp vector for velocity
        particleTempVectors.velocity.set(
            (Math.random() - 0.5) * 100,
            Math.random() * 80,
            (Math.random() - 0.5) * 100
        );
        
        const colors = [0xff4400, 0xff6600, 0xffaa00, 0xff2200];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        // PERFORMANCE: No clone() needed - Particle.spawn() uses copy() internally
        particle.spawn(position, particleTempVectors.velocity, color, 1 + Math.random(), 0.15 + Math.random() * 0.05);
        activeParticles.push(particle);
    }
}

// Spawn water column (for 8x weapon)
// PERFORMANCE: Uses temp vectors instead of clone() calls
function spawnWaterColumn(position, height) {
    const surfaceY = CONFIG.aquarium.height / 2 - 50;
    // PERFORMANCE: Store primitive values instead of cloning
    const columnX = position.x;
    const columnZ = position.z;
    
    // Create column of water particles rising up
    for (let i = 0; i < 6; i++) {
        const particle = freeParticles.pop();
        if (!particle) continue;
        
        const startPos = vfxTempVectors.startPos;
        startPos.set(
            columnX + (Math.random() - 0.5) * 30,
            surfaceY,
            columnZ + (Math.random() - 0.5) * 30
        );
        
        const velocity = vfxTempVectors.velocity;
        velocity.set(
            (Math.random() - 0.5) * 20,
            height + Math.random() * height * 0.5,
            (Math.random() - 0.5) * 20
        );
        
        particle.spawn(startPos, velocity, 0x88ccff, 1.5, 0.2);
        activeParticles.push(particle);
    }
}

// ============================================================================
// PUBG-STYLE SMOKE EFFECT SYSTEM FOR FISH DEATH
// Procedural particle-based smoke effect with radial expansion
// ============================================================================

// Cached smoke texture (created once, reused for all smoke effects)
let cachedSmokeTexture = null;

// Create procedural smoke texture using canvas (no external assets needed)
// Enhanced for better visibility in underwater environment
function createSmokeTexture() {
    if (cachedSmokeTexture) return cachedSmokeTexture;
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Brighter, more opaque smoke for underwater visibility
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');  // Bright white center
    gradient.addColorStop(0.3, 'rgba(220, 220, 220, 0.7)');  // Light gray
    gradient.addColorStop(0.6, 'rgba(180, 180, 180, 0.4)');  // Medium gray
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');  // Transparent edge
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    
    cachedSmokeTexture = new THREE.CanvasTexture(canvas);
    return cachedSmokeTexture;
}

// Active smoke effects list for update loop
const activeSmokeEffects = [];

// Smoke effect class - one-shot effect that auto-disposes
// Enhanced for better visibility in underwater environment
class SmokeEffect {
    constructor(position, scale = 1.0) {
        this.particleCount = Math.floor(45 * scale);
        this.duration = 0.2;
        this.particles = [];
        this.alive = true;
        this.elapsedTime = 0;
        
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.particleCount * 3);
        this.sizes = new Float32Array(this.particleCount);
        
        // Initialize particles at spawn position
        for (let i = 0; i < this.particleCount; i++) {
            this.positions[i * 3] = position.x;
            this.positions[i * 3 + 1] = position.y;
            this.positions[i * 3 + 2] = position.z;
            
            // Spherical velocity for radial expansion - FASTER for more visible expansion
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = (1.5 + Math.random() * 2.0) * scale;  // 3x faster expansion
            
            this.particles.push({
                velocity: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta) * speed,
                    Math.abs(Math.cos(phi) * speed) * 0.8,  // More upward movement
                    Math.sin(phi) * Math.sin(theta) * speed
                ),
                life: 1.0,
                decay: (1.0 / this.duration) / 60,
                initialSize: (8 + Math.random() * 12) * scale  // 2-3x larger particles
            });
        }
        
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        
        this.material = new THREE.PointsMaterial({
            size: 10 * scale,
            map: createSmokeTexture(),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0.2,
            sizeAttenuation: true
        });
        
        this.mesh = new THREE.Points(this.geometry, this.material);
        
        if (particleGroup) {
            particleGroup.add(this.mesh);
        } else if (scene) {
            scene.add(this.mesh);
        }
    }
    
    update(dt) {
        if (!this.alive) return false;
        
        this.elapsedTime += dt;
        const posAttr = this.mesh.geometry.attributes.position;
        const sizeAttr = this.mesh.geometry.attributes.size;
        let allDead = true;
        
        for (let i = 0; i < this.particleCount; i++) {
            const p = this.particles[i];
            
            if (p.life > 0) {
                allDead = false;
                
                // Move outward
                posAttr.array[i * 3] += p.velocity.x;
                posAttr.array[i * 3 + 1] += p.velocity.y;
                posAttr.array[i * 3 + 2] += p.velocity.z;
                
                // Friction (underwater has more resistance)
                p.velocity.multiplyScalar(0.96);
                
                // Decay life
                p.life -= p.decay;
                
                // Grow as fading (bloom effect)
                sizeAttr.array[i] = p.initialSize * (2.0 - p.life);
            }
        }
        
        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        
        // Fade out overall opacity
        const lifeRatio = Math.max(0, 1 - (this.elapsedTime / this.duration));
        this.material.opacity = 0.2 * lifeRatio;
        
        // Auto-dispose when all particles are dead or duration exceeded
        if (allDead || this.elapsedTime >= this.duration) {
            this.dispose();
            return false;
        }
        
        return true;
    }
    
    dispose() {
        this.alive = false;
        if (particleGroup) {
            particleGroup.remove(this.mesh);
        } else if (scene) {
            scene.remove(this.mesh);
        }
        this.geometry.dispose();
        this.material.dispose();
    }
}

// Spawn smoke effect at position with optional scale
function spawnSmokeEffect(position, scale = 1.0) {
    const smoke = new SmokeEffect(position, scale);
    activeSmokeEffects.push(smoke);
    return smoke;
}

// Update all active smoke effects (called from main animation loop)
function updateSmokeEffects(dt) {
    for (let i = activeSmokeEffects.length - 1; i >= 0; i--) {
        const smoke = activeSmokeEffects[i];
        if (!smoke.update(dt)) {
            activeSmokeEffects.splice(i, 1);
        }
    }
}

// ============================================================================
// END SMOKE EFFECT SYSTEM
// ============================================================================

// Apply knockback to nearby fish from explosion
// Issue #16: Enhanced fish death explosion effects based on fish size
function spawnFishDeathEffect(position, fishSize, color) {
    if (!scene) return;
    
    switch (fishSize) {
        case 'small':
            // Small splash particles + water ripple + small smoke
            spawnWaterSplash(position.clone(), 0.5);
            createHitParticles(position, color, 8);
            spawnSmokeEffect(position.clone(), 0.5);  // Small smoke puff
            break;
            
        case 'medium':
            // Larger explosion + gold coins fly out + medium smoke
            spawnWaterSplash(position.clone(), 0.8);
            createHitParticles(position, color, 15);
            spawnCoinBurst(position.clone(), 5);
            spawnSmokeEffect(position.clone(), 1.0);  // Medium smoke cloud
            // FIX: Removed expanding ring (user feedback: remove all ring effects)
            break;
            
        case 'large':
            // Huge explosion + screen flash + coins shower + large smoke
            spawnWaterSplash(position.clone(), 1.2);
            createHitParticles(position, color, 25);
            spawnCoinBurst(position.clone(), 12);
            spawnSmokeEffect(position.clone(), 1.5);  // Large smoke cloud
            // FIX: Removed expanding ring (user feedback: remove all ring effects)
            triggerScreenFlash(0xffffcc, 0.3, 150);
            triggerScreenShakeWithStrength(5, 200);
            break;
            
        case 'boss':
            // Massive explosion + light pillar + coin rain + screen shake + massive smoke
            spawnBossDeathEffect(position.clone(), color);
            spawnSmokeEffect(position.clone(), 2.5);  // Massive smoke cloud for boss
            break;
    }
}

// Issue #16: Spawn gold coins burst from fish death - REFACTORED to use VFX manager
// PERFORMANCE: Uses Coin.glb model if available, otherwise falls back to coin pool
function spawnCoinBurst(position, count) {
    if (!particleGroup) return;
    
    const useCoinGLB = coinGLBState.loaded && coinGLBState.model;
    
    for (let i = 0; i < count; i++) {
        // Use Coin.glb model if available
        if (useCoinGLB) {
            const coinModel = cloneCoinModel();
            if (!coinModel) continue;
            
            coinModel.position.copy(position);
            
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 200,
                Math.random() * 150 + 50,
                (Math.random() - 0.5) * 200
            );
            
            particleGroup.add(coinModel);
            
            addVfxEffect({
                type: 'coinBurstGLB',
                mesh: coinModel,
                velocity: velocity,
                elapsedTime: 0,
                gravity: 300,
                spinSpeed: COIN_GLB_CONFIG.rotationSpeed,
                isGLBCoin: true,
                spinAngle: Math.random() * Math.PI * 2,
                
                update(dt, elapsed) {
                    this.elapsedTime += dt;
                    this.mesh.position.x += this.velocity.x * dt;
                    this.mesh.position.y += this.velocity.y * dt;
                    this.mesh.position.z += this.velocity.z * dt;
                    this.velocity.y -= this.gravity * dt;
                    
                    // Billboard effect: make coin always face the camera with front face visible
                    // No spin - coin should always show the $ symbol face towards player
                    if (camera) {
                        // Make the coin look at the camera
                        // The Coin.glb model is flat in XY plane, lookAt alone shows the face correctly
                        this.mesh.lookAt(camera.position);
                        
                        // Distance-based scaling: coins get larger as they approach the camera
                        // This creates a natural perspective effect where coins flying towards the player grow
                        const distance = this.mesh.position.distanceTo(camera.position);
                        const maxDistance = 800;  // Far distance - coin at minimum scale
                        const minDistance = 200;  // Near distance (gun) - coin at maximum scale
                        const minScale = COIN_GLB_CONFIG.scale * 0.5;  // 50% at far distance
                        const maxScale = COIN_GLB_CONFIG.scale;        // 100% at near distance
                        
                        // Linear interpolation: closer = larger
                        const t = Math.max(0, Math.min(1, (maxDistance - distance) / (maxDistance - minDistance)));
                        const scale = minScale + t * (maxScale - minScale);
                        this.mesh.scale.setScalar(scale);
                    }
                    return this.elapsedTime < 1.0;
                },
                
                cleanup() {
                    particleGroup.remove(this.mesh);
                    // Return GLB coin model to pool for reuse (avoids stutter from cloning)
                    returnCoinModelToPool(this.mesh);
                }
            });
            continue;
        }
        
        // Fallback: Get coin from pool instead of creating new
        const coinItem = getCoinFromPool();
        if (!coinItem) {
            // Pool exhausted - fallback to old method for remaining coins
            const cachedGeometry = vfxGeometryCache.coinCylinder;
            if (!cachedGeometry) continue;
            
            const coinMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 1
            });
            const coin = new THREE.Mesh(cachedGeometry, coinMaterial);
            coin.position.copy(position);
            coin.rotation.x = Math.PI / 2;
            
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 200,
                Math.random() * 150 + 50,
                (Math.random() - 0.5) * 200
            );
            
            particleGroup.add(coin);
            
            addVfxEffect({
                type: 'coinBurst',
                mesh: coin,
                material: coinMaterial,
                velocity: velocity,
                elapsedTime: 0,
                gravity: 300,
                spinSpeed: 12,
                poolItem: null,
                
                update(dt, elapsed) {
                    this.elapsedTime += dt;
                    this.mesh.position.x += this.velocity.x * dt;
                    this.mesh.position.y += this.velocity.y * dt;
                    this.mesh.position.z += this.velocity.z * dt;
                    this.velocity.y -= this.gravity * dt;
                    this.mesh.rotation.z += this.spinSpeed * dt;
                    this.material.opacity = Math.max(0, 1 - this.elapsedTime * 1.5);
                    
                    // Distance-based scaling: coins get larger as they approach the camera
                    // Note: Cylinder geometry is 32 units diameter, GLB is 1.91 units
                    // Scale factor for cylinder to match GLB: 200 * (1.91/32) = ~12
                    if (camera) {
                        const distance = this.mesh.position.distanceTo(camera.position);
                        const maxDistance = 800;
                        const minDistance = 200;
                        const cylinderScale = 12;  // Adjusted for cylinder geometry size
                        const minScale = cylinderScale * 0.5;
                        const maxScale = cylinderScale;
                        const t = Math.max(0, Math.min(1, (maxDistance - distance) / (maxDistance - minDistance)));
                        const scale = minScale + t * (maxScale - minScale);
                        this.mesh.scale.setScalar(scale);
                    }
                    return this.elapsedTime < 1.0 && this.material.opacity > 0;
                },
                
                cleanup() {
                    particleGroup.remove(this.mesh);
                    this.material.dispose();
                }
            });
            continue;
        }
        
        // Use pooled coin
        const coin = coinItem.mesh;
        coin.position.copy(position);
        coin.visible = true;
        coinItem.velocity.set(
            (Math.random() - 0.5) * 200,
            Math.random() * 150 + 50,
            (Math.random() - 0.5) * 200
        );
        
        particleGroup.add(coin);
        
        // Register with VFX manager
        addVfxEffect({
            type: 'coinBurst',
            mesh: coin,
            material: coinItem.material,
            velocity: coinItem.velocity,
            elapsedTime: 0,
            gravity: 300,
            spinSpeed: 12,
            poolItem: coinItem,
            
            update(dt, elapsed) {
                this.elapsedTime += dt;
                
                // Apply velocity and gravity
                this.mesh.position.x += this.velocity.x * dt;
                this.mesh.position.y += this.velocity.y * dt;
                this.mesh.position.z += this.velocity.z * dt;
                this.velocity.y -= this.gravity * dt;
                
                // Spin and fade
                this.mesh.rotation.z += this.spinSpeed * dt;
                this.material.opacity = Math.max(0, 1 - this.elapsedTime * 1.5);
                
                // Distance-based scaling: coins get larger as they approach the camera
                // Note: Pooled coins use cylinder geometry (32 units diameter)
                // Scale factor for cylinder to match GLB: 200 * (1.91/32) = ~12
                if (camera) {
                    const distance = this.mesh.position.distanceTo(camera.position);
                    const maxDistance = 800;
                    const minDistance = 200;
                    const cylinderScale = 12;  // Adjusted for cylinder geometry size
                    const minScale = cylinderScale * 0.5;
                    const maxScale = cylinderScale;
                    const t = Math.max(0, Math.min(1, (maxDistance - distance) / (maxDistance - minDistance)));
                    const scale = minScale + t * (maxScale - minScale);
                    this.mesh.scale.setScalar(scale);
                }
                
                return this.elapsedTime < 1.0 && this.material.opacity > 0;
            },
            
            cleanup() {
                particleGroup.remove(this.mesh);
                // OPTIMIZATION 1: Return to pool instead of disposing
                if (this.poolItem) {
                    returnCoinToPool(this.poolItem);
                } else {
                    this.material.dispose();
                }
            }
        });
    }
}

// ============================================================================
// DELAYED COIN COLLECTION SYSTEM
// Coins stay at death location for 5-8 seconds with gentle spinning animation
// Then all coins on screen are collected together and fly to score
// ============================================================================

const coinCollectionSystem = {
    waitingCoins: [],           // Coins waiting to be collected
    collectionTimer: 0,         // Time until next collection
    collectionInterval: 4000,   // Wait 4 seconds before coins fly to cannon
    isCollecting: false,        // Whether collection animation is in progress
    initialized: false,
    pendingReward: 0,           // Total reward waiting to be collected (balance updates on coin arrival)
    maxCollectionTime: 3000,    // Maximum 3 seconds to collect all coins
    coinsBeingCollected: 0      // Track how many coins are still flying to cannon
};

function initCoinCollectionSystem() {
    if (coinCollectionSystem.initialized) return;
    coinCollectionSystem.collectionTimer = coinCollectionSystem.collectionInterval;
    coinCollectionSystem.initialized = true;
}

function spawnWaitingCoin(position, rewardPerCoin = 0) {
    if (!particleGroup) return;
    
    const useCoinGLB = coinGLBState.loaded && coinGLBState.model;
    if (!useCoinGLB) return;
    
    if (coinCollectionSystem.waitingCoins.length === 0 && !coinCollectionSystem.isCollecting) {
        coinCollectionSystem.collectionTimer = coinCollectionSystem.collectionInterval;
    }
    
    const coinModel = cloneCoinModel();
    if (!coinModel) return;
    
    const offsetX = (Math.random() - 0.5) * 60;
    const offsetY = (Math.random() - 0.5) * 60;
    const offsetZ = (Math.random() - 0.5) * 60;
    
    coinModel.position.set(
        position.x + offsetX,
        position.y + offsetY,
        position.z + offsetZ
    );
    coinModel.scale.setScalar(COIN_GLB_CONFIG.scale);
    particleGroup.add(coinModel);
    
    coinCollectionSystem.waitingCoins.push({
        mesh: coinModel,
        spinAngle: Math.random() * Math.PI * 2,
        spinSpeed: 1.5 + Math.random() * 1.0, // Gentle spin: 1.5-2.5 rad/s
        bobOffset: Math.random() * Math.PI * 2,
        baseY: coinModel.position.y,
        state: 'waiting', // 'waiting' or 'collecting'
        reward: rewardPerCoin // Reward value for this coin (balance updates when coin reaches cannon)
    });
}

function updateCoinCollectionSystem(dt) {
    if (!coinCollectionSystem.initialized) {
        initCoinCollectionSystem();
    }
    
    // SAFETY CHECK: Detect and recover from stuck state
    // If isCollecting is true but coinsBeingCollected is 0, we're stuck
    if (coinCollectionSystem.isCollecting && coinCollectionSystem.coinsBeingCollected <= 0) {
        console.warn('[CoinCollection] Detected stuck state - recovering');
        onCoinCollectionComplete();
    }
    
    // SAFETY CHECK: If isCollecting has been true for too long (>10 seconds), force reset
    if (coinCollectionSystem.isCollecting) {
        coinCollectionSystem.collectingDuration = (coinCollectionSystem.collectingDuration || 0) + dt * 1000;
        if (coinCollectionSystem.collectingDuration > 10000) {
            console.warn('[CoinCollection] Collection timeout - force resetting');
            stopCasinoCoinSound();
            onCoinCollectionComplete();
        }
    } else {
        coinCollectionSystem.collectingDuration = 0;
    }
    
    // Only count down timer when NOT collecting (wait for collection to finish first)
    if (!coinCollectionSystem.isCollecting) {
        coinCollectionSystem.collectionTimer -= dt * 1000;
        
        // Trigger collection when timer expires and there are waiting coins
        if (coinCollectionSystem.collectionTimer <= 0 && coinCollectionSystem.waitingCoins.length > 0) {
            triggerCoinCollection();
            // Timer will be reset when collection finishes (in onCoinCollectionComplete)
        }
    }
    
    // Update waiting coins (gentle spin and bob animation)
    const time = performance.now() * 0.001;
    for (let i = coinCollectionSystem.waitingCoins.length - 1; i >= 0; i--) {
        const coin = coinCollectionSystem.waitingCoins[i];
        
        if (coin.state === 'waiting') {
            // Gentle spinning animation
            coin.spinAngle += coin.spinSpeed * dt;
            
            // Apply rotation around Y axis for spinning effect
            coin.mesh.rotation.y = coin.spinAngle;
            
            // Gentle bobbing up and down
            const bobAmount = Math.sin(time * 2 + coin.bobOffset) * 5;
            coin.mesh.position.y = coin.baseY + bobAmount;
            
            // Billboard effect: face camera while spinning
            if (camera) {
                const cameraDir = new THREE.Vector3();
                cameraDir.subVectors(camera.position, coin.mesh.position).normalize();
                const yaw = Math.atan2(cameraDir.x, cameraDir.z);
                coin.mesh.rotation.y = yaw + coin.spinAngle * 0.3; // Combine camera facing with gentle spin
            }
        }
    }
}

function triggerCoinCollection() {
    if (coinCollectionSystem.waitingCoins.length === 0) return;
    if (!cannonMuzzle) return;
    
    // Get target position (cannon muzzle)
    const targetPos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(targetPos);
    
    // Store total coins for pitch calculation
    const totalCoins = coinCollectionSystem.waitingCoins.filter(c => c.state === 'waiting').length;
    if (totalCoins === 0) return;
    
    // DYNAMIC COLLECTION TIME: Based on coin count for better game feel
    // 1-10 coins: 1.5s (quick collection for small wins)
    // 11-30 coins: 2.5s (medium collection)
    // 31-50 coins: 3.5s (longer for big wins)
    // 50+ coins: 4s (maximum for huge wins like AUTO ATTACK + 8X)
    let dynamicCollectionTime;
    if (totalCoins <= 10) {
        dynamicCollectionTime = 1500;
    } else if (totalCoins <= 30) {
        dynamicCollectionTime = 2500;
    } else if (totalCoins <= 50) {
        dynamicCollectionTime = 3500;
    } else {
        dynamicCollectionTime = 4000;
    }
    
    // Update casino sound max duration to match collection time
    casinoSoundState.maxDuration = dynamicCollectionTime;
    
    // Mark collection as in progress
    coinCollectionSystem.isCollecting = true;
    coinCollectionSystem.coinsBeingCollected = totalCoins;
    
    // CASINO EFFECT: Start continuous casino sound that plays until all coins are collected
    startCasinoCoinSound(totalCoins);
    
    // TIMING: Calculate delay between coins to fit all coins within dynamic collection time
    // Reserve 800ms for the last coin's flight time
    const maxDelayTime = dynamicCollectionTime - 800;
    const baseDelay = totalCoins > 1 ? Math.min(150, maxDelayTime / (totalCoins - 1)) : 0;
    
    // Start collection animation for all waiting coins
    coinCollectionSystem.waitingCoins.forEach((coin, index) => {
        if (coin.state !== 'waiting') return;
        coin.state = 'collecting';
        
        // CASINO EFFECT: Stagger coins with dynamic delays to fit within 5 seconds
        const randomDelay = Math.random() * Math.min(50, baseDelay * 0.3);
        const delay = index * baseDelay + randomDelay;
        
        // Create fly-to-score animation
        const startX = coin.mesh.position.x;
        const startY = coin.mesh.position.y;
        const startZ = coin.mesh.position.z;
        const midX = (startX + targetPos.x) * 0.5;
        const midY = (startY + targetPos.y) * 0.5 + 100 + Math.random() * 50;
        const midZ = (startZ + targetPos.z) * 0.5;
        
        addVfxEffect({
            type: 'coinCollect',
            coin: coin,
            coinIndex: index,
            totalCoins: totalCoins,
            delayMs: delay,
            started: false,
            startX: startX,
            startY: startY,
            startZ: startZ,
            midX: midX,
            midY: midY,
            midZ: midZ,
            targetX: targetPos.x,
            targetY: targetPos.y,
            targetZ: targetPos.z,
            duration: (0.6 + Math.random() * 0.3) * 1000, // 0.6-0.9s flight time
            elapsedSinceStart: 0,
            
            update(dt, elapsed) {
                if (!this.started) {
                    if (elapsed < this.delayMs) return true;
                    this.started = true;
                    this.elapsedSinceStart = 0;
                    
                    // Stop spinning - show front face toward camera
                    if (camera && this.coin.mesh) {
                        this.coin.mesh.lookAt(camera.position);
                    }
                }
                
                this.elapsedSinceStart += dt * 1000;
                const t = Math.min(this.elapsedSinceStart / this.duration, 1);
                
                // Quadratic bezier curve
                const mt = 1 - t;
                const mt2 = mt * mt;
                const t2 = t * t;
                
                this.coin.mesh.position.x = mt2 * this.startX + 2 * mt * t * this.midX + t2 * this.targetX;
                this.coin.mesh.position.y = mt2 * this.startY + 2 * mt * t * this.midY + t2 * this.targetY;
                this.coin.mesh.position.z = mt2 * this.startZ + 2 * mt * t * this.midZ + t2 * this.targetZ;
                
                // Keep facing camera during flight (no spin)
                if (camera) {
                    this.coin.mesh.lookAt(camera.position);
                }
                
                // Scale up slightly as it approaches
                const baseScale = COIN_GLB_CONFIG.scale;
                const scale = baseScale * (1 + t * 0.3);
                this.coin.mesh.scale.setScalar(scale);
                
                if (t >= 1) {
                    // Coin reached cannon muzzle - update balance and notify sound system
                    onCoinCollected();
                    
                    // LEAK-1 FIX: coin-fly is visual-only, balance comes from server SSOT
                    return false;
                }
                return true;
            },
            
            cleanup() {
                if (this.coin && this.coin.mesh) {
                    particleGroup.remove(this.coin.mesh);
                    returnCoinModelToPool(this.coin.mesh);
                    
                    // Remove from waiting coins array
                    const idx = coinCollectionSystem.waitingCoins.indexOf(this.coin);
                    if (idx !== -1) {
                        coinCollectionSystem.waitingCoins.splice(idx, 1);
                    }
                    
                    // CRITICAL FIX: If cleanup is called before coin reached cannon (e.g., VFX limit reached),
                    // we must still decrement the counter to prevent isCollecting from being stuck forever
                    if (this.coin.state === 'collecting' && coinCollectionSystem.coinsBeingCollected > 0) {
                        coinCollectionSystem.coinsBeingCollected--;
                        
                        // Also update sound state
                        if (casinoSoundState.isPlaying && casinoSoundState.coinsRemaining > 0) {
                            casinoSoundState.coinsRemaining--;
                        }
                        
                        // Check if all coins have been collected (or cleaned up)
                        if (coinCollectionSystem.coinsBeingCollected <= 0) {
                            onCoinCollectionComplete();
                        }
                    }
                }
            }
        });
    });
}

// Casino coin collection sound state
const casinoSoundState = {
    source: null,
    gainNode: null,
    isPlaying: false,
    coinsRemaining: 0,
    totalCoins: 0,      // Total coins in this collection batch (for volume ramping)
    maxDuration: 4000,  // Maximum 4 seconds of casino sound (for large coin counts)
    timeoutId: null,    // Timeout to auto-stop sound after max duration
    startTime: 0,       // Track when sound started for proportional fade out
    lastSoundTime: 0,   // Track last sound play time for rate limiting
    minSoundInterval: 100  // Minimum 100ms between sounds (max 10 sounds/sec)
};

// Play single coin sound effect with CASINO-style volume ramp and pitch variation
// Volume increases as more coins are collected (building excitement)
// Pitch varies slightly for natural coin sound variety
// RATE LIMITED: Max 10 sounds per second to prevent audio overload
function playCoinReceiveSound() {
    if (!audioContext || !sfxGain) return;
    
    // RATE LIMITING: Don't play if last sound was too recent
    const now = performance.now();
    if (now - casinoSoundState.lastSoundTime < casinoSoundState.minSoundInterval) {
        return; // Skip this sound to prevent audio overload
    }
    casinoSoundState.lastSoundTime = now;
    
    const buffer = audioBufferCache.get('coinReceive');
    if (!buffer) return;
    
    try {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        
        // CASINO EFFECT: Random pitch variation (0.9x - 1.1x) for natural coin sound
        const pitchVariation = 0.9 + Math.random() * 0.2;
        source.playbackRate.value = pitchVariation;
        
        // CASINO EFFECT: Volume ramps up as coins accumulate (building excitement)
        // Start at 40% volume, increase to 100% as collection progresses
        const totalCoins = casinoSoundState.totalCoins || 1;
        const coinsCollected = totalCoins - (casinoSoundState.coinsRemaining || 0);
        const progress = Math.min(coinsCollected / totalCoins, 1);
        
        // Volume curve: starts at 0.4, ramps to 1.0 (last coins are loudest for climax)
        const volumeMultiplier = 0.4 + (progress * 0.6);
        const baseVolume = AUDIO_CONFIG.volumes.coinReceive;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = baseVolume * volumeMultiplier;
        
        source.connect(gainNode);
        gainNode.connect(sfxGain);
        source.start(0);
    } catch (e) {
        // Ignore audio errors
    }
}

// Start coin collection - tracks state for volume ramping
function startCasinoCoinSound(totalCoins) {
    if (!audioContext || !sfxGain) return;
    
    casinoSoundState.isPlaying = true;
    casinoSoundState.coinsRemaining = totalCoins;
    casinoSoundState.totalCoins = totalCoins;  // Store total for volume calculation
    casinoSoundState.startTime = audioContext.currentTime;
    
    // Safety: Auto-stop after max duration
    if (casinoSoundState.timeoutId) {
        clearTimeout(casinoSoundState.timeoutId);
    }
    casinoSoundState.timeoutId = setTimeout(() => {
        stopCasinoCoinSound();
    }, casinoSoundState.maxDuration);
}

// Called when a coin reaches the cannon - play CASINO-style sound and decrement counter
function onCoinCollected() {
    // Decrement coin counter for collection system
    coinCollectionSystem.coinsBeingCollected--;
    
    // Play coin receive sound with CASINO effect (volume ramp + pitch variation)
    playCoinReceiveSound();
    
    // Decrement sound counter
    if (casinoSoundState.isPlaying) {
        casinoSoundState.coinsRemaining--;
        
        if (casinoSoundState.coinsRemaining <= 0) {
            stopCasinoCoinSound();
        }
    }
    
    // Check if all coins have been collected
    if (coinCollectionSystem.coinsBeingCollected <= 0) {
        onCoinCollectionComplete();
    }
}

// Called when all coins in a collection batch have reached the cannon
function onCoinCollectionComplete() {
    coinCollectionSystem.isCollecting = false;
    coinCollectionSystem.coinsBeingCollected = 0;
    
    // Reset timer - wait 8 seconds before next collection
    coinCollectionSystem.collectionTimer = coinCollectionSystem.collectionInterval;
}

// Stop the casino coin sound with proportional fade out based on played duration
function stopCasinoCoinSound() {
    // Clear the auto-stop timeout
    if (casinoSoundState.timeoutId) {
        clearTimeout(casinoSoundState.timeoutId);
        casinoSoundState.timeoutId = null;
    }
    
    if (!casinoSoundState.isPlaying || !casinoSoundState.source) return;
    
    // Calculate proportional fade out duration based on how long the sound has played
    // Fade out = 20% of played duration, clamped between 0.3s and 1.5s
    const playedDuration = audioContext ? audioContext.currentTime - casinoSoundState.startTime : 1;
    const fadeOutDuration = Math.min(Math.max(playedDuration * 0.2, 0.3), 1.5);
    
    try {
        // Use exponential ramp for more natural-sounding fade (human ear perceives volume logarithmically)
        if (casinoSoundState.gainNode && audioContext) {
            const currentGain = casinoSoundState.gainNode.gain.value;
            casinoSoundState.gainNode.gain.setValueAtTime(currentGain, audioContext.currentTime);
            // Exponential ramp needs a small non-zero target value
            casinoSoundState.gainNode.gain.exponentialRampToValueAtTime(
                0.001, 
                audioContext.currentTime + fadeOutDuration
            );
        }
        
        // Stop after fade completes
        setTimeout(() => {
            try {
                if (casinoSoundState.source) {
                    casinoSoundState.source.stop();
                }
            } catch (e) {
                // Ignore errors if already stopped
            }
            casinoSoundState.source = null;
            casinoSoundState.gainNode = null;
            casinoSoundState.isPlaying = false;
            casinoSoundState.coinsRemaining = 0;
            casinoSoundState.startTime = 0;
        }, fadeOutDuration * 1000);
    } catch (e) {
        // Reset state on error
        casinoSoundState.source = null;
        casinoSoundState.gainNode = null;
        casinoSoundState.isPlaying = false;
        casinoSoundState.coinsRemaining = 0;
        casinoSoundState.startTime = 0;
    }
}

// VISUAL ONLY: Coin fly animation to cannon muzzle
// Balance is set exclusively by server balanceUpdate (multiplayer) or die() (single-player)
// reward param is kept for visual reward popup sizing only — MUST NOT modify gameState.balance
function spawnCoinFlyToScore(startPosition, coinCount, reward) {
    // FIX: Changed from undefined 'cannon' to 'cannonMuzzle' which is the actual gun barrel tip
    if (!particleGroup || !cannonMuzzle) return;
    
    // Calculate reward per coin (distribute total reward across all coins)
    const actualCoinCount = Math.min(coinCount, 15);
    const rewardPerCoin = actualCoinCount > 0 ? reward / actualCoinCount : 0;
    
    // INSTANT FLY: Coins fly to cannon immediately on fish death (no 8s delay)
    const useCoinGLB = coinGLBState.loaded && coinGLBState.model;
    if (useCoinGLB) {
        const targetPos = new THREE.Vector3();
        cannonMuzzle.getWorldPosition(targetPos);
        
        for (let i = 0; i < actualCoinCount; i++) {
            const coinModel = cloneCoinModel();
            if (!coinModel) continue;
            
            const offsetX = (Math.random() - 0.5) * 60;
            const offsetY = (Math.random() - 0.5) * 60;
            const offsetZ = (Math.random() - 0.5) * 60;
            
            coinModel.position.set(
                startPosition.x + offsetX,
                startPosition.y + offsetY,
                startPosition.z + offsetZ
            );
            coinModel.scale.setScalar(COIN_GLB_CONFIG.scale);
            particleGroup.add(coinModel);
            
            const startX = coinModel.position.x;
            const startY = coinModel.position.y;
            const startZ = coinModel.position.z;
            const midX = (startX + targetPos.x) * 0.5;
            const midY = (startY + targetPos.y) * 0.5 + 80 + Math.random() * 40;
            const midZ = (startZ + targetPos.z) * 0.5;
            const coinReward = rewardPerCoin;
            const delayMs = i * 30;
            
            addVfxEffect({
                type: 'coinInstantFly',
                mesh: coinModel,
                reward: coinReward,
                delayMs: delayMs,
                started: false,
                startX: startX,
                startY: startY,
                startZ: startZ,
                midX: midX,
                midY: midY,
                midZ: midZ,
                targetX: targetPos.x,
                targetY: targetPos.y,
                targetZ: targetPos.z,
                duration: (0.3 + Math.random() * 0.2) * 1000,
                elapsedSinceStart: 0,
                
                update(dt, elapsed) {
                    if (!this.started) {
                        if (elapsed < this.delayMs) return true;
                        this.started = true;
                        this.elapsedSinceStart = 0;
                        if (camera && this.mesh) {
                            this.mesh.lookAt(camera.position);
                        }
                    }
                    
                    this.elapsedSinceStart += dt * 1000;
                    const t = Math.min(this.elapsedSinceStart / this.duration, 1);
                    
                    const mt = 1 - t;
                    const mt2 = mt * mt;
                    const t2 = t * t;
                    
                    this.mesh.position.x = mt2 * this.startX + 2 * mt * t * this.midX + t2 * this.targetX;
                    this.mesh.position.y = mt2 * this.startY + 2 * mt * t * this.midY + t2 * this.targetY;
                    this.mesh.position.z = mt2 * this.startZ + 2 * mt * t * this.midZ + t2 * this.targetZ;
                    
                    if (camera) {
                        this.mesh.lookAt(camera.position);
                    }
                    
                    const baseScale = COIN_GLB_CONFIG.scale;
                    const scale = baseScale * (1 + t * 0.3);
                    this.mesh.scale.setScalar(scale);
                    
                    if (t >= 1) {
                        playCoinReceiveSound();
                        return false;
                    }
                    return true;
                },
                
                cleanup() {
                    particleGroup.remove(this.mesh);
                    returnCoinModelToPool(this.mesh);
                }
            });
        }
        return;
    }
    
    // FALLBACK: Old immediate fly animation for non-GLB coins
    
    // PERFORMANCE: Use cached geometry as fallback (useCoinGLB already checked above)
    const cachedCoinGeometry = vfxGeometryCache.coinSphere;
    const cachedTrailGeometry = vfxGeometryCache.smallSphere;
    if (!cachedCoinGeometry || !cachedTrailGeometry) return;
    
    // Get cannon muzzle position as target (where the gun barrel points)
    // PERFORMANCE: Reuse temp vector instead of creating new Vector3
    cannonMuzzle.getWorldPosition(vfxTempVectors.targetPos);
    const targetX = vfxTempVectors.targetPos.x;
    const targetY = vfxTempVectors.targetPos.y;
    const targetZ = vfxTempVectors.targetPos.z;
    
    for (let i = 0; i < Math.min(coinCount, 15); i++) {
        // Use time-based delay instead of setTimeout
        const delayMs = i * 50;
        // PERFORMANCE: Store primitive values instead of cloning vectors
        const startX = startPosition.x;
        const startY = startPosition.y;
        const startZ = startPosition.z;
        
        addVfxEffect({
            type: 'coinFlyToScore',
            delayMs: delayMs,
            started: false,
            coin: null,
            trail: null,
            coinMaterial: null,
            trailMaterial: null,
            startX: startX,
            startY: startY,
            startZ: startZ,
            midX: 0,
            midY: 0,
            midZ: 0,
            targetX: targetX,
            targetY: targetY,
            targetZ: targetZ,
            duration: (0.8 + Math.random() * 0.2) * 1000, // Convert to ms (0.8-1.0s for more ceremonial feel)
            elapsedSinceStart: 0,
            spinSpeedX: 18,
            spinSpeedY: 12,
            
            update(dt, elapsed) {
                // Wait for delay before starting
                if (!this.started) {
                    if (elapsed < this.delayMs) return true;
                    
                    // Use Coin.glb model if available, otherwise fallback to procedural geometry
                    if (useCoinGLB) {
                        this.coin = cloneCoinModel();
                        if (!this.coin) {
                            return false;
                        }
                        this.isGLBCoin = true;
                    } else {
                        this.coinMaterial = new THREE.MeshBasicMaterial({
                            color: 0xffd700,
                            transparent: true,
                            opacity: 1
                        });
                        this.coin = new THREE.Mesh(cachedCoinGeometry, this.coinMaterial);
                        this.isGLBCoin = false;
                    }
                    
                    // Start position with slight random offset
                    const offsetX = (Math.random() - 0.5) * 50;
                    const offsetY = (Math.random() - 0.5) * 50;
                    const offsetZ = (Math.random() - 0.5) * 50;
                    this.coin.position.set(this.startX + offsetX, this.startY + offsetY, this.startZ + offsetZ);
                    
                    particleGroup.add(this.coin);
                    
                    // PERFORMANCE: Use cached geometry for trail
                    this.trailMaterial = new THREE.MeshBasicMaterial({
                        color: 0xffee88,
                        transparent: true,
                        opacity: 0.6
                    });
                    this.trail = new THREE.Mesh(cachedTrailGeometry, this.trailMaterial);
                    this.trail.scale.setScalar(8); // Scale cached unit sphere
                    this.trail.position.copy(this.coin.position);
                    particleGroup.add(this.trail);
                    
                    // Store actual start position and calculate midpoint
                    this.startX = this.coin.position.x;
                    this.startY = this.coin.position.y;
                    this.startZ = this.coin.position.z;
                    this.midX = (this.startX + this.targetX) * 0.5;
                    this.midY = (this.startY + this.targetY) * 0.5 + 100 + Math.random() * 50;
                    this.midZ = (this.startZ + this.targetZ) * 0.5;
                    
                    this.started = true;
                    this.elapsedSinceStart = 0;
                }
                
                // Animate coin
                this.elapsedSinceStart += dt * 1000; // Convert to ms
                const t = Math.min(this.elapsedSinceStart / this.duration, 1);
                
                // Quadratic bezier curve (using primitive values)
                const mt = 1 - t;
                const mt2 = mt * mt;
                const t2 = t * t;
                
                this.coin.position.x = mt2 * this.startX + 2 * mt * t * this.midX + t2 * this.targetX;
                this.coin.position.y = mt2 * this.startY + 2 * mt * t * this.midY + t2 * this.targetY;
                this.coin.position.z = mt2 * this.startZ + 2 * mt * t * this.midZ + t2 * this.targetZ;
                
                // Trail follows with delay
                this.trail.position.lerp(this.coin.position, 0.3);
                
                // Billboard effect: make coin always face the camera
                // The Coin.glb model is flat in XY plane, so lookAt alone should show the face
                if (camera) {
                    this.coin.lookAt(camera.position);
                }
                
                // Scale up as it gets closer (magnetic effect)
                // Use COIN_GLB_CONFIG.scale as base for consistent sizing with static coins
                const baseScale = COIN_GLB_CONFIG.scale;  // 50
                const scale = baseScale * (1 + t * 0.5);  // 50 to 75 during animation
                this.coin.scale.setScalar(scale);
                
                // Fade trail
                this.trailMaterial.opacity = 0.6 * (1 - t);
                
                if (t >= 1) {
                    // Coin reached score - create pop effect
                    spawnScorePopEffect();
                    return false; // Done
                }
                return true;
            },
            
            cleanup() {
                if (this.coin) {
                    particleGroup.remove(this.coin);
                    if (this.isGLBCoin) {
                        // Return GLB coin model to pool for reuse (avoids stutter from cloning)
                        returnCoinModelToPool(this.coin);
                    } else if (this.coinMaterial) {
                        this.coinMaterial.dispose();
                    }
                }
                if (this.trail) {
                    particleGroup.remove(this.trail);
                    this.trailMaterial.dispose();
                }
            }
        });
    }
}

// Issue #16: Score pop effect when coins arrive at cannon
// PERFORMANCE: Pre-created DOM element pool to avoid createElement during gameplay
const scorePopPool = {
    elements: [],
    poolSize: 20,
    freeList: [],
    initialized: false
};

function initScorePopPool() {
    if (scorePopPool.initialized) return;
    
    // Add animation keyframes first
    if (!document.getElementById('score-pop-style')) {
        const style = document.createElement('style');
        style.id = 'score-pop-style';
        style.textContent = `
            @keyframes scorePop {
                0% { transform: translateX(-50%) scale(0.5); opacity: 1; }
                100% { transform: translateX(-50%) scale(2); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Pre-create DOM elements
    for (let i = 0; i < scorePopPool.poolSize; i++) {
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
            display: none;
        `;
        pop.dataset.poolIndex = i;
        document.body.appendChild(pop);
        scorePopPool.elements.push(pop);
        scorePopPool.freeList.push(i);
    }
    
    scorePopPool.initialized = true;
    console.log('[PRELOAD] Score pop DOM pool initialized (20 elements)');
}

function spawnScorePopEffect() {
    // Initialize pool on first use if not already done
    if (!scorePopPool.initialized) initScorePopPool();
    
    // Get element from pool
    if (scorePopPool.freeList.length === 0) return; // Pool exhausted, skip effect
    
    const idx = scorePopPool.freeList.pop();
    const pop = scorePopPool.elements[idx];
    
    // Show and animate
    pop.style.display = 'block';
    pop.style.animation = 'none';
    pop.offsetHeight; // Force reflow
    pop.style.animation = 'scorePop 0.4s ease-out forwards';
    
    // Return to pool after animation
    setTimeout(() => {
        pop.style.display = 'none';
        scorePopPool.freeList.push(idx);
    }, 400);
}

// Issue #16: Boss death spectacular effect - REFACTORED to use VFX manager
function spawnBossDeathEffect(position, color) {
    if (!scene) return;
    
    // Massive explosion (already refactored to use VFX manager)
    spawnMegaExplosion(position.clone(), 2.0);
    
    // Light pillar shooting up - register with VFX manager
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
    
    addVfxEffect({
        type: 'bossDeathPillar',
        mesh: pillar,
        geometry: pillarGeometry,
        material: pillarMaterial,
        currentOpacity: 0.8,
        fadeSpeed: 1.2, // was 0.02 per frame at 60fps = 1.2/s
        scaleGrowth: 1.2, // was 1.02 per frame at 60fps = ~1.2/s growth rate
        riseSpeed: 600, // was 10 per frame at 60fps = 600/s
        
        update(dt, elapsed) {
            this.currentOpacity -= this.fadeSpeed * dt;
            this.material.opacity = Math.max(0, this.currentOpacity);
            
            // Scale expansion
            const scaleMultiplier = 1 + this.scaleGrowth * dt;
            this.mesh.scale.x *= scaleMultiplier;
            this.mesh.scale.z *= scaleMultiplier;
            this.mesh.position.y += this.riseSpeed * dt;
            
            return this.currentOpacity > 0;
        },
        
        cleanup() {
            scene.remove(this.mesh);
            this.geometry.dispose();
            this.material.dispose();
        }
    });
    
    // Coin rain (already refactored to use VFX manager)
    spawnCoinBurst(position.clone(), 30);
    
    // FIX: Removed multiple expanding rings (user feedback: remove all ring effects)
    // Keep screen effects only
    
    // Screen effects (DOM-based, no RAF needed)
    triggerScreenFlash(0xffff88, 0.5, 300);
    triggerScreenShakeWithStrength(15, 500);
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

// FIX: Track weapon switch animation state to prevent scale accumulation
let weaponSwitchAnimationId = 0;

// PERFORMANCE: Temp vectors for weapon switch animation to avoid per-switch allocation
const weaponSwitchTempPos = new THREE.Vector3();
const weaponSwitchTempDir = new THREE.Vector3();

// Weapon switch animation
function playWeaponSwitchAnimation(weaponKey) {
    const config = WEAPON_VFX_CONFIG[weaponKey];
    if (!config || !cannonGroup) return;
    
    // Store current weapon ring color for defensive checks in updateSciFiBaseRing()
    currentRingColor = config.ringColor;
    
    // Animate base ring color change - update BOTH core and glow layers
    if (cannonBaseRingCore && cannonBaseRingCore.material) {
        cannonBaseRingCore.material.color.setHex(config.ringColor);
    }
    if (cannonBaseRingGlow && cannonBaseRingGlow.material) {
        cannonBaseRingGlow.material.color.setHex(config.ringColor);
    }
    
    // FIX: Cancel any previous animation by incrementing the animation ID
    // This prevents scale accumulation when rapidly switching weapons
    weaponSwitchAnimationId++;
    const currentAnimationId = weaponSwitchAnimationId;
    
    const baseScale = 1.2;
    
    // Cannon transformation animation (slight bounce)
    cannonGroup.scale.set(
        baseScale * 0.9,
        baseScale * 1.1,
        baseScale * 0.9
    );
    
    setTimeout(() => {
        // FIX: Only restore scale if this is still the current animation
        // This prevents old animations from overwriting newer ones
        if (currentAnimationId === weaponSwitchAnimationId && cannonGroup) {
            cannonGroup.scale.set(baseScale, baseScale, baseScale);
        }
    }, 100);
    
    // VISUAL FIX: Replace large ring effect with subtle particle burst
    // User feedback: rings don't fit with game's visual style
    // PERFORMANCE: Use temp vector instead of clone() to avoid per-switch allocation
    weaponSwitchTempPos.copy(cannonGroup.position);
    weaponSwitchTempPos.y += 30;
    // Spawn upward particle burst instead of expanding ring
    // Uses existing pooled particle system for high performance
    weaponSwitchTempDir.set(0, 1, 0); // Upward direction
    spawnMuzzleParticles(weaponSwitchTempPos, weaponSwitchTempDir, config.ringColor, 12);
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
                    // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
                    const particle = freeParticles.pop();
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

// PERFORMANCE: Free-lists for O(1) inactive object lookup (replaces O(n) .find() scans)
const freeBullets = [];    // Stack of inactive bullets - pop() to get, push() to return
const freeParticles = [];  // Stack of inactive particles - pop() to get, push() to return
const freeFish = [];       // Stack of inactive fish - pop() to get, push() to return (Boss Mode optimization)
const activeParticles = [];

// Timing
let lastTime = 0;
let deltaTime = 0;
let fpsCounter = 0;
let fpsTime = 0;
let autoShootTimer = 0;

// ==================== AUTO-FIRE DEBUG HUD ====================
window.DEBUG_COMET_MODE = false;
window.DEBUG_AUTOFIRE_HUD = false;
const _afDebug = {
    shotCount: 0,
    balanceAtStart: 0,
    startTime: 0,
    lastFps: 0,
    _fpsFrames: 0,
    _fpsTime: 0,
    el: null,
    active: false,
    init() {
        if (this.el) return;
        const div = document.createElement('div');
        div.id = 'autofire-debug';
        div.style.cssText = 'position:fixed;bottom:8px;right:8px;background:rgba(0,0,0,0.75);color:#0ff;font-family:monospace;font-size:12px;padding:8px 12px;border-radius:6px;z-index:99999;pointer-events:none;display:none;line-height:1.6;white-space:pre;transform:scale(var(--ui-scale));transform-origin:bottom right;';
        document.body.appendChild(div);
        this.el = div;
    },
    reset() {
        this.shotCount = 0;
        this.balanceAtStart = gameState.balance / BALANCE_SCALE;
        this.startTime = performance.now();
    },
    recordShot() { this.shotCount++; },
    update(dt) {
        if (!this.el) this.init();
        const show = window.DEBUG_AUTOFIRE_HUD && gameState.autoShoot && gameState.currentWeapon === '8x';
        if (show && !this.active) { this.reset(); this.active = true; }
        if (!show) { this.active = false; this.el.style.display = 'none'; return; }
        this.el.style.display = 'block';
        this._fpsFrames++;
        this._fpsTime += dt;
        if (this._fpsTime >= 0.5) { this.lastFps = Math.round(this._fpsFrames / this._fpsTime); this._fpsFrames = 0; this._fpsTime = 0; }
        const elapsed = Math.max(0.001, (performance.now() - this.startTime) / 1000);
        const weapon = CONFIG.weapons['8x'];
        const shotsPerSec = (this.shotCount / elapsed).toFixed(2);
        const ammoPerSec = (this.shotCount * weapon.cost / elapsed).toFixed(2);
        const balanceDelta = (gameState.balance / BALANCE_SCALE) - this.balanceAtStart;
        const balPerSec = (balanceDelta / elapsed).toFixed(2);
        const phase = TargetingService.state.phase || 'idle';
        this.el.textContent = `[8x AutoFire Debug]\nShots/sec : ${shotsPerSec}\nAmmo/sec  : ${ammoPerSec}\nBal Δ/sec : ${balPerSec}\nPhase     : ${phase}\nFPS       : ${this.lastFps}\nFish      : ${activeFish.length}`;
    }
};

// ==================== INITIALIZATION ====================
// Flag to track if game scene has been initialized
let gameSceneInitialized = false;

async function init() {
    // PRELOAD FIX: Preload all GLB models before showing the lobby
    // This ensures instant game start when user clicks "Single Player"
    console.log('[PRELOAD] Starting GLB preload before showing lobby...');
    
    // Show loading screen during preload
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = document.getElementById('loading-text');
    const loadingProgress = document.getElementById('loading-progress');
    
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
    
    // Update loading progress
    const updateProgress = (percent, text) => {
        if (loadingText) loadingText.textContent = text;
        if (loadingProgress) loadingProgress.style.width = percent + '%';
    };
    
        updateProgress(5, 'Loading fish models manifest...');
    
        // FIX: Load fish GLB manifest first so fish can use GLB models
        try {
            await loadFishManifest();
            console.log('[PRELOAD] Fish manifest loaded');
        
            // FIX: Preload fish GLB models to prevent lag during gameplay
            updateProgress(8, 'Loading fish 3D models...');
            await preloadFishGLBModels();
            console.log('[PRELOAD] Fish GLB models preloaded');
        } catch (error) {
            console.warn('[PRELOAD] Fish manifest/models failed to load:', error);
        }
    
        updateProgress(10, 'Loading weapon models...');
    
    // Preload all weapon GLB models (cannon, bullet, hitEffect for each weapon)
    try {
        // Load 1x weapon first (most commonly used)
        updateProgress(20, 'Loading 1x weapon...');
        await preloadWeaponGLB('1x');
        
        // Load 3x weapon
        updateProgress(40, 'Loading 3x weapon...');
        await preloadWeaponGLB('3x');
        
        // 3x weapon fire particle textures DISABLED - using original 3x bullet GLB model
        // updateProgress(45, 'Loading 3x fire effects...');
        // await loadFireParticleTextures();
        
        // Load 5x weapon
        updateProgress(55, 'Loading 5x weapon...');
        await preloadWeaponGLB('5x');
        
        // Load 8x weapon
        updateProgress(80, 'Loading 8x weapon...');
        await preloadWeaponGLB('8x');
        
        // Load Coin.glb model for coin drop effects
        updateProgress(90, 'Loading coin model...');
        await loadCoinGLB();
        
        // Pre-initialize coin model pool to avoid stutter on first coin spawn
        updateProgress(95, 'Initializing coin pool...');
        initCoinModelPool();
        
        updateProgress(100, 'Ready!');
        console.log('[PRELOAD] All GLB models preloaded successfully');
    } catch (error) {
        console.warn('[PRELOAD] Some GLB models failed to load:', error);
        updateProgress(100, 'Ready (some models may load later)');
    }
    
    // Hide loading screen and show lobby
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    
    // Show the multiplayer lobby (only if user hasn't already started a game)
    // FIX: Prevent race condition where preload finishes after user clicks "Single Player"
    // which would incorrectly show the lobby and hide the game
    const lobby = document.getElementById('multiplayer-lobby');
    if (lobby && !gameState.isInGameScene) {
        lobby.style.display = 'flex';
        console.log('Lobby initialized - GLB models preloaded');
    } else if (gameState.isInGameScene) {
        console.log('[PRELOAD] Skipping lobby display - user already in game scene');
    }
    
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
    
    // Load saved graphics quality preference BEFORE creating renderer
    loadGraphicsQualityPreference();
    const quality = performanceState.graphicsQuality;
    console.log(`[INIT] Using graphics quality: ${quality}`);
    
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
    // Set initial background color (will be replaced by panorama background if enabled)
    scene.background = new THREE.Color(PANORAMA_CONFIG.fogColor);
    scene.fog = new THREE.Fog(PANORAMA_CONFIG.fogColor, PANORAMA_CONFIG.fogNear, PANORAMA_CONFIG.fogFar);
    
    // Load panorama background (async, replaces solid color when loaded)
    loadPanoramaBackground();
    
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
    
    // Create renderer with quality-based settings
    const antialias = quality !== 'low';  // Disable antialiasing for low quality
    renderer = new THREE.WebGLRenderer({ antialias: antialias });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Apply quality-based pixel ratio
    const baseRatio = window.devicePixelRatio || 1;
    const maxRatio = PERFORMANCE_CONFIG.graphicsQuality.pixelRatio[quality] || 1.0;
    renderer.setPixelRatio(Math.min(baseRatio, maxRatio));
    
    // Apply quality-based shadow settings
    const shadowsEnabled = PERFORMANCE_CONFIG.graphicsQuality.shadowsEnabled[quality];
    renderer.shadowMap.enabled = shadowsEnabled;
    if (shadowsEnabled) {
        const shadowMapType = PERFORMANCE_CONFIG.graphicsQuality.shadowMapType[quality];
        renderer.shadowMap.type = shadowMapType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    }
    
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Raycaster for shooting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    updateLoadingProgress(30, 'Creating underwater tunnel...');
    createTunnelScene();
    
    updateLoadingProgress(50, 'Setting up lights...');
    createLights();
    
    updateLoadingProgress(60, 'Creating cannon base...');
    createCannonBase();
    
    createAllCannons();
    
    updateLoadingProgress(70, 'Spawning fish...');
    createFishPool();
    spawnInitialFish();
    
    updateLoadingProgress(85, 'Creating particle systems...');
    createParticleSystems();
    
    // Create floating underwater particles for dynamic atmosphere
    createUnderwaterParticles();
    
    createGodRays();
    createGodRayParticles();
    createDustParticles();
    createUnderwaterOverlay();
    createCaustics();
    setupEffectComposer();
    
    updateLoadingProgress(92, 'Pre-initializing effect pools...');
    // PERFORMANCE FIX: Pre-initialize ALL pools to avoid any first-use stutter
    // These pools were previously lazily initialized on first use, causing
    // noticeable stutter when firing for the first time or when effects trigger
    
    // VFX geometry cache (must be initialized before fireball pool)
    initVfxGeometryCache();
    
    // Muzzle flash ring pool (used by all weapons)
    initMuzzleFlashCache();
    
    // Coin pool (used when fish die)
    initCoinPool();
    
    // Explosion effect pool (used for hit effects)
    initEffectPool();
    
    // Fireball material pool (used for hit effects)
    initFireballMaterialPool();
    
    // Lightning arc pool (used by 5x weapon)
    initLightningArcPool();
    
    // Audio GainNode pool (used by all weapons)
    initAudioGainPool();
    
    // Score pop DOM element pool (used when coins arrive at cannon)
    initScorePopPool();
    
    // Warm up coin shaders (forces GPU shader compilation during load)
    warmUpCoinShaders();
    
    console.log('[PRELOAD] All effect pools pre-initialized (VFX geometry, muzzle flash, coin, effect, fireball, lightning arc, audio, score pop, coin shaders)');
    
    updateLoadingProgress(95, 'Setting up controls...');
    setupEventListeners();
    
    updateLoadingProgress(100, 'Ready!');
    
    setTimeout(function() {
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        gameState.isLoading = false;
        lastTime = performance.now();
        
        initFPSMode();
        
        applyRtpLabels();
        
        initSettingsUI();
        applyAllSettings();
        
        animate();
        
        createCannon();
        showRmbZoomHint();
    }, 500);
}

function showWeaponPicker() {
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    var container = document.getElementById('game-container');
    if (container) container.classList.remove('fps-hide-cursor');
    document.body.style.cursor = 'default';
    
    var overlay = document.getElementById('weapon-picker-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '1';
    }
    var uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
        uiOverlay.style.pointerEvents = 'none';
        uiOverlay.style.opacity = '0';
    }
    console.log('[PLAN-B] Weapon picker shown. Pointer unlocked. Waiting for player selection.');
}

function onInitialWeaponSelected(weaponKey) {
    if (gameState.weaponSelected) return;
    
    applyWeaponToCannon(weaponKey);
    
    cannonGroup.visible = true;
    gameState.weaponSelected = true;
    
    var overlay = document.getElementById('weapon-picker-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.style.display = 'none'; }, 400);
    }
    var uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
        uiOverlay.style.pointerEvents = '';
        uiOverlay.style.opacity = '1';
    }
    
    if (gameState.viewMode === 'fps') {
        updateFPSCamera();
        var container = document.getElementById('game-container');
        if (container) {
            container.classList.add('fps-hide-cursor');
            if (container.requestPointerLock) {
                container.requestPointerLock();
            }
        }
    }
    
    console.log('[PLAN-B] Initial weapon selected: ' + weaponKey + '. Cannon visible. Game ready.');
    showRmbZoomHint();
}

// Start single player game - called from lobby
window.startSinglePlayerGame = function() {
    console.log('Starting single player game...');
    
    // FIX: Don't stop video background here - keep it visible during map loading
    // Video will be stopped after map loading completes in loadMap3D()
    
    // FIX: Don't show game container yet - wait until map loading is complete
    // This prevents the game screen flash during loading
    
    // FIX: Don't set isInGameScene here - wait until map loading is complete
    // This prevents shooting/camera movement during loading screen
    // gameState.isInGameScene will be set to true in loadMap3D() onComplete callback
    
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
    
    // FIX: Don't stop video background here - keep it visible during map loading
    // Video will be stopped after map loading completes in loadMap3D()
    
    // FIX: Don't show game container yet - wait until map loading is complete
    // This prevents the game screen flash during loading
    
    // Store multiplayer reference
    window.multiplayer = manager;
    
    // FIX: Don't set isInGameScene here - wait until map loading is complete
    // This prevents shooting/camera movement during loading screen
    // gameState.isInGameScene will be set to true in loadMap3D() onComplete callback
    
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
    
    window._killDebug = { kills: 0, totalReward: 0, totalCost: 0, log: [], el: null };
    (function() {
        var d = document.createElement('div');
        d.id = 'kill-debug-overlay';
        d.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.75);color:#0f0;font:11px monospace;padding:6px 10px;z-index:99999;pointer-events:none;max-height:260px;overflow:hidden;border-radius:4px;min-width:280px;transform:scale(var(--ui-scale));transform-origin:top right';
        d.innerHTML = '[RTP Debug] waiting...';
        document.body.appendChild(d);
        window._killDebug.el = d;
    })();

    window._updateKillDebugOverlay = function() {
        var d = window._killDebug;
        if (!d || !d.el) return;
        var rtp = d.totalCost > 0 ? ((d.totalReward / d.totalCost) * 100).toFixed(2) : '--';
        var delta = d.totalReward - d.totalCost;
        var lines = ['[RTP Debug] kills=' + d.kills + ' RTP=' + rtp + '% delta=' + delta];
        var recent = d.log.slice(-6);
        for (var i = recent.length - 1; i >= 0; i--) {
            var e = recent[i];
            lines.push('T' + e.tier + ' ' + e.weapon + ' r=' + e.reward + ' c=' + e.cost + ' d=' + e.sessionDelta);
        }
        d.el.innerHTML = lines.join('<br>');
    };

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
        
        multiplayerManager.onFishHit = function(data) {
            if (data.hitByPlayerId === multiplayerManager.playerId) return;
            const fish = gameState.fish.find(f => f.userData && f.userData.serverId === data.fishId);
            if (!fish) return;
            if (fish.userData._hitFlashActive) return;
            fish.userData._hitFlashActive = true;
            const _tint = new THREE.Color(1.0, 0.3, 0.3);
            const _peakTint = 0.70;
            const _emissiveBoost = 0.15;
            const _emissiveDur = 50;
            const _tintDecayDur = 200;
            const _scalePulse = 1.05;
            const _scaleDur = 100;
            const _jitterAmp = 0.1;
            const _jitterDur = 100;
            if (!fish._origScale) fish._origScale = fish.scale.clone();
            const origScale = fish._origScale;
            fish.scale.set(origScale.x * _scalePulse, origScale.y * _scalePulse, origScale.z * _scalePulse);
            fish.traverse(function(child) {
                if (child.isMesh && child.material && child.material.color) {
                    if (!child._origColor) child._origColor = child.material.color.clone();
                    child.material.color.copy(child._origColor.clone().lerp(_tint, _peakTint));
                    if (child.material.emissiveIntensity !== undefined) {
                        if (!child._origEmissive) child._origEmissive = child.material.emissiveIntensity;
                        child.material.emissiveIntensity = child._origEmissive + _emissiveBoost;
                    }
                }
            });
            const mpFlashStart = performance.now();
            var _origPos = null;
            function _mpJuiceFade(t) {
                const elapsed = t - mpFlashStart;
                if (!fish.parent) { _mpFinalRestore(); return; }
                if (elapsed < _scaleDur) {
                    const sp = elapsed / _scaleDur;
                    const es = 1.0 + (_scalePulse - 1.0) * (1.0 - sp * sp);
                    fish.scale.set(origScale.x * es, origScale.y * es, origScale.z * es);
                } else if (fish.scale.x !== origScale.x) {
                    fish.scale.copy(origScale);
                }
                if (elapsed < _jitterDur) {
                    if (!_origPos) _origPos = fish.position.clone();
                    fish.position.set(
                        _origPos.x + (Math.random() - 0.5) * 2 * _jitterAmp,
                        _origPos.y + (Math.random() - 0.5) * 2 * _jitterAmp,
                        _origPos.z + (Math.random() - 0.5) * 2 * _jitterAmp
                    );
                } else if (_origPos) {
                    fish.position.copy(_origPos);
                    _origPos = null;
                }
                if (elapsed >= _emissiveDur) {
                    fish.traverse(function(child) {
                        if (child.isMesh && child.material && child._origEmissive !== undefined) {
                            child.material.emissiveIntensity = child._origEmissive;
                            child._origEmissive = undefined;
                        }
                    });
                }
                const tintP = Math.min(elapsed / _tintDecayDur, 1);
                const tintFactor = _peakTint * Math.pow(1 - tintP, 3);
                fish.traverse(function(child) {
                    if (child.isMesh && child.material && child._origColor) {
                        if (tintP >= 1) child.material.color.copy(child._origColor);
                        else child.material.color.copy(child._origColor.clone().lerp(_tint, tintFactor));
                    }
                });
                if (tintP < 1 || elapsed < _scaleDur || elapsed < _jitterDur) {
                    requestAnimationFrame(_mpJuiceFade);
                } else {
                    _mpFinalRestore();
                }
            }
            function _mpFinalRestore() {
                if (fish._origScale) fish.scale.copy(fish._origScale);
                if (_origPos) { fish.position.copy(_origPos); _origPos = null; }
                fish.traverse(function(child) {
                    if (child.isMesh && child.material) {
                        if (child._origColor) child.material.color.copy(child._origColor);
                        if (child._origEmissive !== undefined) {
                            child.material.emissiveIntensity = child._origEmissive;
                            child._origEmissive = undefined;
                        }
                    }
                });
                fish.userData._hitFlashActive = false;
            }
            requestAnimationFrame(_mpJuiceFade);
        };

        multiplayerManager.onFishKilled = function(data) {
            console.log('[GAME] Fish killed event received:', data.fishId, data.typeName, 'killedBy:', data.killedBy, 'reward:', data.reward);
            
            if (data.killedBy === multiplayerManager.playerId && data.reward && window._killDebug) {
                window._killDebug.kills++;
                window._killDebug.totalReward += data.reward;
                var w = CONFIG.weapons[gameState.currentWeapon] || CONFIG.weapons['1x'];
                window._killDebug.log.push({
                    tier: data.tier || '?',
                    weapon: gameState.currentWeapon || '1x',
                    reward: data.reward,
                    cost: w.cost,
                    sessionDelta: window._killDebug.totalReward - window._killDebug.totalCost
                });
                if (window._updateKillDebugOverlay) window._updateKillDebugOverlay();
            }
            
            const fish = gameState.fish.find(f => f.userData && f.userData.serverId === data.fishId);
            if (fish) {
                console.log('[GAME] Found fish mesh to remove:', data.fishId);
                
                spawnFishDeathEffect(fish.position.clone(), fish.userData.size || 30, fish.userData.color || 0xffffff);
                
                if (data.killedBy === multiplayerManager.playerId) {
                    const coinCount = (data.reward || 0) >= 50 ? 3 : (data.reward || 0) >= 20 ? 2 : 1;
                    for (let ci = 0; ci < coinCount; ci++) {
                        spawnWaitingCoin(fish.position.clone(), 0);
                    }
                    playSound('coin');
                }
                
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
            _balanceAudit.onServerUpdate(data.balance);
            gameState.balance = Math.round(data.balance * BALANCE_SCALE);
            updateUI();
        };
        
        // Handle boss wave events
        multiplayerManager.onBossWave = function(data) {
            if (data.state === 'starting') {
                // FIX: Removed playBossFanfare() - old synthesized audio system disabled
                // Boss music is handled by startBossMusicMP3() instead
                startBossMusicMP3();
                showRareFishNotification('BOSS WAVE INCOMING!');
            }
        };
        
        multiplayerManager.onShootRejected = function(data) {
            showGovernanceNotification('Shot rejected: ' + data.reason, 'warning');
        };
        
        multiplayerManager.onAnomalyWarning = function(data) {
            showGovernanceNotification('Anomaly detected in play pattern', 'warning');
        };
        
        multiplayerManager.onAnomalyCooldown = function(data) {
            showGovernanceNotification('Cooldown: ' + Math.round(data.durationMs / 1000) + 's shooting disabled', 'error');
        };
        
        multiplayerManager.onVersionMismatch = function(data) {
            showGovernanceNotification('Game version outdated — please refresh', 'error');
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
// Optimized map: ~27MB, ~30k triangles, Draco compressed
const MAP_URL = 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/MAPV3.0.glb';
let loadedMapScene = null;  // Cache loaded map to avoid reloading

// PRELOAD FIX: Track combined loading progress for map + weapons
const loadingProgress = {
    mapLoaded: 0,      // 0-100 for map
    mapTotal: 100,
    weaponsLoaded: 0,  // 0-4 weapons loaded
    weaponsTotal: 4,   // 4 weapons to load
    allWeaponsPreloaded: false
};

// PRELOAD FIX: Preload all weapon GLBs synchronously (no setTimeout delays)
async function preloadAllWeaponsSync() {
    console.log('[PRELOAD] Starting synchronous weapon preload...');
    const weapons = ['1x', '3x', '5x', '8x'];
    
    for (let i = 0; i < weapons.length; i++) {
        const weaponKey = weapons[i];
        try {
            await preloadWeaponGLB(weaponKey);
            loadingProgress.weaponsLoaded = i + 1;
            console.log(`[PRELOAD] Weapon ${weaponKey} loaded (${i + 1}/${weapons.length})`);
        } catch (error) {
            console.warn(`[PRELOAD] Failed to load weapon ${weaponKey}:`, error);
        }
    }
    
    loadingProgress.allWeaponsPreloaded = true;
    console.log('[PRELOAD] All weapons preloaded successfully');
}

// PRELOAD FIX: Update combined progress bar (map 80% weight, weapons 20% weight)
function updateCombinedLoadingProgress(bar, percent, sizeInfo, mapProgress, mapLoaded, mapTotal) {
    // Map contributes 80% of progress, weapons contribute 20%
    const mapWeight = 0.8;
    const weaponWeight = 0.2;
    
    const mapPercent = mapProgress;
    const weaponPercent = (loadingProgress.weaponsLoaded / loadingProgress.weaponsTotal) * 100;
    
    const combinedPercent = (mapPercent * mapWeight) + (weaponPercent * weaponWeight);
    
    bar.style.width = combinedPercent.toFixed(1) + '%';
    percent.textContent = combinedPercent.toFixed(0) + '%';
    
    // Update size info with map progress + weapon count
    if (mapTotal > 0) {
        const loadedMB = (mapLoaded / 1024 / 1024).toFixed(1);
        const totalMB = (mapTotal / 1024 / 1024).toFixed(1);
        sizeInfo.textContent = `${loadedMB} / ${totalMB} MB`;
    }
}

function loadMap3D(onComplete) {
    // Check if map is already loaded
    if (loadedMapScene && loadingProgress.allWeaponsPreloaded) {
        console.log('[MAP] Using cached map and weapons');
        onComplete(loadedMapScene.clone());
        return;
    }
    
    const overlay = document.getElementById('map-loading-overlay');
    const bar = document.getElementById('map-loading-bar');
    const percent = document.getElementById('map-loading-percent');
    const sizeInfo = document.getElementById('map-loading-size');
    
    // Show loading overlay
    overlay.style.display = 'flex';
    
    // Hide the initial loading screen to prevent overlap
    const initialLoadingScreen = document.getElementById('loading-screen');
    if (initialLoadingScreen) {
        initialLoadingScreen.style.display = 'none';
    }
    
    // PRELOAD FIX: Start weapon preloading in parallel with map loading
    const weaponPreloadPromise = preloadAllWeaponsSync();
    
    // Update progress periodically while weapons are loading
    const weaponProgressInterval = setInterval(() => {
        if (loadingProgress.allWeaponsPreloaded) {
            clearInterval(weaponProgressInterval);
        }
        // Trigger a progress update
        updateCombinedLoadingProgress(bar, percent, sizeInfo, loadingProgress.mapLoaded, 0, 0);
    }, 100);
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        MAP_URL,
        // onLoad callback
        async (gltf) => {
            console.log('[MAP] Map loaded successfully');
            const mapScene = gltf.scene;
            
            // Apply quality-based optimizations
            const quality = performanceState.graphicsQuality;
            console.log(`[MAP] Applying ${quality} quality optimizations`);
            
            // 1. Setup materials with quality-dependent shadow settings
            setupMapMaterialsWithQuality(mapScene);
            
            // 2. Optimize texture sampling
            optimizeMapTextures(mapScene);
            
            // 3. Downscale textures for low quality (reduces GPU memory)
            if (quality === 'low') {
                downscaleMapTextures(mapScene, 0.5);  // 50% texture size
            }
            
            // Cache the optimized map
            loadedMapScene = mapScene;
            loadingProgress.mapLoaded = 100;
            
            // PRELOAD FIX: Wait for all weapons to finish loading before proceeding
            console.log('[PRELOAD] Map loaded, waiting for weapons to finish...');
            await weaponPreloadPromise;
            clearInterval(weaponProgressInterval);
            
            // Final progress update
            updateCombinedLoadingProgress(bar, percent, sizeInfo, 100, 0, 0);
            
            console.log('[PRELOAD] All resources loaded, entering game');
            
            // FIX: Stop video background and show game container AFTER loading is complete
            // This ensures smooth transition without game screen flash
            stopVideoBackground();
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) {
                gameContainer.style.display = 'block';
            }
            
            // Hide loading overlay
            overlay.style.display = 'none';
            
            // FIX: Set isInGameScene AFTER loading is complete
            // This prevents shooting/camera movement during loading screen
            gameState.isInGameScene = true;
            initKillFeedSlots();
            
            var vTag = document.getElementById('pr-version-tag');
            if (vTag) vTag.style.display = 'none';
            
            onComplete(mapScene);
        },
        // onProgress callback
        (xhr) => {
            if (xhr.total) {
                const mapPercent = (xhr.loaded / xhr.total) * 100;
                loadingProgress.mapLoaded = mapPercent;
                
                // Update combined progress
                updateCombinedLoadingProgress(bar, percent, sizeInfo, mapPercent, xhr.loaded, xhr.total);
            } else {
                // Indeterminate progress
                percent.textContent = 'Loading...';
            }
        },
        // onError callback
        async (error) => {
            console.error('[MAP] Failed to load map:', error);
            
            // Still wait for weapons even if map fails
            await weaponPreloadPromise;
            clearInterval(weaponProgressInterval);
            
            // FIX: Stop video background and show game container even on error
            stopVideoBackground();
            const gameContainer = document.getElementById('game-container');
            if (gameContainer) {
                gameContainer.style.display = 'block';
            }
            
            overlay.style.display = 'none';
            
            // FIX: Set isInGameScene even on error so game can proceed
            gameState.isInGameScene = true;
            initKillFeedSlots();
            
            var vTag = document.getElementById('pr-version-tag');
            if (vTag) vTag.style.display = 'none';
            
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
    
    // PERFORMANCE: Disable matrixAutoUpdate for all static map objects
    // This prevents Three.js from recalculating world matrices every frame
    // Safe because the map never moves after initial positioning
    optimizeStaticObjects(mapScene);
    
    return mapScene;
}

// PERFORMANCE: Disable matrixAutoUpdate for static objects (reduces CPU overhead)
// IMPORTANT: Must bake transforms BEFORE disabling auto-updates to avoid position bugs
function optimizeStaticObjects(object) {
    let optimizedCount = 0;
    
    // Step 1: Force update all matrices FIRST while autoUpdate is still enabled
    // This ensures position/rotation/scale changes are baked into the matrix
    object.updateMatrixWorld(true);
    
    // Step 2: Now disable auto-updates after matrices are correctly computed
    object.traverse((child) => {
        // Bake the local matrix from position/rotation/scale
        child.updateMatrix();
        // Then disable automatic updates
        child.matrixAutoUpdate = false;
        optimizedCount++;
    });
    
    console.log(`[PERF] Optimized ${optimizedCount} static objects (matrixAutoUpdate=false)`);
}

// ==================== TERRAIN OBSTACLE SYSTEM ====================
let terrainObstacles = [];

function extractTerrainObstacles(mapScene) {
    terrainObstacles = [];
    const aq = CONFIG.aquarium;
    const fa = CONFIG.fishArena;
    const fishMinY = aq.floorY + fa.marginY;
    const gridSize = 60;
    const v = new THREE.Vector3();
    const grid = {};

    mapScene.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.updateMatrixWorld(true);
        const pos = obj.geometry.attributes.position;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
            v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
            v.applyMatrix4(obj.matrixWorld);
            const gx = Math.floor(v.x / gridSize);
            const gz = Math.floor(v.z / gridSize);
            const key = gx + ',' + gz;
            if (!grid[key]) grid[key] = { maxY: -Infinity, sumX: 0, sumY: 0, sumZ: 0, count: 0 };
            const cell = grid[key];
            if (v.y > cell.maxY) cell.maxY = v.y;
            cell.sumX += v.x;
            cell.sumZ += v.z;
            if (v.y > fishMinY) { cell.sumY += v.y; }
            cell.count++;
        }
    });

    for (const cell of Object.values(grid)) {
        if (cell.maxY <= fishMinY) continue;
        const cx = cell.sumX / cell.count;
        const cz = cell.sumZ / cell.count;
        const height = cell.maxY - fishMinY;
        const cy = (fishMinY + cell.maxY) * 0.5;
        const radius = Math.max(gridSize * 0.5, height * 0.5) + 10;
        terrainObstacles.push({ x: cx, y: cy, z: cz, radius: radius });
    }

    if (terrainObstacles.length > 200) {
        terrainObstacles.sort((a, b) => b.radius - a.radius);
        terrainObstacles.length = 200;
    }

    console.log(`[TERRAIN] Extracted ${terrainObstacles.length} heightmap obstacles for fish avoidance (gridSize=${gridSize}, fishMinY=${fishMinY})`);
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
        
        extractTerrainObstacles(mapScene);
        
        // Enhanced debug logging for map verification
        const mapBox = new THREE.Box3().setFromObject(mapScene);
        const mapSize = new THREE.Vector3();
        mapBox.getSize(mapSize);
        console.log('[MAP] 3D map added to scene');
        console.log('[MAP] Map bounding box size:', mapSize.x.toFixed(0), 'x', mapSize.y.toFixed(0), 'x', mapSize.z.toFixed(0));
        console.log('[MAP] Map position:', mapScene.position.x.toFixed(0), mapScene.position.y.toFixed(0), mapScene.position.z.toFixed(0));
        console.log('[MAP] Map scale:', mapScene.scale.x.toFixed(4));
        console.log('[MAP] tunnelGroup children count:', tunnelGroup.children.length);
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
    const quality = performanceState.graphicsQuality;
    const shadowsEnabled = PERFORMANCE_CONFIG.graphicsQuality.shadowsEnabled[quality];
    
    console.log(`[LIGHTS] Creating lights for ${quality} quality`);
    
    const ambientIntensity = quality === 'low' ? 0.6 : 0.5;
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x001530, quality === 'low' ? 0.5 : 0.6);
    scene.add(hemiLight);
    
    const sunLight = new THREE.DirectionalLight(0xaaddff, quality === 'low' ? 0.5 : 0.7);
    sunLight.position.set(width * 0.3, floorY + height + 500, -depth * 0.3);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = shadowsEnabled;
    if (shadowsEnabled) {
        sunLight.shadow.camera.near = 100;
        sunLight.shadow.camera.far = 2000;
        sunLight.shadow.camera.left = -width;
        sunLight.shadow.camera.right = width;
        sunLight.shadow.camera.top = height;
        sunLight.shadow.camera.bottom = -height;
        sunLight.shadow.mapSize.width = PERFORMANCE_CONFIG.shadowMap[quality] || 1024;
        sunLight.shadow.mapSize.height = PERFORMANCE_CONFIG.shadowMap[quality] || 1024;
    }
    scene.add(sunLight);
    scene.add(sunLight.target);
    
    const tankLight = new THREE.SpotLight(0xaaddff, 1.5, 1500, Math.PI / 3, 0.3, 1);
    tankLight.position.set(0, floorY + height + 400, 0);
    tankLight.target.position.set(0, floorY + height / 2, 0);
    tankLight.castShadow = false;
    scene.add(tankLight);
    scene.add(tankLight.target);
    
    if (quality !== 'low') {
        const upperLight1 = new THREE.PointLight(0xaaddff, 1.2, 800);
        upperLight1.position.set(-width * 0.4, floorY + height * 0.7, -depth * 0.3);
        scene.add(upperLight1);
        
        const upperLight2 = new THREE.PointLight(0xaaddff, 1.2, 800);
        upperLight2.position.set(width * 0.4, floorY + height * 0.7, depth * 0.3);
        scene.add(upperLight2);
        
        const leftLight = new THREE.SpotLight(0xffffff, 0.6, 1200, Math.PI / 4, 0.5, 1);
        leftLight.position.set(-width * 0.8, floorY + height / 2, 0);
        leftLight.target.position.set(0, floorY + height / 2, 0);
        scene.add(leftLight);
        scene.add(leftLight.target);
        
        if (quality === 'high') {
            const rightLight = new THREE.SpotLight(0xffffff, 0.6, 1200, Math.PI / 4, 0.5, 1);
            rightLight.position.set(width * 0.8, floorY + height / 2, 0);
            rightLight.target.position.set(0, floorY + height / 2, 0);
            scene.add(rightLight);
            scene.add(rightLight.target);
            
            const frontLight = new THREE.SpotLight(0xffffff, 0.5, 1500, Math.PI / 4, 0.5, 1);
            frontLight.position.set(0, 100, -900);
            frontLight.target.position.set(0, floorY + height / 2, 0);
            scene.add(frontLight);
            scene.add(frontLight.target);
            
            const upperLight3 = new THREE.PointLight(0x88ccff, 1.0, 600);
            upperLight3.position.set(0, floorY + height * 0.8, 0);
            scene.add(upperLight3);
        }
    }
    
    console.log(`[LIGHTS] Created enhanced lighting for ${quality} quality`);
}

// ==================== CANNON ====================
let cannonBodyGroup, cannonMuzzle;

// Issue #10: Global pitch group for cannon aiming - muzzle rotates with barrel
let cannonPitchGroup = null;

let staticCannons = [];
let staticCannonRings = [];

function updateStaticCannonRings(time) {
    for (let i = 0; i < staticCannonRings.length; i++) {
        const rings = staticCannonRings[i];
        if (!rings.core || !rings.glow) continue;
        
        const phaseOffset = i * Math.PI * 0.5;
        const rotationSpeed = 0.15;
        rings.core.rotation.z = time * rotationSpeed + phaseOffset;
        rings.glow.rotation.z = -time * rotationSpeed * 0.7 + phaseOffset;
        
        const pulseSpeed = 2.0;
        const corePulse = 0.85 + 0.15 * Math.sin(time * pulseSpeed + phaseOffset);
        const glowPulse = 0.30 + 0.15 * Math.sin(time * pulseSpeed + Math.PI * 0.5 + phaseOffset);
        
        rings.core.material.opacity = 0.9 * corePulse;
        rings.glow.material.opacity = glowPulse;
    }
}

function createStaticCannon(position, rotationY, color = 0x888888, weaponKey = '1x') {
    const staticCannonGroup = new THREE.Group();
    
    const platformGeometry = new THREE.CylinderGeometry(60, 70, 18, 16);
    const platformMaterial = new THREE.MeshBasicMaterial({
        color: 0x6699bb
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 5;
    staticCannonGroup.add(platform);
    
    const weaponColors = {
        '1x': 0x66ff66,
        '3x': 0xffaa00,
        '5x': 0x00aaff,
        '8x': 0xff44ff
    };
    const ringColor = weaponColors[weaponKey] || 0x3399bb;
    
    if (!cannonBaseRingSegmentTexture) {
        cannonBaseRingSegmentTexture = createSciFiRingTexture();
    }
    
    const coreRingGeometry = new THREE.RingGeometry(60, 85, 64);
    const coreRingMaterial = new THREE.MeshBasicMaterial({
        color: ringColor,
        map: cannonBaseRingSegmentTexture,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const coreRing = new THREE.Mesh(coreRingGeometry, coreRingMaterial);
    coreRing.rotation.x = -Math.PI / 2;
    coreRing.position.y = 3;
    coreRing.renderOrder = 1;
    staticCannonGroup.add(coreRing);
    
    const glowRingGeometry = new THREE.RingGeometry(55, 95, 64);
    const glowRingMaterial = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const glowRing = new THREE.Mesh(glowRingGeometry, glowRingMaterial);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 2;
    glowRing.renderOrder = 0;
    staticCannonGroup.add(glowRing);
    
    const innerDiskGeometry = new THREE.CircleGeometry(54.5, 64);
    const innerDiskMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        depthWrite: true
    });
    const innerDisk = new THREE.Mesh(innerDiskGeometry, innerDiskMaterial);
    innerDisk.rotation.x = -Math.PI / 2;
    innerDisk.position.y = 14.5;
    innerDisk.renderOrder = 2;
    staticCannonGroup.add(innerDisk);
    
    staticCannonRings.push({ core: coreRing, glow: glowRing });
    
    // Create barrel group for weapon model
    const barrelGroup = new THREE.Group();
    barrelGroup.position.y = 30;
    
    // Try to load LOW-POLY GLB weapon model for non-player cannons (~3k triangles instead of ~500k)
    // This significantly reduces GPU load when displaying multiple cannons
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    const nonPlayerCacheKey = `${weaponKey}_cannonNonPlayer`;
    
    if (glbConfig && weaponGLBState.cannonCache.has(nonPlayerCacheKey)) {
        // Use cached low-poly non-player cannon model
        const cachedModel = weaponGLBState.cannonCache.get(nonPlayerCacheKey);
        if (cachedModel) {
            const clonedModel = cachedModel.clone();
            const npYOff = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 25;
            clonedModel.position.set(0, npYOff, 0);
            clonedModel.scale.setScalar(glbConfig.scale);
            if (glbConfig.cannonRotationFix) {
                clonedModel.rotation.copy(glbConfig.cannonRotationFix);
            }
            barrelGroup.add(clonedModel);
        }
    } else {
        // Fallback: Simple cylinder barrel with weapon-specific size
        const barrelSizes = { '1x': 8, '3x': 10, '5x': 12, '8x': 15 };
        const barrelSize = barrelSizes[weaponKey] || 8;
        const barrelGeometry = new THREE.CylinderGeometry(barrelSize, barrelSize * 1.5, 50, 8);
        const barrelMaterial = new THREE.MeshBasicMaterial({ color: ringColor });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 25;
        barrelGroup.add(barrel);
        
        // Barrel base/housing
        const housingGeometry = new THREE.SphereGeometry(18, 8, 8);
        const housingMaterial = new THREE.MeshBasicMaterial({ color: 0x445566 });
        const housing = new THREE.Mesh(housingGeometry, housingMaterial);
        barrelGroup.add(housing);
        
        // Async load LOW-POLY non-player cannon model and replace fallback when ready
        loadWeaponGLB(weaponKey, 'cannonNonPlayer').then(model => {
            if (model && barrelGroup.parent) {
                barrelGroup.clear();
                const clonedModel = model.clone();
                const npYOff2 = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 25;
                clonedModel.position.set(0, npYOff2, 0);
                clonedModel.scale.setScalar(glbConfig.scale);
                if (glbConfig.cannonRotationFix) {
                    clonedModel.rotation.copy(glbConfig.cannonRotationFix);
                }
                barrelGroup.add(clonedModel);
            }
        }).catch(() => {});
    }
    
    staticCannonGroup.add(barrelGroup);
    
    // Position and rotate the cannon
    staticCannonGroup.position.copy(position);
    staticCannonGroup.rotation.y = rotationY;
    staticCannonGroup.scale.set(1.0, 1.0, 1.0);
    staticCannonGroup.visible = false;
    
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
    const cannonY = CANNON_BASE_Y;
    
    const weaponTypes = ['1x', '3x', '5x', '8x'];
    function getRandomWeapon() {
        return weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
    }
    
    createStaticCannon(
        new THREE.Vector3(CANNON_RING_RADIUS_X, cannonY, 0),
        -Math.PI / 2,
        0x99aa88,
        getRandomWeapon()
    );
    
    createStaticCannon(
        new THREE.Vector3(0, cannonY, CANNON_RING_RADIUS_Z),
        Math.PI,
        0xaa8899,
        getRandomWeapon()
    );
    
    createStaticCannon(
        new THREE.Vector3(-CANNON_RING_RADIUS_X, cannonY, 0),
        Math.PI / 2,
        0x8899aa,
        getRandomWeapon()
    );
}

function createCannonBase() {
    cannonGroup = new THREE.Group();
    
    var platformGeometry = new THREE.CylinderGeometry(60, 70, 18, 16);
    var platformMaterial = new THREE.MeshBasicMaterial({
        color: 0x6699bb
    });
    var platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = 5;
    cannonGroup.add(platform);
    
    if (!cannonBaseRingSegmentTexture) {
        cannonBaseRingSegmentTexture = createSciFiRingTexture();
    }
    
    var coreRingGeometry = new THREE.RingGeometry(60, 85, 64);
    var coreRingMaterial = new THREE.MeshBasicMaterial({
        color: 0x44ddff,
        map: cannonBaseRingSegmentTexture,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    cannonBaseRingCore = new THREE.Mesh(coreRingGeometry, coreRingMaterial);
    cannonBaseRingCore.name = 'cannonBaseRingCore';
    cannonBaseRingCore.rotation.x = -Math.PI / 2;
    cannonBaseRingCore.position.y = 3;
    cannonBaseRingCore.renderOrder = 1;
    cannonGroup.add(cannonBaseRingCore);
    
    var glowRingGeometry = new THREE.RingGeometry(55, 95, 64);
    var glowRingMaterial = new THREE.MeshBasicMaterial({
        color: 0x44ddff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    cannonBaseRingGlow = new THREE.Mesh(glowRingGeometry, glowRingMaterial);
    cannonBaseRingGlow.name = 'cannonBaseRingGlow';
    cannonBaseRingGlow.rotation.x = -Math.PI / 2;
    cannonBaseRingGlow.position.y = 2;
    cannonBaseRingGlow.renderOrder = 0;
    cannonGroup.add(cannonBaseRingGlow);
    
    var innerDiskGeometry = new THREE.CircleGeometry(54.5, 64);
    var innerDiskMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        depthWrite: true
    });
    cannonBaseRingInnerDisk = new THREE.Mesh(innerDiskGeometry, innerDiskMaterial);
    cannonBaseRingInnerDisk.name = 'cannonBaseRingInnerDisk';
    cannonBaseRingInnerDisk.rotation.x = -Math.PI / 2;
    cannonBaseRingInnerDisk.position.y = 14.5;
    cannonBaseRingInnerDisk.renderOrder = 2;
    cannonGroup.add(cannonBaseRingInnerDisk);
    
    console.log('[CANNON] Sci-fi ring created: core=' + (cannonBaseRingCore ? 'OK' : 'FAIL') + 
                ', glow=' + (cannonBaseRingGlow ? 'OK' : 'FAIL') + 
                ', innerDisk=' + (cannonBaseRingInnerDisk ? 'OK' : 'FAIL'));
    
    cannonPitchGroup = new THREE.Group();
    cannonPitchGroup.position.y = 25;
    cannonGroup.add(cannonPitchGroup);
    
    cannonBodyGroup = new THREE.Group();
    cannonPitchGroup.add(cannonBodyGroup);
    
    cannonMuzzle = new THREE.Object3D();
    cannonMuzzle.position.set(0, 0, 0);
    cannonPitchGroup.add(cannonMuzzle);
    
    preloadAllWeapons();
    
    cannonGroup.position.set(0, CANNON_BASE_Y, -CANNON_RING_RADIUS_Z);
    cannonGroup.scale.set(1.2, 1.2, 1.2);
    cannonGroup.visible = false;
    scene.add(cannonGroup);
    
    var cannonPointLight = new THREE.PointLight(0xffffff, 0.8, 300);
    cannonPointLight.position.set(0, 50, 0);
    cannonGroup.add(cannonPointLight);
    
    var cannonFrontLight = new THREE.PointLight(0xaaddff, 0.5, 250);
    cannonFrontLight.position.set(0, 30, 100);
    cannonGroup.add(cannonFrontLight);
    
    console.log('[PLAN-B] createCannonBase() complete. Cannon hidden until weapon selection.');
}

function applyWeaponToCannon(weaponKey) {
    gameState.currentWeapon = weaponKey;
    
    buildCannonGeometryForWeapon(weaponKey);
    
    var glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    if (cannonMuzzle && glbConfig && glbConfig.muzzleOffset) {
        cannonMuzzle.position.copy(glbConfig.muzzleOffset);
    } else {
        cannonMuzzle.position.set(0, 25, 55);
    }
    
    cannonGroup.scale.set(1.2, 1.2, 1.2);
    
    document.querySelectorAll('.weapon-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.weapon === weaponKey) {
            btn.classList.add('active');
        }
    });
    
    updateCrosshairForWeapon(weaponKey);
    updateDigiAmmoDisplay();
    
    console.log('[PLAN-B][APPLY] applyWeaponToCannon(' + weaponKey + '):', {
        cannonGroup_pos: cannonGroup.position.toArray(),
        cannonGroup_scale: cannonGroup.scale.toArray(),
        cannonGroup_rot: [cannonGroup.rotation.x, cannonGroup.rotation.y, cannonGroup.rotation.z],
        pitchGroup_pos: cannonPitchGroup.position.toArray(),
        pitchGroup_rot: [cannonPitchGroup.rotation.x, cannonPitchGroup.rotation.y, cannonPitchGroup.rotation.z],
        barrel_pos: cannonBarrel ? cannonBarrel.position.toArray() : 'N/A',
        muzzle_pos: cannonMuzzle ? cannonMuzzle.position.toArray() : 'N/A',
        weapon: weaponKey,
        source: 'applyWeaponToCannon (unified path)'
    });
}

function createCannon() {
    createCannonBase();
    applyWeaponToCannon('1x');
    cannonGroup.visible = true;
    gameState.weaponSelected = true;
}

// PERFORMANCE FIX: Properly dispose Three.js objects including nested meshes in GLB models
// This prevents GPU memory leaks when switching weapons
function disposeObject3D(object) {
    if (!object) return;
    
    // Recursively dispose all children first
    while (object.children.length > 0) {
        disposeObject3D(object.children[0]);
        object.remove(object.children[0]);
    }
    
    // Dispose geometry
    if (object.geometry) {
        object.geometry.dispose();
    }
    
    // Dispose material(s)
    if (object.material) {
        if (Array.isArray(object.material)) {
            object.material.forEach(mat => {
                disposeMaterial(mat);
            });
        } else {
            disposeMaterial(object.material);
        }
    }
}

// Helper to dispose material and its textures
function disposeMaterial(material) {
    if (!material) return;
    
    // Dispose all texture maps
    const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 
                          'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap', 'envMap'];
    textureProps.forEach(prop => {
        if (material[prop]) {
            material[prop].dispose();
        }
    });
    
    material.dispose();
}

async function buildCannonGeometryForWeapon(weaponKey) {
    const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
    
    // PERFORMANCE OPTIMIZATION: Use pre-cloned cannons with show/hide instead of clone/dispose
    // This eliminates the main source of weapon switching lag
    if (weaponGLBState.enabled && glbConfig && weaponGLBState.preClonedCannons.has(weaponKey)) {
        // Hide ALL weapon models to prevent any stale/ghost models from remaining visible.
        // This covers both cache-built models and pre-cloned models regardless of load order.
        weaponGLBState.preClonedCannons.forEach((cannon) => {
            cannon.visible = false;
        });
        if (weaponGLBState.currentWeaponModel) {
            weaponGLBState.currentWeaponModel.visible = false;
        }
        
        // Remove and dispose any non-pre-cloned (fallback) cannon models from cannonBodyGroup
        // These are stale models from the initial load before pre-cloning completed
        const preClonedSet = new Set(weaponGLBState.preClonedCannons.values());
        for (let i = cannonBodyGroup.children.length - 1; i >= 0; i--) {
            const child = cannonBodyGroup.children[i];
            if (!preClonedSet.has(child)) {
                cannonBodyGroup.remove(child);
                disposeObject3D(child);
            }
        }
        
        // Show the new weapon
        const newCannon = weaponGLBState.preClonedCannons.get(weaponKey);
        
        // Add to scene if not already added
        if (!cannonBodyGroup.children.includes(newCannon)) {
            cannonBodyGroup.add(newCannon);
        }
        
        newCannon.visible = true;
        cannonBarrel = newCannon;
        weaponGLBState.currentWeaponModel = newCannon;
        weaponGLBState.currentWeaponKey = weaponKey;
        
        // Safety: Reset scale and position to config values on every switch
        const switchScale = glbConfig.scale;
        newCannon.scale.set(switchScale, switchScale, switchScale);
        const yOff = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 20;
        newCannon.position.set(0, yOff, 0);
        
        // Cancel any active barrel recoil to prevent stale animation on new weapon
        barrelRecoilState.active = false;
        barrelRecoilState.phase = 'idle';
        barrelRecoilState.originalPosition.set(0, yOff, 0);
        
        // Update muzzle position based on GLB config
        if (cannonMuzzle && glbConfig.muzzleOffset) {
            cannonMuzzle.position.copy(glbConfig.muzzleOffset);
        }
        
        console.log(`[WEAPON-GLB] Instant switch to pre-cloned cannon: ${weaponKey}`);
        return; // Successfully used pre-cloned cannon, skip other paths
    }
    
    // FALLBACK: Clear existing cannon body if not using pre-cloned system
    // This path is only used if pre-cloning failed or for procedural weapons
    while (cannonBodyGroup.children.length > 0) {
        const child = cannonBodyGroup.children[0];
        // Don't dispose pre-cloned cannons
        if (!Array.from(weaponGLBState.preClonedCannons.values()).includes(child)) {
            disposeObject3D(child);
        }
        cannonBodyGroup.remove(child);
    }
    
    const weapon = CONFIG.weapons[weaponKey];
    
    // FIX: Check cache synchronously first to avoid stutter on weapon switch
    // The await causes microtask delay even when model is cached
    if (weaponGLBState.enabled && glbConfig) {
        const cacheKey = `${weaponKey}_cannon`;
        const cache = weaponGLBState.cannonCache;
        
        // SYNCHRONOUS path: If model is already cached, use it immediately without await
        if (cache.has(cacheKey)) {
            const cannonModel = cache.get(cacheKey).clone();
            if (cannonModel) {
                const scale = glbConfig.scale;
                cannonModel.scale.set(scale, scale, scale);
                const yOff = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 20;
                cannonModel.position.set(0, yOff, 0);
                cannonBarrel = cannonModel;
                cannonBodyGroup.add(cannonModel);
                
                if (cannonMuzzle && glbConfig.muzzleOffset) {
                    cannonMuzzle.position.copy(glbConfig.muzzleOffset);
                }
                weaponGLBState.currentWeaponModel = cannonModel;
                weaponGLBState.currentWeaponKey = weaponKey;
                console.log(`[WEAPON-GLB] Using cached GLB cannon for ${weaponKey} (sync)`);
                return; // Successfully used cached GLB, skip procedural
            }
        }
        
        // ASYNC path: Model not cached yet, load it (only happens on first switch)
        try {
            const cannonModel = await loadWeaponGLB(weaponKey, 'cannon');
            
            // GUARD: If pre-cloned cannon became available during the async load
            // (from preloadAllWeapons running concurrently), skip adding this fallback model.
            // The pre-cloned system will handle cannon visibility via warmUpWeaponShaders
            // and the re-initialization call in preloadAllWeapons.
            if (weaponGLBState.preClonedCannons.has(weaponKey)) {
                console.log(`[WEAPON-GLB] Pre-cloned ${weaponKey} now available, skipping async fallback`);
                return;
            }
            
            if (cannonModel) {
                // Apply scale from config
                const scale = glbConfig.scale;
                cannonModel.scale.set(scale, scale, scale);
                
                const yOff2 = glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 20;
                cannonModel.position.set(0, yOff2, 0);
                
                // Store reference for recoil animation
                cannonBarrel = cannonModel;
                cannonBodyGroup.add(cannonModel);
                
                // Debug: Log the cannon model details
                const worldPos = new THREE.Vector3();
                cannonModel.getWorldPosition(worldPos);
                console.log(`[WEAPON-GLB] Using GLB cannon for ${weaponKey}:`, {
                    scale: cannonModel.scale.toArray(),
                    position: cannonModel.position.toArray(),
                    worldPosition: worldPos.toArray(),
                    children: cannonModel.children.length
                });
                
                // Update muzzle position based on GLB config
                if (cannonMuzzle && glbConfig.muzzleOffset) {
                    cannonMuzzle.position.copy(glbConfig.muzzleOffset);
                }
                
                // Store current weapon model reference
                weaponGLBState.currentWeaponModel = cannonModel;
                weaponGLBState.currentWeaponKey = weaponKey;
                
                return; // Successfully loaded GLB, skip procedural
            }
        } catch (error) {
            console.warn(`[WEAPON-GLB] Failed to load GLB for ${weaponKey}, using procedural:`, error);
        }
    }
    
    // Fallback to procedural geometry
    console.log(`[WEAPON-GLB] Using procedural cannon for ${weaponKey}`);
    
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
        const proceduralYOff = glbConfig && glbConfig.cannonYOffset !== undefined ? glbConfig.cannonYOffset : 20;
        cannonBarrel.position.set(0, proceduralYOff, 0);
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
        barrelGroup.position.y = 25;
        
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
        
        // Flame ring - PARTICLE-BASED VERSION
        // Replaced TorusGeometry with animated flame particles for better visual quality
        const flameParticleCount = 24;
        const flamePositions = new Float32Array(flameParticleCount * 3);
        const flameSizes = new Float32Array(flameParticleCount);
        const flameRadius = 22;
        
        for (let i = 0; i < flameParticleCount; i++) {
            const angle = (i / flameParticleCount) * Math.PI * 2;
            flamePositions[i * 3] = Math.cos(angle) * flameRadius;
            flamePositions[i * 3 + 1] = 5;
            flamePositions[i * 3 + 2] = Math.sin(angle) * flameRadius;
            flameSizes[i] = 6 + Math.random() * 4;
        }
        
        const flameGeometry = new THREE.BufferGeometry();
        flameGeometry.setAttribute('position', new THREE.BufferAttribute(flamePositions, 3));
        flameGeometry.setAttribute('size', new THREE.BufferAttribute(flameSizes, 1));
        
        const flameMaterial = new THREE.PointsMaterial({
            color: 0xff4400,
            size: 8,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });
        
        const flameParticles = new THREE.Points(flameGeometry, flameMaterial);
        flameParticles.userData.basePositions = flamePositions.slice();
        flameParticles.userData.baseSizes = flameSizes.slice();
        flameParticles.userData.flameRadius = flameRadius;
        flameParticles.userData.particleCount = flameParticleCount;
        cannonBodyGroup.add(flameParticles);
        
        // Store reference for animation
        if (!cannonBodyGroup.userData) cannonBodyGroup.userData = {};
        cannonBodyGroup.userData.flameParticles = flameParticles;
    }
}

function updateCannonVisual() {
    // This function is now replaced by buildCannonGeometryForWeapon
    // Keep for backward compatibility but redirect to new function
    buildCannonGeometryForWeapon(gameState.currentWeapon);
}

// Get aim direction from mouse position (shared by cannon aiming and bullet firing)
// PERFORMANCE: Uses pre-allocated temp vectors to avoid garbage collection pressure
// This is critical for third-person mode where this function is called on every mouse move
function getAimDirectionFromMouse(targetX, targetY, outDirection) {
    // Convert screen coordinates to normalized device coordinates
    // PERFORMANCE: Reuse temp Vector2 instead of creating new one
    aimTempVectors.mouseNDC.set(
        (targetX / window.innerWidth) * 2 - 1,
        -(targetY / window.innerHeight) * 2 + 1
    );
    
    // Use raycaster to get direction from camera through mouse point
    raycaster.setFromCamera(aimTempVectors.mouseNDC, camera);
    
    // Get cannon muzzle position
    // PERFORMANCE: Reuse temp Vector3 instead of creating new one
    cannonMuzzle.getWorldPosition(aimTempVectors.muzzlePos);
    
    const rayDir = raycaster.ray.direction;
    const rayOrigin = raycaster.ray.origin;
    
    // PERFORMANCE: Use output vector if provided, otherwise use temp vector
    const result = outDirection || aimTempVectors.direction;
    
    // FPS MODE FIX (Valorant/CS:GO style):
    // In FPS mode, use camera's forward direction directly to eliminate parallax offset
    // This ensures bullets travel exactly where the crosshair points
    if (gameState.viewMode === 'fps') {
        result.copy(rayDir);
        return result;
    }
    
    // THIRD-PERSON MODE: Use ray-plane intersection for accurate click-to-hit
    // Ray equation: P(t) = rayOrigin + rayDir * t
    // Fish plane equation: Y = 0
    // Solve: rayOrigin.y + rayDir.y * t = 0 => t = -rayOrigin.y / rayDir.y
    //
    // Edge cases handled:
    // - If ray is pointing downward (rayDir.y <= 0), use fallback distance
    // - If intersection is behind camera (t <= 0), use fallback distance
    // - Clamp t to reasonable range to avoid extreme values
    
    let targetDistance;
    if (rayDir.y > 0.001) {
        // Ray is pointing upward toward fish plane
        const t = -rayOrigin.y / rayDir.y;
        if (t > 10 && t < 2000) {
            // Valid intersection within reasonable range
            targetDistance = t;
        } else {
            // Intersection too close or too far, use fallback
            targetDistance = 400;
        }
    } else {
        // Ray is pointing downward or horizontal, use fallback
        targetDistance = 400;
    }
    
    aimTempVectors.targetPoint.copy(rayOrigin).addScaledVector(rayDir, targetDistance);
    
    // Calculate direction from muzzle to target point
    result.copy(aimTempVectors.targetPoint).sub(aimTempVectors.muzzlePos).normalize();
    
    // CRITICAL FIX: Ensure direction aligns with ray direction (same general direction as click)
    // If dot product is negative, the direction is opposite to where user clicked
    // This can happen when muzzle is positioned such that the target point ends up "behind" it
    const dotWithRay = result.dot(rayDir);
    if (dotWithRay < 0) {
        // Direction is opposite to ray - use ray direction directly
        // This ensures bullets always go toward where user clicked
        result.copy(rayDir);
    }
    
    return result;
}

// ACCURATE AIMING: Get both direction and target point for accurate bullet trajectory
// Returns { direction: Vector3, targetPoint: Vector3 }
// For 8x weapon, we need the target point to calculate parabolic velocity
//
// FPS MODE FIX (Valorant/CS:GO style):
// In true FPS games, bullets travel in the EXACT direction the camera is looking.
// The crosshair represents where the camera is looking, and bullets hit exactly there.
// Previously, we calculated direction from muzzle to ray-plane intersection, which
// caused parallax offset especially when aiming upward.
// Now in FPS mode, we use the camera's forward direction directly.
function getAimDirectionAndTarget(targetX, targetY, outDirection, outTargetPoint) {
    // Convert screen coordinates to normalized device coordinates
    aimTempVectors.mouseNDC.set(
        (targetX / window.innerWidth) * 2 - 1,
        -(targetY / window.innerHeight) * 2 + 1
    );
    
    // Use raycaster to get direction from camera through mouse point
    raycaster.setFromCamera(aimTempVectors.mouseNDC, camera);
    
    // Get cannon muzzle position
    cannonMuzzle.getWorldPosition(aimTempVectors.muzzlePos);
    
    const rayDir = raycaster.ray.direction;
    const rayOrigin = raycaster.ray.origin;
    
    // Use output vectors if provided, otherwise use temp vectors
    const resultDir = outDirection || aimTempVectors.direction;
    const resultTarget = outTargetPoint || aimTempVectors.targetPoint;
    
    // FPS MODE: Use camera's forward direction directly (Valorant/CS:GO style)
    // This ensures bullets travel exactly where the crosshair points, eliminating parallax
    if (gameState.viewMode === 'fps') {
        // Use ray direction directly - this is the camera's forward direction for screen center
        resultDir.copy(rayDir);
        
        // Calculate target point along ray direction at a reasonable distance
        // Use fish plane intersection if possible, otherwise use fallback distance
        let targetDistance = 400;
        if (rayDir.y > 0.001) {
            const t = -rayOrigin.y / rayDir.y;
            if (t > 10 && t < 2000) {
                targetDistance = t;
            }
        }
        resultTarget.copy(aimTempVectors.muzzlePos).addScaledVector(rayDir, targetDistance);
        
        return { direction: resultDir, targetPoint: resultTarget };
    }
    
    // THIRD-PERSON MODE: Calculate direction from muzzle to ray-plane intersection
    // This allows clicking on specific fish in the scene
    let targetDistance;
    if (rayDir.y > 0.001) {
        const t = -rayOrigin.y / rayDir.y;
        if (t > 10 && t < 2000) {
            targetDistance = t;
        } else {
            targetDistance = 400;
        }
    } else {
        targetDistance = 400;
    }
    
    // Calculate target point
    resultTarget.copy(rayOrigin).addScaledVector(rayDir, targetDistance);
    
    // Calculate direction from muzzle to target point
    resultDir.copy(resultTarget).sub(aimTempVectors.muzzlePos).normalize();
    
    // Ensure direction aligns with ray direction
    const dotWithRay = resultDir.dot(rayDir);
    if (dotWithRay < 0) {
        resultDir.copy(rayDir);
        // Also update target point to be along ray direction
        resultTarget.copy(aimTempVectors.muzzlePos).addScaledVector(rayDir, 400);
    }
    
    return { direction: resultDir, targetPoint: resultTarget };
}

function getParallaxCompensatedCrosshairPosition(mouseX, mouseY) {
    if (!camera || !cannonMuzzle) return null;
    
    const direction = getAimDirectionFromMouse(mouseX, mouseY, aimTempVectors.direction);
    if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) {
        return null;
    }
    
    cannonMuzzle.getWorldPosition(aimTempVectors.muzzlePos);
    const muzzlePos = aimTempVectors.muzzlePos;
    if (!Number.isFinite(muzzlePos.x) || !Number.isFinite(muzzlePos.y) || !Number.isFinite(muzzlePos.z)) {
        return null;
    }
    
    let hitPoint = aimTempVectors.parallaxHitPoint;
    let useWaterSurface = false;
    
    if (direction.y < -0.01) {
        const t = -muzzlePos.y / direction.y;
        if (t > 0 && t < 3000) {
            hitPoint.set(
                muzzlePos.x + direction.x * t,
                0,
                muzzlePos.z + direction.z * t
            );
            useWaterSurface = true;
        }
    }
    
    if (!useWaterSurface) {
        return null;
    }
    
    if (!Number.isFinite(hitPoint.x) || !Number.isFinite(hitPoint.y) || !Number.isFinite(hitPoint.z)) {
        return null;
    }
    
    const screenPos = aimTempVectors.parallaxScreenPos;
    screenPos.copy(hitPoint);
    screenPos.project(camera);
    
    if (!Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y) || !Number.isFinite(screenPos.z)) {
        return null;
    }
    
    if (screenPos.z < -1 || screenPos.z > 1) return null;
    
    const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    
    if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
        return null;
    }
    
    return { x: screenX, y: screenY };
}

// PERFORMANCE: Throttled version of aimCannon - stores mouse position and processes once per frame
// This prevents excessive calls on every mouse move event in third-person mode
function aimCannonThrottled(targetX, targetY) {
    // Store the latest mouse position
    aimThrottleState.lastTargetX = targetX;
    aimThrottleState.lastTargetY = targetY;
    
    // If we already have a pending aim request, don't schedule another
    if (aimThrottleState.pendingAim) return;
    
    // Schedule the aim to happen on the next animation frame
    aimThrottleState.pendingAim = true;
    requestAnimationFrame(() => {
        aimThrottleState.pendingAim = false;
        aimCannon(aimThrottleState.lastTargetX, aimThrottleState.lastTargetY);
    });
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
    // FIX: Clamp direction.y to [-1, 1] to prevent NaN from Math.asin due to floating point errors
    // Without this clamp, extreme angles can cause direction.y to slightly exceed [-1, 1],
    // resulting in NaN pitch, which pollutes cannon rotation matrix and causes "air wall" bug
    const clampedDirY = Math.max(-1, Math.min(1, direction.y));
    const pitch = Math.asin(clampedDirY);
    
    // FPS mode: Limited to ±90° yaw (180° total) - cannon can only face outward
    // 3RD PERSON mode: Unlimited 360° rotation
    // FPS Pitch Limits: Different limits for FPS mode vs 3RD PERSON mode
    let minPitch, maxPitch;
    let clampedYaw = yaw;
    const maxYaw = Math.PI / 2;  // 90 degrees
    
    if (gameState.viewMode === 'fps') {
        minPitch = FPS_PITCH_MIN;
        maxPitch = FPS_PITCH_MAX;
        clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, yaw));
    } else {
        minPitch = -Math.PI / 2;
        maxPitch = Math.PI / 2;
    }
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    
    cannonGroup.rotation.y = clampedYaw;
    if (cannonPitchGroup) {
        // Issue #10: Rotate pitch group so barrel AND muzzle move together
        cannonPitchGroup.rotation.x = -clampedPitch;
    }
}

// ==================== TARGETING SERVICE ====================
// Centralized auto-fire targeting: "Sticky Hunter" system.
// Once locked, stays on target until fish dies or leaves valid play area.
const TargetingService = {
    config: {
        yawLimit:   46.75 * (Math.PI / 180),
        pitchMax:   42.5  * (Math.PI / 180),
        pitchMin:  -29.75 * (Math.PI / 180),
        searchConeAngle: 60,
        hitscanFireGate: 8,
        autoFireAlignGate: 2,
        trackSpeed: 22.0,
        maxRotSpeed: 2.0,
        initialLockMs: 250,
        transitionMs:  200,
        bossCooldownMs: 2000,
        hysteresisExitDeg: 30,
    },

    state: {
        lockedTarget: null,
        phase: 'idle',
        phaseStart: 0,
        currentYaw: 0,
        currentPitch: 0,
        startYaw: 0,
        startPitch: 0,
        initialized: false,
        shotsAtCurrent: 0,
        lockStartMs: 0,
        lastBossReleaseMs: 0,
    },

    reset(){
        const s = this.state;
        s.lockedTarget = null;
        s.phase = 'idle';
        s.phaseStart = 0;
        s.initialized = false;
        s.shotsAtCurrent = 0;
        s.lockStartMs = 0;
    },

    _isTargetValid(fish, refPos) {
        if (!fish) return false;
        if (!fish.isActive) return false;
        if (fish.hp !== undefined && fish.hp <= 0) return false;
        if (!this._isInAutoFireCone(fish.group.position, refPos)) return false;
        return true;
    },

    _initFromCannon() {
        const s = this.state;
        if (!s.initialized) {
            s.currentYaw   = cannonGroup      ? cannonGroup.rotation.y        : 0;
            s.currentPitch = cannonPitchGroup  ? -cannonPitchGroup.rotation.x : 0;
            s.initialized  = true;
        }
    },

    findNearest(muzzlePos) {
        const c = this.config;
        const locked = this.state.lockedTarget;
        const hysteresis = 0.85;
        let bestBoss = null, bestBossDist = Infinity;
        let best = null, bestDist = Infinity;
        let second = null, secondDist = Infinity;
        for (const fish of activeFish) {
            if (!fish.isActive) continue;
            const pos = fish.group.position;
            const dx = pos.x - muzzlePos.x, dy = pos.y - muzzlePos.y, dz = pos.z - muzzlePos.z;
            const dir = new THREE.Vector3(dx, dy, dz).normalize();
            const yaw   = Math.atan2(dir.x, dir.z);
            const pitch = Math.asin(dir.y);
            if (Math.abs(yaw) > c.yawLimit) continue;
            if (pitch > c.pitchMax || pitch < c.pitchMin) continue;
            let dist = dx * dx + dy * dy + dz * dz;
            if (fish.isBoss) {
                if (dist < bestBossDist) { bestBossDist = dist; bestBoss = fish; }
                continue;
            }
            if (locked && fish === locked) dist *= hysteresis;
            if (dist < bestDist) {
                second = best; secondDist = bestDist;
                best = fish; bestDist = dist;
            } else if (dist < secondDist) {
                second = fish; secondDist = dist;
            }
        }
        if (bestBoss) return { primary: bestBoss, fallback: best || second };
        return { primary: best, fallback: second };
    },

    findNearestInCrosshairCone(muzzlePos, crosshairDir, coneAngleDeg) {
        const cosThreshold = Math.cos((coneAngleDeg || 9) * Math.PI / 180);
        let best = null, bestDist = Infinity;
        let bestBoss = null, bestBossDist = Infinity;
        for (const fish of activeFish) {
            if (!fish.isActive) continue;
            const pos = fish.group.position;
            const dx = pos.x - muzzlePos.x, dy = pos.y - muzzlePos.y, dz = pos.z - muzzlePos.z;
            const dist = dx * dx + dy * dy + dz * dz;
            const len = Math.sqrt(dist);
            if (len < 0.001) continue;
            const dot = (dx * crosshairDir.x + dy * crosshairDir.y + dz * crosshairDir.z) / len;
            if (dot < cosThreshold) continue;
            if (fish.isBoss) {
                if (dist < bestBossDist) { bestBossDist = dist; bestBoss = fish; }
                continue;
            }
            if (dist < bestDist) { best = fish; bestDist = dist; }
        }
        if (bestBoss) return bestBoss;
        return best;
    },

    _smoothstep(t) { return t * t * (3 - 2 * t); },

    _wrapDelta(delta) {
        if (delta >  Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        return delta;
    },

    _getCannonForward(out) {
        const yaw = cannonGroup ? cannonGroup.rotation.y : 0;
        const pitch = cannonPitchGroup ? -cannonPitchGroup.rotation.x : 0;
        out.set(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch)
        ).normalize();
        return out;
    },

    _priorityScore(fish, refPos) {
        const tierWeights = { tier1: 1, tier2: 1.2, tier3: 1.5, tier4: 2, tier5: 2.5, tier6: 3 };
        const tw = tierWeights[fish.tier] || 1;
        const reward = (fish.config && fish.config.reward) || 1;
        const dx = fish.group.position.x - refPos.x;
        const dy = fish.group.position.y - refPos.y;
        const dz = fish.group.position.z - refPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return tw * reward / (dist + 1);
    },

    _isInAutoFireCone(fishPos, refPos) {
        const c = this.config;
        const margin = 3 * (Math.PI / 180);
        const dx = fishPos.x - refPos.x;
        const dy = fishPos.y - refPos.y;
        const dz = fishPos.z - refPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1) return true;
        const yaw = Math.atan2(dx / dist, dz / dist);
        const pitch = Math.asin(dy / dist);
        return Math.abs(yaw) <= (c.yawLimit - margin) && pitch >= (c.pitchMin + margin) && pitch <= (c.pitchMax - margin);
    },

    _isInExitCone(fishPos, refPos) {
        const c = this.config;
        const exitRad = c.hysteresisExitDeg * (Math.PI / 180);
        const dx = fishPos.x - refPos.x;
        const dy = fishPos.y - refPos.y;
        const dz = fishPos.z - refPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1) return true;
        const yaw = Math.atan2(dx / dist, dz / dist);
        const pitch = Math.asin(dy / dist);
        return Math.abs(yaw) <= (c.yawLimit + exitRad) &&
               pitch >= (c.pitchMin - exitRad) &&
               pitch <= (c.pitchMax + exitRad);
    },

    _shouldReleaseLock(fish, refPos) {
        if (!fish) return true;
        if (!fish.isActive) return true;
        if (fish.hp !== undefined && fish.hp <= 0) return true;
        return false;
    },

    _pick8xNewTarget(refPos, now) {
        const c = this.config, s = this.state;
        for (const fish of activeFish) {
            if (!fish.isActive || !fish.isBoss) continue;
            if (fish.hp !== undefined && fish.hp <= 0) continue;
            if (now - s.lastBossReleaseMs > c.bossCooldownMs && this._isInAutoFireCone(fish.group.position, refPos)) return fish;
        }
        let nearest = null, nearestDistSq = Infinity;
        for (const fish of activeFish) {
            if (!fish.isActive || fish.isBoss) continue;
            if (fish.hp !== undefined && fish.hp <= 0) continue;
            if (!this._isInAutoFireCone(fish.group.position, refPos)) continue;
            const dx = fish.group.position.x - refPos.x;
            const dy = fish.group.position.y - refPos.y;
            const dz = fish.group.position.z - refPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = fish;
            }
        }
        return nearest;
    },

    _pickTarget(muzzlePos, refPos, now) {
        return this._pick8xNewTarget(refPos || muzzlePos, now || performance.now());
    },

    _pickFallback(muzzlePos, refPos, now) {
        return this._pick8xNewTarget(refPos || muzzlePos, now || performance.now());
    },

    _clampRotDelta(delta, maxStep) {
        if (delta >  maxStep) return maxStep;
        if (delta < -maxStep) return -maxStep;
        return delta;
    },

    _rayHitsTargetFish(origin, dir, fish) {
        const fishPos = fish.group.position;
        const halfExt = fish.ellipsoidHalfExtents;
        const fishYaw = fish._currentYaw || 0;
        if (halfExt) {
            const result = rayHitsEllipsoid(origin, dir, fishPos, halfExt, fishYaw, 8);
            return result.hit && result.t >= 5;
        }
        const fishRadius = fish.boundingRadius || 20;
        const relX = fishPos.x - origin.x;
        const relY = fishPos.y - origin.y;
        const relZ = fishPos.z - origin.z;
        const t = relX * dir.x + relY * dir.y + relZ * dir.z;
        if (t < 5) return false;
        const cpX = origin.x + dir.x * t - fishPos.x;
        const cpY = origin.y + dir.y * t - fishPos.y;
        const cpZ = origin.z + dir.z * t - fishPos.z;
        return (cpX * cpX + cpY * cpY + cpZ * cpZ) <= fishRadius * fishRadius;
    },

    _lastTick: 0,

    tick() {
        const now = performance.now();
        const dt = this._lastTick ? Math.min((now - this._lastTick) / 1000, 0.1) : 1 / 60;
        this._lastTick = now;
        const muzzlePos = new THREE.Vector3();
        cannonMuzzle.getWorldPosition(muzzlePos);
        const c = this.config, s = this.state;
        const maxStep = c.maxRotSpeed * dt;

        this._initFromCannon();

        const isFps = gameState.viewMode === 'fps';
        const refPos = isFps ? camera.position : muzzlePos;


        if (s.phase === 'idle') {
            const target = this._pick8xNewTarget(refPos, now);
            if (target) {
                s.lockedTarget = target;
                s.phase = 'locking';
                s.phaseStart = now;
                s.startYaw = s.currentYaw;
                s.startPitch = s.currentPitch;
                s.lockStartMs = now;
                s.shotsAtCurrent = 0;
            }
            return { target: null, canFire: false };
        }

        if (this._shouldReleaseLock(s.lockedTarget, refPos)) {
            if (s.lockedTarget && s.lockedTarget.isBoss) s.lastBossReleaseMs = now;
            const next = this._pick8xNewTarget(refPos, now);
            if (next) {
                s.lockedTarget = next;
                s.phase = 'transition';
                s.phaseStart = now;
                s.startYaw = s.currentYaw;
                s.startPitch = s.currentPitch;
                s.lockStartMs = now;
                s.shotsAtCurrent = 0;
            } else {
                this.reset();
                this._initFromCannon();
                return { target: null, canFire: false };
            }
        }

        const fish = s.lockedTarget;
        if (!fish) { this.reset(); return { target: null, canFire: false }; }

        let aimPos = fish.group.position.clone();
        if (fish.ellipsoidHalfExtents) {
            const he = fish.ellipsoidHalfExtents;
            if (!fish._aimOffsetSeed) fish._aimOffsetSeed = Math.random() * 1000;
            const t = performance.now() * 0.0003 + fish._aimOffsetSeed;
            const wobbleScale = fish.isBoss ? 0.3 : 0.15;
            aimPos.x += Math.sin(t * 2.1) * he.x * wobbleScale;
            aimPos.y += Math.sin(t * 1.7) * he.y * (wobbleScale * 0.67);
            aimPos.z += Math.cos(t * 1.3) * he.z * wobbleScale;
        }
        const weapon = CONFIG.weapons[gameState.currentWeapon];
        if (weapon.speed && fish.velocity) {
            const dist = muzzlePos.distanceTo(aimPos);
            aimPos.add(fish.velocity.clone().multiplyScalar(dist / weapon.speed));
        }
        const trackOrigin = (gameState.autoShoot && isFps) ? refPos : muzzlePos;
        const dir = aimPos.clone().sub(trackOrigin).normalize();
        const clampedYaw   = Math.max(-c.yawLimit, Math.min(c.yawLimit, Math.atan2(dir.x, dir.z)));
        const clampedPitch = Math.max(c.pitchMin, Math.min(c.pitchMax, Math.asin(dir.y)));

        const elapsed = now - s.phaseStart;
        let canFire = false;

        if (s.phase === 'locking') {
            const t = Math.min(1, elapsed / c.initialLockMs);
            const ease = this._smoothstep(t);
            let dYaw   = this._wrapDelta(clampedYaw   - s.startYaw)   * ease;
            let dPitch = (clampedPitch - s.startPitch) * ease;
            dYaw   = this._clampRotDelta(dYaw,   maxStep * 3);
            dPitch = this._clampRotDelta(dPitch, maxStep * 3);
            s.currentYaw   = s.startYaw   + dYaw;
            s.currentPitch = s.startPitch  + dPitch;
            if (t >= 1) { s.phase = 'firing'; }
        } else if (s.phase === 'firing') {
            const factor = 1 - Math.exp(-c.trackSpeed / 60);
            let dYaw   = this._wrapDelta(clampedYaw - s.currentYaw)   * factor;
            let dPitch = (clampedPitch - s.currentPitch) * factor;
            dYaw   = this._clampRotDelta(dYaw,   maxStep);
            dPitch = this._clampRotDelta(dPitch, maxStep);
            s.currentYaw   += dYaw;
            s.currentPitch += dPitch;
        } else if (s.phase === 'transition') {
            const t = Math.min(1, elapsed / c.transitionMs);
            const ease = this._smoothstep(t);
            let dYaw   = this._wrapDelta(clampedYaw   - s.startYaw)   * ease;
            let dPitch = (clampedPitch - s.startPitch) * ease;
            dYaw   = this._clampRotDelta(dYaw,   maxStep * 3);
            dPitch = this._clampRotDelta(dPitch, maxStep * 3);
            s.currentYaw   = s.startYaw   + dYaw;
            s.currentPitch = s.startPitch  + dPitch;
            if (t >= 1) { s.phase = 'firing'; }
        }

        if (cannonGroup) cannonGroup.rotation.y = s.currentYaw;
        if (cannonPitchGroup) cannonPitchGroup.rotation.x = -s.currentPitch;

        if (s.phase === 'firing' || s.phase === 'locking' || s.phase === 'transition') {
            const fwd = this._getCannonForward(new THREE.Vector3());
            const toFish = fish.group.position.clone().sub(muzzlePos).normalize();
            const dot = fwd.dot(toFish);
            const angleDeg = Math.acos(Math.min(1, Math.max(-1, dot))) * (180 / Math.PI);
            if (angleDeg <= c.autoFireAlignGate) canFire = true;
        }

        return { target: fish, canFire };
    },
};

// Backward-compatible aliases so callers keep working
const AUTOFIRE_YAW_LIMIT  = TargetingService.config.yawLimit;
const AUTOFIRE_PITCH_MAX  = TargetingService.config.pitchMax;
const AUTOFIRE_PITCH_MIN  = TargetingService.config.pitchMin;
const AUTOFIRE_TRACK_SPEED = TargetingService.config.trackSpeed;
const autoFireState = TargetingService.state;

function resetAutoFireState() { TargetingService.reset(); }
function findNearestFish(muzzlePos) { return TargetingService.findNearest(muzzlePos).primary; }
function autoFireTick() { if (!gameState.weaponSelected) return; return TargetingService.tick(); }

function getCrosshairRay() {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return getAimDirectionFromMouse(cx, cy, autoFireTempVectors.crosshairDir);
}

function aimCannonAtFish(fish) {
    if (!fish) return;
    
    const muzzlePos = new THREE.Vector3();
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    const dir = fish.group.position.clone().sub(muzzlePos).normalize();
    
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(dir.y);
    
    let minPitch, maxPitch;
    let clampedYaw = yaw;
    const maxYaw = Math.PI / 2;
    
    if (gameState.viewMode === 'fps') {
        minPitch = FPS_PITCH_MIN;
        maxPitch = FPS_PITCH_MAX;
        clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, yaw));
    } else {
        minPitch = -Math.PI / 2;
        maxPitch = Math.PI / 2;
    }
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    
    cannonGroup.rotation.y = clampedYaw;
    if (cannonPitchGroup) {
        cannonPitchGroup.rotation.x = -clampedPitch;
    }
    
    return dir;
}

// Auto-fire at fish (for AUTO mode - bypasses mouse-based fireBullet)
// PERFORMANCE: Uses pre-allocated temp vectors to avoid per-call allocations
// FIX: Bullets now fire in the direction the cannon is VISUALLY pointing,
// not directly at the target fish. This ensures visual consistency.
function autoFireAtFish(targetFish) {
    const weaponKey = gameState.currentWeapon;
    const weapon = CONFIG.weapons[weaponKey];
    
    // Check cooldown
    if (gameState.cooldown > 0) return false;
    
    if (gameState.balance < weapon.cost * BALANCE_SCALE) return false;
    
    if (!multiplayerMode) {
        gameState.balance -= weapon.cost * BALANCE_SCALE;
        recordBet(weaponKey);
    }
    
    gameState.cooldown = 1 / weapon.shotsPerSecond;
    
    gameState.lastWeaponKey = weaponKey;
    
    // PERFORMANCE: Reuse pre-allocated temp vector instead of new Vector3()
    const muzzlePos = autoFireTempVectors.muzzlePos;
    cannonMuzzle.getWorldPosition(muzzlePos);
    
    let direction;
    if (gameState.autoShoot && targetFish) {
        direction = autoFireTempVectors.direction;
        const aimOrigin = (gameState.viewMode === 'fps') ? camera.position : muzzlePos;
        direction.copy(targetFish.group.position).sub(aimOrigin).normalize();
    } else if (weapon.type === 'laser') {
        direction = getCrosshairRay();
        if (!direction) return false;
    } else {
        direction = autoFireTempVectors.direction;
        const yaw = cannonGroup ? cannonGroup.rotation.y : 0;
        const pitch = cannonPitchGroup ? -cannonPitchGroup.rotation.x : 0;
        direction.set(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch)
        ).normalize();
    }
    
    // HITSCAN SYSTEM: All weapons use instant raycast hit detection (no physical bullets)
    if (weapon.type === 'spread') {
        const spreadAngle = weapon.spreadAngle * (Math.PI / 180);
        fireHitscanRay(muzzlePos, direction, weaponKey, 0);
        fireBulletTempVectors.leftDir.copy(direction).applyAxisAngle(fireBulletTempVectors.yAxis, spreadAngle);
        fireHitscanRay(muzzlePos, fireBulletTempVectors.leftDir, weaponKey, -1);
        fireBulletTempVectors.rightDir.copy(direction).applyAxisAngle(fireBulletTempVectors.yAxis, -spreadAngle);
        fireHitscanRay(muzzlePos, fireBulletTempVectors.rightDir, weaponKey, 1);
    } else if (weapon.type === 'laser') {
        fireLaserBeam(muzzlePos, direction, weaponKey);
    } else {
        fireHitscanRay(muzzlePos, direction, weaponKey);
    }
    
    playWeaponShot(weaponKey);
    spawnMuzzleFlash(weaponKey, muzzlePos, direction);
    
    const wCfg = WeaponSystem.getConfig(weaponKey);
    if (wCfg.chargeTime > 0) {
        startCannonChargeEffect(weaponKey);
    }
    
    if (cannonBarrel) {
        const recoilStrength = wCfg.recoilStrength;
        const autoRecoilScale = 0.3;
        
        if (gameState.viewMode === 'fps') {
            fpsCameraRecoilState.maxPitchOffset = recoilStrength * 0.001;
            fpsCameraRecoilState.active = true;
            fpsCameraRecoilState.phase = 'kick';
            fpsCameraRecoilState.kickStartTime = performance.now();
            fpsCameraRecoilState.kickDuration = 20;
            fpsCameraRecoilState.returnDuration = 60;
        } else {
            const correctY = wCfg.cannonYOffset !== undefined ? wCfg.cannonYOffset : 20;
            barrelRecoilState.originalPosition.set(0, correctY, 0);
            barrelRecoilState.recoilVector.set(0, -1, 0);
            barrelRecoilState.recoilDistance = recoilStrength * autoRecoilScale;
            barrelRecoilState.active = true;
            barrelRecoilState.phase = 'kick';
            barrelRecoilState.kickStartTime = performance.now();
            barrelRecoilState.kickDuration = 20;
            barrelRecoilState.returnDuration = 60;
        }
    }
    
    return true;
}

// ==================== FISH SYSTEM ====================
// FIX: Global counter for fish load tokens to prevent stale GLB attachments
let fishLoadTokenCounter = 0;

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
        
        this.rtpFishId = nextRTPFishId();
        this.rtpTier = getFishRTPTier(tier);
        
        // STUCK FISH DETECTION: Track position to detect fish that stop moving
        this.lastPosition = new THREE.Vector3();
        this.stuckTimer = 0;
        this.updateErrorCount = 0;
        
        // FIX: Load token to prevent attaching GLB to stale/recycled fish instances
        this.loadToken = ++fishLoadTokenCounter;
        this.glbLoaded = false;
        
        // Phase 2: Initialize shield HP for Shield Turtle
        if (tierConfig.ability === 'shield' && tierConfig.shieldHP) {
            this.shieldHP = tierConfig.shieldHP;
        }
        
        this.createMesh();
    }
    
    createMesh() {
        if (this.group) {
            if (this.glbCorrectionWrapper) {
                this.group.remove(this.glbCorrectionWrapper);
                if (this.glbMixer && this.glbModelRoot) {
                    this.glbMixer.stopAllAction();
                    this.glbMixer.uncacheRoot(this.glbModelRoot);
                }
            }
            if (this.group.parent) {
                this.group.parent.remove(this.group);
            }
            this.group.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
            });
            this.glbModelRoot = null;
            this.glbMeshes = null;
            this.glbMixer = null;
            this.glbAction = null;
            this.glbPitchWrapper = null;
            this.glbCorrectionWrapper = null;
            this.glbLoaded = false;
        }
        
        this.group = new THREE.Group();
        
        // Apply global scale multiplier to procedural meshes (same as GLB models)
        const baseSize = this.config.size;
        const scaleMultiplier = CONFIG.glbModelScaleMultiplier || 1.0;
        let size = baseSize * scaleMultiplier;
        
        // FIX: Cap procedural mesh size to prevent massive geometry when GLB fails to load
        // Boss fish like GOLDEN MANTA can have size = 90 * 2.2 * 3.0 = 594 units
        // This creates a massive flat shape that dominates the screen
        // Cap at 200 units - GLB models will still load at correct size via tryLoadGLBForFish
        const MAX_PROCEDURAL_MESH_SIZE = 200;
        if (size > MAX_PROCEDURAL_MESH_SIZE) {
            console.log(`[FISH] Capping procedural mesh size from ${size.toFixed(1)} to ${MAX_PROCEDURAL_MESH_SIZE} for form=${this.config.form || 'standard'}`);
            size = MAX_PROCEDURAL_MESH_SIZE;
        }
        const color = this.config.color;
        const secondaryColor = this.config.secondaryColor || color;
        const form = this.config.form || 'standard';
        
        // Mark fish group for Performance Monitor triangle categorization
        this.group.userData.isFish = true;
        this.group.userData.fishForm = form;
        
        // GLB state is now always reset in the cleanup block above
        
        // PERFORMANCE: Use cached materials (same color fish share materials - reduces GPU state changes)
        const bodyMaterial = getCachedFishMaterial(color, 0.3, 0.2, color, 0.1);
        const secondaryMaterial = getCachedFishMaterial(secondaryColor, 0.3, 0.2, null, 0);
        
        // FIX: GLB loading moved to spawn() to ensure fish is active and positioned
        // This prevents GLB from being attached to inactive fish at origin (0,0,0)
        // Store form for later use in spawn()
        this.form = form;
        
        // Create mesh based on form type (procedural fallback, shown immediately)
        switch (form) {
            case 'whale':
            case 'killerWhale':
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
            case 'pufferfish':
                this.createPufferfishMesh(size, bodyMaterial, secondaryMaterial);
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
            case 'seahorse':
                this.createSeahorseMesh(size, bodyMaterial, secondaryMaterial);
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
        
        const ratios = FISH_ELLIPSOID_RATIOS[form] || FISH_ELLIPSOID_RATIOS.standard;
        this.ellipsoidHalfExtents = new THREE.Vector3(
            size * ratios[0],
            size * ratios[1],
            size * ratios[2]
        );
        this.boundingRadius = Math.max(this.ellipsoidHalfExtents.x, this.ellipsoidHalfExtents.y, this.ellipsoidHalfExtents.z);
        
        // PERFORMANCE: Only enable shadows for boss fish (tier 5+) to reduce GPU load
        // Regular fish (tier 1-4) don't cast shadows - this significantly improves FPS
        const isBossFish = this.tier >= 5 || BOSS_ONLY_SPECIES.includes(this.config.species);
        if (this.body) {
            this.body.castShadow = isBossFish;
        }
        
        // FIX: Set group invisible initially to prevent static model at origin (0,0,0)
        // Fish will be made visible when spawn() is called
        this.group.visible = false;
        
        fishGroup.add(this.group);
    }
    
    // FIX: Try to load GLB model asynchronously and replace procedural mesh when loaded
    async tryLoadGLBModel(form, size) {
        // DEBUG: Track stats
        glbSwapStats.tryLoadCalled++;
        updateGlbDebugDisplay();
        
        // DEBUG: Log entry to this function
        console.log(`[FISH-GLB] tryLoadGLBModel called for form='${form}', size=${size}, enabled=${glbLoaderState.enabled}, manifestLoaded=${!!glbLoaderState.manifest}`);
        
        // Skip if GLB loader is disabled or manifest not loaded
        if (!glbLoaderState.enabled || !glbLoaderState.manifest) {
            glbSwapStats.manifestNotReady++;
            updateGlbDebugDisplay();
            console.log(`[FISH-GLB] Skipping GLB load - enabled=${glbLoaderState.enabled}, manifest=${!!glbLoaderState.manifest}`);
            return;
        }
        
        // FIX: Capture load token before async operation to detect stale fish
        const myLoadToken = this.loadToken;
        
        // Get tier name from config (e.g., 'tier1', 'tier3', etc.)
        const tierConfig = { tier: this.tier, size: size };
        
        try {
            console.log(`[FISH-GLB] Calling tryLoadGLBForFish for form='${form}'`);
            const glbModel = await tryLoadGLBForFish(tierConfig, form);
            console.log(`[FISH-GLB] tryLoadGLBForFish returned: ${glbModel ? 'model' : 'null'} for form='${form}'`);
            
            // FIX: Check if fish instance is still valid after async load
            // If loadToken changed, this fish was recycled/reinitialized - don't attach GLB
            if (myLoadToken !== this.loadToken) {
                glbSwapStats.tokenMismatch++;
                updateGlbDebugDisplay();
                console.log(`[FISH-GLB] Skipping stale GLB attachment for ${form} (token mismatch: ${myLoadToken} vs ${this.loadToken})`);
                return;
            }
            
            // FIX: Check if fish is still active and has a valid group
            if (!this.isActive || !this.group || !this.group.parent) {
                if (!this.isActive) glbSwapStats.fishInactive++;
                else glbSwapStats.groupMissing++;
                updateGlbDebugDisplay();
                console.log(`[FISH-GLB] Skipping GLB attachment for inactive fish ${form} (isActive=${this.isActive}, group=${!!this.group}, parent=${!!this.group?.parent})`);
                return;
            }
            
            // DEBUG: Track null model returns (with per-form tracking)
            if (!glbModel) {
                glbSwapStats.glbModelNull++;
                glbSwapStats.glbModelNullByForm[form] = (glbSwapStats.glbModelNullByForm[form] || 0) + 1;
                updateGlbDebugDisplay();
            }
            
            if (glbModel && this.group) {
                // MEMORY LEAK FIX: Clean up existing GLB wrapper before creating new one
                // This prevents accumulation of orphaned wrappers when fish is recycled
                // and tryLoadGLBModel is called multiple times
                if (this.glbCorrectionWrapper) {
                    // Remove old wrapper from group
                    this.group.remove(this.glbCorrectionWrapper);
                    
                    // Clean up old AnimationMixer if exists
                    if (this.glbMixer && this.glbModelRoot) {
                        this.glbMixer.stopAllAction();
                        this.glbMixer.uncacheRoot(this.glbModelRoot);
                    }
                    
                    // NOTE: Do NOT dispose GLB geometries here!
                    // GLB clones share geometry references with the cached model.
                    // Disposing them would corrupt other fish using the same model.
                    // The global GLB cache owns these geometries for the app's lifetime.
                    
                    // Clear references (but don't dispose shared resources)
                    this.glbCorrectionWrapper = null;
                    this.glbPitchWrapper = null;
                    this.glbModelRoot = null;
                    this.glbMeshes = null;
                    this.glbMixer = null;
                    this.glbAction = null;
                    this.glbLoaded = false;
                    
                    console.log(`[FISH-GLB] Cleaned up old GLB wrapper for ${form}`);
                }
                
                // Store reference to procedural mesh children for removal
                const proceduralChildren = [...this.group.children];
                
                // FIX: Simple wrapper structure - DO NOT cancel the rig's rotation!
                // The rig's +90° X rotation is INTENTIONAL - it converts the model from vertical bind pose
                // to horizontal swimming pose. Cancelling it makes fish stand vertically!
                //
                // The only correction needed is Y rotation to face the fish forward (align with movement)
                //
                // Hierarchy: group (yaw) -> correctionWrapper (Y rotation only) -> pitchWrapper (pitch) -> glbModel
                //
                // This ensures:
                // 1. Yaw (facing direction) is applied at the group level
                // 2. Y correction aligns the model's forward axis to game's +X forward
                // 3. Pitch (nose up/down) is applied closest to the model
                // 4. The rig's +90° X rotation is PRESERVED (makes fish horizontal)
                
                // Layer 1: Per-model Y correction wrapper (Y rotation only to face forward)
                this.glbCorrectionWrapper = new THREE.Group();
                
                // Layer 2: Pitch wrapper - for dynamic pitch (nose up/down)
                this.glbPitchWrapper = new THREE.Group();
                
                // Build the hierarchy: group -> correctionWrapper -> pitchWrapper -> glbModel
                this.glbPitchWrapper.add(glbModel);
                this.glbCorrectionWrapper.add(this.glbPitchWrapper);
                this.group.add(this.glbCorrectionWrapper);
                
                // Remove procedural mesh children (keep GLB only)
                // FIX: Use recursive disposal to handle nested structures like Manta Ray
                // Manta Ray has: group -> mantaCorrectionWrapper -> mantaPitchWrapper -> meshes
                // Simple child.geometry.dispose() misses the nested meshes, causing memory leak
                proceduralChildren.forEach(child => {
                    this.group.remove(child);
                    // FIX: Recursively dispose all geometries in the subtree
                    // This properly handles nested wrappers like Manta Ray's structure
                    // Note: Does NOT dispose materials as they are cached and shared
                    disposeMeshSubtreeGeometries(child);
                });
                
                // FIX: Store GLB model root separately - don't overwrite this.body
                // this.body is expected to be a Mesh with material for flash effects
                // glbModel is a Group, so we need to find the actual meshes inside
                this.glbModelRoot = glbModel;
                this.glbLoaded = true;
                
                // FIX: Simple Y-only rotation to face fish forward
                // DO NOT cancel the rig's +90° X rotation - it's INTENTIONAL!
                // The rig rotation converts the model from vertical bind pose to horizontal swimming pose.
                // We only need Y rotation to align the model's forward axis with the game's +X forward.
                //
                // Per-model Y rotation to face forward (game expects X-forward)
                const GLB_Y_ROTATION = {
                    'hammerhead': 0,           // Hammerhead faces +X in model space
                    'marlin': Math.PI / 2,     // Marlin faces +Z, rotate 90° to face +X
                    'greatwhiteshark': Math.PI / 2,
                    'grouper': Math.PI / 2,
                    'sardine': Math.PI / 2,
                    'tuna': Math.PI / 2
                };
                
                const yRotation = GLB_Y_ROTATION[form] !== undefined ? GLB_Y_ROTATION[form] : Math.PI / 2;
                
                // Apply ONLY Y rotation - do NOT touch X or Z!
                // The rig's +90° X rotation is preserved and makes the fish horizontal
                this.glbCorrectionWrapper.rotation.set(0, yRotation, 0);
                console.log(`[FISH-GLB] Applied Y-only correction for ${form}: Y=${(yRotation * 180 / Math.PI).toFixed(0)}° (rig's +90° X preserved)`);
                
                // Store for reference (legacy compatibility)
                this.glbAxisWrapper = this.glbCorrectionWrapper;
                this.glbModelFixWrapper = null;  // No longer used
                
                // FIX: Collect all meshes from GLB for material operations
                this.glbMeshes = [];
                glbModel.traverse((child) => {
                    if (child.isMesh) {
                        this.glbMeshes.push(child);
                        // Mark mesh as fish for Performance Monitor triangle categorization
                        child.userData.isFish = true;
                        child.userData.fishForm = form;
                        // Apply shadow settings to GLB meshes
                        const isBossFish = this.tier >= 5 || BOSS_ONLY_SPECIES.includes(this.config.species);
                        child.castShadow = isBossFish;
                    }
                });
                
                // FIX: Set this.body to first mesh found (for compatibility with existing code)
                // This ensures this.body.material exists for flash effects
                if (this.glbMeshes.length > 0) {
                    this.body = this.glbMeshes[0];
                }
                
                // Clear procedural tail reference since GLB has its own tail
                this.tail = null;
                
                // DEBUG: Track successful swap
                glbSwapStats.swapSuccess++;
                glbSwapStats.swapSuccessByForm[form] = (glbSwapStats.swapSuccessByForm[form] || 0) + 1;
                updateGlbDebugDisplay();
                
                // FIX: Log successful GLB swap with verification
                const childTypes = this.group.children.map(c => c.type || 'unknown').join(', ');
                console.log(`[FISH-GLB] Successfully swapped to GLB for ${form} (tier ${this.tier}), meshes=${this.glbMeshes.length}, children: [${childTypes}]`);
                
                // Setup animation playback for GLB models with animations
                // FIX: Use glbUrl stored in userData instead of undefined glbKey
                const glbUrl = glbModel.userData?.glbUrl;
                const animations = glbUrl ? getGLBAnimations(glbUrl) : null;
                if (animations && animations.length > 0) {
                    // Create AnimationMixer for this fish's GLB model
                    this.glbMixer = new THREE.AnimationMixer(this.glbModelRoot);
                    
                    // Find swimming animation or use first available
                    let clip = animations.find(c => c.name.toLowerCase().includes('swim')) || animations[0];
                    
                    // Create and play the animation action
                    this.glbAction = this.glbMixer.clipAction(clip);
                    this.glbAction.setLoop(THREE.LoopRepeat);
                    this.glbAction.play();
                    
                    console.log(`[FISH-GLB] Started animation "${clip.name}" (${clip.duration.toFixed(2)}s) for ${form}`);
                }
            }
        } catch (error) {
            // Silently fail - procedural mesh is already showing
            console.warn(`[FISH-GLB] Failed to load GLB for ${form}:`, error.message);
        }
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
    
    // Pufferfish - Round ball with spikes
    createPufferfishMesh(size, bodyMaterial, secondaryMaterial) {
        const bodyGeometry = new THREE.SphereGeometry(size / 2, 16, 16);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.group.add(this.body);
        
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
        
        const finGeometry = new THREE.SphereGeometry(size * 0.08, 8, 8);
        finGeometry.scale(1, 1.5, 0.3);
        [-1, 1].forEach(side => {
            const fin = new THREE.Mesh(finGeometry, bodyMaterial);
            fin.position.set(0, 0, side * size * 0.4);
            this.group.add(fin);
        });
        
        const tailGeometry = new THREE.SphereGeometry(size * 0.1, 8, 8);
        tailGeometry.scale(0.8, 1.2, 0.3);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.position.x = -size * 0.4;
        this.group.add(this.tail);
        
        this.addEyes(size, 0.25, 0.2);
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
        // FIX: Manta Ray wrapper structure (mirrors GLB fish structure):
        // group (yaw only) -> mantaCorrectionWrapper (static roll fix) -> mantaPitchWrapper (dynamic pitch) -> meshes
        // This ensures the base orientation correction is preserved when updateRotation() resets group.rotation.x = 0
        
        // Static correction wrapper - rotates the flat manta to be horizontal
        // The geometry is built with Y as thin axis, but we need to verify if it needs roll correction
        this.mantaCorrectionWrapper = new THREE.Group();
        this.group.add(this.mantaCorrectionWrapper);
        
        // Dynamic pitch wrapper - for nose up/down tilt when swimming vertically
        this.mantaPitchWrapper = new THREE.Group();
        this.mantaCorrectionWrapper.add(this.mantaPitchWrapper);
        
        // Flat diamond body
        const bodyGeometry = new THREE.BoxGeometry(size * 0.8, size * 0.1, size * 1.5);
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.castShadow = true;
        this.mantaPitchWrapper.add(this.body);
        
        // Wings (extended sides)
        [-1, 1].forEach(side => {
            const wingGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.05, size * 0.8);
            const wing = new THREE.Mesh(wingGeometry, bodyMaterial);
            wing.position.set(size * 0.1, 0, side * size * 0.9);
            wing.rotation.x = side * 0.2;
            this.mantaPitchWrapper.add(wing);
        });
        
        // White belly
        const bellyGeometry = new THREE.BoxGeometry(size * 0.6, size * 0.05, size * 1.2);
        const belly = new THREE.Mesh(bellyGeometry, secondaryMaterial);
        belly.position.y = -size * 0.05;
        this.mantaPitchWrapper.add(belly);
        
        // Cephalic fins (horn-like)
        [-1, 1].forEach(side => {
            const hornGeometry = new THREE.ConeGeometry(size * 0.05, size * 0.3, 8);
            const horn = new THREE.Mesh(hornGeometry, bodyMaterial);
            horn.rotation.z = -Math.PI / 2;
            horn.position.set(size * 0.5, 0, side * size * 0.2);
            this.mantaPitchWrapper.add(horn);
        });
        
        // Long thin tail
        const tailGeometry = new THREE.CylinderGeometry(size * 0.02, size * 0.01, size * 0.8, 8);
        this.tail = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tail.rotation.z = Math.PI / 2;
        this.tail.position.x = -size * 0.7;
        this.mantaPitchWrapper.add(this.tail);
        
        // Eyes on sides
        const eyeGeometry = new THREE.SphereGeometry(size * 0.05, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        [-1, 1].forEach(side => {
            const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            eye.position.set(size * 0.3, size * 0.05, side * size * 0.3);
            this.mantaPitchWrapper.add(eye);
        });
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
        // DEBUG: Track spawns
        glbSwapStats.totalSpawned++;
        updateGlbDebugDisplay();
        
        // MEMORY LEAK FIX: Cancel any pending respawn timer from previous lifecycle
        // This is critical when a fish is reused from freeFish pool before its respawn timer fires
        // Without this, the old timer would still fire and cause duplicate spawn attempts
        if (this.respawnTimerId) {
            clearTimeout(this.respawnTimerId);
            this.respawnTimerId = null;
        }
        
        // RTP FIX: Clear old RTP state and assign fresh fishId on EVERY spawn
        // This fixes the bug where fish recycled via updateDynamicFishSpawn()
        // kept their old rtpFishId with killed=true, making them immortal.
        const oldRtpFishId = this.rtpFishId;
        this.rtpFishId = nextRTPFishId();
        if (oldRtpFishId && typeof clientRTPEngine !== 'undefined') {
            clientRTPEngine.clearFishStates(oldRtpFishId);
        }
        
        this.group.position.copy(position);
        this.hp = this.config.hp;
        this.isActive = true;
        this.isFrozen = false;
        this.group.visible = true;
        
        // FISH RESPAWN FIX: Re-add fish group to fishGroup if it was removed
        // This fixes the bug where fish become invisible after Boss Mode ends.
        // endBossEvent() removes boss fish groups from fishGroup, but when the
        // respawn timer fires, spawn() didn't re-add them, causing fish to be
        // "active" in activeFish but not visible in the scene.
        if (!this.group.parent && typeof fishGroup !== 'undefined') {
            fishGroup.add(this.group);
        }
        
        // FISH RESPAWN FIX: Clear isBoss flag when spawning
        // This ensures fish that were used as boss fish during Boss Mode
        // are treated as normal fish when they respawn after Boss Mode ends.
        this.isBoss = false;
        
        if (this.config.ability === 'shield' && this.config.shieldHP) {
            this.shieldHP = this.config.shieldHP;
        }
        
        this._originalCorrectionQuat = null;
        this._hitCount = 0;
        
        // FIX: Reset lastPosition on spawn to prevent stuck fish detection from using stale data
        // This is critical for pooled fish reuse - without this, the first frame's displacement
        // calculation would use the old fish's last position, potentially triggering false stuck detection
        this.lastPosition.copy(position);
        this.stuckTimer = 0;
        
        // FIX: Reset rotation on spawn to prevent pooled fish from keeping old tilt
        // This ensures fish start level (dorsal up) when respawning
        this.group.rotation.x = 0;
        this.group.rotation.z = 0;
        
        // FIX: Reset GLB wrapper rotations for recycled fish
        // With simplified wrapper structure: glbCorrectionWrapper (static quaternion) -> glbPitchWrapper (pitch)
        // Only reset the pitch wrapper - correction wrapper uses static quaternion per model
        if (this.glbPitchWrapper) {
            this.glbPitchWrapper.rotation.z = 0;  // Reset pitch to level
            // glbCorrectionWrapper quaternion is static per model, don't reset
        } else if (this.glbCorrectionWrapper || this.glbAxisWrapper) {
            // Legacy fallback for any fish that might still use old structure
            const wrapper = this.glbCorrectionWrapper || this.glbAxisWrapper;
            wrapper.rotation.z = 0;
            // Keep quaternion/rotation for axis correction (set during GLB load)
        }
        
        // FIX: Update loadToken on each spawn to invalidate any in-flight async GLB loads
        // from previous lifecycle (fish recycling/pooling)
        this.loadToken = ++fishLoadTokenCounter;
        
        // FIX: Ensure this.speed is valid for current config (important for pooled fish reuse)
        // When a fish is recycled (e.g., Boss fish reusing a sardine from pool), this.speed
        // may still have the old fish's value. This causes sharks to move very slowly if they
        // inherited a small fish's speed value.
        const speedMin = this.config.speedMin;
        const speedMax = this.config.speedMax;
        if (this.speed < speedMin || this.speed > speedMax) {
            this.speed = speedMin + Math.random() * (speedMax - speedMin);
        }
        
        // FIX: Reset patternState on spawn to prevent stuck phases from previous lifecycle
        // This is critical for burstAttack fish (sharks) - if they were in 'stop' phase when
        // recycled, they would stay nearly motionless because min-speed enforcement skips 'stop'
        this.patternState = null;
        
        // Random initial velocity
        this.velocity.set(
            (Math.random() - 0.5) * this.speed,
            (Math.random() - 0.5) * this.speed * 0.3,
            (Math.random() - 0.5) * this.speed
        );
        
        // Reset material - handle both GLB and procedural fish
        // FIX: Guard against missing material or emissiveIntensity property
        if (this.glbLoaded && this.glbMeshes) {
            this.glbMeshes.forEach(mesh => {
                if (mesh.material && 'emissiveIntensity' in mesh.material) {
                    mesh.material.emissiveIntensity = 0.1;
                }
            });
        } else if (this.body && this.body.material && 'emissiveIntensity' in this.body.material) {
            this.body.material.emissiveIntensity = 0.1;
        }
        
        // FIX: Load GLB model AFTER fish is active and positioned
        // This ensures the guard in tryLoadGLBModel() won't block attachment
        // Only load if not already loaded (prevents duplicate loading on respawn)
        // BOSS MODE FIX: Also reload if glbLoaded is true but glbModelRoot is missing/invalid
        // This can happen when a fish is recycled from freeFish pool - the GLB model may have
        // been detached or corrupted, but glbLoaded remains true from the previous lifecycle
        const needsGLBReload = !this.glbLoaded || 
            (this.glbLoaded && (!this.glbModelRoot || !this.glbModelRoot.parent));
        
        if (needsGLBReload && this.form) {
            // Reset GLB state to ensure fresh load
            this.glbLoaded = false;
            this.tryLoadGLBModel(this.form, this.config.size);
        } else if (this.glbLoaded && this.glbModelRoot) {
            const glbUrl = this.glbModelRoot.userData?.glbUrl;
            const animations = glbUrl ? getGLBAnimations(glbUrl) : null;
            if (animations && animations.length > 0) {
                this.glbMixer = new THREE.AnimationMixer(this.glbModelRoot);
                let clip = animations.find(c => c.name.toLowerCase().includes('swim')) || animations[0];
                this.glbAction = this.glbMixer.clipAction(clip);
                this.glbAction.setLoop(THREE.LoopRepeat);
                this.glbAction.play();
                this._animTimeScale = 1.0;
                this._animMode = 'swim';
            } else {
                console.warn(`[FISH-BUG] No animations found for recycled fish ${this.form} (glbUrl=${glbUrl}), forcing GLB reload`);
                this.glbLoaded = false;
                this.tryLoadGLBModel(this.form, this.config.size);
            }
        }
        
        // FISH BEHAVIOR SYSTEM: Initialize behavior state for smooth swimming paths
        // Each fish gets unique noise seed and behavior parameters based on species/category
        const category = this.config.category || 'reefFish';
        const behaviorConfig = getFishBehaviorConfig(this.tier, category);
        const depthBand = getDepthBandBounds(behaviorConfig.depthBand);
        
        // Initialize behavior state (reused across spawns for pooled fish)
        if (!this.behaviorState) {
            this.behaviorState = {
                noiseSeed: 0,
                baseDepth: 0,
                noiseScale: 0,
                noiseDrift: 0,
                verticalAmplitude: 0,
                wanderStrength: 0,
                depthMin: 0,
                depthMax: 0,
                noiseTime: 0
            };
        }
        
        // Set behavior parameters for this spawn
        this.behaviorState.noiseSeed = Math.random() * 10000;
        this.behaviorState.noiseScale = behaviorConfig.noiseScale;
        this.behaviorState.noiseDrift = behaviorConfig.noiseDrift;
        this.behaviorState.verticalAmplitude = behaviorConfig.verticalAmplitude;
        this.behaviorState.wanderStrength = behaviorConfig.wanderStrength;
        this.behaviorState.depthMin = depthBand.min;
        this.behaviorState.depthMax = depthBand.max;
        this.behaviorState.noiseTime = Math.random() * 100; // Random start time for variety
        
        // Set base depth within the species' preferred depth band
        // Spawn position Y is used as initial hint, clamped to depth band
        this.behaviorState.baseDepth = Math.max(depthBand.min, 
            Math.min(depthBand.max, position.y));
        
        // Issue #5: Trigger rare fish effects for tier4 (boss fish)
        triggerRareFishEffects(this.tier);
    }
    
    update(deltaTime, allFish) {
        if (!this.isActive) return;
        
        // Update GLB animation mixer (deltaTime is in seconds)
        if (this.glbMixer) {
            this.glbMixer.update(deltaTime);
            
            // ANIMATION SPEED SYSTEM: Adjust animation timeScale based on fish velocity
            // When fish is moving fast: normal swim animation (timeScale = 1.0)
            // When fish is slow/idle: slow animation to look like gentle hovering (timeScale = 0.1)
            // Uses hysteresis to prevent flickering near threshold
            if (this.glbAction) {
                // Initialize animation state if not set
                if (this._animTimeScale === undefined) {
                    this._animTimeScale = 1.0;
                    this._animMode = 'swim'; // 'swim' or 'idle'
                }
                
                // Calculate speed relative to fish's configured speed range
                const speedSq = this.velocity.x * this.velocity.x + 
                               this.velocity.y * this.velocity.y + 
                               this.velocity.z * this.velocity.z;
                const speedMax = this.config.speedMax || 60;
                
                // Hysteresis thresholds (relative to speedMax)
                // Enter swim mode at 20% of max speed, exit at 12%
                const swimEnterThreshold = speedMax * 0.20;
                const swimExitThreshold = speedMax * 0.12;
                const swimEnterSq = swimEnterThreshold * swimEnterThreshold;
                const swimExitSq = swimExitThreshold * swimExitThreshold;
                
                // Determine target mode with hysteresis
                if (this._animMode === 'idle' && speedSq > swimEnterSq) {
                    this._animMode = 'swim';
                } else if (this._animMode === 'swim' && speedSq < swimExitSq) {
                    this._animMode = 'idle';
                }
                
                // Target timeScale based on mode
                // Idle: gentle hovering (0.3) - still visibly animated
                // Swim: scale from 0.7 to 1.2 based on speed - more lively
                // Boost: scale from 1.2 to 1.6 when speed exceeds speedMax
                let targetTimeScale;
                if (this._animMode === 'idle') {
                    targetTimeScale = 0.3;
                } else {
                    const speed = Math.sqrt(speedSq);
                    const speedRatio = speed / speedMax;
                    
                    if (speedRatio <= 1.0) {
                        targetTimeScale = 0.7 + speedRatio * 0.5;
                    } else {
                        const boostRatio = Math.min(1, (speedRatio - 1.0) / 0.5);
                        const smoothBoost = boostRatio * boostRatio * (3 - 2 * boostRatio);
                        const maxBoostTimeScale = 1.6;
                        targetTimeScale = 1.2 + smoothBoost * (maxBoostTimeScale - 1.2);
                    }
                }
                
                // Smooth transition (lerp) to avoid jarring changes
                // ~200ms transition time at 60fps
                const smoothFactor = Math.min(1, deltaTime * 5);
                this._animTimeScale += (targetTimeScale - this._animTimeScale) * smoothFactor;
                
                // Apply to animation action
                this.glbAction.setEffectiveTimeScale(this._animTimeScale);
            }
        }
        
        // Handle freeze
        if (this.isFrozen) {
            this.freezeTimer -= deltaTime;
            if (this.freezeTimer <= 0) {
                this.isFrozen = false;
                // FIX: Handle both GLB and procedural fish for freeze effect reset
                if (this.glbLoaded && this.glbMeshes) {
                    this.glbMeshes.forEach(mesh => {
                        if (mesh.material) {
                            if (mesh.material.emissive) {
                                mesh.material.emissive.setHex(this.config.color);
                            }
                            if ('emissiveIntensity' in mesh.material) {
                                mesh.material.emissiveIntensity = 0.1;
                            }
                        }
                    });
                } else if (this.body && this.body.material) {
                    if (this.body.material.emissive) {
                        this.body.material.emissive.setHex(this.config.color);
                    }
                    if ('emissiveIntensity' in this.body.material) {
                        this.body.material.emissiveIntensity = 0.1;
                    }
                }
            }
            return;
        }
        
        // Initialize pattern state if needed
        if (!this.patternState) {
            this.patternState = {
                timer: 0,
                phase: 'normal',
                burstTimer: 1 + Math.random() * 3, // FIX: Start with random delay (1-4 sec) instead of 0
                waveOffset: Math.random() * Math.PI * 2,
                circleAngle: Math.random() * Math.PI * 2,
                stopTimer: 0,
                territoryCenter: this.group.position.clone(),
                jumpPhase: 0
            };
        }
        
        // FIX: Ensure burstTimer is a valid number (guard against NaN from stuck recovery)
        if (!Number.isFinite(this.patternState.burstTimer)) {
            this.patternState.burstTimer = 1 + Math.random() * 3;
            this.patternState.phase = 'normal';
        }
        
        // Reset acceleration
        this.acceleration.set(0, 0, 0);
        
        // Apply pattern-specific behavior
        const pattern = this.config.pattern || 'cruise';
        this.applySwimmingPattern(pattern, deltaTime, allFish);
        
        // FISH BEHAVIOR SYSTEM: Apply noise-based smooth swimming and vertical floating
        // This creates natural, organic movement paths instead of random jitter
        if (this.behaviorState) {
            // Update noise time
            this.behaviorState.noiseTime += deltaTime * this.behaviorState.noiseDrift;
            
            const seed = this.behaviorState.noiseSeed;
            const scale = this.behaviorState.noiseScale;
            const t = this.behaviorState.noiseTime;
            const pos = this.group.position;
            
            // Sample noise for horizontal wander direction
            // Use position-based noise so fish in different locations move differently
            const noiseX = valueNoise2D(seed + pos.x * scale, t);
            const noiseZ = valueNoise2D(seed + 1000 + pos.z * scale, t);
            
            // Apply smooth wander acceleration (replaces some of the random jitter)
            const wanderStrength = this.behaviorState.wanderStrength;
            this.acceleration.x += noiseX * wanderStrength;
            this.acceleration.z += noiseZ * wanderStrength;
            
            // VERTICAL FLOATING: Natural up-down motion within depth band
            // Use slower noise for vertical movement (more gentle)
            const verticalNoise = valueNoise2D(seed + 2000, t * 0.5);
            const desiredY = this.behaviorState.baseDepth + 
                verticalNoise * this.behaviorState.verticalAmplitude;
            
            // Clamp desired Y to depth band
            const clampedDesiredY = Math.max(this.behaviorState.depthMin,
                Math.min(this.behaviorState.depthMax, desiredY));
            
            // Apply spring force toward desired depth (gentle, not abrupt)
            const depthError = clampedDesiredY - pos.y;
            const verticalSpringK = 0.8; // Spring constant
            const verticalDamping = 0.3; // Damping to prevent oscillation
            this.acceleration.y += depthError * verticalSpringK - this.velocity.y * verticalDamping;
        }
        
        // Apply boids behavior (stronger for schooling fish)
        // PERFORMANCE: Throttle boids update for distant fish (LOD 2/3)
        // This saves significant CPU time with 180-200 fish
        if (!this.boidsFrameCounter) this.boidsFrameCounter = 0;
        this.boidsFrameCounter++;
        
        // LOD 0/1: Update every frame, LOD 2: Every 2 frames, LOD 3: Every 3 frames
        const boidsUpdateInterval = this.currentLodLevel <= 1 ? 1 : (this.currentLodLevel === 2 ? 2 : 3);
        const shouldUpdateBoids = this.boidsFrameCounter % boidsUpdateInterval === 0;
        
        if (shouldUpdateBoids) {
            this.applyDodgeManeuver(deltaTime);
            this.applyHardSeparation();
            const boidsStrength = this.config.boidsStrength !== undefined ? this.config.boidsStrength : 1.0;
            if (boidsStrength > 0) {
                this.applyBoids(allFish, boidsStrength);
            }
        }
        
        // Apply boundary forces
        this.applyBoundaryForces();
        this.applyTerrainAvoidance();
        
        // Update velocity (using addScaledVector to avoid clone() allocation)
        this.velocity.addScaledVector(this.acceleration, deltaTime);
        
        // VELOCITY DIRECTION STABILITY: Limit how fast the velocity direction can change
        // This prevents "wandering" or "swaying" behavior, especially for large predators
        // maxTurnRate is in radians per second (e.g., 0.5 = ~29 deg/s, 1.0 = ~57 deg/s)
        // FIX: Only apply to fish that explicitly have maxTurnRate configured (large predators)
        // Default is now very high (100 rad/s) to effectively disable for other fish
        // This prevents fish from being unable to turn back at boundaries
        const maxTurnRate = this.config.maxTurnRate !== undefined ? this.config.maxTurnRate : 100.0;
        if (maxTurnRate < 10 && this._lastVelocityDir) {
            const currentSpeed = this.velocity.length();
            if (currentSpeed > 1) {
                // Get current and previous velocity directions (XZ plane only for yaw stability)
                const currDirX = this.velocity.x / currentSpeed;
                const currDirZ = this.velocity.z / currentSpeed;
                const prevDirX = this._lastVelocityDir.x;
                const prevDirZ = this._lastVelocityDir.z;
                
                // Calculate angle between previous and current direction
                const dot = currDirX * prevDirX + currDirZ * prevDirZ;
                const cross = currDirX * prevDirZ - currDirZ * prevDirX; // For sign of angle
                const angleDelta = Math.acos(Math.max(-1, Math.min(1, dot)));
                
                // If turning too fast, limit the turn
                const maxAngleStep = maxTurnRate * deltaTime;
                if (angleDelta > maxAngleStep && angleDelta > 0.001) {
                    // Interpolate direction: rotate previous direction toward current by maxAngleStep
                    const t = maxAngleStep / angleDelta;
                    const sign = cross >= 0 ? 1 : -1;
                    const sinAngle = Math.sin(maxAngleStep) * sign;
                    const cosAngle = Math.cos(maxAngleStep);
                    
                    // Rotate previous direction by maxAngleStep toward current
                    const newDirX = prevDirX * cosAngle - prevDirZ * sinAngle;
                    const newDirZ = prevDirX * sinAngle + prevDirZ * cosAngle;
                    
                    // Apply limited direction while preserving speed and Y velocity
                    this.velocity.x = newDirX * currentSpeed;
                    this.velocity.z = newDirZ * currentSpeed;
                }
            }
        }
        
        // Store current velocity direction for next frame's turn rate limiting
        const speed = this.velocity.length();
        if (speed > 1) {
            if (!this._lastVelocityDir) {
                this._lastVelocityDir = { x: 0, z: 0 };
            }
            this._lastVelocityDir.x = this.velocity.x / speed;
            this._lastVelocityDir.z = this.velocity.z / speed;
        }
        
        // Limit speed based on pattern
        let maxSpeed = this.speed;
        if (this.patternState.phase === 'burst') {
            maxSpeed = this.config.speedMax * 1.5;
        } else if (this.patternState.phase === 'stop') {
            maxSpeed = this.speed * 0.1;
        }
        if (this._dodgeIntensity > 0.01) {
            maxSpeed *= 1.0 + (CONFIG.dodge.speedBoostFactor - 1.0) * this._dodgeIntensity;
        }
        
        const currentSpeedFinal = this.velocity.length();
        if (currentSpeedFinal > maxSpeed) {
            this.velocity.multiplyScalar(maxSpeed / currentSpeedFinal);
        }
        
        // FIX: MINIMUM SPEED ENFORCEMENT for predator fish (sharks, marlin, hammerhead, whale, etc.)
        // This ensures large predators always maintain forward momentum even when other forces
        // (boundary, turn-rate limiter, boids) would slow them down to a stop.
        // Applied AFTER all other velocity modifications to guarantee minimum movement.
        // Note: 'pattern' variable is already declared earlier in this function (line ~9240)
        // FIX: Added 'sShape' pattern (hammerhead) - was missing minimum speed enforcement
        // which caused hammerhead to be almost stationary while other fish moved normally
        // FIX: Added 'cruise' pattern (blueWhale) - Boss whale was stuck in place because
        // cruise pattern only applies weak random acceleration and has low maxTurnRate (0.3)
        // Combined with boundary forces, the whale would slow to a stop with no recovery mechanism
        if ((pattern === 'burstAttack' || pattern === 'burstSprint' || pattern === 'sShape' || pattern === 'cruise') &&
            this.patternState.phase !== 'stop') {
            const minSpeed = this.config.speedMin * 0.4; // 40% of speedMin as absolute minimum
            const currentSpeedAfterClamp = this.velocity.length();
            
            if (currentSpeedAfterClamp < minSpeed) {
                if (currentSpeedAfterClamp > 0.5) {
                    // Scale up velocity in current direction to reach minimum speed
                    this.velocity.multiplyScalar(minSpeed / currentSpeedAfterClamp);
                } else {
                    // Velocity too low to determine direction - use waypoint for sShape
                    // or random direction for other patterns
                    if (pattern === 'sShape' && this.patternState.waypoint) {
                        // Use direction toward waypoint
                        const toWp = this.patternState.waypoint.clone().sub(this.group.position);
                        const dist = toWp.length();
                        if (dist > 1) {
                            toWp.divideScalar(dist);
                            this.velocity.x = toWp.x * minSpeed;
                            this.velocity.z = toWp.z * minSpeed;
                        } else {
                            // At waypoint - pick random direction
                            const angle = Math.random() * Math.PI * 2;
                            this.velocity.x = Math.cos(angle) * minSpeed;
                            this.velocity.z = Math.sin(angle) * minSpeed;
                        }
                    } else {
                        const targetAngle = Math.random() * Math.PI * 2;
                        this.velocity.x = Math.cos(targetAngle) * minSpeed;
                        this.velocity.z = Math.sin(targetAngle) * minSpeed;
                    }
                    // Keep Y velocity for vertical movement
                }
            }
        }
        
        // NaN RECOVERY GUARD: Detect and recover from NaN/Infinity in velocity or position
        // This is a defensive "seatbelt" that prevents fish from freezing due to edge cases
        // in boids, boundary forces, or pattern calculations that produce non-finite values
        const velNaN = !Number.isFinite(this.velocity.x) || !Number.isFinite(this.velocity.y) || !Number.isFinite(this.velocity.z);
        const posNaN = !Number.isFinite(this.group.position.x) || !Number.isFinite(this.group.position.y) || !Number.isFinite(this.group.position.z);
        
        if (velNaN || posNaN) {
            console.warn(`[FISH] NaN detected in ${this.tier}/${this.species || this.form} - vel:${velNaN} pos:${posNaN}, recovering`);
            
            // Reset velocity to random direction at base speed
            const randomAngle = Math.random() * Math.PI * 2;
            this.velocity.set(
                Math.cos(randomAngle) * this.speed,
                (Math.random() - 0.5) * 20,
                Math.sin(randomAngle) * this.speed
            );
            
            // Reset position to center of aquarium if position is NaN
            if (posNaN) {
                this.group.position.set(
                    (Math.random() - 0.5) * CONFIG.aquarium.width * 0.5,
                    CONFIG.aquarium.floorY + CONFIG.aquarium.height * 0.5,
                    (Math.random() - 0.5) * CONFIG.aquarium.depth * 0.5
                );
            }
            
            // Reset acceleration
            this.acceleration.set(0, 0, 0);
            
            // Reset pattern state to prevent stuck patterns
            this.patternState = null;
            
            // Reset animation timeScale
            if (this._animTimeScale !== undefined) {
                this._animTimeScale = 1.0;
            }
            
            // Reset last velocity direction
            this._lastVelocityDir = null;
            
            // Reset stuck timer
            this.stuckTimer = 0;
            
            // Skip position update this frame to let recovery take effect
            return;
        }
        
        // Update position (using addScaledVector to avoid clone() allocation)
        this.group.position.addScaledVector(this.velocity, deltaTime);
        
        // Terrain hard stop: rollback + emergency yaw if fish penetrates terrain
        this.checkTerrainHardStop();
        
        // Update rotation to face movement direction
        this.updateRotation(deltaTime);
        
        // Animate tail
        this.animateTail(deltaTime);
        
        // Update pattern timer
        this.patternState.timer += deltaTime;
        
        // STUCK FISH DETECTION: Check if fish has been stationary for too long
        // This catches fish that get stuck due to errors or state corruption
        const STUCK_THRESHOLD = 5.0; // seconds
        const MOVEMENT_EPSILON = 0.5; // minimum movement per second
        const displacement = this.group.position.distanceTo(this.lastPosition);
        
        if (displacement < MOVEMENT_EPSILON * deltaTime) {
            this.stuckTimer += deltaTime;
            if (this.stuckTimer > STUCK_THRESHOLD) {
                // Fish has been stuck for too long - attempt recovery
                console.warn(`[FISH] Stuck fish detected (${this.tier}/${this.species || this.form}), attempting recovery`);
                
                // Reset velocity with random direction
                const randomAngle = Math.random() * Math.PI * 2;
                this.velocity.set(
                    Math.cos(randomAngle) * this.speed,
                    (Math.random() - 0.5) * 20,
                    Math.sin(randomAngle) * this.speed
                );
                
                // Reset pattern state to prevent stuck patterns
                this.patternState = null;
                
                // Reset stuck timer
                this.stuckTimer = 0;
            }
        } else {
            // Fish is moving - reset stuck timer
            this.stuckTimer = 0;
        }
        
        // Update last position for next frame's stuck detection
        this.lastPosition.copy(this.group.position);
    }
    
    // Apply swimming pattern based on species
    applySwimmingPattern(pattern, deltaTime, allFish) {
        const time = performance.now() * 0.001;
        
        // FPS-INDEPENDENT RANDOM: Convert per-frame probability to time-based
        // probability = 1 - (1 - ratePerSec)^dt ≈ ratePerSec * dt for small dt
        // This ensures consistent behavior regardless of frame rate
        const timeBasedRandom = (ratePerSecond) => Math.random() < ratePerSecond * deltaTime;
        
        switch (pattern) {
            case 'cruise':
                // Continuous slow cruise (whale, sharks, tuna)
                // Maintain steady direction with slight variations
                // FIX: Use time-based probability (~0.5/sec instead of 0.01/frame)
                if (timeBasedRandom(0.5)) {
                    this.acceleration.x += (Math.random() - 0.5) * 20;
                    this.acceleration.z += (Math.random() - 0.5) * 20;
                }
                break;
                
            case 'burstAttack':
            case 'burstSprint':
                // Burst sprint pattern (shark, marlin)
                this.patternState.burstTimer -= deltaTime;
                if (this.patternState.burstTimer <= 0) {
                    if (this.patternState.phase === 'normal') {
                        // Start burst
                        this.patternState.phase = 'burst';
                        this.patternState.burstTimer = 0.5 + Math.random() * 1.0;
                        // Pick random direction for burst - apply in current velocity direction
                        // FIX: Burst accelerates forward, not random sideways
                        const speed = this.velocity.length();
                        if (speed > 1) {
                            this.acceleration.x += (this.velocity.x / speed) * 150;
                            this.acceleration.z += (this.velocity.z / speed) * 150;
                        } else {
                            this.acceleration.x += (Math.random() - 0.5) * 100;
                            this.acceleration.z += (Math.random() - 0.5) * 100;
                        }
                    } else {
                        // End burst, return to normal
                        this.patternState.phase = 'normal';
                        this.patternState.burstTimer = 3 + Math.random() * 5;
                    }
                } else if (this.patternState.phase === 'normal') {
                    // FIX: Add gentle cruising during normal phase to prevent sharks from stopping
                    // This maintains forward momentum between bursts (like cruise pattern)
                    const currentSpeed = this.velocity.length();
                    const minCruiseSpeed = this.config.speedMin * 0.5;
                    
                    if (currentSpeed < minCruiseSpeed) {
                        // Speed too low - apply forward acceleration to maintain minimum cruise
                        if (currentSpeed > 0.1) {
                            // Accelerate in current direction
                            this.acceleration.x += (this.velocity.x / currentSpeed) * 30;
                            this.acceleration.z += (this.velocity.z / currentSpeed) * 30;
                        } else {
                            // No velocity - pick random direction
                            const angle = Math.random() * Math.PI * 2;
                            this.acceleration.x += Math.cos(angle) * 30;
                            this.acceleration.z += Math.sin(angle) * 30;
                        }
                    }
                    // Add slight random variation for natural movement
                    if (timeBasedRandom(0.3)) {
                        this.acceleration.x += (Math.random() - 0.5) * 15;
                        this.acceleration.z += (Math.random() - 0.5) * 15;
                    }
                }
                break;
                
            case 'sShape':
                // COMPLETE REDESIGN: Hammerhead shark swimming pattern
                // Uses velocity-based steering (like burstAttack) instead of angle-based control
                // Creates S-shape path via smooth yaw oscillation, not lateral forces
                
                // Get boundary limits from CONFIG (use fishArena margins for consistency)
                const sShapeAquarium = CONFIG.aquarium;
                const sShapeArena = CONFIG.fishArena;
                const sShapeMinX = -sShapeAquarium.width / 2 + sShapeArena.marginX;
                const sShapeMaxX = sShapeAquarium.width / 2 - sShapeArena.marginX;
                const sShapeMinY = sShapeAquarium.floorY + sShapeArena.marginY;
                const sShapeMaxY = sShapeAquarium.floorY + sShapeAquarium.height - sShapeArena.marginY;
                const sShapeMinZ = -sShapeAquarium.depth / 2 + sShapeArena.marginZ;
                const sShapeMaxZ = sShapeAquarium.depth / 2 - sShapeArena.marginZ;
                
                // Initialize waypoint patrol state
                if (!this.patternState.waypoint) {
                    this.patternState.waypoint = new THREE.Vector3(
                        sShapeMinX + Math.random() * (sShapeMaxX - sShapeMinX),
                        sShapeMinY + Math.random() * (sShapeMaxY - sShapeMinY),
                        sShapeMinZ + Math.random() * (sShapeMaxZ - sShapeMinZ)
                    );
                    this.patternState.yawOscillation = 0;
                    this.patternState.cruiseSpeed = (this.config.speedMin + this.config.speedMax) * 0.6;
                }
                
                // Update yaw oscillation phase for S-shape path
                this.patternState.yawOscillation += deltaTime * 0.8; // Slow oscillation frequency
                
                // Calculate direction to waypoint (reuse temp vector to avoid GC)
                const toWaypointVec = fishTempVectors.boundaryForce; // Reuse existing temp vector
                toWaypointVec.subVectors(this.patternState.waypoint, this.group.position);
                let sShapeDist = toWaypointVec.length();
                
                // Pick new waypoint when close enough
                if (sShapeDist < 200) {
                    this.patternState.waypoint.set(
                        sShapeMinX + Math.random() * (sShapeMaxX - sShapeMinX),
                        sShapeMinY + Math.random() * (sShapeMaxY - sShapeMinY),
                        sShapeMinZ + Math.random() * (sShapeMaxZ - sShapeMinZ)
                    );
                    toWaypointVec.subVectors(this.patternState.waypoint, this.group.position);
                    sShapeDist = toWaypointVec.length(); // FIX: Recalculate distance after new waypoint
                }
                
                // Normalize direction to waypoint
                if (sShapeDist > 0.1) {
                    toWaypointVec.divideScalar(sShapeDist);
                }
                
                // Add yaw oscillation for S-shape path (rotate direction vector around Y axis)
                const sShapeYawOffset = Math.sin(this.patternState.yawOscillation) * 0.4; // ~23 degrees max
                const sShapeCosYaw = Math.cos(sShapeYawOffset);
                const sShapeSinYaw = Math.sin(sShapeYawOffset);
                const sShapeOscX = toWaypointVec.x * sShapeCosYaw - toWaypointVec.z * sShapeSinYaw;
                const sShapeOscZ = toWaypointVec.x * sShapeSinYaw + toWaypointVec.z * sShapeCosYaw;
                
                // Compute desired velocity at cruise speed
                const sShapeDesVelX = sShapeOscX * this.patternState.cruiseSpeed;
                const sShapeDesVelY = toWaypointVec.y * this.patternState.cruiseSpeed * 0.3; // Reduced vertical
                const sShapeDesVelZ = sShapeOscZ * this.patternState.cruiseSpeed;
                
                // Proportional steering: accel = (desiredVel - currentVel) * steerGain
                const sShapeSteerGain = 2.5;
                this.acceleration.x += (sShapeDesVelX - this.velocity.x) * sShapeSteerGain;
                this.acceleration.y += (sShapeDesVelY - this.velocity.y) * sShapeSteerGain;
                this.acceleration.z += (sShapeDesVelZ - this.velocity.z) * sShapeSteerGain;
                
                // SAFETY NET: Hard clamp position to prevent escaping boundaries
                // This catches edge cases where steering + boundary forces aren't enough
                const sShapePos = this.group.position;
                const sShapeHardMargin = 50; // Extra margin beyond fishArena for hard clamp
                const sShapeHardMinX = -sShapeAquarium.width / 2 + sShapeHardMargin;
                const sShapeHardMaxX = sShapeAquarium.width / 2 - sShapeHardMargin;
                const sShapeHardMinY = sShapeAquarium.floorY + sShapeHardMargin;
                const sShapeHardMaxY = sShapeAquarium.floorY + sShapeAquarium.height - sShapeHardMargin;
                const sShapeHardMinZ = -sShapeAquarium.depth / 2 + sShapeHardMargin;
                const sShapeHardMaxZ = sShapeAquarium.depth / 2 - sShapeHardMargin;
                
                if (sShapePos.x < sShapeHardMinX) {
                    sShapePos.x = sShapeHardMinX;
                    if (this.velocity.x < 0) this.velocity.x *= -0.3;
                } else if (sShapePos.x > sShapeHardMaxX) {
                    sShapePos.x = sShapeHardMaxX;
                    if (this.velocity.x > 0) this.velocity.x *= -0.3;
                }
                if (sShapePos.y < sShapeHardMinY) {
                    sShapePos.y = sShapeHardMinY;
                    if (this.velocity.y < 0) this.velocity.y *= -0.3;
                } else if (sShapePos.y > sShapeHardMaxY) {
                    sShapePos.y = sShapeHardMaxY;
                    if (this.velocity.y > 0) this.velocity.y *= -0.3;
                }
                if (sShapePos.z < sShapeHardMinZ) {
                    sShapePos.z = sShapeHardMinZ;
                    if (this.velocity.z < 0) this.velocity.z *= -0.3;
                } else if (sShapePos.z > sShapeHardMaxZ) {
                    sShapePos.z = sShapeHardMaxZ;
                    if (this.velocity.z > 0) this.velocity.z *= -0.3;
                }
                break;
                
            case 'synchronizedFast':
                // Fast synchronized swimming (tuna)
                // Strong alignment with nearby fish
                this.acceleration.x += Math.sin(time * 3) * 10;
                break;
                
            case 'irregularTurns':
                // Fast irregular paths with sudden turns (mahi-mahi)
                // FIX: Use time-based probability (~1.2/sec for erratic fish)
                if (timeBasedRandom(1.2)) {
                    this.acceleration.x += (Math.random() - 0.5) * 150;
                    this.acceleration.z += (Math.random() - 0.5) * 150;
                }
                break;
                
            case 'ambush':
                // Slow cruise + explosive strike
                // Ambush predators cruise slowly while scanning, then strike at prey
                // Initialize ambush state if needed
                if (!this.patternState.ambushPhase) {
                    this.patternState.ambushPhase = 'cruise';
                    this.patternState.burstTimer = 3 + Math.random() * 5;
                    this.patternState.cruiseDirection = Math.random() * Math.PI * 2;
                }
                
                this.patternState.burstTimer -= deltaTime;
                
                if (this.patternState.ambushPhase === 'cruise') {
                    // Slow, deliberate cruising - NOT stationary
                    const currentSpeed = this.velocity.length();
                    const cruiseSpeed = this.config.speedMin * 1.5; // Slow but moving
                    
                    if (currentSpeed < cruiseSpeed) {
                        // Maintain slow forward movement
                        this.acceleration.x += Math.cos(this.patternState.cruiseDirection) * 20;
                        this.acceleration.z += Math.sin(this.patternState.cruiseDirection) * 20;
                    } else if (currentSpeed > cruiseSpeed * 2) {
                        // Slow down if too fast (after burst)
                        this.velocity.multiplyScalar(0.98);
                    }
                    
                    // Occasional slight direction adjustment while cruising
                    if (timeBasedRandom(0.3)) {
                        this.patternState.cruiseDirection += (Math.random() - 0.5) * 0.5;
                    }
                    
                    // Trigger strike
                    if (this.patternState.burstTimer <= 0) {
                        this.patternState.ambushPhase = 'strike';
                        this.patternState.burstTimer = 0.4 + Math.random() * 0.4;
                        // Explosive forward strike in current direction
                        const strikeAngle = this.patternState.cruiseDirection + (Math.random() - 0.5) * 0.8;
                        this.acceleration.x += Math.cos(strikeAngle) * 350;
                        this.acceleration.z += Math.sin(strikeAngle) * 350;
                    }
                } else if (this.patternState.ambushPhase === 'strike') {
                    // During strike - maintain high speed
                    if (this.patternState.burstTimer <= 0) {
                        this.patternState.ambushPhase = 'recover';
                        this.patternState.burstTimer = 1 + Math.random() * 1.5;
                    }
                } else if (this.patternState.ambushPhase === 'recover') {
                    // Slow down after strike, prepare for next cruise
                    this.velocity.multiplyScalar(0.96);
                    
                    if (this.patternState.burstTimer <= 0) {
                        this.patternState.ambushPhase = 'cruise';
                        this.patternState.burstTimer = 4 + Math.random() * 6;
                        // Pick new cruise direction
                        this.patternState.cruiseDirection = Math.random() * Math.PI * 2;
                    }
                }
                break;
                
            case 'bottomBurst':
                // Slow bottom movement + short bursts (grouper)
                this.acceleration.y -= 5; // Tendency to stay low
                // FIX: Use time-based probability (~0.3/sec)
                if (timeBasedRandom(0.3)) {
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
                // FIX: Use time-based probability (~1.8/sec for small darting fish)
                if (timeBasedRandom(1.8)) {
                    this.acceleration.x += (Math.random() - 0.5) * 80;
                    this.acceleration.z += (Math.random() - 0.5) * 80;
                }
                break;
                
            case 'defensiveCharge':
                // Quick up-down defensive charges (damselfish)
                // FIX: Use time-based probability (~1.2/sec)
                if (timeBasedRandom(1.2)) {
                    this.acceleration.y += (Math.random() - 0.5) * 100;
                }
                this.acceleration.x += Math.sin(time * 3) * 10;
                break;
                
            case 'wingGlide':
                // Wing flapping gliding flight (manta ray)
                // Smooth gliding with gentle up-down motion
                this.acceleration.y += Math.sin(time * 0.8 + this.patternState.waveOffset) * 8;
                // Gentle banking turns
                // FIX: Use time-based probability (~0.3/sec for gentle manta)
                if (timeBasedRandom(0.3)) {
                    this.acceleration.x += (Math.random() - 0.5) * 30;
                }
                break;
                
            case 'slowRotation':
                // Fin-propulsion slow rotation (pufferfish)
                this.velocity.multiplyScalar(0.98); // Very slow
                // Gentle rotation
                this.group.rotation.y += deltaTime * 0.2;
                // FIX: Use time-based probability (~0.5/sec)
                if (timeBasedRandom(0.5)) {
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
        
        // Use spatial hash to only check nearby fish (O(n*k) instead of O(n²))
        const nearbyFish = getNearbyFish(this);
        
        for (let i = 0; i < nearbyFish.length; i++) {
            const other = nearbyFish[i];
            if (other === this || !other.isActive) continue;
            const sameTier = other.tier === this.tier;
            
            const otherPos = other.group.position;
            const dx = myPos.x - otherPos.x;
            const dy = myPos.y - otherPos.y;
            const dz = myPos.z - otherPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            
            if (distSq < sepDistSq && distSq > 0) {
                const invDist = 1 / Math.sqrt(distSq);
                const w = sameTier ? 1.0 : 0.6;
                sepX += dx * invDist * w;
                sepY += dy * invDist * w;
                sepZ += dz * invDist * w;
                sepCount++;
            }
            
            if (sameTier && distSq < cohDistSq) {
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
        
        // LEADER-FOLLOWER ENHANCEMENT for tight schooling fish (boidsStrength >= 2.5)
        // Followers steer toward an offset position relative to the leader
        // This creates more cohesive school movement than pure boids alone
        if (strength >= 2.5 && !this.isSchoolLeader) {
            const leader = getSchoolLeader(this.tier, allFish);
            if (leader && leader !== this) {
                // Calculate offset position behind and to the side of leader
                // Use fish's noise seed to determine unique offset position in school
                const offsetAngle = (this.behaviorState?.noiseSeed || Math.random() * 1000) % (Math.PI * 2);
                const offsetDist = 30 + (this.behaviorState?.noiseSeed || 0) % 40; // 30-70 units
                
                // Target position is offset from leader's position
                const leaderPos = leader.group.position;
                const leaderVel = leader.velocity;
                const leaderSpeed = leaderVel.length();
                
                // Calculate offset perpendicular to leader's heading
                let perpX = -leaderVel.z;
                let perpZ = leaderVel.x;
                if (leaderSpeed > 1) {
                    perpX /= leaderSpeed;
                    perpZ /= leaderSpeed;
                }
                
                // Target position: behind leader + perpendicular offset
                const behindDist = 20 + offsetDist * 0.3;
                const targetX = leaderPos.x - (leaderVel.x / Math.max(1, leaderSpeed)) * behindDist 
                              + perpX * Math.sin(offsetAngle) * offsetDist;
                const targetY = leaderPos.y + Math.cos(offsetAngle) * offsetDist * 0.3;
                const targetZ = leaderPos.z - (leaderVel.z / Math.max(1, leaderSpeed)) * behindDist 
                              + perpZ * Math.cos(offsetAngle) * offsetDist;
                
                // Steer toward target position with spring-like force
                const toTargetX = targetX - myPos.x;
                const toTargetY = targetY - myPos.y;
                const toTargetZ = targetZ - myPos.z;
                
                const leaderFollowStrength = 0.5; // Gentle following
                this.acceleration.x += toTargetX * leaderFollowStrength;
                this.acceleration.y += toTargetY * leaderFollowStrength * 0.5; // Less vertical following
                this.acceleration.z += toTargetZ * leaderFollowStrength;
            }
        }
    }
    
    applyHardSeparation() {
        const myPos = this.group.position;
        const hs = CONFIG.hardSeparation;
        const myHE = this.ellipsoidHalfExtents;
        const margin = hs.ellipsoidMargin;
        const myYaw = this._currentYaw || 0;
        const myCosYaw = Math.cos(myYaw);
        const mySinYaw = Math.sin(myYaw);

        const nearbyFish = getNearbyFish(this);
        let pushX = 0, pushY = 0, pushZ = 0;
        let steerYaw = 0;

        for (let i = 0; i < nearbyFish.length; i++) {
            const other = nearbyFish[i];
            if (other === this || !other.isActive) continue;

            const otherHE = other.ellipsoidHalfExtents;
            const otherPos = other.group.position;

            let dx = myPos.x - otherPos.x;
            let dy = myPos.y - otherPos.y;
            let dz = myPos.z - otherPos.z;

            if (hs.predictTime > 0) {
                dx += (this.velocity.x - other.velocity.x) * hs.predictTime;
                dy += (this.velocity.y - other.velocity.y) * hs.predictTime;
                dz += (this.velocity.z - other.velocity.z) * hs.predictTime;
            }

            const safeX = (myHE.x + otherHE.x) * margin;
            const safeY = (myHE.y + otherHE.y) * margin;
            const safeZ = (myHE.z + otherHE.z) * margin;

            const nx = safeX > 0.01 ? dx / safeX : 0;
            const ny = safeY > 0.01 ? dy / safeY : 0;
            const nz = safeZ > 0.01 ? dz / safeZ : 0;
            const ellipDistSq = nx * nx + ny * ny + nz * nz;

            if (ellipDistSq < 1.0 && ellipDistSq > 0.0001) {
                const ellipDist = Math.sqrt(ellipDistSq);
                const overlap = 1.0 - ellipDist;
                const isLarge = (this.config.size || 20) >= hs.largeFishSizeThreshold ||
                                (other.config.size || 20) >= hs.largeFishSizeThreshold;
                const pushStr = isLarge ? hs.largeFishPushStrength : hs.pushStrength;
                const force = overlap * overlap * pushStr;

                const invED = 1.0 / ellipDist;
                pushX += nx * invED * force * safeX;
                pushY += ny * invED * force * safeY;
                pushZ += nz * invED * force * safeZ;

                const localDx = dx * myCosYaw - dz * mySinYaw;
                const localDz = dx * mySinYaw + dz * myCosYaw;
                const cross = localDz;
                steerYaw += (cross > 0 ? 1 : -1) * overlap * hs.yawSteerStrength;
            }
        }

        const pushLen = Math.sqrt(pushX * pushX + pushY * pushY + pushZ * pushZ);
        if (pushLen > hs.maxPushAccel) {
            const scale = hs.maxPushAccel / pushLen;
            pushX *= scale;
            pushY *= scale;
            pushZ *= scale;
        }

        this.acceleration.x += pushX;
        this.acceleration.y += pushY * 0.6;
        this.acceleration.z += pushZ;

        if (Math.abs(steerYaw) > 0.01) {
            const clampedSteer = Math.max(-2.0, Math.min(2.0, steerYaw));
            const steerForceX = -Math.sin(myYaw + clampedSteer * 0.3) * 40;
            const steerForceZ = Math.cos(myYaw + clampedSteer * 0.3) * 40;
            this.acceleration.x += steerForceX;
            this.acceleration.z += steerForceZ;
        }
    }

    applyDodgeManeuver(deltaTime) {
        const myPos = this.group.position;
        const mySize = this.config.size || 20;
        const myVel = this.velocity;
        const nearbyFish = getNearbyFish(this);
        const detectFactor = CONFIG.dodge.detectSizeFactor;
        const lateralStr = CONFIG.dodge.lateralStrength;
        
        if (!this._dodgeIntensity) this._dodgeIntensity = 0;
        if (!this._dodgeLateralX) this._dodgeLateralX = 0;
        if (!this._dodgeLateralZ) this._dodgeLateralZ = 0;
        
        let closestOverlap = 0;
        let bestLateralX = 0;
        let bestLateralZ = 0;
        
        const mySpeed = Math.sqrt(myVel.x * myVel.x + myVel.z * myVel.z);
        let fwdX = 0, fwdZ = 1;
        if (mySpeed > 1) {
            fwdX = myVel.x / mySpeed;
            fwdZ = myVel.z / mySpeed;
        }
        
        for (let i = 0; i < nearbyFish.length; i++) {
            const other = nearbyFish[i];
            if (other === this || !other.isActive) continue;
            
            const otherPos = other.group.position;
            const otherSize = other.config.size || 20;
            const detectDist = (mySize + otherSize) * detectFactor;
            
            const dx = myPos.x - otherPos.x;
            const dy = myPos.y - otherPos.y;
            const dz = myPos.z - otherPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const detectDistSq = detectDist * detectDist;
            
            if (distSq < detectDistSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const overlap = 1.0 - dist / detectDist;
                
                if (overlap > closestOverlap) {
                    closestOverlap = overlap;
                    const perpX = -fwdZ;
                    const perpZ = fwdX;
                    const side = dx * perpX + dz * perpZ;
                    const sign = side >= 0 ? 1 : -1;
                    bestLateralX = perpX * sign;
                    bestLateralZ = perpZ * sign;
                }
            }
        }
        
        if (closestOverlap > 0.01) {
            const targetIntensity = Math.min(closestOverlap * 2, 1.0);
            this._dodgeIntensity = Math.min(this._dodgeIntensity + CONFIG.dodge.rampUpRate * deltaTime, targetIntensity);
            this._dodgeLateralX = bestLateralX;
            this._dodgeLateralZ = bestLateralZ;
        } else {
            this._dodgeIntensity = Math.max(0, this._dodgeIntensity - CONFIG.dodge.decayRate * deltaTime);
        }
        
        if (this._dodgeIntensity > 0.001) {
            const smooth = this._dodgeIntensity * this._dodgeIntensity * (3 - 2 * this._dodgeIntensity);
            this.acceleration.x += this._dodgeLateralX * lateralStr * smooth;
            this.acceleration.z += this._dodgeLateralZ * lateralStr * smooth;
            if (mySpeed > 1) {
                this.acceleration.x += fwdX * lateralStr * 0.5 * smooth;
                this.acceleration.z += fwdZ * lateralStr * 0.5 * smooth;
            }
        }
    }
    
    applyBoundaryForces() {
        // IMPROVED BOUNDARY AVOIDANCE with predictive look-ahead
        // Instead of only reacting when already at boundary, look ahead 1-2 seconds
        // and start turning early for smoother, more natural avoidance
        
        const { width, height, depth, floorY } = CONFIG.aquarium;
        const { marginX, marginY, marginZ } = CONFIG.fishArena;
        const pos = this.group.position;
        const vel = this.velocity;
        
        // Use pre-allocated vector to avoid new Vector3() allocation
        const force = fishTempVectors.boundaryForce;
        force.set(0, 0, 0);
        
        // Calculate bounds inside the tank with margins
        const minX = -width / 2 + marginX;
        const maxX = width / 2 - marginX;
        const minY = floorY + marginY;
        const maxY = floorY + height - marginY;
        const minZ = -depth / 2 + marginZ;
        const maxZ = depth / 2 - marginZ;
        
        // PREDICTIVE AVOIDANCE: Look ahead 1.5 seconds
        const lookAheadTime = 1.5;
        const predictedX = pos.x + vel.x * lookAheadTime;
        const predictedY = pos.y + vel.y * lookAheadTime;
        const predictedZ = pos.z + vel.z * lookAheadTime;
        
        // Smoothstep function for gradual force increase
        const boundarySmooth = (dist, margin) => {
            const t = Math.max(0, Math.min(1, dist / margin));
            return t * t * (3 - 2 * t); // smoothstep
        };
        
        // X boundaries - combine reactive and predictive forces
        // Reactive: immediate force when near boundary
        if (pos.x < minX) {
            const t = (minX - pos.x) / marginX;
            force.x += t * 4.0;
        } else if (pos.x > maxX) {
            const t = (pos.x - maxX) / marginX;
            force.x -= t * 4.0;
        }
        // Predictive: gentler force when heading toward boundary
        if (predictedX < minX && vel.x < 0) {
            const urgency = boundarySmooth(minX - predictedX, marginX);
            force.x += urgency * 2.0;
        } else if (predictedX > maxX && vel.x > 0) {
            const urgency = boundarySmooth(predictedX - maxX, marginX);
            force.x -= urgency * 2.0;
        }
        
        // Y boundaries - combine reactive and predictive forces
        if (pos.y < minY) {
            const t = (minY - pos.y) / marginY;
            force.y += t * 4.0;
        } else if (pos.y > maxY) {
            const t = (pos.y - maxY) / marginY;
            force.y -= t * 4.0;
        }
        // Predictive Y
        if (predictedY < minY && vel.y < 0) {
            const urgency = boundarySmooth(minY - predictedY, marginY);
            force.y += urgency * 2.0;
        } else if (predictedY > maxY && vel.y > 0) {
            const urgency = boundarySmooth(predictedY - maxY, marginY);
            force.y -= urgency * 2.0;
        }
        
        // Z boundaries - combine reactive and predictive forces
        if (pos.z < minZ) {
            const t = (minZ - pos.z) / marginZ;
            force.z += t * 4.0;
        } else if (pos.z > maxZ) {
            const t = (pos.z - maxZ) / marginZ;
            force.z -= t * 4.0;
        }
        // Predictive Z
        if (predictedZ < minZ && vel.z < 0) {
            const urgency = boundarySmooth(minZ - predictedZ, marginZ);
            force.z += urgency * 2.0;
        } else if (predictedZ > maxZ && vel.z > 0) {
            const urgency = boundarySmooth(predictedZ - maxZ, marginZ);
            force.z -= urgency * 2.0;
        }
        
        this.acceleration.addScaledVector(force, 60);
    }
    
    applyTerrainAvoidance() {
        if (terrainObstacles.length === 0) return;
        const cfg = CONFIG.terrainAvoidance;
        const pos = this.group.position;
        const vel = this.velocity;
        const fishRadius = this.boundingRadius || 20;
        const margin = cfg.avoidMargin + fishRadius;
        const laTime = cfg.lookAheadTime;
        const predX = pos.x + vel.x * laTime;
        const predY = pos.y + vel.y * laTime;
        const predZ = pos.z + vel.z * laTime;
        let fx = 0, fy = 0, fz = 0;

        for (let i = 0; i < terrainObstacles.length; i++) {
            const ob = terrainObstacles[i];
            const shell = ob.radius + margin;
            const shellSq = shell * shell;

            let dx = pos.x - ob.x;
            let dy = pos.y - ob.y;
            let dz = pos.z - ob.z;
            let distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < shellSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const penetration = shell - dist;
                const t = Math.min(penetration / margin, 1.0);
                const strength = t * t * cfg.avoidStrength;
                const invDist = 1 / dist;
                fx += dx * invDist * strength;
                fy += dy * invDist * strength;
                fz += dz * invDist * strength;
            }

            dx = predX - ob.x;
            dy = predY - ob.y;
            dz = predZ - ob.z;
            distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < shellSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const penetration = shell - dist;
                const t = Math.min(penetration / margin, 1.0);
                const strength = t * t * cfg.predictiveStrength;
                const invDist = 1 / dist;
                fx += dx * invDist * strength;
                fy += dy * invDist * strength;
                fz += dz * invDist * strength;
            }
        }

        this.acceleration.x += fx;
        this.acceleration.y += fy;
        this.acceleration.z += fz;
    }

    checkTerrainHardStop() {
        if (!CONFIG.terrainHardStop.enabled || terrainObstacles.length === 0) return;
        const pos = this.group.position;
        const fishRadius = this.boundingRadius || 20;
        const threshold = CONFIG.terrainHardStop.penetrationThreshold;

        for (let i = 0; i < terrainObstacles.length; i++) {
            const ob = terrainObstacles[i];
            const safeRadius = ob.radius + fishRadius * threshold;
            const dx = pos.x - ob.x;
            const dy = pos.y - ob.y;
            const dz = pos.z - ob.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < safeRadius * safeRadius && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                if (dist < safeRadius) {
                    if (this._lastValidPosition) {
                        const damping = CONFIG.terrainHardStop.rollbackDamping;
                        pos.lerp(this._lastValidPosition, damping);
                    }

                    const invDist = 1 / dist;
                    const pushOut = (safeRadius - dist) * 0.5;
                    pos.x += dx * invDist * pushOut;
                    pos.y += dy * invDist * pushOut;
                    pos.z += dz * invDist * pushOut;

                    const yawRange = CONFIG.terrainHardStop.emergencyYawRange;
                    const emergencyYaw = (Math.random() - 0.5) * yawRange;
                    const speed = this.velocity.length();
                    if (speed > 1) {
                        const currentYaw = Math.atan2(this.velocity.x, this.velocity.z);
                        const newYaw = currentYaw + emergencyYaw;
                        this.velocity.x = Math.sin(newYaw) * speed;
                        this.velocity.z = Math.cos(newYaw) * speed;
                        this.velocity.y *= 0.3;
                    }
                    return;
                }
            }
        }

        if (!this._lastValidPosition) {
            this._lastValidPosition = new THREE.Vector3();
        }
        this._lastValidPosition.copy(pos);
    }
    
    updateRotation(deltaTime) {
        // FIX: Use frame-to-frame displacement instead of velocity for yaw calculation
        // This ensures the fish faces the direction it's actually moving, not where velocity points
        // Important because boundary clamping and other position edits can cause velocity != displacement
        //
        // SMOOTHING: Use time-based damping to avoid jitter from frame-to-frame noise
        // The target yaw is computed from displacement, then smoothly approached
        
        // Initialize rotation tracking state if not set
        if (!this._lastRotationPos) {
            this._lastRotationPos = this.group.position.clone();
            this._currentYaw = 0;      // Current smoothed yaw (what we display)
            this._targetYaw = 0;       // Target yaw from displacement
            this._currentPitch = 0;    // Current smoothed pitch
        }
        
        // Smoothing parameters (time-based for FPS independence)
        const YAW_SMOOTHING_K = 8;           // Higher = faster response (~125ms time constant)
        const PITCH_SMOOTHING_K = 10;        // Pitch can be slightly faster
        const MAX_YAW_RATE = 4;              // Max radians per second (~230 deg/s)
        const MIN_DISPLACEMENT = 0.15;       // Minimum XZ displacement to update target yaw
        
        // Calculate actual displacement this frame
        const dispX = this.group.position.x - this._lastRotationPos.x;
        const dispY = this.group.position.y - this._lastRotationPos.y;
        const dispZ = this.group.position.z - this._lastRotationPos.z;
        const dispMag = Math.sqrt(dispX * dispX + dispZ * dispZ); // XZ plane displacement
        
        // Update rotation tracking position
        this._lastRotationPos.copy(this.group.position);
        
        // Compute target yaw from displacement (only if significant movement)
        if (dispMag > MIN_DISPLACEMENT) {
            const dirX = dispX / dispMag;
            const dirZ = dispZ / dispMag;
            this._targetYaw = Math.atan2(-dirZ, dirX);
            
            // Compute target pitch from vertical displacement
            const totalDisp = Math.sqrt(dispX * dispX + dispY * dispY + dispZ * dispZ);
            const dirY = totalDisp > 0.01 ? dispY / totalDisp : 0;
            const rawPitch = Math.asin(Math.max(-1, Math.min(1, dirY)));
            const maxPitch = Math.PI / 18; // 10 degrees - very limited pitch for natural look
            this._targetPitch = Math.max(-maxPitch, Math.min(maxPitch, rawPitch));
        }
        // If displacement is small, keep the current target (don't update)
        
        // Smooth yaw: compute shortest-angle delta to handle -π to +π wrap-around
        // delta = ((target - current + π) mod 2π) - π
        let yawDelta = this._targetYaw - this._currentYaw;
        // Normalize to [-π, π] range
        while (yawDelta > Math.PI) yawDelta -= 2 * Math.PI;
        while (yawDelta < -Math.PI) yawDelta += 2 * Math.PI;
        
        // Apply time-based smoothing with max rate cap
        const yawAlpha = 1 - Math.exp(-YAW_SMOOTHING_K * deltaTime);
        const maxYawStep = MAX_YAW_RATE * deltaTime;
        const yawStep = Math.max(-maxYawStep, Math.min(maxYawStep, yawDelta * yawAlpha));
        this._currentYaw += yawStep;
        
        // Normalize current yaw to [-π, π]
        while (this._currentYaw > Math.PI) this._currentYaw -= 2 * Math.PI;
        while (this._currentYaw < -Math.PI) this._currentYaw += 2 * Math.PI;
        
        // Smooth pitch (simpler, no wrap-around needed)
        const pitchAlpha = 1 - Math.exp(-PITCH_SMOOTHING_K * deltaTime);
        const pitchDelta = (this._targetPitch || 0) - this._currentPitch;
        this._currentPitch += pitchDelta * pitchAlpha;
        
        // Apply smoothed rotation
        this.group.rotation.set(0, this._currentYaw, 0);
        
        // Apply pitch to appropriate wrapper
        const pitch = this._currentPitch;
        if (this.glbPitchWrapper) {
            this.glbPitchWrapper.rotation.set(0, 0, pitch);
        } else if (this.mantaPitchWrapper) {
            this.mantaPitchWrapper.rotation.set(0, 0, pitch);
        } else if (this.glbCorrectionWrapper || this.glbAxisWrapper) {
            const wrapper = this.glbCorrectionWrapper || this.glbAxisWrapper;
            if (!this._originalCorrectionQuat) {
                this._originalCorrectionQuat = wrapper.quaternion.clone();
            }
            const pitchQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, pitch));
            wrapper.quaternion.copy(this._originalCorrectionQuat).multiply(pitchQuat);
        } else {
            this.group.rotation.z = -pitch;
        }
    }
    
    animateTail(deltaTime) {
        // Only animate tail if the fish has one (some special fish forms don't have tails)
        if (!this.tail) return;
        
        // PERFORMANCE: Skip tail animation for low LOD fish (distant fish)
        // This saves significant CPU time with 180-200 fish
        if (this.currentLodLevel === 2 || this.currentLodLevel === 3) return;
        
        const time = performance.now() * 0.01;
        this.tail.rotation.y = Math.sin(time + this.group.position.x) * 0.3;
    }
    
    flashHit() {
        if (this._flashTimer) clearTimeout(this._flashTimer);
        const isBoss = !!this.isBoss;
        const _hitTintColor = new THREE.Color(1.0, 0.3, 0.3);
        const _peakTint = 0.70;
        const _emissiveBoost = 0.15;
        const _emissiveDur = 50;
        const _tintDecayDur = 200;
        const _scalePulse = isBoss ? 1.03 : 1.05;
        const _scaleDur = 100;
        const _jitterAmp = 0.1;
        const _jitterDur = 100;
        const flashStart = performance.now();
        const selfRef = this;

        if (!this.group) return;
        if (!this._origGroupScale) {
            this._origGroupScale = this.group.scale.clone();
        }
        const origScale = this._origGroupScale;
        this.group.scale.set(
            origScale.x * _scalePulse,
            origScale.y * _scalePulse,
            origScale.z * _scalePulse
        );

        const _applyTint = (meshOrChild, factor) => {
            if (!meshOrChild.material || !meshOrChild.material.color) return;
            if (!meshOrChild._origColor) {
                meshOrChild._origColor = meshOrChild.material.color.clone();
            }
            const c = meshOrChild._origColor.clone().lerp(_hitTintColor, factor);
            meshOrChild.material.color.copy(c);
        };
        const _restoreColor = (meshOrChild) => {
            if (meshOrChild.material && meshOrChild._origColor) {
                meshOrChild.material.color.copy(meshOrChild._origColor);
            }
        };

        const _traverseMeshes = (fn) => {
            if (isBoss) {
                selfRef.group.traverse(child => { if (child.isMesh) fn(child); });
            } else if (selfRef.glbLoaded && selfRef.glbMeshes) {
                selfRef.glbMeshes.forEach(fn);
            } else if (selfRef.body) {
                fn(selfRef.body);
            }
        };

        _traverseMeshes(m => {
            _applyTint(m, _peakTint);
            if (m.material && m.material.emissiveIntensity !== undefined) {
                if (!m._origEmissive) m._origEmissive = m.material.emissiveIntensity;
                m.material.emissiveIntensity = m._origEmissive + _emissiveBoost;
            }
        });

        if (isBoss && bossGlowEffect && bossGlowEffect.material) {
            bossGlowEffect._savedOpacity = bossGlowEffect.material.opacity;
            bossGlowEffect.material.opacity = 0.1;
        }

        function _impactJuiceFade(t) {
            const elapsed = t - flashStart;
            if (!selfRef.isActive || !selfRef.group) {
                _finalRestore();
                return;
            }

            if (elapsed < _scaleDur) {
                const sp = elapsed / _scaleDur;
                const easedScale = 1.0 + (_scalePulse - 1.0) * (1.0 - sp * sp);
                selfRef.group.scale.set(
                    origScale.x * easedScale,
                    origScale.y * easedScale,
                    origScale.z * easedScale
                );
            } else if (selfRef.group.scale.x !== origScale.x) {
                selfRef.group.scale.copy(origScale);
            }

            if (elapsed < _jitterDur) {
                const jx = (Math.random() - 0.5) * 2 * _jitterAmp;
                const jy = (Math.random() - 0.5) * 2 * _jitterAmp;
                const jz = (Math.random() - 0.5) * 2 * _jitterAmp;
                if (!selfRef._origGroupPos) selfRef._origGroupPos = selfRef.group.position.clone();
                selfRef.group.position.set(
                    selfRef._origGroupPos.x + jx,
                    selfRef._origGroupPos.y + jy,
                    selfRef._origGroupPos.z + jz
                );
            } else if (selfRef._origGroupPos) {
                selfRef.group.position.copy(selfRef._origGroupPos);
                selfRef._origGroupPos = null;
            }

            if (elapsed >= _emissiveDur) {
                _traverseMeshes(m => {
                    if (m.material && m._origEmissive !== undefined) {
                        m.material.emissiveIntensity = m._origEmissive;
                        m._origEmissive = undefined;
                    }
                });
            }

            const tintP = Math.min(elapsed / _tintDecayDur, 1);
            const tintFactor = _peakTint * Math.pow(1 - tintP, 3);
            _traverseMeshes(m => {
                if (tintP >= 1) _restoreColor(m);
                else _applyTint(m, tintFactor);
            });

            if (tintP < 1 || elapsed < _scaleDur || elapsed < _jitterDur) {
                requestAnimationFrame(_impactJuiceFade);
            } else {
                _finalRestore();
            }
        }

        function _finalRestore() {
            if (selfRef.group && selfRef._origGroupScale) {
                selfRef.group.scale.copy(selfRef._origGroupScale);
            }
            if (selfRef.group && selfRef._origGroupPos) {
                selfRef.group.position.copy(selfRef._origGroupPos);
                selfRef._origGroupPos = null;
            }
            _traverseMeshes(m => {
                _restoreColor(m);
                if (m.material && m._origEmissive !== undefined) {
                    m.material.emissiveIntensity = m._origEmissive;
                    m._origEmissive = undefined;
                }
            });
            if (isBoss && bossGlowEffect && bossGlowEffect.material && bossGlowEffect._savedOpacity !== undefined) {
                bossGlowEffect.material.opacity = bossGlowEffect._savedOpacity;
            }
        }

        requestAnimationFrame(_impactJuiceFade);
    }
    
    takeDamage(damage, weaponKey, spreadIndex) {
        if (!this.isActive) return false;
        
        // Phase 2: Shield Turtle - check if fish has shield
        if (this.config.ability === 'shield' && this.shieldHP > 0) {
            this.shieldHP -= damage;
            if (this.shieldBubble) {
                this.shieldBubble.material.emissiveIntensity = 1.0;
                setTimeout(() => {
                    if (this.shieldBubble) {
                        this.shieldBubble.material.emissiveIntensity = 0.3;
                    }
                }, 100);
                const shieldPercent = Math.max(0, this.shieldHP / this.config.shieldHP);
                this.shieldBubble.material.opacity = 0.3 * shieldPercent;
                if (this.shieldHP <= 0) {
                    this.shieldBubble.visible = false;
                    playImpactSound('shieldBreak');
                    triggerScreenFlash(0x00ffff, 0.2);
                }
            }
            return false;
        }
        
        // HP is visual only - track for visual feedback but does NOT determine death
        this.hp -= damage;
        
        const fishPos = this.group ? this.group.position : null;
        showHitMarker(spreadIndex, fishPos, this);
        showCrosshairRingFlash(spreadIndex);
        
        this.flashHit();
        
        if (!multiplayerMode) {
            const weapon = CONFIG.weapons[weaponKey];
            if (!weapon) {
                console.warn(`[RTP] takeDamage: no weapon found for key='${weaponKey}'`);
            } else if (weapon.type === 'spread') {
                const result = clientRTPEngine.handleShotgunHit(
                    CLIENT_RTP_PLAYER_ID, this.rtpFishId, weaponKey, this.rtpTier, gameState.autoShoot
                );
                if (result.kill) {
                    this.die(weaponKey, result.reward, result.rewardFp);
                    return true;
                }
            } else if (weapon.type === 'projectile') {
                const result = clientRTPEngine.handleSingleTargetHit(
                    CLIENT_RTP_PLAYER_ID, this.rtpFishId, weaponKey, this.rtpTier, gameState.autoShoot
                );
                if (result.kill) {
                    this.die(weaponKey, result.reward, result.rewardFp);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    die(weaponKey, rtpReward, rewardFp) {
        if (!this.isActive) {
            console.warn('[FISH] die() called on already-dead fish, skipping');
            return;
        }
        
        this.isActive = false;
        this.group.visible = false;
        
        // MEMORY LEAK FIX: Cancel any pending respawn timer to prevent duplicate spawns
        // This is critical because die() pushes to freeFish AND schedules respawn,
        // which can cause the same fish instance to be spawned multiple times
        if (this.respawnTimerId) {
            clearTimeout(this.respawnTimerId);
            this.respawnTimerId = null;
        }
        
        // MEMORY LEAK FIX: Properly cleanup AnimationMixer to prevent accumulation
        // stopAllAction() alone is not enough - we need uncacheRoot() to release references
        // ANIMATION FIX: After uncacheRoot(), the mixer and action are invalidated and cannot be reused.
        // We MUST null them here so spawn() knows to create fresh ones.
        // This fixes the "sliding statue" bug where fish move but don't animate after respawn.
        if (this.glbMixer) {
            this.glbMixer.stopAllAction();
            if (this.glbModelRoot) {
                this.glbMixer.uncacheRoot(this.glbModelRoot);
            }
            // Clear references - they're invalid after uncacheRoot() and must be recreated on spawn
            this.glbMixer = null;
            this.glbAction = null;
        }
        
        // FREEZE BUG FIX: Remove fish from activeFish array on death
        // Previously, dead fish remained in activeFish with isActive=false ("zombie" entries)
        // Over 30+ minutes of gameplay, these zombie entries accumulated and caused:
        // 1. Array corruption when fish were reused from freeFish
        // 2. Fish appearing frozen because they were in activeFish but not being updated
        // 3. Memory leaks from growing activeFish array
        const activeIndex = activeFish.indexOf(this);
        if (activeIndex !== -1) {
            activeFish.splice(activeIndex, 1);
        }
        
        // PERFORMANCE: Return fish to free-list for O(1) reuse (Boss Mode optimization)
        // POOL CORRUPTION FIX: Check if already in freeFish to prevent duplicates
        if (!freeFish.includes(this)) {
            freeFish.push(this);
        } else {
            console.warn('[FISH] Fish already in freeFish pool, skipping duplicate push');
        }
        
        const deathPosition = this.group.position.clone();
        
        showKillSkull();
        
        // HIT SOUND LOGIC: Do NOT play hit sound on fish death
        // Hit sound is now played in bullet collision ONLY when fish survives
        // On death, we only play coin sound (handled below)
        
        // Phase 2: Trigger special abilities on death
        if (this.config.ability) {
            this.triggerAbility(deathPosition, weaponKey);
        }
        
        // MULTIPLAYER MODE: Skip local RTP calculation - server handles rewards
        // In multiplayer, the server sends balanceUpdate events with authoritative rewards
        // Client should NOT calculate or award rewards locally to ensure casino-grade RTP compliance
        if (multiplayerMode) {
            // In multiplayer, show visual effects - server will send actual reward via balanceUpdate
            let fishSize = 'small';
            if (this.tier === 'tier4' || this.isBoss) {
                fishSize = 'boss';
            } else if (this.tier === 'tier3') {
                fishSize = 'large';
            } else if (this.tier === 'tier2') {
                fishSize = 'medium';
            }
            // Visual feedback - actual reward comes from server
            spawnFishDeathEffect(deathPosition, fishSize, this.config.color);
            
            // Play coin sound on fish kill (not on collection)
            playCoinSound(fishSize);
            
            const coinCount = fishSize === 'boss' ? 3 : fishSize === 'large' ? 2 : 1;
            for (let ci = 0; ci < coinCount; ci++) {
                spawnWaitingCoin(deathPosition, 0);
            }
            onScoreConfirmed(this.form, this.config.reward);
        } else {
            updateComboOnKill();
            
            const winFp = (typeof rewardFp === 'number' && rewardFp > 0) ? rewardFp : 0;
            const winDisplay = (typeof rtpReward === 'number' && rtpReward > 0) ? rtpReward : 0;
            
            // Determine fish size from tier (used for visual effects)
            let fishSize = 'small';
            if (this.tier === 'tier4' || this.isBoss) {
                fishSize = 'boss';
            } else if (this.tier === 'tier3') {
                fishSize = 'large';
            } else if (this.tier === 'tier2') {
                fishSize = 'medium';
            }
            
            // ALWAYS spawn visual effects on fish death (regardless of RTP payout)
            // This provides consistent feedback to players - every kill feels rewarding
            spawnFishDeathEffect(deathPosition, fishSize, this.config.color);
            
            // Play coin sound on fish kill (not on collection)
            playCoinSound(fishSize);
            
            const coinCount = fishSize === 'boss' ? 3 : fishSize === 'large' ? 2 : 1;
            for (let ci = 0; ci < coinCount; ci++) {
                spawnWaitingCoin(deathPosition, 0);
            }
            
            if (winFp > 0) {
                recordWin(winDisplay);
                gameState.balance += winFp;
                gameState.score += Math.floor(winDisplay);
            }
            
            onScoreConfirmed(this.form, winDisplay);
            // Note: No "miss" sound or gray particles - every kill now has coin feedback
        }
        
        // MEMORY LEAK FIX: Store respawn timer ID so it can be cancelled if fish is reused
        // This prevents duplicate spawns when die() pushes to freeFish and the fish is
        // reused by updateDynamicFishSpawn() before the respawn timer fires
        this.respawnTimerId = setTimeout(() => {
            this.respawnTimerId = null;
            this.respawn();
        }, 2000 + Math.random() * 3000);
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
        // RACE CONDITION FIX: Check if fish is already active before respawning
        // This handles the case where:
        // 1. Fish dies → pushed to freeFish, respawn timer scheduled
        // 2. Fish is popped from freeFish and reused (e.g., Boss Mode swarm)
        // 3. Respawn timer fires but fish is already active from step 2
        // Without this check, the fish would be respawned to a random position
        // while it's already being used elsewhere, causing visual glitches
        if (this.isActive) {
            console.warn('[FISH] respawn() called on already-active fish, skipping (race condition)');
            return;
        }
        
        // BUG FIX: Boss-only species should NOT respawn after Boss Mode ends
        // When a Boss fish (mantaRay, killerWhale, etc.) dies during Boss Mode:
        // 1. die() is called which schedules a respawn timer
        // 2. Boss Mode ends, but the respawn timer is still pending
        // 3. When timer fires, the Boss fish would respawn as a normal fish
        // This check prevents Boss-only species from respawning outside Boss Mode
        const fishSpecies = this.tier || this.config?.species || this.form;
        if (BOSS_ONLY_SPECIES.includes(fishSpecies) && !gameState.bossActive) {
            console.log(`[FISH] Boss-only species ${fishSpecies} not respawning outside Boss Mode`);
            return;
        }
        
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
    
    // Issue #15: Create fish for each tier, EXCLUDING boss-only species and ability fish
    // Boss fish (blueWhale, greatWhiteShark, mantaRay, marlin) only spawn during Boss Mode
    // Ability fish (bombCrab, electricEel, goldFish, shieldTurtle) excluded for RTP compliance
    Object.entries(CONFIG.fishTiers).forEach(([tier, config]) => {
        // Skip boss-only species during normal gameplay
        if (BOSS_ONLY_SPECIES.includes(tier)) {
            return; // Don't create these fish in the normal pool
        }
        
        // RTP FIX: Skip ability fish that can cause chain kills without corresponding bets
        if (ABILITY_FISH_EXCLUDED.includes(tier)) {
            return; // Don't create ability fish until reward mechanics are redesigned
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
    
    const minX = -width / 2 + marginX;
    const maxX = width / 2 - marginX;
    const cannonY = floorY + 30;
    const minY = cannonY + 250;
    const maxY = floorY + height - marginY;
    const minZ = -depth / 2 + marginZ;
    const maxZ = depth / 2 - marginZ;
    
    const minHorizontalDistFromCannon = 150;
    const minFishSpawnDist = 60;
    const maxSpawnAttempts = 8;
    
    let bestX = 0, bestY = 0, bestZ = 0, bestMinDist = 0;
    
    for (let attempt = 0; attempt < maxSpawnAttempts; attempt++) {
        let x, y, z, horizontalDist;
        do {
            x = minX + Math.random() * (maxX - minX);
            y = minY + Math.random() * (maxY - minY);
            z = minZ + Math.random() * (maxZ - minZ);
            horizontalDist = Math.sqrt(x*x + z*z);
        } while (horizontalDist < minHorizontalDistFromCannon);
        
        let closestDistSq = Infinity;
        for (let i = 0; i < activeFish.length; i++) {
            const f = activeFish[i];
            if (!f.isActive) continue;
            const fp = f.group.position;
            const dx = x - fp.x, dy = y - fp.y, dz = z - fp.z;
            const dSq = dx * dx + dy * dy + dz * dz;
            if (dSq < closestDistSq) closestDistSq = dSq;
        }
        
        if (closestDistSq > bestMinDist) {
            bestMinDist = closestDistSq;
            bestX = x; bestY = y; bestZ = z;
        }
        
        if (closestDistSq >= minFishSpawnDist * minFishSpawnDist) break;
    }
    
    return new THREE.Vector3(bestX, bestY, bestZ);
}

function spawnInitialFish() {
    // MULTIPLAYER: Skip local fish spawning in multiplayer mode - fish come from server
    if (multiplayerMode) {
        console.log('[GAME] Skipping local fish spawn - multiplayer mode uses server fish');
        return;
    }
    
    // PERFORMANCE FIX: Only spawn up to maxCount fish initially
    // Remaining fish go to freeFish pool for dynamic spawning
    let spawnedCount = 0;
    fishPool.forEach(fish => {
        if (spawnedCount < FISH_SPAWN_CONFIG.maxCount) {
            // Issue #1: Spawn fish in full 3D space around cannon (immersive 360°)
            const position = getRandomFishPositionIn3DSpace();
            fish.spawn(position);
            activeFish.push(fish);
            spawnedCount++;
        } else {
            // Put remaining fish in free pool for later spawning
            freeFish.push(fish);
        }
    });
    
    console.log(`[FISH] Initial spawn: ${spawnedCount} active, ${freeFish.length} in reserve (max: ${FISH_SPAWN_CONFIG.maxCount})`)
}

// ==================== DYNAMIC FISH RESPAWN SYSTEM ====================
// Maintains target fish count and adjusts spawn rate based on kill rate
const FISH_SPAWN_CONFIG = {
    targetCount: 80,        // Target number of fish on screen
    minCount: 60,           // Minimum fish count before emergency spawn
    maxCount: 100,          // Maximum fish count - HARD CAP to prevent performance issues (reduced from 120 for memory optimization)
    normalSpawnInterval: 1.0,    // Normal spawn interval (seconds)
    emergencySpawnInterval: 0.3, // Emergency spawn interval when fish < minCount
    maintainSpawnInterval: 2.0   // Slow spawn when at target
};

let dynamicSpawnTimer = 0;

function updateDynamicFishSpawn(deltaTime) {
    // MULTIPLAYER: Skip local fish spawning in multiplayer mode - fish come from server
    if (multiplayerMode) return;

    // DEBUG_COMET_MODE: force-spawn up to 100 active fish immediately
    if (window.DEBUG_COMET_MODE && activeFish.length < 100) {
        const toSpawn = 100 - activeFish.length;
        for (let i = 0; i < toSpawn; i++) {
            const inactiveFish = freeFish.pop();
            if (!inactiveFish) break;
            const position = getRandomFishPositionIn3DSpace();
            inactiveFish.spawn(position);
            if (!activeFish.includes(inactiveFish)) {
                activeFish.push(inactiveFish);
            }
        }
        return;
    }
    
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
        // PERFORMANCE: Use free-list for O(1) fish retrieval instead of O(n) find()
        const inactiveFish = freeFish.pop();
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
// ==================== RTP Phase 1 System v1.3 (SSOT: 2026-02-22) ====================
// Strict implementation of 《RTP Phase 1 系統聖經 v1.3》
// §0 Precision: MONEY_SCALE=1000, RTP_SCALE=10000, P_SCALE=1000000
// All division → floor(); All state → integer FP; No floating-point in settlement path.
// v1.6.2: Convenience Tax — manual (98%) vs auto (96%) reward split
const RTP_MONEY_SCALE = 1000;
const RTP_SCALE = 10000;
const RTP_P_SCALE = 1000000;
const RTP_ROCKET_MAX_TARGETS = 6;
const RTP_LASER_MAX_TARGETS = 6;

const RTP_WEAPON_RTP_MANUAL_FP = {
    '1x': 9200,
    '3x': 9400,
    '5x': 9600,
    '8x': 9800
};

const RTP_WEAPON_RTP_AUTO_FP = {
    '1x': 9000,
    '3x': 9200,
    '5x': 9400,
    '8x': 9600
};

const RTP_WEAPON_COST_FP = {
    '1x': 1000,
    '3x': 3000,
    '5x': 5000,
    '8x': 8000
};

const RTP_TIER_CONFIG = {
    1: { rewardManualFp: 7840, rewardAutoFp: 7680, n1Fp: 8000, pityCompFp: 367000 },
    2: { rewardManualFp: 11200, rewardAutoFp: 10970, n1Fp: 12000, pityCompFp: 344000 },
    3: { rewardManualFp: 17920, rewardAutoFp: 17550, n1Fp: 18000, pityCompFp: 332000 },
    4: { rewardManualFp: 33600, rewardAutoFp: 32910, n1Fp: 34000, pityCompFp: 326400 },
    5: { rewardManualFp: 50400, rewardAutoFp: 49370, n1Fp: 51000, pityCompFp: 322600 },
    6: { rewardManualFp: 134400, rewardAutoFp: 131660, n1Fp: 135000, pityCompFp: 316000 }
};

const FISH_SPECIES_TO_RTP_TIER = {
    sardine: 1, anchovy: 1,
    damselfish: 2, clownfish: 2, blueTang: 2,
    lionfish: 3, angelfish: 3, pufferfish: 3, seahorse: 3, parrotfish: 3,
    mahiMahi: 4, grouper: 4, yellowfinTuna: 4, mantaRay: 4,
    marlin: 5, hammerheadShark: 5,
    greatWhiteShark: 6, killerWhale: 6, blueWhale: 6
};

function getFishRTPTier(species) {
    return FISH_SPECIES_TO_RTP_TIER[species] || 1;
}

let rtpFishIdCounter = 0;
function nextRTPFishId() {
    return 'f' + (++rtpFishIdCounter);
}

let rtpKillEventCounter = 0;
function nextKillEventId() {
    return 'ke_' + (++rtpKillEventCounter) + '_' + Date.now();
}

class ClientRTPPhase1 {
    constructor() {
        this.fishStates = new Map();
        this.playerStates = new Map();
        this.processedKillEvents = new Set();
    }

    _getOrCreateFishState(playerId, fishId) {
        const key = playerId + ':' + fishId;
        let state = this.fishStates.get(key);
        if (!state) {
            state = { sumCostFp: 0, killed: false };
            this.fishStates.set(key, state);
        }
        return state;
    }

    _getOrCreatePlayerState(playerId) {
        let state = this.playerStates.get(playerId);
        if (!state) {
            state = {
                budgetRemainingFp: 0,
                reset_debt_on_session_end: false
            };
            this.playerStates.set(playerId, state);
        }
        return state;
    }

    clearFishStates(fishId) {
        for (const key of this.fishStates.keys()) {
            if (key.endsWith(':' + fishId)) {
                this.fishStates.delete(key);
            }
        }
    }

    pruneKilledFishStates() {
        for (const [key, state] of this.fishStates) {
            if (state.killed) {
                this.fishStates.delete(key);
            }
        }
    }

    resetPlayerDebtIfEnabled(playerId) {
        const pState = this.playerStates.get(playerId);
        if (pState && pState.reset_debt_on_session_end) {
            pState.budgetRemainingFp = 0;
        }
    }

    _resolveMode(isAuto) {
        return isAuto ? 'auto' : 'manual';
    }

    _getRtp(weaponKey, isAuto) {
        const table = isAuto ? RTP_WEAPON_RTP_AUTO_FP : RTP_WEAPON_RTP_MANUAL_FP;
        return table[weaponKey] || (isAuto ? 9000 : 9200);
    }

    _getReward(config, isAuto) {
        return isAuto ? config.rewardAutoFp : config.rewardManualFp;
    }

    _calcProbability(pState, config, isAuto) {
        const rewardFp = this._getReward(config, isAuto);
        const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
        const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / rewardFp);
        if (pBaseRawFp >= RTP_P_SCALE) {
            return RTP_P_SCALE;
        }
        return Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));
    }

    handleSingleTargetHit(playerId, fishId, weaponKey, tier, isAuto) {
        const config = RTP_TIER_CONFIG[tier];
        if (!config) return { kill: false, error: 'invalid_tier' };

        const fState = this._getOrCreateFishState(playerId, fishId);
        if (fState.killed) return { kill: false, reason: 'already_killed' };

        const pState = this._getOrCreatePlayerState(playerId);
        const weaponCostFp = RTP_WEAPON_COST_FP[weaponKey] || 1000;
        const rtpWeaponFp = this._getRtp(weaponKey, isAuto);

        const budgetTotalFp = Math.floor(weaponCostFp * rtpWeaponFp / RTP_SCALE);
        pState.budgetRemainingFp += budgetTotalFp;
        fState.sumCostFp += weaponCostFp;

        if (fState.sumCostFp >= config.n1Fp) {
            return this._executeKill(fState, pState, config, fishId, 'hard_pity', isAuto);
        }

        const pFp = this._calcProbability(pState, config, isAuto);

        const rand = Math.floor(Math.random() * RTP_P_SCALE);
        if (rand < pFp) {
            return this._executeKill(fState, pState, config, fishId, 'probability', isAuto);
        }
        return { kill: false, reason: 'roll_failed', pFp };
    }

    handleMultiTargetHit(playerId, hitList, weaponKey, weaponType, isAuto) {
        if (!hitList || hitList.length === 0) return [];

        const maxTargets = weaponType === 'laser' ? RTP_LASER_MAX_TARGETS : RTP_ROCKET_MAX_TARGETS;
        const trimmedList = hitList.slice(0, maxTargets);
        const M = trimmedList.length;

        const weaponCostFp = RTP_WEAPON_COST_FP[weaponKey] || 1000;
        const rtpWeaponFp = this._getRtp(weaponKey, isAuto);
        const budgetTotalFp = Math.floor(weaponCostFp * rtpWeaponFp / RTP_SCALE);

        const pState = this._getOrCreatePlayerState(playerId);

        pState.budgetRemainingFp += budgetTotalFp;

        const results = [];
        let energyCarry = false;
        for (let i = 0; i < M; i++) {
            const entry = trimmedList[i];
            const config = RTP_TIER_CONFIG[entry.tier];
            if (!config) {
                results.push({ fishId: entry.fishId, kill: false, reason: 'invalid_tier' });
                continue;
            }

            const fState = this._getOrCreateFishState(playerId, entry.fishId);
            if (fState.killed) {
                results.push({ fishId: entry.fishId, kill: false, reason: 'already_killed' });
                continue;
            }

            if (i === 0) {
                fState.sumCostFp += weaponCostFp;
            }

            if (fState.sumCostFp >= config.n1Fp) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'hard_pity', isAuto);
                results.push(killResult);
                energyCarry = true;
                continue;
            }

            const rewardFp = this._getReward(config, isAuto);
            const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
            const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / rewardFp);

            if (pBaseRawFp >= RTP_P_SCALE) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'probability', isAuto);
                results.push(killResult);
                energyCarry = true;
                continue;
            }

            const pIFp = Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));

            const randI = Math.floor(Math.random() * RTP_P_SCALE);
            if (randI < pIFp) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'probability', isAuto);
                results.push(killResult);
                energyCarry = (pState.budgetRemainingFp > 0);
            } else {
                results.push({ fishId: entry.fishId, kill: false, reason: 'roll_failed', pFp: pIFp });
                if (i > 0 && !energyCarry) break;
                energyCarry = false;
            }
        }
        return results;
    }

    handleShotgunHit(playerId, fishId, weaponKey, tier, isAuto) {
        const config = RTP_TIER_CONFIG[tier];
        if (!config) return { kill: false, error: 'invalid_tier' };

        const fState = this._getOrCreateFishState(playerId, fishId);
        if (fState.killed) return { kill: false, reason: 'already_killed' };

        const pState = this._getOrCreatePlayerState(playerId);
        const pelletCostFp = 1000;
        const rtpWeaponFp = this._getRtp('3x', isAuto);

        const budgetTotalFp = Math.floor(pelletCostFp * rtpWeaponFp / RTP_SCALE);
        pState.budgetRemainingFp += budgetTotalFp;
        fState.sumCostFp += pelletCostFp;

        if (fState.sumCostFp >= config.n1Fp) {
            return this._executeKill(fState, pState, config, fishId, 'hard_pity', isAuto);
        }

        const pFp = this._calcProbability(pState, config, isAuto);

        const rand = Math.floor(Math.random() * RTP_P_SCALE);
        if (rand < pFp) {
            return this._executeKill(fState, pState, config, fishId, 'probability', isAuto);
        }
        return { kill: false, reason: 'roll_failed', pFp };
    }

    _executeKill(fState, pState, config, fishId, reason, isAuto) {
        const killEventId = nextKillEventId();
        if (this.processedKillEvents.has(killEventId)) {
            return { kill: false, reason: 'duplicate_kill_event' };
        }
        this.processedKillEvents.add(killEventId);

        const rewardFp = isAuto ? config.rewardAutoFp : config.rewardManualFp;
        pState.budgetRemainingFp -= rewardFp;
        pState.budgetRemainingFp = Math.max(-config.rewardManualFp, pState.budgetRemainingFp);
        fState.killed = true;
        return {
            fishId,
            kill: true,
            reason,
            killEventId,
            rewardFp,
            reward: rewardFp / RTP_MONEY_SCALE,
            isAuto: !!isAuto
        };
    }
}

const clientRTPEngine = new ClientRTPPhase1();
const CLIENT_RTP_PLAYER_ID = 'local';

const RTP_SESSION_STATS = {
    totalBets: 0,
    totalWins: 0,
    shotsFired: 0,
    fishKilled: 0
};

function recordBet(weaponKey) {
    const weapon = CONFIG.weapons[weaponKey];
    const betAmount = weapon.cost;
    RTP_SESSION_STATS.totalBets += betAmount;
    RTP_SESSION_STATS.shotsFired++;
}

function recordWin(amount) {
    RTP_SESSION_STATS.totalWins += amount;
    RTP_SESSION_STATS.fishKilled++;
}

function getCurrentSessionRTP() {
    if (RTP_SESSION_STATS.totalBets <= 0) return 0;
    return RTP_SESSION_STATS.totalWins / RTP_SESSION_STATS.totalBets;
}

function getRTPStats() {
    const stats = RTP_SESSION_STATS;
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
// PERFORMANCE OPTIMIZATION: Synchronous fire(), pre-cached GLB models, temp vector reuse
class Bullet {
    constructor() {
        this.isActive = false;
        this.weaponKey = '1x';
        this.velocity = new THREE.Vector3();
        this.lifetime = 0;
        this.glbModel = null;
        this.useGLB = false;
        
        // FPS INSTANT HIT: Visual-only bullets don't do damage (damage already registered)
        this.isVisualOnly = false;
        
        // COLLISION OPTIMIZATION: Store last position for segment-sphere collision
        // This enables accurate swept collision detection to prevent tunneling
        this.lastPosition = new THREE.Vector3();
        
        // AIR WALL FIX: Store bullet origin (muzzle position) to prevent hitting fish too close to cannon
        this.origin = new THREE.Vector3();
        
        this.spreadIndex = 0;
        
        this.createMesh();
    }
    
    createMesh() {
        this.group = new THREE.Group();
        
        // Procedural bullet container (will be hidden if GLB is used)
        this.proceduralGroup = new THREE.Group();
        
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
        this.proceduralGroup.add(this.bullet);
        
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
        this.proceduralGroup.add(this.trail);
        
        this.group.add(this.proceduralGroup);
        
        const glowTrailGeo = new THREE.CylinderGeometry(2.5, 0.5, 45, 6);
        glowTrailGeo.rotateX(Math.PI / 2);
        glowTrailGeo.translate(0, 0, -24);
        this.glowTrailMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        this.glowTrail = new THREE.Mesh(glowTrailGeo, this.glowTrailMat);
        this.glowTrail.visible = false;
        this.group.add(this.glowTrail);
        
        this.group.visible = false;
        bulletGroup.add(this.group);
    }
    
    // PERFORMANCE: Synchronous GLB loading from pre-cached pool (no async/await)
    loadGLBBulletSync(weaponKey) {
        const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
        if (!weaponGLBState.enabled || !glbConfig) {
            return false;
        }
        
        // Get pre-cloned model from pool (synchronous, no async needed)
        const bulletModel = getBulletModelFromPool(weaponKey);
        if (bulletModel) {
            // Remove old GLB model if exists and return to pool
            if (this.glbModel) {
                this.group.remove(this.glbModel);
                returnBulletModelToPool(this.weaponKey, this.glbModel);
            }
            
            // Apply scale from config
            const scale = glbConfig.bulletScale;
            bulletModel.scale.set(scale, scale, scale);
            bulletModel.visible = true;
            
            this.glbModel = bulletModel;
            this.group.add(bulletModel);
            this.useGLB = true;
            this.proceduralGroup.visible = false;
            
            return true;
        }
        
        return false;
    }
    
    // PERFORMANCE: Synchronous fire() - no async/await, uses pre-cached models
    // SIMPLIFIED: All weapons now fire straight (no parabolic trajectory)
    fire(origin, direction, weaponKey) {
        this.weaponKey = weaponKey;
        const weapon = CONFIG.weapons[weaponKey];
        const glbConfig = WEAPON_GLB_CONFIG.weapons[weaponKey];
        // Note: isGrenade flag kept for legacy compatibility but no longer affects trajectory
        this.isGrenade = (weapon.type === 'aoe' || weapon.type === 'superAoe');
        
        // FPS INSTANT HIT: Reset visual-only flag (will be set by spawnVisualBullet if needed)
        this.isVisualOnly = false;
        
        this.group.position.copy(origin);
        // COLLISION OPTIMIZATION: Initialize lastPosition for segment-sphere collision
        this.lastPosition.copy(origin);
        // AIR WALL FIX: Store origin (muzzle position) to prevent hitting fish too close to cannon
        this.origin.copy(origin);
        
        // SIMPLIFIED: All weapons fire straight - no parabolic trajectory
        // 1x, 3x, 5x (rocket): straight projectile at speed 2000
        // 8x (laser): straight projectile at speed 6000 with piercing
        this.velocity.copy(direction).normalize().multiplyScalar(weapon.speed);
        
        this.spreadIndex = 0;
        this.lifetime = 2.8;
        this.isActive = true;
        this.group.visible = true;
        
        // PERFORMANCE: Synchronous GLB loading from pre-cached pool
        const glbLoaded = this.loadGLBBulletSync(weaponKey);
        
        if (glbLoaded) {
            // GLB bullet loaded successfully
            this.proceduralGroup.visible = false;
            if (this.glbModel) {
                this.glbModel.visible = true;
                if (glbConfig && glbConfig.bulletTint) {
                    const tintColor = new THREE.Color(glbConfig.bulletTint);
                    this.glbModel.traverse((child) => {
                        if (child.isMesh && child.material) {
                            if (child.material.color) child.material.color.copy(tintColor);
                            if (child.material.emissive) child.material.emissive.copy(tintColor);
                        }
                    });
                }
            }
        } else {
            // Fallback to procedural bullet
            this.useGLB = false;
            this.proceduralGroup.visible = true;
            if (this.glbModel) {
                this.glbModel.visible = false;
            }
            
            // Update procedural visual based on weapon
            this.bullet.material.color.setHex(weapon.color);
            this.bullet.material.emissive.setHex(weapon.color);
            this.trail.material.color.setHex(weapon.color);
            
            const scale = Math.max(weapon.size / 8, 0.5);
            this.bullet.scale.set(scale, scale, scale);
            this.trail.scale.set(scale, scale, scale);
        }
        
        // PERFORMANCE: Use temp vector instead of clone() for lookAt
        bulletTempVectors.lookTarget.copy(this.group.position).add(direction);
        this.group.lookAt(bulletTempVectors.lookTarget);
        
        // Apply rotation fix for GLB models if needed
        if (this.useGLB && glbConfig && glbConfig.bulletRotationFix) {
            this.glbModel.rotation.copy(glbConfig.bulletRotationFix);
        }
        
        const isProjectile = (weapon.type === 'projectile' || weapon.type === 'spread' || weapon.type === 'rocket' || weapon.type === 'laser');
        if (isProjectile) {
            const vfx = WEAPON_VFX_CONFIG[weaponKey];
            this.glowTrailMat.color.setHex(vfx ? vfx.trailColor : 0xffffff);
            this.glowTrailMat.opacity = 0.5;
            this.glowTrail.visible = true;
        } else {
            this.glowTrail.visible = false;
        }
    }
    
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0) {
            this.deactivate();
            return;
        }
        
        // NOTE: Gravity/parabolic trajectory removed - all weapons now fire straight
        // 8x laser is instant hitscan (no bullet), 5x rocket flies straight
        
        // COLLISION OPTIMIZATION: Store last position before moving for segment-sphere collision
        this.lastPosition.copy(this.group.position);
        
        // PERFORMANCE: Use temp vector instead of clone() for position update
        bulletTempVectors.velocityScaled.copy(this.velocity).multiplyScalar(deltaTime);
        this.group.position.add(bulletTempVectors.velocityScaled);
        
        // 3X WEAPON FIRE TRAIL: DISABLED - Using original 3x bullet GLB model without fire particle effects
        // The fire particle system using Dissolve/Distortion textures has been removed per user request
        // if (this.weaponKey === '3x' && fireParticlePool.initialized) {
        //     if (!this.lastFireParticleTime) this.lastFireParticleTime = 0;
        //     this.lastFireParticleTime += deltaTime;
        //     if (this.lastFireParticleTime >= FIRE_PARTICLE_CONFIG.trail.spawnRate) {
        //         spawnFireTrailParticle(this.group.position, this.velocity);
        //         this.lastFireParticleTime = 0;
        //     }
        // }
        
        // Check boundaries - very lenient to allow bullets to reach fish
        const { width, height, depth, floorY } = CONFIG.aquarium;
        const pos = this.group.position;
        
        // FIX: NaN protection - if position is NaN, immediately deactivate
        // NaN comparisons always return false, so bullets with NaN positions would never deactivate
        // This prevents bullet pool exhaustion from "ghost bullets" that never get recycled
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
            this.deactivate();
            return;
        }
        
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
        // FPS INSTANT HIT: Skip collision detection for visual-only bullets
        // These bullets are purely for visual feedback - damage was already registered
        // by the instant hit system when the shot was fired
        if (this.isVisualOnly) {
            return;
        }
        
        const weapon = CONFIG.weapons[this.weaponKey];
        const bulletPos = this.group.position;
        const lastPos = this.lastPosition;
        
        // PERFORMANCE: Use spatial hash to only check nearby fish
        // This reduces O(bullets * fish) to O(bullets * k) where k is nearby fish count
        // FIX: Query both lastPos and bulletPos to cover the full segment path
        // This prevents bullets from passing through fish at low FPS
        const nearbyFish = getNearbyFishForBullet(lastPos, bulletPos);
        
        for (const fish of nearbyFish) {
            if (!fish.isActive) continue;
            
            const fishPos = fish.group.position;
            const fishRadius = fish.boundingRadius;
            
            const distFromOriginSq = fishPos.distanceToSquared(this.origin);
            const minHitDistance = 50;
            const minDistRequired = minHitDistance + fishRadius;
            if (distFromOriginSq < minDistRequired * minDistRequired) {
                continue;
            }
            
            const fishYaw = fish._currentYaw || 0;
            const halfExt = fish.ellipsoidHalfExtents;
            const collision = halfExt
                ? segmentIntersectsEllipsoid(lastPos, bulletPos, fishPos, halfExt, fishYaw, bulletTempVectors.hitPos)
                : segmentIntersectsSphere(lastPos, bulletPos, fishPos, fishRadius, bulletTempVectors.hitPos);
            
            if (collision.hit) {
                bulletTempVectors.bulletDir.copy(this.velocity).normalize();
                
                if (weapon.type === 'projectile' || weapon.type === 'spread') {
                    bulletTempVectors.fishToBullet.copy(bulletTempVectors.hitPos).sub(fishPos).normalize();
                    const surfaceDist = halfExt
                        ? Math.min(halfExt.x, halfExt.y, halfExt.z) * 0.8
                        : fishRadius * 0.8;
                    bulletTempVectors.hitPos.copy(fishPos).add(
                        bulletTempVectors.fishToBullet.multiplyScalar(surfaceDist)
                    );
                }
                
                // Handle different weapon types
                // HIT SOUND LOGIC: Play hit sound + show hit effect ONLY if fish survives
                // If fish dies: only coin sound + smoke + coin drop (handled in Fish.die())
                if (weapon.type === 'rocket') {
                    // 5X ROCKET: Straight line projectile with explosion on impact
                    // Trigger explosion at hit point (damages all fish in radius)
                    triggerExplosion(bulletTempVectors.hitPos, this.weaponKey);
                    
                    // Screen shake for rocket impact
                    triggerScreenShakeWithStrength(6, 80);
                    
                } else if (weapon.type === 'chain') {
                    // Chain lightning: hit first fish, then chain to nearby fish
                    const killed = fish.takeDamage(weapon.damage, this.weaponKey);
                    
                    // Trigger chain lightning effect (always show for visual feedback)
                    triggerChainLightning(fish, this.weaponKey, weapon.damage);
                    
                    createHitParticles(bulletTempVectors.hitPos, weapon.color, 8);
                    spawnWeaponHitEffect(this.weaponKey, bulletTempVectors.hitPos, fish, bulletTempVectors.bulletDir);
                    playWeaponHitSound(this.weaponKey);
                    
                } else if (weapon.type === 'aoe' || weapon.type === 'superAoe') {
                    // AOE/SuperAOE explosion: damage all fish in radius
                    // Note: triggerExplosion handles multiple fish, some may die, some may survive
                    // We show the explosion effect regardless (it's the weapon's visual, not hit feedback)
                    triggerExplosion(bulletTempVectors.hitPos, this.weaponKey);
                    
                    // Issue #16: Extra screen shake for 20x super weapon
                    if (weapon.type === 'superAoe') {
                        triggerScreenShakeWithStrength(5);
                        triggerScreenFlash(0xff00ff, 0.3);  // Purple flash
                    }
                    
                } else if (weapon.type === 'laser') {
                    const killed = fish.takeDamage(weapon.damage, this.weaponKey);
                    
                    createHitParticles(bulletTempVectors.hitPos, weapon.color, 8);
                    spawnWeaponHitEffect(this.weaponKey, bulletTempVectors.hitPos, fish, bulletTempVectors.bulletDir);
                    playWeaponHitSound(this.weaponKey);
                    continue;
                } else {
                    // Standard projectile or spread: single target damage
                    const killed = fish.takeDamage(weapon.damage, this.weaponKey, this.spreadIndex);
                    
                    createHitParticles(bulletTempVectors.hitPos, weapon.color, 5);
                    spawnWeaponHitEffect(this.weaponKey, bulletTempVectors.hitPos, fish, bulletTempVectors.bulletDir);
                    playWeaponHitSound(this.weaponKey);
                }
                
                this.deactivate();
                return;
            }
        }
    }
    
    deactivate() {
        this.isActive = false;
        this.group.visible = false;
        this.glowTrail.visible = false;
        
        // PERFORMANCE: Return GLB model to pool for reuse
        if (this.useGLB && this.glbModel) {
            this.group.remove(this.glbModel);
            returnBulletModelToPool(this.weaponKey, this.glbModel);
            this.glbModel = null;
            this.useGLB = false;
        }
        
        // PERFORMANCE: Return bullet to free-list for O(1) reuse
        freeBullets.push(this);
        
        // For AOE/SuperAOE weapons, trigger explosion when bullet expires or goes out of bounds
        const weapon = CONFIG.weapons[this.weaponKey];
        if ((weapon.type === 'aoe' || weapon.type === 'superAoe') && this.lifetime <= 0) {
            // Don't trigger on normal deactivation from collision (already handled)
        }
    }
}

function createBulletPool() {
    for (let i = 0; i < 50; i++) {
        const bullet = new Bullet();
        bulletPool.push(bullet);
        freeBullets.push(bullet);  // PERFORMANCE: All bullets start in free-list
    }
}

// Helper function to spawn a bullet in a specific direction
// PERFORMANCE: Uses free-list for O(1) lookup instead of O(n) .find() scan
// SIMPLIFIED: All weapons fire straight (no parabolic trajectory)
function spawnBulletFromDirection(origin, direction, weaponKey, spreadIndex) {
    // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
    const bullet = freeBullets.pop();
    if (!bullet) return null;
    
    // No need to clone - Bullet.fire() uses copy() internally
    // SIMPLIFIED: All weapons fire straight
    bullet.fire(origin, direction, weaponKey);
    if (spreadIndex !== undefined) bullet.spreadIndex = spreadIndex;
    activeBullets.push(bullet);
    return bullet;
}

function fireBullet(targetX, targetY) {
    if (!gameState.isInGameScene) return false;
    if (!gameState.weaponSelected) return false;
    
    const weaponKey = gameState.currentWeapon;
    const weapon = CONFIG.weapons[weaponKey];
    
    // Check cooldown - use shotsPerSecond to calculate cooldown
    if (gameState.cooldown > 0) return false;
    
    const chEl = document.getElementById('crosshair');
    if (chEl) {
        chEl.classList.remove('firing');
        void chEl.offsetWidth;
        chEl.classList.add('firing');
    }
    const vspreadEl = document.getElementById('crosshair-vspread');
    if (vspreadEl && vspreadEl.style.display !== 'none') {
        vspreadEl.classList.remove('firing');
        void vspreadEl.offsetWidth;
        vspreadEl.classList.add('firing');
    }
    const sideL = document.getElementById('crosshair-3x-left');
    const sideR = document.getElementById('crosshair-3x-right');
    if (sideL && sideL.style.display !== 'none') {
        sideL.classList.remove('firing');
        void sideL.offsetWidth;
        sideL.classList.add('firing');
    }
    if (sideR && sideR.style.display !== 'none') {
        sideR.classList.remove('firing');
        void sideR.offsetWidth;
        sideR.classList.add('firing');
    }
    
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
        
        // PERFORMANCE: Use temp vector instead of new Vector3() per shot
        cannonMuzzle.getWorldPosition(fireBulletTempVectors.multiplayerMuzzlePos);
        const muzzlePos = fireBulletTempVectors.multiplayerMuzzlePos;
        
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
            if (DEBUG_SHOOTING) console.log(`[GAME] Multiplayer shoot: aiming away from fish plane (dir.y=${direction3D.y.toFixed(3)}), skipping server shot`);
            gameState.cooldown = 1 / weapon.shotsPerSecond;
            playWeaponShot(weaponKey);
            // PERFORMANCE: spawnMuzzleFlash copies values internally, no need to clone
            spawnMuzzleFlash(weaponKey, muzzlePos, direction3D);
            return true;
        }
        
        // Calculate intersection parameter t
        const t = -muzzlePos.y / direction3D.y;
        
        if (t <= 0) {
            // Intersection is behind the muzzle - shouldn't happen if direction.y > 0 and muzzle.y < 0
            if (DEBUG_SHOOTING) console.log(`[GAME] Multiplayer shoot: intersection behind muzzle (t=${t.toFixed(3)}), skipping server shot`);
            gameState.cooldown = 1 / weapon.shotsPerSecond;
            playWeaponShot(weaponKey);
            // PERFORMANCE: spawnMuzzleFlash copies values internally, no need to clone
            spawnMuzzleFlash(weaponKey, muzzlePos, direction3D);
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
        
        // PERFORMANCE: Guard debug logging behind flag to avoid string formatting per shot
        if (DEBUG_SHOOTING) console.log(`[GAME] Multiplayer shoot: muzzle=(${muzzlePos.x.toFixed(1)},${muzzlePos.y.toFixed(1)},${muzzlePos.z.toFixed(1)}) dir=(${direction3D.x.toFixed(3)},${direction3D.y.toFixed(3)},${direction3D.z.toFixed(3)}) t=${t.toFixed(1)} intersection=(${intersectionX.toFixed(1)},${intersectionZ.toFixed(1)}) -> server=(${clampedX.toFixed(1)},${clampedZ.toFixed(1)})`);
        
        // Send target coordinates to server (not direction vector)
        // Server will calculate bullet trajectory from its cannon position to this target
        multiplayerManager.shoot(clampedX, clampedZ);
        
        // Set cooldown locally for responsiveness
        gameState.cooldown = 1 / weapon.shotsPerSecond;
        
        // Play local effects immediately for responsiveness
        playWeaponShot(weaponKey);
        // PERFORMANCE: spawnMuzzleFlash copies values internally, no need to clone
        spawnMuzzleFlash(weaponKey, muzzlePos, direction3D);
        
        return true;
    }
    
    // SINGLE PLAYER MODE: Original logic
    // Check balance
    if (gameState.balance < weapon.cost * BALANCE_SCALE) return false;
    
    // Deduct cost
    gameState.balance -= weapon.cost * BALANCE_SCALE;
    
    // Record bet for RTP tracking
    recordBet(weaponKey);
    
    // Set cooldown based on shotsPerSecond
    gameState.cooldown = 1 / weapon.shotsPerSecond;
    
    // Issue #16: Play weapon-specific shooting sound
    playWeaponShot(weaponKey);
    
    // Track last weapon used for reward calculation
    gameState.lastWeaponKey = weaponKey;
    
    // ACCURATE AIMING: Use getAimDirectionAndTarget to get both direction and target point
    // This ensures bullets hit exactly where the crosshair points
    // FPS MODE: Fire toward screen center (where crosshair is)
    // THIRD-PERSON MODE: Fire where you click
    let aimX = targetX;
    let aimY = targetY;
    if (gameState.viewMode === 'fps') {
        // FPS: Fire toward screen center (crosshair position)
        aimX = window.innerWidth / 2;
        aimY = window.innerHeight / 2;
    }
    
    // Get both direction and target point for accurate aiming
    const aimResult = getAimDirectionAndTarget(aimX, aimY, fireBulletTempVectors.multiplayerDir, fireBulletTempVectors.targetPoint);
    const direction = aimResult.direction;
    const targetPoint = aimResult.targetPoint;
    
    // PERFORMANCE: Use temp vector instead of creating new Vector3
    cannonMuzzle.getWorldPosition(fireBulletTempVectors.muzzlePos);
    const muzzlePos = fireBulletTempVectors.muzzlePos;
    
    // DEBUG_AIM: Log aim direction data to verify crosshair accuracy
    // In FPS mode, direction should exactly match camera's forward direction (rayDir)
    if (DEBUG_AIM) {
        // Get rayDir for comparison
        const mouseNDC = new THREE.Vector2(
            (aimX / window.innerWidth) * 2 - 1,
            -(aimY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouseNDC, camera);
        const rayDir = raycaster.ray.direction;
        
        // Calculate difference between rayDir and actual direction used
        const diff = new THREE.Vector3().copy(direction).sub(rayDir).length();
        
        // Calculate angle difference in degrees
        const angleDiff = Math.acos(Math.min(1, direction.dot(rayDir))) * (180 / Math.PI);
        
        console.log(`[AIM DEBUG] weapon=${weaponKey} viewMode=${gameState.viewMode}`);
        console.log(`[AIM DEBUG] rayDir=(${rayDir.x.toFixed(4)}, ${rayDir.y.toFixed(4)}, ${rayDir.z.toFixed(4)})`);
        console.log(`[AIM DEBUG] direction=(${direction.x.toFixed(4)}, ${direction.y.toFixed(4)}, ${direction.z.toFixed(4)})`);
        console.log(`[AIM DEBUG] vectorDiff=${diff.toFixed(6)} angleDiff=${angleDiff.toFixed(4)}°`);
        console.log(`[AIM DEBUG] muzzlePos=(${muzzlePos.x.toFixed(1)}, ${muzzlePos.y.toFixed(1)}, ${muzzlePos.z.toFixed(1)})`);
        console.log(`[AIM DEBUG] targetPoint=(${targetPoint.x.toFixed(1)}, ${targetPoint.y.toFixed(1)}, ${targetPoint.z.toFixed(1)})`);
        
        // In FPS mode, diff should be 0 (or very close to 0)
        if (gameState.viewMode === 'fps' && diff > 0.0001) {
            console.warn(`[AIM DEBUG] WARNING: FPS mode direction differs from rayDir by ${diff.toFixed(6)}!`);
        }
    }
    
    // HITSCAN SYSTEM: All weapons use instant raycast hit detection (no physical bullets)
    if (weapon.type === 'spread') {
        const spreadAngle = weapon.spreadAngle * (Math.PI / 180);
        fireHitscanRay(muzzlePos, direction, weaponKey, 0);
        fireBulletTempVectors.leftDir.copy(direction).applyAxisAngle(fireBulletTempVectors.yAxis, spreadAngle);
        fireHitscanRay(muzzlePos, fireBulletTempVectors.leftDir, weaponKey, -1);
        fireBulletTempVectors.rightDir.copy(direction).applyAxisAngle(fireBulletTempVectors.yAxis, -spreadAngle);
        fireHitscanRay(muzzlePos, fireBulletTempVectors.rightDir, weaponKey, 1);
    } else if (weapon.type === 'laser') {
        fireLaserBeam(muzzlePos, direction, weaponKey);
    } else if (weapon.type === 'rocket') {
        fireHitscanRay(muzzlePos, direction, weaponKey);
    } else {
        fireHitscanRay(muzzlePos, direction, weaponKey);
    }
    
    spawnMuzzleFlash(weaponKey, muzzlePos, direction);
    
    // Issue #14: Start charge effect for 5x and 8x weapons (visual only, doesn't delay shot)
    if (weaponKey === '5x' || weaponKey === '8x') {
        startCannonChargeEffect(weaponKey);
    }
    
    // Issue #14: Enhanced cannon recoil animation based on weapon
    // IMPROVED: Two-phase recoil (kick + return) with backward movement for realistic feel
    const config = WEAPON_VFX_CONFIG[weaponKey];
    const recoilStrength = config ? config.recoilStrength : 5;
    
    if (gameState.viewMode === 'fps') {
        // FPS MODE: Camera pitch kick (visual feedback without moving camera position)
        // This gives recoil feel without breaking the muzzle-based camera positioning
        fpsCameraRecoilState.maxPitchOffset = recoilStrength * 0.003;  // Convert to radians (small kick)
        fpsCameraRecoilState.active = true;
        fpsCameraRecoilState.phase = 'kick';
        fpsCameraRecoilState.kickStartTime = performance.now();
        fpsCameraRecoilState.kickDuration = 30 + recoilStrength;
        fpsCameraRecoilState.returnDuration = 100 + recoilStrength * 4;
    } else if (cannonBarrel) {
        // THIRD-PERSON MODE: Barrel position recoil
        // Store original position
        barrelRecoilState.originalPosition.copy(cannonBarrel.position);
        
        // Calculate recoil direction (opposite to firing direction)
        barrelRecoilState.recoilVector.copy(direction).normalize().multiplyScalar(-1);
        barrelRecoilState.recoilDistance = recoilStrength * 2;  // Scale for visual impact
        
        // Start kick phase
        barrelRecoilState.active = true;
        barrelRecoilState.phase = 'kick';
        barrelRecoilState.kickStartTime = performance.now();
        barrelRecoilState.kickDuration = 30 + recoilStrength;
        barrelRecoilState.returnDuration = 80 + recoilStrength * 3;
    }
    
    return true;
}

// PERFORMANCE: Update barrel recoil in animation loop (called from animate())
// IMPROVED: Two-phase animation with easing for realistic recoil feel
function updateBarrelRecoil() {
    if (!barrelRecoilState.active || !cannonBarrel) return;
    
    const now = performance.now();
    const elapsed = now - barrelRecoilState.kickStartTime;
    
    if (barrelRecoilState.phase === 'kick') {
        // Kick phase: Fast movement backward (easeOut)
        const kickProgress = Math.min(elapsed / barrelRecoilState.kickDuration, 1);
        // EaseOut: 1 - (1 - t)^2
        const easedProgress = 1 - Math.pow(1 - kickProgress, 2);
        
        // Apply recoil offset
        barrelRecoilState.tempVec.copy(barrelRecoilState.recoilVector)
            .multiplyScalar(barrelRecoilState.recoilDistance * easedProgress);
        cannonBarrel.position.copy(barrelRecoilState.originalPosition)
            .add(barrelRecoilState.tempVec);
        
        // Transition to return phase
        if (kickProgress >= 1) {
            barrelRecoilState.phase = 'return';
            barrelRecoilState.kickStartTime = now;  // Reset timer for return phase
        }
    } else if (barrelRecoilState.phase === 'return') {
        // Return phase: Slower movement back to original (easeInOut)
        const returnProgress = Math.min(elapsed / barrelRecoilState.returnDuration, 1);
        // EaseInOut: t < 0.5 ? 2t^2 : 1 - (-2t + 2)^2 / 2
        const easedProgress = returnProgress < 0.5 
            ? 2 * returnProgress * returnProgress 
            : 1 - Math.pow(-2 * returnProgress + 2, 2) / 2;
        
        // Interpolate from max recoil back to original
        const recoilAmount = 1 - easedProgress;
        barrelRecoilState.tempVec.copy(barrelRecoilState.recoilVector)
            .multiplyScalar(barrelRecoilState.recoilDistance * recoilAmount);
        cannonBarrel.position.copy(barrelRecoilState.originalPosition)
            .add(barrelRecoilState.tempVec);
        
        // Animation complete
        if (returnProgress >= 1) {
            cannonBarrel.position.copy(barrelRecoilState.originalPosition);
            barrelRecoilState.active = false;
            barrelRecoilState.phase = 'idle';
        }
    }
}

// FPS Camera recoil update (called from animate loop)
// Updates the pitch offset for visual recoil feedback in FPS mode
function updateFPSCameraRecoil() {
    if (!fpsCameraRecoilState.active) return;
    
    const now = performance.now();
    const elapsed = now - fpsCameraRecoilState.kickStartTime;
    
    if (fpsCameraRecoilState.phase === 'kick') {
        // Kick phase: Fast pitch up (easeOut)
        const kickProgress = Math.min(elapsed / fpsCameraRecoilState.kickDuration, 1);
        const easedProgress = 1 - Math.pow(1 - kickProgress, 2);
        fpsCameraRecoilState.pitchOffset = fpsCameraRecoilState.maxPitchOffset * easedProgress;
        
        if (kickProgress >= 1) {
            fpsCameraRecoilState.phase = 'return';
            fpsCameraRecoilState.kickStartTime = now;
        }
    } else if (fpsCameraRecoilState.phase === 'return') {
        // Return phase: Slower return to zero (easeInOut)
        const returnProgress = Math.min(elapsed / fpsCameraRecoilState.returnDuration, 1);
        const easedProgress = returnProgress < 0.5 
            ? 2 * returnProgress * returnProgress 
            : 1 - Math.pow(-2 * returnProgress + 2, 2) / 2;
        
        fpsCameraRecoilState.pitchOffset = fpsCameraRecoilState.maxPitchOffset * (1 - easedProgress);
        
        if (returnProgress >= 1) {
            fpsCameraRecoilState.pitchOffset = 0;
            fpsCameraRecoilState.active = false;
            fpsCameraRecoilState.phase = 'idle';
        }
    }
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
        
        // PERFORMANCE: Use addScaledVector instead of clone().multiplyScalar()
        // This eliminates Vector3 allocation per particle per frame
        this.mesh.position.addScaledVector(this.velocity, deltaTime);
        this.mesh.material.opacity = this.lifetime / this.maxLifetime;
    }
    
    deactivate() {
        this.isActive = false;
        this.mesh.visible = false;
        // PERFORMANCE: Return particle to free-list for O(1) reuse
        freeParticles.push(this);
    }
}

function createParticleSystems() {
    createBulletPool();
    
    for (let i = 0; i < 200; i++) {
        const particle = new Particle();
        particlePool.push(particle);
        freeParticles.push(particle);  // PERFORMANCE: All particles start in free-list
    }
    
    // Bubble system
    createBubbleSystem();
}

function createBubbleSystem() {
    setInterval(() => {
        if (gameState.isLoading || gameState.isPaused) return;
        
        const { width, depth, floorY, height } = CONFIG.aquarium;
        
        // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
        const particle = freeParticles.pop();
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
        // PERFORMANCE: O(1) pop from free-list instead of O(n) .find()
        const particle = freeParticles.pop();
        if (particle) {
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 150,
                (Math.random() - 0.5) * 150
            );
            // PERFORMANCE: No clone() needed - Particle.spawn() uses copy() internally
            particle.spawn(position, velocity, color, 2 + Math.random() * 3, 0.15);
            activeParticles.push(particle);
        }
    }
}

// ==================== SPECIAL WEAPON EFFECTS ====================

// Chain Lightning Effect (5x weapon)
// PERFORMANCE: Refactored to use VFX manager instead of setTimeout chains
// This prevents frame loop interleaving and reduces jitter
function triggerChainLightning(initialFish, weaponKey, initialDamage) {
    // Issue #6: Play lightning sound
    playSound('lightning');
    
    const weapon = CONFIG.weapons[weaponKey];
    const maxChains = weapon.maxChains || 5;
    const chainDecay = weapon.chainDecay || 0.8;
    const chainRadius = weapon.chainRadius || 200;
    
    const visitedFish = new Set();
    visitedFish.add(initialFish);
    
    // PERFORMANCE: Use VFX manager for time-based chain progression instead of setTimeout
    // This keeps all timing within the main animation loop for smoother frame pacing
    const chainState = {
        currentFish: initialFish,
        currentDamage: initialDamage,
        chainCount: 0,
        nextChainTime: 50,  // First chain after 50ms
        chainInterval: 100  // Subsequent chains every 100ms (Issue #15)
    };
    
    addVfxEffect({
        type: 'chainLightning',
        update: (dt, elapsed) => {
            // Check if it's time for the next chain
            if (elapsed < chainState.nextChainTime) {
                return true;  // Continue waiting
            }
            
            // Check if we've reached max chains
            if (chainState.chainCount >= maxChains) {
                return false;  // Effect complete
            }
            
            // Find nearest unvisited fish within chain radius
            let nearestFish = null;
            let nearestDistance = chainRadius;
            
            for (const fish of activeFish) {
                if (!fish.isActive || visitedFish.has(fish)) continue;
                
                const distance = chainState.currentFish.group.position.distanceTo(fish.group.position);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestFish = fish;
                }
            }
            
            if (nearestFish) {
                // Apply decayed damage
                chainState.currentDamage *= chainDecay;
                const killed = nearestFish.takeDamage(Math.floor(chainState.currentDamage), weaponKey);
                
                // Spawn lightning arc visual
                spawnLightningArc(chainState.currentFish.group.position, nearestFish.group.position, weapon.color);
                
                // Create particles at hit location
                createHitParticles(nearestFish.group.position, weapon.color, 5);
                
                // FIX: Spawn GLB hit effect for secondary targets affected by chain damage
                // Calculate direction from previous fish to current fish for hit effect orientation
                const chainDirection = new THREE.Vector3()
                    .subVectors(nearestFish.group.position, chainState.currentFish.group.position)
                    .normalize();
                spawnWeaponHitEffect(weaponKey, nearestFish.group.position.clone(), nearestFish, chainDirection);
                
                visitedFish.add(nearestFish);
                chainState.currentFish = nearestFish;
                chainState.chainCount++;
                
                // Schedule next chain
                chainState.nextChainTime = elapsed + chainState.chainInterval;
                
                return true;  // Continue effect
            }
            
            return false;  // No more fish to chain to
        },
        cleanup: () => {
            // No cleanup needed for chain lightning
        }
    });
}

// PERFORMANCE: Temp vectors for lightning arc to reduce GC pressure
const lightningArcTempVectors = {
    direction: new THREE.Vector3(),
    point: new THREE.Vector3(),
    sparkPos: new THREE.Vector3()
};

// PERFORMANCE: Shared geometries for lightning effects (created once, reused)
let lightningSharedGeometries = null;
function getLightningSharedGeometries() {
    if (!lightningSharedGeometries) {
        lightningSharedGeometries = {
            flash: new THREE.SphereGeometry(40, 8, 8),  // Reduced from 12,12 to 8,8
            spark: new THREE.SphereGeometry(8, 4, 4)   // Reduced from 6,6 to 4,4
        };
    }
    return lightningSharedGeometries;
}

// ==================== LIGHTNING ARC POOL SYSTEM ====================
// PERFORMANCE FIX: Pool lightning arcs to avoid per-shot geometry/material allocations
// This eliminates GC pressure that causes micro-stutter when firing 5x weapon

const LIGHTNING_ARC_POOL_SIZE = 8;  // Max concurrent lightning arcs
const lightningArcPool = {
    items: [],
    freeList: [],
    initialized: false
};

// Pre-allocated Vector3 array for lightning points (9 points per arc, 8 segments)
const LIGHTNING_SEGMENTS = 8;
const lightningPointsPool = [];
for (let i = 0; i < LIGHTNING_ARC_POOL_SIZE; i++) {
    const points = [];
    for (let j = 0; j <= LIGHTNING_SEGMENTS; j++) {
        points.push(new THREE.Vector3());
    }
    lightningPointsPool.push(points);
}

function initLightningArcPool() {
    if (lightningArcPool.initialized) return;
    
    const sharedGeo = getLightningSharedGeometries();
    
    for (let i = 0; i < LIGHTNING_ARC_POOL_SIZE; i++) {
        // Create geometry with placeholder positions (will be updated per-use)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array((LIGHTNING_SEGMENTS + 1) * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Pre-create materials (will be reused)
        const mainMaterial = new THREE.LineBasicMaterial({
            color: 0xffffcc,
            linewidth: 3,
            transparent: true,
            opacity: 1
        });
        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0xffdd00,
            linewidth: 6,
            transparent: true,
            opacity: 0.8
        });
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffee00,
            transparent: true,
            opacity: 1.0
        });
        
        // Create meshes
        const mainLine = new THREE.Line(geometry, mainMaterial);
        const glowLine = new THREE.Line(geometry, glowMaterial);
        const flash = new THREE.Mesh(sharedGeo.flash, flashMaterial);
        
        // Create spark group with pre-allocated sparks
        const sparkGroup = new THREE.Group();
        for (let j = 0; j < 4; j++) {
            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: 0xffdd00,
                transparent: true,
                opacity: 0.9
            });
            const spark = new THREE.Mesh(sharedGeo.spark, sparkMaterial);
            spark.visible = false;
            sparkGroup.add(spark);
        }
        
        // Initially hidden
        mainLine.visible = false;
        glowLine.visible = false;
        flash.visible = false;
        sparkGroup.visible = false;
        
        const arcItem = {
            index: i,
            geometry: geometry,
            mainLine: mainLine,
            glowLine: glowLine,
            mainMaterial: mainMaterial,
            glowMaterial: glowMaterial,
            flash: flash,
            flashMaterial: flashMaterial,
            sparkGroup: sparkGroup,
            inUse: false,
            opacity: 1,
            fadeStartTime: 0
        };
        
        lightningArcPool.items.push(arcItem);
        lightningArcPool.freeList.push(arcItem);
    }
    
    lightningArcPool.initialized = true;
}

function getLightningArcFromPool() {
    if (!lightningArcPool.initialized) initLightningArcPool();
    
    const item = lightningArcPool.freeList.pop();
    if (!item) return null;  // Pool exhausted
    
    item.inUse = true;
    return item;
}

function returnLightningArcToPool(item) {
    if (!item || !item.inUse) return;
    
    // Hide all components
    item.mainLine.visible = false;
    item.glowLine.visible = false;
    item.flash.visible = false;
    item.sparkGroup.visible = false;
    
    // Remove from scene if added
    if (item.mainLine.parent) scene.remove(item.mainLine);
    if (item.glowLine.parent) scene.remove(item.glowLine);
    if (item.flash.parent) scene.remove(item.flash);
    if (item.sparkGroup.parent) scene.remove(item.sparkGroup);
    
    // Reset state
    item.inUse = false;
    item.opacity = 1;
    
    // Return to free list
    lightningArcPool.freeList.push(item);
}

// Active lightning arcs being animated
const activeLightningArcs = [];

// Update lightning arc animations (called from main game loop)
function updateLightningArcs(deltaTime) {
    const fadeSpeed = 4.8;  // Opacity units per second (was 0.04 per frame at 60fps)
    
    for (let i = activeLightningArcs.length - 1; i >= 0; i--) {
        const item = activeLightningArcs[i];
        
        item.opacity -= fadeSpeed * deltaTime;
        
        if (item.opacity <= 0) {
            // Animation complete, return to pool
            returnLightningArcToPool(item);
            activeLightningArcs.splice(i, 1);
        } else {
            // Update opacities
            item.mainMaterial.opacity = item.opacity;
            item.glowMaterial.opacity = item.opacity * 0.7;
            item.flashMaterial.opacity = item.opacity * 0.9;
            item.flash.scale.setScalar(1 + (1 - item.opacity) * 3);
            
            // Update sparks
            item.sparkGroup.children.forEach(spark => {
                spark.material.opacity = item.opacity * 0.8;
                spark.scale.setScalar(1 + (1 - item.opacity) * 2);
            });
        }
    }
}

// Spawn lightning arc visual between two points - POOLED VERSION
// PERFORMANCE: Uses pre-allocated geometry/materials to avoid GC pressure
function spawnLightningArc(startPos, endPos, color) {
    const item = getLightningArcFromPool();
    if (!item) {
        // Pool exhausted, skip this arc (graceful degradation)
        return;
    }
    
    const tv = lightningArcTempVectors;
    const points = lightningPointsPool[item.index];
    
    // Calculate direction
    tv.direction.copy(endPos).sub(startPos);
    const length = tv.direction.length();
    tv.direction.normalize();
    
    // Update points in pre-allocated array
    for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
        const t = i / LIGHTNING_SEGMENTS;
        const point = points[i];
        point.copy(startPos);
        point.x += tv.direction.x * length * t;
        point.y += tv.direction.y * length * t;
        point.z += tv.direction.z * length * t;
        
        // Add random offset for middle segments
        if (i > 0 && i < LIGHTNING_SEGMENTS) {
            const jitter = 70 * (1 - Math.abs(t - 0.5) * 2);
            point.x += (Math.random() - 0.5) * jitter;
            point.y += (Math.random() - 0.5) * jitter;
            point.z += (Math.random() - 0.5) * jitter;
        }
    }
    
    // Update geometry buffer directly (no new allocation)
    const positions = item.geometry.attributes.position.array;
    for (let i = 0; i <= LIGHTNING_SEGMENTS; i++) {
        positions[i * 3] = points[i].x;
        positions[i * 3 + 1] = points[i].y;
        positions[i * 3 + 2] = points[i].z;
    }
    item.geometry.attributes.position.needsUpdate = true;
    item.geometry.computeBoundingSphere();
    
    // Reset materials
    item.mainMaterial.opacity = 1;
    item.glowMaterial.opacity = 0.8;
    item.flashMaterial.opacity = 1.0;
    
    // Position flash at end point
    item.flash.position.copy(endPos);
    item.flash.scale.setScalar(1);
    
    // Position sparks along the arc
    item.sparkGroup.children.forEach((spark, idx) => {
        const t = Math.random();
        tv.sparkPos.copy(startPos).lerp(endPos, t);
        spark.position.copy(tv.sparkPos);
        spark.position.x += (Math.random() - 0.5) * 30;
        spark.position.y += (Math.random() - 0.5) * 30;
        spark.position.z += (Math.random() - 0.5) * 30;
        spark.material.opacity = 0.9;
        spark.scale.setScalar(1);
        spark.visible = true;
    });
    
    // Show all components
    item.mainLine.visible = true;
    item.glowLine.visible = true;
    item.flash.visible = true;
    item.sparkGroup.visible = true;
    
    // Add to scene
    scene.add(item.mainLine);
    scene.add(item.glowLine);
    scene.add(item.flash);
    scene.add(item.sparkGroup);
    
    // Reset animation state
    item.opacity = 1;
    
    // Add to active list for animation
    activeLightningArcs.push(item);
}

// ==================== FPS INSTANT HIT SYSTEM ====================
// When crosshair is on a fish in FPS mode, register hit immediately
// Visual bullet still travels to the fish for satisfying feedback

// Temp vectors for instant hit detection
const instantHitTempVectors = {
    fishToRay: new THREE.Vector3(),
    closestPoint: new THREE.Vector3()
};

// Maximum range for all weapons (based on farthest fish distance)
const FPS_MAX_RANGE = 2000;

// Crosshair tolerance radius for hit detection (in world units)
// This makes it easier to hit fish - the ray doesn't need to be exactly on the fish center
const CROSSHAIR_HIT_TOLERANCE = 5;

/**
 * Check if crosshair is aimed at a fish in FPS mode
 * Returns the closest fish hit by the crosshair ray, or null if no fish
 * @param {THREE.Vector3} origin - Ray origin (camera position or muzzle)
 * @param {THREE.Vector3} direction - Ray direction (camera forward)
 * @returns {Object|null} - { fish, distance, hitPoint } or null
 */
function checkCrosshairFishHit(origin, direction) {
    let closestHit = null;
    let closestDistance = Infinity;
    
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        
        const fishPos = fish.group.position;
        const halfExt = fish.ellipsoidHalfExtents;
        const fishYaw = fish._currentYaw || 0;
        
        instantHitTempVectors.fishToRay.copy(fishPos).sub(origin);
        const tProj = instantHitTempVectors.fishToRay.dot(direction);
        
        if (tProj < 50) continue;
        if (tProj > FPS_MAX_RANGE) continue;
        
        if (halfExt) {
            const result = rayHitsEllipsoid(origin, direction, fishPos, halfExt, fishYaw, CROSSHAIR_HIT_TOLERANCE);
            if (result.hit && result.t >= 50 && result.t < closestDistance) {
                closestDistance = result.t;
                instantHitTempVectors.closestPoint.copy(direction).multiplyScalar(result.t).add(origin);
                closestHit = {
                    fish: fish,
                    distance: result.t,
                    hitPoint: instantHitTempVectors.closestPoint.clone()
                };
            }
        } else {
            instantHitTempVectors.closestPoint.copy(direction).multiplyScalar(tProj).add(origin);
            const distanceToRay = fishPos.distanceTo(instantHitTempVectors.closestPoint);
            const fishRadius = fish.boundingRadius;
            if (distanceToRay <= fishRadius + CROSSHAIR_HIT_TOLERANCE) {
                if (tProj < closestDistance) {
                    closestDistance = tProj;
                    closestHit = {
                        fish: fish,
                        distance: tProj,
                        hitPoint: instantHitTempVectors.closestPoint.clone()
                    };
                }
            }
        }
    }
    
    return closestHit;
}

/**
 * Fire with instant hit detection for FPS mode
 * If crosshair is on a fish, register hit immediately and spawn visual bullet
 * If no fish, fire normal bullet to max range
 * 
 * AIM CONVERGENCE SYSTEM:
 * Bullet spawns from gun muzzle but angles toward a convergence point on the camera ray.
 * This eliminates parallax error caused by muzzle offset from camera.
 * - If raycast hits fish: target = fish position
 * - If raycast misses: target = camera position + (camera forward * 30 units)
 * 
 * @param {THREE.Vector3} muzzlePos - Muzzle position
 * @param {THREE.Vector3} direction - Firing direction (camera forward)
 * @param {string} weaponKey - Current weapon key
 * @returns {boolean} - Whether a fish was hit instantly
 */
function fireWithConvergentDirection(muzzlePos, direction, weaponKey, spreadIndex) {
    const weapon = CONFIG.weapons[weaponKey];
    const AIM_CONVERGENCE_DIST = weapon.convergenceDistance || 1400;
    
    const cameraPos = camera.position.clone();
    const convergenceTarget = cameraPos.clone().addScaledVector(direction, AIM_CONVERGENCE_DIST);
    
    let convergentDirection = new THREE.Vector3().subVectors(convergenceTarget, muzzlePos).normalize();
    
    const dot = convergentDirection.dot(direction);
    if (dot < 0) {
        convergentDirection = direction.clone();
    }
    
    spawnBulletFromDirection(muzzlePos, convergentDirection, weaponKey, spreadIndex);
    return false;
}

/**
 * Spawn a visual-only bullet that travels to a specific point
 * Used for instant hit feedback - the bullet doesn't do damage
 * @param {THREE.Vector3} origin - Starting position
 * @param {THREE.Vector3} targetPoint - Target position
 * @param {string} weaponKey - Weapon key for visual style
 */
function spawnVisualBullet(origin, targetPoint, weaponKey) {
    // Calculate direction from origin to target
    const direction = new THREE.Vector3().subVectors(targetPoint, origin).normalize();
    
    // Spawn a normal bullet - it will travel toward the target
    // The fish is already dead/damaged, so collision won't double-count
    const bullet = spawnBulletFromDirection(origin, direction, weaponKey);
    
    // Mark bullet as visual-only (optional - for future optimization)
    if (bullet) {
        bullet.isVisualOnly = true;
        // Set a shorter lifetime based on distance to target
        const distance = origin.distanceTo(targetPoint);
        const weapon = CONFIG.weapons[weaponKey];
        bullet.lifetime = Math.min(bullet.lifetime, distance / weapon.speed + 0.1);
    }
}

/**
 * Spawn a visual-only bullet with convergent trajectory (Aim Convergence System)
 * Bullet spawns from muzzle and travels along the pre-calculated convergent direction
 * Used for FPS instant hit feedback with parallax correction
 * @param {THREE.Vector3} origin - Starting position (muzzle)
 * @param {THREE.Vector3} targetPoint - Target position (fish hit point)
 * @param {THREE.Vector3} convergentDirection - Pre-calculated direction from muzzle to convergence target
 * @param {string} weaponKey - Weapon key for visual style
 */
function spawnVisualBulletConvergent(origin, targetPoint, convergentDirection, weaponKey) {
    // Spawn a normal bullet using the convergent direction
    // The fish is already dead/damaged, so collision won't double-count
    const bullet = spawnBulletFromDirection(origin, convergentDirection, weaponKey);
    
    // Mark bullet as visual-only (optional - for future optimization)
    if (bullet) {
        bullet.isVisualOnly = true;
        // Set a shorter lifetime based on distance to target
        const distance = origin.distanceTo(targetPoint);
        const weapon = CONFIG.weapons[weaponKey];
        bullet.lifetime = Math.min(bullet.lifetime, distance / weapon.speed + 0.1);
    }
}


// ==================== HITSCAN SYSTEM ====================
// All weapons (1x, 3x, 5x, 8x) use instant Raycaster-based hit detection.
// No physical bullet travel - damage is resolved immediately on the frame the shot fires.
// Visual tracer beams provide feedback from muzzle to hit/max-range point.

const hitscanTempVectors = {
    rayDir: new THREE.Vector3(),
    rayEnd: new THREE.Vector3(),
    hitPos: new THREE.Vector3(),
    fishToRay: new THREE.Vector3(),
    closestPoint: new THREE.Vector3(),
};

function fireHitscanRay(origin, direction, weaponKey, spreadIndex) {
    const weapon = CONFIG.weapons[weaponKey];
    const damage = weapon.damage || 100;
    const maxRange = 3000;
    const dir = hitscanTempVectors.rayDir.copy(direction).normalize();

    const hitOrigin = (gameState.viewMode === 'fps') ? camera.position : origin;

    let closestHit = null;
    let closestT = Infinity;

    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        const fishPos = fish.group.position;
        const halfExt = fish.ellipsoidHalfExtents;
        const fishYaw = fish._currentYaw || 0;

        let result;
        if (halfExt) {
            result = rayHitsEllipsoid(hitOrigin, dir, fishPos, halfExt, fishYaw, 8);
        } else {
            const fishRadius = fish.boundingRadius;
            hitscanTempVectors.fishToRay.copy(fishPos).sub(hitOrigin);
            const t = hitscanTempVectors.fishToRay.dot(dir);
            if (t < 5) continue;
            hitscanTempVectors.closestPoint.copy(dir).multiplyScalar(t).add(hitOrigin);
            const distToRay = fishPos.distanceTo(hitscanTempVectors.closestPoint);
            result = distToRay <= fishRadius ? { hit: true, t: t } : { hit: false, t: -1 };
        }

        if (result.hit && result.t >= 5 && result.t < closestT) {
            closestT = result.t;
            closestHit = fish;
        }
    }

    const beamEnd = hitscanTempVectors.rayEnd.copy(dir).multiplyScalar(closestHit ? closestT : maxRange).add(hitOrigin);
    const hitPoint = closestHit ? beamEnd.clone() : null;

    if (closestHit && !multiplayerMode) {
        if (weapon.type === 'rocket') {
            triggerExplosion(beamEnd.clone(), weaponKey);
            triggerScreenShakeWithStrength(6, 80);
        } else if (weapon.type === 'spread') {
            closestHit.takeDamage(damage, weaponKey, spreadIndex);
            createHitParticles(beamEnd, weapon.color, 5);
            spawnWeaponHitEffect(weaponKey, beamEnd.clone(), closestHit, dir);
            playWeaponHitSound(weaponKey);
        } else {
            closestHit.takeDamage(damage, weaponKey, spreadIndex);
            createHitParticles(beamEnd, weapon.color, 5);
            spawnWeaponHitEffect(weaponKey, beamEnd.clone(), closestHit, dir);
            playWeaponHitSound(weaponKey);
        }
    } else if (closestHit && multiplayerMode) {
        closestHit.takeDamage(damage, weaponKey, spreadIndex);
        createHitParticles(beamEnd, weapon.color, 5);
        playWeaponHitSound(weaponKey);
    }

    spawnTracerBeamVFX(origin, closestHit ? beamEnd.clone() : beamEnd.clone(), weapon.color, weaponKey);

    return { hit: !!closestHit, fish: closestHit, hitPoint: hitPoint, beamEnd: beamEnd.clone() };
}

function spawnTracerBeamVFX(muzzlePos, beamEnd, color, weaponKey) {
    const beamDir = new THREE.Vector3().subVectors(beamEnd, muzzlePos);
    const beamLength = beamDir.length();
    if (beamLength < 1) return;
    const beamMid = new THREE.Vector3().addVectors(muzzlePos, beamEnd).multiplyScalar(0.5);

    const coreGeo = new THREE.CylinderGeometry(1.5, 1.5, beamLength, 6, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(beamMid);
    core.lookAt(beamEnd);
    core.rotateX(Math.PI / 2);
    scene.add(core);

    const glowGeo = new THREE.CylinderGeometry(5, 5, beamLength, 6, 1);
    const glowMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(beamMid);
    glow.lookAt(beamEnd);
    glow.rotateX(Math.PI / 2);
    scene.add(glow);

    addVfxEffect({
        type: 'hitscanTracer',
        core, glow, coreGeo, coreMat, glowGeo, glowMat,
        duration: 60,
        update(dt, elapsed) {
            const progress = elapsed / this.duration;
            this.coreMat.opacity = 0.85 * Math.max(0, 1.0 - progress * 4);
            this.glowMat.opacity = 0.35 * Math.max(0, 1.0 - progress * 3.5);
            const shrink = 1.0 - progress * 0.7;
            this.core.scale.set(shrink, 1, shrink);
            return progress < 1;
        },
        cleanup() {
            scene.remove(this.core);
            scene.remove(this.glow);
            this.coreGeo.dispose();
            this.coreMat.dispose();
            this.glowGeo.dispose();
            this.glowMat.dispose();
        }
    });
}

// ==================== 8X LASER WEAPON ====================
// Pure crosshair-based hitscan laser - instant ray along crosshair direction
// Now NON-PIERCING: hits only the first target (closest fish along the ray)
const laserTempVectors = {
    rayEnd: new THREE.Vector3(),
    fishToRay: new THREE.Vector3(),
    closestPoint: new THREE.Vector3()
};

const activeLaserBeams = [];

function fireLaserBeam(origin, direction, weaponKey) {
    const weapon = CONFIG.weapons[weaponKey];
    const damage = weapon.damage || 350;
    const maxRange = 3000;
    
    const laserDirection = direction.clone().normalize();
    
    const hitOrigin = (gameState.viewMode === 'fps') ? camera.position.clone() : origin;
    
    laserTempVectors.rayEnd.copy(laserDirection).multiplyScalar(maxRange).add(hitOrigin);
    
    const hitFish = [];
    
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        
        const fishPos = fish.group.position;
        const halfExt = fish.ellipsoidHalfExtents;
        const fishYaw = fish._currentYaw || 0;
        
        if (halfExt) {
            const result = rayHitsEllipsoid(hitOrigin, laserDirection, fishPos, halfExt, fishYaw, 8);
            if (result.hit && result.t >= 5) {
                laserTempVectors.closestPoint.copy(laserDirection).multiplyScalar(result.t).add(hitOrigin);
                hitFish.push({
                    fish: fish,
                    distance: result.t,
                    hitPoint: laserTempVectors.closestPoint.clone()
                });
            }
        } else {
            const fishRadius = fish.boundingRadius;
            laserTempVectors.fishToRay.copy(fishPos).sub(hitOrigin);
            const t = laserTempVectors.fishToRay.dot(laserDirection);
            if (t < 5) continue;
            laserTempVectors.closestPoint.copy(laserDirection).multiplyScalar(t).add(hitOrigin);
            const distanceToRay = fishPos.distanceTo(laserTempVectors.closestPoint);
            if (distanceToRay <= fishRadius) {
                hitFish.push({
                    fish: fish,
                    distance: t,
                    hitPoint: laserTempVectors.closestPoint.clone()
                });
            }
        }
    }
    
    hitFish.sort((a, b) => a.distance - b.distance);
    
    const pierceTargets = hitFish.slice(0, RTP_LASER_MAX_TARGETS);
    
    if (pierceTargets.length > 0 && !multiplayerMode) {
        const rtpHitList = pierceTargets.map((h, i) => ({
            fishId: h.fish.rtpFishId,
            tier: h.fish.rtpTier,
            distance: i + 1
        }));
        const results = clientRTPEngine.handleMultiTargetHit(
            CLIENT_RTP_PLAYER_ID, rtpHitList, weaponKey, 'laser', gameState.autoShoot
        );
        for (let i = 0; i < pierceTargets.length; i++) {
            const hit = pierceTargets[i];
            hit.fish.hp -= damage;
            hit.fish.flashHit();
            showCrosshairRingFlash();
            createHitParticles(hit.hitPoint, weapon.color, 12);
            playWeaponHitSound(weaponKey);
            if (i < results.length) {
                const result = results[i];
                if (result && result.kill && hit.fish.isActive) {
                    hit.fish.die(weaponKey, result.reward, result.rewardFp);
                }
            }
        }
    } else if (pierceTargets.length > 0) {
        for (const hit of pierceTargets) {
            hit.fish.takeDamage(damage, weaponKey);
            createHitParticles(hit.hitPoint, weapon.color, 12);
            playWeaponHitSound(weaponKey);
        }
    }
    
    const hitPoints = pierceTargets.map(h => h.hitPoint);
    spawnLaserHitscanVFX(origin, laserTempVectors.rayEnd.clone(), hitPoints, weapon.color);
    triggerScreenShakeWithStrength(8, 100);
}

// Hitscan laser VFX: visual beam from muzzle to hit point + muzzle flash + per-hit sparks
function spawnLaserHitscanVFX(muzzlePos, beamEnd, hitPoints, color) {
    const flashRadius = 30;
    
    const muzzleFlashGeometry = new THREE.SphereGeometry(flashRadius, 16, 16);
    const muzzleFlashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95
    });
    const muzzleFlash = new THREE.Mesh(muzzleFlashGeometry, muzzleFlashMaterial);
    muzzleFlash.position.copy(muzzlePos);
    scene.add(muzzleFlash);
    
    const glowGeometry = new THREE.SphereGeometry(flashRadius * 2, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.5
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    glowSphere.position.copy(muzzlePos);
    scene.add(glowSphere);
    
    const beamDir = new THREE.Vector3().subVectors(beamEnd, muzzlePos);
    const beamLength = beamDir.length();
    const beamMid = new THREE.Vector3().addVectors(muzzlePos, beamEnd).multiplyScalar(0.5);
    
    const coreRadius = 2;
    const beamCoreGeo = new THREE.CylinderGeometry(coreRadius, coreRadius, beamLength, 8, 1);
    const beamCoreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95
    });
    const beamCore = new THREE.Mesh(beamCoreGeo, beamCoreMat);
    beamCore.position.copy(beamMid);
    beamCore.lookAt(beamEnd);
    beamCore.rotateX(Math.PI / 2);
    scene.add(beamCore);
    
    const glowRadius = 8;
    const beamGlowGeo = new THREE.CylinderGeometry(glowRadius, glowRadius, beamLength, 8, 1);
    const beamGlowMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const beamGlow = new THREE.Mesh(beamGlowGeo, beamGlowMat);
    beamGlow.position.copy(beamMid);
    beamGlow.lookAt(beamEnd);
    beamGlow.rotateX(Math.PI / 2);
    scene.add(beamGlow);
    
    const outerRadius = 18;
    const beamOuterGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, beamLength, 8, 1);
    const beamOuterMat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const beamOuter = new THREE.Mesh(beamOuterGeo, beamOuterMat);
    beamOuter.position.copy(beamMid);
    beamOuter.lookAt(beamEnd);
    beamOuter.rotateX(Math.PI / 2);
    scene.add(beamOuter);
    
    const impactFlashGeo = new THREE.SphereGeometry(20, 12, 12);
    const impactFlashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9
    });
    const impactFlash = new THREE.Mesh(impactFlashGeo, impactFlashMat);
    impactFlash.position.copy(beamEnd);
    scene.add(impactFlash);
    
    const allSparks = [];
    const sparkGeometry = new THREE.SphereGeometry(3, 6, 6);
    const brightRed = 0xff0000;
    
    for (const hitPt of hitPoints) {
        const sparkCount = 12;
        for (let i = 0; i < sparkCount; i++) {
            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: i % 3 === 0 ? 0xffffff : brightRed,
                transparent: true, opacity: 1.0
            });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            spark.position.copy(hitPt);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 150 + Math.random() * 250;
            spark.userData = {
                velocity: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta) * speed,
                    Math.sin(phi) * Math.sin(theta) * speed,
                    Math.cos(phi) * speed
                ),
                material: sparkMaterial
            };
            scene.add(spark);
            allSparks.push(spark);
        }
    }
    
    addVfxEffect({
        type: 'laserHitscan',
        muzzleFlash, glowSphere, allSparks,
        beamCore, beamGlow, beamOuter, impactFlash,
        muzzleFlashGeometry, muzzleFlashMaterial,
        glowGeometry, glowMaterial,
        beamCoreGeo, beamCoreMat,
        beamGlowGeo, beamGlowMat,
        beamOuterGeo, beamOuterMat,
        impactFlashGeo, impactFlashMat,
        sparkGeometry,
        duration: 350,
        
        update(dt, elapsed) {
            const progress = elapsed / this.duration;
            
            const muzzleFade = Math.max(0, 1.0 - progress * 5);
            this.muzzleFlashMaterial.opacity = 0.95 * muzzleFade;
            const muzzleScale = 1.0 + progress * 2;
            this.muzzleFlash.scale.set(muzzleScale, muzzleScale, muzzleScale);
            
            this.glowMaterial.opacity = 0.5 * Math.max(0, 1.0 - progress * 3);
            const glowScale = 1.0 + progress * 3;
            this.glowSphere.scale.set(glowScale, glowScale, glowScale);
            
            const beamFade = Math.max(0, 1.0 - progress * 4);
            this.beamCoreMat.opacity = 0.95 * beamFade;
            this.beamGlowMat.opacity = 0.4 * beamFade;
            this.beamOuterMat.opacity = 0.12 * beamFade;
            const beamShrink = 1.0 - progress * 0.3;
            this.beamCore.scale.set(beamShrink, 1, beamShrink);
            this.beamGlow.scale.set(1.0 + progress * 0.5, 1, 1.0 + progress * 0.5);
            
            const impactFade = Math.max(0, 1.0 - progress * 3);
            this.impactFlashMat.opacity = 0.9 * impactFade;
            const impactScale = 1.0 + progress * 4;
            this.impactFlash.scale.set(impactScale, impactScale, impactScale);
            
            for (const spark of this.allSparks) {
                const vel = spark.userData.velocity;
                spark.position.x += vel.x * dt;
                spark.position.y += vel.y * dt - 150 * dt;
                spark.position.z += vel.z * dt;
                vel.multiplyScalar(0.96);
                spark.userData.material.opacity = 1.0 * (1.0 - progress);
                const sScale = 1.0 - progress * 0.8;
                spark.scale.set(sScale, sScale, sScale);
            }
            
            return progress < 1;
        },
        
        cleanup() {
            scene.remove(this.muzzleFlash);
            scene.remove(this.glowSphere);
            scene.remove(this.beamCore);
            scene.remove(this.beamGlow);
            scene.remove(this.beamOuter);
            scene.remove(this.impactFlash);
            for (const spark of this.allSparks) {
                scene.remove(spark);
                spark.userData.material.dispose();
            }
            this.muzzleFlashGeometry.dispose();
            this.muzzleFlashMaterial.dispose();
            this.glowGeometry.dispose();
            this.glowMaterial.dispose();
            this.beamCoreGeo.dispose();
            this.beamCoreMat.dispose();
            this.beamGlowGeo.dispose();
            this.beamGlowMat.dispose();
            this.beamOuterGeo.dispose();
            this.beamOuterMat.dispose();
            this.impactFlashGeo.dispose();
            this.impactFlashMat.dispose();
            this.sparkGeometry.dispose();
        }
    });
}

function triggerExplosion(center, weaponKey) {
    playSound('explosion');
    
    const weapon = CONFIG.weapons[weaponKey];
    const aoeRadius = weapon.aoeRadius || 150;
    const damageCenter = weapon.damage || 250;
    const damageEdge = weapon.damageEdge || 100;
    
    spawnExplosionEffect(center, aoeRadius, weapon.color);
    
    const hitFishList = [];
    for (const fish of activeFish) {
        if (!fish.isActive) continue;
        const distance = center.distanceTo(fish.group.position);
        if (distance <= aoeRadius) {
            hitFishList.push({ fish, distance });
        }
    }
    
    if (hitFishList.length === 0) return;
    
    let hitAny = false;
    
    if (!multiplayerMode) {
        const rtpHitList = hitFishList.map(h => ({
            fishId: h.fish.rtpFishId,
            tier: h.fish.rtpTier,
            distance: h.distance
        }));
        const results = clientRTPEngine.handleMultiTargetHit(
            CLIENT_RTP_PLAYER_ID, rtpHitList, weaponKey, 'aoe', gameState.autoShoot
        );
        for (let i = 0; i < hitFishList.length; i++) {
            const fish = hitFishList[i].fish;
            
            if (i < results.length) {
                const t = hitFishList[i].distance / aoeRadius;
                const damage = Math.floor(damageCenter - (damageCenter - damageEdge) * t);
                fish.hp -= damage;
                fish.flashHit();
                showCrosshairRingFlash();
                createHitParticles(fish.group.position, weapon.color, 3);
                hitAny = true;
                
                const result = results[i];
                if (result && result.kill && fish.isActive) {
                    fish.die(weaponKey, result.reward, result.rewardFp);
                }
            } else {
                createHitParticles(fish.group.position, '#888888', 1);
            }
        }
    } else {
        for (const h of hitFishList) {
            const t = h.distance / aoeRadius;
            const damage = Math.floor(damageCenter - (damageCenter - damageEdge) * t);
            h.fish.takeDamage(damage, weaponKey);
            createHitParticles(h.fish.group.position, weapon.color, 3);
            hitAny = true;
        }
    }
    
    if (hitAny) {
        playWeaponHitSound(weaponKey);
    }
}

// Spawn explosion visual effect
// FIX: Removed ring effect (user feedback: remove all ring effects)
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
    
    // FIX: Removed TorusGeometry ring effect (user feedback: remove all ring effects)
    
    // Animate expansion
    let scale = 1;
    let opacity = 0.6;
    const maxScale = radius;
    
    const animate = () => {
        scale += radius * 0.08;
        opacity -= 0.05;
        
        explosion.scale.set(scale, scale, scale);
        explosion.material.opacity = Math.max(0, opacity);
        
        if (opacity > 0 && scale < maxScale) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(explosion);
            geometry.dispose();
            material.dispose();
        }
    };
    
    animate();
    
    // Spawn burst particles
    createHitParticles(center, color, 20);
    createHitParticles(center, 0xffaa00, 15);
}

// ==================== BALANCE AIRFLOW (CSS-only) ====================
let _airflowGainTimer = null;

function _triggerAirflowGain() {
    const bd = document.getElementById('balance-display');
    if (!bd) return;
    bd.classList.remove('balance-gain');
    void bd.offsetWidth;
    bd.classList.add('balance-gain');
    if (_airflowGainTimer) clearTimeout(_airflowGainTimer);
    _airflowGainTimer = setTimeout(() => {
        bd.classList.remove('balance-gain');
        _airflowGainTimer = null;
    }, 1500);
}

// ==================== UI FUNCTIONS ====================
let _lastBalanceForFlash = null;
function updateUI() {
    const balanceEl = document.getElementById('balance-value');
    const newBalance = String(Math.round(gameState.balance / BALANCE_SCALE));
    balanceEl.textContent = newBalance;
    
    if (_lastBalanceForFlash !== null && _lastBalanceForFlash !== newBalance) {
        const bd = document.getElementById('balance-display');
        if (bd) {
            bd.classList.add('balance-flash');
            setTimeout(() => bd.classList.remove('balance-flash'), 400);
        }
        const newVal = parseFloat(newBalance);
        const oldVal = parseFloat(_lastBalanceForFlash);
        if (newVal > oldVal) _triggerAirflowGain();
    }
    _lastBalanceForFlash = newBalance;
    
    const fpsEl = document.getElementById('fps-counter');
    if (fpsEl) fpsEl.textContent = `FPS: ${Math.round(1 / deltaTime) || 60}`;
    updateDigiAmmoDisplay();
}

function selectWeapon(weaponKey) {
    if (!gameState.weaponSelected) return;
    
    applyWeaponToCannon(weaponKey);
    
    playSound('weaponSwitch');
    
    if (gameState.viewMode === 'fps') {
        updateFPSCamera();
    }
    
    playWeaponSwitchAnimation(weaponKey);
}

function createTechCircleSVG(size) {
    var s = size || 48;
    var c = s / 2, r = s * 14 / 48;
    var col = 'rgba(0,255,200,';
    var sw = s / 48;
    var d = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" class="tech-circle-svg" style="overflow:visible;filter:drop-shadow(0 0 3px ' + col + '0.4));">';
    d += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + col + '0.45)" stroke-width="' + (1 * sw).toFixed(2) + '"/>';
    var cardinals = [[c, c - r + 3 * sw, c, c - r - 5 * sw], [c + r - 3 * sw, c, c + r + 5 * sw, c], [c, c + r - 3 * sw, c, c + r + 5 * sw], [c - r + 3 * sw, c, c - r - 5 * sw, c]];
    for (var i = 0; i < cardinals.length; i++) {
        var p = cardinals[i];
        d += '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + p[2].toFixed(1) + '" y2="' + p[3].toFixed(1) + '" stroke="' + col + '0.85)" stroke-width="' + (1.5 * sw).toFixed(2) + '"/>';
    }
    var diags = [45, 135, 225, 315];
    for (var j = 0; j < diags.length; j++) {
        var rad = (diags[j] - 90) * Math.PI / 180;
        d += '<line x1="' + (c + Math.cos(rad) * (r - 1 * sw)).toFixed(1) + '" y1="' + (c + Math.sin(rad) * (r - 1 * sw)).toFixed(1) + '" x2="' + (c + Math.cos(rad) * (r + 3 * sw)).toFixed(1) + '" y2="' + (c + Math.sin(rad) * (r + 3 * sw)).toFixed(1) + '" stroke="' + col + '0.35)" stroke-width="' + (0.8 * sw).toFixed(2) + '"/>';
    }
    d += '<circle cx="' + c + '" cy="' + c + '" r="' + (1.5 * sw).toFixed(2) + '" fill="#fff" class="tech-dot"/>';
    d += '</svg>';
    return d;
}

function createLaserTechCircleSVG(size) {
    var s = size || 44, c = s / 2, r = s * 13 / 44;
    var sc = s / 44;
    var col = 'rgba(0,255,200,';
    var d = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" class="tech-circle-svg" style="overflow:visible;filter:drop-shadow(0 0 4px ' + col + '0.5));">';
    d += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + col + '0.5)" stroke-width="' + (0.8 * sc).toFixed(2) + '" stroke-dasharray="' + (3 * sc).toFixed(1) + ' ' + (2 * sc).toFixed(1) + '"/>';
    d += '<circle cx="' + c + '" cy="' + c + '" r="' + (r - 4 * sc) + '" fill="none" stroke="' + col + '0.25)" stroke-width="' + (0.6 * sc).toFixed(2) + '"/>';
    var arms = [[c, c - r + 2 * sc, c, c - r - 6 * sc], [c + r - 2 * sc, c, c + r + 6 * sc, c], [c, c + r - 2 * sc, c, c + r + 6 * sc], [c - r + 2 * sc, c, c - r - 6 * sc, c]];
    for (var i = 0; i < arms.length; i++) {
        var p = arms[i];
        d += '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + p[2] + '" y2="' + p[3] + '" stroke="' + col + '0.9)" stroke-width="' + (1.2 * sc).toFixed(2) + '"/>';
    }
    var corners = [45, 135, 225, 315];
    for (var j = 0; j < corners.length; j++) {
        var rad = (corners[j] - 90) * Math.PI / 180;
        var ix = c + Math.cos(rad) * (r - 2 * sc);
        var iy = c + Math.sin(rad) * (r - 2 * sc);
        var ox = c + Math.cos(rad) * (r + 4 * sc);
        var oy = c + Math.sin(rad) * (r + 4 * sc);
        d += '<line x1="' + ix.toFixed(1) + '" y1="' + iy.toFixed(1) + '" x2="' + ox.toFixed(1) + '" y2="' + oy.toFixed(1) + '" stroke="' + col + '0.45)" stroke-width="' + (0.7 * sc).toFixed(2) + '"/>';
    }
    var chevW = 3.5 * sc, chevH = 2 * sc;
    d += '<polyline points="' + (c - chevW) + ',' + (c - r - 3 + chevH) + ' ' + c + ',' + (c - r - 3) + ' ' + (c + chevW) + ',' + (c - r - 3 + chevH) + '" fill="none" stroke="' + col + '0.6)" stroke-width="0.8"/>';
    d += '<polyline points="' + (c - chevW) + ',' + (c + r + 3 - chevH) + ' ' + c + ',' + (c + r + 3) + ' ' + (c + chevW) + ',' + (c + r + 3 - chevH) + '" fill="none" stroke="' + col + '0.6)" stroke-width="0.8"/>';
    d += '<line x1="' + (c - 2 * sc) + '" y1="' + c + '" x2="' + (c + 2 * sc) + '" y2="' + c + '" stroke="' + col + '0.7)" stroke-width="' + (0.8 * sc).toFixed(2) + '"/>';
    d += '<line x1="' + c + '" y1="' + (c - 2 * sc) + '" x2="' + c + '" y2="' + (c + 2 * sc) + '" stroke="' + col + '0.7)" stroke-width="' + (0.8 * sc).toFixed(2) + '"/>';
    d += '<circle cx="' + c + '" cy="' + c + '" r="' + (1 * sc).toFixed(2) + '" fill="rgba(255,255,255,0.9)"/>';
    d += '</svg>';
    return d;
}

const CROSSHAIR_SIZE = 64;

function updateCrosshairForWeapon(weaponKey) {
    const crosshair = document.getElementById('crosshair');
    if (!crosshair) return;
    const sz = CROSSHAIR_SIZE;
    
    const hasFpsMode = crosshair.classList.contains('fps-mode');
    crosshair.className = 'weapon-' + weaponKey;
    if (hasFpsMode) {
        crosshair.classList.add('fps-mode');
    }
    
    crosshair.style.width = sz + 'px';
    crosshair.style.height = sz + 'px';
    if (weaponKey === '8x') {
        crosshair.innerHTML = createLaserTechCircleSVG(sz);
    } else if (weaponKey === '1x' || weaponKey === '3x' || weaponKey === '5x') {
        crosshair.innerHTML = createTechCircleSVG(sz);
    } else {
        crosshair.innerHTML = '<div class="crosshair-dot"></div><div class="crosshair-line top"></div><div class="crosshair-line bottom"></div><div class="crosshair-line left"></div><div class="crosshair-line right"></div>';
    }
    
    const vspread = document.getElementById('crosshair-vspread');
    if (vspread) {
        vspread.style.display = 'none';
    }
    const chCanvas = document.getElementById('crosshair-canvas');
    if (chCanvas) {
        chCanvas.style.display = 'none';
    }
    const sideL = document.getElementById('crosshair-3x-left');
    const sideR = document.getElementById('crosshair-3x-right');
    if (weaponKey === '3x') {
        if (sideL) {
            sideL.style.display = 'block';
            sideL.style.width = sz + 'px';
            sideL.style.height = sz + 'px';
            sideL.innerHTML = createTechCircleSVG(sz);
        }
        if (sideR) {
            sideR.style.display = 'block';
            sideR.style.width = sz + 'px';
            sideR.style.height = sz + 'px';
            sideR.innerHTML = createTechCircleSVG(sz);
        }
        update3xSideCrosshairPositions();
    } else {
        if (sideL) sideL.style.display = 'none';
        if (sideR) sideR.style.display = 'none';
    }
}

function updateSpreadCrosshairPositions() {
    const vspread = document.getElementById('crosshair-vspread');
    if (!vspread) return;
    if (vspread.style.display === 'none') return;
    
    if (gameState.viewMode === 'fps') {
        vspread.style.left = '50%';
        vspread.style.top = '50%';
    } else {
        const mainCH = document.getElementById('crosshair');
        if (mainCH) {
            const mainLeft = parseFloat(mainCH.style.left) || window.innerWidth / 2;
            const mainTop = parseFloat(mainCH.style.top) || window.innerHeight / 2;
            vspread.style.left = mainLeft + 'px';
            vspread.style.top = mainTop + 'px';
        }
    }
}

function showRewardPopup(position, amount) {
    // Disabled: floating reward numbers removed per user request
    return;
}

const KILL_FEED_MAX = 4;
const killFeedRecords = [];

const KILLLOG_IMG_BASE = 'https://pub-7ce92369324549518cd89a6712c6b6e4.r2.dev/Fish%20Model%20Killlog%20pic/';
const FISH_KILLLOG_IMAGES = {
    sardine:     KILLLOG_IMG_BASE + 'Sardine%20fish_killlog.png',
    anchovy:     KILLLOG_IMG_BASE + 'Anchovy_killlog.png',
    clownfish:   KILLLOG_IMG_BASE + 'Clownfish_killlog.png',
    damselfish:  KILLLOG_IMG_BASE + 'Damselfish_killlog.png',
    angelfish:   KILLLOG_IMG_BASE + 'angelfish_killlog.png',
    tang:        KILLLOG_IMG_BASE + 'Blue%20Tang_killlog.png',
    lionfish:    KILLLOG_IMG_BASE + 'lionfish_killlog.png',
    parrotfish:  KILLLOG_IMG_BASE + 'Parrotfish_killlog.png',
    grouper:     KILLLOG_IMG_BASE + 'Grouper%20fish_killlog.png',
    pufferfish:  KILLLOG_IMG_BASE + 'Pufferfish_killlog.png',
    dolphinfish:KILLLOG_IMG_BASE + 'Mahi-Mahi_killlog.png',
    tuna:        KILLLOG_IMG_BASE + 'Yellowfin%20Tuna_killlog.png',
    marlin:      KILLLOG_IMG_BASE + 'Marlin%20fish_killlog.png',
    shark:       KILLLOG_IMG_BASE + 'Great%20White%20Shark_killlog.png',
    hammerhead:  KILLLOG_IMG_BASE + 'Hammerhead%20Shark_killlog.png',
    whale:       KILLLOG_IMG_BASE + 'Blue%20Whale_killlog.png',
    killerWhale: KILLLOG_IMG_BASE + 'Killer%20Whale_killlog.png',
    mantaRay:    KILLLOG_IMG_BASE + 'Manta%20ray_killlog.png',
    seahorse:    KILLLOG_IMG_BASE + 'Seahorse_killlog.png'
};

function formatFishName(form) {
    if (!form) return 'FISH';
    return form.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
}

function addKillFeedEntry(fishForm, rewardAmount) {
    const list = document.getElementById('kill-feed-list');
    if (!list) return;

    let imageUrl = FISH_KILLLOG_IMAGES[fishForm];
    if (!imageUrl) {
        console.warn('[KILL-LOG] Missing icon for fishForm "' + fishForm + '" — expected 19 mapped species. Check FISH_KILLLOG_IMAGES config.');
        imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#ff0040" opacity="0.7"/><text x="16" y="22" text-anchor="middle" font-size="14" fill="#fff">?</text></svg>');
    }
    const name = formatFishName(fishForm);

    killFeedRecords.push({ imageUrl, name, reward: Math.round(rewardAmount) });

    if (killFeedRecords.length > KILL_FEED_MAX) {
        killFeedRecords.shift();
    }

    renderKillFeed();
}

function getKillFeedTier(reward) {
    if (reward >= 200) return 'tier-high';
    if (reward >= 100) return 'tier-mid';
    return 'tier-low';
}

function renderKillFeed() {
    const list = document.getElementById('kill-feed-list');
    if (!list) return;

    const panel = document.getElementById('kill-feed-panel');
    if (panel) {
        panel.style.display = '';
    }

    const countEl = document.getElementById('kill-feed-count');
    if (countEl) {
        countEl.textContent = killFeedRecords.length + '/' + KILL_FEED_MAX;
    }

    list.innerHTML = '';

    const emptySlots = KILL_FEED_MAX - killFeedRecords.length;
    for (let i = 0; i < KILL_FEED_MAX; i++) {
        const recordIdx = i - emptySlots;
        const record = recordIdx >= 0 ? killFeedRecords[recordIdx] : null;
        const entry = document.createElement('div');
        if (record) {
            const tier = getKillFeedTier(record.reward);
            const isLatest = recordIdx === killFeedRecords.length - 1;
            entry.className = 'kill-feed-entry ' + tier + (isLatest ? ' latest' : '');

            const iconEl = document.createElement('div');
            iconEl.className = 'kf-fish-icon';
            if (record.imageUrl) {
                const img = document.createElement('img');
                img.src = record.imageUrl;
                img.alt = record.name;
                img.draggable = false;
                iconEl.appendChild(img);
            } else {
                iconEl.textContent = '\u{1F41F}';
            }

            const info = document.createElement('div');
            info.className = 'kf-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'kf-name';
            nameEl.textContent = record.name;

            const rewardEl = document.createElement('div');
            rewardEl.className = 'kf-reward';
            rewardEl.textContent = '+' + record.reward;

            info.appendChild(nameEl);
            info.appendChild(rewardEl);
            entry.appendChild(iconEl);
            entry.appendChild(info);
        } else {
            entry.className = 'kill-feed-entry';
            entry.style.opacity = '0.2';
            entry.innerHTML = '<div class="kf-fish-icon" style="opacity:0.3">\u2014</div><div class="kf-info"><div class="kf-name" style="opacity:0.3">\u2014</div></div>';
        }
        list.appendChild(entry);
    }
}

function initKillFeedSlots() {
    renderKillFeed();
}

const AMMO_WEAPON_SLOTS = ['1x', '3x', '5x', '8x'];

function updateDigiAmmoDisplay() {
    const weapon = CONFIG.weapons[gameState.currentWeapon];
    if (!weapon) return;
    const ammo = Math.min(99999, Math.max(0, Math.floor(gameState.balance / (weapon.cost * BALANCE_SCALE))));

    // Legacy digi-ammo (kept hidden via CSS but still updated to avoid null refs)
    const currentIdx = AMMO_WEAPON_SLOTS.indexOf(gameState.currentWeapon);
    const mulEl = document.getElementById('ammo-multiplier-text');
    if (mulEl) mulEl.textContent = gameState.currentWeapon.toUpperCase();
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById('ammo-slot-' + i);
        if (!slot) continue;
        slot.classList.remove('active', 'filled');
        if (i === currentIdx) {
            slot.classList.add('active');
        } else if (i < AMMO_WEAPON_SLOTS.length) {
            slot.classList.add('filled');
        }
    }
    const countEl = document.getElementById('ammo-count-text');
    if (countEl) countEl.textContent = ammo + ' ROUNDS';

    // New Arcade Power-Up shot counter strip
    const badgeMult = document.getElementById('weapon-badge-mult');
    if (badgeMult) badgeMult.textContent = gameState.currentWeapon.toLowerCase();
    const digitsStr = String(ammo).padStart(5, '0');
    for (let i = 0; i < 5; i++) {
        const d = document.getElementById('shot-digit-' + i);
        if (!d) continue;
        d.textContent = digitsStr[i];
        d.classList.add('filled');
    }
}


function syncAutoPillUI() {
    const onBtn = document.getElementById('auto-on-btn');
    const offBtn = document.getElementById('auto-off-btn');
    if (onBtn && offBtn) {
        if (gameState.autoShoot) {
            onBtn.classList.add('on');
            offBtn.classList.remove('on');
        } else {
            offBtn.classList.add('on');
            onBtn.classList.remove('on');
        }
    }
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

// ==================== SCOPE OVERLAY ====================
let scopeOverlayEl = null;
const ZOOM_FRAME_SIZES = { S: 300, M: 220, L: 140 };
let zoomFrameInset = ZOOM_FRAME_SIZES.S;

function createScopeOverlay() {
    if (scopeOverlayEl) { scopeOverlayEl.remove(); scopeOverlayEl = null; }
    const el = document.createElement('div');
    el.id = 'scope-overlay';
    el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999;opacity:0;transition:opacity 0.15s ease-in;';
    const vInset = zoomFrameInset;
    const hInset = Math.round(zoomFrameInset * 1.35);
    const cornerLen = 32;
    const thick = 3;
    const color = 'rgba(255,179,71,0.85)';
    const glow = '0 0 6px rgba(255,179,71,0.5)';
    const line = `position:absolute;background:${color};box-shadow:${glow};border-radius:1.5px;`;
    const cWrap = 'position:absolute;width:100%;height:100%;transform:scale(var(--ui-scale,1));';
    el.innerHTML = `
        <div style="${cWrap}top:0;left:0;transform-origin:top left;">
            <div style="${line}top:${vInset}px;left:${hInset}px;width:${cornerLen}px;height:${thick}px;"></div>
            <div style="${line}top:${vInset}px;left:${hInset}px;width:${thick}px;height:${cornerLen}px;"></div>
        </div>
        <div style="${cWrap}top:0;right:0;transform-origin:top right;">
            <div style="${line}top:${vInset}px;right:${hInset}px;width:${cornerLen}px;height:${thick}px;"></div>
            <div style="${line}top:${vInset}px;right:${hInset}px;width:${thick}px;height:${cornerLen}px;"></div>
        </div>
        <div style="${cWrap}bottom:0;left:0;transform-origin:bottom left;">
            <div style="${line}bottom:${vInset}px;left:${hInset}px;width:${cornerLen}px;height:${thick}px;"></div>
            <div style="${line}bottom:${vInset}px;left:${hInset}px;width:${thick}px;height:${cornerLen}px;"></div>
        </div>
        <div style="${cWrap}bottom:0;right:0;transform-origin:bottom right;">
            <div style="${line}bottom:${vInset}px;right:${hInset}px;width:${cornerLen}px;height:${thick}px;"></div>
            <div style="${line}bottom:${vInset}px;right:${hInset}px;width:${thick}px;height:${cornerLen}px;"></div>
        </div>
    `;
    document.body.appendChild(el);
    scopeOverlayEl = el;
    return el;
}

function setZoomFrameSize(size) {
    if (ZOOM_FRAME_SIZES[size]) zoomFrameInset = ZOOM_FRAME_SIZES[size];
    else if (typeof size === 'number') zoomFrameInset = size;
    if (scopeOverlayEl) { scopeOverlayEl.remove(); scopeOverlayEl = null; }
}

function showScopeOverlay() {
    const el = createScopeOverlay();
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    hideRmbZoomHint();
}

function hideScopeOverlay() {
    if (scopeOverlayEl) {
        scopeOverlayEl.style.opacity = '0';
    }
    showRmbZoomHint();
}

let rmbHintEl = null;

function createRmbZoomHint() {
    if (rmbHintEl) return rmbHintEl;
    const el = document.createElement('div');
    el.id = 'rmb-zoom-hint';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%) scale(var(--ui-scale));transform-origin:bottom center;margin-left:390px;display:flex;align-items:center;gap:8px;opacity:0;transition:opacity 0.3s ease;z-index:10001;pointer-events:none;';
    const mouseSvg = `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="25" height="37" rx="12.5" stroke="rgba(0,255,200,0.6)" stroke-width="1.5" fill="none"/>
        <line x1="14" y1="1.5" x2="14" y2="18" stroke="rgba(0,255,200,0.6)" stroke-width="1"/>
        <rect x="14.5" y="3" width="10.5" height="14" rx="4" fill="rgba(0,255,200,0.35)" stroke="rgba(0,255,200,0.7)" stroke-width="1"/>
    </svg>`;
    el.innerHTML = `${mouseSvg}<span style="font:600 12px 'Rajdhani',sans-serif;color:rgba(0,255,200,0.6);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;">RMB: Zoom</span>`;
    document.body.appendChild(el);
    rmbHintEl = el;
    return el;
}

function showRmbZoomHint() {
    const el = createRmbZoomHint();
    el.style.opacity = '1';
}

function hideRmbZoomHint() {
    if (rmbHintEl) {
        rmbHintEl.style.opacity = '0';
    }
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
            const scopeSlowdown = gameState.isScoping ? 0.3 : 1.0;
            const rotationSensitivity = CONFIG.camera.rotationSensitivityFPSBase * (fpsLevel / 10) * 30.0 * 1.2 * scopeSlowdown;
            
            // Calculate new yaw (horizontal rotation)
            // Standard FPS controls: mouse right = view right, mouse left = view left
            // 
            // In Three.js coordinate system:
            // - Positive rotation.y = counter-clockwise rotation (from above) = turn LEFT
            // - Negative rotation.y = clockwise rotation (from above) = turn RIGHT
            // 
            // Mouse movement (per spec):
            // - Positive deltaX/movementX = mouse moved RIGHT
            // - Negative deltaX/movementX = mouse moved LEFT
            // 
            // For standard FPS controls:
            // - Mouse RIGHT (deltaX > 0) -> view turns RIGHT -> yaw should DECREASE
            // - Mouse LEFT (deltaX < 0) -> view turns LEFT -> yaw should INCREASE
            // 
            // Formula: newYaw = currentYaw - deltaX * sensitivity
            // - Mouse RIGHT: newYaw = 0 - (+deltaX) = negative -> turn RIGHT (correct)
            // - Mouse LEFT: newYaw = 0 - (-deltaX) = positive -> turn LEFT (correct)
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
        
    });
    
    // FPS mode: Reset mouse tracking when mouse leaves the container
    // This prevents giant rotation jumps when mouse re-enters
    container.addEventListener('mouseleave', () => {
        if (gameState.viewMode === 'fps') {
            gameState.lastFPSMouseX = null;
            gameState.lastFPSMouseY = null;
        }
    });
    
    // When mouse re-enters the game window in FPS mode:
    // 1. Reset cannon to center (user's preference)
    // 2. Reset FPS mouse tracking
    // 3. The Pointer Lock will be re-requested on next click (see mousedown handler)
    // This prevents the mouse from immediately leaving the window when moved
    container.addEventListener('mouseenter', () => {
        if (gameState.viewMode === 'fps') {
            // Reset cannon to center position
            if (cannonGroup) cannonGroup.rotation.y = 0;
            if (cannonPitchGroup) cannonPitchGroup.rotation.x = 0;
            gameState.fpsYaw = 0;
            gameState.fpsPitch = 0;
            // Update camera to match new cannon position
            updateFPSCamera();
        }
        // Reset FPS mouse tracking to prevent large rotation jumps
        gameState.lastFPSMouseX = null;
        gameState.lastFPSMouseY = null;
    });
    
    // Left click to shoot
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        
        // Don't shoot if clicking on UI elements
        if (e.target.closest('#weapon-panel') || 
            e.target.closest('#auto-shoot-btn') ||
            e.target.closest('#settings-container')) {
            return;
        }
        
        // FPS MODE: Re-request Pointer Lock if it was lost (e.g., user pressed Escape)
        // This prevents the mouse from leaving the window when moved
        // FIX: If pointer is not locked, ONLY lock pointer without firing bullet
        // This prevents players from spending money just to lock the pointer
        if (gameState.viewMode === 'fps' && document.pointerLockElement !== container) {
            if (container.requestPointerLock) {
                container.requestPointerLock();
            }
            return; // Don't fire bullet - just lock pointer
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
    
    // Auto-shoot toggle (legacy button)
    const legacyAutoBtn = document.getElementById('auto-shoot-btn');
    if (legacyAutoBtn) {
        legacyAutoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAutoShoot();
        });
    }
    // Auto-fire pill in new weapon panel
    const autoOnBtn = document.getElementById('auto-on-btn');
    const autoOffBtn = document.getElementById('auto-off-btn');
    if (autoOnBtn) {
        autoOnBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!gameState.autoShoot) toggleAutoShoot();
        });
    }
    if (autoOffBtn) {
        autoOffBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gameState.autoShoot) toggleAutoShoot();
        });
    }
    
    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (_effectComposer) _effectComposer.setSize(window.innerWidth, window.innerHeight);
        if (_bloomPass) _bloomPass.setSize(window.innerWidth, window.innerHeight);
        updateSpreadCrosshairPositions();
    });
    
    // Prevent context menu
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Right-click: scope zoom (hold) + camera drag
    container.addEventListener('mousedown', (e) => {
        if (e.button === 2) {  // Right mouse button
            gameState.isRightDragging = true;
            gameState.rightDragStartX = e.clientX;
            gameState.rightDragStartY = e.clientY;
            if (gameState.viewMode === 'fps') {
                gameState.rightDragStartYaw = cannonGroup ? cannonGroup.rotation.y : 0;
                gameState.rightDragStartPitch = cannonPitchGroup ? cannonPitchGroup.rotation.x : 0;
            } else {
                gameState.rightDragStartYaw = gameState.cameraYaw;
                gameState.rightDragStartPitch = gameState.cameraPitch;
            }
            gameState.isScoping = true;
            gameState.scopeTargetFov = 30;
            showScopeOverlay();
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (gameState.isRightDragging) {
            return;
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) {  // Right mouse button
            gameState.isRightDragging = false;
            gameState.isScoping = false;
            gameState.scopeTargetFov = 60;
            hideScopeOverlay();
        }
    });
    
    // CENTER VIEW button handler
    document.getElementById('center-view-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        centerCameraView();
        updateFPSCamera();
        // FIX: Blur button after click to prevent Space key from re-activating it
        e.currentTarget.blur();
    });
    
    
    // AUTO SHOOT button handler - also blur after click
    const autoShootBtn = document.getElementById('auto-shoot-btn');
    if (autoShootBtn) {
        autoShootBtn.addEventListener('click', (e) => {
            // FIX: Blur button after click to prevent Space key from re-activating it
            e.currentTarget.blur();
        });
    }
    
    // FIX: Prevent Space key from triggering button clicks on keyup
    // Browser default behavior: Space activates focused button on keyup, not keydown
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            e.stopPropagation();
            if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
                document.activeElement.blur();
            }
        }
    }, true);
    
    // Keyboard controls - shortcut system for FPS mode
    window.addEventListener('keydown', (e) => {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }
        
        // Weapon switching: 1-4 keys (also works on weapon picker screen)
        if (e.key === '1') {
            if (!gameState.weaponSelected) { onInitialWeaponSelected('1x'); return; }
            selectWeapon('1x');
            highlightButton('.weapon-btn[data-weapon="1x"]');
            return;
        } else if (e.key === '2') {
            if (!gameState.weaponSelected) { onInitialWeaponSelected('3x'); return; }
            selectWeapon('3x');
            highlightButton('.weapon-btn[data-weapon="3x"]');
            return;
        } else if (e.key === '3') {
            if (!gameState.weaponSelected) { onInitialWeaponSelected('5x'); return; }
            selectWeapon('5x');
            highlightButton('.weapon-btn[data-weapon="5x"]');
            return;
        } else if (e.key === '4') {
            if (!gameState.weaponSelected) { onInitialWeaponSelected('8x'); return; }
            selectWeapon('8x');
            highlightButton('.weapon-btn[data-weapon="8x"]');
            return;
        }
        
        // Function toggle keys
        if (e.key === 'a' || e.key === 'A') {
            toggleAutoShoot();
            highlightButton('#auto-shoot-btn');
            return;
        } else if (e.key === 'c' || e.key === 'C') {
            centerCameraView();
            updateFPSCamera();
            highlightButton('#center-view-btn');
            return;
        } else if (e.key === 't' || e.key === 'T') {
            toggleCannonSide();
            highlightButton('#hand-side-btn');
            return;
        } else if (e.key === 'Escape') {
            if (!gameState.weaponSelected) {
                if (document.pointerLockElement) document.exitPointerLock();
                var container = document.getElementById('game-container');
                if (container) container.classList.remove('fps-hide-cursor');
                document.body.style.cursor = 'default';
                return;
            }
            toggleSettingsPanel();
            highlightButton('#settings-container');
            return;
        } else if (e.key === 'h' || e.key === 'H' || e.key === 'F1') {
            e.preventDefault();
            toggleHelpPanel();
            return;
        }
        
    });
}

// Toggle AUTO shoot mode
function toggleAutoShoot() {
    gameState.autoShoot = !gameState.autoShoot;
    if (!gameState.autoShoot) {
        resetAutoFireState();
    } else {
        resetAutoFireState();
    }
    const btn = document.getElementById('auto-shoot-btn');
    if (btn) {
        btn.textContent = gameState.autoShoot ? 'AUTO ON (A)' : 'AUTO OFF (A)';
        btn.classList.toggle('active', gameState.autoShoot);
    }
    syncAutoPillUI();
    playSound('weaponSwitch');
}

function toggleCannonSide() {
    gameState.fpsCannonSide = gameState.fpsCannonSide === 'right' ? 'left' : 'right';
    if (gameState.viewMode === 'fps') {
        updateFPSCamera();
    }
    playSound('weaponSwitch');
    const btn = document.getElementById('hand-side-btn');
    if (btn) btn.textContent = (gameState.fpsCannonSide === 'right' ? 'RIGHT HAND' : 'LEFT HAND') + ' (T)';
}

// Toggle settings panel
function toggleSettingsPanel() {
    const settingsPanel = document.getElementById('settings-panel');
    if (!settingsPanel) return;
    const nowVisible = settingsPanel.classList.toggle('visible');

    const container = document.getElementById('game-container');

    if (nowVisible) {
        // Enter pause/menu: show cursor and unlock pointer
        gameState.isPaused = true;
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        if (container) container.classList.remove('fps-hide-cursor');
        document.body.style.cursor = 'default';
    } else {
        // Resume game: hide cursor and re-lock pointer (FPS mode only)
        gameState.isPaused = false;
        if (container) container.classList.add('fps-hide-cursor');
        if (gameState.viewMode === 'fps' && gameState.weaponSelected && gameState.isInGameScene && container && container.requestPointerLock) {
            container.requestPointerLock();
        }
        document.body.style.cursor = 'none';
    }
}

// Toggle help panel showing all shortcuts
function toggleHelpPanel() {
    // Ensure help styles exist (re-add CSS dynamically)
    let styleEl = document.getElementById('shortcut-help-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'shortcut-help-styles';
        styleEl.textContent = `
#help-panel { position: fixed; right: 20px; bottom: 140px; background: rgba(0,0,0,0.8); border: 1px solid #3a7; border-radius: 10px; padding: 16px; z-index: 10000; display: none; width: 300px; color: #cceeff; transform: scale(var(--ui-scale)); transform-origin: bottom right; }
#help-panel.visible { display: block; }
#help-panel .help-row { display:flex; align-items:center; gap:15px; padding:6px 0; color:#cceeff; font-size:14px; }
#help-panel .key { background: linear-gradient(180deg,#4488cc,#2266aa); color:#fff; padding:4px 12px; border-radius:6px; font-weight:bold; font-size:12px; min-width:60px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); }
#help-close-btn { margin-top:20px; width:100%; padding:12px; background: linear-gradient(180deg,#4488cc,#2266aa); border:none; border-radius:10px; color:#fff; font-size:14px; font-weight:bold; cursor:pointer; transition: all .3s ease; }
#help-close-btn:hover { background: linear-gradient(180deg,#55aadd,#3388bb); transform: scale(1.02); }
.shortcut-highlight { animation: shortcut-flash 0.2s ease-out; }
@keyframes shortcut-flash { from { filter: brightness(1.2); transform: scale(1.02);} to { filter: brightness(1); transform: scale(1);} }
        `;
        document.head.appendChild(styleEl);
    }
    let helpPanel = document.getElementById('help-panel');
    if (!helpPanel) {
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
                </div>
                <div class="help-section">
                    <h4>Controls</h4>
                    <div class="help-row"><span class="key">A</span> Toggle Auto Fire</div>
                    <div class="help-row"><span class="key">C</span> Center View</div>
                    <div class="help-row"><span class="key">ESC</span> Settings</div>
                    <div class="help-row"><span class="key">H</span> This Help</div>
                </div>
                <button id="help-close-btn">Close (H)</button>
            </div>
        `;
        document.getElementById('ui-overlay').appendChild(helpPanel);
        
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

// Update camera rotation based on yaw and pitch(orbit around cannon at bottom)
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

// Initialize FPS mode with 35 degree upward angle for optimal fish viewing
// Called on game init when viewMode is 'fps'
function initFPSMode() {
    const crosshair = document.getElementById('crosshair');
    
    // FIX: Reset FPS yaw/pitch to ensure camera faces forward on game start
    // This fixes the issue where camera was facing left on initial game entry
    // Initial pitch set to 15 degrees upward for optimal fish viewing (shows fish pool center)
    const FPS_INITIAL_PITCH = 15 * (Math.PI / 180);  // 15 degrees upward
    gameState.fpsYaw = 0;  // Face forward (toward fish pool center)
    gameState.fpsPitch = FPS_INITIAL_PITCH;
    
    // Set up cannon for FPS mode
    if (cannonGroup) {
        cannonGroup.visible = true;
        cannonGroup.scale.set(1.5, 1.5, 1.5);
        cannonGroup.children.forEach(child => {
            if (child.isLight) child.visible = false;
        });
        // FIX: Explicitly reset cannon yaw to 0 (face forward)
        cannonGroup.rotation.y = 0;
    }
    
    // Set initial pitch for cannon (matches camera pitch)
    // cannonPitchGroup.rotation.x is negative of the actual pitch angle
    if (cannonPitchGroup) {
        cannonPitchGroup.rotation.x = -FPS_INITIAL_PITCH;
    }
    
    // Hide mouse cursor in FPS mode
    const container = document.getElementById('game-container');
    if (container) container.classList.add('fps-hide-cursor');
    
    // Request Pointer Lock
    if (container && container.requestPointerLock) {
        container.requestPointerLock();
    }
    
    // Reset FPS mouse tracking
    gameState.lastFPSMouseX = null;
    gameState.lastFPSMouseY = null;
    
    // Wider FOV in FPS mode
    if (camera) {
        camera.fov = 75;
        camera.updateProjectionMatrix();
    }
    
    // FPS MODE: Add CSS class to center crosshair
    if (crosshair) crosshair.classList.add('fps-mode');
    const vspreadInit = document.getElementById('crosshair-vspread');
    if (vspreadInit && gameState.currentWeapon === '3x') vspreadInit.classList.add('fps-mode');
    
    updateCrosshairForWeapon(gameState.currentWeapon || '1x');
    
    // Ensure initial weapon HUD is fully synced (model + crosshair + ammo + button highlight)
    gameState.currentWeapon = gameState.currentWeapon || '1x';
    document.querySelectorAll('.weapon-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.weapon === gameState.currentWeapon) {
            btn.classList.add('active');
        }
    });
    updateDigiAmmoDisplay();
    
    // Update camera position
    updateFPSCamera();
    
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
    // Apply immediately to cannon in FPS mode
    if (cannonGroup) cannonGroup.rotation.y = 0;
    if (cannonPitchGroup) cannonPitchGroup.rotation.x = 0;
    if (gameState.viewMode === 'fps') updateFPSCamera();
}


// FPS Pitch Limits - centralized constants (single source of truth)
// FPS rotation limits - user requested: 180° horizontal, 80° vertical
const FPS_YAW_MAX = 90 * (Math.PI / 180);     // ±90° yaw (180° total horizontal)
const FPS_PITCH_MIN = -47.5 * (Math.PI / 180);  // -47.5° (look down)
const FPS_PITCH_MAX = 75 * (Math.PI / 180);   // +75° (look up) - total 122.5° vertical

// FPS Camera positioning constants (CS:GO style - barrel visible at bottom)
// These are DEFAULT values - per-weapon overrides are in WEAPON_GLB_CONFIG
const FPS_CAMERA_BACK_DIST_DEFAULT = 120;   // Default distance behind muzzle (increased for GLB models)
const FPS_CAMERA_UP_OFFSET_DEFAULT = -30;   // Camera BELOW muzzle level so cannon is visible when looking straight ahead
const FPS_CANNON_SIDE_OFFSET = 5;           // Near-center turret positioning

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
    
    // FIX v6: Use FIXED camera Y position based on constants to GUARANTEE no accumulation
    // The camera height was accumulating because the muzzle world position calculation was
    // getting corrupted during rapid weapon switching. This fix uses a FIXED Y position
    // based on known constants, completely bypassing any scene hierarchy calculations.
    //
    // Key insight: The only way to guarantee no accumulation is to use FIXED values
    // that don't depend on any scene hierarchy calculations.
    //
    // Known constants:
    // - CANNON_BASE_Y = -337.5 (cannon base position)
    // - cannonPitchGroup.position.y = 25 (pitch pivot height)
    // - cannonMuzzle.position.y = 25 (muzzle height relative to pitch group)
    // - Total muzzle Y = -337.5 + 35 + 25 = -277.5
    
    const currentWeaponKey = weaponGLBState.currentWeaponKey || '1x';
    const weaponConfig = WEAPON_GLB_CONFIG.weapons[currentWeaponKey];
    
    // Get cannon base position for X and Z (this is stable)
    const cannonBasePos = new THREE.Vector3();
    cannonGroup.getWorldPosition(cannonBasePos);
    
    // Use per-weapon camera offsets from WEAPON_GLB_CONFIG
    const cameraBackDist = weaponConfig?.fpsCameraBackDist || FPS_CAMERA_BACK_DIST_DEFAULT;
    const cameraUpOffset = weaponConfig?.fpsCameraUpOffset || FPS_CAMERA_UP_OFFSET_DEFAULT;
    
    // Calculate back offset in world space (only affects X and Z)
    const backwardDir = forward.clone().negate();
    const backOffset = backwardDir.multiplyScalar(cameraBackDist);
    
    // Calculate horizontal (right) vector for left/right hand offset
    // Right vector = cross(forward, up) in the horizontal plane
    const rightX = Math.sin(yaw - Math.PI / 2);
    const rightZ = Math.cos(yaw - Math.PI / 2);
    const sideOffsetX = rightX * FPS_CANNON_SIDE_OFFSET * -1;
    const sideOffsetZ = rightZ * FPS_CANNON_SIDE_OFFSET * -1;
    
    // FIXED camera Y position based on constants - NEVER accumulates
    // Base Y (-337.5) + pitch pivot (35) + actual muzzle Y offset (from weapon GLB config)
    const muzzleYOffset = cannonMuzzle ? cannonMuzzle.position.y : 25;
    const FIXED_MUZZLE_Y = -337.5 + 35 + muzzleYOffset;
    const cameraY = FIXED_MUZZLE_Y + cameraUpOffset;
    
    // Set camera position with FIXED Y + side offset for left/right hand
    camera.position.set(
        cannonBasePos.x + backOffset.x + sideOffsetX,
        cameraY + backOffset.y,
        cannonBasePos.z + backOffset.z + sideOffsetZ
    );
    
    // Always keep camera upright in world space (locked to world Y axis)
    // This MUST be set before lookAt() to prevent roll
    camera.up.set(0, 1, 0);
    
    // Look at a point in front of the camera along the forward direction
    // IMPORTANT: Use the same pitch as cannon (no offset) to ensure "what you see is what you can shoot"
    // The +0.1 offset was causing the camera to look ~5.7° higher than the cannon,
    // making 80° pitch appear like ~86° visually (almost 90° top-down view)
    
    // Apply FPS camera recoil offset (visual feedback only, doesn't affect aiming)
    // This creates a "kick up" effect when firing without moving the actual aim point
    let lookForward = forward.clone();
    if (fpsCameraRecoilState.active && fpsCameraRecoilState.pitchOffset !== 0) {
        // Apply pitch offset to the look direction (kick up = positive pitch offset)
        const recoilPitch = pitch + fpsCameraRecoilState.pitchOffset;
        lookForward.set(
            Math.cos(recoilPitch) * Math.sin(yaw),
            Math.sin(recoilPitch),
            Math.cos(recoilPitch) * Math.cos(yaw)
        );
    }
    
    const lookTarget = camera.position.clone().add(lookForward.multiplyScalar(1000));
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
            transform: scale(var(--ui-scale));
            transform-origin: top left;
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
// PERFORMANCE FIX: Guard flag to prevent multiple main animate loops
let gameLoopStarted = false;

function animate() {
    // PERFORMANCE FIX: Prevent multiple main loops from running simultaneously
    // This can happen if animate() is called multiple times before the first frame
    if (gameLoopStarted) {
        // Already running - schedule next frame and continue
        requestAnimationFrame(animate);
    } else {
        gameLoopStarted = true;
        console.log('[PERF] Main game loop started');
        requestAnimationFrame(animate);
        return; // First call just starts the loop
    }
    
    const currentTime = performance.now();
    deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    
    if (gameState.isLoading || gameState.isPaused) return;
    
    // Update cooldown
    if (gameState.cooldown > 0) {
        gameState.cooldown -= deltaTime;
    }
    
    // PERFORMANCE: Update barrel recoil in animation loop (replaces setTimeout)
    updateBarrelRecoil();
    
    // Update FPS camera recoil (visual pitch kick effect)
    updateFPSCameraRecoil();
    
    // Update sci-fi base ring animation (rotation + pulse)
    updateSciFiBaseRing(currentTime / 1000);  // Convert to seconds
    
    // Update decorative cannon rings animation
    updateStaticCannonRings(currentTime / 1000);
    
    // Update floating underwater particles for dynamic atmosphere
    updateUnderwaterParticles(deltaTime);
    
    // Update PUBG-style smoke effects for fish death
    updateSmokeEffects(deltaTime);
    
    // Update panorama sky-sphere animation (slow rotation + bobbing)
    updatePanoramaAnimation(deltaTime);
    
    updateGodRays(currentTime / 1000);
    updateGodRayParticles(currentTime / 1000, deltaTime);
    updateDustParticles(currentTime / 1000, deltaTime);
    updateCaustics(currentTime / 1000);
    updatePostProcessing(currentTime / 1000);
    
    // Smooth camera transitions (for CENTER VIEW button and auto-panning)
    updateSmoothCameraTransition(deltaTime);
    
    // Auto-pan camera in AUTO mode to hunt for fish
    updateAutoPanning(deltaTime);
    
    // In FPS mode, always update camera to follow cannon rotation
    // This ensures camera follows when aiming (click) or auto-aim rotates the cannon
    if (gameState.viewMode === 'fps') {
        updateFPSCamera();
    }
    
    // Smooth scope zoom FOV transition
    if (camera.fov !== gameState.scopeTargetFov) {
        const fovDiff = gameState.scopeTargetFov - camera.fov;
        const fovStep = fovDiff * Math.min(1, deltaTime * 12);
        if (Math.abs(fovDiff) < 0.5) {
            camera.fov = gameState.scopeTargetFov;
        } else {
            camera.fov += fovStep;
        }
        camera.updateProjectionMatrix();
    }
    
    _afDebug.update(deltaTime);
    if (gameState.autoShoot) {
        const result = autoFireTick();
        if (result.target) {
            if (gameState.viewMode === 'fps') {
                updateFPSCamera();
            }
        }
        autoShootTimer -= deltaTime;
        if (autoShootTimer <= 0 && gameState.cooldown <= 0) {
            const weapon = CONFIG.weapons[gameState.currentWeapon];
            const interval = 1 / weapon.shotsPerSecond;
            if (result.target && result.canFire) {
                if (autoFireAtFish(result.target)) {
                    TargetingService.state.shotsAtCurrent++;
                    _afDebug.recordShot();
                }
                autoShootTimer = interval;
            } else {
                autoShootTimer = Math.max(autoShootTimer, -interval);
            }
        }
    }
    
    
    // Update fish with error handling to prevent freeze bugs
    // MULTIPLAYER: Skip local fish updates in multiplayer mode - fish come from server
    if (!multiplayerMode) {
        // PERFORMANCE: Rebuild spatial hash BEFORE fish updates for boids neighbor lookup
        rebuildSpatialHash(activeFish);
        
        let fishUpdateErrors = 0;
        for (let i = activeFish.length - 1; i >= 0; i--) {
            const fish = activeFish[i];
            if (fish && fish.isActive) {
                try {
                    fish.update(deltaTime, activeFish);
                    // Reset error count on successful update
                    fish.updateErrorCount = 0;
                } catch (e) {
                    fishUpdateErrors++;
                    fish.updateErrorCount = (fish.updateErrorCount || 0) + 1;
                    
                    if (fishUpdateErrors <= 3) {
                        console.error('Fish update error:', e, 'Fish:', fish.tier, fish.species || fish.form);
                    }
                    
                    // IMPROVED RECOVERY: Track error count per fish
                    // If a fish keeps throwing errors, do stronger recovery
                    if (fish.updateErrorCount > 10) {
                        // Fish has too many errors - reset completely
                        console.warn(`[FISH] Fish ${fish.tier}/${fish.species || fish.form} has ${fish.updateErrorCount} errors, resetting state`);
                        fish.patternState = null;
                        fish.velocity.set(
                            (Math.random() - 0.5) * fish.speed,
                            (Math.random() - 0.5) * 20,
                            (Math.random() - 0.5) * fish.speed
                        );
                        fish.acceleration.set(0, 0, 0);
                        fish.updateErrorCount = 0;
                    } else {
                        // Simple recovery: just reset velocity/acceleration
                        fish.velocity.set(0, 0, 0);
                        fish.acceleration.set(0, 0, 0);
                    }
                }
            }else if (fish && !fish.isActive) {
                activeFish.splice(i, 1);
            } else {
                // Invalid fish reference - remove it
                activeFish.splice(i, 1);
            }
        }
        
        // Dynamic fish respawn system - maintain target fish count (single-player only)
        updateDynamicFishSpawn(deltaTime);
        
        if (typeof clientRTPEngine !== 'undefined' && clientRTPEngine.fishStates.size > 500) {
            clientRTPEngine.pruneKilledFishStates();
        }
        
        // FIX: Rebuild spatial hash AFTER fish move so bullet collision uses current positions
        // Without this, bullets query stale fish positions causing pass-through at cell boundaries
        rebuildSpatialHash(activeFish);
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
    
    // VFX MANAGER: Update all centralized visual effects (PERFORMANCE FIX)
    // This replaces individual requestAnimationFrame loops in each effect function
    updateVfxEffects(deltaTime, performance.now());
    
    // DELAYED COIN COLLECTION: Update coin collection system (coins wait 5-8 seconds before flying to score)
    updateCoinCollectionSystem(deltaTime);
    
    // 3X WEAPON FIRE PARTICLES: Update fire trail particles
    updateFireParticles(deltaTime);
    
    // LIGHTNING ARC POOL: Update pooled lightning arc animations
    // PERFORMANCE FIX: Replaces per-arc requestAnimationFrame loops
    updateLightningArcs(deltaTime);
    
    // COMBO SYSTEM: Update combo timer
    updateComboTimer(deltaTime);
    
    // PERFORMANCE: Update frustum culling and LOD
    updatePerformanceOptimizations(deltaTime);
    
    // PERFORMANCE: Enforce particle limits
    enforceParticleLimits();
    
    // PERFORMANCE: Throttle shadow updates (only update every N frames)
    updateThrottledShadows(deltaTime);
    
        // Animate seaweed
        animateSeaweed();
    
        // Animate caustic lights
        animateCausticLights();
    
        // Update Boss Fish Event System (Issue #12)
        updateBossEvent(deltaTime);
    
        // Update UI
        updateUI();
        
        // Update on-screen performance display
        updatePerfDisplay();
    
        // DIAGNOSTIC: Log performance metrics every 60 frames (~1 second at 60fps)
        if (!window._perfDiagFrame) window._perfDiagFrame = 0;
        window._perfDiagFrame++;
        if (window._perfDiagFrame % 60 === 0) {
            // Count fish with active animations
            let fishWithAnimations = 0;
            let totalMixers = 0;
            for (const fish of activeFish) {
                if (fish && fish.mixer) {
                    totalMixers++;
                    if (fish.mixer._actions && fish.mixer._actions.length > 0) {
                        fishWithAnimations++;
                    }
                }
            }
            
            console.log('[PERF-DIAG] === Performance Diagnostics ===');
            console.log('[PERF-DIAG] Draw calls:', renderer.info.render.calls);
            console.log('[PERF-DIAG] Triangles:', renderer.info.render.triangles.toLocaleString());
            console.log('[PERF-DIAG] Textures:', renderer.info.memory.textures);
            console.log('[PERF-DIAG] Geometries:', renderer.info.memory.geometries);
            console.log('[PERF-DIAG] Fish count:', activeFish.length, '/ max:', CONFIG.maxFish);
            console.log('[PERF-DIAG] Fish with mixers:', totalMixers, ', with active animations:', fishWithAnimations);
            console.log('[PERF-DIAG] Active bullets:', activeBullets.length);
            console.log('[PERF-DIAG] Active particles:', activeParticles.length);
            console.log('[PERF-DIAG] FPS:', Math.round(1 / deltaTime));
        }
        
        // Render (use EffectComposer if available, otherwise fallback to direct render)
        if (_effectComposer) {
            _effectComposer.render();
        } else {
            renderer.render(scene, camera);
        }
    
    updateCrosshairCanvasOverlay(currentTime);
    update3xSideCrosshairPositions();
}

// PERFORMANCE FIX: Cache seaweed and caustic light references to avoid iterating all children every frame
let cachedSeaweedObjects = null;
let cachedCausticLights = null;

function animateSeaweed() {
    const time = performance.now() * 0.001;
    
    // PERFORMANCE FIX: Cache seaweed objects on first call instead of filtering every frame
    if (cachedSeaweedObjects === null && tunnelGroup) {
        cachedSeaweedObjects = tunnelGroup.children.filter(child => child.userData.isSeaweed);
    }
    
    if (cachedSeaweedObjects) {
        for (let i = 0; i < cachedSeaweedObjects.length; i++) {
            const child = cachedSeaweedObjects[i];
            const offset = child.userData.swayOffset || 0;
            child.rotation.x = Math.sin(time + offset) * 0.08;
            child.rotation.z = Math.cos(time * 0.7 + offset) * 0.04;
        }
    }
}

function animateCausticLights() {
    const time = performance.now() * 0.001;
    
    // PERFORMANCE FIX: Cache caustic lights on first call instead of filtering every frame
    if (cachedCausticLights === null && scene) {
        cachedCausticLights = scene.children.filter(child => 
            child.isPointLight && child.userData.originalY !== undefined
        );
    }
    
    if (cachedCausticLights) {
        for (let i = 0; i < cachedCausticLights.length; i++) {
            const child = cachedCausticLights[i];
            child.position.y = child.userData.originalY + Math.sin(time + child.userData.offset) * 15;
            child.intensity = 0.25 + Math.sin(time * 2 + child.userData.offset) * 0.1;
        }
    }
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
        transform: translateX(-50%) scale(var(--ui-scale));
        transform-origin: top center;
        text-align: center;
        pointer-events: none;
        z-index: 1000;
        display: none;
        background: linear-gradient(180deg, rgba(255, 0, 0, 0.3), rgba(100, 0, 0, 0.2));
        border: 3px solid #ff4444;
        border-radius: 15px;
        padding: 15px 40px;
        box-shadow: 0 0 30px rgba(255, 0, 0, 0.5);
        min-width: 300px;
        max-width: 90vw;
        white-space: nowrap;
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
        top: 16px;
        left: 50%;
        transform: translateX(-50%) scale(calc(1.1 * var(--ui-scale)));
        transform-origin: top center;
        z-index: 900;
        pointer-events: none;
        text-align: center;
        display: none;
        background: linear-gradient(180deg, rgba(0, 15, 35, 0.92), rgba(0, 8, 22, 0.95));
        border: 2px solid rgba(255, 200, 0, 0.5);
        border-radius: 8px;
        padding: 10px 28px;
        box-shadow: 0 0 24px rgba(255, 200, 0, 0.18), inset 0 0 15px rgba(255, 200, 0, 0.05);
        font-family: 'Orbitron', monospace;
    `;
    
    // Timer text
    const timerText = document.createElement('div');
    timerText.id = 'boss-waiting-text';
    timerText.style.cssText = `
        font-size: 20px;
        font-weight: 900;
        font-family: 'Orbitron', monospace;
        color: #ffdd00;
        text-shadow: 0 0 12px rgba(255, 200, 0, 0.5), 0 0 24px rgba(255, 200, 0, 0.15);
        letter-spacing: 2px;
        -webkit-text-stroke: 0.5px rgba(255, 200, 0, 0.3);
    `;
    bossWaitingUI.appendChild(timerText);
    
    // Label text
    const labelText = document.createElement('div');
    labelText.style.cssText = `
        font-size: 8px;
        font-weight: 700;
        font-family: 'Orbitron', monospace;
        color: rgba(255, 200, 0, 0.6);
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-top: 4px;
    `;
    labelText.textContent = 'NEXT BOSS';
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
    
    if (s > 0 && !gameState.bossActive) {
        if (timerText) timerText.textContent = `${s}s`;
        bossWaitingUI.style.display = 'block';
        
        if (s <= 10) {
            bossWaitingUI.style.borderColor = 'rgba(255, 50, 0, 0.7)';
            bossWaitingUI.style.boxShadow = '0 0 30px rgba(255, 50, 0, 0.3)';
            if (timerText) timerText.style.color = '#ff4400';
            if (timerText) timerText.style.textShadow = '0 0 12px rgba(255, 50, 0, 0.6)';
        } else if (s <= 20) {
            bossWaitingUI.style.borderColor = 'rgba(255, 100, 0, 0.6)';
            bossWaitingUI.style.boxShadow = '0 0 25px rgba(255, 100, 0, 0.2)';
            if (timerText) timerText.style.color = '#ff8800';
            if (timerText) timerText.style.textShadow = '0 0 10px rgba(255, 100, 0, 0.5)';
        } else if (s <= 30) {
            bossWaitingUI.style.borderColor = 'rgba(255, 170, 0, 0.5)';
            bossWaitingUI.style.boxShadow = '0 0 22px rgba(255, 170, 0, 0.18)';
            if (timerText) timerText.style.color = '#ffcc00';
            if (timerText) timerText.style.textShadow = '0 0 8px rgba(255, 200, 0, 0.4)';
        } else {
            bossWaitingUI.style.borderColor = 'rgba(255, 200, 0, 0.45)';
            bossWaitingUI.style.boxShadow = '0 0 20px rgba(255, 200, 0, 0.15)';
            if (timerText) timerText.style.color = '#ffdd00';
            if (timerText) timerText.style.textShadow = '0 0 8px rgba(255, 200, 0, 0.4)';
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
    
    // Issue #15: Show "BOSS MODE! 17s remaining" format at top center
    // Extended from 15s to 17s to give 1x weapon users more time (14s needed for continuous fire)
    document.getElementById('boss-countdown').textContent = `BOSS MODE! 17s remaining`;
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
    // Create SCI-FI 3D crosshair that follows the boss fish
    const crosshairGroup = new THREE.Group();
    const baseSize = bossFish.config.size;
    
    // === OUTER HEXAGONAL RING (sci-fi style) ===
    const outerRadius = baseSize * 1.8;
    const outerRingGeometry = new THREE.RingGeometry(outerRadius - 4, outerRadius, 6);
    const outerRingMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,  // Cyan for sci-fi look
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    crosshairGroup.add(outerRing);
    
    // === MIDDLE CIRCULAR RING with glow ===
    const middleRadius = baseSize * 1.2;
    const middleRingGeometry = new THREE.RingGeometry(middleRadius - 3, middleRadius, 32);
    const middleRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3366,  // Magenta-red
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const middleRing = new THREE.Mesh(middleRingGeometry, middleRingMaterial);
    crosshairGroup.add(middleRing);
    
    // === INNER TARGETING RING ===
    const innerRadius = baseSize * 0.6;
    const innerRingGeometry = new THREE.RingGeometry(innerRadius - 2, innerRadius, 32);
    const innerRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,  // Yellow center
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    crosshairGroup.add(innerRing);
    
    // === SCI-FI TARGETING LINES (dashed style) ===
    const lineLength = baseSize * 2.2;
    const gapStart = baseSize * 0.3;
    const gapEnd = baseSize * 0.8;
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    
    // Create 4 targeting lines with gaps in center
    const lineAngles = [0, Math.PI/2, Math.PI, Math.PI * 1.5];
    lineAngles.forEach(angle => {
        // Outer segment
        const outerPoints = [
            new THREE.Vector3(Math.cos(angle) * gapEnd, Math.sin(angle) * gapEnd, 0),
            new THREE.Vector3(Math.cos(angle) * lineLength, Math.sin(angle) * lineLength, 0)
        ];
        const outerGeometry = new THREE.BufferGeometry().setFromPoints(outerPoints);
        const outerLine = new THREE.Line(outerGeometry, lineMaterial);
        crosshairGroup.add(outerLine);
        
        // Inner segment (small tick marks)
        const innerPoints = [
            new THREE.Vector3(Math.cos(angle) * gapStart * 0.5, Math.sin(angle) * gapStart * 0.5, 0),
            new THREE.Vector3(Math.cos(angle) * gapStart, Math.sin(angle) * gapStart, 0)
        ];
        const innerGeometry = new THREE.BufferGeometry().setFromPoints(innerPoints);
        const innerLine = new THREE.Line(innerGeometry, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 }));
        crosshairGroup.add(innerLine);
    });
    
    // === DIAGONAL CORNER BRACKETS (sci-fi HUD style) ===
    const bracketSize = baseSize * 1.5;
    const bracketMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3 });
    
    // 8 corner brackets at 45-degree angles
    const bracketAngles = [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
    bracketAngles.forEach(angle => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const bracketPoints = [
            new THREE.Vector3(cos * bracketSize * 0.7, sin * bracketSize * 0.7, 0),
            new THREE.Vector3(cos * bracketSize, sin * bracketSize, 0),
            new THREE.Vector3(cos * bracketSize * 0.85 - sin * 0.15 * bracketSize, sin * bracketSize * 0.85 + cos * 0.15 * bracketSize, 0)
        ];
        const bracketGeometry = new THREE.BufferGeometry().setFromPoints(bracketPoints);
        const bracket = new THREE.Line(bracketGeometry, bracketMaterial);
        crosshairGroup.add(bracket);
    });
    
    // === ROTATING TRIANGULAR MARKERS ===
    const markerRadius = baseSize * 1.4;
    const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3366,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const triangleShape = new THREE.Shape();
        const triSize = baseSize * 0.15;
        triangleShape.moveTo(0, triSize);
        triangleShape.lineTo(-triSize * 0.6, -triSize * 0.5);
        triangleShape.lineTo(triSize * 0.6, -triSize * 0.5);
        triangleShape.closePath();
        
        const triangleGeometry = new THREE.ShapeGeometry(triangleShape);
        const triangle = new THREE.Mesh(triangleGeometry, markerMaterial);
        triangle.position.set(Math.cos(angle) * markerRadius, Math.sin(angle) * markerRadius, 0);
        triangle.rotation.z = angle - Math.PI / 2;
        crosshairGroup.add(triangle);
    }
    
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
    
    // SCI-FI ANIMATION: Multiple rotating elements
    // children[0] = outer hexagonal ring (slow clockwise)
    // children[1] = middle ring (counter-clockwise)
    // children[2] = inner ring (fast clockwise)
    if (bossCrosshair.children[0]) bossCrosshair.children[0].rotation.z += 0.008;
    if (bossCrosshair.children[1]) bossCrosshair.children[1].rotation.z -= 0.015;
    if (bossCrosshair.children[2]) bossCrosshair.children[2].rotation.z += 0.025;
    
    // Pulse effect on opacity for sci-fi feel
    const pulse = Math.sin(Date.now() * 0.005) * 0.15 + 0.85;
    if (bossCrosshair.children[0] && bossCrosshair.children[0].material) {
        bossCrosshair.children[0].material.opacity = 0.7 * pulse;
    }
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
    
    let spawnedBoss = null;
    
    if (freeFish.length === 0) {
        let victim = null, worstVal = Infinity;
        for (let i = activeFish.length - 1; i >= 0; i--) {
            const f = activeFish[i];
            if (!f.isActive || f.isBoss) continue;
            const val = (f.config && f.config.reward) || 0;
            if (val < worstVal) { worstVal = val; victim = f; }
        }
        if (victim) {
            victim.isActive = false;
            victim.group.visible = false;
            if (victim.group.parent) victim.group.parent.remove(victim.group);
            const idx = activeFish.indexOf(victim);
            if (idx !== -1) activeFish.splice(idx, 1);
            victim.isBoss = false;
            freeFish.push(victim);
        }
    }
    
    if (bossType.isSwarm) {
        const swarmFish = [];
        const centerPos = getRandomFishPositionIn3DSpace();
        
        for (let i = 0; i < bossType.swarmCount; i++) {
            if (activeFish.length >= FISH_SPAWN_CONFIG.maxCount) break;
            const fish = freeFish.pop();
            if (fish) {
                fish.config = bossConfig;
                fish.createMesh();
                
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 100,
                    (Math.random() - 0.5) * 200
                );
                fish.spawn(centerPos.clone().add(offset));
                fish.isBoss = true;
                if (!activeFish.includes(fish)) {
                    activeFish.push(fish);
                }
                swarmFish.push(fish);
            }
        }
        
        if (swarmFish.length > 0) {
            spawnedBoss = swarmFish[0];
            createBossCrosshair(swarmFish[0]);
            addBossGlowEffect(swarmFish[0], bossType.glowColor);
        }
    } else {
        const fish = freeFish.pop();
        if (fish) {
            fish.config = bossConfig;
            fish.createMesh();
            fish.spawn(getRandomFishPositionIn3DSpace());
            fish.isBoss = true;
            if (!activeFish.includes(fish)) {
                activeFish.push(fish);
            }
            
            spawnedBoss = fish;
            createBossCrosshair(fish);
            addBossGlowEffect(fish, bossType.glowColor);
        }
    }
    
    if (!spawnedBoss) {
        console.warn('[BOSS] Spawn failed — no fish available even after recycle attempt.');
        return;
    }
    
    gameState.activeBoss = spawnedBoss;
    showBossAlert(bossType);
    gameState.bossCountdown = 17;
    gameState.bossActive = true;
    startBossMusicMP3();
}

function updateBossEvent(deltaTime) {
    // Guard: Only run boss system when in active game scene (not lobby/menu)
    if (!gameState.isInGameScene) {
        // Ensure boss system is fully dormant on lobby
        if (gameState.bossActive || gameState.bossCountdown > 0) {
            gameState.bossActive = false;
            gameState.activeBoss = null;
            gameState.bossCountdown = 0;
            gameState.bossSpawnTimer = 45;
            hideBossUI();
            hideBossWaitingUI();
        }
        return;
    }
    
    // Guard: Don't run boss system during loading - wait for game to fully load
    // This prevents boss mode from starting while assets are still loading on slow computers
    if (gameState.isLoading) {
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
            gameState.bossSpawnTimer = 45;  // Next boss in exactly 45 seconds
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
    
    stopBossMusicMP3();
    
    for (let i = activeFish.length - 1; i >= 0; i--) {
        const fish = activeFish[i];
        if (fish.isBoss && fish.isActive) {
            fish.isActive = false;
            fish.group.visible = false;
            
            if (fish.respawnTimerId) {
                clearTimeout(fish.respawnTimerId);
                fish.respawnTimerId = null;
            }
            
            if (fish.glbMixer) {
                fish.glbMixer.stopAllAction();
                if (fish.glbModelRoot) {
                    fish.glbMixer.uncacheRoot(fish.glbModelRoot);
                }
                fish.glbMixer = null;
                fish.glbAction = null;
            }
            
            if (fish.group.parent) {
                fish.group.parent.remove(fish.group);
            }
            
            fish.isBoss = false;
            
            activeFish.splice(i, 1);
            
            if (!freeFish.includes(fish)) {
                freeFish.push(fish);
            }
        }
    }
}

function showBossKilledMessage() {
    if (!bossUIContainer) return;
    
    document.getElementById('boss-alert').textContent = 'BOSS DEFEATED!';
    document.getElementById('boss-alert').style.color = '#44ff44';
    document.getElementById('boss-desc').textContent = 'Bonus rewards earned!';
    document.getElementById('boss-countdown').textContent = '';
    
    // Play Boss Dead sound effect from R2
    playBossDeadSound();
    
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
    // FPS Sensitivity: 10 levels (1-10), where level 10 = 100% of base sensitivity
    // Default is level 5 (50%) for more precise aiming
    fpsSensitivityLevel: 5
};

// Current settings (will be loaded from localStorage)
let gameSettings = { ...DEFAULT_SETTINGS };

// Base sensitivity values (these are multiplied by the user's sensitivity setting)
const BASE_SENSITIVITY = {
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
    
    // Update the performance state for 3D map optimizations
    setGraphicsQuality(quality);
    
    // Base particle count for 100% (high quality)
    const BASE_PARTICLE_COUNT = 200;
    
    switch (quality) {
        case 'low':
            // LOW: Best performance - No shadows, 30% particles, reduced resolution
            CONFIG.particles = { 
                maxCount: Math.floor(BASE_PARTICLE_COUNT * 0.3), // 30% = 60 particles
                enabled: true,
                qualityMultiplier: 0.3
            };
            break;
            
        case 'medium':
            // MEDIUM: Balanced - Shadows on, 60% particles
            CONFIG.particles = { 
                maxCount: Math.floor(BASE_PARTICLE_COUNT * 0.6), // 60% = 120 particles
                enabled: true,
                qualityMultiplier: 0.6
            };
            break;
            
        case 'high':
            // HIGH: Best visuals - Full shadows, 100% particles
            CONFIG.particles = { 
                maxCount: BASE_PARTICLE_COUNT, // 100% = 200 particles
                enabled: true,
                qualityMultiplier: 1.0
            };
            break;
    }
    
    saveSettings();
    
    // Log quality change for debugging
    const shadowsEnabled = PERFORMANCE_CONFIG.graphicsQuality.shadowsEnabled[quality];
    console.log(`Graphics Quality set to: ${quality} (Particles: ${CONFIG.particles.maxCount}, Shadows: ${shadowsEnabled ? 'ON' : 'OFF'})`);
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

// Apply FPS sensitivity level(1-10, where 10 = 100% of base sensitivity)
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
    const settingsContainer = document.getElementById('settings-container');
    const settingsPanel = document.getElementById('settings-panel');
    const closeBtn = document.getElementById('settings-close-btn');
    
    // Early return if settings panel doesn't exist
    if (!settingsPanel) {
        console.warn('Settings panel not found in DOM');
        return;
    }
    
    // Toggle settings panel
    if (settingsContainer) {
        settingsContainer.addEventListener('click', (e) => {
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
    
    // FPS sensitivity slider(10 levels: 1-10, where 10 = 100%)
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
            if (!settingsPanel.contains(e.target) && !settingsContainer.contains(e.target)) {
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
        return;
    }
    
    multiplayerManager.shoot(targetX, targetZ);
    
    var w = CONFIG.weapons[gameState.currentWeapon] || CONFIG.weapons['1x'];
    if (window._killDebug) {
        window._killDebug.totalCost += w.cost;
        if (window._updateKillDebugOverlay) window._updateKillDebugOverlay();
    }
    
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
    
    var dbgEl = document.getElementById('kill-debug-overlay');
    if (dbgEl) dbgEl.remove();
    
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
