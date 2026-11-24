'use strict';
/**
 * Wizard Battle — authoritative battle engine (server side).
 * Ported from Wizard_battle_V7.5.py. The engine never draws anything: it resolves
 * a round and returns a list of typed EVENTS that the browser plays back with
 * animations (dice, spell FX, damage-over-time, crowd-control auras ...).
 */
const D = require('./gamedata.json');

const SPELLS = Object.fromEntries(D.spells.map(s => [s.name, s]));
const EFFECTS = Object.fromEntries(D.effects.map(e => [e.name, e]));
const CLASSES = Object.fromEntries(D.classes.map(c => [c.name, c]));
const ITEMS = Object.fromEntries(D.items.map(i => [i.name, i]));
const MONSTERS = Object.fromEntries(D.monsters.map(m => [m.name, m]));

const DUNGEON_ONLY = { Pixie: { hp: 350, armor: 0, dmg: 60, eff: null, ch: 0 }, Dwarf: { hp: 300, armor: 2, dmg: 45, eff: null, ch: 0 } };
const DUNGEON_ROLL = { 1: 'Crusader', 2: 'Dwarf', 3: 'Stone Golem', 4: 'Emberling', 5: 'Pixie', 6: 'Zombie' };
const DUNGEON_REWARD = { 1: 5, 2: 2, 3: 1, 4: 1, 5: 2, 6: 3 };
const CC = new Set(['Blind', 'Confuse', 'Freeze', 'Stun']);
const TICKERS = ['Burn', 'Poison', 'Bleed', 'Weaken'];
const CC_SLOT_CAP = 2, HEAL_SLOT_CAP = 2;
const WINS_PER_LEVEL = 5;
const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const d6 = rng => 1 + Math.floor(rng() * 6);

/* ───────────────────────── stats helpers ───────────────────────── */
function computeStats(cls, level, itemName) {
  const c = CLASSES[cls] || { hp: 100, armor: 0 };
  let bonus = 0;
  if (level >= 10) bonus += 25;
  if (level >= 25) bonus += 25;
  if (level >= 50) bonus += 25;
  if (level > 50) bonus += Math.floor((level - 50) / 20) * 25;
  let hp = Math.min(c.hp + bonus, 500);
  let armor = c.armor;
  const it = itemName && ITEMS[itemName];
  if (it) { hp = Math.min(hp + it.hp, 500); armor += it.armor; }
  return { maxHp: hp, armor };
}

function calcDamage(spellName, targetArmor, pierce) {
  const s = SPELLS[spellName];
  if (!s || !s.dmg) return 0;
  if (pierce || targetArmor === 0) return s.dmg;
  return Math.max(0, s.dmg - targetArmor * 10);
}

function weaken(dmg, eff) {
  if (!eff.Weaken || dmg <= 0) return [dmg, 0];
  const red = Math.min(Math.floor(dmg * 0.25), 100);
  return [Math.max(0, dmg - red), red];
}

/** Validate a 6 slot loadout: no duplicates, <=2 CC spells, <=2 heal spells, owned. */
function validateSpellSet(set, owned) {
  if (!Array.isArray(set) || set.length !== 6) return 'A spell set needs exactly 6 slots.';
  let cc = 0, heal = 0; const seen = new Set();
  for (const n of set) {
    if (!n) continue;
    const s = SPELLS[n];
    if (!s) return `Unknown spell: ${n}`;
    if (!owned.includes(n)) return `You don't own ${n}.`;
    if (seen.has(n)) return `${n} is used twice — no duplicates allowed.`;
    seen.add(n);
    if (CC.has(s.eff)) cc++;
    if (s.heal > 0) heal++;
  }
  if (cc > CC_SLOT_CAP) return `Max ${CC_SLOT_CAP} crowd-control spells (Blind/Confuse/Freeze/Stun) per set.`;
  if (heal > HEAL_SLOT_CAP) return `Max ${HEAL_SLOT_CAP} healing spells per set.`;
  return null;
}

