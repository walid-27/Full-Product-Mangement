'use strict';

/**
 * End-to-end UI tests.
 *
 * The real renderer (HTML + CSS + all scripts) runs inside jsdom against the
 * demo backend, through a stub of the Electron preload bridge. This exercises
 * routing, forms, modals, tables, pagination and every API call the UI makes.
 *
 *   node test/ui.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const mock = require('../src/main/mock-api');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-ui-'));
mock.init(path.join(tmpDir, 'demo-db.json'));

let passed = 0;
const failures = [];
const consoleErrors = [];

/* --------------------------------------------------------------- harness */

function createBridge() {
  const config = {
    apiBaseUrl: 'http://localhost:5000',
    uploadsPath: '/uploads',
    theme: 'dark',
    demoMode: false
  };
  let token = '';
  let session = null;

  const publicSession = () => (session ? { ...session } : null);

  function errorMessage(result) {
    const data = result && result.data;
    if (data && typeof data.message === 'string') return data.message;
    if (data && data.message && typeof data.message === 'object') return Object.values(data.message).join(' · ');
    if (!result || result.status === 0) return 'Network error';
    return `Request failed (${result.status})`;
  }

  return {
    platform: 'win32',
    isDesktop: true,

    getConfig: async () => ({ ...config, session: publicSession() }),
    setConfig: async (patch) => {
      const before = { ...config };
      Object.assign(config, patch || {});
      let resetSession = false;
      if (before.apiBaseUrl !== config.apiBaseUrl || before.demoMode !== config.demoMode) {
        token = '';
        session = null;
        resetSession = true;
      }
      return { ...config, session: publicSession(), resetSession };
    },

    login: async ({ email, password }) => {
      if (!config.demoMode) return { ok: false, error: 'No API server in this test run.' };
      const result = mock.handle({ method: 'POST', path: '/auth/login', body: { email, password } });
      if (!result.ok) return { ok: false, status: result.status, error: errorMessage(result) };
      const payload = result.data.register;
      token = payload.token;
      session = {
        name: payload.name,
        email: payload.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
        apiBaseUrl: config.apiBaseUrl,
        demo: true
      };
      return { ok: true, session: publicSession() };
    },
    register: async (form) => {
      const result = mock.handle({ method: 'POST', path: '/auth/register', body: form });
      if (!result.ok) return { ok: false, status: result.status, error: errorMessage(result) };
      return { ok: true, data: result.data };
    },
    getSession: async () => publicSession(),
    logout: async () => {
      token = '';
      session = null;
      return { ok: true };
    },

    request: async (options) => {
      const opts = options || {};
      if (!token) {
        return { ok: false, status: 401, data: { message: 'Please sign in' }, error: 'Please sign in', sessionExpired: true };
      }
      const result = mock.handle({
        method: opts.method || 'GET',
        path: opts.path,
        query: opts.query,
        body: opts.body,
        form: opts.form,
        token
      });
      if (!result.ok) {
        return { ok: false, status: result.status, data: result.data, error: errorMessage(result) };
      }
      return { ok: true, status: result.status, data: result.data };
    },

    ping: async () => ({ ok: true, status: 401, ms: 3, url: 'http://localhost:5000/api/product' }),
    getImage: async () => null,
    putImage: async () => null,
    clearImageCache: async () => ({ ok: true, size: { files: 0, bytes: 0 } }),
    imageStats: async () => ({ files: 0, bytes: 0 }),
    resetDemo: async () => {
      mock.reset();
      return { ok: true };
    },
    info: async () => ({
      name: 'StockFlow',
      version: '1.0.0',
      electron: '45.2.3',
      chrome: '140.0.0',
      node: '22.0.0',
      platform: 'win32',
      arch: 'x64',
      packaged: false,
      dataPath: tmpDir,
      imageCache: { files: 0, bytes: 0 }
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
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, timeout) {
  const limit = timeout || 5000;
  const started = Date.now();
  while (Date.now() - started < limit) {
    let value;
    try {
      value = check();
    } catch (error) {
      value = false;
    }
    if (value) return value;
    await wait(25);
  }
  throw new Error(`Timed out after ${limit}ms waiting for: ${label}`);
}

async function cleanup() {
  for (const overlay of Array.from(document.querySelectorAll('.overlay'))) overlay.remove();
  for (const toast of Array.from(document.querySelectorAll('.toast'))) toast.remove();
  await wait(30);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`  \u2717 ${name}\n      ${error.message}`);
  } finally {
    await cleanup();
  }
}

/* ------------------------------------------------------------------ setup */

const html = fs
  .readFileSync(path.join(RENDERER, 'index.html'), 'utf8')
  .replace(/<script src="[^"]+"><\/script>/g, '');

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  consoleErrors.push(`jsdom: ${error.message}`);
});
virtualConsole.on('error', (message) => {
  consoleErrors.push(`console.error: ${message}`);
});

