const STORAGE_KEY = 'scholarmcp-theme';
const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const label = button?.querySelector<HTMLElement>('[data-theme-toggle-label]');

const updateLabel = () => {
  if (label) label.textContent = document.documentElement.classList.contains('dark') ? 'Dark' : 'Light';
};

updateLabel();
button?.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  // Storage can be unavailable in private or restricted browser contexts.
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  updateLabel();
});
