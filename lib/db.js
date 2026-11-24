'use strict';
/**
 * Tiny DB adapter with ONE interface:  db.execute(sql, args) -> { rows, rowsAffected, lastInsertRowid }
 *                                      db.batch([[sql,args],...]) -> runs atomically
 *  - TURSO_URL + TURSO_TOKEN set  -> Turso (libSQL over HTTPS, works on Render free tier)
 *  - otherwise                    -> local SQLite file (node:sqlite) so you can develop offline.
 *    (Render's free disk is wiped on every deploy/restart, so ALWAYS use Turso in production.)
 * All tables are prefixed "web_" so you can safely share a Turso DB with the Discord bot.
 */
let impl;

function rowsToObjects(res) {
  const cols = res.columns || [];
  return (res.rows || []).map(r => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
}

async function connect() {
  const url = process.env.TURSO_URL, token = process.env.TURSO_TOKEN;
  if (url && token) {
    const { createClient } = require('@libsql/client/web');
    // force plain HTTPS (no websockets) — most reliable on serverless/free hosts
    const client = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: token });
    impl = {
      kind: 'turso',
      async execute(sql, args = []) {
        const r = await client.execute({ sql, args });
        return { rows: rowsToObjects(r), rowsAffected: r.rowsAffected, lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null };
      },
      async batch(stmts) {
        const rs = await client.batch(stmts.map(([sql, args]) => ({ sql, args: args || [] })), 'write');
        return rs.map(r => ({ rows: rowsToObjects(r), rowsAffected: r.rowsAffected }));
      },
    };
    console.log('🗄️  Database: Turso (' + url.replace(/^libsql:\/\//, '').split('.')[0] + ')');
  } else {
    let DatabaseSync;
    try { ({ DatabaseSync } = require('node:sqlite')); } catch { throw new Error('Set TURSO_URL and TURSO_TOKEN (node:sqlite is unavailable on this Node version).'); }
    const path = process.env.LOCAL_DB || require('path').join(__dirname, '..', 'local-dev.db');
    const sdb = new DatabaseSync(path);
    sdb.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const run = (sql, args = []) => {
      const st = sdb.prepare(sql);
      if (/^\s*(select|pragma|with)/i.test(sql) || /\breturning\b/i.test(sql)) return { rows: st.all(...args).map(o => ({ ...o })), rowsAffected: 0, lastInsertRowid: null };
      const r = st.run(...args);
      return { rows: [], rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    };
    impl = {
      kind: 'local',
      async execute(sql, args) { return run(sql, args); },
      async batch(stmts) { sdb.exec('BEGIN'); try { const out = stmts.map(([s, a]) => run(s, a)); sdb.exec('COMMIT'); return out; } catch (e) { sdb.exec('ROLLBACK'); throw e; } },
    };
    console.warn('⚠️  TURSO_URL / TURSO_TOKEN not set — using LOCAL SQLite file. Data is NOT persistent on Render. Set the Turso env vars!');
  }
  return impl;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS web_users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     pass_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_players (
     user_id INTEGER PRIMARY KEY,
     display_name TEXT NOT NULL,
     class_name TEXT NOT NULL,
     level INTEGER NOT NULL DEFAULT 1,
     coins INTEGER NOT NULL DEFAULT 70,
     gems INTEGER NOT NULL DEFAULT 5,
     pvp_wins INTEGER NOT NULL DEFAULT 0,
     trophies INTEGER NOT NULL DEFAULT 0,
     arena_wins INTEGER NOT NULL DEFAULT 0,
     arena_registered INTEGER NOT NULL DEFAULT 0,
     spells_owned TEXT NOT NULL DEFAULT '[]',
     spell_set TEXT NOT NULL DEFAULT '[null,null,null,null,null,null]',
     monster_spell_set TEXT NOT NULL DEFAULT '[null,null,null,null,null,null]',
     items_owned TEXT NOT NULL DEFAULT '[]',
     equipped_item TEXT,
     chests INTEGER NOT NULL DEFAULT 0,
     keys INTEGER NOT NULL DEFAULT 0,
     daily TEXT NOT NULL DEFAULT '{}',
     day_key TEXT,
     boss_energy INTEGER NOT NULL DEFAULT 6,
     boss_energy_ts INTEGER NOT NULL DEFAULT 0,
     arena_energy INTEGER NOT NULL DEFAULT 5,
     arena_energy_ts INTEGER NOT NULL DEFAULT 0,
     gender TEXT NOT NULL DEFAULT 'm',
     speedster_until INTEGER NOT NULL DEFAULT 0,
     dungeon_energy INTEGER NOT NULL DEFAULT 6,
     dungeon_energy_ts INTEGER NOT NULL DEFAULT 0,
     castle_energy INTEGER NOT NULL DEFAULT 4,
     castle_energy_ts INTEGER NOT NULL DEFAULT 0,
     dungeon_best INTEGER NOT NULL DEFAULT 0,
     last_seen INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_battles (
     user_id INTEGER PRIMARY KEY,
     mode TEXT NOT NULL,
     state TEXT NOT NULL,
     updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_boss (
     id INTEGER PRIMARY KEY,
     boss_name TEXT NOT NULL,
     current_hp INTEGER NOT NULL,
     max_hp INTEGER NOT NULL,
     week_key TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_boss_damage (
     user_id INTEGER NOT NULL,
     week_key TEXT NOT NULL,
     total_damage INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, week_key))`,
  `CREATE TABLE IF NOT EXISTS web_castle (
     id INTEGER PRIMARY KEY,
     throne_user_id INTEGER,
     throne_name TEXT,
     wins INTEGER NOT NULL DEFAULT 0,
     is_locked INTEGER NOT NULL DEFAULT 0,
     lock_ts INTEGER NOT NULL DEFAULT 0,
     vault INTEGER NOT NULL DEFAULT 0,
     vault_ts INTEGER NOT NULL DEFAULT 0,
     debuff INTEGER NOT NULL DEFAULT 0,
     traps TEXT NOT NULL DEFAULT '{}',
     since INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS web_bounty (
     id INTEGER PRIMARY KEY,
     quest TEXT NOT NULL,
     day_key TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_chat (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     text TEXT NOT NULL,
     ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS web_pm (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     from_id INTEGER NOT NULL,
     to_id INTEGER NOT NULL,
     text TEXT NOT NULL,
     ts INTEGER NOT NULL,
     read INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_web_pm_to ON web_pm(to_id, read)`,
  `CREATE INDEX IF NOT EXISTS idx_web_pm_pair ON web_pm(from_id, to_id)`,
  `CREATE INDEX IF NOT EXISTS idx_web_players_seen ON web_players(last_seen)`,
  `CREATE INDEX IF NOT EXISTS idx_web_players_trophies ON web_players(trophies DESC)`,
];

// columns added after the first release — applied to databases that already exist
const MIGRATIONS = [
  "ALTER TABLE web_players ADD COLUMN gender TEXT NOT NULL DEFAULT 'm'",
  'ALTER TABLE web_players ADD COLUMN speedster_until INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE web_players ADD COLUMN dungeon_energy INTEGER NOT NULL DEFAULT 6',
  'ALTER TABLE web_players ADD COLUMN dungeon_energy_ts INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE web_players ADD COLUMN castle_energy INTEGER NOT NULL DEFAULT 4',
  'ALTER TABLE web_players ADD COLUMN castle_energy_ts INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE web_players ADD COLUMN dungeon_best INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE web_players ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0',
];

async function init() {
  if (!impl) await connect();
  await impl.batch(SCHEMA.map(s => [s, []]));
  for (const m of MIGRATIONS) { try { await impl.execute(m, []); } catch (e) { if (!/duplicate column|already exists/i.test(String(e.message || e))) throw e; } }
  // welcome gift: everyone who joined in the last week gets Speedster until (join date + 7 days)
  await impl.execute('UPDATE web_players SET speedster_until = created_at + 604800000 WHERE created_at > ? AND speedster_until < created_at + 604800000', [Date.now() - 604800000]);
  return impl;
}

module.exports = { init, get db() { return impl; } };
