// Poker hand evaluator test suite
'use strict';
const assert = require('assert');
const { Card, evaluateCards, compareEval, handLabel } = require('../games/poker.js');

function c(suit, rank) { return new Card(suit, rank); }

// Helper: 7-card hand from shorthand strings like 'AS' (Ace Spades)
function h(...cards) {
    return cards.map(s => {
        const rank = s.length === 3 ? '10' : s[0];
        const suitMap = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
        return c(suitMap[s[s.length - 1]], rank);
    });
}

let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

// ---- Known hand rankings (in order) ----
const royal = h('AS', 'KS', 'QS', 'JS', '10S', '2D', '3C');          // Royal Flush
const straightFlush = h('9H', '8H', '7H', '6H', '5H', '2D', '3C');   // Straight Flush (9-high)
const quads = h('AH', 'AD', 'AC', 'AS', '2H', '3D', '4C');           // Four Aces
const fullHouse = h('KH', 'KD', 'KC', '7S', '7H', '2D', '3C');       // Kings full of Sevens
const flush = h('AH', 'JH', '9H', '6H', '2H', 'KD', '3C');           // Ace-high Flush
const straight = h('10C', '9D', '8H', '7S', '6C', 'AH', '2D');       // Ten-high Straight
const trips = h('5H', '5D', '5C', 'AS', '9H', '2D', '3C');           // Trip Fives
const twoPair = h('JH', 'JD', '4C', '4S', 'AH', '2D', '3C');         // Jacks and Fours
const pair = h('8H', '8D', 'KH', 'QS', '9H', '2D', '3C');            // Pair of Eights
const highCard = h('AH', 'KD', 'QC', 'JS', '9H', '2D', '3C');        // Ace High

// ---- Three-pair edge case (must be Two Pair, QQ or JJ best) ----
const threePair = h('QH', 'QD', 'JC', 'JS', '7H', '7D', 'AS');       // QQ JJ -> Two Pair, Queens and Jacks
// ---- Double trips (must be Full House: AAA AA) ----
const doubleTrips = h('AH', 'AD', 'AC', '2S', '2H', '2D', 'KD');     // Aces full of Twos
// ---- Wheel straight ----
const wheel = h('AS', '2H', '3D', '4C', '5S', 'KH', 'QD');           // 5-high straight
// ---- Flush tiebreak: best 5 suited, not all 7 ----
const bestFlush = h('AH', 'KH', 'QH', 'JH', '9H', '2H', '3H');       // Should pick A K Q J 9, not A K Q J 3
// ---- 7-card straight (should detect the best straight: 9-high? actually 7-8-9-10-J) ----
const sevenStraight = h('7C', '8D', '9H', '10S', 'JC', '6D', '5H');  // Jack-high straight

// ---- Comparisons ----
function rankOf(hand) { return evaluateCards(hand).rank; }

console.log('Hand ranking tests:');
test('Royal Flush beats Straight Flush', () => {
    assert(compareEval(evaluateCards(royal), evaluateCards(straightFlush)) > 0);
});
test('Straight Flush beats Four of a Kind', () => {
    assert(compareEval(evaluateCards(straightFlush), evaluateCards(quads)) > 0);
});
test('Four of a Kind beats Full House', () => {
    assert(compareEval(evaluateCards(quads), evaluateCards(fullHouse)) > 0);
});
test('Full House beats Flush', () => {
    assert(compareEval(evaluateCards(fullHouse), evaluateCards(flush)) > 0);
});
test('Flush beats Straight', () => {
    assert(compareEval(evaluateCards(flush), evaluateCards(straight)) > 0);
});
test('Straight beats Three of a Kind', () => {
    assert(compareEval(evaluateCards(straight), evaluateCards(trips)) > 0);
});
test('Three of a Kind beats Two Pair', () => {
    assert(compareEval(evaluateCards(trips), evaluateCards(twoPair)) > 0);
});
test('Two Pair beats a Pair', () => {
    assert(compareEval(evaluateCards(twoPair), evaluateCards(pair)) > 0);
});
test('Pair beats High Card', () => {
    assert(compareEval(evaluateCards(pair), evaluateCards(highCard)) > 0);
});

console.log('Edge-case tests:');
test('Three pairs evaluates as Two Pair with the two highest pairs', () => {
    const ev = evaluateCards(threePair);
    assert.strictEqual(ev.rank, 2);
    assert.deepStrictEqual(ev.tiebreakers.slice(0, 2), [12, 11]); // Queens, Jacks
});
test('Double trips evaluates as Full House', () => {
    const ev = evaluateCards(doubleTrips);
    assert.strictEqual(ev.rank, 6);
    assert.deepStrictEqual(ev.tiebreakers, [14, 2]); // Aces full of Twos
});
test('Wheel A-2-3-4-5 is a 5-high straight', () => {
    const ev = evaluateCards(wheel);
    assert.strictEqual(ev.rank, 4);
    assert.strictEqual(ev.tiebreakers[0], 5);
});
test('Flush uses best 5 suited cards (not 7)', () => {
    const ev = evaluateCards(bestFlush);
    assert.strictEqual(ev.rank, 5);
    assert.deepStrictEqual(ev.tiebreakers.slice(0, 4), [14, 13, 12, 11]);
});
test('Seven-card straight detects the highest straight', () => {
    const ev = evaluateCards(sevenStraight);
    assert.strictEqual(ev.rank, 4);
    assert.strictEqual(ev.tiebreakers[0], 11); // Jack high
});

console.log('Kicker / tiebreak tests:');
test('Royal Flush recognizes all 5 cards are winning', () => {
    const ev = evaluateCards(royal);
    assert.strictEqual(ev.rank, 9);
    assert.strictEqual(ev.cards.length, 5);
});
test('handLabel produces readable output', () => {
    assert(handLabel(evaluateCards(royal)).includes('Royal Flush'));
    assert(handLabel(evaluateCards(fullHouse)).includes('Kings'));
    assert(handLabel(evaluateCards(twoPair)).includes('Jacks'));
});

console.log(`\nAll ${passed} tests passed!`);