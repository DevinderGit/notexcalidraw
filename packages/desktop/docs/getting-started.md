# Getting Started — Excalidraw Desktop

Everything you need to get the desktop shell running on a fresh Windows machine, plus what to do when something goes wrong.

> **Status.** This project is in **Phase 1** of the plan. The Electron shell boots and serves the editor over the `app://` protocol, but the HMR dev loop lands in **D-13** and the desktop-specific behaviour (native file dialogs, menus) in Phase 3. Commands marked ⏳ _not available yet_ will appear as the plan lands. See [`packages/desktop/README.md`](../README.md) for the task-by-task status and [`UPSTREAM.md`](../UPSTREAM.md) for the pinned upstream commit.

## 1. Prerequisites

| Tool | Version | How to get it |
| --- | --- | --- |
| Node | **22.23.4** (LTS) | `nvm install 22.23.4 && nvm use 22.23.4` (nvm-windows 2.0.1) |
| Yarn | **1.22.22** (Yarn Classic) | `npm i -g yarn@1.22.22` — the repo pins this via the root `packageManager` field |
| Git | any recent | for fork/branch management |
| Windows | 10 or 11, x64 | the build host for the packaging tasks (D-30…D-35) |

**Node 24 does not work for this project and is out of scope.** The desktop toolchain requires Node ≥ 20 LTS; this project standardises on **Node 22 LTS**.

### The `node` PATH gotcha (read this first)

On a machine that already had Node installed, `node` may keep resolving to the old version even after `nvm use`. The reason is Windows PATH ordering: the **machine** PATH is prepended to the **user** PATH, so a user-level shim entry can never win over a machine-level `C:\Program Files\nodejs`.

Check what you actually get:

```bash
node -v    # must print v22.23.4
yarn -v    # must print 1.22.22
```

If `node -v` prints anything else, put the nvm shim directory first:

```bash
export PATH="/c/Users/User/AppData/Local/Author Software/nvm/.shim:$PATH"
```

To make that permanent, add the shim directory to the **machine** PATH ahead of `C:\Program Files\nodejs` (this needs an administrator/UAC-approved step), or delete the stale `C:\Program Files\nodejs` entry.

## 2. First-time setup

From the repository root:

```bash
git clone https://github.com/DevinderGit/notexcalidraw.git
cd notexcalidraw
git checkout desktop-v1
yarn install
```

`yarn install` hoists the workspaces into `node_modules/@excalidraw/*` (they are symlinks to the local packages). It takes roughly two minutes on a cold cache.

Verify the install:

```bash
yarn workspaces info   # lists every workspace in the tree
```

The `@excalidraw/desktop` workspace appears in that list from **D-06** onward; before that, only the upstream workspaces exist.

## 3. Running the test suite

```bash
yarn test:typecheck          # tsc
yarn test:code              # eslint --max-warnings=0
yarn test:app --watch=false # vitest — the upstream suite
```

All three must exit 0 before any change is considered done. The Vitest suite is the project's **regression oracle**: if a previously-passing upstream test starts failing, something regressed.

