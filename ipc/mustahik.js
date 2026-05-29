const { ipcMain } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

const ASNAF_CATEGORIES = ['Fakir', 'Miskin', 'Amil', 'Muallaf', 'Riqab', 'Gharim', 'Fisabilillah', 'Ibnu Sabil'];

function initMustahikIPC() {
    // List Mustahik with pagination and search
    ipcMain.handle('mustahik:list', async (event, { page = 1, limit = 10, search = '', kategori = '' }) => {
        try {
            const offset = (page - 1) * limit;
            const searchPattern = `%${search.trim()}%`;
            
            let query = `
                SELECT * FROM mustahik 
                WHERE (nama LIKE ? OR alamat LIKE ?)
            `;
            const params = [searchPattern, searchPattern];
            
            if (kategori) {
                query += ` AND kategori = ?`;
                params.push(kategori);
            }
            
            query += ` ORDER BY nama ASC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const rows = db.prepare(query).all(...params);
            
            // Count query
            let countQuery = `
                SELECT COUNT(*) as count FROM mustahik 
                WHERE (nama LIKE ? OR alamat LIKE ?)
            `;
            const countParams = [searchPattern, searchPattern];
            
            if (kategori) {
                countQuery += ` AND kategori = ?`;
                countParams.push(kategori);
            }
            
            const countRow = db.prepare(countQuery).get(...countParams);
            const total = countRow.count;
            const totalPages = Math.ceil(total / limit);
            
            return { success: true, data: rows, total, page, limit, totalPages };
        } catch (error) {
            console.error('Error fetching mustahik:', error);
            return { success: false, message: 'Gagal mengambil data mustahik: ' + error.message };
        }
    });

    // Create Mustahik
    ipcMain.handle('mustahik:create', async (event, { nama, kategori, alamat }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!nama || !nama.trim()) {
                return { success: false, message: 'Nama mustahik wajib diisi.' };
            }
            if (!kategori || !ASNAF_CATEGORIES.includes(kategori)) {
                return { success: false, message: 'Kategori asnaf tidak valid.' };
            }
            
            const stmt = db.prepare('INSERT INTO mustahik (nama, kategori, alamat) VALUES (?, ?, ?)');
            const result = stmt.run(nama.trim(), kategori, alamat ? alamat.trim() : null);
            
            logAudit(session.id, session.username, `Menambah mustahik baru: ${nama.trim()} (Kategori: ${kategori}, ID: ${result.lastInsertRowid})`);
            
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating mustahik:', error);
            return { success: false, message: 'Gagal menambah mustahik: ' + error.message };
        }
    });

    // Update Mustahik
    ipcMain.handle('mustahik:update', async (event, { id, nama, kategori, alamat }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID mustahik tidak ditemukan.' };
            }
            if (!nama || !nama.trim()) {
                return { success: false, message: 'Nama mustahik wajib diisi.' };
            }
            if (!kategori || !ASNAF_CATEGORIES.includes(kategori)) {
                return { success: false, message: 'Kategori asnaf tidak valid.' };
            }
            
            const original = db.prepare('SELECT nama, kategori FROM mustahik WHERE id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data mustahik tidak ditemukan.' };
            }
            
            const stmt = db.prepare('UPDATE mustahik SET nama = ?, kategori = ?, alamat = ? WHERE id = ?');
            stmt.run(nama.trim(), kategori, alamat ? alamat.trim() : null, id);
            
            logAudit(session.id, session.username, `Mengubah mustahik ID ${id}: ${original.nama} (${original.kategori}) -> ${nama.trim()} (${kategori})`);
            
            return { success: true };
        } catch (error) {
            console.error('Error updating mustahik:', error);
            return { success: false, message: 'Gagal mengubah mustahik: ' + error.message };
        }
    });

    // Delete Mustahik
    ipcMain.handle('mustahik:delete', async (event, id) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID mustahik tidak ditemukan.' };
            }
            
            const original = db.prepare('SELECT nama, kategori FROM mustahik WHERE id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data mustahik tidak ditemukan.' };
            }
            
            const stmt = db.prepare('DELETE FROM mustahik WHERE id = ?');
            stmt.run(id);
            
            logAudit(session.id, session.username, `Menghapus mustahik ID ${id}: ${original.nama} (${original.kategori})`);
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting mustahik:', error);
            return { success: false, message: 'Gagal menghapus mustahik: ' + error.message };
        }
    });
}

module.exports = {
    initMustahikIPC
};
