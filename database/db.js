const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(path.join(dbDir, 'rasilka.db'));

db.serialize(() => {
  // Админдер кестесі
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    shop_name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    birth_year INTEGER,
    birth_month INTEGER,
    birth_day INTEGER,
    last_birthday_sent_year INTEGER,
    tags TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Добавляем колонку last_birthday_sent_year, если её нет (для существующих БД)
  db.run(`ALTER TABLE clients ADD COLUMN last_birthday_sent_year INTEGER`, (err) => {
    // Игнорируем ошибку "duplicate column name"
  });

  // admin_id бағаны қосу (бар БД үшін)
  db.run(`ALTER TABLE clients ADD COLUMN admin_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER clients:', err.message);
  });

  // phone UNIQUE шектеуін алып тастадық — әр админнің жеке клиенттері бар
  // admin_id + phone бірге unique болуы керек (admin_id қосылған соң жасалуы керек)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_admin_phone ON clients(admin_id, phone)`, (err) => {
    if (err) console.error('CREATE INDEX ERROR:', err.message);
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
    admin_id INTEGER,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`ALTER TABLE campaigns ADD COLUMN admin_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER campaigns:', err.message);
  });

  // Добавить колонку image_path для хранения пути к изображению
  db.run(`ALTER TABLE campaigns ADD COLUMN image_path TEXT`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER campaigns image_path:', err.message);
  });

  db.run(`CREATE TABLE IF NOT EXISTS campaign_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    admin_id INTEGER,
    sent_at DATETIME,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  )`);

  db.run(`ALTER TABLE campaign_logs ADD COLUMN admin_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER logs:', err.message);
  });

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL,
    value TEXT,
    admin_id INTEGER,
    PRIMARY KEY(key, admin_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    admin_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Settings-ке admin_id қосу (бар БД үшін)
  db.run(`ALTER TABLE settings ADD COLUMN admin_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER settings:', err.message);
  });

  // Default settings (admin_id=0 — глобальды)
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
  defaults.forEach(([k, v]) => {
    db.run(`INSERT OR IGNORE INTO settings (key, value, admin_id) VALUES (?, ?, 0)`, [k, v], (err) => {
      if (err) console.error("INSERT ERROR settings:", err.message);
    });
  });

  // ===== ТАРИФ ЖҮЙЕСІ =====
  // Тариф жоспарлары кестесі
  db.run(`CREATE TABLE IF NOT EXISTS tariff_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    daily_limit INTEGER NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('CREATE tariff_plans:', err.message);
  });

  // Күнделікті қолданыс кестесі
  db.run(`CREATE TABLE IF NOT EXISTS daily_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    sent_count INTEGER DEFAULT 0,
    UNIQUE(admin_id, date)
  )`, (err) => {
    if (err) console.error('CREATE daily_usage:', err.message);
  });

  // admins кестесіне tariff_id бағанын қосу
  db.run(`ALTER TABLE admins ADD COLUMN tariff_id INTEGER DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate')) console.error('ALTER admins tariff_id:', err.message);
  });

  // Default тариф жоспарлары
  db.get('SELECT COUNT(*) as cnt FROM tariff_plans', (err, row) => {
    if (!err && row && row.cnt === 0) {
      const tariffPlans = [
        ['Стартовый', 500, 50000, 'Возможность отправки 500 сообщений в день'],
        ['Стандарт', 1000, 100000, 'Возможность отправки 1000 сообщений в день'],
        ['Премиум', 2000, 200000, 'Возможность отправки 2000 сообщений в день'],
        ['Безлимитный', 999999, 0, 'Безлимитная рассылка (суперадмин)']
      ];
      tariffPlans.forEach(([name, limit, price, desc]) => {
        db.run(`INSERT INTO tariff_plans (name, daily_limit, price, description) VALUES (?, ?, ?, ?)`,
          [name, limit, price, desc]);
      });
      console.log('[DB] Default тариф жоспарлары қосылды');
    }
  });

  // Суперадмин жасау (.env-тен)
  const superUsername = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

  db.get('SELECT id FROM admins WHERE role = ?', ['superadmin'], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync(superPassword, 10);
      db.run(
        `INSERT INTO admins (username, password_hash, shop_name, role) VALUES (?, ?, ?, ?)`,
        [superUsername, hash, 'Суперадмин', 'superadmin'],
        (err) => {
          if (err) {
            if (!err.message.includes('UNIQUE')) console.error('[DB] Суперадмин жасау қатесі:', err.message);
          } else {
            console.log(`[DB] Суперадмин жасалды: ${superUsername}`);
          }
        }
      );
    }
  });

  // Resolve initPromise at the end of serialize queue
  db.run('SELECT 1', () => {
    if (db._initResolve) db._initResolve();
  });
});

db.initPromise = new Promise((resolve) => {
  db._initResolve = resolve;
});

module.exports = db;
