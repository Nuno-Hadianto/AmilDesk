const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname);
const dbPath = path.join(dbDir, 'amildesk.db');
const schemaPath = path.join(dbDir, 'schema.sql');

// Make sure backup directory exists
const backupDir = path.join(dbDir, 'backup');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

let db;

try {
    db = new Database(dbPath, { verbose: console.log });
    db.pragma('foreign_keys = ON');
    
    // Initialize Schema
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
    
    // Seed default users (Only if the users table is completely empty)
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
        console.log('No users found. Seeding default admin user...');
        const u = { username: 'admin', password: 'admin', role: 'Admin' };
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(u.password, salt);
        
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(u.username, hash, u.role);
        console.log('Default admin user set successfully.');
    } else {
        console.log(`Database already has ${userCount} users. Skipping default seeding.`);
    }
    
    // Seed default configurations (Only if configuration table is empty)
    const configCount = db.prepare('SELECT COUNT(*) as count FROM konfigurasi').get().count;
    if (configCount === 0) {
        console.log('No configurations found. Seeding defaults...');
        db.prepare("INSERT INTO konfigurasi (kunci, nilai) VALUES ('fitrah_uang', '45000')").run();
        db.prepare("INSERT INTO konfigurasi (kunci, nilai) VALUES ('fitrah_beras', '2.5')").run();
        console.log('Default configurations set successfully.');
    } else {
        console.log(`Database already has ${configCount} configurations. Skipping default seeding.`);
    }
} catch (err) {
    console.error('Error initializing database:', err);
}

// Global logger helper
function logAudit(userId, username, activity) {
    try {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        const hh = String(today.getHours()).padStart(2, '0');
        const min = String(today.getMinutes()).padStart(2, '0');
        const ss = String(today.getSeconds()).padStart(2, '0');
        const timeStr = `${hh}:${min}:${ss}`;
        
        const stmt = db.prepare('INSERT INTO audit_log (user_id, username, aktivitas, tanggal, waktu) VALUES (?, ?, ?, ?, ?)');
        stmt.run(userId, username, activity, dateStr, timeStr);
    } catch (err) {
        console.error('Failed to log audit activity:', err);
    }
}

module.exports = {
    db,
    dbPath,
    backupDir,
    logAudit
};
