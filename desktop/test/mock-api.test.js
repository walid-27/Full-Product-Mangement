'use strict';

/**
 * Contract tests for the demo backend (src/main/mock-api.js).
 * Plain Node, no Electron needed:  node test/mock-api.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mock = require('../src/main/mock-api');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-mock-'));
const dbFile = path.join(tmpDir, 'demo-db.json');
mock.init(dbFile);

let token = '';
let passed = 0;
const failures = [];

function call(method, apiPath, options) {
  const opts = options || {};
  return mock.handle({
    method,
    path: apiPath,
    query: opts.query,
    body: opts.body,
    form: opts.form,
    token: opts.token !== undefined ? opts.token : token
  });
}

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

const productForm = (fields, file) => ({
  fields,
  file: file === false ? undefined : file || { name: 'photo-123.jpg', type: 'image/jpeg', data: new Uint8Array([1, 2, 3]) }
});

(async () => {
  console.log('\nDemo API contract tests\n');

  await test('rejects unauthenticated product listing with 401', () => {
    const response = call('GET', '/api/product', { token: '' });
    assert.strictEqual(response.status, 401);
    assert.match(response.data.message, /Authentication required/);
    assert.strictEqual(response.data.code, 'AUTH_REQUIRED');
  });

  await test('rejects a bad token with 401', () => {
    const response = call('GET', '/api/product', { token: 'nope' });
    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.data.code, 'INVALID_TOKEN');
  });

  await test('rejects wrong credentials', () => {
    const response = call('POST', '/auth/login', { body: { email: mock.DEMO_EMAIL, password: 'wrong' }, token: '' });
    assert.strictEqual(response.status, 401);
    assert.match(response.data.message, /invalid/i);
    assert.strictEqual(response.data.code, 'INVALID_CREDENTIALS');
  });

  await test('logs the demo user in and returns a token', () => {
    const response = call('POST', '/auth/login', {
      body: { email: mock.DEMO_EMAIL, password: mock.DEMO_PASSWORD },
      token: ''
    });
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.register.token, 'expected a token');
    assert.strictEqual(response.data.register.email, mock.DEMO_EMAIL);
    token = response.data.register.token;
  });

  await test('lists products with pagination metadata', () => {
    const response = call('GET', '/api/product', { query: { page: 1, limit: 5 } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.products.length, 5);
    assert.strictEqual(response.data.pagnition.page, 1);
    assert.ok(response.data.pagnition.total >= 14);
    assert.strictEqual(response.data.pagnition.totalPages, Math.ceil(response.data.pagnition.total / 5));
  });

  await test('validates pagination limits like the real API', () => {
    assert.strictEqual(call('GET', '/api/product', { query: { limit: 500 } }).status, 400);
    assert.strictEqual(call('GET', '/api/product', { query: { page: 0 } }).status, 400);
  });

  await test('searches products by name', () => {
    const response = call('GET', '/api/product', { query: { search: 'casque' } });
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.products.length >= 1);
    assert.ok(response.data.products.every((product) => /casque/i.test(product.name)));
  });

  let created = null;

  await test('requires an image when creating a product', () => {
    const response = call('POST', '/api/product', {
      form: productForm({ name: 'Test widget', price: '500' }, false)
    });
    assert.strictEqual(response.status, 400);
  });

  await test('creates a product with stock 0 and the given image', () => {
    const response = call('POST', '/api/product', {
      form: productForm({ name: 'Test widget', price: '500', category: 'Testing' })
    });
    assert.strictEqual(response.status, 201);
    created = response.data.product.Product;
    assert.strictEqual(created.name, 'Test widget');
    assert.strictEqual(created.price, 500);
    assert.strictEqual(created.stock, 0);
    assert.strictEqual(created.image, 'photo-123.jpg');
  });

  await test('refuses duplicate product names', () => {
    const response = call('POST', '/api/product', {
      form: productForm({ name: 'Test widget', price: '900' })
    });
    assert.strictEqual(response.status, 409);
    assert.match(response.data.message, /already exists/i);
    assert.strictEqual(response.data.code, 'PRODUCT_EXISTS');
  });

  await test('stocks a product in and reports the movement', () => {
    const response = call('POST', `/api/quantity/stock-in/${created._id}`, { body: { quantity: 12 } });
    assert.strictEqual(response.status, 201);
    const movement = response.data.new_Quantity;
    assert.strictEqual(movement.action, 'in');
    assert.strictEqual(movement.stockBefore, 0);
    assert.strictEqual(movement.stockAfter, 12);
  });

  await test('rejects fractional or negative quantities', () => {
    assert.strictEqual(call('POST', `/api/quantity/stock-in/${created._id}`, { body: { quantity: 1.5 } }).status, 400);
    assert.strictEqual(call('POST', `/api/quantity/stock-in/${created._id}`, { body: { quantity: -3 } }).status, 400);
  });

  await test('stocks a product out and enforces available stock', () => {
    const ok = call('POST', `/api/quantity/stock-out/${created._id}`, { body: { quantity: 4 } });
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(ok.data.new_Quantity.stockAfter, 8);

    const tooMuch = call('POST', `/api/quantity/stock-out/${created._id}`, { body: { quantity: 99 } });
    assert.strictEqual(tooMuch.status, 409);
    assert.match(tooMuch.data.message, /Insufficient stock/);
  });

  await test('reports low-stock and out-of-stock lists', () => {
    const low = call('GET', '/api/quantity/low-stock');
    assert.strictEqual(low.status, 200);
    assert.ok(Array.isArray(low.data.low_Quantity));
    assert.ok(low.data.low_Quantity.every((product) => product.stock > 0 && product.stock <= product.lowStockThreshold));

    const out = call('GET', '/api/quantity/out-stock');
    assert.strictEqual(out.status, 200);
    assert.ok(out.data.out_Quantity.every((product) => product.stock === 0));
  });

  await test('rejects orders with an invalid Algerian phone number', () => {
    const response = call('POST', '/api/order', {
      body: {
        products: [{ product: created._id, quantity: 1 }],
        userInfo: { name: 'Test', number: '12345', city: 'Alger', address: 'Rue 1', delivery: 'Domicile' }
      }
    });
    assert.strictEqual(response.status, 422);
    assert.strictEqual(response.data.code, 'VALIDATION_ERROR');
    assert.match(JSON.stringify(response.data.details || []), /phone/i);
  });

  await test('rejects orders exceeding stock', () => {
    const response = call('POST', '/api/order', {
      body: {
        products: [{ product: created._id, quantity: 1000 }],
        userInfo: { name: 'Test', number: '0551234567', city: 'Alger', address: 'Rue 1', delivery: 'Domicile' }
      }
    });
    assert.strictEqual(response.status, 400);
    assert.match(response.data.message, /Insufficient stock/);
  });

  let order = null;

  await test('creates an order, prices it server-side and reserves stock', () => {
    const before = call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0].stock;
    const response = call('POST', '/api/order', {
      body: {
        products: [{ product: created._id, quantity: 2 }],
        userInfo: {
          name: 'Amine Test',
          number: '+21355123456',
          city: 'Tizi Ouzou',
          address: '12 rue des Oliviers',
          delivery: 'Desk'
        }
      }
    });
    assert.strictEqual(response.status, 201);
    order = response.data.new_Order;
    assert.strictEqual(order.status, 'pending');
    assert.strictEqual(order.totalPrice, 500 * 2);
    assert.strictEqual(order.products[0].price, 500);

    const after = call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0].stock;
    assert.strictEqual(after, before - 2);
  });

  await test('lists orders and filters by status', () => {
    const all = call('GET', '/api/order', { query: { page: 1, limit: 5 } });
    assert.strictEqual(all.status, 200);
    assert.ok(all.data.Orders.orders.length > 0);
    assert.ok(all.data.Orders.pagnition.total >= 20);

    const pending = call('GET', '/api/order', { query: { status: 'pending', limit: 50 } });
    assert.strictEqual(pending.status, 200);
    assert.ok(pending.data.Orders.orders.every((item) => item.status === 'pending'));
  });

  await test('answers 404 for an order page with no results (API quirk)', () => {
    const response = call('GET', '/api/order', { query: { name: 'zzz-no-such-customer' } });
    assert.strictEqual(response.status, 404);
  });

  await test('validates status transitions and updates them', () => {
    assert.strictEqual(call('PATCH', `/api/order/status/${order._id}`, { body: { status: 'bogus' } }).status, 422);

    const response = call('PATCH', `/api/order/status/${order._id}`, { body: { status: 'confirmed' } });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.findOrderAndUpdateStatus.status, 'confirmed');
  });

  await test('fetches a single order by id', () => {
    const response = call('GET', `/api/order/${order._id}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.Order._id, order._id);
  });

  await test('cancels an order and returns its stock', () => {
    const before = call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0].stock;
    const response = call('PATCH', `/api/order/cancel-order/${order._id}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.CancelOrder.status, 'cancelled');

    const after = call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0].stock;
    assert.strictEqual(after, before + 2);

    const again = call('PATCH', `/api/order/cancel-order/${order._id}`);
    assert.strictEqual(again.status, 400);
    assert.match(again.data.message, /already cancelled/);

    const reopened = call('PATCH', `/api/order/status/${order._id}`, { body: { status: 'confirmed' } });
    assert.strictEqual(reopened.status, 409);
    assert.strictEqual(call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0].stock, after);
  });

  await test('refuses to cancel a shipped order', () => {
    const shipped = call('GET', '/api/order', { query: { status: 'shipped', limit: 5 } }).data.Orders.orders[0];
    assert.ok(shipped, 'seed should contain a shipped order');
    const response = call('PATCH', `/api/order/cancel-order/${shipped._id}`);
    assert.strictEqual(response.status, 400);
    assert.match(response.data.message, /already shipped/);
  });

  await test('updates product fields and keeps stock untouched', () => {
    const before = call('GET', '/api/product', { query: { search: 'Test widget' } }).data.products[0];
    const response = call('PATCH', `/api/product/${created._id}`, {
      form: productForm({ name: 'Test widget v2', price: '750', category: 'Testing' }, false)
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.product.name, 'Test widget v2');
    assert.strictEqual(response.data.product.price, 750);
    assert.strictEqual(response.data.product.stock, before.stock);
  });

  await test('computes the product analysis aggregate', () => {
    const response = call('GET', '/api/product/analysis');
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.totalProducts > 0);
    assert.ok(response.data.totalstockValue > 0);
  });

  await test('deletes a product and 404s afterwards', () => {
    assert.strictEqual(call('DELETE', `/api/product/${created._id}`).status, 200);
    assert.strictEqual(call('DELETE', `/api/product/${created._id}`).status, 404);
  });

  await test('persists demo data to disk and reloads it', () => {
    const snapshot = mock.state();
    const productCount = snapshot.products.length;
    const orderCount = snapshot.orders.length;
    assert.ok(fs.existsSync(dbFile), 'demo db file should exist');

    mock.init(dbFile);
    const reloaded = mock.state();
    assert.strictEqual(reloaded.products.length, productCount);
    assert.strictEqual(reloaded.orders.length, orderCount);
  });

  await test('registers a new user and blocks duplicates', () => {
    const created2 = call('POST', '/auth/register', {
      body: { name: 'New Manager', email: 'new@stockflow.app', password: 'ManagerPass123' },
      token: ''
    });
    assert.strictEqual(created2.status, 201);
    assert.strictEqual(created2.data.register.email, 'new@stockflow.app');

    const duplicate = call('POST', '/auth/register', {
      body: { name: 'New Manager', email: 'new@stockflow.app', password: 'ManagerPass123' },
      token: ''
    });
    assert.strictEqual(duplicate.status, 409);
    assert.strictEqual(duplicate.data.code, 'USER_EXISTS');

    const shortPassword = call('POST', '/auth/register', {
      body: { name: 'X', email: 'x@stockflow.app', password: '123' },
      token: ''
    });
    assert.strictEqual(shortPassword.status, 422);
    assert.strictEqual(shortPassword.data.code, 'VALIDATION_ERROR');

    const login = call('POST', '/auth/login', { body: { email: 'new@stockflow.app', password: 'ManagerPass123' }, token: '' });
    assert.strictEqual(login.status, 200);
    assert.ok(login.data.register.token);
  });

  await test('serves dashboard aggregates under the /api/v1 aliases', () => {
    const products = call('GET', '/api/v1/dashboard/product');
    assert.strictEqual(products.status, 200);
    assert.ok(products.data.totalProduct > 0);
    assert.ok('totalStock' in products.data && 'totalPrices' in products.data);

    const orders = call('GET', '/api/v1/dashboard/order');
    assert.strictEqual(orders.status, 200);
    assert.ok(orders.data.totalOrder > 0);
    assert.ok('totalRevenue' in orders.data);
  });

  await test('serves feature reports, movements and global search', () => {
    const sales = call('GET', '/api/v1/features/reports/sales');
    assert.strictEqual(sales.status, 200);
    assert.ok(Array.isArray(sales.data));

    const movements = call('GET', '/api/v1/features/reports/movements', { query: { limit: 5 } });
    assert.strictEqual(movements.status, 200);
    assert.ok(Array.isArray(movements.data.movements));
    assert.ok(movements.data.pagination.total >= movements.data.movements.length);

    const search = call('GET', '/api/v1/search', { query: { q: 'casque' } });
    assert.strictEqual(search.status, 200);
    assert.ok(search.data.products.length >= 1);
    assert.ok(Array.isArray(search.data.orders));
  });

  await test('exports CSV and order documents as downloads', () => {
    const exported = call('GET', '/api/v1/features/export/products', { query: { format: 'csv' } });
    assert.strictEqual(exported.status, 200);
    assert.ok(exported.binary || exported.data, 'export returns a payload');

    const anyOrder = call('GET', '/api/order', { query: { limit: 1 } }).data.Orders.orders[0];
    const invoice = call('GET', `/api/v1/features/orders/${anyOrder._id}/documents/invoice`);
    assert.strictEqual(invoice.status, 200);

    const shipment = call('POST', `/api/v1/features/orders/${anyOrder._id}/shipment`, { body: {} });
    assert.strictEqual(shipment.status, 201);
    assert.ok(shipment.data.trackingId);
  });

  await test('imports products from CSV', () => {
    const csv = 'name,price,category\nImported Widget,750,Testing\n';
    const response = call('POST', '/api/v1/features/products/import', {
      form: { fields: {}, file: { name: 'products.csv', type: 'text/csv', data: new TextEncoder().encode(csv) } }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.imported, 1);
    const found = call('GET', '/api/product', { query: { search: 'Imported Widget' } });
    assert.strictEqual(found.data.products.length, 1);
  });

  await test('serves billing, API keys, webhooks and account data', () => {
    const usage = call('GET', '/api/billing/usage');
    assert.strictEqual(usage.status, 200);
    assert.ok('products' in usage.data && 'features' in usage.data);

    const checkout = call('POST', '/api/billing/checkout', { body: { plan: 'pro' } });
    assert.strictEqual(checkout.status, 201);
    assert.ok(checkout.data.checkoutUrl);

    const key = call('POST', '/api/api-keys', { body: { name: 'Test key', scopes: ['read'], rateLimitPerMinute: 60 } });
    assert.strictEqual(key.status, 201);
    assert.ok(key.data.key, 'raw key is shown once');
    const keys = call('GET', '/api/api-keys');
    assert.ok(keys.data.some((item) => item.name === 'Test key' && !item.key), 'listed keys hide the secret');

    const hook = call('POST', '/api/webhooks', { body: { url: 'https://example.com/hook', events: ['order.created'] } });
    assert.strictEqual(hook.status, 201);
    assert.ok(hook.data.secret, 'webhook secret is shown once');

    const onboarding = call('GET', '/api/account/onboarding');
    assert.strictEqual(onboarding.status, 200);
    assert.ok(Array.isArray(onboarding.data.checklist));

    const exported = call('GET', '/api/account/export');
    assert.strictEqual(exported.status, 200);
    assert.ok(exported.data.user && Array.isArray(exported.data.products));
  });

  await test('restores a soft-deleted product', () => {
    const created3 = call('POST', '/api/product', {
      form: productForm({ name: 'Restore widget', price: '300' })
    });
    assert.strictEqual(created3.status, 201);
    const id = created3.data.product.Product._id;
    assert.strictEqual(call('DELETE', `/api/product/${id}`).status, 200);
    assert.strictEqual(call('GET', '/api/product', { query: { search: 'Restore widget' } }).data.products.length, 0);
    assert.strictEqual(call('POST', `/api/product/${id}/restore`).status, 200);
    assert.strictEqual(call('GET', '/api/product', { query: { search: 'Restore widget' } }).data.products.length, 1);
  });

  await test('reset() restores the seeded workspace', () => {
    mock.reset();
    const products = call('GET', '/api/product', { query: { limit: 50, token } });
    assert.strictEqual(products.status, 200);
    assert.strictEqual(products.data.pagnition.total, 16);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const failure of failures) console.error(failure.error.stack);
    process.exit(1);
  }
})();
