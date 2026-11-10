'use strict';

/**
 * Demo mode backend.
 *
 * A dependency-free in-process mock of the Full Product Management API that
 * mirrors its routes, status codes and JSON shapes (including a few quirks).
 * It lets the desktop app be opened and explored without running Express or
 * MongoDB — e.g. on a machine where the API is not installed yet.
 *
 * Data lives in <userData>/demo-db.json and can be reset from Settings.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEMO_EMAIL = 'demo@stockflow.app';
const DEMO_PASSWORD = 'demo1234';
const OWNER = 'demo-user-0000000000001';

let dbPath = null;
let db = null;

/* ------------------------------------------------------------------ utils */

const now = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const oid = () => crypto.randomBytes(12).toString('hex').slice(0, 24);
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function fail(status, message) {
  return { ok: false, status, data: { message }, ms: 1, url: 'mock://demo' };
}

function ok(status, data) {
  return { ok: status < 400, status, data, ms: 1, url: 'mock://demo' };
}

const PHONE_RE = /^(0[567]\d{8}|\+213[567]\d{7})$/;
const CITIES = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Tizi Ouzou', 'Béjaïa', 'Batna', 'Tlemcen'];

/* ------------------------------------------------------------------- seed */

function seed() {
  const catalogue = [
    { name: 'Casque Bluetooth Pro ANC', price: 18900, category: 'Electronics', stock: 24, lowStockThreshold: 6 },
    { name: 'Clavier mécanique TKL RGB', price: 12400, category: 'Electronics', stock: 11, lowStockThreshold: 6 },
    { name: 'Souris sans fil ergonomique', price: 4200, category: 'Electronics', stock: 48, lowStockThreshold: 10 },
    { name: 'Enceinte portable Waterproof', price: 8700, category: 'Electronics', stock: 0, lowStockThreshold: 6 },
    { name: 'Chargeur rapide 65W GaN', price: 5300, category: 'Electronics', stock: 5, lowStockThreshold: 8 },
    { name: 'Cafetière italienne inox 6T', price: 3600, category: 'Home', stock: 32, lowStockThreshold: 8 },
    { name: 'Set de couteaux céramique', price: 6900, category: 'Home', stock: 4, lowStockThreshold: 6 },
    { name: 'Lampe de bureau LED tactile', price: 3200, category: 'Home', stock: 61, lowStockThreshold: 10 },
    { name: 'Sac à dos urbain 25L', price: 7400, category: 'Fashion', stock: 17, lowStockThreshold: 5 },
    { name: 'Montre classique cuir', price: 15900, category: 'Fashion', stock: 9, lowStockThreshold: 4 },
    { name: 'Sneakers running AirFlow', price: 11200, category: 'Sports', stock: 21, lowStockThreshold: 6 },
    { name: 'Tapis de yoga antidérapant', price: 3900, category: 'Sports', stock: 0, lowStockThreshold: 5 },
    { name: 'Kit soin visage botanique', price: 5600, category: 'Beauty', stock: 27, lowStockThreshold: 8 },
    { name: 'Coffret parfum Oud 50ml', price: 9800, category: 'Beauty', stock: 6, lowStockThreshold: 7 },
    { name: 'Café en grains Éthiopie 1kg', price: 2850, category: 'Grocery', stock: 74, lowStockThreshold: 15 },
    { name: 'Huile d\'olive extra vierge 1L', price: 1650, category: 'Grocery', stock: 12, lowStockThreshold: 20 }
  ];

  const products = catalogue.map((item, index) => ({
    _id: oid(),
    name: item.name,
    price: item.price,
    category: item.category,
    stock: item.stock,
    lowStockThreshold: item.lowStockThreshold,
    owner: OWNER,
    image: null,
    createdAt: daysAgo(46 - index * 2),
    updatedAt: daysAgo(index % 7)
  }));

  const customers = [
    { name: 'Amine Belkacem', city: 'Alger', address: '12 rue Didouche Mourad', number: '0551234567' },
    { name: 'Lina Haddad', city: 'Oran', address: 'Cité 200 logements, Bt 4', number: '0661234987' },
    { name: 'Yacine Mansouri', city: 'Tizi Ouzou', address: 'Boulevard Stiti, n°8', number: '0771234561' },
    { name: 'Sara Boudjema', city: 'Constantine', address: 'Rue Larbi Ben M\'hidi 21', number: '0551239874' },
    { name: 'Mehdi Ould Ali', city: 'Annaba', address: 'Cours de la Révolution 5', number: '0771234588' },
    { name: 'Nadia Cherif', city: 'Blida', address: 'Lotissement Bouarfa, villa 12', number: '0661234523' },
    { name: 'Karim Ziani', city: 'Sétif', address: 'Cité Yahiaoui, Bt C', number: '0551234412' },
    { name: 'Imane Saidi', city: 'Béjaïa', address: 'Rue Fatah Boumzour 3', number: '0661234098' },
    { name: 'Riad Bouzid', city: 'Batna', address: 'Avenue de la Liberté 44', number: '0771234321' },
    { name: 'Assia Meliani', city: 'Tlemcen', address: 'Rue des Jardins 9', number: '0551234560' }
  ];

  const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'delivered', 'cancelled'];

  const orders = [];
  for (let index = 0; index < 22; index += 1) {
    const customer = customers[index % customers.length];
    const status = statuses[index % statuses.length];
    const productA = products[(index * 3) % products.length];
    const productB = products[(index * 5 + 2) % products.length];
    const items = [{ product: productA, quantity: 1 + (index % 2) }];
    if (index % 3 === 0 && productB._id !== productA._id) {
      items.push({ product: productB, quantity: 1 });
    }

    const productsPayload = items.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.product.price
    }));

    orders.push({
      _id: oid(),
      owner: OWNER,
      products: productsPayload,
      userInfo: {
        name: customer.name,
        number: customer.number,
        city: customer.city,
        address: customer.address,
        delivery: index % 2 === 0 ? 'Domicile' : 'Desk'
      },
      totalPrice: productsPayload.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status,
      createdAt: daysAgo(Math.floor((index / 22) * 27) + (index % 3)),
      updatedAt: daysAgo(Math.floor((index / 22) * 20)),
      __seed: true
    });
  }

  return {
    version: 1,
    users: [
      {
        _id: OWNER,
        name: 'Demo Manager',
        email: DEMO_EMAIL,
        password: sha256(DEMO_PASSWORD),
        createdAt: daysAgo(60)
      }
    ],
    products,
    orders,
    movements: [],
    createdAt: now().toISOString()
  };
}

