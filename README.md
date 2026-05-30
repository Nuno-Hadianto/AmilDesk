# AmilDesk 🕌📊

[![Electron Version](https://img.shields.io/badge/Electron-30.0.0-blue?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![SQLite Database](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-brightgreen?style=for-the-badge)](#)

**AmilDesk** adalah aplikasi desktop modern berbasis **Electron** dan **SQLite** yang dirancang khusus untuk mempermudah operasional panitia zakat (Amil) di masjid. Aplikasi ini berjalan **100% offline (offline-first)** untuk menjamin keamanan data, kecepatan akses, dan kehandalan operasional tanpa ketergantungan koneksi internet.

---

## ✨ Fitur Unggulan

Aplikasi ini dilengkapi berbagai fitur otomatisasi canggih untuk meminimalisir kesalahan pencatatan:

### 1. 💵 Kalkulator Zakat Otomatis
*   **Zakat Fitrah**: Otomatisasi perhitungan nominal beras (kg) atau uang (Rupiah) berdasarkan jumlah jiwa sesuai tarif tahunan yang dikonfigurasi.
*   **Zakat Mal (Harta) & Perdagangan**: Penghitungan otomatis kadar zakat (2,5%) jika total simpanan bersih (Harta - Hutang) memenuhi syarat Nisab setara **85 gram emas**.

### 2. 🎟️ Cetak Kupon Antrean Mustahik
*   Mencetak kupon fisik secara massal langsung dari daftar pencarian/filter kategori Asnaf.
*   Format cetak terstandarisasi untuk lembar A4 dengan garis putus-putus (*dashed line*) untuk pemotongan manual yang rapi dan nomor kupon unik (contoh: `MSH-00042`).

### 3. 📊 Visualisasi Dashboard Dinamis
*   **Diagram Tren Transaksi**: Visualisasi pemasukan vs penyaluran zakat (uang & beras) selama 6 bulan terakhir.
*   **Diagram Lingkaran (Doughnut)**: Proporsi penerimaan zakat (Fitrah, Mal, Infaq, Sedekah) dan proporsi penyaluran zakat per kategori **Asnaf**.

### 4. 📲 Tanda Terima Digital via WhatsApp
*   Tombol kirim struk digital langsung ke nomor WhatsApp Muzakki secara offline via skema `wa.me`.
*   Otomatis menyusun teks pesan yang sopan berisi detail transaksi, doa keberkahan, dan tautan terima kasih tanpa biaya API pihak ketiga.

### 5. 🗄️ Pengarsipan Lintas Tahun ("Tutup Buku")
*   Pembersihan data log dan transaksi tahun berjalan untuk menyambut kepanitiaan tahun baru.
*   Sistem secara otomatis membuat backup cadangan database berstempel waktu di folder `database/backup/` sebelum tabel dibersihkan.
*   Dilengkapi verifikasi konfirmasi ganda guna mencegah penghapusan yang tidak sengaja.

---

## 🛠️ Teknologi yang Digunakan

*   **Runtime**: [Electron.js](https://www.electronjs.org/) (Aplikasi Desktop lintas platform)
*   **Database**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite sinkron berkinerja tinggi)
*   **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism & Modern Slate UI), Vanilla JavaScript ES6
*   **Charting**: [Chart.js](https://www.chartjs.org/)
*   **Utility**: [XLSX](https://github.com/SheetJS/sheetjs) (Ekspor/Impor data Muzakki & Mustahik massal dari file Excel)

---

## 🚀 Panduan Memulai

Ikuti langkah-langkah berikut untuk menjalankan AmilDesk di komputer lokal Anda:

### Prasyarat
Pastikan komputer Anda sudah terinstal **Node.js** (rekomendasi versi LTS). Unduh di [nodejs.org](https://nodejs.org/).

### Langkah Instalasi
1. Clone repositori ini ke direktori lokal Anda:
   ```bash
   git clone https://github.com/Nuno-Hadianto/AmilDesk.git
   ```
2. Masuk ke folder proyek:
   ```bash
   cd AmilDesk
   ```
3. Instal semua dependensi yang diperlukan:
   ```bash
   npm install
   ```
4. Jalankan aplikasi:
   ```bash
   npm start
   ```

---

## 🔑 Kredensial Login Default

Setelah aplikasi terbuka, Anda dapat login menggunakan akun administrator bawaan berikut:
*   **Username**: `admin`
*   **Password**: `admin`

*Catatan: Sangat disarankan untuk segera mengubah kata sandi default pada menu **Pengaturan** setelah login pertama kali demi keamanan.*

---

## 📁 Struktur Direktori Proyek

```text
AmilDesk/
├── assets/            # Aset CSS (style.css), JS, ikon, & logo
├── database/          # File SQLite (amildesk.db), backup, & skema SQL
├── ipc/               # Komunikasi IPC Backend (auth, transaksi, dll)
├── pages/             # File antarmuka HTML (login, dashboard, transaksi, dll)
├── main.js            # File utama/proses induk Electron
├── preload.js         # Bridge API aman dengan contextIsolation
├── package.json       # Manajer paket & dependensi Node.js
└── README.md          # Dokumentasi proyek ini
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE). Anda bebas menggunakan, memodifikasi, dan menyebarkannya untuk kebutuhan kemaslahatan masjid.
