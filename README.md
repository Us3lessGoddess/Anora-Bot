# 🧙 Wizard Battle — Web Edition

The Discord *Wizard Battle V7.5* game as a website: dice-driven spell combat, 78 animated spells, status-effect
auras, 3D dice, monsters, a weekly World Boss and a ranked Arena. Palette: `#202734 · #36415A · #B7D894 · #E0F8C7`.

**Stack:** Node.js (no framework) · Turso (libSQL) · static front-end (no build step) · hosted on Render free tier · kept awake by UptimeRobot.

---

## 1) Create the Turso database (free)
```bash
curl -sSfL https://get.tur.so/install.sh | bash        # install CLI (or: brew install tursodatabase/tap/turso)
turso auth signup                                      # or: turso auth login
turso db create wizard-battle-web
turso db show wizard-battle-web --url                  # -> TURSO_URL   (libsql://...)
turso db tokens create wizard-battle-web               # -> TURSO_TOKEN
```
Tables are created automatically on first start. They are all prefixed `web_`, so you can even reuse the
same Turso DB as your Discord bot without clashing.

## 2) Push to GitHub
Upload this folder as a new repo (the `.gitignore` already excludes secrets and local DB files).

## 3) Deploy on Render
1. Render → **New → Web Service** → connect the repo (or **New → Blueprint** to use `render.yaml`).
2. Runtime **Node**, Build command `npm install`, Start command `node server.js`, Plan **Free**.
3. Health check path: `/health`
4. Environment variables:
   | Key | Value |
   |---|---|
   | `TURSO_URL` | `libsql://…` from step 1 |
   | `TURSO_TOKEN` | token from step 1 |
   | `SESSION_SECRET` | any random 32+ character string (Blueprint generates one) |
   | `NODE_VERSION` | `22` |
5. Deploy. Your site is at `https://<name>.onrender.com`.

