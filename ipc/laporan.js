const { ipcMain, dialog, BrowserWindow } = require('electron');
const { db, logAudit } = require('../database/db');
const { getCurrentUserSession } = require('./auth');
const { getAvailableBalances } = require('./distribusi');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function initLaporanIPC() {
    // Get general dashboard statistics and chart data
    ipcMain.handle('laporan:dashboard-stats', async () => {
        try {
            const income = db.prepare('SELECT SUM(jumlah_uang) as total_uang, SUM(jumlah_beras) as total_beras FROM transaksi').get();
            const expense = db.prepare('SELECT SUM(jumlah_uang) as total_uang, SUM(jumlah_beras) as total_beras FROM distribusi').get();
            
            const totalUangMasuk = income.total_uang || 0;
            const totalBerasMasuk = income.total_beras || 0;
            
            const totalUangKeluar = expense.total_uang || 0;
            const totalBerasKeluar = expense.total_beras || 0;
            
            const sisaUang = totalUangMasuk - totalUangKeluar;
            const sisaBeras = totalBerasMasuk - totalBerasKeluar;
            
            // Counts
            const muzakkiCount = db.prepare('SELECT COUNT(*) as count FROM muzakki').get().count;
            const mustahikCount = db.prepare('SELECT COUNT(*) as count FROM mustahik').get().count;
            const transaksiCount = db.prepare('SELECT COUNT(*) as count FROM transaksi').get().count;
            
            // 1. Proportion of zakat by category
            const proporsiZakat = db.prepare(`
                SELECT jenis_zakat, 
                       SUM(jumlah_uang) as total_uang, 
                       SUM(jumlah_beras) as total_beras 
                FROM transaksi 
                GROUP BY jenis_zakat
            `).all();
            
            // 2. Trend data (incoming and outgoing) grouped by month
            const trendPemasukan = db.prepare(`
                SELECT strftime('%Y-%m', tanggal) as bulan, 
                       SUM(jumlah_uang) as total_uang, 
                       SUM(jumlah_beras) as total_beras 
                FROM transaksi 
                GROUP BY bulan 
                ORDER BY bulan DESC 
                LIMIT 12
            `).all();
            
            const trendPenyaluran = db.prepare(`
                SELECT strftime('%Y-%m', tanggal) as bulan, 
                       SUM(jumlah_uang) as total_uang, 
                       SUM(jumlah_beras) as total_beras 
                FROM distribusi 
                GROUP BY bulan 
                ORDER BY bulan DESC 
                LIMIT 12
            `).all();
            
            // Consolidate all unique months from both lists to align them
            const allMonthsSet = new Set();
            trendPemasukan.forEach(row => allMonthsSet.add(row.bulan));
            trendPenyaluran.forEach(row => allMonthsSet.add(row.bulan));
            
            // Fallback if no transactions yet
            if (allMonthsSet.size === 0) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                allMonthsSet.add(`${yyyy}-${mm}`);
            }
            
            // Sort chronologically and take the last 6 months
            const sortedMonths = Array.from(allMonthsSet).sort().slice(-6);
            
            // Map data for fast lookup
            const pemMap = {};
            trendPemasukan.forEach(row => { pemMap[row.bulan] = row; });
            
            const penyMap = {};
            trendPenyaluran.forEach(row => { penyMap[row.bulan] = row; });
            
            // Align the monthly arrays
            const trendDataAligned = sortedMonths.map(bulan => {
                const pem = pemMap[bulan] || { total_uang: 0, total_beras: 0 };
                const peny = penyMap[bulan] || { total_uang: 0, total_beras: 0 };
                return {
                    bulan,
                    pemasukanUang: pem.total_uang || 0,
                    pemasukanBeras: pem.total_beras || 0,
                    penyaluranUang: peny.total_uang || 0,
                    penyaluranBeras: peny.total_beras || 0
                };
            });
            
            return {
                success: true,
                stats: {
                    totalUangMasuk,
                    totalBerasMasuk,
                    totalUangKeluar,
                    totalBerasKeluar,
                    sisaUang,
                    sisaBeras,
                    counts: {
                        muzakki: muzakkiCount,
                        mustahik: mustahikCount,
                        transaksi: transaksiCount
                    },
                    charts: {
                        proporsiZakat,
                        trendData: trendDataAligned
                    }
                }
            };
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            return { success: false, message: 'Gagal memuat statistik dashboard: ' + error.message };
        }
    });

    // Get report data with filters
    ipcMain.handle('laporan:get-data', async (event, { filterType, dateValue }) => {
        try {
            let whereClause = '';
            let params = [];
            
            if (filterType === 'harian' && dateValue) {
                whereClause = 'WHERE tanggal = ?';
                params.push(dateValue);
            } else if (filterType === 'bulanan' && dateValue) {
                // dateValue is 'YYYY-MM'
                whereClause = 'WHERE strftime("%Y-%m", tanggal) = ?';
                params.push(dateValue);
            } else if (filterType === 'tahunan' && dateValue) {
                // dateValue is 'YYYY'
                whereClause = 'WHERE strftime("%Y", tanggal) = ?';
                params.push(dateValue);
            }
            
            // Query transactions for the period
            const transaksi = db.prepare(`
                SELECT t.*, m.nama as muzakki_nama 
                FROM transaksi t
                LEFT JOIN muzakki m ON t.muzakki_id = m.id
                ${whereClause}
                ORDER BY t.tanggal ASC
            `).all(...params);
            
            // Query distributions for the period
            const distribusi = db.prepare(`
                SELECT d.*, m.nama as mustahik_nama, m.kategori as mustahik_kategori 
                FROM distribusi d
                LEFT JOIN mustahik m ON d.mustahik_id = m.id
                ${whereClause}
                ORDER BY d.tanggal ASC
            `).all(...params);
            
            // Summaries for this period
            let periodUangMasuk = 0;
            let periodBerasMasuk = 0;
            transaksi.forEach(t => {
                periodUangMasuk += t.jumlah_uang || 0;
                periodBerasMasuk += t.jumlah_beras || 0;
            });
            
            let periodUangKeluar = 0;
            let periodBerasKeluar = 0;
            distribusi.forEach(d => {
                periodUangKeluar += d.jumlah_uang || 0;
                periodBerasKeluar += d.jumlah_beras || 0;
            });
            
            // Total/final remaining stock (always current)
            const currentBalances = getAvailableBalances();
            
            return {
                success: true,
                data: {
                    transaksi,
                    distribusi,
                    summary: {
                        uangMasuk: periodUangMasuk,
                        berasMasuk: periodBerasMasuk,
                        uangKeluar: periodUangKeluar,
                        berasKeluar: periodBerasKeluar,
                        currentUang: currentBalances.uang,
                        currentBeras: currentBalances.beras
                    }
                }
            };
        } catch (error) {
            console.error('Error compiling report data:', error);
            return { success: false, message: 'Gagal menyusun data laporan: ' + error.message };
        }
    });

    // Export to Excel
    ipcMain.handle('laporan:export-excel', async (event, { filterType, dateValue, reportData }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            
            const { filePath } = await dialog.showSaveDialog({
                title: 'Ekspor Laporan Excel',
                defaultPath: path.join(require('os').homedir(), `Laporan_Zakat_${filterType}_${dateValue || 'Semua'}.xlsx`),
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
            });
            
            if (!filePath) {
                return { success: false, message: 'Ekspor dibatalkan.' };
            }
            
            const wb = XLSX.utils.book_new();
            
            // Sheet 1: Ringkasan
            const ringkasanData = [
                ['LAPORAN KEUANGAN & STOK ZAKAT AMILDESK'],
                ['Filter Laporan', `${filterType.toUpperCase()} (${dateValue || 'Semua Data'})`],
                ['Tanggal Cetak', new Date().toLocaleString('id-ID')],
                [],
                ['METRIK UTAMA', 'JUMLAH'],
                ['Total Pemasukan Uang (Periode Ini)', reportData.summary.uangMasuk],
                ['Total Pemasukan Beras (Periode Ini)', `${reportData.summary.berasMasuk} kg`],
                ['Total Distribusi Uang (Periode Ini)', reportData.summary.uangKeluar],
                ['Total Distribusi Beras (Periode Ini)', `${reportData.summary.berasKeluar} kg`],
                [],
                ['SALDO AKHIR (SEAT INI)', 'JUMLAH'],
                ['Sisa Saldo Kas Uang', reportData.summary.currentUang],
                ['Sisa Stok Beras', `${reportData.summary.currentBeras} kg`]
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(ringkasanData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');
            
            // Sheet 2: Pemasukan (Transaksi)
            const trxHeaders = [['ID', 'Tanggal', 'Nama Muzakki', 'Jenis Zakat', 'Jumlah Jiwa', 'Uang (Rp)', 'Beras (kg)', 'Keterangan']];
            const trxRows = reportData.transaksi.map(t => [
                t.id, t.tanggal, t.muzakki_nama || 'Umum/Anonim', t.jenis_zakat, t.jumlah_jiwa, t.jumlah_uang, t.jumlah_beras, t.keterangan || ''
            ]);
            const wsTrx = XLSX.utils.aoa_to_sheet(trxHeaders.concat(trxRows));
            XLSX.utils.book_append_sheet(wb, wsTrx, 'Pemasukan Zakat');
            
            // Sheet 3: Pengeluaran (Distribusi)
            const distHeaders = [['ID', 'Tanggal', 'Nama Mustahik', 'Kategori Mustahik', 'Jenis Zakat', 'Uang (Rp)', 'Beras (kg)', 'Keterangan']];
            const distRows = reportData.distribusi.map(d => [
                d.id, d.tanggal, d.mustahik_nama || 'Umum', d.mustahik_kategori || '', d.jenis_zakat, d.jumlah_uang, d.jumlah_beras, d.keterangan || ''
            ]);
            const wsDist = XLSX.utils.aoa_to_sheet(distHeaders.concat(distRows));
            XLSX.utils.book_append_sheet(wb, wsDist, 'Distribusi Zakat');
            
            XLSX.writeFile(wb, filePath);
            
            logAudit(session.id, session.username, `Mengekspor laporan keuangan format Excel: ${path.basename(filePath)}`);
            
            return { success: true, filePath };
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            return { success: false, message: 'Gagal mengekspor Excel: ' + error.message };
        }
    });

    // Export to PDF using printToPDF
    ipcMain.handle('laporan:export-pdf', async (event, { htmlContent, filterType, dateValue }) => {
        try {
            const session = getCurrentUserSession();
            if (!session) {
                return { success: false, message: 'Sesi habis. Silakan login kembali.' };
            }
            
            const { filePath } = await dialog.showSaveDialog({
                title: 'Ekspor Laporan PDF',
                defaultPath: path.join(require('os').homedir(), `Laporan_Zakat_${filterType}_${dateValue || 'Semua'}.pdf`),
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
            });
            
            if (!filePath) {
                return { success: false, message: 'Ekspor dibatalkan.' };
            }
            
            // Create hidden print window
            let printWin = new BrowserWindow({
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });
            
            // Inject print stylesheets and HTML content
            const styledHtml = `
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Laporan Zakat</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            margin: 20px;
                            color: #1e293b;
                            font-size: 11px;
                        }
                        h1, h2 {
                            color: #047857;
                            margin-bottom: 5px;
                        }
                        h1 {
                            font-size: 18px;
                            border-bottom: 2px solid #059669;
                            padding-bottom: 5px;
                        }
                        h2 {
                            font-size: 13px;
                            margin-top: 20px;
                            border-bottom: 1px solid #cbd5e1;
                            padding-bottom: 3px;
                        }
                        .meta {
                            margin-bottom: 15px;
                            color: #64748b;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 8px;
                        }
                        th, td {
                            border: 1px solid #e2e8f0;
                            padding: 6px;
                            text-align: left;
                        }
                        th {
                            background-color: #f1f5f9;
                            color: #0f766e;
                            font-weight: 600;
                        }
                        tr:nth-child(even) td {
                            background-color: #f8fafc;
                        }
                        .summary-cards {
                            display: flex;
                            gap: 10px;
                            margin-bottom: 15px;
                        }
                        .card {
                            flex: 1;
                            border: 1px solid #cbd5e1;
                            border-radius: 4px;
                            padding: 8px;
                            background-color: #fafafa;
                        }
                        .card-title {
                            color: #64748b;
                            font-size: 9px;
                            text-transform: uppercase;
                        }
                        .card-val {
                            font-size: 12px;
                            font-weight: bold;
                            color: #047857;
                            margin-top: 3px;
                        }
                        .text-right {
                            text-align: right;
                        }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `;
            
            // Load content via data URL
            await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);
            
            // Print to PDF
            const pdfBuffer = await printWin.webContents.printToPDF({
                printBackground: true,
                marginsType: 1, // Standard margins
                pageSize: 'A4'
            });
            
            fs.writeFileSync(filePath, pdfBuffer);
            printWin.destroy();
            
            logAudit(session.id, session.username, `Mengekspor laporan keuangan format PDF: ${path.basename(filePath)}`);
            
            return { success: true, filePath };
        } catch (error) {
            console.error('Error exporting PDF:', error);
            return { success: false, message: 'Gagal mengekspor PDF: ' + error.message };
        }
    });
}

module.exports = {
    initLaporanIPC
};
