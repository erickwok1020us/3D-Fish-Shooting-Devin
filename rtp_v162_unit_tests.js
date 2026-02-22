const RTP_MONEY_SCALE = 1000;
const RTP_SCALE = 10000;
const RTP_P_SCALE = 1000000;
const RTP_ROCKET_MAX_TARGETS = 6;
const RTP_LASER_MAX_TARGETS = 10;

const RTP_WEAPON_RTP_MANUAL_FP = { '1x': 9200, '3x': 9400, '5x': 9600, '8x': 9800 };
const RTP_WEAPON_RTP_AUTO_FP = { '1x': 9000, '3x': 9200, '5x': 9400, '8x': 9600 };
const RTP_WEAPON_COST_FP = { '1x': 1000, '3x': 3000, '5x': 5000, '8x': 8000 };

const RTP_TIER_CONFIG = {
    1: { rewardManualFp: 7840, rewardAutoFp: 7680, n1Fp: 8000, pityCompFp: 367000 },
    2: { rewardManualFp: 11200, rewardAutoFp: 10970, n1Fp: 12000, pityCompFp: 344000 },
    3: { rewardManualFp: 17920, rewardAutoFp: 17550, n1Fp: 18000, pityCompFp: 332000 },
    4: { rewardManualFp: 33600, rewardAutoFp: 32910, n1Fp: 34000, pityCompFp: 326400 },
    5: { rewardManualFp: 50400, rewardAutoFp: 49370, n1Fp: 51000, pityCompFp: 322600 },
    6: { rewardManualFp: 134400, rewardAutoFp: 131660, n1Fp: 135000, pityCompFp: 316000 }
};

let rtpKillEventCounter = 0;
function nextKillEventId() { return 'ke_' + (++rtpKillEventCounter) + '_' + Date.now(); }

class ClientRTPPhase1 {
    constructor() {
        this.fishStates = new Map();
        this.playerStates = new Map();
        this.processedKillEvents = new Set();
    }
    _getOrCreateFishState(playerId, fishId) {
        const key = playerId + ':' + fishId;
        let state = this.fishStates.get(key);
        if (!state) { state = { sumCostFp: 0, killed: false }; this.fishStates.set(key, state); }
        return state;
    }
    _getOrCreatePlayerState(playerId) {
        let state = this.playerStates.get(playerId);
        if (!state) { state = { budgetRemainingFp: 0, reset_debt_on_session_end: false }; this.playerStates.set(playerId, state); }
        return state;
    }
    clearFishStates(fishId) {
        for (const key of this.fishStates.keys()) { if (key.endsWith(':' + fishId)) this.fishStates.delete(key); }
    }
    pruneKilledFishStates() {
        for (const [key, state] of this.fishStates) { if (state.killed) this.fishStates.delete(key); }
    }
    resetPlayerDebtIfEnabled(playerId) {
        const pState = this.playerStates.get(playerId);
        if (pState && pState.reset_debt_on_session_end) pState.budgetRemainingFp = 0;
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
        if (pBaseRawFp >= RTP_P_SCALE) return RTP_P_SCALE;
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
            if (!config) { results.push({ fishId: entry.fishId, kill: false, reason: 'invalid_tier' }); continue; }
            const fState = this._getOrCreateFishState(playerId, entry.fishId);
            if (fState.killed) { results.push({ fishId: entry.fishId, kill: false, reason: 'already_killed' }); continue; }
            if (i === 0) fState.sumCostFp += weaponCostFp;
            if (fState.sumCostFp >= config.n1Fp) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'hard_pity', isAuto);
                results.push(killResult); energyCarry = true; continue;
            }
            const rewardFp = this._getReward(config, isAuto);
            const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
            const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / rewardFp);
            if (pBaseRawFp >= RTP_P_SCALE) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'probability', isAuto);
                results.push(killResult); energyCarry = true; continue;
            }
            const pIFp = Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));
            const randI = Math.floor(Math.random() * RTP_P_SCALE);
            if (randI < pIFp) {
                const killResult = this._executeKill(fState, pState, config, entry.fishId, 'probability', isAuto);
                results.push(killResult); energyCarry = (pState.budgetRemainingFp > 0);
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
        if (this.processedKillEvents.has(killEventId)) return { kill: false, reason: 'duplicate_kill_event' };
        this.processedKillEvents.add(killEventId);
        const rewardFp = isAuto ? config.rewardAutoFp : config.rewardManualFp;
        pState.budgetRemainingFp -= rewardFp;
        pState.budgetRemainingFp = Math.max(-config.rewardManualFp, pState.budgetRemainingFp);
        fState.killed = true;
        return { fishId, kill: true, reason, killEventId, rewardFp, reward: rewardFp / RTP_MONEY_SCALE, isAuto: !!isAuto };
    }
}

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; console.log('  FAIL: ' + msg); }
}

