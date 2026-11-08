'use strict';

/**
 * Main-process integration tests.
 *
 * Electron itself is stubbed (only the APIs main.js touches), then the real
 * src/main/main.js is loaded and every IPC channel the preload exposes is
 * invoked: config, auth, API proxying, sessions, images, demo mode and window
 * controls. This is the closest we get to running the packaged app headlessly.
 *
 *   node test/main-process.test.js
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-main-'));
const userData = path.join(tmpDir, 'userData');
fs.mkdirSync(userData, { recursive: true });

/* ------------------------------------------------------------- Electron stub */

const handlers = new Map();
const windows = [];
const sentEvents = [];

function createFakeElectron() {
  const app = {
    isPackaged: false,
    name: 'StockFlow',
    setName: (value) => { app.name = value; },
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => {},
    getPath: () => userData,
    getVersion: () => '1.0.0',
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => {},
    commandLine: { appendSwitch: () => {} }
  };

  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this._maximized = false;
      windows.push(this);
      this.webContents = {
        send: (channel, payload) => sentEvents.push({ channel, payload }),
        openDevTools: () => {},
        setWindowOpenHandler: () => {},
        on: () => {},
        once: () => {},
        executeJavaScript: () => Promise.resolve()
      };
    }

    loadFile() {
      return Promise.resolve();
    }

    once(event, callback) {
      if (event === 'ready-to-show') setTimeout(callback, 0);
      return this;
    }

    on() {
      return this;
    }

    isMaximized() {
      return this._maximized;
    }

    maximize() {
      this._maximized = true;
    }

    unmaximize() {
      this._maximized = false;
    }

    isMinimized() {
      return false;
    }

    isFullScreen() {
      return false;
    }

    restore() {}
    minimize() {}
    focus() {}
    show() {}
    close() {}
    loadURL() {}

    getBounds() {
      return { width: 1360, height: 880 };
    }

    isDestroyed() {
      return false;
    }

    static getAllWindows() {
      return windows;
    }
  }

  const ipcMain = {
    handle: (channel, listener) => handlers.set(channel, listener),
    on: () => {}
  };

  return {
    app,
    BrowserWindow,
    ipcMain,
    Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
    shell: { openExternal: async () => {}, openPath: async () => '' },
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from(''),
      decryptString: () => ''
    },
    dialog: { showErrorBox: () => {} },
    nativeTheme: { themeSource: 'dark' }
  };
}

const fakeElectron = createFakeElectron();
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

require('../src/main/main.js');
Module._load = originalLoad;

/* ------------------------------------------------------------------ harness */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`  \u2717 ${name}\n      ${error.message}`);
  }
}

