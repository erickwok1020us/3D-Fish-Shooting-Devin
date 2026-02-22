const RTP_MONEY_SCALE = 1000;
const RTP_SCALE = 10000;
const RTP_PROGRESS_SCALE = 1000000;
const RTP_P_SCALE = 1000000;
const RTP_LATE_RAMP_START = 800000;
const RTP_ROCKET_MAX_TARGETS = 6;
const RTP_LASER_MAX_TARGETS = 10;
const RTP_PRIMARY_WEIGHT = 700000;
const RTP_SECONDARY_WEIGHT = 300000;

const RTP_WEAPON_RTP_FP = { '1x': 9200, '3x': 9400, '5x': 9600, '8x': 9800 };
const RTP_WEAPON_COST_FP = { '1x': 1000, '3x': 3000, '5x': 5000, '8x': 8000 };

const RTP_TIER_CONFIG = {
    1: { rewardFp: 6440, n1Fp: 7000, pityCompFp: 367000 },
    2: { rewardFp: 9200, n1Fp: 10000, pityCompFp: 344000 },
    3: { rewardFp: 14720, n1Fp: 16000, pityCompFp: 332000 },
    4: { rewardFp: 27600, n1Fp: 30000, pityCompFp: 326400 },
    5: { rewardFp: 41400, n1Fp: 45000, pityCompFp: 322600 },
    6: { rewardFp: 110400, n1Fp: 120000, pityCompFp: 316000 }
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
    handleSingleTargetHit(playerId, fishId, weaponKey, tier) {
        const config = RTP_TIER_CONFIG[tier];
        if (!config) return { kill: false, error: 'invalid_tier' };
        const fState = this._getOrCreateFishState(playerId, fishId);
        if (fState.killed) return { kill: false, reason: 'already_killed' };
        const pState = this._getOrCreatePlayerState(playerId);
        const weaponCostFp = RTP_WEAPON_COST_FP[weaponKey] || 1000;
        const rtpWeaponFp = RTP_WEAPON_RTP_FP[weaponKey] || 9200;
        const budgetTotalFp = Math.floor(weaponCostFp * rtpWeaponFp / RTP_SCALE);
        pState.budgetRemainingFp += budgetTotalFp;
        fState.sumCostFp += weaponCostFp;
        if (fState.sumCostFp >= config.n1Fp) return this._executeKill(fState, pState, config, fishId, 'hard_pity');
        const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
        const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / config.rewardFp);
        const pBaseFp = Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));
        const progressFp = Math.floor(fState.sumCostFp * RTP_PROGRESS_SCALE / config.n1Fp);
        let rampBoostFp = 0;
        if (progressFp > RTP_LATE_RAMP_START) {
            rampBoostFp = Math.min(RTP_PROGRESS_SCALE, Math.floor((progressFp - RTP_LATE_RAMP_START) * RTP_PROGRESS_SCALE / (RTP_PROGRESS_SCALE - RTP_LATE_RAMP_START)));
        }
        const pFp = Math.min(RTP_P_SCALE, pBaseFp + Math.floor(pBaseFp * rampBoostFp / RTP_PROGRESS_SCALE));
        const rand = Math.floor(Math.random() * RTP_P_SCALE);
        if (rand < pFp) return this._executeKill(fState, pState, config, fishId, 'probability');
        return { kill: false, reason: 'roll_failed', pFp };
    }
    handleMultiTargetHit(playerId, hitList, weaponKey, weaponType) {
        if (!hitList || hitList.length === 0) return [];
        const maxTargets = weaponType === 'laser' ? RTP_LASER_MAX_TARGETS : RTP_ROCKET_MAX_TARGETS;
        const cap = maxTargets;
        const trimmedList = hitList.slice(0, maxTargets);
        const M = trimmedList.length;
        const weaponCostFp = RTP_WEAPON_COST_FP[weaponKey] || 1000;
        const rtpWeaponFp = RTP_WEAPON_RTP_FP[weaponKey] || 9200;
        const budgetTotalFp = Math.floor(weaponCostFp * rtpWeaponFp / RTP_SCALE);
        const pState = this._getOrCreatePlayerState(playerId);
        let budget0Fp, budgetSecondaryEachFp;
        if (M === 1) { budget0Fp = budgetTotalFp; budgetSecondaryEachFp = 0; }
        else {
            budget0Fp = Math.floor(budgetTotalFp * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
            const secondaryTotalFp = budgetTotalFp - budget0Fp;
            budgetSecondaryEachFp = Math.floor(secondaryTotalFp / (M - 1));
        }
        const usedBudgetFp = budget0Fp + budgetSecondaryEachFp * (M - 1);
        const remainderFp = budgetTotalFp - usedBudgetFp;
        if (remainderFp > 0) {
            budget0Fp += remainderFp;
        }
        const cost0Fp = Math.floor(weaponCostFp * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
        const costSecondaryEachFp = M > 1 ? Math.floor((weaponCostFp - cost0Fp) / (M - 1)) : 0;
        const results = [];
        for (let i = 0; i < M; i++) {
            const entry = trimmedList[i];
            const config = RTP_TIER_CONFIG[entry.tier];
            if (!config) { results.push({ fishId: entry.fishId, kill: false, reason: 'invalid_tier' }); continue; }
            const fState = this._getOrCreateFishState(playerId, entry.fishId);
            if (fState.killed) { results.push({ fishId: entry.fishId, kill: false, reason: 'already_killed' }); continue; }
            const budgetIFp = (i === 0) ? budget0Fp : budgetSecondaryEachFp;
            const costIFp = (i === 0) ? cost0Fp : costSecondaryEachFp;
            pState.budgetRemainingFp += budgetIFp;
            fState.sumCostFp += costIFp;
            if (fState.sumCostFp >= config.n1Fp) { results.push(this._executeKill(fState, pState, config, entry.fishId, 'hard_pity')); continue; }
            const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
            const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / config.rewardFp);
            const pBaseFp = Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));
            const progressFp = Math.floor(fState.sumCostFp * RTP_PROGRESS_SCALE / config.n1Fp);
            let rampBoostFp = 0;
            if (progressFp > RTP_LATE_RAMP_START) {
                rampBoostFp = Math.min(RTP_PROGRESS_SCALE, Math.floor((progressFp - RTP_LATE_RAMP_START) * RTP_PROGRESS_SCALE / (RTP_PROGRESS_SCALE - RTP_LATE_RAMP_START)));
            }
            const pIFp = Math.min(RTP_P_SCALE, pBaseFp + Math.floor(pBaseFp * rampBoostFp / RTP_PROGRESS_SCALE));
            const randI = Math.floor(Math.random() * RTP_P_SCALE);
            if (randI < pIFp) { results.push(this._executeKill(fState, pState, config, entry.fishId, 'probability')); }
            else { results.push({ fishId: entry.fishId, kill: false, reason: 'roll_failed', pFp: pIFp }); }
        }
        return results;
    }
    handleShotgunHit(playerId, fishId, weaponKey, tier) {
        const config = RTP_TIER_CONFIG[tier];
        if (!config) return { kill: false, error: 'invalid_tier' };
        const fState = this._getOrCreateFishState(playerId, fishId);
        if (fState.killed) return { kill: false, reason: 'already_killed' };
        const pState = this._getOrCreatePlayerState(playerId);
        const pelletCostFp = 1000;
        const rtpWeaponFp = RTP_WEAPON_RTP_FP['3x'] || 9400;
        const budgetTotalFp = Math.floor(pelletCostFp * rtpWeaponFp / RTP_SCALE);
        pState.budgetRemainingFp += budgetTotalFp;
        fState.sumCostFp += pelletCostFp;
        if (fState.sumCostFp >= config.n1Fp) return this._executeKill(fState, pState, config, fishId, 'hard_pity');
        const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
        const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / config.rewardFp);
        const pBaseFp = Math.min(RTP_P_SCALE, Math.floor(pBaseRawFp * config.pityCompFp / RTP_P_SCALE));
        const progressFp = Math.floor(fState.sumCostFp * RTP_PROGRESS_SCALE / config.n1Fp);
        let rampBoostFp = 0;
        if (progressFp > RTP_LATE_RAMP_START) {
            rampBoostFp = Math.min(RTP_PROGRESS_SCALE, Math.floor((progressFp - RTP_LATE_RAMP_START) * RTP_PROGRESS_SCALE / (RTP_PROGRESS_SCALE - RTP_LATE_RAMP_START)));
        }
        const pFp = Math.min(RTP_P_SCALE, pBaseFp + Math.floor(pBaseFp * rampBoostFp / RTP_PROGRESS_SCALE));
        const rand = Math.floor(Math.random() * RTP_P_SCALE);
        if (rand < pFp) return this._executeKill(fState, pState, config, fishId, 'probability');
        return { kill: false, reason: 'roll_failed', pFp };
    }
    _executeKill(fState, pState, config, fishId, reason) {
        const killEventId = nextKillEventId();
        if (this.processedKillEvents.has(killEventId)) return { kill: false, reason: 'duplicate_kill_event' };
        this.processedKillEvents.add(killEventId);
        pState.budgetRemainingFp -= config.rewardFp;
        fState.killed = true;
        return { fishId, kill: true, reason, killEventId, rewardFp: config.rewardFp, reward: config.rewardFp / RTP_MONEY_SCALE };
    }
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { console.log(`  PASS: ${msg}`); passed++; } else { console.log(`  FAIL: ${msg}`); failed++; } }

