const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3311, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui11.db';
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
  const br = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); await ctx.addCookies([{ name: c[0], value: c[1], url: U }]);
  const errs = []; const page = await ctx.newPage(); page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load/.test(m.text()) && errs.push('CONSOLE ' + m.text())); page.on('dialog', d => d.accept());
  await page.goto(U + '/#/dungeon'); await page.waitForTimeout(800); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(500);
  await page.evaluate(() => WB.setSpeed(5)); await page.click('#auto');
  let shots = 0; const t0 = Date.now();
  while (Date.now() - t0 < 80000) { await page.waitForTimeout(450); if (shots < 3 && await page.$('.fighter.a-melee, .fighter.a-cast')) { await page.screenshot({ path: `/tmp/shots/e${shots++}.png` }); } if (await page.$('.fighter.dead')) { await page.waitForTimeout(900); await page.screenshot({ path: '/tmp/shots/e-dead.png' }); break; } }
  await page.waitForSelector('.modal-bg', { timeout: 20000 }); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/shots/e-summary.png' }); console.log('reached summary after', Math.round((Date.now() - t0) / 1000), 's');
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
