const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET all campaigns
router.get('/', (req, res) => {
  db.all('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET campaign detail with logs
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM campaigns WHERE id = ?', [req.params.id], (err, campaign) => {
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
  db.run('DELETE FROM campaign_logs WHERE campaign_id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// GET dashboard stats
router.get('/stats/dashboard', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM clients', [], (err, clientRow) => {
    db.get('SELECT COUNT(*) as total FROM campaigns', [], (err, campRow) => {
      db.get(`SELECT SUM(sent_count) as sent FROM campaigns WHERE DATE(created_at) = DATE('now')`, [], (err, todayRow) => {
        db.all('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 5', [], (err, recent) => {
          db.all(`SELECT DATE(created_at) as date, SUM(sent_count) as sent, SUM(failed_count) as failed 
                  FROM campaigns WHERE created_at >= DATE('now', '-7 days') 
                  GROUP BY DATE(created_at) ORDER BY date ASC`, [], (err, chart) => {
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
