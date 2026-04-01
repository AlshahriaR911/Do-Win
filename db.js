const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbFile = path.resolve(process.env.DB_FILE || './darepay.db');

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Database opening error:', err);
    process.exit(1);
  }
});

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    btc_address TEXT,
    wallet_balance_btc REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS dares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_btc REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open','accepted','completed')) DEFAULT 'open',
    accepted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (accepted_by) REFERENCES users(id)
  );`,

  `CREATE TABLE IF NOT EXISTS dare_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dare_id INTEGER NOT NULL,
    responder_id INTEGER NOT NULL,
    response_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dare_id) REFERENCES dares(id),
    FOREIGN KEY (responder_id) REFERENCES users(id)
  );`,

  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER,
    to_user_id INTEGER,
    amount_btc REAL NOT NULL,
    type TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  );`
];

schema.forEach((sql) => {
  db.run(sql, (err) => {
    if (err) {
      console.error('Schema error:', err);
    }
  });
});

module.exports = db;
