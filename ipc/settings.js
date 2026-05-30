const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { dbPath, backupDir, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

// We need a way to close/re-open db on restore.
// Since better-sqlite3 holds a file lock, we must close it first.
const dbModule = require('../database/db');

function initSettingsIPC() {
    // List backups
    ipcMain.handle('backup:list', async () => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat mengelola backup.' };
            }
            
            const files = fs.readdirSync(backupDir);
            const backups = files
                .filter(file => file.startsWith('amildesk_backup_') && file.endsWith('.db'))
                .map(file => {
                    const filePath = path.join(backupDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        filename: file,
                        path: filePath,
                        size: stats.size,
                        createdAt: stats.birthtime || stats.mtime
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt);
                
            return { success: true, backups };
        } catch (error) {
            console.error('Error listing backups:', error);
            return { success: false, message: 'Gagal mendata file backup: ' + error.message };
        }
    });

    // Create Backup
    ipcMain.handle('backup:create', async () => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat membuat backup.' };
            }
            
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const hh = String(today.getHours()).padStart(2, '0');
            const min = String(today.getMinutes()).padStart(2, '0');
            const ss = String(today.getSeconds()).padStart(2, '0');
            
            const backupFilename = `amildesk_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}.db`;
            const destPath = path.join(backupDir, backupFilename);
            
            // better-sqlite3 offers an online backup API which is safe and fast!
            // It runs in the background or synchronously without locking the database.
            dbModule.db.backup(destPath)
                .then(() => {
                    logAudit(session.id, session.username, `Membuat backup database: ${backupFilename}`);
                    console.log('Backup created successfully at', destPath);
                })
                .catch(err => {
                    console.error('Online backup failed:', err);
                });
                
            // Wait briefly to confirm write
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return { success: true, filename: backupFilename };
        } catch (error) {
            console.error('Error creating backup:', error);
            return { success: false, message: 'Gagal membuat backup database: ' + error.message };
        }
    });

    // Restore Backup
    ipcMain.handle('backup:restore', async (event, filename) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat memulihkan database.' };
            }
            
            const sourcePath = path.join(backupDir, filename);
            if (!fs.existsSync(sourcePath)) {
                return { success: false, message: 'File backup tidak ditemukan.' };
            }
            
            // To restore, we close the current DB connection, copy the file over dbPath, and re-open it.
            // 1. Close connection
            dbModule.db.close();
            
            // 2. Overwrite file
            fs.copyFileSync(sourcePath, dbPath);
            
            // 3. Re-open connection
            const Database = require('better-sqlite3');
            dbModule.db = new Database(dbPath, { verbose: console.log });
            dbModule.db.pragma('foreign_keys = ON');
            
            logAudit(session.id, session.username, `Memulihkan database dari backup: ${filename}`);
            
            return { success: true };
        } catch (error) {
            console.error('Error restoring backup:', error);
            
            // Try to recover database connection just in case
            try {
                const Database = require('better-sqlite3');
                dbModule.db = new Database(dbPath, { verbose: console.log });
                dbModule.db.pragma('foreign_keys = ON');
            } catch (recoveryErr) {
                console.error('Critical database recovery failed:', recoveryErr);
            }
            
            return { success: false, message: 'Gagal memulihkan backup database: ' + error.message };
        }
    });

    // Audit logs listing
    ipcMain.handle('audit:list', async (event, { page = 1, limit = 50, search = '' }) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat melihat log audit.' };
            }
            
            const offset = (page - 1) * limit;
            const searchPattern = `%${search.trim()}%`;
            
            const rows = dbModule.db.prepare(`
                SELECT * FROM audit_log 
                WHERE username LIKE ? OR aktivitas LIKE ?
                ORDER BY tanggal DESC, waktu DESC, id DESC
                LIMIT ? OFFSET ?
            `).all(searchPattern, searchPattern, limit, offset);
            
            const countRow = dbModule.db.prepare(`
                SELECT COUNT(*) as count FROM audit_log 
                WHERE username LIKE ? OR aktivitas LIKE ?
            `).get(searchPattern, searchPattern);
            
            const total = countRow.count;
            const totalPages = Math.ceil(total / limit);
            
            return { success: true, data: rows, total, page, limit, totalPages };
        } catch (error) {
            console.error('Error listing audit logs:', error);
            return { success: false, message: 'Gagal memuat log audit: ' + error.message };
        }
    });

    // Get configurations (tarif zakat fitrah)
    ipcMain.handle('settings:get-konfigurasi', async () => {
        try {
            const rows = dbModule.db.prepare('SELECT * FROM konfigurasi').all();
            const config = {};
            rows.forEach(r => {
                config[r.kunci] = r.nilai;
            });
            return { success: true, config };
        } catch (error) {
            console.error('Error getting configurations:', error);
            return { success: false, message: 'Gagal memuat konfigurasi: ' + error.message };
        }
    });

    // Save configurations (tarif zakat fitrah)
    ipcMain.handle('settings:save-konfigurasi', async (event, { fitrah_uang, fitrah_beras }) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat merubah konfigurasi.' };
            }
            
            dbModule.db.transaction(() => {
                dbModule.db.prepare("INSERT OR REPLACE INTO konfigurasi (kunci, nilai) VALUES ('fitrah_uang', ?)")
                    .run(String(fitrah_uang));
                dbModule.db.prepare("INSERT OR REPLACE INTO konfigurasi (kunci, nilai) VALUES ('fitrah_beras', ?)")
                    .run(String(fitrah_beras));
            })();
            
            logAudit(session.id, session.username, `Mengubah tarif Zakat Fitrah: Rp${parseFloat(fitrah_uang).toLocaleString('id-ID')} / ${fitrah_beras} kg beras per jiwa`);
            return { success: true };
        } catch (error) {
            console.error('Error saving configurations:', error);
            return { success: false, message: 'Gagal menyimpan konfigurasi: ' + error.message };
        }
    });
}

module.exports = {
    initSettingsIPC
};
