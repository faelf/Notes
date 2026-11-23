(function () {
  try {
    var saved = localStorage.getItem('notes-theme') || localStorage.getItem('vault-theme');
    var theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
