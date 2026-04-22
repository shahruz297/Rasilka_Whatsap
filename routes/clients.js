const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET all clients
router.get('/', (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM clients';
  let countQuery = 'SELECT COUNT(*) as total FROM clients';
  const params = [];

  if (search) {
    const s = `%${search}%`;
    query += ' WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR address LIKE ?';
    countQuery += ' WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR address LIKE ?';
    params.push(s, s, s, s);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  db.get(countQuery, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(query, [...params, parseInt(limit), parseInt(offset)], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ clients: rows, total: countRow.total, page: parseInt(page), limit: parseInt(limit) });
    });
  });
});

// GET single client
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Клиент не найден' });
    res.json(row);
  });
});

// POST create client
router.post('/', (req, res) => {
  const { first_name, last_name, phone, address, birth_year, birth_month, birth_day, tags, notes } = req.body;
  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Имя, фамилия и телефон обязательны' });
  }
  db.run(
    `INSERT INTO clients (first_name, last_name, phone, address, birth_year, birth_month, birth_day, tags, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [first_name, last_name, phone, address || '', birth_year || null, birth_month || null, birth_day || null, tags || '', notes || ''],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Этот номер телефона уже существует' });
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM clients WHERE id = ?', [this.lastID], (err, row) => {
        res.status(201).json(row);
      });
    }
  );
});

// PUT update client
router.put('/:id', (req, res) => {
  const { first_name, last_name, phone, address, birth_year, birth_month, birth_day, tags, notes } = req.body;
  db.run(
    `UPDATE clients SET first_name=?, last_name=?, phone=?, address=?, birth_year=?, birth_month=?, birth_day=?, tags=?, notes=?
     WHERE id=?`,
    [first_name, last_name, phone, address || '', birth_year || null, birth_month || null, birth_day || null, tags || '', notes || '', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Клиент не найден' });
      db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => res.json(row));
    }
  );
});

// DELETE client
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ success: true });
  });
});

// DELETE bulk
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'Список ID пуст' });
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM clients WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

module.exports = router;
