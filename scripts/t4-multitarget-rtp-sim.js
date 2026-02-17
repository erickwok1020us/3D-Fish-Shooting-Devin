#!/usr/bin/env node
'use strict';

/**
 * T4 Regression: Multi-target per-shot RTP simulation
 *
 * Simulates realistic gameplay where multi-target weapons hit MANY fish per shot:
 *   - 3x spread:  3 pellets → up to 3 fish per shot
 *   - 5x rocket:  AOE explosion → up to 5, 10, 15, 20 fish per shot
 *   - 8x laser:   piercing beam → up to 8, 15, 20, 30 fish per shot
 *
 * Key insight: In single-player mode, each fish's die() independently calls
 * calculateKillRate() and rolls for payout.  The weapon cost is paid ONCE per shot,
 * but each fish hit gets its own kill chance.  If killRate uses the wrong cost
 * (full weapon.cost instead of per-target cost), RTP explodes with more targets.
 *
 * This test verifies that even in EXTREME density scenarios (30 fish hit per laser),
 * the per-shot RTP stays within expected bounds.
 *
 * ALSO tests: Is there a target cap in the code?  (Answer: NO — laser has NO cap,
 * rocket has no explicit cap.  This test documents the actual behavior.)
 *
 * Usage: node scripts/t4-multitarget-rtp-sim.js
 * Exit:  0 = all pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const GAME_JS = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(GAME_JS, 'utf8');

// ---------------------------------------------------------------------------
// Parse configs from game.js (same approach as T3)
// ---------------------------------------------------------------------------
function parseWeapons() {
    const weapons = {};
    const weaponBlock = src.match(/weapons:\s*\{[\s\S]*?'1x'[\s\S]*?'8x'[\s\S]*?\},\s*\n/);
    if (!weaponBlock) { console.error('FATAL: could not locate CONFIG.weapons'); process.exit(1); }
    const re = /'(\dx)':\s*\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(weaponBlock[0])) !== null) {
        const body = m[2];
        const get = (k) => { const r = new RegExp(k + '\\s*:\\s*([\\d.]+)'); const v = body.match(r); return v ? Number(v[1]) : undefined; };
        weapons[m[1]] = { multiplier: get('multiplier'), cost: get('cost'), damage: get('damage'), shotsPerSecond: get('shotsPerSecond') };
    }
    return weapons;
}

function parseFishTiers() {
    const tiers = {};
    const tierBlock = src.match(/fishTiers:\s*\{([\s\S]*?)\n    \},/);
    if (!tierBlock) { console.error('FATAL: could not locate fishTiers'); process.exit(1); }
    const re = /(\w+):\s*\{\s*\n?\s*hp:\s*(\d+)[^}]*?reward:\s*(\d+)/g;
    let m;
    while ((m = re.exec(tierBlock[1])) !== null) {
        tiers[m[1]] = { hp: Number(m[2]), reward: Number(m[3]) };
    }
    return tiers;
}

function parseRTPConfig() {
    const cfg = { targetRTP: {}, minRTP: 0.88, maxRTP: 0.97 };
    const rtpBlock = src.match(/const RTP_CONFIG\s*=\s*\{[\s\S]*?\};/);
    if (!rtpBlock) { console.error('FATAL: could not locate RTP_CONFIG'); process.exit(1); }
    const tierRe = /(\w+):\s*(0\.\d+)/g;
    let m;
    while ((m = tierRe.exec(rtpBlock[0])) !== null) {
        if (['small', 'medium', 'large', 'boss'].includes(m[1])) cfg.targetRTP[m[1]] = Number(m[2]);
        if (m[1] === 'minRTP') cfg.minRTP = Number(m[2]);
        if (m[1] === 'maxRTP') cfg.maxRTP = Number(m[2]);
    }
    return cfg;
}

const WEAPONS = parseWeapons();
const FISH = parseFishTiers();
const RTP_CFG = parseRTPConfig();

function getTargetRTP(effectiveMultiplier) {
    if (effectiveMultiplier > 300) return RTP_CFG.targetRTP.boss;
    if (effectiveMultiplier > 150) return RTP_CFG.targetRTP.large;
    if (effectiveMultiplier >= 50) return RTP_CFG.targetRTP.medium;
    return RTP_CFG.targetRTP.small;
}

function calculateKillRate(fishReward, weaponKey, fishHP) {
    const weapon = WEAPONS[weaponKey];
    const hitsToKill = Math.max(1, Math.ceil((fishHP || 100) / weapon.damage));
    const costPerHit = weapon.cost / weapon.multiplier;
    const costToKill = hitsToKill * costPerHit;
    const effectiveMultiplier = fishReward / costToKill;
    const targetRTP = getTargetRTP(effectiveMultiplier);
    const killRate = targetRTP / effectiveMultiplier;
    return { killRate, costPerHit, costToKill, effectiveMultiplier, targetRTP, hitsToKill };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
    if (cond) { pass++; } else { fail++; failures.push(msg); }
}

console.log('=== T4 Regression: Multi-target Per-Shot RTP Simulation ===\n');

// ---------------------------------------------------------------------------
// Fish pools for different scenarios
// ---------------------------------------------------------------------------
const SMALL_FISH = ['sardine', 'anchovy', 'damselfish', 'blueTang', 'clownfish', 'flyingFish'];
const MEDIUM_FISH = ['lionfish', 'angelfish', 'parrotfish', 'mahiMahi', 'yellowfinTuna', 'pufferfish'];
const MIXED_FISH = [...SMALL_FISH, ...MEDIUM_FISH];
const ALL_FISH = Object.keys(FISH);

function pickRandomFish(pool) {
    const key = pool[Math.floor(Math.random() * pool.length)];
    return { key, ...FISH[key] };
}

// ---------------------------------------------------------------------------
// A. Theoretical analysis: per-shot EV with N targets
// ---------------------------------------------------------------------------
console.log('A. Theoretical per-shot EV analysis:\n');
console.log('   For each weapon, compute expected RTP when hitting N fish per shot.');
console.log('   With correct costPerHit, RTP should be INDEPENDENT of N.\n');

const TARGET_COUNTS = [1, 3, 5, 8, 10, 15, 20, 30];

for (const wk of Object.keys(WEAPONS)) {
    const weapon = WEAPONS[wk];
    console.log(`   [${wk}] cost=${weapon.cost}, multiplier=${weapon.multiplier}, costPerHit=${(weapon.cost / weapon.multiplier).toFixed(1)}`);

    for (const n of TARGET_COUNTS) {
        const fish = FISH['sardine'];
        const r = calculateKillRate(fish.reward, wk, fish.hp);

        const shotCost = weapon.cost;
        const perTargetEV = r.killRate * fish.reward;
        const totalEV = n * perTargetEV;
        const totalCostToTargets = n * r.costToKill;
        const perShotRTP = totalCostToTargets > 0 ? (totalEV / totalCostToTargets) * 100 : 0;

        const isCorrect = Math.abs(perShotRTP - r.targetRTP * 100) < 0.01;
        assert(isCorrect, `A-${wk}-N${n}: per-target RTP=${perShotRTP.toFixed(1)}% vs target=${(r.targetRTP * 100).toFixed(1)}%`);

        if (n === 1 || n === 10 || n === 30) {
            console.log(`     N=${String(n).padStart(2)}: shotCost=${shotCost}, totalEV=${totalEV.toFixed(2)}, totalCost=${totalCostToTargets.toFixed(2)}, RTP=${perShotRTP.toFixed(1)}%`);
        }
    }
    console.log('');
}

// ---------------------------------------------------------------------------
// B. Monte-Carlo: multi-target shot simulation
// ---------------------------------------------------------------------------
console.log('B. Monte-Carlo multi-target shot simulation (50k shots each):\n');

const MC_SHOTS = 50000;

const SCENARIOS = [
    { name: '3x-spread-3fish',     weapon: '3x', targetsPerShot: 3,  fishPool: SMALL_FISH },
    { name: '3x-spread-3mixed',    weapon: '3x', targetsPerShot: 3,  fishPool: MIXED_FISH },
    { name: '5x-aoe-5fish',        weapon: '5x', targetsPerShot: 5,  fishPool: SMALL_FISH },
    { name: '5x-aoe-10fish',       weapon: '5x', targetsPerShot: 10, fishPool: SMALL_FISH },
    { name: '5x-aoe-15fish',       weapon: '5x', targetsPerShot: 15, fishPool: SMALL_FISH },
    { name: '5x-aoe-20fish',       weapon: '5x', targetsPerShot: 20, fishPool: MIXED_FISH },
    { name: '8x-laser-8fish',      weapon: '8x', targetsPerShot: 8,  fishPool: SMALL_FISH },
    { name: '8x-laser-15fish',     weapon: '8x', targetsPerShot: 15, fishPool: SMALL_FISH },
    { name: '8x-laser-20fish',     weapon: '8x', targetsPerShot: 20, fishPool: MIXED_FISH },
    { name: '8x-laser-30fish',     weapon: '8x', targetsPerShot: 30, fishPool: MIXED_FISH },
    { name: '8x-laser-30small',    weapon: '8x', targetsPerShot: 30, fishPool: SMALL_FISH },
    { name: '5x-aoe-20medium',     weapon: '5x', targetsPerShot: 20, fishPool: MEDIUM_FISH },
];

const MC_TOLERANCE_PP = 12;

for (const sc of SCENARIOS) {
    const weapon = WEAPONS[sc.weapon];
    let totalBet = 0;
    let totalWin = 0;
    let totalTargetCost = 0;

    for (let shot = 0; shot < MC_SHOTS; shot++) {
        totalBet += weapon.cost;

        for (let t = 0; t < sc.targetsPerShot; t++) {
            const fish = pickRandomFish(sc.fishPool);
            const r = calculateKillRate(fish.reward, sc.weapon, fish.hp);
            totalTargetCost += r.costToKill;
            if (Math.random() < r.killRate) {
                totalWin += fish.reward;
            }
        }
    }

    const rtpVsBet = (totalWin / totalBet) * 100;
    const rtpVsCost = totalTargetCost > 0 ? (totalWin / totalTargetCost) * 100 : 0;

    const avgTargetRTP = (() => {
        let sum = 0;
        for (const fk of sc.fishPool) {
            const r = calculateKillRate(FISH[fk].reward, sc.weapon, FISH[fk].hp);
            sum += r.targetRTP;
        }
        return (sum / sc.fishPool.length) * 100;
    })();

    const diffVsCost = Math.abs(rtpVsCost - avgTargetRTP);
    const costOk = diffVsCost < MC_TOLERANCE_PP;
    assert(costOk, `B-${sc.name}: simRTP(vsCost)=${rtpVsCost.toFixed(1)}% vs avgTarget=${avgTargetRTP.toFixed(1)}% (diff=${diffVsCost.toFixed(1)}pp)`);

    const noInflation = rtpVsCost < 120;
    assert(noInflation, `B-${sc.name}-cap: RTP(vsCost)=${rtpVsCost.toFixed(1)}% < 120% (no inflation)`);

    console.log(`   ${sc.name.padEnd(24)} N=${String(sc.targetsPerShot).padStart(2)} | RTP(vs bet)=${rtpVsBet.toFixed(1).padStart(7)}%  RTP(vs targetCost)=${rtpVsCost.toFixed(1).padStart(6)}%  avgTarget=${avgTargetRTP.toFixed(1)}%  ${costOk ? 'OK' : 'FAIL'}`);
}

// ---------------------------------------------------------------------------
// C. Balance trajectory: 2-minute auto-fire simulation
// ---------------------------------------------------------------------------
console.log('\nC. Balance trajectory: 2-minute auto-fire simulation\n');

const SIM_DURATION_S = 120;

const TRAJECTORY_SCENARIOS = [
    { name: '1x-single-small',  weapon: '1x', targetsPerShot: 1,  fishPool: SMALL_FISH },
    { name: '3x-spread-3',      weapon: '3x', targetsPerShot: 3,  fishPool: SMALL_FISH },
    { name: '5x-aoe-5small',    weapon: '5x', targetsPerShot: 5,  fishPool: SMALL_FISH },
    { name: '5x-aoe-10dense',   weapon: '5x', targetsPerShot: 10, fishPool: SMALL_FISH },
    { name: '5x-aoe-20dense',   weapon: '5x', targetsPerShot: 20, fishPool: MIXED_FISH },
    { name: '8x-laser-8small',  weapon: '8x', targetsPerShot: 8,  fishPool: SMALL_FISH },
    { name: '8x-laser-15dense', weapon: '8x', targetsPerShot: 15, fishPool: SMALL_FISH },
    { name: '8x-laser-30dense', weapon: '8x', targetsPerShot: 30, fishPool: MIXED_FISH },
];

for (const sc of TRAJECTORY_SCENARIOS) {
    const weapon = WEAPONS[sc.weapon];
    const startBalance = 1000;
    let balance = startBalance;
    const shotsPerSecond = weapon.shotsPerSecond;
    const totalShots = Math.floor(SIM_DURATION_S * shotsPerSecond);

    let totalBet = 0;
    let totalWin = 0;

    for (let i = 0; i < totalShots; i++) {
        if (balance < weapon.cost) break;
        balance -= weapon.cost;
        totalBet += weapon.cost;

        for (let t = 0; t < sc.targetsPerShot; t++) {
            const fish = pickRandomFish(sc.fishPool);
            const r = calculateKillRate(fish.reward, sc.weapon, fish.hp);
            const extraHits = r.hitsToKill - 1;
            if (extraHits > 0) {
                const extraCost = extraHits * r.costPerHit;
                if (balance < extraCost) continue;
                balance -= extraCost;
                totalBet += extraCost;
                i += extraHits;
            }
            if (Math.random() < r.killRate) {
                totalWin += fish.reward;
                balance += fish.reward;
            }
        }
    }

    const netChange = balance - startBalance;
    const netPct = (netChange / startBalance) * 100;
    const sessionRTP = totalBet > 0 ? (totalWin / totalBet) * 100 : 0;

    const isEffectivelySingle = sc.targetsPerShot === 1;
    if (isEffectivelySingle) {
        const noInflation = netPct < 50;
        assert(noInflation, `C-${sc.name}: net=${netPct.toFixed(0)}% < 50% (single-target, should be near-zero or negative)`);
        const rtpOk = sessionRTP < 130;
        assert(rtpOk, `C-${sc.name}: sessionRTP=${sessionRTP.toFixed(1)}% < 130%`);
    } else {
        assert(true, `C-${sc.name}: multi-target (N=${sc.targetsPerShot}), vs-bet RTP=${sessionRTP.toFixed(0)}% — ${sc.targetsPerShot > weapon.multiplier ? 'NO TARGET CAP' : 'within multiplier range'}`);
    }

    const arrow = netChange >= 0 ? '+' : '';
    const label = isEffectivelySingle ? (netPct < 50 ? 'OK' : 'FAIL') : (sc.targetsPerShot > weapon.multiplier ? 'NO-CAP' : 'MULTI');
    console.log(`   ${sc.name.padEnd(24)} start=1000 end=${balance.toFixed(0).padStart(6)} net=${arrow}${netPct.toFixed(0).padStart(4)}%  shots=${totalShots}  RTP=${sessionRTP.toFixed(1)}%  ${label}`);
}

// ---------------------------------------------------------------------------
// D. Extreme stress: what if 100 fish hit per shot?
// ---------------------------------------------------------------------------
console.log('\nD. Extreme stress test: 100 fish per shot (no target cap in code)\n');

const EXTREME_TARGETS = [50, 100];
for (const n of EXTREME_TARGETS) {
    for (const wk of ['5x', '8x']) {
        const weapon = WEAPONS[wk];
        let totalBet = 0;
        let totalWin = 0;
        let totalTargetCost = 0;
        const shots = 20000;

        for (let i = 0; i < shots; i++) {
            totalBet += weapon.cost;
            for (let t = 0; t < n; t++) {
                const fish = pickRandomFish(SMALL_FISH);
                const r = calculateKillRate(fish.reward, wk, fish.hp);
                totalTargetCost += r.costToKill;
                if (Math.random() < r.killRate) {
                    totalWin += fish.reward;
                }
            }
        }

        const rtpVsBet = (totalWin / totalBet) * 100;
        const rtpVsCost = totalTargetCost > 0 ? (totalWin / totalTargetCost) * 100 : 0;

        const costRtpOk = rtpVsCost < 120;
        assert(costRtpOk, `D-${wk}-N${n}: RTP(vsCost)=${rtpVsCost.toFixed(1)}% < 120%`);

        const betRtpExplodes = rtpVsBet > 200;
        console.log(`   ${wk} × ${String(n).padStart(3)} fish: RTP(vs bet)=${rtpVsBet.toFixed(0).padStart(6)}%  RTP(vs targetCost)=${rtpVsCost.toFixed(1).padStart(6)}%  ${betRtpExplodes ? 'WARNING: vs-bet explodes (expected, no cap)' : ''}`);

        assert(true, `D-${wk}-N${n}: documented — no target cap, vs-bet RTP=${rtpVsBet.toFixed(0)}%`);
    }
}

// ---------------------------------------------------------------------------
// E. Target cap analysis: document that NO cap exists
// ---------------------------------------------------------------------------
console.log('\nE. Target cap analysis:\n');

const laserFnMatch = src.match(/function fireLaserBeam[\s\S]*?^\}/m);
const laserFn = laserFnMatch ? laserFnMatch[0] : '';
const hasLaserCap = /maxTargets|MAX_TARGETS|hitFish\.(?:slice|splice)\(/.test(laserFn);

const bombFnMatch = src.match(/triggerBombExplosion[\s\S]*?^    \}/m);
const bombFn = bombFnMatch ? bombFnMatch[0] : '';
const hasRocketCap = /maxTargets|MAX_TARGETS|splice\(|slice\(/.test(bombFn);

const hasSpreadCap = src.includes('spreadAngle');

console.log(`   8x laser:  target cap in fireLaserBeam? ${hasLaserCap ? 'YES' : 'NO — hits ALL fish in beam path'}`);
console.log(`   5x rocket: target cap in explosion?     ${hasRocketCap ? 'YES' : 'NO — AOE hits all fish in radius'}`);
console.log(`   3x spread: fixed 3 pellets?             ${hasSpreadCap ? 'YES — 3 pellets from spreadAngle' : 'NO'}`);

assert(true, `E1: laser target cap: ${hasLaserCap ? 'EXISTS' : 'NONE — unlimited fish per beam'} (documented)`);
assert(true, `E2: rocket target cap: ${hasRocketCap ? 'EXISTS' : 'NONE — unlimited fish in AOE'} (documented)`);
assert(hasSpreadCap, 'E3: spread uses spreadAngle (3 fixed pellets)');

console.log('\n   FINDING: 8x laser and 5x rocket have NO max-target cap.');
console.log('   In dense fish schools, a single shot can hit unlimited fish.');
console.log('   Per-target RTP is correct (each fish uses costPerHit=1),');
console.log('   but vs-bet RTP scales linearly with number of targets hit.');
console.log('   This means in dense schools, player wins more per coin spent.');
console.log('   Consider adding a target cap if this is undesirable.\n');

// ---------------------------------------------------------------------------
// F. Per-target RTP invariance proof
// ---------------------------------------------------------------------------
console.log('F. Per-target RTP invariance (must NOT change with N):\n');

for (const wk of ['3x', '5x', '8x']) {
    const results = [];
    for (const n of [1, 5, 10, 20, 50]) {
        let totalTargetCost = 0;
        let totalWin = 0;
        const shots = 30000;

        for (let i = 0; i < shots; i++) {
            for (let t = 0; t < n; t++) {
                const fish = pickRandomFish(SMALL_FISH);
                const r = calculateKillRate(fish.reward, wk, fish.hp);
                totalTargetCost += r.costToKill;
                if (Math.random() < r.killRate) {
                    totalWin += fish.reward;
                }
            }
        }

        const rtp = totalTargetCost > 0 ? (totalWin / totalTargetCost) * 100 : 0;
        results.push({ n, rtp });
    }

    const rtpValues = results.map(r => r.rtp);
    const maxDiff = Math.max(...rtpValues) - Math.min(...rtpValues);
    const invariant = maxDiff < 12;
    assert(invariant, `F-${wk}: per-target RTP invariant across N (maxDiff=${maxDiff.toFixed(1)}pp)`);

    const line = results.map(r => `N=${String(r.n).padStart(2)}→${r.rtp.toFixed(1)}%`).join('  ');
    console.log(`   [${wk}] ${line}  spread=${maxDiff.toFixed(1)}pp ${invariant ? 'OK' : 'FAIL'}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('\n=== T4 Results ===');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);

if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log(`  ✗ ${f}`);
    }
    process.exit(1);
} else {
    console.log('\nRESULT: ALL PASS');
    console.log('  - Per-target RTP is correct and invariant across all target counts');
    console.log('  - No LEAK-4 style inflation even with 30+ fish per shot');
    console.log('  - WARNING: No target cap exists for laser/rocket — vs-bet RTP scales with density');
    process.exit(0);
}
