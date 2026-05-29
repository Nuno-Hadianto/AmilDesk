const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Auth
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
    
    // Muzakki
    listMuzakki: (params) => ipcRenderer.invoke('muzakki:list', params),
    createMuzakki: (data) => ipcRenderer.invoke('muzakki:create', data),
    updateMuzakki: (data) => ipcRenderer.invoke('muzakki:update', data),
    deleteMuzakki: (id) => ipcRenderer.invoke('muzakki:delete', id),
    
    // Transaksi
    listTransaksi: (params) => ipcRenderer.invoke('transaksi:list', params),
    createTransaksi: (data) => ipcRenderer.invoke('transaksi:create', data),
    updateTransaksi: (data) => ipcRenderer.invoke('transaksi:update', data),
    deleteTransaksi: (id) => ipcRenderer.invoke('transaksi:delete', id),
    
    // Mustahik
    listMustahik: (params) => ipcRenderer.invoke('mustahik:list', params),
    createMustahik: (data) => ipcRenderer.invoke('mustahik:create', data),
    updateMustahik: (data) => ipcRenderer.invoke('mustahik:update', data),
    deleteMustahik: (id) => ipcRenderer.invoke('mustahik:delete', id),
    
    // Distribusi
    listDistribusi: (params) => ipcRenderer.invoke('distribusi:list', params),
    createDistribusi: (data) => ipcRenderer.invoke('distribusi:create', data),
    updateDistribusi: (data) => ipcRenderer.invoke('distribusi:update', data),
    deleteDistribusi: (id) => ipcRenderer.invoke('distribusi:delete', id),
    getBalances: () => ipcRenderer.invoke('distribusi:balances'),
    
    // Laporan & Dashboard
    getDashboardStats: () => ipcRenderer.invoke('laporan:dashboard-stats'),
    getReportData: (params) => ipcRenderer.invoke('laporan:get-data', params),
    exportExcel: (params) => ipcRenderer.invoke('laporan:export-excel', params),
    exportPDF: (params) => ipcRenderer.invoke('laporan:export-pdf', params),
    
    // Settings & Backup
    listBackups: () => ipcRenderer.invoke('backup:list'),
    createBackup: () => ipcRenderer.invoke('backup:create'),
    restoreBackup: (filename) => ipcRenderer.invoke('backup:restore', filename),
    listAuditLogs: (params) => ipcRenderer.invoke('audit:list', params)
});
