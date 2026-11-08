/* Renderer-side API facade over the Electron bridge */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  class ApiError extends Error {
    constructor(result) {
      super((result && (result.error || 'Request failed')) || 'Request failed');
      this.name = 'ApiError';
      this.status = (result && result.status) || 0;
      this.result = result || {};
      this.sessionExpired = Boolean(result && result.sessionExpired);
    }
  }

  const bridge = () => {
    if (!window.desktop) throw new Error('Desktop bridge unavailable');
    return window.desktop;
  };

  let onSessionExpired = null;

  async function raw(options) {
    const result = await bridge().request(options);
    if (!result.ok) {
      const error = new ApiError(result);
      if (error.sessionExpired && typeof onSessionExpired === 'function') onSessionExpired(error);
      throw error;
    }
    return result.data;
  }

  /* ------------------------------------------------------------- products */

  const productApi = {
    list(query) {
      return raw({ method: 'GET', path: '/api/product', query });
    },

    async all(options) {
      const opts = options || {};
      const limit = opts.limit || 50;
      const maxPages = opts.maxPages || 20;
      const products = [];
      let page = 1;
      let totalPages = 1;

      do {
        const data = await productApi.list({
          search: opts.search,
          category: opts.category,
          page,
          limit,
          sort: opts.sort
        });
        const batch = (data && data.products) || [];
        products.push(...batch);
        totalPages = (data && data.pagnition && data.pagnition.totalPages) || 1;
        page += 1;
        if (!batch.length) break;
      } while (page <= totalPages && page <= maxPages);

      return products;
    },

    async create(fields, file) {
      const data = await raw({
        method: 'POST',
        path: '/api/product',
        form: { fields, file: file || undefined }
      });
      const product = (data && data.product && (data.product.Product || data.product.product)) || null;
      return { data, product };
    },

    async update(id, fields, file) {
      return raw({
        method: 'PATCH',
        path: `/api/product/${encodeURIComponent(id)}`,
        form: { fields, file: file || undefined }
      });
    },

    remove(id) {
      return raw({ method: 'DELETE', path: `/api/product/${encodeURIComponent(id)}` });
    },

    analysis() {
      return raw({ method: 'GET', path: '/api/product/analysis' });
    }
  };

  /* ------------------------------------------------------------ inventory */

  const inventoryApi = {
    stockIn(id, quantity) {
      return raw({
        method: 'POST',
        path: `/api/quantity/stock-in/${encodeURIComponent(id)}`,
        body: { quantity: Number(quantity) }
      });
    },
    stockOut(id, quantity) {
      return raw({
        method: 'POST',
        path: `/api/quantity/stock-out/${encodeURIComponent(id)}`,
        body: { quantity: Number(quantity) }
      });
    },
    async lowStock() {
      const data = await raw({ method: 'GET', path: '/api/quantity/low-stock' });
      return (data && data.low_Quantity) || [];
    },
    async outOfStock() {
      const data = await raw({ method: 'GET', path: '/api/quantity/out-stock' });
      return (data && data.out_Quantity) || [];
    }
  };

  /* --------------------------------------------------------------- orders */

  const EMPTY_ORDERS = (page, limit) => ({
    orders: [],
    pagnition: { page: page || 1, limit: limit || 12, total: 0, totalPages: 0 }
  });

  const orderApi = {
    async list(query) {
      try {
        const data = await raw({ method: 'GET', path: '/api/order', query });
        return (data && data.Orders) || EMPTY_ORDERS(query && query.page, query && query.limit);
      } catch (error) {
        // The API answers 404 when there are no orders — that is "empty", not an error.
        if (error.status === 404) return EMPTY_ORDERS(query && query.page, query && query.limit);
        throw error;
      }
    },

    async all(options) {
      const opts = options || {};
      const limit = opts.limit || 100;
      const maxPages = opts.maxPages || 10;
      const orders = [];
      let page = 1;
      let totalPages = 1;

      do {
        const data = await orderApi.list({ page, limit, status: opts.status, name: opts.name, sort: opts.sort });
        const batch = (data && data.orders) || [];
        orders.push(...batch);
        totalPages = (data && data.pagnition && data.pagnition.totalPages) || 1;
        page += 1;
        if (!batch.length) break;
      } while (page <= totalPages && page <= maxPages);

      return orders;
    },

    async get(id) {
      const data = await raw({ method: 'GET', path: `/api/order/${encodeURIComponent(id)}` });
      return (data && data.Order) || data;
    },

    async create(payload) {
      const data = await raw({ method: 'POST', path: '/api/order', body: payload });
      return (data && data.new_Order) || data;
    },

    setStatus(id, status) {
      return raw({
        method: 'PATCH',
        path: `/api/order/status/${encodeURIComponent(id)}`,
        body: { status }
      });
    },

    cancel(id) {
      return raw({
        method: 'PATCH',
        path: `/api/order/cancel-order/${encodeURIComponent(id)}`
      });
    }
  };

  /* --------------------------------------------------------------- images */

  const imageCache = new Map();

  async function resolveImage(filename) {
    if (!filename) return null;
    if (imageCache.has(filename)) return imageCache.get(filename);
    imageCache.set(filename, null); // de-duplicate concurrent lookups

    let dataUrl = null;
    try {
      dataUrl = await bridge().getImage(filename);
    } catch (error) {
      dataUrl = null;
    }
    imageCache.set(filename, dataUrl || null);
    return dataUrl || null;
  }

  async function rememberImage(filename, bytes) {
    if (!filename || !bytes) return null;
    try {
      const dataUrl = await bridge().putImage({ filename, data: bytes });
      if (dataUrl) imageCache.set(filename, dataUrl);
      return dataUrl;
    } catch (error) {
      return null;
    }
  }

  /* ----------------------------------------------------------------- misc */

  App.api = {
    ApiError,
    setSessionExpiredHandler(handler) {
      onSessionExpired = handler;
    },

    auth: {
      async login(email, password) {
        const result = await bridge().login({ email, password });
        if (!result.ok) throw new ApiError(result);
        return result.session;
      },
      async register(form) {
        const result = await bridge().register(form);
        if (!result.ok) throw new ApiError(result);
        return result.data;
      },
      session: () => bridge().getSession(),
      logout: () => bridge().logout()
    },

    config: {
      get: () => bridge().getConfig(),
      set: (patch) => bridge().setConfig(patch)
    },

    ping: () => bridge().ping(),
    info: () => bridge().info(),
    openDataFolder: () => bridge().openDataFolder(),
    openExternal: (url) => bridge().openExternal(url),
    resetDemo: () => bridge().resetDemo(),

    products: productApi,
    inventory: inventoryApi,
    orders: orderApi,

    images: {
      resolve: resolveImage,
      remember: rememberImage,
      clearCache: () => {
        imageCache.clear();
        return bridge().clearImageCache();
      },
      stats: () => bridge().imageStats()
    },

    clearImageMemory() {
      imageCache.clear();
    }
  };
})();
