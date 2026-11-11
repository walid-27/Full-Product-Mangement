/* Reports: server-side sales, profit, best sellers, and stock valuation. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const { esc, money, num } = App.util;
  const ui = App.ui;

  App.views.reports = {
    title: 'Reports',
    subtitle: 'Live organization reporting from the new backend API',
    async mount(host) {
      host.innerHTML = '<div class="view__inner"><div class="card"><div class="card__body">Loading reports…</div></div></div>';
      try {
        const [sales, bestSellers, stock] = await Promise.all([
          App.api.reports.sales('month'),
          App.api.reports.bestSellers(),
          App.api.reports.stock()
        ]);
        const totals = (sales || []).reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, profit: sum.profit + row.profit, orders: sum.orders + row.orders }), { revenue: 0, profit: 0, orders: 0 });
        host.innerHTML = `<div class="view__inner">
          <div class="stat-grid">
            <div class="stat"><span class="stat__label">Revenue</span><div class="stat__value">${money(totals.revenue)}</div></div>
            <div class="card"><div class="card__body"><span class="mute">Gross profit</span><h2>${money(totals.profit)}</h2><span class="small mute">${num(totals.orders)} delivered orders</span></div></div>
            <div class="card"><div class="card__body"><span class="mute">Stock value</span><h2>${money(stock.stockValue || 0)}</h2><span class="small mute">Potential profit ${money(stock.potentialProfit || 0)}</span></div></div>
            <div class="card"><div class="card__body"><span class="mute">Stock alerts</span><h2>${num((stock.lowStock || 0) + (stock.outOfStock || 0))}</h2><span class="small mute">${num(stock.outOfStock || 0)} out of stock</span></div></div>
          </div>
          <div class="card"><div class="card__head"><h3>Best-selling products</h3></div><div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead><tbody>${(bestSellers || []).map((row) => `<tr><td>${esc(row.name)}</td><td>${num(row.quantity)}</td><td>${money(row.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="mute">No sales yet.</td></tr>'}</tbody></table></div></div>
          <div class="card"><div class="card__head"><h3>Monthly sales</h3></div><div class="table-wrap"><table class="data"><thead><tr><th>Period</th><th>Orders</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>${(sales || []).map((row) => `<tr><td>${esc(row._id)}</td><td>${num(row.orders)}</td><td>${money(row.revenue)}</td><td>${money(row.profit)}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">No delivered orders yet.</td></tr>'}</tbody></table></div></div>
        </div>`;
      } catch (error) {
        const upgrade = error.status === 402;
        host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">${ui.alertBox(upgrade ? 'info' : 'error', `<strong>${upgrade ? 'Reports require a paid plan' : 'Could not load reports'}</strong><br>${esc(error.message)}`)}</div></div></div>`;
      }
    }
  };
})();
