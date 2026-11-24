'use strict';
/* Wizard Battle — Web Edition. Zero-framework Node server (only dependency: @libsql/client for Turso). */
// tiny .env loader for local dev (Render uses real environment variables)
try { for (const l of require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { }
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = require('./lib/auth');
const E = require('./lib/engine');
const DB = require('./lib/db');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
let db;

/* ═══════════════ constants (mirrors the Discord bot) ═══════════════ */
const ARENA_CAP = 5, ARENA_REGEN_MS = 3600e3;
const BOSS_CAP = 6, BOSS_REGEN_MS = 20 * 60e3;
const LOTTERY = { 1: 5, 2: 2, 3: 1, 4: 1, 5: 1, 6: 3 };              // coins
const CHEST = { 1: [0, 5], 2: [10, 0], 3: [5, 0], 4: [5, 0], 5: [0, 1], 6: [0, 2] }; // [coins, gems]
const STARTERS = ['Punch Spell', 'Weak Poison', 'Cut'];
const GHOST_NAMES = ['Ghost of Merlinus', 'The Hollow Magus', 'Sir Cinderbeard', 'Lady Frostwhisper', 'Grimlock the Grim', 'Morgrath the Pale', 'Echo of Aldric', 'Vesper the Veiled'];

/* ═══════════════ small helpers ═══════════════ */
const J = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const now = () => Date.now();
const PHT = 8 * 3600e3; // daily reset = midnight Philippine time (16:00 UTC), same as the Discord bot
const dayKey = () => new Date(now() + PHT).toISOString().slice(0, 10);
function weekInfo() { // ISO week, PHT
  const d = new Date(now() + PHT); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { key: `${y}-W${String(w).padStart(2, '0')}`, idx: (y * 53 + w) };
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg, code = 400) => { throw new HttpError(code, msg); };

const locks = new Map(); // per-user mutex so double-clicks can't double-roll
async function withLock(uid, fn) {
  while (locks.get(uid)) await locks.get(uid);
  let release; locks.set(uid, new Promise(r => (release = r)));
  try { return await fn(); } finally { locks.delete(uid); release(); }
}

/* ═══════════════ players ═══════════════ */
async function upd(table, keyCol, keyVal, fields) {
  const ks = Object.keys(fields); if (!ks.length) return;
  const vals = ks.map(k => (fields[k] !== null && typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k]));
  await db.execute(`UPDATE ${table} SET ${ks.map(k => k + '=?').join(',')} WHERE ${keyCol}=?`, [...vals, keyVal]);
}
const updPlayer = (p, f) => { Object.assign(p, f); return upd('web_players', 'user_id', p.user_id, f); };

async function loadPlayer(uid) {
  const r = (await db.execute('SELECT * FROM web_players WHERE user_id=?', [uid])).rows[0];
  if (!r) return null;
  const p = { ...r, spells_owned: J(r.spells_owned, []), spell_set: J(r.spell_set, Array(6).fill(null)), monster_spell_set: J(r.monster_spell_set, Array(6).fill(null)), items_owned: J(r.items_owned, []), daily: J(r.daily, {}) };
  if (p.day_key !== dayKey()) { // daily reset
    await updPlayer(p, { daily: { kills: {}, sessions: {}, tier: null, lottery: false }, day_key: dayKey(), arena_energy: ARENA_CAP, arena_energy_ts: now() });
  }
  p.daily.kills = p.daily.kills || {}; p.daily.sessions = p.daily.sessions || {};
  return p;
}
const ENERGY = { boss: { cap: 6, ms: 20 * 60e3 }, arena: { cap: 5, ms: 3600e3 }, dungeon: { cap: 6, ms: 20 * 60e3 }, castle: { cap: 4, ms: 3600e3 } };
const ENERGY_NAME = { boss: 'Boss', arena: 'Arena', dungeon: 'Dungeon', castle: 'Castle' };
function energy(p, kind) {
  const { cap, ms: step } = ENERGY[kind];
  let v = p[kind + '_energy'], ts = p[kind + '_energy_ts'];
  if (v >= cap) return { val: v, cap, nextIn: 0, ts: now() };
  const gained = Math.floor((now() - ts) / step);
  if (gained > 0) { v = Math.min(cap, v + gained); ts = v >= cap ? now() : ts + gained * step; }
  return { val: v, cap, nextIn: v >= cap ? 0 : Math.max(0, step - (now() - ts)), ts };
}
async function spendEnergy(p, kind) {
  const e = energy(p, kind); if (e.val < 1) bad(`No ${ENERGY_NAME[kind]} energy! It recharges +1 every ${ENERGY[kind].ms >= 3600e3 ? 'hour' : '20 minutes'}.`, 409);
  const was = e.val >= e.cap; await updPlayer(p, { [kind + '_energy']: e.val - 1, [kind + '_energy_ts']: was ? now() : e.ts });
}
function activeSet(p, which) {
  const set = which === 'arena' ? p.spell_set : p.monster_spell_set;
  return set.some(Boolean) ? set : p.spell_set;
}
const combatantFrom = (p, which) => E.playerCombatant({ display_name: p.display_name, class_name: p.class_name, gender: p.gender, level: p.level, equipped_item: p.equipped_item, spells: activeSet(p, which) });

function publicPlayer(p) {
  const st = E.computeStats(p.class_name, p.level, p.equipped_item);
  return {
    name: p.display_name, class_name: p.class_name, gender: p.gender || 'm', speedster_until: p.speedster_until || 0, level: p.level, coins: p.coins, gems: p.gems, pvp_wins: p.pvp_wins, wins_per_level: E.WINS_PER_LEVEL,
    trophies: p.trophies, arena_wins: p.arena_wins, arena_registered: !!p.arena_registered, spells_owned: p.spells_owned, spell_set: p.spell_set, monster_spell_set: p.monster_spell_set,
    items_owned: p.items_owned, equipped_item: p.equipped_item, chests: p.chests, keys: p.keys, max_hp: st.maxHp, armor: st.armor,
    daily: { kills: p.daily.kills, sessions: p.daily.sessions, tier: p.daily.tier || null, lottery: !!p.daily.lottery, boss_buys: p.daily.boss_buys || 0, arena_buys: p.daily.arena_buys || 0, pvp_tries: p.daily.pvp_tries || 0 },
    energy: { boss: pickE(energy(p, 'boss')), arena: pickE(energy(p, 'arena')), dungeon: pickE(energy(p, 'dungeon')), castle: pickE(energy(p, 'castle')) }, dungeon_best: p.dungeon_best || 0,
  };
}
const pickE = e => ({ val: e.val, cap: e.cap, nextIn: e.nextIn });

/* ═══════════════ world boss ═══════════════ */
async function ensureBoss() {
  const wk = weekInfo();
  let r = (await db.execute('SELECT * FROM web_boss WHERE id=1')).rows[0];
  if (!r || r.week_key !== wk.key) {
    const b = E.D.bosses[wk.idx % E.D.bosses.length];
    await db.execute('INSERT INTO web_boss(id,boss_name,current_hp,max_hp,week_key) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET boss_name=excluded.boss_name,current_hp=excluded.current_hp,max_hp=excluded.max_hp,week_key=excluded.week_key', [b.name, b.hp, b.hp, wk.key]);
    r = (await db.execute('SELECT * FROM web_boss WHERE id=1')).rows[0];
  }
  const def = E.D.bosses.find(b => b.name === r.boss_name);
  return { name: r.boss_name, hp: r.current_hp, max_hp: r.max_hp, week_key: r.week_key, armor: def.armor, spells: def.spells, image: def.image, def };
}

/* ═══════════════ battle orchestration ═══════════════ */
async function saveBattle(uid, S) {
  await db.execute('INSERT INTO web_battles(user_id,mode,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,state=excluded.state,updated_at=excluded.updated_at', [uid, S.mode, JSON.stringify(S), now()]);
}
async function loadBattle(uid) { const r = (await db.execute('SELECT state FROM web_battles WHERE user_id=?', [uid])).rows[0]; return r ? J(r.state, null) : null; }
const clearBattle = uid => db.execute('DELETE FROM web_battles WHERE user_id=?', [uid]);

async function levelUp(p) {
  let ups = 0, wins = p.pvp_wins, lvl = p.level;
  while (wins >= E.WINS_PER_LEVEL) { wins -= E.WINS_PER_LEVEL; lvl++; ups++; }
  if (ups) await updPlayer(p, { level: lvl, pvp_wins: wins });
  return ups ? { from: lvl - ups, to: lvl, milestone: [10, 25, 50].includes(lvl) } : null;
}

const hooks = {};
const finalizers = {}; // extra modes (dungeon, castle, ...) register here
async function finalize(p, S) {
  const sum = { mode: S.mode, result: S.result, lines: [], coins: 0, gems: 0 };
  if (finalizers[S.mode]) { await finalizers[S.mode](p, S, sum); sum.balance = { coins: p.coins, gems: p.gems, level: p.level, trophies: p.trophies }; return sum; }
  if (S.mode === 'fort') {
    const m = S.meta, earn = m.earned, mon = E.MONSTERS[m.monster];
    const daily = p.daily; daily.kills[m.monster] = (daily.kills[m.monster] || 0) + m.kills;
    await updPlayer(p, { coins: p.coins + earn.coins, gems: p.gems + earn.gems, daily });
    sum.coins = earn.coins; sum.gems = earn.gems; sum.kills = m.kills; sum.monster = m.monster;
    if (m.kills > 0 && hooks.recordBounty) await hooks.recordBounty(p, m.monster, m.kills);
    sum.lines.push(`${m.kills}× ${m.monster} slain this session.`);
    if (daily.kills[m.monster] >= mon.limit) {
      const d = E.d6(Math.random), isKey = d === 1;
      await updPlayer(p, isKey ? { keys: p.keys + 1 } : { chests: p.chests + 1 });
      sum.lottery = { dice: d, type: isKey ? 'key' : 'chest' };
      sum.lines.push(isKey ? 'Lucky roll! You found a 🗝️ Key.' : 'You found a 🧰 Chest! Find a Key to open it.');
    }
  } else if (S.mode === 'boss') {
    const dealt = Math.max(0, S.meta.startHp - Math.max(0, S.e.hp));
    const coins = Math.floor(dealt / 1000);
    const wk = S.meta.week_key;
    await db.execute('UPDATE web_boss SET current_hp = MAX(0, current_hp - ?) WHERE id=1 AND week_key=?', [dealt, wk]);
    await db.execute('INSERT INTO web_boss_damage(user_id,week_key,total_damage) VALUES(?,?,?) ON CONFLICT(user_id,week_key) DO UPDATE SET total_damage=total_damage+excluded.total_damage', [p.user_id, wk, dealt]);
    if (coins) await updPlayer(p, { coins: p.coins + coins });
    sum.damage = dealt; sum.coins = coins;
    sum.lines.push(`You dealt ${dealt.toLocaleString('en-US')} damage → ${coins} coin${coins === 1 ? '' : 's'}.`);
    const b = (await db.execute('SELECT current_hp FROM web_boss WHERE id=1 AND week_key=?', [wk])).rows[0];
    if (b && b.current_hp <= 0) { // boss slain: pay milestone bonuses to everyone who fought it
      const rows = (await db.execute('SELECT user_id,total_damage FROM web_boss_damage WHERE week_key=?', [wk])).rows;
      for (const r of rows) { const c = r.total_damage >= 10000 ? 5 : r.total_damage >= 3000 ? 3 : 0; if (c) await db.execute('UPDATE web_players SET coins=coins+? WHERE user_id=?', [c, r.user_id]); if (r.user_id === p.user_id && c) { sum.coins += c; p.coins += c; sum.lines.push(`Boss slain! Milestone bonus: +${c} coins.`); } }
      sum.bossSlain = true;
    }
  } else if (S.mode === 'arena') {
    if (S.result === 'win') {
      await updPlayer(p, { trophies: p.trophies + 10, arena_wins: p.arena_wins + 1, pvp_wins: p.pvp_wins + 1 });
      sum.trophies = +10; sum.lines.push('+10 🏆 trophies · +1 PvP win');
      sum.levelUp = await levelUp(p);
    } else {
      const t = Math.max(0, p.trophies - 5); sum.trophies = -(p.trophies - t);
      await updPlayer(p, { trophies: t }); sum.lines.push('−5 🏆 trophies');
    }
  }
  sum.balance = { coins: p.coins, gems: p.gems, level: p.level, trophies: p.trophies };
  return sum;
}

async function startBattle(p, S, events) {
  await saveBattle(p.user_id, S);
  return { events, view: E.publicView(S) };
}
async function guardNoBattle(uid) { if (await loadBattle(uid) || (hooks.inMatch && hooks.inMatch(uid))) bad('You already have a battle in progress — resume it first.', 409); }

/* ═══════════════ arena opponents ═══════════════ */
function ghostSpells(level) {
  const pool = E.D.spells.filter(s => s.lv <= Math.max(1, level + 1) && s.price > 0).sort(() => Math.random() - .5);
  const set = Array(6).fill(null), owned = pool.map(s => s.name); let i = 0;
  for (const s of pool) { if (i > 5) break; set[i] = s.name; if (E.validateSpellSet(set, owned)) set[i] = null; else i++; }
  return set;
}
async function pickOpponent(p) {
  const rows = (await db.execute('SELECT * FROM web_players WHERE arena_registered=1 AND user_id<>? ORDER BY RANDOM() LIMIT 8', [p.user_id])).rows;
  const real = rows.map(r => ({ ...r, set: J(r.spell_set, []) })).filter(r => r.set.some(Boolean));
  if (real.length && Math.random() < 0.8) {
    const r = real[0]; return { display_name: r.display_name, class_name: r.class_name, gender: r.gender || 'm', level: r.level, equipped_item: r.equipped_item, spells: r.set, ghost: false };
  }
  const cls = E.D.classes[Math.floor(Math.random() * 3)].name, lvl = Math.max(1, p.level + Math.floor(Math.random() * 3) - 1);
  const items = E.D.items.map(i => i.name);
  return { display_name: GHOST_NAMES[Math.floor(Math.random() * GHOST_NAMES.length)], class_name: cls, gender: Math.random() < .5 ? 'm' : 'f', level: lvl, equipped_item: Math.random() < .4 ? items[Math.floor(Math.random() * items.length)] : null, spells: ghostSpells(lvl), ghost: true };
}

/* ═══════════════ API routes ═══════════════ */
const routes = {};
const route = (method, p, opts, fn) => { routes[method + ' ' + p] = { auth: opts.auth !== false, fn, limit: opts.limit }; };

route('GET', '/api/captcha', { auth: false, limit: [60, 600e3] }, async () => A.makeCaptcha());

route('POST', '/api/signup', { auth: false, limit: [8, 3600e3] }, async ({ body, setCookie }) => {
  const { username, password, captchaToken, captchaAnswer } = body;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '')) bad('Username must be 3–20 letters, numbers or underscores.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) bad('Password must be 8–72 characters.');
  if (!A.verifyCaptcha(captchaToken, captchaAnswer)) bad('Captcha incorrect or expired — try the new one.', 422);
  const exists = (await db.execute('SELECT id FROM web_users WHERE username=?', [username])).rows[0];
  if (exists) bad('That wizard name is already taken.', 409);
  const r = await db.execute('INSERT INTO web_users(username,pass_hash,created_at) VALUES(?,?,?)', [username, A.hashPassword(password), now()]);
  setCookie(A.makeSession(r.lastInsertRowid));
  return { ok: true };
});

