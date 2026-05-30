const { app, BrowserWindow } = require('electron');
const path = require('path');

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

let mainWindow = null;

// Initialize Database (ensuring it runs and seeds users)
const db = require('./database/db');

// Import and initialize IPC handlers
const { initAuthIPC } = require('./ipc/auth');
const { initMuzakkiIPC } = require('./ipc/muzakki');
const { initTransaksiIPC } = require('./ipc/transaksi');
const { initMustahikIPC } = require('./ipc/mustahik');
const { initDistribusiIPC } = require('./ipc/distribusi');
const { initLaporanIPC } = require('./ipc/laporan');
const { initSettingsIPC } = require('./ipc/settings');
const { initUsersIPC } = require('./ipc/users');

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'AmilDesk - Pengelolaan Zakat, Infak, dan Sedekah',
        backgroundColor: '#f8fafc', // Soft light slate gray background
        icon: path.join(__dirname, 'assets/icons/app_icon.ico'), // Will fall back gracefully if missing
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true // Security best practice
        }
    });

    // Remove standard default menu bar for custom premium feel
    mainWindow.removeMenu();

    // Load initial login page
    mainWindow.loadFile(path.join(__dirname, 'pages/login.html'));

    // Open devtools if running in development mode
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Electron lifecycle
app.whenReady().then(() => {
    // Register IPCs
    initAuthIPC();
    initMuzakkiIPC();
    initTransaksiIPC();
    initMustahikIPC();
    initDistribusiIPC();
    initLaporanIPC();
    initSettingsIPC();
    initUsersIPC();
    
    createMainWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
