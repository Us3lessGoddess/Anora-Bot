const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3122, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Gandalf', password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0].split('=');
  const hdr = { 'Content-Type': 'application/json', cookie: cookie.join('=') };
  await fetch(U + '/api/onboard', { method: 'POST', headers: hdr, body: JSON.stringify({ class_name: 'Apprentice' }) });
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text()) && errs.push('CONSOLE ' + m.text())); return p; };
  let page = await mk();
  const shot = async n => { await page.screenshot({ path: `/tmp/shots/${n}.png` }); };
  await page.goto(U + '/#/'); await page.waitForTimeout(4500); await shot('01-home');
  await page.goto(U + '/#/signup'); await page.waitForTimeout(2500); await shot('02-signup');
  await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: U }]);
  for (const [n, h] of [['03-hub', '#/hub'], ['04-shop', '#/shop'], ['05-spells', '#/spells'], ['06-fort', '#/fort'], ['07-boss', '#/boss'], ['08-arena', '#/arena'], ['09-library', '#/library'], ['10-board', '#/board']]) { await page.goto(U + '/' + h); await page.waitForTimeout(1200); await shot(n); }
  // battle
  await page.goto(U + '/#/fort'); await page.waitForTimeout(800);
  page.on('dialog', d => d.accept());
  await page.click('[data-f="low|Swordsman"]'); await page.waitForSelector('#roll'); await page.waitForTimeout(800); await shot('11-battle-start');
  await page.click('#roll'); await page.waitForTimeout(900); await shot('12-dice-tumbling'); await page.waitForTimeout(1300); await shot('13-dice-result'); await page.waitForTimeout(900); await shot('14-spell-fx');
  await page.waitForSelector('#roll:not([disabled])', { timeout: 30000 }); await shot('15-after-round');
  await page.click('#fast');
  for (let i = 0; i < 5; i++) { await page.click('#roll'); await page.waitForSelector('#roll:not([disabled]), .modal-bg', { timeout: 30000 }); if (await page.$('.modal-bg')) break; }
  await shot('16-later'); console.log('errors:', errs.length ? errs : 'none');
  await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
