/* Wizard Battle — spell choreography v2. Every spell is built from physical parts (flame, smoke, sparks,
   shards, cracks, tapered slashes). No emoji, no cartoon glyphs. */
(function () {
  'use strict';
  const { FX, rnd, pick, lerp, ease, TAU } = window.WB;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const shake = (fx, m, ms) => fx.shakeFn && fx.shakeFn(m, ms);

  /* ── impacts ── */
  const HIT = {
    fire: (fx, t) => { fx.fire(t.x, t.y + 22, { n: 26, spread: 34, up: 190, size: [12, 28] }); fx.smoke(t.x, t.y, { n: 7, a: .45, r2: 74 }); fx.sparks(t.x, t.y, { n: 18, color: '#ffcf7a' }); fx.shock(t.x, t.y, 120, '#ffb066', .45); fx.debris(t.x, t.y + 40, { n: 6 }); fx.grade('#e8742c', .14, .22); },
    ice: (fx, t) => { fx.shards(t.x, t.y, { n: 16 }); fx.shock(t.x, t.y, 100, '#dff4ff', .4); fx.mist(t.x, t.y + 20, { n: 5, rw: 40, a: .28 }); fx.grade('#9ad0ea', .12, .25); },
    goo: (fx, t, o) => { const c = (o && o.c1) || '#6e8f2e'; for (let i = 0; i < 18; i++) fx.p({ x: t.x, y: t.y, vx: rnd(-210, 210), vy: rnd(-230, -20), g: 720, life: .8, size: rnd(2.5, 6), s2: 1.5, color: c, shape: 'solid', add: false }); fx.smoke(t.x, t.y, { n: 4, c, a: .3, r2: 46 }); fx.shock(t.x, t.y, 70, c, .35); },
    dust: (fx, t) => { fx.dust(t.x, t.y + 20, 12); fx.debris(t.x, t.y + 30, { n: 5, colors: ['#8a7a66', '#6f6050'] }); fx.shock(t.x, t.y, 80, '#b59a72', .4); },
    puff: (fx, t) => { fx.smoke(t.x, t.y, { n: 8, c: ['#e8d6dc', '#f4e8ee'], a: .4, r2: 60, rise: 18 }); fx.sparks(t.x, t.y, { n: 8, color: '#ffd9ec', g: 100 }); },
    spark: (fx, t, o) => { const col = (o && o.col) || '#e9f0d8'; fx.sparks(t.x, t.y, { n: 22, color: col, g: 300 }); fx.shock(t.x, t.y, 90, col, .4); fx.grade(col, .1, .18); },
    arcane: (fx, t) => { fx.shards(t.x, t.y, { n: 14, colors: ['#e7defa', '#b79cf0', '#7e63c4'], edge: 'rgba(255,255,255,.7)' }); fx.shock(t.x, t.y, 120, '#b79cf0', .55); fx.grade('#7e63c4', .16, .3); },
    blood: (fx, t) => { for (let i = 0; i < 16; i++) fx.p({ x: t.x, y: t.y, vx: rnd(-160, 160), vy: rnd(-220, -20), g: 700, life: .8, size: rnd(2, 4.2), color: '#8d1420', shape: 'solid', add: false }); fx.grade('#6e0f1a', .1, .2); },
  };

  const A = {};

  /* ── projectiles ── */
  A.bolt = async (fx, f, t, o) => {
    const d = dist(f, t), dur = o.dur || 620, arc = (o.arc == null ? .1 : o.arc) * d, kind = o.kind || 'orb', col = o.c1 || '#e9f0d8', n = o.n || 1;
    if (kind === 'fire' || kind === 'streak') fx.fire(f.x, f.y, { n: 6, spread: 10, up: 60, size: [8, 14] }); else fx.sparks(f.x, f.y, { n: 8, color: col, g: 0, speed: [40, 120] });
    const shots = [];
    for (let s = 0; s < n; s++) shots.push((async () => {
      await fx.sleep(s * (o.gap || 130)); const off = (s - (n - 1) / 2) * 26; let px = f.x, py = f.y;
      await fx.anim(dur, k => {
        const e = o.linear ? k : ease(k) * .55 + k * .45, x = lerp(f.x, t.x, e), y = lerp(f.y, t.y, e) - Math.sin(Math.PI * k) * arc + off * Math.sin(Math.PI * k), a = Math.atan2(y - py, x - px) || 0; px = x; py = y;
        if (kind === 'fire') { fx.fire(x, y, { n: 2, spread: 7, up: 36, size: [12, 24] }); fx.smoke(x, y, { n: 1, a: .3, r2: 30, rise: 0, spread: 4 }); }
        else if (kind === 'streak') { fx.p({ shape: 'streak', x, y, rot: a, len: 70, size: 7, color: '#ffb066', life: .05, fade: false }); fx.fire(x, y, { n: 1, spread: 4, up: 20, size: [8, 14] }); }
        else {
          fx.p({ x, y, shape: 'head', kind: ({ ice: 'arrow', diamond: 'diamond', rock: 'rock', goo: 'blob', bubble: 'bubble' })[kind] || 'orb', size: o.size || 14, color: col, rot: a, life: .045, fade: false });
          if (kind === 'ice' || kind === 'diamond') { fx.p({ x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-20, 20), vy: rnd(-20, 20), size: rnd(1, 2), color: '#e2f4fc', life: .5, shape: 'solid' }); if (Math.random() < .3) fx.mist(x, y, { n: 1, rw: 6, a: .2, r2: 28 }); }
          else if (kind === 'goo') fx.p({ x, y, vx: rnd(-12, 12), vy: 20, g: 600, life: .6, size: rnd(1.6, 3.4), color: col, shape: 'solid', add: false });
          else if (kind === 'rock') { if (Math.random() < .5) fx.shock(x, y, 26, '#e0e6ff', .3); }
          else if (kind === 'bubble') { if (Math.random() < .25) fx.p({ x, y, shape: 'ring', color: '#cde8f6', size: 2, s2: 9, life: .5, w: 1 }); }
          else if (kind === 'dust' || kind === 'puff') fx.smoke(x, y, { n: 1, c: kind === 'dust' ? ['#6f6050', '#8a7a66'] : ['#e8d6dc', '#f4e8ee'], a: .35, r1: 12, r2: 36, rise: 6, spread: 5 });
          else fx.p({ x, y, vx: rnd(-20, 20), vy: rnd(-20, 20), size: rnd(2, 5), s2: 0, color: col, life: rnd(.2, .4) });
        }
      });
      (HIT[o.hit] || HIT.spark)(fx, t, o);
    })());
    await Promise.all(shots);
  };

  A.beam = async (fx, f, t, o) => {
    const col = o.c1;
    await fx.anim(o.charge || 420, k => { for (let i = 0; i < 2; i++) { const a = rnd(0, TAU), r = 70 * (1 - k) + 8; fx.p({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, size: 1.8, color: o.c2 || '#fff', life: .22, shape: 'solid' }); } fx.p({ x: f.x, y: f.y, size: 6 + k * 14, color: col, life: .05, fade: false, a: .5 }); });
    shake(fx, 3, 500);
    await fx.anim(o.dur || 650, k => {
      const e = Math.min(1, k * 4); fx.p({ shape: 'beam', x: f.x, y: f.y, x2: lerp(f.x, t.x, e), y2: lerp(f.y, t.y, e), size: o.w || 12, color: col, life: .05, fade: false, a: k > .8 ? (1 - k) * 5 : 1 });
      if (k > .2) { fx.sparks(t.x, t.y, { n: 2, color: o.c2 || '#fff', g: 200, speed: [80, 260] }); if (Math.random() < .5) fx.smoke(t.x, t.y, { n: 1, a: .25, r2: 40 }); }
    });
    (HIT[o.hit] || HIT.fire)(fx, t, o);
  };

  A.rain = async (fx, f, t, o) => {
    const n = o.n || 14, tasks = [];
    for (let i = 0; i < n; i++) tasks.push((async () => {
      await fx.sleep(i * (o.gap || 55) + rnd(0, 40));
      const lx = t.x + rnd(-70, 70), ly = t.y + rnd(-20, 50), slant = o.slant || 0, h = o.height || 340, x0 = lx - slant * h, y0 = ly - h, fall = o.fall || 430, ang0 = Math.atan2(ly - y0, lx - x0);
      await fx.anim(fall, k => {
        const x = lerp(x0, lx, k * k), y = lerp(y0, ly, k * k);
        if (o.kind === 'meteor') { fx.fire(x, y, { n: 2, spread: 5, up: 20, size: [12, 22] }); fx.smoke(x, y, { n: 1, a: .35, r2: 34, rise: 0, spread: 3 }); }
        else if (o.kind === 'spear') fx.p({ x, y, shape: 'head', kind: 'arrow', size: 10, color: '#8fc3de', rot: ang0, life: .045, fade: false });
        else if (o.kind === 'acid') fx.p({ shape: 'streak', x, y, rot: Math.PI / 2, len: 22, size: 1.8, color: '#9cc23a', life: .05, fade: false });
        else if (o.kind === 'glitter') { if (Math.random() < .5) fx.p({ x: x + rnd(-6, 6), y, vy: 30, size: rnd(1, 2), color: pick(['#f6e7b0', '#d8c7ff', '#fff']), life: .5, shape: 'solid' }); }
      });
      if (o.kind === 'meteor') { HIT.fire(fx, { x: lx, y: ly }); shake(fx, 6, 240); }
      else if (o.kind === 'spear') { fx.shards(lx, ly, { n: 6, size: [3, 6] }); fx.shock(lx, ly, 40, '#dff4ff', .3); }
      else if (o.kind === 'acid') { for (let j = 0; j < 5; j++) fx.p({ x: lx, y: ly, vx: rnd(-80, 80), vy: rnd(-120, -20), g: 500, life: .5, size: 1.8, color: '#9cc23a', shape: 'solid', add: false }); fx.smoke(lx, ly, { n: 1, c: '#6e8f2e', a: .3, r2: 28 }); }
      else if (o.kind === 'glitter') fx.sparks(lx, ly, { n: 3, color: '#f6e7b0', g: 80, speed: [20, 90] });
    })());
    await Promise.all(tasks); await fx.sleep(120);
  };

  /* ── melee ── */
  A.slash = async (fx, f, t, o) => {
    const col = o.c1 || '#e9eef7', n = o.n || 1, kind = o.kind || 'blade';
    for (let i = 0; i < n; i++) {
      const a = (kind === 'claw' ? -.7 : rnd(-1, 1) + (i % 2 ? .6 : 0)), L = o.len || 170, cx = t.x + rnd(-14, 14), cy = t.y + rnd(-14, 14);
      for (const off of (kind === 'claw' ? [-16, 0, 16] : [0])) fx.slash(cx - Math.sin(a) * off, cy + Math.cos(a) * off, { ang: a, len: L, w: kind === 'deep' ? 20 : 13, c1: col, c2: o.c2 || '#9fb0cc' });
      fx.sparks(cx, cy, { n: 12, color: o.ghost ? (o.c2 || '#9ff3e6') : '#ffe6b0', dir: a + Math.PI / 2, spread: 1.1, g: 500 });
      if (o.blood) HIT.blood(fx, { x: cx, y: cy });
      if (o.ghost) { fx.smoke(cx, cy, { n: 4, c: [o.c1, o.c2 || o.c1], a: .25, r2: 46, rise: 30 }); }
      shake(fx, 4, 160); await fx.sleep(110);
    }
    if (o.extra) o.extra(fx, t);
  };

  A.punch = async (fx, f, t, o) => {
    const col = o.c1 || '#e9f0d8', a = ang(f, t);
    for (let i = 0; i < 4; i++) { fx.p({ shape: 'streak', x: lerp(f.x, t.x, (i + 1) / 5), y: lerp(f.y, t.y, (i + 1) / 5), rot: a, len: 90, size: 9 - i, color: col, life: .08, fade: false }); await fx.sleep(30); }
    fx.shock(t.x, t.y, o.heavy ? 190 : 140, '#ffffff', .5); fx.shock(t.x, t.y, 90, col, .4);
    fx.dust(t.x, t.y + 40, 10); fx.debris(t.x, t.y + 20, { n: o.heavy ? 10 : 6 }); fx.sparks(t.x, t.y, { n: 16, color: o.spark || '#ffe6b0', g: 450 });
    if (o.heavy) fx.crack(t.x, t.y + 70, { n: 5, reach: 120 });
    if (o.rage) fx.grade('#b3202f', .16, .3);
    if (o.flakes) fx.shards(t.x, t.y, { n: 12, colors: ['#8c4a22', '#5a2b12', '#b36a33'], size: [2, 5], edge: 'rgba(0,0,0,.4)' });
    if (o.splash) { for (let i = 0; i < 18; i++) fx.p({ x: t.x, y: t.y, vx: rnd(-220, 220), vy: rnd(-260, -20), g: 760, life: .8, size: rnd(2, 4), color: '#cde8f6', shape: 'solid', add: false }); }
    fx.flash('#ffffff', .22, .1); shake(fx, o.heavy ? 13 : 9, 300); await fx.sleep(150);
  };

  A.quake = async (fx, f, t, o) => {
    const gy = t.y + 62;
    if (o.stomp) { await fx.anim(260, k => { fx.p({ shape: 'streak', x: t.x, y: lerp(t.y - 280, gy, k * k), rot: Math.PI / 2, len: 120, size: 22, color: '#101014', life: .05, fade: false, a: .8, add: false }); }); fx.smoke(t.x, gy - 4, { n: 6, c: '#3a342c', a: .5, r2: 60 }); }
    fx.crack(t.x, gy, { n: o.cracks || 6, reach: o.reach || 150 });
    fx.shock(t.x, gy, o.reach || 150, '#c9b99a', .55); fx.dust(t.x, gy, 14); fx.debris(t.x, gy, { n: o.rocks || 14, speed: [120, 420] });
    if (o.petrify) { for (let i = 0; i < 22; i++) { const a = rnd(0, TAU); fx.p({ x: t.x + Math.cos(a) * 100, y: t.y + Math.sin(a) * 80, vx: -Math.cos(a) * 140, vy: -Math.sin(a) * 110, size: rnd(2, 5), color: pick(['#9aa0ad', '#6e7482', '#c9ceda']), life: .8, shape: 'solid', add: false }); } fx.smoke(t.x, t.y, { n: 8, c: ['#8a909c', '#5a6070'], a: .4, r2: 60, rise: 6 }); fx.grade('#3a3f4a', .2, .4); }
    shake(fx, o.shake || 12, 520); await fx.sleep(520);
  };

  A.burst = async (fx, f, t, o) => {
    if (o.bomb) { let px = f.x, py = f.y; await fx.anim(520, k => { const e = ease(k), x = lerp(f.x, t.x, e), y = lerp(f.y, t.y, e) - Math.sin(Math.PI * k) * 140; fx.p({ x, y, shape: 'head', kind: 'bomb', size: 12, color: '#fff', rot: k * 7, life: .045, fade: false }); fx.p({ x: x + 6, y: y - 20, vx: rnd(-30, 30), vy: rnd(-40, -10), size: 1.6, color: '#ffd28a', life: .3, shape: 'solid' }); px = x; py = y; }); await fx.sleep(120); }
    if (o.inferno) { await fx.anim(650, k => { fx.fire(t.x + rnd(-40, 40), t.y + 70, { n: 8, spread: 30, up: 360, size: [16, 34] }); if (k > .5) fx.smoke(t.x, t.y - 40, { n: 1, a: .4, r2: 70 }); }); }
    HIT.fire(fx, t); fx.fire(t.x, t.y + 40, { n: 30, spread: 60, up: 230, size: [14, 32] }); fx.shock(t.x, t.y, 210, '#ffffff', .5); fx.smoke(t.x, t.y - 20, { n: 10, a: .5, r2: 90 });
    shake(fx, o.inferno ? 16 : 13, 600); await fx.sleep(480);
  };

  A.wave = async (fx, f, t, o) => {
    const water = o.kind === 'water', dir = t.x > f.x ? 1 : -1;
    await fx.anim(o.dur || 760, k => {
      const x = lerp(f.x, t.x, ease(k));
      for (let i = 0; i < 4; i++) { const y = t.y - 80 + i * 40 + Math.sin(k * 14 + i) * 10; if (water) fx.p({ x, y, vx: dir * 80, vy: rnd(-30, 10), size: rnd(14, 24), s2: 40, color: pick(['#7fb8dd', '#cde8f6', '#e8f6fc']), a: .3, life: .45, shape: 'puff', add: false }); else { fx.p({ x, y, vx: dir * 60, vy: rnd(-30, -6), size: rnd(10, 18), s2: 36, color: pick(['#e8742c', '#f5b862']), a: .22, life: .5, shape: 'puff' }); if (Math.random() < .3) fx.ember(x, y); } }
    });
    if (water) { for (let i = 0; i < 28; i++) fx.p({ x: t.x, y: t.y, vx: rnd(-240, 240), vy: rnd(-380, -60), g: 800, life: .9, size: rnd(1.6, 4), color: pick(['#cde8f6', '#fff']), shape: 'solid', add: false }); fx.shock(t.x, t.y + 40, 140, '#cde8f6', .6); fx.grade('#4f8fb5', .15, .3); shake(fx, 8, 300); }
    else { fx.fire(t.x, t.y + 40, { n: 20, spread: 50, up: 150 }); fx.shock(t.x, t.y, 120, '#ffb066', .6); fx.grade('#e8742c', .16, .4); }
    await fx.sleep(300);
  };

  A.lightning = async (fx, f, t) => {
    fx.grade('#9ab6ff', .12, .1);
    for (let r = 0; r < 4; r++) {
      fx.bolt({ x: t.x + rnd(-90, 90), y: -10 }, { x: t.x + rnd(-10, 10), y: t.y }, { branches: 3 }); fx.bolt(f, t, { jag: 18, branches: 1, life: .12 });
      fx.sparks(t.x, t.y, { n: 12, color: '#dfeaff', g: 300 }); fx.shock(t.x, t.y, 80, '#dfeaff', .25); fx.flash('#cfe0ff', .18, .06); shake(fx, 6, 110); await fx.sleep(120);
    }
    fx.smoke(t.x, t.y, { n: 3, a: .3, r2: 40 }); fx.sparks(t.x, t.y, { n: 10, color: '#ffe6a8' });
  };

  A.mist = async (fx, f, t, o) => {
    if (o.bomb) { let px = f.x; await fx.anim(380, k => { const e = ease(k); fx.p({ x: lerp(f.x, t.x, e), y: lerp(f.y, t.y, e) - Math.sin(Math.PI * k) * 100, shape: 'head', kind: 'bomb', size: 10, color: '#fff', rot: k * 6, life: .045, fade: false }); }); fx.sparks(t.x, t.y, { n: 10, color: '#ffe6a8' }); fx.shock(t.x, t.y, 90, '#c9ceda', .4); }
    fx.smoke(t.x, t.y + 10, { n: o.n || 18, c: o.cs || ['#9fb6c4', '#c7d6df'], a: o.alpha || .32, r1: 22, r2: 80, rise: 12, spread: 70, life: [1.2, 2] });
    if (o.bubbles) for (let i = 0; i < 9; i++) fx.p({ x: t.x + rnd(-60, 60), y: t.y + rnd(0, 60), vy: rnd(-60, -20), life: 1.1, size: rnd(3, 7), s2: rnd(8, 14), shape: 'ring', color: '#a9c95a', w: 1 });
    if (o.heal) fx.sparks(f.x, f.y, { n: 12, color: '#e0edc8', g: -60, speed: [20, 90] });
    await fx.sleep(o.hold || 700);
  };

  A.drain = async (fx, f, t, o) => {
    const col = o.c1, col2 = o.c2 || '#fff';
    if (o.bite) { const a = ang(f, t); for (const s of [-1, 1]) fx.slash(t.x, t.y + s * 30, { ang: s * .85, len: 110, w: 20, c1: '#f2eee4', c2: '#b9b2a2', life: .3 }); await fx.sleep(170); fx.sparks(t.x, t.y, { n: 14, color: '#b3202f', g: 500 }); HIT.blood(fx, t); shake(fx, 7, 220); }
    if (o.maw) { fx.smoke(t.x, t.y, { n: 6, c: '#0c0810', a: .85, r1: 30, r2: 80, rise: 0, spread: 20 }); fx.shock(t.x, t.y, 130, '#c23b5a', .6); fx.sparks(t.x, t.y, { n: 18, color: '#e07090', g: 100 }); shake(fx, 9, 400); await fx.sleep(200); }
    if (o.chains) { for (let i = 0; i < 12; i++) { const k = i / 11, x = lerp(t.x, f.x, k), y = lerp(t.y, f.y, k) + Math.sin(k * 6) * 10; fx.p({ x, y, shape: 'ring', color: '#cfc4ee', size: 5, s2: 5, life: 1.1, w: 2, a: .8 }); await fx.sleep(26); } }
    if (o.runes) { fx.p({ x: t.x, y: t.y + 50, shape: 'ring', color: col, size: 110, s2: 110, life: 1, w: 2, a: .8 }); fx.p({ x: t.x, y: t.y + 50, shape: 'ring', color: col, size: 72, s2: 72, life: 1, w: 1, a: .6 }); for (let i = 0; i < 5; i++) { const a1 = i / 5 * TAU - 1.57, a2 = ((i + 2) % 5) / 5 * TAU - 1.57; fx.p({ shape: 'seg', x: t.x + Math.cos(a1) * 108, y: t.y + 50 + Math.sin(a1) * 108 * .4, x2: t.x + Math.cos(a2) * 108, y2: t.y + 50 + Math.sin(a2) * 108 * .4, size: 1.4, color: col, life: 1, a: .8 }); } await fx.sleep(320); }
    if (o.hands) { for (let i = 0; i < 4; i++) { const x = t.x + (i - 1.5) * 38, pts = []; for (let s = 0; s < 10; s++) pts.push([x + Math.sin(s * .7 + i) * 10 + s * (i < 2 ? -2 : 2), t.y + 90 - s * 13]); fx.p({ shape: 'tent', pts, size: 9, color: '#17101f', life: 1, a: .95, add: false }); fx.p({ shape: 'tent', pts, size: 3, color: col, life: .9, a: .6 }); } fx.smoke(t.x, t.y + 60, { n: 6, c: '#120a1c', a: .6, r2: 60 }); await fx.sleep(350); }
    const N = o.n || 26;
    for (let i = 0; i < N; i++) {
      const sx = t.x + rnd(-40, 40), sy = t.y + rnd(-50, 50), jit = rnd(-60, 60);
      fx.anim(rnd(520, 760), k => { const e = ease(k); fx.p({ x: lerp(sx, f.x, e) + Math.sin(k * 8 + i) * jit * (1 - k), y: lerp(sy, f.y, e) - Math.sin(Math.PI * k) * 50, size: rnd(1.4, 2.6), color: pick([col, col2]), life: .12, fade: false, shape: 'solid' }); });
      await fx.sleep(14);
    }
    await fx.sleep(620); fx.shock(f.x, f.y, 70, col2, .5); fx.sparks(f.x, f.y, { n: 10, color: col2, g: -40, speed: [30, 110] });
  };

  A.heal = async (fx, f, t, o) => {
    const kind = o.kind || 'small', c = o.cs || ['#e0edc8', '#b7d894', '#fff'], big = kind === 'big' || kind === 'divine' ? 1.7 : 1;
    if (kind === 'divine') { for (let i = 0; i < 3; i++) fx.p({ shape: 'beam', x: f.x + (i - 1) * 26, y: -20, x2: f.x + (i - 1) * 26, y2: f.y + 40, size: 16, color: '#f1d58a', life: 1, a: .55 }); fx.grade('#f1d58a', .14, .6); }
    if (kind === 'prayer') { fx.p({ x: f.x, y: f.y - 30, shape: 'ring', color: '#f6edd0', size: 60, s2: 60, life: 1.2, w: 1.6, a: .7 }); fx.smoke(f.x, f.y - 20, { n: 5, c: '#f6edd0', a: .18, r2: 70, rise: 8 }); }
    if (kind === 'vines') { for (let i = 0; i < 5; i++) { const x = f.x + (i - 2) * 22, pts = []; for (let s = 0; s < 10; s++) pts.push([x + Math.sin(s * .9 + i) * 16, f.y + 70 - s * 15]); fx.p({ shape: 'tent', pts, size: 5, color: '#3f6b2e', life: 1.5, a: .95, add: false }); fx.p({ shape: 'tent', pts, size: 1.6, color: '#9cc27a', life: 1.2, a: .7 }); } }
    if (kind === 'fireflies') { for (let i = 0; i < 30; i++) { const sx = t.x + rnd(-50, 50), sy = t.y + rnd(-50, 50); fx.anim(rnd(700, 1100), k => { const e = ease(k); fx.p({ x: lerp(sx, f.x, e) + Math.sin(k * 14 + i) * 22, y: lerp(sy, f.y, e) + Math.cos(k * 11 + i) * 18, size: rnd(1.6, 2.8), color: pick(['#f5d98a', '#d6e89a']), life: .1, fade: false, shape: 'solid' }); }); await fx.sleep(18); } await fx.sleep(500); HIT.spark(fx, t, { col: '#f5d98a' }); }
    for (let i = 0; i < 28 * big; i++) fx.p({ x: f.x + rnd(-45, 45), y: f.y + rnd(0, 60), vx: rnd(-10, 10), vy: -rnd(40, 130), size: rnd(1.2, 2.6), s2: 0, color: pick(c), life: rnd(.9, 1.5), shape: 'solid' });
    fx.p({ x: f.x, y: f.y + 40, shape: 'ring', color: c[1], size: 20, s2: 80 * big, life: .9, w: 1.8, a: .7 }); fx.smoke(f.x, f.y + 20, { n: 4, c: c[0], a: .14, r2: 60 * big, rise: 10 }); fx.grade(c[1], .1, .35);
    await fx.sleep(kind === 'divine' ? 900 : 650);
  };

  A.spikes = async (fx, f, t, o) => {
    const n = o.n || 7, gy = t.y + 62, col = o.c1 || '#8fc3de';
    for (let i = 0; i < n; i++) { const x = t.x + (i - (n - 1) / 2) * 24 + rnd(-6, 6), h = rnd(48, 86), w = rnd(7, 11); fx.p({ x, y: gy, shape: 'shard', pts: [[0, -h], [w, 0], [-w, 0]], rot: rnd(-.12, .12), size: 1, color: col, edge: 'rgba(255,255,255,.7)', life: 1.1, a: 1, add: false }); fx.dust(x, gy, 1); await fx.sleep(55); }
    if (o.claw) for (const s of [-1, 1]) { const pts = []; for (let k = 0; k < 12; k++) pts.push([t.x + s * (90 - k * 5), gy - k * 12 - Math.sin(k / 11 * 3) * 6]); fx.p({ shape: 'tent', pts, size: 10, color: col, life: 1, a: .9, add: false }); fx.p({ shape: 'tent', pts, size: 3, color: '#e8f6ff', life: .9, a: .9 }); }
    fx.shock(t.x, gy, 110, col, .5); fx.shards(t.x, gy - 40, { n: 14, colors: o.cs || undefined, g: 400, speed: [100, 300] }); fx.crack(t.x, gy, { n: 4, reach: 90, color: '#1a2630' }); shake(fx, 6, 240); await fx.sleep(380);
  };

  A.freeze = async (fx, f, t, o) => {
    fx.grade('#b7e0f4', .22, .4);
    if (o.storm) await fx.anim(o.dur || 900, k => { for (let i = 0; i < 4; i++) { const a = k * 20 + i * 1.6, r = 30 + k * 90 + rnd(0, 20); fx.p({ x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r * .55, vx: Math.cos(a + 1.57) * 120, vy: Math.sin(a + 1.57) * 60, life: .5, size: rnd(1.2, 2.4), color: '#e2f4fc', shape: 'solid' }); } if (Math.random() < .5) fx.mist(t.x, t.y, { n: 1, rw: 90, a: .22, r2: 80 }); if (Math.random() < .2) fx.shards(t.x + rnd(-80, 80), t.y + rnd(-60, 40), { n: 2, size: [3, 6], g: 100, speed: [20, 80] }); });
    fx.shock(t.x, t.y, 150, '#e2f4fc', .65); fx.shards(t.x, t.y, { n: 22, speed: [100, 380] }); fx.mist(t.x, t.y + 20, { n: 8, rw: 70, a: .3 });
    if (o.crystal) { for (let i = 0; i < 5; i++) { const h = rnd(70, 120), w = rnd(12, 20), x = t.x + (i - 2) * 30; fx.p({ x, y: t.y + 62, shape: 'shard', pts: [[0, -h], [w, 0], [-w, 0]], rot: rnd(-.25, .25), size: 1, color: '#9ccae0', edge: 'rgba(255,255,255,.8)', life: 1.4, a: .9, add: false }); } }
    shake(fx, 5, 220); await fx.sleep(450);
  };

  A.swirl = async (fx, f, t, o) => {
    if (o.kind === 'tornado') {
      await fx.anim(1100, k => { for (let i = 0; i < 5; i++) { const h = rnd(0, 1), a = k * 26 + h * 9 + i, r = 14 + h * 60; fx.p({ x: t.x + Math.cos(a) * r, y: t.y + 70 - h * 190, vx: Math.cos(a + 1.57) * 80, vy: -20, life: .5, size: rnd(8, 16), s2: rnd(18, 30), color: pick(['#8a909c', '#aab0bb', '#6c727e']), a: .28, shape: 'puff', add: false }); } if (Math.random() < .3) fx.debris(t.x + rnd(-40, 40), t.y + rnd(-40, 40), { n: 1, speed: [60, 160] }); });
      fx.dust(t.x, t.y + 60, 8); fx.shock(t.x, t.y + 60, 90, '#aab0bb', .5);
    } else if (o.kind === 'ray') {
      for (const [col, w, ph] of [['#b583d6', 3.2, 0], ['#7bc6e0', 2, 1.6]]) { const pts = []; const n = 14; for (let i = 0; i <= n; i++) pts.push([lerp(f.x, t.x, i / n), lerp(f.y, t.y, i / n) + Math.sin(i * .9 + ph) * 18 * Math.sin(i / n * Math.PI)]); fx.p({ shape: 'poly', pts, size: w, color: col, life: .6, a: .9 }); fx.p({ shape: 'poly', pts, size: w * 4, color: col, life: .6, a: .15 }); }
      await fx.anim(500, k => { fx.p({ x: lerp(f.x, t.x, k) + rnd(-26, 26), y: lerp(f.y, t.y, k) + rnd(-26, 26), vy: -20, size: 1.8, color: pick(['#dcc4ee', '#9fd6ea']), life: .5, shape: 'solid' }); });
      HIT.spark(fx, t, { col: '#dcc4ee' }); for (let i = 0; i < 3; i++) fx.p({ x: t.x, y: t.y - 40, shape: 'ring', color: '#b583d6', size: 6, s2: 50 + i * 14, life: .7, w: 1.2, a: .6 });
    } else if (o.kind === 'whisper') {
      for (let i = 0; i < 12; i++) { const sx = t.x + rnd(-200, 200) * (i % 2 ? 1 : -1), sy = t.y + rnd(-120, 40); fx.anim(rnd(700, 1000), k => { const e = ease(k); fx.p({ x: lerp(sx, t.x, e) + Math.sin(k * 10 + i) * 16, y: lerp(sy, t.y - 10, e), size: 16, s2: 22, color: '#cfc4ee', a: .18, life: .08, fade: false, shape: 'puff', add: false }); }); await fx.sleep(70); }
      await fx.sleep(800); fx.smoke(t.x, t.y, { n: 6, c: ['#3b2a5a', '#6b4aa0'], a: .35, r2: 60 }); fx.shock(t.x, t.y, 100, '#9b7bd0', .6); fx.grade('#3b2a5a', .2, .4);
    } else if (o.kind === 'shatter') {
      fx.shock(t.x, t.y - 20, 70, '#e7defa', .5); await fx.sleep(240);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; fx.p({ shape: 'seg', x: t.x, y: t.y - 20, x2: t.x + Math.cos(a) * 110, y2: t.y - 20 + Math.sin(a) * 110, size: 1.4, color: '#fff', life: .6 }); }
      HIT.arcane(fx, { x: t.x, y: t.y - 20 }); shake(fx, 8, 260); await fx.sleep(300);
    }
  };

  A.mark = async (fx, f, t, o) => {
    const col = o.c1;
    if (o.kind === 'skull') { // sigil: ring + star, then a dark flash
      for (const [r, w] of [[100, 2.2], [70, 1.2]]) fx.p({ x: t.x, y: t.y, shape: 'ring', color: col, size: r, s2: r, life: 1.2, w, a: .85 });
      for (let i = 0; i < 5; i++) { const a1 = i / 5 * TAU - 1.57, a2 = ((i + 2) % 5) / 5 * TAU - 1.57; fx.p({ shape: 'seg', x: t.x + Math.cos(a1) * 98, y: t.y + Math.sin(a1) * 98, x2: t.x + Math.cos(a2) * 98, y2: t.y + Math.sin(a2) * 98, size: 1.6, color: col, life: 1.2, a: .85 }); }
      await fx.sleep(380); fx.shock(t.x, t.y, 140, '#ff6b7a', .5); fx.smoke(t.x, t.y, { n: 6, c: '#12060a', a: .6, r2: 70 }); fx.grade('#6e0f1a', .22, .4); shake(fx, 8, 260);
    } else if (o.kind === 'tendrils') {
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, pts = []; for (let s = 0; s < 12; s++) { const r = 100 - s * 7, aa = a + s * .32; pts.push([t.x + Math.cos(aa) * r, t.y + 70 - s * 12 + Math.sin(aa) * 20]); } fx.p({ shape: 'tent', pts, size: 6, color: '#1a1028', life: 1.3, a: .95, add: false }); fx.p({ shape: 'tent', pts, size: 1.6, color: '#9b7bd0', life: 1.1, a: .7 }); await fx.sleep(40); }
      fx.smoke(t.x, t.y, { n: 8, c: '#140c20', a: .5, r2: 70 }); fx.shock(t.x, t.y + 40, 90, '#9b7bd0', .5);
    } else if (o.kind === 'shout') {
      for (let i = 0; i < 5; i++) { fx.p({ x: f.x, y: f.y, shape: 'ring', color: col, size: 12, s2: 150 + i * 30, life: .8, w: 2.4 - i * .3, a: .6 }); await fx.sleep(110); }
      fx.sparks(t.x, t.y, { n: 18, color: '#ffb066' }); fx.shock(t.x, t.y, 120, col, .5); fx.grade(col, .14, .3); shake(fx, 10, 300);
    } else if (o.kind === 'taunt') {
      for (let i = 0; i < 4; i++) { const k = (i + 1) / 5, x = lerp(f.x, t.x, k), y = lerp(f.y, t.y, k) - 14; fx.p({ shape: 'poly', pts: [[x - 12, y - 14], [x + 2, y - 2], [x - 6, y + 2], [x + 12, y + 16]], size: 2.4, color: '#e07080', life: .5, a: .95 }); await fx.sleep(100); }
      fx.shock(t.x, t.y, 100, '#e07080', .5); fx.sparks(t.x, t.y, { n: 12, color: '#ff9aa6' }); fx.grade('#b3202f', .12, .25);
    }
  };

  A.swarm = async (fx, f, t, o) => {
    if (o.snake) { const a = ang(f, t); for (let i = 0; i < 5; i++) { fx.p({ shape: 'streak', x: lerp(f.x, t.x, (i + 1) / 5), y: lerp(f.y, t.y, (i + 1) / 5) + Math.sin(i * 1.8) * 16, rot: a, len: 80, size: 8 - i, color: '#4f7a28', life: .1, fade: false }); await fx.sleep(40); }
      fx.slash(t.x, t.y, { ang: -.5, len: 90, w: 12, c1: '#f2eee4', c2: '#b9b2a2' }); for (let i = 0; i < 18; i++) fx.p({ x: t.x, y: t.y, vx: rnd(-220, 220), vy: rnd(-250, 40), g: 700, life: .8, size: rnd(2, 4.4), color: pick(['#7fa83a', '#a9c95a']), shape: 'solid', add: false }); fx.shock(t.x, t.y, 90, '#7fa83a', .4); fx.grade('#5f7e28', .12, .3); await fx.sleep(280); return; }
    for (let i = 0; i < 34; i++) { const sx = f.x, sy = f.y + rnd(-30, 30); fx.anim(rnd(700, 1100), k => { const e = ease(k), a = k * 12 + i; fx.p({ x: lerp(sx, t.x, e) + Math.cos(a) * (1 - k) * 34 + Math.cos(a * 1.7) * k * 32, y: lerp(sy, t.y, e) + Math.sin(a) * (1 - k) * 34 + Math.sin(a * 1.3) * k * 24, size: rnd(1.2, 2.2), color: o.c1 || '#7fa83a', life: .06, fade: false, shape: 'solid', add: false }); }); await fx.sleep(24); }
    await fx.sleep(1000); fx.smoke(t.x, t.y, { n: 8, c: o.cs || ['#5f7e28', '#7fa83a'], a: .35, r2: 60 }); fx.shock(t.x, t.y, 90, o.c1 || '#7fa83a', .5); fx.grade(o.c1 || '#7fa83a', .12, .3);
  };

  A.sun = async (fx, f, t, o) => {
    if (o.pillar) { for (let i = 0; i < 3; i++) fx.p({ shape: 'beam', x: t.x + (i - 1) * 22, y: -30, x2: t.x + (i - 1) * 22, y2: t.y + 60, size: 22, color: '#f1d58a', life: .9, a: .8 }); fx.grade('#f1d58a', .24, .6); fx.shock(t.x, t.y + 50, 130, '#f6edd0', .7); for (let i = 0; i < 26; i++) fx.p({ x: t.x + rnd(-60, 60), y: t.y + rnd(-120, 60), vy: -rnd(10, 50), size: rnd(1, 2.4), color: '#f6edd0', life: 1.2, shape: 'solid' }); shake(fx, 10, 400); fx.sparks(f.x, f.y, { n: 10, color: '#e0edc8', g: -50, speed: [20, 90] }); await fx.sleep(700); return; }
    for (let i = 0; i < 9; i++) { const a = -1.15 + i * .29; fx.p({ shape: 'beam', x: t.x + Math.cos(a) * 0, y: -20, x2: t.x + (i - 4) * 46, y2: t.y + 40, size: 5, color: '#f1d58a', life: .9, a: .55 }); }
    await fx.sleep(300); fx.flash('#fffbe6', .3, .5); fx.shock(t.x, t.y, 160, '#fff6d6', .6); fx.sparks(t.x, t.y, { n: 18, color: '#fff2c4', g: 120 }); await fx.sleep(420);
  };

  A.dazzle = async (fx, f, t, o) => {
    for (let i = 0; i < 6; i++) { const x = t.x + rnd(-70, 70), y = t.y + rnd(-70, 50); fx.slash(x, y, { ang: 0, len: 90, w: 5, c1: '#ffffff', c2: pick(['#b583d6', '#7bc6e0', '#e8c868']), life: .3 }); fx.slash(x, y, { ang: Math.PI / 2, len: 60, w: 4, c1: '#ffffff', c2: '#ffffff', life: .3 }); fx.sparks(x, y, { n: 4, color: '#fff', g: 0, speed: [30, 120] }); await fx.sleep(70); }
    if (o.punch) { fx.shock(t.x, t.y, 110, '#ffffff', .4); shake(fx, 6, 200); } fx.flash('#ffffff', .3, .2); await fx.sleep(240);
  };

  A.mirage = async (fx, f, t) => {
    await fx.anim(1000, k => { for (let i = 0; i < 2; i++) fx.p({ x: t.x + Math.sin(k * 12 + i * 2) * 40, y: t.y - 10 + i * 24, shape: 'ring', color: i % 2 ? '#e8c868' : '#9fd0e0', size: 26, s2: 80, life: .6, w: 1.2, a: .5 }); if (Math.random() < .6) fx.p({ x: t.x + rnd(-70, 70), y: t.y + rnd(-40, 70), vy: -30, size: 16, s2: 44, color: '#e8d4a8', a: .12, life: .9, shape: 'puff', add: false }); });
    fx.shock(t.x, t.y, 120, '#e8c868', .7); fx.grade('#e8d4a8', .14, .4);
  };

  A.claw = async (fx, f, t, o) => {
    const col = o.c1 || '#e9eef7'; await fx.anim(260, k => { const e = ease(k); fx.p({ shape: 'streak', x: lerp(f.x, t.x, e), y: lerp(f.y, t.y, e), rot: ang(f, t), len: 70, size: 8, color: col, life: .08, fade: false }); });
    for (const off of [-16, 0, 16]) fx.slash(t.x, t.y + off, { ang: -.7, len: 130, w: 11, c1: col, c2: '#9fb0cc' }); fx.sparks(t.x, t.y, { n: 12, color: '#ffe6b0', g: 500 }); shake(fx, 8, 260); await fx.sleep(180);
  };

  /* ── the spell book: every spell → a look that fits its name ── */
  const S = {
    'Cut': ['slash', { c1: '#e9eef7', blood: 1 }], 'Punch Spell': ['punch', { c1: '#e9f0d8' }], 'Weak Poison': ['bolt', { kind: 'goo', size: 10, c1: '#6e8f2e', hit: 'goo', dur: 700, arc: .22 }],
    'Ice Arrow': ['bolt', { kind: 'ice', size: 11, c1: '#8fc3de', hit: 'ice', dur: 520, linear: 1, arc: .04 }], 'Rage Punch': ['punch', { c1: '#ff9a6a', rage: 1, heavy: 1, spark: '#ffb066' }],
    'Dust Ball': ['bolt', { kind: 'dust', size: 16, c1: '#8a7a66', hit: 'dust' }], 'Ember': ['bolt', { kind: 'fire', c1: '#ff9a45', hit: 'fire', dur: 560 }], 'Slime Ball': ['bolt', { kind: 'goo', size: 14, c1: '#5f7e28', hit: 'goo', dur: 700, arc: .28 }],
    'Sunshine': ['sun', {}], 'Basic Heal': ['heal', { kind: 'small' }], 'Bite': ['drain', { bite: 1, c1: '#b3202f', c2: '#d9626e', n: 12 }], 'Confuse Ray': ['swirl', { kind: 'ray' }],
    'Great Heal': ['heal', { kind: 'mid', cs: ['#cfe3b8', '#b7d894', '#fff'] }], 'Ice Spikes': ['spikes', { c1: '#a9d4ea', n: 7 }], 'Sharp Spikes': ['spikes', { c1: '#9aa3b2', n: 7, cs: ['#c9ceda', '#8b93a6', '#fff'] }],
    'Mist': ['mist', { cs: ['#9fb6c4', '#c7d6df'], n: 16, heal: 1 }], 'Puff Ball': ['bolt', { kind: 'puff', size: 22, c1: '#f4e8ee', hit: 'puff', dur: 700, arc: .22 }], 'Dazzling Hit': ['dazzle', { punch: 1 }],
    'Glitter Fall': ['rain', { kind: 'glitter', n: 22, gap: 40, fall: 900, height: 260 }], 'Stomp': ['quake', { stomp: 1, cracks: 5, rocks: 10, reach: 120, shake: 10 }], 'Concusive Blow': ['punch', { c1: '#e0c24a', heavy: 1 }],
    'Fire Ball': ['bolt', { kind: 'fire', c1: '#ff9a45', hit: 'fire', dur: 700, arc: .16 }], 'Devour': ['drain', { maw: 1, c1: '#a02848', c2: '#e07090', n: 32 }], 'Meteor Shower': ['rain', { kind: 'meteor', n: 7, gap: 170, slant: .55, height: 380, fall: 520 }],
    'Flameshot': ['bolt', { kind: 'streak', c1: '#ffb066', hit: 'fire', dur: 330, linear: 1, arc: 0 }], 'Sonic Pebble': ['bolt', { kind: 'rock', size: 9, c1: '#e0e6ff', hit: 'spark', col: '#e0e6ff', dur: 380, linear: 1, arc: 0 }],
    'Rusted Punch': ['punch', { c1: '#b36a33', flakes: 1, spark: '#ffb066' }], 'Icicle Spears': ['rain', { kind: 'spear', n: 9, gap: 90, slant: .25, height: 360, fall: 420 }], 'Glacial Storm': ['freeze', { storm: 1, dur: 1000 }],
    'Smoke Bomb': ['mist', { bomb: 1, cs: ['#6f7482', '#9aa0ad', '#4a4f5c'], n: 22, alpha: .45, hold: 800 }], 'Crushing Waves': ['wave', { kind: 'water' }], 'Heat Wave': ['wave', { kind: 'heat' }],
    'Diamond Arrow': ['bolt', { kind: 'diamond', size: 11, c1: '#8fd6e8', hit: 'ice', dur: 460, linear: 1, arc: 0 }], 'Root Growth': ['heal', { kind: 'vines', cs: ['#cfe3b8', '#8cb86a', '#fff'] }],
    'Walrus Punch': ['punch', { c1: '#cde8f6', heavy: 1, splash: 1 }], 'Acid Rain': ['rain', { kind: 'acid', n: 26, gap: 38, fall: 380, height: 320 }], 'Tornado': ['swirl', { kind: 'tornado' }], 'Thunder Wave': ['lightning', {}],
    'Firefly Surge': ['heal', { kind: 'fireflies', cs: ['#f5d98a', '#d6e89a', '#fff'] }], 'Dreadful Whispers': ['swirl', { kind: 'whisper' }], 'Solarbeam': ['beam', { c1: '#f1d58a', c2: '#fff', w: 13, hit: 'fire', charge: 520, dur: 800 }],
    'Earthquake': ['quake', { cracks: 9, rocks: 22, reach: 220, shake: 16 }], 'Massive heal': ['heal', { kind: 'big', cs: ['#cfe3b8', '#8bd44a', '#f6edd0'] }], 'Soul Bind': ['drain', { chains: 1, c1: '#b79cf0', c2: '#e7defa', n: 20 }],
    'Deep Cut': ['slash', { c1: '#f2f4fa', blood: 1, n: 2, kind: 'deep', len: 210 }], 'Energy Drain': ['drain', { c1: '#7fc0dd', c2: '#e2f4fc', n: 30 }], 'Silent Prayer': ['heal', { kind: 'prayer', cs: ['#fff', '#f6edd0', '#f1d58a'] }],
    'Fracture': ['slash', { c1: '#dfe6f2', n: 2, len: 180, extra: (fx, t) => { fx.crack(t.x, t.y, { n: 9, reach: 90, flat: 1, color: '#e8ecf5', w: 2, life: 1 }); shake(fx, 8, 240); } }],
    'Bone Split': ['slash', { c1: '#f2ead3', len: 200, extra: (fx, t) => { fx.crack(t.x, t.y, { n: 7, reach: 100, flat: 1, color: '#f2ead3', w: 2.4, life: 1 }); fx.shards(t.x, t.y, { n: 10, colors: ['#efe6cf', '#d8ccb0'], size: [3, 7], g: 600 }); shake(fx, 8, 240); } }],
    'Tilted Taunt': ['mark', { kind: 'taunt', c1: '#e07080' }], 'Divine Prayer': ['heal', { kind: 'divine', cs: ['#f6edd0', '#fff', '#f1d58a'] }], 'Venom Strike': ['swarm', { snake: 1 }], 'Mirage': ['mirage', {}],
    'Hemorrhage': ['slash', { c1: '#f2f4fa', blood: 1, n: 3, kind: 'deep', len: 200 }], 'Mind Shatter': ['swirl', { kind: 'shatter' }], 'Cursed Fog': ['mist', { cs: ['#2f3a22', '#4f5e30', '#1c1a2a'], n: 24, alpha: .5, heal: 1, hold: 900 }],
    "Warlord's Cry": ['mark', { kind: 'shout', c1: '#e8742c' }], 'Plague': ['swarm', { c1: '#7fa83a', cs: ['#5f7e28', '#7fa83a'] }], 'Petrify': ['quake', { petrify: 1, cracks: 4, rocks: 12, reach: 100, shake: 8 }],
    'Death Mark': ['mark', { kind: 'skull', c1: '#c23b4a' }], 'Shadowbind': ['mark', { kind: 'tendrils', c1: '#9b7bd0' }], 'Flash Freeze': ['freeze', {}], 'Bomb Shock': ['burst', { bomb: 1 }],
    'Tectonic Shift': ['quake', { cracks: 8, rocks: 20, reach: 200, shake: 15 }], 'Bubble Blast': ['bolt', { kind: 'bubble', size: 22, c1: '#9fd0e8', hit: 'spark', col: '#cde8f6', n: 4, gap: 120, dur: 640, arc: .2 }],
    'Toxic Fumes': ['mist', { cs: ['#5f7e28', '#7fa83a', '#3f5a1a'], n: 22, alpha: .4, bubbles: 1, hold: 800 }], 'Inferno Blast': ['burst', { inferno: 1 }], 'Void Grasp': ['drain', { hands: 1, c1: '#6b4aa0', c2: '#b79cf0', n: 18 }],
    'Glacial Grip': ['spikes', { claw: 1, c1: '#8fc3de', n: 5 }], 'Blood Ritual': ['drain', { runes: 1, c1: '#b3202f', c2: '#d9626e', n: 26 }], 'Stone Curse': ['quake', { petrify: 1, cracks: 5, rocks: 14, reach: 120, shake: 9 }],
    'Arcane Shatter': ['beam', { c1: '#b79cf0', c2: '#e7defa', w: 12, hit: 'arcane', charge: 380, dur: 620 }], 'Soulrend': ['slash', { c1: '#e7defa', c2: '#b79cf0', n: 2, kind: 'deep', len: 210, ghost: 1 }],
    'Divine Judgement': ['sun', { pillar: 1 }], 'Shadow Plague': ['swarm', { c1: '#7e63c4', cs: ['#3b2a5a', '#6b4aa0'] }], 'Eternal Frost': ['freeze', { storm: 1, crystal: 1, dur: 1300 }],
    'Spectral Blade': ['slash', { c1: '#cdf5ee', c2: '#7fd6c4', n: 3, len: 220, ghost: 1 }], 'Adaptive Strike': ['slash', { c1: '#e9eef7', n: 3, len: 200, extra: (fx, t) => { HIT.spark(fx, t, { col: '#cfe3b8' }); } }],
    'Strike': ['claw', { c1: '#e9eef7' }],
  };
  const FALLBACK = ['bolt', { kind: 'orb', size: 14, c1: '#e9f0d8', hit: 'spark' }];

  FX.prototype.spell = async function (name, from, to, opts = {}) {
    const [arch, o0] = S[name] || FALLBACK, o = Object.assign({}, o0);
    if (opts.monsterColor && arch === 'claw') o.c1 = opts.monsterColor;
    try { await A[arch](this, from, opts.self ? from : to, o); } catch (e) { console.error('spell fx failed', name, e); }
  };
  FX.prototype.spellList = Object.keys(S);
  window.WB.SPELL_FX = S;
})();
