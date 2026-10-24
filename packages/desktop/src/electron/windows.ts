import path from "path";

import { BrowserWindow } from "electron";

import { APP_ORIGIN } from "./protocol";

/**
 * Dev server URL, set by `yarn desktop:dev` (D-13).
 *
 * When it is absent the renderer is served from the `app://` protocol, which
 * is what a packaged build does.
 */
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

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

  // Dev mode serves the Vite dev server (hot module replacement); packaged
  // mode serves the built webapp over the privileged `app://` scheme.
  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  return win;
};
