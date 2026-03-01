#!/usr/bin/env node
/**
 * Monte Carlo RTP Simulation - 10,000 shots per weapon x per tier
 * 3x model: 3 independent pellets on 3 separate fish (v1.7 Section 3.1)
 * Other weapons: persistent target (same fish until killed)
 * Targets: Manual 1x=92%, 3x=94%, 5x=96%, 8x=98%
 */

const RTP_MONEY_SCALE = 1000;
const RTP_SCALE = 10000;
const RTP_P_SCALE = 1000000;

const RTP_WEAPON_RTP_MANUAL_FP = { '1x': 9200, '3x': 9400, '5x': 9600, '8x': 9800 };
const RTP_WEAPON_RTP_AUTO_FP   = { '1x': 9000, '3x': 9200, '5x': 9400, '8x': 9600 };
const RTP_WEAPON_COST_FP       = { '1x': 1000, '3x': 3000, '5x': 5000, '8x': 8000 };

const RTP_TIER_CONFIG = {
    'boss': { rewardManualFp: 39200, rewardAutoFp: 38420, n1Fp: 42000, pityCompFp: 1000000 },
    't1':   { rewardManualFp: 15330, rewardAutoFp: 15020, n1Fp: 16000, pityCompFp: 1000000 },
    't2':   { rewardManualFp: 9200,  rewardAutoFp: 9020,  n1Fp: 10000, pityCompFp: 1000000 },
    't3':   { rewardManualFp: 7840,  rewardAutoFp: 7680,  n1Fp: 8000,  pityCompFp: 1000000 }
};

class ClientRTPPhase1 {
    constructor() {
        this.fishStates = new Map();
        this.playerStates = new Map();
    }
    _getOrCreateFishState(pid, fid) {
        const k = pid + ':' + fid;
        let s = this.fishStates.get(k);
        if (!s) { s = { sumCostFp: 0, killed: false }; this.fishStates.set(k, s); }
        return s;
    }
    _getOrCreatePlayerState(pid) {
        let s = this.playerStates.get(pid);
        if (!s) { s = { budgetRemainingFp: 0 }; this.playerStates.set(pid, s); }
        return s;
    }
    clearFish(pid, fid) { this.fishStates.delete(pid + ':' + fid); }
    _getRtp(wk, isAuto) {
        return (isAuto ? RTP_WEAPON_RTP_AUTO_FP : RTP_WEAPON_RTP_MANUAL_FP)[wk] || (isAuto ? 9000 : 9200);
    }
    _getReward(cfg, isAuto) { return isAuto ? cfg.rewardAutoFp : cfg.rewardManualFp; }
    _calcProb(pState, cfg, isAuto, cv) {
        const rw = this._getReward(cfg, isAuto) * (cv || 1);
        const be = Math.max(0, pState.budgetRemainingFp);
        const pb = Math.floor(be * RTP_P_SCALE / rw);
        if (pb >= RTP_P_SCALE) return RTP_P_SCALE;
        return Math.min(RTP_P_SCALE, Math.floor(pb * cfg.pityCompFp / RTP_P_SCALE));
    }

    handleSingleTargetHit(pid, fid, wk, tier, isAuto) {
        const cfg = RTP_TIER_CONFIG[tier]; if (!cfg) return { kill: false };
        const fs = this._getOrCreateFishState(pid, fid);
        if (fs.killed) return { kill: false, reason: 'already_killed' };
        const ps = this._getOrCreatePlayerState(pid);
        const wcFp = RTP_WEAPON_COST_FP[wk] || 1000;
        const cv = 1, wm = wcFp / RTP_MONEY_SCALE;
        ps.budgetRemainingFp += Math.floor(wcFp * cv * this._getRtp(wk, isAuto) / RTP_SCALE);
        fs.sumCostFp += wcFp * cv;
        const hpt = Math.floor(cfg.n1Fp * cv / wm);
        if (fs.sumCostFp >= hpt && ps.budgetRemainingFp >= 0)
            return this._kill(fs, ps, cfg, fid, 'hard_pity', isAuto, cv);
        const p = this._calcProb(ps, cfg, isAuto, cv);
        if (Math.floor(Math.random() * RTP_P_SCALE) < p)
            return this._kill(fs, ps, cfg, fid, 'probability', isAuto, cv);
        return { kill: false };
    }

