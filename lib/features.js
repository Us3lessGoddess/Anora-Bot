'use strict';
/* Wizard Battle — extra game modes ported from the Discord bot:
   Daily Bounty · Mystery Trader · Trials Dungeon · The Castle · Live PvP */
module.exports = function install(C) {
  const { route, bad, need, withLock, updPlayer, publicPlayer, loadPlayer, energy, spendEnergy, startBattle, guardNoBattle, levelUp, finalizers, hooks, E, db, dayKey, now, J } = C;
  const pickE = e => ({ val: e.val, cap: e.cap, nextIn: e.nextIn });
  const setOf = (p, which) => { const s = which === 'arena' ? p.spell_set : p.monster_spell_set; return s.some(Boolean) ? s : p.spell_set; };
  const fighter = (p, which) => E.playerCombatant({ display_name: p.display_name, class_name: p.class_name, gender: p.gender, level: p.level, equipped_item: p.equipped_item, spells: setOf(p, which) });
  const rowToPlayer = r => ({ ...r, spells_owned: J(r.spells_owned, []), spell_set: J(r.spell_set, Array(6).fill(null)), monster_spell_set: J(r.monster_spell_set, Array(6).fill(null)), items_owned: J(r.items_owned, []), daily: J(r.daily, {}) });

  /* ═══════════ DAILY BOUNTY ═══════════ */
  const mk = (arr, reward) => arr.map(t => ({ targets: t, reward }));
  const Q10 = mk([{ Swordsman: 8, Zombie: 2 }, { Zombie: 3, Swordsman: 5 }, { Crusader: 1, Swordsman: 5 }, { Crusader: 1, Zombie: 1 }, { Swordsman: 10, Zombie: 1 }, { Zombie: 4, Swordsman: 3 }], 5);
  const Q1530 = mk([{ Crusader: 5, Zombie: 5 }, { Zombie: 10, Crusader: 1 }, { Crusader: 6, Swordsman: 10 }, { Swordsman: 10, Zombie: 8 }, { Crusader: 4, Swordsman: 10 }, { Zombie: 8, Crusader: 3 }], 10);
  const rpick = a => a[Math.floor(Math.random() * a.length)];
  async function ensureBounty() {
    const today = dayKey(); let r = (await db.execute('SELECT quest,day_key FROM web_bounty WHERE id=1')).rows[0];
    if (!r || r.day_key !== today) {
      const t = (await db.execute('SELECT COUNT(*) n, SUM(level<10) lo, SUM(level>=12 AND level<30) mid FROM web_players')).rows[0];
      const total = Number(t.n) || 0, lo = Number(t.lo) || 0, mid = Number(t.mid) || 0;
      const q = !total ? rpick(Q10) : lo / total > .5 ? rpick(Q10) : mid / total > .5 ? rpick(Q1530) : (lo >= mid ? rpick(Q10) : rpick(Q1530));
      await db.execute('INSERT INTO web_bounty(id,quest,day_key) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET quest=excluded.quest,day_key=excluded.day_key', [JSON.stringify(q), today]);
      return q;
    }
    return J(r.quest, null);
  }
  hooks.recordBounty = async (p, monster, kills) => {
    const q = await ensureBounty(); if (!q || !q.targets[monster]) return;
    const b = p.daily.bounty || (p.daily.bounty = { progress: {}, claimed: false }); if (b.claimed) return;
    b.progress[monster] = Math.min((b.progress[monster] || 0) + kills, q.targets[monster]); await updPlayer(p, { daily: p.daily });
  };
  const bountyView = async p => { const q = await ensureBounty(), b = p.daily.bounty || { progress: {}, claimed: false }; return { quest: q, progress: b.progress, claimed: !!b.claimed, done: Object.entries(q.targets).every(([m, n]) => (b.progress[m] || 0) >= n) }; };
  route('GET', '/api/bounty', {}, async ({ uid }) => bountyView(await need(uid)));
  route('POST', '/api/bounty/claim', {}, async ({ uid }) => withLock(uid, async () => {
    const p = await need(uid), v = await bountyView(p);
    if (v.claimed) bad("You've already claimed today's bounty.", 409); if (!v.done) bad('The quest is not complete yet.', 409);
    p.daily.bounty = { progress: v.progress, claimed: true }; await updPlayer(p, { coins: p.coins + v.quest.reward, daily: p.daily });
    return { ok: true, reward: v.quest.reward, player: publicPlayer(p) };
  }));

  /* ═══════════ MYSTERY TRADER ═══════════ */
  const traderPresent = () => new Date().getUTCHours() % 2 === 0;
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function traderStock() {
    const d = new Date(), slot = d.getUTCHours() - d.getUTCHours() % 2, seed = Number(d.toISOString().slice(0, 10).replace(/-/g, '')) * 100 + slot, rnd = mulberry(seed);
    const pool = E.D.spells.filter(s => s.price > 0).map(s => ({ s, w: s.lv <= 6 ? 10 : s.lv <= 8 ? 3 : 1 })), out = [];
    for (let i = 0; i < Math.min(5, pool.length); i++) {
      const tot = pool.reduce((a, x) => a + x.w, 0); let r = rnd() * tot, k = 0; for (; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) break; } k = Math.min(k, pool.length - 1);
      const { s } = pool.splice(k, 1)[0], disc = 1 + Math.floor(rnd() * 5);
      out.push({ spell: s.name, base: s.price, discount: disc, price: Math.max(1, Math.floor(s.price * (1 - disc / 100))), lv: s.lv });
    }
    return out;
  }
  route('GET', '/api/trader', {}, async ({ uid }) => { const p = await need(uid); const present = traderPresent(); return { present, minutes: 60 - new Date().getUTCMinutes(), items: present ? traderStock() : [], coins: p.coins, chests: p.chests, owned: p.spells_owned, level: p.level }; });
  route('POST', '/api/trader/buy', {}, async ({ uid, body }) => withLock(uid, async () => {
    const p = await need(uid); if (!traderPresent()) bad('The trader has left. He returns on the next even UTC hour.', 409);
    const o = traderStock().find(x => x.spell === body.spell); if (!o) bad('The trader does not sell that.');
    if (p.spells_owned.includes(o.spell)) bad('You already own this spell.', 409); if (p.level < o.lv) bad(`Level ${o.lv} required.`, 403);
    if (p.coins < o.price) bad(`Not enough coins (${o.price} needed).`, 402); if (p.chests < 1) bad('You need 1 Chest as a trade fee.', 402);
    await updPlayer(p, { coins: p.coins - o.price, chests: p.chests - 1, spells_owned: [...p.spells_owned, o.spell] });
    return { ok: true, player: publicPlayer(p) };
  }));

  /* ═══════════ TRIALS DUNGEON ═══════════ */
  route('POST', '/api/dungeon/start', {}, async ({ uid }) => withLock(uid, async () => {
    const p = await need(uid); await guardNoBattle(uid);
    if (energy(p, 'dungeon').val < 1) bad('No Dungeon energy! It recharges +1 every 20 minutes.', 409);
    const d = E.d6(Math.random), name = E.DUNGEON_ROLL[d];
    const S = E.newFight('dungeon', fighter(p, 'monster'), E.monsterCombatant(name), { floor: 1, cleared: 0, best: p.dungeon_best || 0, earned: 0 });
    return startBattle(p, S, [{ t: 'dice', who: 'e', kind: 'roll', v: d, face: E.FACES[d], label: 'Floor 1 monster' }]);
  }));
  finalizers.dungeon = async (p, S, sum) => {
    const m = S.meta; sum.dungeon = { cleared: m.cleared, died: S.result === 'lose' };
    const upd = { coins: p.coins + m.earned }; if (m.cleared > (p.dungeon_best || 0)) upd.dungeon_best = m.cleared;
    await updPlayer(p, upd); sum.coins = m.earned;
    sum.lines.push(`You cleared ${m.cleared} floor${m.cleared === 1 ? '' : 's'}.`);
    if (m.cleared > (m.best || 0)) sum.lines.push(`New personal best: floor ${m.cleared}!`);
    if (S.result === 'lose') { try { await spendEnergy(p, 'dungeon'); sum.lines.push('You fell — 1 Dungeon energy spent.'); } catch { } } else sum.lines.push('You left safely — no energy spent.');
  };
  route('GET', '/api/dungeon', {}, async ({ uid }) => { const p = await need(uid); const top = (await db.execute('SELECT display_name,class_name,dungeon_best FROM web_players WHERE dungeon_best>0 ORDER BY dungeon_best DESC LIMIT 10')).rows; return { energy: pickE(energy(p, 'dungeon')), best: p.dungeon_best || 0, top, roll: E.DUNGEON_ROLL, reward: E.DUNGEON_REWARD }; });

  /* ═══════════ THE CASTLE ═══════════ */
  const TRAPS = {
    barbed_moat: { label: 'Barbed Moat', cost: 5, desc: 'Challengers start the match with a 3-round Bleed effect.' },
    upper_hand: { label: 'Upper Hand', cost: 5, desc: 'The throne holder always attacks first, overriding initiative.' },
    gargoyle_guard: { label: 'Gargoyle Guard', cost: 8, desc: 'The king gains +10 HP and +1 Armor during castle defense only.' },
  };
  const DEBUFF_PER = 4, DEBUFF_CAP = 40, VAULT_MS = 90 * 60e3;
  async function castle() {
    let r = (await db.execute('SELECT * FROM web_castle WHERE id=1')).rows[0];
    if (!r) { await db.execute('INSERT INTO web_castle(id) VALUES(1)'); r = (await db.execute('SELECT * FROM web_castle WHERE id=1')).rows[0]; }
    if (r.is_locked && now() - r.lock_ts > 20 * 60e3) { await db.execute('UPDATE web_castle SET is_locked=0 WHERE id=1'); r.is_locked = 0; }
    if (r.throne_user_id) { const t = Math.floor((now() - r.vault_ts) / VAULT_MS); if (t > 0) { r.vault += t; r.vault_ts += t * VAULT_MS; await db.execute('UPDATE web_castle SET vault=?,vault_ts=? WHERE id=1', [r.vault, r.vault_ts]); } }
    return r;
  }
  const castlePublic = async r => {
    let king = null; if (r.throne_user_id) { const k = (await db.execute('SELECT class_name,gender,level,equipped_item FROM web_players WHERE user_id=?', [r.throne_user_id])).rows[0]; king = k || null; }
    return { holder_id: r.throne_user_id, holder_name: r.throne_name, wins: r.wins, locked: !!r.is_locked, vault: r.vault, stacks: r.debuff, debuff_pct: Math.min(r.debuff * DEBUFF_PER, DEBUFF_CAP), traps: J(r.traps, {}), king, since: r.since };
  };
  route('GET', '/api/castle', {}, async ({ uid }) => { const p = await need(uid), r = await castle(); return { castle: await castlePublic(r), me: uid, isKing: r.throne_user_id === uid, energy: pickE(energy(p, 'castle')), TRAPS, coins: p.coins, per_win: DEBUFF_PER, cap: DEBUFF_CAP }; });
  route('POST', '/api/castle/conquer', {}, async ({ uid }) => withLock(uid, async () => {
    const p = await need(uid), r = await castle(); if (r.throne_user_id) bad('The throne is already taken.', 409);
    await db.execute("UPDATE web_castle SET throne_user_id=?,throne_name=?,wins=0,vault=0,vault_ts=?,debuff=0,traps='{}',since=?,is_locked=0 WHERE id=1 AND throne_user_id IS NULL", [uid, p.display_name, now(), now()]);
    return { ok: true };
  }));
  route('POST', '/api/castle/trap', {}, async ({ uid, body }) => withLock(uid, async () => {
    const p = await need(uid), r = await castle(), t = TRAPS[body.trap]; if (!t) bad('Unknown trap.'); if (r.throne_user_id !== uid) bad('Only the king may buy traps.', 403);
    const act = J(r.traps, {}); if (act[body.trap]) bad('That trap is already set.', 409); if (p.coins < t.cost) bad(`Not enough coins (${t.cost} needed).`, 402);
    act[body.trap] = true; await updPlayer(p, { coins: p.coins - t.cost }); await db.execute('UPDATE web_castle SET traps=? WHERE id=1', [JSON.stringify(act)]);
    return { ok: true, player: publicPlayer(p) };
  }));
  route('POST', '/api/castle/challenge', {}, async ({ uid }) => withLock(uid, async () => {
    const p = await need(uid); await guardNoBattle(uid); const r = await castle();
    if (!r.throne_user_id) bad('The throne is empty — conquer it instead.', 409); if (r.throne_user_id === uid) bad("You can't challenge yourself.", 409);
    if (r.is_locked) bad('A challenge is already in progress.', 409); if (energy(p, 'castle').val < 1) bad('No Castle energy! It recharges +1 per hour.', 409);
    const kr = (await db.execute('SELECT * FROM web_players WHERE user_id=?', [r.throne_user_id])).rows[0]; if (!kr) bad('The king has vanished!', 409);
    const kp = rowToPlayer(kr), traps = J(r.traps, {}), pct = Math.min(r.debuff * DEBUFF_PER, DEBUFF_CAP);
    await spendEnergy(p, 'castle'); await db.execute('UPDATE web_castle SET is_locked=1,lock_ts=? WHERE id=1', [now()]);
    const k = E.arenaCombatant({ display_name: kp.display_name, class_name: kp.class_name, gender: kp.gender, level: kp.level, equipped_item: kp.equipped_item, spells: setOf(kp, 'arena') });
    if (traps.gargoyle_guard) { k.maxHp += 10; k.hp += 10; k.armor += 1; } if (pct > 0) { k.maxHp = Math.max(1, Math.floor(k.maxHp * (1 - pct / 100))); k.hp = k.maxHp; }
    const S = E.newFight('castle', fighter(p, 'arena'), k, { holder_id: r.throne_user_id, moat: !!traps.barbed_moat, upper_hand: !!traps.upper_hand, stacks: r.debuff, pct, gargoyle: !!traps.gargoyle_guard });
    return startBattle(p, S, E.start(S, Math.random));
  }));
  finalizers.castle = async (p, S, sum) => {
    const r = await castle(), m = S.meta;
    if (S.result === 'win') {
      const vault = r.vault, comp = Math.floor(vault / 2), plunder = vault - comp;
      await updPlayer(p, { coins: p.coins + plunder }); if (comp) await db.execute('UPDATE web_players SET coins=coins+? WHERE user_id=?', [comp, m.holder_id]);
      await db.execute("UPDATE web_castle SET throne_user_id=?,throne_name=?,wins=0,is_locked=0,vault=0,vault_ts=?,debuff=0,traps='{}',since=? WHERE id=1", [p.user_id, p.display_name, now(), now()]);
      sum.coins = plunder; sum.lines.push('You seize the throne!'); if (plunder) sum.lines.push(`You plunder ${plunder} coins from the royal vault.`); sum.king = true;
    } else {
      const stacks = Math.min(r.debuff + 1, DEBUFF_CAP / DEBUFF_PER);
      await db.execute("UPDATE web_castle SET wins=wins+1,debuff=?,traps='{}',is_locked=0 WHERE id=1", [stacks]);
      sum.lines.push(`${S.e.name} holds the throne. The king's HP debuff is now −${Math.min(stacks * DEBUFF_PER, DEBUFF_CAP)}%.`);
    }
  };

  /* ═══════════ LIVE PvP ═══════════ */
  const PVP_LIMIT = 6, TURN_MS = 120e3;
  const OPEN = new Map(), MATCH = new Map(), BYUSER = new Map();
  const swapSide = s => (s === 'p' ? 'e' : s === 'e' ? 'p' : s);
  const mirrorEv = e => { const o = { ...e }; if (o.who) o.who = swapSide(o.who); if (o.target) o.target = swapSide(o.target); return o; };
  const sideOf = (M, uid) => (uid === M.p1 ? 'p' : 'e');
  function viewFor(M, uid) {
    const v = E.publicView(M.S); if (uid === M.p1) return v;
    return { ...v, p: v.e, e: v.p, first: swapSide(v.first), turn: swapSide(v.turn), result: v.result === 'win' ? 'lose' : v.result === 'lose' ? 'win' : v.result, spells: M.S.e.spells };
  }
  async function finalizePvp(M) {
    if (M.done) return; M.done = true;
    const winner = M.S.result === 'win' ? M.p1 : M.p2, loser = winner === M.p1 ? M.p2 : M.p1;
    const w = await loadPlayer(winner); let lu = null;
    if (w) { await updPlayer(w, { coins: w.coins + 1, pvp_wins: w.pvp_wins + 1 }); lu = await levelUp(w); }
    M.summary = { [winner]: { mode: 'pvp', result: 'win', lines: ['Victory! +1 coin and +1 PvP win.'], coins: 1, levelUp: lu }, [loser]: { mode: 'pvp', result: 'lose', lines: ['Defeated. Better luck next time.'], coins: 0 } };
    M.endedAt = now();
  }
  function expire(M) { // idle player forfeits
    if (M.S.over || now() - M.lastAct < TURN_MS) return;
    const loserSide = M.S.turn, name = loserSide === 'p' ? M.S.p.name : M.S.e.name;
    M.S.over = true; M.S.result = loserSide === 'p' ? 'lose' : 'win';
    M.log.push({ t: 'end', result: M.S.result, text: `⏱️ ${name} took too long and forfeits.` });
  }
  const payload = (M, uid, since) => {
    const side = sideOf(M, uid), evs = M.log.slice(since).map(e => (side === 'p' ? e : mirrorEv(e)));
    const v = viewFor(M, uid), mine = !M.S.over && v.turn === 'p';
    return { events: evs, seq: M.log.length, view: v, myTurn: mine, over: M.S.over, summary: M.S.over ? (M.summary && M.summary[uid]) || null : null, turnLeft: Math.max(0, TURN_MS - (now() - M.lastAct)) };
  };
  const myMatch = uid => { const id = BYUSER.get(uid); return id ? MATCH.get(id) : null; };
  hooks.inMatch = uid => { const M = myMatch(uid); return !!(M && !M.S.over); };
  const tries = p => p.daily.pvp_tries || 0;
  const cardOf = p => ({ uid: p.user_id, name: p.display_name, cls: p.class_name, gender: p.gender, level: p.level });
  setInterval(() => { const n = now(); for (const [k, o] of OPEN) if (n - o.ts > 45e3) OPEN.delete(k); for (const [id, M] of MATCH) if (M.endedAt && n - M.endedAt > 600e3) { MATCH.delete(id); for (const u of [M.p1, M.p2]) if (BYUSER.get(u) === id) BYUSER.delete(u); } }, 30e3).unref();

  async function startMatch(p1, p2) {
    for (const q of [p1, p2]) { q.daily.pvp_tries = tries(q) + 1; await updPlayer(q, { daily: q.daily }); OPEN.delete(q.user_id); }
    const e2 = E.arenaCombatant({ display_name: p2.display_name, class_name: p2.class_name, gender: p2.gender, level: p2.level, equipped_item: p2.equipped_item, spells: p2.spell_set });
    const S = E.newFight('pvp', fighter(p1, 'arena'), e2, {}); S.neutral = true;
    const M = { id: Math.random().toString(36).slice(2, 10), p1: p1.user_id, p2: p2.user_id, S, log: [], lastAct: now(), busy: false };
    M.log.push(...E.start(S, Math.random)); MATCH.set(M.id, M); BYUSER.set(p1.user_id, M.id); BYUSER.set(p2.user_id, M.id);
    for (const k of [...INVITES.keys()]) { const [f, t] = k.split('>').map(Number); if ([f, t].some(x => x === p1.user_id || x === p2.user_id)) INVITES.delete(k); }
    return M;
  }
  /* direct challenges (from a player's profile) */
  const INVITES = new Map(), INVITE_MS = 120e3; // "from>to" -> {from,to,ts}
  const triesLeft = p => PVP_LIMIT - tries(p);
  route('POST', '/api/pvp/challenge', {}, async ({ uid, body }) => withLock(uid, async () => {
    const to = Number(body.to); if (!to || to === uid) bad('Pick another player.');
    const me = await need(uid); await guardNoBattle(uid);
    const them = await loadPlayer(to); if (!them) bad('Player not found.', 404);
    if (!me.spell_set.some(Boolean)) bad('Equip at least one spell in your Arena set first.', 409); if (triesLeft(me) < 1) bad(`You have no Live PvP battles left today (${PVP_LIMIT}/day).`, 409);
    if (triesLeft(them) < 1) bad(`${them.display_name} has no Live PvP battles left today.`, 409); if (!them.spell_set.some(Boolean)) bad(`${them.display_name} has no Arena spells equipped.`, 409);
    if (!hooks.seenWithin || !hooks.seenWithin(to, 10 * 60e3)) bad(`${them.display_name} is offline right now.`, 409);
    if (hooks.inMatch(to) || (await db.execute('SELECT 1 FROM web_battles WHERE user_id=?', [to])).rows.length) bad(`${them.display_name} is busy in another battle.`, 409);
    if (myMatch(uid) && !myMatch(uid).S.over) bad('You are already in a match.', 409);
    INVITES.set(`${uid}>${to}`, { from: uid, to, ts: now() }); return { ok: true, name: them.display_name };
  }));
  route('POST', '/api/pvp/withdraw', {}, async ({ uid, body }) => { INVITES.delete(`${uid}>${Number(body.to)}`); return { ok: true }; });
  route('POST', '/api/pvp/respond', {}, async ({ uid, body }) => withLock(uid, async () => {
    const from = Number(body.from), key = `${from}>${uid}`, inv = INVITES.get(key);
    if (!inv || now() - inv.ts > INVITE_MS) { INVITES.delete(key); bad('That challenge has expired.', 404); }
    if (!body.accept) { INVITES.delete(key); return { ok: true }; }
    const p2 = await need(uid); await guardNoBattle(uid); const p1 = await loadPlayer(from); if (!p1) bad('Challenger not found.', 404);
    if (triesLeft(p2) < 1) bad('You have no Live PvP battles left today.', 409); if (triesLeft(p1) < 1) { INVITES.delete(key); bad('The challenger has no battles left today.', 409); }
    if (!p2.spell_set.some(Boolean)) bad('Equip at least one spell in your Arena set first.', 409); if (hooks.inMatch(from)) { INVITES.delete(key); bad('The challenger is already in a match.', 409); }
    await startMatch(p1, p2); return { ok: true };
  }));
  hooks.pvpNotify = uid => {
    const n = now(), invites = [], sent = [];
    for (const [k, v] of INVITES) { if (n - v.ts > INVITE_MS) { INVITES.delete(k); continue; } if (v.to === uid) invites.push({ from: v.from, ts: v.ts, left: INVITE_MS - (n - v.ts) }); if (v.from === uid) sent.push({ to: v.to, ts: v.ts }); }
    const M = myMatch(uid); return { invites, sent, match: M ? { id: M.id, over: M.S.over } : null };
  };
  hooks.pvpTriesLeft = triesLeft;

  route('GET', '/api/pvp', {}, async ({ uid }) => {
    const p = await need(uid); const M = myMatch(uid); if (M) expire(M);
    if (OPEN.has(uid)) OPEN.get(uid).ts = now();
    return { limit: PVP_LIMIT, tries: tries(p), hasSet: p.spell_set.some(Boolean), mine: OPEN.has(uid), match: M ? { id: M.id, over: M.S.over } : null, open: [...OPEN.values()].filter(o => o.uid !== uid).map(o => ({ uid: o.uid, name: o.name, cls: o.cls, gender: o.gender, level: o.level })) };
  });
  route('POST', '/api/pvp/open', {}, async ({ uid }) => withLock(uid, async () => {
    const p = await need(uid); await guardNoBattle(uid); if (myMatch(uid) && !myMatch(uid).S.over) bad('You are already in a match.', 409);
    if (!p.spell_set.some(Boolean)) bad('Equip at least one spell in your Arena set first.', 409); if (tries(p) >= PVP_LIMIT) bad(`Daily Live PvP limit reached (${PVP_LIMIT}).`, 409);
    OPEN.set(uid, { ...cardOf(p), ts: now() }); return { ok: true };
  }));
  route('POST', '/api/pvp/cancel', {}, async ({ uid }) => { OPEN.delete(uid); return { ok: true }; });
  route('POST', '/api/pvp/accept', {}, async ({ uid, body }) => {
    const host = Number(body.host); const o = OPEN.get(host); if (!o) bad('That challenge is gone.', 404); if (host === uid) bad('You cannot fight yourself.', 409);
    return withLock(uid, async () => {
      const p2 = await need(uid); await guardNoBattle(uid); if (myMatch(uid) && !myMatch(uid).S.over) bad('You are already in a match.', 409);
      const p1 = await loadPlayer(host); if (!p1) bad('Challenger not found.', 404);
      if (!p2.spell_set.some(Boolean)) bad('Equip at least one spell in your Arena set first.', 409); if (tries(p2) >= PVP_LIMIT) bad(`Daily Live PvP limit reached (${PVP_LIMIT}).`, 409);
      if (tries(p1) >= PVP_LIMIT) { OPEN.delete(host); bad('That challenger has no battles left today.', 409); }
      if (!OPEN.delete(host)) bad('That challenge is gone.', 404);
      await startMatch(p1, p2);
      return { ok: true };
    });
  });
  route('GET', '/api/pvp/match', {}, async ({ uid, query }) => {
    const M = myMatch(uid); if (!M) bad('No match.', 404); expire(M); if (M.S.over) await finalizePvp(M);
    return payload(M, uid, Math.max(0, Number(query.since) || 0));
  });
  route('POST', '/api/pvp/roll', {}, async ({ uid, body }) => {
    const M = myMatch(uid); if (!M) bad('No match.', 404); expire(M);
    if (!M.S.over) {
      if (M.busy) bad('Hold on…', 409); if (M.S.turn !== sideOf(M, uid)) bad("It's not your turn.", 409);
      M.busy = true; try { M.log.push(...E.pvpStep(M.S, Math.random)); M.lastAct = now(); } finally { M.busy = false; }
    }
    if (M.S.over) await finalizePvp(M);
    return payload(M, uid, Math.max(0, Number(body.since) || 0));
  });
  route('POST', '/api/pvp/leave', {}, async ({ uid }) => {
    const M = myMatch(uid); if (!M) return { ok: true };
    if (!M.S.over) { M.S.over = true; M.S.result = sideOf(M, uid) === 'p' ? 'lose' : 'win'; M.log.push({ t: 'end', result: M.S.result, text: `🏳️ ${sideOf(M, uid) === 'p' ? M.S.p.name : M.S.e.name} fled the duel.` }); await finalizePvp(M); }
    BYUSER.delete(uid); return { ok: true, player: publicPlayer(await need(uid)) };
  });
  route('POST', '/api/pvp/ack', {}, async ({ uid }) => { BYUSER.delete(uid); return { ok: true, player: publicPlayer(await need(uid)) }; });
};
