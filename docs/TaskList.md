# TaskList.md — Excalidraw Desktop (Electron, Windows-first)

| Field | Value |
| --- | --- |
| **Companion document** | `ProjectUnderstanding.md` — comprehension layer (source architecture, target architecture, decision records, scope matrix, risk register). All §-references in this document prefixed with `PU` point to that document. |
| **Upstream baseline** | `github.com/excalidraw/excalidraw` @ `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` (2026-10-01, `packages/excalidraw` v0.18.0) |
| **Target deliverable** | Windows (x64) NSIS-packaged Electron desktop app wrapping the full Excalidraw editor |
| **Shell framework** | Electron (Chromium parity with excalidraw.com) |
| **Integration strategy** | Fork the monorepo; add a `packages/desktop` workspace; integrate at source level (no URL/webview wrapping) |
| **v1.0 feature scope** | Native file I/O: open/save dialogs, `.excalidraw`/`.excalidrawlib` file associations, recent files |
| **Audience** | Autonomous coding agent executing tasks sequentially with verification |

---

## 0. Execution Contract (READ FIRST — binds every task below)

**0.1 Execution order.** Tasks carry IDs (`D-NN`) and MUST be executed in numeric order within a phase; phases MUST be executed in order (0 → 5). A task may start only when all tasks listed in its `Depends` field are complete and their acceptance criteria pass.

**0.2 Definition of Done (global DoD).** A task is done only when ALL of the following hold on the working tree:

1. All task-level acceptance criteria (ACs) pass.
2. `yarn test:typecheck` exits 0.
3. `yarn test:code` exits 0 (eslint, `--max-warnings=0`).
4. `yarn test:app --watch=false` exits 0 (Vitest suite — must remain green; the upstream suite is the regression oracle).
5. Changes are committed: `feat(desktop): D-NN <slug>` (or `fix(desktop):`, `chore(desktop):`, `refactor(desktop):`).

**0.3 Diff-surface budget.** Upstream code under `packages/*` and `excalidraw-app/*` is a shared asset with upstream. ONLY these files may be modified, and only in the way described by the referencing task:

| File | Sanctioned modification | Task |
| --- | --- | --- |
| `packages/excalidraw/data/filesystem.ts` | Introduce injectable `FileSystemAdapter` seam, default behavior unchanged | D-19 |
| `packages/excalidraw/index.tsx` | Re-export `registerFileSystemAdapter` + adapter types | D-19 |
| `excalidraw-app/index.tsx` | Runtime-guard `registerSW()`; conditional desktop bootstrap import | D-15, D-16 |
| `excalidraw-app/vite.config.mts` | Mode-aware plugin config (desktop mode) | D-14 |
| `excalidraw-app/App.tsx` | Minimal `IS_DESKTOP`-gated conditionals (collab UI toggle, Plus UI gating) | D-17 |
| `excalidraw-app/components/AppMainMenu.tsx` | Mount desktop menu-command handler | D-25 |
| `excalidraw-app/app_constants.ts` | Add desktop-only storage key constant | D-28 |

Anything else under `excalidraw-app/` or `packages/` requires a new desktop-owned module (e.g. `excalidraw-app/desktop/**`, `packages/desktop/**`) instead of editing shared files. New files are unrestricted.

**Scope of the budget.** The budget governs `packages/*` and `excalidraw-app/*` only. Root-level files (`package.json`, `vitest.config.mts`, `.env.desktop`, `.github/workflows/*`) are NOT restricted by the budget — the tasks that own them edit them freely (D-06, D-13, D-14, D-35, D-36) — but they ARE tracked in the rebase conflict checklist (PU §6.4) because upstream also touches root configs.

**0.4 Environment.** Node ≥ 20 LTS (22 LTS recommended; upstream floor is 18, desktop Electron toolchain requires ≥ 20), Yarn Classic 1.22.22 (workspaces, `packageManager` field is authoritative — do NOT migrate to Yarn Berry), Windows 10/11 x64 build host for packaging tasks. **Electron version policy:** use the latest stable Electron at scaffold time — resolve via `npm view electron dist-tags.latest` and pin the exact version in D-06; minimum floor `^38`. The parity rationale (PU §5.2, PU §6.1) depends on tracking current Chromium.

**0.5 Commands.** Run all yarn commands from the monorepo root unless the task states a workspace cwd via `yarn --cwd`.

---

## 1. Task List

Estimate scale: **S** ≤ ½ day · **M** ≤ 1–2 days · **L** ≥ 3 days (agent-time, single-task focus).

### Phase 0 — Fork baseline & hygiene

#### D-01 | Repository fork, remotes, and branch model

- **Depends**: — · **Est**: S
- **Do**:
  - Create fork of `excalidraw/excalidraw`; clone; add remotes: `origin` (fork), `upstream` (canonical).
  - Create long-lived integration branch `desktop-v1` from the pinned baseline commit (`ed10ac7dca7e40f3f4a31269b4bfba980d0db41e`).
  - Record upstream tag/commit pinned in `packages/desktop/UPSTREAM.md` with sync procedure from PU §6.4.
- **AC**:
  - [x] `git remote -v` shows both remotes; `git log -1` on `desktop-v1` equals the pinned commit.
  - [x] `packages/desktop/UPSTREAM.md` exists and states the pin + sync policy.

#### D-02 | Baseline green-state verification

- **Depends**: D-01 · **Est**: S
- **Do**:
  - Provision the toolchain: Node 22 LTS via nvm-windows (nvm-windows v2.0.1, x64; `nvm install 22.23.4` + `nvm use 22.23.4`). Node 24 is out of scope — do not attempt to make it work.
  - `yarn install` at repo root (Yarn Classic; expect workspaces hoisting).
  - Run and record results of: `yarn test:typecheck`, `yarn test:code`, `yarn test:app --watch=false`.
  - Record build host (OS + version + arch) and the Node/Yarn versions used in `packages/desktop/UPSTREAM.md` §6.1.
- **Windows-host escape hatch:** upstream CIes on ubuntu only. If any suite fails on the Windows build host but passes in the D-04 CI run, record the failure as a Windows-only environment issue (linked issue in UPSTREAM.md) and treat the CI result as the authoritative baseline; WSL2 is an acceptable local fallback host.
- **AC**:
  - [x] `yarn install` completes at the repo root with no errors, on Yarn Classic 1.22.22 under Node 22 LTS, with workspaces hoisted (`node_modules/@excalidraw/*` symlinked) and no unresolved dependency errors.
  - [x] All three commands exit 0 at baseline on the primary host (or in D-04 CI for ubuntu-authoritative resolution per the escape hatch), and the results are recorded (the upstream suite is the regression oracle for every later task).
  - [x] The verification note in `packages/desktop/UPSTREAM.md` §6.1 records the build host (OS, version, architecture) and the Node and Yarn versions actually used, alongside the recorded suite results.

#### D-03 | Desktop workspace README + architecture decision records