/* --------------------------------------------------------------- storage */

function init(filePath) {
  dbPath = filePath;
  load();
  return db;
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (!raw || !Array.isArray(raw.products)) throw new Error('invalid');
    db = raw;
    if (!Array.isArray(db.users) || !db.users.length) db.users = seed().users;
    if (!Array.isArray(db.orders)) db.orders = [];
    if (!Array.isArray(db.movements)) db.movements = [];
  } catch (err) {
    db = seed();
    persist();
  }
  return db;
}

function persist() {
  if (!dbPath) return;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const tmp = `${dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, dbPath);
  } catch (err) {
    console.error('[mock] could not persist demo data:', err.message);
  }
}

function reset() {
  db = seed();
  persist();
  return { ok: true };
}

function state() {
  if (!db) load();
  return db;
}

/* ------------------------------------------------------------------ auth */

function signToken(user) {
  const payload = {
    userId: user._id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `mock.${body}.${sha256(`mock-secret:${body}`).slice(0, 32)}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3 || parts[0] !== 'mock') return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || !payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function routeRegister(body) {
  const data = body || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(400, 'Please provide a valid email address');
  }
  if (password.length < 6) return fail(400, 'Password must contain at least 6 characters');
  if (db.users.some((user) => user.email === email)) {
    return fail(400, 'this user allready exsit');
  }

  const user = {
    _id: oid(),
    name: name || email.split('@')[0],
    email,
    password: sha256(password),
    createdAt: now().toISOString()
  };
  db.users.push(user);
  persist();
  return ok(201, {
    message: 'the user has been successfull register',
    register: { name: user.name, email: user.email }
  });
}

function routeLogin(body) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  const user = db.users.find((item) => item.email === email);
  if (!user || user.password !== sha256(password)) {
    return fail(400, 'The email or Password is invalaid');
  }
  return ok(200, {
    message: 'the user has been successfull login',
    register: { name: user.name, email: user.email, token: signToken(user) }
  });
}

/* -------------------------------------------------------------- products */

function productFilter(query) {
  let results = db.products.slice();
  const search = query.search;
  const category = query.category;
  if (search) {
    const needle = String(search).toLowerCase();
    results = results.filter((product) => String(product.name).toLowerCase().includes(needle));
  }
  if (category) {
    const needle = String(category).toLowerCase();
    results = results.filter((product) => String(product.category || '').toLowerCase().includes(needle));
  }
  return results;
}