/* ───────────────────────── combatant factories ───────────────────────── */
function playerCombatant(p) {
  const st = computeStats(p.class_name, p.level, p.equipped_item);
  return {
    side: 'p', kind: 'player', name: p.display_name, cls: p.class_name, gender: p.gender || 'm', level: p.level,
    hp: st.maxHp, maxHp: st.maxHp, armor: st.armor, spells: p.spells, item: p.equipped_item || null, eff: {},
  };
}
function monsterCombatant(name) {
  const m = MONSTERS[name] || DUNGEON_ONLY[name];
  return {
    side: 'e', kind: 'monster', name, cls: null, hp: m.hp, maxHp: m.hp, armor: m.armor, eff: {}, item: null,
    fixed: { name: 'Strike', dmg: m.dmg, eff: m.eff, ch: m.ch == null ? 1 : m.ch, dura: 1, heal: 0 },
  };
}
function bossCombatant(boss, hp) {
  return { side: 'e', kind: 'boss', name: boss.name, cls: null, hp, maxHp: boss.hp, armor: boss.armor, spells: boss.spells.slice(), eff: {}, item: null, image: boss.image };
}
function arenaCombatant(o) {
  const st = computeStats(o.class_name, o.level, o.equipped_item);
  return { side: 'e', kind: 'arena', name: o.display_name, cls: o.class_name, gender: o.gender || 'm', level: o.level, hp: st.maxHp, maxHp: st.maxHp, armor: st.armor, spells: o.spells, item: o.equipped_item || null, eff: {} };
}

/* ───────────────────────── fight lifecycle ───────────────────────── */
function newFight(mode, p, e, meta = {}) {
  return { mode, round: 1, first: 'p', p, e, over: false, result: null, meta };
}

function publicView(S) {
  const v = c => ({ name: c.name, kind: c.kind, cls: c.cls, gender: c.gender || 'm', level: c.level, hp: Math.max(0, c.hp), maxHp: c.maxHp, armor: c.armor, eff: { ...c.eff }, item: c.item, image: c.image || null });
  return { mode: S.mode, round: S.round, first: S.first, turn: S.turn || null, neutral: !!S.neutral, over: S.over, result: S.result, p: v(S.p), e: v(S.e), meta: S.meta, spells: S.p.spells };
}

class Ctx {
  constructor(S, rng) { this.S = S; this.rng = rng; this.ev = []; }
  push(e) { this.ev.push(e); return e; }
  roll() { return d6(this.rng); }
  /** a dice event that is a pure even/odd check */
  check(who, label, need = 'even') {
    const v = this.roll();
    const ok = need === 'even' ? v % 2 === 0 : v % 2 === 1;
    this.push({ t: 'dice', who, kind: 'check', v, need, ok, label, face: FACES[v] });
    return { v, ok };
  }
}

let NEUTRAL = false; // true while resolving a human-vs-human fight: nobody is "You"
const nm = c => (c.side === 'p' && !NEUTRAL ? 'You' : c.name);
const be = c => (c.side === 'p' && !NEUTRAL ? 'are' : 'is');

