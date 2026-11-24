const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3322, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui12.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Gandalf', password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) });
  const c = r.headers.get('set-cookie').split(';')[0].split('=');
  await fetch(U + '/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.join('=') }, body: JSON.stringify({ class_name: 'Barbarian', gender: 'm' }) });
  await fetch(U + '/api/arena/join', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.join('=') }, body: '{}' });
  const br = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); await ctx.addCookies([{ name: c[0], value: c[1], url: U }]);
  const errs = []; const page = await ctx.newPage(); page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load/.test(m.text()) && errs.push('CONSOLE ' + m.text())); page.on('dialog', d => d.accept());
  await page.goto(U + '/#/arena'); await page.waitForTimeout(700); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(4500);
  const run = evs => page.evaluate(e => { window.__p = WB.battle.dbg.play(e); }, evs);
  await run([{ t: 'turn', who: 'p', round: 1 }, { t: 'cast', who: 'p', target: 'e', spell: 'Punch Spell', eff: null, kind: 'player', text: 'You cast Punch Spell' }, { t: 'dmg', who: 'e', amount: 120, hp: 150, src: 'spell', spell: 'Punch Spell' }]);
  await page.waitForTimeout(520); await page.screenshot({ path: '/tmp/shots/e0-lunge.png' }); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/shots/e1-impact.png' });
  await page.evaluate(() => window.__p); await page.waitForTimeout(500);
  await run([{ t: 'turn', who: 'e', round: 1 }, { t: 'cast', who: 'e', target: 'p', spell: 'Fire Ball', eff: 'Burn', kind: 'arena', text: 'cast Fire Ball' }, { t: 'dmg', who: 'p', amount: 60, hp: 200, src: 'spell', spell: 'Fire Ball' }, { t: 'apply', who: 'p', eff: 'Burn', dura: 2, text: 'burning' }]);
  await page.waitForTimeout(650); await page.screenshot({ path: '/tmp/shots/e2-cast.png' }); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/shots/e3-burn.png' });
  await page.evaluate(() => window.__p); await page.waitForTimeout(400);
  await run([{ t: 'dmg', who: 'p', amount: 200, hp: 0, src: 'spell', spell: 'Fire Ball' }, { t: 'end', result: 'lose', text: 'Defeat' }]);
  await page.waitForTimeout(1900); await page.screenshot({ path: '/tmp/shots/e4-dead.png' });
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
