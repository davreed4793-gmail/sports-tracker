/**
 * Tests for calendar.js formatting logic
 * Run: node tests/calendar-formatting.test.js
 */

const fs = require('fs');
const path = require('path');

// Extract SOCCER_LEAGUES from shared.js (single source of truth)
const sharedJs = fs.readFileSync(path.join(__dirname, '../shared.js'), 'utf8');
const soccerLeaguesMatch = sharedJs.match(/const SOCCER_LEAGUES = \[(.*?)\]/s);
if (!soccerLeaguesMatch) {
    console.error('Could not find SOCCER_LEAGUES in shared.js');
    process.exit(1);
}
const SOCCER_LEAGUES = eval(`[${soccerLeaguesMatch[1]}]`);

function isSoccerLeague(league) {
    return SOCCER_LEAGUES.includes(league);
}

function formatMatchup(homeTeam, awayTeam, league) {
    if (isSoccerLeague(league)) {
        return `${homeTeam} v. ${awayTeam}`;
    } else {
        return `${awayTeam} @ ${homeTeam}`;
    }
}

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}`);
        console.log(`  ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected) {
    if (actual !== expected) {
        throw new Error(`Expected "${expected}" but got "${actual}"`);
    }
}

// Tests
console.log('\n--- Sport-specific formatting tests ---\n');
console.log(`SOCCER_LEAGUES from shared.js: ${JSON.stringify(SOCCER_LEAGUES)}\n`);

test('Premier League uses "Home v. Away" format', () => {
    assertEqual(formatMatchup('Arsenal', 'Chelsea', 'premier-league'), 'Arsenal v. Chelsea');
});

test('Champions League uses "Home v. Away" format', () => {
    assertEqual(formatMatchup('Real Madrid', 'Liverpool', 'champions-league'), 'Real Madrid v. Liverpool');
});

test('FA Cup uses "Home v. Away" format', () => {
    assertEqual(formatMatchup('Man United', 'Brighton', 'fa-cup'), 'Man United v. Brighton');
});

test('League Cup uses "Home v. Away" format', () => {
    assertEqual(formatMatchup('Tottenham', 'Fulham', 'league-cup'), 'Tottenham v. Fulham');
});

test('NBA uses "Away @ Home" format', () => {
    assertEqual(formatMatchup('Lakers', 'Celtics', 'nba'), 'Celtics @ Lakers');
});

test('NHL uses "Away @ Home" format', () => {
    assertEqual(formatMatchup('Bruins', 'Rangers', 'nhl'), 'Rangers @ Bruins');
});

test('MLB uses "Away @ Home" format', () => {
    assertEqual(formatMatchup('Yankees', 'Red Sox', 'mlb'), 'Red Sox @ Yankees');
});

test('NFL uses "Away @ Home" format', () => {
    assertEqual(formatMatchup('Chiefs', 'Bills', 'nfl'), 'Bills @ Chiefs');
});

// Summary
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