> **Known flaky test.** `MermaidToExcalidraw` → _"should open mermaid popup when active tool is mermaid"_ fails intermittently under load (about 1 run in 4 on a busy Windows host, 0 in 6 in isolation). The mechanism and the "do not update the snapshot" instruction are documented in [`UPSTREAM.md` §7.1](../UPSTREAM.md#71-known-flaky-upstream-test--mermaidtoexcalidraw). Re-run before investigating.

## 4. Development loop — `yarn desktop:dev` ⏳ _lands in D-13_

Once Phase 1 lands, one command starts the Vite dev server and Electron together:

```bash
yarn desktop:dev
```

What happens:

1. Vite starts in `desktop` mode on **port 3001** and serves the upstream webapp with hot module replacement.
2. Electron is launched only after the dev server answers (`wait-on`), so the window never loads a blank page.
3. The renderer loads `http://localhost:3001` (not `app://`) — this is the dev branch of the serving model. In a packaged build the renderer loads `app://excalidraw/index.html` instead.

The Electron main process and preload are bundled separately, by esbuild:

```bash
yarn workspace @excalidraw/desktop build:electron   # one-shot
yarn workspace @excalidraw/desktop watch:electron   # rebuild on change
```

Both emit CommonJS into `packages/desktop/dist/electron/` — a sandboxed renderer needs a CommonJS preload script, and a CommonJS main process avoids the ESM `app.whenReady()` pitfalls. `yarn desktop:dev` runs the watcher for you.

Things to try once it runs:

- Edit a label in the editor and confirm the window hot-reloads.
- Confirm **no stray browser tab opens** — the Vite server's `server.open` is disabled in desktop mode.
- Open DevTools with `Ctrl+Shift+I` (only enabled when `EXCALIDRAW_DESKTOP_DEVTOOLS=1`).

## 5. Packaged build — `yarn desktop:dist` ⏳ _lands in D-33_

The packaging pipeline produces a Windows NSIS installer:

```bash
yarn desktop:dist
```

Which runs, in order:

1. `rm:build` — clears `excalidraw-app/build`, `packages/desktop/{dist,release,webapp-staging}`
2. `yarn --cwd excalidraw-app build:desktop` — Vite build in `desktop` mode (no service worker)
3. `yarn workspace @excalidraw/desktop build:electron` — esbuild → `dist/electron/{main,preload}.cjs`
4. copies `excalidraw-app/build` → `packages/desktop/webapp-staging/`
5. `electron-builder --win` — produces `packages/desktop/release/Excalidraw-<version>-win-x64-setup.exe`

For a fast, uninstalled build use `yarn desktop:dist --dir`, which produces an unpacked directory you can launch directly.

The installer is **per-user** (`perMachine: false`), so it installs without a UAC elevation prompt and registers `.excalidraw` / `.excalidrawlib` under `HKCU\Software\Classes`.

## 6. Troubleshooting

### "WebView2 is required" or the window is blank

**WebView2 is not needed.** Electron bundles its own Chromium, so no Edge WebView2 runtime, no system browser, and no `Microsoft Edge WebView2 Runtime` install is required. If something asks for WebView2, it is not this application.

A blank window in a packaged build usually means the `app://` protocol handler could not find the webapp root — check that `packages/desktop/webapp-staging/` was populated before `electron-builder` ran.

### SmartScreen says the installer is from an "unknown publisher"

Expected. The v1.0 build is **unsigned** (code-signing scaffolding lands in D-34). Click **More info → Run anyway**. For a signed build, provide `CSC_LINK` and `CSC_KEY_PASSWORD` to the CI release workflow; see `packages/desktop/docs/signing.md` (lands in D-34).

### `node -v` shows the wrong version

See [§1 — the `node` PATH gotcha](#the-node-path-gotcha-read-this-first). This is the single most common setup problem on this host.

### `yarn install` fails or the lockfile looks wrong

Use `yarn install --frozen-lockfile` in CI. Locally, a plain `yarn install` may update `yarn.lock`; if it does, that is a real dependency change and must be committed deliberately — never as a side effect of a different task.

### Port 3001 is already in use

The Vite dev server needs port 3001. Stop whatever is using it (`netstat -ano | findstr :3001`), or change the port in the desktop Vite config — but keep `ELECTRON_RENDERER_URL` in sync with it.

### The Vitest suite fails on `MermaidToExcalidraw`

Known upstream flake — see [§3](#3-running-the-test-suite) and [`UPSTREAM.md` §7.1](../UPSTREAM.md#71-known-flaky-upstream-test--mermaidtoexcalidraw). Re-run the suite. Do **not** update the snapshot.

### The GitHub release download is extremely slow

GitHub's release-asset CDN can be throttled to a few KB/s from some networks, while `nodejs.org` and GitHub's codeload endpoints stay fast. If a 10 MB installer crawls, download it with parallel ranged requests (`curl -r` + `Accept-Ranges: bytes`) rather than a single connection.

## 7. Where to go next

| Document | Contents |
| --- | --- |
| [`packages/desktop/README.md`](../README.md) | Task status, dev commands, architecture decision records, diff-surface budget |
| [`UPSTREAM.md`](../UPSTREAM.md) | Pinned upstream commit, sync procedure, toolchain + baseline results |
| [`docs/ProjectUnderstanding.md`](../../../docs/ProjectUnderstanding.md) | PU — source/target architecture, scope matrix, risk register |
| [`docs/TaskList.md`](../../../docs/TaskList.md) | The 40-task plan and its acceptance criteria |
