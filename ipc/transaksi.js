const { ipcMain, shell } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

function initTransaksiIPC() {
    // List Transaksi with pagination and search
    ipcMain.handle('transaksi:list', async (event, { page = 1, limit = 10, search = '', jenis = '' }) => {
        try {
            const offset = (page - 1) * limit;
            const searchPattern = `%${search.trim()}%`;
            
            let query = `
                SELECT t.*, m.nama as muzakki_nama, m.no_hp as muzakki_nohp, u.username as user_nama 
                FROM transaksi t
                LEFT JOIN muzakki m ON t.muzakki_id = m.id
                LEFT JOIN users u ON t.created_by = u.id
                WHERE (m.nama LIKE ? OR t.keterangan LIKE ?)
            `;
            const params = [searchPattern, searchPattern];
            
            if (jenis) {
                query += ` AND t.jenis_zakat = ?`;
                params.push(jenis);
            }
            
            query += ` ORDER BY t.tanggal DESC, t.id DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const rows = db.prepare(query).all(...params);
            
            // Count query
            let countQuery = `
                SELECT COUNT(*) as count 
                FROM transaksi t
                LEFT JOIN muzakki m ON t.muzakki_id = m.id
                WHERE (m.nama LIKE ? OR t.keterangan LIKE ?)
            `;
            const countParams = [searchPattern, searchPattern];
            
            if (jenis) {
                countQuery += ` AND t.jenis_zakat = ?`;
                countParams.push(jenis);
            }
            
            const countRow = db.prepare(countQuery).get(...countParams);
            const total = countRow.count;
            const totalPages = Math.ceil(total / limit);
            
            return { success: true, data: rows, total, page, limit, totalPages };
        } catch (error) {
            console.error('Error fetching transactions:', error);
            return { success: false, message: 'Gagal mengambil data transaksi: ' + error.message };
        }
    });

    // Create Transaksi
    ipcMain.handle('transaksi:create', async (event, { tanggal, muzakki_id, jenis_zakat, jumlah_jiwa = 0, jumlah_uang = 0, jumlah_beras = 0, keterangan = '' }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!tanggal) {
                return { success: false, message: 'Tanggal transaksi wajib diisi.' };
            }
            if (!jenis_zakat) {
                return { success: false, message: 'Jenis zakat wajib dipilih.' };
            }
            
            let db_muzakki_id = null;
            let muzakkiNama = 'Umum/Anonim';
            
            if (muzakki_id && muzakki_id !== 0) {
                const muzakki = db.prepare('SELECT nama FROM muzakki WHERE id = ?').get(muzakki_id);
                if (!muzakki) {
                    return { success: false, message: 'Muzakki tidak valid.' };
                }
                db_muzakki_id = muzakki_id;
                muzakkiNama = muzakki.nama;
            }
            
            const stmt = db.prepare(`
                INSERT INTO transaksi (tanggal, muzakki_id, jenis_zakat, jumlah_jiwa, jumlah_uang, jumlah_beras, keterangan, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(tanggal, db_muzakki_id, jenis_zakat, jumlah_jiwa, jumlah_uang, jumlah_beras, keterangan, session.id);
            
            logAudit(session.id, session.username, `Mencatat transaksi masuk (${jenis_zakat}) dari Muzakki ${muzakkiNama}: Rp${jumlah_uang.toLocaleString('id-ID')} / ${jumlah_beras} kg beras (ID: ${result.lastInsertRowid})`);
            
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating transaction:', error);
            return { success: false, message: 'Gagal mencatat transaksi: ' + error.message };
        }
    });

    // Update Transaksi
    ipcMain.handle('transaksi:update', async (event, { id, tanggal, muzakki_id, jenis_zakat, jumlah_jiwa = 0, jumlah_uang = 0, jumlah_beras = 0, keterangan = '' }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID transaksi tidak ditemukan.' };
            }
            if (!tanggal || !jenis_zakat) {
                return { success: false, message: 'Tanggal dan jenis zakat wajib diisi.' };
            }
            
            const original = db.prepare('SELECT t.jenis_zakat, m.nama FROM transaksi t LEFT JOIN muzakki m ON t.muzakki_id = m.id WHERE t.id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data transaksi tidak ditemukan.' };
            }
            
            let db_muzakki_id = null;
            let muzakkiNama = 'Umum/Anonim';
            
            if (muzakki_id && muzakki_id !== 0) {
                const muzakki = db.prepare('SELECT nama FROM muzakki WHERE id = ?').get(muzakki_id);
                if (!muzakki) {
                    return { success: false, message: 'Muzakki tidak valid.' };
                }
                db_muzakki_id = muzakki_id;
                muzakkiNama = muzakki.nama;
            }
            
            const stmt = db.prepare(`
                UPDATE transaksi 
                SET tanggal = ?, muzakki_id = ?, jenis_zakat = ?, jumlah_jiwa = ?, jumlah_uang = ?, jumlah_beras = ?, keterangan = ?
                WHERE id = ?
            `);
            stmt.run(tanggal, db_muzakki_id, jenis_zakat, jumlah_jiwa, jumlah_uang, jumlah_beras, keterangan, id);
            
            logAudit(session.id, session.username, `Mengubah transaksi ID ${id} (${original.jenis_zakat}) Muzakki ${original.nama || 'Umum/Anonim'} -> (${jenis_zakat}) Muzakki ${muzakkiNama}: Rp${jumlah_uang.toLocaleString('id-ID')} / ${jumlah_beras} kg beras`);
            
            return { success: true };
        } catch (error) {
            console.error('Error updating transaction:', error);
            return { success: false, message: 'Gagal mengubah transaksi: ' + error.message };
        }
    });

    // Delete Transaksi
    ipcMain.handle('transaksi:delete', async (event, id) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            if (!id) {
                return { success: false, message: 'ID transaksi tidak ditemukan.' };
            }
            
            const original = db.prepare('SELECT t.jenis_zakat, t.jumlah_uang, t.jumlah_beras, m.nama FROM transaksi t LEFT JOIN muzakki m ON t.muzakki_id = m.id WHERE t.id = ?').get(id);
            if (!original) {
                return { success: false, message: 'Data transaksi tidak ditemukan.' };
            }
            
            const stmt = db.prepare('DELETE FROM transaksi WHERE id = ?');
            stmt.run(id);
            
            logAudit(session.id, session.username, `Menghapus transaksi ID ${id} (${original.jenis_zakat}) Muzakki ${original.nama}: Rp${original.jumlah_uang.toLocaleString('id-ID')} / ${original.jumlah_beras} kg beras`);
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting transaction:', error);
            return { success: false, message: 'Gagal menghapus transaksi: ' + error.message };
        }
    });

    // Send WhatsApp (open link)
    ipcMain.handle('whatsapp:send', async (event, { phone, text }) => {
        try {
            let cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = '62' + cleanPhone.substring(1);
            }
            const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening WhatsApp link:', error);
            return { success: false, message: 'Gagal membuka WhatsApp: ' + error.message };
        }
    });
}

module.exports = {
    initTransaksiIPC
};