function sortCollection(items, sortField, fallback) {
  const field = ['name', 'price', 'createdAt', 'totalPrice'].includes(sortField) ? sortField : fallback;
  return items.sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (typeof left === 'number' && typeof right === 'number') return right - left;
    return String(right).localeCompare(String(left), 'fr');
  });
}

function routeProductsList(query) {
  const page = Number(query.page === undefined || query.page === null ? 1 : query.page);
  const limit = Number(query.limit === undefined || query.limit === null ? 12 : query.limit);
  if (!Number.isInteger(page) || page < 1) return fail(400, 'Page must be a positive integer');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400, 'Limit must be between 1 and 100');

  const filtered = sortCollection(productFilter(query), query.sort, 'createdAt');
  const total = filtered.length;
  const start = (page - 1) * limit;

  return ok(200, {
    products: clone(filtered.slice(start, start + limit)),
    pagnition: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}

function routeProductCreate(body, form, user) {
  const fields = (form && form.fields) || body || {};
  const name = String(fields.name || '').trim();
  const price = Number(fields.price);
  const category = fields.category ? String(fields.category).trim() : '';
  const stock = fields.stock === undefined ? 0 : Number(fields.stock);
  const lowStockThreshold = fields.lowStockThreshold === undefined ? 5 : Number(fields.lowStockThreshold);

  if (!name) return fail(400, 'should add the name');
  if (!Number.isFinite(price) || price <= 0) return fail(400, 'check your Price');
  if (!Number.isFinite(stock) || stock < 0) return fail(400, 'check your Stock');
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) return fail(400, 'check your low-stock threshold');

  const file = form && form.file;
  if (!file || !file.name) return fail(400, 'check your form ');
  if (db.products.some((product) => product.name.toLowerCase() === name.toLowerCase())) {
    return fail(400, 'exsit product ');
  }

  const product = {
    _id: oid(),
    name,
    price,
    category,
    stock,
    lowStockThreshold,
    owner: user.userId,
    image: file.name,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.products.push(product);
  persist();

  return ok(201, {
    product: {
      message: 'the product has been successfully created',
      Product: clone(product)
    }
  });
}

function routeProductUpdate(id, body, form) {
  const product = db.products.find((item) => item._id === id);
  if (!product) return fail(404, 'Any Product find it with this ID');

  const fields = (form && form.fields) || body || {};
  if (fields.name !== undefined && String(fields.name).trim()) product.name = String(fields.name).trim();
  if (fields.price !== undefined) {
    const price = Number(fields.price);
    if (!Number.isFinite(price) || price < 0) return fail(400, 'check your Price');
    product.price = price;
  }
  if (fields.category !== undefined) product.category = String(fields.category);
  if (form && form.file && form.file.name) product.image = form.file.name;
  product.updatedAt = now().toISOString();
  persist();

  return ok(200, {
    message: 'the prdouct was successfully updated',
    product: clone(product)
  });
}

function routeProductDelete(id) {
  const index = db.products.findIndex((item) => item._id === id);
  if (index === -1) return fail(404, 'The product is not found');
  db.products.splice(index, 1);
  persist();
  return ok(200, { message: 'the product is deleted' });
}

function routeProductAnalysis() {
  const totalProducts = db.products.length;
  const totalStock = db.products.reduce((sum, product) => sum + product.stock, 0);
  const totalstockValue = db.products.reduce((sum, product) => sum + product.stock * product.price, 0);
  return ok(200, {
    totalProducts,
    totalStock,
    totalstockValue,
    averagePrice: totalProducts ? totalstockValue / Math.max(totalStock, 1) : 0
  });
}

/* ------------------------------------------------------------- inventory */

function lowStockProducts() {
  return db.products.filter(
    (product) => product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5)
  );
}

function outOfStockProducts() {
  return db.products.filter((product) => product.stock === 0);
}

