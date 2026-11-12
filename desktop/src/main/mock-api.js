'use strict';

/**
 * Demo mode backend.
 *
 * A dependency-free in-process mock of the Full Product Management API that
 * mirrors its routes, status codes and JSON shapes. It lets the desktop app
 * be opened and explored without running Express or MongoDB — e.g. on a
 * machine where the API is not installed yet.
 *
 * Data lives in <userData>/demo-db.json and can be reset from Settings.
 *
 * Demo simplifications (documented, not bugs):
 * - Registered users are created already verified, so the demo never blocks
 *   on the real API's email-verification gate.
 * - Billing always reports the Business plan (all features unlocked).
 * - Sales / best-seller / stock reports use fixed sample aggregates.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEMO_EMAIL = 'demo@stockflow.app';
const DEMO_PASSWORD = 'demo1234';
const OWNER = 'demo-user-0000000000001';
const DEMO_ORG_ID = '507f1f77bcf86cd799439001';
const DEMO_ORG = { id: DEMO_ORG_ID, name: 'Demo Organization', slug: 'demo-organization', plan: 'business' };

let dbPath = null;
let db = null;

/* ------------------------------------------------------------------ utils */

const now = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const oid = () => crypto.randomBytes(12).toString('hex').slice(0, 24);
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function fail(status, message, code) {
  const data = { message };
  if (code) data.code = code;
  return { ok: false, status, data, ms: 1, url: 'mock://demo' };
}

function failValidation(details) {
  return {
    ok: false,
    status: 422,
    data: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
    ms: 1,
    url: 'mock://demo'
  };
}

function ok(status, data) {
  return { ok: status < 400, status, data, ms: 1, url: 'mock://demo' };
}

function binaryOk(buffer, contentType, filename) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer));
  return {
    ok: true,
    status: 200,
    data: { base64: bytes.toString('base64'), bytes: bytes.length, contentType, filename },
    ms: 1,
    url: 'mock://demo'
  };
}

const PHONE_RE = /^(0[567]\d{8}|\+213[567]\d{7})$/;
const CITIES = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif', 'Tizi Ouzou', 'Béjaïa', 'Batna', 'Tlemcen'];
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password1234', '12345678', '123456789',
  '1234567890', 'qwerty123', 'qwertyuiop', 'letmein123', 'welcome123', 'admin123',
  'iloveyou', 'abc123456', 'changeme123', 'dragon123', 'football1', 'monkey123'
]);

function passwordErrors(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 12) errors.push('at least 12 characters');
  if (typeof password === 'string' && password.length > 72) errors.push('at most 72 characters');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/\d/.test(password)) errors.push('a number');
  if (COMMON_PASSWORDS.has(String(password).toLowerCase())) errors.push('a password that is not commonly used');
  return errors;
}

function parseVariants(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch (err) {
      return undefined;
    }
  }
  return undefined;
}

function liveProducts() {
  return db.products.filter((product) => !product.deletedAt);
}

function liveOrders() {
  return db.orders.filter((order) => !order.deletedAt);
}

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
    costPrice: 0,
    category: item.category,
    sku: '',
    barcode: '',
    variants: [],
    stock: item.stock,
    lowStockThreshold: item.lowStockThreshold,
    organization: DEMO_ORG_ID,
    owner: OWNER,
    image: null,
    deletedAt: null,
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
      price: item.product.price,
      costPrice: item.product.costPrice || 0,
      variantSku: null
    }));

    orders.push({
      _id: oid(),
      organization: DEMO_ORG_ID,
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
      deletedAt: null,
      createdAt: daysAgo(Math.floor((index / 22) * 27) + (index % 3)),
      updatedAt: daysAgo(Math.floor((index / 22) * 20)),
      __seed: true
    });
  }

  return {
    version: 2,
    users: [
      {
        _id: OWNER,
        name: 'Demo Manager',
        email: DEMO_EMAIL,
        password: sha256(DEMO_PASSWORD),
        emailVerifiedAt: daysAgo(60),
        notifications: { lowStockEmail: true, customerOrderEmails: true, lowStockChannel: 'none', destination: null },
        createdAt: daysAgo(60)
      }
    ],
    products,
    orders,
    movements: [],
    apiKeys: [],
    webhooks: [],
    invoices: [],
    auditLogs: [],
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
    if (!Array.isArray(db.apiKeys)) db.apiKeys = [];
    if (!Array.isArray(db.webhooks)) db.webhooks = [];
    if (!Array.isArray(db.invoices)) db.invoices = [];
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    for (const product of db.products) {
      if (product.deletedAt === undefined) product.deletedAt = null;
      if (!Array.isArray(product.variants)) product.variants = [];
      if (product.costPrice === undefined) product.costPrice = 0;
      if (!product.organization) product.organization = DEMO_ORG_ID;
    }
    for (const order of db.orders) {
      if (order.deletedAt === undefined) order.deletedAt = null;
      if (!order.organization) order.organization = DEMO_ORG_ID;
    }
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
    orgId: DEMO_ORG_ID,
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

function authPayload(user) {
  return {
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    organization: { ...DEMO_ORG },
    token: signToken(user)
  };
}

function routeRegister(body) {
  const data = body || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');

  if (!name || name.length < 2 || name.length > 100) {
    return failValidation([{ path: 'name', message: 'String must contain at least 2 character(s)' }]);
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return failValidation([{ path: 'email', message: 'Invalid email' }]);
  }
  const weak = passwordErrors(password);
  if (weak.length) {
    return failValidation([{ path: 'password', message: `Password must have ${weak.join(', ')}` }]);
  }
  if (db.users.some((user) => user.email === email)) {
    return fail(409, 'Unable to register with these details', 'USER_EXISTS');
  }

  const user = {
    _id: oid(),
    name,
    email,
    password: sha256(password),
    // Demo simplification: accounts start verified so the demo never blocks
    // on the real API's email-verification gate.
    emailVerifiedAt: now().toISOString(),
    notifications: { lowStockEmail: true, customerOrderEmails: true, lowStockChannel: 'none', destination: null },
    createdAt: now().toISOString()
  };
  db.users.push(user);
  persist();
  return ok(201, {
    message: 'Registration successful; verify your email',
    register: authPayload(user)
  });
}

function routeLogin(body) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  const password = String((body && body.password) || '');
  const user = db.users.find((item) => item.email === email);
  if (!user || user.password !== sha256(password)) {
    return fail(401, 'The email or password is invalid', 'INVALID_CREDENTIALS');
  }
  return ok(200, {
    message: 'Login successful',
    register: authPayload(user)
  });
}

