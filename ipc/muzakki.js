const { ipcMain, dialog } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');
const XLSX = require('xlsx');

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

    // Import Muzakki from Excel
    ipcMain.handle('muzakki:import-excel', async () => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }

            const { filePaths } = await dialog.showOpenDialog({
                title: 'Pilih File Excel Data Muzakki',
                properties: ['openFile'],
                filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
            });

            if (!filePaths || filePaths.length === 0) {
                return { success: false, message: 'Impor dibatalkan.' };
            }

            const filePath = filePaths[0];
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                return { success: false, message: 'File Excel kosong atau tidak valid.' };
            }

            let importedCount = 0;
            const insertStmt = db.prepare('INSERT INTO muzakki (nama, alamat, no_hp) VALUES (?, ?, ?)');
            
            const runTransaction = db.transaction(() => {
                jsonData.forEach(row => {
                    let nama = '';
                    let alamat = '';
                    let no_hp = '';

                    for (const key in row) {
                        const lowerKey = key.toLowerCase().trim();
                        if (lowerKey === 'nama' || lowerKey === 'nama lengkap') {
                            nama = String(row[key]).trim();
                        } else if (lowerKey === 'alamat') {
                            alamat = String(row[key]).trim();
                        } else if (lowerKey === 'no hp' || lowerKey === 'no_hp' || lowerKey === 'no. hp' || lowerKey === 'telepon' || lowerKey === 'no hp/telp') {
                            no_hp = String(row[key]).trim();
                        }
                    }

                    if (nama) {
                        insertStmt.run(nama, alamat || null, no_hp || null);
                        importedCount++;
                    }
                });
            });

            runTransaction();

            logAudit(session.id, session.username, `Mengimpor ${importedCount} data Muzakki dari Excel: ${require('path').basename(filePath)}`);

            return { success: true, count: importedCount };
        } catch (error) {
            console.error('Error importing muzakki from excel:', error);
            return { success: false, message: 'Gagal mengimpor data Muzakki: ' + error.message };
        }
    });
}

module.exports = {
    initMuzakkiIPC
};