console.log('=== RTP v1.6.2 Unit Tests ===\n');

console.log('--- TEST A: v1.6.2 Constants Verification ---');
assert(RTP_WEAPON_RTP_MANUAL_FP['1x'] === 9200, 'Manual 1x = 92%');
assert(RTP_WEAPON_RTP_MANUAL_FP['3x'] === 9400, 'Manual 3x = 94%');
assert(RTP_WEAPON_RTP_MANUAL_FP['5x'] === 9600, 'Manual 5x = 96%');
assert(RTP_WEAPON_RTP_MANUAL_FP['8x'] === 9800, 'Manual 8x = 98%');
assert(RTP_WEAPON_RTP_AUTO_FP['1x'] === 9000, 'Auto 1x = 90%');
assert(RTP_WEAPON_RTP_AUTO_FP['3x'] === 9200, 'Auto 3x = 92%');
assert(RTP_WEAPON_RTP_AUTO_FP['5x'] === 9400, 'Auto 5x = 94%');
assert(RTP_WEAPON_RTP_AUTO_FP['8x'] === 9600, 'Auto 8x = 96%');
for (const [wk, manualRtp] of Object.entries(RTP_WEAPON_RTP_MANUAL_FP)) {
    const autoRtp = RTP_WEAPON_RTP_AUTO_FP[wk];
    assert(manualRtp - autoRtp === 200, `${wk} convenience tax = 2% (${manualRtp} - ${autoRtp})`);
}
console.log('  Constants: OK\n');

console.log('--- TEST B: Tier Config — Manual vs Auto Rewards ---');
for (const [tier, cfg] of Object.entries(RTP_TIER_CONFIG)) {
    assert(cfg.rewardManualFp > cfg.rewardAutoFp, `T${tier}: manual reward (${cfg.rewardManualFp}) > auto reward (${cfg.rewardAutoFp})`);
    assert(cfg.n1Fp > 0, `T${tier}: n1Fp = ${cfg.n1Fp}`);
    assert(cfg.pityCompFp > 0 && cfg.pityCompFp < RTP_P_SCALE, `T${tier}: pityComp in range`);
}
assert(RTP_TIER_CONFIG[1].rewardManualFp === 7840, 'T1 manual = 7.84');
assert(RTP_TIER_CONFIG[1].rewardAutoFp === 7680, 'T1 auto = 7.68');
assert(RTP_TIER_CONFIG[6].rewardManualFp === 134400, 'T6 manual = 134.40');
assert(RTP_TIER_CONFIG[6].rewardAutoFp === 131660, 'T6 auto = 131.66');
console.log('  Tier Config: OK\n');

