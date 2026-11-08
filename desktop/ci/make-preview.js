'use strict';

/**
 * Dev utility: renders the real interface in jsdom and writes static HTML
 * snapshots into ../preview. They open in any browser (no scripts, no install)
 * and are useful to review the design or to attach to a PDF/issue.
 *
 *   node ci/make-preview.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');

const mock = require('../src/main/mock-api');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const OUT = path.join(ROOT, 'preview');
const SCRIPTS = [
  'js/icons.js',
  'js/util.js',
  'js/api.js',
  'js/ui.js',
  'js/views/auth.js',
  'js/views/dashboard.js',
  'js/views/products.js',
  'js/views/inventory.js',
  'js/views/orders.js',
  'js/views/settings.js',
  'js/app.js'
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-preview-'));
mock.init(path.join(tmp, 'demo-db.json'));
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------- environment */

const html = fs
  .readFileSync(path.join(RENDERER, 'index.html'), 'utf8')
  .replace(/<script src="[^"]+"><\/script>/g, '');

const dom = new JSDOM(html, {
  url: 'https://stockflow.local/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

if (typeof window.Blob.prototype.arrayBuffer !== 'function') {
  window.Blob.prototype.arrayBuffer = function arrayBuffer() {
    const reader = new window.FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
window.URL.createObjectURL = () => 'blob:preview';
window.URL.revokeObjectURL = () => {};

let token = '';
const config = {
  apiBaseUrl: 'http://localhost:5000',
  uploadsPath: '/uploads',
  theme: 'dark',
  demoMode: true
};

window.desktop = {
  platform: 'win32',
  isDesktop: true,
  getConfig: async () => ({
    ...config,
    session: token
      ? { name: 'Demo Manager', email: 'demo@stockflow.app', exp: Math.floor(Date.now() / 1000) + 3600, demo: true }
      : null
  }),
  setConfig: async (patch) => ({ ...config, ...patch, resetSession: false }),
  login: async ({ email, password }) => {
    const result = mock.handle({ method: 'POST', path: '/auth/login', body: { email, password } });
    if (!result.ok) return { ok: false, error: result.data.message };
    token = result.data.register.token;
    return {
      ok: true,
      session: { name: 'Demo Manager', email, exp: Math.floor(Date.now() / 1000) + 3600, demo: true }
    };
  },
  register: async () => ({ ok: true, data: {} }),
  getSession: async () => null,
  logout: async () => {
    token = '';
    return { ok: true };
  },
  request: async (options) => {
    const opts = options || {};
    const result = mock.handle({
      method: opts.method || 'GET',
      path: opts.path,
      query: opts.query,
      body: opts.body,
      form: opts.form,
      token
    });
    return result.ok
      ? { ok: true, status: result.status, data: result.data }
      : { ok: false, status: result.status, data: result.data, error: result.data && result.data.message };
  },
  ping: async () => ({ ok: true, status: 401, ms: 4, url: 'http://localhost:5000/api/product' }),
  getImage: async () => null,
  putImage: async () => null,
  clearImageCache: async () => ({ ok: true, size: { files: 0, bytes: 0 } }),
  imageStats: async () => ({ files: 0, bytes: 0 }),
  resetDemo: async () => ({ ok: true }),
  info: async () => ({
    version: '1.0.0',
    electron: '45.2.3',
    chrome: '140.0.7339.80',
    node: '22.20.0',
    platform: 'win32',
    arch: 'x64',
    dataPath: 'C:\\Users\\you\\AppData\\Roaming\\StockFlow'
  }),
  openDataFolder: async () => ({ ok: true }),
  openExternal: async () => ({ ok: true }),
  showErrorBox: async () => ({ ok: true }),
  minimize: async () => {},
  toggleMaximize: async () => false,
  close: async () => {},
  isMaximized: async () => false,
  onWindowState: () => () => {}
};

for (const script of SCRIPTS) {
  window.eval(fs.readFileSync(path.join(RENDERER, script), 'utf8'));
}

/* ----------------------------------------------------------------- capture */

const css = fs.readFileSync(path.join(RENDERER, 'css', 'app.css'), 'utf8');
const BANNER =
  '<div style="position:fixed;left:50%;translate:-50% 0;bottom:16px;z-index:9999;' +
  'padding:9px 16px;border-radius:999px;background:rgba(5,20,16,.92);' +
  'border:1px solid rgba(52,211,153,.38);color:#d1fae5;backdrop-filter:blur(10px);' +
  'font:600 12px/1 \'Segoe UI\', system-ui, sans-serif;box-shadow:0 12px 30px -12px rgba(0,0,0,.8)">' +
  'Static design preview &middot; run <strong>2-run.bat</strong> for the live app</div>';

function snapshot(name, title) {
  let out = document.documentElement.outerHTML;

  out = out.replace(/\s*<script[\s\S]*?<\/script>/g, '');
  out = out.replace(
    /<link rel="stylesheet"[^>]*>/,
    `<style>\n${css}\n</style>`
  );
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = out.replace('</body>', `${BANNER}\n</body>`);

  fs.writeFileSync(path.join(OUT, `${name}.html`), out, 'utf8');
  console.log(`  preview/${name}.html  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
}

function click(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`missing ${selector}`);
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

(async () => {
  console.log('\nRendering static previews\n');

  await wait(400);
  snapshot('01-sign-in', 'StockFlow — Sign in');
  click('#demo-btn');

  await wait(900);
  snapshot('02-dashboard', 'StockFlow — Dashboard');

  click('[data-route="products"]');
  await wait(800);
  snapshot('03-products', 'StockFlow — Products');

  click('[data-route="inventory"]');
  await wait(800);
  snapshot('04-inventory', 'StockFlow — Inventory');

  click('[data-route="orders"]');
  await wait(800);
  snapshot('05-orders', 'StockFlow — Orders');

  click('#view tbody tr');
  await wait(500);
  snapshot('06-order-detail', 'StockFlow — Order detail');
  click('.drawer [data-close]');
  await wait(200);

  click('[data-route="settings"]');
  await wait(800);
  snapshot('07-settings', 'StockFlow — Settings');

  click('#theme-tabs [data-theme="light"]');
  await wait(500);
  snapshot('08-settings-light', 'StockFlow — Settings (light)');
  click('[data-route="dashboard"]');
  await wait(800);
  snapshot('09-dashboard-light', 'StockFlow — Dashboard (light)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nDone.\n');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
