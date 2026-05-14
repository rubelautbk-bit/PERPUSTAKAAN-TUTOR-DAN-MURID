// Shared parser for Bank Soal import dari Excel (.xlsx, .xls) atau CSV (.csv)
// Kolom yang dikenali (case-insensitive, alias diizinkan):
//   subtest, soal, tipe, opsi_json, jawaban_json, poin, penjelasan, kelas_id
//
// xlsx.readFile() otomatis mendukung CSV jika file ber-ekstensi .csv,
// jadi satu helper ini bisa menangani Excel + CSV.

const XLSX = require('xlsx');
const fs = require('fs');

const SUBTEST_VALID = new Set(['PU','PPU','PBM','PK','LBI','LBE','PM']);
const TIPE_VALID = new Set(['pg','pg_kompleks','benar_salah','menjodohkan','isian','esai','drag_drop','labeling']);

// Normalisasi nama kolom: lowercase + buang spasi/underscore
function normKey(k) {
  return String(k || '').toLowerCase().replace(/[\s_-]+/g, '');
}

// Ambil nilai dari row berdasarkan beberapa alias kolom
function pick(row, aliases) {
  for (const a of aliases) {
    const target = normKey(a);
    for (const k of Object.keys(row)) {
      if (normKey(k) === target) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
    }
  }
  return undefined;
}

// Pastikan string adalah JSON valid; kalau bukan, bungkus jadi JSON yang masuk akal
function ensureJsonString(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const s = String(val).trim();
  try { JSON.parse(s); return s; } catch (e) {
    // Coba parse sebagai daftar dipisah | atau ;
    if (s.includes('|') || s.includes(';')) {
      const parts = s.split(/[|;]/).map(x => x.trim()).filter(Boolean);
      return JSON.stringify(parts);
    }
    // Fallback: bungkus jadi string JSON
    return JSON.stringify(s);
  }
}

/**
 * Parse file Excel/CSV menjadi list soal yang siap di-INSERT.
 * @param {string} filePath - path absolute ke file upload
 * @returns {{ rows: Array, errors: Array<string> }}
 */
function parseBankSoalFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { rows: [], errors: ['File tidak ditemukan.'] };
  }
  const wb = XLSX.readFile(filePath, { raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ['File kosong / tidak ada sheet.'] };
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const rows = [];
  const errors = [];

  raw.forEach((r, idx) => {
    const lineNo = idx + 2; // header = baris 1
    const soal = pick(r, ['soal', 'pertanyaan', 'question']);
    if (!soal) { errors.push(`Baris ${lineNo}: kolom "soal" kosong, dilewati.`); return; }

    let subtest = String(pick(r, ['subtest', 'sub_test', 'mapel']) || 'PU').toUpperCase().trim();
    if (!SUBTEST_VALID.has(subtest)) subtest = 'PU';

    let tipe = String(pick(r, ['tipe', 'type', 'jenis']) || 'pg').toLowerCase().trim();
    if (!TIPE_VALID.has(tipe)) tipe = 'pg';

    const opsi_json = ensureJsonString(pick(r, ['opsi_json', 'opsi', 'options']), '[]');
    const jawaban_json = ensureJsonString(pick(r, ['jawaban_json', 'jawaban', 'answer', 'kunci']), '""');

    const poinRaw = pick(r, ['poin', 'point', 'skor', 'nilai']);
    const poin = Number.isFinite(+poinRaw) && +poinRaw > 0 ? Math.round(+poinRaw) : 1;

    const penjelasan = pick(r, ['penjelasan', 'pembahasan', 'explanation']) || null;
    const kelas_id = pick(r, ['kelas_id', 'kelasid']) || null;

    rows.push({
      subtest,
      soal: String(soal),
      tipe,
      opsi_json,
      jawaban_json,
      poin,
      penjelasan: penjelasan ? String(penjelasan) : null,
      kelas_id: kelas_id ? +kelas_id || null : null,
    });
  });

  return { rows, errors };
}

module.exports = { parseBankSoalFile };