function routeStock(id, quantityRaw, direction, user) {
  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail(400, 'Quantity must be a positive integer');
  }
  const index = db.products.findIndex((product) => product._id === id);
  if (index === -1) return fail(404, 'Product not found');

  const product = db.products[index];
  if (direction === 'out' && product.stock < quantity) {
    return fail(409, 'Insufficient stock');
  }

  const stockBefore = product.stock;
  const stockAfter = direction === 'in' ? stockBefore + quantity : stockBefore - quantity;
  product.stock = stockAfter;
  product.updatedAt = now().toISOString();

  const movement = {
    _id: oid(),
    owner: user ? user.userId : OWNER,
    product: product._id,
    action: direction,
    quantity,
    stockBefore,
    stockAfter,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.movements.unshift(movement);
  db.movements = db.movements.slice(0, 300);
  persist();

  return ok(201, { new_Quantity: clone(movement) });
}

/* ---------------------------------------------------------------- orders */

function orderFilter(query) {
  let results = db.orders.slice();
  if (query.status) {
    results = results.filter((order) => order.status === query.status);
  }
  if (query.name) {
    const needle = String(query.name).toLowerCase();
    results = results.filter(
      (order) =>
        String(order.userInfo.name || '').toLowerCase().includes(needle) ||
        String(order.userInfo.city || '').toLowerCase().includes(needle)
    );
  }
  return results;
}

function routeOrdersList(query) {
  const page = Number(query.page === undefined || query.page === null ? 1 : query.page);
  const limit = Number(query.limit === undefined || query.limit === null ? 12 : query.limit);
  if (!Number.isInteger(page) || page < 1) return fail(400, 'the page number should be positive');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fail(400, 'the page number should be positive');
  }

  const filtered = sortCollection(orderFilter(query), query.sort, 'createdAt');
  const total = filtered.length;
  const start = (page - 1) * limit;
  const orders = clone(filtered.slice(start, start + limit));

  // The real API answers 404 when a page has no orders — mirror it so the
  // desktop client exercises the same code path.
  if (!orders.length) return fail(404, `find ${orders.length} order`);

  return ok(200, {
    Orders: {
      orders,
      pagnition: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  });
}

function routeOrderCreate(body, user) {
  const products = body && body.products;
  const userInfo = body && body.userInfo;

  if (!Array.isArray(products) || products.length === 0) return fail(400, 'Any Product selected');
  if (!userInfo) return fail(400, 'Please Complete your Form ');

  const ids = products.map((item) => String(item.product));
  if (new Set(ids).size !== ids.length) return fail(400, 'Duplicate products are not allowed');

  if (!PHONE_RE.test(String(userInfo.number || ''))) {
    return fail(400, 'Invalid Algerian phone number');
  }

  const found = [];
  for (const item of products) {
    const product = db.products.find((entry) => entry._id === String(item.product));
    if (!product) return fail(404, 'Product not found');
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return fail(400, 'Quantity must be a positive integer');
    }
    if (quantity > product.stock) return fail(400, `Insufficient stock for ${product.name}`);
    found.push({ product, quantity });
  }

  const totalPrice = found.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const payload = found.map((item) => ({
    product: item.product._id,
    quantity: item.quantity,
    price: item.product.price
  }));

  for (const item of found) {
    const stockBefore = item.product.stock;
    item.product.stock = stockBefore - item.quantity;
    item.product.updatedAt = now().toISOString();
    db.movements.unshift({
      _id: oid(),
      owner: user ? user.userId : OWNER,
      product: item.product._id,
      action: 'out',
      quantity: item.quantity,
      stockBefore,
      stockAfter: item.product.stock,
      createdAt: now().toISOString()
    });
  }

  const order = {
    _id: oid(),
    owner: user ? user.userId : OWNER,
    products: payload,
    userInfo: {
      name: String(userInfo.name || '').trim(),
      number: String(userInfo.number || '').trim(),
      city: String(userInfo.city || '').trim(),
      address: String(userInfo.address || '').trim(),
      delivery: userInfo.delivery === 'Desk' ? 'Desk' : 'Domicile'
    },
    totalPrice,
    status: 'pending',
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.orders.unshift(order);
  persist();

  return ok(201, { new_Order: clone(order) });
}

