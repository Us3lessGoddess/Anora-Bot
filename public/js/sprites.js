/* Wizard Battle — SVG/emoji art (no image files needed) */
(function () {
  'use strict';
  /** Class portraits (transparent cut-outs, all facing right — the right-hand fighter is mirrored by CSS).
   *  Female art is picked up automatically: drop public/img/classes/<class>-f.webp and it becomes selectable. */
  const FEM = { Apprentice: false, Barbarian: false, Paladin: false };
  const probe = () => Object.keys(FEM).forEach(c => { const i = new Image(); i.onload = () => { FEM[c] = true; window.dispatchEvent(new Event('wb-fem')); }; i.src = `/img/classes/${c.toLowerCase()}-f.webp`; });
  probe();
  const classSrc = (cls, gender) => `/img/classes/${String(cls || 'Apprentice').toLowerCase()}${gender === 'f' && FEM[cls] ? '-f' : ''}.webp`;
  const wizard = (cls, gender = 'm') => `<img class="wiz" src="${classSrc(cls, gender)}" alt="${cls || ''}" draggable="false">`;
  const ITEMART = { "Dwarf's Helmet": 'dwarfs-helmet', "Peasant's Hat": 'peasants-hat', "Raptor's Claw": 'raptors-claw', Sunglasses: 'sun-glasses', "Zombie's Tooth": 'zombies-tooth' };
  const itemSrc = n => ITEMART[n] ? `/img/items/${ITEMART[n]}.webp` : null;
  const itemImg = (n, cls = '') => itemSrc(n) ? `<img class="item-img ${cls}" src="${itemSrc(n)}" alt="${n}" draggable="false">` : '';

  const MON = { Swordsman: '⚔️', 'Rapier Duelist': '🤺', Zombie: '🧟', Treant: '🌳', Crusader: '🛡️', Marksman: '🏹', Imp: '😈', 'Copper Golem': '🤖', Witch: '🧙‍♀️', 'Wood Golem': '🪵', Emberling: '🔥', 'Cloud Spirit': '☁️', 'Stone Golem': '🗿', 'Corrupted Knight': '♞', Cavalier: '🏇', 'Baby Dragon': '🐲', Zealot: '🔱', Enchantress: '🧝‍♀️',
    'Yuki Onna': '🥶', Hydra: '🐍', Cerberus: '🐺', Minotaur: '🐂' };
  const monster = (name, img) => {
    const boss = !!img;
    return `<div class="mon ${boss ? 'boss' : ''}">${boss ? `<img class="mon-img" data-emoji="${MON[name] || '👹'}" src="${img}" alt="${name}">` : `<span class="mon-emoji">${MON[name] || '👹'}</span>`}</div>`;
  };

  /** Castle skyline used on home/login (palette: ink + slate + mint moon). */
  const skyline = () => `<svg class="skyline" viewBox="0 0 1600 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<g class="layer l1" fill="#2a3346"><path d="M0 420 V300 L120 220 L230 290 L360 190 L520 280 L640 230 L780 300 L930 200 L1080 290 L1220 220 L1380 300 L1500 240 L1600 290 V420Z"/></g>
<g class="layer l2" fill="#262d3e">
<path d="M0 420 V330 Q200 290 400 330 T800 320 T1200 330 T1600 310 V420Z"/>
<g transform="translate(980,90)"><rect x="60" y="130" width="300" height="200" fill="#202734"/><rect x="40" y="70" width="64" height="260" fill="#202734"/><path d="M30 70 L72 8 L114 70Z"/><rect x="300" y="50" width="70" height="280" fill="#202734"/><path d="M290 50 L335 -20 L380 50Z"/><rect x="170" y="90" width="56" height="240" fill="#202734"/><path d="M162 90 L198 30 L234 90Z"/>
<path d="M60 130 h18 v-16 h18 v16 h18 v-16 h18 v16 h18 v-16 h18 v16 h18 v-16 h18 v16 h18 v-16 h18 v16 h18 v-16 h18 v16 h14 v10 h-300z" opacity=".001"/>
<g fill="#E0F8C7"><rect class="win w1" x="64" y="130" width="10" height="18" rx="5"/><rect class="win w2" x="322" y="110" width="10" height="18" rx="5"/><rect class="win w3" x="190" y="130" width="10" height="18" rx="5"/><rect class="win w2" x="190" y="190" width="10" height="18" rx="5"/><rect class="win w1" x="322" y="180" width="10" height="18" rx="5"/><rect class="win w3" x="64" y="200" width="10" height="18" rx="5"/><rect class="win w2" x="120" y="220" width="12" height="22" rx="6"/><rect class="win w1" x="250" y="230" width="12" height="22" rx="6"/></g>
<path d="M198 30 V0" stroke="#202734" stroke-width="3"/><path class="flag" d="M198 0 L226 8 L198 16Z" fill="#B7D894"/></g></g>
<g class="layer l3" fill="#1a202c"><path d="M0 420 V360 Q250 330 520 370 T1100 360 T1600 350 V420Z"/>
<g><path d="M80 380 l22 -90 l22 90z"/><path d="M60 380 l42 -60 l42 60z" transform="translate(0,-14)"/><path d="M1380 380 l22 -100 l22 100z"/><path d="M1352 380 l50 -70 l50 70z" transform="translate(0,-14)"/><path d="M1470 390 l18 -70 l18 70z"/><path d="M250 392 l16 -64 l16 64z"/></g></g></svg>`;

  const moon = () => `<div class="moon"><div class="moon-glow"></div><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#E0F8C7"/><circle cx="34" cy="38" r="9" fill="#B7D894" opacity=".55"/><circle cx="62" cy="58" r="12" fill="#B7D894" opacity=".45"/><circle cx="58" cy="26" r="5" fill="#B7D894" opacity=".5"/><circle cx="30" cy="66" r="6" fill="#B7D894" opacity=".4"/></svg></div>`;

  /** rotating rune circle for login/home decoration */
  const runeCircle = () => {
    const g = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    let t = ''; for (let i = 0; i < 24; i++) { const a = i / 24 * 360; t += `<text x="150" y="26" transform="rotate(${a} 150 150)" text-anchor="middle" font-size="18">${g[i]}</text>`; }
    return `<svg class="runes" viewBox="0 0 300 300" aria-hidden="true"><g fill="#B7D894" stroke="none" class="r-out">${t}</g><circle cx="150" cy="150" r="118" fill="none" stroke="#B7D894" stroke-width="2" opacity=".6"/><circle cx="150" cy="150" r="104" fill="none" stroke="#E0F8C7" stroke-width="1" stroke-dasharray="4 6" opacity=".5" class="r-in"/><g class="r-in" stroke="#E0F8C7" stroke-width="1.5" fill="none" opacity=".6"><polygon points="150,60 228,195 72,195"/><polygon points="150,240 72,105 228,105"/></g></svg>`;
  };

  /** Dice faces: pips on a 3x3 grid */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieHTML = () => `<div class="die-shadow"></div><div class="die-wrap"><div class="die">${[1, 2, 3, 4, 5, 6].map(n => `<div class="face f${n}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`).join('')}</div></div>`;

  document.addEventListener('error', e => { const t = e.target; if (t && t.classList && t.classList.contains('mon-img')) { const sp = document.createElement('span'); sp.className = 'mon-emoji'; sp.textContent = t.dataset.emoji; t.replaceWith(sp); } }, true);
  const BOSS = {
    'Yuki Onna': { c: '#8fd8ff', bg: '#16283d', fx: 'snow', tag: 'The Frost Empress' },
    Hydra: { c: '#8bd44a', bg: '#13291a', fx: 'bubble', tag: 'The Many-Headed Terror' },
    Cerberus: { c: '#ff8a3d', bg: '#35170c', fx: 'ember', tag: 'Hound of the Underworld' },
    Minotaur: { c: '#d9a066', bg: '#2d1d16', fx: 'dust', tag: 'Lord of the Labyrinth' },
  };
  const coin = '<i class="coin"></i>';
  window.WB = window.WB || {};
  Object.assign(window.WB, { BOSS, coin, wizard, classSrc, FEM, itemSrc, itemImg, monster, MON, skyline, moon, runeCircle, dieHTML });
})();
