import React from 'react';
import { FolderOpen, Palette, RefreshCw } from 'lucide-react';
import type { ThemeDefinition } from '../types';

interface ThemeSelectorProps {
  themes: ThemeDefinition[];
  value: string;
  onChange: (themeId: string) => void;
  onRefresh: () => void;
}

export default function ThemeSelector({ themes, value, onChange, onRefresh }: ThemeSelectorProps) {
  return (
    <div className="flex items-center rounded border border-neutral-700 bg-[#0d0d0d] text-neutral-400">
      <label className="flex items-center gap-2 px-2.5 py-1.5">
        <Palette className="h-4 w-4 text-emerald-500" />
        <span className="sr-only">Тема интерфейса</span>
        <select
          aria-label="Тема интерфейса"
          value={themes.some(theme => theme.id === value) ? value : 'dark-wardens'}
          onChange={event => onChange(event.target.value)}
          className="max-w-40 bg-transparent font-mono text-[10px] uppercase text-neutral-300 outline-none"
        >
          {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
        </select>
      </label>
      {window.desktopApi?.isDesktop && (
        <button type="button" onClick={() => window.desktopApi?.openThemesFolder()} className="border-l border-neutral-700 p-2 transition hover:text-emerald-400" title="Открыть папку пользовательских тем">
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      )}
      <button type="button" onClick={onRefresh} className="border-l border-neutral-700 p-2 transition hover:text-emerald-400" title="Обновить список тем">
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