function routeOrderStatus(id, status) {
  const transitions = {
    pending: ['confirmed'],
    confirmed: ['shipped'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  };
  if (!Object.hasOwn(transitions, status)) return fail(400, 'Invalid order status');
  const order = db.orders.find((item) => item._id === id);
  if (!order) return fail(404, 'Order Not Found');
  if (!transitions[order.status].includes(status)) {
    return fail(409, `Cannot change order status from ${order.status} to ${status}`);
  }
  order.status = status;
  order.updatedAt = now().toISOString();
  persist();
  return ok(200, { message: 'the status has been updated', findOrderAndUpdateStatus: clone(order) });
}

function routeOrderCancel(id) {
  const order = db.orders.find((item) => item._id === id);
  if (!order) return fail(400, 'Order Not Found');
  if (order.status === 'cancelled') return fail(400, 'Order is already cancelled');
  if (['shipped', 'delivered'].includes(order.status)) {
    return fail(400, 'Cannot cancel an order that has already shipped');
  }
  if (!['pending', 'confirmed'].includes(order.status)) {
    return fail(400, 'Order cannot be cancelled');
  }

  for (const item of order.products) {
    const product = db.products.find((entry) => entry._id === item.product);
    if (!product) continue;
    const stockBefore = product.stock;
    product.stock = stockBefore + item.quantity;
    db.movements.unshift({
      _id: oid(),
      owner: order.owner,
      product: product._id,
      action: 'in',
      quantity: item.quantity,
      stockBefore,
      stockAfter: product.stock,
      createdAt: now().toISOString()
    });
  }

  order.status = 'cancelled';
  order.updatedAt = now().toISOString();
  persist();
  return ok(200, { message: 'the order has been cancelled', CancelOrder: clone(order) });
}

/* ---------------------------------------------------------------- router */

/**
 * @param {object} request { method, path, query, body, form, token }
 */
function handle(request) {
  state();
  const method = String((request && request.method) || 'GET').toUpperCase();
  const rawPath = String((request && request.path) || '/');
  const pathname = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const parts = pathname.split('/').filter(Boolean);
  const query = (request && request.query) || {};
  const body = (request && request.body) || {};
  const form = (request && request.form) || null;

  // Public routes
  if (method === 'POST' && pathname === '/auth/register') return routeRegister(body);
  if (method === 'POST' && pathname === '/auth/login') return routeLogin(body);

  // Everything else needs a token, exactly like AuthMiddleware
  const user = verifyToken((request && request.token) || '');
  if (!user) {
    return request && request.token
      ? fail(403, 'invalid token')
      : fail(401, 'verife your access');
  }

  if (parts[0] === 'api' && parts[1] === 'product') {
    if (parts.length === 2) {
      if (method === 'GET') return routeProductsList(query);
      if (method === 'POST') return routeProductCreate(body, form, user);
    }
    if (parts.length === 3 && parts[2] === 'analysis' && method === 'GET') {
      return routeProductAnalysis();
    }
    if (parts.length === 3) {
      const id = parts[2];
      if (method === 'PATCH') return routeProductUpdate(id, body, form);
      if (method === 'DELETE') return routeProductDelete(id);
      if (method === 'GET') {
        const product = db.products.find((item) => item._id === id);
        return product ? ok(200, { product: clone(product) }) : fail(404, 'Product not found');
      }
    }
  }

  if (parts[0] === 'api' && parts[1] === 'quantity') {
    if (method === 'POST' && parts[2] === 'stock-in' && parts[3]) {
      return routeStock(parts[3], (body && body.quantity), 'in', user);
    }
    if (method === 'POST' && parts[2] === 'stock-out' && parts[3]) {
      return routeStock(parts[3], (body && body.quantity), 'out', user);
    }
    if (method === 'GET' && parts[2] === 'low-stock') {
      return ok(200, { low_Quantity: clone(lowStockProducts()) });
    }
    if (method === 'GET' && parts[2] === 'out-stock') {
      return ok(200, { out_Quantity: clone(outOfStockProducts()) });
    }
  }

  if (parts[0] === 'api' && parts[1] === 'order') {
    if (method === 'POST' && parts.length === 2) return routeOrderCreate(body, user);
    if (method === 'GET' && parts.length === 2) return routeOrdersList(query);
    if (method === 'GET' && parts.length === 3) {
      const order = db.orders.find((item) => item._id === parts[2]);
      return order ? ok(200, { Order: clone(order) }) : fail(404, 'Order not Founded');
    }
    if (method === 'PATCH' && parts[2] === 'status' && parts[3]) {
      return routeOrderStatus(parts[3], body && body.status);
    }
    if (method === 'PATCH' && parts[2] === 'cancel-order' && parts[3]) {
      return routeOrderCancel(parts[3]);
    }
  }

  return fail(404, `Route not found: ${method} ${pathname}`);
}

module.exports = {
  init,
  handle,
  reset,
  state,
  load,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  CITIES
};
