const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireSuperAdmin } = require('../middleware/auth');

// ===== GET /api/tariffs/plans — все тарифные планы =====
router.get('/plans', (req, res) => {
  db.all('SELECT * FROM tariff_plans WHERE is_active = 1 ORDER BY daily_limit ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ===== GET /api/tariffs/my — тариф текущего админа + использование сегодня =====
router.get('/my', (req, res) => {
  const adminId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  // Получить тариф админа
  db.get(
    `SELECT a.tariff_id, t.name as tariff_name, t.daily_limit, t.price, t.description
     FROM admins a
     LEFT JOIN tariff_plans t ON a.tariff_id = t.id
     WHERE a.id = ?`,
    [adminId],
    (err, adminRow) => {
      if (err) return res.status(500).json({ error: err.message });

      // Получить использование за сегодня
      db.get(
        'SELECT sent_count FROM daily_usage WHERE admin_id = ? AND date = ?',
        [adminId, today],
        (err, usageRow) => {
          if (err) return res.status(500).json({ error: err.message });

          const todaySent = usageRow?.sent_count || 0;
          const dailyLimit = adminRow?.daily_limit || 0;
          const remaining = Math.max(0, dailyLimit - todaySent);

          res.json({
            tariff_id: adminRow?.tariff_id || null,
            tariff_name: adminRow?.tariff_name || 'Тариф не назначен',
            daily_limit: dailyLimit,
            price: adminRow?.price || 0,
            description: adminRow?.description || '',
            today_sent: todaySent,
            remaining: remaining,
            date: today
          });
        }
      );
    }
  );
});

// ===== GET /api/tariffs/usage/:adminId — использование конкретного админа (для суперадмина) =====
router.get('/usage/:adminId', requireSuperAdmin, (req, res) => {
  const adminId = req.params.adminId;
  const today = new Date().toISOString().split('T')[0];

  db.get(
    'SELECT sent_count FROM daily_usage WHERE admin_id = ? AND date = ?',
    [adminId, today],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ admin_id: adminId, date: today, sent_count: row?.sent_count || 0 });
    }
  );
});

// ===== POST /api/tariffs/plans — добавить новый тариф (только суперадмин) =====
router.post('/plans', requireSuperAdmin, (req, res) => {
  const { name, daily_limit, price, description } = req.body;
  if (!name || !daily_limit) {
    return res.status(400).json({ error: 'Название тарифа и дневной лимит обязательны' });
  }

  db.run(
    `INSERT INTO tariff_plans (name, daily_limit, price, description) VALUES (?, ?, ?, ?)`,
    [name, parseInt(daily_limit), parseInt(price) || 0, description || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM tariff_plans WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(row);
      });
    }
  );
});

// ===== PUT /api/tariffs/plans/:id — изменить тариф (только суперадмин) =====
router.put('/plans/:id', requireSuperAdmin, (req, res) => {
  const { name, daily_limit, price, description, is_active } = req.body;
  const tariffId = req.params.id;

  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (daily_limit !== undefined) { updates.push('daily_limit = ?'); params.push(parseInt(daily_limit)); }
  if (price !== undefined) { updates.push('price = ?'); params.push(parseInt(price)); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (!updates.length) return res.status(400).json({ error: 'Нет данных для изменения' });

  params.push(tariffId);
  db.run(`UPDATE tariff_plans SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM tariff_plans WHERE id = ?', [tariffId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    });
  });
});

// ===== DELETE /api/tariffs/plans/:id — удалить тариф (только суперадмин) =====
router.delete('/plans/:id', requireSuperAdmin, (req, res) => {
  const tariffId = req.params.id;

  // Сначала проверить, используют ли админы этот тариф
  db.get('SELECT COUNT(*) as count FROM admins WHERE tariff_id = ?', [tariffId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.count > 0) {
      return res.status(400).json({ error: `Этот тариф используют ${row.count} магазинов. Сначала измените их тариф.` });
    }

    db.run('DELETE FROM tariff_plans WHERE id = ?', [tariffId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// ===== PUT /api/tariffs/assign/:adminId — назначить тариф админу (только суперадмин) =====
router.put('/assign/:adminId', requireSuperAdmin, (req, res) => {
  const { tariff_id } = req.body;
  const adminId = req.params.adminId;

  // Тариф бар ма тексеру
  if (tariff_id) {
    db.get('SELECT id FROM tariff_plans WHERE id = ? AND is_active = 1', [tariff_id], (err, tariff) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!tariff) return res.status(404).json({ error: 'Тариф табылмады' });

      db.run('UPDATE admins SET tariff_id = ? WHERE id = ?', [tariff_id, adminId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, admin_id: adminId, tariff_id: tariff_id });
      });
    });
  } else {
    // Убрать тариф
    db.run('UPDATE admins SET tariff_id = NULL WHERE id = ?', [adminId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, admin_id: adminId, tariff_id: null });
    });
  }
});

module.exports = router;
