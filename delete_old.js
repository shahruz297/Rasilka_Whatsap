const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'database', 'rasilka.db'));

db.run("DELETE FROM clients WHERE id NOT IN (SELECT id FROM clients ORDER BY id DESC LIMIT 20)", function(err) {
    if (err) console.error(err);
    else console.log(`Deleted ${this.changes} rows. Total remaining: 20`);
    db.close();
});
