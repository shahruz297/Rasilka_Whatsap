const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { requireSuperAdmin } = require('../middleware/auth');

// Все роуты только для суперадмина
router.use(requireSuperAdmin);

// GET /api/admin-panel/admins — список всех админов
router.get('/admins', (req, res) => {
  db.all(
    `SELECT a.id, a.username, a.shop_name, a.role, a.is_active, a.created_at, a.tariff_id,
       t.name as tariff_name, t.daily_limit, t.price as tariff_price,
       (SELECT COUNT(*) FROM clients WHERE admin_id = a.id) as client_count,
       (SELECT COUNT(*) FROM campaigns WHERE admin_id = a.id) as campaign_count
     FROM admins a
     LEFT JOIN tariff_plans t ON a.tariff_id = t.id
     ORDER BY a.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// POST /api/admin-panel/admins — добавить нового админа
router.post('/admins', (req, res) => {
  const { username, password, shop_name, tariff_id } = req.body;
  if (!username || !password || !shop_name) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'Логин минимум 3 символа' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });

  const hash = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO admins (username, password_hash, shop_name, role, tariff_id) VALUES (?, ?, ?, 'admin', ?)`,
    [username, hash, shop_name, tariff_id || null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Этот логин уже занят' });
        return res.status(500).json({ error: err.message });
      }
      const newId = this.lastID;

      // Создать настройки по умолчанию для нового админа
      const defaults = [
        ['batch_size', '70'],
        ['interval_min', '10'],
        ['interval_max', '30'],
        ['batch_interval', '120'],
        ['birthday_auto_send', '0'],
        ['birthday_send_hour', '10'],
        ['birthday_message', 'Уважаемый(ая) {{имя}}! От всей души поздравляем Вас с днем рождения! 🎉']
      ];
      const stmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value, admin_id) VALUES (?, ?, ?)`);
      defaults.forEach(([k, v]) => stmt.run(k, v, newId));
      stmt.finalize();

      db.get('SELECT id, username, shop_name, role, is_active, created_at FROM admins WHERE id = ?', [newId], (err, row) => {
        res.status(201).json(row);
      });
    }
  );
});

// PUT /api/admin-panel/admins/:id — редактировать админа
router.put('/admins/:id', (req, res) => {
  const { shop_name, is_active, password, tariff_id } = req.body;
  const adminId = req.params.id;

  // Запрет редактирования суперадмина
  db.get('SELECT role FROM admins WHERE id = ?', [adminId], (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(404).json({ error: 'Админ не найден' });
    if (admin.role === 'superadmin') return res.status(403).json({ error: 'Нельзя редактировать суперадмина' });

    let query = 'UPDATE admins SET';
    const params = [];
    const updates = [];

    if (shop_name !== undefined) {
      updates.push(' shop_name = ?');
      params.push(shop_name);
    }
    if (is_active !== undefined) {
      updates.push(' is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (password) {
      updates.push(' password_hash = ?');
      params.push(bcrypt.hashSync(password, 10));
    }
    if (tariff_id !== undefined) {
      updates.push(' tariff_id = ?');
      params.push(tariff_id || null);
    }

    if (!updates.length) return res.status(400).json({ error: 'Нечего изменять' });

    query += updates.join(',') + ' WHERE id = ?';
    params.push(adminId);

    db.run(query, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT id, username, shop_name, role, is_active, created_at FROM admins WHERE id = ?', [adminId], (err, row) => {
        res.json(row);
      });
    });
  });
});

// DELETE /api/admin-panel/admins/:id — удалить админа
router.delete('/admins/:id', (req, res) => {
  const adminId = req.params.id;

  db.get('SELECT role FROM admins WHERE id = ?', [adminId], (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(404).json({ error: 'Админ не найден' });
    if (admin.role === 'superadmin') return res.status(403).json({ error: 'Нельзя удалить суперадмина' });

    // Удалить все данные админа
    db.serialize(() => {
      db.run('DELETE FROM campaign_logs WHERE admin_id = ?', [adminId]);
      db.run('DELETE FROM campaigns WHERE admin_id = ?', [adminId]);
      db.run('DELETE FROM clients WHERE admin_id = ?', [adminId]);
      db.run('DELETE FROM settings WHERE admin_id = ?', [adminId]);
      db.run('DELETE FROM admins WHERE id = ?', [adminId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// GET /api/admin-panel/stats — общая статистика
router.get('/stats', (req, res) => {
  db.all(
    `SELECT a.id, a.username, a.shop_name, a.is_active,
       (SELECT COUNT(*) FROM clients WHERE admin_id = a.id) as client_count,
       (SELECT COUNT(*) FROM campaigns WHERE admin_id = a.id) as campaign_count,
       (SELECT SUM(sent_count) FROM campaigns WHERE admin_id = a.id) as total_sent
     FROM admins a WHERE a.role = 'admin' ORDER BY a.shop_name`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT COUNT(*) as total_admins FROM admins WHERE role = ?', ['admin'], (err, adminCount) => {
        db.get('SELECT COUNT(*) as total_clients FROM clients', [], (err, clientCount) => {
          db.get('SELECT COUNT(*) as total_campaigns FROM campaigns', [], (err, campCount) => {
            res.json({
              total_admins: adminCount?.total_admins || 0,
              total_clients: clientCount?.total_clients || 0,
              total_campaigns: campCount?.total_campaigns || 0,
              admins: rows || []
            });
          });
        });
      });
    }
  );
});

module.exports = router;
