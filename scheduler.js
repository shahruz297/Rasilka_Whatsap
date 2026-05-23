const db = require('./database/db');

function getSettingsForAdmin(adminId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM settings WHERE admin_id = ?', [adminId], (err, rows) => {
      if (err) return reject(err);
      const s = {};
      rows.forEach(r => { s[r.key] = r.value; });
      if (Object.keys(s).length === 0) {
        // Fallback to global defaults
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

function personalizeMessage(template, client) {
  let msg = template || 'Уважаемый(ая) {{имя}}! С днем рождения!';
  msg = msg.replace(/{{полное_имя}}/gi, `${client.first_name} ${client.last_name}`);
  msg = msg.replace(/{{имя}}/gi, client.first_name);
  msg = msg.replace(/{{first_name}}/gi, client.first_name);
  msg = msg.replace(/{{фамилия}}/gi, client.last_name);
  msg = msg.replace(/{{телефон}}/gi, client.phone);
  return msg;
}

const whatsappClient = require('./whatsappClient');

async function sendWhatsAppMessage(toPhone, message, adminId) {
  const client = whatsappClient.getClient(adminId);
  if (!client || whatsappClient.getStatus(adminId).status !== 'CONNECTED') {
    throw new Error('WhatsApp не подключен');
  }
  
  let phone = toPhone.replace(/[^0-9]/g, '');
  if (phone.startsWith('8')) phone = '7' + phone.substring(1);
  const chatId = `${phone}@c.us`;

  await client.sendMessage(chatId, message);
  return { success: true };
}

// Check every hour to send birthdays — per admin
async function checkAndSendBirthdays() {
  try {
    // Барлық белсенді админдерді алу
    const admins = await new Promise((resolve, reject) => {
      db.all('SELECT id FROM admins WHERE is_active = 1', [], (err, rows) => {
        if (err) reject(err); else resolve(rows || []);
      });
    });

    for (const admin of admins) {
      try {
        const settings = await getSettingsForAdmin(admin.id);
        if (settings.birthday_auto_send !== '1') continue;

        const targetHour = parseInt(settings.birthday_send_hour) || 10;
        const now = new Date();
        if (now.getHours() !== targetHour) continue;

        // WhatsApp қосылған ба тексеру
        if (whatsappClient.getStatus(admin.id).status !== 'CONNECTED') {
          console.log(`[Scheduler] Admin ${admin.id}: WhatsApp is not connected`);
          continue;
        }

        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const currentYear = now.getFullYear();

        const clients = await new Promise((resolve, reject) => {
          db.all(
            `SELECT * FROM clients 
             WHERE admin_id = ? AND birth_month = ? AND birth_day = ? 
             AND (last_birthday_sent_year IS NULL OR last_birthday_sent_year != ?)`,
            [admin.id, currentMonth, currentDay, currentYear],
            (err, rows) => { if (err) reject(err); else resolve(rows); }
          );
        });

        if (!clients || clients.length === 0) continue;

        const template = settings.birthday_message || 'Уважаемый(ая) {{имя}}! С днем рождения!';

        for (const client of clients) {
          const msg = personalizeMessage(template, client);
          try {
            await sendWhatsAppMessage(client.phone, msg, admin.id);
            db.run(`UPDATE clients SET last_birthday_sent_year = ? WHERE id = ?`, [currentYear, client.id]);
            console.log(`[Scheduler] Admin ${admin.id}: Birthday sent to ${client.phone}`);
          } catch (e) {
            console.error(`[Scheduler] Admin ${admin.id}: Error sending birthday to ${client.phone}:`, e.message);
          }
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (adminErr) {
        console.error(`[Scheduler] Error processing admin ${admin.id}:`, adminErr);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error checking birthdays:', err);
  }
}

function startScheduler() {
  console.log('[Scheduler] Туған күн авто-рассылкасы іске қосылды (Әр сағат сайын тексереді)');
  checkAndSendBirthdays();
  setInterval(checkAndSendBirthdays, 30 * 60 * 1000);
}

module.exports = { startScheduler };
