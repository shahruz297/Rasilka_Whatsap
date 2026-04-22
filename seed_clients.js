const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database', 'rasilka.db'));

const names = [
  { first: 'Азамат', last: 'Серікұлы' },
  { first: 'Айгерім', last: 'Маратқызы' },
  { first: 'Нұрсұлтан', last: 'Болатұлы' },
  { first: 'Динара', last: 'Талғатқызы' },
  { first: 'Руслан', last: 'Мұратұлы' },
  { first: 'Жанар', last: 'Ерланқызы' },
  { first: 'Еркін', last: 'Қайратұлы' },
  { first: 'Гүлбану', last: 'Нұрланқызы' },
  { first: 'Мақсат', last: 'Асхатұлы' },
  { first: 'Әнел', last: 'Русланқызы' },
  { first: 'Тимур', last: 'Әлібекұлы' },
  { first: 'Камилла', last: 'Сәбитқызы' },
  { first: 'Олжас', last: 'Ғалымұлы' },
  { first: 'Меруерт', last: 'Дәуренқызы' },
  { first: 'Арман', last: 'Саматұлы' },
  { first: 'Арайлым', last: 'Бақытқызы' },
  { first: 'Данияр', last: 'Русланұлы' },
  { first: 'Әйгерім', last: 'Мақсатқызы' },
  { first: 'Самат', last: 'Абзалұлы' },
  { first: 'Аружан', last: 'Ержанқызы' }
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhoneNumber() {
  const prefixes = ['7701', '7702', '7705', '7707', '7708', '7775', '7778'];
  const prefix = prefixes[getRandomInt(0, prefixes.length - 1)];
  const body = String(getRandomInt(1000000, 9999999));
  return '+' + prefix + body;
}

db.serialize(() => {
  const stmt = db.prepare("INSERT INTO clients (first_name, last_name, phone, birth_month, birth_day) VALUES (?, ?, ?, ?, ?)");
  
  names.forEach(name => {
    const phone = generatePhoneNumber();
    const birthMonth = getRandomInt(1, 12);
    // Rough days to avoid dealing with complex dates for dummy data
    const birthDay = getRandomInt(1, 28); 
    
    stmt.run(name.first, name.last, phone, birthMonth, birthDay);
  });
  
  stmt.finalize(() => {
    console.log('Сәтті қосылды: 20 рандомды клиент базаға жазылды!');
    db.close();
  });
});
