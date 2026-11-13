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
  return session;
}

function publicSession() {
  const session = currentSession();
  if (!session) return null;
  return {
    name: session.name || '',
    email: session.email || '',
    emailVerified: session.emailVerified === undefined ? null : Boolean(session.emailVerified),
    exp: session.exp || null,
    orgId: session.orgId || null,
    orgName: session.orgName || '',
    role: session.role || '',
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

function refreshCookie(result) {
  const cookie = (result.cookies || []).find((value) => /^refreshToken=/.test(value));
  if (!cookie) return null;
  const token = cookie.split(';')[0].slice('refreshToken='.length);
  return token ? decodeURIComponent(token) : null;
}

function saveAuthResult(result, fallback) {
  const payload = (result.data && (result.data.register || result.data)) || {};
  const token = payload.token;
  if (!token) return null;
  const decoded = decodeJwt(token) || {};
  const previous = store.getSession() || {};
  const organization = payload.organization || {};
  const session = {
    ...previous,
    ...fallback,
    token,
    email: payload.email || (fallback && fallback.email) || previous.email,
    name: payload.name || (fallback && fallback.name) || previous.name,
    emailVerified: payload.emailVerified === undefined
      ? previous.emailVerified
      : Boolean(payload.emailVerified),
    exp: decoded.exp || Math.floor(Date.now() / 1000) + 900,
    // Backend organization objects use `_id` (Mongoose); accept `id` too.
    orgId: decoded.orgId || organization._id || organization.id || previous.orgId || null,
    orgName: organization.name || previous.orgName || '',
    refreshToken: refreshCookie(result) || previous.refreshToken || null
  };
  store.setSession(session);
  return session;
}

let refreshing = null;
async function refreshSession() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const config = store.get();
    const session = store.getSession();
    if (!session?.refreshToken || config.demoMode) return null;
    const result = await api.request({
      baseUrl: config.apiBaseUrl,
      path: '/auth/refresh',
      method: 'POST',
      headers: { Cookie: `refreshToken=${encodeURIComponent(session.refreshToken)}` }
    });
    if (!result.ok || !saveAuthResult(result)) {
      store.clearSession();
      return null;
    }
    return currentSession();
  })().finally(() => { refreshing = null; });
  return refreshing;
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
  let session = currentSession();
  if (auth && session && !config.demoMode && session.exp * 1000 < Date.now() + 30000) {
    session = await refreshSession();
  }

  if (auth && !session) {
    return { ok: false, status: 401, data: { message: 'Please sign in to continue.' }, sessionExpired: true };
  }

  const payload = {
    method: opts.method || 'GET',
    path: opts.path,
    query: opts.query,
    body: opts.body,
    form: opts.form,
    binary: Boolean(opts.binary),
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
      binary: payload.binary,
      token: session ? session.token : ''
    });
  } else {
    const headers = {};
    // The backend resolves the tenant from the JWT `orgId` claim or the
    // `x-org-id` header. Send both so a stale claim can never scope a
    // request to the wrong organization after a switch.
    if (auth && session && session.orgId) headers['x-org-id'] = String(session.orgId);
    result = await api.request({
      baseUrl: config.apiBaseUrl,
      path: payload.path,
      method: payload.method,
      query: payload.query,
      body: payload.body,
      form: payload.form,
      binary: payload.binary,
      headers: Object.keys(headers).length ? headers : undefined,
      token: auth && session ? session.token : undefined,
      timeout: payload.timeout
    });
  }

  if (!result.ok) {
    if (auth && !config.demoMode && result.status === 401 && !opts._retried && session?.refreshToken) {
      const refreshed = await refreshSession();
      if (refreshed) return performRequest({ ...opts, _retried: true });
    }
    const message = api.errorMessage(result);
    const expired = auth && !config.demoMode && result.status === 401;
    if (expired && session) store.clearSession();
    return {
      ok: false,
      status: result.status,
      data: result.data,
      code: (result.data && result.data.code) || null,
      details: (result.data && result.data.details) || null,
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
    return {
      ok: false,
      status: result.status,
      code: (result.data && result.data.code) || null,
      details: (result.data && result.data.details) || null,
      error: api.errorMessage(result)
    };
  }

  const session = saveAuthResult(result, {
    email,
    name: '',
    apiBaseUrl: config.apiBaseUrl,
    demo: Boolean(config.demoMode)
  });
  if (!session) return { ok: false, error: 'The API answered without a token. Is this the right server?' };
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
  if (body.password.length < 12 || body.password.length > 72 || !/[a-z]/.test(body.password) || !/[A-Z]/.test(body.password) || !/\d/.test(body.password)) {
    return { ok: false, error: 'Use 12 to 72 characters with uppercase, lowercase, and a number.' };
  }

  const result = config.demoMode
    ? mockApi.handle({ method: 'POST', path: '/auth/register', body })
    : await api.request({ baseUrl: config.apiBaseUrl, path: '/auth/register', method: 'POST', body });

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      code: (result.data && result.data.code) || null,
      details: (result.data && result.data.details) || null,
      error: api.errorMessage(result)
    };
  }
  // The backend returns a token on register too. Keep the session so the
  // renderer can show the email-verification step without a second login.
  const session = saveAuthResult(result, {
    email: body.email,
    name: body.name,
    apiBaseUrl: config.apiBaseUrl,
    demo: Boolean(config.demoMode)
  });
  return { ok: true, data: result.data, session: session ? publicSession() : null };
});

