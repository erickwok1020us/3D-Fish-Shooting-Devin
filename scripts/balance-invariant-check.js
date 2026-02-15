#!/usr/bin/env node
'use strict';

/**
 * T1 Regression: Static grep check for unauthorized balance modifications
 *
 * Scans game.js for any `gameState.balance +=` or `gameState.balance -=` patterns
 * and verifies each occurrence is in an ALLOWED location.
 *
 * ALLOWED locations (whitelist):
 *   - autoFireAtFish: `gameState.balance -= weapon.cost` (single-player cost deduction)
 *   - fireBullet (single-player): `gameState.balance -= weapon.cost`
 *   - Fish.die() (single-player): `gameState.balance += win`
 *   - onBalanceUpdate: `gameState.balance = data.balance` (server SSOT, assignment not +=)
 *
 * FORBIDDEN:
 *   - Any `gameState.balance += ...reward` or `this.coin.reward` in coin-fly / VFX code
 *   - Any `gameState.balance +=` inside spawnCoinFlyToScore or its update callbacks
 *
 * Usage: node scripts/balance-invariant-check.js
 * Exit code: 0 = clean, 1 = violations found
 */

const fs = require('fs');
const path = require('path');

const GAME_JS = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(GAME_JS, 'utf8');
const lines = src.split('\n');

const ALLOWED_PATTERNS = [
    { pattern: /gameState\.balance\s*-=\s*weapon\.cost/, contexts: ['autoFireAtFish', 'fireBullet', 'SINGLE PLAYER'] },
    { pattern: /gameState\.balance\s*\+=\s*win/, contexts: ['die()', 'SINGLE PLAYER', 'LEAK-3 FIX'] },
    { pattern: /gameState\.balance\s*=\s*data\.balance/, contexts: ['onBalanceUpdate', 'server SSOT'] },
    { pattern: /gameState\.balance\s*=\s*CONFIG/, contexts: ['initialization', 'initialBalance'] },
];

const FORBIDDEN_CONTEXTS = [
    'spawnCoinFlyToScore',
    'coinFlyToScore',
    'coinFly',
    'coin.reward',
    'this.reward',
    'this.coin.reward',
    'rewardPerCoin',
    'onCoinCollected',
    'triggerCoinCollection',
];

const violations = [];
const approved = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (!/gameState\.balance\s*[+\-]?=/.test(line)) continue;
    if (line.trim().startsWith('//')) continue;

    const contextStart = Math.max(0, i - 20);
    const contextEnd = Math.min(lines.length - 1, i + 5);
    const context = lines.slice(contextStart, contextEnd + 1).join('\n');

    let isAllowed = false;
    for (const ap of ALLOWED_PATTERNS) {
        if (ap.pattern.test(line)) {
            const hasContext = ap.contexts.some(c =>
                context.toLowerCase().includes(c.toLowerCase())
            );
            if (hasContext) {
                isAllowed = true;
                approved.push({ lineNum, line: line.trim(), reason: ap.contexts.join('/') });
                break;
            }
        }
    }

    if (!isAllowed) {
        const isForbidden = FORBIDDEN_CONTEXTS.some(fc =>
            context.toLowerCase().includes(fc.toLowerCase())
        );
        violations.push({
            lineNum,
            line: line.trim(),
            isForbiddenContext: isForbidden,
            nearbyContext: lines.slice(Math.max(0, i - 3), i + 1).map((l, j) => `  ${contextStart + j + 1}: ${l}`).join('\n')
        });
    }
}

console.log('=== Balance Invariant Check (T1 Regression) ===\n');
console.log(`Scanned: ${lines.length} lines in game.js\n`);

if (approved.length > 0) {
    console.log(`APPROVED locations (${approved.length}):`);
    for (const a of approved) {
        console.log(`  L${a.lineNum}: ${a.line}  [${a.reason}]`);
    }
    console.log('');
}

if (violations.length === 0) {
    console.log('RESULT: PASS - No unauthorized balance modifications found.');
    process.exit(0);
} else {
    console.log(`RESULT: FAIL - ${violations.length} unauthorized balance modification(s) found!\n`);
    for (const v of violations) {
        const tag = v.isForbiddenContext ? ' [FORBIDDEN CONTEXT]' : '';
        console.log(`  VIOLATION at L${v.lineNum}${tag}:`);
        console.log(`    ${v.line}`);
        console.log(`    Context:`);
        console.log(v.nearbyContext);
        console.log('');
    }
    process.exit(1);
}
