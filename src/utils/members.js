// Nomor Anggota & Kartu Anggota Generator
const db = require('../db/database');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

function generateNomorAnggota(role, userId) {
  const prefix = role === 'tutor' ? 'TUT' : role === 'admin' ? 'ADM' : 'MRD';
  const year = new Date().getFullYear().toString().slice(-2);
  const num = String(userId).padStart(4, '0');
  return `${prefix}-${year}-${num}`;
}

function assignNomorAnggota(userId) {
  const user = db.prepare('SELECT id, role, nomor_anggota FROM users WHERE id=?').get(userId);
  if (!user || user.nomor_anggota) return user?.nomor_anggota;
  const nomor = generateNomorAnggota(user.role, user.id);
  db.prepare('UPDATE users SET nomor_anggota=? WHERE id=?').run(nomor, userId);
  return nomor;
}

// Generate kartu anggota as PDF buffer
async function generateKartuAnggota(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return null;

  if (!user.nomor_anggota) {
    assignNomorAnggota(userId);
    user.nomor_anggota = generateNomorAnggota(user.role, user.id);
  }

  const qrData = `RUBELA|${user.nomor_anggota}|${user.name}|${user.role}`;
  const qrUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1 });
  const qrBuf = Buffer.from(qrUrl.split(',')[1], 'base64');

  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: [340, 215], margin: 0 });
    const buffers = [];
    doc.on('data', (b) => buffers.push(b));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // Background
    doc.rect(0, 0, 340, 215).fill('#1e7a5a');
    doc.rect(10, 10, 320, 195).lineWidth(1).stroke('#fff');

    // Header
    doc.fontSize(11).fillColor('#fff').font('Helvetica-Bold')
      .text('E-LIBRARY BIMBEL RUBELA INDONESIA', 20, 20, { width: 200, align: 'left' });
    doc.fontSize(8).font('Helvetica')
      .text('KARTU ANGGOTA PERPUSTAKAAN', 20, 36);

    // QR code
    doc.image(qrBuf, 245, 20, { width: 70, height: 70 });

    // Garis pemisah
    doc.moveTo(20, 55).lineTo(230, 55).lineWidth(0.5).stroke('#ffffff80');

    // Data
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Nama:', 20, 65); doc.font('Helvetica').text(user.name, 80, 65);
    doc.font('Helvetica-Bold').text('No. Anggota:', 20, 82); doc.font('Helvetica').text(user.nomor_anggota, 80, 82);
    doc.font('Helvetica-Bold').text('Role:', 20, 99); doc.font('Helvetica').text(user.role.toUpperCase(), 80, 99);
    doc.font('Helvetica-Bold').text('Email:', 20, 116); doc.font('Helvetica').text(user.email, 80, 116, { width: 150 });
    doc.font('Helvetica-Bold').text('No. HP:', 20, 133); doc.font('Helvetica').text(user.phone || '-', 80, 133);
    doc.font('Helvetica-Bold').text('Bergabung:', 20, 150); doc.font('Helvetica').text(
      new Date(user.created_at).toLocaleDateString('id-ID'), 80, 150
    );

    // Tag INDOMARC
    doc.rect(20, 170, 60, 16).fill('#f4a623');
    doc.fontSize(7).fillColor('#000').font('Helvetica-Bold')
      .text('INDOMARC', 25, 174);

    // Footer
    doc.fontSize(7).fillColor('#ffffffcc').font('Helvetica')
      .text('Kartu ini merupakan identitas resmi anggota E-Library Bimbel Rubela', 90, 175, { width: 220 });

    // Status
    const statusColor = user.status === 'active' ? '#22c55e' : '#ef4444';
    doc.circle(310, 175, 8).fill(statusColor);
    doc.fontSize(6).fillColor('#fff').text(user.status === 'active' ? 'AKTIF' : 'NON', 302, 172);

    doc.end();
  });
}

module.exports = { generateNomorAnggota, assignNomorAnggota, generateKartuAnggota };
