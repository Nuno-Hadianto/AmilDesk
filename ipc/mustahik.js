const { ipcMain, dialog } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');
const XLSX = require('xlsx');

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

    // Import Mustahik from Excel
    ipcMain.handle('mustahik:import-excel', async () => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }

            const { filePaths } = await dialog.showOpenDialog({
                title: 'Pilih File Excel Data Mustahik',
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
            const insertStmt = db.prepare('INSERT INTO mustahik (nama, kategori, alamat) VALUES (?, ?, ?)');
            
            const runTransaction = db.transaction(() => {
                jsonData.forEach(row => {
                    let nama = '';
                    let kategori = 'Miskin';
                    let alamat = '';

                    for (const key in row) {
                        const lowerKey = key.toLowerCase().trim();
                        if (lowerKey === 'nama' || lowerKey === 'nama lengkap') {
                            nama = String(row[key]).trim();
                        } else if (lowerKey === 'alamat') {
                            alamat = String(row[key]).trim();
                        } else if (lowerKey === 'kategori' || lowerKey === 'asnaf' || lowerKey === 'golongan') {
                            const val = String(row[key]).trim();
                            if (val) {
                                const formattedVal = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
                                if (ASNAF_CATEGORIES.includes(formattedVal)) {
                                    kategori = formattedVal;
                                }
                            }
                        }
                    }

                    if (nama) {
                        insertStmt.run(nama, kategori, alamat || null);
                        importedCount++;
                    }
                });
            });

            runTransaction();

            logAudit(session.id, session.username, `Mengimpor ${importedCount} data Mustahik dari Excel: ${require('path').basename(filePath)}`);

            return { success: true, count: importedCount };
        } catch (error) {
            console.error('Error importing mustahik from excel:', error);
            return { success: false, message: 'Gagal mengimpor data Mustahik: ' + error.message };
        }
    });
}

module.exports = {
    initMustahikIPC
};
