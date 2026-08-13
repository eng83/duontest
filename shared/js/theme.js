const STORAGE_KEY = 'wt-theme';

function getTheme() {
  return localStorage.getItem(STORAGE_KEY)
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'dark' ? '☀' : '🌙';
    btn.title = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
  });
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getTheme());
  const home = sessionStorage.getItem('wt-home');
  if (home) {
    document.querySelectorAll('.tool-nav a[href*="index.html"]').forEach(a => {
      a.href = a.href.replace(/index\.html$/, home);
    });
  }
});
