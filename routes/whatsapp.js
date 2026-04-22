const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/db');

// Active sending jobs: campaignId -> { cancel: bool }
const activeJobs = {};

function getSettings() {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
      if (err) return reject(err);
      const s = {};
      rows.forEach(r => { s[r.key] = r.value; });
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
  // {{полное_имя}} = толық аты-жөні (Наргиза Исаханова)
  msg = msg.replace(/{{полное_имя}}/gi, `${client.first_name} ${client.last_name}`);
  // {{имя}} = бірінші аты ғана (Наргиза) — адресаттау үшін
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

async function sendWhatsAppMessage(toPhone, message) {
  const client = whatsappClient.getClient();
  if (!client || whatsappClient.getStatus().status !== 'CONNECTED') {
    throw new Error('WhatsApp клиент не подключен.');
  }
  
  // Format phone number for WhatsApp Web (e.g. 77011234567@c.us)
  let phone = toPhone.replace(/[^0-9]/g, '');
  if (phone.startsWith('8')) phone = '7' + phone.substring(1);
  const chatId = `${phone}@c.us`;

  await client.sendMessage(chatId, message);
  return { success: true };
}

// POST /api/whatsapp/send — start campaign
router.post('/send', async (req, res) => {
  try {
    const { campaign_name, message, client_ids } = req.body;
    if (!message || !client_ids || !client_ids.length) {
      return res.status(400).json({ error: 'Сообщение и список клиентов обязательны' });
    }

    const settings = await getSettings();
    const batchSize = parseInt(req.body.batch_size) || parseInt(settings.batch_size) || 70;
    const intervalMin = parseInt(req.body.interval_min) || parseInt(settings.interval_min) || 10;
    const intervalMax = parseInt(req.body.interval_max) || parseInt(settings.interval_max) || 30;
    const batchInterval = parseInt(req.body.batch_interval) || parseInt(settings.batch_interval) || 120;

    // Fetch clients
    const placeholders = client_ids.map(() => '?').join(',');
    const clients = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM clients WHERE id IN (${placeholders})`, client_ids, (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (!clients.length) return res.status(400).json({ error: 'Клиенты не найдены' });

    // Create campaign record
    const campaignId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO campaigns (name, message, total_count, status, batch_size, interval_min, interval_max, batch_interval, started_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [campaign_name || `Кампания ${new Date().toLocaleDateString('ru-RU')}`, message, clients.length, batchSize, intervalMin, intervalMax, batchInterval],
        function(err) { if (err) reject(err); else resolve(this.lastID); }
      );
    });

    // Create log entries
    const logStmt = db.prepare(`INSERT INTO campaign_logs (campaign_id, client_id, phone, client_name, status) VALUES (?, ?, ?, ?, 'pending')`);
    clients.forEach(c => {
      logStmt.run(campaignId, c.id, c.phone, `${c.first_name} ${c.last_name}`);
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
            const statusData = whatsappClient.getStatus();
            if (statusData.status !== 'CONNECTED') {
              throw new Error('WhatsApp қосылмаған. Алдымен WhatsApp бетінен қосылыңыз.');
            }
            await sendWhatsAppMessage(client.phone, personalMsg);
            sentCount++;
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
    res.status(404).json({ error: 'Активные отправки не найдены' });
  }
});

// GET active jobs
router.get('/active', (req, res) => {
  res.json(Object.keys(activeJobs).map(id => ({ campaign_id: parseInt(id) })));
});

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
  res.json(whatsappClient.getStatus());
});

// POST /api/whatsapp/connect — start connecting (show QR)
router.post('/connect', async (req, res) => {
  try {
    const current = whatsappClient.getStatus();
    if (current.status === 'CONNECTED') {
      return res.json({ success: true, message: 'Уже подключен' });
    }
    whatsappClient.initialize();
    res.json({ success: true, message: 'Подключение начато, ожидайте QR код' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await whatsappClient.logout();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

