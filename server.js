// Entry point untuk local development / Railway / Render / VPS.
// Untuk Vercel, yang jalan adalah api/index.js
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== Perpustakaan Bimbel Rubela ===`);
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log(`Akun demo:`);
  console.log(`  Admin  -> admin@rubela.id / admin123`);
  console.log(`  Tutor  -> tutor@rubela.id / tutor123`);
  console.log(`  Murid  -> murid@rubela.id / murid123`);
});
