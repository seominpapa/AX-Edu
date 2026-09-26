const root = document.documentElement;

export async function applyTheme() {
  try {
    const response = await fetch('/api/theme', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Theme unavailable');
    const result = await response.json();
    root.dataset.theme = result.data?.theme === 'ORIGINAL' ? 'original' : 'construction';
  } catch {
    root.dataset.theme = 'construction';
  }
}

await applyTheme();
