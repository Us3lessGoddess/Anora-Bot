const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3211, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui5.db';
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) try { fs.unlinkSync(f); } catch {}
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, SESSION_SECRET: SECRET, LOCAL_DB: DBF, TURSO_URL: '', TURSO_TOKEN: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
const hmac = d => crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
const cap = code => { const exp = Date.now() + 60000, n = crypto.randomBytes(8).toString('hex'); return Buffer.from(`${exp}.${n}.${hmac(`c.${code}.${exp}.${n}`)}`).toString('base64url'); };
const U = `http://127.0.0.1:${PORT}`;
const mk = async (name, cls, g) => { const r = await fetch(U + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'longpassword1', captchaToken: cap('ABCDE'), captchaAnswer: 'ABCDE' }) }); const c = r.headers.get('set-cookie').split(';')[0].split('='); await fetch(U + '/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c.join('=') }, body: JSON.stringify({ class_name: cls, gender: g }) }); return c; };
(async () => {
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));
  const c1 = await mk('Gandalf', 'Barbarian', 'f'); await mk('Rival', 'Paladin', 'm');
  await fetch(U + '/api/arena/join', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c1.join('=') }, body: '{}' });
  const br = await chromium.launch({ args: ['--no-sandbox'] }); const errs = [];
  const open = async (w, h) => { const ctx = await br.newContext({ viewport: { width: w, height: h } }); await ctx.addCookies([{ name: c1[0], value: c1[1], url: U }]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_NAME|Failed to load/.test(m.text()) && errs.push('CONSOLE ' + m.text())); p.on('dialog', d => d.accept()); return p; };
  // arena at three sizes
  for (const [w, h, tag] of [[1366, 768, 'lap'], [1280, 720, 'hd'], [390, 844, 'mob']]) {
    const page = await open(w, h); await page.goto(U + '/#/battle'); await page.waitForTimeout(1500); if (!(await page.$('#roll'))) { await page.goto(U + '/#/arena'); await page.waitForTimeout(1200); await page.click('#go'); }
    await page.waitForSelector('#roll', { timeout: 15000 }); await page.waitForTimeout(4200); await page.screenshot({ path: `/tmp/shots/a-${tag}-1.png` });
    await page.waitForSelector('#roll:not([disabled])', { timeout: 20000 }).catch(() => {}); await page.click('#roll').catch(() => {}); await page.waitForTimeout(5200); await page.screenshot({ path: `/tmp/shots/a-${tag}-2.png` });
    await page.close();
  }
  const page = await open(1280, 860);
  for (const [n, h] of [['n-hub', '#/hub'], ['n-dungeon', '#/dungeon'], ['n-castle', '#/castle'], ['n-bounty', '#/bounty'], ['n-trader', '#/trader'], ['n-pvp', '#/pvp'], ['n-fort', '#/fort']]) { await page.goto(U + '/' + h); await page.waitForTimeout(1500); await page.screenshot({ path: `/tmp/shots/${n}.png` }); }
  await page.goto(U + '/#/dungeon'); await page.waitForTimeout(700); await page.click('#go'); await page.waitForSelector('#roll'); await page.waitForTimeout(3800); await page.click('#fast'); await page.screenshot({ path: '/tmp/shots/n-dungeon-battle.png' });
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
