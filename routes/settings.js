const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET all settings
router.get('/', (req, res) => {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    // Mask token for security
    if (settings.wa_token && settings.wa_token.length > 10) {
      settings.wa_token_masked = settings.wa_token.substring(0, 8) + '••••••••••••••••';
    }
    res.json(settings);
  });
});

// POST update settings
router.post('/', (req, res) => {
  const allowed = ['wa_token','wa_phone_number_id','wa_api_version','batch_size','interval_min','interval_max','batch_interval', 'birthday_auto_send', 'birthday_message', 'birthday_send_hour'];
  const updates = [];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) {
      updates.push({ key, value: req.body[key] });
    }
  });
  if (!updates.length) return res.status(400).json({ error: 'Нет данных для обновления' });

  const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  updates.forEach(({ key, value }) => stmt.run(key, value));
  stmt.finalize((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: updates.length });
  });
});

module.exports = router;
