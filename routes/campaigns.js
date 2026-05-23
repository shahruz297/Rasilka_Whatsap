const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Helper: admin_id scope
function getAdminWhere(user) {
  if (user.role === 'superadmin') return { where: '', params: [] };
  return { where: ' WHERE admin_id = ?', params: [user.id] };
}

function getAdminScope(user) {
  if (user.role === 'superadmin') return { where: '', params: [] };
  return { where: ' AND admin_id = ?', params: [user.id] };
}

// GET all campaigns
router.get('/', (req, res) => {
  if (req.user.role === 'superadmin') {
    const query = `
      SELECT c.*, 
             COALESCE(a.shop_name, a.username, 'Суперадмин') as admin_name, 
             COALESCE(t.name, 'Без тарифа') as tariff_name 
      FROM campaigns c 
      LEFT JOIN admins a ON c.admin_id = a.id 
      LEFT JOIN tariff_plans t ON a.tariff_id = t.id 
      ORDER BY c.created_at DESC LIMIT 50
    `;
    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  } else {
    const scope = getAdminWhere(req.user);
    db.all('SELECT * FROM campaigns' + scope.where + ' ORDER BY created_at DESC LIMIT 50', scope.params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// GET campaign detail with logs
router.get('/:id', (req, res) => {
  if (req.params.id === 'stats') return; // skip, handled below
  const scope = getAdminScope(req.user);
  db.get('SELECT * FROM campaigns WHERE id = ?' + scope.where, [req.params.id, ...scope.params], (err, campaign) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!campaign) return res.status(404).json({ error: 'Кампания не найдена' });
    db.all('SELECT * FROM campaign_logs WHERE campaign_id = ? ORDER BY id ASC', [req.params.id], (err, logs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ campaign, logs });
    });
  });
});

// DELETE campaign
router.delete('/:id', (req, res) => {
  const scope = getAdminScope(req.user);
  // Сначала проверить, принадлежит ли кампания этому админу
  db.get('SELECT id FROM campaigns WHERE id = ?' + scope.where, [req.params.id, ...scope.params], (err, camp) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!camp) return res.status(404).json({ error: 'Кампания не найдена' });
    
    db.run('DELETE FROM campaign_logs WHERE campaign_id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// GET dashboard stats
router.get('/stats/dashboard', (req, res) => {
  const scope = getAdminWhere(req.user);
  const scopeAnd = getAdminScope(req.user);
  
  db.get('SELECT COUNT(*) as total FROM clients' + scope.where, scope.params, (err, clientRow) => {
    db.get('SELECT COUNT(*) as total FROM campaigns' + scope.where, scope.params, (err, campRow) => {
      db.get(`SELECT SUM(sent_count) as sent FROM campaigns WHERE DATE(created_at) = DATE('now')` + scopeAnd.where, scopeAnd.params, (err, todayRow) => {
        db.all('SELECT * FROM campaigns' + scope.where + ' ORDER BY created_at DESC LIMIT 5', scope.params, (err, recent) => {
          const chartScope = scopeAnd.where 
            ? `WHERE created_at >= DATE('now', '-7 days')` + scopeAnd.where
            : `WHERE created_at >= DATE('now', '-7 days')`;
          const chartParams = scopeAnd.params;
          db.all(`SELECT DATE(created_at) as date, SUM(sent_count) as sent, SUM(failed_count) as failed 
                  FROM campaigns ${chartScope}
                  GROUP BY DATE(created_at) ORDER BY date ASC`, chartParams, (err, chart) => {
            res.json({
              totalClients: clientRow?.total || 0,
              totalCampaigns: campRow?.total || 0,
              todaySent: todayRow?.sent || 0,
              recentCampaigns: recent || [],
              chartData: chart || []
            });
          });
        });
      });
    });
  });
});

module.exports = router;
