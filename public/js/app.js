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

// Auto hide alert
setTimeout(() => {
  document.querySelectorAll('.alert').forEach((a) => (a.style.display = 'none'));
}, 5000);
