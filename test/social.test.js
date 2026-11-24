'use strict';
const { spawn } = require('child_process'), crypto = require('crypto'), assert = require('assert'), fs = require('fs');
const PORT = 3244, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-soc.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const mkUser = async name => {
  let jar = ''; const call = async (m, p, b) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar }, body: m === 'POST' ? JSON.stringify(b || {}) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0]; return { status: r.status, data: await r.json().catch(() => null) }; };
  await call('POST', '/api/signup', { username: name, password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }); await call('POST', '/api/onboard', { class_name: 'Paladin', gender: 'm' }); return call;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const A = await mkUser('Alice'), B = await mkUser('Bob'); let r;
  // welcome gift
  r = await A('GET', '/api/me'); assert(r.data.player.speedster_until > Date.now() + 6.9 * 86400e3, 'new players get a week of Speedster');
  // presence
  r = await A('GET', '/api/online'); assert(r.data.online >= 2); assert(r.data.players.some(p => p.name === 'Bob' && p.online));
  // chat rules
  r = await A('POST', '/api/chat/send', { text: 'Hello world!' }); assert.strictEqual(r.status, 200);
  r = await A('POST', '/api/chat/send', { text: 'too fast' }); assert.strictEqual(r.status, 429); await sleep(2600);
  r = await A('POST', '/api/chat/send', { text: Array.from({ length: 101 }, (_, i) => 'word' + i).join(' ') }); assert.strictEqual(r.status, 422, '101 words rejected'); await sleep(2600);
  r = await A('POST', '/api/chat/send', { text: Array.from({ length: 100 }, (_, i) => 'word' + i).join(' ') }); assert.strictEqual(r.status, 200, 'exactly 100 words ok'); await sleep(2600);
  r = await A('POST', '/api/chat/send', { text: 'buy gold at www.spam.com' }); assert.strictEqual(r.status, 422); await sleep(2600);
  r = await A('POST', '/api/chat/send', { text: 'aaaaaaaaaaaaaaaa' }); assert.strictEqual(r.status, 422); await sleep(2600);
  r = await B('POST', '/api/chat/send', { text: 'THIS IS ALL CAPS AND VERY LOUD' }); assert.strictEqual(r.status, 422); await sleep(2600);
  r = await B('POST', '/api/chat/send', { text: 'Hi Alice' }); assert.strictEqual(r.status, 200); await sleep(2600);
  r = await B('POST', '/api/chat/send', { text: 'hi alice' }); assert.strictEqual(r.status, 422, 'duplicate rejected');
  r = await A('GET', '/api/live?w=0'); assert(r.data.world.length >= 3); assert(r.data.world.some(m => m.name === 'Bob'));
  // PM
  const bobId = (await A('GET', '/api/online')).data.players.find(p => p.name === 'Bob').uid, aliceId = (await B('GET', '/api/online')).data.players.find(p => p.name === 'Alice').uid;
  r = await A('POST', '/api/pm/send', { to: bobId, text: 'psst, want to duel?' }); assert.strictEqual(r.status, 200);
  r = await A('POST', '/api/pm/send', { to: aliceId, text: 'self' }); assert.strictEqual(r.status, 400);
  r = await B('GET', '/api/live'); assert.strictEqual(r.data.pmUnread, 1);
  r = await B('GET', '/api/pm/threads'); assert.strictEqual(r.data.threads[0].unread, 1); assert.strictEqual(r.data.threads[0].name, 'Alice');
  r = await B('GET', `/api/pm/thread?with=${aliceId}`); assert.strictEqual(r.data.messages.length, 1); assert.strictEqual(r.data.messages[0].mine, false);
  r = await B('GET', '/api/live'); assert.strictEqual(r.data.pmUnread, 0, 'reading marks as read');
  // profile + direct challenge
  r = await A('GET', `/api/player?uid=${bobId}`); assert.strictEqual(r.data.name, 'Bob'); assert.strictEqual(r.data.canChallenge, true, JSON.stringify(r.data));
  r = await A('GET', `/api/player?uid=${aliceId}`); assert.strictEqual(r.data.canChallenge, false);
  r = await A('POST', '/api/pvp/challenge', { to: bobId }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await B('GET', '/api/live'); assert.strictEqual(r.data.invites.length, 1); assert.strictEqual(r.data.invites[0].name, 'Alice');
  r = await A('GET', '/api/live'); assert.strictEqual(r.data.sent.length, 1);
  r = await B('POST', '/api/pvp/respond', { from: aliceId, accept: true }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await A('GET', '/api/live'); assert(r.data.match && !r.data.match.over, 'challenger sees the started match');
  r = await A('GET', '/api/pvp/match?since=0'); assert.strictEqual(r.status, 200);
  // energy rule: after using all 6 daily battles the profile button is disabled
  r = await B('GET', `/api/player?uid=${aliceId}`); assert.strictEqual(r.data.pvp_left, 5);
  console.log('✅ social test passed');
})().catch(e => { console.error('❌', e); process.exitCode = 1; }).finally(() => srv.kill());
