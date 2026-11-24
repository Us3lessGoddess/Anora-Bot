const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3155, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui2.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Gandalf', password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0].split('=');
  await fetch(U + '/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie.join('=') }, body: JSON.stringify({ class_name: 'Paladin' }) });
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } }); await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: U }]);
  const errs = []; const page = await ctx.newPage(); page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load/.test(m.text()) && errs.push('CONSOLE ' + m.text()));
  page.on('dialog', d => d.accept());
  const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png` });
  await page.goto(U + '/#/fort'); await page.waitForTimeout(1500); await shot('f1-fort');
  await page.screenshot({ path: '/tmp/shots/f2-fort-full.png', fullPage: true });
  await page.goto(U + '/#/boss'); await page.waitForTimeout(2500); await shot('b1-boss'); await page.screenshot({ path: '/tmp/shots/b2-boss-full.png', fullPage: true });
  await page.goto(U + '/#/library'); await page.click('.tab[data-t="Monsters"]'); await page.waitForTimeout(800); await shot('l1-lib');
  await page.goto(U + '/#/fort'); await page.waitForTimeout(600); await page.click('[data-f="low|Swordsman"]'); await page.waitForSelector('#roll'); await page.waitForTimeout(900); await shot('g1-battle');
  await page.click('#fast'); for (let i = 0; i < 3; i++) { await page.click('#roll'); await page.waitForSelector('#roll:not([disabled]), .modal-bg', { timeout: 30000 }); if (await page.$('.modal-bg')) break; }
  await shot('g2-battle-later');
  if (!(await page.$('.modal-bg'))) { await page.click('#ret'); await page.waitForSelector('.modal-bg'); }
  await page.goto(U + '/#/boss'); await page.waitForTimeout(600); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(1200); await shot('g3-boss-battle');
  await page.click('#roll'); await page.waitForTimeout(6000); await shot('g4-boss-battle2');
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
