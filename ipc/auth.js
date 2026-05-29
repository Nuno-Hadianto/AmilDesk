const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const { db, logAudit } = require('../database/db');

let currentUser = null;

function initAuthIPC() {
    // Login
    ipcMain.handle('auth:login', async (event, { username, password }) => {
        try {
            if (!username || !password) {
                return { success: false, message: 'Username dan password wajib diisi.' };
            }
            
            const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username.trim().toLowerCase());
            if (!user) {
                return { success: false, message: 'Username atau password salah.' };
            }
            
            const match = bcrypt.compareSync(password, user.password);
            if (!match) {
                return { success: false, message: 'Username atau password salah.' };
            }
            
            currentUser = {
                id: user.id,
                username: user.username,
                role: user.role
            };
            
            logAudit(currentUser.id, currentUser.username, `Melakukan login dengan role ${currentUser.role}`);
            
            return { success: true, user: currentUser };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'Terjadi kesalahan sistem saat login: ' + error.message };
        }
    });

    // Logout
    ipcMain.handle('auth:logout', async () => {
        if (currentUser) {
            logAudit(currentUser.id, currentUser.username, 'Melakukan logout');
            currentUser = null;
        }
        return { success: true };
    });

    // Get Current User
    ipcMain.handle('auth:getCurrentUser', async () => {
        return currentUser;
    });
}

function getCurrentUserSession() {
    return currentUser;
}

module.exports = {
    initAuthIPC,
    getCurrentUserSession
};
