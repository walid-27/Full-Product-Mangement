/* Sign in / register screen */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc } = App.util;
  const ui = App.ui;

  const DEMO_EMAIL = 'demo@stockflow.app';
  const DEMO_PASSWORD = 'demo1234';

  const state = {
    mode: 'login',
    email: '',
    endpointState: { kind: '', text: '' }
  };

  function features() {
    return [
      ['box', 'Product catalogue with images, categories and search'],
      ['layers', 'Stock in / stock out with low-stock alerts'],
      ['receipt', 'Order pipeline from pending to delivered']
    ]
      .map(
        ([icon, text]) =>
          `<div class="auth__feature"><span class="auth__feature-icon">${App.icon(icon, 15)}</span>${esc(text)}</div>`
      )
      .join('');
  }

  function passwordHint() {
    return '12+ characters with uppercase, lowercase and a number (max 72).';
  }

  function fieldMarkup() {
    if (state.mode === 'register') {
      return (
        '<label class="field"><span class="field__label">Full name</span>' +
        '<input class="input" name="name" type="text" placeholder="Amine Belkacem" autocomplete="name" /></label>' +
        '<label class="field"><span class="field__label">Email</span>' +
        `<input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="username" value="${esc(state.email)}" /></label>` +
        '<label class="field"><span class="field__label">Password</span>' +
        '<div class="input-group input-group--clear">' +
        `<input class="input" name="password" type="password" placeholder="${esc(passwordHint())}" autocomplete="new-password" />` +
        `<button class="input-group__clear" type="button" data-reveal aria-label="Show password">${App.icon('eye', 13)}</button>` +
        '</div></label>' +
        '<label class="field"><span class="field__label">Confirm password</span>' +
        '<input class="input" name="confirm" type="password" placeholder="Repeat the password" autocomplete="new-password" /></label>'
      );
    }

    if (state.mode === 'forgot') {
      return (
        '<label class="field"><span class="field__label">Email</span>' +
        `<input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="username" autofocus value="${esc(state.email)}" /></label>` +
        '<p class="small mute">We will email you a one-hour reset link. The response never reveals whether the account exists.</p>'
      );
    }

    if (state.mode === 'reset') {
      return (
        '<label class="field"><span class="field__label">Reset token</span>' +
        '<input class="input" name="token" type="text" placeholder="Paste the token from your email" autocomplete="off" autofocus /></label>' +
        '<label class="field"><span class="field__label">New password</span>' +
        '<div class="input-group input-group--clear">' +
        `<input class="input" name="password" type="password" placeholder="${esc(passwordHint())}" autocomplete="new-password" />` +
        `<button class="input-group__clear" type="button" data-reveal aria-label="Show password">${App.icon('eye', 13)}</button>` +
        '</div></label>' +
        '<label class="field"><span class="field__label">Confirm password</span>' +
        '<input class="input" name="confirm" type="password" placeholder="Repeat the password" autocomplete="new-password" /></label>'
      );
    }

    if (state.mode === 'verify') {
      return (
        '<div class="alert alert--info">' +
        `${App.icon('info', 15)}<div>Your account was created but the email is not verified yet. Paste the verification token from your email below — organization data stays locked until then.</div></div>` +
        '<label class="field"><span class="field__label">Verification token</span>' +
        '<input class="input" name="token" type="text" placeholder="Paste the token from your email" autocomplete="off" autofocus /></label>' +
        '<div class="row" style="gap:8px">' +
        '<button class="btn btn--ghost btn--sm" type="button" id="resend-verify">Resend verification email</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" id="back-login">Back to sign in</button>' +
        '</div>'
      );
    }

    return (
      '<label class="field"><span class="field__label">Email</span>' +
      `<input class="input" name="email" type="email" placeholder="you@example.com" autocomplete="username" autofocus value="${esc(state.email)}" /></label>` +
      '<label class="field"><span class="field__label">Password</span>' +
      '<div class="input-group input-group--clear">' +
      '<input class="input" name="password" type="password" placeholder="Your password" autocomplete="current-password" />' +
      `<button class="input-group__clear" type="button" data-reveal aria-label="Show password">${App.icon('eye', 13)}</button>` +
      '</div></label>' +
      '<div class="row row--between">' +
      '<button class="btn btn--quiet btn--sm" type="button" id="forgot-link">Forgot password?</button>' +
      '<button class="btn btn--quiet btn--sm" type="button" id="verify-link">Verify email</button>' +
      '</div>'
    );
  }

  async function show() {
    const host = document.getElementById('auth');
    const config = App.state.config || (await App.api.config.get());
    App.state.config = config;

    const demo = Boolean(config.demoMode);
    state.mode = 'login';
    if (demo) state.email = DEMO_EMAIL;

    host.innerHTML = `
      <section class="auth__aside">
        <div class="auth__brand">
          <span class="brandmark">${App.icon('sparkles', 20)}</span>
          <div>
            <div class="auth__brand-name">StockFlow</div>
            <div class="auth__brand-tag">Products · Inventory · Orders</div>
          </div>
        </div>
        <div class="auth__pitch">
          <h2>Your whole store in <em>one calm dashboard</em>.</h2>
          <p>StockFlow is the desktop companion for your Product Management API — manage the catalogue, move stock and follow every order without opening a browser.</p>
          <div class="auth__features">${features()}</div>
        </div>
        <div class="auth__foot">
          <span>v1.0.0</span><span>·</span><span>Electron desktop client</span>
        </div>
      </section>

      <section class="auth__panel">
        <div class="auth-card">
          <div class="auth-card__head">
            <h1 id="auth-title">Welcome back</h1>
            <p id="auth-sub">Sign in to manage your products, stock and orders.</p>
          </div>

          <div class="auth-tabs" role="tablist">
            <button type="button" data-mode="login" class="is-active">Sign in</button>
            <button type="button" data-mode="register">Create account</button>
          </div>

          <form class="auth-form" id="auth-form" novalidate>
            <div id="auth-fields" class="col" style="gap:13px">${fieldMarkup()}</div>
            <div id="auth-error" hidden></div>
            <button class="btn btn--primary btn--block" type="submit" id="auth-submit">Sign in</button>
          </form>

          <div class="env-note">
            ${App.icon(demo ? 'sparkles' : 'database', 14)}
            <div class="grow">
              <div class="row row--between">
                <span class="strong">${demo ? 'Demo workspace' : 'API server'}</span>
                <span class="status-line" id="server-state">${ui.statusDot(demo ? 'ok' : '')}${
                  demo ? 'Local sample data' : 'Not tested yet'
                }</span>
              </div>
              <div class="row" style="margin-top:8px">
                <input class="input" id="api-url" style="height:32px;font-size:12px" spellcheck="false"
                  placeholder="http://localhost:5000" value="${esc(config.apiBaseUrl || '')}" ${demo ? 'disabled' : ''} />
                <button class="btn btn--ghost btn--sm" type="button" id="test-server" ${demo ? 'disabled' : ''}>Test</button>
              </div>
            </div>
          </div>

          <button class="btn btn--ghost btn--block" type="button" id="demo-btn">
            ${App.icon('sparkles', 15)}
            <span>${demo ? 'Continue with demo workspace' : 'Explore demo mode (no server needed)'}</span>
          </button>

          ${
            demo
              ? `<p class="auth-note">Demo account: <code>${DEMO_EMAIL}</code> · <code>${DEMO_PASSWORD}</code><br />
                 <a href="#" id="leave-demo">Switch back to the live API</a></p>`
              : `<p class="auth-note">Accounts live in your Product Management API.<br />Start it with <code>npm run dev</code> and make sure MongoDB is running.</p>`
          }
        </div>
      </section>
    `;

    host.hidden = false;
    bind(host);
    bindModeLinks(host);
  }

  const MODE_TEXT = {
    login: ['Welcome back', 'Sign in to manage your products, stock and orders.', 'Sign in'],
    register: ['Create your account', 'Register once in your API, then manage everything from here.', 'Create account'],
    forgot: ['Reset your password', 'Enter your account email and we will send a reset link.', 'Send reset link'],
    reset: ['Set a new password', 'Paste the reset token from your email and choose a new password.', 'Reset password'],
    verify: ['Verify your email', 'Confirm your email to unlock your organization workspace.', 'Verify email']
  };

  function setMode(mode) {
    const host = document.getElementById('auth');
    const form = host.querySelector('#auth-form');
    state.email = (form.querySelector('[name="email"]') || {}).value || state.email;
    state.mode = mode;

    host.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
    host.querySelector('#auth-fields').innerHTML = fieldMarkup();
    const [title, sub, submit] = MODE_TEXT[mode] || MODE_TEXT.login;
    host.querySelector('#auth-title').textContent = title;
    host.querySelector('#auth-sub').textContent = sub;
    host.querySelector('#auth-submit').textContent = submit;
    hideError();
    bindReveal(host);
    bindModeLinks(host);
  }

  function bindModeLinks(host) {
    const forgot = host.querySelector('#forgot-link');
    if (forgot) forgot.addEventListener('click', () => setMode('forgot'));
    const verify = host.querySelector('#verify-link');
    if (verify) verify.addEventListener('click', () => setMode('verify'));
    const back = host.querySelector('#back-login');
    if (back) back.addEventListener('click', () => setMode('login'));
    const resend = host.querySelector('#resend-verify');
    if (resend) {
      resend.addEventListener('click', async () => {
        ui.setBusy(resend, true);
        try {
          await App.api.auth.resendVerification();
          ui.toast({ type: 'success', title: 'Verification email sent', message: 'If verification is required, an email has been sent.' });
        } catch (error) {
          showError(error.message);
        } finally {
          ui.setBusy(resend, false);
        }
      });
    }
  }

  function strongPasswordError(password) {
    if (!password || password.length < 12 || password.length > 72) return 'Use 12 to 72 characters.';
    if (!/[a-z]/.test(password)) return 'Include a lowercase letter.';
    if (!/[A-Z]/.test(password)) return 'Include an uppercase letter.';
    if (!/\d/.test(password)) return 'Include a number.';
    return null;
  }

  function showError(message) {
    const box = document.getElementById('auth-error');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = ui.alertBox('error', esc(message));
  }

  function hideError() {
    const box = document.getElementById('auth-error');
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
  }

  function bindReveal(host) {
    host.querySelectorAll('[data-reveal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        if (!input) return;
        const showText = input.type === 'password';
        input.type = showText ? 'text' : 'password';
        btn.innerHTML = App.icon(showText ? 'eye' : 'eye', 13);
      });
    });
  }

  async function saveEndpoint(value) {
    const clean = String(value || '').trim();
    if (!clean) return;
    const config = await App.api.config.set({ apiBaseUrl: clean });
    App.state.config = { ...App.state.config, ...config };
  }

  async function testEndpoint() {
    const input = document.getElementById('api-url');
    const status = document.getElementById('server-state');
    const button = document.getElementById('test-server');
    if (!input || !status) return;

    ui.setBusy(button, true);
    try {
      await saveEndpoint(input.value);
      const result = await App.api.ping();
      if (result.ok) {
        status.innerHTML = `${ui.statusDot('ok')}Reachable · ${result.ms} ms`;
        ui.toast({ type: 'success', title: 'Server reachable', message: `Answered in ${result.ms} ms.` });
      } else {
        status.innerHTML = `${ui.statusDot('bad')}${esc(result.error || 'Unreachable')}`;
        ui.toast({ type: 'error', title: 'Cannot reach the server', message: result.error || 'Check the address and that the API is running.' });
      }
    } catch (error) {
      status.innerHTML = `${ui.statusDot('bad')}${esc(error.message)}`;
    } finally {
      ui.setBusy(button, false);
    }
  }

  function bind(host) {
    host.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    bindReveal(host);

    host.querySelector('#test-server').addEventListener('click', testEndpoint);
    const apiUrl = host.querySelector('#api-url');
    apiUrl.addEventListener('change', () => saveEndpoint(apiUrl.value));

    host.querySelector('#demo-btn').addEventListener('click', async () => {
      const button = host.querySelector('#demo-btn');
      ui.setBusy(button, true);
      try {
        const config = await App.api.config.set({ demoMode: true });
        App.state.config = { ...App.state.config, ...config };
        const session = await App.api.auth.login(DEMO_EMAIL, DEMO_PASSWORD);
        ui.toast({ type: 'success', title: 'Demo workspace ready', message: 'Sample products, stock and orders are stored locally.' });
        App.onAuthenticated(session);
      } catch (error) {
        showError(error.message);
        ui.setBusy(button, false);
      }
    });

    const leaveDemo = host.querySelector('#leave-demo');
    if (leaveDemo) {
      leaveDemo.addEventListener('click', async (event) => {
        event.preventDefault();
        const config = await App.api.config.set({ demoMode: false });
        App.state.config = { ...App.state.config, ...config };
        state.email = '';
        await show();
        ui.toast({ type: 'info', message: 'Demo mode disabled — sign in with your API account.' });
      });
    }

    host.querySelector('#auth-form').addEventListener('submit', onSubmit);
  }

  async function onSubmit(event) {
    event.preventDefault();
    hideError();

    const host = document.getElementById('auth');
    const form = event.currentTarget;
    const submit = host.querySelector('#auth-submit');
    const data = Object.fromEntries(new FormData(form).entries());
    const email = String(data.email || '').trim();
    const password = String(data.password || '');

    ui.setBusy(submit, true);
    try {
      if (state.mode === 'forgot') {
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          showError('Please enter a valid email address.');
          return;
        }
        await App.api.auth.forgotPassword(email);
        ui.toast({ type: 'success', title: 'Reset link sent', message: 'If the account exists, a reset email has been sent.' });
        setMode('reset');
        return;
      }

      if (state.mode === 'reset') {
        const token = String(data.token || '').trim();
        if (!token) throw new Error('Paste the reset token from your email.');
        const weak = strongPasswordError(password);
        if (weak) throw new Error(`Password: ${weak}`);
        if (password !== String(data.confirm || '')) throw new Error('The two passwords do not match.');
        await App.api.auth.resetPassword(token, password);
        ui.toast({ type: 'success', title: 'Password reset', message: 'Sign in with your new password.' });
        setMode('login');
        return;
      }

      if (state.mode === 'verify') {
        const token = String(data.token || '').trim();
        if (!token) throw new Error('Paste the verification token from your email.');
        await App.api.auth.verifyEmail(token);
        ui.toast({ type: 'success', title: 'Email verified', message: 'Sign in to continue.' });
        setMode('login');
        return;
      }

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showError('Please enter a valid email address.');
        return;
      }
      if (!password) {
        showError('Please enter your password.');
        return;
      }

      if (state.mode === 'register') {
        const name = String(data.name || '').trim();
        if (name.length < 2 || name.length > 100) throw new Error('Full name must be 2 to 100 characters.');
        const weak = strongPasswordError(password);
        if (weak) throw new Error(`Password: ${weak}`);
        if (password !== String(data.confirm || '')) throw new Error('The two passwords do not match.');

        const result = await App.api.auth.register({ name, email, password });
        const registeredSession = result && result.session;
        if (registeredSession && registeredSession.emailVerified === false) {
          ui.toast({ type: 'info', title: 'Check your email', message: 'Verify your email to unlock your workspace.' });
          setMode('verify');
          return;
        }
        const session = registeredSession || (await App.api.auth.login(email, password));
        ui.toast({ type: 'success', title: 'Account created', message: 'You are signed in — welcome to StockFlow.' });
        App.onAuthenticated(session);
        return;
      }

      const apiUrl = host.querySelector('#api-url');
      if (apiUrl && apiUrl.value.trim()) await saveEndpoint(apiUrl.value);

      const session = await App.api.auth.login(email, password);
      state.email = email;
      if (session && session.emailVerified === false) {
        ui.toast({ type: 'warn', title: 'Email not verified', message: 'Verify your email to unlock your workspace.' });
        setMode('verify');
        return;
      }
      App.onAuthenticated(session);
    } catch (error) {
      if (error && (error.code === 'EMAIL_NOT_VERIFIED' || /verify your email/i.test(error.message || ''))) {
        setMode('verify');
        showError('Verify your email before accessing organization data.');
        return;
      }
      showError(error.message || 'Something went wrong. Please try again.');
      ui.setBusy(submit, false);
    }
  }

  App.views = App.views || {};
  App.views.auth = { show, hide: () => (document.getElementById('auth').hidden = true) };
})();
