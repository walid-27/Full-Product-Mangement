/* Settings: server, appearance, session, local data, about */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, dateTime, timeAgo } = App.util;
  const ui = App.ui;

  const ENDPOINTS = [
    ['POST', '/auth/register', 'Create an account'],
    ['POST', '/auth/login', 'Get a 12h JWT'],
    ['GET', '/api/product', 'List · search · paginate'],
    ['POST', '/api/product', 'Create (multipart image)'],
    ['PATCH', '/api/product/:id', 'Update fields / image'],
    ['DELETE', '/api/product/:id', 'Remove a product'],
    ['POST', '/api/quantity/stock-in/:id', 'Add stock'],
    ['POST', '/api/quantity/stock-out/:id', 'Remove stock'],
    ['GET', '/api/quantity/low-stock', 'Low-stock alerts'],
    ['GET', '/api/quantity/out-stock', 'Out-of-stock list'],
    ['POST', '/api/order', 'Create an order'],
    ['GET', '/api/order', 'List orders'],
    ['PATCH', '/api/order/status/:id', 'Change status'],
    ['PATCH', '/api/order/cancel-order/:id', 'Cancel + restock']
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

  async function mount(container) {
    const config = (App.state.config = await App.api.config.get());
    const session = App.state.session || config.session || null;
    const info = await App.api.info().catch(() => ({}));
    const cache = await App.api.images.stats().catch(() => ({ files: 0, bytes: 0 }));

    const demo = Boolean(config.demoMode);
    const theme = config.theme === 'light' ? 'light' : 'dark';

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
                       <div class="row row--between small"><span class="mute">Token expires</span>
                         <span>${esc(session.exp ? timeAgo(new Date(session.exp * 1000)) : '—')} </span></div>
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
                Dashboard figures are computed inside the app from the product and order endpoints,
                so no additional API route is needed.
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
  }

  App.views = App.views || {};
  App.views.settings = {
    title: 'Settings',
    subtitle: 'Connection, appearance and local data.',
    actions: [],
    mount
  };
})();