/* ───────── one combatant takes its action ───────── */
function act(cx, side) {
  const S = cx.S, A = S[side], T = S[side === 'p' ? 'e' : 'p'];
  const R = S.round;
  cx.push({ t: 'turn', who: side, round: R });

  /* item ability — start of turn, before status checks */
  let itemMult = 1;
  if (A.item && ITEMS[A.item]) {
    const it = A.item;
    if (it === 'Sunglasses' && R % 2 === 0 && A.eff.Blind) { delete A.eff.Blind; cx.push({ t: 'item', who: side, item: it, fx: 'cleanse', eff: 'Blind', text: `🕶️ Clear Vision! ${nm(A)} cleansed Blind.` }); }
    else if (it === "Peasant's Hat" && R % 3 === 0) { const h = Math.min(A.maxHp - A.hp, 25); A.hp += h; cx.push({ t: 'item', who: side, item: it, fx: 'heal', text: `🎩 Poor Man's Meal! +25 HP.` }); cx.push({ t: 'heal', who: side, amount: h, hp: A.hp, src: 'item' }); }
    else if (it === "Dwarf's Helmet" && R % 3 === 0 && A.eff.Stun) { delete A.eff.Stun; cx.push({ t: 'item', who: side, item: it, fx: 'cleanse', eff: 'Stun', text: `⛏️ Hard Head! Stun cleansed.` }); }
    else if (it === "Raptor's Claw" && R === 1) {
      const c = cx.check(side, "Raptor Pounce — need EVEN");
      if (c.ok) { itemMult = 2; cx.push({ t: 'item', who: side, item: it, fx: 'power', text: `🦅 Raptor Pounce! Double damage this round.` }); }
    } else if (it === "Zombie's Tooth" && R % 2 === 0) {
      const c = cx.check(side, "Infection — need EVEN");
      if (c.ok) { const dur = cx.rng() < 0.5 ? 1 : 2; T.eff.Poison = dur; cx.push({ t: 'item', who: side, item: it, fx: 'poison', text: `🦷 Infection! Poison applied for ${dur}.` }); cx.push({ t: 'apply', who: T.side, eff: 'Poison', dura: dur, text: `${nm(T)} ${be(T)} poisoned by Infection.` }); }
    }
  }

  /* Freeze — skip, DPR ticks now */
  if (A.eff.Freeze) {
    cx.push({ t: 'skip', who: side, why: 'freeze', text: `🧊 ${nm(A)} ${be(A)} Frozen and cannot act!` });
    const dpr = EFFECTS.Freeze.dpr;
    if (dpr > 0) { A.hp -= dpr; cx.push({ t: 'dmg', who: side, amount: dpr, hp: Math.max(0, A.hp), src: 'dot', eff: 'Freeze' }); }
    if (--A.eff.Freeze <= 0) { delete A.eff.Freeze; cx.push({ t: 'expire', who: side, eff: 'Freeze' }); }
    return;
  }
  if (A.eff.Stun) {
    if (--A.eff.Stun <= 0) { delete A.eff.Stun; }
    cx.push({ t: 'skip', who: side, why: 'stun', text: `🪨 ${nm(A)} ${be(A)} Stunned and cannot act!` });
    if (!A.eff.Stun) cx.push({ t: 'expire', who: side, eff: 'Stun' });
    return;
  }

  /* Confuse — odd roll: the spell hits yourself */
  let self = false;
  if (A.eff.Confuse) {
    const c = cx.check(side, 'Confusion check — need EVEN');
    if (--A.eff.Confuse <= 0) { delete A.eff.Confuse; cx.push({ t: 'expire', who: side, eff: 'Confuse' }); }
    if (!c.ok) { self = true; cx.push({ t: 'confused', who: side, text: `🌀 ${nm(A)} ${be(A)} Confused — the spell turns on its caster!` }); }
  }

  /* Blind — odd roll: miss */
  if (A.eff.Blind) {
    const c = cx.check(side, 'Blind check — need EVEN');
    if (--A.eff.Blind <= 0) { delete A.eff.Blind; cx.push({ t: 'expire', who: side, eff: 'Blind' }); }
    if (!c.ok) { cx.push({ t: 'skip', who: side, why: 'blind', text: `👁️ ${nm(A)} missed — blinded!` }); return; }
  }

  /* pick the spell */
  let spell = null, spellName = null;
  if (A.fixed) { spell = A.fixed; spellName = A.fixed.name; }
  else {
    const v = cx.roll();
    cx.push({ t: 'dice', who: side, kind: 'slot', v, face: FACES[v], label: side === 'p' && !NEUTRAL ? 'Spell dice' : `${A.name} rolls` });
    spellName = A.spells[v - 1];
    spell = spellName ? SPELLS[spellName] : null;
    if (!spell) { cx.push({ t: 'skip', who: side, why: 'empty', slot: v, text: `🚫 Slot ${v} is empty — no spell cast.` }); return; }
  }

  /* defender's Paladin shield */
  let blocked = false;
  if (!self && T.cls === 'Paladin' && R % 3 === 0) {
    const c = cx.check(T.side, 'Shield Raise — need EVEN');
    if (c.ok) { blocked = true; cx.push({ t: 'block', who: T.side, text: `🛡️ ${nm(T)} raised the Paladin shield — blocked everything!` }); }
  }

  const target = self ? A : T;
  const pierce = spell.eff === 'Pierce';
  cx.push({ t: 'cast', who: side, target: target.side, spell: spellName, eff: spell.eff || null, blocked, self, kind: A.kind, text: `✨ ${nm(A)} cast ${spellName}!` });

  let dualHit = false, dualDur = false;

  if (!blocked) {
    let mult = itemMult;
    if (A.cls === 'Barbarian' && R % 4 === 0) {
      const c = cx.check(side, 'Blood Frenzy — need EVEN');
      if (c.ok) { mult *= 2; cx.push({ t: 'passive', who: side, name: 'Blood Frenzy', fx: 'rage', text: '🪓 Blood Frenzy! Double damage.' }); }
    }
    if (A.cls === 'Barbarian' && R % 3 === 0) {
      const c = cx.check(side, 'Bloodthirst — need EVEN');
      if (c.ok) { const h = Math.min(A.maxHp - A.hp, 40); A.hp += h; cx.push({ t: 'passive', who: side, name: 'Bloodthirst', fx: 'blood', text: '🩸 Bloodthirst! +40 HP.' }); cx.push({ t: 'heal', who: side, amount: h, hp: A.hp, src: 'passive' }); }
    }
    if (A.cls === 'Paladin' && R % 3 === 0 && !self) { mult *= 1.5; cx.push({ t: 'passive', who: side, name: 'Holy Punishment', fx: 'holy', text: '⚡ Holy Punishment! +50% damage.' }); }

    let dmg = Math.floor(calcDamage(spellName, target.armor, pierce) * mult);
    if (A.fixed) dmg = Math.floor(Math.max(0, A.fixed.dmg - (pierce ? 0 : target.armor * 10)) * mult);
    let red = 0;
    if (dmg > 0) [dmg, red] = weaken(dmg, A.eff);
    if (dmg > 0) {
      target.hp -= dmg;
      cx.push({ t: 'dmg', who: target.side, amount: dmg, hp: Math.max(0, target.hp), src: 'spell', spell: spellName, mult, weakened: red, self });
    }

    if (A.cls === 'Apprentice' && R % 3 === 0) {
      const c1 = cx.check(side, 'Dual Cast: damage — need EVEN');
      if (c1.ok) {
        dualHit = true;
        let dd = calcDamage(spellName, target.armor, pierce);
        if (dd > 0) [dd] = weaken(dd, A.eff);
        target.hp -= dd;
        cx.push({ t: 'passive', who: side, name: 'Dual Cast', fx: 'echo', text: `🪄 Dual Cast! +${dd} bonus damage.` });
        if (dd > 0) cx.push({ t: 'dmg', who: target.side, amount: dd, hp: Math.max(0, target.hp), src: 'spell', spell: spellName, echo: true, self });
      }
      const c2 = cx.check(side, 'Dual Cast: duration — need EVEN');
      if (c2.ok) { dualDur = true; cx.push({ t: 'passive', who: side, name: 'Dual Cast', fx: 'echo', text: '🪄 Dual Cast! Effect duration doubled.' }); }
      if (!dualHit && !dualDur) { const h = Math.min(A.maxHp - A.hp, 10); A.hp += h; cx.push({ t: 'passive', who: side, name: 'Dual Cast', fx: 'fizzle', text: '🪄 Dual Cast fizzled — recovered 10 HP.' }); cx.push({ t: 'heal', who: side, amount: h, hp: A.hp, src: 'passive' }); }
    }
  }

  /* heal is self-targeted and always applies */
  if (spell.heal > 0) {
    let h = spell.heal * (dualHit ? 2 : 1);
    h = Math.min(A.maxHp - A.hp, h);
    A.hp += h;
    cx.push({ t: 'heal', who: side, amount: h, hp: A.hp, src: 'spell', spell: spellName, dual: dualHit });
  }

  /* status effect */
  if (!blocked && spell.eff && spell.eff !== 'Pierce' && !(A.fixed && self)) {
    const ch = spell.ch == null ? 1 : spell.ch;
    const dura = spell.dura || 1;
    let landed = ch >= 1;
    if (!landed) {
      const c = cx.check(side, `${spell.eff} chance — need EVEN`);
      landed = c.ok;
      if (!landed) cx.push({ t: 'fizzle', who: target.side, eff: spell.eff, text: `💨 ${spell.eff} fizzled.` });
    }
    if (landed) {
      target.eff[spell.eff] = dura;
      if (dualDur) target.eff[spell.eff] = dura * 2;
      cx.push({ t: 'apply', who: target.side, eff: spell.eff, dura: target.eff[spell.eff], text: `✨ ${nm(target)} ${be(target)} afflicted with ${spell.eff} (${target.eff[spell.eff]}).` });
    }
  }
}

