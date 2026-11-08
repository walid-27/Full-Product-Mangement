'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell, safeStorage, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const api = require('./api-client');
const mockApi = require('./mock-api');
const images = require('./images');
const store = require('./store');

// DevTools only when explicitly asked (`npm run dev`), never on a normal launch.
const DEV_MODE = process.argv.includes('--dev');
const APP_NAME = 'StockFlow';

let mainWindow = null;
let saveBoundsTimer = null;

/* ------------------------------------------------------------- bootstrap */

app.setName(APP_NAME);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.stockflow.desktop');
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function initServices() {
  store.init(app.getPath('userData'), {
    encrypt: (value) => {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.encryptString(value).toString('base64');
        }
      } catch (err) {
        // fall through to plain storage
      }
      return null;
    },
    decrypt: (value) => {
      try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
      } catch (err) {
        return null;
      }
    }
  });

  images.init(store.dataPath('image-cache'));
  mockApi.init(store.dataPath('demo-db.json'));
}

/* ----------------------------------------------------------- token utils */

function decodeJwt(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function currentSession() {
  const session = store.getSession();
  if (!session || !session.token) return null;
  if (session.exp && session.exp * 1000 < Date.now()) {
    store.clearSession();
    return null;
  }
  return session;
}

function publicSession() {
  const session = currentSession();
  if (!session) return null;
  return {
    name: session.name || '',
    email: session.email || '',
    exp: session.exp || null,
    apiBaseUrl: session.apiBaseUrl || '',
    demo: Boolean(session.demo)
  };
}

function imageOptions() {
  const config = store.get();
  const uploads = String(config.uploadsPath || '/uploads');
  if (/^https?:\/\//i.test(uploads)) {
    return { baseUrl: uploads.replace(/\/$/, ''), uploadsPath: '/' };
  }
  return { baseUrl: config.apiBaseUrl, uploadsPath: uploads };
}

/* ------------------------------------------------------------ API bridge */

/**
 * Runs an API call in the main process: demo mode -> mock, else real HTTP.
 * Attaches the stored JWT and strips it from the renderer's view.
 */
async function performRequest(options) {
  const opts = options || {};
  const config = store.get();
  const auth = opts.auth !== false;
  const session = currentSession();

  if (auth && !session) {
    return { ok: false, status: 401, data: { message: 'Please sign in to continue.' }, sessionExpired: true };
  }

  const payload = {
    method: opts.method || 'GET',
    path: opts.path,
    query: opts.query,
    body: opts.body,
    form: opts.form,
    timeout: opts.timeout
  };

  let result;
  if (config.demoMode) {
    result = mockApi.handle({
      method: payload.method,
      path: payload.path,
      query: payload.query,
      body: payload.body,
      form: payload.form,
      token: session ? session.token : ''
    });
  } else {
    result = await api.request({
      baseUrl: config.apiBaseUrl,
      path: payload.path,
      method: payload.method,
      query: payload.query,
      body: payload.body,
      form: payload.form,
      token: auth && session ? session.token : undefined,
      timeout: payload.timeout
    });
  }

  if (!result.ok) {
    const message = api.errorMessage(result);
    const expired = auth && !config.demoMode && (result.status === 401 || result.status === 403);
    if (expired && session) store.clearSession();
    return {
      ok: false,
      status: result.status,
      data: result.data,
      error: message,
      ms: result.ms,
      sessionExpired: expired
    };
  }

  return { ok: true, status: result.status, data: result.data, ms: result.ms };
}

/* ----------------------------------------------------------- IPC: auth */

ipcMain.handle('auth:login', async (_event, credentials) => {
  const config = store.get();
  const email = String((credentials && credentials.email) || '').trim();
  const password = String((credentials && credentials.password) || '');

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }

  let result;
  if (config.demoMode) {
    result = mockApi.handle({ method: 'POST', path: '/auth/login', body: { email, password } });
  } else {
    result = await api.request({
      baseUrl: config.apiBaseUrl,
      path: '/auth/login',
      method: 'POST',
      body: { email, password }
    });
  }

  if (!result.ok) {
    return { ok: false, status: result.status, error: api.errorMessage(result) };
  }

  const payload = (result.data && (result.data.register || result.data)) || {};
  const token = payload.token;
  if (!token) {
    return { ok: false, error: 'The API answered without a token. Is this the right server?' };
  }

  const decoded = decodeJwt(token);
  const session = {
    token,
    email: payload.email || email,
    name: payload.name || '',
    exp: decoded && decoded.exp ? decoded.exp : Math.floor(Date.now() / 1000) + 12 * 3600,
    apiBaseUrl: config.apiBaseUrl,
    demo: Boolean(config.demoMode)
  };
  store.setSession(session);

  return { ok: true, session: publicSession() };
});

ipcMain.handle('auth:register', async (_event, form) => {
  const config = store.get();
  const body = {
    name: String((form && form.name) || '').trim(),
    email: String((form && form.email) || '').trim(),
    password: String((form && form.password) || '')
  };

  if (!body.email || !body.password) return { ok: false, error: 'Email and password are required.' };
  if (body.password.length < 6) return { ok: false, error: 'Password must contain at least 6 characters.' };

  const result = config.demoMode
    ? mockApi.handle({ method: 'POST', path: '/auth/register', body })
    : await api.request({ baseUrl: config.apiBaseUrl, path: '/auth/register', method: 'POST', body });

  if (!result.ok) return { ok: false, status: result.status, error: api.errorMessage(result) };
  return { ok: true, data: result.data };
});

