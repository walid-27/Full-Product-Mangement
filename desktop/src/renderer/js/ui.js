/* UI primitives: toasts, modals, dialogs, tables states, pagination */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { el, esc } = App.util;

  const root = (id) => document.getElementById(id);

  /* --------------------------------------------------------------- toasts */

  const TOAST_ICONS = { success: 'check', error: 'alert', info: 'info', warn: 'alert' };

  function toast(options) {
    const opts = typeof options === 'string' ? { message: options } : options || {};
    const type = opts.type || 'info';
    const host = root('toast-root');
    if (!host) return;

    const node = el('div', { class: `toast toast--${type}` });
    node.innerHTML =
      `<span class="toast__icon">${App.icon(TOAST_ICONS[type] || 'info', 16)}</span>` +
      '<div class="grow">' +
      (opts.title ? `<div class="toast__title">${esc(opts.title)}</div>` : '') +
      `<div class="toast__msg">${esc(opts.message || '')}</div>` +
      '</div>' +
      `<button class="iconbtn" aria-label="Dismiss">${App.icon('close', 13)}</button>`;

    host.appendChild(node);

    let timer = null;
    const remove = () => {
      clearTimeout(timer);
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 220);
    };
    node.querySelector('button').addEventListener('click', remove);
    timer = setTimeout(remove, opts.duration || (type === 'error' ? 7000 : 4200));
    return remove;
  }

  /* --------------------------------------------------------------- modals */

  const stack = [];

  function fromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html).trim();
    return template.content.firstElementChild;
  }

  /**
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.subtitle]
   * @param {HTMLElement|string} options.body
   * @param {HTMLElement|string} [options.footer]
   * @param {string} [options.size] 'sm' | 'wide' | 'drawer'
   * @param {boolean} [options.dismissible]
   * @param {function} [options.onMount] (refs) => void
   */
  function modal(options) {
    const opts = options || {};
    const dismissible = opts.dismissible !== false;

    const overlay = el('div', { class: 'overlay' });
    const panelClass =
      opts.size === 'drawer'
        ? 'drawer'
        : `modal${opts.size === 'wide' ? ' modal--wide' : ''}${opts.size === 'sm' ? ' modal--sm' : ''}`;
    const panel = el('div', { class: panelClass, role: 'dialog', 'aria-modal': 'true' });

    const head = el('div', { class: 'modal__head' });
    const headText = el('div');
    headText.innerHTML =
      `<div class="modal__title">${esc(opts.title || '')}</div>` +
      (opts.subtitle ? `<div class="modal__sub">${esc(opts.subtitle)}</div>` : '');
    head.appendChild(headText);

    if (dismissible) {
      const closeBtn = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close' });
      closeBtn.innerHTML = App.icon('close', 16);
      closeBtn.addEventListener('click', () => close());
      head.appendChild(closeBtn);
    }

    const body = el('div', { class: 'modal__body' });
    if (opts.body instanceof HTMLElement) body.appendChild(opts.body);
    else if (typeof opts.body === 'string') body.innerHTML = opts.body;

    panel.appendChild(head);
    panel.appendChild(body);

    let footerNode = null;
    if (opts.footer) {
      footerNode = el('div', { class: 'modal__foot' });
      if (opts.footer instanceof HTMLElement) footerNode.appendChild(opts.footer);
      else footerNode.innerHTML = opts.footer;
      panel.appendChild(footerNode);
    }

    overlay.appendChild(panel);

    const previouslyFocused = document.activeElement;
    let closed = false;

    function onKeyDown(event) {
      if (event.key !== 'Escape' || !dismissible) return;
      // Only the top-most modal reacts to Escape.
      if (stack[stack.length - 1] !== instance) return;
      event.stopPropagation();
      close();
    }

    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown, true);
      const index = stack.indexOf(instance);
      if (index >= 0) stack.splice(index, 1);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) {
        try {
          previouslyFocused.focus();
        } catch (error) {
          /* ignore */
        }
      }
      if (typeof opts.onClose === 'function') opts.onClose(result);
    }

    if (dismissible) {
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close();
      });
    }
    document.addEventListener('keydown', onKeyDown, true);

    const host = root('modal-root') || document.body;
    host.appendChild(overlay);

    const instance = {
      overlay,
      panel,
      body,
      footer: footerNode,
      close,
      setTitle(text) {
        headText.querySelector('.modal__title').textContent = text;
      }
    };

    stack.push(instance);

    if (typeof opts.onMount === 'function') opts.onMount(instance);

    const autofocus = panel.querySelector('[autofocus]');
    if (autofocus) setTimeout(() => autofocus.focus(), 30);

    return instance;
  }

  function confirmDialog(options) {
    const opts = typeof options === 'string' ? { message: options } : options || {};
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const footer = el('div', { class: 'row', style: 'gap:9px;justify-content:flex-end;width:100%' });
      footer.innerHTML =
        `<button class="btn btn--ghost" data-act="cancel" type="button">${esc(opts.cancelText || 'Cancel')}</button>` +
        `<button class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" data-act="ok" type="button" autofocus>` +
        `${esc(opts.confirmText || 'Confirm')}</button>`;

      const ref = modal({
        title: opts.title || 'Are you sure?',
        subtitle: opts.subtitle,
        size: 'sm',
        body: `<p class="muted" style="font-size:13px;line-height:1.6">${esc(opts.message || '')}</p>`,
        footer,
        onClose: () => finish(false)
      });

      footer.querySelector('[data-act="cancel"]').addEventListener('click', () => {
        finish(false);
        ref.close();
      });
      footer.querySelector('[data-act="ok"]').addEventListener('click', () => {
        finish(true);
        ref.close();
      });
    });
  }

  /* -------------------------------------------------------- empty / loading */

  function emptyState(options) {
    const opts = options || {};
    const node = el('div', { class: 'empty' });
    node.innerHTML =
      `<div class="empty__icon">${App.icon(opts.icon || 'inbox', 22)}</div>` +
      `<div class="empty__title">${esc(opts.title || 'Nothing here yet')}</div>` +
      (opts.text ? `<div class="empty__text">${esc(opts.text)}</div>` : '') +
      (opts.actionLabel ? `<div class="empty__action"><button class="btn btn--primary btn--sm" type="button">${esc(opts.actionLabel)}</button></div>` : '');
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      node.querySelector('.empty__action button').addEventListener('click', opts.onAction);
    }
    return node;
  }

  function skeletonRows(count, template) {
    const rows = template || '40px 1.7fr 1fr .8fr .9fr';
    const wrap = el('div', { class: 'sk-rows' });
    let html = '';
    for (let index = 0; index < (count || 6); index += 1) {
      html +=
        `<div class="sk-row" style="grid-template-columns:${rows}">` +
        '<div class="skeleton" style="height:34px;border-radius:10px"></div>' +
        '<div class="skeleton" style="width:78%"></div>' +
        '<div class="skeleton" style="width:52%"></div>' +
        '<div class="skeleton" style="width:60%"></div>' +
        '<div class="skeleton" style="width:44%;justify-self:end"></div>' +
        '</div>';
    }
    wrap.innerHTML = html;
    return wrap;
  }

  function skeletonBlock(height) {
    return el('div', {
      class: 'skeleton',
      style: `height:${height || 120}px;border-radius:14px`
    });
  }

  /* ------------------------------------------------------------ pagination */

  function pagination(options) {
    const opts = options || {};
    const page = Math.max(1, Number(opts.page) || 1);
    const totalPages = Math.max(0, Number(opts.totalPages) || 0);
    const total = Number(opts.total) || 0;
    const limit = Number(opts.limit) || 12;
    const onPage = typeof opts.onPage === 'function' ? opts.onPage : () => {};

    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    const wrap = el('div', { class: 'table-foot' });
    const info = el('div');
    info.innerHTML = total
      ? `Showing <strong class="strong">${from}–${to}</strong> of <strong class="strong">${total}</strong>`
      : 'No results';

    const nav = el('div', { class: 'pagination' });

    const pages = [];
    if (totalPages <= 7) {
      for (let index = 1; index <= totalPages; index += 1) pages.push(index);
    } else {
      pages.push(1);
      if (page > 3) pages.push('…');
      for (let index = Math.max(2, page - 1); index <= Math.min(totalPages - 1, page + 1); index += 1) {
        pages.push(index);
      }
      if (page < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }

    const makeBtn = (label, target, extra) => {
      const btn = el('button', { class: `page-btn${extra ? ` ${extra}` : ''}`, type: 'button' });
      btn.innerHTML = label;
      if (target === null) btn.disabled = true;
      else btn.addEventListener('click', () => onPage(target));
      return btn;
    };

    nav.appendChild(makeBtn(App.icon('chevronsLeft', 13), page > 1 ? 1 : null));
    nav.appendChild(makeBtn(App.icon('chevronLeft', 13), page > 1 ? page - 1 : null));

    for (const item of pages) {
      if (item === '…') {
        const dots = el('span', { class: 'mute small', style: 'padding:0 4px' });
        dots.textContent = '…';
        nav.appendChild(dots);
      } else {
        nav.appendChild(makeBtn(String(item), item, item === page ? 'is-active' : ''));
      }
    }

    nav.appendChild(makeBtn(App.icon('chevronRight', 13), page < totalPages ? page + 1 : null));
    nav.appendChild(makeBtn(App.icon('chevronsRight', 13), page < totalPages ? totalPages : null));

    wrap.appendChild(info);
    wrap.appendChild(nav);
    return wrap;
  }

  /* --------------------------------------------------------------- helpers */

  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      button.classList.add('is-loading');
      button.disabled = true;
    } else {
      button.classList.remove('is-loading');
      button.disabled = false;
    }
  }

  function pill(status) {
    const value = String(status || '').toLowerCase();
    const klass = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(value)
      ? `pill--${value}`
      : 'pill--neutral';
    return `<span class="pill ${klass}"><span class="dot"></span>${esc(value || 'unknown')}</span>`;
  }

  const AVATAR_GRADIENT = (seed) => {
    const [a, b] = App.util.colorFor(seed);
    return `background:linear-gradient(140deg, ${a}, ${b});color:#06121a`;
  };

  function avatar(name, small) {
    return (
      `<span class="avatar${small ? ' avatar--sm' : ''}" style="${AVATAR_GRADIENT(name)}">` +
      `${esc(App.util.initials(name))}</span>`
    );
  }

  function thumb(product, large) {
    const size = large ? 'thumb--lg' : '';
    const name = (product && product.name) || '';
    const image = product && product.image;
    const initials = esc(App.util.initials(name));
    if (!image) {
      return `<span class="thumb ${size}">${initials}</span>`;
    }
    return (
      `<span class="thumb ${size}" data-image="${esc(image)}" data-fallback="${initials}">` +
      `${initials}</span>`
    );
  }

  /** Replace [data-image] placeholders with cached/remote image data URLs. */
  async function hydrateImages(container) {
    if (!container) return;
    const targets = Array.from(container.querySelectorAll('[data-image]'));
    await Promise.all(
      targets.map(async (node) => {
        const filename = node.getAttribute('data-image');
        if (!filename || node.dataset.hydrated === '1') return;
        node.dataset.hydrated = '1';
        const dataUrl = await App.api.images.resolve(filename);
        if (dataUrl) {
          node.innerHTML = `<img alt="" src="${dataUrl}">`;
        }
      })
    );
  }

  function alertBox(type, html) {
    const icon = type === 'error' ? 'alert' : type === 'warn' ? 'alert' : type === 'accent' ? 'check' : 'info';
    return `<div class="alert alert--${type || 'info'}">${App.icon(icon, 16)}<div>${html}</div></div>`;
  }

  function statusDot(kind) {
    return `<span class="status-dot ${kind === 'ok' ? 'is-ok' : kind === 'bad' ? 'is-bad' : ''}"></span>`;
  }

  App.ui = {
    toast,
    modal,
    confirm: confirmDialog,
    closeAll() {
      while (stack.length) stack[stack.length - 1].close();
    },
    emptyState,
    skeletonRows,
    skeletonBlock,
    pagination,
    setBusy,
    pill,
    avatar,
    thumb,
    hydrateImages,
    alertBox,
    statusDot,
    fromHTML
  };
})();