/* ───────── end of full round: damage over time ───────── */
function endRound(cx) {
  const S = cx.S;
  for (const side of ['p', 'e']) {
    const c = S[side];
    for (const eff of Object.keys(c.eff)) {
      if (!TICKERS.includes(eff)) continue;
      const dpr = EFFECTS[eff].dpr;
      if (dpr > 0) { c.hp -= dpr; cx.push({ t: 'tick', who: side, eff, amount: dpr, hp: Math.max(0, c.hp) }); }
      if (--c.eff[eff] <= 0) { delete c.eff[eff]; cx.push({ t: 'expire', who: side, eff }); }
    }
  }
  S.round += 1;
  cx.push({ t: 'round', n: S.round });
}

function finish(cx, result, text) {
  cx.S.over = true; cx.S.result = result;
  cx.push({ t: 'end', result, text });
}

/** checks deaths; returns true if the fight is decided (or monster respawned) */
function settle(cx, { dotPhase = false } = {}) {
  const S = cx.S, p = S.p, e = S.e;
  if (S.neutral) {
    if (p.hp <= 0) { finish(cx, 'lose', `💀 ${p.name} has fallen!`); return true; }
    if (e.hp <= 0) { finish(cx, 'win', `💀 ${e.name} has fallen!`); return true; }
    return false;
  }
  if (p.hp <= 0) { finish(cx, 'lose', dotPhase ? '☠️ You succumbed to status damage.' : '💀 Defeat! Your HP dropped to 0.'); return true; }
  if (e.hp <= 0) {
    if (S.mode === 'dungeon') {
      const fl = ++S.meta.cleared; S.meta.best = Math.max(S.meta.best || 0, fl);
      cx.push({ t: 'kill', who: 'e', name: e.name, floor: fl, reward: null, text: `💀 ${e.name} defeated — Floor ${fl} cleared!` });
      if (fl % 5 === 0) { const d = cx.roll(), c = DUNGEON_REWARD[d]; S.meta.earned += c; cx.push({ t: 'dice', who: 'p', kind: 'roll', v: d, face: FACES[d], label: `Floor ${fl} reward roll` }); cx.push({ t: 'log', text: `🎁 Milestone reward: +${c} coins!` }); cx.push({ t: 'reward', coins: c, floor: fl }); }
      for (const k of Object.keys(p.eff)) { delete p.eff[k]; cx.push({ t: 'expire', who: 'p', eff: k }); }
      if (p.hp < p.maxHp) { const h = p.maxHp - p.hp; p.hp = p.maxHp; cx.push({ t: 'heal', who: 'p', amount: h, hp: p.hp, src: 'floor' }); }
      const d2 = cx.roll(), nname = DUNGEON_ROLL[d2];
      cx.push({ t: 'dice', who: 'e', kind: 'roll', v: d2, face: FACES[d2], label: `Floor ${fl + 1} monster` });
      S.e = monsterCombatant(nname); S.round = 1; S.meta.floor = fl + 1;
      cx.push({ t: 'round', n: 1 });
      cx.push({ t: 'spawn', who: 'e', name: nname, hp: S.e.hp, maxHp: S.e.maxHp, floor: fl + 1, text: `⚔️ Floor ${fl + 1}: a ${nname} appears!` });
      return true;
    }
    if (S.mode === 'fort') {
      const m = MONSTERS[e.name];
      S.meta.kills += 1;
      S.meta.earned[m.reward.cur] += m.reward.amount;
      cx.push({ t: 'kill', who: 'e', name: e.name, reward: m.reward, kills: S.meta.kills, limit: S.meta.limit, text: `💀 ${e.name} defeated! (${S.meta.kills}/${S.meta.limit})` });
      if (S.meta.kills >= S.meta.limit) { finish(cx, 'limit', `🎉 Daily limit reached — all ${S.meta.limit} ${e.name}s slain!`); return true; }
      e.hp = e.maxHp; e.eff = {}; S.round += 1;
      cx.push({ t: 'spawn', who: 'e', name: e.name, hp: e.hp, round: S.round, text: `A fresh ${e.name} appears!` });
      return true;
    }
    if (S.mode === 'boss') { finish(cx, 'win', `☠️ ${e.name} has been SLAIN!`); return true; }
    finish(cx, 'win', `🏆 ${e.name} has fallen — victory!`); return true;
  }
  return false;
}