function routeVerifyEmail(body) {
  const token = String((body && body.token) || '');
  if (token.length < 20 || token.length > 4096) {
    return failValidation([{ path: 'token', message: 'String must contain at least 20 character(s)' }]);
  }
  return ok(200, { message: 'Email verified' });
}

function routeResendVerification() {
  return ok(202, { message: 'If verification is required, an email has been sent' });
}

function routeForgotPassword(body) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return failValidation([{ path: 'email', message: 'Invalid email' }]);
  }
  return ok(202, { message: 'If the account exists, a reset email has been sent' });
}

function routeResetPassword(body) {
  const token = String((body && body.token) || '');
  const password = String((body && body.password) || '');
  if (token.length < 20 || token.length > 4096) {
    return failValidation([{ path: 'token', message: 'String must contain at least 20 character(s)' }]);
  }
  const weak = passwordErrors(password);
  if (weak.length) {
    return failValidation([{ path: 'password', message: `Password must have ${weak.join(', ')}` }]);
  }
  return ok(200, { message: 'Password reset successful' });
}

function routeRefresh(user) {
  const found = (user && db.users.find((item) => item._id === user.userId)) || db.users[0];
  if (!found) return fail(401, 'Invalid refresh token', 'INVALID_REFRESH');
  return ok(200, {
    message: 'Token refreshed',
    register: authPayload(found)
  });
}

/* -------------------------------------------------------------- products */

function productFilter(query) {
  let results = liveProducts().slice();
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
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400, 'Limit must be between 1 and 50');

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
  const variants = parseVariants(fields.variants);
  const stock = variants && variants.length
    ? variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0)
    : (fields.stock === undefined || fields.stock === '' ? 0 : Number(fields.stock));
  const lowStockThreshold = fields.lowStockThreshold === undefined || fields.lowStockThreshold === ''
    ? 5
    : Number(fields.lowStockThreshold);
  const costPrice = fields.costPrice === undefined || fields.costPrice === '' ? 0 : Number(fields.costPrice);

  if (!name || name.length < 3 || name.length > 200) {
    return failValidation([{ path: 'name', message: 'String must contain at least 3 character(s)' }]);
  }
  if (!Number.isFinite(price) || price <= 0) {
    return failValidation([{ path: 'price', message: 'Number must be greater than 0' }]);
  }
  if (!Number.isFinite(stock) || stock < 0) return fail(400, 'check your Stock');
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) return fail(400, 'check your low-stock threshold');
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    return failValidation([{ path: 'costPrice', message: 'Number must be greater than or equal to 0' }]);
  }

  const file = form && form.file;
  if (!file || !file.name) return fail(400, 'check your form ');
  if (liveProducts().some((product) => product.name === name)) {
    return fail(409, 'Product already exists', 'PRODUCT_EXISTS');
  }

  const product = {
    _id: oid(),
    name,
    price,
    costPrice,
    category,
    sku: fields.sku ? String(fields.sku).trim() : '',
    barcode: fields.barcode ? String(fields.barcode).trim() : '',
    variants: variants || [],
    stock,
    lowStockThreshold,
    organization: DEMO_ORG_ID,
    owner: user ? user.userId : OWNER,
    image: file.name,
    deletedAt: null,
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
  const product = liveProducts().find((item) => item._id === id);
  if (!product) return fail(404, 'Product not found', 'PRODUCT_NOT_FOUND');

  const fields = (form && form.fields) || body || {};
  if (fields.name !== undefined && String(fields.name).trim()) {
    const name = String(fields.name).trim();
    if (name.length < 3) return failValidation([{ path: 'name', message: 'String must contain at least 3 character(s)' }]);
    product.name = name;
  }
  if (fields.price !== undefined) {
    const price = Number(fields.price);
    if (!Number.isFinite(price) || price <= 0) {
      return failValidation([{ path: 'price', message: 'Number must be greater than 0' }]);
    }
    product.price = price;
  }
  if (fields.costPrice !== undefined && fields.costPrice !== '') {
    const costPrice = Number(fields.costPrice);
    if (!Number.isFinite(costPrice) || costPrice < 0) return fail(400, 'check your Cost price');
    product.costPrice = costPrice;
  }
  if (fields.category !== undefined) product.category = String(fields.category);
  if (fields.sku !== undefined) product.sku = String(fields.sku).trim();
  if (fields.barcode !== undefined) product.barcode = String(fields.barcode).trim();
  if (fields.lowStockThreshold !== undefined && fields.lowStockThreshold !== '') {
    product.lowStockThreshold = Number(fields.lowStockThreshold);
  }
  const variants = parseVariants(fields.variants);
  if (variants !== undefined) {
    product.variants = variants;
    product.stock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
  }
  if (form && form.file && form.file.name) product.image = form.file.name;
  product.updatedAt = now().toISOString();
  persist();

  return ok(200, {
    message: 'the prdouct was successfully updated',
    product: clone(product)
  });
}

