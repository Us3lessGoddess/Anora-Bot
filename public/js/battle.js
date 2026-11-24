/* Wizard Battle — battle screen: plays server events as animations */
(function () {
  'use strict';
  const { FX, EFF, rnd, pick, sleep } = window.WB;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let SPEED = 1; // 1 normal, 2 fast
  const nap = ms => sleep(ms / SPEED);

  /* ───────── the dice ───────── */
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
  function dustAt(layer, x, n = 7, hot = false) {
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i'), spark = hot && i % 2; e.className = spark ? 'dspark' : 'dpuff'; e.style.left = `calc(50% + ${x}px)`; layer.appendChild(e);
      const dx = rnd(-70, 70), dy = -rnd(10, spark ? 100 : 46);
      e.animate([{ transform: 'translate(0,0) scale(.4)', opacity: spark ? 1 : .8 }, { transform: `translate(${dx}px,${dy}px) scale(${spark ? .25 : 1.7})`, opacity: 0 }], { duration: (spark ? 650 : 950) / SPEED, easing: 'ease-out' }).onfinish = () => e.remove();
    }
  }
  /** Roll a 3D die inside `layer`: thrown onto an engraved stone disc, three bounces, dust and embers, then a verdict. */
  async function rollDie(layer, ev, opts = {}) {
    const snd = WB.snd.sfx, who = ev.who === 'p' ? (opts.pName || 'YOU') : (opts.eName || 'FOE');
    layer.className = 'dice-layer on' + (ev.kind === 'check' && !opts.big ? ' small' : '');
    layer.innerHTML = `<div class="dice-box"><div class="dice-title"><span>${esc(String(who).toUpperCase())}</span><b>${esc(ev.label || 'Roll')}</b></div><div class="dice-stage"><div class="tray">${WB.runeCircle()}</div>${WB.dieHTML()}<div class="dfx"></div></div><div class="dice-res"></div></div>`;
    const wrap = layer.querySelector('.die-wrap'), die = layer.querySelector('.die'), sh = layer.querySelector('.die-shadow'), res = layer.querySelector('.dice-res'), fxl = layer.querySelector('.dfx'), box = layer.querySelector('.dice-box');
    const [X, Y] = FACE_ROT[ev.v], R = () => Math.floor(rnd(0, 360)), dur = 1700 / SPEED;
    snd.dice();
    let tick = null; if (opts.onTick) { let i = 0; tick = setInterval(() => opts.onTick(i++ % 6), 90 / SPEED); }
    const spin = die.animate([
      { transform: `rotateX(${R()}deg) rotateY(${R()}deg) rotateZ(${R()}deg)` },
      { transform: `rotateX(${R() + 540}deg) rotateY(${R() + 360}deg) rotateZ(${R()}deg)`, offset: .35 },
      { transform: `rotateX(${R() + 900}deg) rotateY(${R() + 720}deg) rotateZ(${R()}deg)`, offset: .7 },
      { transform: `rotateX(${X + 1080}deg) rotateY(${Y + 1080}deg) rotateZ(360deg)` }], { duration: dur, easing: 'cubic-bezier(.1,.65,.2,1)', fill: 'forwards' });
    const hop = (x, y, off, e) => ({ translate: `${x}px ${y}px`, offset: off, easing: e });
    wrap.animate([hop(-340, -260, 0, 'ease-in'), hop(-175, 0, .26, 'ease-out'), hop(-122, -90, .41, 'ease-in'), hop(-72, 0, .54, 'ease-out'), hop(-40, -36, .66, 'ease-in'), hop(-15, 0, .76, 'ease-out'), hop(-6, -9, .85, 'ease-in'), hop(0, 0, 1, 'ease-out')], { duration: dur, fill: 'forwards' });
    sh.animate([{ transform: 'translateX(-340px) scale(.2)', opacity: .1, offset: 0 }, { transform: 'translateX(-175px) scale(1)', opacity: .65, offset: .26 }, { transform: 'translateX(-122px) scale(.5)', opacity: .3, offset: .41 }, { transform: 'translateX(-72px) scale(1)', opacity: .65, offset: .54 }, { transform: 'translateX(-40px) scale(.7)', opacity: .4, offset: .66 }, { transform: 'translateX(-15px) scale(1)', opacity: .65, offset: .76 }, { transform: 'translateX(0) scale(1)', opacity: .65, offset: 1 }], { duration: dur, fill: 'forwards' });
    [[.26, -175], [.54, -72], [.76, -15]].forEach(([o, x], i) => setTimeout(() => { snd.land(); dustAt(fxl, x, i === 2 ? 6 : 8, i < 2); box.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${4 - i}px)` }, { transform: 'translateY(0)' }], { duration: 140 / SPEED }); }, dur * o));
    await spin.finished.catch(() => { });
    if (tick) clearInterval(tick);
    const good = ev.kind === 'check' ? ev.ok : true; die.classList.add('fin', good ? 'ok' : 'no'); snd.settle(good); dustAt(fxl, 0, 4, true);
    if (ev.kind === 'check') {
      res.innerHTML = `<div class="verdict ${ev.ok ? 'ok' : 'no'}"><span class="num">${ev.v}</span><div><b>${ev.v % 2 ? 'ODD' : 'EVEN'}</b><small>${ev.ok ? 'Fate favours you' : 'The dice deny you'}</small></div></div>`;
      if (!ev.ok) box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 360 / SPEED });
    } else if (ev.kind === 'slot' && opts.slotName !== undefined) res.innerHTML = `<div class="verdict ok"><span class="num">${ev.v}</span><div><b>${opts.slotName ? esc(opts.slotName) : 'Empty slot'}</b><small>${opts.slotName ? 'The spell is chosen' : 'Nothing to cast'}</small></div></div>`;
    else res.innerHTML = `<div class="verdict ok"><span class="num">${ev.v}</span></div>`;
    await nap(ev.kind === 'check' ? 800 : 950);
    layer.className = 'dice-layer'; layer.innerHTML = '';
  }
  WB.rollDie = rollDie; WB.setSpeed = v => { SPEED = v; };

  /** Standalone dice modal (daily lottery, key/chest rolls) */
  async function diceModal(v, label, resultHtml) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal panel center" style="position:relative;height:420px;background:linear-gradient(#0a0d14d0,#0a0d14f2),url(/img/scenes/lottery.jpg) center/cover"><div class="dice-layer on" style="background:none;position:absolute;inset:0"></div></div>`; document.body.appendChild(bg);
    const layer = bg.querySelector('.dice-layer');
    await rollDie(layer, { v, label, who: 'p', kind: 'roll' }, { pName: 'THE DICE' });
    bg.querySelector('.modal').innerHTML = `<div class="result-icon">🎲</div><h2 class="title" style="margin:6px 0">You rolled a ${v}!</h2><div style="font-size:1.25rem">${resultHtml}</div><p style="margin-top:16px"><button class="btn" id="dm-ok">Excellent</button></p>`;
    await new Promise(r => { bg.querySelector('#dm-ok').onclick = () => { bg.remove(); r(); }; });
  }
  WB.diceModal = diceModal;

  /* ───────── confetti ───────── */
  function confetti(n = 70) { const cols = ['#E0F8C7', '#B7D894', '#f2c94c', '#8fd8ff', '#ff8f98']; for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.className = 'confetti'; e.style.cssText = `left:${rnd(0, 100)}vw;width:${rnd(6, 11)}px;height:${rnd(10, 18)}px;background:${pick(cols)};animation-duration:${rnd(2.2, 4)}s;animation-delay:${rnd(0, .8)}s;border-radius:2px`; document.body.appendChild(e); setTimeout(() => e.remove(), 5200); } }

  /* ───────── mount a battle ───────── */
  const DUEL = new Set(['arena', 'castle', 'pvp']);
  const NAMES = { fort: 'Abandoned Fort', boss: 'World Boss', arena: 'Arena', dungeon: 'Trials Dungeon', castle: 'The Castle', pvp: 'Live PvP' };
  function mount(root, view, events, ctx) {
    const D = ctx.data, SP = Object.fromEntries(D.spells.map(s => [s.name, s]));
    const mode = view.mode, pv = mode === 'pvp' ? ctx.pvp : null;
    const st = { eff: { p: {}, e: {} }, busy: false, dead: false, intervals: [], auto: false, timer: null, floor: (view.meta && view.meta.floor) || 1, earned: (view.meta && view.meta.earned) || 0, enemy: view.e.name };
    SPEED = 1;
    const canAuto = mode === 'fort' || mode === 'boss' || mode === 'dungeon';

    /* what the enemy side looks like */
    const enemyArt = (name, c) => {
      if ((mode === 'fort' || mode === 'dungeon') && WB.MONART[name]) { const a = WB.MONART[name]; return { ...a, url: `/img/monsters/${a.slug}.jpg` }; }
      if (mode === 'dungeon') { const sp = name === 'Dwarf' ? WB.itemImg("Dwarf's Helmet", 'dwarf') : '<div class="wisp"></div>'; return { url: '/img/scenes/empty-ruins.jpg', cx: .64, cy: .56, w: .22, h: .5, empty: true, sprite: sp }; }
      if (mode === 'boss' && c.image) return { url: c.image, cx: .6, cy: .52, w: .3, h: .72, boss: true };
      return null;
    };
    let art = enemyArt(view.e.name, view.e);
    const bt = mode === 'boss' && WB.BOSS[view.e.name] ? WB.BOSS[view.e.name] : null;
    const spriteOf = c => (c.kind === 'player' || c.kind === 'arena') ? WB.wizard(c.cls, c.gender) : WB.monster(c.name, c.kind === 'boss' ? c.image : null);
    const hud = (c, side) => `<div class="hud ${side}" id="hb${side}"><div class="nm">${esc(c.name)}${c.level ? ` <span>Lv ${c.level}</span>` : ''}</div><div class="hp"><div class="ghost"></div><div class="now"></div><span></span></div><div class="chips"></div></div>`;
    const auras = '<div class="aura aura-freeze"></div><div class="aura aura-stun"></div><div class="aura aura-blind"></div><div class="aura aura-confuse"></div>';
    const eStyle = a => `left:${(a.cx - a.w / 2) * 100}%;top:${(a.cy - a.h / 2) * 100}%;width:${a.w * 100}%;height:${a.h * 100}%`;
    const enemyHTML = () => art
      ? `<div class="fighter e art-e" id="fe" style="${eStyle(art)}"><div class="sprite" id="esp">${art.sprite ? art.sprite : art.boss ? `<div id="bossfb" style="display:none;height:100%;align-items:center;justify-content:center">${WB.monster(view.e.name, null)}</div>` : ''}</div>${auras}</div>`
      : `<div class="fighter e ${view.e.kind === 'arena' ? 'arena-e' : ''}" id="fe"><div class="sprite" id="esp">${spriteOf(view.e)}</div>${auras}</div>`;
    const bgHTML = DUEL.has(mode) ? '<div class="bg-art duelbg" id="bgart" style="background-image:url(/img/scenes/arena-bg.jpg)"></div>' : art ? `<div class="bg-art" id="bgart" style="background-image:url(${art.url})"></div>` : '<div class="floor"></div>';
    root.innerHTML = `<div class="row between" style="margin-bottom:10px"><h2 class="title" style="margin:0;flex:1">${NAMES[mode]}<small>${esc(view.p.name)} vs ${esc(view.e.name)}</small></h2><span class="chip" id="b-round">Round ${view.round}</span></div>
    <div class="stage ${mode} ${art ? 'art' : ''} ${DUEL.has(mode) ? 'duel' : ''}" id="stage"><div class="cam" id="cam">${bgHTML}<div class="vignette"></div>
      <div class="fighter p" id="fp"><div class="sprite">${spriteOf(view.p)}</div>${auras}</div>${enemyHTML()}<canvas id="fxc"></canvas></div>
      <div class="round-tag" id="rtag">ROUND ${view.round}</div>${mode !== 'arena' && !DUEL.has(mode) ? '<div class="earn" id="earn"></div>' : ''}
      ${hud(view.p, 'p')}${hud(view.e, 'e')}<div class="dice-layer" id="dl"></div></div>
    <div class="spellbar" id="sb"></div>
    <div class="controls"><button class="btn big" id="roll">🎲 Roll spell dice</button>${canAuto ? '<button class="btn alt" id="auto">▶ Auto roll</button><button class="btn alt" id="fast">⏩ Speed up</button>' : ''}<button class="btn danger sm" id="ret">🏳️ ${mode === 'pvp' ? 'Forfeit' : DUEL.has(mode) ? 'Flee' : 'Retreat'}</button></div>
    ${pv ? '<p class="center muted" id="turnmsg" style="margin:-6px 0 10px"></p>' : ''}<div class="log" id="log"></div>`;
    const $ = s => root.querySelector(s), stage = $('#stage'), fx = new FX($('#fxc')), F = { p: $('#fp'), e: $('#fe') }, HB = { p: $('#hbp'), e: $('#hbe') };
    let bg = $('#bgart'); const tintBg = () => bg && art && !art.empty && !art.boss ? bg : null;
    if (bt) { stage.style.background = `radial-gradient(ellipse at 50% 15%, ${bt.bg}, #0d1017 78%)`; const id = setInterval(() => { const w = fx.w, h = fx.h; if (bt.fx === 'snow') fx.p({ x: rnd(0, w), y: -8, vx: rnd(-25, 10), vy: rnd(40, 90), life: 5, size: rnd(1, 2.4), color: '#fff', shape: 'solid', fade: false }); else if (bt.fx === 'ember') fx.ember(rnd(0, w), h + 6, {}); else if (bt.fx === 'bubble') fx.p({ x: rnd(0, w), y: h + 8, vy: rnd(-60, -25), life: 5, size: rnd(3, 7), s2: rnd(8, 13), shape: 'ring', color: '#a9c95a', w: 1 }); else fx.p({ x: rnd(-10, w), y: rnd(h * .5, h), vx: rnd(30, 70), life: 4, size: rnd(8, 16), s2: rnd(24, 36), shape: 'puff', color: '#c9a77a', a: .1, add: false }); }, 120); st.intervals.push(id); }
    if (art && art.boss) { const pr = new Image(); pr.onerror = () => { const fb = $('#bossfb'); if (fb) fb.style.display = 'flex'; }; pr.src = art.url; }
    ctx.onLeave(() => { fx.destroy(); st.dead = true; clearTimeout(st.timer); st.intervals.forEach(clearInterval); WB.snd.ambient.stop(); });
    WB.snd.ambient.start();
    st.intervals.push(setInterval(() => { if (bt) return; const w = fx.w, h = fx.h; if (DUEL.has(mode)) { if (Math.random() < .7) fx.p({ x: rnd(0, w), y: rnd(h * .4, h), vx: rnd(6, 24), vy: rnd(-8, 4), life: 5, size: rnd(.8, 2), color: '#d9c9a0', a: .35, shape: 'solid', add: false }); if (Math.random() < .12) fx.ember(rnd(0, w), h * .9, {}); } else { if (Math.random() < .5) fx.p({ x: rnd(-20, w), y: rnd(h * .55, h), vx: rnd(10, 28), vy: rnd(-4, 4), life: 6, size: rnd(14, 26), s2: rnd(50, 80), color: '#a9b8c4', a: .06, shape: 'puff', add: false }); if (Math.random() < .18) fx.ember(rnd(0, w), h + 4, {}); } }, 200));

    const syncPos = () => { for (const sd of ['p', 'e']) { const f = F[sd]; fx.pos[sd] = { x: f.offsetLeft + f.offsetWidth / 2, y: f.offsetTop + f.offsetHeight * .46, rw: f.offsetWidth, rh: f.offsetHeight }; } };
    F.p.style.setProperty('--dir', 1); F.e.style.setProperty('--dir', -1);
    syncPos(); st.intervals.push(setInterval(syncPos, 160));

    const maxHp = { p: view.p.maxHp, e: view.e.maxHp }, hpNow = { p: view.p.hp, e: view.e.hp };
    function setHp(side, hp) {
      hpNow[side] = hp; const pct = Math.max(0, hp / maxHp[side] * 100), box = HB[side].querySelector('.hp');
      box.querySelector('.now').style.width = pct + '%'; box.querySelector('.ghost').style.width = pct + '%'; box.classList.toggle('low', pct < 30);
      box.querySelector('span').textContent = `${Math.max(0, Math.round(hp)).toLocaleString('en-US')} / ${maxHp[side].toLocaleString('en-US')}`;
    }
    const fresh = !!(events && events.length);
    setHp('p', fresh ? maxHp.p : view.p.hp); setHp('e', fresh ? maxHp.e : view.e.hp);
    function setEff(side, map) {
      const cur = st.eff[side], tb = side === 'e' ? tintBg() : null;
      for (const k of Object.keys(cur)) if (!(k in map)) { F[side].classList.remove('has-' + k); if (tb) tb.classList.remove('has-' + k); fx.setAura(side, k, false); }
      for (const k of Object.keys(map)) if (!(k in cur)) { F[side].classList.add('has-' + k); if (tb) tb.classList.add('has-' + k); fx.setAura(side, k, true); }
      st.eff[side] = { ...map };
      HB[side].querySelector('.chips').innerHTML = Object.entries(map).map(([k, d]) => `<span class="echip" style="color:${EFF[k] ? EFF[k].c : '#fff'}" title="${k}">${EFF[k] ? EFF[k].i : ''} ${k} ${d}</span>`).join('');
    }
    if (!fresh) { setEff('p', view.p.eff); setEff('e', view.e.eff); }

    function renderBar(spells) {
      $('#sb').innerHTML = spells.map((n, i) => { const s = n && SP[n]; return `<div class="sb ${s ? '' : 'empty'}" data-i="${i}"><span class="d">${i + 1}</span>${s ? `<b>${esc(n)}</b>${s.dmg ? '💥' + s.dmg + ' ' : ''}${s.heal ? '💚' + s.heal + ' ' : ''}${s.eff ? (EFF[s.eff] ? EFF[s.eff].i : '') : ''}` : '<b>empty</b>'}</div>`; }).join('');
    }
    renderBar(view.spells);
    const slotEl = i => $(`#sb .sb[data-i="${i}"]`);

    const log = (t, cls = '') => { const p = document.createElement('p'); p.className = cls; p.textContent = t; $('#log').prepend(p); };
    const popup = (side, text, cls = 'dmg', big = false) => { const p = fx.pos[side]; if (!p) return; const d = document.createElement('div'); d.className = `dn ${cls} ${big ? 'big' : ''}`; d.textContent = text; d.style.left = (p.x + rnd(-14, 14)) + 'px'; d.style.top = (p.y - p.rh * .42) + 'px'; stage.appendChild(d); setTimeout(() => d.remove(), 1400); };
    const shake = (mag = 8, ms = 300) => { stage.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-mag}px,${mag / 2}px)` }, { transform: `translate(${mag}px,${-mag / 2}px)` }, { transform: `translate(${-mag / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: ms / SPEED }); };
    fx.shakeFn = shake;
    const addCls = (el, c, ms) => { el.classList.add(c); setTimeout(() => el.classList.remove(c), ms / SPEED); };
    const animCls = (el, c, ms) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); setTimeout(() => el.classList.remove(c), ms / SPEED); };
    const bgE = () => art && !art.empty && bg;           // enemy is painted into the scene picture
    const hitFx = (side, c, ms) => { if (c !== 'hit') { addCls(F[side], c, ms); return; } if (side === 'e' && bgE()) animCls(bg, 'hit', ms); else animCls(F[side], 'a-hit', ms + 100); };
    const cam = $('#cam');
    const camPush = (from, to, sc = 1.04, ms = 1400) => { const a = fx.pos[from], b = fx.pos[to]; if (!a || !b) return; cam.style.transformOrigin = `${(a.x + b.x) / 2}px ${(a.y + b.y) / 2}px`; cam.animate([{ transform: 'scale(1)' }, { transform: `scale(${sc})`, offset: .3 }, { transform: `scale(${sc})`, offset: .72 }, { transform: 'scale(1)' }], { duration: ms / SPEED, easing: 'ease-in-out' }); };
    const camPunch = (side, sc, ms) => { const p = fx.pos[side]; if (!p) return; cam.style.transformOrigin = `${p.x}px ${p.y}px`; cam.animate([{ transform: 'scale(1)' }, { transform: `scale(${sc})`, offset: .22 }, { transform: 'scale(1)' }], { duration: ms / SPEED, easing: 'ease-out' }); };
    const hitStop = async ms => { const sp = fx.speed; fx.speed = .04; stage.classList.add('frozen'); await sleep(ms); stage.classList.remove('frozen'); fx.speed = sp; };
    const gather = (side, col, rise) => { const s = fx.pos[side], dir = side === 'p' ? 1 : -1, hx = s.x + dir * s.rw * .28, hy = s.y - s.rh * .04; for (let i = 0; i < 18; i++) { const an = rnd(0, 6.28), r = rnd(40, 85); fx.p({ x: hx + Math.cos(an) * r, y: hy + Math.sin(an) * r, vx: -Math.cos(an) * r * 3.2, vy: -Math.sin(an) * r * 3.2 + (rise ? -40 : 0), size: rnd(1.4, 2.6), color: col, life: .3, shape: 'solid' }); } fx.p({ x: hx, y: hy, size: 10, s2: 24, color: col, a: .5, life: .4, shape: 'puff' }); };
    const earn = () => { const e = $('#earn'); if (!e) return; const m = view.meta; e.innerHTML = mode === 'fort' ? `${WB.coin} ${m.earned.coins} · ${'💎'} ${m.earned.gems} · ⚔️ ${m.kills}/${m.limit}` : mode === 'dungeon' ? `Floor ${st.floor} · ${WB.coin} ${st.earned}` : `💥 Damage dealt: ${(m.startHp - Math.max(0, hpNow.e)).toLocaleString('en-US')}`; };
    earn();

    /* swap the enemy (new dungeon floor) */
    function changeEnemy(name, hp, mx) {
      st.enemy = name; maxHp.e = mx; const nm = HB.e.querySelector('.nm'); nm.textContent = name;
      const old = tintBg(); if (old) { for (const k of Object.keys(st.eff.e)) old.classList.remove('has-' + k); }
      const na = enemyArt(name, { name }); art = na;
      if (na) { bg.style.backgroundImage = `url(${na.url})`; bg.classList.toggle('duelbg', false); Object.assign(F.e.style, { left: (na.cx - na.w / 2) * 100 + '%', top: (na.cy - na.h / 2) * 100 + '%', width: na.w * 100 + '%', height: na.h * 100 + '%' }); $('#esp').innerHTML = na.sprite || ''; }
      setHp('e', hp); setEff('e', {}); syncPos();
    }

    /* ── event player ── */
    async function play(evs) {
      for (const ev of evs) {
        if (st.dead) return; syncPos();
        switch (ev.t) {
          case 'round': $('#rtag').textContent = `ROUND ${ev.n}`; $('#b-round').textContent = `Round ${ev.n}`; log(`— Round ${ev.n} —`, 'rd'); view.round = ev.n; break;
          case 'turn': F.p.classList.toggle('active', ev.who === 'p'); F.e.classList.toggle('active', ev.who === 'e'); break;
          case 'dice': {
            const o = { pName: view.p.name, eName: view.e.name }; let hl = -1;
            if (ev.kind === 'slot' && ev.who === 'p') { o.onTick = i => { if (hl >= 0) slotEl(hl).classList.remove('tick'); hl = i; slotEl(i).classList.add('tick'); }; o.slotName = view.spells[ev.v - 1] || null; }
            if (ev.kind === 'init' || ev.kind === 'roll') o.big = true;
            await rollDie($('#dl'), ev, o);
            if (hl >= 0) slotEl(hl).classList.remove('tick');
            if (ev.kind === 'slot' && ev.who === 'p') { slotEl(ev.v - 1).classList.add('picked'); setTimeout(() => slotEl(ev.v - 1) && slotEl(ev.v - 1).classList.remove('picked'), 1800 / SPEED); }
            log(`🎲 ${ev.label}: rolled ${ev.v}${ev.kind === 'check' ? (ev.ok ? ' — success ✓' : ' — failed ✗') : ''}`); break;
          }
          case 'item': log(ev.text); popup(ev.who, ev.item, 'txt'); fx.shock(fx.pos[ev.who].x, fx.pos[ev.who].y, 90, '#cfe3b8', .6); await nap(500); break;
          case 'skip': { log(ev.text); const L = { freeze: 'FROZEN', stun: 'STUNNED', blind: 'MISSED', empty: 'EMPTY SLOT' }[ev.why]; popup(ev.who, L, 'txt', true); if (ev.why === 'freeze') fx.grade('#b7e0f4', .2, .3); if (ev.why === 'blind') fx.smoke(fx.pos[ev.who].x, fx.pos[ev.who].y - 40, { n: 4, c: '#120d1c', a: .5 }); if (ev.why === 'stun') shake(5, 250); await nap(700); break; }
          case 'confused': log(ev.text); { const q = fx.pos[ev.who]; for (let i = 0; i < 3; i++) fx.p({ x: q.x, y: q.y - q.rh * .3, shape: 'ring', color: '#b583d6', size: 6, s2: 50 + i * 14, life: .7, w: 1.4, a: .6 }); popup(ev.who, 'CONFUSED', 'txt', true); } await nap(500); break;
          case 'block': log(ev.text); animCls(F[ev.who], 'a-block', 750); { const sh = document.createElement('div'); sh.className = 'shield'; F[ev.who].appendChild(sh); setTimeout(() => sh.remove(), 1300 / SPEED); popup(ev.who, 'BLOCKED', 'txt', true); fx.shock(fx.pos[ev.who].x, fx.pos[ev.who].y, 130, '#e0edc8', .6); fx.sparks(fx.pos[ev.who].x, fx.pos[ev.who].y, { n: 14, color: '#fff2c4' }); WB.snd.sfx.thump(); } await nap(900); break;
          case 'passive': log(ev.text); popup(ev.who, ev.name.toUpperCase(), 'txt', true); { const q = fx.pos[ev.who]; const col = { rage: '#e8742c', blood: '#b3202f', holy: '#f1d58a', echo: '#b79cf0', fizzle: '#8d97ab' }[ev.fx] || '#fff'; fx.shock(q.x, q.y, 130, col, .7); fx.sparks(q.x, q.y, { n: 16, color: col, g: 80 }); if (ev.fx === 'rage') fx.grade('#b3202f', .16, .3); if (ev.fx === 'holy') fx.p({ shape: 'beam', x: q.x, y: -10, x2: q.x, y2: q.y, size: 18, color: '#f1d58a', life: .6, a: .6 }); if (ev.fx === 'blood') fx.smoke(q.x, q.y, { n: 4, c: '#5a0a14', a: .4 }); } await nap(600); break;
          case 'cast': {
            log(ev.text);
            const b = document.createElement('div'); b.className = 'cast-banner'; b.style.setProperty('--c', (EFF[ev.eff] || { c: '#B7D894' }).c); b.textContent = ev.kind === 'monster' ? `${st.enemy} attacks` : ev.spell; stage.appendChild(b); setTimeout(() => b.remove(), 1200 / SPEED);
            if (ev.blocked) fx.shock(fx.pos[ev.target].x, fx.pos[ev.target].y, 100, '#e0edc8', .5);
            const meta = WB.SPELL_FX[ev.spell], arch = meta ? meta[0] : (ev.kind === 'monster' ? 'claw' : 'bolt'), mo = meta ? meta[1] : {};
            const melee = arch === 'punch' || arch === 'slash' || arch === 'claw' || (arch === 'quake' && mo.stomp) || (arch === 'drain' && mo.bite) || (arch === 'swarm' && mo.snake);
            const channel = arch === 'heal' || ev.self, src = fx.pos[ev.who], tgt = fx.pos[ev.target], cf = F[ev.who], col = mo.c1 || (EFF[ev.eff] || {}).c || '#e0f8c7';
            WB.snd.sfx.forSpell(ev.spell, ev.eff); st.lastElem = WB.snd.sfx.elem(ev.spell, ev.eff); camPush(ev.who, ev.target);
            if (ev.who === 'e' && bgE()) { bg.style.transformOrigin = `${art.cx * 100}% ${art.cy * 100}%`; animCls(bg, 'attack', 800); await fx.sleep(280); }
            else if (melee) { cf.style.setProperty('--lx', Math.max(40, Math.abs(tgt.x - src.x) - src.rw * .7) + 'px'); animCls(cf, 'a-melee', 850); await fx.sleep(360); }
            else if (channel) { animCls(cf, 'a-channel', 1000); gather(ev.who, col, true); await fx.sleep(260); }
            else { animCls(cf, 'a-cast', 780); gather(ev.who, col); await fx.sleep(320); }
            await fx.spell(ev.spell, fx.pos[ev.who], fx.pos[ev.target], { self: ev.self, monsterColor: '#e9eef7' }); break;
          }
          case 'dmg': {
            const side = ev.who; log(`💥 ${ev.src === 'dot' ? ev.eff : (ev.spell || 'Hit')}: ${side === 'p' && !view.neutral ? 'you take' : (side === 'p' ? view.p.name : view.e.name) + ' takes'} ${ev.amount}${ev.weakened ? ` (weakened −${ev.weakened})` : ''}${ev.echo ? ' (Dual Cast)' : ''}`);
            hitFx(side, 'hit', 420); popup(side, '-' + ev.amount, ev.src === 'dot' ? 'dot' : 'dmg', ev.amount >= 100); setHp(side, ev.hp);
            const big = ev.amount >= 90; if (ev.src === 'dot') WB.snd.sfx.thump(.4); else WB.snd.sfx.impact(st.lastElem || 'phys', big);
            if (big || ev.src === 'spell') camPunch(side, big ? 1.09 : 1.04, big ? 440 : 300); if (big) await hitStop(95);
            if (ev.amount >= 90) shake(9, 300); else if (ev.src === 'spell') shake(4, 200);
            if (side === 'e') earn(); await nap(420); break;
          }
          case 'heal': if (ev.amount > 0) { log(`💚 ${ev.who === 'p' && !view.neutral ? 'You heal' : (ev.who === 'p' ? view.p.name : view.e.name) + ' heals'} ${ev.amount} HP`); addCls(F[ev.who], 'heal', 800); popup(ev.who, '+' + ev.amount, 'heal', ev.amount >= 60); setHp(ev.who, ev.hp); if (ev.src !== 'spell') { const q = fx.pos[ev.who]; for (let i = 0; i < 12; i++) fx.p({ x: q.x + rnd(-30, 30), y: q.y + 30, vy: -rnd(30, 90), size: rnd(1.2, 2.4), color: '#cfe3b8', life: 1, shape: 'solid' }); } await nap(500); } break;
          case 'apply': log(ev.text); st.eff[ev.who][ev.eff] = ev.dura; setEff(ev.who, st.eff[ev.who]); fx.applyStatus(ev.who, ev.eff); if (['Freeze', 'Stun', 'Blind', 'Confuse'].includes(ev.eff)) shake(4, 200); await nap(750); break;
          case 'fizzle': log(ev.text); popup(ev.who, 'FIZZLED', 'txt'); fx.smoke(fx.pos[ev.who].x, fx.pos[ev.who].y, { n: 3, c: '#555', a: .3 }); await nap(350); break;
          case 'tick': log(`🔸 ${ev.who === 'p' && !view.neutral ? 'You take' : (ev.who === 'p' ? view.p.name : view.e.name) + ' takes'} ${ev.amount} from ${ev.eff}`); fx.statusHit(ev.who, ev.eff); hitFx(ev.who, 'hit', 420); popup(ev.who, `${EFF[ev.eff].i} -${ev.amount}`, 'dot'); setHp(ev.who, ev.hp); if (ev.who === 'e') earn(); await nap(650); break;
          case 'expire': { delete st.eff[ev.who][ev.eff]; setEff(ev.who, st.eff[ev.who]); const q = fx.pos[ev.who]; if (ev.eff === 'Freeze') { fx.shards(q.x, q.y, { n: 12, speed: [60, 220] }); fx.mist(q.x, q.y + 30, { n: 4, rw: 40, a: .25 }); } else fx.sparks(q.x, q.y, { n: 6, color: (EFF[ev.eff] || {}).c || '#fff', g: 60, speed: [30, 100] }); break; }
          case 'kill': log(ev.text); { const q = fx.pos.e; F.e.classList.add('dead'); const tb = tintBg(); if (tb) tb.classList.add('dead'); fx.sparks(q.x, q.y, { n: 24, color: '#ffd28a', g: 300 }); fx.smoke(q.x, q.y, { n: 6, a: .4, r2: 70 }); if (ev.reward) { const g = ev.reward.cur === 'gems'; popup('e', `+${ev.reward.amount} ${g ? 'gems' : 'coin' + (ev.reward.amount > 1 ? 's' : '')}`, 'heal', true); } else popup('e', `FLOOR ${ev.floor} CLEARED`, 'txt', true); WB.snd.sfx.coin(); earn(); } await nap(900); break;
          case 'reward': st.earned += ev.coins; popup('p', `+${ev.coins} coins`, 'heal', true); WB.snd.sfx.coin(); earn(); await nap(500); break;
          case 'spawn': log(ev.text); st.eff.e = {}; F.e.classList.remove('dead'); const tb2 = tintBg(); if (tb2) { tb2.classList.remove('dead'); addCls(tb2, 'spawn', 900); }
            if (mode === 'dungeon') { st.floor = ev.floor; changeEnemy(ev.name, ev.hp, ev.maxHp); const nb2 = tintBg(); if (nb2) addCls(nb2, 'spawn', 900); } else { setEff('e', {}); setHp('e', ev.hp); }
            F.e.classList.add('spawn'); setTimeout(() => F.e.classList.remove('spawn'), 800); earn(); await nap(600); break;
          case 'log': log(ev.text); break;
          case 'end': log(ev.text);
            if (ev.result === 'lose') { F.p.classList.add('dead'); WB.snd.sfx.thump(1.3); } else if (ev.result === 'win' && !bgE()) F.e.classList.add('dead');
            if (ev.result === 'win' || ev.result === 'lose' || ev.result === 'limit') await nap(1200); break;
        }
      }
    }
    function sync(v) { view = Object.assign(view, v); setHp('p', v.p.hp); setHp('e', v.e.hp); setEff('p', v.p.eff); setEff('e', v.e.eff); $('#rtag').textContent = `ROUND ${v.round}`; $('#b-round').textContent = `Round ${v.round}`; earn(); }

    WB.battle.dbg = { play: evs => play(evs), F, fx, stage };
    /* ── controls ── */
    const rollBtn = $('#roll'), premium = () => { const p = ctx.getPlayer(); return !!(p && p.speedster_until > Date.now()); };
    const fastBtn = $('#fast'), autoBtn = $('#auto');
    if (fastBtn) {
      const label = () => { fastBtn.innerHTML = premium() ? `⏩ Speed up: ${SPEED > 1 ? 'on' : 'off'}` : '🔒 Speed up'; fastBtn.classList.toggle('on', SPEED > 1); };
      label(); fastBtn.onclick = () => { if (!premium()) { ctx.toast('Speed-Up is a premium feature — get Speedster for 1 gem.', true); WB.openPremium(); return; } SPEED = SPEED === 1 ? 2.2 : 1; fx.speed = SPEED; label(); };
    }
    const stopAuto = () => { st.auto = false; clearTimeout(st.timer); if (autoBtn) { autoBtn.classList.remove('autoon'); autoBtn.innerHTML = '▶ Auto roll'; } };
    const scheduleAuto = () => { if (st.auto && !st.dead && !view.over) st.timer = setTimeout(() => { if (st.auto && !st.busy) rollBtn.click(); }, 500 / SPEED); };
    if (autoBtn) autoBtn.onclick = () => { if (st.auto) { stopAuto(); return; } st.auto = true; autoBtn.classList.add('autoon'); autoBtn.innerHTML = '⏸ Stop auto'; if (!st.busy) rollBtn.click(); };

    async function finish(res) {
      stopAuto(); rollBtn.disabled = true; $('#ret').disabled = true; clearInterval(st.poll);
      if (pv) { try { const a = await ctx.api('/api/pvp/ack', {}); ctx.setPlayer(a.player); } catch { } } else ctx.setPlayer(res.player);
      await showSummary(res.summary, view);
    }
    const turnInfo = r => { if (!pv) return; const m = $('#turnmsg'); if (!m) return; st.turnEnd = Date.now() + (r.turnLeft || 0); m.dataset.mine = r.myTurn ? '1' : ''; m.textContent = r.over ? '' : r.myTurn ? 'Your turn — roll the dice.' : `Waiting for ${view.e.name}…`; rollBtn.disabled = !r.myTurn || r.over; };
    rollBtn.onclick = async () => {
      if (st.busy) return; st.busy = true; rollBtn.disabled = true; WB.snd.sfx.click();
      try {
        const res = pv ? await ctx.api('/api/pvp/roll', { since: pv.since }) : await ctx.api('/api/battle/roll', {});
        if (pv) pv.since = res.seq; await play(res.events); sync(res.view);
        if (res.view.over) { await finish(res); return; }
        if (pv) turnInfo(res);
      } catch (e) { stopAuto(); ctx.toast(e.message, true); }
      st.busy = false; if (!pv) rollBtn.disabled = false; scheduleAuto();
    };
    $('#ret').onclick = async () => {
      stopAuto(); if (st.busy) return;
      if (!confirm(pv ? 'Forfeit this duel? It counts as a loss.' : DUEL.has(mode) ? 'Flee? This counts as a loss.' : mode === 'dungeon' ? 'Leave the dungeon? You keep your rewards and spend no energy.' : 'Retreat and bank your rewards so far?')) return;
      st.busy = true;
      try { if (pv) { await ctx.api('/api/pvp/leave', {}); ctx.toast('You forfeited the duel.'); location.hash = '#/hub'; return; } const res = await ctx.api('/api/battle/retreat', {}); await play(res.events); sync(res.view); await finish(res); } catch (e) { ctx.toast(e.message, true); st.busy = false; }
    };
    if (pv) {
      st.poll = setInterval(async () => {
        if (st.busy || st.dead) return;
        try {
          const r = await ctx.api(`/api/pvp/match?since=${pv.since}`);
          if (st.busy) return; if (r.events.length || r.over) { st.busy = true; pv.since = r.seq; await play(r.events); sync(r.view); st.busy = false; }
          if (r.over) { await finish(r); return; } turnInfo(r);
        } catch (e) { if (e.status === 404) { clearInterval(st.poll); ctx.toast('The match has ended.', true); location.hash = '#/hub'; } }
      }, 1400); st.intervals.push(st.poll);
      st.intervals.push(setInterval(() => { const m = $('#turnmsg'); if (m && m.dataset.mine && st.turnEnd) m.textContent = `Your turn — ${Math.max(0, Math.ceil((st.turnEnd - Date.now()) / 1000))}s left`; }, 500));
    }

    async function showSummary(s, v) {
      const won = s.result === 'win' || s.result === 'limit', ret = s.result === 'retreat';
      won ? (WB.snd.sfx.win(), confetti(60)) : !ret && WB.snd.sfx.lose();
      const title = s.result === 'limit' ? 'Fort cleared' : won ? 'Victory' : ret ? 'Session closed' : 'Defeated';
      const lu = s.levelUp ? `<p style="font-size:1.2rem;color:var(--mint)">Level up — ${s.levelUp.from} → <b>${s.levelUp.to}</b>${s.levelUp.milestone ? ' · +25 max HP' : ''}</p>` : '';
      const bg2 = document.createElement('div'); bg2.className = 'modal-bg';
      bg2.innerHTML = `<div class="modal panel ornate center" style="padding:30px"><span class="result-icon">${won ? '🏆' : ret ? '🏳️' : '💀'}</span><h2 class="title" style="justify-content:center;margin:6px 0 14px">${title}</h2>${lu}
        ${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}
        <p style="margin-top:10px">${s.coins ? `<span class="chip">${WB.coin} +${s.coins}</span> ` : ''}${s.gems ? `<span class="chip">💎 +${s.gems}</span> ` : ''}${s.trophies ? `<span class="chip">🏆 ${s.trophies > 0 ? '+' : ''}${s.trophies}</span>` : ''}</p>
        ${s.lottery ? `<p style="font-size:1.2rem;margin-top:10px">${s.lottery.type === 'key' ? '🗝️ You found a Key' : '🧰 You found a Chest'} <span class="muted">(rolled ${s.lottery.dice})</span></p>` : ''}
        <p style="margin-top:18px"><a class="btn" href="#/hub">Return to the Tower</a></p></div>`;
      document.body.appendChild(bg2); bg2.querySelector('a').addEventListener('click', () => bg2.remove());
    }

    (async () => {
      if (events && events.length) { st.busy = true; rollBtn.disabled = true; await nap(400); await play(events); sync(view); st.busy = false; }
      if (pv) { turnInfo({ myTurn: pv.myTurn && !view.over, over: view.over, turnLeft: pv.turnLeft }); } else if (!view.over) rollBtn.disabled = false;
      if (view.over && !pv) rollBtn.disabled = true;
    })();
  }

  WB.battle = { mount, dbg: null };
})();