## 4) UptimeRobot (keeps the free instance awake)
New monitor → **HTTP(s)** → URL `https://<name>.onrender.com/health` → interval **5 minutes**.
(`/health` is instant and doesn't touch the DB; `/health/db` also pings Turso if you want to check it.)

---

## Run locally
```bash
npm install
cp .env.example .env     # fill in Turso values, or leave empty to use a local SQLite file (Node 22+)
npm start                # http://localhost:3000
npm test                 # engine simulation (4,000 fights) + full API smoke test
```

## What's in it
* **Sign-up with captcha** — distorted rune-stone SVG, signed single-use 5-minute token, answer never sent to the browser.
  Passwords hashed with scrypt, signed HttpOnly session cookie, rate limits on login/signup/captcha, CSP + security headers.
* **Server-authoritative battles** — every dice roll happens on the server (no cheating); the browser only plays back events.
* **Classes** Paladin / Barbarian / Apprentice with their passives, **items**, **78 spells**, **8 status effects** (Burn, Poison, Bleed, Freeze, Stun, Blind, Confuse, Weaken + Pierce), CC cap 2 / heal cap 2 / no duplicates, armor, Weaken cap — ported from your bot.
* **Modes:** Abandoned Fort (daily tier + per-monster daily session + kill limits → Key/Chest roll), World Boss (shared HP, weekly rotation, energy, milestone bonuses),
  Arena (initiative roll, bot-controlled rival builds, trophies, 5 wins = level up), Daily dice lottery, Chests/Keys, Shop (coins for spells, gems for gear), two spell sets (Arena / Monster+Boss), Library, Leaderboards.
* **Daily reset** at midnight Philippine time (16:00 UTC), same as the bot. Boss energy +1/20 min, Arena energy +1/hour.

### Newly added modes (lib/features.js)
* **Daily Bounty** – one shared kill contract per day (pool chosen by player levels); progress counts fort kills; claim for coins.
* **Mystery Trader** – present on even UTC hours; 5 seeded spells at 1–5% off; costs coins **+ 1 Chest** per spell.
* **Trials Dungeon** – a d6 picks each floor's foe, full HP between floors, reward roll every 5 floors, energy (cap 6, +1/20 min) is only spent if you die.
* **The Castle** – one throne, vault +1 coin / 90 min, single-use traps (Barbed Moat, Upper Hand, Gargoyle Guard), −4% king HP per defense (max −40%), castle energy cap 4 (+1/h).
* **Live PvP** – open a challenge or accept one; turn-based over simple polling (no websockets needed); 6 battles/day; winner gets 1 coin + a level-progress win; idle for 2 minutes = forfeit.
  Live matches live in the server's memory, so a restart ends any duel in progress (fine for one free Render instance).

### Not ported
Weekly Arena/Dungeon prize payouts (leaderboards exist, payouts don't).

### Battle presentation (immersion pass)
* **Dice:** an obsidian die with glowing sage pips (ember-red "1") is thrown onto an engraved stone disc, bounces three times with dust and embers, then an engraved verdict plate appears.
* **Sound** is fully synthesized in the browser (no audio files): layered filtered noise, resonators and convolution reverb — stone-on-wood dice rattle, weighty thuds, fire crackle,
  glass-shatter ice, lightning crack, choir-pad healing, dark drones, a victory/defeat sting and a low ambient drone while a battle is on screen. Impacts are element-aware.
  Use the speaker button in the top bar to mute everything.
* **Battle animation:** characters breathe, wind up and thrust when casting, dash in for melee spells, recoil with a flash when hit, block, channel when healing and collapse when defeated;
  the camera pushes in during spells, punches in on hits, and big hits trigger a brief hit-stop. Monsters painted into the scene pictures lunge, recoil and fade through the scene itself.

### Social features (lib/social.js, public/js/social.js)
* **World chat** (bottom-right, minimize/expand; remembers its state). Rules: max **100 words** and 700 characters, no links, no shouting (mostly CAPS), no repeated characters/words,
  no duplicate message within 60 s, 1 message per 2.5 s and 10 per minute; 4 rejected messages in 2 minutes = 60 s mute. Last ~300 messages are kept.
* **Online players** button in the top bar (green dot + number = active in the last 5 minutes). Click it for everyone seen in the last hour, with Message buttons.
* **Private messages** (Messages tab) with unread badges; start one from the online list or a player's profile.
* **Player profiles** (click any name in chat, ranks or the online list): stats, gear, **Message** and **Challenge to Live PvP** — the challenge button is enabled only if
  both players still have Live PvP battles left today (6 per day), both have Arena spells equipped, and the other player is online. The target gets an Accept/Decline pop-up on any page.
* **Welcome gift:** every new player gets **Speedster for their first 7 days** (existing players who joined in the last 7 days received it too).

### Premium shop (click the gem counter in the top bar)
* **Speedster** – 1 gem = 1 week of the Speed-Up button (Fort & Boss battles only; buying again extends it).
* **Extra Boss Attack** – 1 gem = +1 Boss energy (works above the cap), max 10 per day.
* **Refresh Arena Energy** – 1 gem = +1 Arena energy for the bot-controlled Arena, max 10 per day.
* **Auto roll** is available in Fort and Boss battles; neither Auto nor Speed-Up exists in the Arena/PvP.
Existing databases upgrade automatically on start (two new columns: `gender`, `speedster_until`).

### Characters, gender & items
Class art lives in `public/img/classes/<class>.webp` (all facing **right**; the right-hand fighter is mirrored in CSS so duelists face each other).
**Female versions** (already included): `*-f.webp` files sit beside the male art; to replace them add `apprentice-f.webp`, `barbarian-f.webp`, `paladin-f.webp` (transparent background, facing right) to that folder —
the *Female* option on the character-creation screen switches on by itself once all three exist. Item art is in `public/img/items/`.

### Monster art
Fort monsters use illustrations in `public/img/monsters/` (`<slug>.jpg` = battle backdrop, `<slug>-card.jpg` = card thumbnail,
e.g. `baby-dragon.jpg`). `public/js/monart.js` records where each monster stands in its picture (used for hit/freeze/burn effects
and spell targeting). To swap an image, replace the file with the same name (16:9 works best, monster right of centre).
World-boss portraits come from the image URLs in your bot's Boss DB (with an emoji fallback).

### Free-tier notes
* Render free instances sleep after ~15 min idle (UptimeRobot prevents it); a cold start takes ~30–50 s.
* Never rely on Render's disk — all data lives in Turso.
* Rate limits and used-captcha memory are in-process, which is fine for a single free instance.

### Files
```
server.js          HTTP server, API, daily/energy/boss logic
lib/engine.js      battle rules → animation events
lib/db.js          Turso (prod) / local SQLite (dev) adapter + schema
lib/auth.js        captcha, scrypt, cookies, rate limiting
lib/gamedata.json  spells, classes, effects, items, monsters, bosses (from your CSVs)
public/            index.html, css/style.css, js/{fx,spells-fx,sprites,ambient,battle,app}.js
```