/* ───────── public round API ───────── */
function start(S, rng) {
  NEUTRAL = !!S.neutral;
  const cx = new Ctx(S, rng);
  if (S.mode === 'arena' || S.mode === 'castle' || S.mode === 'pvp') {
    if (S.meta.moat) { S.p.eff.Bleed = 3; cx.push({ t: 'apply', who: 'p', eff: 'Bleed', dura: 3, text: '🩸 The Barbed Moat tears at the challenger (Bleed 3).' }); }
    if (S.meta.upper_hand) { S.first = 'e'; cx.push({ t: 'log', text: `⚔️ Upper Hand — ${S.e.name} always strikes first.` }); }
    else {
    const a = cx.roll(), b = cx.roll();
    cx.push({ t: 'dice', who: 'p', kind: 'init', v: a, face: FACES[a], label: 'Initiative' });
    cx.push({ t: 'dice', who: 'e', kind: 'init', v: b, face: FACES[b], label: `${S.e.name} initiative` });
    S.first = a >= b ? 'p' : 'e'; }
    S.turn = S.first;
    cx.push({ t: 'log', text: S.first === 'p' ? (NEUTRAL ? `${S.p.name} acts first!` : '✅ You act first!') : `⚡ ${S.e.name} acts first!` });
    if (S.mode !== 'pvp' && S.first === 'e') { act(cx, 'e'); settle(cx); }
  }
  return cx.ev;
}

