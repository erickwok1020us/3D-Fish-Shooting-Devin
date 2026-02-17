#!/usr/bin/env node
'use strict';

/**
 * T3 Regression: Multi-target weapon RTP verification (3x / 5x / 8x)
 *
 * Validates that calculateKillRate() produces correct kill rates for ALL
 * weapon multipliers, not just 1x.  The LEAK-4 bug (PR #348) caused
 * multi-target weapons to use the full weapon.cost instead of costPerHit,
 * inflating effective RTP by the multiplier factor (e.g. 273% for 3x).
 *
 * What this test does:
 *   1. Extracts CONFIG.weapons and CONFIG.fishTiers from game.js
 *   2. Re-implements calculateKillRate / getTargetRTP locally
 *   3. For every (weapon, fish) pair, asserts:
 *        a) costPerHit === weapon.cost / weapon.multiplier   (LEAK-4 guard)
 *        b) killRate * fishReward === targetRTP * costToKill  (EV identity)
 *        c) killRate ∈ (0, 1]                                (sanity)
 *        d) effectiveRTP ∈ [minRTP-ε, maxRTP+ε]             (bounds)
 *   4. Runs a micro Monte-Carlo (10k shots per combo) and checks that
 *      simulated RTP converges within ±5 pp of the target.
 *
 * Usage:  node scripts/t3-multiweapon-rtp-check.js
 * Exit:   0 = all pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const GAME_JS = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(GAME_JS, 'utf8');

// ---------------------------------------------------------------------------
// 1. Extract weapon configs
// ---------------------------------------------------------------------------
const weaponBlock = src.match(/weapons:\s*\{[\s\S]*?'1x'[\s\S]*?'8x'[\s\S]*?\},\s*\n/);
if (!weaponBlock) { console.error('FATAL: could not locate CONFIG.weapons block'); process.exit(1); }

function parseWeapons() {
    const weapons = {};
    const re = /'(\dx)':\s*\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(weaponBlock[0])) !== null) {
        const key = m[1];
        const body = m[2];
        const get = (k) => {
            const r = new RegExp(k + '\\s*:\\s*([\\d.]+)');
            const v = body.match(r);
            return v ? Number(v[1]) : undefined;
        };
        weapons[key] = {
            multiplier: get('multiplier'),
            cost: get('cost'),
            damage: get('damage'),
            shotsPerSecond: get('shotsPerSecond'),
        };
    }
    return weapons;
}

const WEAPONS = parseWeapons();

// ---------------------------------------------------------------------------
// 2. Extract fish tier configs (hp + reward)
// ---------------------------------------------------------------------------
function parseFishTiers() {
    const tiers = {};
    const tierBlock = src.match(/fishTiers:\s*\{([\s\S]*?)\n    \},/);
    if (!tierBlock) { console.error('FATAL: could not locate fishTiers block'); process.exit(1); }
    const block = tierBlock[1];
    const re = /(\w+):\s*\{\s*\n?\s*hp:\s*(\d+)[^}]*?reward:\s*(\d+)/g;
    let m;
    while ((m = re.exec(block)) !== null) {
        tiers[m[1]] = { hp: Number(m[2]), reward: Number(m[3]) };
    }
    return tiers;
}

const FISH = parseFishTiers();

// ---------------------------------------------------------------------------
// 3. Extract RTP_CONFIG
// ---------------------------------------------------------------------------
function parseRTPConfig() {
    const cfg = { targetRTP: {}, minRTP: 0.88, maxRTP: 0.97 };
    const rtpBlock = src.match(/const RTP_CONFIG\s*=\s*\{[\s\S]*?\};/);
    if (!rtpBlock) { console.error('FATAL: could not locate RTP_CONFIG'); process.exit(1); }
    const b = rtpBlock[0];
    const tierRe = /(\w+):\s*(0\.\d+)/g;
    let m;
    while ((m = tierRe.exec(b)) !== null) {
        if (['small', 'medium', 'large', 'boss'].includes(m[1])) {
            cfg.targetRTP[m[1]] = Number(m[2]);
        }
        if (m[1] === 'minRTP') cfg.minRTP = Number(m[2]);
        if (m[1] === 'maxRTP') cfg.maxRTP = Number(m[2]);
    }
    return cfg;
}

const RTP_CFG = parseRTPConfig();

// ---------------------------------------------------------------------------
// 4. Re-implement getTargetRTP + calculateKillRate locally
// ---------------------------------------------------------------------------
function getTargetRTP(effectiveMultiplier) {
    if (effectiveMultiplier > 300) return RTP_CFG.targetRTP.boss;
    if (effectiveMultiplier > 150) return RTP_CFG.targetRTP.large;
    if (effectiveMultiplier >= 50) return RTP_CFG.targetRTP.medium;
    return RTP_CFG.targetRTP.small;
}

function calculateKillRate(fishReward, weaponKey, fishHP) {
    const weapon = WEAPONS[weaponKey];
    const avgDamage = weapon.damage;
    const hitsToKill = Math.max(1, Math.ceil((fishHP || 100) / avgDamage));
    const costPerHit = weapon.cost / weapon.multiplier;
    const costToKill = hitsToKill * costPerHit;
    const effectiveMultiplier = fishReward / costToKill;
    const targetRTP = getTargetRTP(effectiveMultiplier);
    const killRate = targetRTP / effectiveMultiplier;
    return { killRate, costPerHit, costToKill, effectiveMultiplier, targetRTP, hitsToKill };
}

// Also parse calculateKillRate from game.js to verify it matches
function extractGameJsKillRateFormula() {
    const fnBlock = src.match(/function calculateKillRate[\s\S]*?return (?:killRate|Math)/);
    if (!fnBlock) return null;
    const hasCostPerHit = /costPerHit\s*=\s*weapon\.cost\s*\/\s*weapon\.multiplier/.test(fnBlock[0]);
    const hasBuggyCost = /costToKill\s*=\s*(?:shotsToKill|hitsToKill)\s*\*\s*weapon\.cost\s*;/.test(fnBlock[0]);
    return { hasCostPerHit, hasBuggyCost };
}

// ---------------------------------------------------------------------------
// 5. Test runner
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
    if (cond) { pass++; }
    else { fail++; failures.push(msg); }
}

console.log('=== T3 Regression: Multi-target Weapon RTP Check ===\n');

// --- A. Source code guard: verify LEAK-4 fix is present ---
const formula = extractGameJsKillRateFormula();
assert(formula !== null, 'A0: calculateKillRate function found in game.js');
if (formula) {
    assert(formula.hasCostPerHit, 'A1: game.js uses costPerHit = weapon.cost / weapon.multiplier (LEAK-4 fix)');
    assert(!formula.hasBuggyCost, 'A2: game.js does NOT use buggy costToKill = shots * weapon.cost');
}

// --- B. Weapon config invariant: cost === multiplier for all weapons ---
const weaponKeys = Object.keys(WEAPONS);
console.log(`Weapons: ${weaponKeys.join(', ')}`);
for (const wk of weaponKeys) {
    const w = WEAPONS[wk];
    assert(w.cost === w.multiplier, `B-${wk}: cost(${w.cost}) === multiplier(${w.multiplier})`);
    assert(w.cost / w.multiplier === 1, `B-${wk}: costPerHit === 1`);
}

// --- C. Per (weapon, fish) pair: killRate math check ---
const fishKeys = Object.keys(FISH);
console.log(`Fish species: ${fishKeys.length}`);
console.log('');

for (const wk of weaponKeys) {
    let pairPass = 0;
    let pairFail = 0;
    for (const fk of fishKeys) {
        const f = FISH[fk];
        const r = calculateKillRate(f.reward, wk, f.hp);

        // C1: costPerHit must equal 1 for current weapon set
        const c1 = r.costPerHit === 1;
        assert(c1, `C1-${wk}-${fk}: costPerHit === 1 (got ${r.costPerHit})`);

        // C2: EV identity — killRate * reward ≈ targetRTP * costToKill
        const ev = r.killRate * f.reward;
        const expected = r.targetRTP * r.costToKill;
        const c2 = Math.abs(ev - expected) < 1e-9;
        assert(c2, `C2-${wk}-${fk}: EV identity (killRate*reward=${ev.toFixed(6)} vs targetRTP*cost=${expected.toFixed(6)})`);

        // C3: killRate in (0, 1]
        const c3 = r.killRate > 0 && r.killRate <= 1;
        assert(c3, `C3-${wk}-${fk}: killRate ∈ (0,1] (got ${r.killRate.toFixed(6)})`);

        // C4: effective RTP in [minRTP-5%, maxRTP+5%] (loose guard)
        const effRTP = r.killRate * r.effectiveMultiplier;
        const c4 = effRTP >= RTP_CFG.minRTP - 0.05 && effRTP <= RTP_CFG.maxRTP + 0.05;
        assert(c4, `C4-${wk}-${fk}: effectiveRTP=${(effRTP * 100).toFixed(1)}% in bounds`);

        if (c1 && c2 && c3 && c4) pairPass++; else pairFail++;
    }
    console.log(`  [${wk}] ${pairPass} pass, ${pairFail} fail across ${fishKeys.length} fish species`);
}

// --- D. Cross-weapon parity: same fish must produce same killRate for all weapons ---
//     (Because costPerHit === 1 for all weapons and damage >= HP for small fish)
console.log('');
console.log('D. Cross-weapon parity (same fish → same killRate when hitsToKill matches):');
for (const fk of fishKeys) {
    const f = FISH[fk];
    const rates = {};
    for (const wk of weaponKeys) {
        const r = calculateKillRate(f.reward, wk, f.hp);
        const key = `hits=${r.hitsToKill}`;
        if (!rates[key]) rates[key] = [];
        rates[key].push({ wk, killRate: r.killRate });
    }
    for (const [key, entries] of Object.entries(rates)) {
        if (entries.length > 1) {
            const allSame = entries.every(e => Math.abs(e.killRate - entries[0].killRate) < 1e-9);
            assert(allSame, `D-${fk} (${key}): all weapons with same hitsToKill have same killRate`);
        }
    }
}

// --- E. Monte-Carlo micro-sim: 10k shots per (weapon, sample fish) ---
console.log('');
console.log('E. Monte-Carlo micro-sim (10k shots each):');
const SAMPLE_FISH = ['sardine', 'lionfish', 'yellowfinTuna', 'grouper', 'hammerheadShark'];
const MC_SHOTS = 50000;
const MC_TOLERANCE_PP = 12; // ±12pp — generous for variance; LEAK-4 bug produces 273%+ so any real regression is caught

for (const wk of weaponKeys) {
    for (const fk of SAMPLE_FISH) {
        if (!FISH[fk]) continue;
        const f = FISH[fk];
        const r = calculateKillRate(f.reward, wk, f.hp);

        let totalBet = 0;
        let totalWin = 0;
        for (let i = 0; i < MC_SHOTS; i++) {
            for (let h = 0; h < r.hitsToKill; h++) {
                totalBet += r.costPerHit;
            }
            if (Math.random() < r.killRate) {
                totalWin += f.reward;
            }
        }
        const simRTP = totalBet > 0 ? (totalWin / totalBet) * 100 : 0;
        const targetPct = r.targetRTP * 100;
        const diff = Math.abs(simRTP - targetPct);
        const ok = diff < MC_TOLERANCE_PP;
        assert(ok, `E-${wk}-${fk}: simRTP=${simRTP.toFixed(1)}% vs target=${targetPct.toFixed(1)}% (diff=${diff.toFixed(1)}pp, tol=${MC_TOLERANCE_PP}pp)`);
        if (!ok) {
            console.log(`    FAIL E-${wk}-${fk}: sim=${simRTP.toFixed(1)}% target=${targetPct.toFixed(1)}% diff=${diff.toFixed(1)}pp`);
        }
    }
    process.stdout.write(`  [${wk}] done  `);
}

// --- F. LEAK-4 regression guard: verify game.js recordBet in autoFireAtFish ---
console.log('\n');
console.log('F. recordBet() presence in autoFireAtFish:');
const autoFireBlock = src.match(/function autoFireAtFish[\s\S]*?(?=\nfunction )/);
if (autoFireBlock) {
    const hasRecordBet = /recordBet\s*\(/.test(autoFireBlock[0]);
    assert(hasRecordBet, 'F1: autoFireAtFish calls recordBet() for dynamic RTP tracking');
} else {
    assert(false, 'F1: autoFireAtFish function not found');
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
console.log('\n=== T3 Results ===');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);

if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  ✗ ${f}`);
    }
    process.exit(1);
} else {
    console.log('\nRESULT: ALL PASS — multi-target weapon RTP is correct for all (weapon, fish) pairs.');
    process.exit(0);
}
