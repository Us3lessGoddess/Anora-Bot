const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process'), crypto = require('crypto'), fs = require('fs');
const PORT = 3277, SECRET = 'test-secret-test-secret-123456', DBF = '/tmp/wb-ui9.db';
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
  await page.goto(U + '/#/library'); await page.waitForTimeout(1200);
  const names = ['dice', 'land', 'thump', 'fire', 'ice', 'zap', 'whoosh', 'slash', 'heal', 'dark', 'poison', 'water', 'wind', 'arcane', 'quake', 'ok', 'no', 'click', 'coin', 'win', 'lose'];
  const out = await page.evaluate(async names => { const o = {}; for (const n of names) o[n] = await WB.snd.measure(n); o.settleOk = await WB.snd.measure('settle', [true]); o.settleNo = await WB.snd.measure('settle', [false]); o.impactFire = await WB.snd.measure('impact', ['fire', true]); o.impactIce = await WB.snd.measure('impact', ['ice', false]); return o; }, names);
  let bad = 0; for (const [k, v] of Object.entries(out)) { const flag = v.peak < 0.03 ? 'SILENT' : v.peak > 0.99 ? 'CLIP' : ''; if (flag) bad++; console.log(k.padEnd(10), 'peak', v.peak.toFixed(2), 'rms', v.rms.toFixed(3), flag); }
  console.log('sound problems:', bad);
  await page.goto(U + '/#/fort'); await page.waitForTimeout(700); await page.click('[data-f="low|Swordsman"]'); await page.waitForSelector('#roll'); await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/shots/c0-start.png' });
  await page.click('#roll'); await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/shots/c1-dice-air.png' });
  await page.waitForTimeout(1250); await page.screenshot({ path: '/tmp/shots/c2-dice-result.png' });
  for (const [i, ms] of [[3, 500], [4, 500], [5, 450]]) { await page.waitForTimeout(ms); await page.screenshot({ path: `/tmp/shots/c${i}-cast.png` }); }
  console.log('errors:', errs.length ? errs : 'none'); await br.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; }).finally(() => srv.kill());
