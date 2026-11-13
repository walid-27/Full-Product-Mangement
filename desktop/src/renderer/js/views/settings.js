/* Settings: server, appearance, session, billing, integrations, account, about */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, dateTime, timeAgo } = App.util;
  const ui = App.ui;

  const ENDPOINTS = [
    ['POST', '/auth/register', 'Create an account'],
    ['POST', '/auth/login', 'Get a 15m JWT + refresh cookie'],
    ['POST', '/auth/refresh', 'Rotate the refresh token'],
    ['POST', '/auth/verify-email', 'Verify email (token)'],
    ['POST', '/auth/forgot-password', 'Request a reset link'],
    ['POST', '/auth/reset-password', 'Reset with token'],
    ['GET', '/api/v1/products', 'List · search · paginate'],
    ['POST', '/api/v1/products', 'Create (multipart image)'],
    ['PATCH', '/api/v1/products/:id', 'Update fields / image'],
    ['DELETE', '/api/v1/products/:id', 'Soft-delete a product'],
    ['POST', '/api/v1/products/:id/restore', 'Restore a product'],
    ['GET', '/api/v1/products/analysis', 'Catalogue aggregate'],
    ['POST', '/api/v1/inventory/stock-in/:id', 'Add stock'],
    ['POST', '/api/v1/inventory/stock-out/:id', 'Remove stock'],
    ['GET', '/api/v1/inventory/low-stock', 'Low-stock alerts'],
    ['GET', '/api/v1/inventory/out-stock', 'Out-of-stock list'],
    ['POST', '/api/v1/orders', 'Create an order'],
    ['GET', '/api/v1/orders', 'List orders'],
    ['PATCH', '/api/v1/orders/status/:id', 'Change status'],
    ['PATCH', '/api/v1/orders/cancel-order/:id', 'Cancel + restock'],
    ['DELETE', '/api/v1/orders/:id', 'Soft-delete an order'],
    ['GET', '/api/v1/dashboard/product', 'Product dashboard'],
    ['GET', '/api/v1/dashboard/order', 'Order dashboard'],
    ['GET', '/api/v1/features/reports/sales', 'Sales / profit report'],
    ['GET', '/api/v1/features/reports/best-sellers', 'Best sellers'],
    ['GET', '/api/v1/features/reports/stock', 'Stock valuation'],
    ['GET', '/api/v1/features/reports/movements', 'Movement history'],
    ['POST', '/api/v1/features/products/import', 'CSV import'],
    ['GET', '/api/v1/features/export/:type', 'CSV / XLSX export'],
    ['GET', '/api/v1/features/orders/:id/documents/:type', 'Invoice / label PDF'],
    ['POST', '/api/v1/features/orders/:id/shipment', 'Create shipment'],
    ['GET', '/api/v1/search', 'Global search'],
    ['GET', '/api/organizations', 'List organizations'],
    ['POST', '/api/organizations/switch', 'Switch organization'],
    ['GET', '/api/organizations/members', 'Team members'],
    ['POST', '/api/organizations/invites', 'Invite a member'],
    ['GET', '/api/billing/subscription', 'Plan & subscription'],
    ['GET', '/api/billing/usage', 'Plan usage'],
    ['POST', '/api/billing/checkout', 'Start checkout'],
    ['GET', '/api/api-keys', 'API keys'],
    ['GET', '/api/webhooks', 'Outgoing webhooks'],
    ['GET', '/api/account/onboarding', 'Onboarding checklist'],
    ['GET', '/api/account/export', 'Export account data'],
    ['GET', '/health/ready', 'Readiness probe']
  ];

  function settingRow(title, desc, control) {
    return `
      <div class="setting-row">
        <div class="setting-row__text">
          <div class="setting-row__title">${title}</div>
          <div class="setting-row__desc">${desc}</div>
        </div>
        <div class="setting-row__control">${control}</div>
      </div>`;
  }

  function limitText(used, limit) {
    return limit === null || limit === undefined ? `${num(used)} / unlimited` : `${num(used)} / ${num(limit)}`;
  }

  async function mount(container) {
    const config = (App.state.config = await App.api.config.get());
    const session = App.state.session || config.session || null;
    const info = await App.api.info().catch(() => ({}));
    const cache = await App.api.images.stats().catch(() => ({ files: 0, bytes: 0 }));

    const demo = Boolean(config.demoMode);
    const theme = config.theme === 'light' ? 'light' : 'dark';
    const isOwner = session && session.role === 'owner';
    const canManageKeys = session && ['owner', 'admin'].includes(session.role);

    let subscription = null;
    let usage = null;
    let billingError = '';
    let apiKeys = [];
    let apiKeysError = '';
    let webhooks = [];
    let webhooksError = '';
    if (session) {
      const [subResult, usageResult, keysResult, hooksResult] = await Promise.all([
        App.api.billing.subscription().catch((error) => ({ __error: error })),
        App.api.billing.usage().catch((error) => ({ __error: error })),
        App.api.apiKeys.list().catch((error) => ({ __error: error })),
        App.api.webhooks.list().catch((error) => ({ __error: error }))
      ]);
      if (subResult && !subResult.__error) subscription = subResult;
      else if (subResult && subResult.__error) billingError = subResult.__error.message;
      if (usageResult && !usageResult.__error) usage = usageResult;
      else if (usageResult && usageResult.__error && !billingError) billingError = usageResult.__error.message;
      if (keysResult && !keysResult.__error) apiKeys = keysResult;
      else if (keysResult && keysResult.__error) apiKeysError = keysResult.__error.message;
      if (hooksResult && !hooksResult.__error) webhooks = hooksResult;
      else if (hooksResult && hooksResult.__error) webhooksError = hooksResult.__error.message;
    }

    const billingCard = session
      ? `<div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('wallet', 15)} Billing &amp; plan</div>
                <div class="card__sub">${isOwner ? 'Owner only · Chargily checkout' : 'Owner only'}</div>
              </div>
              ${subscription ? `<span class="pill pill--neutral">${esc(subscription.plan || 'free')} · ${esc(subscription.status || '')}</span>` : ''}
            </div>
            <div class="card__body">
              ${billingError
                ? `<div class="alert alert--info">${App.icon('info', 15)}<div>${esc(billingError)}${isOwner ? '' : ' Billing requires the owner role.'}</div></div>`
                : usage
                  ? `<div class="col" style="gap:7px">
                      <div class="row row--between small"><span class="mute">Products</span><span>${esc(limitText(usage.products.used, usage.products.limit))}</span></div>
                      <div class="row row--between small"><span class="mute">Orders this month</span><span>${esc(limitText(usage.orders.used, usage.orders.limit))}</span></div>
                      <div class="row row--between small"><span class="mute">Team members</span><span>${esc(limitText(usage.teamMembers.used, usage.teamMembers.limit))}</span></div>
                      <div class="row row--between small"><span class="mute">Reports / API / CSV</span><span>${usage.features.reports ? 'Enabled' : 'Upgrade required'}</span></div>
                      ${subscription && subscription.cancelAtPeriodEnd ? '<div class="alert alert--warn">Cancellation is scheduled for the end of the current period.</div>' : ''}
                    </div>
                    ${isOwner ? `<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
                      <button class="btn btn--primary btn--sm" type="button" id="billing-checkout">Upgrade / checkout</button>
                      <button class="btn btn--ghost btn--sm" type="button" id="billing-portal">Billing portal</button>
                      <button class="btn btn--ghost btn--sm" type="button" id="billing-cancel">Cancel plan</button>
                      <button class="btn btn--ghost btn--sm" type="button" id="billing-invoices">Invoices</button>
                    </div>` : '<p class="small mute" style="margin-top:10px">Only the organization owner can change the plan.</p>'}
                    <div id="billing-result" style="margin-top:10px"></div>`
                  : '<p class="muted small">No billing data available.</p>'}
            </div>
          </div>`
      : '';

    const integrationsCard = session
      ? `<div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('shield', 15)} API keys &amp; webhooks</div>
                <div class="card__sub">Owner / admin · public API + outgoing hooks</div>
              </div>
            </div>
            <div class="card__body">
              ${apiKeysError ? `<div class="alert alert--info">${App.icon('info', 15)}<div>${esc(apiKeysError)}</div></div>` : `
              <div class="row row--between" style="margin-bottom:8px"><span class="strong">API keys</span>${canManageKeys ? '<button class="btn btn--ghost btn--sm" type="button" id="key-create">Create key</button>' : ''}</div>
              <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Scopes</th><th>Rate</th>${canManageKeys ? '<th></th>' : ''}</tr></thead><tbody>${apiKeys.map((key) => `<tr><td>${esc(key.name)}</td><td>${esc((key.scopes || []).join(', '))}</td><td>${num(key.rateLimitPerMinute)}/min</td>${canManageKeys ? `<td class="right"><button class="btn btn--quiet btn--sm" data-key-revoke="${esc(key._id)}">Revoke</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="4" class="mute">No API keys yet.</td></tr>'}</tbody></table></div>
              <div class="row row--between" style="margin:14px 0 8px"><span class="strong">Webhooks</span>${canManageKeys ? '<button class="btn btn--ghost btn--sm" type="button" id="hook-create">Create webhook</button>' : ''}</div>
              <div class="table-wrap"><table class="data"><thead><tr><th>URL</th><th>Events</th>${canManageKeys ? '<th></th>' : ''}</tr></thead><tbody>${webhooks.map((hook) => `<tr><td class="mono">${esc(hook.url)}</td><td>${esc((hook.events || []).join(', '))}</td>${canManageKeys ? `<td class="right"><button class="btn btn--quiet btn--sm" data-hook-remove="${esc(hook._id)}">Remove</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="3" class="mute">No webhooks yet.</td></tr>'}</tbody></table></div>
              <div id="integrations-result" style="margin-top:10px"></div>`}
            </div>
          </div>`
      : '';

    const accountCard = session
      ? `<div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('user', 15)} Account &amp; privacy</div>
                <div class="card__sub">Notifications, export and deletion</div>
              </div>
            </div>
            <div class="card__body" style="padding-top:4px;padding-bottom:4px">
              ${session.emailVerified === false ? settingRow('Email verification', 'Your email is not verified. Organization data stays locked until you verify.', `<button class="btn btn--ghost btn--sm" type="button" id="resend-verify">Resend email</button>`) : ''}
              ${settingRow('Low-stock email alerts', 'Email me when a product runs low.', `<label class="switch"><input type="checkbox" id="notif-low" checked /><span class="switch__track"></span><span class="switch__text">On</span></label>`)}
              ${settingRow('Customer order emails', 'Email me when order statuses change.', `<label class="switch"><input type="checkbox" id="notif-orders" checked /><span class="switch__track"></span><span class="switch__text">On</span></label>`)}
              ${settingRow('Export my data', 'Download a JSON copy of your account, products, orders and movements.', `<button class="btn btn--ghost btn--sm" type="button" id="account-export">Export</button>`)}
              ${settingRow('Sign out everywhere', 'Revoke every refresh session on every device.', `<button class="btn btn--ghost btn--sm" type="button" id="logout-all">Sign out everywhere</button>`)}
              ${settingRow('Delete my account', 'Schedules deletion in 30 days and revokes every session.', `<button class="btn btn--danger btn--sm" type="button" id="account-delete">Delete account</button>`)}
              <div id="account-result" style="margin-top:10px"></div>
            </div>
          </div>`
      : '';

    container.innerHTML = `<div class="view__inner">
      <div class="settings-grid">
        <div class="col" style="gap:14px">
          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('database', 15)} API connection</div>
                <div class="card__sub">Where your products, stock and orders live</div>
              </div>
              <span class="status-line" id="conn-badge">${ui.statusDot(demo ? 'ok' : '')}${demo ? 'Demo mode' : 'Not tested'}</span>
            </div>
            <div class="card__body">
              <div class="form-grid">
                <label class="field span-2">
                  <span class="field__label">API base URL</span>
                  <div class="row" style="gap:8px">
                    <input class="input" id="api-base" value="${esc(config.apiBaseUrl)}" placeholder="http://localhost:5000" spellcheck="false" ${demo ? 'disabled' : ''} />
                    <button class="btn btn--ghost" type="button" id="test-conn" ${demo ? 'disabled' : ''}>Test</button>
                    <button class="btn btn--primary" type="button" id="save-conn" ${demo ? 'disabled' : ''}>Save</button>
                  </div>
                  <span class="field__hint">Example: <span class="mono">http://localhost:5000</span> or your hosted API address. Changing it signs you out.</span>
                </label>
                <label class="field span-2">
                  <span class="field__label">Product images path</span>
                  <input class="input" id="uploads-path" value="${esc(config.uploadsPath)}" placeholder="/uploads" spellcheck="false" />
                  <span class="field__hint">Optional. Images you upload are cached on this computer; this path is only used to fetch older images over HTTP (or a full URL such as <span class="mono">https://cdn.example.com/uploads</span>).</span>
                </label>
              </div>
              <div id="conn-result" style="margin-top:12px"></div>
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('sparkles', 15)} Data source</div>
                <div class="card__sub">Demo mode runs entirely on this computer</div>
              </div>
            </div>
            <div class="card__body" style="padding-top:4px;padding-bottom:4px">
              ${settingRow(
                'Demo workspace',
                'Use realistic sample products, stock and orders stored locally — perfect for trying the interface without MongoDB or the API running. Your real API data is never touched.',
                `<label class="switch"><input type="checkbox" id="demo-toggle" ${demo ? 'checked' : ''} />
                  <span class="switch__track"></span><span class="switch__text">${demo ? 'On' : 'Off'}</span></label>`
              )}
              ${settingRow(
                'Reset demo data',
                'Restore the sample catalogue and orders to their initial state.',
                `<button class="btn btn--ghost btn--sm" type="button" id="reset-demo" ${demo ? '' : 'disabled'}>Reset</button>`
              )}
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('palette', 15)} Appearance</div>
                <div class="card__sub">Theme applies instantly</div>
              </div>
            </div>
            <div class="card__body" style="padding-top:4px;padding-bottom:4px">
              ${settingRow(
                'Theme',
                'Dark is easier on the eyes for long inventory sessions; light suits bright offices.',
                `<div class="segmented" id="theme-tabs">
                   <button type="button" class="segmented__btn ${theme === 'dark' ? 'is-active' : ''}" data-theme="dark">
                     ${App.icon('moon', 14)} Dark
                   </button>
                   <button type="button" class="segmented__btn ${theme === 'light' ? 'is-active' : ''}" data-theme="light">
                     ${App.icon('sun', 14)} Light
                   </button>
                 </div>`
              )}
              ${settingRow(
                'Local image cache',
                `${num(cache.files)} ${App.util.plural(cache.files, 'image')} · ${(
                  cache.bytes /
                  (1024 * 1024)
                ).toFixed(1)} MB stored on this computer for fast product thumbnails.`,
                `<button class="btn btn--ghost btn--sm" type="button" id="clear-cache">Clear</button>`
              )}
              ${settingRow(
                'App data folder',
                'Configuration, demo database and cached images.',
                `<button class="btn btn--ghost btn--sm" type="button" id="open-data">${App.icon('external', 13)} Open</button>`
              )}
            </div>
          </div>

          ${billingCard}
          ${integrationsCard}
          ${accountCard}
        </div>

        <div class="col" style="gap:14px">
          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('user', 15)} Session</div>
                <div class="card__sub">${demo ? 'Demo account' : 'Signed in to your API'}</div>
              </div>
            </div>
            <div class="card__body">
              ${
                session
                  ? `<div class="row" style="gap:12px">
                       ${ui.avatar(session.name || session.email || 'User')}
                       <div class="grow">
                         <div class="strong">${esc(session.name || 'Manager')}</div>
                         <div class="small mute">${esc(session.email || '')}</div>
                       </div>
                     </div>
                     <div class="divider" style="margin:14px 0"></div>
                     <div class="col" style="gap:7px">
                       <div class="row row--between small"><span class="mute">Access token</span>
                         <span>15 minutes · auto-refresh</span></div>
                       <div class="row row--between small"><span class="mute">Email verified</span>
                         <span>${session.emailVerified === false ? 'No — verify to unlock data' : session.emailVerified ? 'Yes' : '—'}</span></div>
                       <div class="row row--between small"><span class="mute">Server</span>
                         <span class="mono">${esc(session.demo ? 'local demo' : session.apiBaseUrl || config.apiBaseUrl)}</span></div>
                     </div>
                     <button class="btn btn--ghost btn--block" type="button" id="sign-out" style="margin-top:14px">
                       ${App.icon('logout', 15)} Sign out
                     </button>`
                  : `<p class="muted small">No active session.</p>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('info', 15)} About</div>
                <div class="card__sub">StockFlow desktop</div>
              </div>
            </div>
            <div class="card__body">
              <div class="about-list">
                <div class="about-item"><span>App</span><span>v${esc(info.version || '1.0.0')}</span></div>
                <div class="about-item"><span>Electron</span><span>${esc(info.electron || '—')}</span></div>
                <div class="about-item"><span>Chromium</span><span>${esc(info.chrome || '—')}</span></div>
                <div class="about-item"><span>Node</span><span>${esc(info.node || '—')}</span></div>
                <div class="about-item"><span>Platform</span><span>${esc(
                  `${info.platform || ''} ${info.arch || ''}`.trim() || '—'
                )}</span></div>
                <div class="about-item"><span>Mode</span><span>${demo ? 'demo' : 'live api'}</span></div>
              </div>
              <div class="alert alert--info" style="margin-top:14px">
                ${App.icon('shield', 16)}
                <div>Your JWT stays in the main process (encrypted with the Windows credential store when available) and is never exposed to the interface.</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div>
                <div class="card__title">${App.icon('layers', 15)} API endpoints used</div>
                <div class="card__sub">Full Product Management API</div>
              </div>
            </div>
            <div class="card__body">
              <div class="col" style="gap:7px">
                ${ENDPOINTS.map(
                  ([method, path, label]) => `
                  <div class="row" style="gap:8px;font-size:11.5px">
                    <span class="pill pill--neutral" style="height:18px;font-size:10px;padding:0 6px;font-family:var(--font-mono)">${method}</span>
                    <span class="mono" style="color:var(--text-dim)">${path}</span>
                    <span class="grow right mute" style="font-size:11px">${label}</span>
                  </div>`
                ).join('')}
              </div>
              <p class="small mute" style="margin-top:12px;line-height:1.6">
                Dashboard figures come from the server dashboard endpoints with a client-side fallback.
                Exports and PDF documents are saved through the main process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    bind(container, { config, demo });
  }

  function bind(container, context) {
    const config = context.config;

    /* connection */
    const apiBase = container.querySelector('#api-base');
    const uploadsPath = container.querySelector('#uploads-path');
    const result = container.querySelector('#conn-result');
    const badge = container.querySelector('#conn-badge');
    const testButton = container.querySelector('#test-conn');
    const saveButton = container.querySelector('#save-conn');

    testButton.addEventListener('click', async () => {
      ui.setBusy(testButton, true);
      try {
        if (apiBase.value.trim() && apiBase.value.trim() !== config.apiBaseUrl) {
          const next = await App.api.config.set({ apiBaseUrl: apiBase.value.trim() });
          App.state.config = { ...App.state.config, ...next };
          ui.toast({
            type: 'warn',
            title: 'Server changed',
            message: 'Sign in again to use the new server.'
          });
          App.signOut();
          return;
        }
        const ping = await App.api.ping();
        badge.innerHTML = `${ui.statusDot(ping.ok ? 'ok' : 'bad')}${ping.ok ? 'Reachable' : 'Unreachable'}`;
        result.innerHTML = ping.ok
          ? ui.alertBox('accent', `<strong>Server answered in ${ping.ms} ms.</strong><br /><span class="mono">${esc(
              ping.url
            )}</span>`)
          : ui.alertBox('error', `<strong>Cannot reach the server.</strong><br />${esc(ping.error || '')}`);
      } catch (error) {
        result.innerHTML = ui.alertBox('error', esc(error.message));
      } finally {
        ui.setBusy(testButton, false);
      }
    });

    saveButton.addEventListener('click', async () => {
      const patch = { uploadsPath: uploadsPath.value.trim() || '/uploads' };
      const nextBase = apiBase.value.trim();
      const baseChanged = nextBase && nextBase !== config.apiBaseUrl;
      if (baseChanged) patch.apiBaseUrl = nextBase;

      ui.setBusy(saveButton, true);
      try {
        const next = await App.api.config.set(patch);
        App.state.config = { ...App.state.config, ...next };
        ui.setBusy(saveButton, false);

        if (next.resetSession) {
          ui.toast({
            type: 'warn',
            title: 'Server updated',
            message: 'Please sign in again with the new server.'
          });
          App.signOut();
          return;
        }
        ui.toast({ type: 'success', title: 'Settings saved', message: baseChanged ? 'Connection updated.' : 'Preferences saved.' });
        App.refresh();
      } catch (error) {
        ui.setBusy(saveButton, false);
        ui.toast({ type: 'error', title: 'Could not save', message: error.message });
      }
    });

    /* demo mode */
    container.querySelector('#demo-toggle').addEventListener('change', async (event) => {
      const enabled = event.target.checked;
      try {
        const next = await App.api.config.set({ demoMode: enabled });
        App.state.config = { ...App.state.config, ...next };
        if (enabled) {
          const session = await App.api.auth.login('demo@stockflow.app', 'demo1234');
          ui.toast({
            type: 'success',
            title: 'Demo mode on',
            message: 'Sample data is now loaded. Switch it off to use your API again.'
          });
          App.onAuthenticated(session);
          App.refresh();
        } else {
          ui.toast({ type: 'info', message: 'Demo mode off — sign in to your API.' });
          App.signOut();
        }
      } catch (error) {
        ui.toast({ type: 'error', title: 'Could not switch mode', message: error.message });
        App.refresh();
      }
    });

    container.querySelector('#reset-demo').addEventListener('click', async () => {
      const confirmed = await ui.confirm({
        title: 'Reset demo data?',
        message: 'Sample products, orders and stock levels will be restored. Live API data is never affected.',
        confirmText: 'Reset demo data'
      });
      if (!confirmed) return;
      await App.api.resetDemo();
      ui.toast({ type: 'success', message: 'Demo workspace restored.' });
      App.refresh();
    });

    /* appearance */
    container.querySelectorAll('[data-theme]').forEach((button) => {
      button.addEventListener('click', async () => {
        const theme = button.getAttribute('data-theme');
        App.applyTheme(theme);
        await App.api.config.set({ theme });
        App.state.config = { ...App.state.config, theme };
        container.querySelectorAll('[data-theme]').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
      });
    });

    container.querySelector('#clear-cache').addEventListener('click', async () => {
      const confirmed = await ui.confirm({
        title: 'Clear the image cache?',
        message: 'Thumbnails will be downloaded again next time they are needed. Nothing is deleted from the API.',
        confirmText: 'Clear cache'
      });
      if (!confirmed) return;
      const stats = await App.api.images.clearCache();
      ui.toast({
        type: 'success',
        message: `Image cache cleared${stats && stats.size ? ` (${stats.size.files} files)` : ''}.`
      });
      App.refresh();
    });

    container.querySelector('#open-data').addEventListener('click', () => App.api.openDataFolder());

    /* session */
    const signOut = container.querySelector('#sign-out');
    if (signOut) {
      signOut.addEventListener('click', async () => {
        const confirmed = await ui.confirm({
          title: 'Sign out?',
          message: 'Your local settings stay on this computer; only the session token is removed.',
          confirmText: 'Sign out'
        });
        if (confirmed) App.signOut();
      });
    }

    /* billing */
    const billingResult = container.querySelector('#billing-result');
    const showBilling = (message, kind) => {
      if (!billingResult) return;
      billingResult.innerHTML = ui.alertBox(kind || 'info', esc(message));
    };
    const checkoutBtn = container.querySelector('#billing-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', async () => {
        const body = ui.fromHTML('<form id="checkout-form" class="col"><label class="field"><span class="field__label">Plan</span><select class="input" name="plan"><option value="pro">Pro — 3,000 DZD</option><option value="business">Business — 9,000 DZD</option></select></label><div id="checkout-error" hidden></div></form>');
        const foot = ui.fromHTML('<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn--primary" type="submit" form="checkout-form">Start checkout</button></div>');
        const ref = ui.modal({ title: 'Choose a plan', body, footer: foot });
        body.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = foot.querySelector('button');
          ui.setBusy(submit, true);
          try {
            const result = await App.api.billing.checkout(body.elements.plan.value);
            ref.close();
            if (result.checkoutUrl) await App.api.openExternal(result.checkoutUrl);
            showBilling(`Checkout started (${result.checkoutId || 'pending'}). Complete payment in your browser.`);
          } catch (error) {
            const box = body.querySelector('#checkout-error');
            box.hidden = false;
            box.innerHTML = ui.alertBox('error', esc(error.message));
          } finally { ui.setBusy(submit, false); }
        });
      });
    }
    const portalBtn = container.querySelector('#billing-portal');
    if (portalBtn) {
      portalBtn.addEventListener('click', async () => {
        ui.setBusy(portalBtn, true);
        try {
          const result = await App.api.billing.portal();
          if (result.portalUrl) await App.api.openExternal(result.portalUrl);
          showBilling('Billing portal opened in your browser.');
        } catch (error) { showBilling(error.message, 'error'); }
        finally { ui.setBusy(portalBtn, false); }
      });
    }
    const cancelBtn = container.querySelector('#billing-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Cancel your plan?', message: 'Cancellation takes effect at the end of the current period.', confirmText: 'Cancel plan', danger: true })) return;
        ui.setBusy(cancelBtn, true);
        try {
          await App.api.billing.cancel();
          showBilling('Cancellation scheduled for the end of the current period.');
          App.refresh();
        } catch (error) { showBilling(error.message, 'error'); }
        finally { ui.setBusy(cancelBtn, false); }
      });
    }
    const invoicesBtn = container.querySelector('#billing-invoices');
    if (invoicesBtn) {
      invoicesBtn.addEventListener('click', async () => {
        ui.setBusy(invoicesBtn, true);
        try {
          const data = await App.api.billing.invoices({ limit: 20 });
          const invoices = (data && data.invoices) || [];
          showBilling(invoices.length ? invoices.map((invoice) => `${invoice.plan || 'plan'} · ${invoice.amountDzd || 0} DZD · ${invoice.status || ''}`).join(' | ') : 'No invoices yet.');
        } catch (error) { showBilling(error.message, 'error'); }
        finally { ui.setBusy(invoicesBtn, false); }
      });
    }

    /* integrations */
    const integrationsResult = container.querySelector('#integrations-result');
    const showIntegrations = (message, kind) => {
      if (!integrationsResult) return;
      integrationsResult.innerHTML = ui.alertBox(kind || 'info', esc(message));
    };
    const keyCreate = container.querySelector('#key-create');
    if (keyCreate) {
      keyCreate.addEventListener('click', async () => {
        const body = ui.fromHTML('<form id="key-form" class="col"><label class="field"><span class="field__label">Name</span><input class="input" name="name" placeholder="Storefront integration" /></label><label class="field"><span class="field__label">Scopes</span><select class="input" name="scopes"><option value="read">read</option><option value="write">write</option><option value="read,write">read + write</option></select></label><div id="key-error" hidden></div></form>');
        const foot = ui.fromHTML('<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn--primary" type="submit" form="key-form">Create key</button></div>');
        const ref = ui.modal({ title: 'Create API key', body, footer: foot });
        body.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = foot.querySelector('button');
          ui.setBusy(submit, true);
          try {
            const scopes = body.elements.scopes.value.split(',').map((scope) => scope.trim());
            const created = await App.api.apiKeys.create(body.elements.name.value.trim(), scopes, 60);
            ref.close();
            await ui.confirm({ title: 'API key created', message: `Copy it now — it is shown once: ${created.key}`, confirmText: 'Done' });
            App.refresh();
          } catch (error) {
            const box = body.querySelector('#key-error');
            box.hidden = false;
            box.innerHTML = ui.alertBox('error', esc(error.message));
          } finally { ui.setBusy(submit, false); }
        });
      });
    }
    container.querySelectorAll('[data-key-revoke]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Revoke this API key?', message: 'Integrations using it will stop working immediately.', confirmText: 'Revoke', danger: true })) return;
        try {
          await App.api.apiKeys.revoke(button.getAttribute('data-key-revoke'));
          ui.toast({ type: 'success', title: 'API key revoked' });
          App.refresh();
        } catch (error) { showIntegrations(error.message, 'error'); }
      });
    });
    const hookCreate = container.querySelector('#hook-create');
    if (hookCreate) {
      hookCreate.addEventListener('click', async () => {
        const body = ui.fromHTML('<form id="hook-form" class="col"><label class="field"><span class="field__label">HTTPS URL</span><input class="input" name="url" placeholder="https://example.com/hooks/orders" /></label><label class="field"><span class="field__label">Events</span><select class="input" name="events"><option value="order.created">order.created</option><option value="stock.low">stock.low</option><option value="order.created,stock.low">both</option></select></label><div id="hook-error" hidden></div></form>');
        const foot = ui.fromHTML('<div class="row" style="justify-content:flex-end;width:100%"><button class="btn btn--primary" type="submit" form="hook-form">Create webhook</button></div>');
        const ref = ui.modal({ title: 'Create webhook', body, footer: foot });
        body.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = foot.querySelector('button');
          ui.setBusy(submit, true);
          try {
            const events = body.elements.events.value.split(',').map((item) => item.trim());
            const created = await App.api.webhooks.create(body.elements.url.value.trim(), events);
            ref.close();
            await ui.confirm({ title: 'Webhook created', message: `Signing secret (shown once): ${created.secret}`, confirmText: 'Done' });
            App.refresh();
          } catch (error) {
            const box = body.querySelector('#hook-error');
            box.hidden = false;
            box.innerHTML = ui.alertBox('error', esc(error.message));
          } finally { ui.setBusy(submit, false); }
        });
      });
    }
    container.querySelectorAll('[data-hook-remove]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await App.api.webhooks.remove(button.getAttribute('data-hook-remove'));
          ui.toast({ type: 'success', title: 'Webhook removed' });
          App.refresh();
        } catch (error) { showIntegrations(error.message, 'error'); }
      });
    });

    /* account */
    const accountResult = container.querySelector('#account-result');
    const showAccount = (message, kind) => {
      if (!accountResult) return;
      accountResult.innerHTML = ui.alertBox(kind || 'info', esc(message));
    };
    const resendBtn = container.querySelector('#resend-verify');
    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        ui.setBusy(resendBtn, true);
        try {
          await App.api.auth.resendVerification();
          showAccount('If verification is required, an email has been sent.');
        } catch (error) { showAccount(error.message, 'error'); }
        finally { ui.setBusy(resendBtn, false); }
      });
    }
    const notifLow = container.querySelector('#notif-low');
    const notifOrders = container.querySelector('#notif-orders');
    const saveNotifications = async () => {
      try {
        await App.api.account.notifications({
          lowStockEmail: Boolean(notifLow && notifLow.checked),
          customerOrderEmails: Boolean(notifOrders && notifOrders.checked)
        });
        showAccount('Notification preferences saved.');
      } catch (error) { showAccount(error.message, 'error'); }
    };
    if (notifLow) notifLow.addEventListener('change', saveNotifications);
    if (notifOrders) notifOrders.addEventListener('change', saveNotifications);
    const exportBtn = container.querySelector('#account-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        ui.setBusy(exportBtn, true);
        try {
          const saved = await App.api.account.exportData();
          if (saved) showAccount(`Export saved to ${saved.filePath || saved.filename || 'disk'}.`);
        } catch (error) { showAccount(error.message, 'error'); }
        finally { ui.setBusy(exportBtn, false); }
      });
    }
    const logoutAllBtn = container.querySelector('#logout-all');
    if (logoutAllBtn) {
      logoutAllBtn.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Sign out everywhere?', message: 'Every device session will be revoked, including this one.', confirmText: 'Sign out everywhere', danger: true })) return;
        try {
          await App.api.auth.logoutAll();
          App.signOut();
        } catch (error) { showAccount(error.message, 'error'); }
      });
    }
    const deleteBtn = container.querySelector('#account-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!await ui.confirm({ title: 'Delete your account?', message: 'Deletion is scheduled in 30 days and every session is revoked.', confirmText: 'Delete account', danger: true })) return;
        try {
          await App.api.account.remove();
          ui.toast({ type: 'success', title: 'Account deletion scheduled' });
          App.signOut();
        } catch (error) { showAccount(error.message, 'error'); }
      });
    }
  }

  App.views = App.views || {};
  App.views.settings = {
    title: 'Settings',
    subtitle: 'Connection, billing, integrations and local data.',
    actions: [],
    mount
  };
})();
