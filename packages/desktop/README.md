# `@excalidraw/desktop`

The Electron shell for the **Excalidraw Desktop** app — a Windows-first desktop build of the upstream Excalidraw whiteboard editor.

This workspace holds everything we build: the Electron main process, the preload bridge, the IPC layer, the renderer-side filesystem adapter, and the electron-builder packaging configuration. The editor itself is **not** here — it is the upstream `excalidraw-app` workspace, running unmodified inside the shell.

> **Companion documents**
>
> - [`UPSTREAM.md`](./UPSTREAM.md) — the pinned upstream commit, branch model, and the monthly rebase procedure. Read this before syncing with upstream.
> - [`docs/ProjectUnderstanding.md`](../../docs/ProjectUnderstanding.md) — _PU_: the comprehension layer. Source architecture, target architecture, decision records, scope matrix, risk register.
> - [`docs/TaskList.md`](../../docs/TaskList.md) — the executable plan (40 tasks, `D-01`…`D-40`). Normative; wins over PU on any contradiction.

---

## 1. Status

| Task | Status | Notes |
| --- | --- | --- |
| D-01 Fork, remotes, branch model | ✅ done | `desktop-v1` based on pinned commit `ed10ac7d` |
| D-02 Baseline green-state verification | ✅ done | Windows + Node 22.23.4: all suites green (2,448 tests) |
| D-03 This README | ✅ done | — |
| D-04 CI baseline workflow | ⏳ next | Needs `desktop-v1` pushed to the fork ✅ (done) |
| D-05 Desktop dev-docs entry | ⏳ planned | `packages/desktop/docs/getting-started.md` |

Nothing in `packages/desktop/src/` exists yet — the Electron workspace is scaffolded in **D-06**. Until then this directory holds only documentation.

## 2. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node | **22.23.4** (LTS) | Provisioned via nvm-windows 2.0.1 (shim mode). Node 24 is out of scope. |
| Yarn | **1.22.22** (Yarn Classic) | The root `packageManager` field is authoritative — do **not** migrate to Yarn Berry. |
| Windows build host | Windows 10/11 x64 | Required for the packaging tasks (D-30…D-35). |

