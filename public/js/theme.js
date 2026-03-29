const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcons(next);
};

window.addEventListener('DOMContentLoaded', () => {
  updateThemeIcons(document.documentElement.getAttribute('data-theme'));
});

function updateThemeIcons(theme) {
  const icons = document.querySelectorAll('.theme-icon');
  icons.forEach(icon => {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}