    handleShotgunHit(pid, fid, wk, tier, isAuto) {
        const cfg = RTP_TIER_CONFIG[tier]; if (!cfg) return { kill: false };
        const fs = this._getOrCreateFishState(pid, fid);
        if (fs.killed) return { kill: false, reason: 'already_killed' };
        const ps = this._getOrCreatePlayerState(pid);
        const cv = 1;
        ps.budgetRemainingFp += Math.floor(1000 * cv * this._getRtp('3x', isAuto) / RTP_SCALE);
        fs.sumCostFp += 1000 * cv;
        // FIX A: full N1 (no /3)
        const hpt = Math.floor(cfg.n1Fp * cv);
        // FIX C: budget-locked
        if (fs.sumCostFp >= hpt && ps.budgetRemainingFp >= 0)
            return this._kill(fs, ps, cfg, fid, 'hard_pity', isAuto, cv);
        const p = this._calcProb(ps, cfg, isAuto, cv);
        if (Math.floor(Math.random() * RTP_P_SCALE) < p)
            return this._kill(fs, ps, cfg, fid, 'probability', isAuto, cv);
        return { kill: false };
    }

    handleMultiTargetHit(pid, hitList, wk, wType, isAuto) {
        if (!hitList || !hitList.length) return [];
        const wcFp = RTP_WEAPON_COST_FP[wk] || 1000;
        const cv = 1;
        const ps = this._getOrCreatePlayerState(pid);
        ps.budgetRemainingFp += Math.floor(wcFp * cv * this._getRtp(wk, isAuto) / RTP_SCALE);
        const res = [];
        for (let i = 0; i < hitList.length; i++) {
            const e = hitList[i];
            const cfg = RTP_TIER_CONFIG[e.tier]; if (!cfg) { res.push({kill:false}); continue; }
            const fs = this._getOrCreateFishState(pid, e.fishId);
            if (fs.killed) { res.push({kill:false}); continue; }
            if (i === 0) fs.sumCostFp += wcFp * cv;
            const hpt = Math.floor(cfg.n1Fp * cv);
            if (fs.sumCostFp >= hpt && ps.budgetRemainingFp >= 0) {
                res.push(this._kill(fs, ps, cfg, e.fishId, 'hard_pity', isAuto, cv)); continue;
            }
            const rw = this._getReward(cfg, isAuto) * cv;
            const be = Math.max(0, ps.budgetRemainingFp);
            const pb = Math.floor(be * RTP_P_SCALE / rw);
            if (pb >= RTP_P_SCALE) { res.push(this._kill(fs, ps, cfg, e.fishId, 'probability', isAuto, cv)); continue; }
            const pi = Math.min(RTP_P_SCALE, Math.floor(pb * cfg.pityCompFp / RTP_P_SCALE));
            if (Math.floor(Math.random() * RTP_P_SCALE) < pi)
                res.push(this._kill(fs, ps, cfg, e.fishId, 'probability', isAuto, cv));
            else res.push({kill:false});
        }
        return res;
    }

    _kill(fs, ps, cfg, fid, reason, isAuto, cv) {
        const rw = (isAuto ? cfg.rewardAutoFp : cfg.rewardManualFp) * (cv || 1);
        // FIX B: no clamp
        ps.budgetRemainingFp -= rw;
        fs.killed = true;
        return { fishId: fid, kill: true, reason, rewardFp: rw, reward: rw / RTP_MONEY_SCALE };
    }
}

const SHOTS = 10000;
const TIERS = ['t3','t2','t1','boss'];
const WEAPONS = ['1x','3x','5x','8x'];
const M_TGT = {'1x':92,'3x':94,'5x':96,'8x':98};
const A_TGT = {'1x':90,'3x':92,'5x':94,'8x':96};

