import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

function read(): Theme {
  try {
    const v = localStorage.getItem('theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* opslag niet beschikbaar */
    }
  }, [theme]);

  return (
    <label className="theme">
      <span className="sr-only">Thema</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Thema">
        <option value="system">Automatisch</option>
        <option value="light">Licht</option>
        <option value="dark">Donker</option>
      </select>
    </label>
  );
}
