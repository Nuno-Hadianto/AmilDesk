const { ipcMain } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

function initMuzakkiIPC() {
    // List Muzakki (with pagination and search)
    ipcMain.handle('muzakki:list', async (event, { page = 1, limit = 10, search = '' }) => {
        try {
            const offset = (page - 1) * limit;
            const searchPattern = `%${search.trim()}%`;
            
            // Get records
            const rows = db.prepare(`
                SELECT * FROM muzakki 
                WHERE nama LIKE ? OR alamat LIKE ? OR no_hp LIKE ? 
                ORDER BY nama ASC
                LIMIT ? OFFSET ?
            `).all(searchPattern, searchPattern, searchPattern, limit, offset);
            
            // Get total count
            const countRow = db.prepare(`
                SELECT COUNT(*) as count FROM muzakki 
                WHERE nama LIKE ? OR alamat LIKE ? OR no_hp LIKE ?
            `).get(searchPattern, searchPattern, searchPattern);
            
            const total = countRow.count;
            const totalPages = Math.ceil(total / limit);
            
            return { success: true, data: rows, total, page, limit, totalPages };
        } catch (error) {
            console.error('Error fetching muzakki:', error);
            return { success: false, message: 'Gagal mengambil data muzakki: ' + error.message };
        }
    });

    // Create Muzakki
    ipcMain.handle('muzakki:create', async (event, { nama, alamat, no_hp }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!nama || !nama.trim()) {
                return { success: false, message: 'Nama muzakki wajib diisi.' };
            }
            
            const stmt = db.prepare('INSERT INTO muzakki (nama, alamat, no_hp) VALUES (?, ?, ?)');
            const result = stmt.run(nama.trim(), alamat ? alamat.trim() : null, no_hp ? no_hp.trim() : null);
            
            logAudit(session.id, session.username, `Menambah muzakki baru: ${nama.trim()} (ID: ${result.lastInsertRowid})`);
            
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating muzakki:', error);
            return { success: false, message: 'Gagal menambah muzakki: ' + error.message };
        }
    });

    // Update Muzakki
    ipcMain.handle('muzakki:update', async (event, { id, nama, alamat, no_hp }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID muzakki tidak ditemukan.' };
            }
            if (!nama || !nama.trim()) {
                return { success: false, message: 'Nama muzakki wajib diisi.' };
            }
            
            // Get original data for logging or check
            const original = db.prepare('SELECT nama FROM muzakki WHERE id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data muzakki tidak ditemukan.' };
            }
            
            const stmt = db.prepare('UPDATE muzakki SET nama = ?, alamat = ?, no_hp = ? WHERE id = ?');
            stmt.run(nama.trim(), alamat ? alamat.trim() : null, no_hp ? no_hp.trim() : null, id);
            
            logAudit(session.id, session.username, `Mengubah data muzakki ID ${id}: ${original.nama} -> ${nama.trim()}`);
            
            return { success: true };
        } catch (error) {
            console.error('Error updating muzakki:', error);
            return { success: false, message: 'Gagal mengubah muzakki: ' + error.message };
        }
    });

    // Delete Muzakki
    ipcMain.handle('muzakki:delete', async (event, id) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID muzakki tidak ditemukan.' };
            }
            
            // Get original data
            const original = db.prepare('SELECT nama FROM muzakki WHERE id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data muzakki tidak ditemukan.' };
            }
            
            const stmt = db.prepare('DELETE FROM muzakki WHERE id = ?');
            stmt.run(id);
            
            logAudit(session.id, session.username, `Menghapus muzakki ID ${id}: ${original.nama}`);
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting muzakki:', error);
            return { success: false, message: 'Gagal menghapus muzakki: ' + error.message };
        }
    });
}

module.exports = {
    initMuzakkiIPC
};