function sim(wk, tier, isAuto, n) {
    const eng = new ClientRTPPhase1();
    const pid = 'sim';
    let bet=0, win=0, fc=0, kills=0, hp=0;

    if (wk === '3x') {
        // v1.7 Section 3.1: 3 pellets are 3 independent single-target attacks
        // Each pellet targets a separate fish (persistent per-slot until killed)
        let fish = ['f'+(++fc), 'f'+(++fc), 'f'+(++fc)];
        for (let s=0; s<n; s++) {
            bet += 3000;
            for (let p=0; p<3; p++) {
                const r = eng.handleShotgunHit(pid, fish[p], '3x', tier, isAuto);
                if (r.kill) {
                    win+=r.rewardFp; kills++;
                    if (r.reason==='hard_pity') hp++;
                    eng.clearFish(pid, fish[p]);
                    fish[p] = 'f'+(++fc);
                }
            }
        }
    } else if (wk==='5x'||wk==='8x') {
        let cf = 'f'+(++fc);
        for (let s=0; s<n; s++) {
            bet += RTP_WEAPON_COST_FP[wk];
            const wt = wk==='8x'?'laser':'rocket';
            const rs = eng.handleMultiTargetHit(pid,[{fishId:cf,tier}],wk,wt,isAuto);
            for (const r of rs) { if(r.kill){win+=r.rewardFp;kills++;if(r.reason==='hard_pity')hp++;eng.clearFish(pid,cf);cf='f'+(++fc);} }
        }
    } else {
        let cf = 'f'+(++fc);
        for (let s=0; s<n; s++) {
            bet += 1000;
            const r = eng.handleSingleTargetHit(pid, cf, '1x', tier, isAuto);
            if (r.kill) { win+=r.rewardFp; kills++; if(r.reason==='hard_pity')hp++; eng.clearFish(pid,cf); cf='f'+(++fc); }
        }
    }
    const rtp = bet>0?(win/bet)*100:0;
    const bud = eng._getOrCreatePlayerState(pid).budgetRemainingFp/RTP_MONEY_SCALE;
    return {rtp:rtp.toFixed(2),kills,hp,bet:(bet/1000).toFixed(0),win:(win/1000).toFixed(0),bud:bud.toFixed(1)};
}

console.log('='.repeat(95));
console.log('  Monte Carlo RTP Simulation - 10k shots/weapon/tier');
console.log('  Fixes: A (3x Pity Sync) + B (Debt Memory) + C (Budget-Locked Pity)');
console.log('='.repeat(95));

for (const tier of TIERS) {
    const c = RTP_TIER_CONFIG[tier];
    console.log(`\n--- ${tier.toUpperCase()} (N1=${c.n1Fp/1000} Rew_M=${c.rewardManualFp/1000} Rew_A=${c.rewardAutoFp/1000}) ---`);
    for (const mode of ['manual','auto']) {
        const isA = mode==='auto';
        const tgt = isA ? A_TGT : M_TGT;
        console.log(`  ${mode.toUpperCase()}:`);
        console.log('  Wpn  | Target | Actual | Delta  | Kills | Pity | Budget | Status');
        console.log('  -----|--------|--------|--------|-------|------|--------|------');
        for (const wk of WEAPONS) {
            const r = sim(wk, tier, isA, SHOTS);
            const t = tgt[wk];
            const a = parseFloat(r.rtp);
            const d = a - t;
            const st = Math.abs(d)<=3?'PASS':(Math.abs(d)<=5?'OK':'FAIL');
            const ds = (d>=0?'+':'')+d.toFixed(2)+'%';
            console.log(`  ${wk.padEnd(4)} | ${t.toFixed(1).padStart(5)}% | ${r.rtp.padStart(6)}% | ${ds.padStart(6)} | ${String(r.kills).padStart(5)} | ${String(r.hp).padStart(4)} | ${r.bud.padStart(6)} | ${st}`);
        }
    }
}

console.log('\n' + '='.repeat(95));
console.log('  SUMMARY (Manual, 10k shots, persistent target)');
console.log('='.repeat(95));
console.log('  Wpn  | Target |   T3   |   T2   |   T1   |  Boss  ');
console.log('  -----|--------|--------|--------|--------|-------');
for (const wk of WEAPONS) {
    const t = M_TGT[wk];
    const cs = TIERS.map(ti => parseFloat(sim(wk,ti,false,SHOTS).rtp).toFixed(1)+'%');
    console.log(`  ${wk.padEnd(4)} | ${t.toFixed(1)}%  | ${cs.map(c=>c.padStart(6)).join(' | ')}`);
}
console.log('\n  Tolerance: +/-3% PASS, +/-5% OK for 10k sample.');
console.log('='.repeat(95));
