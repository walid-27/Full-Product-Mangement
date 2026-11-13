/* Inventory: stock levels, low/out of stock alerts, stock movements */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, money, moneyShort, timeAgo } = App.util;
  const ui = App.ui;

  const ACTIVITY_KEY = 'stockflow:activity:v1';

  const state = {
    tab: 'all',
    search: '',
    products: [],
    low: [],
    out: [],
    activity: []
  };

  let host = null;

  /* ------------------------------------------------------------- activity */

  function loadActivity() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
      state.activity = Array.isArray(raw) ? raw : [];
    } catch (error) {
      state.activity = [];
    }
    return state.activity;
  }

  function saveActivity() {
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(state.activity.slice(0, 120)));
    } catch (error) {
      /* storage may be unavailable */
    }
  }

  function addActivity(entry) {
    loadActivity();
    state.activity.unshift({ at: new Date().toISOString(), ...entry });
    saveActivity();
  }

  function clearActivity() {
    state.activity = [];
    saveActivity();
  }

  /**
   * Load the server-side movement history (GET /features/reports/movements).
   * Falls back to the local log when the endpoint is unavailable.
   */
  async function loadServerMovements() {
    try {
      const data = await App.api.reports.movements({ limit: 100 });
      const movements = (data && data.movements) || [];
      if (!movements.length) {
        loadActivity();
        return;
      }
      const names = new Map(state.products.map((product) => [String(product._id), product.name]));
      state.activity = movements.map((movement) => {
        const productId = movement.product && typeof movement.product === 'object'
          ? movement.product._id
          : movement.product;
        return {
          at: movement.createdAt || movement.updatedAt,
          productId,
          productName: movement.productName || (movement.product && movement.product.name) || names.get(String(productId)) || 'Product',
          action: movement.action,
          quantity: movement.quantity,
          stockBefore: movement.stockBefore,
          stockAfter: movement.stockAfter,
          variantSku: movement.variantSku || null
        };
      });
    } catch (error) {
      loadActivity();
    }
  }

  /* ---------------------------------------------------------------- stock */

  function stockBar(product) {
    const stock = Number(product.stock) || 0;
    const threshold = Number(product.lowStockThreshold) || 5;
    const capacity = Math.max(threshold * 4, stock, 10);
    const pct = stock === 0 ? 0 : App.util.clamp(Math.round((stock / capacity) * 100), 6, 100);
    const level = stock === 0 ? 'is-out' : stock <= threshold ? 'is-low' : '';
    return `
      <div class="stock">
        <div class="stock__line">
          <span class="stock__value">${num(stock)}</span>
          <span class="stock__of">${stock === 0 ? 'out' : `min ${num(threshold)}`}</span>
        </div>
        <div class="stock__track"><div class="stock__fill ${level}" style="width:${pct}%"></div></div>
      </div>`;
  }

  function statusPill(product) {
    const stock = Number(product.stock) || 0;
    const threshold = Number(product.lowStockThreshold) || 5;
    if (stock === 0) return '<span class="pill pill--out"><span class="dot"></span>Out of stock</span>';
    if (stock <= threshold) return '<span class="pill pill--low"><span class="dot"></span>Low stock</span>';
    return '<span class="pill pill--delivered"><span class="dot"></span>In stock</span>';
  }

  function productRows(products, emptyMessage) {
    if (!products.length) {
      return { html: '', empty: emptyMessage };
    }
    const html = products
      .map(
        (product) => `
        <tr data-id="${esc(product._id)}">
          <td>
            <div class="cell-main">
              ${ui.thumb(product)}
              <div class="cell-main__text">
                <div class="cell-title">${esc(product.name)}</div>
                <div class="cell-sub">${esc(product.category || 'Uncategorised')}</div>
              </div>
            </div>
          </td>
          <td>${stockBar(product)}</td>
          <td>${statusPill(product)}</td>
          <td class="num">${money((Number(product.price) || 0) * (Number(product.stock) || 0))}</td>
          <td class="actions">
            <div class="row-actions">
              <button class="btn btn--ghost btn--sm" type="button" data-act="in" title="Stock in">
                ${App.icon('plus', 13)} In
              </button>
              <button class="btn btn--ghost btn--sm" type="button" data-act="out" title="Stock out" ${
                Number(product.stock) === 0 ? 'disabled' : ''
              }>
                ${App.icon('minus', 13)} Out
              </button>
            </div>
          </td>
        </tr>`
      )
      .join('');
    return { html, empty: null };
  }

  function productTable(products, emptyState) {
    const { html, empty } = productRows(products);
    if (empty) {
      return `<div class="card__body">${ui.emptyState(emptyState).outerHTML}</div>`;
    }
    return `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Stock level</th>
              <th>Status</th>
              <th class="num">Stock value</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>${html}</tbody>
        </table>
      </div>`;
  }

  function activityMarkup() {
    if (!state.activity.length) {
      return `<div class="card__body">${ui.emptyState({
        icon: 'clock',
        title: 'No movements recorded yet',
        text: 'Every stock-in and stock-out is recorded by the API as a movement. Adjust stock to create the first entry.',
        actionLabel: 'Adjust stock',
        onAction: () => {
          state.tab = 'all';
          render();
        }
      }).outerHTML}</div>`;
    }

    const rows = state.activity
      .slice(0, 60)
      .map((entry) => {
        const isIn = entry.action === 'in';
        const delta = `${isIn ? '+' : '−'}${num(entry.quantity)}`;
        return `
          <div class="timeline__item ${isIn ? '' : 'timeline__item--out'}">
            <span class="timeline__dot"></span>
            <div class="timeline__body">
              <div class="row row--between" style="gap:10px">
                <span class="timeline__title">${esc(entry.productName || 'Product')}</span>
                <span class="strong ${isIn ? 'accent' : 'rose'} tnum">${delta}</span>
              </div>
              <div class="timeline__meta">
                ${isIn ? 'Stock in' : 'Stock out'}${
          entry.note ? ` · ${esc(entry.note)}` : ''
        } · ${entry.stockBefore !== undefined ? `${num(entry.stockBefore)} → ${num(entry.stockAfter)}` : ''}
                · ${esc(timeAgo(entry.at))}
              </div>
            </div>
          </div>`;
      })
      .join('');

    return `
      <div class="card__body">
        <div class="row row--between" style="margin-bottom:8px">
          <span class="small mute">Server movement history · last ${Math.min(state.activity.length, 60)} movements</span>
          <button class="btn btn--quiet btn--sm" type="button" data-clear-activity>Clear local log</button>
        </div>
        <div class="timeline">${rows}</div>
      </div>`;
  }

  /* ------------------------------------------------------------- rendering */

  function render() {
    if (!host) return;
    const totalUnits = state.products.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);
    const totalValue = state.products.reduce(
      (sum, product) => sum + (Number(product.price) || 0) * (Number(product.stock) || 0),
      0
    );

    const search = state.search.toLowerCase();
    const filtered = search
      ? state.products.filter((product) => String(product.name).toLowerCase().includes(search))
      : state.products;

    host.innerHTML = `
      <div class="stat-grid">
        <div class="stat stat--blue">
          <div class="stat__top"><span class="stat__label">Units on hand</span><span class="stat__icon">${App.icon(
            'layers',
            16
          )}</span></div>
          <div class="stat__value">${num(totalUnits)}</div>
          <div class="stat__meta">Across ${num(state.products.length)} ${App.util.plural(
      state.products.length,
      'product'
    )}</div>
        </div>
        <div class="stat stat--amber">
          <div class="stat__top"><span class="stat__label">Low stock</span><span class="stat__icon">${App.icon(
            'alert',
            16
          )}</span></div>
          <div class="stat__value">${num(state.low.length)}</div>
          <div class="stat__meta">At or below the low-stock threshold</div>
        </div>
        <div class="stat stat--rose">
          <div class="stat__top"><span class="stat__label">Out of stock</span><span class="stat__icon">${App.icon(
            'ban',
            16
          )}</span></div>
          <div class="stat__value">${num(state.out.length)}</div>
          <div class="stat__meta">${state.out.length ? 'Restock to keep selling' : 'Nothing is sold out'}</div>
        </div>
        <div class="stat stat--violet">
          <div class="stat__top"><span class="stat__label">Stock value</span><span class="stat__icon">${App.icon(
            'wallet',
            16
          )}</span></div>
          <div class="stat__value">${moneyShort(totalValue)}</div>
          <div class="stat__meta">Price × quantity on hand</div>
        </div>
      </div>

      <div class="card">
        <div class="card__head" style="flex-wrap:wrap;gap:10px">
          <div class="segmented" id="inv-tabs">
            <button type="button" class="segmented__btn ${state.tab === 'all' ? 'is-active' : ''}" data-tab="all">
              ${App.icon('box', 14)} All stock <span class="count">${state.products.length}</span>
            </button>
            <button type="button" class="segmented__btn ${state.tab === 'low' ? 'is-active' : ''}" data-tab="low">
              ${App.icon('alert', 14)} Low <span class="count">${state.low.length}</span>
            </button>
            <button type="button" class="segmented__btn ${state.tab === 'out' ? 'is-active' : ''}" data-tab="out">
              ${App.icon('ban', 14)} Out <span class="count">${state.out.length}</span>
            </button>
            <button type="button" class="segmented__btn ${state.tab === 'activity' ? 'is-active' : ''}" data-tab="activity">
              ${App.icon('clock', 14)} Activity
            </button>
          </div>
          <div class="toolbar">
            ${
              state.tab === 'all'
                ? `<div class="input-group input-group--clear search" style="width:210px">
                     ${App.icon('search', 15)}
                     <input class="input" id="inv-search" placeholder="Filter products…" value="${esc(state.search)}" />
                   </div>`
                : ''
            }
            <button class="btn btn--quiet btn--icon btn--sm" type="button" data-refresh title="Refresh">
              ${App.icon('refresh', 15)}
            </button>
          </div>
        </div>
        <div id="inv-body">
          ${
            state.tab === 'all'
              ? productTable(filtered, {
                  icon: search ? 'search' : 'box',
                  title: search ? 'No product matches this filter' : 'No products yet',
                  text: search
                    ? 'Try another name.'
                    : 'Create a product first, then record stock movements here.'
                })
              : state.tab === 'low'
              ? productTable(state.low, {
                  icon: 'check',
                  title: 'No low-stock products',
                  text: 'Every product is above its low-stock threshold.'
                })
              : state.tab === 'out'
              ? productTable(state.out, {
                  icon: 'check',
                  title: 'Nothing is out of stock',
                  text: 'All your products are available for sale.'
                })
              : activityMarkup()
          }
        </div>
      </div>`;

    ui.hydrateImages(host);
    bindBody(filtered);
  }

  function bindBody(visibleProducts) {
    host.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.tab = button.getAttribute('data-tab');
        render();
      });
    });

    const refresh = host.querySelector('[data-refresh]');
    if (refresh) refresh.addEventListener('click', () => App.refresh());

    const localSearch = host.querySelector('#inv-search');
    if (localSearch) {
      localSearch.addEventListener(
        'input',
        App.util.debounce(() => {
          state.search = localSearch.value.trim();
          render();
          const again = host.querySelector('#inv-search');
          if (again) {
            again.focus();
            again.setSelectionRange(again.value.length, again.value.length);
          }
        }, 260)
      );
    }

    const clear = host.querySelector('[data-clear-activity]');
    if (clear) {
      clear.addEventListener('click', async () => {
        const confirmed = await ui.confirm({
          title: 'Clear the local log?',
          message: 'The movement history stored on this computer will be deleted. Your API data is not touched.',
          confirmText: 'Clear log',
          danger: true
        });
        if (!confirmed) return;
        clearActivity();
        render();
      });
    }

    const lookup = new Map([
      ...state.products.map((product) => [product._id, product]),
      ...state.low.map((product) => [product._id, product]),
      ...state.out.map((product) => [product._id, product])
    ]);

    host.querySelectorAll('tbody tr[data-id]').forEach((row) => {
      const product = lookup.get(row.getAttribute('data-id'));
      if (!product) return;
      row.querySelectorAll('[data-act]').forEach((button) => {
        button.addEventListener('click', () => {
          openStockModal(product, button.getAttribute('data-act') === 'out' ? 'out' : 'in');
        });
      });
    });
  }

  /* --------------------------------------------------------- stock modal */

  function openStockModal(product, direction, onDone) {
    let mode = direction === 'out' ? 'out' : 'in';
    const parentStock = Number(product.stock) || 0;
    let initialStock = product.variants?.length ? Number(product.variants[0].stock) || 0 : parentStock;
    let variantSku = product.variants?.[0]?.sku || null;

    const body = ui.fromHTML(`
      <div class="col" style="gap:14px">
        <div class="row" style="gap:12px;align-items:center">
          <span class="thumb thumb--lg" data-image="${esc(product.image || '')}" data-fallback="${esc(
      App.util.initials(product.name)
    )}">${esc(App.util.initials(product.name))}</span>
          <div class="grow">
            <div class="strong">${esc(product.name)}</div>
            <div class="small mute">${esc(product.category || 'Uncategorised')} · ${num(initialStock)} units on hand</div>
          </div>
        </div>

        <div class="segmented" id="dir-tabs" style="width:100%">
          <button type="button" class="segmented__btn" data-dir="in" style="flex:1;justify-content:center">
            ${App.icon('download', 14)} Stock in
          </button>
          <button type="button" class="segmented__btn" data-dir="out" style="flex:1;justify-content:center">
            ${App.icon('upload', 14)} Stock out
          </button>
        </div>

        ${product.variants?.length ? `<label class="field"><span class="field__label">Variant</span><select class="input" id="stock-variant">${product.variants.map((variant) => `<option value="${esc(variant.sku)}">${esc([variant.sku, variant.size, variant.color].filter(Boolean).join(' · '))} · ${num(variant.stock)} units</option>`).join('')}</select></label>` : ''}
        <label class="field">
          <span class="field__label">Quantity</span>
          <div class="row" style="gap:8px">
            <div class="stepper" style="height:38px">
              <button type="button" data-step="-1">${App.icon('minus', 12)}</button>
              <input type="number" id="qty" value="1" min="1" step="1" />
              <button type="button" data-step="1">${App.icon('plus', 12)}</button>
            </div>
            <div class="row" style="gap:6px">
              ${[5, 10, 25]
                .map(
                  (value) =>
                    `<button class="btn btn--ghost btn--sm" type="button" data-quick="${value}">+${value}</button>`
                )
                .join('')}
            </div>
          </div>
          <span class="field__hint" id="qty-hint"></span>
        </label>

        <div id="stock-preview" class="alert alert--accent">
          ${App.icon('layers', 16)}
          <div id="stock-preview-text"></div>
        </div>
        <div id="stock-error" hidden></div>
      </div>
    `);

    const foot = ui.fromHTML(`
      <div class="row" style="justify-content:flex-end;gap:9px;width:100%">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--primary" type="button" data-submit>Apply</button>
      </div>
    `);

    const ref = ui.modal({
      title: 'Adjust stock',
      subtitle: 'Recorded as an inventory movement in the API',
      size: 'sm',
      body,
      footer: foot
    });

    const qtyInput = body.querySelector('#qty');
    const hint = body.querySelector('#qty-hint');
    const previewText = body.querySelector('#stock-preview-text');
    const previewBox = body.querySelector('#stock-preview');
    const errorBox = body.querySelector('#stock-error');
    const submit = foot.querySelector('[data-submit]');

    if (product.image) {
      App.api.images.resolve(product.image).then((dataUrl) => {
        if (dataUrl) {
          const node = body.querySelector('[data-image]');
          if (node) node.innerHTML = `<img alt="" src="${dataUrl}" />`;
        }
      });
    }

    function quantity() {
      const value = Number(qtyInput.value);
      return Number.isFinite(value) ? Math.trunc(value) : 0;
    }

    function sync() {
      body.querySelectorAll('[data-dir]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-dir') === mode);
      });
      const qty = Math.max(0, quantity());
      const after = mode === 'in' ? initialStock + qty : initialStock - qty;
      const invalid = mode === 'out' && qty > initialStock;

      previewBox.className = `alert ${invalid ? 'alert--error' : 'alert--accent'}`;
      previewText.innerHTML = invalid
        ? `<strong>Not enough stock.</strong> Only ${num(initialStock)} units are available.`
        : `${mode === 'in' ? 'Adding' : 'Removing'} <strong>${num(qty)}</strong> ${
            qty === 1 ? 'unit' : 'units'
          } → stock after: <strong>${num(Math.max(after, 0))}</strong>`;

      hint.textContent =
        mode === 'out'
          ? `Maximum ${num(initialStock)} units.`
          : 'New stock is added to the current quantity.';
      submit.textContent = mode === 'in' ? 'Add stock' : 'Remove stock';
      submit.classList.toggle('btn--danger', mode === 'out');
      submit.classList.toggle('btn--primary', mode === 'in');
      submit.disabled = invalid || qty < 1;
    }

    body.querySelectorAll('[data-dir]').forEach((button) => {
      button.addEventListener('click', () => {
        mode = button.getAttribute('data-dir');
        sync();
      });
    });

    body.querySelectorAll('[data-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const delta = Number(button.getAttribute('data-step'));
        qtyInput.value = String(Math.max(1, quantity() + delta));
        sync();
      });
    });

    body.querySelectorAll('[data-quick]').forEach((button) => {
      button.addEventListener('click', () => {
        qtyInput.value = String(quantity() + Number(button.getAttribute('data-quick')));
        sync();
      });
    });

    qtyInput.addEventListener('input', sync);
    const variantInput = body.querySelector('#stock-variant');
    if (variantInput) variantInput.addEventListener('change', () => {
      variantSku = variantInput.value;
      const variant = product.variants.find((item) => item.sku === variantSku);
      initialStock = Number(variant?.stock) || 0;
      sync();
    });
    foot.querySelector('[data-cancel]').addEventListener('click', () => ref.close());

    submit.addEventListener('click', async () => {
      const qty = quantity();
      if (qty < 1) return;
      errorBox.hidden = true;
      ui.setBusy(submit, true);

      try {
        const result = mode === 'in'
          ? await App.api.inventory.stockIn(product._id, qty, variantSku)
          : await App.api.inventory.stockOut(product._id, qty, variantSku);

        const movement = (result && result.new_Quantity) || {};
        const stockAfter = Number(movement.stockAfter);
        const finalStock = Number.isFinite(stockAfter) ? stockAfter : mode === 'in' ? parentStock + qty : parentStock - qty;

        addActivity({
          productId: product._id,
          productName: product.name,
          action: mode,
          quantity: qty,
          stockBefore: parentStock,
          stockAfter: finalStock
        });

        ui.toast({
          type: 'success',
          title: mode === 'in' ? 'Stock added' : 'Stock removed',
          message: `${product.name} now has ${num(finalStock)} units.`
        });

        ref.close();
        if (typeof onDone === 'function') onDone(finalStock);
        if (App.refreshNavCounts) App.refreshNavCounts();
        if (['inventory', 'products', 'dashboard'].includes(App.state.route)) App.refresh();
      } catch (error) {
        errorBox.hidden = false;
        errorBox.innerHTML = ui.alertBox('error', esc(error.message));
        ui.setBusy(submit, false);
        submit.disabled = false;
      }
    });

    sync();
    setTimeout(() => {
      qtyInput.focus();
      qtyInput.select();
    }, 40);
  }

  /* ------------------------------------------------------------------ view */

  async function mount(container) {
    container.innerHTML = `<div class="view__inner">
      <div class="stat-grid">${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}</div>
      <div class="card">${ui.skeletonRows(6).outerHTML}</div>
    </div>`;

    let products = [];
    let low = [];
    let out = [];

    try {
      const results = await Promise.all([
        App.api.products.all(),
        App.api.inventory.lowStock(),
        App.api.inventory.outOfStock()
      ]);
      products = results[0];
      low = results[1];
      out = results[2];
    } catch (error) {
      container.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">
        ${ui.alertBox('error', `<strong>Could not load inventory.</strong><br />${esc(error.message)}`)}
        <div class="row" style="margin-top:12px"><button class="btn btn--ghost" data-retry>${App.icon(
          'refresh',
          15
        )} Try again</button></div>
      </div></div></div>`;
      const retry = container.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => App.refresh());
      return;
    }

    state.products = products;
    state.low = low;
    state.out = out;
    await loadServerMovements();

    App.state.catalog = products;
    App.state.lowStock = low;
    App.state.outOfStock = out;
    if (App.updateNavCounts) App.updateNavCounts();

    container.innerHTML = '<div class="view__inner" id="inventory-root"></div>';
    host = container.querySelector('#inventory-root');
    render();
  }

  App.views = App.views || {};
  App.views.inventory = {
    title: 'Inventory',
    subtitle: 'Stock levels, alerts and movement history.',
    actions: [
      {
        label: 'Refresh',
        icon: 'refresh',
        variant: 'ghost',
        onClick: () => App.refresh()
      }
    ],
    mount,
    openStockModal,
    addActivity,
    loadActivity
  };
})();
