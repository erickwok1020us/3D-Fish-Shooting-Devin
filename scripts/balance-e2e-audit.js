/**
 * T2 Regression: Weapon Matrix E2E Balance Audit
 *
 * Tests ALL weapon tiers for balance drift and RTP convergence:
 *   Phase 1: 1x weapon — 60s auto-attack
 *   Phase 2: 3x weapon — 60s auto-attack
 *   Phase 3: 5x weapon — 60s auto-attack
 *   Phase 4: 8x weapon — 60s auto-attack
 *   Phase 5: Mixed weapons — 180s auto-attack (switch every 10s)
 *
 * Each phase outputs every 5s:
 *   - client balance vs server balance (drift)
 *   - payout_sum (total rewards received)
 *   - cost_hit_sum (total shot costs)
 *
 * PASS criteria:
 *   - All phases: 0 drift violations (client never exceeds server + MAX_DRIFT)
 *   - RTP per tier should converge toward target (91/93/94/95%)
 *
 * Usage (browser console):
 *   1. Join a multiplayer game (or single-player)
 *   2. Paste this entire script into the browser console
 *   3. Wait ~7 minutes — full matrix report auto-prints
 *
 * To stop early: window._stopWeaponMatrixAudit()
 */

(function weaponMatrixAudit() {
    'use strict';

    const RTP_TARGETS = { '1x': 91, '3x': 93, '5x': 94, '8x': 95 };
    const WEAPON_KEYS = ['1x', '3x', '5x', '8x'];
    const PHASE_DURATION_MS = 60_000;
    const MIXED_DURATION_MS = 180_000;
    const MIXED_SWITCH_INTERVAL_MS = 10_000;
    const CHECK_INTERVAL_MS = 5_000;
    const MAX_ALLOWED_DRIFT = 10;

    const isMultiplayer = typeof multiplayerManager !== 'undefined' &&
        multiplayerManager && multiplayerManager.socket;

    const phases = [
        ...WEAPON_KEYS.map(w => ({ weapon: w, duration: PHASE_DURATION_MS, mixed: false })),
        { weapon: 'mixed', duration: MIXED_DURATION_MS, mixed: true }
    ];

    const results = {};
    let currentPhaseIdx = -1;
    let checkTimer = null;
    let mixedSwitchTimer = null;
    let mixedWeaponIdx = 0;
    let aborted = false;

    let phase = null;

    function getServerBalance() {
        if (typeof _balanceAudit !== 'undefined' && _balanceAudit.lastServerBalance !== null) {
            return _balanceAudit.lastServerBalance;
        }
        return gameState.balance;
    }

    function hookBalanceUpdates() {
        if (!isMultiplayer) return;
        const orig = multiplayerManager.onBalanceUpdate;
        multiplayerManager._origOnBalanceUpdate = orig;
        multiplayerManager.onBalanceUpdate = function(data) {
            if (phase) {
                phase.serverUpdates.push({
                    t: Date.now() - phase.startTime,
                    serverBal: data.balance,
                    clientBal: gameState.balance
                });
            }
            if (typeof _balanceAudit !== 'undefined') {
                _balanceAudit.onServerUpdate(data.balance);
            }
            orig.call(this, data);
        };
    }

    function unhookBalanceUpdates() {
        if (!isMultiplayer) return;
        if (multiplayerManager._origOnBalanceUpdate) {
            multiplayerManager.onBalanceUpdate = multiplayerManager._origOnBalanceUpdate;
            delete multiplayerManager._origOnBalanceUpdate;
        }
    }

    function hookKillEvents() {
        if (window._auditKillHook) return;
        window._auditKillHook = true;
        const origRecordWin = window.recordWin;
        if (typeof origRecordWin === 'function') {
            window._origRecordWin = origRecordWin;
            window.recordWin = function(amount) {
                if (phase) {
                    phase.payoutSum += amount;
                    phase.killCount++;
                }
                return origRecordWin.apply(this, arguments);
            };
        }
    }

    function unhookKillEvents() {
        if (window._origRecordWin) {
            window.recordWin = window._origRecordWin;
            delete window._origRecordWin;
        }
        delete window._auditKillHook;
    }

    function startPhase(idx) {
        if (idx >= phases.length || aborted) {
            printFinalReport();
            return;
        }

        currentPhaseIdx = idx;
        const phaseDef = phases[idx];
        const weaponCost = phaseDef.mixed ? 0 : (CONFIG.weapons[phaseDef.weapon] || {}).cost || 1;

        phase = {
            name: phaseDef.mixed ? 'MIXED (10s rotation)' : phaseDef.weapon,
            weapon: phaseDef.weapon,
            mixed: phaseDef.mixed,
            duration: phaseDef.duration,
            startTime: Date.now(),
            startBalance: gameState.balance,
            snapshots: [],
            serverUpdates: [],
            driftViolations: [],
            maxDrift: 0,
            payoutSum: 0,
            costSum: 0,
            shotCount: 0,
            killCount: 0,
            weaponCost: weaponCost
        };

        if (!phaseDef.mixed) {
            if (typeof selectWeapon === 'function') {
                selectWeapon(phaseDef.weapon);
            } else {
                gameState.currentWeapon = phaseDef.weapon;
            }
        }

        gameState.autoShoot = true;

        console.log(`\n%c[MATRIX] === Phase ${idx + 1}/${phases.length}: ${phase.name} === (${phaseDef.duration / 1000}s)`,
            'color: cyan; font-weight: bold; font-size: 13px');
        console.log(`[MATRIX] Start balance: ${phase.startBalance.toFixed(2)}, weapon cost: ${weaponCost}`);

        hookKillEvents();

        checkTimer = setInterval(function() {
            if (aborted) { clearInterval(checkTimer); return; }

            const elapsed = Date.now() - phase.startTime;
            const clientBal = gameState.balance;
            const serverBal = getServerBalance();
            const drift = clientBal - serverBal;

            const currentWeapon = gameState.currentWeapon || '1x';

            phase.costSum = phase.startBalance - clientBal + phase.payoutSum;

            const snap = {
                t_sec: Math.round(elapsed / 1000),
                weapon: currentWeapon,
                client: +clientBal.toFixed(2),
                server: +serverBal.toFixed(2),
                drift: +drift.toFixed(2),
                payoutSum: +phase.payoutSum.toFixed(2),
                costSum: +phase.costSum.toFixed(2),
                rtp_pct: phase.costSum > 0 ? +((phase.payoutSum / phase.costSum) * 100).toFixed(1) : 0
            };
            phase.snapshots.push(snap);

            if (drift > MAX_ALLOWED_DRIFT) {
                phase.driftViolations.push(snap);
            }
            if (Math.abs(drift) > Math.abs(phase.maxDrift)) {
                phase.maxDrift = drift;
            }

            const driftStr = drift >= 0 ? `+${drift.toFixed(2)}` : drift.toFixed(2);
            console.log(
                `[MATRIX] t=${snap.t_sec}s [${currentWeapon}] client=${clientBal.toFixed(2)} server=${serverBal.toFixed(2)} drift=${driftStr} | payout=${phase.payoutSum.toFixed(2)} cost=${phase.costSum.toFixed(2)} RTP=${snap.rtp_pct}%`
            );

            if (elapsed >= phaseDef.duration) {
                clearInterval(checkTimer);
                if (mixedSwitchTimer) { clearInterval(mixedSwitchTimer); mixedSwitchTimer = null; }
                finishPhase();
            }
        }, CHECK_INTERVAL_MS);

        if (phaseDef.mixed) {
            mixedWeaponIdx = 0;
            if (typeof selectWeapon === 'function') {
                selectWeapon(WEAPON_KEYS[0]);
            }
            mixedSwitchTimer = setInterval(function() {
                mixedWeaponIdx = (mixedWeaponIdx + 1) % WEAPON_KEYS.length;
                const nextW = WEAPON_KEYS[mixedWeaponIdx];
                if (typeof selectWeapon === 'function') {
                    selectWeapon(nextW);
                } else {
                    gameState.currentWeapon = nextW;
                }
                console.log(`[MATRIX] Mixed: switched to ${nextW}`);
            }, MIXED_SWITCH_INTERVAL_MS);
        }
    }

    function finishPhase() {
        const elapsed = Date.now() - phase.startTime;
        const finalClient = gameState.balance;
        const netChange = finalClient - phase.startBalance;

        phase.costSum = phase.startBalance - finalClient + phase.payoutSum;
        const rtp = phase.costSum > 0 ? (phase.payoutSum / phase.costSum) * 100 : 0;

        const report = {
            name: phase.name,
            duration_s: Math.round(elapsed / 1000),
            startBalance: phase.startBalance,
            endBalance: finalClient,
            netChange: +netChange.toFixed(2),
            payoutSum: +phase.payoutSum.toFixed(2),
            costSum: +phase.costSum.toFixed(2),
            rtp_pct: +rtp.toFixed(1),
            rtpTarget: RTP_TARGETS[phase.weapon] || 'N/A',
            maxDrift: +phase.maxDrift.toFixed(2),
            driftViolations: phase.driftViolations.length,
            killCount: phase.killCount,
            snapshots: phase.snapshots,
            passed: phase.driftViolations.length === 0
        };

        results[phase.name] = report;

        const passStr = report.passed ? 'PASS' : 'FAIL';
        const passColor = report.passed ? 'lime' : 'red';
        console.log(`\n%c[MATRIX] Phase "${phase.name}" ${passStr}`, `color: ${passColor}; font-weight: bold`);
        console.log(`  Net change: ${netChange.toFixed(2)} | Payout: ${report.payoutSum} | Cost: ${report.costSum} | RTP: ${report.rtp_pct}% (target: ${report.rtpTarget}%)`);
        console.log(`  Max drift: ${report.maxDrift} | Drift violations: ${report.driftViolations} | Kills: ${report.killCount}`);

        phase = null;
        startPhase(currentPhaseIdx + 1);
    }

    function printFinalReport() {
        unhookBalanceUpdates();
        unhookKillEvents();
        gameState.autoShoot = false;

        console.log('\n%c=== WEAPON MATRIX E2E BALANCE AUDIT — FINAL REPORT ===', 'color: gold; font-weight: bold; font-size: 14px');

        let allPassed = true;
        const summary = [];

        for (const [name, r] of Object.entries(results)) {
            const rtpDelta = typeof r.rtpTarget === 'number' ? (r.rtp_pct - r.rtpTarget).toFixed(1) : 'N/A';
            summary.push({
                Phase: name,
                Duration: r.duration_s + 's',
                'Net $': r.netChange,
                Payout: r.payoutSum,
                Cost: r.costSum,
                'RTP%': r.rtp_pct,
                'Target%': r.rtpTarget,
                'RTP Delta': rtpDelta,
                'Max Drift': r.maxDrift,
                Violations: r.driftViolations,
                Kills: r.killCount,
                Result: r.passed ? 'PASS' : 'FAIL'
            });
            if (!r.passed) allPassed = false;
        }

        console.table(summary);

        if (allPassed) {
            console.log('%c\nOVERALL RESULT: PASS — All weapon tiers show 0 drift violations', 'color: lime; font-weight: bold; font-size: 16px');
        } else {
            console.log('%c\nOVERALL RESULT: FAIL — Drift violations detected!', 'color: red; font-weight: bold; font-size: 16px');
        }

        console.log('\nPer-phase snapshots (5s intervals):');
        for (const [name, r] of Object.entries(results)) {
            console.log(`\n--- ${name} ---`);
            console.table(r.snapshots);
        }

        window._weaponMatrixResult = { allPassed, results, summary };
        console.log('\nFull data: window._weaponMatrixResult');
    }

    hookBalanceUpdates();

    window._stopWeaponMatrixAudit = function() {
        aborted = true;
        if (checkTimer) clearInterval(checkTimer);
        if (mixedSwitchTimer) clearInterval(mixedSwitchTimer);
        if (phase) {
            phase.snapshots.push({
                t_sec: Math.round((Date.now() - phase.startTime) / 1000),
                weapon: gameState.currentWeapon,
                client: gameState.balance,
                server: getServerBalance(),
                drift: +(gameState.balance - getServerBalance()).toFixed(2),
                payoutSum: +phase.payoutSum.toFixed(2),
                costSum: +phase.costSum.toFixed(2),
                rtp_pct: phase.costSum > 0 ? +((phase.payoutSum / phase.costSum) * 100).toFixed(1) : 0,
                note: 'ABORTED'
            });
            finishPhase();
        } else {
            printFinalReport();
        }
    };

    console.log('%c[MATRIX] Weapon Matrix E2E Audit starting...', 'color: cyan; font-weight: bold; font-size: 14px');
    console.log(`[MATRIX] Phases: ${WEAPON_KEYS.join(', ')}, mixed (${MIXED_DURATION_MS / 1000}s)`);
    console.log(`[MATRIX] Total estimated time: ${(WEAPON_KEYS.length * PHASE_DURATION_MS + MIXED_DURATION_MS) / 1000}s (~7 min)`);
    console.log(`[MATRIX] Mode: ${isMultiplayer ? 'MULTIPLAYER (server SSOT)' : 'SINGLE-PLAYER (local RTP)'}`);
    console.log('[MATRIX] To stop early: _stopWeaponMatrixAudit()');

    startPhase(0);
})();