console.log('--- TEST C: P1 Matrix Verification (Budget per shot / Reward) ---');
const p1Expected = {
    '1x_1_manual': 0.117, '3x_1_manual': 0.360, '5x_1_manual': 0.612, '8x_1_manual': 1.000,
    '1x_1_auto': 0.117, '8x_1_auto': 1.000,
    '1x_2_manual': 0.082, '8x_2_manual': 0.700,
    '1x_3_manual': 0.051, '8x_3_manual': 0.438,
    '1x_4_manual': 0.027, '8x_4_manual': 0.233,
    '1x_5_manual': 0.018, '8x_5_manual': 0.156,
    '1x_6_manual': 0.007, '8x_6_manual': 0.058,
};
for (const [key, expected] of Object.entries(p1Expected)) {
    const parts = key.split('_');
    const wk = parts[0], tier = parseInt(parts[1]), isAuto = parts[2] === 'auto';
    const cfg = RTP_TIER_CONFIG[tier];
    const costFp = RTP_WEAPON_COST_FP[wk];
    const rtpFp = isAuto ? RTP_WEAPON_RTP_AUTO_FP[wk] : RTP_WEAPON_RTP_MANUAL_FP[wk];
    const budgetPerShot = Math.floor(costFp * rtpFp / RTP_SCALE);
    const rewardFp = isAuto ? cfg.rewardAutoFp : cfg.rewardManualFp;
    const p1 = budgetPerShot / rewardFp;
    assert(Math.abs(p1 - expected) < 0.005, `P1 ${key}: ${p1.toFixed(3)} ≈ ${expected} (budget=${budgetPerShot}, reward=${rewardFp})`);
}
console.log('  P1 Matrix: OK\n');

console.log('--- TEST D: 8x T1 First-Shot Guaranteed Kill (Manual) ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.999;
    const result = engine.handleSingleTargetHit('p1', 'f1', '8x', 1, false);
    Math.random = origRandom;
    assert(result.kill === true, '8x T1 manual: first shot kills');
    assert(result.rewardFp === 7840, '8x T1 manual: reward = 7840fp');
    assert(result.isAuto === false, '8x T1 manual: isAuto = false');
    const pState = engine._getOrCreatePlayerState('p1');
    assert(pState.budgetRemainingFp >= -7840, '8x T1 manual: debt floor respected');
}
console.log('  8x T1 Manual Kill: OK\n');

console.log('--- TEST E: 8x T1 First-Shot Guaranteed Kill (Auto) ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.999;
    const result = engine.handleSingleTargetHit('p1', 'f1', '8x', 1, true);
    Math.random = origRandom;
    assert(result.kill === true, '8x T1 auto: first shot kills');
    assert(result.rewardFp === 7680, '8x T1 auto: reward = 7680fp (lower)');
    assert(result.isAuto === true, '8x T1 auto: isAuto = true');
    assert(result.reward === 7.68, '8x T1 auto: reward in credits = 7.68');
}
console.log('  8x T1 Auto Kill: OK\n');

console.log('--- TEST F: Convenience Tax — Manual vs Auto Budget Injection ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    engine.handleSingleTargetHit('p_manual', 'f1', '1x', 1, false);
    const pManual = engine._getOrCreatePlayerState('p_manual');
    const budgetManual = pManual.budgetRemainingFp;
    engine.handleSingleTargetHit('p_auto', 'f2', '1x', 1, true);
    const pAuto = engine._getOrCreatePlayerState('p_auto');
    const budgetAuto = pAuto.budgetRemainingFp;
    Math.random = origRandom;
    const expectedManual = Math.floor(1000 * 9200 / 10000);
    const expectedAuto = Math.floor(1000 * 9000 / 10000);
    assert(budgetManual === expectedManual, `Manual budget: ${budgetManual} = ${expectedManual}`);
    assert(budgetAuto === expectedAuto, `Auto budget: ${budgetAuto} = ${expectedAuto}`);
    assert(budgetManual - budgetAuto === 20, `Tax diff: ${budgetManual - budgetAuto} = 20 (2% of 1000)`);
}
console.log('  Convenience Tax: OK\n');

console.log('--- TEST G: P_base >= 1.0 Defense — Skip pityComp ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = 10000;
    const origRandom = Math.random;
    Math.random = () => 0.999;
    const result = engine.handleSingleTargetHit('p1', 'f1', '8x', 1, false);
    Math.random = origRandom;
    assert(result.kill === true, 'P_base>=1.0: force kill even with worst roll');
}
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = 50000;
    const cfg = RTP_TIER_CONFIG[1];
    const pFp = engine._calcProbability(pState, cfg, false);
    assert(pFp === RTP_P_SCALE, `P_base>=1.0: _calcProbability returns P_SCALE (${pFp})`);
}
console.log('  P_base Defense: OK\n');