function routeProductDelete(id) {
  const product = liveProducts().find((item) => item._id === id);
  if (!product) return fail(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  product.deletedAt = now().toISOString();
  product.updatedAt = now().toISOString();
  persist();
  return ok(200, { message: 'the product is deleted' });
}

function routeProductRestore(id) {
  const product = db.products.find((item) => item._id === id && item.deletedAt);
  if (!product) return fail(404, 'Deleted product not found', 'PRODUCT_NOT_FOUND');
  product.deletedAt = null;
  product.updatedAt = now().toISOString();
  persist();
  return ok(200, clone(product));
}

function routeProductAnalysis() {
  const live = liveProducts();
  const totalProducts = live.length;
  const totalStock = live.reduce((sum, product) => sum + product.stock, 0);
  const totalstockValue = live.reduce((sum, product) => sum + product.stock * product.price, 0);
  return ok(200, {
    totalProducts,
    totalStock,
    totalstockValue,
    averagePrice: totalProducts ? totalstockValue / Math.max(totalStock, 1) : 0
  });
}

/* ------------------------------------------------------------- inventory */

function lowStockProducts() {
  return liveProducts().filter(
    (product) => product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 5)
  );
}

function outOfStockProducts() {
  return liveProducts().filter((product) => product.stock === 0);
}

function routeStock(id, quantityRaw, direction, user, variantSku) {
  const quantity = Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail(400, 'Quantity must be a positive integer');
  }
  const product = liveProducts().find((entry) => entry._id === id);
  if (!product) return fail(404, 'Product not found', 'PRODUCT_NOT_FOUND');

  let variant = null;
  if (variantSku) {
    variant = (product.variants || []).find((item) => item.sku === variantSku);
    if (!variant) return fail(404, 'Variant not found', 'VARIANT_NOT_FOUND');
    if (direction === 'out' && variant.stock < quantity) return fail(409, 'Insufficient stock', 'INSUFFICIENT_STOCK');
  } else if (direction === 'out' && product.stock < quantity) {
    return fail(409, 'Insufficient stock', 'INSUFFICIENT_STOCK');
  }

  const stockBefore = product.stock;
  if (variant) variant.stock += direction === 'in' ? quantity : -quantity;
  product.stock = direction === 'in' ? stockBefore + quantity : stockBefore - quantity;
  product.updatedAt = now().toISOString();

  const movement = {
    _id: oid(),
    organization: DEMO_ORG_ID,
    owner: user ? user.userId : OWNER,
    product: product._id,
    action: direction,
    quantity,
    variantSku: variantSku || null,
    stockBefore,
    stockAfter: product.stock,
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
  let results = liveOrders().slice();
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
    return fail(400, 'the limit must be between 1 and 100');
  }

  const filtered = sortCollection(orderFilter(query), query.sort, 'createdAt');
  const total = filtered.length;
  const start = (page - 1) * limit;
  const orders = clone(filtered.slice(start, start + limit));

  // The real API answers 404 when a page has no orders — mirror it so the
  // desktop client exercises the same code path.
  if (!orders.length) return fail(404, 'find 0 order');

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

  const details = [];
  if (!String(userInfo.name || '').trim()) details.push({ path: 'userInfo.name', message: 'Required' });
  if (!PHONE_RE.test(String(userInfo.number || ''))) {
    details.push({ path: 'userInfo.number', message: 'Invalid Algerian phone number' });
  }
  if (!String(userInfo.city || '').trim()) details.push({ path: 'userInfo.city', message: 'Required' });
  if (!String(userInfo.address || '').trim()) details.push({ path: 'userInfo.address', message: 'Required' });
  if (!['Domicile', 'Desk'].includes(userInfo.delivery)) {
    details.push({ path: 'userInfo.delivery', message: 'Invalid delivery type' });
  }
  if (details.length) return failValidation(details);

  const lines = products.map((item) => `${item.product}:${item.variantSku || ''}`);
  if (new Set(lines).size !== lines.length) {
    return fail(400, 'Duplicate product/variant lines are not allowed');
  }

  const found = [];
  for (const item of products) {
    const product = liveProducts().find((entry) => entry._id === String(item.product));
    if (!product) return fail(404, 'One or more products were not found', 'PRODUCT_NOT_FOUND');
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return fail(400, 'Quantity must be a positive integer');
    }
    let available = product.stock;
    if (item.variantSku) {
      const variant = (product.variants || []).find((entry) => entry.sku === item.variantSku);
      if (!variant) return fail(404, 'Variant not found', 'VARIANT_NOT_FOUND');
      available = variant.stock;
    }
    if (quantity > available) return fail(400, `Insufficient stock for ${product.name}`);
    found.push({ product, quantity, variantSku: item.variantSku || null });
  }

  const totalPrice = found.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const payload = found.map((item) => ({
    product: item.product._id,
    quantity: item.quantity,
    price: item.product.price,
    costPrice: item.product.costPrice || 0,
    variantSku: item.variantSku
  }));

  for (const item of found) {
    const stockBefore = item.product.stock;
    if (item.variantSku) {
      const variant = item.product.variants.find((entry) => entry.sku === item.variantSku);
      if (variant) variant.stock -= item.quantity;
    }
    item.product.stock = stockBefore - item.quantity;
    item.product.updatedAt = now().toISOString();
    db.movements.unshift({
      _id: oid(),
      organization: DEMO_ORG_ID,
      owner: user ? user.userId : OWNER,
      product: item.product._id,
      action: 'out',
      quantity: item.quantity,
      variantSku: item.variantSku,
      stockBefore,
      stockAfter: item.product.stock,
      createdAt: now().toISOString()
    });
  }

  const order = {
    _id: oid(),
    organization: DEMO_ORG_ID,
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
    deletedAt: null,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.orders.unshift(order);
  persist();

  return ok(201, { new_Order: clone(order) });
}