- **Depends**: D-01 · **Est**: S
- **Do**:
  - Create `packages/desktop/README.md` containing: dev commands table (fills in as Phases 1–4 land), the decision records from PU §5.2/§5.4 verbatim, and the diff-surface table from §0.3.
- **AC**:
  - [x] README exists; contains the three decision records and diff-surface table.

#### D-04 | CI baseline workflow

- **Depends**: D-02 · **Est**: S
- **Do**:
  - Add `.github/workflows/ci-desktop.yml`: on `push`/`pull_request` → `desktop-v1`; matrix `ubuntu-latest`; steps: `yarn install --frozen-lockfile`, `yarn test:typecheck`, `yarn test:code`, `yarn test:app --watch=false`.
  - Enable Yarn cache (`actions/setup-node` `cache: yarn`).
- **AC**:
  - [x] Workflow runs green on first push to `desktop-v1`.

#### D-05 | Desktop dev-docs entry

- **Depends**: D-03 · **Est**: S
- **Do**:
  - Add `packages/desktop/docs/getting-started.md`: prerequisites, `yarn desktop:dev` walkthrough (added in D-13), packaged-build walkthrough (D-33), troubleshooting (WebView2 not required — Electron bundles Chromium; SmartScreen note for unsigned builds).
- **AC**:
  - [ ] Doc exists; referenced from `packages/desktop/README.md`.

### Phase 1 — Desktop workspace & Electron shell

#### D-06 | Scaffold `packages/desktop` workspace

- **Depends**: D-02 · **Est**: M
- **Do**:
  - Create `packages/desktop/` with `package.json` (name `@excalidraw/desktop`, `private: true`, `main: "dist/electron/main.cjs"`).
  - Directory layout:
    ```
    packages/desktop/
      src/electron/{main.ts, menu.ts, protocol.ts, ipc/, windows.ts}
      src/electron/preload.ts
      src/renderer/           (renderer-side modules registered by bootstrap, D-20)
      src/shared/bridge-contract.ts
      build/                  (icons, electron-builder assets)
      dist/                   (build output, gitignored)
    ```
  - DevDependencies: `electron` (**latest stable — resolve via `npm view electron dist-tags.latest`, pin exact; floor `^38` per §0.4**), `electron-builder@^26`, `esbuild@^0.25`, `concurrently`, `cross-env`, `wait-on` (used by D-13), `@playwright/test` (used in D-37), `png2icons` (D-31). Pin exact versions at scaffold time; record in README.
  - Verify root workspaces glob `packages/*` already covers it (no root edit needed); `yarn install` links cleanly.
  - **Lockfile sequencing:** because this task adds dependencies, the first install MUST be plain `yarn install` (not `--frozen-lockfile`) so `yarn.lock` is updated, and the updated lockfile is committed in this task's commit — D-04's CI runs `--frozen-lockfile` and would fail otherwise.
- **AC**:
  - [ ] `yarn workspace @excalidraw/desktop --version` resolves; install is clean; layout above exists.
  - [ ] Updated `yarn.lock` committed; a follow-up `yarn install --frozen-lockfile` succeeds; pinned Electron version recorded in README.

#### D-07 | Electron TypeScript build pipeline (esbuild → CJS)

- **Depends**: D-06 · **Est**: S
- **Do**:
  - esbuild scripts bundling `src/electron/main.ts` → `dist/electron/main.cjs` and `src/electron/preload.ts` → `dist/electron/preload.cjs` (format `cjs`, `platform: node`, `external: ["electron"]`).
  - **Rationale:** sandboxed renderers require CommonJS preloads; main process CJS avoids ESM `app.whenReady` pitfalls.
  - Add workspace scripts: `build:electron`, `watch:electron` (esbuild `--watch`).
- **AC**:
  - [ ] `yarn workspace @excalidraw/desktop build:electron` emits both `.cjs` artifacts; artifacts load in a bare Electron smoke (`electron dist/electron/main.cjs` shows an empty window).

#### D-08 | Main process skeleton: lifecycle + security posture + single instance

- **Depends**: D-07 · **Est**: M
- **Do**:
  - `windows.ts`: `createMainWindow()` — `BrowserWindow` with `width: 1440, height: 900, minWidth: 1024, minHeight: 640`, `show: false` (show on `ready-to-show`), `backgroundColor: "#ffffff"`, `webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true }`.
  - `main.ts`: `app.requestSingleInstanceLock()`; on `second-instance` → focus main window (argv file forwarding lands in D-26); `window-all-closed` → `app.quit()` (no macOS menu-bar residency in v1.0).
  - Enforce: no `remote` module, no `webSecurity: false`, `webContents` `devTools` open only when `process.env.EXCALIDRAW_DESKTOP_DEVTOOLS === "1"`.
- **AC**:
  - [ ] App boots a window; second launch focuses the first; `process.argv` contract documented in code comments for D-26.

#### D-09 | `app://` privileged scheme + static protocol handler

