const { ipcMain } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

// Helper to calculate available balances
function getAvailableBalances(ignoreDistId = null) {
    const income = db.prepare('SELECT SUM(jumlah_uang) as total_uang, SUM(jumlah_beras) as total_beras FROM transaksi').get();
    
    let distQuery = 'SELECT SUM(jumlah_uang) as total_uang, SUM(jumlah_beras) as total_beras FROM distribusi';
    let params = [];
    if (ignoreDistId) {
        distQuery += ' WHERE id != ?';
        params.push(ignoreDistId);
    }
    const expense = db.prepare(distQuery).get(...params);
    
    const totalUangMasuk = income.total_uang || 0;
    const totalBerasMasuk = income.total_beras || 0;
    
    const totalUangKeluar = expense.total_uang || 0;
    const totalBerasKeluar = expense.total_beras || 0;
    
    return {
        uang: totalUangMasuk - totalUangKeluar,
        beras: totalBerasMasuk - totalBerasKeluar
    };
}

function initDistribusiIPC() {
    // List available balances for fast check or display in frontend
    ipcMain.handle('distribusi:balances', async () => {
        try {
            return { success: true, balances: getAvailableBalances() };
        } catch (error) {
            console.error('Error fetching balances:', error);
            return { success: false, message: error.message };
        }
    });

    // List Distribusi with pagination and search
    ipcMain.handle('distribusi:list', async (event, { page = 1, limit = 10, search = '', jenis = '' }) => {
        try {
            const offset = (page - 1) * limit;
            const searchPattern = `%${search.trim()}%`;
            
            let query = `
                SELECT d.*, m.nama as mustahik_nama, u.username as user_nama 
                FROM distribusi d
                LEFT JOIN mustahik m ON d.mustahik_id = m.id
                LEFT JOIN users u ON d.created_by = u.id
                WHERE (m.nama LIKE ? OR d.keterangan LIKE ?)
            `;
            const params = [searchPattern, searchPattern];
            
            if (jenis) {
                query += ` AND d.jenis_zakat = ?`;
                params.push(jenis);
            }
            
            query += ` ORDER BY d.tanggal DESC, d.id DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const rows = db.prepare(query).all(...params);
            
            // Count query
            let countQuery = `
                SELECT COUNT(*) as count 
                FROM distribusi d
                LEFT JOIN mustahik m ON d.mustahik_id = m.id
                WHERE (m.nama LIKE ? OR d.keterangan LIKE ?)
            `;
            const countParams = [searchPattern, searchPattern];
            
            if (jenis) {
                countQuery += ` AND d.jenis_zakat = ?`;
                countParams.push(jenis);
            }
            
            const countRow = db.prepare(countQuery).get(...countParams);
            const total = countRow.count;
            const totalPages = Math.ceil(total / limit);
            
            return { success: true, data: rows, total, page, limit, totalPages };
        } catch (error) {
            console.error('Error fetching distributions:', error);
            return { success: false, message: 'Gagal mengambil data distribusi: ' + error.message };
        }
    });

    // Create Distribusi
    ipcMain.handle('distribusi:create', async (event, { tanggal, mustahik_id, jenis_zakat, jumlah_uang = 0, jumlah_beras = 0, keterangan = '' }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!tanggal) {
                return { success: false, message: 'Tanggal distribusi wajib diisi.' };
            }
            if (!mustahik_id) {
                return { success: false, message: 'Mustahik wajib dipilih.' };
            }
            if (!jenis_zakat) {
                return { success: false, message: 'Jenis zakat wajib dipilih.' };
            }
            if (jumlah_uang < 0 || jumlah_beras < 0) {
                return { success: false, message: 'Jumlah uang atau beras tidak boleh negatif.' };
            }
            if (jumlah_uang === 0 && jumlah_beras === 0) {
                return { success: false, message: 'Jumlah uang atau beras wajib diisi salah satu.' };
            }
            
            const mustahik = db.prepare('SELECT nama, kategori FROM mustahik WHERE id = ?').get(mustahik_id);
            if (!mustahik) {
                return { success: false, message: 'Mustahik tidak valid.' };
            }
            
            // Start transaction to enforce balances
            let result;
            const runTransaction = db.transaction(() => {
                const balances = getAvailableBalances();
                
                if (jumlah_uang > balances.uang) {
                    throw new Error(`Saldo uang tidak mencukupi. Tersedia: Rp${balances.uang.toLocaleString('id-ID')}, Diminta: Rp${jumlah_uang.toLocaleString('id-ID')}`);
                }
                if (jumlah_beras > balances.beras) {
                    throw new Error(`Stok beras tidak mencukupi. Tersedia: ${balances.beras} kg, Diminta: ${jumlah_beras} kg`);
                }
                
                const stmt = db.prepare(`
                    INSERT INTO distribusi (tanggal, mustahik_id, jenis_zakat, jumlah_uang, jumlah_beras, keterangan, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                result = stmt.run(tanggal, mustahik_id, jenis_zakat, jumlah_uang, jumlah_beras, keterangan, session.id);
            });
            
            runTransaction();
            
            logAudit(session.id, session.username, `Mendistribusikan zakat (${jenis_zakat}) ke Mustahik ${mustahik.nama} (${mustahik.kategori}): Rp${jumlah_uang.toLocaleString('id-ID')} / ${jumlah_beras} kg beras (ID: ${result.lastInsertRowid})`);
            
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating distribution:', error);
            return { success: false, message: 'Gagal mencatat distribusi: ' + error.message };
        }
    });

    // Update Distribusi
    ipcMain.handle('distribusi:update', async (event, { id, tanggal, mustahik_id, jenis_zakat, jumlah_uang = 0, jumlah_beras = 0, keterangan = '' }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID distribusi tidak ditemukan.' };
            }
            if (!tanggal || !mustahik_id || !jenis_zakat) {
                return { success: false, message: 'Tanggal, mustahik, dan jenis zakat wajib diisi.' };
            }
            if (jumlah_uang < 0 || jumlah_beras < 0) {
                return { success: false, message: 'Jumlah uang atau beras tidak boleh negatif.' };
            }
            if (jumlah_uang === 0 && jumlah_beras === 0) {
                return { success: false, message: 'Jumlah uang atau beras wajib diisi salah satu.' };
            }
            
            const original = db.prepare('SELECT d.jenis_zakat, m.nama FROM distribusi d LEFT JOIN mustahik m ON d.mustahik_id = m.id WHERE d.id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data distribusi tidak ditemukan.' };
            }
            
            const mustahik = db.prepare('SELECT nama FROM mustahik WHERE id = ?').get(mustahik_id);
            if (!mustahik) {
                return { success: false, message: 'Mustahik tidak valid.' };
            }
            
            // Transaction
            const runTransaction = db.transaction(() => {
                // Pass the current distribution id to ignore it when checking available balance
                const balances = getAvailableBalances(id);
                
                if (jumlah_uang > balances.uang) {
                    throw new Error(`Saldo uang tidak mencukupi. Tersedia: Rp${balances.uang.toLocaleString('id-ID')}, Diminta: Rp${jumlah_uang.toLocaleString('id-ID')}`);
                }
                if (jumlah_beras > balances.beras) {
                    throw new Error(`Stok beras tidak mencukupi. Tersedia: ${balances.beras} kg, Diminta: ${jumlah_beras} kg`);
                }
                
                const stmt = db.prepare(`
                    UPDATE distribusi 
                    SET tanggal = ?, mustahik_id = ?, jenis_zakat = ?, jumlah_uang = ?, jumlah_beras = ?, keterangan = ?
                    WHERE id = ?
                `);
                stmt.run(tanggal, mustahik_id, jenis_zakat, jumlah_uang, jumlah_beras, keterangan, id);
            });
            
            runTransaction();
            
            logAudit(session.id, session.username, `Mengubah distribusi ID ${id}: ${original.nama} -> ${mustahik.nama} (${jenis_zakat}): Rp${jumlah_uang.toLocaleString('id-ID')} / ${jumlah_beras} kg beras`);
            
            return { success: true };
        } catch (error) {
            console.error('Error updating distribution:', error);
            return { success: false, message: 'Gagal mengubah distribusi: ' + error.message };
        }
    });

    // Delete Distribusi
    ipcMain.handle('distribusi:delete', async (event, id) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID distribusi tidak ditemukan.' };
            }
            
            const original = db.prepare('SELECT d.jenis_zakat, d.jumlah_uang, d.jumlah_beras, m.nama FROM distribusi d LEFT JOIN mustahik m ON d.mustahik_id = m.id WHERE d.id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data distribusi tidak ditemukan.' };
            }
            
            const stmt = db.prepare('DELETE FROM distribusi WHERE id = ?');
            stmt.run(id);
            
            logAudit(session.id, session.username, `Menghapus distribusi ID ${id} (${original.jenis_zakat}) Mustahik ${original.nama}: Rp${original.jumlah_uang.toLocaleString('id-ID')} / ${original.jumlah_beras} kg beras`);
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting distribution:', error);
            return { success: false, message: 'Gagal menghapus distribusi: ' + error.message };
        }
    });
}

module.exports = {
    initDistribusiIPC,
    getAvailableBalances
};
