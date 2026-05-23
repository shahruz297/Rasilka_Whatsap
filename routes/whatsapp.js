const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { MessageMedia } = require('whatsapp-web.js');

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла. Поддерживаются: JPG, PNG, GIF, WEBP'));
    }
  }
});

// Active sending jobs: campaignId -> { cancel: bool }
const activeJobs = {};

function getSettings(adminId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM settings WHERE admin_id = ?', [adminId], (err, rows) => {
      if (err) return reject(err);
      const s = {};
      rows.forEach(r => { s[r.key] = r.value; });
      // Fallback to global defaults
      if (Object.keys(s).length === 0) {
        db.all('SELECT key, value FROM settings WHERE admin_id = 0', [], (err2, defaultRows) => {
          if (err2) return reject(err2);
          const d = {};
          (defaultRows || []).forEach(r => { d[r.key] = r.value; });
          resolve(d);
        });
        return;
      }
      resolve(s);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function personalizeMessage(template, client) {
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  let msg = template;
  msg = msg.replace(/{{полное_имя}}/gi, `${client.first_name} ${client.last_name}`);
  msg = msg.replace(/{{имя}}/gi, client.first_name);
  msg = msg.replace(/{{first_name}}/gi, client.first_name);
  msg = msg.replace(/{{фамилия}}/gi, client.last_name);
  msg = msg.replace(/{{телефон}}/gi, client.phone);
  msg = msg.replace(/{{адрес}}/gi, client.address || '');
  if (client.birth_day && client.birth_month && client.birth_year) {
    const monthName = months[(client.birth_month || 1) - 1] || '';
    msg = msg.replace(/{{день_рождения}}/gi, `${client.birth_day} ${monthName} ${client.birth_year}`);
  } else {
    msg = msg.replace(/{{день_рождения}}/gi, '');
  }
  return msg;
}


const whatsappClient = require('../whatsappClient');

async function sendWhatsAppMessage(toPhone, message, adminId, imagePath) {
  const client = whatsappClient.getClient(adminId);
  const statusData = whatsappClient.getStatus(adminId);
  if (!client || statusData.status !== 'CONNECTED') {
    throw new Error('WhatsApp клиент не подключен.');
  }
  
  let phone = toPhone.replace(/[^0-9]/g, '');
  if (phone.startsWith('8')) phone = '7' + phone.substring(1);
  const chatId = `${phone}@c.us`;

  if (imagePath && fs.existsSync(imagePath)) {
    // Send image (with or without caption)
    const media = MessageMedia.fromFilePath(imagePath);
    if (message && message.trim()) {
      await client.sendMessage(chatId, media, { caption: message });
    } else {
      await client.sendMessage(chatId, media);
    }
  } else if (message && message.trim()) {
    // Send text only
    await client.sendMessage(chatId, message);
  } else {
    throw new Error('Нет сообщения или изображения для отправки.');
  }

  return { success: true };
}

// POST /api/whatsapp/send — start campaign (supports multipart/form-data with image)
router.post('/send', upload.single('image'), async (req, res) => {
  try {
    const adminId = req.user.id;
    const message = req.body.message || '';
    const imagePath = req.file ? req.file.path : null;
    
    // Parse client_ids from FormData (comes as JSON string)
    let client_ids = req.body.client_ids;
    if (typeof client_ids === 'string') {
      try { client_ids = JSON.parse(client_ids); } catch(e) { client_ids = []; }
    }
    if (!client_ids || !client_ids.length) {
      return res.status(400).json({ error: 'Список клиентов обязателен' });
    }
    if (!message.trim() && !imagePath) {
      return res.status(400).json({ error: 'Необходимо указать текст сообщения или загрузить изображение' });
    }

    const settings = await getSettings(adminId);
    const batchSize = parseInt(req.body.batch_size) || parseInt(settings.batch_size) || 70;
    const intervalMin = parseInt(req.body.interval_min) || parseInt(settings.interval_min) || 10;
    const intervalMax = parseInt(req.body.interval_max) || parseInt(settings.interval_max) || 30;
    const batchInterval = parseInt(req.body.batch_interval) || parseInt(settings.batch_interval) || 120;

    // Fetch clients (только для этого админа)
    const placeholders = client_ids.map(() => '?').join(',');
    const scopeWhere = req.user.role === 'superadmin' ? '' : ' AND admin_id = ?';
    const scopeParams = req.user.role === 'superadmin' ? [] : [adminId];
    const clients = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM clients WHERE id IN (${placeholders})${scopeWhere}`, [...client_ids, ...scopeParams], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (!clients.length) return res.status(400).json({ error: 'Клиенттер табылмады' });

    // ===== ПРОВЕРКА ЛИМИТА ТАРИФА =====
    const today = new Date().toISOString().split('T')[0];
    const tariffInfo = await new Promise((resolve, reject) => {
      db.get(
        `SELECT a.tariff_id, t.daily_limit 
         FROM admins a LEFT JOIN tariff_plans t ON a.tariff_id = t.id 
         WHERE a.id = ?`,
        [adminId],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (tariffInfo && tariffInfo.tariff_id) {
      const todayUsage = await new Promise((resolve, reject) => {
        db.get('SELECT sent_count FROM daily_usage WHERE admin_id = ? AND date = ?',
          [adminId, today], (err, row) => { if (err) reject(err); else resolve(row?.sent_count || 0); });
      });
      const remaining = tariffInfo.daily_limit - todayUsage;
      if (clients.length > remaining) {
        return res.status(400).json({
          error: `Недостаточно лимита тарифа! Сегодня отправлено: ${todayUsage}, лимит: ${tariffInfo.daily_limit}, осталось: ${remaining}. Вы выбрали ${clients.length} клиентов.`,
          limit_exceeded: true,
          today_sent: todayUsage,
          daily_limit: tariffInfo.daily_limit,
          remaining: remaining
        });
      }
    } else if (req.user.role !== 'superadmin') {
      return res.status(400).json({ error: 'Тариф не назначен. Обратитесь к суперадмину.' });
    }

    // Create campaign record (with image_path)
    const campaignName = req.body.campaign_name || `Кампания ${new Date().toLocaleDateString('ru-RU')}`;
    const relativeImagePath = imagePath ? `/uploads/${path.basename(imagePath)}` : null;
    
    const campaignId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO campaigns (name, message, total_count, status, batch_size, interval_min, interval_max, batch_interval, admin_id, image_path, started_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [campaignName, message, clients.length, batchSize, intervalMin, intervalMax, batchInterval, adminId, relativeImagePath],
        function(err) { if (err) reject(err); else resolve(this.lastID); }
      );
    });

    // Create log entries
    const logStmt = db.prepare(`INSERT INTO campaign_logs (campaign_id, client_id, phone, client_name, status, admin_id) VALUES (?, ?, ?, ?, 'pending', ?)`);
    clients.forEach(c => {
      logStmt.run(campaignId, c.id, c.phone, `${c.first_name} ${c.last_name}`, adminId);
    });
    logStmt.finalize();

    // Mark job as active
    activeJobs[campaignId] = { cancel: false };

    // Respond immediately with campaign ID
    res.json({ success: true, campaign_id: campaignId, total: clients.length });

    // Start async sending process
    const wss = req.app.get('wss');
    const broadcast = (data) => {
      if (!wss) return;
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    };

    (async () => {
      let sentCount = 0;
      let failedCount = 0;
      const batches = [];
      for (let i = 0; i < clients.length; i += batchSize) {
        batches.push(clients.slice(i, i + batchSize));
      }

      broadcast({ type: 'campaign_start', campaign_id: campaignId, total: clients.length });

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (activeJobs[campaignId]?.cancel) break;
        const batch = batches[bIdx];

        for (let i = 0; i < batch.length; i++) {
          if (activeJobs[campaignId]?.cancel) break;
          const client = batch[i];
          const personalMsg = personalizeMessage(message, client);
          let status = 'sent';
          let errorMsg = null;

          try {
            const statusData = whatsappClient.getStatus(adminId);
            if (statusData.status !== 'CONNECTED') {
              throw new Error('WhatsApp не подключен. Сначала подключитесь на странице WhatsApp.');
            }
            await sendWhatsAppMessage(client.phone, personalMsg, adminId, imagePath);
            sentCount++;
            // Обновить использование тарифа
            const sendDate = new Date().toISOString().split('T')[0];
            db.run(`INSERT INTO daily_usage (admin_id, date, sent_count) VALUES (?, ?, 1)
                    ON CONFLICT(admin_id, date) DO UPDATE SET sent_count = sent_count + 1`,
              [adminId, sendDate]);
          } catch (err) {
            status = 'failed';
            errorMsg = err.response?.data?.error?.message || err.message;
            failedCount++;
          }

          // Update log
          db.run(
            `UPDATE campaign_logs SET status=?, error_message=?, sent_at=CURRENT_TIMESTAMP WHERE campaign_id=? AND client_id=?`,
            [status, errorMsg, campaignId, client.id]
          );
          // Update campaign counts
          db.run(
            `UPDATE campaigns SET sent_count=?, failed_count=? WHERE id=?`,
            [sentCount, failedCount, campaignId]
          );

          broadcast({
            type: 'progress',
            campaign_id: campaignId,
            client_name: `${client.first_name} ${client.last_name}`,
            phone: client.phone,
            status,
            sent: sentCount,
            failed: failedCount,
            total: clients.length,
            current: sentCount + failedCount
          });

          // Wait between messages (except last in batch)
          if (i < batch.length - 1 && !(activeJobs[campaignId]?.cancel)) {
            const delay = randomInterval(intervalMin, intervalMax);
            broadcast({ type: 'waiting', campaign_id: campaignId, seconds: Math.round(delay / 1000) });
            await sleep(delay);
          }
        }

        // Wait between batches (except last batch)
        if (bIdx < batches.length - 1 && !(activeJobs[campaignId]?.cancel)) {
          broadcast({ type: 'batch_pause', campaign_id: campaignId, batch_num: bIdx + 1, total_batches: batches.length, seconds: batchInterval });
          await sleep(batchInterval * 1000);
        }
      }

      const finalStatus = activeJobs[campaignId]?.cancel ? 'cancelled' : 'completed';
      db.run(`UPDATE campaigns SET status=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`, [finalStatus, campaignId]);
      delete activeJobs[campaignId];

      broadcast({ type: 'campaign_done', campaign_id: campaignId, status: finalStatus, sent: sentCount, failed: failedCount });
    })();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/cancel/:id
router.post('/cancel/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (activeJobs[id]) {
    activeJobs[id].cancel = true;
    res.json({ success: true, message: 'Отправка остановлена' });
  } else {
    res.status(404).json({ error: 'Активные рассылки не найдены' });
  }
});

// GET active jobs
router.get('/active', (req, res) => {
  res.json(Object.keys(activeJobs).map(id => ({ campaign_id: parseInt(id) })));
});

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
  const adminId = req.user.id;
  res.json(whatsappClient.getStatus(adminId));
});

// POST /api/whatsapp/connect — start connecting (show QR)
router.post('/connect', async (req, res) => {
  try {
    const adminId = req.user.id;
    const current = whatsappClient.getStatus(adminId);
    if (current.status === 'CONNECTED') {
      return res.json({ success: true, message: 'Подключено' });
    }
    whatsappClient.initialize(adminId);
    res.json({ success: true, message: 'Подключение начато, ожидайте QR-код' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    const adminId = req.user.id;
    await whatsappClient.logout(adminId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
