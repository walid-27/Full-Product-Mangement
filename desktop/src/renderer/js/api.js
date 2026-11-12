/* Renderer-side API facade over the Electron bridge */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  class ApiError extends Error {
    constructor(result) {
      super((result && (result.error || 'Request failed')) || 'Request failed');
      this.name = 'ApiError';
      this.status = (result && result.status) || 0;
      this.code = (result && (result.code || (result.data && result.data.code))) || null;
      this.details = (result && (result.details || (result.data && result.data.details))) || null;
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

  async function download(options) {
    const bridgeApi = bridge();
    if (typeof bridgeApi.download !== 'function') {
      throw new ApiError({ ok: false, status: 0, error: 'Downloads are not available in this build.' });
    }
    const result = await bridgeApi.download(options);
    if (!result.ok) {
      if (result.canceled) return null;
      throw new ApiError(result);
    }
    return result;
  }

  /* ------------------------------------------------------------- products */

  const productApi = {
    list(query) {
      return raw({ method: 'GET', path: '/api/v1/products', query });
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
        path: '/api/v1/products',
        form: { fields, file: file || undefined }
      });
      const product = (data && data.product && (data.product.Product || data.product.product)) || null;
      return { data, product };
    },

    async update(id, fields, file) {
      return raw({
        method: 'PATCH',
        path: `/api/v1/products/${encodeURIComponent(id)}`,
        form: { fields, file: file || undefined }
      });
    },

    remove(id) {
      return raw({ method: 'DELETE', path: `/api/v1/products/${encodeURIComponent(id)}` });
    },

    restore(id) {
      return raw({ method: 'POST', path: `/api/v1/products/${encodeURIComponent(id)}/restore` });
    },

    analysis() {
      return raw({ method: 'GET', path: '/api/v1/products/analysis' });
    }
  };

  /* ------------------------------------------------------------ inventory */

  const inventoryApi = {
    stockIn(id, quantity, variantSku) {
      return raw({
        method: 'POST',
        path: `/api/v1/inventory/stock-in/${encodeURIComponent(id)}`,
        body: { quantity: Number(quantity), ...(variantSku ? { variantSku } : {}) }
      });
    },
    stockOut(id, quantity, variantSku) {
      return raw({
        method: 'POST',
        path: `/api/v1/inventory/stock-out/${encodeURIComponent(id)}`,
        body: { quantity: Number(quantity), ...(variantSku ? { variantSku } : {}) }
      });
    },
    async lowStock() {
      const data = await raw({ method: 'GET', path: '/api/v1/inventory/low-stock' });
      return (data && data.low_Quantity) || [];
    },
    async outOfStock() {
      const data = await raw({ method: 'GET', path: '/api/v1/inventory/out-stock' });
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
        const data = await raw({ method: 'GET', path: '/api/v1/orders', query });
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
      const data = await raw({ method: 'GET', path: `/api/v1/orders/${encodeURIComponent(id)}` });
      return (data && data.Order) || data;
    },

    async create(payload) {
      const data = await raw({ method: 'POST', path: '/api/v1/orders', body: payload });
      return (data && data.new_Order) || data;
    },

    setStatus(id, status) {
      return raw({
        method: 'PATCH',
        path: `/api/v1/orders/status/${encodeURIComponent(id)}`,
        body: { status }
      });
    },

    cancel(id) {
      return raw({
        method: 'PATCH',
        path: `/api/v1/orders/cancel-order/${encodeURIComponent(id)}`
      });
    },

    remove(id) {
      return raw({ method: 'DELETE', path: `/api/v1/orders/${encodeURIComponent(id)}` });
    },

    restore(id) {
      return raw({ method: 'POST', path: `/api/v1/orders/${encodeURIComponent(id)}/restore` });
    },

    document(id, type) {
      return download({
        method: 'GET',
        path: `/api/v1/features/orders/${encodeURIComponent(id)}/documents/${encodeURIComponent(type)}`,
        filename: `${type}-${id}.pdf`
      });
    },

    shipment(id) {
      return raw({ method: 'POST', path: `/api/v1/features/orders/${encodeURIComponent(id)}/shipment` });
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
        return { data: result.data, session: result.session || null };
      },
      session: () => bridge().getSession(),
      logout: () => bridge().logout(),
      logoutAll: () => (typeof bridge().logoutAll === 'function' ? bridge().logoutAll() : bridge().logout()),
      verifyEmail: (token) => raw({ method: 'POST', path: '/auth/verify-email', body: { token }, auth: false }),
      resendVerification: () => raw({ method: 'POST', path: '/auth/resend-verification' }),
      forgotPassword: (email) => raw({ method: 'POST', path: '/auth/forgot-password', body: { email }, auth: false }),
      resetPassword: (token, password) => raw({ method: 'POST', path: '/auth/reset-password', body: { token, password }, auth: false })
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
    download,

    products: productApi,
    inventory: inventoryApi,
    orders: orderApi,
    dashboard: {
      products: (date) => raw({ method: 'GET', path: '/api/v1/dashboard/product', query: { date } }),
      orders: (period) => raw({ method: 'GET', path: '/api/v1/dashboard/order', query: { period } })
    },
    organizations: {
      list: () => raw({ method: 'GET', path: '/api/organizations' }),
      async switch(id) {
        const result = await bridge().switchOrganization(id);
        if (!result.ok) throw new ApiError(result);
        return result;
      },
      members: () => raw({ method: 'GET', path: '/api/organizations/members' }),
      invite: (email, role) => raw({ method: 'POST', path: '/api/organizations/invites', body: { email, role } }),
      acceptInvite: (token) => raw({ method: 'POST', path: '/api/organizations/invites/accept', body: { token } }),
      removeMember: (id) => raw({ method: 'DELETE', path: `/api/organizations/members/${encodeURIComponent(id)}` }),
      changeRole: (id, role) => raw({ method: 'PATCH', path: `/api/organizations/members/${encodeURIComponent(id)}/role`, body: { role } }),
      leave: () => raw({ method: 'POST', path: '/api/organizations/leave' }),
      remove: () => raw({ method: 'DELETE', path: '/api/organizations' }),
      auditLogs: (query) => raw({ method: 'GET', path: '/api/organizations/audit-logs', query })
    },
    billing: {
      subscription: () => raw({ method: 'GET', path: '/api/billing/subscription' }),
      usage: () => raw({ method: 'GET', path: '/api/billing/usage' }),
      checkout: (plan) => raw({ method: 'POST', path: '/api/billing/checkout', body: { plan } }),
      portal: () => raw({ method: 'POST', path: '/api/billing/portal' }),
      cancel: () => raw({ method: 'POST', path: '/api/billing/cancel' }),
      invoices: (query) => raw({ method: 'GET', path: '/api/billing/invoices', query })
    },
    apiKeys: {
      list: () => raw({ method: 'GET', path: '/api/api-keys' }),
      create: (name, scopes, rateLimitPerMinute) =>
        raw({ method: 'POST', path: '/api/api-keys', body: { name, scopes, rateLimitPerMinute } }),
      revoke: (id) => raw({ method: 'DELETE', path: `/api/api-keys/${encodeURIComponent(id)}` })
    },
    webhooks: {
      list: () => raw({ method: 'GET', path: '/api/webhooks' }),
      create: (url, events) => raw({ method: 'POST', path: '/api/webhooks', body: { url, events } }),
      remove: (id) => raw({ method: 'DELETE', path: `/api/webhooks/${encodeURIComponent(id)}` })
    },
    reports: {
      sales: (period) => raw({ method: 'GET', path: '/api/v1/features/reports/sales', query: { period } }),
      bestSellers: () => raw({ method: 'GET', path: '/api/v1/features/reports/best-sellers' }),
      stock: () => raw({ method: 'GET', path: '/api/v1/features/reports/stock' }),
      movements: (query) => raw({ method: 'GET', path: '/api/v1/features/reports/movements', query })
    },
    features: {
      importProducts: (file) =>
        raw({
          method: 'POST',
          path: '/api/v1/features/products/import',
          form: { fields: {}, file: { ...file, field: 'file' } }
        }),
      exportData: (type, format) =>
        download({
          method: 'GET',
          path: `/api/v1/features/export/${encodeURIComponent(type)}`,
          query: { format: format || 'csv' },
          filename: `${type}.${format || 'csv'}`
        })
    },
    account: {
      onboarding: () => raw({ method: 'GET', path: '/api/account/onboarding' }),
      notifications: (preferences) => raw({ method: 'PATCH', path: '/api/account/notifications', body: preferences }),
      exportData: () => download({ method: 'GET', path: '/api/account/export', filename: 'account-export.json' }),
      remove: () => raw({ method: 'DELETE', path: '/api/account' })
    },
    search: (q, limit) => raw({ method: 'GET', path: '/api/v1/search', query: { q, limit } }),

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
