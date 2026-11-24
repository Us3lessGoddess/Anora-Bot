const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3166, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui3.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
const signup = async (name) => { const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) }); return r.headers.get('set-cookie').split(';')[0].split('='); };
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const c1 = await signup('Gandalf'); await fetch(U + '/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c1.join('=') }, body: JSON.stringify({ class_name: 'Barbarian' }) });
  const c2 = await signup('Newbie');
  const br = await chromium.launch({ args: ['--no-sandbox'] });
  const errs = [];
  const mk = async (c) => { const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } }); if (c) await ctx.addCookies([{ name: c[0], value: c[1], url: U }]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load|401/.test(m.text()) && errs.push('CONSOLE ' + m.text())); p.on('dialog', d => d.accept()); return p; };
  let page = await mk(null); const shot = (n, p = page) => p.screenshot({ path: `/tmp/shots/${n}.png` });
  await page.goto(U + '/#/'); await page.waitForTimeout(4500); await shot('h1-home');
  await page.goto(U + '/#/signup'); await page.waitForTimeout(2500); await shot('h2-signup');
  const p2 = await mk(c2); await p2.goto(U + '/#/onboard'); await p2.waitForTimeout(1800); await shot('h3-onboard', p2);
  page = await mk(c1);
  for (const [n, h] of [['h4-hub', '#/hub'], ['h5-shop', '#/shop'], ['h6-items', '#/shop?tab=items'], ['h7-profile', '#/profile'], ['h8-spells', '#/spells'], ['h9-library', '#/library']]) { await page.goto(U + '/' + h); await page.waitForTimeout(1300); await shot(n); }
  await page.goto(U + '/#/hub'); await page.waitForTimeout(600); await page.click('#gems'); await page.waitForTimeout(600); await shot('h10-premium'); await page.keyboard.press('Escape'); await page.click('.x-close');
  await page.goto(U + '/#/fort'); await page.waitForTimeout(700); await page.click('[data-f="low|Swordsman"]'); await page.waitForSelector('#roll'); await page.waitForTimeout(900); await shot('h11-battle');
  await page.click('#fast'); await page.waitForTimeout(500); await shot('h12-speed-locked');
  await page.click('.x-close').catch(() => {});
  await page.click('#auto'); await page.waitForTimeout(9000); await shot('h13-auto');
  const rounds = await page.$$eval('.log p.rd', e => e.length); console.log('auto rolled rounds:', rounds);
  await page.click('#auto'); 
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