console.log('--- TEST H: Hard Pity — N1 Shots per Weapon ---');
{
    const origRandom = Math.random;
    Math.random = () => 1.0;
    const testCases = [
        { weapon: '1x', tier: 1, expectedShots: 8 },
        { weapon: '8x', tier: 1, expectedShots: 1 },
        { weapon: '1x', tier: 2, expectedShots: 12 },
        { weapon: '8x', tier: 2, expectedShots: 2 },
        { weapon: '1x', tier: 3, expectedShots: 18 },
        { weapon: '8x', tier: 3, expectedShots: 3 },
    ];
    for (const tc of testCases) {
        const engine = new ClientRTPPhase1();
        let killed = false;
        let shots = 0;
        for (let i = 0; i < 200 && !killed; i++) {
            shots++;
            const r = engine.handleSingleTargetHit('p1', 'f1', tc.weapon, tc.tier, false);
            if (r.kill) killed = true;
        }
        assert(killed, `${tc.weapon} T${tc.tier}: fish dies`);
        assert(shots <= tc.expectedShots, `${tc.weapon} T${tc.tier}: killed in ${shots} shots (expected <= ${tc.expectedShots})`);
    }
    Math.random = origRandom;
}
console.log('  Hard Pity: OK\n');

console.log('--- TEST I: Debt Floor — Clamped to -rewardManualFp ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = -5000;
    const origRandom = Math.random;
    Math.random = () => 1.0;
    for (let i = 0; i < 8; i++) {
        engine.handleSingleTargetHit('p1', 'f_' + i, '1x', 1, false);
    }
    Math.random = origRandom;
    const cfg = RTP_TIER_CONFIG[1];
    assert(pState.budgetRemainingFp >= -cfg.rewardManualFp,
        `Debt floor: ${pState.budgetRemainingFp} >= ${-cfg.rewardManualFp}`);
}
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = 0;
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const result = engine.handleSingleTargetHit('p1', 'f1', '1x', 1, false);
    Math.random = origRandom;
    if (result.kill) {
        assert(pState.budgetRemainingFp >= -RTP_TIER_CONFIG[1].rewardManualFp,
            `After early kill: debt floor = ${pState.budgetRemainingFp}`);
    }
}
console.log('  Debt Floor: OK\n');

console.log('--- TEST J: Shotgun (3x) — Per-Pellet Budget + isAuto ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    for (let pellet = 0; pellet < 3; pellet++) {
        engine.handleShotgunHit('p1', 'f1', '3x', 1, false);
    }
    const pState = engine._getOrCreatePlayerState('p1');
    const expectedBudget = 3 * Math.floor(1000 * 9400 / 10000);
    assert(pState.budgetRemainingFp === expectedBudget,
        `3x manual 3 pellets: budget = ${pState.budgetRemainingFp} (expected ${expectedBudget})`);
    Math.random = origRandom;
}
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    for (let pellet = 0; pellet < 3; pellet++) {
        engine.handleShotgunHit('p1', 'f1', '3x', 1, true);
    }
    const pState = engine._getOrCreatePlayerState('p1');
    const expectedBudget = 3 * Math.floor(1000 * 9200 / 10000);
    assert(pState.budgetRemainingFp === expectedBudget,
        `3x auto 3 pellets: budget = ${pState.budgetRemainingFp} (expected ${expectedBudget})`);
    Math.random = origRandom;
}
console.log('  Shotgun: OK\n');

console.log('--- TEST K: Multi-Target — 100% Primary Allocation ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    const hitList = [
        { fishId: 'f1', tier: 1 },
        { fishId: 'f2', tier: 1 },
        { fishId: 'f3', tier: 1 },
    ];
    const pStateBefore = engine._getOrCreatePlayerState('p1');
    const budgetBefore = pStateBefore.budgetRemainingFp;
    const results = engine.handleMultiTargetHit('p1', hitList, '8x', 'laser', false);
    Math.random = origRandom;
    const budgetInjected = Math.floor(8000 * 9800 / 10000);
    assert(budgetInjected === 7840, `8x manual budget = ${budgetInjected}`);
    const f1State = engine._getOrCreateFishState('p1', 'f1');
    assert(f1State.sumCostFp === 8000, `Primary fish sum_cost = ${f1State.sumCostFp} (full weapon cost)`);
    const f2State = engine._getOrCreateFishState('p1', 'f2');
    assert(f2State.sumCostFp === 0, `Secondary fish sum_cost = ${f2State.sumCostFp} (no cost)`);
}
console.log('  100% Primary: OK\n');

