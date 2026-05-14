// Shared parser for Bank Soal import dari Excel (.xlsx, .xls), CSV (.csv), atau Word (.docx)
// Kolom yang dikenali (case-insensitive, alias diizinkan):
//   subtest, soal, tipe, opsi_json, jawaban_json, poin, penjelasan, kelas_id
//
// xlsx.readFile() otomatis mendukung CSV jika file ber-ekstensi .csv.
// Untuk .docx kita pakai mammoth -> raw text, lalu parse blok dengan format:
//   SUBTEST: PU
//   SOAL: Jika x^2+5x+6=0 maka x adalah?
//   A. -2 dan -3
//   B. 2 dan 3
//   C. 1 dan 6
//   D. 0 dan 5
//   JAWABAN: A
//   POIN: 1
//   PEMBAHASAN: Faktorkan menjadi (x+2)(x+3)=0
//   ---
// Pisahkan tiap soal dengan baris '---' atau '###' atau garis kosong + 'SOAL:'.

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SUBTEST_VALID = new Set(['PU','PPU','PBM','PK','LBI','LBE','PM','UMUM']);
const TIPE_VALID = new Set(['pg','pg_kompleks','benar_salah','menjodohkan','isian','esai','drag_drop','labeling','cloze']);

function normKey(k) {
  return String(k || '').toLowerCase().replace(/[\s_-]+/g, '');
}

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

function ensureJsonString(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const s = String(val).trim();
  try { JSON.parse(s); return s; } catch (e) {
    if (s.includes('|') || s.includes(';')) {
      const parts = s.split(/[|;]/).map(x => x.trim()).filter(Boolean);
      return JSON.stringify(parts);
    }
    return JSON.stringify(s);
  }
}

function normalizeRow(r, lineNo, errors) {
  const soal = pick(r, ['soal','pertanyaan','question']);
  if (!soal) { errors.push(`Baris ${lineNo}: kolom "soal" kosong, dilewati.`); return null; }

  let subtest = String(pick(r, ['subtest','sub_test','mapel']) || 'PU').toUpperCase().trim();
  if (!SUBTEST_VALID.has(subtest)) subtest = 'PU';

  let tipe = String(pick(r, ['tipe','type','jenis']) || 'pg').toLowerCase().trim();
  if (!TIPE_VALID.has(tipe)) tipe = 'pg';

  const opsi_json = ensureJsonString(pick(r, ['opsi_json','opsi','options']), '[]');
  const jawaban_json = ensureJsonString(pick(r, ['jawaban_json','jawaban','answer','kunci']), '""');

  const poinRaw = pick(r, ['poin','point','skor','nilai']);
  const poin = Number.isFinite(+poinRaw) && +poinRaw > 0 ? Math.round(+poinRaw) : 1;

  const penjelasan = pick(r, ['penjelasan','pembahasan','explanation']) || null;
  const kelas_id = pick(r, ['kelas_id','kelasid']) || null;

  return {
    subtest,
    soal: String(soal),
    tipe,
    opsi_json,
    jawaban_json,
    poin,
    penjelasan: penjelasan ? String(penjelasan) : null,
    kelas_id: kelas_id ? +kelas_id || null : null,
  };
}

// Parser .docx (text-based block format) — lihat header file untuk contoh.
function parseDocxText(text) {
  // Pisahkan menjadi blok-blok soal
  const blocks = text
    .split(/\n\s*(?:---+|###+|\*\*\*+)\s*\n/g)
    .map(b => b.trim())
    .filter(Boolean);

  const rows = [];
  blocks.forEach(block => {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let cur = { subtest:'PU', soal:'', tipe:'pg', opsi:[], jawaban:'', poin:1, penjelasan:'' };
    let mode = null;
    lines.forEach(line => {
      const m = line.match(/^(SUBTEST|SOAL|TIPE|JAWABAN|POIN|PEMBAHASAN|PENJELASAN)\s*:\s*(.*)$/i);
      const opt = line.match(/^([A-F])[\.)]\s*(.+)$/);
      if (m) {
        const key = m[1].toUpperCase(); const val = m[2].trim();
        if (key === 'SUBTEST')        cur.subtest = val.toUpperCase() || 'PU';
        else if (key === 'SOAL')      { cur.soal = val; mode = 'soal'; }
        else if (key === 'TIPE')      cur.tipe = val.toLowerCase() || 'pg';
        else if (key === 'JAWABAN')   cur.jawaban = val;
        else if (key === 'POIN')      cur.poin = +val || 1;
        else if (key === 'PEMBAHASAN' || key === 'PENJELASAN') { cur.penjelasan = val; mode = 'penjelasan'; }
      } else if (opt) {
        cur.opsi.push(opt[2]);
      } else if (mode === 'soal') {
        cur.soal += '\n' + line;
      } else if (mode === 'penjelasan') {
        cur.penjelasan += '\n' + line;
      }
    });
    if (cur.soal) {
      rows.push({
        subtest: cur.subtest,
        soal: cur.soal,
        tipe: cur.tipe,
        opsi_json: JSON.stringify(cur.opsi),
        jawaban_json: cur.jawaban && cur.jawaban.startsWith('[') ? cur.jawaban : JSON.stringify(cur.jawaban),
        poin: cur.poin,
        penjelasan: cur.penjelasan || null,
        kelas_id: null,
      });
    }
  });
  return rows;
}

/**
 * Parse file Excel/CSV/Word menjadi list soal yang siap di-INSERT.
 */
async function parseBankSoalFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { rows: [], errors: ['File tidak ditemukan.'] };
  }
  const ext = path.extname(filePath).toLowerCase();
  const errors = [];
  let rows = [];

  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      rows = parseDocxText(result.value || '');
      if (!rows.length) errors.push('Tidak ada soal terdeteksi. Pastikan format mengikuti template (SUBTEST:, SOAL:, A./B./..., JAWABAN:, POIN:, PEMBAHASAN:, lalu pemisah ---).');
    } catch (e) {
      errors.push('Gagal baca .docx: ' + e.message);
    }
    return { rows, errors };
  }

  // Default: Excel / CSV
  const wb = XLSX.readFile(filePath, { raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ['File kosong / tidak ada sheet.'] };
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  raw.forEach((r, idx) => {
    const row = normalizeRow(r, idx + 2, errors);
    if (row) rows.push(row);
  });
  return { rows, errors };
}

module.exports = { parseBankSoalFile, parseDocxText };
