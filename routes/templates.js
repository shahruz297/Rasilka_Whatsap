const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Барлық шаблондарды алу
router.get('/', (req, res) => {
  const adminId = req.session.user.id;
  db.all('SELECT * FROM templates WHERE admin_id = ? ORDER BY created_at DESC', [adminId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Базадан оқу қатесі: ' + err.message });
    res.json(rows);
  });
});

// Жаңа шаблон қосу
router.post('/', (req, res) => {
  const adminId = req.session.user.id;
  const { name, text } = req.body;
  if (!name || !text) {
    return res.status(400).json({ error: 'Название и текст обязательны' });
  }

  db.run(
    'INSERT INTO templates (name, text, admin_id) VALUES (?, ?, ?)',
    [name, text, adminId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Қосу қатесі: ' + err.message });
      res.json({ id: this.lastID, name, text, admin_id: adminId });
    }
  );
});

// Шаблонды жаңарту
router.put('/:id', (req, res) => {
  const adminId = req.session.user.id;
  const id = req.params.id;
  const { name, text } = req.body;
  
  if (!name || !text) {
    return res.status(400).json({ error: 'Название и текст обязательны' });
  }

  db.run(
    'UPDATE templates SET name = ?, text = ? WHERE id = ? AND admin_id = ?',
    [name, text, id, adminId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Жаңарту қатесі: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Шаблон не найден или нет прав' });
      res.json({ success: true });
    }
  );
});

// Шаблонды жою
router.delete('/:id', (req, res) => {
  const adminId = req.session.user.id;
  const id = req.params.id;

  db.run('DELETE FROM templates WHERE id = ? AND admin_id = ?', [id, adminId], function(err) {
    if (err) return res.status(500).json({ error: 'Жою қатесі: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Шаблон не найден или нет прав' });
    res.json({ success: true });
  });
});

module.exports = router;