ipcMain.handle('auth:session', async () => publicSession());

ipcMain.handle('auth:logout', async () => {
  store.clearSession();
  return { ok: true };
});

/* ------------------------------------------------------- IPC: requests */

ipcMain.handle('api:request', async (_event, options) => performRequest(options));

ipcMain.handle('api:ping', async () => {
  const config = store.get();
  const startedAt = Date.now();

  if (config.demoMode) {
    return { ok: true, status: 200, demo: true, ms: Date.now() - startedAt, url: 'demo mode' };
  }

  const result = await api.request({
    baseUrl: config.apiBaseUrl,
    path: '/api/product',
    method: 'GET',
    timeout: 8000
  });

  // A 401/403 proves the server is up (missing/invalid token) — that is a pass.
  const reachable = result.status > 0 && result.status < 500;
  return {
    ok: reachable,
    status: result.status,
    ms: Date.now() - startedAt,
    url: api.joinUrl(config.apiBaseUrl, '/api/product'),
    error: reachable ? null : api.errorMessage(result)
  };
});

/* ------------------------------------------------------- IPC: settings */

ipcMain.handle('config:get', async () => ({
  ...store.getPublic(),
  session: publicSession()
}));

ipcMain.handle('config:set', async (_event, patch) => {
  const before = store.get();
  const labels = {};

  if (patch && typeof patch.apiBaseUrl === 'string' && patch.apiBaseUrl.trim() !== before.apiBaseUrl) {
    labels.baseChanged = true;
  }
  if (patch && typeof patch.demoMode === 'boolean' && patch.demoMode !== before.demoMode) {
    labels.modeChanged = true;
  }

  const next = store.set(patch || {});

  // Sessions belong to one server / one mode; switching invalidates them.
  if (labels.baseChanged || labels.modeChanged) store.clearSession();

  if (patch && patch.theme) nativeTheme.themeSource = patch.theme === 'light' ? 'light' : 'dark';

  return { ...next, session: publicSession(), resetSession: Boolean(labels.baseChanged || labels.modeChanged) };
});

ipcMain.handle('mock:reset', async () => {
  mockApi.reset();
  return { ok: true };
});

/* --------------------------------------------------------- IPC: images */

ipcMain.handle('image:get', async (_event, filename) => {
  if (!filename) return null;
  if (store.get().demoMode) return null;
  const dataUrl = await images.get(filename, imageOptions());
  return dataUrl;
});

ipcMain.handle('image:put', async (_event, payload) => {
  if (!payload || !payload.filename || !payload.data) return null;
  return images.put(payload.filename, Buffer.from(payload.data));
});

ipcMain.handle('image:clear', async () => {
  images.clear();
  return { ok: true, size: images.cacheSize() };
});

ipcMain.handle('image:stats', async () => images.cacheSize());

/* ------------------------------------------------------- IPC: app misc */

ipcMain.handle('app:info', async () => ({
  name: APP_NAME,
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
  dataPath: app.getPath('userData'),
  imageCache: images.cacheSize()
}));

ipcMain.handle('app:openDataFolder', async () => {
  shell.openPath(app.getPath('userData'));
  return { ok: true };
});

ipcMain.handle('app:openExternal', async (_event, url) => {
  try {
    const parsed = new URL(String(url));
    if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false };
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch (err) {
    return { ok: false };
  }
});

ipcMain.handle('app:showErrorBox', async (_event, payload) => {
  dialog.showErrorBox(String((payload && payload.title) || 'StockFlow'), String((payload && payload.message) || ''));
  return { ok: true };
});

/* ----------------------------------------------------- IPC: window ctrl */

function sendWindowState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('win:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  });
}

ipcMain.handle('win:minimize', async () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('win:toggleMaximize', async () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});

ipcMain.handle('win:close', async () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('win:isMaximized', async () => Boolean(mainWindow && mainWindow.isMaximized()));

/* --------------------------------------------------------------- window */

function windowBounds() {
  const saved = store.get().window || {};
  const width = Number(saved.width) >= 980 ? Number(saved.width) : 1360;
  const height = Number(saved.height) >= 640 ? Number(saved.height) : 880;
  return { width, height, maximized: Boolean(saved.maximized) };
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const maximized = mainWindow.isMaximized();
  if (maximized) {
    store.set({ window: { ...store.get().window, maximized: true } });
    return;
  }
  const bounds = mainWindow.getBounds();
  store.set({ window: { width: bounds.width, height: bounds.height, maximized: false } });
}

function createWindow() {
  const bounds = windowBounds();
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    frame: false,
    backgroundColor: '#0b0f16',
    title: APP_NAME,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (bounds.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('enter-full-screen', sendWindowState);
  mainWindow.on('leave-full-screen', sendWindowState);

  mainWindow.on('resize', () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(saveBounds, 500);
  });
  mainWindow.on('close', () => {
    clearTimeout(saveBoundsTimer);
    saveBounds();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep the renderer locked to the local file; open real links in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox(APP_NAME, `The interface stopped unexpectedly (${details.reason}).\nRestart the app to continue.`);
  });

  if (DEV_MODE) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function buildMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  initServices();
  nativeTheme.themeSource = store.get().theme === 'light' ? 'light' : 'dark';
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