/** Live PvP: advance exactly one combatant's turn (S.turn). Both sides are humans. */
function pvpStep(S, rng) {
  if (S.over) return [];
  NEUTRAL = true;
  const cx = new Ctx(S, rng), side = S.turn;
  act(cx, side); if (settle(cx)) return cx.ev;
  if (side === S.first) S.turn = side === 'p' ? 'e' : 'p';
  else { endRound(cx); if (settle(cx, { dotPhase: true })) return cx.ev; S.turn = S.first; }
  return cx.ev;
}

function playerRoll(S, rng) {
  if (S.over) return [];
  NEUTRAL = !!S.neutral;
  const cx = new Ctx(S, rng);
  act(cx, 'p');
  if (settle(cx)) return cx.ev; // fight over, or the monster died and respawned
  if (S.first === 'p') {
    act(cx, 'e'); if (settle(cx)) return cx.ev;
    endRound(cx); settle(cx, { dotPhase: true });
  } else {
    endRound(cx); if (settle(cx, { dotPhase: true })) return cx.ev;
    act(cx, 'e'); settle(cx);
  }
  return cx.ev;
}

function retreat(S) { S.over = true; S.result = 'retreat'; return [{ t: 'end', result: 'retreat', text: '🏳️ You retreated from battle.' }]; }

module.exports = {
  D, SPELLS, EFFECTS, CLASSES, ITEMS, MONSTERS, FACES, CC, CC_SLOT_CAP, HEAL_SLOT_CAP, WINS_PER_LEVEL,
  d6, computeStats, calcDamage, weaken, validateSpellSet,
  playerCombatant, monsterCombatant, bossCombatant, arenaCombatant,
  newFight, publicView, start, playerRoll, pvpStep, retreat, DUNGEON_ONLY, DUNGEON_ROLL, DUNGEON_REWARD,
};
