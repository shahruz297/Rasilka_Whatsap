const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Helper: admin_id scope шарты
function getAdminScope(user) {
  if (user.role === 'superadmin') return { where: '', params: [] };
  return { where: ' AND admin_id = ?', params: [user.id] };
}

function getAdminWhere(user) {
  if (user.role === 'superadmin') return { where: '', params: [] };
  return { where: ' WHERE admin_id = ?', params: [user.id] };
}

// GET all clients
router.get('/', (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  const scope = getAdminWhere(req.user);
  
  let query = 'SELECT * FROM clients';
  let countQuery = 'SELECT COUNT(*) as total FROM clients';
  const params = [];

  if (scope.where) {
    query += scope.where;
    countQuery += scope.where;
    params.push(...scope.params);
  }

  if (search) {
    const s = `%${search}%`;
    const searchClause = scope.where 
      ? ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR address LIKE ?)'
      : ' WHERE (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR address LIKE ?)';
    query += searchClause;
    countQuery += searchClause;
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
  const scope = getAdminScope(req.user);
  db.get('SELECT * FROM clients WHERE id = ?' + scope.where, [req.params.id, ...scope.params], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Клиент табылмады' });
    res.json(row);
  });
});

// POST create client
router.post('/', (req, res) => {
  const { first_name, last_name, phone, address, birth_year, birth_month, birth_day, tags, notes } = req.body;
  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Имя, фамилия и телефон обязательны' });
  }
  const adminId = req.user.id;
  db.run(
    `INSERT INTO clients (first_name, last_name, phone, address, birth_year, birth_month, birth_day, tags, notes, admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [first_name, last_name, phone, address || '', birth_year || null, birth_month || null, birth_day || null, tags || '', notes || '', adminId],
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
  const scope = getAdminScope(req.user);
  db.run(
    `UPDATE clients SET first_name=?, last_name=?, phone=?, address=?, birth_year=?, birth_month=?, birth_day=?, tags=?, notes=?
     WHERE id=?` + scope.where,
    [first_name, last_name, phone, address || '', birth_year || null, birth_month || null, birth_day || null, tags || '', notes || '', req.params.id, ...scope.params],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Клиент табылмады' });
      db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => res.json(row));
    }
  );
});

// DELETE client
router.delete('/:id', (req, res) => {
  const scope = getAdminScope(req.user);
  db.run('DELETE FROM clients WHERE id = ?' + scope.where, [req.params.id, ...scope.params], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Клиент табылмады' });
    res.json({ success: true });
  });
});

// DELETE bulk
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'Список ID пуст' });
  const scope = getAdminScope(req.user);
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM clients WHERE id IN (${placeholders})` + scope.where, [...ids, ...scope.params], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

module.exports = router;
