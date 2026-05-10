// Entrypoint Vercel Serverless Function.
// Vercel akan otomatis deteksi file di folder /api dan membungkusnya sebagai handler.
const app = require('../app');

module.exports = app;