ipcMain.handle('auth:session', async () => publicSession());

/*
 * Re-reads the account state from the API (via the refresh-token rotation)
 * so changes made outside the app — e.g. email verification from the mail
 * link — are reflected in the stored session without a fresh login.
 */
ipcMain.handle('auth:refreshSession', async () => {
  const config = store.get();
  if (config.demoMode) return { ok: true, session: publicSession() };
  const session = await refreshSession();
  if (!session) return { ok: false, status: 401, error: 'Please sign in to continue.' };
  return { ok: true, session: publicSession() };
});

ipcMain.handle('auth:logout', async () => {
  const config = store.get();
  const session = currentSession();
  if (!config.demoMode && session?.refreshToken) {
    await api.request({
      baseUrl: config.apiBaseUrl,
      path: '/auth/logout',
      method: 'POST',
      headers: { Cookie: `refreshToken=${encodeURIComponent(session.refreshToken)}` },
      timeout: 5000
    });
  }
  store.clearSession();
  return { ok: true };
});

ipcMain.handle('auth:logoutAll', async () => {
  const config = store.get();
  const session = currentSession();
  if (!config.demoMode && session) {
    await api.request({
      baseUrl: config.apiBaseUrl,
      path: '/auth/logout-all',
      method: 'POST',
      token: session.token,
      timeout: 5000
    });
  }
  store.clearSession();
  return { ok: true };
});

ipcMain.handle('org:switch', async (_event, organizationId) => {
  if (!/^[a-f\d]{24}$/i.test(String(organizationId || ''))) return { ok: false, error: 'Invalid organization.' };
  const result = await performRequest({ method: 'POST', path: '/api/organizations/switch', body: { organizationId } });
  if (!result.ok) return result;
  const session = saveAuthResult({ data: result.data, cookies: [] });
  return { ok: true, session: publicSession(), organization: result.data.organization, saved: Boolean(session) };
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
    path: '/health/ready',
    method: 'GET',
    timeout: 8000
  });

  // /health/ready is public and reports MongoDB readiness (200 or 503).
  // Any HTTP answer proves the server is up; only a network failure fails.
  const reachable = result.status > 0 && result.status < 500;
  return {
    ok: reachable,
    status: result.status,
    ms: Date.now() - startedAt,
    url: api.joinUrl(config.apiBaseUrl, '/health/ready'),
    error: reachable ? null : api.errorMessage(result)
  };
});

/**
 * Binary download (CSV/XLSX exports, PDF invoices/labels, account export).
 * The renderer never sees the bytes: the main process fetches them with the
 * stored JWT and writes them to a file the user picks.
 */
ipcMain.handle('api:download', async (_event, options) => {
  const opts = options || {};
  const config = store.get();
  const session = currentSession();
  const fallbackName = String(opts.filename || 'download.bin').replace(/[\\/:*?"<>|]/g, '_');

  if (!config.demoMode && !session) {
    return { ok: false, status: 401, error: 'Please sign in to continue.' };
  }

  let result;
  if (config.demoMode) {
    result = mockApi.handle({
      method: opts.method || 'GET',
      path: opts.path,
      query: opts.query,
      body: opts.body,
      binary: true,
      token: session ? session.token : ''
    });
  } else {
    const headers = {};
    if (session && session.orgId) headers['x-org-id'] = String(session.orgId);
    result = await api.request({
      baseUrl: config.apiBaseUrl,
      path: opts.path,
      method: opts.method || 'GET',
      query: opts.query,
      body: opts.body,
      binary: true,
      headers: Object.keys(headers).length ? headers : undefined,
      token: session ? session.token : undefined,
      timeout: opts.timeout
    });
  }

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      code: (result.data && result.data.code) || null,
      details: (result.data && result.data.details) || null,
      error: api.errorMessage(result)
    };
  }

  const payload = result.data || {};
  const buffer = payload.base64 ? Buffer.from(payload.base64, 'base64') : Buffer.alloc(0);
  const suggested = payload.filename || fallbackName;

  let target;
  if (dialog && typeof dialog.showSaveDialog === 'function') {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const choice = parent
      ? await dialog.showSaveDialog(parent, { defaultPath: suggested })
      : await dialog.showSaveDialog({ defaultPath: suggested });
    if (!choice || choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    target = choice.filePath;
  } else {
    target = path.join(app.getPath('downloads'), suggested);
  }

  try {
    fs.writeFileSync(target, buffer);
  } catch (err) {
    return { ok: false, error: `Could not save the file: ${err.message}` };
  }
  return { ok: true, filePath: target, bytes: buffer.length, filename: path.basename(target) };
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
