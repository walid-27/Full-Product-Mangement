/* Application shell: routing, session, window chrome, connection status */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc } = App.util;
  const ui = App.ui;

  const ROUTES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'products', label: 'Products', icon: 'box' },
    { id: 'inventory', label: 'Inventory', icon: 'layers' },
    { id: 'orders', label: 'Orders', icon: 'receipt' },
    { id: 'reports', label: 'Reports', icon: 'grid' }
  ];

  const BOTTOM_ROUTES = [
    { id: 'team', label: 'Team', icon: 'user' },
    { id: 'settings', label: 'Settings', icon: 'gear' }
  ];

  App.state = App.state || {
    route: 'dashboard',
    routeParams: null,
    config: null,
    session: null,
    catalog: [],
    orders: [],
    lowStock: [],
    outOfStock: [],
    organizations: []
  };

  let navigating = false;
  let queued = null;
  let pollTimer = null;
  let pollBusy = false;

  /* -------------------------------------------------------------- chrome */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  function updateModeBadge(demo) {
    const badge = document.getElementById('mode-badge');
    if (badge) badge.hidden = !demo;
  }

  function setConnection(kind, label) {
    const status = document.getElementById('conn-status');
    const text = document.getElementById('conn-label');
    if (!status || !text) return;
    status.setAttribute('data-state', kind);
    text.textContent = label;
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (error) {
      return url || '';
    }
  }

  async function poll() {
    if (pollBusy) return;
    pollBusy = true;
    const config = App.state.config || {};

    if (config.demoMode) {
      setConnection('demo', 'Demo workspace');
      pollBusy = false;
      return;
    }

    if (!App.state.session) {
      setConnection('unknown', 'Not signed in');
      pollBusy = false;
      return;
    }

    setConnection('unknown', 'Checking…');
    try {
      const ping = await App.api.ping();
      if (ping.ok) setConnection('online', `Connected · ${hostOf(config.apiBaseUrl)}`);
      else setConnection('offline', 'API offline');
    } catch (error) {
      setConnection('offline', 'API offline');
    } finally {
      pollBusy = false;
    }
  }

  function startPolling() {
    stopPolling();
    poll();
    pollTimer = setInterval(poll, 30000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /* ------------------------------------------------------------------ nav */

  function navMarkup(routes) {
    return routes
      .map(
        (route) => `<button class="nav__item" type="button" data-route="${route.id}">
          ${App.icon(route.icon, 17)}
          <span class="nav__text">${esc(route.label)}</span>
          <span class="nav__count" data-count="${route.id}" hidden></span>
        </button>`
      )
      .join('');
  }

  function renderNav() {
    const main = document.getElementById('nav-main');
    const bottom = document.getElementById('nav-bottom');

    main.innerHTML = `<div class="nav__label">Workspace</div>${navMarkup(ROUTES)}`;
    bottom.innerHTML = navMarkup(BOTTOM_ROUTES);

    document.querySelectorAll('[data-route]').forEach((button) => {
      button.addEventListener('click', () => App.go(button.getAttribute('data-route')));
    });

    updateNavActive(App.state.route);
    updateNavCounts();
  }

  function updateNavActive(route) {
    document.querySelectorAll('[data-route]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-route') === route);
    });
  }

  function updateNavCounts() {
    const alerts = (App.state.lowStock || []).length + (App.state.outOfStock || []).length;
    const out = (App.state.outOfStock || []).length;
    const openOrders = (App.state.orders || []).filter((order) =>
      ['pending', 'confirmed', 'shipped'].includes(String(order.status || '').toLowerCase())
    ).length;

    const setCount = (id, value, isAlert) => {
      const node = document.querySelector(`[data-count="${id}"]`);
      if (!node) return;
      if (!value) {
        node.hidden = true;
        node.textContent = '';
        return;
      }
      node.hidden = false;
      node.textContent = String(value);
      node.classList.toggle('is-alert', Boolean(isAlert));
    };

    setCount('inventory', alerts, out > 0);
    setCount('orders', openOrders, openOrders > 0);
  }

  async function refreshNavCounts() {
    try {
      const [low, out] = await Promise.all([App.api.inventory.lowStock(), App.api.inventory.outOfStock()]);
      App.state.lowStock = low;
      App.state.outOfStock = out;
      updateNavCounts();
    } catch (error) {
      /* silent: badge is a convenience */
    }
  }

  function renderUserChip() {
    const chip = document.getElementById('userchip');
    if (!chip) return;
    const session = App.state.session || {};
    const name = session.name || session.email || 'Manager';
    const organizations = App.state.organizations || [];
    const organizationControl = organizations.length > 1
      ? `<select class="input input--sm" data-org-switch aria-label="Active organization">${organizations.map((org) => `<option value="${esc(org.id)}" ${org.id === session.orgId ? 'selected' : ''}>${esc(org.name)} · ${esc(org.role)}</option>`).join('')}</select>`
      : `<span class="userchip__mail">${esc(session.orgName || organizations[0]?.name || session.email || '')}</span>`;
    chip.innerHTML = `${ui.avatar(name, true)}<span class="userchip__meta">
        <span class="userchip__name">${esc(name)}</span>${organizationControl}</span>`;
    chip.addEventListener('click', (event) => { if (!event.target.closest('[data-org-switch]')) App.go('settings'); });
    const selector = chip.querySelector('[data-org-switch]');
    if (selector) selector.addEventListener('change', async () => {
      selector.disabled = true;
      try {
        const result = await App.api.organizations.switch(selector.value);
        App.state.session = result.session;
        App.state.session.orgName = result.organization.name;
        App.state.session.role = (App.state.organizations.find((org) => org.id === selector.value) || {}).role;
        App.state.catalog = [];
        App.state.orders = [];
        showShell();
        await go('dashboard');
        refreshNavCounts();
        ui.toast(`Switched to ${result.organization.name}`, 'success');
      } catch (error) {
        ui.toast(error.message, 'error');
        selector.value = App.state.session.orgId;
      } finally { selector.disabled = false; }
    });
  }

  /* --------------------------------------------------------------- router */

  function setPageHead(view) {
    document.getElementById('page-title').textContent = view.title || '';
    document.getElementById('page-sub').textContent = view.subtitle || '';

    const actions = document.getElementById('page-actions');
    actions.innerHTML = '';

    for (const action of view.actions || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn--${action.variant || 'ghost'}`;
      button.innerHTML = `${action.icon ? App.icon(action.icon, 15) : ''}<span>${esc(action.label)}</span>`;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (typeof action.onClick === 'function') action.onClick();
      });
      actions.appendChild(button);
    }

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'btn btn--quiet btn--icon';
    refresh.title = 'Refresh (Ctrl+R)';
    refresh.setAttribute('aria-label', 'Refresh');
    refresh.innerHTML = App.icon('refresh', 16);
    refresh.addEventListener('click', () => App.refresh());
    actions.appendChild(refresh);
  }

  async function go(route, params) {
    const view = App.views[route];
    if (!view) return;

    App.state.route = route;
    App.state.routeParams = params || null;
    updateNavActive(route);
    setPageHead(view);

    if (navigating) {
      queued = { route, params };
      return;
    }

    navigating = true;
    let host = document.getElementById('view');
    try {
      if (host) {
        // Fresh node per navigation: a slow view from the past cannot paint over this one.
        const fresh = host.cloneNode(false);
        fresh.innerHTML = '';
        host.replaceWith(fresh);
        host = fresh;
        host.scrollTop = 0;
      }
      await view.mount(host, params || {});
    } catch (error) {
      console.error('[StockFlow] view failed:', route, error);
      if (host) {
        host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">
          ${ui.alertBox('error', `<strong>This page could not be displayed.</strong><br />${esc(error.message || 'Unknown error')}`)}
          <div class="row" style="margin-top:12px"><button class="btn btn--ghost" data-retry>${App.icon('refresh', 15)} Reload</button></div>
        </div></div></div>`;
        const retry = host.querySelector('[data-retry]');
        if (retry) retry.addEventListener('click', () => App.refresh());
      }
    } finally {
      navigating = false;
      if (queued) {
        const next = queued;
        queued = null;
        go(next.route, next.params);
      }
    }
  }

  function refresh() {
    return go(App.state.route, {});
  }

  /* -------------------------------------------------------------- session */

  function showShell() {
    document.getElementById('boot').hidden = true;
    document.getElementById('auth').hidden = true;
    document.getElementById('shell').hidden = false;
    renderNav();
    renderUserChip();
    updateModeBadge(Boolean(App.state.config && App.state.config.demoMode));
  }

  function showAuth() {
    document.getElementById('boot').hidden = true;
    document.getElementById('shell').hidden = true;
    document.getElementById('view').innerHTML = '';
    document.getElementById('nav-main').innerHTML = '';
    document.getElementById('nav-bottom').innerHTML = '';
    App.views.auth.show();
  }

  async function onAuthenticated(session) {
    App.state.session = session || (await App.api.auth.session());
    try {
      App.state.config = await App.api.config.get();
    } catch (error) {
      App.state.config = App.state.config || {};
    }
    try {
      App.state.organizations = await App.api.organizations.list();
      const active = App.state.organizations.find((org) => org.id === App.state.session.orgId) || App.state.organizations[0];
      if (active) {
        App.state.session.orgName = active.name;
        App.state.session.role = active.role;
      }
    } catch (error) { App.state.organizations = []; }
    showShell();
    startPolling();
    await go('dashboard');
    refreshNavCounts();
  }

  async function signOut() {
    stopPolling();
    try {
      await App.api.auth.logout();
    } catch (error) {
      /* ignore */
    }
    App.state.session = null;
    App.state.catalog = [];
    App.state.orders = [];
    App.state.lowStock = [];
    App.state.outOfStock = [];
    setConnection('unknown', 'Signed out');
    showAuth();
  }

  /* --------------------------------------------------------------- events */

  function wireWindowControls() {
    document.querySelectorAll('[data-win]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-win');
        if (!window.desktop) return;
        if (action === 'minimize') window.desktop.minimize();
        if (action === 'maximize') window.desktop.toggleMaximize();
        if (action === 'close') window.desktop.close();
      });
    });

    const maxButton = document.getElementById('max-btn');
    const syncMaxIcon = (maximized) => {
      if (!maxButton) return;
      maxButton.innerHTML = App.icon(maximized ? 'restore' : 'maximize', 13);
      maxButton.title = maximized ? 'Restore' : 'Maximize';
    };

    if (window.desktop && typeof window.desktop.onWindowState === 'function') {
      window.desktop.onWindowState((state) => syncMaxIcon(Boolean(state && state.maximized)));
      window.desktop.isMaximized().then(syncMaxIcon).catch(() => {});
    }

    const conn = document.getElementById('conn-status');
    if (conn) conn.addEventListener('click', () => App.go('settings'));
  }

  function wireShortcuts() {
    document.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = String(event.key || '').toLowerCase();

      if (event.key === 'F5' || (mod && key === 'r')) {
        event.preventDefault();
        if (!document.getElementById('shell').hidden) App.refresh();
        return;
      }

      if (mod && (key === 'f' || key === 'k')) {
        event.preventDefault();
        const target = document.querySelector('#view input#product-search, #view input#order-search, #view input#inv-search, #view input#picker-search');
        if (target) {
          target.focus();
          if (target.select) target.select();
        } else {
          openGlobalSearch();
        }
        return;
      }

      if (mod && /^[1-5]$/.test(event.key)) {
        const route = ROUTES.concat(BOTTOM_ROUTES)[Number(event.key) - 1];
        if (route) {
          event.preventDefault();
          App.go(route.id);
        }
        return;
      }

      if (mod && key === 'n') {
        const view = App.views[App.state.route];
        const primary = view && (view.actions || []).find((action) => action.variant === 'primary');
        if (primary) {
          event.preventDefault();
          primary.onClick();
        }
      }
    });
  }

  function openGlobalSearch() {
    const body = ui.fromHTML('<div class="col"><input class="input" id="global-search" placeholder="Search products, orders, customers…" autocomplete="off" /><div id="global-search-results" style="min-height:40px"></div></div>');
    const ref = ui.modal({ title: 'Global search', body });
    const input = body.querySelector('#global-search');
    const results = body.querySelector('#global-search-results');
    let timer = null;
    const run = async () => {
      const query = input.value.trim();
      if (!query) { results.innerHTML = '<p class="muted small">Type at least 2 characters.</p>'; return; }
      results.innerHTML = '<p class="muted small">Searching…</p>';
      try {
        const data = await App.api.search(query);
        const products = data.products || [];
        const orders = data.orders || [];
        results.innerHTML = `<div class="col" style="gap:8px">
          ${products.length ? `<div class="small mute">Products (${products.length})</div>${products.map((product) => `<button class="btn btn--ghost btn--block" type="button" data-goto="products">${esc(product.name)} <span class="mute">${esc(product.sku || '')}</span></button>`).join('')}` : ''}
          ${orders.length ? `<div class="small mute">Orders (${orders.length})</div>${orders.map((order) => `<button class="btn btn--ghost btn--block" type="button" data-goto="orders">${esc(order.customerName || 'Order')} <span class="mute">${esc(order.status || '')}</span></button>`).join('')}` : ''}
          ${!products.length && !orders.length ? '<p class="muted small">No matches.</p>' : ''}
        </div>`;
        results.querySelectorAll('[data-goto]').forEach((button) => button.addEventListener('click', () => {
          ref.close();
          App.go(button.getAttribute('data-goto'));
        }));
      } catch (error) {
        results.innerHTML = ui.alertBox('error', esc(error.message));
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); run(); }
    });
    setTimeout(() => input.focus(), 0);
  }

  function wireGlobalErrors() {
    const seen = new Set();
    const report = (message) => {
      const text = String(message || 'Unknown error');
      if (seen.has(text)) return;
      seen.add(text);
      setTimeout(() => seen.delete(text), 8000);
      console.error('[StockFlow]', text);
      ui.toast({ type: 'error', title: 'Unexpected error', message: text });
    };

    window.addEventListener('error', (event) => report((event.error && event.error.message) || event.message));
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (reason && reason.name === 'ApiError') return; // already surfaced by the view
      report((reason && reason.message) || String(reason));
    });
  }

  /* ----------------------------------------------------------------- boot */

  async function boot() {
    applyTheme('dark');
    wireWindowControls();
    wireShortcuts();
    wireGlobalErrors();

    App.api.setSessionExpiredHandler(() => {
      if (App.state.signingOut) return;
      App.state.signingOut = true;
      ui.toast({
        type: 'warn',
        title: 'Session expired',
        message: 'Please sign in again to continue working.'
      });
      signOut().finally(() => {
        App.state.signingOut = false;
      });
    });

    try {
      const config = await App.api.config.get();
      App.state.config = config;
      applyTheme(config.theme);
      updateModeBadge(Boolean(config.demoMode));

      if (config.session) {
        App.state.session = config.session;
        showShell();
        await go('dashboard');
        startPolling();
        refreshNavCounts();
      } else {
        showAuth();
      }
    } catch (error) {
      document.getElementById('boot').hidden = true;
      ui.toast({ type: 'error', title: 'Startup issue', message: error.message });
      showAuth();
    }
  }

  App.applyTheme = applyTheme;
  App.go = go;
  App.refresh = refresh;
  App.onAuthenticated = onAuthenticated;
  App.signOut = signOut;
  App.updateNavCounts = updateNavCounts;
  App.refreshNavCounts = refreshNavCounts;
  App.setConnection = setConnection;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
