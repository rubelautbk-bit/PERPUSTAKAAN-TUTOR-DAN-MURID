const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Di Vercel, kita tidak bisa menulis ke public/uploads (read-only).
// Gunakan /tmp (ephemeral - file hilang tiap cold start).
// Untuk production, pakai S3 / Cloudinary / UploadThing.
const isVercel = !!process.env.VERCEL;
const uploadDir = isVercel
  ? '/tmp/rubela-uploads'
  : path.join(__dirname, '../../public/uploads');

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
