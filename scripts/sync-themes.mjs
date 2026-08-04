import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const themesDirectory = join(projectRoot, 'public', 'themes');

function metadata(css, key, fallback) {
  const match = css.match(new RegExp(`@theme-${key}:\\s*([^\\r\\n*]+)`, 'i'));
  return match?.[1].trim() || fallback;
}

function titleFromId(id) {
  return id.split(/[-_]/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

const files = (await readdir(themesDirectory)).filter(file => file.toLowerCase().endsWith('.css')).sort();
const themes = [];
for (const file of files) {
  const id = basename(file, '.css');
  const css = await readFile(join(themesDirectory, file), 'utf8');
  themes.push({
    id,
    name: metadata(css, 'name', titleFromId(id)),
    description: metadata(css, 'description', 'Пользовательская тема.'),
    version: metadata(css, 'version', '1'),
    cssFile: `/themes/${file}`
  });
}

await writeFile(join(themesDirectory, 'themes.json'), `${JSON.stringify(themes, null, 2)}\n`, 'utf8');
console.log(`Темы синхронизированы: ${themes.length}.`);