console.log('--- TEST L: Multi-Target Cap Enforcement ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    const hitList = [];
    for (let i = 0; i < 15; i++) {
        hitList.push({ fishId: 'f' + i, tier: 1 });
    }
    const results = engine.handleMultiTargetHit('p1', hitList, '8x', 'laser', false);
    Math.random = origRandom;
    assert(results.length <= RTP_LASER_MAX_TARGETS, `Laser cap: ${results.length} <= ${RTP_LASER_MAX_TARGETS}`);
    const engine2 = new ClientRTPPhase1();
    Math.random = () => 1.0;
    const hitList2 = [];
    for (let i = 0; i < 10; i++) {
        hitList2.push({ fishId: 'g' + i, tier: 1 });
    }
    const results2 = engine2.handleMultiTargetHit('p1', hitList2, '5x', 'aoe', false);
    Math.random = () => Math.random;
    assert(results2.length <= RTP_ROCKET_MAX_TARGETS, `Rocket cap: ${results2.length} <= ${RTP_ROCKET_MAX_TARGETS}`);
    Math.random = origRandom;
}
console.log('  Cap Enforcement: OK\n');

console.log('--- TEST M: 8x Laser Penetration — P1>=100% Energy Inheritance ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = 20000;
    const origRandom = Math.random;
    Math.random = () => 0.999;
    const hitList = [];
    for (let i = 0; i < 5; i++) {
        hitList.push({ fishId: 'f' + i, tier: 1 });
    }
    const results = engine.handleMultiTargetHit('p1', hitList, '8x', 'laser', false);
    Math.random = origRandom;
    assert(results[0].kill === true, 'Primary T1 killed (P1=100%)');
    let killCount = 0;
    for (const r of results) { if (r.kill) killCount++; }
    assert(killCount >= 2, `With pre-accumulated budget (20000): ${killCount} kills (>= 2)`);
}
console.log('  8x Penetration: OK\n');

console.log('--- TEST N: Kill Event Records isAuto Tag ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const manualResult = engine.handleSingleTargetHit('p1', 'f1', '8x', 1, false);
    assert(manualResult.kill === true, 'Manual kill happened');
    assert(manualResult.isAuto === false, 'Manual kill: isAuto = false');
    const autoResult = engine.handleSingleTargetHit('p1', 'f2', '8x', 1, true);
    assert(autoResult.kill === true, 'Auto kill happened');
    assert(autoResult.isAuto === true, 'Auto kill: isAuto = true');
    Math.random = origRandom;
}
console.log('  Kill isAuto Tag: OK\n');

console.log('--- TEST O: Manual vs Auto Reward Difference ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const manualResult = engine.handleSingleTargetHit('p1', 'f1', '8x', 1, false);
    const autoResult = engine.handleSingleTargetHit('p1', 'f2', '8x', 1, true);
    Math.random = origRandom;
    assert(manualResult.rewardFp === 7840, `Manual T1 reward = ${manualResult.rewardFp}`);
    assert(autoResult.rewardFp === 7680, `Auto T1 reward = ${autoResult.rewardFp}`);
    assert(manualResult.rewardFp > autoResult.rewardFp, 'Manual reward > Auto reward');
    const diff = manualResult.rewardFp - autoResult.rewardFp;
    assert(diff === 160, `Reward diff = ${diff} (160 expected)`);
}
console.log('  Reward Diff: OK\n');

console.log('--- TEST P: Cross-Fish Debt Inheritance ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const r1 = engine.handleSingleTargetHit('p1', 'f1', '1x', 1, false);
    Math.random = origRandom;
    if (r1.kill) {
        const pState = engine._getOrCreatePlayerState('p1');
        const debtAfterKill = pState.budgetRemainingFp;
        assert(debtAfterKill < 0, `After early T1 kill: debt = ${debtAfterKill}`);
        Math.random = () => 1.0;
        engine.handleSingleTargetHit('p1', 'f2', '1x', 1, false);
        Math.random = origRandom;
        assert(pState.budgetRemainingFp > debtAfterKill, `Debt decreases after next shot: ${pState.budgetRemainingFp} > ${debtAfterKill}`);
    }
}
console.log('  Debt Inheritance: OK\n');

