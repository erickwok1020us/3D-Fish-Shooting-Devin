(function weaponMatrixAuditV2() {
    'use strict';

    var TIER_RTP_TARGETS = {
        1: { rtpPct: 90.0, n1: 6, rewardFp: 4500, pityCompFp: 367403 },
        2: { rtpPct: 92.0, n1: 10, rewardFp: 7666, pityCompFp: 343881 },
        3: { rtpPct: 93.0, n1: 16, rewardFp: 12400, pityCompFp: 331913 },
        4: { rtpPct: 94.0, n1: 30, rewardFp: 23500, pityCompFp: 323159 },
        5: { rtpPct: 94.5, n1: 45, rewardFp: 35437, pityCompFp: 319944 },
        6: { rtpPct: 95.0, n1: 120, rewardFp: 95000, pityCompFp: 316012 }
    };

    var AOE_MAX_TARGETS = 8;
    var LASER_MAX_TARGETS = 6;
    var RAMP_START_FP = 800000;
    var MONEY_SCALE = 1000;

    var WEAPON_KEYS = ['1x', '3x', '5x', '8x'];
    var PHASE_DURATION_MS = 60000;
    var MIXED_DURATION_MS = 180000;
    var MIXED_SWITCH_INTERVAL_MS = 10000;
    var MISS_ONLY_DURATION_MS = 60000;
    var CAP_EDGE_DURATION_MS = 60000;
    var CHECK_INTERVAL_MS = 5000;
    var MAX_ALLOWED_DRIFT = 10;

    var isMultiplayer = typeof multiplayerManager !== 'undefined' &&
        multiplayerManager && multiplayerManager.socket;

    var weaponSnapshot = {};
    for (var wk in CONFIG.weapons) {
        if (!CONFIG.weapons.hasOwnProperty(wk)) continue;
        var w = CONFIG.weapons[wk];
        weaponSnapshot[wk] = { cost: w.cost, type: w.type, multiplier: w.multiplier };
    }

    var commitHash = '(paste git rev-parse HEAD here or read from build)';
    try {
        if (typeof __COMMIT_HASH__ !== 'undefined') commitHash = __COMMIT_HASH__;
        else if (typeof BUILD_INFO !== 'undefined' && BUILD_INFO.commit) commitHash = BUILD_INFO.commit;
    } catch (e) { /* ignore */ }

    var buildId = '(unknown)';
    try {
        if (typeof __BUILD_ID__ !== 'undefined') buildId = __BUILD_ID__;
        else if (typeof BUILD_INFO !== 'undefined' && BUILD_INFO.id) buildId = BUILD_INFO.id;
    } catch (e) { /* ignore */ }

    var seed = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    var phases = [];
    for (var wi = 0; wi < WEAPON_KEYS.length; wi++) {
        phases.push({ weapon: WEAPON_KEYS[wi], duration: PHASE_DURATION_MS, mixed: false, missOnly: false, capEdge: false });
    }
    phases.push({ weapon: 'mixed', duration: MIXED_DURATION_MS, mixed: true, missOnly: false, capEdge: false });
    phases.push({ weapon: '1x', duration: MISS_ONLY_DURATION_MS, mixed: false, missOnly: true, capEdge: false });
    phases.push({ weapon: '5x', duration: CAP_EDGE_DURATION_MS, mixed: false, missOnly: false, capEdge: true, capType: 'aoe' });
    phases.push({ weapon: '8x', duration: CAP_EDGE_DURATION_MS, mixed: false, missOnly: false, capEdge: true, capType: 'laser' });

    var results = {};
    var currentPhaseIdx = -1;
    var checkTimer = null;
    var mixedSwitchTimer = null;
    var mixedWeaponIdx = 0;
    var aborted = false;
    var phase = null;

    var origAutoFireAtFish = null;
    var origOnFishKilled = null;
    var origOnFishHit = null;

    function getServerBalance() {
        if (typeof _balanceAudit !== 'undefined' && _balanceAudit.lastServerBalance !== null) {
            return _balanceAudit.lastServerBalance;
        }
        return gameState.balance;
    }

    function hookBalanceUpdates() {
        if (!isMultiplayer) return;
        var orig = multiplayerManager.onBalanceUpdate;
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

    function hookShotCounter() {
        if (typeof autoFireAtFish !== 'function') return;
        origAutoFireAtFish = autoFireAtFish;
        window.autoFireAtFish = function(targetFish) {
            var result = origAutoFireAtFish.apply(this, arguments);
            if (phase && result !== false) {
                phase.shotsFired++;
            }
            return result;
        };
    }

    function unhookShotCounter() {
        if (origAutoFireAtFish) {
            window.autoFireAtFish = origAutoFireAtFish;
            origAutoFireAtFish = null;
        }
    }

    function hookHitEvents() {
        if (!isMultiplayer) return;

        origOnFishHit = multiplayerManager.onFishHit;
        multiplayerManager.onFishHit = function(data) {
            if (phase && data.hitByPlayerId === multiplayerManager.playerId) {
                phase.hitEvents++;
                if (data.isAOE || data.isPenetrating) {
                    phase.multiHitBatch.push(data.fishId);
                }
            }
            if (origOnFishHit) origOnFishHit.call(this, data);
        };

        origOnFishKilled = multiplayerManager.onFishKilled;
        multiplayerManager.onFishKilled = function(data) {
            if (phase) {
                var killedBy = data.killedBy || data.topContributorId;
                var reward = data.reward || data.totalReward || 0;

                if (killedBy === multiplayerManager.playerId && reward) {
                    phase.payoutSum += reward;
                    phase.killCount++;
                    var tier = data.tier || 0;
                    if (tier >= 1 && tier <= 6) {
                        phase.killsByTier[tier] = (phase.killsByTier[tier] || 0) + 1;
                        phase.payoutByTier[tier] = (phase.payoutByTier[tier] || 0) + reward;
                    }
                }
            }
            if (origOnFishKilled) origOnFishKilled.call(this, data);
        };
    }

    function unhookHitEvents() {
        if (!isMultiplayer) return;
        if (origOnFishHit) {
            multiplayerManager.onFishHit = origOnFishHit;
            origOnFishHit = null;
        }
        if (origOnFishKilled) {
            multiplayerManager.onFishKilled = origOnFishKilled;
            origOnFishKilled = null;
        }
    }

    function hookKillEventsLocal() {
        if (window._auditKillHook) return;
        window._auditKillHook = true;
        var origRecordWin = window.recordWin;
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

    function unhookKillEventsLocal() {
        if (window._origRecordWin) {
            window.recordWin = window._origRecordWin;
            delete window._origRecordWin;
        }
        delete window._auditKillHook;
    }

    var missOnlyOrigAutoFire = null;
    function enableMissOnly() {
        unhookShotCounter();
        if (typeof autoFireAtFish !== 'function' && origAutoFireAtFish) {
            missOnlyOrigAutoFire = origAutoFireAtFish;
        } else {
            missOnlyOrigAutoFire = window.autoFireAtFish || autoFireAtFish;
        }
        window.autoFireAtFish = function() {
            if (phase) phase.shotsFired++;
            var weaponKey = gameState.currentWeapon;
            var weapon = CONFIG.weapons[weaponKey];
            if (gameState.cooldown > 0) return false;
            if (gameState.balance < weapon.cost) return false;
            if (typeof multiplayerMode !== 'undefined' && !multiplayerMode) {
                gameState.balance -= weapon.cost;
            }
            gameState.cooldown = 1 / weapon.shotsPerSecond;
            return true;
        };
    }

    function disableMissOnly() {
        if (missOnlyOrigAutoFire) {
            window.autoFireAtFish = missOnlyOrigAutoFire;
            missOnlyOrigAutoFire = null;
            hookShotCounter();
        }
    }

    function flushMultiHitBatch() {
        if (!phase || phase.multiHitBatch.length === 0) return;
        var batchSize = phase.multiHitBatch.length;
        phase.hitListSizes.push(batchSize);
        phase.multiHitBatch = [];
    }

    function computeHitListStats() {
        if (!phase) return { avg: 0, max: 0 };
        var sizes = phase.hitListSizes;
        if (sizes.length === 0) return { avg: 0, max: 0 };
        var sum = 0;
        var max = 0;
        for (var i = 0; i < sizes.length; i++) {
            sum += sizes[i];
            if (sizes[i] > max) max = sizes[i];
        }
        return { avg: +(sum / sizes.length).toFixed(1), max: max };
    }

    function computeWeightedTargetRtp() {
        if (!phase) return 0;
        var totalKills = 0;
        var weightedSum = 0;
        for (var t = 1; t <= 6; t++) {
            var k = phase.killsByTier[t] || 0;
            if (k > 0 && TIER_RTP_TARGETS[t]) {
                totalKills += k;
                weightedSum += k * TIER_RTP_TARGETS[t].rtpPct;
            }
        }
        return totalKills > 0 ? +(weightedSum / totalKills).toFixed(1) : 0;
    }

    function startPhase(idx) {
        if (idx >= phases.length || aborted) {
            printFinalReport();
            return;
        }

        currentPhaseIdx = idx;
        var phaseDef = phases[idx];
        var weaponCost = phaseDef.mixed ? 0 : (CONFIG.weapons[phaseDef.weapon] || {}).cost || 1;

        var phaseName;
        if (phaseDef.missOnly) {
            phaseName = 'MISS-ONLY (' + phaseDef.weapon + ')';
        } else if (phaseDef.capEdge) {
            phaseName = 'CAP-EDGE (' + phaseDef.capType + '/' + phaseDef.weapon + ')';
        } else if (phaseDef.mixed) {
            phaseName = 'MIXED (10s rotation)';
        } else {
            phaseName = phaseDef.weapon;
        }

        phase = {
            name: phaseName,
            weapon: phaseDef.weapon,
            mixed: phaseDef.mixed,
            missOnly: phaseDef.missOnly,
            capEdge: phaseDef.capEdge,
            capType: phaseDef.capType || null,
            duration: phaseDef.duration,
            startTime: Date.now(),
            startBalance: gameState.balance,
            snapshots: [],
            serverUpdates: [],
            driftViolations: [],
            maxDrift: 0,
            payoutSum: 0,
            costSum: 0,
            shotsFired: 0,
            hitEvents: 0,
            killCount: 0,
            weaponCost: weaponCost,
            killsByTier: {},
            payoutByTier: {},
            multiHitBatch: [],
            hitListSizes: [],
            balanceOnlyDecreased: true,
            prevBalance: gameState.balance,
            capViolations: 0
        };

        if (!phaseDef.mixed) {
            if (typeof selectWeapon === 'function') {
                selectWeapon(phaseDef.weapon);
            } else {
                gameState.currentWeapon = phaseDef.weapon;
            }
        }

        if (phaseDef.missOnly) {
            enableMissOnly();
        }

        gameState.autoShoot = true;

        console.log('\n%c[MATRIX] === Phase ' + (idx + 1) + '/' + phases.length + ': ' + phase.name + ' === (' + (phaseDef.duration / 1000) + 's)',
            'color: cyan; font-weight: bold; font-size: 13px');
        console.log('[MATRIX] Start balance: ' + phase.startBalance.toFixed(2) + ', weapon cost: ' + weaponCost);

        if (isMultiplayer) {
            hookHitEvents();
        } else {
            hookKillEventsLocal();
        }

        checkTimer = setInterval(function() {
            if (aborted) { clearInterval(checkTimer); return; }

            var elapsed = Date.now() - phase.startTime;
            var clientBal = gameState.balance;
            var serverBal = getServerBalance();
            var drift = clientBal - serverBal;

            var currentWeapon = gameState.currentWeapon || '1x';

            phase.costSum = phase.startBalance - clientBal + phase.payoutSum;

            if (phase.missOnly) {
                if (clientBal > phase.prevBalance) {
                    phase.balanceOnlyDecreased = false;
                }
                phase.prevBalance = clientBal;
            }

            flushMultiHitBatch();

            var hlStats = computeHitListStats();
            var hitRate = phase.shotsFired > 0 ? +(phase.hitEvents / phase.shotsFired * 100).toFixed(1) : 0;

            var snap = {
                t_sec: Math.round(elapsed / 1000),
                weapon: currentWeapon,
                client: +clientBal.toFixed(2),
                server: +serverBal.toFixed(2),
                drift: +drift.toFixed(2),
                payoutSum: +phase.payoutSum.toFixed(2),
                costSum: +phase.costSum.toFixed(2),
                rtp_pct: phase.costSum > 0 ? +((phase.payoutSum / phase.costSum) * 100).toFixed(1) : 0,
                shots: phase.shotsFired,
                hits: phase.hitEvents,
                hit_rate: hitRate,
                hl_avg: hlStats.avg,
                hl_max: hlStats.max
            };
            phase.snapshots.push(snap);

            if (drift > MAX_ALLOWED_DRIFT) {
                phase.driftViolations.push(snap);
            }
            if (Math.abs(drift) > Math.abs(phase.maxDrift)) {
                phase.maxDrift = drift;
            }

            if (phase.capEdge) {
                var cap = phase.capType === 'laser' ? LASER_MAX_TARGETS : AOE_MAX_TARGETS;
                if (hlStats.max > cap) {
                    phase.capViolations++;
                }
            }

            var driftStr = drift >= 0 ? '+' + drift.toFixed(2) : drift.toFixed(2);
            console.log(
                '[MATRIX] t=' + snap.t_sec + 's [' + currentWeapon + '] client=' + clientBal.toFixed(2) +
                ' server=' + serverBal.toFixed(2) + ' drift=' + driftStr +
                ' | payout=' + phase.payoutSum.toFixed(2) + ' cost=' + phase.costSum.toFixed(2) +
                ' RTP=' + snap.rtp_pct + '% | shots=' + phase.shotsFired + ' hits=' + phase.hitEvents +
                ' rate=' + hitRate + '% hl_avg=' + hlStats.avg + ' hl_max=' + hlStats.max
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
                var nextW = WEAPON_KEYS[mixedWeaponIdx];
                if (typeof selectWeapon === 'function') {
                    selectWeapon(nextW);
                } else {
                    gameState.currentWeapon = nextW;
                }
                console.log('[MATRIX] Mixed: switched to ' + nextW);
            }, MIXED_SWITCH_INTERVAL_MS);
        }
    }

    function finishPhase() {
        var elapsed = Date.now() - phase.startTime;
        var finalClient = gameState.balance;
        var netChange = finalClient - phase.startBalance;

        if (phase.missOnly) {
            disableMissOnly();
        }

        phase.costSum = phase.startBalance - finalClient + phase.payoutSum;
        var rtp = phase.costSum > 0 ? (phase.payoutSum / phase.costSum) * 100 : 0;
        var hlStats = computeHitListStats();
        var targetRtp = computeWeightedTargetRtp();
        var hitRate = phase.shotsFired > 0 ? +(phase.hitEvents / phase.shotsFired * 100).toFixed(1) : 0;

        var passed = phase.driftViolations.length === 0;
        if (phase.missOnly) {
            passed = passed && phase.payoutSum === 0 && phase.balanceOnlyDecreased && phase.hitEvents === 0;
        }
        if (phase.capEdge) {
            passed = passed && phase.capViolations === 0;
        }

        var report = {
            name: phase.name,
            duration_s: Math.round(elapsed / 1000),
            startBalance: phase.startBalance,
            endBalance: finalClient,
            netChange: +netChange.toFixed(2),
            payoutSum: +phase.payoutSum.toFixed(2),
            costSum: +phase.costSum.toFixed(2),
            actualRtp: +rtp.toFixed(1),
            targetRtp: targetRtp,
            rtpDelta: targetRtp > 0 ? +(rtp - targetRtp).toFixed(1) : 'N/A',
            maxDrift: +phase.maxDrift.toFixed(2),
            driftViolations: phase.driftViolations.length,
            shotsFired: phase.shotsFired,
            hits: phase.hitEvents,
            hitRate: hitRate,
            hitListAvg: hlStats.avg,
            hitListMax: hlStats.max,
            killCount: phase.killCount,
            killsByTier: Object.assign({}, phase.killsByTier),
            payoutByTier: Object.assign({}, phase.payoutByTier),
            snapshots: phase.snapshots,
            passed: passed,
            missOnlyResult: phase.missOnly ? {
                payoutIsZero: phase.payoutSum === 0,
                balanceOnlyDecreased: phase.balanceOnlyDecreased,
                hitsIsZero: phase.hitEvents === 0
            } : null,
            capEdgeResult: phase.capEdge ? {
                capType: phase.capType,
                expectedCap: phase.capType === 'laser' ? LASER_MAX_TARGETS : AOE_MAX_TARGETS,
                hitListMax: hlStats.max,
                capViolations: phase.capViolations
            } : null
        };

        results[phase.name] = report;

        var passStr = report.passed ? 'PASS' : 'FAIL';
        var passColor = report.passed ? 'lime' : 'red';
        console.log('\n%c[MATRIX] Phase "' + phase.name + '" ' + passStr, 'color: ' + passColor + '; font-weight: bold');
        console.log('  Net: ' + netChange.toFixed(2) + ' | Payout: ' + report.payoutSum + ' | Cost: ' + report.costSum +
            ' | actualRtp: ' + report.actualRtp + '% targetRtp: ' + report.targetRtp + '% delta: ' + report.rtpDelta);
        console.log('  Shots: ' + report.shotsFired + ' | Hits: ' + report.hits + ' | hitRate: ' + report.hitRate +
            '% | hl_avg: ' + report.hitListAvg + ' hl_max: ' + report.hitListMax + ' | Kills: ' + report.killCount);
        console.log('  Max drift: ' + report.maxDrift + ' | Drift violations: ' + report.driftViolations);

        if (phase.missOnly) {
            console.log('  [MISS-ONLY] payoutIsZero=' + report.missOnlyResult.payoutIsZero +
                ' balanceOnlyDecreased=' + report.missOnlyResult.balanceOnlyDecreased +
                ' hitsIsZero=' + report.missOnlyResult.hitsIsZero);
        }
        if (phase.capEdge) {
            console.log('  [CAP-EDGE] cap=' + report.capEdgeResult.expectedCap +
                ' hitListMax=' + report.capEdgeResult.hitListMax +
                ' capViolations=' + report.capEdgeResult.capViolations);
        }

        phase = null;
        startPhase(currentPhaseIdx + 1);
    }

    function printFinalReport() {
        unhookBalanceUpdates();
        unhookHitEvents();
        unhookKillEventsLocal();
        unhookShotCounter();
        disableMissOnly();
        gameState.autoShoot = false;

        console.log('\n%c=== WEAPON MATRIX E2E BALANCE AUDIT v2 — FINAL REPORT ===', 'color: gold; font-weight: bold; font-size: 14px');

        console.log('\n%c--- REPORT HEADER ---', 'color: white; font-weight: bold');
        console.log('Seed:        ' + seed);
        console.log('Commit:      ' + commitHash);
        console.log('Build ID:    ' + buildId);
        console.log('Timestamp:   ' + new Date().toISOString());
        console.log('Mode:        ' + (isMultiplayer ? 'MULTIPLAYER' : 'SINGLE-PLAYER'));

        console.log('\n%c--- TIER_CONFIG (SSOT from RTPPhase1.js) ---', 'color: white; font-weight: bold');
        var tierTable = [];
        for (var t = 1; t <= 6; t++) {
            var tc = TIER_RTP_TARGETS[t];
            tierTable.push({
                Tier: 'T' + t,
                'RTP%': tc.rtpPct,
                N1: tc.n1,
                RewardFp: tc.rewardFp,
                PityCompFp: tc.pityCompFp
            });
        }
        console.table(tierTable);

        console.log('\n%c--- WEAPON CONFIG SNAPSHOT ---', 'color: white; font-weight: bold');
        var wcTable = [];
        for (var wkey in weaponSnapshot) {
            if (!weaponSnapshot.hasOwnProperty(wkey)) continue;
            var ws = weaponSnapshot[wkey];
            wcTable.push({ Weapon: wkey, Cost: ws.cost, Type: ws.type, Multiplier: ws.multiplier });
        }
        console.table(wcTable);

        console.log('\n%c--- CONSTANTS ---', 'color: white; font-weight: bold');
        console.log('AOE_MAX_TARGETS:  ' + AOE_MAX_TARGETS);
        console.log('LASER_MAX_TARGETS: ' + LASER_MAX_TARGETS);
        console.log('RAMP_START:        ' + RAMP_START_FP + ' (' + (RAMP_START_FP / 1000000 * 100).toFixed(0) + '%)');
        console.log('MONEY_SCALE:       ' + MONEY_SCALE);
        console.log('MAX_ALLOWED_DRIFT: ' + MAX_ALLOWED_DRIFT);

        var allPassed = true;
        var summary = [];

        for (var name in results) {
            if (!results.hasOwnProperty(name)) continue;
            var r = results[name];
            var row = {
                Phase: name,
                Duration: r.duration_s + 's',
                Shots: r.shotsFired,
                Hits: r.hits,
                'HitRate%': r.hitRate,
                'HL Avg': r.hitListAvg,
                'HL Max': r.hitListMax,
                Kills: r.killCount,
                Payout: r.payoutSum,
                Cost: r.costSum,
                'ActualRTP%': r.actualRtp,
                'TargetRTP%': r.targetRtp,
                'Delta': r.rtpDelta,
                'Max Drift': r.maxDrift,
                Violations: r.driftViolations,
                Result: r.passed ? 'PASS' : 'FAIL'
            };
            summary.push(row);
            if (!r.passed) allPassed = false;
        }

        console.log('\n%c--- SUMMARY TABLE ---', 'color: gold; font-weight: bold');
        console.table(summary);

        if (allPassed) {
            console.log('%c\nOVERALL RESULT: PASS', 'color: lime; font-weight: bold; font-size: 16px');
        } else {
            console.log('%c\nOVERALL RESULT: FAIL', 'color: red; font-weight: bold; font-size: 16px');
        }

        console.log('\n%c--- PER-PHASE SNAPSHOTS (5s intervals) ---', 'color: white; font-weight: bold');
        for (var pname in results) {
            if (!results.hasOwnProperty(pname)) continue;
            console.log('\n--- ' + pname + ' ---');
            console.table(results[pname].snapshots);
        }

        console.log('\n%c--- KILLS BY TIER ---', 'color: white; font-weight: bold');
        for (var kname in results) {
            if (!results.hasOwnProperty(kname)) continue;
            var kr = results[kname];
            if (kr.killCount > 0) {
                console.log(kname + ':');
                var tierKillTable = [];
                for (var ti = 1; ti <= 6; ti++) {
                    if (kr.killsByTier[ti]) {
                        tierKillTable.push({
                            Tier: 'T' + ti,
                            Kills: kr.killsByTier[ti],
                            Payout: (kr.payoutByTier[ti] || 0).toFixed(2),
                            'TierTarget%': TIER_RTP_TARGETS[ti].rtpPct
                        });
                    }
                }
                if (tierKillTable.length > 0) console.table(tierKillTable);
            }
        }

        window._weaponMatrixResult = { allPassed: allPassed, results: results, summary: summary, meta: {
            seed: seed, commitHash: commitHash, buildId: buildId,
            tierConfig: TIER_RTP_TARGETS, weaponConfig: weaponSnapshot,
            constants: { AOE_MAX_TARGETS: AOE_MAX_TARGETS, LASER_MAX_TARGETS: LASER_MAX_TARGETS, RAMP_START_FP: RAMP_START_FP, MONEY_SCALE: MONEY_SCALE }
        }};
        console.log('\nFull data: window._weaponMatrixResult');
    }

    hookBalanceUpdates();
    hookShotCounter();

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
                shots: phase.shotsFired,
                hits: phase.hitEvents,
                hit_rate: phase.shotsFired > 0 ? +(phase.hitEvents / phase.shotsFired * 100).toFixed(1) : 0,
                hl_avg: 0,
                hl_max: 0,
                note: 'ABORTED'
            });
            finishPhase();
        } else {
            printFinalReport();
        }
    };

    var totalEstSec = (WEAPON_KEYS.length * PHASE_DURATION_MS + MIXED_DURATION_MS + MISS_ONLY_DURATION_MS + CAP_EDGE_DURATION_MS * 2) / 1000;
    console.log('%c[MATRIX] Weapon Matrix E2E Audit v2 starting...', 'color: cyan; font-weight: bold; font-size: 14px');
    console.log('[MATRIX] Seed: ' + seed);
    console.log('[MATRIX] Phases: ' + WEAPON_KEYS.join(', ') + ', mixed (' + (MIXED_DURATION_MS / 1000) + 's), miss-only (60s), cap-edge-aoe (60s), cap-edge-laser (60s)');
    console.log('[MATRIX] Total estimated time: ' + totalEstSec + 's (~' + Math.ceil(totalEstSec / 60) + ' min)');
    console.log('[MATRIX] Mode: ' + (isMultiplayer ? 'MULTIPLAYER (server SSOT)' : 'SINGLE-PLAYER (local RTP)'));
    console.log('[MATRIX] TIER_CONFIG SSOT: T1=90% T2=92% T3=93% T4=94% T5=94.5% T6=95%');
    console.log('[MATRIX] To stop early: _stopWeaponMatrixAudit()');

    startPhase(0);
})();
