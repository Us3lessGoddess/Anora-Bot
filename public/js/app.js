/* Wizard Battle — SPA: router + pages */
(function () {
  'use strict';
  const { EFF, wizard, monster, rnd } = window.WB;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { me: null, data: null, pending: null };
  const leaves = []; const onLeave = f => leaves.push(f);
  const main = $('#main');

  /* ───────── api / toast ───────── */
  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    let d = null; try { d = await r.json(); } catch { }
    if (!r.ok) { const e = new Error((d && d.error) || 'Something went wrong'); e.status = r.status; throw e; }
    return d;
  }
  function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); }
  const ctx = { api, toast, onLeave, getPlayer: () => S.me && S.me.player, get data() { return S.data; }, setPlayer: p => { if (S.me) S.me.player = p; renderNav(); } };
  WB.api = api; WB.toast = toast;
  const P = () => S.me && S.me.player;
  const agoText = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const plink = (uid, name) => uid ? `<a href="#/player?uid=${uid}">${esc(name)}</a>` : esc(name);
  async function loadMe() { try { S.me = await api('/api/me'); } catch { S.me = null; } return S.me; }

  /* ───────── helpers ───────── */
  const SP = () => Object.fromEntries(S.data.spells.map(s => [s.name, s]));
  const I = (n, x = '') => WB.icon(n, x);
  const EFFC = { Burn: '#f0883e', Poison: '#8bd44a', Bleed: '#d6455a', Stun: '#ffd84d', Freeze: '#7fcdf0', Blind: '#a99bd6', Confuse: '#f08fdc', Weaken: '#9aa8c4', Pierce: '#E0F8C7', Heal: '#8bd44a', Damage: '#ffb84d' };
  const EFFI = { Burn: 'flame', Poison: 'skull', Bleed: 'drop', Stun: 'dizzy', Freeze: 'snow', Blind: 'eye', Confuse: 'spiral', Weaken: 'arrowdown', Pierce: 'target' };
  const effBadge = (e, extra = '') => e ? `<span class="badge eff-${e}">${EFF[e] ? EFF[e].i : ''} ${e}${extra}</span>` : '';
  const spellDesc = s => { const a = []; if (s.dmg) a.push(`Deals <b>${s.dmg}</b> damage`); if (s.heal) a.push(`heals <b>${s.heal}</b> HP`); if (s.eff === 'Pierce') a.push('ignores armor'); else if (s.eff) a.push(`${Math.round((s.ch == null ? 1 : s.ch) * 100)}% to inflict ${s.eff} (${s.dura} turn${s.dura > 1 ? 's' : ''})`); return a.join(', ') + '.'; };
  const spellColor = s => s.eff ? EFFC[s.eff] : s.heal ? EFFC.Heal : EFFC.Damage;
  const spellIcon = s => s.eff ? EFFI[s.eff] : s.heal ? 'heal' : 'burst';
  function spellCard(s, o = {}) {
    const p = P(), owned = p && p.spells_owned.includes(s.name), locked = p && p.level < s.lv;
    const chance = s.eff && s.eff !== 'Pierce' ? Math.round((s.ch == null ? 1 : s.ch) * 100) + '%' : '—';
    return `<div class="sp-card ${owned ? 'owned' : ''} ${locked && !owned ? 'locked' : ''} ${o.cls || ''}" style="--ec:${spellColor(s)}" data-spell="${esc(s.name)}">
      <div class="sp-head"><div class="sp-ic">${I(spellIcon(s))}</div><h4>${esc(s.name)}</h4><span class="lv">LV ${s.lv}</span></div>
      <div class="sp-desc">${spellDesc(s)}</div>
      <div class="sp-stats"><div><small>Damage</small><b>${s.dmg || '—'}</b></div><div><small>Heal</small><b>${s.heal || '—'}</b></div><div><small>Chance</small><b>${chance}</b></div><div><small>Turns</small><b>${s.dura || '—'}</b></div></div>
      ${o.shop ? `<div class="sp-foot"><span class="sp-price">${WB.coin} ${s.price}</span>${owned ? `<span class="sp-own">${I('check')} LEARNED</span>` : `<button class="btn sm" data-buy="${esc(s.name)}" ${locked || p.coins < s.price ? 'disabled' : ''}>${locked ? I('lock') + ' Lv ' + s.lv : 'Learn'}</button>`}</div>` : ''}
    </div>`;
  }
  const mmss = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
  const pips = e => `<span class="pips">${Array.from({ length: e.cap }, (_, i) => `<i class="${i < e.val ? 'on' : ''}"></i>`).join('')}</span>`;
  const lore = { Paladin: ['The Ironbound', 'Forged in holy war, Paladins are living fortresses. Every third breath is a prayer that turns aside blades, fire and fate alike.', 'Every 3rd round: roll — Even blocks ALL incoming damage & effects. Also +50% damage (Holy Punishment).', 'Defensive tank'], Barbarian: ['The Rampager', 'Where scholars see tactics, the Barbarian sees an obstacle to destroy. A primal surge doubles the devastation.', 'Every 4th round: Even = double damage (Blood Frenzy). Every 3rd round: Even = heal 40 HP (Bloodthirst).', 'Burst damage'], Apprentice: ['The Channeler', 'Half-trained and twice as reckless, the Apprentice has cracked the sealed tomes of echo-magic. Sometimes the spell slips through twice.', 'Every 3rd round: roll — Even = bonus damage echo, another roll doubles effect duration. Double fizzle heals 10 HP.', 'High variance'] };

  /* ───────── nav ───────── */
  function renderNav() {
    const p = P(), h = (location.hash.split('?')[0] || '#/');
    const L = (href, t, cls = '') => `<a class="l ${h === href ? 'on' : ''} ${cls}" href="${href}">${t}</a>`;
    $('#nav').innerHTML = `<a class="brand" href="${p ? '#/hub' : '#/'}">${WB.logo()}<span>WIZARD <b>BATTLE</b></span></a>
      ${p ? L('#/hub', 'Tower') + L('#/fort', 'Fort') + L('#/boss', 'Boss') + L('#/arena', 'Arena') + L('#/shop', 'Shop', 'hide-m') + L('#/spells', 'Spellbook', 'hide-m') + L('#/library', 'Library', 'hide-m') + L('#/board', 'Ranks', 'hide-m') : L('#/', 'Home') + L('#/library', 'Library') + L('#/board', 'Ranks')}
      <span class="sp"></span>
      ${p ? `<button class="wallet" id="onl" title="Players online (last hour)"><i class="dot on" style="margin:0"></i><span id="online-count">${WB.social ? WB.social.online : 0}</span>${I('users')}</button><span class="wallet" title="Coins">${WB.coin} ${p.coins}</span><button class="wallet" id="gems" title="Premium shop">${I('gem')} ${p.gems} ${I('plus')}</button>` : ''}
      <button class="icon-btn" id="snd" title="Sound">${I(WB.snd.muted ? 'mute' : 'speaker')}</button>
      ${S.me ? `<button class="icon-btn" id="out" title="Log out">${I('logout')}</button>` : `<a class="btn sm alt" href="#/login">Log in</a><a class="btn sm" href="#/signup">Sign up</a>`}`;
    $('#snd').onclick = () => { WB.snd.toggle(); renderNav(); };
    const g = $('#gems'); if (g) g.onclick = openPremium; const on = $('#onl'); if (on) on.onclick = () => WB.social.openOnline();
    const o = $('#out'); if (o) o.onclick = async () => { await api('/api/logout', {}); S.me = null; location.hash = '#/'; renderNav(); };
  }

  /* ───────── premium shop (gems) ───────── */
  function openPremium() {
    const p = P(); if (!p) return;
    document.querySelectorAll('.modal-bg.prem-bg').forEach(e => e.remove());
    const bg = document.createElement('div'); bg.className = 'modal-bg prem-bg';
    const draw = () => {
      const q = P(), left = Math.max(0, q.speedster_until - Date.now()), active = left > 0, d = Math.floor(left / 86400000), h = Math.floor(left % 86400000 / 3600000);
      const offer = (ic, t, desc, status, id, label, off) => `<div class="offer"><div class="oi">${I(ic)}</div><div><h4>${t}</h4><p>${desc}</p><div class="active">${status}</div></div><div><div class="price">${I('gem')} 1</div><button class="btn sm" id="${id}" ${off ? 'disabled' : ''}>${label}</button></div></div>`;
      bg.innerHTML = `<div class="modal panel ornate prem"><button class="x-close" id="pc">${I('x')}</button>
        <h2>Premium Shop</h2><p class="muted" style="margin-bottom:12px">Spend gems for convenience. You have <b style="color:#7fcdf0">${I('gem')} ${q.gems}</b> gems.</p>
        ${offer('fast', 'Speedster', 'Unlocks the Speed-Up button in Fort and Boss battles for 1 week. Buying again adds another week.', active ? `Active — ${d}d ${h}h remaining` : 'Not active', 'b-sp', active ? 'Extend' : 'Buy', q.gems < 1)}
        ${offer('swords', 'Extra Boss Attack', 'Adds +1 Boss energy (works above the usual cap) so you can attack the World Boss again.', `Today: ${q.daily.boss_buys}/10 · Energy ${q.energy.boss.val}`, 'b-bo', 'Buy', q.gems < 1 || q.daily.boss_buys >= 10)}
        ${offer('refresh', 'Refresh Arena Energy', 'Adds +1 Arena energy for offline Arena duels against bot-controlled rivals. Not used for live player-vs-player.', `Today: ${q.daily.arena_buys}/10 · Energy ${q.energy.arena.val}`, 'b-ar', 'Buy', q.gems < 1 || q.daily.arena_buys >= 10)}
        <p class="muted" style="font-size:.82rem;margin-top:6px">Daily limits reset at midnight Philippine time. Gems drop from rare fort monsters, chests and more.</p></div>`;
      const close = () => { bg.remove(); const r = (location.hash.split('?')[0]); if (['#/boss', '#/arena', '#/hub'].includes(r)) route(); };
      $('#pc', bg).onclick = close; bg.onclick = e => { if (e.target === bg) close(); };
      const buy = (id, url, msg) => { const b = $('#' + id, bg); b.onclick = async () => { b.disabled = true; try { const r = await api(url, {}); ctx.setPlayer(r.player); WB.snd.sfx.coin(); toast(msg); draw(); } catch (e) { toast(e.message, true); WB.snd.sfx.no(); draw(); } }; };
      buy('b-sp', '/api/premium/speedster', 'Speedster activated for 1 week.'); buy('b-bo', '/api/premium/boss-energy', '+1 Boss energy'); buy('b-ar', '/api/premium/arena-energy', '+1 Arena energy');
    };
    draw(); document.body.appendChild(bg);
  }
  WB.openPremium = openPremium;

  /* ───────── router ───────── */
  const routes = {
    '/': { render: home }, '/login': { render: login }, '/signup': { render: signup }, '/library': { render: library }, '/board': { render: board },
    '/onboard': { auth: true, render: onboard }, '/profile': { auth: true, need: true, render: profile }, '/player': { auth: true, need: true, render: playerPage }, '/dungeon': { auth: true, need: true, render: dungeon }, '/castle': { auth: true, need: true, render: castle }, '/bounty': { auth: true, need: true, render: bounty }, '/trader': { auth: true, need: true, render: trader }, '/pvp': { auth: true, need: true, render: pvp }, '/pvpbattle': { auth: true, need: true, render: pvpbattle }, '/hub': { auth: true, need: true, render: hub }, '/shop': { auth: true, need: true, render: shop }, '/spells': { auth: true, need: true, render: spellbook },
    '/fort': { auth: true, need: true, render: fort }, '/boss': { auth: true, need: true, render: boss }, '/arena': { auth: true, need: true, render: arena }, '/battle': { auth: true, need: true, render: battle },
  };
  async function route() {
    while (leaves.length) try { leaves.pop()(); } catch { }
    document.body.querySelectorAll('.modal-bg').forEach(e => e.remove());
    const path = (location.hash.slice(1) || '/').split('?')[0], r = routes[path] || routes['/'];
    if (!S.data) S.data = await api('/api/data');
    await loadMe();
    if (r.auth && !S.me) { location.hash = '#/login'; return; }
    if (r.need && !P()) { location.hash = '#/onboard'; return; }
    if ((path === '/login' || path === '/signup') && S.me) { location.hash = P() ? '#/hub' : '#/onboard'; return; }
    renderNav(); window.scrollTo(0, 0);
    if (S.me && P()) WB.social.start(); else WB.social.stop();
    try { await r.render(); } catch (e) { main.innerHTML = `<div class="panel center"><h2 class="title">The magic fizzled</h2><p>${esc(e.message)}</p></div>`; console.error(e); }
  }
  addEventListener('hashchange', route);

  /* ═════════ HOME ═════════ */
  function home() {
    const sp = ['Fire Ball', 'Ice Arrow', 'Thunder Wave', 'Icicle Spears', 'Meteor Shower', 'Solarbeam', 'Acid Rain', 'Death Mark', 'Flash Freeze', 'Venom Strike', 'Crushing Waves', 'Divine Judgement', 'Soul Bind', 'Diamond Arrow'];
    const chips = S.data.spells.map(s => `<span class="spchip">${I(spellIcon(s))} ${esc(s.name)}</span>`).join('');
    const beasts = ['baby-dragon|Baby Dragon', 'stone-golem|Stone Golem', 'enchantress|Enchantress', 'treant|Treant', 'cavalier|Cavalier', 'witch|Witch'].map(x => { const [sl, n] = x.split('|'); return `<div class="beast" style="background-image:url(/img/monsters/${sl}-card.jpg)"><b>${n}</b></div>`; }).join('');
    main.innerHTML = `<div class="home"><div class="backdrop"></div>${WB.skyline()}
      <div class="hero"><div class="kicker">A DUEL OF SPELLS &amp; FATE</div><h1>WIZARD<span>BATTLE</span></h1>
        <p class="sub">Roll the dice and the spell chooses you. Slay the beasts of a ruined kingdom, topple the world boss and rise through the arena.</p>
        <div class="cta">${S.me ? '<a class="btn big" href="#/hub">Enter the Tower</a>' : '<a class="btn big" href="#/signup">Begin your legend</a><a class="btn big alt" href="#/login">Log in</a>'}</div></div>
      <div class="lineup"><div class="duelist a">${WB.wizard('Apprentice')}</div><div class="duelist b">${WB.wizard('Paladin')}</div></div><canvas class="duelcv"></canvas></div>
      <section class="features"><h2>The Rules of the Realm</h2><p class="lead">Every round, fate rolls a six-sided die. Your spellbook does the rest.</p>
        <div class="grid g4">
        <div class="panel feat ornate"><div class="ic-frame">${I('dice')}</div><h3>Dice decide</h3><p>A d6 picks one of your six spells each turn. Build a spell set that works with the odds.</p></div>
        <div class="panel feat ornate"><div class="ic-frame">${I('flame')}</div><h3>78 spells</h3><p>Fire, frost, venom, curses and holy light — every spell has its own animation.</p></div>
        <div class="panel feat ornate"><div class="ic-frame">${I('snow')}</div><h3>Status warfare</h3><p>Burn, poison, bleed, freeze, stun, blind, confuse and weaken all leave their mark.</p></div>
        <div class="panel feat ornate"><div class="ic-frame">${I('skull')}</div><h3>Beasts &amp; bosses</h3><p>Farm the fort, topple the weekly world boss, then climb the arena ladder.</p></div></div>
        <h2 style="margin-top:44px">Creatures of the Fort</h2><div class="beasts">${beasts}</div>
        <div class="marquee"><div>${chips}${chips}</div></div></section>`;
    const h = $('.home'); onLeave(WB.duel($('canvas.duelcv', h), $('.duelist.a img', h), $('.duelist.b img', h), sp));
  }

  /* ═════════ AUTH ═════════ */
  function authArt() { return `<div class="auth-art">${WB.runeCircle()}${WB.wizard('Apprentice').replace('class="wiz"', 'class="wiz w"')}<div class="tgt"></div><canvas></canvas></div>`; }
  function startAuthArt() { const a = $('.auth-art'); onLeave(WB.duel($('canvas', a), $('.w', a), $('.tgt', a), ['Ember', 'Ice Arrow', 'Thunder Wave', 'Confuse Ray', 'Fire Ball', 'Diamond Arrow'])); }
  function pwScore(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; }
  async function captchaWidget(box) {
    const load = async () => { box.innerHTML = '<span class="muted" style="padding:14px;display:block">Summoning runes…</span>'; try { const c = await api('/api/captcha'); box.dataset.token = c.token; box.innerHTML = c.svg; } catch (e) { box.textContent = 'Could not load captcha'; } };
    await load(); return load;
  }
  function authForm(kind) {
    const su = kind === 'signup';
    main.innerHTML = `<div class="auth"><form class="panel ornate" id="af" autocomplete="on" style="padding:30px 30px 26px"><div class="auth-brand">${WB.logo()}<div><h2 class="title" style="margin:0;padding:0;font-size:1.35rem">${su ? 'Join the Order' : 'Welcome back'}</h2></div></div><p class="muted" style="margin-bottom:6px">${su ? 'Forge your wizard name and begin your legend.' : 'The tower awaits, spellcaster.'}</p>
      <label for="u">Wizard name</label><input id="u" name="username" maxlength="20" autocomplete="username" required placeholder="Merlin_the_Bold">
      <label for="pw">Password</label><div class="row" style="flex-wrap:nowrap"><input id="pw" name="password" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" required minlength="8" placeholder="••••••••"><button type="button" class="icon-btn" id="eye" title="Show">${I('eye')}</button></div>
      ${su ? '<div class="pw-meter"><i id="pwm"></i></div>' : ''}
      ${su ? `<label>Prove you are not a golem</label><div class="captcha"><div class="img" id="cap"></div><button type="button" class="icon-btn" id="recap" title="New image">${I('refresh')}</button></div><input id="ca" autocomplete="off" autocapitalize="characters" maxlength="5" placeholder="TYPE THE 5 RUNES" style="margin-top:8px;text-transform:uppercase;letter-spacing:.3em;text-align:center">` : ''}
      <div class="err" id="err"></div><button class="btn big" style="width:100%;margin-top:6px" id="go">${su ? 'Create wizard' : 'Enter'}</button>
      <p class="center muted" style="margin-top:16px">${su ? 'Already a wizard? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Create an account</a>'}</p></form>${authArt()}</div>`;
    startAuthArt();
    const f = $('#af'), err = $('#err'); let reload = null;
    $('#eye').onclick = () => { const i = $('#pw'); i.type = i.type === 'password' ? 'text' : 'password'; };
    if (su) { captchaWidget($('#cap')).then(r => { reload = r; $('#recap').onclick = r; }); $('#pw').oninput = e => { const s = pwScore(e.target.value), m = $('#pwm'); m.style.width = (s / 5 * 100) + '%'; m.style.background = ['#d4646c', '#d4646c', '#d9b765', '#B7D894', '#8bd44a', '#8bd44a'][s]; }; }
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = ''; const b = $('#go'); b.disabled = true;
      try {
        const body = { username: $('#u').value.trim(), password: $('#pw').value };
        if (su) { body.captchaToken = $('#cap').dataset.token; body.captchaAnswer = $('#ca').value.trim(); }
        await api(su ? '/api/signup' : '/api/login', body); WB.snd.sfx.ok(); await loadMe(); location.hash = P() ? '#/hub' : '#/onboard';
      } catch (ex) { err.textContent = ex.message; b.disabled = false; if (su && reload) { reload(); $('#ca').value = ''; } WB.snd.sfx.no(); }
    };
  }
  function login() { return authForm('login'); }
  function signup() { return authForm('signup'); }

  /* ═════════ ONBOARDING ═════════ */
  function onboard() {
    if (P()) { location.hash = '#/hub'; return; }
    let sel = null, gender = 'm';
    const draw = () => {
      const femOk = Object.values(WB.FEM).every(Boolean);
      main.innerHTML = `<h2 class="title">Choose your path<small>Your class defines your passive power</small></h2>
      <div class="row" style="justify-content:center;margin-bottom:22px;gap:16px"><span class="muted" style="font-family:var(--font-h);letter-spacing:.2em;font-size:.74rem">APPEARANCE</span><div class="gender"><button data-g="m" class="${gender === 'm' ? 'on' : ''}">Male</button><button data-g="f" class="${gender === 'f' ? 'on' : ''}" ${femOk ? '' : 'disabled title="Female artwork has not been added yet"'}>Female</button></div></div>
      <div class="grid g3">${S.data.classes.map(c => { const l = lore[c.name]; return `<div class="panel class-card ${sel === c.name ? 'sel' : ''}" data-c="${c.name}"><div class="art">${WB.wizard(c.name, gender)}</div><div class="cb"><div class="tag">${l[3]}</div><h3>${c.name}</h3><p style="margin:6px 0"><span class="stat">${I('heart')} ${c.hp} HP</span><span class="stat">${I('shield')} ${c.armor} Armor</span></p><p class="muted" style="font-size:.93rem;margin-bottom:8px">${l[1]}</p><p style="font-size:.9rem;text-align:left"><b class="sage">Passive —</b> ${l[2]}</p></div></div>`; }).join('')}</div>
      <p class="center" style="margin-top:26px"><button class="btn big" id="go" ${sel ? '' : 'disabled'}>Claim your free spells</button></p>`;
      $$('.class-card').forEach(c => c.onclick = () => { sel = c.dataset.c; WB.snd.sfx.click(); draw(); });
      $$('.gender button').forEach(b => b.onclick = () => { gender = b.dataset.g; draw(); });
      $('#go').onclick = go;
    };
    const go = async () => {
      try { await api('/api/onboard', { class_name: sel, gender }); await loadMe(); renderNav(); WB.snd.sfx.win();
        const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal panel ornate center" style="padding:28px"><h2 class="title" style="justify-content:center">You are a ${sel}</h2><p class="muted">Three starter spells join your spellbook, with ${WB.coin} 70 coins and ${I('gem')} 5 gems.</p><p class="sage" style="margin-top:6px">${I('fast')} Welcome gift: <b>Speedster</b> is active for your first 7 days — the Speed-Up button is yours.</p><div class="grid" style="margin:16px 0;text-align:left">${['Punch Spell', 'Weak Poison', 'Cut'].map(n => spellCard(SP()[n])).join('')}</div><button class="btn big" id="ok">Enter the Tower</button></div>`; document.body.appendChild(bg);
        $('#ok', bg).onclick = () => { bg.remove(); location.hash = '#/hub'; };
      } catch (e) { toast(e.message, true); }
    };
    draw(); const fh = () => { if (location.hash === '#/onboard') draw(); }; window.addEventListener('wb-fem', fh); onLeave(() => window.removeEventListener('wb-fem', fh));
  }

  /* ═════════ HUB ═════════ */
  function tile(o) { return `<a class="tile ${o.soon ? 'soon' : ''} ${o.alert ? 'alert' : ''} ${o.cls || ''}" ${o.bg ? `data-bg="${o.bg}"` : ''} ${o.href && !o.soon ? `href="${o.href}"` : ''} ${o.id ? `id="${o.id}"` : ''} style="--img:url(${o.img || ''});${o.bg ? `--bg:${o.bg}` : ''}"><span class="ti">${I(o.ic)}</span>${o.soon ? '<span class="soon-tag">COMING SOON</span>' : ''}<h3>${o.t}</h3><p>${o.d}</p>${o.extra || ''}</a>`; }
  function hub() {
    const p = P(), m = S.me, b = m.boss, st = Math.min(100, p.pvp_wins / p.wins_per_level * 100), dailyLeft = Math.max(0, m.resetAt - Date.now());
    const M = n => `/img/monsters/${n}-card.jpg`;
    main.innerHTML = `${m.battle ? `<div class="banner"><span>You have a ${m.battle.mode} battle in progress.</span><a class="btn sm" href="#/battle">Resume</a></div>` : ''}
    <div class="panel ornate hero-card"><div class="portrait">${WB.wizard(p.class_name, p.gender)}</div><div class="hb"><h2 class="title" style="margin:20px 0 14px">${esc(p.name)}<small>${p.class_name} · Level ${p.level}</small></h2>
      <p style="margin-bottom:10px"><span class="stat">${I('heart')} ${p.max_hp} HP</span><span class="stat">${I('shield')} ${p.armor} Armor</span><span class="stat">${I('trophy')} ${p.trophies}</span><span class="stat">${I('chest')} ${p.chests}</span><span class="stat">${I('key')} ${p.keys}</span>${p.equipped_item ? `<span class="stat">${I('bag')} ${esc(p.equipped_item)}</span>` : ''}</p>
      <div class="muted" style="font-size:.88rem;margin-bottom:4px">Level progress — ${p.pvp_wins}/${p.wins_per_level} Arena wins</div><div class="bar"><i style="width:${st}%"></i></div>
      <p class="muted" style="margin-top:12px;font-size:.88rem">${I('hourglass')} Daily reset in ${mmss(dailyLeft)}</p></div></div>
    <div class="tiles">
      ${tile({ t: 'View Profile', d: 'Your stats, spells and gear.', ic: 'user', href: '#/profile', img: '/img/scenes/profile-s.jpg' })}
      ${tile({ t: 'Spell Shop', d: 'Learn new spells with coins.', ic: 'book', href: '#/shop', img: '/img/scenes/spellshop-s.jpg' })}
      ${tile({ t: 'Abandoned Fort', d: 'Hunt monsters for coins and gems.', ic: 'castle', href: '#/fort', img: M('baby-dragon') })}
      ${tile({ t: 'Daily Lottery', d: p.daily.lottery ? 'Claimed today. Come back after reset.' : 'Roll the dice for free coins.', ic: 'dice', id: 'lot', href: '#', img: '/img/scenes/lottery-s.jpg', alert: !p.daily.lottery })}
      ${tile({ t: 'Library', d: 'Every spell, effect, class and monster.', ic: 'books', href: '#/library', img: M('treant') })}
      ${tile({ t: 'Live PvP Battle', d: 'Real-time duels against other players.', ic: 'swords', href: '#/pvp', img: '/img/scenes/arena-bg-s.jpg' })}
      ${tile({ t: 'Arena', d: 'Duel rival wizards. Win to level up.', ic: 'trophy', href: '#/arena', img: '/img/scenes/arena-s.jpg', extra: pips(p.energy.arena) })}
      ${tile({ t: 'Castle', d: 'Seize the throne and plunder the vault.', ic: 'castle', href: '#/castle', img: M('crusader'), extra: pips(p.energy.castle) })}
      ${tile({ t: 'Daily Bounty', d: 'A kill contract for bonus coins.', ic: 'scroll', href: '#/bounty', img: M('marksman') })}
      ${tile({ t: 'Trials Dungeon', d: 'Descend floor by floor. Fall and pay.', ic: 'skull', href: '#/dungeon', img: M('stone-golem'), extra: pips(p.energy.dungeon) })}
      ${tile({ t: 'Item Shop', d: 'Enchanted gear, bought with gems.', ic: 'bag', href: '#/shop?tab=items', img: '/img/scenes/itemshop-s.jpg' })}
      ${tile({ t: 'Mystery Trader', d: 'A hooded merchant on even hours.', ic: 'key', href: '#/trader', img: '/img/scenes/trader-s.jpg' })}
      ${tile({ t: 'World Boss', d: `${esc(b.name)} · ${(b.hp / b.max_hp * 100).toFixed(1)}% HP left`, ic: 'skull', href: '#/boss', img: b.image, cls: 'boss', bg: (WB.BOSS[b.name] || {}).bg, extra: pips(p.energy.boss) })}</div>`;
    $('#lot').onclick = async e => { e.preventDefault(); if (p.daily.lottery) return toast('You already rolled today. Resets at midnight (PHT).', true); try { const r = await api('/api/lottery', {}); await WB.diceModal(r.dice, 'Daily Fortune', `<b class="sage">+${r.reward} coin${r.reward > 1 ? 's' : ''}</b> added to your vault.`); WB.snd.sfx.coin(); ctx.setPlayer(r.player); route(); } catch (x) { toast(x.message, true); } };
    const cb = $('#chest'); if (cb) cb.onclick = openChest;
  }
  async function openChest() { try { const r = await api('/api/chest', {}); await WB.diceModal(r.dice, 'Chest of Fate', r.coins ? `<b class="sage">+${r.coins} coins</b>` : `<b class="sage">+${r.gems} gems</b>`); WB.snd.sfx.coin(); ctx.setPlayer(r.player); route(); } catch (e) { toast(e.message, true); } }

  /* ═════════ PROFILE ═════════ */
  function profile() {
    const p = P(), IT = Object.fromEntries(S.data.items.map(i => [i.name, i])), eq = p.equipped_item && IT[p.equipped_item];
    main.innerHTML = `${sceneHero('/img/scenes/profile.jpg', esc(p.name), `${p.class_name} · Level ${p.level}`)}
    <div class="grid g2" style="align-items:start"><div class="panel ornate hero-card" style="grid-template-columns:1fr"><div class="portrait" style="min-height:420px;border:0">${WB.wizard(p.class_name, p.gender)}</div></div>
      <div class="panel ornate"><h3>${p.class_name} · Level ${p.level}</h3><p class="muted" style="margin:4px 0 14px">${esc(lore[p.class_name][0])} — ${lore[p.class_name][1]}</p>
        <div class="grid g3" style="gap:10px">${[['heart', 'Max HP', p.max_hp], ['shield', 'Armor', p.armor], ['trophy', 'Trophies', p.trophies], ['swords', 'Arena wins', p.arena_wins], ['book', 'Spells known', p.spells_owned.length], ['bag', 'Items owned', p.items_owned.length], ['chest', 'Chests', p.chests], ['key', 'Keys', p.keys], ['star', 'Level progress', p.pvp_wins + '/' + p.wins_per_level]].map(([ic, l, v]) => `<div class="stat" style="display:block;margin:0;padding:10px 12px"><div class="muted" style="font-family:var(--font-h);font-size:.6rem;letter-spacing:.16em;text-transform:uppercase">${I(ic)} ${l}</div><div style="font-family:var(--font-h);font-size:1.2rem;color:var(--mint)">${v}</div></div>`).join('')}</div>
        <h3 style="margin:20px 0 10px">Equipped gear</h3>${eq ? `<div class="row" style="gap:16px">${WB.itemImg(eq.name, 'x')}<div><b>${esc(eq.name)}</b><div class="muted" style="font-size:.9rem;max-width:380px">${esc(eq.ability)}</div></div></div>` : '<p class="muted">Nothing equipped — visit the Item Shop.</p>'}
        <p style="margin-top:18px" class="row"><a class="btn sm" href="#/spells">Spellbook</a><a class="btn sm alt" href="#/shop?tab=items">Item shop</a>${p.chests && p.keys ? '<button class="btn sm alt" id="chest">Open chest</button>' : ''}</p></div></div>`;
    $$('.item-img.x').forEach(i => { i.style.cssText = 'height:96px;width:auto'; });
    const cb = $('#chest'); if (cb) cb.onclick = openChest;
  }

  /* ═════════ SHOP ═════════ */
  function shop() {
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    let tab = qs.get('tab') === 'items' ? 'items' : 'spells', q = '', ef = '', aff = false;
    const FIL = [['', 'All', 'books'], ['Damage', 'Damage', 'burst'], ['Heal', 'Heal', 'heal'], ['Burn', 'Burn', 'flame'], ['Poison', 'Poison', 'skull'], ['Bleed', 'Bleed', 'drop'], ['Freeze', 'Freeze', 'snow'], ['Stun', 'Stun', 'dizzy'], ['Blind', 'Blind', 'eye'], ['Confuse', 'Confuse', 'spiral'], ['Weaken', 'Weaken', 'arrowdown'], ['Pierce', 'Pierce', 'target']];
    const draw = () => {
      const p = P(), spells = S.data.spells.filter(s => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && (!ef || (ef === 'Heal' ? s.heal : ef === 'Damage' ? s.dmg && !s.eff : s.eff === ef)) && (!aff || (p.coins >= s.price && p.level >= s.lv && !p.spells_owned.includes(s.name)))).sort((a, b) => a.lv - b.lv || a.price - b.price);
      const hero = tab === 'spells'
        ? `<div class="shop-hero" style="background-image:linear-gradient(90deg,#0c1017f5 26%,#0c101755),url(/img/scenes/spellshop.jpg)"><h1>The Spell Shop</h1><p>Study forbidden verses and tempered cantrips. You carry <b>${WB.coin} ${p.coins}</b> coins at level <b>${p.level}</b>.</p></div>`
        : `<div class="shop-hero" style="background-image:linear-gradient(90deg,#0c1017f5 26%,#0c101755),url(/img/scenes/itemshop.jpg)"><h1>The Armory</h1><p>One enchanted piece may be worn at a time. You carry <b>${I('gem')} ${p.gems}</b> gems.</p><div class="gear-float">${S.data.items.map(i => WB.itemImg(i.name)).join('')}</div></div>`;
      main.innerHTML = `${hero}<div class="tabs"><button class="tab ${tab === 'spells' ? 'on' : ''}" data-t="spells">${I('book')} Spells</button><button class="tab ${tab === 'items' ? 'on' : ''}" data-t="items">${I('bag')} Gear</button></div>
      ${tab === 'spells' ? `<div class="filters"><input id="q" placeholder="Search spells…" value="${esc(q)}" style="max-width:240px"><label style="margin:0;display:flex;gap:8px;align-items:center"><input type="checkbox" id="aff" style="width:auto" ${aff ? 'checked' : ''}> Affordable</label></div><div class="filters">${FIL.map(([v, n, ic]) => `<button class="fchip ${ef === v ? 'on' : ''}" data-e="${v}">${I(ic)} ${n}</button>`).join('')}</div>
        <div class="grid g3">${spells.map(s => spellCard(s, { shop: true })).join('') || '<p class="muted">No spells match.</p>'}</div>`
          : `<div class="grid g3">${S.data.items.map(i => { const own = p.items_owned.includes(i.name), eq = p.equipped_item === i.name; return `<div class="item-card ${own ? 'owned' : ''}">${eq ? '<span class="equip-tag">EQUIPPED</span>' : ''}<div class="case">${WB.itemImg(i.name)}</div><div class="ib"><h4>${esc(i.name)}</h4><div class="row" style="gap:6px"><span class="stat">${I('heart')} +${i.hp} HP</span>${i.armor ? `<span class="stat">${I('shield')} +${i.armor} Armor</span>` : ''}</div><p>${esc(i.ability)}</p><div class="sp-foot"><span class="sp-price">${I('gem')} ${i.price}</span>${own ? `<button class="btn sm ${eq ? 'alt' : ''}" data-eq="${esc(i.name)}">${eq ? 'Unequip' : 'Equip'}</button>` : `<button class="btn sm" data-bi="${esc(i.name)}" ${p.gems < i.price ? 'disabled' : ''}>Purchase</button>`}</div></div></div>`; }).join('')}</div>`}`;
      $$('.tab[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
      $$('.fchip[data-e]').forEach(b => b.onclick = () => { ef = b.dataset.e; draw(); });
      const qi = $('#q'); if (qi) { qi.oninput = e => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }; $('#aff').onchange = e => { aff = e.target.checked; draw(); }; }
      const act = async (fn, ok) => { try { const r = await fn(); ctx.setPlayer(r.player); WB.snd.sfx.coin(); toast(ok); draw(); } catch (e) { toast(e.message, true); WB.snd.sfx.no(); } };
      $$('[data-buy]').forEach(b => b.onclick = () => act(() => api('/api/shop/spell', { spell: b.dataset.buy }), `Learned ${b.dataset.buy}.`));
      $$('[data-bi]').forEach(b => b.onclick = () => act(() => api('/api/shop/item', { item: b.dataset.bi }), `Purchased ${b.dataset.bi}.`));
      $$('[data-eq]').forEach(b => b.onclick = () => act(() => api('/api/equip', { item: P().equipped_item === b.dataset.eq ? null : b.dataset.eq }), 'Gear updated.'));
    };
    draw();
  }

  /* ═════════ SPELLBOOK (loadouts) ═════════ */
  function spellbook() {
    let which = 'arena', sel = 0; const SPm = SP();
    const sets = { arena: [...P().spell_set], monster: [...P().monster_spell_set] };
    const draw = () => {
      const p = P(), slots = sets[which], cc = slots.filter(n => n && ['Blind', 'Confuse', 'Freeze', 'Stun'].includes(SPm[n].eff)).length, hl = slots.filter(n => n && SPm[n].heal > 0).length;
      main.innerHTML = `<h2 class="title">📖 Spellbook<small>The dice picks slot 1–6 each round</small></h2>
      <div class="tabs"><button class="tab ${which === 'arena' ? 'on' : ''}" data-w="arena">🏆 Arena set</button><button class="tab ${which === 'monster' ? 'on' : ''}" data-w="monster">🏰 Monster &amp; Boss set</button></div>
      <p class="muted">No duplicates · max 2 crowd-control (Blind/Confuse/Freeze/Stun) <span class="badge">${cc}/2</span> · max 2 healing <span class="badge">${hl}/2</span></p>
      <div class="slots" style="margin:18px 0">${slots.map((n, i) => `<div class="slot ${n ? 'full' : ''} ${sel === i ? 'sel' : ''}" data-s="${i}"><span class="n">${i + 1}</span>${n ? `<b>${esc(n)}</b><div class="muted" style="font-size:.85rem">${spellDesc(SPm[n])}</div><button class="btn sm danger" data-x="${i}" style="position:absolute;right:6px;bottom:6px;padding:2px 9px">✕</button>` : '<span class="muted">empty — pick a spell below</span>'}</div>`).join('')}</div>
      <div class="row" style="margin-bottom:14px"><button class="btn" id="save">💾 Save ${which === 'arena' ? 'Arena' : 'Monster'} Set</button><button class="btn alt sm" id="copy">Copy from ${which === 'arena' ? 'Monster' : 'Arena'} set</button></div>
      <h3 style="margin-bottom:10px">Your spells (${p.spells_owned.length})</h3><div class="grid g3">${p.spells_owned.map(n => SPm[n]).sort((a, b) => a.lv - b.lv).map(s => `<div class="sp-pick ${slots.includes(s.name) ? 'used' : ''}" data-pick="${esc(s.name)}">${spellCard(s)}</div>`).join('')}</div>`;
      $$('[data-w]').forEach(b => b.onclick = () => { which = b.dataset.w; sel = 0; draw(); });
      $$('.slot').forEach(s => s.onclick = () => { sel = +s.dataset.s; draw(); });
      $$('[data-x]').forEach(b => b.onclick = e => { e.stopPropagation(); sets[which][+b.dataset.x] = null; draw(); });
      $$('[data-pick]').forEach(b => b.onclick = () => {
        const n = b.dataset.pick, cur = sets[which]; if (cur.includes(n)) return toast('Already in this set.', true);
        const s = SPm[n], isCC = ['Blind', 'Confuse', 'Freeze', 'Stun'].includes(s.eff), without = cur.filter((x, i) => i !== sel && x);
        if (isCC && without.filter(x => ['Blind', 'Confuse', 'Freeze', 'Stun'].includes(SPm[x].eff)).length >= 2) return toast('Max 2 crowd-control spells.', true);
        if (s.heal > 0 && without.filter(x => SPm[x].heal > 0).length >= 2) return toast('Max 2 healing spells.', true);
        cur[sel] = n; const nx = cur.findIndex(x => !x); sel = nx >= 0 ? nx : sel; WB.snd.sfx.click(); draw();
      });
      $('#copy').onclick = () => { sets[which] = [...sets[which === 'arena' ? 'monster' : 'arena']]; draw(); };
      $('#save').onclick = async () => { try { const r = await api('/api/loadout', { which, slots: sets[which] }); ctx.setPlayer(r.player); WB.snd.sfx.ok(); toast('Spell set saved!'); } catch (e) { toast(e.message, true); } };
    };
    draw();
  }

  /* ═════════ FORT ═════════ */
  const TIER = {
    low: { n: 'Low Tier', sub: 'Beginner', ic: '🌿', c: '#8bd44a', sk: 1, d: 'Common soldiers and the restless dead patrol the outer ruins.' },
    mid: { n: 'Mid Tier', sub: 'Intermediate', ic: '⚔️', c: '#f2a33a', sk: 2, d: 'Golems, witches and imps haunt the broken halls.' },
    high: { n: 'High Tier', sub: 'Advanced', ic: '💀', c: '#e0646b', sk: 3, d: 'Dragons, zealots and corrupted knights. Bring your best dice.' },
  };
  function mcard(n, o = {}) {
    const m = S.data.monsters.find(x => x.name === n), A = WB.MONART[n], p = P(), t = o.tier ? TIER[o.tier] : { c: '#B7D894' };
    const k = p ? (p.daily.kills[n] || 0) : 0, used = p && p.daily.sessions[n], tierLock = o.tier && p && p.daily.tier && p.daily.tier !== o.tier, full = k >= m.limit;
    const lock = o.lib ? false : (tierLock || used || full), gem = m.reward.cur === 'gems';
    return `<div class="mcard ${lock ? 'locked' : ''} ${gem ? 'rare' : ''}" style="--tc:${gem ? '#f2c94c' : t.c}">
      <div class="mimg" style="background-image:url(/img/monsters/${A ? A.slug : 'zombie'}-card.jpg)"><span class="rw">${gem ? '💎' : WB.coin} ${m.reward.amount}<small>/kill</small></span>${!o.lib && used ? '<span class="ribbon">SLAIN TODAY</span>' : !o.lib && tierLock ? '<span class="ribbon lk">LOCKED</span>' : ''}${gem ? '<span class="rare-tag">✦ RARE</span>' : ''}<h4>${esc(n)}</h4></div>
      <div class="mbody"><div class="row" style="gap:6px"><span class="stat">❤️ ${m.hp}</span><span class="stat">⚔️ ${m.dmg}</span><span class="stat">🛡️ ${m.armor}</span>${m.eff ? effBadge(m.eff, ` ${Math.round(m.ch * 100)}%`) : ''}</div>
      ${o.lib ? `<div class="muted" style="margin-top:6px;font-size:.9rem">Daily limit: ${m.limit} kills</div>` : `<div class="kbar"><i style="width:${Math.min(100, k / m.limit * 100)}%"></i></div><div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted" style="font-size:.9rem">Kills ${k}/${m.limit}</span><button class="btn sm" data-f="${o.tier}|${esc(n)}" ${lock || S.me.battle ? 'disabled' : ''}>${used ? 'Done' : '⚔ Enter Lair'}</button></div>`}</div></div>`;
  }
  function fort() {
    const p = P(), slain = Object.values(p.daily.kills).reduce((a, b) => a + b, 0), resetIn = mmss(Math.max(0, S.me.resetAt - Date.now()));
    main.innerHTML = `<section class="fort-hero"><div class="fog f1"></div><div class="fog f2"></div><div class="kick">RUINS OF THE OLD KINGDOM</div><h1>The Abandoned Fort</h1><p>Slay what lurks among the ruins for coins and gems. One lair per monster each day — and you may only hunt <b>one tier</b> per day.</p>
      <div class="row" style="justify-content:center"><span class="chip">☠ Slain today <b>${slain}</b></span><span class="chip">🏰 Tier <b>${p.daily.tier ? TIER[p.daily.tier].n : 'not chosen yet'}</b></span><span class="chip">⏳ Reset in ${resetIn}</span></div></section>
    ${S.me.battle ? `<div class="banner"><span>You're already in a battle.</span><a class="btn sm alt" href="#/battle">Resume</a></div>` : ''}
    ${Object.entries(S.data.tiers).map(([t, names]) => { const T = TIER[t], off = p.daily.tier && p.daily.tier !== t; return `<div class="tier-head ${off ? 'off' : ''}" style="--tc:${T.c}"><span class="tic">${T.ic}</span><div><h3>${T.n} <small>${T.sub}</small></h3><p>${T.d}${off ? ' <b>(locked for today)</b>' : ''}</p></div><span class="skulls">${'💀'.repeat(T.sk)}<i>${'💀'.repeat(3 - T.sk)}</i></span></div><div class="grid g3 mgrid">${names.map(n => mcard(n, { tier: t })).join('')}</div>`; }).join('')}`;
    $$('[data-f]').forEach(b => b.onclick = async () => { const [tier, monster] = b.dataset.f.split('|'); if (!confirm(`Enter ${monster}'s lair?\nYou can only fight it once per day, and today's tier will be locked to ${TIER[tier].n}.`)) return; try { S.pending = await api('/api/fort/start', { tier, monster }); location.hash = '#/battle'; } catch (e) { toast(e.message, true); } });
  }

  /* ═════════ BOSS ═════════ */
  function weekEnd() { const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 16)); t.setUTCDate(t.getUTCDate() + (7 - n.getUTCDay()) % 7); if (t <= n) t.setUTCDate(t.getUTCDate() + 7); return t - n; }
  function themeParticles(canvas, th) {
    const fx = new WB.FX(canvas), R = rnd;
    const id = setInterval(() => {
      const w = fx.w, h = fx.h;
      if (th.fx === 'snow') fx.p({ x: R(0, w), y: -8, vx: R(-25, 10), vy: R(35, 80), life: R(4, 7), size: R(1.2, 3.2), color: '#fff', fade: false });
      else if (th.fx === 'ember') fx.p({ x: R(0, w), y: h + 8, vx: R(-20, 20), vy: R(-110, -45), life: R(2.5, 5), size: R(1.4, 3.4), color: ['#ff6a2b', '#ffb347', '#ffe08a'][Math.floor(R(0, 3))] });
      else if (th.fx === 'bubble') fx.p({ x: R(0, w), y: h + 8, vx: R(-10, 10), vy: R(-60, -25), life: R(3, 6), size: R(3, 8), s2: R(8, 14), shape: 'ring', color: '#b6f06a', w: 1.5 });
      else fx.p({ x: R(-10, w), y: R(h * .4, h), vx: R(30, 70), vy: R(-8, 8), life: R(3, 6), size: R(8, 18), s2: R(26, 40), shape: 'solid', color: '#c9a77a', a: .14, add: false });
    }, 70);
    onLeave(() => { clearInterval(id); fx.destroy(); });
  }
  function boss() {
    const p = P(), b = S.me.boss, e = p.energy.boss, th = WB.BOSS[b.name] || { c: '#B7D894', bg: '#232b3b', fx: 'dust', tag: 'World Boss' }, SPm = SP();
    const pct = b.hp / b.max_hp * 100, dead = b.hp <= 0, mine = b.mine, mx = Math.max(10000, mine), top = b.top, topMax = Math.max(1, ...top.map(t => t.total_damage));
    const left = weekEnd(), dd = Math.floor(left / 86400000), hh = Math.floor(left % 86400000 / 3600000);
    main.innerHTML = `<section class="boss-hero" style="--bc:${th.c};--bg:${th.bg}"><canvas></canvas><div class="bh-in">
        <div class="kick">WEEKLY WORLD BOSS</div><h1>${esc(b.name)}</h1><div class="tagline">${th.tag} · 🛡️ Armor ${b.armor}</div>
        <div class="boss-fig"><div class="aura-ring"></div><div class="aura-ring r2"></div>${monster(b.name, b.image)}</div>
        <div class="bossbar"><div class="bb-fill ${dead ? 'dead' : ''}" style="width:${Math.max(.6, pct)}%"></div>${Array.from({ length: 9 }, (_, i) => `<i style="left:${(i + 1) * 10}%"></i>`).join('')}<span>${dead ? '☠ SLAIN ☠' : `${b.hp.toLocaleString('en-US')} / ${b.max_hp.toLocaleString('en-US')} HP`}</span></div>
        <div class="row" style="justify-content:center;margin-top:10px"><span class="chip">⏳ New boss in ${dd}d ${hh}h</span><span class="chip">${pct.toFixed(1)}% HP left</span><span class="chip">${WB.coin} 1 coin per 1,000 damage</span></div></div></section>
    <div class="grid g3" style="margin-top:18px;align-items:start">
      <div class="panel ornate center"><h3>⚡ Boss Energy</h3><div class="orbs">${Array.from({ length: e.cap }, (_, i) => `<i class="orb-e ${i < e.val ? 'on' : ''}"></i>`).join('')}</div>
        <p class="muted" style="margin:6px 0 14px">${e.val}/${e.cap}${e.val < e.cap ? ` · next in ${mmss(e.nextIn)} (+1 / 20 min)` : ' · full'}</p>
        <button class="btn big pulse" id="go" ${e.val < 1 || dead || S.me.battle ? 'disabled' : ''}>${dead ? '☠ Boss slain' : S.me.battle ? 'Battle in progress' : '⚔️ Challenge the Boss'}</button>
        <p class="muted" style="margin-top:12px;font-size:.88rem">Uses your <b>Monster &amp; Boss</b> spell set. Fight until you fall — every point of damage counts.</p></div>
      <div class="panel ornate"><h3>🎲 ${esc(b.name)}'s Dice</h3><p class="muted" style="font-size:.9rem;margin-bottom:8px">The boss rolls a d6 each turn to pick its spell:</p>
        ${b.spells.map((n, i) => { const s = SPm[n]; return `<div class="bdie"><span class="dn6">${i + 1}</span><div><b>${esc(n)}</b><div class="muted" style="font-size:.85rem">${s.dmg ? '💥 ' + s.dmg + ' ' : ''}${s.eff ? effBadge(s.eff, ' ' + Math.round((s.ch == null ? 1 : s.ch) * 100) + '%') : ''}</div></div></div>`; }).join('')}</div>
      <div class="panel ornate"><h3>🏅 Your Contribution</h3><div style="font-size:2rem;font-family:var(--font-h);color:var(--mint)">${mine.toLocaleString('en-US')}</div><div class="muted" style="font-size:.9rem">damage this week</div>
        <div class="mile"><div class="mile-bar"><i style="width:${Math.min(100, mine / mx * 100)}%"></i><span class="m1" style="left:${3000 / mx * 100}%"></span><span class="m2" style="left:${10000 / mx * 100}%"></span></div>
        <div class="row" style="justify-content:space-between;font-size:.82rem"><span class="${mine >= 3000 ? 'sage' : 'muted'}">${mine >= 3000 ? '✓' : '○'} 3,000 → +3 ${WB.coin}</span><span class="${mine >= 10000 ? 'sage' : 'muted'}">${mine >= 10000 ? '✓' : '○'} 10,000 → +5 ${WB.coin}</span></div><div class="muted" style="font-size:.78rem;margin-top:4px">Milestone bonuses are paid to everyone when the boss is slain.</div></div>
        <h3 style="margin:16px 0 8px">👑 Top Slayers</h3>${top.length ? top.map((t, i) => `<div class="podium"><span class="medal">${['🥇', '🥈', '🥉', '④', '⑤'][i]}</span><div class="pd"><div class="row" style="justify-content:space-between"><b>${esc(t.display_name)}</b><span>${t.total_damage.toLocaleString('en-US')}</span></div><div class="bar" style="height:7px"><i style="width:${t.total_damage / topMax * 100}%"></i></div></div></div>`).join('') : '<p class="muted">Nobody has struck the beast yet… be the first!</p>'}</div></div>`;
    themeParticles($('canvas', main), th);
    $('#go').onclick = async () => { try { S.pending = await api('/api/boss/start', {}); location.hash = '#/battle'; } catch (e) { toast(e.message, true); } };
  }

  /* ═════════ ARENA ═════════ */
  async function arena() {
    const p = P(), e = p.energy.arena, lb = await api('/api/leaderboard');
    main.innerHTML = `${sceneHero('/img/scenes/arena.jpg', 'The Arena', 'Win: +10 trophies and a step toward your next level. Loss: −5 trophies. Roll for initiative.')}
    <div class="grid g2"><div class="panel ornate"><h3>Your standing</h3><p style="font-size:2.2rem;margin:6px 0">🏆 ${p.trophies}</p><p class="muted">${p.arena_wins} wins · Level ${p.level} (${p.pvp_wins}/${p.wins_per_level})</p>
      <p style="margin:10px 0">⚡ Energy ${pips(e)} <span class="muted">${e.val < e.cap ? `next in ${mmss(e.nextIn)}` : 'full'} (+1/hour)</span></p>
      ${p.arena_registered ? `<button class="btn big" id="go" ${e.val < 1 || S.me.battle ? 'disabled' : ''}>⚔️ Find an Opponent</button>` : '<button class="btn big" id="join">📋 Join the Season</button>'}
      <p class="muted" style="margin-top:10px;font-size:.9rem">You duel another wizard's Arena set, controlled by a bot. If no rival is available a spectral duelist appears. Roll for initiative!</p></div>
      <div class="panel"><h3>Top wizards</h3>${lb.trophies.slice(0, 10).map((r, i) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid #36415a;padding:4px 0"><span>${i + 1}. ${esc(r.display_name)} <span class="muted">${r.class_name} Lv${r.level}</span></span><b>🏆 ${r.trophies}</b></div>`).join('') || '<p class="muted">No wizards ranked yet.</p>'}</div></div>`;
    const j = $('#join'); if (j) j.onclick = async () => { try { const r = await api('/api/arena/join', {}); ctx.setPlayer(r.player); arena(); } catch (x) { toast(x.message, true); } };
    const g = $('#go'); if (g) g.onclick = async () => { try { S.pending = await api('/api/arena/start', {}); location.hash = '#/battle'; } catch (x) { toast(x.message, true); } };
  }

  /* ═════════ BATTLE ═════════ */
  async function battle() {
    let init = S.pending; S.pending = null;
    if (!init) { const r = await api('/api/battle'); if (!r.battle) { location.hash = '#/hub'; return; } init = { view: r.battle, events: [] }; }
    WB.battle.mount(main, init.view, init.events, ctx);
  }

  /* ═════════ LIBRARY ═════════ */
  function library() {
    let tab = 'Spells', q = '';
    const draw = () => {
      const D = S.data, f = a => a.filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()));
      const tbl = (h, rows) => `<div class="panel scroll-x"><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
      const body = {
        Spells: () => tbl(['Spell', 'Lv', 'Price', 'Dmg', 'Heal', 'Effect', 'Chance', 'Turns'], f(D.spells).map(s => [`<b>${esc(s.name)}</b>`, s.lv, WB.coin + s.price, s.dmg || '—', s.heal || '—', effBadge(s.eff) || '—', s.eff && s.eff !== 'Pierce' ? Math.round(s.ch * 100) + '%' : '—', s.dura || '—'])),
        Effects: () => `<div class="grid g2">${D.effects.map(e => `<div class="panel"><h3 class="eff-${e.name}">${EFF[e.name].i} ${e.name} <small class="muted">${e.dpr ? e.dpr + ' dmg/round' : 'no DoT'}</small></h3><p class="muted">${esc(e.desc)}</p></div>`).join('')}</div>`,
        Classes: () => `<div class="grid g3">${D.classes.map(c => `<div class="panel class-card"><div class="art">${WB.wizard(c.name)}</div><div class="cb"><h3>${c.name}</h3><p><span class="stat">${I('heart')} ${c.hp}</span><span class="stat">${I('shield')} ${c.armor}</span></p><p class="muted" style="font-size:.93rem">${esc(c.bonus)}</p></div></div>`).join('')}</div>`,
        Items: () => `<div class="grid g3">${D.items.map(i => `<div class="item-card"><div class="case">${WB.itemImg(i.name)}</div><div class="ib"><h4>${esc(i.name)}</h4><div class="row" style="gap:6px"><span class="stat">${I('gem')} ${i.price}</span><span class="stat">${I('heart')} +${i.hp}</span>${i.armor ? `<span class="stat">${I('shield')} +${i.armor}</span>` : ''}</div><p>${esc(i.ability)}</p></div></div>`).join('')}</div>`,
        Monsters: () => `<div class="grid g3 mgrid">${f(D.monsters).map(m => mcard(m.name, { lib: true })).join('')}</div>`,
        Bosses: () => `<div class="grid g2">${D.bosses.map(b => `<div class="panel center">${monster(b.name, b.image)}<h3>${esc(b.name)}</h3><p>❤️ ${b.hp.toLocaleString('en-US')} · 🛡️ ${b.armor}</p><p>${b.spells.map(s => `<span class="badge" style="margin:2px">${esc(s)}</span>`).join('')}</p></div>`).join('')}</div>`,
      }[tab]();
      main.innerHTML = `<h2 class="title">📚 The Great Library</h2><div class="tabs">${['Spells', 'Effects', 'Classes', 'Items', 'Monsters', 'Bosses'].map(t => `<button class="tab ${t === tab ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>${['Spells', 'Monsters'].includes(tab) ? `<input id="q" placeholder="Search…" value="${esc(q)}" style="max-width:280px;margin-bottom:12px">` : ''}${body}`;
      $$('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; q = ''; draw(); });
      const qi = $('#q'); if (qi) qi.oninput = e => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    }; draw();
  }

  /* ═════════ LEADERBOARD ═════════ */
  async function board() {
    const lb = await api('/api/leaderboard'); let tab = 'trophies';
    const draw = () => {
      const rows = lb[tab];
      main.innerHTML = `<h2 class="title">🏅 Hall of Wizards</h2><div class="tabs">${[['trophies', '🏆 Arena'], ['levels', '⭐ Level'], ['boss', '🐉 Boss damage (week)']].map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <div class="panel scroll-x"><table><tr><th>#</th><th>Wizard</th><th>Class</th><th>${tab === 'trophies' ? 'Trophies' : tab === 'levels' ? 'Level' : 'Damage'}</th></tr>${rows.map((r, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${plink(r.user_id, r.display_name)}</b></td><td>${r.class_name}</td><td>${tab === 'trophies' ? r.trophies : tab === 'levels' ? `${r.level} <span class="muted">(${r.pvp_wins}/5)</span>` : r.total_damage.toLocaleString('en-US')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries yet.</td></tr>'}</table></div>`;
      $$('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
    }; draw();
  }


  /* ═════════ scene hero + small helpers ═════════ */
  function sceneHero(img, title, text, extra = '') { return `<div class="scene-hero" style="--img:url(${img})"><h1>${title}</h1><p>${text}</p>${extra}</div>`; }
  const energyBlock = (e, per) => `<div class="row" style="gap:12px">${pips(e)}<span class="muted">${e.val}/${e.cap}${e.val < e.cap ? ` · next in ${mmss(e.nextIn)}` : ' · full'} (+1 per ${per})</span></div>`;
  async function beginBattle(url, body) { try { S.pending = await api(url, body || {}); location.hash = '#/battle'; } catch (e) { toast(e.message, true); } }

  /* ═════════ TRIALS DUNGEON ═════════ */
  async function dungeon() {
    const d = await api('/api/dungeon'), p = P(), M = S.me.battle;
    main.innerHTML = `${sceneHero('/img/scenes/empty-ruins.jpg', 'Trials Dungeon', 'Descend floor by floor. Every floor, a die picks your next foe — you return to full health between floors. Clear five floors for a reward roll. You only pay energy if you fall.')}
      <div class="grid g2" style="align-items:start"><div class="panel ornate"><h3>Your descent</h3><p style="margin:10px 0">${energyBlock(d.energy, '20 minutes')}</p><p class="muted">Personal best: <b class="sage">floor ${d.best}</b></p>
        <p style="margin-top:16px"><button class="btn big" id="go" ${d.energy.val < 1 || M ? 'disabled' : ''}>${M ? 'Battle in progress' : 'Enter the dungeon'}</button></p>
        <p class="muted" style="margin-top:12px;font-size:.9rem">Uses your Monster &amp; Boss spell set. Leaving early costs nothing and keeps your rewards.</p></div>
        <div class="panel"><h3>The floor dice</h3><table><tr><th>Roll</th><th>Foe</th><th>Milestone reward</th></tr>${[1, 2, 3, 4, 5, 6].map(i => `<tr><td>${i}</td><td>${d.roll[i]}</td><td>${WB.coin} ${d.reward[i]}</td></tr>`).join('')}</table></div></div>
      <div class="panel" style="margin-top:18px"><h3 style="margin-bottom:10px">Deepest delvers</h3>${d.top.length ? d.top.map((r, i) => `<div class="row between" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${i + 1}. ${plink(r.user_id, r.display_name)} <span class="muted">${r.class_name}</span></span><b>Floor ${r.dungeon_best}</b></div>`).join('') : '<p class="muted">Nobody has descended yet.</p>'}</div>`;
    $('#go').onclick = () => beginBattle('/api/dungeon/start');
  }

  /* ═════════ THE CASTLE ═════════ */
  async function castle() {
    const d = await api('/api/castle'), c = d.castle, k = c.king, T = d.TRAPS, active = c.traps || {}, M = S.me.battle;
    const kingBlock = c.holder_id ? `<div class="hero-card" style="grid-template-columns:200px 1fr;border:0;box-shadow:none;background:none"><div class="portrait" style="border:1px solid var(--line);border-radius:6px">${WB.wizard(k ? k.class_name : 'Paladin', k ? k.gender : 'm')}</div><div class="hb" style="padding:6px 0 6px 8px"><div class="muted" style="font-family:var(--font-h);letter-spacing:.25em;font-size:.68rem">CURRENT KING</div><h2 style="margin:4px 0 8px">${esc(c.holder_name)} ${d.isKing ? '<span class="badge">YOU</span>' : ''}</h2>
        <p><span class="stat">${I('crown')} ${c.wins} defenses</span><span class="stat">${WB.coin} ${c.vault} in the vault</span>${c.debuff_pct ? `<span class="stat">${I('arrowdown')} −${c.debuff_pct}% HP</span>` : ''}</p>
        <p class="muted" style="font-size:.9rem;margin-top:6px">The vault gains 1 coin every 90 minutes. A challenger who wins splits it with the fallen king. Each defense lowers the king's max HP by ${d.per_win}% (up to ${d.cap}%).</p>
        ${Object.keys(active).length ? `<p style="margin-top:8px">Active traps: ${Object.keys(active).map(t => `<span class="badge">${T[t].label}</span>`).join(' ')}</p>` : ''}</div></div>` : '<p class="muted" style="padding:20px 0">The throne stands empty. Whoever sits upon it begins collecting the royal vault.</p>';
    main.innerHTML = `${sceneHero('/img/monsters/crusader.jpg', 'The Castle', 'One throne, one king. Challenge the holder, plunder the vault, and set traps to defend your crown.')}
      <div class="grid g2" style="align-items:start"><div class="panel ornate">${kingBlock}
        <div class="row" style="margin-top:12px">${!c.holder_id ? '<button class="btn big" id="conq">Conquer the throne</button>' : d.isKing ? '<span class="muted">You hold the throne.</span>' : `<button class="btn big" id="chal" ${d.energy.val < 1 || c.locked || M ? 'disabled' : ''}>${c.locked ? 'Challenge in progress' : 'Challenge the king'}</button>`}</div>
        <p style="margin-top:14px">${energyBlock(d.energy, 'hour')}</p></div>
        <div class="panel"><h3>${d.isKing ? 'Your traps' : 'Defenses'}</h3><p class="muted" style="font-size:.9rem;margin-bottom:8px">${d.isKing ? 'Each trap is single-use: it is consumed when someone challenges you.' : 'The king may buy single-use traps.'}</p>
        ${Object.entries(T).map(([id, t]) => `<div class="offer-row"><div><b>${t.label}</b><div class="muted" style="font-size:.88rem">${t.desc}</div></div>${d.isKing ? (active[id] ? '<span class="sp-own">SET</span>' : `<button class="btn sm" data-trap="${id}" ${d.coins < t.cost ? 'disabled' : ''}>${WB.coin} ${t.cost}</button>`) : (active[id] ? '<span class="sp-own">ACTIVE</span>' : '')}</div>`).join('')}</div></div>`;
    const go = async (url, body) => { try { const r = await api(url, body || {}); if (r.view) { S.pending = r; location.hash = '#/battle'; } else { if (r.player) ctx.setPlayer(r.player); castle(); } } catch (e) { toast(e.message, true); } };
    const cq = $('#conq'); if (cq) cq.onclick = () => go('/api/castle/conquer'); const ch = $('#chal'); if (ch) ch.onclick = () => go('/api/castle/challenge');
    $$('[data-trap]').forEach(b => b.onclick = () => go('/api/castle/trap', { trap: b.dataset.trap }));
  }

  /* ═════════ DAILY BOUNTY ═════════ */
  async function bounty() {
    const b = await api('/api/bounty'), q = b.quest;
    main.innerHTML = `${sceneHero('/img/monsters/marksman.jpg', 'Daily Bounty', 'This contract is the same for every wizard today. Slay the listed beasts in the Abandoned Fort and collect your reward.')}
      <div class="panel ornate" style="max-width:720px"><h3>Today's contract</h3><div style="margin:14px 0">${Object.entries(q.targets).map(([m, n]) => { const have = Math.min(b.progress[m] || 0, n), A = WB.MONART[m]; return `<div class="row" style="gap:14px;margin-bottom:12px;flex-wrap:nowrap"><div style="width:84px;height:56px;flex:none;background:url(/img/monsters/${A ? A.slug : 'zombie'}-card.jpg) center/cover;border:1px solid var(--line);border-radius:4px"></div><div style="flex:1"><div class="row between"><b>${m}</b><span class="${have >= n ? 'sage' : 'muted'}">${have}/${n}</span></div><div class="bar"><i style="width:${have / n * 100}%"></i></div></div></div>`; }).join('')}</div>
      <div class="row between"><span class="chip">Reward ${WB.coin} ${q.reward}</span><button class="btn" id="claim" ${b.claimed || !b.done ? 'disabled' : ''}>${b.claimed ? 'Claimed today' : b.done ? 'Claim reward' : 'In progress'}</button></div>
      <p class="muted" style="font-size:.88rem;margin-top:12px">Progress counts fort kills made today. It resets with the daily reset (midnight PHT).</p></div>`;
    $('#claim').onclick = async () => { try { const r = await api('/api/bounty/claim', {}); ctx.setPlayer(r.player); WB.snd.sfx.coin(); toast(`Bounty claimed: +${r.reward} coins.`); bounty(); } catch (e) { toast(e.message, true); } };
  }

  /* ═════════ MYSTERY TRADER ═════════ */
  async function trader() {
    const t = await api('/api/trader'), SPm = SP();
    const body = t.present ? `<p class="muted" style="margin-bottom:12px">He leaves in about <b>${t.minutes} min</b>. Each spell costs its price in coins <b>plus 1 Chest</b>. You have ${WB.coin} ${t.coins} and ${I('chest')} ${t.chests}.</p>
      <div class="grid g3">${t.items.map(o => { const s = SPm[o.spell], owned = t.owned.includes(o.spell), lock = t.level < o.lv; return `<div class="sp-card ${owned ? 'owned' : ''} ${lock && !owned ? 'locked' : ''}" style="--ec:${spellColor(s)}"><div class="sp-head"><div class="sp-ic">${I(spellIcon(s))}</div><h4>${esc(s.name)}</h4><span class="lv">LV ${s.lv}</span></div><div class="sp-desc">${spellDesc(s)}</div>
        <div class="sp-foot"><span class="sp-price"><s class="muted">${o.base}</s> ${WB.coin} ${o.price} <span class="badge">−${o.discount}%</span> + ${I('chest')}</span>${owned ? `<span class="sp-own">${I('check')} OWNED</span>` : `<button class="btn sm" data-buy="${esc(o.spell)}" ${lock || t.coins < o.price || t.chests < 1 ? 'disabled' : ''}>${lock ? 'Lv ' + o.lv : 'Trade'}</button>`}</div></div>`; }).join('')}</div>`
      : `<div class="panel center" style="padding:40px"><h3>The trader has moved on</h3><p class="muted" style="margin-top:8px">He appears on even UTC hours. Come back in about ${t.minutes} minutes.</p></div>`;
    main.innerHTML = `${sceneHero('/img/scenes/trader.jpg', 'Mystery Trader', 'A hooded merchant with a cart of forbidden verses. His stock changes every two hours.')}${body}`;
    $$('[data-buy]').forEach(b => b.onclick = async () => { try { const r = await api('/api/trader/buy', { spell: b.dataset.buy }); ctx.setPlayer(r.player); WB.snd.sfx.coin(); toast(`Learned ${b.dataset.buy}.`); trader(); } catch (e) { toast(e.message, true); } });
  }

  /* ═════════ LIVE PVP ═════════ */
  async function pvp() {
    let alive = true; onLeave(() => { alive = false; });
    const draw = async () => {
      if (!alive) return; let d; try { d = await api('/api/pvp'); } catch (e) { return; }
      if (d.match && !d.match.over) { location.hash = '#/pvpbattle'; return; }
      const left = d.limit - d.tries;
      main.innerHTML = `${sceneHero('/img/scenes/arena-bg.jpg', 'Live PvP', 'Duel another wizard in real time. Open a challenge and wait, or accept one from the list. Both use their Arena spell set. The winner earns 1 coin and a step toward the next level.')}
        <div class="grid g2" style="align-items:start"><div class="panel ornate"><h3>Your challenge</h3><p class="muted" style="margin:6px 0 12px">Battles today: <b class="sage">${d.tries}/${d.limit}</b></p>
          ${d.mine ? '<p>Waiting for an opponent… <span class="muted">(keep this page open)</span></p><button class="btn alt" id="cancel">Cancel challenge</button>' : `<button class="btn big" id="open" ${left < 1 || !d.hasSet ? 'disabled' : ''}>Open a challenge</button>${!d.hasSet ? '<p class="err">Equip spells in your Arena set first.</p>' : left < 1 ? '<p class="err">Daily limit reached.</p>' : ''}`}</div>
          <div class="panel"><h3>Open challenges</h3>${d.open.length ? d.open.map(o => `<div class="row between" style="padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><div class="row" style="gap:12px;flex-wrap:nowrap"><div style="width:44px;height:56px;background:url(${WB.classSrc(o.cls, o.gender)}) center bottom/contain no-repeat"></div><div><b>${esc(o.name)}</b><div class="muted" style="font-size:.85rem">${o.cls} · Level ${o.level}</div></div></div><button class="btn sm" data-acc="${o.uid}" ${left < 1 || !d.hasSet ? 'disabled' : ''}>Fight</button></div>`).join('') : '<p class="muted">No open challenges right now.</p>'}</div></div>`;
      const act = async (url, body) => { try { await api(url, body || {}); draw(); } catch (e) { toast(e.message, true); } };
      const o = $('#open'); if (o) o.onclick = () => act('/api/pvp/open'); const c = $('#cancel'); if (c) c.onclick = () => act('/api/pvp/cancel');
      $$('[data-acc]').forEach(b => b.onclick = () => act('/api/pvp/accept', { host: Number(b.dataset.acc) }));
    };
    await draw(); const id = setInterval(draw, 2500); onLeave(() => clearInterval(id));
  }
  async function pvpbattle() {
    const r = await api('/api/pvp/match?since=0'); if (r.over && !r.summary) { location.hash = '#/pvp'; return; }
    WB.battle.mount(main, r.view, r.events, { ...ctx, pvp: { since: r.seq, myTurn: r.myTurn, turnLeft: r.turnLeft } });
  }


  /* ═════════ PUBLIC PLAYER PROFILE ═════════ */
  async function playerPage() {
    const uid = new URLSearchParams(location.hash.split('?')[1] || '').get('uid'); const d = await api('/api/player?uid=' + encodeURIComponent(uid));
    const it = d.item && S.data.items.find(i => i.name === d.item);
    const stats = [['star', 'Level', d.level], ['heart', 'Max HP', d.max_hp], ['shield', 'Armor', d.armor], ['trophy', 'Trophies', d.trophies], ['swords', 'Arena wins', d.arena_wins], ['skull', 'Dungeon best', 'Floor ' + d.dungeon_best], ['book', 'Spells known', d.spells]];
    main.innerHTML = `${sceneHero('/img/scenes/profile.jpg', esc(d.name), `${d.cls} · <span class="seen ${d.online ? 'on' : ''}"><i class="dot ${d.online ? 'on' : ''}"></i>${d.online ? 'online now' : 'seen ' + agoText(d.ago)}</span>`)}
    <div class="grid g2" style="align-items:start"><div class="panel ornate hero-card" style="grid-template-columns:1fr"><div class="portrait" style="min-height:380px;border:0">${WB.wizard(d.cls, d.gender)}</div></div>
      <div class="panel ornate"><div class="grid g3" style="gap:10px">${stats.map(([ic, l, v]) => `<div class="stat" style="display:block;margin:0;padding:10px 12px"><div class="muted" style="font-family:var(--font-h);font-size:.6rem;letter-spacing:.16em;text-transform:uppercase">${I(ic)} ${l}</div><div style="font-family:var(--font-h);font-size:1.15rem;color:var(--mint)">${v}</div></div>`).join('')}</div>
        ${it ? `<h3 style="margin:18px 0 8px">Equipped gear</h3><div class="row" style="gap:14px">${WB.itemImg(it.name, 'x')}<div><b>${esc(it.name)}</b><div class="muted" style="font-size:.88rem;max-width:340px">${esc(it.ability)}</div></div></div>` : ''}
        ${d.mine ? '<p style="margin-top:18px"><a class="btn sm" href="#/profile">Your full profile</a></p>' : `<h3 style="margin:20px 0 8px">Interact</h3><div class="row"><button class="btn" id="pm">${I('chat')} Message</button><button class="btn alt" id="ch" ${d.canChallenge ? '' : 'disabled'}>${I('swords')} Challenge to Live PvP</button><button class="btn danger sm hidden" id="wd">Withdraw</button></div>
          <p class="muted" style="font-size:.88rem;margin-top:10px">Live PvP battles left today — you: <b>${d.my_pvp_left}/6</b> · them: <b>${d.pvp_left}/6</b>${d.blocker ? `<br><span class="err">${esc(d.blocker)}</span>` : ''}</p>`}</div></div>`;
    $$('.item-img.x').forEach(i => { i.style.cssText = 'height:90px;width:auto'; });
    const pm = $('#pm'); if (pm) pm.onclick = () => WB.social.pm(d.uid, d.name);
    const ch = $('#ch'), wd = $('#wd');
    if (ch) ch.onclick = async () => { ch.disabled = true; try { await api('/api/pvp/challenge', { to: d.uid }); WB.social.waitFor(d.uid, d.name); toast(`Challenge sent to ${d.name}. Waiting for a reply…`); ch.textContent = 'Challenge sent…'; wd.classList.remove('hidden'); } catch (e) { toast(e.message, true); ch.disabled = false; } };
    if (wd) wd.onclick = async () => { await api('/api/pvp/withdraw', { to: d.uid }).catch(() => { }); WB.social.waitFor(null); wd.classList.add('hidden'); ch.disabled = false; ch.innerHTML = `${I('swords')} Challenge to Live PvP`; };
  }

  window.WB.app = { S, route };
  route();
})();