const call = (channel, ...args) => {
  const handler = handlers.get(channel);
  assert.ok(handler, `IPC channel "${channel}" is not registered`);
  return handler({}, ...args);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------- test API server */

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  await wait(120); // let app.whenReady() -> initServices() -> createWindow() run

  console.log('\nMain process (Electron IPC) tests\n');

  let localServer = null;
  const seen = [];

  await test('registers every IPC channel used by the preload bridge', () => {
    const expected = [
      'auth:login',
      'auth:register',
      'auth:session',
      'auth:logout',
      'api:request',
      'api:ping',
      'config:get',
      'config:set',
      'mock:reset',
      'image:get',
      'image:put',
      'image:clear',
      'image:stats',
      'app:info',
      'app:openDataFolder',
      'app:openExternal',
      'win:minimize',
      'win:toggleMaximize',
      'win:close',
      'win:isMaximized'
    ];
    for (const channel of expected) assert.ok(handlers.has(channel), `missing ${channel}`);
  });

  await test('creates a frameless, sandboxed main window', () => {
    assert.strictEqual(windows.length, 1);
    const options = windows[0].options;
    assert.strictEqual(options.frame, false);
    assert.strictEqual(options.webPreferences.contextIsolation, true);
    assert.strictEqual(options.webPreferences.nodeIntegration, false);
    assert.strictEqual(options.webPreferences.sandbox, true);
    assert.ok(options.minWidth >= 1000);
  });

  await test('returns default configuration', async () => {
    const config = await call('config:get');
    assert.strictEqual(config.apiBaseUrl, 'http://localhost:5000');
    assert.strictEqual(config.uploadsPath, '/uploads');
    assert.strictEqual(config.theme, 'dark');
    assert.strictEqual(config.demoMode, false);
    assert.strictEqual(config.hasSession, false);
    assert.strictEqual(config.session, null);
  });

  await test('rejects API calls without a session', async () => {
    const result = await call('api:request', { method: 'GET', path: '/api/product' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.sessionExpired, true);
  });

  await test('ignores unknown settings keys', async () => {
    const next = await call('config:set', { evil: true, theme: 'light' });
    assert.strictEqual(next.theme, 'light');
    assert.strictEqual('evil' in next, false);
    assert.strictEqual(fakeElectron.nativeTheme.themeSource, 'light');
  });

  await test('signs in to the demo workspace and stores the session', async () => {
    const enabled = await call('config:set', { demoMode: true });
    assert.strictEqual(enabled.demoMode, true);

    const login = await call('auth:login', { email: 'demo@stockflow.app', password: 'demo1234' });
    assert.strictEqual(login.ok, true, login.error);
    assert.strictEqual(login.session.name, 'Demo Manager');
    assert.strictEqual(login.session.demo, true);
    assert.ok(login.session.exp > Date.now() / 1000);

    const config = await call('config:get');
    assert.strictEqual(config.hasSession, true);
    assert.strictEqual(config.session.email, 'demo@stockflow.app');
  });

  await test('never leaks the JWT through config:get', async () => {
    const config = await call('config:get');
    assert.strictEqual('token' in config.session, false);
    assert.strictEqual(JSON.stringify(config).includes('mock.'), false);
  });

  await test('rejects bad credentials in demo mode', async () => {
    const login = await call('auth:login', { email: 'demo@stockflow.app', password: 'nope' });
    assert.strictEqual(login.ok, false);
    assert.match(login.error, /invalaid/);
  });

  await test('proxies API calls with the stored token (demo backend)', async () => {
    const list = await call('api:request', { method: 'GET', path: '/api/product', query: { limit: 3 } });
    assert.strictEqual(list.ok, true);
    assert.strictEqual(list.data.products.length, 3);

    const created = await call('api:request', {
      method: 'POST',
      path: '/api/product',
      form: {
        fields: { name: 'IPC Product', price: 1500, category: 'IPC' },
        file: { name: 'ipc.png', type: 'image/png', data: new Uint8Array([137, 80, 78, 71]) }
      }
    });
    assert.strictEqual(created.ok, true, created.error);
    assert.strictEqual(created.data.product.Product.name, 'IPC Product');
    assert.strictEqual(created.data.product.Product.image, 'ipc.png');
  });

  await test('normalises API error payloads for the renderer', async () => {
    const result = await call('api:request', { method: 'DELETE', path: '/api/product/does-not-exist' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 404);
    assert.strictEqual(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  });

  await test('caches uploaded images and serves them back as data URLs', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const stored = await call('image:put', { filename: 'ipc.png', data: bytes });
    assert.ok(stored && stored.startsWith('data:image/png;base64,'), 'expected a data URL');

    const stats = await call('image:stats');
    assert.ok(stats.files >= 1, 'cache should contain the file');

    // demo mode deliberately skips the cache (no real uploads behind it)
    assert.strictEqual(await call('image:get', 'ipc.png'), null);

    // leaving demo mode keeps the local cache readable
    await call('config:set', { demoMode: false });
    const fromCache = await call('image:get', 'ipc.png');
    assert.ok(fromCache && fromCache.startsWith('data:image/png;base64,'));

    assert.strictEqual(await call('image:get', '../etc/passwd'), null, 'path traversal must be refused');
  });

  await test('clears the image cache', async () => {
    const result = await call('image:clear');
    assert.strictEqual(result.ok, true);
    assert.strictEqual((await call('image:stats')).files, 0);
  });

  await test('talks to a real HTTP API and reuses the token', async () => {
    const { server: local, port } = await listen((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      seen.push({ path: url.pathname, auth: request.headers.authorization });
      const json = (status, payload) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(payload));
      };
      if (url.pathname === '/auth/login') {
        return json(200, { register: { name: 'Live Manager', email: 'live@example.com', token: 'aaa.bbb.ccc' } });
      }
      if (url.pathname === '/api/product') {
        if (request.headers.authorization !== 'Bearer aaa.bbb.ccc') return json(401, { message: 'verife your access' });
        return json(200, { products: [], pagnition: { page: 1, limit: 12, total: 0, totalPages: 0 } });
      }
      if (url.pathname === '/api/quantity/low-stock') {
        return json(401, { message: 'verife your access' });
      }
      return json(404, { message: 'not found' });
    });

    const config = await call('config:set', { apiBaseUrl: `127.0.0.1:${port}` });
    assert.strictEqual(config.apiBaseUrl, `127.0.0.1:${port}`);
    assert.strictEqual(config.resetSession, true, 'changing server must invalidate the session');

    const ping = await call('api:ping');
    assert.strictEqual(ping.ok, true, ping.error);
    assert.match(ping.url, /^http:\/\/127\.0\.0\.1:/);

    const login = await call('auth:login', { email: 'live@example.com', password: 'secret123' });
    assert.strictEqual(login.ok, true, login.error);
    assert.strictEqual(login.session.demo, false);
    assert.strictEqual(login.session.apiBaseUrl, `127.0.0.1:${port}`);

    const list = await call('api:request', { method: 'GET', path: '/api/product' });
    assert.strictEqual(list.ok, true, list.error);
    assert.strictEqual(list.data.products.length, 0);
    assert.ok(
      seen.some((entry) => entry.path === '/api/product' && entry.auth === 'Bearer aaa.bbb.ccc'),
      'main process should attach the stored JWT'
    );

    localServer = local;
  });

  await test('clears the session when the API answers 401', async () => {
    const result = await call('api:request', { method: 'GET', path: '/api/quantity/low-stock' });
    assert.strictEqual(result.ok, false, 'low-stock endpoint always answers 401 in this stub');
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.sessionExpired, true);

    const config = await call('config:get');
    assert.strictEqual(config.hasSession, false, 'invalid token must be dropped');
  });

  await test('reports an unreachable API without throwing', async () => {
    if (localServer) {
      localServer.close();
      localServer.closeAllConnections && localServer.closeAllConnections();
      localServer = null;
      await wait(50);
    }
    const ping = await call('api:ping');
    assert.strictEqual(ping.ok, false);
    assert.ok(ping.error && ping.error.length > 0);

    const result = await call('api:request', { method: 'GET', path: '/api/product' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.sessionExpired, true, 'no session, no call');
  });

  await test('logs out and signs back into the demo workspace', async () => {
    await call('auth:logout');
    assert.strictEqual((await call('config:get')).hasSession, false);

    await call('config:set', { demoMode: true });
    const login = await call('auth:login', { email: 'demo@stockflow.app', password: 'demo1234' });
    assert.strictEqual(login.ok, true, login.error);
    assert.strictEqual((await call('config:get')).hasSession, true);
  });

  await test('resets the demo database', async () => {
    await call('mock:reset');
    const before = await call('api:request', { method: 'GET', path: '/api/product', query: { limit: 1 } });
    const totalBefore = before.data.pagnition.total;
    assert.strictEqual(totalBefore, 16, 'reset should restore the seeded catalogue');

    const created = await call('api:request', {
      method: 'POST',
      path: '/api/product',
      form: {
        fields: { name: 'Reset Me', price: 100 },
        file: { name: 'r.png', type: 'image/png', data: new Uint8Array([1]) }
      }
    });
    assert.strictEqual(created.ok, true, created.error);

    const after = await call('api:request', { method: 'GET', path: '/api/product', query: { limit: 1 } });
    assert.strictEqual(after.data.pagnition.total, totalBefore + 1);

    await call('mock:reset');
    const reset = await call('api:request', { method: 'GET', path: '/api/product', query: { limit: 1 } });
    assert.strictEqual(reset.data.pagnition.total, totalBefore);
  });

  await test('exposes app info and window controls', async () => {
    const info = await call('app:info');
    assert.strictEqual(info.version, '1.0.0');
    assert.strictEqual(info.packaged, false);
    assert.strictEqual(info.dataPath, userData);

    assert.strictEqual(await call('win:isMaximized'), false);
    await call('win:toggleMaximize');
    assert.strictEqual(await call('win:isMaximized'), true);
    await call('win:toggleMaximize');
    assert.strictEqual(await call('win:isMaximized'), false);
    await call('win:minimize');
    await call('app:openDataFolder');
  });

  await test('refuses to open non-http links externally', async () => {
    assert.deepStrictEqual(await call('app:openExternal', 'file:///etc/passwd'), { ok: false });
    assert.deepStrictEqual(await call('app:openExternal', 'javascript:alert(1)'), { ok: false });
    assert.deepStrictEqual(await call('app:openExternal', 'https://example.com'), { ok: true });
  });

  await test('persists settings to disk', () => {
    const configPath = path.join(userData, 'config.json');
    assert.ok(fs.existsSync(configPath), 'config.json should be written');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(raw.demoMode, true);
    assert.ok(raw.session && raw.session.token, 'a session should be stored');
    assert.ok(
      raw.session.token.startsWith('raw:') || raw.session.token.startsWith('enc:'),
      'token must be marked as raw or encrypted'
    );
  });

  if (localServer) {
    localServer.close();
    localServer.closeAllConnections && localServer.closeAllConnections();
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.error.stack}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((error) => {
  console.error('\nHarness crashed:\n', error);
  process.exit(1);
});
