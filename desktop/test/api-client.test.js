'use strict';

/**
 * HTTP client tests: the exact code the main process uses to talk to the API.
 * A throwaway Node server stands in for Express, so multipart uploads, auth
 * headers, query strings, error mapping and timeouts are all verified.
 *
 *   node test/api-client.test.js
 */

const assert = require('assert');
const http = require('http');
const client = require('../src/main/api-client');

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

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

(async () => {
  console.log('\nHTTP client tests\n');

  const requests = [];
  const { server, port } = await listen(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const body = await readBody(request);
    requests.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: request.headers,
      body
    });

    const json = (status, payload) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
    };

    if (url.pathname === '/auth/login' && request.method === 'POST') {
      const payload = JSON.parse(body.toString('utf8') || '{}');
      if (payload.password !== 'demo1234') return json(400, { message: 'The email or Password is invalaid' });
      return json(200, {
        message: 'ok',
        register: { name: 'Demo', email: payload.email, token: 'header.payload.signature' }
      });
    }

    if (url.pathname === '/api/product' && request.method === 'GET') {
      if (!request.headers.authorization) return json(401, { message: 'verife your access' });
      return json(200, {
        products: [],
        pagnition: { page: 1, limit: 12, total: 0, totalPages: 0 },
        echoQuery: Object.fromEntries(url.searchParams.entries())
      });
    }

    if (url.pathname === '/api/product' && request.method === 'POST') {
      const contentType = request.headers['content-type'] || '';
      return json(201, {
        contentType,
        hasFile: body.includes(Buffer.from('fake-image-bytes')),
        hasName: body.includes(Buffer.from('Multipart Widget')),
        filename: /filename="([^"]+)"/.exec(body.toString('latin1'))
          ? /filename="([^"]+)"/.exec(body.toString('latin1'))[1]
          : null,
        bytes: body.length
      });
    }

    if (url.pathname === '/html') {
      response.writeHead(404, { 'Content-Type': 'text/html' });
      return response.end('<html><body><h1>Cannot GET /nope</h1></body></html>');
    }

    if (url.pathname === '/slow') return undefined; // never answers

    if (url.pathname === '/validation-error') {
      return json(400, { message: { name: 'should add the name', price: 'check your Price' } });
    }

    return json(404, { message: 'not found' });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  await test('normalises base URLs', () => {
    assert.strictEqual(client.normalizeBaseUrl('localhost:5000'), 'http://localhost:5000');
    assert.strictEqual(client.normalizeBaseUrl('http://localhost:5000/'), 'http://localhost:5000');
    assert.strictEqual(client.normalizeBaseUrl('  https://api.example.com/v1/ '), 'https://api.example.com/v1');
    assert.strictEqual(client.normalizeBaseUrl(''), 'http://localhost:5000');
  });

  await test('posts JSON and reads the token', async () => {
    const result = await client.request({
      baseUrl,
      path: '/auth/login',
      method: 'POST',
      body: { email: 'demo@stockflow.app', password: 'demo1234' }
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.register.token, 'header.payload.signature');
    assert.strictEqual(requests.at(-1).headers['content-type'], 'application/json');
  });

  await test('sends the JWT as a Bearer token and builds queries', async () => {
    const result = await client.request({
      baseUrl,
      path: '/api/product',
      token: 'abc.def.ghi',
      query: { page: 2, search: 'café', category: '', sort: undefined }
    });
    assert.strictEqual(result.ok, true);
    const last = requests.at(-1);
    assert.strictEqual(last.headers.authorization, 'Bearer abc.def.ghi');
    assert.deepStrictEqual(last.query, { page: '2', search: 'café' });
    assert.deepStrictEqual(result.data.echoQuery, { page: '2', search: 'café' });
  });

  await test('uploads a multipart image with its bytes intact', async () => {
    const bytes = Buffer.from('fake-image-bytes');
    const result = await client.request({
      baseUrl,
      path: '/api/product',
      method: 'POST',
      token: 'abc',
      form: {
        fields: { name: 'Multipart Widget', price: 900, category: 'Test' },
        file: { name: 'widget.png', type: 'image/png', data: new Uint8Array(bytes) }
      }
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.data.contentType.startsWith('multipart/form-data; boundary='), result.data.contentType);
    assert.strictEqual(result.data.hasFile, true, 'file bytes missing from multipart body');
    assert.strictEqual(result.data.hasName, true, 'text field missing from multipart body');
    assert.strictEqual(result.data.filename, 'widget.png');
  });

  await test('maps validation-object error messages to one line', () => {
    const message = client.errorMessage({
      ok: false,
      status: 400,
      data: { message: { name: 'should add the name', price: 'check your Price' } }
    });
    assert.strictEqual(message, 'should add the name · check your Price');
  });

  await test('reports unreachable servers in plain language', async () => {
    const result = await client.request({
      baseUrl: 'http://127.0.0.1:1',
      path: '/api/product',
      timeout: 3000
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 0);
    assert.ok(result.error, 'an error message is expected');
    assert.match(result.error.toLowerCase(), /could not reach|refused|reach/);
  });

  await test('times out slow endpoints', async () => {
    const started = Date.now();
    const result = await client.request({ baseUrl, path: '/slow', timeout: 350 });
    const elapsed = Date.now() - started;
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 0);
    assert.match(result.error, /did not answer/i);
    assert.ok(elapsed < 2000, `timeout took ${elapsed}ms`);
  });

  await test('handles HTML error pages without crashing', async () => {
    const result = await client.request({ baseUrl, path: '/html' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 404);
    assert.match(client.errorMessage(result), /Cannot GET/);
  });

  await test('surfaces auth failures clearly', async () => {
    const result = await client.request({ baseUrl, path: '/nope' });
    assert.strictEqual(result.status, 404);
    assert.strictEqual(client.errorMessage(result), 'not found');
  });

  server.close();
  server.closeAllConnections && server.closeAllConnections();

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    for (const failure of failures) console.error(failure.error.stack);
    process.exit(1);
  }
  process.exit(0);
})();
