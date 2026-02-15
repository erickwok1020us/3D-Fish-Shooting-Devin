/**
 * T2 Regression: E2E Balance Audit — Client vs Server comparison
 *
 * Inject this script into the browser console while playing in multiplayer mode.
 * It records every server balanceUpdate and compares against gameState.balance
 * every 5 seconds for 3 minutes.
 *
 * PASS criteria:
 *   - Client balance must NEVER exceed server balance by more than 1 weapon cost
 *     (1-tick latency tolerance)
 *   - After 3 minutes, total drift events must be 0
 *
 * Usage (browser console):
 *   1. Join a multiplayer game
 *   2. Paste this entire script into the browser console
 *   3. Enable auto-shoot (press Space or toggle button)
 *   4. Wait 3 minutes — report auto-prints to console
 *
 * Or run via: copy(await fetch('scripts/balance-e2e-audit.js').then(r=>r.text()))
 * then paste into console.
 */

(function balanceE2EAudit() {
    'use strict';

    const DURATION_MS = 180_000;
    const CHECK_INTERVAL_MS = 5_000;
    const MAX_ALLOWED_DRIFT = 8;

    const audit = {
        startTime: Date.now(),
        startBalance: typeof gameState !== 'undefined' ? gameState.balance : 0,
        serverUpdates: [],
        snapshots: [],
        driftViolations: [],
        maxClientOverServer: 0,
    };

    console.log('%c[E2E-AUDIT] Balance audit started. Duration: 3 minutes.', 'color: cyan; font-weight: bold');
    console.log(`[E2E-AUDIT] Start balance: ${audit.startBalance}`);

    if (typeof _balanceAudit !== 'undefined') {
        _balanceAudit.start(audit.startBalance);
        console.log('[E2E-AUDIT] _balanceAudit runtime guard activated');
    }

    const origOnBalanceUpdate = typeof multiplayerManager !== 'undefined'
        ? multiplayerManager.onBalanceUpdate
        : null;

    if (typeof multiplayerManager !== 'undefined' && origOnBalanceUpdate) {
        multiplayerManager.onBalanceUpdate = function(data) {
            audit.serverUpdates.push({
                t: Date.now() - audit.startTime,
                serverBal: data.balance,
                clientBal: gameState.balance,
                drift: gameState.balance - data.balance
            });
            origOnBalanceUpdate.call(this, data);
        };
    }

    const checkTimer = setInterval(function() {
        const elapsed = Date.now() - audit.startTime;
        const lastServer = audit.serverUpdates.length > 0
            ? audit.serverUpdates[audit.serverUpdates.length - 1].serverBal
            : audit.startBalance;
        const clientBal = typeof gameState !== 'undefined' ? gameState.balance : 0;
        const drift = clientBal - lastServer;

        const snap = {
            t_sec: Math.round(elapsed / 1000),
            client: clientBal,
            server: lastServer,
            drift: drift,
            serverUpdatesSoFar: audit.serverUpdates.length
        };
        audit.snapshots.push(snap);

        if (drift > MAX_ALLOWED_DRIFT) {
            audit.driftViolations.push(snap);
            console.warn(`[E2E-AUDIT] DRIFT VIOLATION at t=${snap.t_sec}s: client=${clientBal} server=${lastServer} drift=+${drift.toFixed(2)}`);
        }

        if (Math.abs(drift) > Math.abs(audit.maxClientOverServer)) {
            audit.maxClientOverServer = drift;
        }

        console.log(`[E2E-AUDIT] t=${snap.t_sec}s  client=${clientBal.toFixed(2)}  server=${lastServer.toFixed(2)}  drift=${drift >= 0 ? '+' : ''}${drift.toFixed(2)}`);

        if (elapsed >= DURATION_MS) {
            clearInterval(checkTimer);
            printReport();
        }
    }, CHECK_INTERVAL_MS);

    function printReport() {
        const elapsed = Date.now() - audit.startTime;
        const finalClient = typeof gameState !== 'undefined' ? gameState.balance : 0;
        const finalServer = audit.serverUpdates.length > 0
            ? audit.serverUpdates[audit.serverUpdates.length - 1].serverBal
            : audit.startBalance;

        console.log('\n%c=== E2E Balance Audit Report ===', 'color: yellow; font-weight: bold; font-size: 14px');
        console.log(`Duration: ${Math.round(elapsed / 1000)}s`);
        console.log(`Start balance: ${audit.startBalance}`);
        console.log(`Final client balance: ${finalClient.toFixed(2)}`);
        console.log(`Final server balance: ${finalServer.toFixed(2)}`);
        console.log(`Final drift: ${(finalClient - finalServer).toFixed(2)}`);
        console.log(`Server updates received: ${audit.serverUpdates.length}`);
        console.log(`Max client-over-server: ${audit.maxClientOverServer.toFixed(2)}`);
        console.log(`Drift violations (client > server + ${MAX_ALLOWED_DRIFT}): ${audit.driftViolations.length}`);

        const passed = audit.driftViolations.length === 0;
        if (passed) {
            console.log('%cRESULT: PASS', 'color: lime; font-weight: bold; font-size: 16px');
        } else {
            console.log('%cRESULT: FAIL', 'color: red; font-weight: bold; font-size: 16px');
            console.log('Drift violations:');
            console.table(audit.driftViolations);
        }

        console.log('\nSnapshots (5s intervals):');
        console.table(audit.snapshots);

        if (typeof _balanceAudit !== 'undefined') {
            console.log('\nRuntime audit report:');
            console.log(_balanceAudit.getReport());
        }

        if (origOnBalanceUpdate && typeof multiplayerManager !== 'undefined') {
            multiplayerManager.onBalanceUpdate = origOnBalanceUpdate;
        }

        window._lastE2EAuditResult = { passed, audit };
        console.log('\nFull audit data available at: window._lastE2EAuditResult');
    }

    window._stopBalanceAudit = function() {
        clearInterval(checkTimer);
        printReport();
    };
    console.log('[E2E-AUDIT] To stop early: _stopBalanceAudit()');
})();