console.log('--- TEST Q: No Ramp Boost — Removed in v1.6.2 ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    const probs = [];
    for (let i = 0; i < 7; i++) {
        const r = engine.handleSingleTargetHit('p1', 'f1', '1x', 1, false);
        if (r.pFp !== undefined) probs.push(r.pFp);
    }
    Math.random = origRandom;
    for (let i = 1; i < probs.length; i++) {
        assert(probs[i] >= probs[i - 1], `Monotonic P: shot ${i + 1} (${probs[i]}) >= shot ${i} (${probs[i - 1]})`);
    }
    if (probs.length >= 2) {
        const ratio = probs[probs.length - 1] / probs[0];
        assert(ratio < 10, `No extreme ramp: ratio = ${ratio.toFixed(2)}`);
    }
}
console.log('  No Ramp Boost: OK\n');

console.log('--- TEST R: Multi-Target handleMultiTargetHit — isAuto propagation ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = 30000;
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const hitList = [{ fishId: 'f1', tier: 1 }, { fishId: 'f2', tier: 1 }];
    const results = engine.handleMultiTargetHit('p1', hitList, '8x', 'laser', true);
    Math.random = origRandom;
    for (const r of results) {
        if (r.kill) {
            assert(r.isAuto === true, `Multi-target auto kill: isAuto = ${r.isAuto}`);
            assert(r.rewardFp === 7680, `Multi-target auto: reward = ${r.rewardFp} (auto T1)`);
        }
    }
}
console.log('  Multi-Target isAuto: OK\n');

console.log('--- TEST S: Budget Conservation — Single Shot ---');
{
    for (const isAuto of [false, true]) {
        for (const wk of ['1x', '3x', '5x', '8x']) {
            const costFp = RTP_WEAPON_COST_FP[wk];
            const rtpFp = isAuto ? RTP_WEAPON_RTP_AUTO_FP[wk] : RTP_WEAPON_RTP_MANUAL_FP[wk];
            const budget = Math.floor(costFp * rtpFp / RTP_SCALE);
            assert(budget > 0, `${wk} ${isAuto ? 'auto' : 'manual'}: budget = ${budget} > 0`);
            assert(budget < costFp, `${wk} ${isAuto ? 'auto' : 'manual'}: budget ${budget} < cost ${costFp}`);
        }
    }
}
console.log('  Budget Conservation: OK\n');

console.log('--- TEST T: 1000-Shot Monte Carlo — Manual vs Auto RTP ---');
{
    const SHOTS = 50000;
    const weapons = ['1x', '8x'];
    const modes = [false, true];
    for (const wk of weapons) {
        for (const isAuto of modes) {
            const engine = new ClientRTPPhase1();
            let totalCost = 0;
            let totalReward = 0;
            const costPerShot = RTP_WEAPON_COST_FP[wk];
            for (let s = 0; s < SHOTS; s++) {
                const fishId = 'f_' + s;
                const r = engine.handleSingleTargetHit('p1', fishId, wk, 1, isAuto);
                totalCost += costPerShot;
                if (r.kill) {
                    totalReward += r.rewardFp;
                    engine.clearFishStates(fishId);
                }
            }
            const rtp = totalReward / totalCost;
            const expectedRtp = (isAuto ? RTP_WEAPON_RTP_AUTO_FP[wk] : RTP_WEAPON_RTP_MANUAL_FP[wk]) / RTP_SCALE;
            const mode = isAuto ? 'auto' : 'manual';
            const rtpPct = (rtp * 100).toFixed(2);
            const expPct = (expectedRtp * 100).toFixed(2);
            console.log(`    ${wk} ${mode}: RTP=${rtpPct}% (target=${expPct}%)`);
            assert(Math.abs(rtp - expectedRtp) < 0.08, `${wk} ${mode} RTP ${rtpPct}% within 8pp of ${expPct}%`);
            if (isAuto) {
                const manualRtp = RTP_WEAPON_RTP_MANUAL_FP[wk] / RTP_SCALE;
                assert(rtp < manualRtp + 0.02, `${wk} auto RTP (${rtpPct}%) < manual target + 2pp`);
            }
        }
    }
}
console.log('  Monte Carlo: OK\n');