const ORDER_STATUSES = ['cancelled', 'delivered', 'confirmed', 'pending', 'shipped'];

function routeOrderStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) {
    return failValidation([{ path: 'status', message: 'Invalid order status' }]);
  }
  const transitions = {
    pending: ['confirmed'],
    confirmed: ['shipped'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  };
  const order = liveOrders().find((item) => item._id === id);
  if (!order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (!transitions[order.status].includes(status)) {
    return fail(409, `Cannot change order status from ${order.status} to ${status}`);
  }
  order.status = status;
  order.updatedAt = now().toISOString();
  persist();
  return ok(200, { message: 'the status has been updated', findOrderAndUpdateStatus: clone(order) });
}

function routeOrderCancel(id) {
  const order = liveOrders().find((item) => item._id === id);
  if (!order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND');
  if (order.status === 'cancelled') return fail(400, 'Order is already cancelled');
  if (['shipped', 'delivered'].includes(order.status)) {
    return fail(400, 'Cannot cancel an order that has already shipped');
  }
  if (!['pending', 'confirmed'].includes(order.status)) {
    return fail(400, 'Order cannot be cancelled');
  }

  for (const item of order.products) {
    const product = liveProducts().find((entry) => entry._id === item.product);
    if (!product) continue;
    const stockBefore = product.stock;
    if (item.variantSku) {
      const variant = (product.variants || []).find((entry) => entry.sku === item.variantSku);
      if (variant) variant.stock += item.quantity;
    }
    product.stock = stockBefore + item.quantity;
    db.movements.unshift({
      _id: oid(),
      organization: DEMO_ORG_ID,
      owner: order.owner,
      product: product._id,
      action: 'in',
      quantity: item.quantity,
      variantSku: item.variantSku || null,
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

function routeOrderDelete(id) {
  const order = liveOrders().find((item) => item._id === id);
  if (!order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND');
  order.deletedAt = now().toISOString();
  order.updatedAt = now().toISOString();
  persist();
  return ok(200, clone(order));
}

function routeOrderRestore(id) {
  const order = db.orders.find((item) => item._id === id && item.deletedAt);
  if (!order) return fail(404, 'Deleted order not found', 'ORDER_NOT_FOUND');
  order.deletedAt = null;
  order.updatedAt = now().toISOString();
  persist();
  return ok(200, clone(order));
}

/* ----------------------------------------------------------- dashboard */

function routeDashboardProduct(query) {
  // Mirrors Dashboard.Service (no deletedAt filter, optional 30d window).
  let pool = db.products.slice();
  if (query.date) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    pool = pool.filter((product) => new Date(product.createdAt).getTime() >= cutoff);
  }
  if (!pool.length) {
    return ok(200, { totalProduct: 0, totalStock: 0, totalPrices: 0, outOfStock: 0 });
  }
  return ok(200, {
    totalProduct: pool.length,
    totalStock: pool.reduce((sum, product) => sum + (Number(product.stock) || 0), 0),
    totalPrices: pool.reduce((sum, product) => sum + (Number(product.price) || 0) * (Number(product.stock) || 0), 0),
    outOfStock: pool.filter((product) => Number(product.stock) === 0).length
  });
}

function routeDashboardOrder(query) {
  let pool = db.orders.slice();
  if (query.period === '30d') {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    pool = pool.filter((order) => new Date(order.createdAt).getTime() >= cutoff);
  }
  if (!pool.length) {
    return ok(200, {
      totalOrder: 0, pendingOrder: 0, canceledOrder: 0, shippedOrder: 0,
      deliveredOrder: 0, cancelledOrder: 0, totalRevenue: 0
    });
  }
  const count = (status) => pool.filter((order) => order.status === status).length;
  return ok(200, {
    totalOrder: pool.length,
    pendingOrder: count('pending'),
    confirmedOrder: count('confirmed'),
    shippedOrder: count('shipped'),
    deliveredOrder: count('delivered'),
    cancelledOrder: count('cancelled'),
    totalRevenue: pool
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0)
  });
}

/* -------------------------------------------------------- organizations */

function routeOrgSwitch(body, user) {
  const organizationId = String((body && body.organizationId) || '');
  if (!/^[a-f\d]{24}$/i.test(organizationId)) {
    return failValidation([{ path: 'organizationId', message: 'Invalid resource identifier' }]);
  }
  if (organizationId !== DEMO_ORG_ID) {
    return fail(403, 'You do not have access to this organization', 'ORGANIZATION_FORBIDDEN');
  }
  const found = (user && db.users.find((item) => item._id === user.userId)) || db.users[0];
  return ok(200, {
    token: signToken(found),
    organization: { _id: DEMO_ORG_ID, name: DEMO_ORG.name, slug: DEMO_ORG.slug, plan: 'business', status: 'active' }
  });
}

function routeOrgInvite(body) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  const role = String((body && body.role) || '');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return failValidation([{ path: 'email', message: 'Invalid email' }]);
  }
  if (!['owner', 'admin', 'staff', 'viewer'].includes(role)) {
    return failValidation([{ path: 'role', message: 'Invalid role' }]);
  }
  const invitation = { id: oid(), email, role, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  return ok(201, { invitation, token: `demo-invite-${oid()}${oid()}` });
}

function routeOrgAccept(body) {
  const token = String((body && body.token) || '');
  if (token.length < 20 || token.length > 4096) {
    return failValidation([{ path: 'token', message: 'String must contain at least 20 character(s)' }]);
  }
  return ok(200, { organization: DEMO_ORG_ID, role: 'staff' });
}

function routeOrgChangeRole(id, body) {
  const role = String((body && body.role) || '');
  if (!['owner', 'admin', 'staff', 'viewer'].includes(role)) {
    return failValidation([{ path: 'role', message: 'Invalid role' }]);
  }
  return ok(200, { _id: id, role, user: { name: 'Demo Manager', email: DEMO_EMAIL } });
}

function routeAuditLogs(query) {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 25), 100);
  const logs = db.auditLogs.slice();
  return ok(200, { logs: clone(logs.slice((page - 1) * limit, page * limit)), pagination: { page, limit, total: logs.length, totalPages: Math.ceil(logs.length / limit) || 0 } });
}

/* --------------------------------------------------------------- billing */

function demoSubscription() {
  return {
    _id: oid(),
    organization: DEMO_ORG_ID,
    plan: 'business',
    status: 'active',
    trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    gracePeriodEndsAt: null,
    cancelAtPeriodEnd: false,
    providerCustomerId: null,
    providerCheckoutId: null,
    createdAt: daysAgo(60),
    updatedAt: now().toISOString()
  };
}

function routeBillingUsage() {
  const month = now().toISOString().slice(0, 7);
  return ok(200, {
    plan: 'business',
    status: 'active',
    month,
    products: { used: liveProducts().length, limit: null },
    orders: { used: liveOrders().length, limit: null },
    teamMembers: { used: 1, limit: null },
    features: { apiAccess: true, csvExport: true, reports: true }
  });
}

function routeBillingCheckout(body) {
  const plan = String((body && body.plan) || '');
  if (!['pro', 'business'].includes(plan)) {
    return failValidation([{ path: 'plan', message: 'Invalid plan' }]);
  }
  return ok(201, { checkoutId: `demo-checkout-${oid()}`, checkoutUrl: 'https://demo.stockflow.app/checkout' });
}

function routeBillingInvoices(query) {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 20), 100);
  const invoices = db.invoices.slice();
  return ok(200, { invoices: clone(invoices.slice((page - 1) * limit, page * limit)), pagination: { page, limit, total: invoices.length, totalPages: Math.ceil(invoices.length / limit) || 0 } });
}

