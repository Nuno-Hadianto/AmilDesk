CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Bendahara', 'Panitia')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS muzakki (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    alamat TEXT,
    no_hp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mustahik (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    kategori TEXT NOT NULL CHECK(kategori IN ('Fakir', 'Miskin', 'Amil', 'Muallaf', 'Riqab', 'Gharim', 'Fisabilillah', 'Ibnu Sabil')),
    alamat TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT NOT NULL, -- Format: YYYY-MM-DD
    muzakki_id INTEGER,
    jenis_zakat TEXT NOT NULL CHECK(jenis_zakat IN ('Zakat Fitrah', 'Zakat Mal', 'Infaq', 'Sedekah')),
    jumlah_jiwa INTEGER DEFAULT 0,
    jumlah_uang REAL DEFAULT 0,
    jumlah_beras REAL DEFAULT 0,
    keterangan TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (muzakki_id) REFERENCES muzakki(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS distribusi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT NOT NULL, -- Format: YYYY-MM-DD
    mustahik_id INTEGER,
    jenis_zakat TEXT NOT NULL CHECK(jenis_zakat IN ('Zakat Fitrah', 'Zakat Mal', 'Infaq', 'Sedekah')),
    jumlah_uang REAL DEFAULT 0,
    jumlah_beras REAL DEFAULT 0,
    keterangan TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    aktivitas TEXT NOT NULL,
    tanggal TEXT NOT NULL, -- Format: YYYY-MM-DD
    waktu TEXT NOT NULL, -- Format: HH:MM:SS
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_transaksi_muzakki ON transaksi(muzakki_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal ON transaksi(tanggal);
CREATE INDEX IF NOT EXISTS idx_distribusi_mustahik ON distribusi(mustahik_id);
CREATE INDEX IF NOT EXISTS idx_distribusi_tanggal ON distribusi(tanggal);
CREATE INDEX IF NOT EXISTS idx_audit_log_tanggal ON audit_log(tanggal);

CREATE TABLE IF NOT EXISTS konfigurasi (
    kunci TEXT PRIMARY KEY,
    nilai TEXT
);
