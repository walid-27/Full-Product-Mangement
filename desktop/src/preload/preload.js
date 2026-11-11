'use strict';

/**
 * The only bridge between the UI and the machine.
 * - no Node.js in the renderer
 * - no JWT in the renderer (main attaches it)
 * - a fixed, explicit list of capabilities
 */

const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Set();

ipcRenderer.on('win:state', (_event, state) => {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      // ignore listener errors
    }
  }
});

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  isDesktop: true,

  /* settings */
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),

  /* auth */
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  register: (form) => ipcRenderer.invoke('auth:register', form),
  getSession: () => ipcRenderer.invoke('auth:session'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  switchOrganization: (organizationId) => ipcRenderer.invoke('org:switch', organizationId),

  /* API */
  request: (options) => ipcRenderer.invoke('api:request', options),
  ping: () => ipcRenderer.invoke('api:ping'),

  /* images */
  getImage: (filename) => ipcRenderer.invoke('image:get', filename),
  putImage: (payload) => ipcRenderer.invoke('image:put', payload),
  clearImageCache: () => ipcRenderer.invoke('image:clear'),
  imageStats: () => ipcRenderer.invoke('image:stats'),

  /* demo data */
  resetDemo: () => ipcRenderer.invoke('mock:reset'),

  /* app */
  info: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  showErrorBox: (payload) => ipcRenderer.invoke('app:showErrorBox', payload),

  /* window */
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onWindowState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
});
