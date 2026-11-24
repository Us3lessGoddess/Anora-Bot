'use strict';
// End-to-end smoke test against a real server process + local sqlite (no Turso needed).
const { spawn } = require('child_process'), crypto = require('crypto'), assert = require('assert'), fs = require('fs');
const PORT = 3111, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-smoke.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
let jar = '';
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const captchaFor = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const call = async (m, p, b) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null), text: null };
};
(async () => {
  await new Promise(r => srv.stdout.on('data', d => { process.stdout.write(d); if (String(d).includes('listening')) r(); }));
  let r = await fetch(`http://127.0.0.1:${PORT}/health`); assert.strictEqual(await r.text(), 'ok');
  r = await call('GET', '/api/captcha'); assert(r.data.svg.includes('<svg') && r.data.token); console.log('captcha svg ok, bytes:', r.data.svg.length);
  // wrong captcha rejected
  r = await call('POST', '/api/signup', { username: 'Merlin', password: 'hunter2hunter2', captchaToken: captchaFor('ABCDE'), captchaAnswer: 'WRONG' }); assert.strictEqual(r.status, 422);
  const tok = captchaFor('K7QWZ');
  r = await call('POST', '/api/signup', { username: 'Merlin', password: 'hunter2hunter2', captchaToken: tok, captchaAnswer: 'k7qwz' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await call('POST', '/api/signup', { username: 'Merlin2', password: 'hunter2hunter2', captchaToken: tok, captchaAnswer: 'K7QWZ' }); assert.strictEqual(r.status, 422, 'captcha must be single use');
  r = await call('GET', '/api/me'); assert.strictEqual(r.data.player, null);
  r = await call('POST', '/api/onboard', { class_name: 'Paladin', gender: 'f' }); assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/me'); let P = r.data.player; assert.strictEqual(P.max_hp, 265); assert.strictEqual(P.coins, 70);
  // shop: level 1 spell, price 25
  r = await call('POST', '/api/shop/spell', { spell: 'Ice Arrow' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.player.coins, 45);
  r = await call('POST', '/api/shop/spell', { spell: 'Solarbeam' }); assert.strictEqual(r.status, 403);
  r = await call('POST', '/api/loadout', { which: 'monster', slots: ['Punch Spell', 'Weak Poison', 'Cut', 'Ice Arrow', null, null] }); assert.strictEqual(r.status, 200);
  r = await call('POST', '/api/lottery'); assert.strictEqual(r.status, 200); r = await call('POST', '/api/lottery'); assert.strictEqual(r.status, 409);
  // fort battle
  r = await call('POST', '/api/fort/start', { tier: 'low', monster: 'Swordsman' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert(r.data.view.e.name === 'Swordsman');
  r = await call('POST', '/api/fort/start', { tier: 'mid', monster: 'Imp' }); assert.strictEqual(r.status, 409);
  let over = false, n = 0, last; while (!over && n++ < 300) { r = await call('POST', '/api/battle/roll'); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); over = r.data.view.over; last = r.data; if (!over && n > 40) { r = await call('POST', '/api/battle/retreat'); over = true; last = r.data; } }
  console.log('fort finished after', n, 'rolls →', last.summary.result, JSON.stringify(last.summary.lines));
  // boss
  r = await call('POST', '/api/boss/start'); assert.strictEqual(r.status, 200); const bossName = r.data.view.e.name;
  for (let i = 0; i < 60 && !r.data.view.over; i++) r = await call('POST', '/api/battle/roll');
  if (!r.data.view.over) r = await call('POST', '/api/battle/retreat');
  console.log('boss', bossName, '→', JSON.stringify(r.data.summary.lines));
  r = await call('GET', '/api/me'); assert(r.data.boss.hp <= r.data.boss.max_hp); assert.strictEqual(r.data.player.energy.boss.val, 5);
  // premium shop
  r = await call('GET', '/api/me'); assert.strictEqual(r.data.player.gender, 'f'); assert.strictEqual(r.data.player.gems, 5);
  r = await call('POST', '/api/premium/speedster', {}); assert.strictEqual(r.status, 200); assert(r.data.player.speedster_until > Date.now() + 6 * 86400e3); assert.strictEqual(r.data.player.gems, 4);
  r = await call('POST', '/api/premium/boss-energy', {}); assert.strictEqual(r.data.player.energy.boss.val, 6); // 5 left + 1 bought
  r = await call('POST', '/api/premium/arena-energy', {}); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.player.daily.arena_buys, 1);
  r = await call('POST', '/api/premium/arena-energy', {}); r = await call('POST', '/api/premium/arena-energy', {});
  r = await call('POST', '/api/premium/arena-energy', {}); assert.strictEqual(r.status, 402, 'out of gems'); // 5 gems total: sp+boss+3 arena
  // arena
  r = await call('POST', '/api/arena/start'); assert.strictEqual(r.status, 409);
  r = await call('POST', '/api/arena/join'); assert.strictEqual(r.status, 200);
  r = await call('POST', '/api/arena/start'); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); console.log('arena vs', r.data.view.e.name, r.data.view.e.cls);
  for (let i = 0; i < 100 && !r.data.view.over; i++) r = await call('POST', '/api/battle/roll');
  console.log('arena result', r.data.summary.result, JSON.stringify(r.data.summary.lines));
  r = await call('GET', '/api/leaderboard'); assert(Array.isArray(r.data.trophies));
  // security
  const bad = await fetch(`http://127.0.0.1:${PORT}/api/me`); assert.strictEqual(bad.status, 401);
  r = await call('POST', '/api/login', { username: 'merlin', password: 'wrongwrong' }); assert.strictEqual(r.status, 401);
  r = await call('POST', '/api/login', { username: 'merlin', password: 'hunter2hunter2' }); assert.strictEqual(r.status, 200);
  const st = await fetch(`http://127.0.0.1:${PORT}/../server.js`); assert.notStrictEqual(await st.text(), fs.readFileSync('server.js', 'utf8'));
  console.log('✅ smoke test passed');
})().catch(e => { console.error('❌', e); process.exitCode = 1; }).finally(() => srv.kill());
