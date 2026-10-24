# Project Understanding Document — Excalidraw Desktop (Electron, Windows-first)

| Field | Value |
|---|---|
| **Companion document** | `TaskList.md` — 40 executable tasks (`D-01`…`D-40`) across 6 phases |
| **Upstream baseline** | `github.com/excalidraw/excalidraw` @ `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` (2026-10-01, `packages/excalidraw` v0.18.0) |
| **Target deliverable** | Windows (x64) NSIS-packaged Electron desktop application embedding the full Excalidraw editor |
| **Audience** | Engineering stakeholders, reviewing agents, and the autonomous coding agent that will execute `TaskList.md` |

---

## Table of Contents

1. [About This Document](#1-about-this-document)
2. [Executive Summary](#2-executive-summary)
3. [Background & Motivation](#3-background--motivation)
4. [Source System Analysis (As-Is)](#4-source-system-analysis-as-is)
5. [Target System Architecture (To-Be)](#5-target-system-architecture-to-be)
6. [Integration Strategy & Rationale](#6-integration-strategy--rationale)
7. [Delivery Plan — Mapping to TaskList.md](#7-delivery-plan--mapping-to-tasklistmd)
8. [Architectural Decision Digest](#8-architectural-decision-digest)
9. [Scope Matrix](#9-scope-matrix)
10. [Risk Register](#10-risk-register)
11. [Open Questions Carried Into Execution](#11-open-questions-carried-into-execution)
12. [Glossary](#12-glossary)
13. [Traceability Matrix](#13-traceability-matrix)

---

## 1. About This Document

### 1.1 Purpose

This document is the **comprehension layer** that sits on top of `TaskList.md`. The task list is deliberately terse and imperative: it tells an executing agent *what to do, where, and how to verify*. This document explains *why the work is shaped the way it is* — how the upstream Excalidraw web application actually works, which seams make a native desktop integration possible, what the target architecture looks like, and which engineering decisions were made (and rejected) before the first task was written.

A reader who finishes this document should be able to:

- Explain how `excalidraw.com` is built: its monorepo topology, bundling pipeline, boot sequence, persistence model, and file-I/O call graph — at the level of specific files and line-referenced behaviors.
- Justify every architectural decision embedded in the task list (`app://` privileged protocol, injectable `FileSystemAdapter`, frozen `DesktopBridge` contract, PWA suppression, NSIS per-user packaging) against the alternatives that were rejected.
- Read `TaskList.md` tasks `D-01`…`D-40` and immediately understand what problem each one solves inside the bigger picture, without re-deriving upstream architecture from source.
- Anticipate where the plan's risks concentrate and which acceptance criteria guard them.

### 1.2 Relationship to TaskList.md

`TaskList.md` is **normative**: if any statement here appears to contradict an execution instruction there, the task list wins. This document is **explanatory**, and §13 (Traceability Matrix) provides the bidirectional mapping so both documents can be audited together. All facts in §4 were verified by direct source inspection of the upstream repository at the pinned baseline commit; §5 onward describes the designed target state.

### 1.3 How to read this document

- **Stakeholders / reviewers** → §2 (Executive Summary), §8 (Decision Digest), §9 (Scope), §10 (Risks).
- **Executing coding agent** → §4 (source architecture, needed constantly while patching upstream files), §5 (target architecture, needed to build `packages/desktop` correctly), then execute `TaskList.md` §1 in order.
- **New engineer joining mid-project** → §3, §4, §5 in sequence, then skim §7 for where the project currently stands against milestones M1–M6.

---

## 2. Executive Summary

**What we are building.** A native Windows desktop application (v1.0: x64 only) that delivers the complete Excalidraw whiteboard editor as a double-clickable, installable product — with native file dialogs, `.excalidraw`/`.excalidrawlib` file associations, silent re-save (true desktop Save semantics), recent-files support, and a Windows installer produced by CI. The editor experience is inherited from upstream **unmodified**; the desktop work is a thin, well-guarded native shell around it.

**How it is built.** We fork the official `excalidraw/excalidraw` monorepo at a pinned commit and add a new private workspace, `packages/desktop`, containing the Electron main process, preload bridge, IPC layer, and electron-builder configuration. The renderer is the existing `excalidraw-app` Vite build, served inside Electron from a privileged custom protocol (`app://excalidraw/`) in packaged mode and from the existing Vite dev server (HMR) in development. Only **seven upstream files** are sanctioned for modification (the "diff-surface budget"); everything else desktop-related lives in new, desktop-owned directories.

**The single most important integration idea.** Every file open/save/export flow in Excalidraw funnels through one module — `packages/excalidraw/data/filesystem.ts`, which wraps the `browser-fs-access` library. By refactoring that module into an injectable adapter seam (with the browser behavior as untouched default) and registering an Electron adapter at boot, *all* of the editor's file flows — JSON scenes, PNG/SVG export, library import/export — become native in one move, without touching any call sites.

**Scale and shape of the work.** 40 tasks (`D-01`…`D-40`) in 6 phases — fork baseline → Electron shell → renderer integration → native file I/O → Windows packaging → QA/security hardening — gated by 6 milestones (M1–M6). Every task carries dependencies, target paths, commands, and checkbox acceptance criteria; every task must keep the full upstream Vitest suite green, because that suite is the project's regression oracle.

**What v1.0 deliberately excludes.** Auto-update, tray, `excalidraw://` deep links, multi-window, macOS/Linux targets, and collab-link hardening are deferred to a 9-item backlog. Live collaboration UI is hidden by default in desktop builds (feature-flagged), because collaboration links minted under the `app://` origin are not usable by browser peers — a documented, reversible limitation.

---

## 3. Background & Motivation

### 3.1 What Excalidraw is

Excalidraw is an open-source (MIT) virtual whiteboard with a hand-drawn aesthetic: an infinite canvas, sketch-style shapes and text, real-time collaboration, an importable component library, and export to `.excalidraw` (JSON), PNG, and SVG with optional scene embedding. Its web application is served from `excalidraw.com`, and the same codebase publishes the `@excalidraw/excalidraw` React component library to npm. The product is feature-rich at the application tier: command palette, image insertion, laser pointer, element stats, AI text-to-diagram (TTD), Mermaid import, and Excalidraw+ integration points — all of which live in the application workspace (`excalidraw-app/`) rather than the reusable component package.

### 3.2 Why a desktop application

The browser delivery has structural limitations that matter to drawing-tool users. Files require repeated permission grants (File System Access API prompts per session); there is no OS-level file association, so `.excalidraw` files can't be double-clicked; there is no jump list, no recent-files integration with the shell, and no window title reflecting the open document. A desktop shell removes all of these frictions while keeping the exact rendering, editing, and export behavior users know from the web app — which is why rendering-parity (Chromium in Electron, same engine as Chrome) was chosen as a hard constraint over any cross-platform WebView abstraction that could shift canvas/font/layout behavior.

### 3.3 Why existing wrappers were rejected (prior art)

Research into prior art established that every existing Electron attempt at Excalidraw desktop is a **URL wrapper** — a thin shell loading `https://excalidraw.com` in a `BrowserWindow`:

- `excalidraw/excalidraw-desktop` — the **official** wrapper — is deprecated by its maintainers.
- Community forks (`integeresting/excalidraw-desktop`, `pgkt04/excalidraw-desktop`, `Tripater/excalidraw-electron`, and Tauri-based variants) share the same architecture and the same ceiling.

URL wrapping fails the project's requirements at a structural level: it cannot intercept file dialogs (the site keeps using browser pickers), cannot register file associations meaningfully (no local file round-trip), cannot control the service-worker/update lifecycle, and is coupled to the production site's deployment — a third-party dependency for a "desktop app". The conclusion adopted by this project: **fork the monorepo, embed the application source, and swap the browser-only seams (file system access, service worker, window lifecycle) for native equivalents.** Because the whole component stack runs unmodified, upstream features keep working, and the upstream test suite remains meaningful as a regression gate.

---
## 4. Source System Analysis (As-Is)

> Everything in this section was verified by direct source inspection at baseline commit `ed10ac7d`. It is the factual model of the system we are about to modify. The executing agent should treat these statements as ground truth and must not contradict them silently.

### 4.1 Repository identity & toolchain baseline

| Property | Value |
|---|---|
| Repository | `github.com/excalidraw/excalidraw` |
| Pinned baseline | `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` (2026-10-01) |
| Component library version | `@excalidraw/excalidraw` v0.18.0 |
| Package manager | **Yarn Classic 1.22.22** (`packageManager` field authoritative — no Yarn Berry migration) |
| Bundler | Vite 5.0.12 (app workspace), esbuild (package builds) |
| Test runner | Vitest 3.0.6 (jsdom + `vitest-canvas-mock`), Playwright for web e2e |
| Language / UI | TypeScript 5.9.3, React 19 |
| PWA layer | `vite-plugin-pwa` 0.21.1 (Workbox `generateSW`, `registerType: "autoUpdate"`) |
| Node floor | Upstream declares ≥ 18; desktop toolchain (current-stable Electron, floor ≥ 38) requires **≥ 20 LTS** (22 recommended) |

The desktop project adds on top: `electron` (**latest stable at scaffold time, pinned exact; floor `^38`** — see `TaskList.md` §0.4), `electron-builder@^26`, `esbuild@^0.25`, `concurrently`, `cross-env`, `wait-on`, `@playwright/test`, `png2icons` — all as devDependencies of the new `@excalidraw/desktop` workspace, never in upstream workspaces.

### 4.2 Monorepo topology

Yarn Classic workspaces are declared in the root `package.json` as `["excalidraw-app", "packages/*", "examples/*"]`. Workspace roles:

| Workspace | Package | Role in this project |
|---|---|---|
| `excalidraw-app/` | `excalidraw-app` (private) | **The web application** — entry point, scene bootstrap, persistence wiring, collab, share links, Sentry, Excalidraw+ hooks. This is what the desktop renderer embeds. |
| `packages/excalidraw/` | `@excalidraw/excalidraw` | The editor library: `components/App.tsx` (~12k lines, the editor core), `data/` (serialization + file I/O), `actions/` (command pattern), `appState.ts`, `history.ts`, `scene/`, `fonts/`, `locales/`, `workers.ts`, `editor-jotai.ts`. |
| `packages/element/` | `@excalidraw/element` | Element data model: creation, mutation, `Scene.ts`, store, deltas, bounds, binding, collision, z-index. |
| `packages/math/` | `@excalidraw/math` | Pure geometry (curves, segments, PCA). |
| `packages/common/` | `@excalidraw/common` | Shared constants: `MIME_TYPES`, `EXPORT_DATA_TYPES`, `VERSIONS`, `getExportSource()`, `THEME`. |
| `packages/utils/` | `@excalidraw/utils` | Standalone export helpers (`exportToSvg`, `exportToBlob`). |
| `packages/fractional-indexing/`, `packages/laser-pointer/` | same-scoped | Vendored/extracted libraries. |
| `examples/with-nextjs/` | — | Embedding example; irrelevant to desktop. |
| `packages/desktop/` | `@excalidraw/desktop` (new, private) | **Everything we build** — Electron main/preload, bridge contract, renderer glue, builder config. |

**Critical consequence — source-level module resolution.** Both `excalidraw-app/vite.config.mts` and the root `vitest.config.mts` alias `@excalidraw/*` directly to TS/TSX **sources** (e.g. `@excalidraw/excalidraw` → `packages/excalidraw/index.tsx`, with deep-import patterns like `@excalidraw/excalidraw/(.*?)` → `packages/excalidraw/$1`). Three implications drive the whole integration design:

1. No prebuilt `dist` is needed to run or build the app inside the monorepo.
2. The desktop workspace can deep-import internals (e.g. `@excalidraw/excalidraw/actions/actionExport`) through the same alias mechanism — legal and supported inside the fork.
3. The npm `exports` map in `packages/excalidraw/package.json` is irrelevant for our builds; the fork does not need to publish anything to consume the library.

### 4.3 Build & toolchain pipeline

- **Bundler:** Vite 5.0.12 builds `excalidraw-app/` to `excalidraw-app/build/`, with `publicDir: ../public` and `envDir: ../` (env files live at the monorepo root — important when adding a `.env.desktop`).
- **Plugins:** `@vitejs/plugin-react`, `vite-plugin-svgr`, `vite-plugin-ejs` (index.html templating), `vite-plugin-checker` (TS + ESLint overlay), `vite-plugin-sitemap`, `vite-plugin-html`, and **`vite-plugin-pwa`** — the latter configures Workbox SW generation with runtime caching for woff2/locales/chunks and a full PWA manifest including `file_handlers` for `.excalidraw` and a `share_target`. The PWA layer is browser-only machinery that must be suppressed in desktop builds (see §5.6 and task D-14/D-15).
- **Manual chunks:** `locales/*.js` per language, `mermaid-to-excalidraw`, `codemirror.chunk` — all emitted as static files, which load fine from a custom protocol.
- **Fonts:** fully self-hosted woff2 (`public/Virgil.woff2`, `public/Cascadia.woff2`, `public/Assistant-Regular.woff2`, Excalifont et al. under `packages/excalidraw/fonts/`), referenced from `excalidraw-app/index.html` via `../packages/excalidraw/fonts/fonts.css`; build emits `fonts/{family}/[name][extname]`. **No CDN dependency at runtime for core fonts** — a key enabler for offline desktop operation.
- **Quality gates:** `yarn test:typecheck` (tsc), `yarn test:code` (ESLint, `--max-warnings=0`), `yarn test:app` (Vitest), `yarn test:other` (Prettier), husky + lint-staged pre-commit.

### 4.4 Application bootstrap & scene-resolution flow

```
excalidraw-app/index.tsx
  ├─ import "./sentry"                      (Sentry, @sentry/browser 9.0.1 — DSN-gated)
  ├─ window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA
  ├─ registerSW()                           (virtual:pwa-register → Workbox service worker)
  └─ createRoot(#root).render(<StrictMode><ExcalidrawApp/></StrictMode>)

excalidraw-app/App.tsx  (ExcalidrawWrapper, 1322 lines)
  ├─ initializeScene()  ── scene resolution priority:
  │    1. URLSearchParams "id" (legacy)
  │    2. location.hash "#json=<id>,<key>"  → importFromBackend()   (json.excalidraw.com, encrypted gzip)
  │    3. location.hash "#room=<id>,<key>"  → collabAPI.startCollaboration() (WS + Firebase)
  │    4. location.hash "#url=<encoded>"    → fetch → loadFromBlob()
  │    5. fallback: importFromLocalStorage() → restoreElements / restoreAppState
  │  → window.history.replaceState() to scrub consumed hashes
  ├─ <Excalidraw initialData={resolvablePromise} onChange={onChange} …>
  │    onChange → LocalData.save(elements, appState, files)  (debounced 300 ms)
  ├─ Collab (socket.io-client → VITE_APP_WS_SERVER_URL; Firestore persistence)
  ├─ useHandleAppTheme() → localStorage "excalidraw-theme" (LIGHT/DARK/system)
  └─ AppMainMenu / AppFooter / AppWelcomeScreen / AI components (TTDDialog, MagicButton)
```

Desktop-relevant behavioral notes:

- `LocalData.isSavePaused()` returns true while `document.hidden` — saves pause on minimize, but flush handlers on `blur`/`visibilitychange` (App.tsx ~L657–692) keep persistence safe across window-state changes.
- `initializeScene()` keys off `window.location` hash state, which is **scheme-agnostic** — hash interactions keep working under `app://`, making the URL-hash channel a natural (if lightly used) carrier for scene loading.
- `getExportSource()` (`packages/common/src/constants.ts` L354) returns `window.EXCALIDRAW_EXPORT_SOURCE || window.location.origin` — so the desktop shell can set that global **before boot** to keep exported files' `source` field interoperable with upstream (task D-16 sets it to `https://excalidraw.com` instead of `app://excalidraw`).

### 4.5 Persistence model (all renderer-process, zero migration needed)

| Store | Location | Keys / stores | Written by |
|---|---|---|---|
| Scene elements | `localStorage` | `"excalidraw"` (`STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS`) | `LocalData.save` (debounced 300 ms) |
| UI state | `localStorage` | `"excalidraw-state"` (scrubbed via `clearAppStateForLocalStorage`) | same |
| Theme | `localStorage` | `"excalidraw-theme"` | `useHandleAppTheme` |
| Collab session | `localStorage` | `"excalidraw-collab"` | `collab/Collab.tsx` |
| Binary files (images) | IndexedDB `files-db` / `files-store` (idb-keyval 6.0.3) | fileId → `BinaryFileData` | `LocalFileManager.saveFiles`; GC evicts unused files > 24 h |
| Library | IndexedDB `excalidraw-library-db` / `-store` | `libraryData` | `LibraryIndexedDBAdapter` (legacy localStorage adapter kept only for migration) |
| TTD chat history | IndexedDB (STORAGE_KEYS.IDB_TTD_CHATS) | — | TTDDialog |
| Cross-tab sync | `localStorage` counters | `version-dataState`, `version-files` | `tabSync.ts` |

All of this runs inside Chromium's profile directory. Under Electron it automatically lands in `%APPDATA%/<appName>/` (the userData dir) — **zero migration work in v1.0**; the plan only verifies durability (relaunch persistence checks in D-37/D-38).

### 4.6 File-I/O architecture — the critical seam

The entire file open/save/export surface of the editor funnels through a single module. The call graph (all inside `packages/excalidraw`):

```
UI (MainMenu DefaultItems / ImageExportDialog / LibraryMenu / paste-drop handlers)
  → actions/actionExport.tsx
      ├─ actionSaveToActiveFile   (L253) — re-saves via appState.fileHandle (FSA handle)
      ├─ actionSaveFileToDisk     (L329, "saveFileToDisk") — saveAsJSON(fileHandle: null)
      └─ actionLoadScene          (L393) — loadFromJSON()
  → data/json.ts
      ├─ saveAsJSON()        → serializeAsJSON(...) → Blob(application/vnd.excalidraw+json)
      │                        → fileSave(blob, { name, extension: "excalidraw", fileHandle })
      ├─ loadFromJSON()      → fileOpen({ description: "Excalidraw files" }) → loadFromBlob()
      └─ saveLibraryAsJSON() → fileSave(..., extension: "excalidrawlib")
  → data/index.ts  exportCanvas() → fileSave() for "png"/"svg"
      (optionally scene-embedded via encodePngMetadata / SVG preamble)
  → data/filesystem.ts   ← ★ THE SEAM
      ├─ fileOpen(...)  → browser-fs-access _fileOpen (FSA showOpenFilePicker; <input type=file> fallback)
      └─ fileSave(...)  → browser-fs-access _fileSave (FSA showSaveFilePicker; <a download> fallback)
```

The pivotal piece of state is **`appState.fileHandle`** (typed `FileSystemFileHandle | null` in `packages/excalidraw/types.ts`) — the "currently bound document":

- `actionSaveToActiveFile` is *enabled only when* `appState.fileHandle` is set, and re-saves through it (true Save).
- `data/blob.ts` exposes `isImageFileHandle()` to branch on `.excalidraw.png` / `.svg` handles.
- Library import (`.excalidrawlib`) flows through the same `fileOpen` / `loadSceneOrLibraryFromBlob` machinery, so adapting the seam covers library open/save with no extra work.

**Why this seam is the whole game for desktop:** in Electron, `window.showSaveFilePicker` is unavailable, and the `<input type=file>` fallback yields `File` objects without usable paths (Electron removed `File.path`; `webUtils.getPathForFile` is a partial workaround that still fights the API). Therefore the plan refactors `data/filesystem.ts` into an injectable adapter (task D-19) whose default path is the untouched `browser-fs-access` behavior, and registers an Electron adapter at boot (D-20/D-23) that routes through native dialogs + main-process `fs`. Because every flow funnels through this one module, one adapter covers scenes, PNG/SVG export, libraries, and image insertion simultaneously.

### 4.7 Environment variables & external services contract

Env files live at the repo root (`.env.development`, `.env.production`, `.env.test`), loaded via `envDir: "../"`. Production disposition for desktop:

| Var | Production purpose (excalidraw.com) | Desktop v1.0 disposition |
|---|---|---|
| `VITE_APP_BACKEND_V2_GET_URL` / `POST_URL` | Share-link storage (`json.excalidraw.com`) | Keep (network feature; harmless offline) |
| `VITE_APP_WS_SERVER_URL` | Collab signaling (`oss-collab.excalidraw.com`) | Keep; collab UI toggled off (D-17) |
| `VITE_APP_FIREBASE_CONFIG` | Collab/share-link file storage | Keep (public OSS config) |
| `VITE_APP_LIBRARY_URL` / `LIBRARY_BACKEND` | Library browsing / publishing | Keep |
| `VITE_APP_PLUS_LP` / `PLUS_APP` | Excalidraw+ URLs | Hide Plus-specific UI (D-17) |
| `VITE_APP_AI_BACKEND` | AI text-to-diagram | Keep; network feature |
| `VITE_APP_ENABLE_TRACKING` | Analytics toggle | `false` (D-14) |
| `VITE_APP_ENABLE_PWA` | PWA/SW generation | SW fully suppressed (D-14/D-15) |
| `VITE_APP_PORT` | Dev server port (`3001`) | Reused by Electron dev mode |
| `VITE_APP_DISABLE_PREVENT_UNLOAD` | Unload-guard bypass | Not set; unload-guard bridged to native close flow (D-27) |

Sentry (`excalidraw-app/sentry.ts`) is DSN-gated and stays disabled for desktop builds by **omitting the DSN from `.env.desktop`** — no code edit (`sentry.ts` is outside the diff-surface budget; D-14/D-17).

### 4.8 File-format registry

| Extension | MIME (`packages/common/src/constants.ts`) | Producer | Consumer |
|---|---|---|---|
| `.excalidraw` | `application/vnd.excalidraw+json` | `saveAsJSON` | `loadFromBlob` → `restore` |
| `.excalidrawlib` | `application/vnd.excalidrawlib+json` | `saveLibraryAsJSON` | `loadLibraryFromBlob` (`isValidLibrary`, version 1\|2) |
| `.excalidraw.png` | `image/png` (scene embedded) | `exportCanvas("png")` + `encodePngMetadata` | `loadFromBlob` (metadata extraction) |
| `.excalidraw.svg` | `image/svg+xml` (scene embedded, `SVG_DOCUMENT_PREAMBLE`) | `exportCanvas("svg")` | `loadFromBlob` |
| `.png/.svg/.jpg/.gif/.webp/…` | `IMAGE_MIME_TYPES` | external | image insertion |

This registry is the source of truth for three desktop artifacts: native-dialog file filters (D-20), Windows file associations (D-32), and the argv file-extension whitelist for open-with handling (D-26).

---
## 5. Target System Architecture (To-Be)

### 5.1 Process model

The desktop app is a standard secure Electron three-layer architecture:

```
┌────────────────────────── Main process (packages/desktop/src/electron/main.ts) ──────────────────────────┐
│  app lifecycle · single-instance lock · argv file resolution (cold start + second-instance)               │
│  BrowserWindow (1440×900 default, min 1024×640; contextIsolation: true, sandbox: true,                    │
│                 nodeIntegration: false)                                                                    │
│  app:// protocol handler (static file server over built webapp)                                            │
│  IPC handlers: desktop:fs:* (open/save/readPath) · desktop:menu:* · desktop:app:confirmClose               │
│  Native application Menu (File/Edit/View/Help) · recent-documents jump list (app.addRecentDocument)        │
│  electron-builder packaging entry (asar for code, NSIS per-user installer, fileAssociations)               │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                               │ preload (packages/desktop/src/electron/preload.ts, CJS bundle)
                                               │ contextBridge.exposeInMainWorld("excalidrawDesktop", BRIDGE)
┌──────────────────────────────────────────────▼───────────────────────────────────────────────────────────┐
│  Renderer = the unmodified excalidraw-app Vite build                                                       │
│  boot: window.excalidrawDesktop present ? import excalidraw-app/desktop/bootstrap : web path (registerSW)  │
│  bootstrap: registerFileSystemAdapter(ElectronFileSystemAdapter) · EXCALIDRAW_EXPORT_SOURCE                │
│            · menu-command subscription (AppMainMenu context) · dirty-state reporting                       │
│  persistence: localStorage + IndexedDB inside %APPDATA%/Excalidraw/ (Chromium profile) — untouched         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Design principles embedded in this layout:

- **The renderer stays upstream.** All desktop-specific renderer behavior is added by a dynamically imported bootstrap module (`excalidraw-app/desktop/bootstrap.ts`) that only runs when the bridge global exists. Web builds carry only an inert async chunk.
- **Privilege isolation.** `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false` mean the renderer has no Node access; every privileged operation crosses the bridge as typed IPC.
- **Main process owns the OS.** Dialogs, file reads/writes, window state, menus, recent documents, and protocol serving live in main; the renderer only sees promise-based bridge calls and command events.

### 5.2 Serving model — the `app://` privileged protocol (decision record)

**Decision:** serve the Vite build from a privileged custom scheme `app://excalidraw/` rather than `file://` or a bundled localhost HTTP server.

- **Why not `file://`:** breaks fetch/XHR semantics, cookies, and origin-based APIs. Excalidraw's collab/Firebase/library code assumes a standard origin; network-dependent features degrade unpredictably under opaque origins.
- **Why not localhost HTTP:** port collisions, firewall prompts on Windows, and an always-on HTTP server inside a desktop app is attack surface plus operational noise.
- **Why `app://` works:** registered via `protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }])` **at main.ts module top-level — it must precede `app.whenReady()`**. Served via `protocol.handle("app", …)` streaming files from the packaged webapp directory with a full MIME map and an `index.html` fallback. Because the scheme is *standard*, the renderer gets a real origin (`app://excalidraw`), so `window.location` hash state, localStorage, IndexedDB, and fetch all behave exactly as on the web.
- **Hardening:** path traversal probes (`app://excalidraw/../../etc/passwd`) are rejected via `path.normalize` + prefix checks (D-09 acceptance test), and a CSP response header is injected via `onHeadersReceived` on `app://` responses (D-40).
- **Dev mode:** `loadURL("http://localhost:3001")` — the existing Vite dev server — preserving HMR; the protocol handler engages only when `app.isPackaged` or `ELECTRON_RENDERER_URL` is unset.

### 5.3 The `DesktopBridge` IPC contract (frozen interface)

Defined in `packages/desktop/src/shared/bridge-contract.ts` — a **single source of truth** imported by both processes (via a path alias added to `excalidraw-app/vite.config.mts` and `vitest.config.mts`):

```ts
export interface DesktopBridge {
  /** static identity */
  readonly isDesktop: true;
  readonly platform: "win32" | "darwin" | "linux";
  readonly appVersion: string;
  /** file system */
  fs: {
    open(opts: { filters: FileFilter[]; multiSelections?: boolean }):
      Promise<OpenResult[] | null>;            // null = user cancelled
    save(opts: { contents: Uint8Array; filters: FileFilter[]; defaultPath?: string;
                 /** existing handle → overwrite silently (true Save) */
                 token?: string }): Promise<SaveResult | null>;
    readPath(path: string): Promise<{ data: Uint8Array; name: string; lastModifiedMs: number }>;
  };
  /** native menu → renderer command dispatch */
  onMenuCommand(handler: (command: MenuCommandId) => void): () => void;
  /** shell */
  openExternal(url: string): void;             // main allowlists https: only
  /** window state */
  setDocumentState(state: { name: string | null; dirty: boolean }): void;
  /** close-flow negotiation (D-27) */
  onConfirmClose(handler: () => Promise<"save" | "discard" | "cancel">): () => void;
  /** open-with delivery, running instance: main → renderer push (second-instance argv) */
  onOpenFiles(handler: (paths: string[]) => void): () => void;
  /** open-with delivery, cold start: renderer pulls once during bootstrap (D-26) */
  getStartupFiles(): Promise<string[]>;
  /** main pulls in-app recents when rebuilding the native Recent submenu (D-24/D-28) */
  getRecentFiles(): Promise<DesktopRecentFile[]>;
}
export type DesktopFileHandleToken = string;   // opaque, main-process registry key
export interface DesktopRecentFile { path: string; name: string; ext: string; ts: number }
```

`MenuCommandId = "file:new" | "file:open" | "file:save" | "file:saveAs" | "file:exportImage" | "help:about"`.

Contract properties worth internalizing:

- **Frozen from D-10 onward.** The interface includes the open-with/recents members (`onOpenFiles`, `getStartupFiles`, `getRecentFiles`) up front, because D-26/D-28 need them. Transport mapping: `onOpenFiles` ↔ `desktop:open-files` push, `getStartupFiles` ↔ `desktop:app:startupFiles` invoke, `getRecentFiles` ↔ `desktop:menu:recent` invoke.
- **Frozen on purpose.** The interface is small and stable so renderer-side code can rely on it without version gymnastics. New capabilities (e.g. auto-update later) are *added*, never reshaped.
- **Cancel is a value, not an exception.** `open`/`save` returning `null` means user cancellation; the adapter layer translates this into the benign abort-error shape upstream already treats as cancel.
- **Opaque tokens, not paths.** The renderer never learns absolute file paths as authority; it receives opaque tokens whose path mapping lives in a main-process `HandleRegistry` (`crypto.randomBytes(16)` hex tokens, in-memory, session-scoped). The renderer does receive paths as *data* for recents/labels, but privileged writes always resolve through main.
- **Push channels are evented.** Menu commands, open-with file deliveries, and close negotiation are main→renderer pushes with unsubscribe functions, designed for React `useEffect` lifecycles.

### 5.4 The `FileSystemAdapter` injection seam (decision record)

Upstream `data/filesystem.ts` wraps `browser-fs-access`. Task D-19 refactors it into a seam with **behavior-preserving default**:

```ts
export interface FileSystemAdapter {
  open(opts: OpenOptions): Promise<File | File[]>;   // mirrors current fileOpen contract
  save(blob: Blob | Promise<Blob>, opts: SaveOptions):
    Promise<FileSystemFileHandle | null>;            // mirrors current fileSave return
}
let adapter: FileSystemAdapter | null = null;
export const registerFileSystemAdapter = (a: FileSystemAdapter) => { adapter = a; };
export const fileOpen = async (opts) => adapter ? adapter.open(opts) : legacyFileOpen(opts);
export const fileSave = async (blob, opts) => adapter ? adapter.save(blob, opts) : legacyFileSave(blob, opts);
```

Key properties:

- The existing `browser-fs-access` implementations remain as private `legacyFileOpen`/`legacyFileSave` — **zero behavior change when no adapter is registered**, asserted by the full upstream Vitest suite staying green.
- Existing call-site signatures (`data/json.ts`, `data/index.ts`, image-file open in `components/App.tsx`) do not change at all.
- The Electron adapter (`packages/desktop/src/renderer/fs-adapter.ts`, task D-20) maps `MIME_TYPES`-derived extension filters to native `FileFilter`s, reconstructs `File` objects (correct `name`/`type`/`lastModified`) from `bridge.fs.readPath` byte payloads, and attaches desktop handle metadata via a `WeakMap<File, HandleMeta>` to satisfy the `loadFromBlob → fileHandle` flows.

### 5.5 `DesktopFileHandle` — duck-typing for `appState.fileHandle`

The adapter returns a handle-shaped object — `{ kind: "file", name, isFile: true, isDesktopHandle: true, token }` — that satisfies every upstream consumer of `appState.fileHandle` *structurally*, without editing `types.ts`:

- The truthiness gate in `actionSaveToActiveFile` (L261 `!!appState.fileHandle`) passes, enabling Ctrl+S.
- Re-save flows (`saveAsJSON(…, fileHandle)`) hand the handle back to `fileSave`; the adapter intercepts, sees `token`, and the main process writes through the registered path — **silent overwrite, no dialog** (true desktop Save semantics).
- `isImageFileHandle()` branching for image-export-then-resave flows never calls `getFile()` on desktop handles (the adapter intercepts first) — asserted in code comments and tests (D-22).
- Token→path mappings live only in main-process memory; cross-session persistence comes from the recent-files store (D-28), and re-issued handles per session are by design (a new session re-binds via open/save/open-with).

### 5.6 Desktop boot sequence & PWA suppression

Packaged-mode boot order (desktop):

1. Main process: privileged-scheme registration → single-instance lock → `createMainWindow()` → protocol handler serving `resources/webapp`.
2. Preload exposes `window.excalidrawDesktop` (CJS bundle — sandboxed renderers require CommonJS preloads).
3. Renderer entry (`excalidraw-app/index.tsx`, sanctioned diff): `registerSW()` is runtime-guarded (`if (!window.excalidrawDesktop?.isDesktop)`) and a guarded dynamic import pulls in `excalidraw-app/desktop/bootstrap.ts` **only** in desktop.
4. Bootstrap (before first paint): sets `window.EXCALIDRAW_EXPORT_SOURCE = "https://excalidraw.com"`, registers the Electron filesystem adapter, installs the menu-command listener, the document-state (dirty/name) reporter, and the confirm-close handler.

The service worker is suppressed at **two layers** by design: build-time (`VitePWA` reconfigured with `injectRegister: null` in the `desktop` Vite mode, D-14) and run-time (the `isDesktop` guard, D-15). Rationale: a Workbox SW inside Electron would cache `app://` assets outside the toolchain's control, fight protocol-based loading, and complicate CSP — while delivering no offline benefit (the app is already local).

### 5.7 Security architecture

The security posture is deny-by-default and checklist-verified (D-40):

- **Renderer containment:** `contextIsolation` + `sandbox` on all webContents; no Node globals in the page (`typeof require === "undefined"` verified).
- **Navigation control:** `setWindowOpenHandler` allows only https URLs to open externally via `bridge.openExternal` (allowlist enforced in main, never `file:`/`javascript:`); `will-navigate` denied off-origin; permission requests denied except `clipboard-sanitized-write` and `fullscreen`.
- **Transport:** CSP injected on all `app://` responses (`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; …; connect-src 'self' https: wss:`); no SW carve-outs needed since no SW exists.
- **IPC hygiene:** every channel validates input shape (filter objects, path strings); UNC/device-path oddities rejected in v1.0 and documented as backlog hardening; tokens are opaque and main-resolved.
- **Protocol serving:** normalize + prefix-check path resolution rejects traversal.

---

## 6. Integration Strategy & Rationale

### 6.1 Chosen strategy: fork + new workspace, source-level integration

Fork `excalidraw/excalidraw`; pin the baseline commit; create the long-lived integration branch `desktop-v1`; add `packages/desktop` as a private workspace. The desktop app consumes the **application source** (`excalidraw-app`) through the monorepo's existing source-level aliases. Benefits that follow from this shape:

- **Rendering and behavioral parity by construction** — the same Chromium engine (current-stable Electron at kickoff, floor ≥ 38) and the same React/Vite stack as excalidraw.com; no re-implementation, no URL coupling.
- **Deep-import legitimacy** — aliases make internal modules (`actions/actionExport`, `data/filesystem`) addressable from desktop code, which is what enables menu commands to dispatch real upstream actions and the adapter to slot into the seam.
- **Test-suite continuity** — the upstream Vitest suite runs unmodified and acts as the regression oracle for every desktop change (global DoD gate in `TaskList.md` §0.2).
- **Upstream sync feasibility** — the tiny diff surface (§6.3) keeps monthly rebases onto upstream tags tractable.

### 6.2 Alternatives rejected

| Alternative | Why rejected |
|---|---|
| URL wrapper (official deprecated `excalidraw-desktop`, community forks) | Cannot intercept file dialogs, cannot bind file types with local round-trip, no control over SW/updates, coupled to site deployment — structurally fails the v1.0 feature scope. |
| npm-package embedding (`@excalidraw/excalidraw` + custom app) | Would discard the application tier (`excalidraw-app`): scene bootstrap, persistence wiring, menus, share links, library UI would all need re-implementation — a fork of the app layer by other means, with more drift risk. |
| Tauri (Rust shell, system WebView) | Smaller binaries, but WebView2 ≠ Chrome-exact rendering; the File System Access surface differs; Rust boundary complicates the adapter seam; violates the rendering-parity constraint. |
| Patchless runtime monkey-patching (override `fileOpen`/`fileSave` at runtime from preload) | Fragile against upstream refactors, invisible to typecheck, untestable by the upstream suite — violates the diff-surface discipline. |

### 6.3 The diff-surface budget

Upstream code under `packages/*` and `excalidraw-app/*` is a **shared asset with upstream**. Exactly seven files may be modified, each only in the way its referencing task prescribes:

| File | Sanctioned modification | Task |
|---|---|---|
| `packages/excalidraw/data/filesystem.ts` | Introduce injectable `FileSystemAdapter` seam, default behavior unchanged | D-19 |
| `packages/excalidraw/index.tsx` | Re-export `registerFileSystemAdapter` + adapter types | D-19 |
| `excalidraw-app/index.tsx` | Runtime-guard `registerSW()`; conditional desktop bootstrap import | D-15, D-16 |
| `excalidraw-app/vite.config.mts` | Mode-aware plugin config (desktop mode) | D-14 |
| `excalidraw-app/App.tsx` | Minimal `IS_DESKTOP`-gated conditionals (collab UI toggle, Plus UI gating) | D-17 |
| `excalidraw-app/components/AppMainMenu.tsx` | Mount desktop menu-command handler | D-25 |
| `excalidraw-app/app_constants.ts` | Add desktop-only storage key constant | D-28 |

Anything else requires a new desktop-owned module (`excalidraw-app/desktop/**`, `packages/desktop/**`). New files are unrestricted. This table doubles as the **rebase conflict checklist** during upstream syncs. Root-level files (`package.json`, `vitest.config.mts`, `.env.desktop`, `.github/workflows/*`) are unrestricted but tracked in the sync checklist (§6.4) because upstream touches root configs too.

### 6.4 Upstream sync policy

Keep the `upstream` remote; rebase `desktop-v1` monthly or on security-relevant releases; pin the fork to upstream **release tags**, never `@master`. The pinned commit and procedure are recorded in `packages/desktop/UPSTREAM.md` (created in D-01). Because the seam was designed as an *injection point with an unchanged default path*, the most likely upstream refactors (call-site changes in `data/json.ts`, `actionExport.tsx`) do not touch the seam itself — the expected rebase friction is concentrated in the seven sanctioned files.

---
## 7. Delivery Plan — Mapping to TaskList.md

### 7.1 Phase intent (what each phase *means*)

`TaskList.md` §1 defines 40 tasks; the table below captures the *intent* of each phase — the question it answers — so the executor understands milestones as capability gates, not just task groups.

| Phase | Tasks | Question answered | Exit capability |
|---|---|---|---|
| **0 — Fork baseline & hygiene** | D-01…D-05 | "Is our fork healthy and provably green before we touch anything?" | Pinned fork, remotes, recorded baseline test results, CI on `desktop-v1`, dev docs skeleton |
| **1 — Desktop workspace & Electron shell** | D-06…D-13 | "Can Electron boot the editor at all?" | `packages/desktop` workspace, esbuild→CJS pipeline, secure `BrowserWindow`, single-instance, `app://` protocol, preload bridge, window chrome, nav hardening, HMR dev loop (`yarn desktop:dev`) |
| **2 — Renderer integration & boot-time wiring** | D-14…D-18 | "Does the app behave desktop-native (no PWA, gated cloud UI) and stay web-build-compatible?" | `.env.desktop` + mode-aware Vite config, SW suppression (build+runtime), desktop bootstrap module, Plus/collab UI gating, offline-asset audit |
| **3 — Native file I/O (core feature work)** | D-19…D-29 | "Do all file flows behave like a real desktop app?" | Adapter seam (D-19), Electron adapter (D-20), main-process fs IPC + token registry + jump list (D-21), silent-save handles (D-22), boot wiring (D-23), native menu (D-24) → ActionManager dispatch (D-25), open-with/associations (D-26), dirty close-guard (D-27), recent files (D-28), export/library flow verification (D-29) |
| **4 — Windows packaging & distribution** | D-30…D-35 | "Can CI produce an installable Windows app?" | electron-builder NSIS (per-user) config, icon pipeline, `.excalidraw`/`.excalidrawlib` associations, one-command build graph (`yarn desktop:dist`), signing scaffolding (unsigned default), tag-driven release workflow |
| **5 — QA, performance & security hardening** | D-36…D-40 | "Is it release-worthy?" | Unit suites for desktop pure logic (≥ 85% coverage target), Playwright `_electron` e2e, packaged smoke matrix on Win10/Win11, perf budgets (TTI ≤ 3.0 s, idle heap ≤ 500 MB), security checklist with evidence |

### 7.2 Milestone gates (M1–M6)

| Milestone | Tasks | Exit gate |
|---|---|---|
| **M1 — Fork is healthy** | D-01…D-05 | Baseline suite green in CI on `desktop-v1` |
| **M2 — Electron shell boots** | D-06…D-13 | Editor renders in Electron window via `app://` with HMR dev loop |
| **M3 — Desktop-ized build** | D-14…D-18 | No SW, gated cloud UI, offline-capable boot |
| **M4 — Native file I/O complete** | D-19…D-29 | All file flows native; associations open scenes; close-guard solid |
| **M5 — Distributable v1.0** | D-30…D-35 | Signed-or-unsigned NSIS installer produced by CI |
| **M6 — Release gate** | D-36…D-40 | Tests, smoke matrix, perf budgets, security checklist all pass |

### 7.3 The execution contract (what binds every task)

- **Ordering:** tasks execute in numeric order within a phase; phases in order 0 → 5; a task starts only when every task in its `Depends` field has passed its acceptance criteria.
- **Global Definition of Done per task:** task ACs pass **and** `yarn test:typecheck` exits 0 **and** `yarn test:code` exits 0 (ESLint, `--max-warnings=0`) **and** `yarn test:app --watch=false` exits 0 (Vitest — the regression oracle) **and** the change is committed as `feat(desktop): D-NN <slug>` (or `fix`/`chore`/`refactor`).
- **Diff-surface budget** (§6.3) caps which upstream files may change and how.
- **Task anatomy:** every task carries `Depends`, `Est` (**S** ≤ ½ day, **M** ≤ 1–2 days, **L** ≥ 3 days of focused agent time), a `Do` section with target paths and commands, and checkbox `AC`s used verbatim as the verification script.

### 7.4 Critical path & risk concentration

The dependency graph in `TaskList.md` §4 shows two long poles:

- **The shell pole:** D-06 → D-07 → D-08 → D-09/D-10 → (D-16, D-20) → D-23/D-25 → D-26/D-27 — i.e. workspace → build pipeline → window → protocol/bridge → bootstrap/adapter → native file UX. Phase 3 (M4) is the largest capability block and contains two of the plan's three **L-estimated** tasks (D-20, D-21; the third, D-37, lands in Phase 5).
- **The packaging pole:** D-30 (needs D-09+D-14) → D-31/D-32 → D-33 → D-34/D-35 — mostly deterministic config work once the shell exists.

QA tasks fan in: D-36 (D-20+D-21+D-26), D-37 (D-23+D-25), D-38/D-39 (D-33), D-40 (D-12+D-21+D-33). Nothing in Phase 5 blocks M5's installer; it blocks *release*.

---

## 8. Architectural Decision Digest

| # | Decision | Chosen | Primary rationale | Rejected alternative(s) |
|---|---|---|---|---|
| 1 | Shell framework | **Current-stable Electron at kickoff (pinned exact at D-06; floor ≥ 38)** | Chromium parity with excalidraw.com → rendering/behavior identical; upstream suite remains meaningful | Tauri (WebView2 divergence), URL wrapper (structural ceiling), stale Electron pins (Chromium drift) |
| 2 | Integration strategy | **Fork monorepo + `packages/desktop` workspace** | Source-level aliases enable deep imports; app tier reused; suite continuity; feasible upstream syncs | npm-package embedding (re-implements app tier); URL wrapping |
| 3 | Serving model | **`app://` privileged custom protocol** | Real origin for localStorage/IndexedDB/fetch/hash routing; no ports/firewalls; no `file://` origin breakage | `file://` (opaque origin), localhost HTTP (ports, firewall, surface area) |
| 4 | File I/O integration | **Injectable `FileSystemAdapter` seam in `data/filesystem.ts`** | All open/save/export flows funnel through one module → one seam covers everything; default path untouched → zero regression when unregistered | Runtime monkey-patching (fragile, untyped, untestable); per-call-site forks (touches too much upstream) |
| 5 | `appState.fileHandle` compatibility | **Duck-typed `DesktopFileHandle` + opaque token registry** | Enables true Save (silent overwrite via `actionSaveToActiveFile`) without editing `types.ts`; paths stay main-process-authoritative | Widening `AppState` type (drifts upstream types); passing raw paths across the bridge as authority |
| 6 | PWA/SW disposition | **Suppress at build + runtime (desktop mode only)** | SW caching fights `app://` loading and CSP; no offline benefit when app is local; web builds unaffected | Keeping SW (conflict with protocol + CSP carve-outs) |
| 7 | Renderer packaging | **Webapp unpacked under `extraResources`; Electron code in asar** | V8 code-cache friendliness, simpler protocol streaming | Everything in asar |
| 8 | Installer | **NSIS, per-user (no UAC), `fileAssociations` for `.excalidraw`/`.excalidrawlib`** | No elevation prompts; per-user file-type registration lands in `HKCU\Software\Classes`; uninstall keeps user data | MSI/per-machine (elevation friction) |
| 9 | Collab UI in v1.0 | **Off via feature flag (D-17)** | Collab links minted under `app://` origin are unusable by browser peers; flag allows opt-in after backlog hardening | Shipping collab UI on (broken links for browser peers) |
| 10 | Exported-file interoperability | **`EXCALIDRAW_EXPORT_SOURCE = "https://excalidraw.com"`** | Exported `.excalidraw` files keep upstream `source` semantics instead of `app://excalidraw` | Leaving `location.origin` (would stamp files with a non-http origin) |

---

## 9. Scope Matrix

| Capability | Disposition |
|---|---|
| Editor core (canvas, tools, text, frames, laser, stats, command palette) | **Inherited unmodified**; regression-guarded by upstream Vitest suite |
| localStorage / IndexedDB persistence | **Inherited unmodified** (lands in Electron userData dir) |
| Native open/save dialogs, `.excalidraw`/`.excalidrawlib` associations, recent files | **Built in this plan** (Phases 3–4) |
| PNG/SVG/clipboard export | Routed through adapter (D-29 verification matrix) |
| Live collaboration, share links, library backend, AI/TTD, mermaid | Inherited as-is (network features); **collab UI off (D-17)** and **share-link UI hidden (D-17)** — both link types are minted from `window.location` under `app://excalidraw` and are unusable by browser peers (verified: `data/index.ts` L163, L283–285); upload/backend machinery retained; link-rewrite epic = backlog item 2 |
| PWA / service worker / share_target | **Removed for desktop builds** (D-14/D-15) |
| Sentry, tracking | Disabled (D-14/D-17) |
| Auto-update, tray, `excalidraw://` deep links, multi-window | **Out of scope** — backlog §4 items 1, 3, 4, 5 |
| macOS / Linux | **Out of scope** — backlog item 7 (architecture is cross-platform-ready: bridge carries `platform` field) |
| Code signing | Scaffolding only (D-34); real cert purchase is a business decision |

---

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation (embedded in plan) |
|---|---|---|---|---|
| R1 | Upstream drift breaks the fork during sync | Medium | High | Diff-surface budget (7 files); pin to release tags; monthly rebase with §0.3 table as conflict checklist; seam designed as injection point so default path survives refactors |
| R2 | `DesktopFileHandle` duck-typing breaks an upstream consumer | Low | High | D-22 enumerates every consumer (truthiness gate, `isImageFileHandle`, re-save); conformance tests in D-36; structural typing preferred over touching `types.ts` |
| R3 | Menu accelerators collide with in-canvas shortcut bindings (Ctrl+S/O double-handling) | Medium | Medium | D-24 AC explicitly requires single-dispatch resolution and collision verification |
| R4 | `app://` origin breaks network features (share links, collab) in subtle ways | Medium | Medium | Collab UI off and share-link UI hidden by default (D-17); export-source override (D-16); minted-link limitation documented with code anchors in scope matrix; backlog epic for link rewriting |
| R5 | Service worker / stale caches corrupt `app://` loading | Low | High | SW suppressed at build (D-14) and runtime (D-15); D-18 audits for runtime CDN fetches; D-40 CSP verified |
| R6 | Adapter refactor regresses web file flows | Low | High | D-19 requires zero behavior change with adapter unregistered; full Vitest suite is a per-task DoD gate |
| R7 | Persistence durability across relaunch/uninstall | Low | Medium | D-37 relaunch persistence e2e; D-38 smoke matrix includes kill/relaunch and uninstall-retention (`deleteAppDataOnUninstall: false`) rows |
| R8 | Unsigned installer blocked by SmartScreen → adoption friction | High | Medium | D-34 signing scaffolding (env-driven), `docs/signing.md` with cert options; documented caveat for unsigned v1.0 |
| R9 | Path traversal / IPC injection via protocol or file channels | Low | High | D-09 traversal probe as AC; D-40 checklist (CSP, permission handler, allowlisted `openExternal`, IPC input validation) |
| R10 | Performance regression vs web (protocol streaming, bridge overhead) | Low | Medium | D-39 budgets: TTI ≤ 3.0 s, idle heap ≤ 500 MB, pan/zoom frame check on 1k-element scene; >25% regression opens a perf issue |
| R11 | Packaging requires Windows host, slows iteration | Medium | Low | `windows-latest` CI runners for release (D-35); `--dir` unpacked builds for fast local verification; ubuntu e2e via xvfb (D-37) |
| R12 | Multi-window future requires persistence partitioning (localStorage key collisions) | Certain (if built) | Medium | Explicitly out of v1.0 (backlog item 5) with a design-doc requirement attached |

---

## 11. Open Questions Carried Into Execution

`TaskList.md` §3 records five open questions, each with a **default the tasks already assume** — execution proceeds on defaults unless a stakeholder overrides:

| # | Question | Default assumed by tasks |
|---|---|---|
| 1 | Product name: "Excalidraw" vs a distinct fork name? | `Excalidraw` (config-only change later if renamed) |
| 2 | Upstream cloud services vs self-hosting? | Keep upstream endpoints; self-hosting is a backlog epic |
| 3 | Collab UI default in desktop? | **Off** (D-17 flag); flips with collab hardening epic |
| 4 | Ctrl+S on associated documents: silent overwrite vs always Save-As? | Silent overwrite through handle token (true desktop behavior; D-22/D-26) |
| 5 | Webapp inside `app.asar` or unpacked? | Unpacked under `extraResources` (D-30) for code-cache + streaming simplicity |

---

## 12. Glossary

| Term | Meaning in this project |
|---|---|
| **`appState.fileHandle`** | Upstream state field (typed `FileSystemFileHandle \| null`) representing the currently bound document; drives the Save vs Save-As distinction. The desktop adapter satisfies it with a duck-typed handle. |
| **browser-fs-access** | Upstream dependency abstracting the File System Access API (FSA) with legacy `<input>`/`<a download>` fallbacks; wrapped by `data/filesystem.ts`. |
| **FSA (File System Access API)** | Chromium API (`showOpenFilePicker`/`showSaveFilePicker`) unavailable in Electron — the root cause of the adapter-seam design. |
| **`app://` privileged protocol** | Custom standard+secure scheme serving the built webapp; registered before `app.whenReady()`; gives the renderer a real origin. |
| **DesktopBridge** | The frozen IPC contract exposed on `window.excalidrawDesktop` via `contextBridge`; single source of truth in `bridge-contract.ts`. |
| **HandleRegistry / token** | Main-process, in-memory `Map<token, path>` (16-byte hex tokens) that lets the renderer re-save silently without ever owning path authority. |
| **Diff-surface budget** | The whitelist of seven upstream files allowed to change; everything else must be new desktop-owned modules. |
| **Regression oracle** | The upstream Vitest suite (`yarn test:app`), which must stay green after every task — the project's primary safety net. |
| **Vite mode (`--mode desktop`)** | Build mode activating `.env.desktop` + mode-aware plugin config (PWA off, sitemap off) without touching web builds. |
| **Workbox / `registerSW()`** | Service-worker machinery from `vite-plugin-pwa`; suppressed in desktop at build (`injectRegister: null`) and runtime (`isDesktop` guard). |
| **`EXCALIDRAW_EXPORT_SOURCE`** | Global override for the `source` field stamped into exported files (`getExportSource()`); set to `https://excalidraw.com` for interoperability. |
| **asar** | Electron archive format; used only for Electron code in this project — the webapp ships unpacked via `extraResources`. |
| **NSIS (per-user)** | Windows installer technology configured by electron-builder; `perMachine: false` → installs without UAC elevation. |
| **`fileAssociations`** | electron-builder Windows feature registering `.excalidraw`/`.excalidrawlib` in `HKCU\Software\Classes` with icons and MIME types. |
| **Jump list / `app.addRecentDocument`** | Windows shell feature listing recently opened documents on the taskbar icon; fed on every successful open/save. |
| **`second-instance` / single-instance lock** | Electron pattern: the second launch forwards its argv (e.g. a double-clicked file path) to the running window instead of spawning a new process. |
| **`will-prevent-unload`** | Chromium event fired when a page blocks unload; desktop routes it into the native dirty-close negotiation (Save/Discard/Cancel). |
| **LRU recents** | Recent-files store: max 10 entries, least-recently-used eviction, dedupe by path, stored in `localStorage["excalidraw-desktop-recentFiles"]`. |
| **TTI** | Time-to-interactive — first performance budget metric (≤ 3.0 s cold start → interactive canvas). |
| **Excalidraw+** | The commercial SaaS tier upstream integrates with; its promo/export UI is hidden in desktop builds (D-17). |
| **idb-keyval** | Minimal IndexedDB wrapper used upstream for the `files-db` binary store and library DB. |
| **Duck typing** | Satisfying an interface structurally (right shape/behavior) without nominal type inheritance — how `DesktopFileHandle` passes upstream checks without touching `types.ts`. |

---

## 13. Traceability Matrix

Mapping from this document's comprehension sections to the tasks in `TaskList.md` §1 — use it to jump from "understanding" to "verification":

| Understanding section | Facts / decisions it explains | Verified or implemented by tasks |
|---|---|---|
| §4.2 Monorepo topology, source aliases | Workspace roles; deep-import legality | D-01, D-06 |
| §4.3 Build & toolchain | Vite/plugins/fonts/gates | D-02, D-04, D-14 |
| §4.4 Bootstrap & scene resolution | Hash routing, export-source override, save pausing | D-16, D-25, D-26 |
| §4.5 Persistence model | localStorage/IndexedDB keys; userData migration-free | D-11, D-37, D-38 |
| §4.6 File-I/O seam | Call graph; `appState.fileHandle` semantics | D-19, D-20, D-21, D-22 |
| §4.7 Env & external services | Disposition table; tracking/PWA/Sentry switches | D-14, D-17, D-18 |
| §4.8 File-format registry | MIME types; filters/associations/argv whitelist source | D-20, D-26, D-32 |
| §5.1 Process model | Window flags, IPC surface, main-owned OS duties | D-08, D-10, D-21 |
| §5.2 `app://` protocol | Privileges, traversal hardening, dev/packaged branching | D-09, D-30, D-40 |
| §5.3 Bridge contract | Frozen interface, cancel semantics, tokens | D-10, D-36 |
| §5.4 Adapter seam | Behavior-preserving default; File reconstruction | D-19, D-20, D-23 |
| §5.5 `DesktopFileHandle` | Silent-save flows; `isImageFileHandle` safety | D-22, D-26, D-29 |
| §5.6 Boot sequence & PWA suppression | Two-layer suppression; bootstrap ordering | D-14, D-15, D-16, D-23 |
| §5.7 Security architecture | CSP, permissions, allowlists, IPC validation | D-12, D-40 |
| §6 Integration strategy | Fork rationale; alternatives; sync policy | D-01, D-03 |
| §7 Delivery plan | Phase intents; milestones; critical path | All (§1 of TaskList.md) |
| §9/§10/§11 Scope, risks, open questions | Backlog boundaries; mitigations; defaults | D-17 (collab), D-34 (signing), D-38 (smoke), backlog §2 |

**Reading order recommendation for the executing agent:** TaskList.md §0 (execution contract) → this document §4 → §5 → then execute tasks in order, returning to §13 whenever a task's motivation needs a refresher.

---

**Verification note:** all §4 source-architecture claims were independently verified by direct source inspection at the pinned baseline (`ed10ac7d`) — including exact line numbers (L253/L329/L393 in `actionExport.tsx`, L354 in `common/src/constants.ts`, L379/L1012/L1086 in `excalidraw-app/App.tsx`, L163/L283–285 in `data/index.ts`) — and the baseline was executed: `yarn install` clean, `yarn test:typecheck` green, `yarn test:app` 2,448 tests / 0 failures, `yarn build:app` green (47 MB artifact).
