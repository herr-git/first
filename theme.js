// ---------- Light / Dark display ----------
// The choice is remembered in this browser only (localStorage). Nothing is sent anywhere.

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeButton() {
  const btn = document.getElementById('theme-toggle');
  const dark = currentTheme() === 'dark';
  btn.textContent = dark ? 'Light display' : 'Dark display';
  btn.setAttribute('aria-label', dark ? 'Switch to light display' : 'Switch to dark display');
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: choice lasts until the page closes */ }
  updateThemeButton();
});
updateThemeButton();
