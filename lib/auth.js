'use strict';
const crypto = require('crypto');

let SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 16) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  SESSION_SECRET not set — using a random one. Logins reset on every restart. Set SESSION_SECRET in Render!');
}
const b64 = buf => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* ───────── passwords (scrypt) ───────── */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [, s, h] = stored.split('$');
    const calc = crypto.scryptSync(pw, Buffer.from(s, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(calc, Buffer.from(h, 'base64url'));
  } catch { return false; }
}

/* ───────── signed session cookie ───────── */
const COOKIE = 'wb_session';
const SESSION_MS = 14 * 24 * 3600 * 1000;
function makeSession(uid) {
  const body = b64(JSON.stringify({ u: uid, e: Date.now() + SESSION_MS }));
  return `${body}.${hmac('s.' + body)}`;
}
function readSession(cookieHeader) {
  const m = (cookieHeader || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!m) return null;
  const tok = m.slice(COOKIE.length + 1), [body, sig] = tok.split('.');
  if (!body || !sig || !safeEq(sig, hmac('s.' + body))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.e > Date.now() ? d.u : null; } catch { return null; }
}
function cookieHeader(value, secure, clear = false) {
  return `${COOKIE}=${clear ? '' : value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
}

/* ───────── captcha: distorted rune-stone SVG, stateless signed token ───────── */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const usedCaptcha = new Map(); // nonce -> expiry (single use)
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function makeCaptcha() {
  let code = '';
  for (let i = 0; i < 5; i++) code += ALPHA[crypto.randomInt(ALPHA.length)];
  const exp = Date.now() + 5 * 60 * 1000, nonce = crypto.randomBytes(8).toString('hex');
  const token = b64(`${exp}.${nonce}.${hmac(`c.${code}.${exp}.${nonce}`)}`);
  const W = 230, H = 84, cols = ['#E0F8C7', '#B7D894', '#d7ecff', '#f6e7a6', '#ffd2b8'];
  let g = '';
  for (let i = 0; i < 7; i++) g += `<path d="M${rnd(0, W)} ${rnd(0, H)} C ${rnd(0, W)} ${rnd(0, H)}, ${rnd(0, W)} ${rnd(0, H)}, ${rnd(0, W)} ${rnd(0, H)}" stroke="${pick(cols)}" stroke-opacity=".35" stroke-width="${rnd(1, 2.4).toFixed(1)}" fill="none"/>`;
  for (let i = 0; i < 40; i++) g += `<circle cx="${rnd(0, W).toFixed(0)}" cy="${rnd(0, H).toFixed(0)}" r="${rnd(.6, 1.8).toFixed(1)}" fill="${pick(cols)}" fill-opacity=".45"/>`;
  let t = '';
  [...code].forEach((ch, i) => {
    const x = 22 + i * 40 + rnd(-4, 4), y = 56 + rnd(-8, 8), rot = rnd(-24, 24), fs = rnd(36, 46);
    t += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs.toFixed(0)}" font-weight="700" font-family="Cinzel,Georgia,serif" fill="${pick(cols)}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})" stroke="#202734" stroke-width="1" paint-order="stroke">${ch}</text>`;
  });
  const seed = crypto.randomInt(1, 9999);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Captcha image">
<defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#202734"/><stop offset="1" stop-color="#36415A"/></linearGradient>
<filter id="cw"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.06" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter></defs>
<rect width="${W}" height="${H}" rx="10" fill="url(#cg)"/>${g}<g filter="url(#cw)">${t}</g>${g.slice(0, g.length / 3)}</svg>`;
  return { token, svg };
}
function verifyCaptcha(token, answer) {
  try {
    const [exp, nonce, mac] = Buffer.from(String(token), 'base64url').toString().split('.');
    if (!exp || Number(exp) < Date.now() || usedCaptcha.has(nonce)) return false;
    const ok = safeEq(mac, hmac(`c.${String(answer || '').trim().toUpperCase()}.${exp}.${nonce}`));
    if (ok) usedCaptcha.set(nonce, Number(exp)); // single use
    return ok;
  } catch { return false; }
}
setInterval(() => { const n = Date.now(); for (const [k, e] of usedCaptcha) if (e < n) usedCaptcha.delete(k); }, 60000).unref();

/* ───────── in-memory rate limiter ───────── */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n <= max;
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (b.reset < n) buckets.delete(k); }, 60000).unref();

module.exports = { hashPassword, verifyPassword, makeSession, readSession, cookieHeader, COOKIE, makeCaptcha, verifyCaptcha, rateLimit };
