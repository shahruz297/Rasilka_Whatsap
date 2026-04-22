const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database/rasilka.db');
db.run('UPDATE settings SET value = ? WHERE key = ?', ['Уважаемый(ая) {{first_name}}! От всей души поздравляем Вас с днем рождения! 🎉', 'birthday_message'], () => {
    db.close();
    console.log('updated');
});
