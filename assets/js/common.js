/* -------------------------------------------------------------
 * AMILDESK COMMON JS UTILITIES
 * Handles Authentication Checks, Sidebar Injection, Clock, Toasts, 
 * Confirmation Dialogs, and Loading states.
 * ------------------------------------------------------------- */

// SVG Icon Sprites for Sidebar
const ICONS = {
    dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`,
    muzakki: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    transaksi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="4" x2="12" y2="20"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
    mustahik: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    distribusi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    laporan: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authenticate user session
    const isLoginPage = window.location.pathname.endsWith('login.html');
    let user = null;
    
    try {
        user = await window.api.getCurrentUser();
    } catch (e) {
        console.error("Auth check failed:", e);
    }

    if (!user && !isLoginPage) {
        // Redirect to login if not logged in
        window.location.href = 'login.html';
        return;
    }

    if (user && isLoginPage) {
        // Already logged in, go to dashboard
        window.location.href = 'dashboard.html';
        return;
    }

    // 2. Inject Sidebar & Header if placeholder elements exist
    if (user) {
        injectSidebar(user);
        injectHeader(user);
        startSystemClock();
        setupGlobalModals();
    }
});

// Sidebar injection
function injectSidebar(user) {
    const placeholder = document.getElementById('sidebar-placeholder');
    if (!placeholder) return;

    const currentFile = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    // Check permission rules for menus
    // Panitia: Muzakki, Mustahik, Transaksi, Distribusi
    // Bendahara: + Laporan
    // Admin: + Settings (Backup/Restore/Audit Log)
    const isPanitia = user.role === 'Panitia';
    const isBendahara = user.role === 'Bendahara';
    const isAdmin = user.role === 'Admin';
    
    let menuHtml = `
        <a href="dashboard.html" class="menu-item ${currentFile === 'dashboard.html' ? 'active' : ''}">
            ${ICONS.dashboard} <span>Dashboard</span>
        </a>
        <a href="muzakki.html" class="menu-item ${currentFile === 'muzakki.html' ? 'active' : ''}">
            ${ICONS.muzakki} <span>Data Muzakki</span>
        </a>
        <a href="transaksi.html" class="menu-item ${currentFile === 'transaksi.html' ? 'active' : ''}">
            ${ICONS.transaksi} <span>Transaksi Zakat</span>
        </a>
        <a href="mustahik.html" class="menu-item ${currentFile === 'mustahik.html' ? 'active' : ''}">
            ${ICONS.mustahik} <span>Data Mustahik</span>
        </a>
        <a href="distribusi.html" class="menu-item ${currentFile === 'distribusi.html' ? 'active' : ''}">
            ${ICONS.distribusi} <span>Distribusi Zakat</span>
        </a>
    `;

    // Laporan visible to Bendahara and Admin
    if (isAdmin || isBendahara) {
        menuHtml += `
            <a href="laporan.html" class="menu-item ${currentFile === 'laporan.html' ? 'active' : ''}">
                ${ICONS.laporan} <span>Rekap & Laporan</span>
            </a>
        `;
    }

    // Settings visible to all users (roles check handled inside page)
    menuHtml += `
        <a href="settings.html" class="menu-item ${currentFile === 'settings.html' ? 'active' : ''}">
            ${ICONS.settings} <span>Pengaturan</span>
        </a>
    `;

    // Build sidebar
    const sidebarHtml = `
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="sidebar-logo">
                    <svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 3.99L18.47 19H5.53L12 5.99zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </div>
                <div>
                    <div class="sidebar-title">AmilDesk</div>
                    <div class="sidebar-subtitle">Masjid Management</div>
                </div>
            </div>
            <nav class="sidebar-menu">
                ${menuHtml}
            </nav>
            <div class="sidebar-footer">
                <div class="user-profile">
                    <div class="user-avatar">${user.username.substring(0, 2)}</div>
                    <div class="user-info">
                        <div class="user-name">${user.username}</div>
                        <div class="user-role">${user.role}</div>
                    </div>
                </div>
                <button class="btn-logout" id="sidebar-logout-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Keluar Sesi
                </button>
            </div>
        </div>
    `;

    placeholder.innerHTML = sidebarHtml;

    // Attach logout click handler
    document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
        showConfirm('Keluar Sesi', 'Apakah Anda yakin ingin keluar dari aplikasi AmilDesk?', async () => {
            showLoading(true);
            const res = await window.api.logout();
            showLoading(false);
            if (res.success) {
                window.location.href = 'login.html';
            } else {
                showToast('Gagal keluar sesi: ' + res.message, 'error');
            }
        });
    });
}

// Header injection
function injectHeader(user) {
    const placeholder = document.getElementById('header-placeholder');
    if (!placeholder) return;

    const pageTitles = {
        'dashboard.html': { title: 'Dashboard Utama', desc: 'Ringkasan posisi keuangan, penerimaan zakat, dan penyaluran mustahik.' },
        'muzakki.html': { title: 'Data Muzakki', desc: 'Kelola pendataan muzakki (pemberi zakat) masjid.' },
        'transaksi.html': { title: 'Penerimaan Zakat', desc: 'Pencatatan transaksi zakat fitrah, zakat mal, infak, dan sedekah.' },
        'mustahik.html': { title: 'Data Mustahik', desc: 'Kelola data mustahik (penerima zakat) berdasarkan 8 asnaf.' },
        'distribusi.html': { title: 'Penyaluran Zakat', desc: 'Pencatatan distribusi dana dan beras zakat kepada mustahik yang berhak.' },
        'laporan.html': { title: 'Laporan & Rekapitulasi', desc: 'Filter data pemasukan, pengeluaran, saldo akhir, dan ekspor dokumen.' },
        'settings.html': { title: 'Pengaturan Sistem', desc: 'Kelola kata sandi, manajemen pengguna, backup database, dan log aktivitas.' }
    };

    const currentFile = window.location.pathname.split('/').pop() || 'dashboard.html';
    const pageMeta = pageTitles[currentFile] || { title: 'AmilDesk', desc: 'Sistem Informasi Pengelolaan Zakat' };

    placeholder.innerHTML = `
        <div class="header">
            <div class="header-title-area">
                <h2>${pageMeta.title}</h2>
                <p>${pageMeta.desc}</p>
            </div>
            <div class="header-actions">
                <div class="system-clock" id="system-clock">00:00:00</div>
            </div>
        </div>
    `;
}

// Toast System
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    if (type === 'success') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    else if (type === 'error') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    else icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    const dismissToast = () => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    };

    closeBtn.addEventListener('click', dismissToast);
    
    // Auto remove after 4 seconds
    setTimeout(dismissToast, 4000);
}

// Confirmation Dialog System
let confirmCallback = null;
function showConfirm(title, message, onConfirm) {
    const overlay = document.getElementById('global-confirm-modal');
    if (!overlay) return;

    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    confirmCallback = onConfirm;
    
    overlay.classList.add('open');
}

function setupGlobalModals() {
    // Create confirm modal container if not exists
    if (document.getElementById('global-confirm-modal')) return;

    const modalHtml = `
        <div class="modal-overlay" id="global-confirm-modal">
            <div class="modal-container" style="width: 400px;">
                <div class="modal-header">
                    <h3 id="confirm-title">Konfirmasi</h3>
                    <button class="btn-close-modal" id="close-confirm-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <p id="confirm-message" style="font-size: 14px; line-height: 1.5; color: var(--text-secondary);"></p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary btn-small" id="confirm-cancel-btn">Batal</button>
                    <button class="btn btn-danger btn-small" id="confirm-approve-btn">Ya, Lanjutkan</button>
                </div>
            </div>
        </div>
        
        <div class="loading-overlay" id="global-loading-overlay">
            <div style="text-align: center;">
                <div class="spinner"></div>
                <p style="font-weight: 600; color: var(--primary-dark); font-size: 14px;">Memproses data...</p>
            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHtml;
    document.body.appendChild(wrapper);

    // Event listeners
    const overlay = document.getElementById('global-confirm-modal');
    
    const closeModal = () => {
        overlay.classList.remove('open');
        confirmCallback = null;
    };

    document.getElementById('close-confirm-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-cancel-btn').addEventListener('click', closeModal);
    
    document.getElementById('confirm-approve-btn').addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        closeModal();
    });
}

// Loading Spinner control
function showLoading(show) {
    const loader = document.getElementById('global-loading-overlay');
    if (!loader) return;
    if (show) {
        loader.classList.add('active');
    } else {
        loader.classList.remove('active');
    }
}

// Helper to start real-time digital clock in header
function startSystemClock() {
    const clock = document.getElementById('system-clock');
    if (!clock) return;

    const updateClock = () => {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        clock.innerText = `${hrs}:${mins}:${secs}`;
    };
    
    updateClock();
    setInterval(updateClock, 1000);
}

// Helpers for Data Formatting
function formatIDR(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value || 0);
}

function formatBeras(value) {
    return `${value || 0} kg`;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
