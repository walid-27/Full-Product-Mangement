'use strict';

/**
 * Product image cache.
 *
 * The API stores uploads on its own disk and (depending on the deployment)
 * may not expose them over HTTP. So every image we upload is also kept in a
 * local cache inside the app's user-data folder:
 *
 *   1. look in the local cache
 *   2. fall back to GET {apiBaseUrl}{uploadsPath}/{filename}
 *   3. otherwise return null and the UI shows a generated placeholder
 */

const fs = require('fs');
const path = require('path');

let cacheDir = null;
const memory = new Map(); // filename -> data URL (small LRU-ish cache)
const MEMORY_LIMIT = 120;

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml'
};

function init(dir) {
  cacheDir = dir;
  fs.mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

function safeName(filename) {
  const base = path.basename(String(filename || '')).replace(/[^\w.\-]/g, '');
  return base && base !== '.' && base !== '..' ? base : '';
}

function mimeFor(filename) {
  return MIME[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

function toDataUrl(filename, buffer) {
  return `data:${mimeFor(filename)};base64,${Buffer.from(buffer).toString('base64')}`;
}

function readLocal(name) {
  const file = path.join(cacheDir, name);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > 12 * 1024 * 1024) return null;
    return toDataUrl(name, fs.readFileSync(file));
  } catch (err) {
    return null;
  }
}

function remember(name, dataUrl) {
  if (memory.has(name)) memory.delete(name);
  memory.set(name, dataUrl);
  if (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    memory.delete(oldest);
  }
}

function put(filename, data) {
  const name = safeName(filename);
  if (!name) return null;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (!buffer.length) return null;
  try {
    fs.writeFileSync(path.join(cacheDir, name), buffer);
  } catch (err) {
    // Cache is a convenience; failures must not break the app.
  }
  const dataUrl = toDataUrl(name, buffer);
  remember(name, dataUrl);
  return dataUrl;
}

/**
 * Resolve a product image to something an <img> can display.
 * Returns a data URL or null.
 */
async function get(filename, options) {
  const name = safeName(filename);
  if (!name || !cacheDir) return null;

  if (memory.has(name)) return memory.get(name);

  const local = readLocal(name);
  if (local) {
    remember(name, local);
    return local;
  }

  const baseUrl = options && options.baseUrl;
  if (!baseUrl && !/^https?:\/\//i.test(String(filename))) return null;

  const uploadsPath = (options && options.uploadsPath) || '/uploads';
  const suffix = uploadsPath.startsWith('/') ? uploadsPath : `/${uploadsPath}`;
  let url;
  if (/^https?:\/\//i.test(String(filename))) {
    const remote = new URL(String(filename));
    if (!['http:', 'https:'].includes(remote.protocol)) return null;
    url = remote.toString();
  } else {
    url = `${String(baseUrl).replace(/\/+$/, '')}${suffix.replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().startsWith('image/')) return null;
    if (Number(response.headers.get('content-length')) > 12 * 1024 * 1024) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength || arrayBuffer.byteLength > 12 * 1024 * 1024) return null;
    return put(name, Buffer.from(arrayBuffer));
  } catch (err) {
    return null;
  }
}

function clear() {
  memory.clear();
  if (!cacheDir) return;
  try {
    for (const entry of fs.readdirSync(cacheDir)) {
      fs.rmSync(path.join(cacheDir, entry), { force: true, recursive: true });
    }
  } catch (err) {
    // ignore
  }
}

function cacheSize() {
  if (!cacheDir) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  try {
    for (const entry of fs.readdirSync(cacheDir)) {
      const stat = fs.statSync(path.join(cacheDir, entry));
      if (stat.isFile()) {
        files += 1;
        bytes += stat.size;
      }
    }
  } catch (err) {
    // ignore
  }
  return { files, bytes };
}

module.exports = {
  init,
  get,
  put,
  clear,
  cacheSize,
  safeName,
  toDataUrl,
  get cacheDir() {
    return cacheDir;
  }
};
