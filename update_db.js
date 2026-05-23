const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'rasilka.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`UPDATE tariff_plans SET name = 'Стартовый', description = 'Возможность отправки 500 сообщений в день' WHERE name = 'Бастапқы'`);
  db.run(`UPDATE tariff_plans SET name = 'Стандарт', description = 'Возможность отправки 1000 сообщений в день' WHERE name = 'Стандарт'`);
  db.run(`UPDATE tariff_plans SET name = 'Премиум', description = 'Возможность отправки 2000 сообщений в день' WHERE name = 'Премиум'`);
  db.run(`UPDATE tariff_plans SET name = 'Безлимитный', description = 'Безлимитная рассылка (суперадмин)' WHERE name = 'Шексіз'`);
  console.log('Database updated to Russian');
});
