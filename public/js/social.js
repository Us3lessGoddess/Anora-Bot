/* Wizard Battle — social client: world chat (bottom-right, minimizable), private messages, online list, live-PvP invites */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (n, x) => WB.icon(n, x), api = (u, b) => WB.api(u, b), toast = (m, bad) => WB.toast(m, bad);
  const MAX_WORDS = 100;
  const S = { on: false, w: 0, world: [], wUnread: 0, pmUnread: 0, online: 0, open: localStorage.getItem('wb_chat_open') === '1', tab: localStorage.getItem('wb_chat_tab') || 'world',
    thread: null, tmsgs: [], tsince: 0, threads: [], timer: null, polls: 0, shownInv: new Map(), waiting: null, shownMatch: null, sentPrev: 0, root: null };
  const fmt = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ago = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : '1 h ago'; };
  const words = t => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const me = () => WB.app && WB.app.S.me && WB.app.S.me.player;

  /* ───────── DOM shell ───────── */
  function mountRoot() {
    if (S.root) return; const r = document.createElement('div'); r.id = 'chatw'; document.body.appendChild(r); S.root = r;
    const inv = document.createElement('div'); inv.id = 'invites'; document.body.appendChild(inv);
  }
  const badge = () => S.wUnread + S.pmUnread;
  function save() { localStorage.setItem('wb_chat_open', S.open ? '1' : '0'); localStorage.setItem('wb_chat_tab', S.tab); }
  function render() {
    if (!S.on) { if (S.root) S.root.innerHTML = ''; return; }
    mountRoot(); const r = S.root;
    if (!S.open) { r.innerHTML = `<button class="chat-fab" id="cf">${I('chat')}<span>Chat</span>${badge() ? `<i class="cbadge">${badge() > 99 ? '99+' : badge()}</i>` : ''}</button>`; r.querySelector('#cf').onclick = () => { S.open = true; S.wUnread = 0; save(); render(); scrollEnd(); tick(); }; return; }
    r.innerHTML = `<div class="chat-panel"><div class="chat-head"><div class="chat-tabs"><button data-t="world" class="${S.tab === 'world' ? 'on' : ''}">${I('globe')} World</button><button data-t="messages" class="${S.tab === 'messages' ? 'on' : ''}">${I('scroll')} Messages${S.pmUnread ? `<i class="cbadge">${S.pmUnread}</i>` : ''}</button></div><button class="chat-min" id="cm" title="Minimize">${I('x')}</button></div>
      <div class="chat-body" id="cb"></div><div class="chat-foot" id="cfoot"></div></div>`;
    r.querySelector('#cm').onclick = () => { S.open = false; save(); render(); };
    r.querySelectorAll('.chat-tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; if (S.tab === 'world') S.wUnread = 0; save(); render(); if (S.tab === 'messages') loadThreads(); scrollEnd(); });
    paintBody(); paintFoot();
  }
  function paintBody() {
    const b = S.root && S.root.querySelector('#cb'); if (!b) return; const keep = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    if (S.tab === 'world') b.innerHTML = S.world.length ? S.world.map(m => `<div class="cm"><b class="who" data-uid="${m.uid}">${esc(m.name)}</b><time>${fmt(m.ts)}</time><div>${esc(m.text)}</div></div>`).join('') : '<p class="muted center" style="padding:24px 8px">No messages yet. Say hello!</p>';
    else if (S.thread) b.innerHTML = `<div class="thread-head"><button class="icon-btn" id="tb">←</button><b class="who" data-uid="${S.thread.uid}">${esc(S.thread.name)}</b><span class="muted">${S.thread.online ? '● online' : ''}</span></div>${S.tmsgs.length ? S.tmsgs.map(m => `<div class="pmb ${m.mine ? 'mine' : ''}"><div>${esc(m.text)}</div><time>${fmt(m.ts)}</time></div>`).join('') : '<p class="muted center" style="padding:20px 8px">No messages yet — write the first one.</p>'}`;
    else b.innerHTML = S.threads.length ? S.threads.map(t => `<div class="conv" data-uid="${t.uid}" data-name="${esc(t.name)}"><div class="av" style="background-image:url(${WB.classSrc(t.cls, t.gender)})"></div><div class="cinfo"><b>${esc(t.name)}${t.online ? ' <span class="dot on"></span>' : ''}</b><div class="muted">${t.mine ? 'You: ' : ''}${esc(t.last)}</div></div>${t.unread ? `<i class="cbadge">${t.unread}</i>` : ''}</div>`).join('') : '<p class="muted center" style="padding:24px 12px">No conversations yet.<br>Open the online players list or a player profile to send a message.</p>';
    b.querySelectorAll('.who').forEach(w => w.onclick = () => { location.hash = `#/player?uid=${w.dataset.uid}`; });
    b.querySelectorAll('.conv').forEach(c => c.onclick = () => openThread(Number(c.dataset.uid)));
    const tb = b.querySelector('#tb'); if (tb) tb.onclick = () => { S.thread = null; paintBody(); paintFoot(); loadThreads(); };
    if (keep) b.scrollTop = b.scrollHeight;
  }
  const scrollEnd = () => { const b = S.root && S.root.querySelector('#cb'); if (b) b.scrollTop = b.scrollHeight; };
  function paintFoot() {
    const f = S.root && S.root.querySelector('#cfoot'); if (!f) return;
    if (S.tab === 'messages' && !S.thread) { f.innerHTML = '<span class="muted" style="font-size:.8rem">Pick a conversation, or message someone from the Online list.</span>'; return; }
    f.innerHTML = `<div class="cin"><input id="ci" maxlength="900" autocomplete="off" placeholder="${S.tab === 'world' ? 'Message the world…' : 'Private message…'}"><button class="btn sm" id="cs" title="Send">${I('send')}</button></div><div class="cwc" id="cwc">0/${MAX_WORDS} words</div>`;
    const inp = f.querySelector('#ci'), wc = f.querySelector('#cwc'), send = f.querySelector('#cs');
    inp.oninput = () => { const n = words(inp.value); wc.textContent = `${n}/${MAX_WORDS} words`; wc.classList.toggle('over', n > MAX_WORDS); };
    const go = async () => { const text = inp.value; if (!text.trim()) return; if (words(text) > MAX_WORDS) return toast(`Messages are limited to ${MAX_WORDS} words.`, true); send.disabled = true;
      try { if (S.tab === 'world') { await api('/api/chat/send', { text }); inp.value = ''; inp.oninput(); await tick(); } else { await api('/api/pm/send', { to: S.thread.uid, text }); inp.value = ''; inp.oninput(); await loadThread(); } } catch (e) { toast(e.message, true); }
      send.disabled = false; inp.focus(); };
    send.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }

  /* ───────── data ───────── */
  async function loadThreads() { try { S.threads = (await api('/api/pm/threads')).threads; if (S.open && S.tab === 'messages' && !S.thread) paintBody(); } catch { } }
  async function loadThread(first) {
    if (!S.thread) return; try {
      const r = await api(`/api/pm/thread?with=${S.thread.uid}&since=${first ? 0 : S.tsince}`); S.thread.online = r.with.online; S.thread.name = r.with.name;
      if (first) S.tmsgs = r.messages; else for (const m of r.messages) if (!S.tmsgs.some(x => x.id === m.id)) S.tmsgs.push(m);
      S.tsince = S.tmsgs.length ? S.tmsgs[S.tmsgs.length - 1].id : 0; if (S.open && S.tab === 'messages') paintBody(); S.pmUnread = Math.max(0, S.pmUnread - r.messages.filter(m => !m.mine).length);
    } catch (e) { }
  }
  async function openThread(uid, name) { S.thread = { uid, name: name || '…', online: false }; S.tmsgs = []; S.tsince = 0; S.tab = 'messages'; S.open = true; save(); render(); await loadThread(true); paintFoot(); const i = S.root.querySelector('#ci'); if (i) i.focus(); scrollEnd(); }

  async function tick() {
    if (!S.on) return;
    try {
      const r = await api(`/api/live?w=${S.w}`); S.polls++;
      if (r.world.length) { for (const m of r.world) if (!S.world.some(x => x.id === m.id)) { S.world.push(m); if (!(S.open && S.tab === 'world') && m.uid !== (me() && me().uid) && S.w > 0) S.wUnread++; } S.world = S.world.slice(-150); S.w = S.world[S.world.length - 1].id; if (S.open && S.tab === 'world') paintBody(); }
      const prevPm = S.pmUnread; S.pmUnread = r.pmUnread; S.online = r.online;
      const oc = document.getElementById('online-count'); if (oc) oc.textContent = r.online;
      if (S.open && S.tab === 'messages') { if (S.thread) await loadThread(); else if (r.pmUnread !== prevPm || S.polls % 3 === 0) await loadThreads(); }
      if (r.pmUnread > prevPm && !(S.open && S.tab === 'messages')) toast('You have a new private message.');
      badgeUpdate(); invites(r);
    } catch (e) { /* offline or logged out */ }
  }
  function badgeUpdate() { const f = S.root && S.root.querySelector('.chat-fab'); if (f) { let b = f.querySelector('.cbadge'); if (badge()) { if (!b) { b = document.createElement('i'); b.className = 'cbadge'; f.appendChild(b); } b.textContent = badge() > 99 ? '99+' : badge(); } else if (b) b.remove(); } const t = S.root && S.root.querySelector('.chat-tabs button[data-t="messages"]'); if (t) { let b = t.querySelector('.cbadge'); if (S.pmUnread) { if (!b) { b = document.createElement('i'); b.className = 'cbadge'; t.appendChild(b); } b.textContent = S.pmUnread; } else if (b) b.remove(); } }

  /* ───────── live-PvP invitations ───────── */
  function invites(r) {
    const box = document.getElementById('invites'); if (!box) return; const seen = new Set();
    for (const iv of r.invites) {
      seen.add(iv.from); let el = S.shownInv.get(iv.from);
      if (!el) { el = document.createElement('div'); el.className = 'inv'; el.innerHTML = `<div class="av" style="background-image:url(${WB.classSrc(iv.cls, 'm')})"></div><div class="cinfo"><b>${esc(iv.name || 'A wizard')}</b> challenges you to <b>Live PvP</b><div class="muted">${esc(iv.cls || '')} · Level ${iv.level || '?'}</div><div class="row" style="margin-top:8px"><button class="btn sm" data-a="1">Accept</button><button class="btn sm alt" data-a="0">Decline</button></div></div>`; box.appendChild(el); S.shownInv.set(iv.from, el); WB.snd.sfx.ok();
        el.querySelectorAll('button').forEach(b => b.onclick = async () => { b.disabled = true; try { await api('/api/pvp/respond', { from: iv.from, accept: b.dataset.a === '1' }); if (b.dataset.a === '1') { el.remove(); S.shownInv.delete(iv.from); location.hash = '#/pvpbattle'; return; } } catch (e) { toast(e.message, true); } el.remove(); S.shownInv.delete(iv.from); }); }
    }
    for (const [k, el] of [...S.shownInv]) if (!seen.has(k)) { el.remove(); S.shownInv.delete(k); }
    const m = r.match; const here = location.hash.startsWith('#/pvpbattle');
    if (m && !m.over && !here && S.shownMatch !== m.id) { S.shownMatch = m.id; if (S.waiting) { S.waiting = null; location.hash = '#/pvpbattle'; } else { const el = document.createElement('div'); el.className = 'inv'; el.innerHTML = `<div class="cinfo"><b>Your Live PvP duel has started!</b><div class="row" style="margin-top:8px"><button class="btn sm">Enter the duel</button></div></div>`; box.appendChild(el); el.querySelector('button').onclick = () => { el.remove(); location.hash = '#/pvpbattle'; }; } }
    if (S.waiting && r.sent.length === 0 && !m) { const w = S.waiting; S.waiting = null; toast(`${w.name} did not accept your challenge.`, true); }
    S.sentPrev = r.sent.length;
  }

  /* ───────── online players modal ───────── */
  async function openOnline() {
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal panel ornate" style="padding:24px;max-height:86vh;overflow:auto"><p class="muted">Loading…</p></div>'; document.body.appendChild(bg);
    const close = () => bg.remove(); bg.onclick = e => { if (e.target === bg) close(); };
    try {
      const d = await api('/api/online');
      bg.firstChild.innerHTML = `<button class="x-close" id="oc">${I('x')}</button><h2 class="title" style="font-size:1.2rem">Players online<small>${d.online} online now · ${d.players.length} seen in the last hour</small></h2>
        ${d.players.length ? d.players.map(p => `<div class="onrow" data-uid="${p.uid}"><div class="av" style="background-image:url(${WB.classSrc(p.cls, p.gender)})"></div><div class="cinfo"><b>${esc(p.name)}${p.uid === d.me ? ' <span class="badge">YOU</span>' : ''}</b><div class="muted">${p.cls} · Level ${p.level}</div></div><span class="seen ${p.online ? 'on' : ''}"><i class="dot ${p.online ? 'on' : ''}"></i>${p.online ? 'online' : ago(p.ago)}</span>${p.uid === d.me ? '' : `<button class="btn sm alt" data-pm="${p.uid}" data-name="${esc(p.name)}">Message</button>`}</div>`).join('') : '<p class="muted">Nobody has been active in the last hour.</p>'}`;
      bg.querySelector('#oc').onclick = close;
      bg.querySelectorAll('.onrow').forEach(r => r.onclick = e => { if (e.target.closest('[data-pm]')) return; close(); location.hash = `#/player?uid=${r.dataset.uid}`; });
      bg.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { close(); openThread(Number(b.dataset.pm), b.dataset.name); });
    } catch (e) { bg.firstChild.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  function start() { if (S.on) return; S.on = true; mountRoot(); render(); tick(); S.timer = setInterval(() => { if (!document.hidden || S.polls % 4 === 0) tick(); S.polls++; }, 4000); }
  function stop() { S.on = false; clearInterval(S.timer); S.timer = null; S.world = []; S.w = 0; S.wUnread = S.pmUnread = 0; S.thread = null; S.shownInv.clear(); render(); const b = document.getElementById('invites'); if (b) b.innerHTML = ''; }
  window.WB = window.WB || {};
  WB.social = { start, stop, openOnline, pm: openThread, waitFor: (uid, name) => { S.waiting = uid ? { uid, name } : null; S.shownMatch = null; }, get online() { return S.online; }, get on() { return S.on; } };
})();