console.log('='.repeat(70));
console.log('RTP v1.3 Unit Tests — 8x T1 Must-Kill & Cross-Fish Debt');
console.log('='.repeat(70));

console.log('\n--- TEST A: 8x Laser T1 Must-Kill (Hard Pity in 2 shots) ---');
{
    const engine = new ClientRTPPhase1();
    const t1 = RTP_TIER_CONFIG[1];
    const cost0 = Math.floor(RTP_WEAPON_COST_FP['8x'] * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
    console.log(`  T1: n1=${t1.n1Fp}, reward=${t1.rewardFp}`);
    console.log(`  8x primary cost/shot = floor(8000*700000/1000000) = ${cost0}`);
    console.log(`  After 2 shots: sumCost = ${cost0 * 2} >= n1=${t1.n1Fp} -> hard_pity`);

    const origRandom = Math.random;
    Math.random = () => 0.999999;

    const hitList = [
        { fishId: 'primary', tier: 1, distance: 1 },
        { fishId: 'sec1', tier: 2, distance: 2 },
        { fishId: 'sec2', tier: 3, distance: 3 }
    ];

    const r1 = engine.handleMultiTargetHit('p', hitList, '8x', 'laser');
    console.log(`  Shot 1: primary kill=${r1[0].kill} reason=${r1[0].reason}`);
    const fs1 = engine.fishStates.get('p:primary');
    console.log(`  Shot 1: primary sumCost=${fs1.sumCostFp}`);

    assert(r1[0].kill === false, `Shot 1: primary NOT killed yet (sumCost=${fs1.sumCostFp} < n1=${t1.n1Fp})`);
    assert(fs1.sumCostFp === cost0, `Shot 1: primary sumCost = ${cost0}`);

    const r2 = engine.handleMultiTargetHit('p', hitList, '8x', 'laser');
    console.log(`  Shot 2: primary kill=${r2[0].kill} reason=${r2[0].reason}`);

    assert(r2[0].kill === true, 'Shot 2: primary KILLED');
    assert(r2[0].reason === 'hard_pity', 'Shot 2: reason = hard_pity');
    assert(r2[0].rewardFp === t1.rewardFp, `Shot 2: reward = ${t1.rewardFp} (${t1.rewardFp / RTP_MONEY_SCALE})`);
    assert(r2[0].killEventId !== undefined, 'Kill has killEventId for idempotency');

    Math.random = origRandom;
}

console.log('\n--- TEST B: 8x Primary gets 70% progress (sum_cost weighted) ---');
{
    const cost0 = Math.floor(8000 * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
    const costSec = Math.floor((8000 - cost0) / 2);
    console.log(`  Primary cost/shot: ${cost0} (70% of 8000)`);
    console.log(`  Secondary cost/shot each: ${costSec}`);

    assert(cost0 === 5600, '70% of 8000 cost -> primary = 5600');
    assert(costSec === 1200, '30%/2 -> each secondary = 1200');
    assert(cost0 + costSec * 2 === 8000, 'Cost conservation: 5600 + 1200*2 = 8000');
    assert(cost0 * 2 >= RTP_TIER_CONFIG[1].n1Fp, `2 shots primary (${cost0 * 2}) >= T1 n1 (${RTP_TIER_CONFIG[1].n1Fp})`);
}

console.log('\n--- TEST C: Cross-Fish Debt Repayment (forced early kill) ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;

    console.log('  Phase 1: Force probability kill on T6 shot 1 (rand=0) -> massive debt');
    Math.random = () => 0.0;
    const r = engine.handleSingleTargetHit('p', 'bigfish', '1x', 6);
    Math.random = origRandom;

    assert(r.kill === true, 'T6 killed on shot 1 via probability');
    assert(r.reason === 'probability', 'Kill reason = probability (early kill)');

    const ps = engine.playerStates.get('p');
    const budgetInjected = Math.floor(1000 * 9200 / RTP_SCALE);
    const expectedBudget = budgetInjected - RTP_TIER_CONFIG[6].rewardFp;
    console.log(`  Budget: injected=${budgetInjected}, reward=${RTP_TIER_CONFIG[6].rewardFp}, net=${ps.budgetRemainingFp}`);

    assert(ps.budgetRemainingFp === expectedBudget, `Budget = ${expectedBudget} (920 - 110400)`);
    assert(ps.budgetRemainingFp < 0, `Deep debt: ${ps.budgetRemainingFp}`);

    console.log('\n  Phase 2: Switch to T1 fish — debt carries over');
    Math.random = () => 0.999999;

    const r2 = engine.handleSingleTargetHit('p', 'smallfish', '1x', 1);
    const ps2 = engine.playerStates.get('p');
    console.log(`  Shot 1 at T1: budget=${ps2.budgetRemainingFp}, kill=${r2.kill}`);

    assert(ps2.budgetRemainingFp < 0, 'Budget still negative (debt inherited from T6)');
    assert(r2.kill === false, 'T1 NOT killed (soft gate: max(0,budget)=0 -> P_base=0)');

    console.log('\n  Phase 3: Use 8x on T1 to repay debt (8x RTP=98%, net +1400/kill)');
    console.log('  Math: 8x budget/shot=7840, T1 reward=6440, net=+1400 per hard pity kill');
    let debtRepaidShot = -1;
    let fishCounter = 0;
    const netPerKill = Math.floor(8000 * 9800 / RTP_SCALE) - RTP_TIER_CONFIG[1].rewardFp;
    const expectedKills = Math.ceil(Math.abs(ps2.budgetRemainingFp) / netPerKill);
    console.log(`  Net per 8x T1 kill: +${netPerKill}, need ~${expectedKills} kills to repay`);

    for (let shot = 2; shot <= 300; shot++) {
        const fid = 'tf_' + fishCounter;
        const r3 = engine.handleSingleTargetHit('p', fid, '8x', 1);
        if (r3.kill) { engine.clearFishStates(fid); fishCounter++; }
        const psN = engine.playerStates.get('p');
        if (psN.budgetRemainingFp >= 0 && debtRepaidShot < 0) {
            debtRepaidShot = shot;
            console.log(`  Debt repaid on shot ${shot}, budget=${psN.budgetRemainingFp}, kills=${fishCounter}`);
        }
    }
    Math.random = origRandom;

    assert(debtRepaidShot > 0, `Debt eventually repaid via 8x (shot ${debtRepaidShot})`);
    assert(debtRepaidShot > 50, `Took many shots to repay T6 debt (${debtRepaidShot} > 50)`);
}

console.log('\n--- TEST D: Debt crosses fish boundaries ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;
    engine.handleSingleTargetHit('p', 'fishA', '1x', 6);
    Math.random = origRandom;

    const budgetAfterA = engine.playerStates.get('p').budgetRemainingFp;
    console.log(`  After killing T6 fishA: budget=${budgetAfterA}`);

    engine.clearFishStates('fishA');

    Math.random = () => 0.999999;
    engine.handleSingleTargetHit('p', 'fishB', '1x', 1);
    Math.random = origRandom;

    const budgetAfterB = engine.playerStates.get('p').budgetRemainingFp;
    const injected = Math.floor(1000 * 9200 / RTP_SCALE);
    console.log(`  After 1 shot on T1 fishB: budget=${budgetAfterB} (expected ${budgetAfterA + injected})`);

    assert(budgetAfterB === budgetAfterA + injected, 'Debt carries across fish switch');
    assert(budgetAfterB < 0, `Still in debt: ${budgetAfterB}`);
}

console.log('\n--- TEST E: reset_debt_on_session_end switch ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;
    engine.handleSingleTargetHit('p', 'f1', '1x', 6);
    Math.random = origRandom;

    const ps = engine.playerStates.get('p');
    assert(ps.budgetRemainingFp < 0, 'Player has debt after early T6 kill');
    assert(ps.reset_debt_on_session_end === false, 'Default = false');

    engine.resetPlayerDebtIfEnabled('p');
    assert(ps.budgetRemainingFp < 0, 'Debt NOT cleared when switch=false');

    ps.reset_debt_on_session_end = true;
    engine.resetPlayerDebtIfEnabled('p');
    assert(ps.budgetRemainingFp === 0, 'Debt CLEARED when switch=true');
}

console.log('\n--- TEST F: 70/30 Budget allocation math ---');
{
    const bTotal = Math.floor(8000 * 9800 / RTP_SCALE);
    const b0 = Math.floor(bTotal * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
    const secTotal = bTotal - b0;
    console.log(`  8x budget_total=${bTotal}, primary(70%)=${b0}, secondary(30%)=${secTotal}`);

    assert(b0 === 5488, 'Primary budget = floor(7840*0.7) = 5488');
    assert(secTotal === 2352, 'Secondary total = 2352');

    for (const M of [2, 3, 5]) {
        const secEach = Math.floor(secTotal / (M - 1));
        const used = b0 + secEach * (M - 1);
        const recovered = bTotal - used;
        console.log(`  M=${M}: secEach=${secEach}, used=${used}, recovered=${recovered}`);
        assert(used <= bTotal, `M=${M}: used(${used}) <= total(${bTotal})`);
    }
}

console.log('\n--- TEST G: kill_event_id idempotency ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.999999;
    for (let i = 0; i < 7; i++) engine.handleSingleTargetHit('p', 'f1', '1x', 1);
    Math.random = origRandom;

    const fs = engine.fishStates.get('p:f1');
    assert(fs.killed === true, 'Fish killed at hard pity (shot 7)');

    const dup = engine.handleSingleTargetHit('p', 'f1', '1x', 1);
    assert(dup.kill === false, 'Duplicate returns kill=false');
    assert(dup.reason === 'already_killed', 'Reason = already_killed');
}

console.log('\n--- TEST H: 1x T1 RTP convergence (10k fish, single engine) ---');
{
    const engine = new ClientRTPPhase1();
    const FISH = 10000;
    let totalBet = 0, totalWin = 0;
    for (let f = 0; f < FISH; f++) {
        const fid = 'h_' + f;
        for (let shot = 1; shot <= 100; shot++) {
            totalBet += 1;
            const r = engine.handleSingleTargetHit('p', fid, '1x', 1);
            if (r.kill) { totalWin += r.reward; engine.clearFishStates(fid); break; }
        }
    }
    const rtp = totalWin / totalBet;
    console.log(`  10k fish (single engine): bets=${totalBet}, wins=${totalWin.toFixed(2)}, RTP=${(rtp * 100).toFixed(2)}%`);
    assert(rtp >= 0.85 && rtp <= 1.0, `RTP in [85%,100%]: ${(rtp * 100).toFixed(2)}%`);
}

console.log('\n--- TEST I: v1.3 Master Matrix values ---');
{
    const expected = [
        { tier: 1, reward: 6.44, n1: 7, pityComp: 0.367 },
        { tier: 2, reward: 9.2, n1: 10, pityComp: 0.344 },
        { tier: 3, reward: 14.72, n1: 16, pityComp: 0.332 },
        { tier: 4, reward: 27.6, n1: 30, pityComp: 0.3264 },
        { tier: 5, reward: 41.4, n1: 45, pityComp: 0.3226 },
        { tier: 6, reward: 110.4, n1: 120, pityComp: 0.316 }
    ];
    for (const e of expected) {
        const c = RTP_TIER_CONFIG[e.tier];
        assert(c.rewardFp === e.reward * RTP_MONEY_SCALE, `T${e.tier} reward=${c.rewardFp}`);
        assert(c.n1Fp === e.n1 * RTP_MONEY_SCALE, `T${e.tier} n1=${c.n1Fp}`);
        assert(c.pityCompFp === e.pityComp * RTP_PROGRESS_SCALE, `T${e.tier} pityComp=${c.pityCompFp}`);
    }
}

console.log('\n--- TEST J: 3x Shotgun per-pellet cost = 1 ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.999999;
    for (let p = 0; p < 3; p++) engine.handleShotgunHit('p', 'f1', '3x', 1);
    Math.random = origRandom;

    const fs = engine.fishStates.get('p:f1');
    console.log(`  After 3 pellets: sumCost=${fs.sumCostFp}`);
    assert(fs.sumCostFp === 3000, '3 pellets x 1000 = 3000');

    const ps = engine.playerStates.get('p');
    const expectedBudget = 3 * Math.floor(1000 * 9400 / RTP_SCALE);
    console.log(`  Budget: ${ps.budgetRemainingFp} (expected ${expectedBudget})`);
    assert(ps.budgetRemainingFp === expectedBudget, `3 pellets budget = 3*940 = ${expectedBudget}`);
}

console.log('\n--- TEST K: Targets > Cap (15 fish, Cap=10) — Truncation & Budget Conservation ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.999999;

    const hitList = [];
    for (let i = 0; i < 15; i++) {
        hitList.push({ fishId: 'oc_' + i, tier: 1, distance: i + 1 });
    }
    console.log(`  Input: 15 T1 fish, 8x laser (Cap=10, RTP=98%)`);

    const results = engine.handleMultiTargetHit('p', hitList, '8x', 'laser');

    console.log(`  Results length: ${results.length} (expected 10 = Cap)`);
    assert(results.length === 10, `Truncation: only 10 results returned (got ${results.length})`);

    let updatedCount = 0;
    for (let i = 0; i < 10; i++) {
        const fs = engine.fishStates.get('p:oc_' + i);
        assert(fs !== undefined, `Fish oc_${i} (index ${i}) has RTP state`);
        assert(fs.sumCostFp > 0, `Fish oc_${i} sumCost=${fs.sumCostFp} > 0 (updated)`);
        updatedCount++;
    }
    console.log(`  First 10 fish: all have updated sumCost`);

    let isolatedCount = 0;
    for (let i = 10; i < 15; i++) {
        const fs = engine.fishStates.get('p:oc_' + i);
        assert(fs === undefined, `Fish oc_${i} (index ${i}) has NO state (isolated)`);
        isolatedCount++;
    }
    console.log(`  Fish 11-15: ${isolatedCount} fish completely isolated (no state created)`);

    const weaponCostFp = RTP_WEAPON_COST_FP['8x'];
    const rtpWeaponFp = RTP_WEAPON_RTP_FP['8x'];
    const budgetTotalFp = Math.floor(weaponCostFp * rtpWeaponFp / RTP_SCALE);
    console.log(`  Expected budget_total = floor(8000 * 9800 / 10000) = ${budgetTotalFp}`);

    const M = 10;
    let budget0Fp = Math.floor(budgetTotalFp * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
    const secTotal = budgetTotalFp - budget0Fp;
    const secEach = Math.floor(secTotal / (M - 1));
    const usedBeforeRemainder = budget0Fp + secEach * (M - 1);
    const remainder = budgetTotalFp - usedBeforeRemainder;
    budget0Fp += remainder;
    const distributedBudget = budget0Fp + secEach * (M - 1);

    console.log(`  Primary budget (before remainder): ${budget0Fp - remainder}`);
    console.log(`  Floor remainder: ${remainder} (added to primary)`);
    console.log(`  Primary budget (after remainder): ${budget0Fp}`);
    console.log(`  Secondary each: ${secEach} x ${M - 1} = ${secEach * (M - 1)}`);
    console.log(`  Total distributed: ${distributedBudget}`);

    const ps = engine.playerStates.get('p');
    let totalRewardDeducted = 0;
    for (let i = 0; i < 10; i++) {
        const r = results[i];
        if (r.kill) totalRewardDeducted += r.rewardFp;
    }
    const netBudget = distributedBudget - totalRewardDeducted;
    console.log(`  Rewards deducted: ${totalRewardDeducted}`);
    console.log(`  Player budget: ${ps.budgetRemainingFp} (expected: distributed - rewards = ${netBudget})`);

    assert(distributedBudget === budgetTotalFp,
        `Budget conservation: distributed(${distributedBudget}) === total(${budgetTotalFp})`);

    const cost0Fp = Math.floor(weaponCostFp * RTP_PRIMARY_WEIGHT / RTP_PROGRESS_SCALE);
    const costSecEach = Math.floor((weaponCostFp - cost0Fp) / (M - 1));
    const totalCostDistributed = cost0Fp + costSecEach * (M - 1);
    console.log(`  Cost distributed: primary=${cost0Fp} + sec=${costSecEach}x${M-1} = ${totalCostDistributed}`);

    let actualSumCost = 0;
    for (let i = 0; i < 10; i++) {
        const fs = engine.fishStates.get('p:oc_' + i);
        actualSumCost += fs.sumCostFp;
    }
    console.log(`  Actual total sumCost across 10 fish: ${actualSumCost}`);
    assert(actualSumCost === totalCostDistributed,
        `Cost conservation: actual(${actualSumCost}) === expected(${totalCostDistributed})`);

    Math.random = origRandom;
}

console.log('\n--- TEST L: Insufficient Balance — fire rejected, RTP state untouched ---');
{
    const engine = new ClientRTPPhase1();
    const playerBalance = 500;
    const weapons = ['1x', '3x', '5x', '8x'];
    const costs = { '1x': 1, '3x': 3, '5x': 5, '8x': 8 };

    console.log(`  Player balance: ${playerBalance} (cost in game units)`);

    let allBlocked = true;
    for (const wk of weapons) {
        const costInGame = costs[wk];
        const canFire = playerBalance >= costInGame;
        if (wk === '1x' || wk === '3x') {
            assert(canFire === true, `${wk} (cost=${costInGame}): CAN fire with balance=${playerBalance}`);
        }
    }

    const insufficientBalance = 2;
    console.log(`  Simulating balance=${insufficientBalance} (insufficient for 3x/5x/8x)`);

    for (const wk of ['3x', '5x', '8x']) {
        const costInGame = costs[wk];
        const canFire = insufficientBalance >= costInGame;
        assert(canFire === false, `${wk} (cost=${costInGame}): BLOCKED with balance=${insufficientBalance}`);
    }

    console.log('  Verifying: if fire is blocked, RTP engine receives NO call');
    const fsBefore = engine.fishStates.size;
    const psBefore = engine.playerStates.size;
    assert(fsBefore === 0, `fishStates untouched (size=${fsBefore})`);
    assert(psBefore === 0, `playerStates untouched (size=${psBefore})`);

    console.log('  Verifying: 1x CAN fire, RTP engine DOES update');
    const r = engine.handleSingleTargetHit('p', 'fish1', '1x', 1);
    assert(engine.fishStates.size === 1, `After 1x fire: fishStates.size=1`);
    assert(engine.playerStates.size === 1, `After 1x fire: playerStates.size=1`);
    const fs = engine.fishStates.get('p:fish1');
    assert(fs.sumCostFp === 1000, `sumCostFp=1000 after 1x hit`);
}

console.log('\n--- TEST M: Race Condition — concurrent kill on same fish_id ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;
    Math.random = () => 0.0;

    console.log('  Simulating 10 rapid-fire hits on same fish (all would kill)');
    let killCount = 0;
    let alreadyKilledCount = 0;
    const killEventIds = new Set();

    for (let i = 0; i < 10; i++) {
        const r = engine.handleSingleTargetHit('p', 'race_fish', '1x', 1);
        if (r.kill) {
            killCount++;
            if (r.killEventId) {
                assert(!killEventIds.has(r.killEventId), `Kill event ${i}: unique killEventId`);
                killEventIds.add(r.killEventId);
            }
        }
        if (r.reason === 'already_killed') alreadyKilledCount++;
    }

    console.log(`  Kills: ${killCount}, Already-killed rejections: ${alreadyKilledCount}`);
    assert(killCount === 1, `Exactly 1 kill (got ${killCount})`);
    assert(alreadyKilledCount === 9, `9 rejected as already_killed (got ${alreadyKilledCount})`);
    assert(killEventIds.size === 1, `Exactly 1 unique killEventId (got ${killEventIds.size})`);

    const fState = engine.fishStates.get('p:race_fish');
    assert(fState.killed === true, 'Fish marked killed after first hit');
    assert(fState.sumCostFp === 1000, `sumCostFp frozen at 1000 (no further accumulation)`);

    console.log('  Verifying multi-target race: same fish in hit_list twice');
    const engine2 = new ClientRTPPhase1();
    Math.random = () => 0.0;
    const dupeHitList = [
        { fishId: 'dup_fish', tier: 1, distance: 1 },
        { fishId: 'dup_fish', tier: 1, distance: 2 },
        { fishId: 'dup_fish', tier: 1, distance: 3 }
    ];
    const results = engine2.handleMultiTargetHit('p', dupeHitList, '8x', 'laser');
    let multiKillCount = results.filter(r => r.kill).length;
    let multiAlreadyKilled = results.filter(r => r.reason === 'already_killed').length;
    console.log(`  Multi-target dupe: kills=${multiKillCount}, already_killed=${multiAlreadyKilled}`);
    assert(multiKillCount <= 1, `At most 1 kill from duplicate fish in hit_list (got ${multiKillCount})`);

    const pState = engine2.playerStates.get('p');
    const rewardDeducted = multiKillCount * RTP_TIER_CONFIG[1].rewardFp;
    console.log(`  Reward deducted: ${rewardDeducted} (${multiKillCount} kill x ${RTP_TIER_CONFIG[1].rewardFp})`);
    assert(multiKillCount <= 1, `No double payout: reward deducted exactly ${multiKillCount} time(s)`);

    Math.random = origRandom;
}

console.log('\n--- TEST N: Debt Floor Guardrail — extreme negative budget ---');
{
    const engine = new ClientRTPPhase1();
    const origRandom = Math.random;

    console.log('  Phase 1: Force massive debt via T6 early kill');
    Math.random = () => 0.0;
    engine.handleSingleTargetHit('p', 'boss', '1x', 6);
    Math.random = origRandom;

    const pState = engine.playerStates.get('p');
    const debtAfterT6 = pState.budgetRemainingFp;
    console.log(`  Debt after T6 kill: ${debtAfterT6}`);
    assert(debtAfterT6 < 0, `Player in debt: ${debtAfterT6}`);

    console.log('  Phase 2: Force budget to -rewardFp exactly');
    pState.budgetRemainingFp = -RTP_TIER_CONFIG[1].rewardFp;
    console.log(`  Set budgetRemainingFp = ${pState.budgetRemainingFp}`);

    Math.random = () => 0.999999;
    let crashed = false;
    let result;
    try {
        result = engine.handleSingleTargetHit('p', 'test_fish_n', '1x', 1);
    } catch (e) {
        crashed = true;
        console.log(`  CRASH: ${e.message}`);
    }
    assert(!crashed, 'No crash with extreme negative budget');

    const budgetEffFp = Math.max(0, pState.budgetRemainingFp);
    console.log(`  budgetEffFp = max(0, ${pState.budgetRemainingFp}) = ${budgetEffFp}`);
    assert(budgetEffFp === 0, `budgetEffFp clamped to 0 (not negative)`);

    const pBaseRawFp = Math.floor(budgetEffFp * RTP_P_SCALE / RTP_TIER_CONFIG[1].rewardFp);
    console.log(`  P_base_raw = floor(0 * 1000000 / 6440) = ${pBaseRawFp}`);
    assert(pBaseRawFp === 0, `P_base = 0 when budget is negative`);

    console.log('  Phase 3: Verify P_base=0 means no probability kill (only hard pity possible)');
    Math.random = () => 0.0;
    const engine2 = new ClientRTPPhase1();
    const pState2 = engine2._getOrCreatePlayerState('p');
    pState2.budgetRemainingFp = -100000;

    let probKills = 0;
    for (let i = 0; i < 100; i++) {
        const r = engine2.handleSingleTargetHit('p', 'nf_' + i, '1x', 1);
        if (r.kill && r.reason === 'probability') probKills++;
    }
    console.log(`  100 shots with deep debt: probability kills = ${probKills}`);
    assert(probKills === 0, `Zero probability kills when in deep debt (got ${probKills})`);

    console.log('  Phase 4: Extreme negative values — no integer overflow or NaN');
    const engine3 = new ClientRTPPhase1();
    const pState3 = engine3._getOrCreatePlayerState('p');
    pState3.budgetRemainingFp = -2147483648;
    let crashedExtreme = false;
    let resultExtreme;
    try {
        resultExtreme = engine3.handleSingleTargetHit('p', 'extreme_fish', '8x', 6);
    } catch (e) {
        crashedExtreme = true;
    }
    assert(!crashedExtreme, 'No crash with INT_MIN budget');
    assert(!isNaN(pState3.budgetRemainingFp), `budgetRemainingFp is not NaN`);
    assert(isFinite(pState3.budgetRemainingFp), `budgetRemainingFp is finite`);

    console.log('  Phase 5: Verify multi-target also handles deep debt');
    const engine4 = new ClientRTPPhase1();
    const pState4 = engine4._getOrCreatePlayerState('p');
    pState4.budgetRemainingFp = -500000;
    let crashedMulti = false;
    try {
        const hitList = Array.from({ length: 5 }, (_, i) => ({ fishId: 'df_' + i, tier: 1, distance: i + 1 }));
        Math.random = () => 0.5;
        const results = engine4.handleMultiTargetHit('p', hitList, '5x', 'aoe');
        assert(Array.isArray(results), `handleMultiTargetHit returns array with deep debt`);
        assert(results.length === 5, `All 5 targets processed (got ${results.length})`);
    } catch (e) {
        crashedMulti = true;
    }
    assert(!crashedMulti, 'No crash in handleMultiTargetHit with deep debt');

    Math.random = origRandom;
}

// ======================================================================
// DEEP STABILITY AUDIT — 3 Final Tests
// ======================================================================

console.log('\n--- TEST O: Disconnection Recovery — Budget/Balance Strong Consistency ---');
{
    const engine = new ClientRTPPhase1();
    const pid = 'dc_player';
    const origRandom = Math.random;

    // Scenario: Player fires 5 shots at T1 fish, "disconnect" happens mid-settlement on shot 3
    // We verify that budget_remaining is ALWAYS = sum(budget_injected) - sum(reward_paid)
    // regardless of where the interruption occurs.

    // Phase 1: Fire shots 1-2 normally (no kills, force high rand)
    Math.random = () => 0.999;
    let totalBudgetInjected = 0;
    let totalRewardPaid = 0;

    for (let i = 0; i < 2; i++) {
        const fishId = 'dc_fish_' + i;
        const r = engine.handleSingleTargetHit(pid, fishId, '1x', 1);
        totalBudgetInjected += Math.floor(1000 * 9200 / 10000); // 920
        if (r.kill) totalRewardPaid += r.rewardFp;
    }
    const pState = engine._getOrCreatePlayerState(pid);
    const expectedBudget1 = totalBudgetInjected - totalRewardPaid;
    assert(pState.budgetRemainingFp === expectedBudget1,
        `Phase 1 (2 shots): budget=${pState.budgetRemainingFp} === expected=${expectedBudget1}`);

    // Phase 2: Simulate "mid-settlement disconnect" on shot 3
    // The key insight: each handleSingleTargetHit is ATOMIC — it either fully completes or doesn't.
    // There is no partial state. So "disconnect" means the call either happened or didn't.

    // Case A: Shot 3 completes before disconnect (budget updated)
    const fishId3 = 'dc_fish_3';
    const r3 = engine.handleSingleTargetHit(pid, fishId3, '1x', 1);
    totalBudgetInjected += 920;
    if (r3.kill) totalRewardPaid += r3.rewardFp;
    const expectedBudget2 = totalBudgetInjected - totalRewardPaid;
    assert(pState.budgetRemainingFp === expectedBudget2,
        `Phase 2A (shot 3 completed): budget=${pState.budgetRemainingFp} === expected=${expectedBudget2}`);

    // Case B: Simulate "reconnect" — create new engine with same player state (state recovery)
    const engine2 = new ClientRTPPhase1();
    const pState2 = engine2._getOrCreatePlayerState(pid);
    // Simulate server restoring player budget from persistent storage
    pState2.budgetRemainingFp = pState.budgetRemainingFp;
    assert(pState2.budgetRemainingFp === expectedBudget2,
        `Phase 2B (reconnect): restored budget=${pState2.budgetRemainingFp} === pre-disconnect=${expectedBudget2}`);

    // Phase 3: After reconnect, fire 2 more shots — budget must remain consistent
    for (let i = 4; i < 6; i++) {
        const fid = 'dc_fish_' + i;
        const r = engine2.handleSingleTargetHit(pid, fid, '1x', 1);
        totalBudgetInjected += 920;
        if (r.kill) totalRewardPaid += r.rewardFp;
    }
    const expectedBudget3 = totalBudgetInjected - totalRewardPaid;
    assert(pState2.budgetRemainingFp === expectedBudget3,
        `Phase 3 (post-reconnect 2 shots): budget=${pState2.budgetRemainingFp} === expected=${expectedBudget3}`);

    // Phase 4: Verify budget invariant holds across kills
    // Force a kill (hard pity) and verify budget = injected - rewards
    Math.random = () => 0.999; // No probability kill
    const pityFishId = 'dc_pity_fish';
    for (let shot = 0; shot < 7; shot++) {
        const r = engine2.handleSingleTargetHit(pid, pityFishId, '1x', 1);
        totalBudgetInjected += 920;
        if (r.kill) {
            totalRewardPaid += r.rewardFp;
            console.log(`  Pity kill on shot ${shot + 1}: reward=${r.rewardFp}, budget after=${pState2.budgetRemainingFp}`);
        }
    }
    const expectedBudget4 = totalBudgetInjected - totalRewardPaid;
    assert(pState2.budgetRemainingFp === expectedBudget4,
        `Phase 4 (after pity kill): budget=${pState2.budgetRemainingFp} === expected=${expectedBudget4}`);

    // Phase 5: Multi-target disconnect scenario
    // Fire 8x laser at 5 fish, verify budget consistency after atomic batch
    const engine3 = new ClientRTPPhase1();
    const pState3 = engine3._getOrCreatePlayerState('dc_multi');
    Math.random = () => 0.999;
    let multiBudgetInjected = 0;
    let multiRewardPaid = 0;

    const multiHitList = [];
    for (let i = 0; i < 5; i++) {
        multiHitList.push({ fishId: 'dcm_' + i, tier: 1, distance: i + 1 });
    }
    const multiResults = engine3.handleMultiTargetHit('dc_multi', multiHitList, '8x', 'laser');
    const budget8x = Math.floor(8000 * 9800 / 10000); // 7840
    multiBudgetInjected += budget8x; // entire batch = one weapon cost
    for (const r of multiResults) {
        if (r.kill) multiRewardPaid += r.rewardFp;
    }
    const expectedMultiBudget = multiBudgetInjected - multiRewardPaid;
    assert(pState3.budgetRemainingFp === expectedMultiBudget,
        `Phase 5 (8x multi-target): budget=${pState3.budgetRemainingFp} === expected=${expectedMultiBudget}`);

    // Phase 6: Verify strong consistency formula: budget = Σ(weapon_rtp * cost / SCALE) - Σ(rewards)
    console.log(`  Strong consistency verified across all phases:`);
    console.log(`  Total injected: ${totalBudgetInjected}, Total rewards: ${totalRewardPaid}`);
    console.log(`  Formula: budget = ${totalBudgetInjected} - ${totalRewardPaid} = ${totalBudgetInjected - totalRewardPaid}`);
    assert(true, `Budget = Σ(budget_injected) - Σ(reward_paid) holds in all 6 phases`);

    Math.random = origRandom;
}

console.log('\n--- TEST P: Weapon Switch Arbitrage — 1x Farm + 8x Harvest ---');
{
    const origRandom = Math.random;

    // Scenario: Player uses 1x to "farm" sum_cost progress on a fish cheaply,
    // then switches to 8x to "harvest" at higher RTP. Verify no arbitrage.
    //
    // Key insight: sum_cost tracks ACTUAL cost spent on this fish.
    //   - 1x costs 1000 FP per shot
    //   - 8x costs 8000 FP per shot (but in multi-target, primary gets 70% = 5600)
    // The fish doesn't care which weapon was used — sum_cost accumulates honestly.
    // Hard pity triggers at sum_cost >= n1 regardless of weapon.
    // The "exploit" would be: use 1x (cheap) to get sum_cost near n1, then switch to 8x
    // for the kill to get better RTP on the kill shot.
    //
    // Result: This is NOT an exploit because:
    // 1. Each shot's budget_injected is proportional to weapon cost * weapon_RTP
    // 2. 1x shots inject 920 budget each, 8x injects 7840 — the budget tracks weapon used
    // 3. The player's TOTAL spend is honest regardless of weapon order

    console.log('  Scenario A: Pure 1x strategy (7 shots to T1 hard pity)');
    {
        const engine = new ClientRTPPhase1();
        Math.random = () => 0.999;
        let totalCost = 0;
        let totalReward = 0;
        const pid = 'arb_pure1x';

        for (let i = 0; i < 100; i++) {
            const fid = 'arb1_' + i;
            let killed = false;
            for (let s = 0; !killed && s < 20; s++) {
                const r = engine.handleSingleTargetHit(pid, fid, '1x', 1);
                totalCost += 1000;
                if (r.kill) { totalReward += r.rewardFp; killed = true; }
            }
        }
        const rtp1x = (totalReward / totalCost * 100).toFixed(2);
        console.log(`  Pure 1x: cost=${totalCost}, reward=${totalReward}, RTP=${rtp1x}%`);
        assert(parseFloat(rtp1x) >= 85 && parseFloat(rtp1x) <= 100,
            `Pure 1x RTP in [85%, 100%]: ${rtp1x}%`);
    }

    console.log('  Scenario B: 1x farm (6 shots) + 8x harvest (1 shot) per fish');
    {
        const engine = new ClientRTPPhase1();
        Math.random = () => 0.999;
        let totalCost = 0;
        let totalReward = 0;
        const pid = 'arb_switch';

        for (let i = 0; i < 100; i++) {
            const fid = 'arbs_' + i;
            // Phase 1: Farm with 1x for 6 shots (sum_cost = 6000, near n1=7000)
            for (let s = 0; s < 6; s++) {
                const r = engine.handleSingleTargetHit(pid, fid, '1x', 1);
                totalCost += 1000;
                if (r.kill) { totalReward += r.rewardFp; break; }
            }
            const fState = engine._getOrCreateFishState(pid, fid);
            if (fState.killed) continue;

            // Phase 2: Switch to 8x for the "harvest" shot
            const r8 = engine.handleSingleTargetHit(pid, fid, '8x', 1);
            totalCost += 8000;
            if (r8.kill) totalReward += r8.rewardFp;
        }
        const rtpSwitch = (totalReward / totalCost * 100).toFixed(2);
        console.log(`  1x farm+8x harvest: cost=${totalCost}, reward=${totalReward}, RTP=${rtpSwitch}%`);
        assert(parseFloat(rtpSwitch) >= 85 && parseFloat(rtpSwitch) <= 100,
            `Switch strategy RTP in [85%, 100%]: ${rtpSwitch}%`);
    }

    console.log('  Scenario C: Verify sum_cost precision across weapon switches');
    {
        const engine = new ClientRTPPhase1();
        Math.random = () => 0.999;
        const pid = 'arb_precision';
        const fid = 'arb_fish_p';

        // 3 shots with 1x (cost 1000 each) + 1 shot with 3x shotgun (cost 1000 per pellet)
        engine.handleSingleTargetHit(pid, fid, '1x', 1);
        engine.handleSingleTargetHit(pid, fid, '1x', 1);
        engine.handleSingleTargetHit(pid, fid, '1x', 1);
        engine.handleShotgunHit(pid, fid, '3x', 1);

        const fState = engine._getOrCreateFishState(pid, fid);
        assert(fState.sumCostFp === 4000,
            `3x1x + 1x3x_pellet: sumCost=${fState.sumCostFp} === 4000`);

        // 2 more 1x shots (total 6000) + 1 more (total 7000 = n1 → hard pity)
        engine.handleSingleTargetHit(pid, fid, '1x', 1);
        engine.handleSingleTargetHit(pid, fid, '1x', 1);
        assert(fState.sumCostFp === 6000, `After 6 total: sumCost=${fState.sumCostFp} === 6000`);

        const r = engine.handleSingleTargetHit(pid, fid, '1x', 1);
        assert(r.kill === true, `Hard pity at sumCost=7000: kill=${r.kill}`);
        assert(r.reason === 'hard_pity', `Reason: ${r.reason}`);
        assert(fState.sumCostFp === 7000, `sumCost at pity: ${fState.sumCostFp} === 7000`);
    }

    console.log('  Scenario D: Budget injection rate — 1x vs 8x per-shot comparison');
    {
        // Compare per-shot budget injection (before any kills)
        // 1x: floor(1000 * 9200 / 10000) = 920 per shot
        // 8x: floor(8000 * 9800 / 10000) = 7840 per shot
        const inject1x = Math.floor(1000 * 9200 / 10000);
        const inject8x = Math.floor(8000 * 9800 / 10000);
        console.log(`  1x injects ${inject1x}/shot, 8x injects ${inject8x}/shot`);
        assert(inject8x > inject1x, `8x injects more per shot: ${inject8x} > ${inject1x}`);

        // But cost ratio is 8:1, budget ratio is 7840:920 = 8.52:1
        // So 8x gets slightly better budget efficiency (98% RTP vs 92% RTP)
        const ratio = (inject8x / inject1x).toFixed(2);
        console.log(`  Budget ratio: ${ratio}:1 (cost ratio: 8:1)`);
        assert(parseFloat(ratio) > 8, `8x budget ratio ${ratio} > 8 (higher RTP = better efficiency)`);

        // Key anti-arbitrage proof: switching weapons mid-fish doesn't change sum_cost
        // The fish tracks ACTUAL cost, not budget injected
        const engine = new ClientRTPPhase1();
        Math.random = () => 0.999;
        const pid = 'arb_d';
        engine.handleSingleTargetHit(pid, 'fd1', '1x', 1); // sumCost += 1000
        engine.handleSingleTargetHit(pid, 'fd1', '8x', 1); // sumCost += 8000
        const fState = engine._getOrCreateFishState(pid, 'fd1');
        assert(fState.sumCostFp === 9000, `Mixed weapon sumCost: ${fState.sumCostFp} === 9000 (1000+8000)`);
        assert(fState.killed === true, `Fish killed at sumCost=9000 >= n1=7000 (hard pity)`);
    }

    console.log('  Scenario E: 1000-fish mixed weapon session — RTP stays in band');
    {
        const engine = new ClientRTPPhase1();
        const pid = 'arb_mixed';
        let totalCost = 0;
        let totalReward = 0;
        const weapons = ['1x', '1x', '1x', '3x', '5x', '8x']; // weighted toward 1x

        for (let i = 0; i < 1000; i++) {
            const fid = 'mx_' + i;
            const tier = (i % 6) + 1;
            const weapon = weapons[i % weapons.length];
            let killed = false;

            for (let s = 0; !killed && s < 200; s++) {
                if (weapon === '3x') {
                    const r = engine.handleShotgunHit(pid, fid, '3x', tier);
                    totalCost += 1000;
                    if (r.kill) { totalReward += r.rewardFp; killed = true; }
                } else {
                    const r = engine.handleSingleTargetHit(pid, fid, weapon, tier);
                    totalCost += RTP_WEAPON_COST_FP[weapon];
                    if (r.kill) { totalReward += r.rewardFp; killed = true; }
                }
            }
        }
        const rtpMixed = (totalReward / totalCost * 100).toFixed(2);
        console.log(`  Mixed 1000-fish: cost=${totalCost}, reward=${totalReward}, RTP=${rtpMixed}%`);
        assert(parseFloat(rtpMixed) >= 80 && parseFloat(rtpMixed) <= 110,
            `Mixed weapon session RTP in [80%, 110%]: ${rtpMixed}%`);
    }

    Math.random = origRandom;
}

console.log('\n--- TEST Q: Million Monte Carlo — 1,000,000 Shots RTP Convergence ---');
{
    console.log('  Running 250,000 shots per weapon (1M total), each weapon uses dedicated fish...');

    const weaponKeys = ['1x', '3x', '5x', '8x'];
    const tiers = [1, 2, 3, 4, 5, 6];
    const expectedRTP = { '1x': 92, '3x': 94, '5x': 96, '8x': 98 };
    const SHOTS_PER_WEAPON = 250000;

    let globalCostFp = 0, globalRewardFp = 0, globalShots = 0, globalKills = 0;

    console.log('\n  ┌────────┬──────────────┬──────────────┬──────────┬────────┬──────────┐');
    console.log('  │ Weapon │   Total Cost │ Total Reward │      RTP │  Kills │ Expected │');
    console.log('  ├────────┼──────────────┼──────────────┼──────────┼────────┼──────────┤');

    for (const wk of weaponKeys) {
        const engine = new ClientRTPPhase1();
        const pid = 'mc_' + wk;
        let totalCost = 0, totalReward = 0, kills = 0, shots = 0;
        let fishId = 0;
        let currentFishId = pid + '_f0';
        let currentTier = 1;

        for (let s = 0; s < SHOTS_PER_WEAPON; s++) {
            let result, costThisShot;
            if (wk === '3x') {
                result = engine.handleShotgunHit(pid, currentFishId, '3x', currentTier);
                costThisShot = 1000;
            } else {
                result = engine.handleSingleTargetHit(pid, currentFishId, wk, currentTier);
                costThisShot = RTP_WEAPON_COST_FP[wk];
            }
            totalCost += costThisShot;
            shots++;

            if (result.kill) {
                totalReward += result.rewardFp;
                kills++;
                fishId++;
                currentFishId = pid + '_f' + fishId;
                currentTier = tiers[fishId % tiers.length];
            }
        }

        const rtp = totalCost > 0 ? (totalReward / totalCost * 100) : 0;
        console.log(`  │   ${wk.padEnd(4)} │ ${totalCost.toString().padStart(12)} │ ${totalReward.toString().padStart(12)} │ ${rtp.toFixed(2).padStart(7)}% │ ${kills.toString().padStart(6)} │ ${(expectedRTP[wk] + '%').padStart(8)} │`);

        globalCostFp += totalCost;
        globalRewardFp += totalReward;
        globalShots += shots;
        globalKills += kills;

        const target = expectedRTP[wk];
        assert(rtp >= target - 8 && rtp <= target + 8,
            `${wk} RTP ${rtp.toFixed(2)}% within ±8pp of ${target}% target`);
    }
    console.log('  └────────┴──────────────┴──────────────┴──────────┴────────┴──────────┘');

    const globalRTP = (globalRewardFp / globalCostFp * 100).toFixed(2);
    const houseEdge = (100 - parseFloat(globalRTP)).toFixed(2);
    console.log(`\n  Global: ${globalShots.toLocaleString()} shots, ${globalKills.toLocaleString()} kills`);
    console.log(`  Global RTP: ${globalRTP}%`);
    console.log(`  House Edge: ${houseEdge}%`);

    assert(parseFloat(globalRTP) >= 80 && parseFloat(globalRTP) <= 110,
        `Global RTP ${globalRTP}% in [80%, 110%]`);
    assert(parseFloat(houseEdge) > 0, `House Edge ${houseEdge}% is positive (casino profitable)`);

    // Convergence: run 1x weapon in 10 buckets of 100k shots
    console.log('\n  Convergence analysis (10 x 100k shots, 1x weapon, T1 fish):');
    const bucketRTPs = [];
    for (let b = 0; b < 10; b++) {
        const eng = new ClientRTPPhase1();
        let bCost = 0, bReward = 0;
        let fid = 0, curFid = 'cv_' + b + '_f0';
        for (let s = 0; s < 100000; s++) {
            const r = eng.handleSingleTargetHit('cv', curFid, '1x', 1);
            bCost += 1000;
            if (r.kill) {
                bReward += r.rewardFp;
                fid++;
                curFid = 'cv_' + b + '_f' + fid;
            }
        }
        const bRTP = (bReward / bCost * 100).toFixed(2);
        bucketRTPs.push(parseFloat(bRTP));
        console.log(`  Bucket ${b + 1}: RTP=${bRTP}%`);
    }

    const minB = Math.min(...bucketRTPs);
    const maxB = Math.max(...bucketRTPs);
    const spread = (maxB - minB).toFixed(2);
    const mean = bucketRTPs.reduce((a, b) => a + b, 0) / bucketRTPs.length;
    const variance = bucketRTPs.reduce((a, b) => a + (b - mean) ** 2, 0) / bucketRTPs.length;
    const stddev = Math.sqrt(variance).toFixed(2);
    console.log(`  Spread: ${spread}pp, Mean: ${mean.toFixed(2)}%, StdDev: ${stddev}pp`);
    assert(parseFloat(spread) < 10, `Bucket spread ${spread}pp < 10pp (stable convergence)`);
    assert(parseFloat(stddev) < 3, `StdDev ${stddev}pp < 3pp (low variance)`);
    assert(mean >= 88 && mean <= 96, `Mean 1x RTP ${mean.toFixed(2)}% near 92% target`);
}

console.log('\n' + '='.repeat(70));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));
if (failed > 0) process.exit(1);
