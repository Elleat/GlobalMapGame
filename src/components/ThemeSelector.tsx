import React from 'react';
import { Palette } from 'lucide-react';
import type { ThemeDefinition } from '../types';

interface ThemeSelectorProps {
  themes: ThemeDefinition[];
  value: string;
  onChange: (themeId: string) => void;
}

export default function ThemeSelector({ themes, value, onChange }: ThemeSelectorProps) {
  return (
    <label className="flex items-center gap-2 rounded border border-neutral-700 bg-[#0d0d0d] px-2.5 py-1.5 text-neutral-400">
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
  );
}
