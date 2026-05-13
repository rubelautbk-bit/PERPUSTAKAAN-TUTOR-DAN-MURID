const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Lokasi upload bisa di-override dengan env var UPLOAD_DIR.
// - Railway (dengan volume): set UPLOAD_DIR=/data/uploads
// - Vercel: paksa ke /tmp (ephemeral)
// - Default: ./public/uploads
const isVercel = !!process.env.VERCEL;
const uploadDir =
  process.env.UPLOAD_DIR ||
  (isVercel ? '/tmp/rubela-uploads' : path.join(__dirname, '../../public/uploads'));

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = upload;
