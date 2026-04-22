const fs = require('fs');
const path = require('path');

const bDict = {
  // whatsapp.js
  "Хабарлама және клиент тізімі міндетті": "Сообщение и список клиентов обязательны",
  "Клиенты табылмады": "Клиенты не найдены",
  "Жіберу тоқтатылды": "Отправка остановлена",
  "Активные отправки табылмады": "Активные отправки не найдены",
  "kk-KZ": "ru-RU", // For dates on the backend
  
  // clients.js
  "Клиент табылмады": "Клиент не найден",
  "Имя, тегі және телефон міндетті": "Имя, фамилия и телефон обязательны",
  "Бұл телефон нөмірі бар": "Этот номер телефона уже существует",
  "ID тізімі жоқ": "Список ID пуст",

  // settings.js
  "Жаңарту деректері жоқ": "Нет данных для обновления",

  // campaigns.js
  "Кампания табылмады": "Кампания не найдена"
};

const dir = path.join(__dirname, 'routes');
const files = fs.readdirSync(dir);

files.forEach(f => {
  const full = path.join(dir, f);
  if (f.endsWith('.js')) {
    let content = fs.readFileSync(full, 'utf8');
    let changed = false;
    for (const [kz, ru] of Object.entries(bDict)) {
      if (content.indexOf(kz) !== -1) {
        content = content.split(kz).join(ru);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(full, content);
      console.log("Translated " + full);
    }
  }
});