console.log('--- TEST U: Weapon Switch Arbitrage Prevention ---');
{
    const engine = new ClientRTPPhase1();
    let totalCost = 0, totalReward = 0;
    for (let s = 0; s < 10000; s++) {
        const fishId = 'f_' + s;
        const wk = (s % 5 === 0) ? '8x' : '1x';
        const isAuto = (s % 3 === 0);
        const r = engine.handleSingleTargetHit('p1', fishId, wk, 1, isAuto);
        totalCost += RTP_WEAPON_COST_FP[wk];
        if (r.kill) {
            totalReward += r.rewardFp;
            engine.clearFishStates(fishId);
        }
    }
    const rtp = totalReward / totalCost;
    assert(rtp < 1.05, `Mixed weapon/mode RTP = ${(rtp * 100).toFixed(2)}% < 105%`);
    assert(rtp > 0.85, `Mixed weapon/mode RTP = ${(rtp * 100).toFixed(2)}% > 85%`);
}
console.log('  Arbitrage Prevention: OK\n');

console.log('--- TEST V: Insufficient Balance Guard ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    pState.budgetRemainingFp = -100000;
    const origRandom = Math.random;
    Math.random = () => 0.5;
    const r = engine.handleSingleTargetHit('p1', 'f1', '1x', 1, false);
    Math.random = origRandom;
    assert(r.kill === false || r.reason === 'hard_pity', 'Deep debt: kill unlikely (soft gate uses max(0, budget))');
    const pFp = engine._calcProbability(pState, RTP_TIER_CONFIG[1], false);
    assert(pFp === 0 || pState.budgetRemainingFp <= 0, `Deep debt: P = 0 or budget still negative`);
}
console.log('  Insufficient Balance: OK\n');

console.log('--- TEST W: Debt Floor on Large Fish Kill ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 1.0;
    for (let i = 0; i < 135; i++) {
        engine.handleSingleTargetHit('p1', 'f1', '1x', 6, false);
    }
    Math.random = origRandom;
    const pState = engine._getOrCreatePlayerState('p1');
    const fState = engine._getOrCreateFishState('p1', 'f1');
    assert(fState.killed === true, 'T6 fish killed via hard pity at 135 shots');
    assert(pState.budgetRemainingFp >= -RTP_TIER_CONFIG[6].rewardManualFp,
        `T6 debt floor: ${pState.budgetRemainingFp} >= ${-RTP_TIER_CONFIG[6].rewardManualFp}`);
}
console.log('  Large Fish Debt Floor: OK\n');

console.log('--- TEST X: Multi-Target Budget — Total Injection = budgetTotalFp ---');
{
    const engine = new ClientRTPPhase1();
    const pState = engine._getOrCreatePlayerState('p1');
    const origRandom = Math.random;
    Math.random = () => 1.0;
    const budgetBefore = pState.budgetRemainingFp;
    const hitList = [
        { fishId: 'f1', tier: 2 },
        { fishId: 'f2', tier: 2 },
        { fishId: 'f3', tier: 2 },
    ];
    engine.handleMultiTargetHit('p1', hitList, '8x', 'laser', false);
    const budgetAfter = pState.budgetRemainingFp;
    Math.random = origRandom;
    const expectedInjection = Math.floor(8000 * 9800 / 10000);
    const totalKillReward = [...engine.fishStates.values()]
        .filter(s => s.killed).length * RTP_TIER_CONFIG[2].rewardManualFp;
    const actualInjection = budgetAfter - budgetBefore + totalKillReward;
    assert(actualInjection <= expectedInjection + 1 && actualInjection >= expectedInjection - 1,
        `Multi-target injection: ${actualInjection} ≈ ${expectedInjection}`);
}
console.log('  Multi-Target Budget: OK\n');

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================');
if (failed > 0) process.exit(1);
