const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');

function initUsersIPC() {
    // List Users
    ipcMain.handle('users:list', async () => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat melihat daftar pengguna.' };
            }
            
            const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY username ASC').all();
            return { success: true, data: rows };
        } catch (error) {
            console.error('Error listing users:', error);
            return { success: false, message: 'Gagal memuat daftar pengguna: ' + error.message };
        }
    });

    // Create User
    ipcMain.handle('users:create', async (event, { username, password, role }) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat membuat pengguna baru.' };
            }
            
            if (!username || !password || !role) {
                return { success: false, message: 'Username, password, dan role wajib diisi.' };
            }
            
            const cleanUsername = username.trim().toLowerCase();
            if (cleanUsername.length < 3) {
                return { success: false, message: 'Username minimal 3 karakter.' };
            }
            
            // Check if user already exists
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
            if (existing) {
                return { success: false, message: `Username "${username}" sudah digunakan.` };
            }
            
            if (!['Admin', 'Bendahara', 'Panitia'].includes(role)) {
                return { success: false, message: 'Role tidak valid.' };
            }
            
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(password, salt);
            
            const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
            const result = stmt.run(cleanUsername, hash, role);
            
            logAudit(session.id, session.username, `Membuat pengguna baru: ${cleanUsername} (${role})`);
            
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating user:', error);
            return { success: false, message: 'Gagal membuat pengguna baru: ' + error.message };
        }
    });

    // Update User (Admin modifying another user, or changing password/role)
    ipcMain.handle('users:update', async (event, { id, username, password, role }) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat mengedit pengguna.' };
            }
            
            if (!id || !username || !role) {
                return { success: false, message: 'ID, username, dan role wajib diisi.' };
            }
            
            const cleanUsername = username.trim().toLowerCase();
            
            // Check if username exists on another user
            const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, id);
            if (existing) {
                return { success: false, message: `Username "${username}" sudah digunakan oleh akun lain.` };
            }
            
            if (!['Admin', 'Bendahara', 'Panitia'].includes(role)) {
                return { success: false, message: 'Role tidak valid.' };
            }
            
            const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
            if (!user) {
                return { success: false, message: 'Pengguna tidak ditemukan.' };
            }
            
            // Prevent changing own role away from Admin to avoid locking out the system
            if (session.id === id && role !== 'Admin') {
                return { success: false, message: 'Anda tidak dapat mengubah role Admin Anda sendiri.' };
            }
            
            if (password && password.trim() !== '') {
                // Update with password change
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync(password, salt);
                
                const stmt = db.prepare('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?');
                stmt.run(cleanUsername, hash, role, id);
                logAudit(session.id, session.username, `Mengubah data pengguna ID ${id} (${cleanUsername}) dan mereset password.`);
            } else {
                // Update without password change
                const stmt = db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?');
                stmt.run(cleanUsername, role, id);
                logAudit(session.id, session.username, `Mengubah data pengguna ID ${id} (${cleanUsername}) tanpa mengubah password.`);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Error updating user:', error);
            return { success: false, message: 'Gagal mengedit pengguna: ' + error.message };
        }
    });

    // Delete User
    ipcMain.handle('users:delete', async (event, id) => {
        try {
            const session = getCurrentUserSession();
            if (!session || session.role !== 'Admin') {
                return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat menghapus pengguna.' };
            }
            
            if (!id) {
                return { success: false, message: 'ID pengguna tidak valid.' };
            }
            
            if (session.id === id) {
                return { success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri.' };
            }
            
            const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
            if (!user) {
                return { success: false, message: 'Pengguna tidak ditemukan.' };
            }
            
            const stmt = db.prepare('DELETE FROM users WHERE id = ?');
            stmt.run(id);
            
            logAudit(session.id, session.username, `Menghapus pengguna: ${user.username} (ID: ${id})`);
            
            return { success: true };
        } catch (error) {
            console.error('Error deleting user:', error);
            return { success: false, message: 'Gagal menghapus pengguna: ' + error.message };
        }
    });

    // Self change password
    ipcMain.handle('users:change-password', async (event, { oldPassword, newPassword }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            
            if (!oldPassword || !newPassword) {
                return { success: false, message: 'Password lama dan password baru wajib diisi.' };
            }
            
            if (newPassword.length < 4) {
                return { success: false, message: 'Password baru minimal 4 karakter.' };
            }
            
            const user = db.prepare('SELECT password FROM users WHERE id = ?').get(session.id);
            if (!user) {
                return { success: false, message: 'Akun Anda tidak ditemukan di sistem.' };
            }
            
            const match = bcrypt.compareSync(oldPassword, user.password);
            if (!match) {
                return { success: false, message: 'Password lama salah.' };
            }
            
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync(newPassword, salt);
            
            db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, session.id);
            
            logAudit(session.id, session.username, 'Mengubah kata sandi akun miliknya sendiri');
            
            return { success: true };
        } catch (error) {
            console.error('Error changing password:', error);
            return { success: false, message: 'Gagal mengganti password: ' + error.message };
        }
    });
}

module.exports = {
    initUsersIPC
};
