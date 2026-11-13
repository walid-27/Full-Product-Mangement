/* Reports: server-side sales, profit, best sellers, stock valuation, movements, import/export. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const { esc, money, num, timeAgo } = App.util;
  const ui = App.ui;

  App.views.reports = {
    title: 'Reports',
    subtitle: 'Live organization reporting from the backend API',
    async mount(host) {
      host.innerHTML = '<div class="view__inner"><div class="card"><div class="card__body">Loading reports…</div></div></div>';
      try {
        const [sales, bestSellers, stock, movementData] = await Promise.all([
          App.api.reports.sales('month'),
          App.api.reports.bestSellers(),
          App.api.reports.stock(),
          App.api.reports.movements({ limit: 25 }).catch(() => ({ movements: [] }))
        ]);
        const movements = (movementData && movementData.movements) || [];
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
          <div class="card"><div class="card__head"><h3>Recent stock movements</h3><span class="small mute">Server history</span></div><div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Action</th><th>Quantity</th><th>When</th></tr></thead><tbody>${movements.map((row) => {
            const name = row.productName || (row.product && row.product.name) || 'Product';
            return `<tr><td>${esc(name)}</td><td>${esc(row.action)}</td><td>${num(row.quantity)}</td><td class="mute">${esc(timeAgo(row.createdAt))}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="mute">No movements yet.</td></tr>'}</tbody></table></div></div>
          <div class="card"><div class="card__head"><h3>Import &amp; export</h3><span class="small mute">CSV / XLSX · paid plans</span></div><div class="card__body">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button class="btn btn--ghost btn--sm" type="button" data-export="products:csv">Products CSV</button>
              <button class="btn btn--ghost btn--sm" type="button" data-export="orders:csv">Orders CSV</button>
              <button class="btn btn--ghost btn--sm" type="button" data-export="movements:csv">Movements CSV</button>
              <button class="btn btn--ghost btn--sm" type="button" data-export="products:xlsx">Products XLSX</button>
              <button class="btn btn--ghost btn--sm" type="button" id="import-btn">Import products CSV</button>
              <input type="file" id="import-file" accept=".csv,text/csv" hidden />
            </div>
            <p class="small mute" style="margin-top:10px">CSV columns: name, price, costPrice, category, stock, lowStockThreshold, sku, barcode. Up to 1000 rows per import.</p>
            <div id="reports-error" hidden style="margin-top:10px"></div>
          </div></div>
        </div>`;

        const errorBox = host.querySelector('#reports-error');
        const showError = (message) => {
          if (!errorBox) return;
          errorBox.hidden = false;
          errorBox.innerHTML = ui.alertBox('error', esc(message));
        };

        host.querySelectorAll('[data-export]').forEach((button) => {
          button.addEventListener('click', async () => {
            const [type, format] = button.getAttribute('data-export').split(':');
            ui.setBusy(button, true);
            try {
              const saved = await App.api.features.exportData(type, format);
              if (saved) ui.toast({ type: 'success', title: 'Export saved', message: saved.filename || 'File downloaded.' });
            } catch (error) {
              showError(error.message);
            } finally {
              ui.setBusy(button, false);
            }
          });
        });

        const importBtn = host.querySelector('#import-btn');
        const importFile = host.querySelector('#import-file');
        if (importBtn && importFile) {
          importBtn.addEventListener('click', () => importFile.click());
          importFile.addEventListener('change', async () => {
            const file = importFile.files && importFile.files[0];
            if (!file) return;
            ui.setBusy(importBtn, true);
            try {
              const buffer = await file.arrayBuffer();
              const result = await App.api.features.importProducts({
                name: file.name,
                type: file.type || 'text/csv',
                data: new Uint8Array(buffer)
              });
              ui.toast({
                type: 'success',
                title: 'Import finished',
                message: `${result.imported || 0} imported, ${result.failed || 0} failed.`
              });
              if (App.refreshNavCounts) App.refreshNavCounts();
            } catch (error) {
              showError(error.message);
            } finally {
              ui.setBusy(importBtn, false);
              importFile.value = '';
            }
          });
        }
      } catch (error) {
        const upgrade = error.status === 402 || error.code === 'UPGRADE_REQUIRED';
        host.innerHTML = `<div class="view__inner"><div class="card"><div class="card__body">${ui.alertBox(upgrade ? 'info' : 'error', `<strong>${upgrade ? 'Reports require a paid plan' : 'Could not load reports'}</strong><br>${esc(error.message)}${upgrade ? '<br>Open Settings → Billing to upgrade.' : ''}`)}</div></div></div>`;
      }
    }
  };
})();
