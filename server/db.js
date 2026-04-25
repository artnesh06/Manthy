const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'manthy.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  
  // Create backup dir
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  
  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      mthy_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS staked_nfts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      token_id TEXT NOT NULL,
      collection_addr TEXT NOT NULL,
      name TEXT,
      image_url TEXT,
      hp INTEGER DEFAULT 100,
      staked_at TEXT DEFAULT (datetime('now')),
      last_fed TEXT DEFAULT (datetime('now')),
      last_earned TEXT DEFAULT (datetime('now')),
      UNIQUE(token_id, collection_addr)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS museum (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      collection_addr TEXT NOT NULL,
      name TEXT,
      image_url TEXT,
      original_owner TEXT,
      caught_by TEXT,
      reason TEXT,
      caught_at TEXT DEFAULT (datetime('now')),
      earn_rate REAL DEFAULT 16
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS feed_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      token_id TEXT NOT NULL,
      cost REAL DEFAULT 100,
      fed_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS game_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_nft_cache (
      wallet TEXT PRIMARY KEY,
      nfts TEXT,
      cached_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Winners table — stores the final 20 surviving NFTs
  db.run(`
    CREATE TABLE IF NOT EXISTS winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      collection_addr TEXT NOT NULL,
      wallet TEXT NOT NULL,
      name TEXT,
      image_url TEXT,
      hp INTEGER,
      days_survived INTEGER,
      claim_wallet TEXT,
      claim_address TEXT,
      claim_discord TEXT,
      claim_twitter TEXT,
      claimed_at TEXT,
      won_at TEXT DEFAULT (datetime('now')),
      UNIQUE(token_id, collection_addr)
    )
  `);

  // Catch log — recent catches for ticker notification
  db.run(`
    CREATE TABLE IF NOT EXISTS catch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL,
      name TEXT,
      caught_by TEXT,
      original_owner TEXT,
      caught_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Default config
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('earn_rate_per_day', '80')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('feed_cost', '100')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('game_start', '" + new Date().toISOString() + "')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('max_survivors', '20')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('game_ended', '0')");

  saveDB();
  console.log('[DB] Database initialized');
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 30 seconds
setInterval(() => { if(db) saveDB(); }, 30000);

// Auto-backup every 6 hours (keep last 10 backups)
setInterval(() => {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `manthy-${timestamp}.db`);
    fs.writeFileSync(backupPath, buffer);
    
    // Keep only last 10 backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('manthy-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (let i = 10; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    }
    console.log('[DB] Backup created:', backupPath);
  } catch (e) {
    console.error('[DB] Backup failed:', e.message);
  }
}, 6 * 60 * 60 * 1000); // 6 hours

// Helper: run query and return changes
function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// Helper: get one row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper: get all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: get config value with fallback
function getConfig(key, fallback) {
  const row = get("SELECT value FROM game_config WHERE key = ?", [key]);
  return row ? Number(row.value) || fallback : fallback;
}

module.exports = { initDB, run, get, all, saveDB, getDB: () => db, getConfig };
