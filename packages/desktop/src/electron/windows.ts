import path from "path";

import { BrowserWindow } from "electron";

/**
 * Placeholder page shown until the `app://` protocol handler lands in D-09.
 *
 * A `data:` URL is used deliberately: it needs nothing on disk and still
 * triggers a first paint, which is exactly what `ready-to-show` waits for.
 * Without a paint the window would never become visible.
 */
const PLACEHOLDER_URL =
  "data:text/html;charset=utf-8,<title>Excalidraw</title>";

/**
 * Creates the main application window.
 *
 * Security posture (PU §5.7):
 *
 *   - `contextIsolation: true` — the page cannot reach into the preload's
 *     context; the two only meet through `contextBridge`.
 *   - `sandbox: true` — the renderer is OS-sandboxed and has no Node access.
 *     This is why the preload is bundled as CommonJS.
 *   - `nodeIntegration: false` — no Node globals in the page.
 *   - `webSecurity: true` — set explicitly so it cannot be switched off by a
 *     later edit without that edit showing up in the diff.
 *   - the `remote` module is not used; Electron removed it entirely, so the
 *     main process is the only place with Node access.
 *   - DevTools are only available when `EXCALIDRAW_DESKTOP_DEVTOOLS=1`.
 */
export const createMainWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      devTools: process.env.EXCALIDRAW_DESKTOP_DEVTOOLS === "1",
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // D-09 replaces this with the dev-server / `app://` branch.
  win.loadURL(PLACEHOLDER_URL);

  return win;
};