/* --------------------------------------------------------------- features */

function routeMovements(query) {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 25), 100);
  let movements = db.movements.slice();
  if (query.product) movements = movements.filter((item) => String(item.product) === String(query.product));
  if (query.action) movements = movements.filter((item) => item.action === query.action);
  const enriched = movements.map((item) => {
    const product = db.products.find((entry) => entry._id === item.product);
    return { ...clone(item), productName: product ? product.name : 'Product' };
  });
  return ok(200, {
    movements: enriched.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: enriched.length, totalPages: Math.ceil(enriched.length / limit) || 0 }
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [keys.join(','), ...rows.map((row) => keys.map((key) => escape(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key])).join(','))].join('\n');
}

function routeExport(type, query) {
  const format = query.format === 'xlsx' ? 'xlsx' : 'csv';
  let rows = [];
  if (type === 'products') rows = liveProducts();
  else if (type === 'orders') rows = liveOrders();
  else if (type === 'movements') rows = db.movements;
  else return fail(400, 'Unsupported export type');
  const body = toCsv(clone(rows));
  const contentType = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
  return binaryOk(body, contentType, `${type}.${format}`);
}

function routeImport(form) {
  const file = form && form.file;
  if (!file || !file.data) return fail(400, 'Upload one CSV file in the file field', 'CSV_FILE_REQUIRED');
  let text = '';
  try {
    text = Buffer.from(file.data).toString('utf8');
  } catch (err) {
    text = String(file.data || '');
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return ok(200, { imported: 0, failed: 0, results: [] });
  const headers = lines[0].split(',').map((header) => header.trim());
  const results = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(',').map((cell) => cell.trim());
    const row = Object.fromEntries(headers.map((header, i) => [header, cells[i] || '']));
    const name = String(row.name || '').trim();
    const price = Number(row.price);
    if (!name || name.length < 3) {
      results.push({ row: index + 1, success: false, errors: ['Name must contain at least 3 characters'] });
      continue;
    }
    if (!Number.isFinite(price) || price <= 0) {
      results.push({ row: index + 1, success: false, errors: ['Price must be greater than 0'] });
      continue;
    }
    if (liveProducts().some((product) => product.name === name)) {
      results.push({ row: index + 1, success: false, errors: ['Product already exists'] });
      continue;
    }
    const product = {
      _id: oid(),
      name,
      price,
      costPrice: Number(row.costPrice || 0),
      category: String(row.category || ''),
      sku: String(row.sku || ''),
      barcode: String(row.barcode || ''),
      variants: [],
      stock: Number(row.stock || 0),
      lowStockThreshold: Number(row.lowStockThreshold || 5),
      organization: DEMO_ORG_ID,
      owner: OWNER,
      image: null,
      deletedAt: null,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    };
    db.products.push(product);
    results.push({ row: index + 1, success: true, id: product._id });
  }
  persist();
  return ok(200, {
    imported: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success).length,
    results
  });
}

