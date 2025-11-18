;(() => {
  const btn = document.querySelector('#toggle-theme');
  if (!btn) return;

  // cargar tema guardado
  const saved = localStorage.getItem('board_theme');
  if (saved === 'dark') {
    document.body.classList.add('theme-dark');
  }

  btn.addEventListener('click', () => {
    document.body.classList.toggle('theme-dark');
    const isDark = document.body.classList.contains('theme-dark');
    localStorage.setItem('board_theme', isDark ? 'dark' : 'light');
  });
})();
