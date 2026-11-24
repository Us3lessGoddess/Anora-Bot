'use strict';
// Simulation test: thousands of random fights must never crash or break invariants.
const E = require('../lib/engine');
const assert = require('assert');
let seed = 12345; const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const classes = ['Paladin', 'Barbarian', 'Apprentice'];
const allSpells = E.D.spells.map(s => s.name);
function randSet() { const set = [null, null, null, null, null, null]; const pool = allSpells.slice().sort(() => rng() - .5); let i = 0; for (const n of pool) { if (i > 5) break; const t = [...set, n].slice(0, 6); set[i] = n; if (E.validateSpellSet(set.map(x => x || null), allSpells)) { set[i] = null; continue; } i++; } return set; }
function mkPlayer(cls, lvl, item) { return { display_name: 'T', class_name: cls, level: lvl, equipped_item: item, spells: randSet() }; }
let fights = 0, seenEvents = new Set(), results = {};
const items = [null, ...E.D.items.map(i => i.name)];
for (let n = 0; n < 4000; n++) {
  const cls = classes[n % 3], lvl = 1 + Math.floor(rng() * 40), item = items[Math.floor(rng() * items.length)];
  const p = E.playerCombatant(mkPlayer(cls, lvl, item));
  let S, mode = ['fort', 'boss', 'arena'][n % 3];
  if (mode === 'fort') { const m = E.D.monsters[Math.floor(rng() * E.D.monsters.length)]; S = E.newFight('fort', p, E.monsterCombatant(m.name), { kills: 0, limit: m.limit, earned: { coins: 0, gems: 0 } }); }
  else if (mode === 'boss') { const b = E.D.bosses[n % 4]; S = E.newFight('boss', p, E.bossCombatant(b, 100000), {}); }
  else { S = E.newFight('arena', p, E.arenaCombatant({ display_name: 'Foe', class_name: classes[(n + 1) % 3], level: lvl, equipped_item: null, spells: randSet() }), {}); }
  let ev = E.start(S, rng); let guard = 0;
  const all = [...ev];
  while (!S.over && guard++ < 2000) {
    const e = E.playerRoll(S, rng); all.push(...e);
    for (const c of [S.p, S.e]) assert(c.hp <= c.maxHp, 'hp above max');
    for (const x of e) { seenEvents.add(x.t); if (x.t === 'dmg' || x.t === 'tick') assert(Number.isFinite(x.amount) && x.amount >= 0, 'bad dmg'); }
    if (mode === 'boss' && guard > 400) E.retreat(S);
  }
  assert(S.over, 'fight did not end (' + mode + ')');
  results[mode + ':' + S.result] = (results[mode + ':' + S.result] || 0) + 1; fights++;
}
console.log('fights simulated:', fights); console.log('event types seen:', [...seenEvents].sort().join(', ')); console.log('results:', results);
// rule spot checks
assert.deepStrictEqual(E.computeStats('Paladin', 1, null), { maxHp: 265, armor: 1 });
assert.deepStrictEqual(E.computeStats('Apprentice', 10, "Dwarf's Helmet"), { maxHp: 270 + 25 + 25, armor: 1 });
assert.strictEqual(E.calcDamage('Fire Ball', 2, false), 20);
assert.strictEqual(E.calcDamage('Sonic Pebble', 3, true), 50); // pierce ignores armor
assert.strictEqual(E.weaken(200, { Weaken: 2 })[0], 150); assert.strictEqual(E.weaken(600, { Weaken: 1 })[1], 100); // cap -100
assert(E.validateSpellSet(['Ice Arrow', 'Stomp', 'Dust Ball', null, null, null], allSpells).includes('crowd-control'));
assert(E.validateSpellSet(['Basic Heal', 'Great Heal', 'Bite', null, null, null], allSpells).includes('healing'));
assert(E.validateSpellSet(['Cut', 'Cut', null, null, null, null], allSpells).includes('twice'));
console.log('rule checks OK');

// ── new modes: dungeon / castle / live pvp ──
{
  let floors = 0, pv = 0, caste = 0, ms = new Set();
  for (let n = 0; n < 600; n++) {
    const cls = classes[n % 3], lvl = 1 + Math.floor(rng() * 30);
    // dungeon: must advance floors, refill HP between floors, award coins every 5th
    const p = E.playerCombatant(mkPlayer(cls, lvl, null));
    const S = E.newFight('dungeon', p, E.monsterCombatant('Crusader'), { floor: 1, cleared: 0, best: 0, earned: 0 });
    let g = 0; while (!S.over && g++ < 3000) { const ev = E.playerRoll(S, rng); for (const x of ev) { ms.add(x.t); if (x.t === 'spawn') { assert(E.D.monsters.some(m => m.name === x.name) || E.DUNGEON_ONLY[x.name], 'bad floor monster ' + x.name); } } if (g > 600) E.retreat(S); }
    assert(S.over); floors += S.meta.cleared; if (S.meta.cleared >= 5) assert(S.meta.earned > 0, 'milestone coins');
    // castle with both traps
    const S2 = E.newFight('castle', E.playerCombatant(mkPlayer(cls, lvl, null)), E.arenaCombatant({ display_name: 'King', class_name: classes[(n + 1) % 3], level: lvl, equipped_item: null, spells: randSet() }), { moat: n % 2 === 0, upper_hand: n % 3 === 0 });
    const ev0 = E.start(S2, rng); if (S2.meta.upper_hand) assert.strictEqual(S2.first, 'e'); if (S2.meta.moat) assert(ev0.some(x => x.t === 'apply' && x.eff === 'Bleed'));
    g = 0; while (!S2.over && g++ < 500) E.playerRoll(S2, rng); assert(S2.over); caste++;
    // live pvp: strict alternation, neutral wording
    const S3 = E.newFight('pvp', E.playerCombatant(mkPlayer(cls, lvl, null)), E.arenaCombatant({ display_name: 'Rival', class_name: classes[(n + 2) % 3], level: lvl, equipped_item: null, spells: randSet() }), {}); S3.neutral = true;
    const ev1 = E.start(S3, rng); assert(!ev1.some(x => /\bYou\b/.test(x.text || '')), 'neutral text'); g = 0;
    while (!S3.over && g++ < 800) { const ev = E.pvpStep(S3, rng); assert(!ev.some(x => /\bYou\b/.test(x.text || '')), 'neutral text: ' + JSON.stringify(ev.find(x => /\bYou\b/.test(x.text || '')))); }
    assert(S3.over && (S3.result === 'win' || S3.result === 'lose')); pv++;
  }
  console.log('dungeon floors cleared across runs:', floors, '| castle fights:', caste, '| pvp fights:', pv, '| events:', [...ms].join(','));
}
