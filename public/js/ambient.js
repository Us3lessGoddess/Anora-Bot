/* Wizard Battle — ambient sky (stars, fireflies, embers, bats, shooting stars) + synth sound */
(function () {
  'use strict';
  const { rnd, pick, TAU } = window.WB;

  /* ───────── ambient background ───────── */
  const cv = document.getElementById('ambient'), c = cv.getContext('2d');
  let W = 0, H = 0, stars = [], flies = [], embers = [], bats = [], shoot = null, intensity = 1;
  function size() {
    const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0);
    stars = Array.from({ length: Math.floor(W * H / 6500) }, () => ({ x: rnd(0, W), y: rnd(0, H * .8), r: rnd(.4, 1.7), p: rnd(0, TAU), s: rnd(.5, 2.2) }));
    flies = Array.from({ length: 12 }, () => ({ x: rnd(0, W), y: rnd(H * .35, H), a: rnd(0, TAU), s: rnd(10, 30), p: rnd(0, TAU) }));
    embers = Array.from({ length: 22 }, () => ({ x: rnd(0, W), y: rnd(0, H), v: rnd(14, 40), r: rnd(1, 2.6), p: rnd(0, TAU) }));
  }
  addEventListener('resize', size); size();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; c.clearRect(0, 0, W, H);
    for (const s of stars) { s.p += dt * s.s; c.globalAlpha = (.35 + .65 * Math.abs(Math.sin(s.p))) * intensity; c.fillStyle = '#E0F8C7'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
    if (!shoot && Math.random() < dt * .18) shoot = { x: rnd(W * .2, W), y: rnd(0, H * .3), vx: -rnd(500, 800), vy: rnd(160, 300), t: 0 };
    if (shoot) { shoot.t += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; const g = c.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * .12, shoot.y - shoot.vy * .12); g.addColorStop(0, '#fff'); g.addColorStop(1, 'transparent'); c.globalAlpha = 1; c.strokeStyle = g; c.lineWidth = 2; c.beginPath(); c.moveTo(shoot.x, shoot.y); c.lineTo(shoot.x - shoot.vx * .12, shoot.y - shoot.vy * .12); c.stroke(); if (shoot.t > 1.2) shoot = null; }
    c.globalCompositeOperation = 'lighter';
    for (const f of flies) { f.p += dt * 2; f.a += rnd(-1, 1) * dt * 2; f.x += Math.cos(f.a) * f.s * dt; f.y += Math.sin(f.a) * f.s * dt * .6; if (f.x < -20) f.x = W + 20; if (f.x > W + 20) f.x = -20; if (f.y < H * .3) f.y = H; if (f.y > H + 10) f.y = H * .4; const a = .25 + .75 * Math.max(0, Math.sin(f.p)); const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 12); g.addColorStop(0, `rgba(224,248,199,${a})`); g.addColorStop(.3, `rgba(183,216,148,${a * .6})`); g.addColorStop(1, 'rgba(183,216,148,0)'); c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, 12, 0, TAU); c.fill(); }
    for (const e of embers) { e.y -= e.v * dt; e.p += dt * 3; e.x += Math.sin(e.p) * 14 * dt; if (e.y < -10) { e.y = H + 10; e.x = rnd(0, W); } c.globalAlpha = .5; c.fillStyle = '#ffb066'; c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    if (bats.length < 1 && Math.random() < dt * .012) bats.push({ x: -40, y: rnd(H * .08, H * .4), v: rnd(90, 170), p: 0, s: rnd(.7, 1.3) });
    c.globalAlpha = .85; c.fillStyle = '#12161f';
    for (let i = bats.length - 1; i >= 0; i--) { const b = bats[i]; b.x += b.v * dt; b.p += dt * 14; b.y += Math.sin(b.p * .3) * 20 * dt; const w = Math.sin(b.p) * 10 * b.s; c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo(b.x - 12 * b.s, b.y - 10 * b.s - w, b.x - 24 * b.s, b.y + 2); c.quadraticCurveTo(b.x - 12 * b.s, b.y + 2, b.x, b.y + 6 * b.s); c.quadraticCurveTo(b.x + 12 * b.s, b.y + 2, b.x + 24 * b.s, b.y + 2); c.quadraticCurveTo(b.x + 12 * b.s, b.y - 10 * b.s - w, b.x, b.y); c.fill(); if (b.x > W + 50) bats.splice(i, 1); }
    c.globalAlpha = 1; requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  /* parallax for skyline layers */
  addEventListener('mousemove', e => { const x = (e.clientX / innerWidth - .5), l = document.querySelectorAll('.skyline .layer'); l.forEach((el, i) => { el.style.transform = `translateX(${x * -(8 + i * 10)}px)`; }); });

  /* ───────── sound engine (WebAudio, fully synthesized: filtered noise + resonators + convolution reverb) ───────── */
  let actx = null, muted = localStorage.getItem('wb_mute') === '1';
  const NODES = new WeakMap(), NOISE = new WeakMap();
  const rr = (a, b) => a + Math.random() * (b - a);
  function ac() {
    if (WB._ctxOverride) return WB._ctxOverride;
    if (!actx && !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } }
    if (actx && actx.state === 'suspended') actx.resume(); return actx;
  }
  function nodes(a) {
    let n = NODES.get(a); if (n) return n;
    const master = a.createGain(); master.gain.value = 2.3; const comp = a.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = .004; comp.release.value = .2;
    master.connect(comp).connect(a.destination);
    const wet = a.createGain(); wet.gain.value = .5; const conv = a.createConvolver(), len = Math.floor(a.sampleRate * 2.2), imp = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8) * (i < 600 ? i / 600 : 1); }
    conv.buffer = imp; wet.connect(conv).connect(master); n = { master, wet }; NODES.set(a, n); return n;
  }
  function noiseBuf(a) { let b = NOISE.get(a); if (b) return b; b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NOISE.set(a, b); return b; }
  /** filtered-noise voice */
  function nz(o) {
    const a = ac(); if (!a || muted) return; const { master, wet } = nodes(a), t = a.currentTime + (o.delay || 0), d = o.d || .2;
    const s = a.createBufferSource(); s.buffer = noiseBuf(a); s.loop = true;
    const f = a.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q == null ? 1 : o.q; f.frequency.setValueAtTime(o.f0 || 1000, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + d);
    const g = a.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.vol || .2), t + (o.at || .004)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(f).connect(g).connect(master); if (o.rev) { const r = a.createGain(); r.gain.value = o.rev; g.connect(r).connect(wet); }
    s.start(t, Math.random() * 1.5); s.stop(t + d + .05);
  }
  /** oscillator voice */
  function tn(o) {
    const a = ac(); if (!a || muted) return; const { master, wet } = nodes(a), t = a.currentTime + (o.delay || 0), d = o.d || .2;
    const os = a.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f, t); if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d); if (o.det) os.detune.value = o.det;
    const g = a.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.vol || .1), t + (o.at || .006)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    let node = os; if (o.lp) { const l = a.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = o.lp; l.Q.value = .7; os.connect(l); node = l; }
    node.connect(g).connect(master); if (o.rev) { const r = a.createGain(); r.gain.value = o.rev; g.connect(r).connect(wet); }
    os.start(t); os.stop(t + d + .05);
  }
  const crackle = (n, t0 = 0, span = .5, vol = .1) => { for (let i = 0; i < n; i++) nz({ delay: t0 + Math.random() * span, f0: rr(2200, 5200), type: 'highpass', d: .02, vol: vol * rr(.5, 1), q: .5 }); };

  const sfx = {
    /* dice: wood-and-bone rattle, then heavy stone knocks */
    dice() { let t = 0; for (let i = 0; i < 26; i++) { t += .02 + Math.random() * .045 * (1 + i / 9); if (t > 1.05) break; const hi = Math.random() < .4; nz({ delay: t, d: .04, vol: rr(.07, .16), f0: hi ? rr(3200, 4800) : rr(1500, 2400), q: rr(5, 9) }); if (Math.random() < .45) tn({ delay: t, f: rr(160, 280), f2: rr(80, 130), d: .07, vol: .08 }); } },
    land() { tn({ f: rr(120, 150), f2: 48, d: .24, vol: .34, at: .002 }); nz({ f0: 520, type: 'lowpass', d: .16, vol: .2 }); nz({ f0: 2600, type: 'highpass', d: .03, vol: .07 }); },
    settle(ok) {
      if (ok) { tn({ f: 392, d: 1.2, vol: .07, at: .03, rev: .8 }); tn({ f: 587, d: 1.4, vol: .05, at: .05, delay: .06, rev: .9 }); tn({ f: 98, d: 1, vol: .1, type: 'triangle', lp: 300, at: .03 }); nz({ f0: 6000, type: 'highpass', d: .4, vol: .03, q: .4, rev: .5 }); }
      else { tn({ f: 110, f2: 68, d: 1.1, vol: .13, type: 'sawtooth', lp: 260, rev: .6 }); tn({ f: 117, f2: 72, d: 1.1, vol: .09, type: 'sawtooth', lp: 260 }); nz({ f0: 300, type: 'lowpass', d: .45, vol: .14 }); }
    },
    thump(p = 1) { const k = rr(.92, 1.08); tn({ f: 105 * k, f2: 38, d: .3 * p, vol: .4, at: .002 }); nz({ f0: 900, type: 'lowpass', d: .2, vol: .26 }); nz({ f0: 3200, type: 'highpass', d: .05, vol: .09 }); },
    fire() { nz({ f0: 350, f1: 1800, d: .75, vol: .24, q: .8, at: .14, rev: .3 }); crackle(10, 0, .7, .12); tn({ type: 'sawtooth', f: 78, f2: 44, d: .65, vol: .13, lp: 230 }); },
    ice() { [2100, 3300, 4700].forEach((f, i) => tn({ f, f2: f * .96, d: .5 + i * .18, vol: .05, delay: i * .014, rev: .7 })); nz({ f0: 6500, type: 'highpass', d: .28, vol: .1, q: .4, rev: .4 }); crackle(7, .02, .35, .08); },
    zap() { nz({ f0: 3200, f1: 800, d: .12, vol: .36, at: .001, q: .5 }); nz({ f0: 220, type: 'lowpass', d: .7, vol: .26, rev: .5, delay: .03 }); tn({ type: 'sawtooth', f: 150, f2: 50, d: .38, vol: .11, lp: 520 }); crackle(6, .05, .3, .1); },
    whoosh() { nz({ f0: 280, f1: 2600, d: .32, vol: .27, at: .11, q: 1.2 }); nz({ f0: 2600, f1: 420, d: .26, vol: .1, delay: .15, at: .05, q: 1 }); },
    slash() { nz({ f0: 1500, f1: 6500, d: .17, vol: .22, at: .008, q: .7 }); [1250, 3450].forEach(f => tn({ f, d: .55, vol: .05, delay: .035, rev: .35 })); },
    heal() { [220, 329.6, 440, 554.4].forEach((f, i) => { tn({ f, d: 1.7, vol: .05, at: .35, type: 'sawtooth', lp: 1100, det: i * 3, rev: .9, delay: i * .045 }); tn({ f: f * 2, d: 1.3, vol: .02, at: .45, rev: .9 }); }); nz({ f0: 7000, type: 'highpass', d: .8, vol: .02, at: .4, rev: .8 }); },
    dark() { tn({ f: 55, f2: 46, d: 1.1, vol: .22, type: 'sawtooth', lp: 200, at: .18, rev: .5 }); tn({ f: 58, f2: 48, d: 1.1, vol: .16, type: 'sawtooth', lp: 200, at: .2 }); nz({ f0: 1800, f1: 800, type: 'bandpass', q: 3, d: .9, vol: .05, at: .35, rev: .9 }); },
    poison() { for (let i = 0; i < 7; i++) tn({ f: rr(240, 480), f2: rr(520, 900), d: .09, vol: .08, delay: i * .075 + rr(0, .03), rev: .2 }); nz({ f0: 420, f1: 200, type: 'lowpass', d: .6, vol: .12, at: .1 }); },
    water() { nz({ f0: 520, f1: 190, type: 'lowpass', d: .85, vol: .3, at: .16, q: .7, rev: .3 }); nz({ f0: 3500, type: 'highpass', d: .5, vol: .06, delay: .25, rev: .4 }); },
    wind() { nz({ f0: 280, f1: 1500, d: 1.1, vol: .2, at: .45, q: 2.2, rev: .3 }); nz({ f0: 900, f1: 300, d: .6, vol: .1, delay: .55, q: 1.5 }); },
    arcane() { [880, 1320, 1760].forEach((f, i) => tn({ f, f2: f * 1.02, d: 1, vol: .045, delay: i * .05, rev: .9 })); nz({ f0: 2500, f1: 7000, d: .5, vol: .06, q: 4, rev: .7 }); },
    quake() { tn({ f: 62, f2: 30, d: .9, vol: .4, at: .01 }); nz({ f0: 380, f1: 120, type: 'lowpass', d: .9, vol: .3, at: .02 }); crackle(8, .05, .6, .07); },
    /* impact layer picked by element */
    impact(kind, big) {
      const p = big ? 1.25 : 1;
      if (kind === 'fire') { this.thump(.8 * p); nz({ f0: 500, f1: 2000, d: .4, vol: .15 }); crackle(6, 0, .3, .1); }
      else if (kind === 'ice') { this.thump(.5); [3000, 4400].forEach(f => tn({ f, d: .35, vol: .05, rev: .6 })); crackle(9, 0, .3, .1); }
      else if (kind === 'zap') { nz({ f0: 3000, f1: 700, d: .1, vol: .3, at: .001 }); this.thump(.5); }
      else if (kind === 'arcane') { this.thump(.6); this.arcane(); }
      else if (kind === 'dark') { this.thump(.7); tn({ f: 70, f2: 40, d: .6, vol: .14, type: 'sawtooth', lp: 220, rev: .6 }); }
      else if (kind === 'poison') { this.thump(.5); nz({ f0: 600, f1: 250, type: 'lowpass', d: .3, vol: .15 }); }
      else if (kind === 'holy') { tn({ f: 660, d: .8, vol: .05, rev: .9 }); tn({ f: 990, d: .9, vol: .035, rev: .9, delay: .04 }); this.thump(.4); }
      else { this.thump(p); nz({ f0: 2800, f1: 900, d: .1, vol: .12 }); }
    },
    ok() { tn({ f: 523, d: .28, vol: .09, type: 'triangle', rev: .5 }); tn({ f: 784, d: .4, vol: .07, delay: .07, type: 'triangle', rev: .6 }); },
    no() { tn({ f: 150, f2: 98, d: .28, vol: .2, type: 'sawtooth', lp: 320, rev: .3 }); },
    click() { nz({ f0: 900, d: .04, vol: .32, q: 3 }); tn({ f: 240, f2: 150, d: .07, vol: .16 }); },
    coin() { [1760, 2637].forEach((f, i) => tn({ f, d: .35, vol: .05, delay: i * .06, rev: .4 })); nz({ f0: 5200, type: 'highpass', d: .05, vol: .06 }); },
    win() { for (let i = 0; i < 3; i++) { tn({ f: 92, f2: 52, d: .5, vol: .2, delay: i * .38 }); nz({ f0: 700, type: 'lowpass', d: .25, vol: .12, delay: i * .38 }); } [146.8, 220, 293.7, 370].forEach((f, i) => tn({ f, d: 1.9, vol: .042, at: .3, type: 'sawtooth', lp: 1400, delay: .2 + i * .13, rev: .9 })); nz({ f0: 6000, type: 'highpass', d: 1.4, vol: .03, delay: 1.1, at: .1, rev: .8 }); },
    lose() { tn({ f: 70, f2: 44, d: .8, vol: .38 }); nz({ f0: 500, type: 'lowpass', d: .5, vol: .25 }); [220, 185, 146.8].forEach((f, i) => tn({ f, d: 1.6, vol: .07, at: .35, type: 'triangle', lp: 900, delay: .35 + i * .5, rev: .95 })); },
    forSpell(name, eff) {
      const s = (name || '').toLowerCase();
      if (/fire|ember|flame|heat|inferno|bomb|meteor|solar/.test(s) || eff === 'Burn') return this.fire();
      if (/ice|frost|freez|glacial|icicle|diamond/.test(s) || eff === 'Freeze') return this.ice();
      if (/thunder/.test(s)) return this.zap();
      if (/heal|prayer|root|firefly|judge|sunshine/.test(s)) return this.heal();
      if (/shadow|death|curse|soul|void|whisper|blood|fog|devour|ritual/.test(s)) return this.dark();
      if (/poison|plague|acid|venom|toxic|slime/.test(s) || eff === 'Poison') return this.poison();
      if (/wave|water|bubble|mist|crush/.test(s)) return this.water();
      if (/tornado|storm|dust|smoke/.test(s)) return this.wind();
      if (/arcane|mind|shatter|mirage|dazzl|confuse/.test(s) || eff === 'Confuse') return this.arcane();
      if (/punch|blow|stomp|quake|tectonic|petrify|stone|walrus|earth/.test(s)) { this.whoosh(); return; }
      if (/cut|slash|blade|bite|fracture|bone|spike|arrow|claw|strike|hemorr|taunt|cry/.test(s) || eff === 'Bleed') return this.slash();
      this.whoosh();
    },
    elem(name, eff) {
      const s = (name || '').toLowerCase();
      if (/fire|ember|flame|heat|inferno|bomb|meteor|solar/.test(s) || eff === 'Burn') return 'fire'; if (/ice|frost|freez|glacial|icicle|diamond/.test(s) || eff === 'Freeze') return 'ice';
      if (/thunder/.test(s)) return 'zap'; if (/arcane|mind|shatter|mirage|dazzl/.test(s)) return 'arcane'; if (/shadow|death|curse|soul|void|whisper|blood|fog|devour/.test(s)) return 'dark';
      if (/poison|plague|acid|venom|toxic|slime/.test(s) || eff === 'Poison') return 'poison'; if (/divine|prayer|holy|sunshine/.test(s)) return 'holy'; return 'phys';
    },
  };
  /* ambient dread: a low drone + distant wind while a battle is on screen */
  const amb = { n: null };
  const ambient = {
    start() {
      const a = ac(); if (!a || muted || amb.n) return; const { master } = nodes(a), t = a.currentTime;
      const g = a.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + 3);
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 2;
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .07; lg.gain.value = 70; lfo.connect(lg).connect(lp.frequency);
      const o1 = a.createOscillator(), o2 = a.createOscillator(), o3 = a.createOscillator(); o1.type = o2.type = 'sawtooth'; o3.type = 'sine'; o1.frequency.value = 55; o2.frequency.value = 55.7; o3.frequency.value = 41.2;
      o1.connect(lp); o2.connect(lp); o3.connect(g); lp.connect(g); g.connect(master);
      const w = a.createBufferSource(); w.buffer = noiseBuf(a); w.loop = true; const wf = a.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = .8; const wg = a.createGain(); wg.gain.value = .014;
      const wl = a.createOscillator(), wlg = a.createGain(); wl.frequency.value = .05; wlg.gain.value = 220; wl.connect(wlg).connect(wf.frequency); w.connect(wf).connect(wg).connect(master);
      [lfo, o1, o2, o3, w, wl].forEach(x => x.start(t)); amb.n = { g, all: [lfo, o1, o2, o3, w, wl] };
    },
    stop() { const n = amb.n; if (!n) return; amb.n = null; const a = ac(); if (!a) return; try { n.g.gain.cancelScheduledValues(a.currentTime); n.g.gain.setTargetAtTime(.0001, a.currentTime, .5); n.all.forEach(x => x.stop(a.currentTime + 2)); } catch { } },
  };
  const snd = { sfx, ambient, get muted() { return muted; }, toggle() { muted = !muted; localStorage.setItem('wb_mute', muted ? '1' : '0'); if (muted) ambient.stop(); else sfx.click(); return muted; },
    /** render a sound offline and report loudness (used by the test-suite) */
    async measure(name, args = []) { const oc = new OfflineAudioContext(2, 44100 * 4, 44100); WB._ctxOverride = oc; const was = muted; muted = false; try { sfx[name](...args); const buf = await oc.startRendering(); let peak = 0, sum = 0, n = 0; for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; n++; } } return { peak, rms: Math.sqrt(sum / n) }; } finally { WB._ctxOverride = null; muted = was; } } };

  /* ───────── looping showcase duel (home + login art) ───────── */
  function duel(canvas, left, right, spells) {
    const fx = new WB.FX(canvas); let on = true, i = 0;
    const pt = el => { const r = el.getBoundingClientRect(), b = canvas.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height * .4 }; };
    (async () => {
      await fx.sleep(1200);
      while (on && document.body.contains(canvas)) {
        const L = i % 2 === 0, [a, b] = L ? [left, right] : [right, left], name = spells[(i / 1) % spells.length | 0];
        a.classList.add('cast'); setTimeout(() => a.classList.remove('cast'), 600);
        sfx.forSpell(name); await fx.spell(name, pt(a), pt(b)); i++; await fx.sleep(1100);
      }
    })();
    return () => { on = false; fx.destroy(); };
  }
  window.WB.snd = snd; window.WB.duel = duel;
})();
