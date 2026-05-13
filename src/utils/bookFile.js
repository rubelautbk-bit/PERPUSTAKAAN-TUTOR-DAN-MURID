// Resolve URL PDF / cover untuk ditampilkan ke user.
// Prioritas:
// 1. pdf_url / cover_url (external: Google Drive, Cloudinary, Supabase, dll) - HEMAT DISK
// 2. file_pdf / cover (upload lokal ke disk)
// 3. null
function resolvePdfUrl(buku) {
  if (!buku) return null;
  if (buku.pdf_url) return normalizeDriveUrl(buku.pdf_url);
  if (buku.file_pdf) return '/uploads/' + buku.file_pdf;
  return null;
}

function resolveCoverUrl(buku) {
  if (!buku) return null;
  if (buku.cover_url) return buku.cover_url;
  if (buku.cover) return '/uploads/' + buku.cover;
  return null;
}

// Convert Google Drive "share" URL jadi direct URL.
// Kita hanya bisa menampilkan Google Drive via embed iframe (bukan PDF.js) karena CORS.
function normalizeDriveUrl(url) {
  // Kalau sudah berupa URL direct, kembalikan apa adanya
  return url;
}

// Deteksi apakah URL cocok untuk PDF.js (perlu CORS & langsung .pdf)
// Google Drive -> false (pakai iframe preview), lainnya -> true
function isPdfJsCompatible(url) {
  if (!url) return false;
  if (url.includes('drive.google.com')) return false;
  if (url.startsWith('/uploads/')) return true;
  return url.toLowerCase().endsWith('.pdf');
}

// Convert Google Drive URL ke iframe preview
function getDriveEmbed(url) {
  // Format yang didukung:
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing -> /file/d/FILE_ID/preview
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) {
    return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  return url;
}

module.exports = {
  resolvePdfUrl,
  resolveCoverUrl,
  isPdfJsCompatible,
  getDriveEmbed,
};
