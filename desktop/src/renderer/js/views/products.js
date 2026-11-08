/* Products: catalogue list, create / edit, delete */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const { esc, num, money, dateShort, timeAgo } = App.util;
  const ui = App.ui;

  const state = {
    search: '',
    category: '',
    sort: 'createdAt',
    page: 1,
    limit: 12,
    categories: [],
    data: null
  };

  let listHost = null;
  let searchInput = null;

  /* ------------------------------------------------------------- loading */

  // The API passes `search` straight into a Mongo `$regex`, so a stray "(" would
  // crash the query. Escape metacharacters before sending, keep the raw text in the box.
  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }


  async function loadCategories() {
    try {
      const all = await App.api.products.all({ maxPages: 20 });
      App.state.catalog = all;
      const categories = Array.from(
        new Set(all.map((product) => String(product.category || '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      state.categories = categories;
    } catch (error) {
      state.categories = [];
    }
  }

  async function loadList() {
    if (!listHost) return;
    listHost.innerHTML = ui.skeletonRows(6).outerHTML;

    try {
      const data = await App.api.products.list({
        search: state.search ? escapeRegex(state.search) : undefined,
        category: state.category || undefined,
        sort: state.sort,
        page: state.page,
        limit: state.limit
      });
      state.data = data;
      renderList();
    } catch (error) {
      listHost.innerHTML = `<div class="card__body">${ui.alertBox(
        'error',
        `<strong>Could not load products.</strong><br />${esc(error.message)}`
      )}<div class="row" style="margin-top:12px"><button class="btn btn--ghost btn--sm" data-retry>${App.icon(
        'refresh',
        14
      )} Try again</button></div></div>`;
      const retry = listHost.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', loadList);
      throw error;
    }
  }

  /* ------------------------------------------------------------ rendering */

  function stockCell(product) {
    const stock = Number(product.stock) || 0;
    const threshold = Number(product.lowStockThreshold) || 5;
    const capacity = Math.max(threshold * 4, stock, 10);
    const pct = stock === 0 ? 0 : App.util.clamp(Math.round((stock / capacity) * 100), 6, 100);
    const level = stock === 0 ? 'is-out' : stock <= threshold ? 'is-low' : '';
    return `
      <div class="stock">
        <div class="stock__line">
          <span class="stock__value">${num(stock)}</span>
          <span class="stock__of">${stock === 0 ? 'out of stock' : `min ${num(threshold)}`}</span>
        </div>
        <div class="stock__track"><div class="stock__fill ${level}" style="width:${pct}%"></div></div>
      </div>`;
  }

  function rowsMarkup(products) {
    return products
      .map((product) => {
        const low = Number(product.stock) === 0;
        return `
        <tr data-id="${esc(product._id)}">
          <td>
            <div class="cell-main">
              ${ui.thumb(product)}
              <div class="cell-main__text">
                <div class="cell-title">${esc(product.name)}</div>
                <div class="cell-sub">${low ? '<span class="rose">Out of stock</span>' : `Updated ${esc(timeAgo(product.updatedAt))}`}</div>
              </div>
            </div>
          </td>
          <td>${product.category ? `<span class="pill pill--neutral">${esc(product.category)}</span>` : '<span class="mute">—</span>'}</td>
          <td class="num strong">${money(product.price)}</td>
          <td>${stockCell(product)}</td>
          <td class="right mute small nowrap">${esc(dateShort(product.createdAt))}</td>
          <td class="actions">
            <div class="row-actions">
              <button class="iconbtn" type="button" data-act="stock" title="Adjust stock">${App.icon('layers', 15)}</button>
              <button class="iconbtn" type="button" data-act="edit" title="Edit product">${App.icon('edit', 15)}</button>
              <button class="iconbtn is-danger" type="button" data-act="delete" title="Delete product">${App.icon('trash', 15)}</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');
  }

  function renderList() {
    const data = state.data || { products: [], pagnition: { page: 1, limit: state.limit, total: 0, totalPages: 0 } };
    const products = data.products || [];
    const pagnition = data.pagnition || {};

    if (!products.length) {
      const filtered = Boolean(state.search || state.category);
      listHost.innerHTML = `<div class="card__body">${ui
        .emptyState({
          icon: filtered ? 'search' : 'box',
          title: filtered ? 'No product matches these filters' : 'No products yet',
          text: filtered
            ? 'Try a different search term or clear the category filter.'
            : 'Create your first product — name, price and an image are all the API needs.',
          actionLabel: filtered ? 'Clear filters' : 'Create a product',
          onAction: filtered
            ? () => {
                state.search = '';
                state.category = '';
                state.page = 1;
                if (searchInput) searchInput.value = '';
                const select = document.querySelector('#category-filter');
                if (select) select.value = '';
                loadList();
              }
            : () => openForm(null)
        })
        .outerHTML}</div>`;
      return;
    }

    listHost.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th class="num">Price</th>
              <th>Stock</th>
              <th class="right">Created</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>${rowsMarkup(products)}</tbody>
        </table>
      </div>
      <div data-foot></div>`;

    const foot = listHost.querySelector('[data-foot]');
    foot.appendChild(
      ui.pagination({
        page: pagnition.page || state.page,
        totalPages: pagnition.totalPages || 0,
        total: pagnition.total || products.length,
        limit: pagnition.limit || state.limit,
        onPage: (page) => {
          state.page = page;
          loadList().catch(() => {});
        }
      })
    );

    ui.hydrateImages(listHost);

    listHost.querySelectorAll('tbody tr[data-id]').forEach((row) => {
      const id = row.getAttribute('data-id');
      const product = products.find((item) => item._id === id);
      if (!product) return;
      row.querySelectorAll('[data-act]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const action = button.getAttribute('data-act');
          if (action === 'edit') openForm(product);
          if (action === 'stock') App.views.inventory.openStockModal(product, 'in');
          if (action === 'delete') removeProduct(product);
        });
      });
      row.addEventListener('dblclick', () => openForm(product));
    });
  }

  async function removeProduct(product) {
    const confirmed = await ui.confirm({
      title: 'Delete this product?',
      message: `“${product.name}” will be removed from the catalogue. This cannot be undone.`,
      confirmText: 'Delete product',
      danger: true
    });
    if (!confirmed) return;

    try {
      await App.api.products.remove(product._id);
      ui.toast({ type: 'success', title: 'Product deleted', message: `${product.name} is no longer in the catalogue.` });
      await Promise.all([loadList(), loadCategories()]);
      refreshCategoryFilter();
      if (App.refreshNavCounts) App.refreshNavCounts();
    } catch (error) {
      ui.toast({ type: 'error', title: 'Could not delete', message: error.message });
    }
  }

  /* ------------------------------------------------------------ form modal */

  function openForm(product) {
    const editing = Boolean(product);
    let selectedFile = null;
    let previewUrl = null;

    const body = ui.fromHTML(`
      <form class="col" style="gap:14px" id="product-form" novalidate>
        <div class="dropzone" id="dropzone">
          <input type="file" accept="image/png,image/jpeg,image/webp" id="image-input" />
          <div class="dropzone__preview" id="preview">
            ${App.icon('image', 20)}
          </div>
          <div class="dropzone__text">
            <div class="dropzone__title">${editing ? 'Replace product image' : 'Product image'}</div>
            <div class="dropzone__hint">PNG, JPG or WebP · up to 5 MB${editing ? ' · leave empty to keep the current one' : ''}</div>
          </div>
        </div>

        <div class="form-grid">
          <label class="field span-2">
            <span class="field__label">Product name</span>
            <input class="input" name="name" maxlength="120" placeholder="e.g. Casque Bluetooth Pro"
              value="${esc(product ? product.name : '')}" autofocus />
          </label>
          <label class="field">
            <span class="field__label">Price (DZD)</span>
            <input class="input" name="price" type="number" min="0" step="1" placeholder="0"
              value="${product ? esc(product.price) : ''}" />
          </label>
          <label class="field">
            <span class="field__label">Category</span>
            <input class="input" name="category" list="category-options" placeholder="Electronics"
              value="${esc(product && product.category ? product.category : '')}" />
            <datalist id="category-options">
              ${state.categories.map((category) => `<option value="${esc(category)}"></option>`).join('')}
            </datalist>
          </label>
        </div>

        ${
          editing
            ? `<div class="alert alert--info">${App.icon('info', 15)}
                <div>Stock is not edited here — use <strong>Stock in / Stock out</strong> so every movement stays traceable.</div></div>`
            : `<div class="alert alert--info">${App.icon('info', 15)}
                <div>New products start with <strong>0 units</strong>. Add stock right after creating it.</div></div>`
        }

        <div id="form-error" hidden></div>
      </form>
    `);

    const foot = ui.fromHTML(`
      <div class="row" style="justify-content:flex-end;gap:9px;width:100%">
        <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        <button class="btn btn--primary" type="submit" form="product-form" data-submit>
          ${editing ? 'Save changes' : 'Create product'}
        </button>
      </div>
    `);

    const ref = ui.modal({
      title: editing ? 'Edit product' : 'New product',
      subtitle: editing ? product.name : 'Add an item to your catalogue',
      body,
      footer: foot,
      onClose: () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    });

    const form = body.matches('form') ? body : body.querySelector('#product-form');
    const fileInput = body.querySelector('#image-input');
    const preview = body.querySelector('#preview');
    const dropzone = body.querySelector('#dropzone');
    const errorBox = body.querySelector('#form-error');
    const submit = foot.querySelector('[data-submit]');

    const showError = (message) => {
      errorBox.hidden = false;
      errorBox.innerHTML = ui.alertBox('error', esc(message));
    };

    if (product && product.image) {
      App.api.images.resolve(product.image).then((dataUrl) => {
        if (dataUrl && preview) preview.innerHTML = `<img alt="" src="${dataUrl}" />`;
      });
    }

    function applyFile(file) {
      if (!file) return;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) {
        showError('Only PNG, JPG or WebP images are accepted.');
        fileInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showError('The image is larger than 5 MB. Please pick a smaller file.');
        fileInput.value = '';
        return;
      }
      selectedFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      preview.innerHTML = `<img alt="" src="${previewUrl}" />`;
      errorBox.hidden = true;
    }

    fileInput.addEventListener('change', () => applyFile(fileInput.files && fileInput.files[0]));

    ['dragenter', 'dragover'].forEach((type) =>
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-drag');
      })
    );
    ['dragleave', 'drop'].forEach((type) =>
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-drag');
        if (type === 'drop' && event.dataTransfer && event.dataTransfer.files.length) {
          fileInput.files = event.dataTransfer.files;
          applyFile(event.dataTransfer.files[0]);
        }
      })
    );

    foot.querySelector('[data-cancel]').addEventListener('click', () => ref.close());

    async function save() {
      errorBox.hidden = true;

      const name = form.elements.name.value.trim();
      const price = Number(form.elements.price.value);
      const category = form.elements.category.value.trim();

      if (!name || name.length < 3) return showError('Please give the product a name of at least 3 characters.');
      if (!Number.isFinite(price) || price <= 0) return showError('The price must be a number greater than 0.');
      if (!editing && !selectedFile) return showError('Please choose a product image — the API requires one.');

      ui.setBusy(submit, true);
      try {
        let bytes = null;
        let filePayload = null;

        if (selectedFile) {
          const buffer = await selectedFile.arrayBuffer();
          bytes = buffer;
          filePayload = {
            name: selectedFile.name,
            type: selectedFile.type,
            data: new Uint8Array(buffer)
          };
        }

        const fields = { name, price, category };

        if (editing) {
          const result = await App.api.products.update(product._id, fields, filePayload);
          const updated = (result && result.product) || null;
          if (filePayload && updated && updated.image) {
            await App.api.images.remember(updated.image, bytes);
          }
          ui.toast({ type: 'success', title: 'Product updated', message: `${name} has been saved.` });
        } else {
          const { product: created } = await App.api.products.create(fields, filePayload);
          if (filePayload && created && created.image) {
            await App.api.images.remember(created.image, bytes);
          }
          ui.toast({ type: 'success', title: 'Product created', message: `${name} was added. Add stock to start selling.` });
        }

        ref.close();
        await Promise.all([loadList(), loadCategories()]);
        refreshCategoryFilter();
        if (App.refreshNavCounts) App.refreshNavCounts();
      } catch (error) {
        showError(error.message);
        ui.setBusy(submit, false);
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
    submit.addEventListener('click', (event) => {
      event.preventDefault();
      save();
    });
  }

  /* ------------------------------------------------------------------ view */

  function categoryOptions() {
    const current = state.category;
    return (
      '<option value="">All categories</option>' +
      state.categories
        .map(
          (category) =>
            `<option value="${esc(category)}"${category === current ? ' selected' : ''}>${esc(category)}</option>`
        )
        .join('')
    );
  }

  async function mount(container) {
    state.page = 1;
    container.innerHTML = `<div class="view__inner">
      <div class="card">
        <div class="card__head" style="flex-wrap:wrap;gap:10px">
          <div class="toolbar">
            <div class="input-group input-group--clear search">
              ${App.icon('search', 15)}
              <input class="input" id="product-search" placeholder="Search products…" value="${esc(state.search)}" />
              <button class="input-group__clear" type="button" data-clear-search aria-label="Clear">${App.icon('close', 13)}</button>
            </div>
            <select class="select width-auto" id="category-filter" style="min-width:158px">${categoryOptions()}</select>
            <select class="select width-auto" id="sort-filter" style="min-width:150px">
              <option value="createdAt">Newest first</option>
              <option value="name">Name (Z–A)</option>
              <option value="price">Price (high → low)</option>
            </select>
          </div>
          <button class="btn btn--quiet btn--icon btn--sm" type="button" id="reload-products" title="Refresh">
            ${App.icon('refresh', 15)}
          </button>
        </div>
        <div id="products-list"></div>
      </div>
    </div>`;

    listHost = container.querySelector('#products-list');
    searchInput = container.querySelector('#product-search');

    container.querySelector('#sort-filter').value = state.sort;

    const debouncedSearch = App.util.debounce(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      loadList().catch(() => {});
    }, 300);

    searchInput.addEventListener('input', debouncedSearch);
    container.querySelector('[data-clear-search]').addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      state.page = 1;
      loadList().catch(() => {});
    });

    container.querySelector('#category-filter').addEventListener('change', (event) => {
      state.category = event.target.value;
      state.page = 1;
      loadList().catch(() => {});
    });

    container.querySelector('#sort-filter').addEventListener('change', (event) => {
      state.sort = event.target.value;
      state.page = 1;
      loadList().catch(() => {});
    });

    container.querySelector('#reload-products').addEventListener('click', () => {
      Promise.all([loadList(), loadCategories()])
        .then(() => refreshCategoryFilter())
        .catch(() => {});
    });

    await Promise.all([loadList().catch(() => {}), loadCategories()]);
    refreshCategoryFilter();
  }

  function refreshCategoryFilter() {
    const select = document.getElementById('category-filter');
    if (!select) return;
    select.innerHTML = categoryOptions();
    select.value = state.category;
  }

  App.views = App.views || {};
  App.views.products = {
    title: 'Products',
    subtitle: 'Your catalogue — search, edit and keep prices up to date.',
    actions: [
      {
        label: 'New product',
        icon: 'plus',
        variant: 'primary',
        onClick: () => openForm(null)
      }
    ],
    mount,
    openCreate: () => openForm(null),
    openForm,
    reload: () => loadList().catch(() => {})
  };
})();