function routeOrderDocument(id, type) {
  const order = liveOrders().find((item) => item._id === id);
  if (!order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND');
  const lines = [
    '%PDF-1.4',
    `% ${type === 'label' ? 'Delivery label' : `Invoice ${order._id}`}`,
    `% Customer: ${order.userInfo.name}`,
    `% Phone: ${order.userInfo.number}`,
    `% Total: ${order.totalPrice} DZD`,
    '%%EOF'
  ].join('\n');
  return binaryOk(lines, 'application/pdf', `${type}-${id}.pdf`);
}

function routeShipment(id) {
  const order = liveOrders().find((item) => item._id === id);
  if (!order) return fail(404, 'Order not found', 'ORDER_NOT_FOUND');
  return ok(201, { provider: 'local', trackingId: `LOCAL-${id}`, deliveryType: order.userInfo.delivery, status: 'pending' });
}

/* -------------------------------------------------------------- api keys */

function routeApiKeyCreate(body) {
  const name = String((body && body.name) || '').trim();
  const scopes = (body && body.scopes) || [];
  if (!name || name.length < 2) return failValidation([{ path: 'name', message: 'String must contain at least 2 character(s)' }]);
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => !['read', 'write'].includes(scope))) {
    return failValidation([{ path: 'scopes', message: 'Invalid scopes' }]);
  }
  const raw = `sk_${crypto.randomBytes(32).toString('base64url')}`;
  const key = {
    _id: oid(),
    organization: DEMO_ORG_ID,
    name,
    prefix: raw.slice(0, 12),
    scopes,
    rateLimitPerMinute: Number((body && body.rateLimitPerMinute) || 60),
    revokedAt: null,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.apiKeys.push(key);
  persist();
  return ok(201, { id: key._id, name: key.name, key: raw, scopes: key.scopes });
}

function routeApiKeyRevoke(id) {
  const key = db.apiKeys.find((item) => item._id === id && !item.revokedAt);
  if (!key) return fail(404, 'API key not found', 'API_KEY_NOT_FOUND');
  key.revokedAt = now().toISOString();
  persist();
  return ok(200, clone(key));
}

/* --------------------------------------------------------------- webhooks */

