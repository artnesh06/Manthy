const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'manthy.db');
let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  
  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
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

  // Default config
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('earn_rate_per_day', '80')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('feed_cost', '100')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('game_start', '" + new Date().toISOString() + "')");
  db.run("INSERT OR IGNORE INTO game_config (key, value) VALUES ('max_survivors', '20')");

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

module.exports = { initDB, run, get, all, saveDB, getDB: () => db };
