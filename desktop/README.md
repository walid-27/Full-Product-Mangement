# StockFlow — Windows desktop app

A complete Electron desktop client for the **Full Product Management API** (`walid-27/Full-Product-Mangement`).

Manage products, stock movements and customer orders from a native Windows window instead of a browser —
with a dashboard, search, pagination, image uploads, low-stock alerts and an order pipeline.

> This folder is **standalone**. It does not import, patch or require any file from the API repository:
> it only talks to the API over HTTP. Your backend stays exactly as it is.

---

## 1. Quick start (Windows)

You need **Node.js 18 or newer** (https://nodejs.org). Then, inside this folder:

| Step | File | What it does |
| --- | --- | --- |
| 1 | `1-install.bat` | Installs the dependencies (downloads Electron once, ~100 MB) |
| 2 | `2-run.bat` | Starts the app (`npm start`) |
| 3 | `3-build-installer.bat` | Builds the Windows installer + portable `.exe` into `release\` |

Or from a terminal:

```bat
npm install
npm start            :: run the app
npm run dist         :: build installer + portable exe (release\)
npm run dist:setup   :: build the NSIS installer only
npm test             :: run the automated test suite
```

The first launch opens the sign-in screen. Two ways in:

* **Demo workspace** — one click, no server, no MongoDB. Sample products/orders are stored locally so you can
  explore every screen immediately.
* **Your API** — enter the address of the running backend (default `http://localhost:5000`), then sign in or
  create an account.

To run the backend locally:

```bat
:: in the API repository
npm install
:: .env  →  MONGO_URL=mongodb://127.0.0.1:27017/full_product_api   SECRET_JWT=some-secret
npm run dev
```

---

## 2. What is inside

```
desktop/
├─ src/
│  ├─ main/
│  │  ├─ main.js          Electron entry point, windows, IPC handlers, session
│  │  ├─ api-client.js    HTTP client (fetch, multipart uploads, timeouts, error mapping)
│  │  ├─ mock-api.js      "Demo mode" backend — a faithful in-process replica of the API
│  │  ├─ images.js        Local product-image cache (upload → disk → data URL)
│  │  └─ store.js         JSON settings store + token encryption hooks
│  ├─ preload/preload.js  The only bridge exposed to the UI (contextIsolation, sandbox)
│  └─ renderer/
│     ├─ index.html       Shell: title bar, sidebar, page header
│     ├─ css/app.css      Design system (dark + light), components, responsive rules
│     └─ js/
│        ├─ api.js, ui.js, util.js, icons.js
│        ├─ views/auth.js, dashboard.js, products.js, inventory.js, orders.js, settings.js
│        └─ app.js        Router, session, window chrome, global shortcuts
├─ assets/                App icon (png + ico)
├─ preview/               Static HTML snapshots of every screen (open in any browser)
├─ test/                  77 automated tests (see §7)
├─ ci/                    GitHub Actions workflow + the preview renderer
└─ package.json           Scripts + electron-builder configuration
```

---

## 2b. See the interface without installing

Open any file in **`preview/`** with Chrome or Edge — these are snapshots of the real interface
rendered by the app itself (sign-in, dashboard, products, inventory, orders, order detail, settings,
dark and light themes). They need no server, no Node and no install.

Regenerate them at any time with `node ci/make-preview.js`.

---

## 3. Features

**Dashboard**
* Products, units on hand, inventory value and delivered revenue
* Orders over the last 14 days (bar chart), order pipeline by status, in-flight value
* Recent orders and a “needs restocking” list with one-click restock

**Products**
* Server-side search, category filter, sorting and pagination
* Create / edit with drag-and-drop image upload (PNG, JPG, WebP ≤ 5 MB)
* Delete with confirmation; stock level shown as a colour-coded bar
* Quick “adjust stock” action from the list

**Inventory**
* All stock, low-stock and out-of-stock tabs with counters
* Stock-in / stock-out modal with live preview of the resulting quantity
* Local movement log (this computer) so you always have a trail of what you changed
  — the API does not expose a movements endpoint

**Orders**
* Pipeline table: search by customer or city, filter by status, sort, pagination
* Drawer with customer details, items, totals and status actions
* Create an order with a searchable product picker, quantity steppers and a live total
* Change status or cancel (cancelling returns stock, as the API does)
* Algerian mobile validation matches the backend rule (`0[567]XXXXXXXX`)

**Everywhere**
* Dark and light themes, custom frameless window, keyboard shortcuts
* `Ctrl+R` refresh · `Ctrl+F` / `Ctrl+K` search · `Ctrl+1…5` sections · `Ctrl+N` new item · `Esc` close
* Clear, human error messages for every API failure (offline, 401, validation, 404…)

---

## 4. Configuration

Open **Settings** inside the app.

| Setting | Meaning |
| --- | --- |
| API base URL | Where the Express API lives, e.g. `http://localhost:5000`. Changing it signs you out. |
| Product images path | Defaults to `/uploads`. Only used to fetch *older* images over HTTP. You can also paste a full URL (e.g. `https://cdn.example.com/uploads`). |
| Demo workspace | Runs entirely on this computer with sample data. Never touches your API. |
| Theme | Dark / light. |
| Image cache | Product thumbnails cached on disk; can be cleared. |
| App data folder | Opens `%APPDATA%\StockFlow` in Explorer. |

Files written by the app (all under `%APPDATA%\StockFlow`):

```
config.json      settings + session token (encrypted with the OS credential store when available)
demo-db.json     demo-mode sample data
image-cache\     product images you uploaded
```

The JWT never reaches the web page. It is stored by the main process and attached to requests there,
so the UI is not affected by browser CORS rules either.

---

## 5. How it maps to your API

| Action | Request |
| --- | --- |
| Sign in | `POST /auth/login` → `register.token` |
| Register | `POST /auth/register` |
| List products | `GET /api/product?search&category&page&limit&sort` |
| Create product | `POST /api/product` (multipart: `image` + `name`, `price`, `category`) |
| Update product | `PATCH /api/product/:id` (multipart) |
| Delete product | `DELETE /api/product/:id` |
| Stock in / out | `POST /api/quantity/stock-in/:id` · `POST /api/quantity/stock-out/:id` |
| Alerts | `GET /api/quantity/low-stock` · `GET /api/quantity/out-stock` |
| Orders | `POST /api/order` · `GET /api/order` · `GET /api/order/:id` |
| Status / cancel | `PATCH /api/order/status/:id` · `PATCH /api/order/cancel-order/:id` |

Three quirks of the current backend are handled deliberately — no backend change is required:

1. **`src/routes/DashBoard.route.js` is not mounted in `app.js`.** The dashboard therefore computes its
   figures inside the app from `GET /api/product` and `GET /api/order`. If you later mount the dashboard
   router, the app keeps working unchanged.
2. **Uploaded images are not served over HTTP** (there is no `express.static('/uploads')`). Images uploaded
   from this app are cached locally, so they display instantly. Images created elsewhere fall back to
   `{API}{uploadsPath}/{file}` and, if unavailable, to a neat initials placeholder.
3. **`GET /api/order` answers `404` when a page is empty.** The app treats that as “no orders” instead of an error.
4. **`Product.Service` puts `search` straight into a Mongo `$regex`**, so a character like `(` makes the query fail.
   The app escapes regex metacharacters in the product search before sending them.

Also note: the backend's international phone pattern accepts `+213` followed by **8** digits while local
numbers use `0[567]` + 8 digits. The app validates with the same rule, so anything the API accepts is accepted here.

---

## 6. Security

* `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
* A strict Content-Security-Policy (`connect-src 'none'` — the page cannot make network calls at all)
* All HTTP traffic happens in the main process; the renderer only sees plain data
* The JWT is stored with Electron `safeStorage` (Windows DPAPI) and never exposed through IPC
* External links open in the default browser, never inside the app window
* Image cache filenames are sanitised (no path traversal)

---

## 7. Tests

```bat
npm test
```

77 assertions across four layers, no Electron binary or MongoDB needed:

| File | Covers | Tests |
| --- | --- | --- |
| `test/mock-api.test.js` | Demo backend parity: auth, CRUD, stock rules, orders, cancellation, persistence | 29 |
| `test/api-client.test.js` | Real HTTP client against a stub server: JSON, multipart upload, auth header, timeouts, error mapping | 9 |
| `test/main-process.test.js` | `main.js` with a stubbed Electron: every IPC channel, sessions, 401 handling, image cache, settings persistence | 20 |
| `test/ui.test.js` | The real renderer in jsdom: sign-in, dashboard, product creation with image, editing, deleting, stock modals, order creation, status changes, cancellation, settings, sign-out | 19 |

---

## 8. Building the Windows package

```bat
npm run dist
```

Outputs (in `release\`):

* `StockFlow-1.0.0-x64.exe` — NSIS installer (choose install folder, desktop shortcut)
* `StockFlow-1.0.0-portable.exe` — single portable executable
* `win-unpacked\` — the raw application folder

The build runs on Windows. If you are on macOS/Linux, `electron-builder --win` needs Wine.

**CI option:** `ci/windows-build.yml` is a ready-made GitHub Actions workflow. Copy it to
`.github/workflows/build-windows.yml` in your repository and every push produces the installer as a
downloadable artifact — no local build tools needed.

**SmartScreen:** the `.exe` is not code-signed, so Windows may show “Windows protected your PC”.
Click *More info → Run anyway*, or sign the build with your own certificate
(`electron-builder` accepts `win.certificateFile` / `certificatePassword`).

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Could not reach the API server” | Start the backend (`npm run dev`), check the URL/port, and that MongoDB is running. Use *Test* in Settings or on the sign-in screen. |
| Connection pill shows **API offline** | Same as above; it re-checks every 30 s. |
| Sign-in fails with “The email or Password is invalaid” | That message comes from the API. Register an account first, or use demo mode. |
| Products show initials instead of photos | The API does not serve `/uploads`. Images uploaded *from this app* are cached locally; older ones need a reachable images path (Settings). |
| `npm install` fails behind a proxy | Configure the registry (`npm config set registry …`) and, for Electron, `ELECTRON_MIRROR`. |
| Empty window after an update | `Ctrl+R` reloads; `Ctrl+Shift+I` opens DevTools in a development build (`npm run dev`). |

---

## 10. En bref (FR)

Cette application Windows (Electron) est un client complet de votre API **Full Product Management**.
Démarrage : lancez `1-install.bat`, puis `2-run.bat`. Pour créer un installateur : `3-build-installer.bat`
(résultat dans `release\`). Le mode **démo** permet de tester toute l'interface sans serveur ni MongoDB.
Aucun fichier de votre backend n'est modifié : l'application communique uniquement en HTTP.

Licence : MIT (voir `LICENSE`).