const dom = new JSDOM(html, {
  url: 'https://stockflow.local/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole
});

const { window } = dom;
const { document } = window;

// Blob.arrayBuffer is not implemented by jsdom; Chromium (Electron) has it.
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
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:mock';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};

window.desktop = createBridge();

for (const script of SCRIPTS) {
  const code = fs.readFileSync(path.join(RENDERER, script), 'utf8');
  window.eval(code);
}

/* --------------------------------------------------------------- helpers */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function click(node) {
  assert.ok(node, 'cannot click a missing element');
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function input(node, value) {
  assert.ok(node, 'cannot type into a missing input');
  node.value = value;
  node.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function change(node, value) {
  assert.ok(node, 'cannot change a missing input');
  if (value !== undefined) node.value = value;
  node.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function text(selector) {
  const node = typeof selector === 'string' ? $(selector) : selector;
  return (node ? node.textContent : '').replace(/\s+/g, ' ').trim();
}

function buttonByText(selector, pattern) {
  return $$(selector).find((node) => pattern.test(node.textContent || ''));
}

async function closeModals() {
  const overlay = $('.overlay');
  if (overlay) click(overlay);
  await wait(60);
}

/* ------------------------------------------------------------------ tests */

(async () => {
  console.log('\nStockFlow interface tests\n');

  await test('boots to the sign-in screen with the configured server', async () => {
    await waitFor(() => $('#auth') && !$('#auth').hidden, 'auth screen');
    assert.strictEqual($('#shell').hidden, true, 'shell must stay hidden');
    assert.match(text('#auth'), /Welcome back/);
    assert.strictEqual($('#api-url').value, 'http://localhost:5000');
    assert.match(text('#auth'), /Explore demo mode/);
  });

  await test('starts the demo workspace from the sign-in screen', async () => {
    click($('#demo-btn'));
    await waitFor(() => !$('#shell').hidden, 'application shell');
    await waitFor(() => $$('#view .stat').length === 4, 'dashboard statistics');
    assert.strictEqual($('#auth').hidden, true);
    assert.strictEqual($('#mode-badge').hidden, false, 'demo badge visible');
    assert.strictEqual(text('#view .stat .stat__value'), '16', 'seeded product count');
    assert.strictEqual($$('#nav-main [data-route]').length, 4);
    assert.match(text('#userchip'), /Demo Manager/);
  });

  await test('renders the dashboard charts, pipeline and recent orders', async () => {
    await waitFor(() => $$('#view .chart__col').length === 14, '14 day chart');
    assert.strictEqual($$('#view .status-bar').length, 5, 'five statuses');
    assert.ok($$('#view tbody tr').length >= 4, 'recent orders + restock rows');
    assert.match(text('#view'), /Recent orders/);
    assert.match(text('#view'), /Needs restocking/);
  });

  await test('navigates to products, paginates and searches', async () => {
    click($('[data-route="products"]'));
    await waitFor(() => $$('#view tbody tr').length === 12, 'first products page');
    assert.match(text('#view .table-foot'), /of 16/);
    assert.match(text('#page-title'), /Products/);
    assert.strictEqual($('#page-sub').textContent.includes('catalogue'), true);

    click(buttonByText('#view .pagination .page-btn', /^2$/));
    await waitFor(() => $$('#view tbody tr').length === 4, 'second page rows');
    assert.match(text('#view .table-foot'), /13–16/);

    click(buttonByText('#view .pagination .page-btn', /^1$/));
    await waitFor(() => $$('#view tbody tr').length === 12, 'back to page one');

    input($('#product-search'), 'casque');
    await waitFor(() => $$('#view tbody tr').length === 1, 'search results');
    assert.match(text('#view tbody tr'), /Casque/i);

    click($('[data-clear-search]'));
    await waitFor(() => $$('#view tbody tr').length === 12, 'cleared search');
  });

  await test('blocks product creation without an image, then creates it with one', async () => {
    click(buttonByText('#page-actions .btn', /New product/));
    await waitFor(() => $('#product-form'), 'product form');

    const form = $('#product-form');
    form.elements.name.value = 'UI Test Product';
    form.elements.price.value = '1200';
    form.elements.category.value = 'Testing';

    click($('.modal__foot [data-submit]'));
    await waitFor(() => $('#form-error') && !$('#form-error').hidden, 'image validation error');
    assert.match(text('#form-error'), /image/i);

    const file = new window.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'ui-test.png', {
      type: 'image/png'
    });
    const fileInput = $('#image-input');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(() => $('#preview img'), 'image preview');

    click($('.modal__foot [data-submit]'));
    await waitFor(() => !$('#product-form'), 'modal closed after create');
    await waitFor(
      () => mock.state().products.some((product) => product.name === 'UI Test Product'),
      'product stored in the API'
    );

    const stored = mock.state().products.find((product) => product.name === 'UI Test Product');
    assert.strictEqual(stored.price, 1200);
    assert.strictEqual(stored.stock, 0);
    assert.strictEqual(stored.image, 'ui-test.png');

    await waitFor(() => $$('#view tbody tr').length > 0, 'products reloaded');
  });

  await test('stocks a product in from the products list', async () => {
    await waitFor(() => buttonByText('#view tbody tr', /UI Test Product/), 'new product row');
    const row = buttonByText('#view tbody tr', /UI Test Product/);
    click(row.querySelector('[data-act="stock"]'));
    await waitFor(() => $('#qty'), 'stock modal');

    input($('#qty'), '7');
    click($('.modal__foot [data-submit]'));
    await waitFor(() => !$('.overlay'), 'stock modal closed');

    const stored = mock.state().products.find((product) => product.name === 'UI Test Product');
    assert.strictEqual(stored.stock, 7, 'stock increased to 7');
    await waitFor(() => text('#view').includes('7'), 'row reflects new stock');
  });

  await test('shows inventory tabs and low-stock filtering', async () => {
    click($('[data-route="inventory"]'));
    await waitFor(() => $$('#inv-tabs .segmented__btn').length === 4, 'inventory tabs');
    assert.strictEqual($$('#view .stat').length, 4);
    assert.match(text('#view'), /Units on hand/);

    click($('[data-tab="low"]'));
    await waitFor(() => $('#inv-tabs .segmented__btn.is-active[data-tab="low"]'), 'low tab active');
    assert.match(text('#view'), /Low stock/);
    await waitFor(() => $$('#inv-body tbody tr').length > 0, 'low stock rows');

    click($('[data-tab="activity"]'));
    await waitFor(() => text('#view').includes('No movements recorded') || text('#view').includes('Stock in'), 'activity tab');

    click($('[data-tab="all"]'));
    await waitFor(() => $$('#inv-body tbody tr').length > 0, 'all stock rows');
  });

  await test('rejects a stock-out larger than the available quantity', async () => {
    const row = $$('#inv-body tbody tr').find((node) => /UI Test Product/.test(node.textContent));
    assert.ok(row, 'product row should exist');
    click(row.querySelector('[data-act="out"]'));
    await waitFor(() => $('#qty'), 'stock-out modal');

    click($('[data-dir="out"]'));
    input($('#qty'), '99');
    await waitFor(() => $('.modal__foot [data-submit]').disabled, 'submit disabled when stock is insufficient');
    assert.match(text('#stock-preview'), /Not enough stock/);

    click($('.modal__foot [data-cancel]'));
    await waitFor(() => !$('.overlay'), 'modal closed');
    const stored = mock.state().products.find((product) => product.name === 'UI Test Product');
    assert.strictEqual(stored.stock, 7, 'stock unchanged');
  });

  await test('edits a product price while keeping its stock', async () => {
    click($('[data-route="products"]'));
    await waitFor(() => $('#product-search'), 'products view');
    input($('#product-search'), 'UI Test');
    await waitFor(() => $$('#view tbody tr').length === 1, 'filtered row');

    click($('#view tbody tr [data-act="edit"]'));
    await waitFor(() => $('#product-form'), 'edit form');
    assert.strictEqual($('#product-form').elements.name.value, 'UI Test Product');

    const form = $('#product-form');
    form.elements.price.value = '1500';
    form.elements.category.value = 'Testing v2';
    click($('.modal__foot [data-submit]'));

    await waitFor(() => !$('.overlay'), 'edit modal closed');
    await waitFor(
      () => mock.state().products.some((product) => product.name === 'UI Test Product' && product.price === 1500),
      'price saved'
    );
    const stored = mock.state().products.find((product) => product.name === 'UI Test Product');
    assert.strictEqual(stored.category, 'Testing v2');
    assert.strictEqual(stored.stock, 7, 'stock must not change when editing fields');
  });

  await test('deletes a product after confirmation', async () => {
    await waitFor(() => $$('#view tbody tr').length === 1, 'filtered row');
    click($('#view tbody tr [data-act="delete"]'));
    await waitFor(() => $('.modal'), 'confirmation dialog');
    assert.match(text('.modal'), /Delete this product/);

    click($('.modal [data-act="ok"]'));
    await waitFor(
      () => !mock.state().products.some((product) => product.name === 'UI Test Product'),
      'product removed'
    );

    input($('#product-search'), '');
    await waitFor(() => $$('#view tbody tr').length === 12, 'list restored');
  });

  await test('lists orders and opens the order drawer', async () => {
    click($('[data-route="orders"]'));
    await waitFor(() => $$('#view tbody tr').length === 12, 'orders page');
    assert.match(text('#view .table-foot'), /of 22/);

    click($('#view tbody tr'));
    await waitFor(() => $('.drawer'), 'order drawer');
    assert.match(text('.drawer'), /Order #/);
    assert.match(text('.drawer'), /Phone/);
    assert.match(text('.drawer'), /Order total/);

    const shortId = text('.drawer .modal__title').replace(/[^0-9A-F]/g, '');
    assert.ok(shortId, 'drawer shows an order number');

    click($('.drawer [data-status]'));
    await waitFor(() => $('.modal'), 'status modal');
    click($('.modal [data-status="shipped"]'));
    await waitFor(() => !$('.modal'), 'status modal closed');
    await waitFor(() => !$('.drawer'), 'drawer closed');

    const updated = mock.state().orders.find((order) => String(order._id).endsWith(shortId.toLowerCase()) || String(order._id).slice(-6).toUpperCase() === shortId);
    assert.ok(updated, 'order found by its short id');
    assert.strictEqual(updated.status, 'shipped', 'status persisted');
  });

  await test('filters orders by status', async () => {
    change($('#order-status'), 'delivered');
    await waitFor(() => $$('#view tbody tr').length > 0, 'delivered orders');
    assert.ok(
      $$('#view tbody tr').every((row) => /delivered/i.test(row.textContent)),
      'only delivered orders are listed'
    );
    change($('#order-status'), '');
    await waitFor(() => $$('#view tbody tr').length === 12, 'orders unfiltered');
  });

  await test('creates an order from the picker and reserves stock', async () => {
    const before = mock.state().orders.length;
    click(buttonByText('#page-actions .btn', /New order/));
    await waitFor(() => $('#picker-list .picker__item'), 'order form');

    const firstItem = $$('#picker-list .picker__item').find((node) => !/out of stock/.test(node.textContent));
    assert.ok(firstItem, 'a product with stock is available');
    const productId = firstItem.getAttribute('data-pid');
    const product = mock.state().products.find((item) => item._id === productId);
    assert.ok(product, 'picker item maps to a product');

    click(firstItem);
    await waitFor(() => $('#picker-list .picker__item.is-selected'), 'product selected');

    const nameInput = $('.modal [name="name"]');
    nameInput.value = 'Test Customer';
    $('.modal [name="number"]').value = '0551234567';
    $('.modal [name="city"]').value = 'Tizi Ouzou';
    $('.modal [name="address"]').value = '12 rue des Tests';

    click(buttonByText('.modal [data-delivery]', /Pickup desk/));
    click($('.modal__foot [data-submit]'));

    await waitFor(() => !$('#picker-list'), 'order modal closed');
    await waitFor(() => mock.state().orders.length === before + 1, 'order stored');

    const created = mock.state().orders.find((order) => order.userInfo.name === 'Test Customer');
    assert.ok(created, 'created order found');
    assert.strictEqual(created.status, 'pending');
    assert.strictEqual(created.userInfo.delivery, 'Desk');
    assert.strictEqual(created.totalPrice, product.price);
  });

  await test('cancels a pending order and returns its stock', async () => {
    change($('#order-status'), 'pending');
    await waitFor(() => $$('#view tbody tr').length > 0, 'pending orders');

    const row = $('#view tbody tr');
    const orderId = row.getAttribute('data-id');
    const order = mock.state().orders.find((item) => item._id === orderId);
    assert.ok(order, 'order exists in the demo backend');
    const before = order.products.map(
      (line) => mock.state().products.find((product) => product._id === line.product).stock
    );

    click(row);
    await waitFor(() => $('.drawer'), 'order drawer');
    click($('.drawer [data-cancel]'));
    await waitFor(() => $('.modal'), 'cancel confirmation');
    click($('.modal [data-act="ok"]'));
    await waitFor(() => !$('.modal') && !$('.drawer'), 'dialogs closed');
    await waitFor(() => mock.state().orders.find((item) => item._id === orderId).status === 'cancelled', 'order cancelled');

    order.products.forEach((line, index) => {
      const product = mock.state().products.find((item) => item._id === line.product);
      assert.strictEqual(product.stock, before[index] + line.quantity, 'stock returned to inventory');
    });

    change($('#order-status'), '');
    await waitFor(() => $$('#view tbody tr').length === 12, 'orders unfiltered');
  });

  await test('rejects an invalid phone number in the order form', async () => {
    const before = mock.state().orders.length;
    click(buttonByText('#page-actions .btn', /New order/));
    await waitFor(() => $('#picker-list .picker__item'), 'order form');
    click($('#picker-list .picker__item'));
    $('.modal [name="name"]').value = 'Bad Phone';
    $('.modal [name="number"]').value = '12345';
    $('.modal [name="city"]').value = 'Alger';
    $('.modal [name="address"]').value = 'Rue 1';
    click($('.modal__foot [data-submit]'));

    await waitFor(() => $('#order-error') && !$('#order-error').hidden, 'validation message');
    assert.match(text('#order-error'), /mobile|phone/i);
    assert.strictEqual(mock.state().orders.length, before, 'no order created');

    click($('.modal__foot [data-cancel]'));
    await waitFor(() => !$('.overlay'), 'modal closed');
  });

  await test('opens settings and switches the theme', async () => {
    click($('[data-route="settings"]'));
    await waitFor(() => $('#api-base'), 'settings view');
    assert.strictEqual($('#api-base').value, 'http://localhost:5000');
    assert.match(text('#view'), /API connection/);
    assert.match(text('#view'), /API endpoints used/);

    click($('#theme-tabs [data-theme="light"]'));
    await waitFor(() => document.documentElement.getAttribute('data-theme') === 'light', 'light theme');
    await waitFor(() => $('#theme-tabs [data-theme="light"]').classList.contains('is-active'), 'light button active');
    assert.strictEqual($('#theme-tabs [data-theme="dark"]').classList.contains('is-active'), false);

    click($('#theme-tabs [data-theme="dark"]'));
    await waitFor(() => document.documentElement.getAttribute('data-theme') === 'dark', 'dark theme');
    await waitFor(() => $('#theme-tabs [data-theme="dark"]').classList.contains('is-active'), 'dark button active');
  });

  await test('signs out through the confirmation dialog', async () => {
    click($('#sign-out'));
    await waitFor(() => $('.modal'), 'confirm dialog');
    click($('.modal [data-act="ok"]'));
    await waitFor(() => !$('#auth').hidden, 'back to sign-in');
    assert.strictEqual($('#shell').hidden, true);
    assert.strictEqual(mock.state().orders.length > 0, true, 'demo data untouched');
  });

  await test('registers a new account and signs in automatically', async () => {
    click($('[data-mode="register"]'));
    await waitFor(() => $('#auth-form [name="confirm"]'), 'register fields');

    const form = $('#auth-form');
    form.elements.name.value = 'UI Manager';
    form.elements.email.value = 'ui.manager@stockflow.app';
    form.elements.password.value = 'secret123';
    form.elements.confirm.value = 'secret123';
    click($('#auth-submit'));

    await waitFor(() => !$('#shell').hidden, 'signed in after register');
    await waitFor(() => $$('#view .stat').length === 4, 'dashboard after register');
    assert.ok(
      mock.state().users.some((user) => user.email === 'ui.manager@stockflow.app'),
      'user stored in the demo backend'
    );
  });

  await test('surfaces a friendlier error when the session is gone', async () => {
    // Force an unauthorised API response and check the app falls back to auth.
    await window.desktop.logout();
    click($('[data-route="products"]'));
    await waitFor(() => !$('#auth').hidden, 'signed out after 401');
    assert.strictEqual($('#shell').hidden, true);
  });

  /* ---------------------------------------------------------------- report */

  const realErrors = consoleErrors.filter((entry) => !/Could not parse CSS|Error: Not implemented/.test(entry));
  if (realErrors.length) {
    failures.push({ name: 'no unexpected console errors', error: new Error(realErrors.join('\n')) });
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
