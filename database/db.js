const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(path.join(dbDir, 'rasilka.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    address TEXT,
    birth_year INTEGER,
    birth_month INTEGER,
    birth_day INTEGER,
    last_birthday_sent_year INTEGER,
    tags TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Добавляем колонку last_birthday_sent_year, если её нет (для существующих БД)
  db.run(`ALTER TABLE clients ADD COLUMN last_birthday_sent_year INTEGER`, (err) => {
    // Игнорируем ошибку "duplicate column name", это нормально если колонка уже есть
  });

  db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    total_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    batch_size INTEGER DEFAULT 70,
    interval_min INTEGER DEFAULT 10,
    interval_max INTEGER DEFAULT 30,
    batch_interval INTEGER DEFAULT 120,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS campaign_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    sent_at DATETIME,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Default settings
  const defaults = [
    ['wa_token', ''],
    ['wa_phone_number_id', ''],
    ['wa_api_version', 'v19.0'],
    ['batch_size', '70'],
    ['interval_min', '10'],
    ['interval_max', '30'],
    ['batch_interval', '120'],
    ['birthday_auto_send', '0'],
    ['birthday_send_hour', '10'],
    ['birthday_message', 'Уважаемый(ая) {{имя}}! От всей души поздравляем Вас с днем рождения! 🎉']
  ];
  const stmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  defaults.forEach(([k, v]) => stmt.run(k, v));
  stmt.finalize();
});

module.exports = db;
