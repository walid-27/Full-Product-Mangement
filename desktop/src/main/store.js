'use strict';

/**
 * Tiny JSON config store for the main process.
 * Keeps app settings + the (optionally encrypted) session token on disk.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  apiBaseUrl: 'http://localhost:5000',
  uploadsPath: '/uploads',
  theme: 'dark',
  demoMode: false,
  session: null,
  window: { width: 1360, height: 880, maximized: false }
};

let dataDir = null;
let configPath = null;
let config = null;
let encrypt = null;
let decrypt = null;

function init(dir, options) {
  dataDir = dir;
  fs.mkdirSync(dataDir, { recursive: true });
  configPath = path.join(dataDir, 'config.json');

  if (options && typeof options.encrypt === 'function') encrypt = options.encrypt;
  if (options && typeof options.decrypt === 'function') decrypt = options.decrypt;

  config = read();
  return config;
}

function read() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...(raw || {}),
    window: { ...DEFAULT_CONFIG.window, ...((raw && raw.window) || {}) },
    session: null
  };

  const stored = raw && raw.session;
  if (stored && stored.token) {
    let token = stored.token;
    if (token.startsWith('enc:') && decrypt) {
      try {
        token = decrypt(token.slice(4));
      } catch (err) {
        token = null;
      }
    } else if (token.startsWith('raw:')) {
      token = token.slice(4);
    }
    let refreshToken = stored.refreshToken || null;
    if (refreshToken?.startsWith('enc:') && decrypt) {
      try { refreshToken = decrypt(refreshToken.slice(4)); } catch (err) { refreshToken = null; }
    } else if (refreshToken?.startsWith('raw:')) refreshToken = refreshToken.slice(4);
    merged.session = token ? { ...stored, token, refreshToken } : null;
  }

  return merged;
}

function serialize() {
  const copy = { ...config, session: null };
  if (config.session && config.session.token) {
    const token = String(config.session.token);
    let stored = `raw:${token}`;
    if (encrypt) {
      try {
        const sealed = encrypt(token);
        if (sealed) stored = `enc:${sealed}`;
      } catch (err) {
        stored = `raw:${token}`;
      }
    }
    let storedRefresh = config.session.refreshToken ? `raw:${config.session.refreshToken}` : null;
    if (config.session.refreshToken && encrypt) {
      try {
        const sealed = encrypt(config.session.refreshToken);
        if (sealed) storedRefresh = `enc:${sealed}`;
      } catch (err) { /* best-effort OS encryption */ }
    }
    copy.session = { ...config.session, token: stored, refreshToken: storedRefresh };
  }
  return copy;
}

function persist() {
  try {
    const tmp = `${configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(serialize(), null, 2), 'utf8');
    fs.renameSync(tmp, configPath);
  } catch (err) {
    // Persisting settings is best-effort: never crash the app over it.
    console.error('[store] could not save config:', err.message);
  }
}

function get() {
  return config;
}

function getPublic() {
  return {
    apiBaseUrl: config.apiBaseUrl,
    uploadsPath: config.uploadsPath,
    theme: config.theme,
    demoMode: config.demoMode,
    window: config.window,
    hasSession: Boolean(config.session && config.session.token)
  };
}

function set(patch) {
  const allowed = ['apiBaseUrl', 'uploadsPath', 'theme', 'demoMode', 'window'];
  for (const key of Object.keys(patch || {})) {
    if (allowed.includes(key)) config[key] = patch[key];
  }
  if (patch && typeof patch.apiBaseUrl === 'string') {
    config.apiBaseUrl = patch.apiBaseUrl.trim();
  }
  if (patch && typeof patch.uploadsPath === 'string') {
    const value = patch.uploadsPath.trim();
    config.uploadsPath = value === '' ? '/uploads' : value;
  }
  persist();
  return getPublic();
}

function setSession(session) {
  config.session = session ? { ...session } : null;
  persist();
  return config.session;
}

function getSession() {
  return config.session;
}

function clearSession() {
  config.session = null;
  persist();
}

function dataPath(...segments) {
  return path.join(dataDir, ...segments);
}

module.exports = {
  init,
  get,
  getPublic,
  set,
  setSession,
  getSession,
  clearSession,
  dataPath,
  get dataDir() {
    return dataDir;
  }
};
