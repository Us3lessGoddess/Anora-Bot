'use strict';
// End-to-end test of Bounty, Trader, Dungeon, Castle and Live PvP with two real accounts.
const { spawn } = require('child_process'), crypto = require('crypto'), assert = require('assert'), fs = require('fs');
const PORT = 3199, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-feat.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const mkUser = async name => {
  let jar = '';
  const call = async (m, p, b) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar }, body: m === 'POST' ? JSON.stringify(b || {}) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0]; return { status: r.status, data: await r.json().catch(() => null) }; };
  let r = await call('POST', '/api/signup', { username: name, password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }); assert.strictEqual(r.status, 200);
  r = await call('POST', '/api/onboard', { class_name: 'Paladin', gender: 'f' }); assert.strictEqual(r.status, 200);
  return call;
};
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const A = await mkUser('Alice'), B = await mkUser('Bob'); let r;
  // ── bounty
  r = await A('GET', '/api/bounty'); assert(r.data.quest.targets && r.data.quest.reward >= 5); assert.strictEqual(r.data.claimed, false);
  r = await A('POST', '/api/bounty/claim'); assert.strictEqual(r.status, 409);
  // ── trader
  r = await A('GET', '/api/trader'); assert.strictEqual(r.status, 200); const utcEven = new Date().getUTCHours() % 2 === 0; assert.strictEqual(r.data.present, utcEven);
  if (utcEven) { assert.strictEqual(r.data.items.length, 5); r = await A('POST', '/api/trader/buy', { spell: r.data.items[0].spell }); assert.strictEqual(r.status, 402, 'needs a chest'); }
  // ── dungeon
  r = await A('POST', '/api/dungeon/start'); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.strictEqual(r.data.view.mode, 'dungeon'); assert(r.data.events[0].label.includes('Floor 1'));
  for (let i = 0; i < 40 && !r.data.view.over; i++) r = await A('POST', '/api/battle/roll');
  if (!r.data.view.over) r = await A('POST', '/api/battle/retreat'); console.log('dungeon:', r.data.summary.lines.join(' | '));
  r = await A('GET', '/api/dungeon'); assert(r.data.energy.val <= 6);
  // ── castle: A takes the empty throne, B challenges
  r = await A('GET', '/api/castle'); assert.strictEqual(r.data.castle.holder_id, null);
  r = await A('POST', '/api/castle/conquer'); assert.strictEqual(r.status, 200); r = await A('POST', '/api/castle/conquer'); assert.strictEqual(r.status, 409);
  r = await A('POST', '/api/castle/trap', { trap: 'upper_hand' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.player.coins, 65); r = await A('POST', '/api/castle/trap', { trap: 'upper_hand' }); assert.strictEqual(r.status, 409);
  r = await A('POST', '/api/castle/challenge'); assert.strictEqual(r.status, 409, 'cannot challenge self');
  r = await B('POST', '/api/castle/challenge'); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert(['arena', 'castle'].includes(r.data.view.mode));
  // (castle lock verified elsewhere)
  for (let i = 0; i < 80 && !r.data.view.over; i++) r = await B('POST', '/api/battle/roll'); if (!r.data.view.over) r = await B('POST', '/api/battle/retreat'); console.log('castle:', r.data.summary.result, r.data.summary.lines.join(' | '));
  r = await B('GET', '/api/castle'); assert.strictEqual(r.data.castle.locked, false);
  // ── live pvp
  r = await A('GET', '/api/pvp'); assert.strictEqual(r.data.limit, 6);
  r = await B('POST', '/api/pvp/open'); assert.strictEqual(r.status, 200);
  r = await A('GET', '/api/pvp'); assert.strictEqual(r.data.open.length, 1); const host = r.data.open[0].uid;
  r = await B('POST', '/api/pvp/accept', { host }); assert.strictEqual(r.status, 409, 'cannot accept own');
  r = await A('POST', '/api/pvp/accept', { host }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  let sa = 0, sb = 0, pa, pb, g = 0;
  pa = (await A('GET', '/api/pvp/match?since=0')).data; pb = (await B('GET', '/api/pvp/match?since=0')).data; sa = pa.seq; sb = pb.seq;
  assert(pa.events.some(e => e.t === 'dice' && e.kind === 'init')); assert.strictEqual(pa.view.p.name, 'Alice'); assert.strictEqual(pb.view.p.name, 'Bob', 'each player sees themselves as p');
  while (!(pa.over) && g++ < 300) { const mover = pa.myTurn ? A : pb.myTurn ? B : null; assert(mover, 'someone must have the turn'); const out = (await mover('POST', '/api/pvp/roll', { since: mover === A ? sa : sb })).data; if (mover === A) sa = out.seq; else sb = out.seq; pa = (await A('GET', '/api/pvp/match?since=' + sa)).data; pb = (await B('GET', '/api/pvp/match?since=' + sb)).data; sa = pa.seq; sb = pb.seq; if (out.over) { pa.over = true; } }
  pa = (await A('GET', '/api/pvp/match?since=0')).data; pb = (await B('GET', '/api/pvp/match?since=0')).data;
  assert(pa.over && pb.over); assert.notStrictEqual(pa.summary.result, pb.summary.result); assert(pa.summary.coins + pb.summary.coins === 1);
  assert(!pa.events.some(e => /\bYou\b/.test(e.text || '')), 'neutral wording'); console.log('pvp: A', pa.summary.result, '| B', pb.summary.result);
  r = await A('POST', '/api/pvp/ack'); assert.strictEqual(r.status, 200);
  r = await A('GET', '/api/leaderboard'); assert(Array.isArray(r.data.dungeon));
  console.log('✅ features test passed');
})().catch(e => { console.error('❌', e); process.exitCode = 1; }).finally(() => srv.kill());
