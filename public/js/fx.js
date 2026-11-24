/* Wizard Battle — FX engine v2 (canvas). Layered, desaturated, physical: flame/smoke/sparks/shards/cracks.
   No emoji, no cartoon glow-blobs. Spell choreography lives in spells-fx.js */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* status colours / names (icons are drawn by the DOM icon set, not emoji) */
  const EFF = {
    Burn: { i: '🔥', c: '#e8742c', c2: '#f5b862' }, Poison: { i: '☠️', c: '#7fa83a', c2: '#c1d98a' }, Bleed: { i: '🩸', c: '#b3202f', c2: '#d9626e' },
    Stun: { i: '💫', c: '#e0c24a', c2: '#f6e8a6' }, Freeze: { i: '🧊', c: '#86c6e6', c2: '#e2f4fc' }, Blind: { i: '👁️', c: '#8f82b8', c2: '#c8c0e2' },
    Confuse: { i: '🌀', c: '#b583d6', c2: '#dcc4ee' }, Weaken: { i: '⬇️', c: '#8d97ab', c2: '#cfd5e2' }, Pierce: { i: '🎯', c: '#cfe3b8', c2: '#ffffff' },
  };

  const hexRgb = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };

  class FX {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ps = []; this.auras = new Map();
      this.speed = 1; this.last = performance.now(); this.dead = false; this.pos = { p: null, e: null };
      this.resize(); this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(canvas.parentElement);
      this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    }
    resize() {
      const r = this.cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height; this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    destroy() { this.dead = true; this._ro.disconnect(); }
    anim(ms, fn) {
      return new Promise(res => {
        const d = ms / this.speed, t0 = performance.now();
        const step = () => { if (this.dead) return res(); const k = Math.min(1, (performance.now() - t0) / d); fn(k); k < 1 ? requestAnimationFrame(step) : res(); };
        step();
      });
    }
    sleep(ms) { return sleep(ms / this.speed); }

    /* ── raw particle ── */
    p(o) { this.ps.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, t: 0, life: 0.6, size: 4, s2: null, color: '#fff', a: 1, shape: 'dot', rot: 0, vr: 0, add: true, fade: true }, o)); }

    /* ── toolkit ── */
    smoke(x, y, o = {}) {
      const n = o.n || 8, c = o.c || '#25262b', sp = o.spread || 24, rise = o.rise == null ? 14 : o.rise;
      for (let i = 0; i < n; i++) this.p({ x: x + rnd(-sp, sp), y: y + rnd(-sp * .4, sp * .4), vx: rnd(-18, 18) + (o.wind || 0), vy: -rnd(rise * .5, rise * 1.4), drag: .3, life: rnd(...(o.life || [1, 1.8])), size: rnd(o.r1 || 8, (o.r1 || 8) * 1.7), s2: rnd(o.r2 || 34, (o.r2 || 34) * 1.4), color: Array.isArray(c) ? pick(c) : c, a: o.a == null ? .5 : o.a, shape: 'puff', add: false });
    }
    fire(x, y, o = {}) {
      const n = o.n || 12, sp = o.spread || 22, up = o.up || 120;
      for (let i = 0; i < n; i++) this.p({ x: x + rnd(-sp, sp), y: y + rnd(0, sp * .5), vx: rnd(-22, 22), vy: -rnd(up * .5, up), drag: .6, life: rnd(.35, .8) * (o.life || 1), size: rnd(...(o.size || [8, 18])), s2: 1, a: .95, shape: 'flame' });
      for (let i = 0; i < Math.ceil(n / 2); i++) this.ember(x + rnd(-sp, sp), y, { up: up * 1.3 });
    }
    ember(x, y, o = {}) { this.p({ x, y, vx: rnd(-50, 50), vy: -rnd(40, o.up || 150), g: 60, drag: .4, life: rnd(.7, 1.6), size: rnd(1, 2.4), s2: 0, color: pick(['#ffd28a', '#ff9a45', '#ff6a22']), shape: 'ember' }); }
    sparks(x, y, o = {}) {
      for (let i = 0; i < (o.n || 14); i++) { const a = o.dir != null ? o.dir + rnd(-(o.spread || .7), o.spread || .7) : rnd(0, TAU), s = rnd(...(o.speed || [140, 420])); this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: o.g == null ? 700 : o.g, drag: .8, life: rnd(.25, .7), size: rnd(1.2, 2.2), color: o.color || '#ffe6a8', shape: 'spark' }); }
    }
    _poly(sz) { const n = 3 + Math.floor(rnd(0, 2)), pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU + rnd(-.4, .4), r = sz * rnd(.55, 1.3); pts.push([Math.cos(a) * r * (i === 0 ? 1.7 : 1), Math.sin(a) * r]); } return pts; }
    shards(x, y, o = {}) {
      const cols = o.colors || ['#cfeaf8', '#8fc3de', '#5e93b3'];
      for (let i = 0; i < (o.n || 10); i++) { const a = o.dir != null ? o.dir + rnd(-(o.spread || .9), o.spread || .9) : rnd(0, TAU), s = rnd(...(o.speed || [90, 330])); const sz = rnd(...(o.size || [4, 10])); this.p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.lift || 40), g: o.g == null ? 520 : o.g, drag: .5, life: rnd(.6, 1.2), size: sz, color: pick(cols), shape: 'shard', rot: rnd(0, TAU), vr: rnd(-9, 9), add: false, pts: this._poly(sz), edge: o.edge || 'rgba(255,255,255,.65)' }); }
    }
    debris(x, y, o = {}) { this.shards(x, y, { colors: o.colors || ['#4a4036', '#6b5a48', '#2f2a25'], n: o.n || 10, speed: o.speed || [100, 340], size: [3, 8], g: 700, lift: 120, edge: 'rgba(0,0,0,.35)' }); }
    shock(x, y, r = 120, c = '#ffffff', life = .5) { this.p({ x, y, shape: 'ring', color: c, size: 6, s2: r, life, w: 2.2, a: .75 }); this.p({ x, y, shape: 'ring', color: c, size: 2, s2: r * .72, life: life * .8, w: 1, a: .45 }); }
    mist(x, y, o = {}) { this.smoke(x, y, Object.assign({ n: 10, c: ['#9fb6c4', '#c7d6df'], a: .22, r1: 24, r2: 70, rise: 8, life: [1.2, 2.2], spread: o.rw || 60 }, o)); }
    dust(x, y, n = 10) { this.smoke(x, y, { n, c: ['#6f6050', '#8a7a66'], a: .4, r1: 10, r2: 42, rise: 20, spread: 40, life: [.8, 1.4] }); }
    crack(x, y, o = {}) {
      const n = o.n || 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-.3, .3); let px = x, py = y; const pts = [[px, py]], L = (o.reach || 140) * rnd(.7, 1.2);
        for (let s = 0; s < 8; s++) { const aa = a + rnd(-.5, .5); px += Math.cos(aa) * L / 8; py += Math.sin(aa) * L / 8 * (o.flat == null ? .4 : o.flat); pts.push([px, py]); }
        this.p({ shape: 'tent', pts, size: o.w || 3, color: o.color || '#120d09', life: o.life || 1.6, a: .95, add: false });
        if (o.glow) this.p({ shape: 'tent', pts, size: 1.5, color: o.glow, life: (o.life || 1.6) * .6, a: .9 });
      }
    }
    slash(x, y, o = {}) { this.p({ shape: 'taper', x, y, ang: o.ang || 0, len: o.len || 160, w: o.w || 14, color: o.c1 || '#e9eef7', color2: o.c2 || '#9fb0cc', life: o.life || .26, a: 1, add: true }); }
    bolt(a, b, o = {}) {
      const mk = (x0, y0, x1, y1, jag) => { const pts = [[x0, y0]], n = 10, nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1; for (let i = 1; i < n; i++) { const off = rnd(-jag, jag); pts.push([lerp(x0, x1, i / n) + nx / nl * off, lerp(y0, y1, i / n) + ny / nl * off]); } pts.push([x1, y1]); return pts; };
      const main = mk(a.x, a.y, b.x, b.y, o.jag || 26);
      this.p({ shape: 'poly', pts: main, size: 8, color: o.glow || '#6f9cff', life: o.life || .16, a: .22 });
      this.p({ shape: 'poly', pts: main, size: 2.6, color: o.color || '#eaf3ff', life: o.life || .16, a: 1 });
      for (let k = 0; k < (o.branches == null ? 2 : o.branches); k++) { const i = 2 + Math.floor(rnd(0, 6)), s = main[i], e = { x: s[0] + rnd(-70, 70), y: s[1] + rnd(10, 70) }; this.p({ shape: 'poly', pts: mk(s[0], s[1], e.x, e.y, 14), size: 1.4, color: o.color || '#dfeaff', life: (o.life || .16) * .9, a: .8 }); }
    }
    grade(color = '#fff', a = .16, life = .2) { this.p({ shape: 'flash', color, a, life, add: false }); }
    flash(color = '#fff', a = .3, life = .16) { this.p({ shape: 'flash', color, a: Math.min(a, .35), life, add: true }); }

    /* ── per-frame ── */
    _loop(now) {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.speed; this.last = now;
      const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
      for (const a of this.auras.values()) this._aura(a, dt);
      const ps = this.ps;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.t += dt;
        if (p.t >= p.life) { ps.splice(i, 1); continue; }
        p.vy += p.g * dt; if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        this._draw(c, p, p.t / p.life);
      }
      requestAnimationFrame(this._loop);
    }
    _draw(c, p, k) {
      const size = p.s2 == null ? p.size : lerp(p.size, p.s2, p.shape === 'ring' ? ease(k) : k);
      let alpha = p.a * (p.fade ? (k < .12 ? k / .12 : 1 - Math.pow(k, 1.6)) : 1);
      if (p.shape === 'ring') alpha = p.a * (1 - k);
      c.globalAlpha = Math.max(0, Math.min(1, alpha)); c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      switch (p.shape) {
        case 'dot': { if (size <= 0) break; const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 1.8); g.addColorStop(0, p.color); g.addColorStop(.4, rgba(p.color, .35)); g.addColorStop(1, rgba(p.color, 0)); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, size * 1.8, 0, TAU); c.fill(); break; }
        case 'puff': { const r = Math.max(1, size), g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, rgba(p.color, 1)); g.addColorStop(.55, rgba(p.color, .55)); g.addColorStop(1, rgba(p.color, 0)); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill(); break; }
        case 'flame': {
          const r = Math.max(.5, size * (1 - k * .55)), ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
          c.save(); c.translate(p.x, p.y); c.rotate(ang);
          for (const [sc, col, al] of [[1.45, '#8a1d0a', .55], [1, '#e8590c', .8], [.55, '#ffc15a', .9], [.25, '#fff4c8', 1]]) { c.globalAlpha = Math.max(0, alpha * al); c.fillStyle = col; c.beginPath(); c.ellipse(0, -r * .35 * sc, r * .55 * sc, r * 1.05 * sc, 0, 0, TAU); c.fill(); }
          c.restore(); break;
        }
        case 'ember': { c.fillStyle = p.color; c.globalAlpha *= .55 + .45 * Math.sin(p.t * 40 + p.x); c.beginPath(); c.arc(p.x, p.y, Math.max(.4, size), 0, TAU); c.fill(); break; }
        case 'spark': { c.strokeStyle = p.color; c.lineWidth = Math.max(.6, size); c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); c.stroke(); break; }
        case 'shard': { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.strokeStyle = p.edge; c.lineWidth = .8; c.beginPath(); p.pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.fill(); c.stroke(); c.restore(); break; }
        case 'solid': c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, Math.max(0, size), 0, TAU); c.fill(); break;
        case 'ring': c.strokeStyle = p.color; c.lineWidth = (p.w || 2) * (1 - k * .6); c.beginPath(); c.arc(p.x, p.y, Math.max(0, size), 0, TAU); c.stroke(); break;
        case 'seg': c.strokeStyle = p.color; c.lineWidth = Math.max(.5, size); c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke(); break;
        case 'poly': c.strokeStyle = p.color; c.lineWidth = p.size; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); p.pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); break;
        case 'tent': { c.strokeStyle = p.color; c.lineWidth = p.size; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(p.pts[0][0], p.pts[0][1]); const n = Math.max(2, Math.floor(p.pts.length * Math.min(1, k * 5))); for (let i = 1; i < n; i++) c.lineTo(p.pts[i][0], p.pts[i][1]); c.stroke(); break; }
        case 'taper': {
          const e = Math.min(1, k * 4.5), L = p.len * e, w = p.w * (1 - k * .5); c.save(); c.translate(p.x, p.y); c.rotate(p.ang);
          for (const [sc, col, al] of [[1.7, p.color2, .35], [1, p.color, 1]]) { c.globalAlpha = Math.max(0, alpha * al); c.fillStyle = col; c.beginPath(); c.moveTo(-L / 2, 0); c.quadraticCurveTo(0, -w * sc * 1.4, L / 2, 0); c.quadraticCurveTo(0, -w * sc * .25, -L / 2, 0); c.fill(); }
          c.restore(); break;
        }
        case 'flash': c.fillStyle = p.color; c.fillRect(0, 0, this.w, this.h); break;
        case 'beam': {
          const w = p.size * (1 + .1 * Math.sin(p.t * 70)); c.lineCap = 'round';
          for (const [ww, col, aa] of [[w * 2.4, p.color, .16], [w, p.color, .5], [w * .38, '#fff', .95]]) { c.globalAlpha = Math.max(0, alpha * aa); c.strokeStyle = col; c.lineWidth = ww; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke(); }
          break;
        }
        case 'head': this._head(c, p, size); break;
        case 'streak': { c.strokeStyle = p.color; c.lineWidth = size; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.cos(p.rot) * p.len, p.y - Math.sin(p.rot) * p.len); c.stroke(); break; }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    _head(c, p, size) {
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      const core = (col, r) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#fff'); g.addColorStop(.3, rgba(col, .9)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); };
      switch (p.kind) {
        case 'arrow': core(p.color, size * 1.1); c.fillStyle = '#eaf6ff'; c.strokeStyle = p.color; c.lineWidth = 1.2; c.beginPath(); c.moveTo(size * 1.9, 0); c.lineTo(-size * .5, -size * .55); c.lineTo(-size * .15, 0); c.lineTo(-size * .5, size * .55); c.closePath(); c.fill(); c.stroke(); c.fillRect(-size * 2.8, -size * .08, size * 2.6, size * .16); break;
        case 'diamond': core(p.color, size * 1.2); c.fillStyle = 'rgba(235,252,255,.92)'; c.strokeStyle = p.color; c.lineWidth = 1.4; c.beginPath(); c.moveTo(size * 1.9, 0); c.lineTo(0, -size * .7); c.lineTo(-size * 1.4, 0); c.lineTo(0, size * .7); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-size * 1.4, 0); c.lineTo(size * 1.9, 0); c.stroke(); break;
        case 'rock': c.fillStyle = '#7d8493'; c.strokeStyle = '#2c313c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(size, 0); c.lineTo(size * .2, -size * .8); c.lineTo(-size * .8, -size * .4); c.lineTo(-size * .7, size * .6); c.lineTo(size * .3, size * .8); c.closePath(); c.fill(); c.stroke(); break;
        case 'blob': { const w = 1 + .1 * Math.sin(p.t * 38); c.scale(w, 1 / w); c.fillStyle = p.color; c.beginPath(); c.arc(0, 0, size, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(-size * .3, -size * .3, size * .28, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.stroke(); break; }
        case 'bubble': c.strokeStyle = rgba(p.color, .85); c.lineWidth = 1.6; c.fillStyle = rgba(p.color, .08); c.beginPath(); c.arc(0, 0, size, 0, TAU); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(-size * .35, -size * .35, size * .16, 0, TAU); c.fill(); break;
        case 'bomb': c.fillStyle = '#17171b'; c.strokeStyle = '#555a66'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, size, 0, TAU); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(-size * .3, -size * .3, size * .3, 0, TAU); c.fill(); c.strokeStyle = '#8b6b3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(size * .5, -size * .8); c.quadraticCurveTo(size * 1, -size * 1.4, size * .6, -size * 1.7); c.stroke(); break;
        default: core(p.color, size * 1.5);
      }
      c.restore();
    }

    /* ── persistent status auras (the CSS layer adds tint/overlays) ── */
    setAura(side, eff, on) { const k = side + ':' + eff; if (on) { if (!this.auras.has(k)) this.auras.set(k, { side, eff, acc: 0, t: 0 }); } else this.auras.delete(k); }
    clearAuras(side) { for (const k of [...this.auras.keys()]) if (!side || k.startsWith(side + ':')) this.auras.delete(k); }
    _aura(a, dt) {
      const c = this.pos[a.side]; if (!c) return; a.acc += dt; a.t += dt;
      const rate = { Burn: .05, Poison: .12, Bleed: .22, Weaken: .2, Freeze: .12, Stun: 0, Blind: .18, Confuse: .16 }[a.eff] || .2;
      const hx = c.x, hy = c.y - c.rh * .36;
      if (a.eff === 'Stun') { for (let i = 0; i < 3; i++) { const ang = a.t * 4 + i * TAU / 3; this.p({ x: hx + Math.cos(ang) * c.rw * .24, y: hy - c.rh * .08 + Math.sin(ang) * 8, size: 2.2, color: '#f2dc82', life: .08, fade: false, shape: 'solid', add: true }); } return; }
      while (a.acc > rate) {
        a.acc -= rate; const x = c.x + rnd(-c.rw * .3, c.rw * .3), yb = c.y + c.rh * .38;
        switch (a.eff) {
          case 'Burn': this.fire(x, yb - rnd(0, c.rh * .55), { n: 1, spread: 4, up: 70, size: [6, 12], life: .9 }); break;
          case 'Poison': this.p({ x, y: yb - rnd(0, c.rh * .5), vx: rnd(-8, 8), vy: -rnd(14, 30), life: rnd(1.1, 1.8), size: rnd(10, 18), s2: rnd(26, 40), color: '#6e8f2e', a: .22, shape: 'puff', add: false }); if (Math.random() < .4) this.p({ x, y: c.y - c.rh * .1, vy: rnd(30, 70), g: 260, life: .7, size: 2.2, color: '#7fa83a', shape: 'solid', add: false }); break;
          case 'Bleed': this.p({ x: c.x + rnd(-c.rw * .2, c.rw * .2), y: c.y - c.rh * .05 + rnd(0, 12), vx: rnd(-6, 6), vy: rnd(10, 30), g: 300, life: rnd(.6, 1), size: rnd(1.6, 2.8), s2: 1, color: '#8d1420', shape: 'solid', add: false }); break;
          case 'Weaken': this.p({ x, y: c.y - c.rh * .2 + rnd(0, 30), vx: rnd(-5, 5), vy: rnd(12, 26), life: rnd(1, 1.6), size: rnd(10, 18), s2: rnd(22, 34), color: '#7b8497', a: .16, shape: 'puff', add: false }); break;
          case 'Freeze': this.p({ x: c.x + rnd(-c.rw * .35, c.rw * .35), y: c.y + rnd(-c.rh * .4, c.rh * .4), vx: rnd(-6, 6), vy: rnd(-8, 8), life: rnd(.7, 1.2), size: rnd(1, 2), color: '#e2f4fc', shape: 'solid', add: true }); if (Math.random() < .25) this.mist(c.x, c.y + c.rh * .35, { n: 1, rw: c.rw * .4, a: .16 }); break;
          case 'Blind': this.p({ x: hx + rnd(-14, 14), y: hy + rnd(-8, 8), vx: rnd(-14, 14), vy: -rnd(8, 20), life: rnd(.9, 1.5), size: rnd(8, 14), s2: rnd(18, 28), color: '#15101f', a: .5, shape: 'puff', add: false }); break;
          case 'Confuse': { const ph = a.t * 2.4; this.p({ x: hx, y: hy, shape: 'ring', color: '#b583d6', size: 8, s2: 34, life: .9, w: 1.2, a: .6 }); this.p({ x: hx + Math.cos(ph) * 26, y: hy + Math.sin(ph) * 9, size: 2.2, color: '#dcc4ee', life: .25, shape: 'solid' }); break; }
        }
      }
    }

    /* ── status reaction bursts ── */
    statusHit(side, eff) {
      const c = this.pos[side]; if (!c) return; const E = EFF[eff] || { c: '#fff', c2: '#fff' }, x = c.x, y = c.y;
      if (eff === 'Burn') { this.fire(x, y + c.rh * .2, { n: 14, spread: c.rw * .25, up: 150, size: [9, 20] }); this.smoke(x, y - 10, { n: 3, a: .3, r2: 50 }); this.grade('#e8742c', .08, .2); }
      else if (eff === 'Poison') { this.smoke(x, y, { n: 7, c: ['#5f7e28', '#7fa83a'], a: .35, r2: 56, rise: 24 }); for (let i = 0; i < 7; i++) this.p({ x: x + rnd(-c.rw * .25, c.rw * .25), y: y - rnd(0, 30), vy: rnd(-10, 40), g: 300, life: .8, size: rnd(1.8, 3.2), color: '#8fb83e', shape: 'solid', add: false }); }
      else if (eff === 'Bleed') { for (let i = 0; i < 12; i++) this.p({ x: x + rnd(-14, 14), y: y - c.rh * .12, vx: rnd(-70, 70), vy: rnd(-90, -10), g: 560, life: .9, size: rnd(1.6, 3.2), color: '#8d1420', shape: 'solid', add: false }); this.sparks(x, y - c.rh * .1, { n: 4, color: '#c1303e', g: 400, speed: [60, 160] }); this.grade('#6e0f1a', .1, .2); }
      else if (eff === 'Weaken') { this.smoke(x, y, { n: 6, c: '#6f788b', a: .3, r2: 50, rise: -20 }); this.grade('#2b3140', .12, .25); }
      else if (eff === 'Freeze') { this.shock(x, y, c.rw * .7, '#cfeaf8', .4); this.shards(x, y, { n: 6, speed: [40, 150], size: [3, 6], g: 200 }); this.grade('#9ad0ea', .1, .25); }
      else { this.shock(x, y, c.rw * .6, E.c, .4); this.sparks(x, y, { n: 8, color: E.c2, g: 120 }); }
    }
    applyStatus(side, eff) {
      const c = this.pos[side]; if (!c) return; const E = EFF[eff] || { c: '#fff', c2: '#fff' }, x = c.x, y = c.y;
      this.shock(x, y, c.rw * .85, E.c, .6);
      if (eff === 'Freeze') { this.shards(x, y, { n: 14, speed: [60, 260], size: [4, 9] }); this.mist(x, y + c.rh * .3, { n: 6, rw: c.rw * .5, a: .3 }); this.grade('#b7e0f4', .16, .3); }
      else if (eff === 'Burn') { this.fire(x, y + c.rh * .25, { n: 18, spread: c.rw * .3, up: 170, size: [10, 22] }); this.grade('#e8742c', .12, .25); }
      else if (eff === 'Poison') { this.smoke(x, y, { n: 10, c: ['#5f7e28', '#7fa83a'], a: .4, r2: 60 }); this.grade('#5f7e28', .1, .3); }
      else if (eff === 'Bleed') { this.sparks(x, y, { n: 10, color: '#b3202f', g: 500, speed: [80, 240] }); this.grade('#6e0f1a', .12, .25); }
      else if (eff === 'Stun') { this.sparks(x, y - c.rh * .35, { n: 12, color: '#f2dc82', g: 0, speed: [40, 140] }); this.grade('#e0c24a', .08, .2); }
      else if (eff === 'Blind') { this.smoke(x, y - c.rh * .3, { n: 8, c: '#120d1c', a: .55, r2: 50, rise: 10 }); this.grade('#0b0814', .2, .35); }
      else if (eff === 'Confuse') { for (let i = 0; i < 3; i++) this.p({ x, y: y - c.rh * .32, shape: 'ring', color: '#b583d6', size: 6, s2: 56 + i * 14, life: .8 + i * .15, w: 1.4, a: .6 }); }
      else if (eff === 'Weaken') { this.smoke(x, y, { n: 8, c: '#6f788b', a: .3, r2: 56, rise: -18 }); this.grade('#2b3140', .14, .3); }
      else this.sparks(x, y, { n: 10, color: E.c2, g: 100 });
    }
  }

  window.WB = window.WB || {};
  Object.assign(window.WB, { FX, EFF, rnd, pick, lerp, ease, sleep, TAU, rgba });
})();
