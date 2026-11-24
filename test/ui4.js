const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3177, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui4.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Gandalf', password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) });
  const c = r.headers.get('set-cookie').split(';')[0].split('=');
  await fetch(U + '/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.join('=') }, body: JSON.stringify({ class_name: 'Paladin' }) });
  await fetch(U + '/api/arena/join', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.join('=') }, body: '{}' });
  const br = await chromium.launch({ args: ['--no-sandbox'] }); const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } }); await ctx.addCookies([{ name: c[0], value: c[1], url: U }]);
  const errs = []; const page = await ctx.newPage(); page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load/.test(m.text()) && errs.push('CONSOLE ' + m.text())); page.on('dialog', d => d.accept());
  const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png` });
  await page.goto(U + '/#/arena'); await page.waitForTimeout(900); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(4500); await shot('k1-arena');
  console.log('arena has auto/speed buttons:', !!(await page.$('#auto')), !!(await page.$('#fast')));
  await page.click('#roll'); await page.waitForTimeout(5200); await shot('k2-arena-spell');
  await page.waitForSelector('#roll:not([disabled]), .modal-bg', { timeout: 40000 }); if (!(await page.$('.modal-bg'))) { await page.click('#ret'); await page.waitForSelector('.modal-bg'); } await page.goto(U + '/#/boss'); await page.waitForTimeout(900); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(1200); await shot('k3-boss');
  await page.goto(U + '/#/hub'); await page.waitForTimeout(1000); await shot('k4-hub');
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
