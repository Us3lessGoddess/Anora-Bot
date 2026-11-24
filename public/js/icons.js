/* Wizard Battle — line-icon set. Any emoji that ends up in the DOM is swapped for a matching icon,
   so the whole UI keeps one sober, engraved look (no cartoon emoji). Also exports the emblem logo. */
(function () {
  'use strict';
  const P = {
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.6A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5c0 6-7.5 10.6-7.5 10.6z"/>',
    swords: '<path d="M4.5 19.5L17 7M14 4.5h5.5V10M19.5 19.5L7 7M10 4.5H4.5V10M6.5 17.5l-2 2M17.5 17.5l2 2"/>',
    shield: '<path d="M12 3l7.5 2.6v6c0 4.7-3.2 7.8-7.5 9.4-4.3-1.6-7.5-4.7-7.5-9.4v-6z"/><path d="M12 7v10" opacity=".5"/>',
    gem: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18M9.5 4L7.5 9 12 20l4.5-11L14.5 4"/>',
    trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5M12 13.5V17M8 20.5h8M9.5 17h5"/>',
    key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 16l2.2-2.2M18.5 18.5l2-2"/>',
    chest: '<path d="M4 10.5a8 5.5 0 0 1 16 0V19H4zM4 13.5h16M12 12v4.5"/>',
    burst: '<path d="M12 2.5l2 5.8 5.8-2.3-2.6 5.6 4.8 3.2-6 .9.9 6-4.9-3.6-4.9 3.6.9-6-6-.9 4.8-3.2L4.2 6l5.8 2.3z"/>',
    heal: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    flame: '<path d="M12 3c.8 4.2 5.2 5.4 5.2 10a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.4 2.2-4.4.1 2 1 3 2.2 3-.4-3.8-1-5.4 .8-8.6z"/>',
    skull: '<path d="M12 3a7.2 7.2 0 0 0-7.2 7.2c0 2.6 1.2 4.2 3.2 5.1V19h8v-3.7c2-.9 3.2-2.5 3.2-5.1A7.2 7.2 0 0 0 12 3z"/><circle cx="9.2" cy="11" r="1.3"/><circle cx="14.8" cy="11" r="1.3"/><path d="M10.5 19v-2.2M13.5 19v-2.2"/>',
    drop: '<path d="M12 3c4 5 6.2 8.2 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 11.2 8 8 12 3z"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.6L12 6.8l2.5-2.2M9.5 19.4L12 17.2l2.5 2.2"/>',
    dizzy: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21M5.6 5.6L8 8M16 16l2.4 2.4M18.4 5.6L16 8M8 16l-2.4 2.4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    spiral: '<path d="M12 12c0-1.5 2-1.5 2 0s-3 2.2-4 0 1-5 4-5 6 4 6 8-5 6-9 5"/>',
    arrowdown: '<path d="M12 4v16M6 14l6 6 6-6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
    castle: '<path d="M4 20.5V8h3V5h2v3h2V5h2v3h2V5h2v3h3v12.5zM10 20.5v-5a2 2 0 0 1 4 0v5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
    cart: '<path d="M3 4h3l2 11h10l2-8H7M10 20h.01M17 20h.01"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
    books: '<path d="M4 4h4v16H4zM9.5 4h4v16h-4zM15 5.5l3.8-1 3 14.5-3.8 1z"/>',
    scroll: '<path d="M7 4h11v13a3 3 0 0 1-3 3H6a3 3 0 0 0 3-3V6a2 2 0 0 0-2-2zM10 9h5M10 13h5"/>',
    bag: '<path d="M6 8h12l1 12.5H5zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
    bolt: '<path d="M13 2.5L5 14h6l-1 7.5 8-11.5h-6z"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    sparkle: '<path d="M12 3l2.1 6L20 12l-5.9 3L12 21l-2.1-6L4 12l5.9-3z"/>',
    flag: '<path d="M5 21V4M5 5h12l-2.2 4 2.2 4H5"/>',
    leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8"/>',
    crown: '<path d="M3 8l4.2 4L12 5l4.8 7L21 8l-2 11H5z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11L6 3h4l2 4 2-4h4l-2.5 8"/>',
    wand: '<path d="M4 20L15 9M15.5 3.5l1.2 2.3 2.3 1.2-2.3 1.2-1.2 2.3-1.2-2.3L12 7l2.3-1.2z"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>',
    fast: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    pause: '<path d="M8 4v16M16 4v16" stroke-width="3"/>',
    check: '<path d="M5 12.5l5 5L19.5 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    save: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
    clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6"/>',
    orb: '<circle cx="12" cy="11" r="7"/><path d="M7 20h10M9 17.5L8 20M15 17.5l1 2.5"/>',
    diamond: '<path d="M12 4l7 8-7 8-7-8z"/>',
    logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
    send: '<path d="M4 12l16-8-6 16-3-7z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5"/>',
  };
  const MAP = {
    '❤': 'heart', '⚔': 'swords', '🛡': 'shield', '💎': 'gem', '🏆': 'trophy', '🗝': 'key', '🧰': 'chest', '💥': 'burst', '💚': 'heal', '🔥': 'flame',
    '☠': 'skull', '💀': 'skull', '🩸': 'drop', '🧊': 'snow', '❄': 'snow', '💫': 'dizzy', '👁': 'eye', '🌀': 'spiral', '⬇': 'arrowdown', '🎯': 'target',
    '🎲': 'dice', '🏰': 'castle', '🌍': 'globe', '🛒': 'cart', '📖': 'book', '📚': 'books', '📜': 'scroll', '🎒': 'bag', '⚡': 'bolt', '⏳': 'hourglass',
    '✨': 'sparkle', '🏳': 'flag', '🌿': 'leaf', '👑': 'crown', '⭐': 'star', '🔒': 'lock', '🏅': 'medal', '🪄': 'wand', '🔊': 'speaker', '🔇': 'mute',
    '⏩': 'fast', '✓': 'check', '✗': 'x', '✕': 'x', '❌': 'x', '⟳': 'refresh', '📋': 'clipboard', '💾': 'save', '🔮': 'orb', '🐉': 'flame', '🎉': 'sparkle',
    '🧙': 'wand', '⏸': 'pause', '▶': 'play', '🔸': 'diamond', '🥇': 'medal g1', '🥈': 'medal g2', '🥉': 'medal g3', '☣': 'skull', '👹': 'skull',
  };
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
  const RE = new RegExp('(' + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\uFE0F?', 'g');

  // sprite
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.setAttribute('width', '0'); sprite.setAttribute('height', '0'); sprite.style.position = 'absolute'; sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = Object.entries(P).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('');
  document.body.prepend(sprite);

  const icon = (name, extra = '') => `<svg class="ic ic-${name.split(' ')[0]} ${name.split(' ')[1] || ''} ${extra}" aria-hidden="true"><use href="#i-${name.split(' ')[0]}"/></svg>`;
  const SKIP = 'SCRIPT,STYLE,CANVAS,TEXTAREA,INPUT,SVG,TITLE';
  function swap(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue; if (!RE.test(t)) { RE.lastIndex = 0; return; } RE.lastIndex = 0;
      const p = node.parentElement; if (!p || SKIP.includes(p.tagName.toUpperCase()) || p.closest('.mon-emoji,.no-ic,.torch,.confetti')) return;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = RE.exec(t))) { frag.append(t.slice(last, m.index)); const tpl = document.createElement('template'); tpl.innerHTML = icon(MAP[m[1]]); frag.append(tpl.content.firstChild); last = m.index + m[0].length; }
      frag.append(t.slice(last)); node.replaceWith(frag); RE.lastIndex = 0;
    } else if (node.nodeType === 1 && !SKIP.includes(node.tagName.toUpperCase()) && !node.closest('.mon-emoji,.no-ic,.torch')) {
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); const list = []; while (w.nextNode()) list.push(w.currentNode); list.forEach(swap);
    }
  }
  new MutationObserver(ms => { for (const m of ms) { m.addedNodes.forEach(swap); if (m.type === 'characterData') swap(m.target); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  swap(document.body);

  /** Emblem: ringed crest with a crossed staff & blade and a d6 pip-star at the heart. */
  const logo = (cls = '') => `<svg class="logo ${cls}" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="lg" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#36415A"/><stop offset="1" stop-color="#202734"/></radialGradient></defs>
    <circle cx="32" cy="32" r="30" fill="url(#lg)" stroke="#B7D894" stroke-width="2"/><circle cx="32" cy="32" r="26" fill="none" stroke="#B7D894" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1.5 3.2"/>
    <g stroke="#E0F8C7" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M17 49L44 16"/><path d="M47 49L20 17"/><path d="M38.5 21.5l5 4M25.5 21.5l-4.5 4.5" stroke-width="2"/></g>
    <circle cx="44.5" cy="15.5" r="3.4" fill="#B7D894" stroke="#E0F8C7" stroke-width="1.2"/><path d="M19.5 14.5l-3 3 3.5 3.5 3-3z" fill="#E0F8C7"/>
    <path d="M32 24l5 8-5 8-5-8z" fill="#202734" stroke="#B7D894" stroke-width="1.6"/><circle cx="32" cy="32" r="1.5" fill="#E0F8C7"/></svg>`;

  window.WB = window.WB || {};
  Object.assign(window.WB, { icon, logo, ICONS: P });
})();