route('POST', '/api/login', { auth: false, limit: [25, 600e3] }, async ({ body, setCookie }) => {
  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') bad('Enter your wizard name and password.');
  if (!A.rateLimit('login:' + username.toLowerCase(), 8, 600e3)) bad('Too many attempts for this wizard. Wait a few minutes.', 429);
  const u = (await db.execute('SELECT id,pass_hash FROM web_users WHERE username=?', [username])).rows[0];
  const ok = A.verifyPassword(password, u ? u.pass_hash : 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
  if (!u || !ok) bad('Wrong wizard name or password.', 401);
  setCookie(A.makeSession(u.id));
  return { ok: true };
});
route('POST', '/api/logout', { auth: false }, async ({ setCookie }) => { setCookie('', true); return { ok: true }; });

route('GET', '/api/data', { auth: false }, async () => E.D);

route('GET', '/api/leaderboard', { auth: false }, async () => {
  const wk = weekInfo().key;
  const [t, l, b, dg] = await Promise.all([
    db.execute('SELECT user_id,display_name,class_name,level,trophies,arena_wins FROM web_players ORDER BY trophies DESC, arena_wins DESC LIMIT 25'),
    db.execute('SELECT user_id,display_name,class_name,level,pvp_wins FROM web_players ORDER BY level DESC, pvp_wins DESC LIMIT 25'),
    db.execute('SELECT p.user_id,p.display_name,p.class_name,d.total_damage FROM web_boss_damage d JOIN web_players p ON p.user_id=d.user_id WHERE d.week_key=? ORDER BY d.total_damage DESC LIMIT 25', [wk]),
    db.execute('SELECT user_id,display_name,class_name,level,dungeon_best FROM web_players WHERE dungeon_best>0 ORDER BY dungeon_best DESC LIMIT 25'),
  ]);
  return { trophies: t.rows, levels: l.rows, boss: b.rows, dungeon: dg.rows };
});

route('GET', '/api/me', {}, async ({ uid }) => {
  const u = (await db.execute('SELECT username FROM web_users WHERE id=?', [uid])).rows[0];
  const p = await loadPlayer(uid);
  const battle = await loadBattle(uid);
  const boss = await ensureBoss();
  const top = (await db.execute('SELECT p.display_name,d.total_damage FROM web_boss_damage d JOIN web_players p ON p.user_id=d.user_id WHERE d.week_key=? ORDER BY d.total_damage DESC LIMIT 5', [boss.week_key])).rows;
  const mine = p ? (await db.execute('SELECT total_damage FROM web_boss_damage WHERE user_id=? AND week_key=?', [uid, boss.week_key])).rows[0] : null;
  return {
    username: u && u.username, player: p ? publicPlayer(p) : null, battle: battle ? { mode: battle.mode } : null,
    boss: { name: boss.name, hp: boss.hp, max_hp: boss.max_hp, armor: boss.armor, spells: boss.spells, image: boss.image, top, mine: mine ? mine.total_damage : 0 },
    resetAt: (Math.floor((now() + PHT) / 86400000) + 1) * 86400000 - PHT,
  };
});

route('POST', '/api/onboard', {}, async ({ uid, body }) => {
  if (await loadPlayer(uid)) bad('You already have a wizard.', 409);
  const cls = body.class_name; if (!E.CLASSES[cls]) bad('Choose a class.');
  const gender = body.gender === 'f' ? 'f' : 'm';
  const u = (await db.execute('SELECT username FROM web_users WHERE id=?', [uid])).rows[0];
  const set = [...STARTERS, null, null, null];
  await db.execute(`INSERT INTO web_players(user_id,display_name,class_name,gender,spells_owned,spell_set,monster_spell_set,daily,day_key,arena_energy_ts,boss_energy_ts,created_at,speedster_until,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uid, u.username, cls, gender, JSON.stringify(STARTERS), JSON.stringify(set), JSON.stringify(set), JSON.stringify({ kills: {}, sessions: {}, tier: null, lottery: false }), dayKey(), now(), now(), now(), now() + 7 * 86400e3, now()]);
  return { ok: true };
});

/* ── shop ── */
route('POST', '/api/shop/spell', {}, async ({ uid, body }) => withLock(uid, async () => {
  const p = await need(uid), s = E.SPELLS[body.spell];
  if (!s) bad('Unknown spell.');
  if (p.spells_owned.includes(s.name)) bad('You already own this spell.', 409);
  if (p.level < s.lv) bad(`Requires level ${s.lv}.`, 403);
  if (p.coins < s.price) bad(`Not enough coins (${s.price} needed).`, 402);
  await updPlayer(p, { coins: p.coins - s.price, spells_owned: [...p.spells_owned, s.name] });
  return { ok: true, player: publicPlayer(p) };
}));
route('POST', '/api/shop/item', {}, async ({ uid, body }) => withLock(uid, async () => {
  const p = await need(uid), it = E.ITEMS[body.item];
  if (!it) bad('Unknown item.');
  if (p.items_owned.includes(it.name)) bad('You already own this item.', 409);
  if (p.gems < it.price) bad(`Not enough gems (${it.price} needed).`, 402);
  await updPlayer(p, { gems: p.gems - it.price, items_owned: [...p.items_owned, it.name] });
  return { ok: true, player: publicPlayer(p) };
}));
route('POST', '/api/equip', {}, async ({ uid, body }) => withLock(uid, async () => {
  const p = await need(uid); await guardNoBattle(uid);
  if (body.item !== null && !p.items_owned.includes(body.item)) bad("You don't own that item.", 403);
  await updPlayer(p, { equipped_item: body.item || null });
  return { ok: true, player: publicPlayer(p) };
}));
route('POST', '/api/loadout', {}, async ({ uid, body }) => withLock(uid, async () => {
  const p = await need(uid); await guardNoBattle(uid);
  const which = body.which === 'monster' ? 'monster_spell_set' : 'spell_set';
  const slots = (body.slots || []).map(s => s || null);
  const err = E.validateSpellSet(slots, p.spells_owned); if (err) bad(err);
  await updPlayer(p, { [which]: slots });
  return { ok: true, player: publicPlayer(p) };
}));

/* ── daily lottery & chests ── */
route('POST', '/api/lottery', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid); if (p.daily.lottery) bad('You already rolled today. Resets at midnight (PHT).', 409);
  const dice = E.d6(Math.random), reward = LOTTERY[dice];
  p.daily.lottery = true; await updPlayer(p, { coins: p.coins + reward, daily: p.daily });
  return { dice, reward, player: publicPlayer(p) };
}));
route('POST', '/api/chest', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid); if (p.chests < 1) bad('You have no chests.', 409); if (p.keys < 1) bad('You need a Key to open a chest.', 409);
  const dice = E.d6(Math.random), [c, g] = CHEST[dice];
  await updPlayer(p, { chests: p.chests - 1, keys: p.keys - 1, coins: p.coins + c, gems: p.gems + g });
  return { dice, coins: c, gems: g, player: publicPlayer(p) };
}));

/* ── premium shop (gems) ── */
const DAY_CAP = 10, SPEEDSTER_MS = 7 * 86400e3;
route('POST', '/api/premium/speedster', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid); if (p.gems < 1) bad('You need 1 gem.', 402);
  const until = Math.max(now(), p.speedster_until || 0) + SPEEDSTER_MS;
  await updPlayer(p, { gems: p.gems - 1, speedster_until: until });
  return { ok: true, player: publicPlayer(p) };
}));
const buyEnergy = (kind, field) => async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid), bought = p.daily[field] || 0;
  if (bought >= DAY_CAP) bad(`Daily limit reached (${DAY_CAP}/day). Resets at midnight PHT.`, 409);
  if (p.gems < 1) bad('You need 1 gem.', 402);
  const e = energy(p, kind); p.daily[field] = bought + 1;
  await updPlayer(p, { gems: p.gems - 1, [kind + '_energy']: e.val + 1, [kind + '_energy_ts']: e.val >= e.cap ? now() : e.ts, daily: p.daily });
  return { ok: true, player: publicPlayer(p) };
});
route('POST', '/api/premium/boss-energy', {}, buyEnergy('boss', 'boss_buys'));
route('POST', '/api/premium/arena-energy', {}, buyEnergy('arena', 'arena_buys'));

/* ── battles ── */
async function need(uid) { const p = await loadPlayer(uid); if (!p) bad('Create your wizard first.', 409); return p; }

route('POST', '/api/fort/start', {}, async ({ uid, body }) => withLock(uid, async () => {
  const p = await need(uid); await guardNoBattle(uid);
  const { tier, monster } = body;
  if (!E.D.tiers[tier] || !E.D.tiers[tier].includes(monster)) bad('Unknown fort or monster.');
  if (p.daily.tier && p.daily.tier !== tier) bad(`You already chose the ${p.daily.tier} tier fort today.`, 409);
  if (p.daily.sessions[monster]) bad(`You already fought ${monster} today.`, 409);
  const m = E.MONSTERS[monster]; if ((p.daily.kills[monster] || 0) >= m.limit) bad('Daily kill limit reached for this monster.', 409);
  p.daily.tier = tier; p.daily.sessions[monster] = true; await updPlayer(p, { daily: p.daily });
  const S = E.newFight('fort', combatantFrom(p, 'monster'), E.monsterCombatant(monster), { monster, tier, kills: 0, limit: m.limit, earned: { coins: 0, gems: 0 }, reward: m.reward });
  return startBattle(p, S, E.start(S, Math.random));
}));

route('POST', '/api/boss/start', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid); await guardNoBattle(uid);
  const boss = await ensureBoss(); if (boss.hp <= 0) bad('The boss has already been slain this week! A new one arrives Monday.', 409);
  await spendEnergy(p, 'boss');
  const S = E.newFight('boss', combatantFrom(p, 'monster'), E.bossCombatant(boss.def, boss.hp), { startHp: boss.hp, week_key: boss.week_key });
  return startBattle(p, S, E.start(S, Math.random));
}));

route('POST', '/api/arena/join', {}, async ({ uid }) => withLock(uid, async () => { const p = await need(uid); await updPlayer(p, { arena_registered: 1 }); return { ok: true, player: publicPlayer(p) }; }));
route('POST', '/api/arena/start', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid); await guardNoBattle(uid);
  if (!p.arena_registered) bad('Join the Arena season first.', 409);
  if (!p.spell_set.some(Boolean)) bad('Equip at least one spell in your Arena set.', 409);
  await spendEnergy(p, 'arena');
  const o = await pickOpponent(p);
  const S = E.newFight('arena', combatantFrom(p, 'arena'), E.arenaCombatant(o), { ghost: o.ghost });
  return startBattle(p, S, E.start(S, Math.random));
}));

route('GET', '/api/battle', {}, async ({ uid }) => {
  const S = await loadBattle(uid); if (!S) return { battle: null };
  return { battle: E.publicView(S) };
});

async function conclude(p, S) {
  const summary = await finalize(p, S); await clearBattle(p.user_id);
  return { summary, player: publicPlayer(p) };
}
route('POST', '/api/battle/roll', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid), S = await loadBattle(uid); if (!S) bad('No active battle.', 404);
  const events = E.playerRoll(S, Math.random);
  const out = { events, view: E.publicView(S) };
  if (S.over) Object.assign(out, await conclude(p, S)); else await saveBattle(uid, S);
  return out;
}));
route('POST', '/api/battle/retreat', {}, async ({ uid }) => withLock(uid, async () => {
  const p = await need(uid), S = await loadBattle(uid); if (!S) bad('No active battle.', 404);
  const events = E.retreat(S); const out = { events, view: E.publicView(S) };
  if (S.mode === 'arena' || S.mode === 'castle') { S.result = 'lose'; events[0].result = 'lose'; events[0].text = '🏳️ You fled the arena (counts as a loss).'; }
  Object.assign(out, await conclude(p, S)); return out;
}));

/* ═══════════════ HTTP plumbing ═══════════════ */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain' };
const fileCache = new Map();
function staticFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]); if (rel === '/' || !rel) rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) return null;
  let c = fileCache.get(full);
  if (!c) {
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
    const buf = fs.readFileSync(full), ext = path.extname(full);
    c = { buf, gz: /\.(html|js|css|svg|json)$/.test(ext) ? zlib.gzipSync(buf) : null, type: MIME[ext] || 'application/octet-stream', html: ext === '.html' };
    fileCache.set(full, c);
  }
  return c;
}
const ip = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const secure = req => req.headers['x-forwarded-proto'] === 'https';

function secHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://i.imgur.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (secure(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}
function send(res, code, obj, extra = {}) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(b); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 16384) { reject(new HttpError(413, 'Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    secHeaders(res, req);
    const url = req.url.split('?')[0];
    if (url === '/health' || url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? undefined : 'ok'); }
    if (url === '/health/db') { await db.execute('SELECT 1'); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(req.method === 'HEAD' ? undefined : 'db ok'); }

    if (url.startsWith('/api/')) {
      const r = routes[req.method + ' ' + url];
      if (!r) return send(res, 404, { error: 'Not found' });
      if (!A.rateLimit('api:' + ip(req), 400, 60e3)) return send(res, 429, { error: 'Slow down, traveler.' });
      if (r.limit && !A.rateLimit(`${url}:${ip(req)}`, r.limit[0], r.limit[1])) return send(res, 429, { error: 'Too many requests — try again later.' });
      if (req.method === 'POST') {
        const origin = req.headers.origin; let oh = null; try { oh = origin ? new URL(origin).host : null; } catch { oh = 'invalid'; } if (origin && oh !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
        if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON only' });
      }
      const uid = A.readSession(req.headers.cookie);
      if (r.auth && !uid) return send(res, 401, { error: 'Please log in.' });
      if (uid && hooks.touch) hooks.touch(uid);
      let cookie = null;
      const body = req.method === 'POST' ? await readBody(req) : {};
      const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const out = await r.fn({ uid, body, query, setCookie: (v, clear) => { cookie = A.cookieHeader(v, secure(req), clear); } });
      return send(res, 200, out, cookie ? { 'Set-Cookie': cookie } : {});
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const f = staticFile(url);
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const h = { 'Content-Type': f.type, 'Cache-Control': f.html ? 'no-cache' : 'public, max-age=3600', Vary: 'Accept-Encoding' };
    const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gz) h['Content-Encoding'] = 'gzip';
    res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : gz ? f.gz : f.buf);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error('❌', req.method, req.url, e);
    send(res, 500, { error: 'The magic fizzled — something went wrong on the server.' });
  }
});

DB.init().then(async d => {
  db = d; await ensureBoss();
  const CTX = { route, bad, need, withLock, updPlayer, publicPlayer, loadPlayer, energy, spendEnergy, startBattle, loadBattle, saveBattle, guardNoBattle, levelUp, finalizers, hooks, E, db, dayKey, now, J, weekInfo, PHT, HttpError, ARENA_CAP: 5 };
  require('./lib/features')(CTX); require('./lib/social')(CTX);
  server.listen(PORT, '0.0.0.0', () => console.log(`🧙 Wizard Battle listening on :${PORT}`));
}).catch(e => { console.error('Startup failed:', e); process.exit(1); });

module.exports = { server }; // for tests
