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
    
    // Seed default users if empty
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count === 0) {
        console.log('Seeding default users...');
        const usersToSeed = [
            { username: 'admin', password: 'admin123', role: 'Admin' },
            { username: 'bendahara', password: 'bendahara123', role: 'Bendahara' },
            { username: 'panitia', password: 'panitia123', role: 'Panitia' }
        ];
        
        const insertUser = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        
        db.transaction(() => {
            for (const u of usersToSeed) {
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(u.password, salt);
                insertUser.run(u.username, hash, u.role);
            }
        })();
        console.log('Default users seeded successfully.');
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