> **PATH caveat on this host.** `node` must resolve through the nvm shim, because the machine PATH still contains the pre-existing `C:\Program Files\nodejs` (Node 24) and Windows appends the _user_ PATH _after_ the _machine_ PATH. Prefix build commands with:
>
> ```bash
> export PATH="/c/Users/User/AppData/Local/Author Software/nvm/.shim:$PATH"
> ```
>
> Full details in [`UPSTREAM.md` §6.1](./UPSTREAM.md#61-recorded-toolchain-versions--baseline-verification-note).

## 3. Repository layout

Desktop-owned code lives in two places. Everything else is upstream and shared.

```
packages/desktop/                     ← this workspace (all new desktop code)
  src/electron/                       main process: main.ts, menu.ts, protocol.ts,
                                      windows.ts, ipc/            (lands in D-06…D-13)
  src/electron/preload.ts             contextBridge preload                (D-10)
  src/shared/bridge-contract.ts       the frozen DesktopBridge contract    (D-10)
  src/renderer/                       renderer-side modules               (D-20)
  build/                              icons + electron-builder assets      (D-30…D-32)
  dist/                               build output (gitignored)
  electron-builder.yml                packaging config                     (D-30)
  UPSTREAM.md                         pin + sync policy                    (D-01)
  docs/                               dev docs                             (D-05)

excalidraw-app/desktop/               ← renderer-side bootstrap glue       (D-16)
  bootstrap.ts                        desktop-only boot module
  config.ts                           IS_DESKTOP flag
  menuCommands.tsx                    native menu → ActionManager          (D-25)
```

## 4. Development commands

All commands are run from the **monorepo root** unless stated otherwise. Commands marked _lands in D-NN_ do not exist yet — they are placeholders for what the task will add.

### Available now

| Command | What it does |
| --- | --- |
| `yarn install` | Install the workspace tree. Expect workspaces hoisting into `node_modules/@excalidraw/*`. |
| `yarn test:typecheck` | `tsc` — type-check the whole monorepo. |
| `yarn test:code` | `eslint --max-warnings=0 --ext .js,.ts,.tsx .` — lint. Warnings are failures. |
| `yarn test:app --watch=false` | Vitest — the upstream suite, the project's regression oracle. |
| `yarn test:all` | All four of the above, plus `test:other` (Prettier). |

### Lands as the phases progress

| Command | Task | What it does |
| --- | --- | --- |
| `yarn --cwd excalidraw-app dev:vite` | D-14 | Vite dev server in `desktop` mode on port 3001 (HMR). |
| `yarn --cwd excalidraw-app build:desktop` | D-14 | Production webapp build with PWA suppressed → `excalidraw-app/build/`. |
| `yarn workspace @excalidraw/desktop build:electron` | D-07 | esbuild → `dist/electron/{main,preload}.cjs` (CommonJS, `platform: node`). |
| `yarn workspace @excalidraw/desktop watch:electron` | D-07 | Same, in esbuild watch mode. |
| `yarn desktop:dev` | D-13 | Vite (HMR) + Electron together, Electron launched once the dev server answers. |
| `yarn desktop:build` | D-14 | `build:desktop` + `build:electron`. |
| `yarn desktop:dist` | D-33 | Full packaging graph → `packages/desktop/release/*.exe` (NSIS installer). |
| `yarn workspace @excalidraw/desktop dist:win` | D-33 | `electron-builder --win` on its own. |

## 5. Architecture decision records

Reproduced from PU §5.2, §5.4 and §5.5 — the three decisions that shape the whole integration; everything else follows from them. The prose is verbatim; the embedded code blocks are re-wrapped by the repository's Prettier configuration, so they are semantically identical to PU's but not byte-identical. **PU is the source of truth** — if the two ever disagree, PU wins.

### 5.1 Serving model — the `app://` privileged protocol (decision record)

> **Decision:** serve the Vite build from a privileged custom scheme `app://excalidraw/` rather than `file://` or a bundled localhost HTTP server.
>
> - **Why not `file://`:** breaks fetch/XHR semantics, cookies, and origin-based APIs. Excalidraw's collab/Firebase/library code assumes a standard origin; network-dependent features degrade unpredictably under opaque origins.
> - **Why not localhost HTTP:** port collisions, firewall prompts on Windows, and an always-on HTTP server inside a desktop app is attack surface plus operational noise.
> - **Why `app://` works:** registered via `protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }])` **at main.ts module top-level — it must precede `app.whenReady()`**. Served via `protocol.handle("app", …)` streaming files from the packaged webapp directory with a full MIME map and an `index.html` fallback. Because the scheme is _standard_, the renderer gets a real origin (`app://excalidraw`), so `window.location` hash state, localStorage, IndexedDB, and fetch all behave exactly as on the web.
> - **Hardening:** path traversal probes (`app://excalidraw/../../etc/passwd`) are rejected via `path.normalize` + prefix checks (D-09 acceptance test), and a CSP response header is injected via `onHeadersReceived` on `app://` responses (D-40).
> - **Dev mode:** `loadURL("http://localhost:3001")` — the existing Vite dev server — preserving HMR; the protocol handler engages only when `app.isPackaged` or `ELECTRON_RENDERER_URL` is unset.

### 5.2 The `FileSystemAdapter` injection seam (decision record)

> Upstream `data/filesystem.ts` wraps `browser-fs-access`. Task D-19 refactors it into a seam with **behavior-preserving default**:
>
> ```ts
> export interface FileSystemAdapter {
>   open(opts: OpenOptions): Promise<File | File[]>; // mirrors current fileOpen contract
>   save(
>     blob: Blob | Promise<Blob>,
>     opts: SaveOptions,
>   ): Promise<FileSystemFileHandle | null>; // mirrors current fileSave return
> }
> let adapter: FileSystemAdapter | null = null;
> export const registerFileSystemAdapter = (a: FileSystemAdapter) => {
>   adapter = a;
> };
> export const fileOpen = async (opts) =>
>   adapter ? adapter.open(opts) : legacyFileOpen(opts);
> export const fileSave = async (blob, opts) =>
>   adapter ? adapter.save(blob, opts) : legacyFileSave(blob, opts);
> ```
>
> Key properties:
>
> - The existing `browser-fs-access` implementations remain as private `legacyFileOpen`/ `legacyFileSave` — **zero behavior change when no adapter is registered**, asserted by the full upstream Vitest suite staying green.
> - Existing call-site signatures (`data/json.ts`, `data/index.ts`, image-file open in `components/App.tsx`) do not change at all.
> - The Electron adapter (`packages/desktop/src/renderer/fs-adapter.ts`, task D-20) maps `MIME_TYPES`-derived extension filters to native `FileFilter`s, reconstructs `File` objects (correct `name`/`type`/`lastModified`) from `bridge.fs.readPath` byte payloads, and attaches desktop handle metadata via a `WeakMap<File, HandleMeta>` to satisfy the `loadFromBlob → fileHandle` flows.

### 5.3 `DesktopFileHandle` — duck-typing for `appState.fileHandle`

> The adapter returns a handle-shaped object — `{ kind: "file", name, isFile: true, isDesktopHandle: true, token }` — that satisfies every upstream consumer of `appState.fileHandle` _structurally_, without editing `types.ts`:
>
> - The truthiness gate in `actionSaveToActiveFile` (L261 `!!appState.fileHandle`) passes, enabling Ctrl+S.
> - Re-save flows (`saveAsJSON(…, fileHandle)`) hand the handle back to `fileSave`; the adapter intercepts, sees `token`, and the main process writes through the registered path — **silent overwrite, no dialog** (true desktop Save semantics).
> - `isImageFileHandle()` branching for image-export-then-resave flows never calls `getFile()` on desktop handles (the adapter intercepts first) — asserted in code comments and tests (D-22).
> - Token→path mappings live only in main-process memory; cross-session persistence comes from the recent-files store (D-28), and re-issued handles per session are by design (a new session re-binds via open/save/open-with).

## 6. Diff-surface budget

Upstream code under `packages/*` and `excalidraw-app/*` is a **shared asset with upstream**. Only these seven files may be modified, and only in the way the referencing task prescribes. This table is also the rebase-conflict checklist during upstream syncs — see [`UPSTREAM.md` §5](./UPSTREAM.md#5-rebase-conflict-checklist).

| File | Sanctioned modification | Task |
| --- | --- | --- |
| `packages/excalidraw/data/filesystem.ts` | Introduce injectable `FileSystemAdapter` seam, default behavior unchanged | D-19 |
| `packages/excalidraw/index.tsx` | Re-export `registerFileSystemAdapter` + adapter types | D-19 |
| `excalidraw-app/index.tsx` | Runtime-guard `registerSW()`; conditional desktop bootstrap import | D-15, D-16 |
| `excalidraw-app/vite.config.mts` | Mode-aware plugin config (desktop mode) | D-14 |
| `excalidraw-app/App.tsx` | Minimal `IS_DESKTOP`-gated conditionals (collab UI toggle, Plus UI gating) | D-17 |
| `excalidraw-app/components/AppMainMenu.tsx` | Mount desktop menu-command handler | D-25 |
| `excalidraw-app/app_constants.ts` | Add desktop-only storage key constant | D-28 |

Anything else under `excalidraw-app/` or `packages/` requires a **new** desktop-owned module (e.g. `excalidraw-app/desktop/**`, `packages/desktop/**`) instead of editing shared files. New files are unrestricted. Root-level files (`package.json`, `vitest.config.mts`, `.env.desktop`, `.github/workflows/*`) are outside the budget but still tracked in the rebase checklist.

## 7. Scope of v1.0

**In:** native open/save dialogs, `.excalidraw` / `.excalidrawlib` file associations, silent re-save (true desktop Save semantics), recent files, Windows jump list, NSIS per-user installer.

**Inherited unmodified from upstream:** the whole editor (canvas, tools, text, frames, laser, stats, command palette), localStorage + IndexedDB persistence, PNG/SVG/clipboard export, library browsing.

**Deliberately off in desktop builds:** service worker / PWA, Sentry, analytics, live collaboration UI, share-link UI, Excalidraw+ promo/export UI.

**Out of scope:** auto-update, system tray, `excalidraw://` deep links, multi-window, macOS/Linux targets, code signing (scaffolding only, D-34).

## 8. Contribution rules

1. One task (`D-NN`) at a time, in numeric order within a phase; phases run 0 → 5.
2. Never start a task whose `Depends` are not complete and checked off.
3. Keep the upstream Vitest suite green after **every** task — it is the regression oracle.
4. Keep diffs surgical. Every changed line in a shared upstream file is a future rebase conflict.
5. Ask before implementing; wait for confirmation.
6. Update `docs/TaskList.md` only after the implementation is verified by a human — check off ACs, and add no commentary, timestamps or history.

## 9. Related documents

| Document | Contents |
| --- | --- |
| [`UPSTREAM.md`](./UPSTREAM.md) | Pinned commit, branch model, release-line topology, sync procedure, rebase checklist, toolchain + baseline results |
| [`docs/ProjectUnderstanding.md`](../../docs/ProjectUnderstanding.md) | PU — source/target architecture, decision digest, scope matrix, risk register, glossary, traceability matrix |
| [`docs/TaskList.md`](../../docs/TaskList.md) | The 40-task plan, dependencies, acceptance criteria, diff-surface budget, backlog |
| `packages/desktop/docs/getting-started.md` | _lands in D-05_ — prerequisites, dev walkthrough, packaged-build walkthrough, troubleshooting |
