const db = require('./database/db');
const axios = require('axios');

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

async function sendWhatsAppMessage(toPhone, message) {
  const client = whatsappClient.getClient();
  if (!client || whatsappClient.getStatus().status !== 'CONNECTED') {
    throw new Error('WhatsApp не подключен');
  }
  
  let phone = toPhone.replace(/[^0-9]/g, '');
  if (phone.startsWith('8')) phone = '7' + phone.substring(1);
  const chatId = `${phone}@c.us`;

  await client.sendMessage(chatId, message);
  return { success: true };
}

// Check every hour to send birthdays
async function checkAndSendBirthdays() {
  try {
    const settings = await getSettings();
    if (settings.birthday_auto_send !== '1') return;

    const targetHour = parseInt(settings.birthday_send_hour) || 10;
    const now = new Date();
    if (now.getHours() !== targetHour) return;

    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();

    const clients = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM clients 
         WHERE birth_month = ? AND birth_day = ? 
         AND (last_birthday_sent_year IS NULL OR last_birthday_sent_year != ?)`,
        [currentMonth, currentDay, currentYear],
        (err, rows) => { if (err) reject(err); else resolve(rows); }
      );
    });

    if (!clients || clients.length === 0) return;

    // We can only send if WhatsApp is connected
    if (whatsappClient.getStatus().status !== 'CONNECTED') {
        console.log('[Scheduler] WhatsApp is not connected via QR');
        return;
    }

    const template = settings.birthday_message || 'Уважаемый(ая) {{имя}}! С днем рождения!';

    // Process sending
    for (const client of clients) {
      const msg = personalizeMessage(template, client);
      try {
        await sendWhatsAppMessage(client.phone, msg);
        
        // Update DB so we don't send again this year
        db.run(
          `UPDATE clients SET last_birthday_sent_year = ? WHERE id = ?`,
          [currentYear, client.id]
        );
        console.log(`[Scheduler] Birthday sent to ${client.phone}`);
      } catch (e) {
        console.error(`[Scheduler] Error sending birthday to ${client.phone}:`, e.message);
      }
      
      // Simple small pause between auto-sends
      await new Promise(r => setTimeout(r, 5000));
    }

  } catch (err) {
    console.error('[Scheduler] Error checking birthdays:', err);
  }
}

function startScheduler() {
  console.log('[Scheduler] Туған күн авто-рассылкасы іске қосылды (Әр сағат сайын тексереді)');
  // Check immediately
  checkAndSendBirthdays();
  // Check every 30 minutes
  setInterval(checkAndSendBirthdays, 30 * 60 * 1000);
}

module.exports = { startScheduler };
