import type { ThemeDefinition } from '../types';

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: 'dark-wardens',
    name: 'Dark Wardens',
    description: 'Исходная чёрно-зелёная тема глобальной карты.',
    version: '1',
    cssFile: '/themes/dark-wardens.css'
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    description: 'Тёплая фэнтезийная тема с золотом, бронзой и пергаментом.',
    version: '1',
    cssFile: '/themes/fantasy.css'
  }
];

export async function loadThemeCatalog(): Promise<ThemeDefinition[]> {
  try {
    const response = await fetch(`/themes/themes.json?time=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const themes = await response.json() as ThemeDefinition[];
    if (!Array.isArray(themes) || themes.length === 0) return BUILT_IN_THEMES;
    return themes.filter(theme => theme.id && theme.name && theme.cssFile);
  } catch {
    return BUILT_IN_THEMES;
  }
}

export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  let link = document.querySelector<HTMLLinkElement>('link[data-global-map-theme]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.globalMapTheme = 'true';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== theme.cssFile) link.href = theme.cssFile ?? '';
}
