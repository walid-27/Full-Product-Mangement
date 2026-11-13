/* Dashboard: catalogue, stock and sales overview */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, money, moneyShort, dateShort, timeAgo, dateTime } = App.util;
  const ui = App.ui;

  const STATUS_ORDER = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const STATUS_COLOR = {
    pending: 'var(--amber)',
    confirmed: 'var(--blue)',
    shipped: 'var(--violet)',
    delivered: 'var(--accent)',
    cancelled: 'var(--rose)'
  };

  function statCard(options) {
    return `
      <div class="stat stat--${options.tone || 'accent'}">
        <div class="stat__top">
          <span class="stat__label">${esc(options.label)}</span>
          <span class="stat__icon">${App.icon(options.icon, 16)}</span>
        </div>
        <div class="stat__value">${options.value}</div>
        <div class="stat__meta">${options.meta || ''}</div>
      </div>`;
  }

  function buildSeries(orders) {
    const days = [];
    const today = App.util.startOfDay();

    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(day.getDate() - offset);
      days.push({
        key: App.util.dayKey(day),
        date: day,
        orders: 0,
        revenue: 0
      });
    }

    const byKey = new Map(days.map((day) => [day.key, day]));

    for (const order of orders) {
      const key = App.util.dayKey(order.createdAt);
      const day = byKey.get(key);
      if (!day) continue;
      day.orders += 1;
      if (order.status === 'delivered') day.revenue += Number(order.totalPrice) || 0;
    }

    return days;
  }

  function chartMarkup(series) {
    const max = Math.max(1, ...series.map((day) => day.orders));
    const total = series.reduce((sum, day) => sum + day.orders, 0);
    const revenue = series.reduce((sum, day) => sum + day.revenue, 0);

    const bars = series
      .map((day, index) => {
        const height = day.orders ? Math.max(6, Math.round((day.orders / max) * 100)) : 3;
        const label = index % 2 === 0 ? String(day.date.getDate()) : '';
        return `
          <div class="chart__col">
            <div class="chart__track">
              <div class="chart__bar ${day.orders ? '' : 'chart__bar--muted'}"
                   style="height:${height}%">
                <span class="chart__tip">${esc(dateShort(day.date))} · ${day.orders} ${App.util.plural(day.orders, 'order')}${
          day.revenue ? ` · ${moneyShort(day.revenue)}` : ''
        }</span>
              </div>
            </div>
            <span class="chart__x">${label}</span>
          </div>`;
      })
      .join('');

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">${App.icon('trendUp', 15)} Orders · last 14 days</div>
            <div class="card__sub">${total} ${App.util.plural(total, 'order')} · ${moneyShort(revenue)} delivered</div>
          </div>
          <span class="pill pill--neutral">${moneyShort(total ? revenue / total : 0)} avg</span>
        </div>
        <div class="card__body">
          <div class="chart">${bars}</div>
        </div>
      </div>`;
  }

  function pipelineMarkup(orders) {
    const counts = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
    let deliveredRevenue = 0;
    let pipelineValue = 0;

    for (const order of orders) {
      const status = String(order.status || '').toLowerCase();
      if (counts[status] !== undefined) counts[status] += 1;
      const value = Number(order.totalPrice) || 0;
      if (status === 'delivered') deliveredRevenue += value;
      if (status === 'pending' || status === 'confirmed' || status === 'shipped') pipelineValue += value;
    }

    const total = orders.length || 1;

    const rows = STATUS_ORDER.map((status) => {
      const count = counts[status];
      const width = Math.round((count / total) * 100);
      return `
        <div class="status-bar">
          <div class="status-bar__head">
            <span class="status-bar__name">
              <span class="legend__swatch" style="--sw:${STATUS_COLOR[status]}"></span>
              ${App.util.capitalize(status)}
            </span>
            <span class="status-bar__value">${num(count)}</span>
          </div>
          <div class="status-bar__track">
            <div class="status-bar__fill" style="width:${width}%;--sw:${STATUS_COLOR[status]}"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">${App.icon('receipt', 15)} Order pipeline</div>
            <div class="card__sub">${num(orders.length)} ${App.util.plural(orders.length, 'order')} in total</div>
          </div>
        </div>
        <div class="card__body">
          <div class="status-bars">${rows}</div>
          <div class="divider" style="margin:16px 0"></div>
          <div class="row row--between" style="font-size:12.5px">
            <span class="muted">Delivered revenue</span>
            <span class="strong accent tnum">${money(deliveredRevenue)}</span>
          </div>
          <div class="row row--between" style="font-size:12.5px;margin-top:8px">
            <span class="muted">In-flight value</span>
            <span class="strong tnum">${money(pipelineValue)}</span>
          </div>
        </div>
      </div>`;
  }

  function recentOrdersMarkup(orders) {
    const recent = orders
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);

    const rows = recent.length
      ? recent
          .map((order) => {
            const items = (order.products || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            const customer = (order.userInfo && order.userInfo.name) || 'Customer';
            return `
              <tr data-order="${esc(order._id)}" style="cursor:pointer">
                <td>
                  <div class="cell-main">
                    ${ui.avatar(customer, true)}
                    <div class="cell-main__text">
                      <div class="cell-title">${esc(customer)}</div>
                      <div class="cell-sub">${esc((order.userInfo && order.userInfo.city) || '')}</div>
                    </div>
                  </div>
                </td>
                <td class="num">${money(order.totalPrice)}</td>
                <td>${ui.pill(order.status)}</td>
                <td class="right mute small nowrap">${esc(timeAgo(order.createdAt))}</td>
              </tr>`;
          })
          .join('')
      : '';

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">${App.icon('bag', 15)} Recent orders</div>
            <div class="card__sub">Newest customer activity</div>
          </div>
          <button class="btn btn--quiet btn--sm" type="button" data-goto="orders">
            View all ${App.icon('chevronRight', 13)}
          </button>
        </div>
        ${
          recent.length
            ? `<div class="table-wrap"><table class="data"><tbody>${rows}</tbody></table></div>`
            : `<div class="card__body">${ui
                .emptyState({
                  icon: 'receipt',
                  title: 'No orders yet',
                  text: 'When customers order, their details and totals appear here.',
                  actionLabel: 'Create an order',
                  onAction: () => App.views.orders.openCreate()
                })
                .outerHTML}</div>`
        }
      </div>`;
  }

  function restockMarkup(lowStock, outOfStock) {
    const merged = [
      ...outOfStock.map((product) => ({ product, level: 'out' })),
      ...lowStock
        .filter((product) => !outOfStock.some((item) => item._id === product._id))
        .map((product) => ({ product, level: 'low' }))
    ].slice(0, 6);

    const rows = merged
      .map(({ product, level }) => {
        const stock = Number(product.stock) || 0;
        const threshold = Number(product.lowStockThreshold) || 5;
        return `
          <tr>
            <td>
              <div class="cell-main">
                ${ui.thumb(product)}
                <div class="cell-main__text">
                  <div class="cell-title">${esc(product.name)}</div>
                  <div class="cell-sub">${esc(product.category || 'Uncategorised')}</div>
                </div>
              </div>
            </td>
            <td class="num">
              <span class="pill ${level === 'out' ? 'pill--out' : 'pill--low'}">${level === 'out' ? 'Out' : `${stock} left`}</span>
            </td>
            <td class="right">
              <button class="btn btn--ghost btn--sm" type="button" data-restock="${esc(product._id)}">Restock</button>
            </td>
          </tr>`;
      })
      .join('');

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">${App.icon('alert', 15)} Needs restocking</div>
            <div class="card__sub">${merged.length ? `${outOfStock.length} out of stock · ${lowStock.length} low` : 'Stock levels look healthy'}</div>
          </div>
          <button class="btn btn--quiet btn--sm" type="button" data-goto="inventory">
            Inventory ${App.icon('chevronRight', 13)}
          </button>
        </div>
        ${
          merged.length
            ? `<div class="table-wrap"><table class="data"><tbody>${rows}</tbody></table></div>`
            : `<div class="card__body">${ui
                .emptyState({
                  icon: 'check',
                  title: 'Everything in stock',
                  text: 'No product is below its low-stock threshold right now.'
                })
                .outerHTML}</div>`
        }
      </div>`;
  }

  async function mount(container) {
    container.innerHTML = `<div class="view__inner">
      <div class="stat-grid">
        ${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}${ui.skeletonBlock(112)}
      </div>
      <div class="dash-grid">${ui.skeletonBlock(260)}${ui.skeletonBlock(260)}</div>
    </div>`;

    let products = [];
    let orders = [];
    let lowStock = [];
    let outOfStock = [];

    let serverProducts = null;
    let serverOrders = null;
    let onboarding = null;
    try {
      // Server aggregates (dashboard + onboarding) are best-effort: the
      // client-side totals below remain the fallback for older backends.
      const [serverProductResult, serverOrderResult, onboardingResult] = await Promise.all([
        App.api.dashboard.products().catch(() => null),
        App.api.dashboard.orders().catch(() => null),
        App.api.account.onboarding().catch(() => null)
      ]);
      serverProducts = serverProductResult;
      serverOrders = serverOrderResult;
      onboarding = onboardingResult;
      const results = await Promise.all([
        App.api.products.all(),
        App.api.orders.all(),
        App.api.inventory.lowStock(),
        App.api.inventory.outOfStock()
      ]);
      products = results[0];
      orders = results[1];
      lowStock = results[2];
      outOfStock = results[3];
    } catch (error) {
      container.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">
        ${ui.alertBox('error', `<strong>Could not load the dashboard.</strong><br />${esc(error.message)}`)}
        <div class="row" style="margin-top:12px"><button class="btn btn--ghost" data-retry>${App.icon('refresh', 15)} Try again</button></div>
      </div></div></div>`;
      const retry = container.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', () => App.refresh());
      return;
    }

    App.state.catalog = products;
    App.state.lowStock = lowStock;
    App.state.outOfStock = outOfStock;
    App.updateNavCounts();

    const clientStock = products.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);
    const clientValue = products.reduce(
      (sum, product) => sum + (Number(product.price) || 0) * (Number(product.stock) || 0),
      0
    );
    const clientRevenue = orders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + (Number(order.totalPrice) || 0), 0);
    // Prefer the server aggregates when the backend provides them.
    const totalStock = serverProducts && Number.isFinite(Number(serverProducts.totalStock))
      ? Number(serverProducts.totalStock)
      : clientStock;
    const stockValue = serverProducts && Number.isFinite(Number(serverProducts.totalPrices))
      ? Number(serverProducts.totalPrices)
      : clientValue;
    const deliveredRevenue = serverOrders && Number.isFinite(Number(serverOrders.totalRevenue))
      ? Number(serverOrders.totalRevenue)
      : clientRevenue;
    const productCount = serverProducts && Number.isFinite(Number(serverProducts.totalProduct))
      ? Number(serverProducts.totalProduct)
      : products.length;
    const categories = new Set(products.map((product) => (product.category || '').trim()).filter(Boolean));
    const openOrders = orders.filter((order) => ['pending', 'confirmed', 'shipped'].includes(order.status)).length;
    const addedRecently = products.filter((product) => {
      const created = App.util.toDate(product.createdAt);
      return created && Date.now() - created.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const checklist = onboarding && Array.isArray(onboarding.checklist) ? onboarding.checklist : null;

    if (!products.length && !orders.length) {
      const checklistMarkup = checklist
        ? `<div class="col" style="gap:6px;margin-top:12px">${checklist.map((step) => `<div class="row" style="gap:8px;font-size:12.5px"><span>${step.complete ? App.icon('check', 14) : App.icon('dot', 14)}</span><span class="${step.complete ? '' : 'mute'}">${esc(step.step)}</span></div>`).join('')}</div>`
        : '';
      container.innerHTML = `<div class="view__inner">
        <div class="card"><div class="card__body">
          ${ui.emptyState({
            icon: 'sparkles',
            title: 'Your workspace is empty',
            text: 'Add your first product, then stock it in and start taking orders. Everything you create here is saved in your Product Management API.',
            actionLabel: 'Create your first product',
            onAction: () => App.views.products.openCreate()
          }).outerHTML}
          ${checklistMarkup}
        </div></div>
      </div>`;
      return;
    }

    const demoBanner = App.state.config && App.state.config.demoMode
      ? `<div class="alert alert--warn">
           ${App.icon('sparkles', 16)}
           <div><strong>Demo workspace.</strong> These products and orders are sample data stored on this computer.
           Switch to your live API in Settings whenever you are ready.</div>
           <button class="btn btn--ghost btn--sm" type="button" data-goto="settings">Settings</button>
         </div>`
      : '';

    container.innerHTML = `<div class="view__inner">
      ${demoBanner}
      <div class="stat-grid">
        ${statCard({
          label: 'Products',
          icon: 'box',
          tone: 'accent',
          value: num(productCount),
          meta: `${num(categories.size)} ${App.util.plural(categories.size, 'category', 'categories')} · ${num(addedRecently)} added in 30 days`
        })}
        ${statCard({
          label: 'Stock on hand',
          icon: 'layers',
          tone: 'blue',
          value: `${num(totalStock)}<small>units</small>`,
          meta: `${outOfStock.length} out · ${lowStock.length} low stock`
        })}
        ${statCard({
          label: 'Inventory value',
          icon: 'wallet',
          tone: 'violet',
          value: moneyShort(stockValue),
          meta: `Average unit ${moneyShort(totalStock ? stockValue / totalStock : 0)}`
        })}
        ${statCard({
          label: 'Delivered revenue',
          icon: 'trendUp',
          tone: 'amber',
          value: moneyShort(deliveredRevenue),
          meta: `${num(orders.length)} ${App.util.plural(orders.length, 'order')} · ${openOrders} in flight`
        })}
      </div>

      <div class="dash-grid">
        ${chartMarkup(buildSeries(orders))}
        ${pipelineMarkup(orders)}
      </div>

      <div class="dash-grid dash-grid--even">
        ${recentOrdersMarkup(orders)}
        ${restockMarkup(lowStock, outOfStock)}
      </div>
    </div>`;

    ui.hydrateImages(container);

    container.querySelectorAll('[data-goto]').forEach((button) => {
      button.addEventListener('click', () => App.go(button.getAttribute('data-goto')));
    });

    container.querySelectorAll('[data-order]').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-order');
        App.go('orders', { openOrder: id });
      });
    });

    container.querySelectorAll('[data-restock]').forEach((button) => {
      button.addEventListener('click', () => {
        const product = products.find((item) => item._id === button.getAttribute('data-restock'));
        if (product) App.views.inventory.openStockModal(product, 'in');
      });
    });
  }

  App.views = App.views || {};
  App.views.dashboard = {
    title: 'Dashboard',
    subtitle: 'Catalogue, stock and order health at a glance.',
    actions: [
      {
        label: 'New product',
        icon: 'plus',
        variant: 'primary',
        onClick: () => App.views.products.openCreate()
      }
    ],
    mount
  };
})();