function routeWebhookCreate(body) {
  const url = String((body && body.url) || '').trim();
  const events = (body && body.events) || [];
  if (!/^https:\/\//.test(url)) return failValidation([{ path: 'url', message: 'URL must start with https://' }]);
  if (!Array.isArray(events) || !events.length || events.some((event) => !['order.created', 'stock.low'].includes(event))) {
    return failValidation([{ path: 'events', message: 'Invalid events' }]);
  }
  const hook = {
    _id: oid(),
    organization: DEMO_ORG_ID,
    url,
    events,
    active: true,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.webhooks.push(hook);
  persist();
  return ok(201, { id: hook._id, url: hook.url, events: hook.events, secret: `whsec_${crypto.randomBytes(32).toString('base64url')}` });
}

function routeWebhookRemove(id) {
  const index = db.webhooks.findIndex((item) => item._id === id);
  if (index === -1) return fail(404, 'Webhook not found');
  const [removed] = db.webhooks.splice(index, 1);
  persist();
  return ok(200, clone(removed));
}

/* ---------------------------------------------------------------- account */

function routeOnboarding() {
  return ok(200, {
    checklist: [
      { step: 'organization', complete: true },
      { step: 'first-product', complete: liveProducts().length > 0 },
      { step: 'team', complete: true }
    ]
  });
}

function routeNotifications(body, user) {
  const found = (user && db.users.find((item) => item._id === user.userId)) || db.users[0];
  if (!found) return fail(404, 'User not found', 'USER_NOT_FOUND');
  if (!found.notifications) {
    found.notifications = { lowStockEmail: true, customerOrderEmails: true, lowStockChannel: 'none', destination: null };
  }
  const channel = body && body.lowStockChannel;
  const destination = body && body.destination;
  if ((channel === 'whatsapp' || channel === 'sms') && !destination) {
    return failValidation([{ path: 'destination', message: 'A destination is required for SMS or WhatsApp' }]);
  }
  for (const key of ['lowStockEmail', 'customerOrderEmails', 'lowStockChannel', 'destination']) {
    if (body && body[key] !== undefined) found.notifications[key] = body[key];
  }
  persist();
  return ok(200, clone(found.notifications));
}

function routeAccountExport(user, binary) {
  const found = (user && db.users.find((item) => item._id === user.userId)) || db.users[0];
  const payload = {
    exportedAt: now().toISOString(),
    user: found ? { _id: found._id, name: found.name, email: found.email } : null,
    memberships: [{ organization: DEMO_ORG_ID, role: 'owner', status: 'active' }],
    products: clone(db.products),
    orders: clone(db.orders),
    movements: clone(db.movements),
    auditLogs: clone(db.auditLogs)
  };
  if (binary) return binaryOk(JSON.stringify(payload, null, 2), 'application/json', 'account-export.json');
  return ok(200, payload);
}

/* ----------------------------------------------------------------- search */

function routeSearch(query) {
  const q = String((query && query.q) || '').trim();
  if (!q || q.length > 200) {
    return failValidation([{ path: 'q', message: 'String must contain at least 1 character(s)' }]);
  }
  const limit = Math.min(Number(query.limit || 20), 50);
  const needle = q.toLowerCase();
  const products = liveProducts()
    .filter((product) =>
      String(product.name || '').toLowerCase().includes(needle) ||
      String(product.category || '').toLowerCase().includes(needle) ||
      String(product.sku || '').toLowerCase().includes(needle) ||
      String(product.barcode || '').toLowerCase().includes(needle))
    .slice(0, limit);
  const orders = liveOrders()
    .filter((order) =>
      String(order.userInfo.name || '').toLowerCase().includes(needle) ||
      String(order.userInfo.city || '').toLowerCase().includes(needle))
    .slice(0, limit);
  return ok(200, { products: clone(products), orders: clone(orders) });
}

/* ---------------------------------------------------------------- router */

/**
 * @param {object} request { method, path, query, body, form, token, binary }
 */
function handle(request) {
  state();
  const method = String((request && request.method) || 'GET').toUpperCase();
  const rawPath = String((request && request.path) || '/');
  let pathname = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const parts = pathname.split('/').filter(Boolean);
  const binary = Boolean(request && request.binary);
  if (parts[0] === 'api' && parts[1] === 'v1') {
    parts.splice(1, 1);
    if (parts[1] === 'products') parts[1] = 'product';
    if (parts[1] === 'inventory') parts[1] = 'quantity';
    if (parts[1] === 'orders') parts[1] = 'order';
    // Rebuild the canonical path so pathname-based routes (dashboard,
    // features import, search, …) match the /api/v1/* aliases too.
    pathname = `/${parts.join('/')}`;
  }
  const query = (request && request.query) || {};
  const body = (request && request.body) || {};
  const form = (request && request.form) || null;

  // Public health probes (no token, like the real API).
  if (method === 'GET' && (pathname === '/health' || pathname === '/health/live' || pathname === '/health/ready')) {
    return ok(200, { status: 'ok', database: 'ready', uptime: 0 });
  }

  // Public auth routes
  if (method === 'POST' && pathname === '/auth/register') return routeRegister(body);
  if (method === 'POST' && pathname === '/auth/login') return routeLogin(body);
  if (method === 'POST' && pathname === '/auth/verify-email') return routeVerifyEmail(body);
  if (method === 'POST' && pathname === '/auth/forgot-password') return routeForgotPassword(body);
  if (method === 'POST' && pathname === '/auth/reset-password') return routeResetPassword(body);
  if (method === 'POST' && pathname === '/auth/refresh') {
    const user = verifyToken((request && request.token) || '');
    return routeRefresh(user);
  }
  if (method === 'POST' && pathname === '/auth/logout') {
    return { ok: true, status: 204, data: null, ms: 1, url: 'mock://demo' };
  }

  // Everything else needs a token, exactly like AuthMiddleware
  const user = verifyToken((request && request.token) || '');
  if (!user) {
    return (request && request.token)
      ? fail(401, 'Invalid or expired access token', 'INVALID_TOKEN')
      : fail(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  if (method === 'POST' && pathname === '/auth/resend-verification') return routeResendVerification();
  if (method === 'POST' && pathname === '/auth/logout-all') {
    return { ok: true, status: 204, data: null, ms: 1, url: 'mock://demo' };
  }

  if (method === 'GET' && pathname === '/api/organizations') {
    return ok(200, [{ ...DEMO_ORG, role: 'owner' }]);
  }
  if (method === 'POST' && pathname === '/api/organizations/switch') return routeOrgSwitch(body, user);
  if (method === 'POST' && pathname === '/api/organizations/invites/accept') return routeOrgAccept(body);
  if (method === 'GET' && pathname === '/api/organizations/members') {
    return ok(200, [{ _id: 'demo-membership', role: 'owner', user: { name: 'Demo Manager', email: DEMO_EMAIL } }]);
  }
  if (method === 'POST' && pathname === '/api/organizations/invites') return routeOrgInvite(body);
  if (method === 'PATCH' && parts[0] === 'api' && parts[1] === 'organizations' && parts[2] === 'members' && parts[3] && parts[4] === 'role') {
    return routeOrgChangeRole(parts[3], body);
  }
  if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'organizations' && parts[2] === 'members' && parts[3]) {
    return ok(200, {});
  }
  if (method === 'POST' && pathname === '/api/organizations/leave') return ok(200, {});
  if (method === 'DELETE' && pathname === '/api/organizations') return ok(200, {});
  if (method === 'GET' && pathname === '/api/organizations/audit-logs') return routeAuditLogs(query);

  if (method === 'GET' && pathname === '/api/dashboard/product') return routeDashboardProduct(query);
  if (method === 'GET' && pathname === '/api/dashboard/order') return routeDashboardOrder(query);

  if (method === 'GET' && pathname === '/api/billing/subscription') return ok(200, demoSubscription());
  if (method === 'GET' && pathname === '/api/billing/usage') return routeBillingUsage();
  if (method === 'POST' && pathname === '/api/billing/checkout') return routeBillingCheckout(body);
  if (method === 'POST' && pathname === '/api/billing/portal') return ok(200, { portalUrl: 'https://demo.stockflow.app/billing' });
  if (method === 'POST' && pathname === '/api/billing/cancel') {
    const subscription = demoSubscription();
    subscription.cancelAtPeriodEnd = true;
    return ok(200, subscription);
  }
  if (method === 'GET' && pathname === '/api/billing/invoices') return routeBillingInvoices(query);

  if (method === 'GET' && pathname === '/api/search') return routeSearch(query);

  if (method === 'GET' && pathname === '/api/account/onboarding') return routeOnboarding();
  if (method === 'PATCH' && pathname === '/api/account/notifications') return routeNotifications(body, user);
  if (method === 'GET' && pathname === '/api/account/export') return routeAccountExport(user, binary);
  if (method === 'DELETE' && pathname === '/api/account') {
    return ok(202, { message: 'Account deletion scheduled in 30 days' });
  }

  if (method === 'POST' && pathname === '/api/api-keys') return routeApiKeyCreate(body);
  if (method === 'GET' && pathname === '/api/api-keys') {
    return ok(200, clone(db.apiKeys.filter((key) => !key.revokedAt)));
  }
  if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'api-keys' && parts[2]) {
    return routeApiKeyRevoke(parts[2]);
  }

  if (method === 'POST' && pathname === '/api/webhooks') return routeWebhookCreate(body);
  if (method === 'GET' && pathname === '/api/webhooks') return ok(200, clone(db.webhooks));
  if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'webhooks' && parts[2]) {
    return routeWebhookRemove(parts[2]);
  }

  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'features' && parts[2] === 'reports') {
    if (parts[3] === 'sales') return ok(200, [{ _id: '2026-11', revenue: 12500, profit: 4200, orders: 3 }]);
    if (parts[3] === 'best-sellers') return ok(200, [{ name: 'Casque Bluetooth Pro', quantity: 8, revenue: 9600 }]);
    if (parts[3] === 'stock') return ok(200, { stockValue: 42000, potentialProfit: 13000, lowStock: 2, outOfStock: 1 });
    if (parts[3] === 'movements') return routeMovements(query);
  }
  if (method === 'POST' && pathname === '/api/features/products/import') return routeImport(form);
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'features' && parts[2] === 'export' && parts[3]) {
    return routeExport(parts[3], query);
  }
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'features' && parts[2] === 'orders' && parts[3] && parts[4] === 'documents' && parts[5]) {
    return routeOrderDocument(parts[3], parts[5]);
  }
  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'features' && parts[2] === 'orders' && parts[3] && parts[4] === 'shipment') {
    return routeShipment(parts[3]);
  }

  if (parts[0] === 'api' && parts[1] === 'product') {
    if (parts.length === 2) {
      if (method === 'GET') return routeProductsList(query);
      if (method === 'POST') return routeProductCreate(body, form, user);
    }
    if (parts.length === 3 && parts[2] === 'analysis' && method === 'GET') {
      return routeProductAnalysis();
    }
    if (parts.length === 4 && parts[3] === 'restore' && method === 'POST') {
      return routeProductRestore(parts[2]);
    }
    if (parts.length === 3) {
      const id = parts[2];
      if (method === 'PATCH') return routeProductUpdate(id, body, form);
      if (method === 'DELETE') return routeProductDelete(id);
      if (method === 'GET') {
        const product = liveProducts().find((item) => item._id === id);
        return product ? ok(200, { product: clone(product) }) : fail(404, 'Product not found', 'PRODUCT_NOT_FOUND');
      }
    }
  }

  if (parts[0] === 'api' && parts[1] === 'quantity') {
    if (method === 'POST' && parts[2] === 'stock-in' && parts[3]) {
      return routeStock(parts[3], (body && body.quantity), 'in', user, body && body.variantSku);
    }
    if (method === 'POST' && parts[2] === 'stock-out' && parts[3]) {
      return routeStock(parts[3], (body && body.quantity), 'out', user, body && body.variantSku);
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
      const order = liveOrders().find((item) => item._id === parts[2]);
      return order ? ok(200, { Order: clone(order) }) : fail(404, 'Order not found', 'ORDER_NOT_FOUND');
    }
    if (method === 'PATCH' && parts[2] === 'status' && parts[3]) {
      return routeOrderStatus(parts[3], body && body.status);
    }
    if (method === 'PATCH' && parts[2] === 'cancel-order' && parts[3]) {
      return routeOrderCancel(parts[3]);
    }
    if (method === 'DELETE' && parts.length === 3) return routeOrderDelete(parts[2]);
    if (method === 'POST' && parts.length === 4 && parts[3] === 'restore') return routeOrderRestore(parts[2]);
  }

  return fail(404, `Route not found: ${method} ${pathname}`, 'ROUTE_NOT_FOUND');
}

module.exports = {
  init,
  handle,
  reset,
  state,
  load,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_ORG_ID,
  CITIES
};
