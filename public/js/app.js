// Dark mode toggle
(function () {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('click', (e) => {
    if (e.target.closest('#themeToggle')) {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    }
  });
})();

// Sidebar toggle - persistent, tidak menutup/membuka tanpa alasan
(function () {
  const savedCollapsed = localStorage.getItem('sidebarCollapsed') === '1';
  if (savedCollapsed) document.documentElement.classList.add('sidebar-collapsed');

  document.addEventListener('click', (e) => {
    if (e.target.closest('#sidebarToggle')) {
      const html = document.documentElement;
      html.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', html.classList.contains('sidebar-collapsed') ? '1' : '0');
    }
  });
})();

// Sidebar scroll position persist (biar tidak balik ke atas setelah refresh/navigasi)
(function() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const key = 'sidebarScroll';
  const saved = parseInt(sessionStorage.getItem(key) || '0', 10);
  if (saved > 0) sb.scrollTop = saved;
  sb.addEventListener('scroll', function() {
    sessionStorage.setItem(key, sb.scrollTop);
  });
  // Snapshot scroll position tepat sebelum klik link (jaga-jaga jika scroll event terlewat)
  sb.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      sessionStorage.setItem(key, sb.scrollTop);
    });
  });
})();

// Auto-scroll sidebar ke menu yang sedang aktif HANYA pada kunjungan pertama (tidak ada scroll tersimpan)
(function() {
  const active = document.querySelector('.sidebar a.active');
  if (!active) return;
  if (sessionStorage.getItem('sidebarScroll') !== null) return; // jangan override scroll user
  const sb = document.querySelector('.sidebar');
  const offset = active.offsetTop - 60;
  if (sb && offset > 100) sb.scrollTop = offset;
})();

// Auto hide alert
setTimeout(() => {
  document.querySelectorAll('.alert').forEach((a) => (a.style.display = 'none'));
}, 5000);

// Live clock untuk WIB/WITA/WIT (jika ada elemen #liveClock)
(function() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const tz = el.dataset.tz || 'Asia/Jakarta';
  function tick() {
    const now = new Date();
    const formatted = now.toLocaleString('id-ID', {
      timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    el.textContent = formatted;
  }
  tick();
  setInterval(tick, 1000);
})();