- **Depends**: D-08 · **Est**: M
- **Do**:
  - `protocol.ts`: call `protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }])` **at module top-level of main.ts** (must precede `app.whenReady`).
  - Implement `registerAppProtocol(webappRoot: string)` using `protocol.handle("app", ...)`:
    - map `app://excalidraw/` → webapp root; resolve path traversal safely (`path.normalize` + prefix check, reject `..`);
    - MIME map covering: `.html`, `.js`, `.css`, `.woff2`, `.png`, `.svg`, `.ico`, `.json`, `.wasm`, `.map`;
    - fallback to `index.html` for extensionless paths (SPA/hashes don't need it, but be safe).
  - Renderer load branching in `windows.ts`: if `process.env.ELECTRON_RENDERER_URL` → `loadURL(env)` (dev/HMR); else → `loadURL("app://excalidraw/index.html")`.
- **AC**:
  - [ ] Packaged-mode simulation: point handler at a built `excalidraw-app/build` (after D-14) — app boots from `app://excalidraw/index.html`, all assets 200, no console errors.
  - [ ] Path traversal probe (`app://excalidraw/../../etc/passwd`) is rejected.

#### D-10 | Preload bridge (contextBridge) + frozen contract types

- **Depends**: D-07 · **Est**: M
- **Do**:
  - Implement `src/shared/bridge-contract.ts` exactly per PU §5.3 — the frozen contract surface, including `onOpenFiles`, `getStartupFiles`, and `getRecentFiles` (D-26/D-28 depend on these being present from the start; the contract is frozen after this task).
  - `preload.ts`: `contextBridge.exposeInMainWorld("excalidrawDesktop", <DesktopBridge impl>)` where fs/menu/shell/open-with methods thin-wrap `ipcRenderer.invoke`/`ipcRenderer.on`. Sanitize all inputs crossing the boundary (validate filter shape, coerce paths to strings).
  - Renderer consumers get the type via declaration merging: `declare global { interface Window { excalidrawDesktop: DesktopBridge } }` (exported helper `packages/desktop/src/renderer/global.d.ts`).
- **AC**:
  - [ ] `window.excalidrawDesktop.isDesktop === true` inside the page; all contract members present; contract file compiles standalone (`tsc --noEmit`).

#### D-11 | Window chrome: title, bounds persistence, native theme sync

- **Depends**: D-08 · **Est**: S
- **Do**:
  - IPC `desktop:app:documentState` → `win.setTitle(name ? `${dirty ? "• " : ""}${name} — Excalidraw` : "Excalidraw")` (renderer drives via `bridge.setDocumentState`, wired in D-25/D-27).
  - Persist window bounds as JSON in `app.getPath("userData")/window-state.json` (hand-rolled, no dep): save on `close`, restore on create (validate on-screen bounds against `screen.getDisplayMatching`).
  - Sync `nativeTheme.themeSource` from renderer theme (listen for `desktop:app:theme` in same IPC channel family) → dark titlebar on Windows.
- **AC**:
  - [ ] Resize/move → relaunch restores bounds; title shows `•` prefix when dirty (verified end-to-end after D-25).

#### D-12 | Navigation & window-open hardening

- **Depends**: D-08 · **Est**: S
- **Do**:
  - `win.webContents.setWindowOpenHandler(({ url }) => { if (allowed(url)) bridge-open-external else deny; return { action: "deny" } })` — `allowed(url)` = `https:` only.
  - `will-navigate`: deny unless target origin is the app origin (dev: localhost).
  - Route all legitimate external links (hyperlinks on canvas elements, menu socials) through `bridge.openExternal` (allowlist enforced in main).
  - `session.setPermissionRequestHandler` → deny all except `clipboard-sanitized-write` and `fullscreen`.
- **AC**:
  - [ ] Clicking an element hyperlink opens the OS browser, not a new Electron window; `window.open("https://…")` from devtools is denied; `will-navigate` off-origin is blocked.

#### D-13 | Dev orchestration: Vite HMR + Electron

- **Depends**: D-09, D-10 · **Est**: M
- **Do**:
  - Root scripts in `package.json`:
    - `desktop:dev`: concurrently run `yarn --cwd excalidraw-app dev:vite` (new alias script that runs `vite` with `--mode desktop`, see D-14; sets `VITE_APP_PORT=3001`) and `yarn workspace @excalidraw/desktop watch:electron` with `ELECTRON_RENDERER_URL=http://localhost:3001`, Electron spawned only after the dev server responds (poll `http://localhost:3001` or use `wait-on`).
  - Patch (sanctioned, D-14's config work enables it) the Vite `server.open: true` behavior so dev mode under Electron doesn't pop a browser tab: gate on mode `desktop` → `open: false`.
- **AC**:
  - [ ] `yarn desktop:dev` gives a working Electron window with HMR (edit a component label → hot reload visible); no stray browser tab.

### Phase 2 — Renderer integration & boot-time wiring

#### D-14 | Desktop build mode: env + Vite config plumbing

- **Depends**: D-06 · **Est**: M
- **Do**:
  - Create root `.env.desktop`:
    ```
    VITE_APP_DESKTOP="true"
    VITE_APP_ENABLE_PWA="false"
    VITE_APP_ENABLE_TRACKING="false"
    # NOTE: no VITE_APP_SENTRY_DSN here — upstream Sentry init is DSN-gated and stays off.
    # Do NOT edit excalidraw-app/sentry.ts (outside the §0.3 budget).
    ```
    (Upstream `vite.config.mts` already gates `VitePWA` on `VITE_APP_ENABLE_PWA === "true"` — verified at baseline — so the flag above alone prevents SW generation; the `injectRegister: null` override below is belt-and-braces guaranteeing the `virtual:pwa-register` import still resolves.)
  - `excalidraw-app/vite.config.mts` mode-aware changes (sanctioned diff):
    - when `mode === "desktop"`: exclude `VitePWA` registration call but keep the import safe (see D-15 for the runtime guard) — implement as `VitePWA({ injectRegister: null, ...original })` so the `virtual:pwa-register` module still resolves; skip `Sitemap` plugin; `build.outDir` stays `build` (desktop build reuses it; electron-builder consumes the same directory).
    - gate `server.open` → `false` when `mode === "desktop"` (completes D-13).
  - Add excalidraw-app script `dev:vite` (`vite`) and `build:desktop` (`cross-env vite build --mode desktop`); root aliases `desktop:build` → runs `build:desktop` then `yarn workspace @excalidraw/desktop build:electron`.
- **AC**:
  - [ ] `yarn --cwd excalidraw-app build:desktop` produces `build/` with **no `sw.js` registration call** in the emitted `index.html` (grep: no `registerSW` inlined; `manifest.webmanifest` absence acceptable).
  - [ ] Web production build (`yarn build:app`) is byte-identical in behavior to baseline (PWA still registers — spot-check `index.html`).

#### D-15 | Service-worker suppression at runtime

- **Depends**: D-14 · **Est**: S
- **Do**:
  - `excalidraw-app/index.tsx` (sanctioned diff): wrap `registerSW()` → `if (!window.excalidrawDesktop?.isDesktop) { registerSW(); }`.
  - Keep the static import (virtual module resolves because plugin stays configured with `injectRegister: null` in desktop mode — see D-14).
  - Note: upstream `public/service-worker.js` is a legacy self-destructing SW (CRA-era migration shim); in desktop mode it is never registered and is inert — no action beyond this guard.
- **AC**:
  - [ ] In packaged desktop build, `navigator.serviceWorker.getRegistrations()` resolves to `[]` at runtime.
  - [ ] Web build still registers its SW (dev check with `VITE_APP_ENABLE_PWA=true`).

#### D-16 | Desktop bootstrap module + export-source override

- **Depends**: D-10, D-14 · **Est**: S
- **Do**:
  - Create `excalidraw-app/desktop/bootstrap.ts` (desktop-owned, unrestricted path). It runs when `window.excalidrawDesktop?.isDesktop`:
    1. `window.EXCALIDRAW_EXPORT_SOURCE = "https://excalidraw.com"` (keeps exported `.excalidraw` files' `source` field interoperable with upstream instead of `app://excalidraw`);
    2. register the Electron filesystem adapter (D-23 wires this after D-20 exists);
    3. install the menu-command listener + document-state reporter (D-25);
    4. install the confirm-close handler (D-27).
  - `excalidraw-app/index.tsx` (sanctioned diff): top-of-module guarded dynamic import: `if (window.excalidrawDesktop?.isDesktop) { void import("./desktop/bootstrap"); }` (dynamic import → Vite code-splits; web bundle carries only an inert async chunk).
- **AC**:
  - [ ] In desktop dev mode, `window.EXCALIDRAW_EXPORT_SOURCE` is set before any export happens; web build shows no bootstrap code on the critical path (network tab: no `bootstrap` chunk loaded).

#### D-17 | Cloud-feature & Excalidraw+ UI gating

- **Depends**: D-16 · **Est**: M
- **Do**:
  - Introduce `excalidraw-app/desktop/config.ts`: `export const IS_DESKTOP = !!window.excalidrawDesktop?.isDesktop`.
  - Gating (all sanctioned, minimal, `IS_DESKTOP`-conditional):
    - `App.tsx` `isCollabDisabled` (L379): extend to `isRunningInIframe() || (IS_DESKTOP && !enableDesktopCollab)` where `enableDesktopCollab = import.meta.env.VITE_APP_DESKTOP_ENABLE_COLLAB === "true"` (default off — rationale: collab links generated under `app://` origin are unusable by browser users — minted at `data/index.ts` L163 via `window.location.origin`; feature flag allows opt-in once collab hardening (backlog item 2) lands);
    - **share-link UI hidden in desktop:** the "share" dialog trigger in `App.tsx` (L1012 `setShareDialogState({ isOpen: true, type: "share" })`) and the `ShareDialog` mount (L1086) are gated on `!IS_DESKTOP` — minted share links stamp `window.location.href` (`data/index.ts` L283–285) and would read `app://excalidraw/#json=…`, unusable in browsers. Upload machinery (`exportToBackend`) and library browsing stay enabled for other flows; re-enable via the backlog item 2 link-rewrite epic;
    - hide Excalidraw+-specific UI when desktop: `ExportToExcalidrawPlus` menu/dialog mount and `ExcalidrawPlusPromoBanner` (both in `excalidraw-app/components/`), and guard `isExcalidrawPlusSignedUser`-dependent branches.
- **AC**:
  - [ ] Desktop build: no Live Collaboration trigger, no share-link entry/dialog, no Excalidraw+ promo/export UI; Sentry SDK never initializes (network tab / bundle absence of DSN).
  - [ ] Web build: none of the above changes (all conditionals false-positive safe).

#### D-18 | Offline/asset-origin audit

- **Depends**: D-09, D-14 · **Est**: S
- **Do**:
  - Grep built `excalidraw-app/build/` for absolute `https://` runtime fetches (exclude comments/sourcemaps): verify fonts, locales, og-image meta are not runtime-fetched (meta tags are inert).
  - Boot the packaged-mode protocol handler with networking disabled (Windows: `netsh advfirewall` block rule, or devtools offline) and exercise: editor load, draw, text, save-to-file, open-from-file, library open/save (local), image insertion via paste (already-local files).
- **AC**:
  - [ ] Documented audit list (append to `packages/desktop/README.md`) with zero runtime CDN dependencies for core editor + file I/O.
  - [ ] Offline boot exercise passes; only collab/share/AI features fail gracefully with existing upstream error states.

### Phase 3 — Native file I/O (core feature work)

#### D-19 | Adapter seam refactor in `data/filesystem.ts` (upstream-compatible)

- **Depends**: D-02 · **Est**: M
- **Do**:
  - Refactor `packages/excalidraw/data/filesystem.ts` (sanctioned diff) into a seam:
    ```ts
    export interface FileSystemAdapter {
      open(opts: OpenOptions): Promise<File | File[]>; // mirrors current fileOpen contract
      save(
        blob: Blob | Promise<Blob>,
        opts: SaveOptions,
      ): Promise<FileSystemFileHandle | null>; // mirrors current fileSave return
    }
    // module state
    let adapter: FileSystemAdapter | null = null;
    export const registerFileSystemAdapter = (a: FileSystemAdapter) => {
      adapter = a;
    };
    export const fileOpen = async (opts) =>
      adapter ? adapter.open(opts) : legacyFileOpen(opts);
    export const fileSave = async (blob, opts) =>
      adapter ? adapter.save(blob, opts) : legacyFileSave(blob, opts);
    ```
    (keep the existing `browser-fs-access` implementations as private `legacyFileOpen`/`legacyFileSave` — behavior-preserving default path).
  - Export `registerFileSystemAdapter`, `FileSystemAdapter`, and a `DesktopFileHandleLike` type from `packages/excalidraw/index.tsx` (sanctioned diff).
  - Preserve exact current signatures for all existing call sites (`data/json.ts`, `data/index.ts`, `components/App.tsx` image-file open) — they must not change.
- **AC**:
  - [ ] Zero behavior change when no adapter registered: full upstream Vitest suite green; manual web smoke (save/open/export) passes.
  - [ ] `fileOpen`/`fileSave` exported signatures unchanged (typecheck across monorepo).

#### D-20 | Renderer-side `ElectronFileSystemAdapter`

- **Depends**: D-10, D-19 · **Est**: L
- **Do**:
  - Create `packages/desktop/src/renderer/fs-adapter.ts` implementing `FileSystemAdapter` over `window.excalidrawDesktop.fs`:
    - extension → `FileFilter` mapping derived from `MIME_TYPES` (`@excalidraw/common`): scene save/open filters = `[{ name: "Excalidraw files", extensions: ["excalidraw"] }, { name: "PNG", extensions: ["png"] }, { name: "SVG", extensions: ["svg"] }, { name: "All files", extensions: ["*"] }]`; open also accepts `.excalidraw.png`/`.excalidraw.svg` and images (mirror upstream's permissive `loadFromJSON` comment re: WebKit);
    - `save()`: `await blob` → `new Uint8Array(await file.arrayBuffer())` → `bridge.fs.save({ contents, filters, defaultPath: `${name}.${extension}`, token })` → on success return a `DesktopFileHandle` (D-22) built from result `{ token, path, name }`; on `null` (cancel) throw the same benign cancellation semantics `browser-fs-access` uses (abort error shape — upstream treats it as user cancel);
    - `open()`: `bridge.fs.open({ filters, multiSelections })` → for each result `bridge.fs.readPath(path)` → reconstruct `new File([data], name, { lastModified, type: mimeFromExtension(ext) })` and attach `__desktopToken`/path metadata for handle creation (use a `WeakMap<File, HandleMeta>` keyed by returned File to satisfy loadFromBlob → fileHandle flows in `data/blob.ts` `loadSceneOrLibraryFromBlob`).
  - Unit-test the pure mapping helpers (`mimeFromExtension`, filters builder, cancel-error shape) — see D-36.
- **AC**:
  - [ ] Adapter compiles against D-19 interface; pure helpers covered by Vitest.
  - [ ] `File` reconstruction carries correct `name`/`type`/`lastModified` (asserted in unit tests via Buffer fixtures).

#### D-21 | Main-process fs IPC: dialogs, registry, recent documents

- **Depends**: D-10 · **Est**: L
- **Do**:
  - `src/electron/ipc/fs.ts` — channels:
    - `desktop:fs:open` → `dialog.showOpenDialog(win, { properties: ["openFile"], filters, multiSelections? })`; for each selected path: read (`fs.promises.readFile`), return `{ path, name, ext, lastModifiedMs, size }` list (payload transfer of raw bytes happens via a second `readPath` call to keep channel semantics clean — or inline `data: Uint8Array`; pick one, document in bridge contract);
    - `desktop:fs:save` → if `token` present and resolvable: write directly to registered path (true Save; no dialog) else `dialog.showSaveDialog(win, { defaultPath, filters })` → write; return `{ canceled: false, path, name, token }` or `{ canceled: true }`;
    - `desktop:fs:readPath` → `{ data: Uint8Array, name, lastModifiedMs }` (used by open-with, D-26).
  - `HandleRegistry` (`src/electron/ipc/handles.ts`): `token = crypto.randomBytes(16).toString("hex")`; `Map<token, path>`; in-memory only (session-scoped; recent-files provide cross-session paths).
  - On successful open/save of `.excalidraw`/`.excalidrawlib`: `app.addRecentDocument(path)` (Windows jump list).
  - Enforce path-extension sanity on write (append `defaultPath` ext if missing — mirror upstream `fileSave` naming).
- **AC**:
  - [ ] IPC round-trip exercised from devtools console: open → read → save → re-open, all via `window.excalidrawDesktop`.
  - [ ] Saved file content byte-equals blob passed from renderer; cancel paths return clean nulls.
  - [ ] `app.addRecentDocument` entries visible in Windows jump list (manual check on Windows host).

#### D-22 | `DesktopFileHandle` duck-typing for `appState.fileHandle`

- **Depends**: D-20 · **Est**: M
- **Do**:
  - Define handle object: `{ kind: "file", name: string, isFile: true, isDesktopHandle: true, token: DesktopFileHandleToken, createReader?: never }` — satisfies all upstream consumers:
    - truthiness gate in `actionSaveToActiveFile` (L261 `!!appState.fileHandle`);
    - `isImageFileHandle()` (`data/blob.ts`) branching for `.excalidraw.png` handles — ensure image-export-then-resave flows don't crash: implement `queryPermission`/`requestPermission`-free path (upstream only calls `getFile()` on real handles inside `saveAsJSON` via `fileSave(…, fileHandle)` — the adapter intercepts and never calls `getFile()` on desktop handles; assert this in code comments + tests);
    - `saveAsJSON` re-save: adapter `save()` with `token` → silent overwrite (no dialog).
  - Type: add `DesktopFileHandleLike` to the exported adapter types (D-19) and widen `AppState["fileHandle"]` ONLY if typecheck demands it — prefer structural typing to avoid touching `types.ts`.
- **AC**:
  - [ ] Save As → file saved; subsequent Ctrl+S (`actionSaveToActiveFile`) overwrites silently with no dialog (manual E2E in dev shell).
  - [ ] Export PNG → resave-through-handle branch (`isImageFileHandle` path) does not throw.

#### D-23 | Wire adapter at boot + regression-isolation check

- **Depends**: D-16, D-20 · **Est**: S
- **Do**:
  - In `excalidraw-app/desktop/bootstrap.ts`: `registerFileSystemAdapter(createElectronFileSystemAdapter())` **before** first paint (bootstrap is imported at module top of index.tsx — file-open can only happen post-mount, but register synchronously anyway).
- **AC**:
  - [ ] Desktop dev shell: File → Open/Save/Save As all go through native dialogs; web dev server unaffected (adapter absent → legacy path, verified by feature-detect logging).
  - [ ] Full Vitest suite remains green (adapter is never registered in jsdom tests).

#### D-24 | Native application menu

- **Depends**: D-10 · **Est**: M
- **Do**:
  - `src/electron/menu.ts` — `Menu.buildFromTemplate`:
    - **File**: New (`CmdOrCtrl+N` → `file:new`), Open… (`CmdOrCtrl+O` → `file:open`), Recent Documents (populated from `app.getRecentDocuments()` **if available on win32 — verify at implementation time; fallback: in-app recents only via `bridge.getRecentFiles()` (D-28), functionality preserved** + in-app recents; "Clear Recent Files"), Save (`CmdOrCtrl+S` → `file:save`), Save As… (`CmdOrCtrl+Shift+S` → `file:saveAs`), Export Image… (`CmdOrCtrl+Shift+E` → `file:exportImage`), separator, Exit (`Alt+F4` role `quit`).
    - **Edit**: standard roles (undo/redo/cut/copy/paste/pasteAndMatchStyle/selectAll) — excalidraw binds its own canvas shortcuts; menu roles only affect focused editable contexts, verify no shortcut double-handling.
    - **View**: zoom roles (`zoomIn/zoomOut/resetZoom` — excalidraw handles canvas zoom internally; menu zoom applies to webContents zoom level, acceptable for accessibility), `toggleDevTools` (dev builds only), `reload`, `forceReload`, fullscreen role.
    - **Help**: About (custom dialog via IPC → renderer alert-free native `dialog.showMessageBox`), Open Excalidraw Docs (external, https-allowlisted).
  - Every click sends `win.webContents.send("desktop:menu", <MenuCommandId>)`; renderer subscription from D-25 dispatches.
- **AC**:
  - [ ] Menu renders with correct accelerators; each command id arrives at the renderer (log-verified in dev shell).
  - [ ] No accelerator collides with in-canvas shortcuts (Ctrl+S/Ctrl+O are upstream-bound to load/save actions — menu consumes them; in-page handlers must be the single dispatch path: document resolution).

#### D-25 | Renderer menu-command dispatch → ActionManager

- **Depends**: D-24, D-16 · **Est**: M
- **Do**:
  - Create `excalidraw-app/desktop/menuCommands.tsx` — a null-rendering component mounted inside `<Excalidraw>` children from `excalidraw-app/components/AppMainMenu.tsx` (sanctioned diff — mount next to existing menu items so hooks resolve inside the provider):
    - `useExcalidrawActionManager()` (exported from `@excalidraw/excalidraw/components/main-menu/DefaultItems` context hooks; if not exported, deep-import via `@excalidraw/excalidraw/components/hoc` chain exactly as `DefaultItems.tsx` does — aliasing makes this legal inside the monorepo);
    - subscribe `bridge.onMenuCommand` (useEffect, cleanup on unmount):
      - `file:open` → replicate `LoadScene` handler: confirm-modal when scene non-empty (`openConfirmModal` with `overwriteConfirm.modal.loadFromFile` i18n keys) then `executeAction(actionLoadScene)` (deep-import `actionLoadScene` from `@excalidraw/excalidraw/actions/actionExport`);
      - `file:save` → `executeAction(actionSaveToActiveFile)`; if no handle, fall through to `file:saveAs`;
      - `file:saveAs` → `executeAction` the `saveFileToDisk` action (same module);
      - `file:exportImage` → `setAppState({ openDialog: { name: "imageExport" } })` (same as `DefaultItems.SaveAsImage`);
      - `file:new` → confirm modal (upstream `ClearCanvas` semantics: reuse `DefaultItems.ClearCanvas` handler logic) — clears scene, resets `appState.fileHandle`;
    - document-state reporter: subscribe to `useExcalidrawSetAppState`-derived dirty/name (dirty = elements-version delta or fileHandle-less unsaved edits; simplest correct proxy: `appState` change events since last save — implement via `useEffect` on `useExcalidrawElements`+`appState` snapshot hash, debounce 500 ms) → `bridge.setDocumentState({ name: appState.name || null, dirty })`.
- **AC**:
  - [ ] All five file-menu commands produce identical behavior to their in-app menu-item counterparts (compare side-by-side in dev shell).
  - [ ] Title bar reflects `name`/dirty (D-11 end-to-end).

#### D-26 | Open-with integration (associations → scene load)

- **Depends**: D-21, D-25 · **Est**: M
- **Do**:
  - Main: `collectFilesFromArgv(argv)` — Windows sends the file path as the last argument(s); handle both `app.isPackaged` (skip `argv[0]` exe + possible flag noise) and dev (`electron . <file>`); filter to supported extensions (PU §4.8).
  - Cold start: renderer pulls collected paths via the contract member `bridge.getStartupFiles()` (channel `desktop:app:startupFiles`).
  - Running instance: `second-instance` handler → main pushes paths via the contract member `bridge.onOpenFiles` (transport: `win.webContents.send("desktop:open-files", paths)`).
  - Renderer (`menuCommands.tsx` or `bootstrap.ts`): for each path → `bridge.fs.readPath` → `File` → `loadSceneOrLibraryFromBlob(blob, localAppState, localElements)` (already exported from `@excalidraw/excalidraw`) → if scene non-empty, run the existing `openConfirmModal` overwrite flow → `updateScene`/`excalidrawAPI.updateScene({ elements, appState })` mirroring `loadFileToCanvas` behavior (`components/App.tsx` L12133 as reference semantics; do NOT modify App.tsx for this — the API surface (`updateScene` + `resetFileHandle` via `saveAsJSON` return) is sufficient).
  - Set `appState.fileHandle` for the loaded document by minting a token: extend `desktop:fs:readPath` to optionally register the path in `HandleRegistry` and return the token (open-from-association must enable subsequent Ctrl+S silent saves).
- **AC**:
  - [ ] Double-clicking `foo.excalidraw` on the dev machine (dev-registered via `electron-builder --dir` install or manual `ftype` registration) opens the scene; Ctrl+S saves silently to the same path.
  - [ ] Launching a second instance with a file forwards it to the running window; scene loads with confirm modal when canvas non-empty.
  - [ ] `.excalidrawlib` double-click imports into the library (blob routing already branches on `isValidLibrary`).

#### D-27 | Close-flow guard (dirty state → native confirm)

- **Depends**: D-25 · **Est**: M
- **Do**:
  - Renderer: register `bridge.onConfirmClose(async () => …)` — main drives this when `win.on("close")` and renderer reported `dirty: true` (via D-25 reporter) or when the web `beforeunload` prevent-default fires (`win.on("will-prevent-unload")` → route to same negotiation, belt-and-braces).
  - Negotiation options: **Save** → dispatch `file:save`/`file:saveAs` menu command and await save-settled signal (adapter acks via `desktop:app:saved` IPC), then allow close; **Discard** → `win.destroy()`; **Cancel** → abort close (`event.preventDefault()`).
  - Edge cases: collab `pauseSave("collaboration")` locks must not block close (flush + proceed); scene with zero elements and no edits must close without prompting (dirty=false).
- **AC**:
  - [ ] Draw → close → prompt appears; Save completes before window destruction (file verified on disk).
  - [ ] Clean scene → close is instant, no prompt.
  - [ ] Cancel aborts; app state intact.

#### D-28 | In-app recent files

- **Depends**: D-21, D-24 · **Est**: M
- **Do**:
  - Storage: `localStorage["excalidraw-desktop-recentFiles"]` (add constant `STORAGE_KEYS.LOCAL_STORAGE_DESKTOP_RECENT_FILES` — sanctioned diff in `app_constants.ts`); entries `{ path, name, ext, ts }`, max 10, LRU, dedupe by path.
  - Writers: adapter open/save success paths (renderer side, D-20) push entries.
  - Readers: menu Recent submenu (main pulls via the contract member `bridge.getRecentFiles()` — channel `desktop:menu:recent` — then rebuilds the `Menu` with submenu items that send `desktop:open-files`-style path loads through D-26 machinery) + optional in-app list under the app main menu (AppMainMenu `DropdownMenuItem` group rendering `name` + relative time; click → same load path).
- **AC**:
  - [ ] Open/save cycles produce a correct, deduped, LRU-capped list.
  - [ ] Menu Recent → click → scene loads (path still exists); stale path → graceful error toast, entry retained (user may reconnect drive) — document choice.

#### D-29 | Export & library flows to disk (verification + defaultPath polish)

- **Depends**: D-20, D-21, D-23 · **Est**: M
- **Do**:
  - Verify (fix adapter if needed, no library edits): ImageExportDialog → PNG with `exportEmbedScene` on/off; SVG export; `.excalidraw.svg` re-open; clipboard export paths (no dialog, unaffected); library save (`saveLibraryAsJSON`) and library import; `defaultPath` derives from `appState.name` (upstream `DEFAULT_FILENAME` fallback) and extension auto-append.
  - Add default-path polish in adapter: remember last used directory per extension family in `localStorage["excalidraw-desktop-lastDir"]` and pass `defaultPath: join(lastDir, filename)` through to main (upgrade UX without touching upstream).
- **AC**:
  - [ ] Matrix of 8 flows (PNG embed on/off, SVG embed on/off, re-open each, library save/import) passes in desktop dev shell.
  - [ ] Save dialogs open in the last-used directory; filename defaults to scene name.

### Phase 4 — Windows packaging & distribution

#### D-30 | electron-builder configuration (NSIS, x64, per-user)

- **Depends**: D-09, D-14 · **Est**: M
- **Do**:
  - `packages/desktop/electron-builder.yml`:
    ```yaml
    appId: com.excalidraw.desktop
    productName: Excalidraw
    directories: { output: release, buildResources: build }
    files: ["dist/electron/**"]
    extraMetadata: { main: "dist/electron/main.cjs" }
    asar: true
    win:
      target: [{ target: nsis, arch: [x64] }]
      icon: build/icon.ico
      artifactName: ${productName}-${version}-win-${arch}-setup.${ext}
    nsis:
      oneClick: false
      perMachine: false
      allowToChangeInstallationDirectory: true
      uninstallDisplayName: Excalidraw
      deleteAppDataOnUninstall: false
    ```
  - Renderer payload: package the built webapp (`excalidraw-app/build`) via `extraResources` → `resources/webapp` (asar-unpacked for V8 code-cache friendliness), and resolve the webapp root at runtime with `app.isPackaged ? path.join(process.resourcesPath, "webapp") : <repo path>` (D-09 consumes this).
- **AC**:
  - [ ] `yarn desktop:dist --dir` (D-33) yields a runnable unpacked build; protocol handler serves from `resources/webapp`.
  - [ ] Install/uninstall cycle works per-user without UAC elevation prompt.

#### D-31 | Icon pipeline

- **Depends**: D-30 · **Est**: S
- **Do**:
  - Derive `build/icon.ico` (16/24/32/48/64/128/256 layers), `build/installerIcon.ico`, `build/uninstallerIcon.ico`, and header/sidebar BMPs if NSIS defaults require, from a single 1024px source PNG (upstream `public/android-chrome-512x512.png` upscaled, or redraw from `public/favicon.svg`).
  - Script `packages/desktop/scripts/generate-icons.mjs` using `png2icons`; commit generated artifacts (builder needs them at pack time).
- **AC**:
  - [ ] Installer/Start-Menu/taskbar/window icons all render correctly on Windows 10 and 11 (light + dark taskbar).

#### D-32 | File associations for `.excalidraw` / `.excalidrawlib`

- **Depends**: D-30 · **Est**: S
- **Do**:
  - In `electron-builder.yml` `win.fileAssociations`:
    - `{ ext: "excalidraw", name: "Excalidraw Document", description: "Excalidraw drawing", mimeType: "application/vnd.excalidraw+json", role: "Editor" }`
    - `{ ext: "excalidrawlib", name: "Excalidraw Library", description: "Excalidraw library", mimeType: "application/vnd.excalidrawlib+json", role: "Editor" }`
  - Provide `build/excalidraw-file.ico` + `build/excalidraw-lib.ico` (variant glyphs of D-31 pipeline) and wire `icon` per association.
- **AC**:
  - [ ] Post-install: `HKCU\Software\Classes\.excalidraw` exists; double-click launches app with the path in argv (D-26 handles it).
  - [ ] Default Programs lists "Excalidraw Document" with correct MIME.

#### D-33 | Packaging build graph

- **Depends**: D-30, D-31, D-32 · **Est**: M
- **Do**:
  - Root script `desktop:dist`: sequential pipeline — `rm:build` → `yarn --cwd excalidraw-app build:desktop` → `yarn workspace @excalidraw/desktop build:electron` → copy `excalidraw-app/build` → `packages/desktop/webapp-staging/` → `yarn workspace @excalidraw/desktop dist:win` (`electron-builder --win`).
  - Wire `rm:build` to also clean `packages/desktop/{dist,release,webapp-staging}`.
  - Version source: read root/excalidraw package version → `extraMetadata` version (single-sourced via a tiny `scripts/desktop-version.js` consumed by electron-builder `beforePack` hook).
- **AC**:
  - [ ] One command produces `release/Excalidraw-<version>-win-x64-setup.exe` (unsigned) that installs and boots end-to-end on a clean Windows VM.
  - [ ] Reproducible: re-run from clean checkout succeeds.

#### D-34 | Code-signing scaffolding (unsigned default)

- **Depends**: D-33 · **Est**: S
- **Do**:
  - electron-builder `win.sign`/signtool env wiring: `CSC_LINK`, `CSC_KEY_PASSWORD` read from CI secrets; when absent → unsigned build with documented SmartScreen caveat.
  - Add `packages/desktop/docs/signing.md` (options: OV cert via SSL.com/Sectigo, Azure Trusted Signing; renewal/timestamping notes).
- **AC**:
  - [ ] CI secret present → signed installer; absent → unsigned, build still succeeds (verified by dry-run flag).

#### D-35 | Release workflow (GitHub Actions, windows-latest)

- **Depends**: D-33, D-34 · **Est**: M
- **Do**:
  - `.github/workflows/release-desktop.yml`: `workflow_dispatch` + tag `v*` push; runs-on `windows-latest`; steps: checkout → node/yarn setup → `yarn install --frozen-lockfile` → `yarn desktop:dist` → attach `release/*.exe` (+ `.blockmap` future-proofing) to GitHub Release via `softprops/action-gh-release`.
  - Cache Yarn; upload build logs on failure.
- **AC**:
  - [ ] Tag push produces a draft release with installer artifact downloadable and install-verified on a clean machine.

### Phase 5 — QA, performance & security hardening

#### D-36 | Unit tests for desktop pure logic

- **Depends**: D-20, D-21, D-26 · **Est**: M
- **Do**:
  - Vitest suites (co-located in `packages/desktop/src/**/*.test.ts`, wired via root vitest config alias additions for `@excalidraw/desktop/*`):
    - argv file parser (packaged/dev shapes, flags noise, unsupported ext);
    - extension↔MIME map + FileFilter builder;
    - HandleRegistry (token uniqueness, resolve, prune);
    - recent-files store (LRU, dedupe, cap, corruption-safe parse);
    - `DesktopFileHandle` shape conformance vs upstream consumers' duck-typing.
- **AC**:
  - [ ] Coverage ≥ 85% on `packages/desktop/src/{shared,renderer,electron/ipc}` pure modules (assert via `vitest --coverage` threshold).
  - [ ] `yarn test:app --watch=false` extended to include desktop suites and stays green.

#### D-37 | Playwright `_electron` e2e

- **Depends**: D-23, D-25 · **Est**: L
- **Do**:
  - `packages/desktop/e2e/desktop.spec.ts` with `_electron.launch({ args: ["dist/electron/main.cjs"], env: { ELECTRON_RENDERER_URL: <vite preview url> } })`:
    - boot → canvas visible → draw rectangle (mouse events) → assert element count via `window.excalidrawAPI`-free DOM probe (or expose a test-only hook guarded by `process.env.EXCALIDRAW_DESKTOP_E2E`);
    - save flow: stub `desktop:fs:save` dialog path by pre-seeding a test temp dir through a test-only IPC hook (document in `docs/testing.md`);
    - relaunch → localStorage-persisted scene restored (persistence regression);
    - open-from-path: `desktop:fs:readPath` fixture file → scene loads;
    - menu command dispatch: invoke `file:saveAs` → dialog stub consumed.
  - CI job on `ubuntu-latest` with `xvfb-run` (Electron headless-capable) + Windows smoke job (boot-only) on `windows-latest`.
- **AC**:
  - [ ] e2e suite green locally and in CI; flake rate < 5% across 10 runs (`--repeat-each=10`).

#### D-38 | Packaged smoke matrix (manual, scripted checklist)

- **Depends**: D-33 · **Est**: M
- **Do**:
  - Author `packages/desktop/SMOKE.md` checklist and execute on a clean Windows 10 VM **and** a Windows 11 machine: install (per-user) → launch → create → save → kill → relaunch persistence → double-click `.excalidraw` → jump-list recent → offline boot → uninstall → `%APPDATA%/Excalidraw` retention (documented `deleteAppDataOnUninstall: false` choice) → reinstall sees old data.
  - Record results table in the doc.
- **AC**:
  - [ ] All checklist rows pass or have linked issues; document committed.

#### D-39 | Performance budget verification

- **Depends**: D-33 · **Est**: S
- **Do**:
  - Measure on reference hardware (document the machine spec in README): cold start → first interactive canvas (instrument via main-process timestamps + renderer `performance.now()` marks sent over bridge, test-only flag); idle heap; pan/zoom smoothness on a 1k-element generated scene (use existing `Stats` panel + `visualdebug` utilities).
  - Budgets: TTI ≤ 3.0 s; idle heap ≤ 500 MB; no dropped-frame redline in Stats during 10 s pan (soft gate, record numbers).
- **AC**:
  - [ ] Numbers recorded in `packages/desktop/README.md`; regressions > 25% vs recorded baseline open a perf issue.

#### D-40 | Security review checklist (pre-release gate)

- **Depends**: D-12, D-21, D-33 · **Est**: M
- **Do**:
  - Verify and record: `contextIsolation`/`sandbox` on all webContents (incl. any child windows — none expected); no Node globals leaked into renderer (`typeof require === "undefined"` in page); CSP response header injected via `onHeadersReceived` on `app://` responses (`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https: wss:;`) — reconcile with Workbox absence (no SW CSP carve-outs needed); `openExternal` allowlist (https only, no `file:`/`javascript:`); permission handler deny-all except clipboard-write/fullscreen; IPC input validation on every channel (filters shape, path strings — reject UNC/device-path surprises for v1.0 scope, document as backlog hardening).
- **AC**:
  - [ ] Checklist doc committed with evidence (devtools screenshots/console captures); every row has pass/issue link.

---

## 2. Backlog (explicitly out of v1.0 — do NOT implement while executing §1)

Ordered by expected value; each is a future epic with its own task list.

1. **Auto-update channel** — `electron-updater` against GitHub Releases; NSIS differential (`blockMap`) updates; staged rollout (5%→100%); update-badge in-app. Blocked by D-34 (signing) for real-world frictionless installs.
2. **Collaboration + share-link hardening on desktop** — links currently embed the `app://excalidraw` origin (unusable by browser peers): collab room links (`data/index.ts` L163) **and** share links (`data/index.ts` L283–285, `#json=`). Options: copy `https://excalidraw.com/#room=…` / `#json=…` links via bridge (rewrite origin at link-generation time), or self-host `excalidraw-room` + Firestore project and ship desktop-specific env. Requires the D-17 feature flag flip (collab) and un-hiding the share dialog, plus link-rewrite work in `excalidraw-app/data/index.ts`.
3. **`excalidraw://` deep links + protocol handler** — `SetDefaultClient` registration via NSIS, `app.setAsDefaultProtocolClient`, single-instance routing to scene/state restoration URLs.
4. **System tray** — quick-create new drawing, jump to recent, global shortcut.
5. **Multi-window** — one window per document: refactor renderer bootstrap to per-window initial data (upstream assumes single scene per origin today — localStorage key collision must be partitioned per window id; non-trivial, design doc required).
6. **Browser-profile data importer** — one-time migration of localStorage/IndexedDB scenes from the user's Chrome PWA profile (`%LOCALAPPDATA%/Google/Chrome/User Data/Default/Local Storage/leveldb` + IndexedDB blobs) into the desktop profile; ship as opt-in "Import from browser" flow.
7. **macOS / Linux targets** — DMG + notarization (hardened runtime, `open-file` event replaces argv), AppImage/deb + XDG mime registration; the adapter/bridge architecture is platform-agnostic by design (PU §5.3 contract carries `platform` field).
8. **Crash/telemetry opt-in** — Sentry minidumps (Electron crashReporter) behind explicit user consent.
9. **Delta/crsync scene autosave to disk** — periodic workspace directory with conflict-free autosave (CRDT-ish restore points using upstream `delta.ts` machinery).

---

## 3. Open Questions (resolve before/during execution; defaults provided)

| # | Question | Default (used by §1 tasks) |
| --- | --- | --- |
| 1 | Product name in installer/title: "Excalidraw" vs a distinct fork name? | `Excalidraw` (`productName` in D-30); rename is a config-only change |
| 2 | Keep upstream cloud services (share links, library backend, Firebase) vs self-host? | Keep upstream endpoints (PU §4.7); self-hosting is a backlog epic |
| 3 | Default collab UI in desktop: off or on? | **Off** via D-17 flag (link-origin limitation — backlog item 2); flip with backlog item 2 |
| 4 | Save semantics for `Ctrl+S` on documents opened via association: silent overwrite vs always Save-As? | Silent overwrite through handle token (true desktop-app behavior; D-22/D-26) |
| 5 | Should the renderer bundle ship inside `app.asar` or unpacked? | Webapp unpacked under `extraResources` for V8 code cache + simpler protocol streaming (D-30); Electron code itself in asar |

---

## 4. Dependency snapshot & milestone mapping

```
D-01 ─ D-02 ─┬─ D-04 (CI)
             └─ D-06 ─┬─ D-07 ─┬─ D-08 ─┬─ D-09 ─┐
                      │        │        ├─ D-11  ├─ D-12
                      │        │        │        └─ D-18 (with D-14)
                      │        │        └─ D-10 ─┬─ D-16 ─┬─ D-17
                      │        │                 │        ├─ D-25 ─ D-27
                      │        │                 │        └─ D-23 ─┐
                      │        │                 ├─ D-20 ─ D-22   │
                      │        │                 │    └─ D-21 ────┼─ D-26
                      │        │                 │                ├─ D-29
                      │        │                 └─ D-24 ─ D-28 ───┘
                      └─ D-14 ─ D-15 ─ D-16(D-14 dep) ─────────────┘
D-30 (D-09+D-14) ─ D-31 ─ D-32 ─ D-33 ─┬─ D-34 ─ D-35
                                       ├─ D-38, D-39
                                       └─ D-40 (D-12+D-21)
D-36 (D-20+D-21+D-26) · D-37 (D-23+D-25)
```

| Milestone | Tasks | Exit gate |
| --- | --- | --- |
| **M1 — Fork is healthy** | D-01…D-05 | Baseline suite green in CI on `desktop-v1` |
| **M2 — Electron shell boots** | D-06…D-13 | Editor renders in Electron window via `app://` with HMR dev loop |
| **M3 — Desktop-ized build** | D-14…D-18 | No SW, gated cloud UI, offline-capable boot |
| **M4 — Native file I/O complete** | D-19…D-29 | All file flows native; associations open scenes; close-guard solid |
| **M5 — Distributable v1.0** | D-30…D-35 | Signed-or-unsigned NSIS installer produced by CI |
| **M6 — Release gate** | D-36…D-40 | Tests, smoke matrix, perf budgets, security checklist all pass |

**Total: 40 executable tasks (D-01…D-40) across 6 phases, plus a 9-item backlog.**

---
