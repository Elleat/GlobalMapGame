import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_SCHEME = 'globalmap';
const APP_HOST = 'app';
const PRODUCT_NAME = 'Глобальная Карта';
const moduleDirectory = parse(fileURLToPath(import.meta.url)).dir;

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

app.setName(PRODUCT_NAME);
if (process.platform === 'win32') app.setAppUserModelId('ru.globalmap.adventurersguild');
if (!app.isPackaged && process.env.GLOBAL_MAP_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.GLOBAL_MAP_DEBUG_PORT);
}

function getDistributionRoot() {
  return app.isPackaged
    ? join(app.getAppPath(), 'dist')
    : resolve(moduleDirectory, '..', 'dist');
}

function getUserThemesRoot() {
  return join(app.getPath('userData'), 'themes');
}

function themeMetadata(css, key, fallback) {
  const match = css.match(new RegExp(`@theme-${key}:\\s*([^\\r\\n*]+)`, 'i'));
  return match?.[1].trim() || fallback;
}

function themeTitle(id) {
  return id.split(/[-_]/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
}

async function readThemesFrom(directory, isUserTheme) {
  let files = [];
  try {
    files = await readdir(directory);
  } catch {
    return [];
  }
  const themes = [];
  for (const file of files.filter(item => item.toLowerCase().endsWith('.css')).sort()) {
    const id = file.slice(0, -4);
    const css = await readFile(join(directory, file), 'utf8');
    themes.push({
      id,
      name: themeMetadata(css, 'name', themeTitle(id)),
      description: themeMetadata(css, 'description', isUserTheme ? 'Пользовательская desktop-тема.' : 'Встроенная тема.'),
      version: themeMetadata(css, 'version', '1'),
      cssFile: `/themes/${encodeURIComponent(file)}`,
      isUserTheme
    });
  }
  return themes;
}

async function createThemeManifest() {
  const builtIn = await readThemesFrom(join(getDistributionRoot(), 'themes'), false);
  const custom = await readThemesFrom(getUserThemesRoot(), true);
  const byId = new Map(builtIn.map(theme => [theme.id, theme]));
  custom.forEach(theme => byId.set(theme.id, theme));
  return Array.from(byId.values());
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function safePath(root, relativePath) {
  const target = resolve(root, normalize(relativePath).replace(/^[/\\]+/, ''));
  const normalizedRoot = resolve(root);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) return null;
  return target;
}

async function fileResponse(filePath) {
  try {
    const data = await readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: { 'content-type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream' }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/themes/themes.json') {
    return Response.json(await createThemeManifest(), {
      headers: { 'cache-control': 'no-store' }
    });
  }
  if (pathname.startsWith('/themes/') && pathname.toLowerCase().endsWith('.css')) {
    const fileName = pathname.slice('/themes/'.length);
    const custom = safePath(getUserThemesRoot(), fileName);
    if (custom) {
      const response = await fileResponse(custom);
      if (response.status === 200) return response;
    }
  }
  if (pathname === '/') pathname = '/index.html';
  const target = safePath(getDistributionRoot(), pathname);
  return target ? fileResponse(target) : new Response('Forbidden', { status: 403 });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    show: true,
    title: `${PRODUCT_NAME} — загрузка`,
    autoHideMenuBar: true,
    backgroundColor: '#060606',
    webPreferences: {
      preload: join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => {
    const target = new URL(event.url);
    if (target.protocol !== `${APP_SCHEME}:` || target.host !== APP_HOST) event.preventDefault();
  });
  window.webContents.on('did-finish-load', () => window.setTitle(PRODUCT_NAME));
  window.webContents.on('did-fail-load', (_event, code, description) => {
    window.setTitle(`${PRODUCT_NAME} — ошибка ${code}: ${description}`);
  });
  window.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
}

app.whenReady().then(async () => {
  await mkdir(getUserThemesRoot(), { recursive: true });
  protocol.handle(APP_SCHEME, handleAppRequest);
  ipcMain.handle('open-themes-folder', () => shell.openPath(getUserThemesRoot()));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(async error => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  await writeFile(join(app.getPath('userData'), 'startup-error.log'), message, 'utf8').catch(() => undefined);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
