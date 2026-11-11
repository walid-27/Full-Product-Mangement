/* Orders: pipeline, creation, detail and status changes */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, money, dateShort, dateTime, timeAgo, initials } = App.util;
  const ui = App.ui;

  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const PHONE_RE = /^(0[567]\d{8}|\+213[567]\d{7})$/;

  const state = {
    search: '',
    status: '',
    sort: 'createdAt',
    page: 1,
    limit: 12,
    data: null,
    catalog: [],
    names: new Map()
  };

  let listHost = null;

  /* -------------------------------------------------------------- helpers */

  function productName(id) {
    const product = state.names.get(String(id));
    return product ? product.name : `Product ${String(id).slice(-6)}`;
  }

  function shortId(id) {
    return String(id || '').slice(-6).toUpperCase();
  }

  function itemCount(order) {
    return (order.products || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

  function canCancel(order) {
    return ['pending', 'confirmed'].includes(String(order.status || '').toLowerCase());
  }

  function sortedCatalog() {
    return state.catalog
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /* -------------------------------------------------------------- loading */

  async function loadCatalog() {
    try {
      const products = await App.api.products.all({ maxPages: 20 });
      state.catalog = products;
      state.names = new Map(products.map((product) => [String(product._id), product]));
      App.state.catalog = products;
    } catch (error) {
      state.catalog = App.state.catalog || [];
    }
  }

  async function loadList() {
    if (!listHost) return;
    listHost.innerHTML = ui.skeletonRows(6, '38px 1.4fr 1.2fr .7fr .9fr .8fr 1fr .6fr').outerHTML;

    try {
      const data = await App.api.orders.list({
        name: state.search || undefined,
        status: state.status || undefined,
        sort: state.sort,
        page: state.page,
        limit: state.limit
      });
      state.data = data;
      renderList();
    } catch (error) {
      listHost.innerHTML = `<div class="card__body">${ui.alertBox(
        'error',
        `<strong>Could not load orders.</strong><br />${esc(error.message)}`
      )}<div class="row" style="margin-top:12px"><button class="btn btn--ghost btn--sm" data-retry>${App.icon(
        'refresh',
        14
      )} Try again</button></div></div>`;
      const retry = listHost.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => loadList().catch(() => {}));
    }
  }

  /* ------------------------------------------------------------ rendering */

  function renderList() {
    const data = state.data || { orders: [], pagnition: { page: 1, limit: state.limit, total: 0, totalPages: 0 } };
    const orders = data.orders || [];
    const pagnition = data.pagnition || {};

    if (!orders.length) {
      const filtered = Boolean(state.search || state.status);
      listHost.innerHTML = `<div class="card__body">${ui
        .emptyState({
          icon: filtered ? 'search' : 'receipt',
          title: filtered ? 'No order matches these filters' : 'No orders yet',
          text: filtered
            ? 'Try clearing the search or the status filter.'
            : 'Create an order to reserve stock and follow it from pending to delivered.',
          actionLabel: filtered ? 'Clear filters' : 'Create an order',
          onAction: filtered
            ? () => {
                state.search = '';
                state.status = '';
                state.page = 1;
                const search = document.querySelector('#order-search');
                const status = document.querySelector('#order-status');
                if (search) search.value = '';
                if (status) status.value = '';
                loadList().catch(() => {});
              }
            : () => openCreate()
        })
        .outerHTML}</div>`;
      return;
    }

    const rows = orders
      .map((order) => {
        const customer = (order.userInfo && order.userInfo.name) || 'Customer';
        const city = (order.userInfo && order.userInfo.city) || '—';
        const delivery = (order.userInfo && order.userInfo.delivery) || '—';
        return `
          <tr data-id="${esc(order._id)}">
            <td>
              <div class="cell-main__text">
                <div class="cell-title mono">#${esc(shortId(order._id))}</div>
                <div class="cell-sub">${esc(timeAgo(order.createdAt))}</div>
              </div>
            </td>
            <td>
              <div class="cell-main">
                ${ui.avatar(customer, true)}
                <div class="cell-main__text">
                  <div class="cell-title">${esc(customer)}</div>
                  <div class="cell-sub">${esc((order.userInfo && order.userInfo.number) || '')}</div>
                </div>
              </div>
            </td>
            <td>
              <div class="cell-title" style="font-weight:500">${esc(city)}</div>
              <div class="cell-sub">${esc(delivery === 'Desk' ? 'Pickup desk' : 'Home delivery')}</div>
            </td>
            <td class="num">${num(itemCount(order))}</td>
            <td class="num strong">${money(order.totalPrice)}</td>
            <td>${ui.pill(order.status)}</td>
            <td class="right mute small nowrap">${esc(dateShort(order.createdAt))}</td>
            <td class="actions">
              <div class="row-actions">
                <button class="iconbtn" type="button" data-act="view" title="Order details">${App.icon('eye', 15)}</button>
                <button class="iconbtn" type="button" data-act="status" title="Change status">${App.icon('sliders', 15)}</button>
                <button class="iconbtn is-danger" type="button" data-act="cancel" title="Cancel order" ${
                  canCancel(order) ? '' : 'disabled style="opacity:.35"'
                }>${App.icon('ban', 15)}</button>
              </div>
            </td>
          </tr>`;
      })
      .join('');

    listHost.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Delivery</th>
              <th class="num">Items</th>
              <th class="num">Total</th>
              <th>Status</th>
              <th class="right">Created</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div data-foot></div>`;

    const foot = listHost.querySelector('[data-foot]');
    foot.appendChild(
      ui.pagination({
        page: pagnition.page || state.page,
        totalPages: pagnition.totalPages || 0,
        total: pagnition.total || orders.length,
        limit: pagnition.limit || state.limit,
        onPage: (page) => {
          state.page = page;
          loadList().catch(() => {});
        }
      })
    );

    listHost.querySelectorAll('tbody tr[data-id]').forEach((row) => {
      const order = orders.find((item) => item._id === row.getAttribute('data-id'));
      if (!order) return;
      row.addEventListener('click', (event) => {
        if (event.target.closest('[data-act]')) return;
        openDetail(order._id);
      });
      row.querySelectorAll('[data-act]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const action = button.getAttribute('data-act');
          if (action === 'view') openDetail(order._id);
          if (action === 'status') openStatusModal(order);
          if (action === 'cancel') cancelOrder(order);
        });
      });
    });
  }

  /* ---------------------------------------------------------- detail view */

  async function openDetail(orderId) {
    let order = null;
    try {
      order = await App.api.orders.get(orderId);
    } catch (error) {
      // Fall back to whatever the list already knows.
      const known = (state.data && state.data.orders) || [];
      order = known.find((item) => item._id === orderId) || null;
      if (!order) {
        ui.toast({ type: 'error', title: 'Order unavailable', message: error.message });
        return;
      }
    }

    const info = order.userInfo || {};
    const items = order.products || [];
    const total = Number(order.totalPrice) || 0;

    const itemRows = items
      .map((item) => {
        const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
        return `
          <div class="items__row">
            <div class="grow" style="min-width:0">
              <div class="items__name">${esc(productName(item.product))}</div>
              <div class="items__meta">${num(item.price)} DZD × ${num(item.quantity)}</div>
            </div>
            <div class="items__price">${money(lineTotal)}</div>
          </div>`;
      })
      .join('');

    const body = ui.fromHTML(`
      <div class="col" style="gap:16px">
        <div class="row" style="gap:12px;align-items:center">
          ${ui.avatar(info.name || 'Customer')}
          <div class="grow">
            <div class="strong" style="font-size:14px">${esc(info.name || 'Customer')}</div>
            <div class="small mute">#${esc(shortId(order._id))} · ${esc(dateTime(order.createdAt))}</div>
          </div>
          ${ui.pill(order.status)}
        </div>

        <div class="card" style="box-shadow:none">
          <div class="card__body">
            <div class="kv-grid">
              <div class="kv"><div class="kv__label">Phone</div><div class="kv__value">${esc(info.number || '—')}</div></div>
              <div class="kv"><div class="kv__label">City</div><div class="kv__value">${esc(info.city || '—')}</div></div>
              <div class="kv" style="grid-column:span 2"><div class="kv__label">Address</div><div class="kv__value">${esc(
                info.address || '—'
              )}</div></div>
              <div class="kv"><div class="kv__label">Delivery</div><div class="kv__value">${esc(
                info.delivery === 'Desk' ? 'Pickup desk' : 'Home delivery'
              )}</div></div>
              <div class="kv"><div class="kv__label">Last update</div><div class="kv__value">${esc(
                timeAgo(order.updatedAt || order.createdAt)
              )}</div></div>
            </div>
          </div>
        </div>

        <div>
          <div class="row row--between" style="margin-bottom:8px">
            <span class="kv__label" style="margin:0">Items · ${num(itemCount(order))}</span>
            <span class="small mute">Prices at order time</span>
          </div>
          <div class="items">${itemRows || '<div class="items__row"><span class="mute">No items</span></div>'}</div>
        </div>

        <div class="summary">
          <div class="summary__line"><span>Subtotal</span><span>${money(total)}</span></div>
          <div class="summary__line"><span>Delivery</span><span>${esc(
            info.delivery === 'Desk' ? 'Pickup desk' : 'Home'
          )}</span></div>
          <div class="summary__line summary__line--total"><span>Order total</span><span>${money(total)}</span></div>
        </div>

        <div id="detail-error" hidden></div>
      </div>
    `);

    const foot = ui.fromHTML(`
      <div class="row" style="justify-content:space-between;gap:9px;width:100%">
        <button class="btn btn--danger btn--sm" type="button" data-cancel ${canCancel(order) ? '' : 'disabled'}>
          ${App.icon('ban', 14)} Cancel order
        </button>
        <div class="row" style="gap:8px">
          <button class="btn btn--ghost" type="button" data-close>Close</button>
          <button class="btn btn--primary" type="button" data-status>Change status</button>
        </div>
      </div>
    `);

    const ref = ui.modal({
      title: `Order #${shortId(order._id)}`,
      subtitle: 'Customer and item details',
      size: 'drawer',
      body,
      footer: foot
    });

    foot.querySelector('[data-close]').addEventListener('click', () => ref.close());
    foot.querySelector('[data-status]').addEventListener('click', () => {
      ref.close();
      openStatusModal(order);
    });

    const cancelBtn = foot.querySelector('[data-cancel]');
    if (canCancel(order)) {
      cancelBtn.addEventListener('click', () => {
        ref.close();
        cancelOrder(order);
      });
    }
  }

  /* --------------------------------------------------------- status modal */

  function openStatusModal(order) {
    const current = String(order.status || '').toLowerCase();

    const body = ui.fromHTML(`
      <div class="col" style="gap:10px">
        <p class="small mute" style="margin-bottom:2px">
          Order <strong class="mono">#${esc(shortId(order._id))}</strong> for ${esc(
      (order.userInfo && order.userInfo.name) || 'customer'
    )} — ${money(order.totalPrice)}
        </p>
        <div class="col" style="gap:6px" id="status-options">
          ${STATUSES.map((status) => {
            const active = status === current;
            return `<button type="button" class="btn btn--ghost" data-status="${status}"
              style="justify-content:space-between;height:44px;${active ? 'border-color:var(--accent-line)' : ''}"
              ${active ? 'disabled' : ''}>
              <span class="row" style="gap:9px">${ui.pill(status)}</span>
              <span class="small mute">${active ? 'Current' : 'Set'}</span>
            </button>`;
          }).join('')}
        </div>
        <div id="status-error" hidden></div>
      </div>
    `);

    const foot = ui.fromHTML(`
      <div class="row" style="justify-content:flex-end;width:100%">
        <button class="btn btn--ghost" type="button" data-close>Close</button>
      </div>
    `);

    const ref = ui.modal({
      title: 'Update order status',
      subtitle: 'The API validates the next status',
      size: 'sm',
      body,
      footer: foot
    });

    foot.querySelector('[data-close]').addEventListener('click', () => ref.close());
    const errorBox = body.querySelector('#status-error');

    body.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        const status = button.getAttribute('data-status');
        button.classList.add('is-loading');
        button.disabled = true;
        try {
          await App.api.orders.setStatus(order._id, status);
          ui.toast({ type: 'success', title: 'Status updated', message: `Order #${shortId(order._id)} is now ${status}.` });
          ref.close();
          await loadList();
          if (App.refreshNavCounts) App.refreshNavCounts();
        } catch (error) {
          errorBox.hidden = false;
          errorBox.innerHTML = ui.alertBox('error', esc(error.message));
          button.classList.remove('is-loading');
          button.disabled = false;
        }
      });
    });
  }

  async function cancelOrder(order) {
    const confirmed = await ui.confirm({
      title: 'Cancel this order?',
      message: `Order #${shortId(order._id)} for ${(order.userInfo && order.userInfo.name) || 'the customer'} will be cancelled and its items returned to stock.`,
      confirmText: 'Cancel order',
      danger: true
    });
    if (!confirmed) return;

    try {
      await App.api.orders.cancel(order._id);
      ui.toast({ type: 'success', title: 'Order cancelled', message: 'Stock has been returned to inventory.' });
      await Promise.all([loadList(), loadCatalog()]);
      if (App.refreshNavCounts) App.refreshNavCounts();
    } catch (error) {
      ui.toast({ type: 'error', title: 'Could not cancel', message: error.message });
    }
  }

  /* --------------------------------------------------------- create order */

  function openCreate() {
    if (!state.catalog.length) {
      ui.toast({
        type: 'warn',
        title: 'No products yet',
        message: 'Create at least one product before taking an order.'
      });
      App.go('products', { create: true });
      return;
    }

    const selection = new Map(); // product id -> quantity
    const variantSelections = new Map(); // product id -> variant SKU

    const body = ui.fromHTML(`
      <div class="form-grid" style="gap:18px">
        <div class="picker">
          <div class="input-group input-group--clear">
            ${App.icon('search', 15)}
            <input class="input" id="picker-search" placeholder="Search the catalogue…" />
          </div>
          <div class="picker__list" id="picker-list"></div>
          <div class="small mute" id="picker-hint">Pick products and set quantities.</div>
        </div>

        <div class="col" style="gap:12px">
          <div class="form-grid" style="gap:10px">
            <label class="field span-2">
              <span class="field__label">Customer name</span>
              <input class="input" name="name" placeholder="Amine Belkacem" autocomplete="off" />
            </label>
            <label class="field">
              <span class="field__label">Phone</span>
              <input class="input" name="number" placeholder="0551234567" inputmode="tel" autocomplete="off" />
            </label>
            <label class="field">
              <span class="field__label">City</span>
              <input class="input" name="city" placeholder="Alger" autocomplete="off" />
            </label>
            <label class="field span-2">
              <span class="field__label">Address</span>
              <input class="input" name="address" placeholder="Street, building, landmark…" autocomplete="off" />
            </label>
          </div>

          <div class="field">
            <span class="field__label">Delivery</span>
            <div class="segmented" id="delivery-tabs" style="width:100%">
              <button type="button" class="segmented__btn is-active" data-delivery="Domicile" style="flex:1;justify-content:center">
                ${App.icon('truck', 14)} Home delivery
              </button>
              <button type="button" class="segmented__btn" data-delivery="Desk" style="flex:1;justify-content:center">
                ${App.icon('bag', 14)} Pickup desk
              </button>
            </div>
          </div>

          <div class="summary" id="order-summary"></div>
          <div id="order-error" hidden></div>
        </div>
      </div>
    `);

    const foot = ui.fromHTML(`
      <div class="row" style="justify-content:space-between;gap:9px;width:100%">
        <span class="small mute" id="order-foot-note">Stock is reserved as soon as the order is created.</span>
        <div class="row" style="gap:9px">
          <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
          <button class="btn btn--primary" type="button" data-submit>Create order</button>
        </div>
      </div>
    `);

    const ref = ui.modal({
      title: 'New order',
      subtitle: 'Reserve stock and register customer delivery details',
      size: 'wide',
      body,
      footer: foot
    });

    const pickerList = body.querySelector('#picker-list');
    const pickerSearch = body.querySelector('#picker-search');
    const summary = body.querySelector('#order-summary');
    const errorBox = body.querySelector('#order-error');
    const submit = foot.querySelector('[data-submit]');
    let delivery = 'Domicile';

    const catalog = sortedCatalog();
    const selectedVariant = (product) => {
      if (!product.variants?.length) return null;
      const sku = variantSelections.get(product._id) || product.variants.find((variant) => variant.stock > 0)?.sku || product.variants[0].sku;
      return product.variants.find((variant) => variant.sku === sku) || product.variants[0];
    };
    const stockFor = (product) => selectedVariant(product)?.stock ?? Number(product.stock) ?? 0;

    function total() {
      let value = 0;
      for (const [id, qty] of selection.entries()) {
        const product = state.names.get(String(id));
        if (product) value += Number(product.price) * qty;
      }
      return value;
    }

    function renderPicker() {
      const needle = pickerSearch.value.trim().toLowerCase();
      const products = catalog.filter(
        (product) =>
          !needle ||
          String(product.name).toLowerCase().includes(needle) ||
          String(product.category || '').toLowerCase().includes(needle)
      );

      if (!products.length) {
        pickerList.innerHTML = `<div class="empty" style="padding:28px 16px">
          <div class="empty__icon">${App.icon('search', 20)}</div>
          <div class="empty__title">No match</div>
          <div class="empty__text">No product matches “${esc(pickerSearch.value)}”.</div>
        </div>`;
        return;
      }

      pickerList.innerHTML = products
        .map((product) => {
          const stock = stockFor(product);
          const selected = selection.get(product._id) || 0;
          const disabled = stock <= 0;
          return `
            <div class="picker__item ${selected ? 'is-selected' : ''}" data-pid="${esc(product._id)}">
              ${ui.thumb(product)}
              <div class="picker__info">
                <div class="picker__name">${esc(product.name)}</div>
                <div class="picker__meta">${money(product.price)} · ${
            disabled ? '<span class="rose">out of stock</span>' : `${num(stock)} available`
          }</div>
              </div>
              ${product.variants?.length ? `<select class="input input--sm" data-variant aria-label="Variant for ${esc(product.name)}">${product.variants.map((variant) => `<option value="${esc(variant.sku)}" ${selectedVariant(product)?.sku === variant.sku ? 'selected' : ''} ${variant.stock <= 0 ? 'disabled' : ''}>${esc([variant.sku, variant.size, variant.color].filter(Boolean).join(' · '))} (${num(variant.stock)})</option>`).join('')}</select>` : ''}
              <div class="stepper">
                <button type="button" data-step="-1" ${selected <= 0 ? 'disabled' : ''}>${App.icon('minus', 12)}</button>
                <input type="number" value="${selected}" min="0" max="${stock}" data-qty ${disabled ? 'disabled' : ''} />
                <button type="button" data-step="1" ${disabled || selected >= stock ? 'disabled' : ''}>${App.icon(
            'plus',
            12
          )}</button>
              </div>
            </div>`;
        })
        .join('');

      pickerList.querySelectorAll('.picker__item').forEach((row) => {
        const product = state.names.get(row.getAttribute('data-pid'));
        if (!product) return;
        const stock = stockFor(product);
        const qtyInput = row.querySelector('[data-qty]');

        const apply = (value) => {
          const qty = App.util.clamp(Math.trunc(value), 0, stock);
          if (qty <= 0) selection.delete(product._id);
          else selection.set(product._id, qty);
          renderPicker();
          renderSummary();
        };

        row.querySelectorAll('[data-step]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            apply((selection.get(product._id) || 0) + Number(button.getAttribute('data-step')));
          });
        });

        qtyInput.addEventListener('click', (event) => event.stopPropagation());
        qtyInput.addEventListener('change', () => apply(Number(qtyInput.value) || 0));
        const variantInput = row.querySelector('[data-variant]');
        if (variantInput) {
          variantInput.addEventListener('click', (event) => event.stopPropagation());
          variantInput.addEventListener('change', () => {
            variantSelections.set(product._id, variantInput.value);
            selection.delete(product._id);
            renderPicker();
            renderSummary();
          });
        }

        row.addEventListener('click', () => {
          if (stock <= 0) return;
          if (selection.has(product._id)) selection.delete(product._id);
          else selection.set(product._id, 1);
          renderPicker();
          renderSummary();
        });
      });
    }

    function renderSummary() {
      const lines = Array.from(selection.entries())
        .map(([id, qty]) => {
          const product = state.names.get(String(id));
          if (!product) return '';
          const variant = selectedVariant(product);
          return `<div class="summary__line"><span>${esc(product.name)}${variant ? ` · ${esc(variant.sku)}` : ''} × ${num(qty)}</span><span>${money(
            Number(product.price) * qty
          )}</span></div>`;
        })
        .join('');

      const count = Array.from(selection.values()).reduce((sum, qty) => sum + qty, 0);
      summary.innerHTML = `
        ${lines || '<div class="summary__line"><span class="mute">No product selected</span><span>—</span></div>'}
        <div class="summary__line summary__line--total"><span>Total · ${num(count)} ${App.util.plural(
        count,
        'item'
      )}</span><span>${money(total())}</span></div>
      `;
      body.querySelector('#picker-hint').textContent = selection.size
        ? `${selection.size} ${App.util.plural(selection.size, 'product')} selected · ${num(count)} units`
        : 'Pick products and set quantities.';
      submit.disabled = selection.size === 0;
    }

    pickerSearch.addEventListener(
      'input',
      App.util.debounce(() => renderPicker(), 200)
    );

    body.querySelectorAll('[data-delivery]').forEach((button) => {
      button.addEventListener('click', () => {
        delivery = button.getAttribute('data-delivery');
        body.querySelectorAll('[data-delivery]').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
      });
    });

    foot.querySelector('[data-cancel]').addEventListener('click', () => ref.close());

    submit.addEventListener('click', async () => {
      errorBox.hidden = true;

      const name = body.querySelector('[name="name"]').value.trim();
      const number = body.querySelector('[name="number"]').value.trim();
      const city = body.querySelector('[name="city"]').value.trim();
      const address = body.querySelector('[name="address"]').value.trim();

      const problems = [];
      if (!selection.size) problems.push('Select at least one product.');
      if (!name) problems.push('Customer name is required.');
      if (!PHONE_RE.test(number)) problems.push('Enter a valid Algerian mobile number, e.g. 0551234567.');
      if (!city) problems.push('City is required.');
      if (!address) problems.push('Address is required.');

      if (problems.length) {
        errorBox.hidden = false;
        errorBox.innerHTML = ui.alertBox('error', problems.map((item) => esc(item)).join('<br />'));
        return;
      }

      ui.setBusy(submit, true);
      try {
        const products = Array.from(selection.entries()).map(([id, quantity]) => {
          const product = state.names.get(String(id));
          const variant = product && selectedVariant(product);
          return { product: id, quantity, ...(variant ? { variantSku: variant.sku } : {}) };
        });
        const created = await App.api.orders.create({
          products,
          userInfo: { name, number, city, address, delivery }
        });

        // Keep the local movement trail in sync with the sales we just made.
        if (App.views.inventory && App.views.inventory.addActivity) {
          for (const line of products) {
            const product = state.names.get(String(line.product));
            const before = product ? Number(product.stock) || 0 : undefined;
            App.views.inventory.addActivity({
              productId: line.product,
              productName: product ? product.name : productName(line.product),
              action: 'out',
              quantity: line.quantity,
              stockBefore: before,
              stockAfter: before === undefined ? undefined : Math.max(0, before - line.quantity),
              note: `order #${shortId(created && created._id)}`
            });
          }
        }

        ui.toast({
          type: 'success',
          title: 'Order created',
          message: `${money(total())} · stock has been reserved.`
        });
        ref.close();
        await Promise.all([loadList(), loadCatalog()]);
        if (App.refreshNavCounts) App.refreshNavCounts();
      } catch (error) {
        errorBox.hidden = false;
        errorBox.innerHTML = ui.alertBox('error', esc(error.message));
        ui.setBusy(submit, false);
        submit.disabled = selection.size === 0;
      }
    });

    renderPicker();
    renderSummary();
    body.querySelector('[name="name"]').focus();
  }

  /* ------------------------------------------------------------------ view */

  async function mount(viewHost, params) {
    state.page = 1;

    viewHost.innerHTML = `<div class="view__inner">
      <div class="card">
        <div class="card__head" style="flex-wrap:wrap;gap:10px">
          <div class="toolbar">
            <div class="input-group input-group--clear search">
              ${App.icon('search', 15)}
              <input class="input" id="order-search" placeholder="Customer or city…" value="${esc(state.search)}" />
              <button class="input-group__clear" type="button" data-clear aria-label="Clear">${App.icon('close', 13)}</button>
            </div>
            <select class="select width-auto" id="order-status" style="min-width:150px">
              <option value="">All statuses</option>
              ${STATUSES.map(
                (status) =>
                  `<option value="${status}"${state.status === status ? ' selected' : ''}>${App.util.capitalize(
                    status
                  )}</option>`
              ).join('')}
            </select>
            <select class="select width-auto" id="order-sort" style="min-width:150px">
              <option value="createdAt">Newest first</option>
              <option value="totalPrice">Highest total</option>
            </select>
          </div>
          <button class="btn btn--quiet btn--icon btn--sm" type="button" id="reload-orders" title="Refresh">
            ${App.icon('refresh', 15)}
          </button>
        </div>
        <div id="orders-list"></div>
      </div>
    </div>`;

    listHost = viewHost.querySelector('#orders-list');
    viewHost.querySelector('#order-sort').value = state.sort;

    const search = viewHost.querySelector('#order-search');
    search.addEventListener(
      'input',
      App.util.debounce(() => {
        state.search = search.value.trim();
        state.page = 1;
        loadList().catch(() => {});
      }, 300)
    );

    viewHost.querySelector('[data-clear]').addEventListener('click', () => {
      search.value = '';
      state.search = '';
      state.page = 1;
      loadList().catch(() => {});
    });

    viewHost.querySelector('#order-status').addEventListener('change', (event) => {
      state.status = event.target.value;
      state.page = 1;
      loadList().catch(() => {});
    });

    viewHost.querySelector('#order-sort').addEventListener('change', (event) => {
      state.sort = event.target.value;
      state.page = 1;
      loadList().catch(() => {});
    });

    viewHost.querySelector('#reload-orders').addEventListener('click', () => {
      Promise.all([loadList(), loadCatalog()]).catch(() => {});
    });

    await Promise.all([loadCatalog(), loadList()]);

    if (params && params.openOrder) openDetail(params.openOrder);
  }

  App.views = App.views || {};
  App.views.orders = {
    title: 'Orders',
    subtitle: 'Follow every order from pending to delivered.',
    actions: [
      {
        label: 'New order',
        icon: 'plus',
        variant: 'primary',
        onClick: () => openCreate()
      }
    ],
    mount,
    openCreate,
    openDetail,
    reload: () => loadList().catch(() => {})
  };
})();
