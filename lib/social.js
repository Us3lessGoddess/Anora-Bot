'use strict';
/* Wizard Battle — social layer: world chat, private messages, presence ("online players"), public profiles. */
module.exports = function install(C) {
  const { route, bad, need, db, now, dayKey, J, E, hooks } = C;

  /* ═══════════ presence ═══════════ */
  const SEEN = new Map(), DBSEEN = new Map(); // uid -> last activity (ms)
  const ONLINE_MS = 5 * 60e3, HOUR = 3600e3;
  hooks.touch = uid => {
    const n = now(); SEEN.set(uid, n);
    if (n - (DBSEEN.get(uid) || 0) > 120e3) { DBSEEN.set(uid, n); db.execute('UPDATE web_players SET last_seen=? WHERE user_id=?', [n, uid]).catch(() => { }); }
  };
  hooks.seenWithin = (uid, ms) => now() - (SEEN.get(uid) || 0) < ms;
  const onlineCount = () => { const n = now(); let c = 0; for (const t of SEEN.values()) if (n - t < ONLINE_MS) c++; return c; };
  setInterval(() => { const n = now(); for (const [u, t] of SEEN) if (n - t > 2 * HOUR) { SEEN.delete(u); DBSEEN.delete(u); } }, 600e3).unref();

  route('GET', '/api/online', {}, async ({ uid }) => {
    const rows = (await db.execute('SELECT user_id,display_name,class_name,gender,level,last_seen FROM web_players WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 150', [now() - HOUR])).rows, n = now();
    const list = rows.map(r => { const t = Math.max(r.last_seen, SEEN.get(r.user_id) || 0); return { uid: r.user_id, name: r.display_name, cls: r.class_name, gender: r.gender, level: r.level, ago: n - t, online: n - t < ONLINE_MS }; })
      .filter(p => p.ago < HOUR).sort((a, b) => a.ago - b.ago);
    return { online: onlineCount(), players: list, me: uid };
  });

  /* ═══════════ public profile ═══════════ */
  route('GET', '/api/player', {}, async ({ uid, query }) => {
    const id = Number(query.uid); if (!id) bad('Unknown player.', 404);
    const r = (await db.execute('SELECT * FROM web_players WHERE user_id=?', [id])).rows[0]; if (!r) bad('Unknown player.', 404);
    const mine = id === uid, daily = J(r.daily, {}), theirTries = r.day_key === dayKey() ? (daily.pvp_tries || 0) : 0;
    const me = mine ? null : (await db.execute('SELECT daily,day_key,spell_set FROM web_players WHERE user_id=?', [uid])).rows[0];
    const myTries = me ? (me.day_key === dayKey() ? (J(me.daily, {}).pvp_tries || 0) : 0) : 0;
    const seen = Math.max(r.last_seen, SEEN.get(id) || 0), st = E.computeStats(r.class_name, r.level, r.equipped_item);
    const blocker = mine ? 'This is you.' : myTries >= 6 ? 'You have no Live PvP battles left today.' : theirTries >= 6 ? 'They have no Live PvP battles left today.'
      : !J(r.spell_set, []).some(Boolean) ? 'They have no Arena spells equipped.' : !me || !J(me.spell_set, []).some(Boolean) ? 'Equip Arena spells first.' : now() - seen > 10 * 60e3 ? 'They are offline right now.' : null;
    return { uid: id, name: r.display_name, cls: r.class_name, gender: r.gender, level: r.level, trophies: r.trophies, arena_wins: r.arena_wins, dungeon_best: r.dungeon_best || 0, spells: J(r.spells_owned, []).length, item: r.equipped_item, max_hp: st.maxHp, armor: st.armor,
      online: now() - seen < ONLINE_MS, ago: now() - seen, mine, pvp_left: Math.max(0, 6 - theirTries), my_pvp_left: Math.max(0, 6 - myTries), canChallenge: !blocker, blocker };
  });

  /* ═══════════ message hygiene ═══════════ */
  const GAP_MS = 2500, PER_MIN = 10, MAX_WORDS = 100, MAX_CHARS = 700;
  const lastMsg = new Map(), recent = new Map(), strikes = new Map(), muted = new Map();
  function cleanMsg(uid, raw) {
    const n = now(); if ((muted.get(uid) || 0) > n) bad(`You are muted for spamming — try again in ${Math.ceil((muted.get(uid) - n) / 1000)}s.`, 429);
    const strike = msg => { const a = (strikes.get(uid) || []).filter(t => n - t < 120e3); a.push(n); strikes.set(uid, a); if (a.length >= 4) { muted.set(uid, n + 60e3); strikes.delete(uid); bad('Too many rejected messages — chat muted for 60 seconds.', 429); } bad(msg, 422); };
    const text = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) bad('Write something first.');
    if (text.split(' ').length > MAX_WORDS) strike(`Messages are limited to ${MAX_WORDS} words.`);
    if (text.length > MAX_CHARS) strike(`Messages are limited to ${MAX_CHARS} characters.`);
    if (/(.)\1{9,}/u.test(text) || /(\b\S{1,12}\b)(\s+\1){4,}/i.test(text)) strike('That looks like spam (too much repetition).');
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gg|io|xyz|ru|me|co|ly|tk)\b|discord\.gg/i.test(text)) strike('Links are not allowed in chat.');
    const letters = text.replace(/[^A-Za-z]/g, ''); if (letters.length > 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > .7) strike('Please do not SHOUT.');
    const last = lastMsg.get(uid); if (last && n - last.t < GAP_MS) bad('Slow down a little.', 429);
    if (last && last.text.toLowerCase() === text.toLowerCase() && n - last.t < 60e3) strike("You've just said that.");
    const r = (recent.get(uid) || []).filter(t => n - t < 60e3); if (r.length >= PER_MIN) bad('You are sending messages too fast.', 429);
    r.push(n); recent.set(uid, r); lastMsg.set(uid, { text, t: n }); return text;
  }

  /* ═══════════ world chat ═══════════ */
  route('POST', '/api/chat/send', {}, async ({ uid, body }) => {
    const p = await need(uid), text = cleanMsg(uid, body.text);
    const r = await db.execute('INSERT INTO web_chat(user_id,name,text,ts) VALUES(?,?,?,?)', [uid, p.display_name, text, now()]);
    if (Math.random() < .05) db.execute('DELETE FROM web_chat WHERE id < (SELECT MAX(id) - 300 FROM web_chat)').catch(() => { });
    return { ok: true, id: r.lastInsertRowid };
  });
  const worldSince = async since => (since > 0
    ? (await db.execute('SELECT id,user_id,name,text,ts FROM web_chat WHERE id>? ORDER BY id ASC LIMIT 80', [since])).rows
    : (await db.execute('SELECT id,user_id,name,text,ts FROM (SELECT id,user_id,name,text,ts FROM web_chat ORDER BY id DESC LIMIT 40) ORDER BY id ASC')).rows);

  /* ═══════════ private messages ═══════════ */
  route('POST', '/api/pm/send', {}, async ({ uid, body }) => {
    const p = await need(uid), to = Number(body.to); if (!to || to === uid) bad('Pick someone else to message.');
    const t = (await db.execute('SELECT display_name FROM web_players WHERE user_id=?', [to])).rows[0]; if (!t) bad('That player does not exist.', 404);
    const text = cleanMsg(uid, body.text);
    const r = await db.execute('INSERT INTO web_pm(from_id,to_id,text,ts) VALUES(?,?,?,?)', [uid, to, text, now()]);
    return { ok: true, id: r.lastInsertRowid, name: p.display_name };
  });
  route('GET', '/api/pm/threads', {}, async ({ uid }) => {
    const rows = (await db.execute(`SELECT m.id,m.from_id,m.to_id,m.text,m.ts,m.read FROM web_pm m WHERE m.id IN (SELECT MAX(id) FROM web_pm WHERE from_id=? OR to_id=? GROUP BY CASE WHEN from_id=? THEN to_id ELSE from_id END) ORDER BY m.id DESC LIMIT 40`, [uid, uid, uid])).rows;
    const ids = [...new Set(rows.map(r => (r.from_id === uid ? r.to_id : r.from_id)))], info = {};
    if (ids.length) for (const r of (await db.execute(`SELECT user_id,display_name,class_name,gender,level FROM web_players WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids)).rows) info[r.user_id] = r;
    const unread = Object.fromEntries((await db.execute('SELECT from_id,COUNT(*) n FROM web_pm WHERE to_id=? AND read=0 GROUP BY from_id', [uid])).rows.map(r => [r.from_id, Number(r.n)]));
    return { threads: rows.map(r => { const o = r.from_id === uid ? r.to_id : r.from_id, i = info[o] || {}; return { uid: o, name: i.display_name || 'Unknown', cls: i.class_name, gender: i.gender, level: i.level, last: r.text, mine: r.from_id === uid, ts: r.ts, unread: unread[o] || 0, online: now() - (SEEN.get(o) || 0) < ONLINE_MS }; }) };
  });
  route('GET', '/api/pm/thread', {}, async ({ uid, query }) => {
    const other = Number(query.with), since = Number(query.since) || 0; if (!other) bad('Pick a player.');
    const o = (await db.execute('SELECT user_id,display_name,class_name,gender,level FROM web_players WHERE user_id=?', [other])).rows[0]; if (!o) bad('That player does not exist.', 404);
    const msgs = since > 0
      ? (await db.execute('SELECT id,from_id,text,ts FROM web_pm WHERE id>? AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) ORDER BY id ASC LIMIT 100', [since, uid, other, other, uid])).rows
      : (await db.execute('SELECT id,from_id,text,ts FROM (SELECT id,from_id,text,ts FROM web_pm WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 60) ORDER BY id ASC', [uid, other, other, uid])).rows;
    await db.execute('UPDATE web_pm SET read=1 WHERE to_id=? AND from_id=? AND read=0', [uid, other]);
    return { with: { uid: o.user_id, name: o.display_name, cls: o.class_name, gender: o.gender, level: o.level, online: now() - (SEEN.get(other) || 0) < ONLINE_MS }, messages: msgs.map(m => ({ id: m.id, mine: m.from_id === uid, text: m.text, ts: m.ts })) };
  });

  /* ═══════════ one cheap poll for everything live ═══════════ */
  route('GET', '/api/live', {}, async ({ uid, query }) => {
    const w = Number(query.w) || 0;
    const [world, pm] = await Promise.all([worldSince(w), db.execute('SELECT COUNT(*) n FROM web_pm WHERE to_id=? AND read=0', [uid])]);
    const names = {}; const ids = [...new Set((hooks.pvpNotify(uid).invites || []).map(i => i.from))];
    if (ids.length) for (const r of (await db.execute(`SELECT user_id,display_name,class_name,gender,level FROM web_players WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids)).rows) names[r.user_id] = r;
    const pv = hooks.pvpNotify(uid);
    return { online: onlineCount(), world: world.map(m => ({ id: m.id, uid: m.user_id, name: m.name, text: m.text, ts: m.ts })), pmUnread: Number(pm.rows[0].n) || 0, invites: pv.invites.map(i => ({ ...i, name: (names[i.from] || {}).display_name, cls: (names[i.from] || {}).class_name, level: (names[i.from] || {}).level })), sent: pv.sent, match: pv.match };
  });
};
