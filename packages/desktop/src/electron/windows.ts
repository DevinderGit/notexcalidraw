import fs from "node:fs";
import path from "node:path";

import { app, BrowserWindow, screen } from "electron";

import { APP_ORIGIN } from "./protocol";

/**
 * Dev server URL, set by `yarn desktop:dev` (D-13).
 *
 * When it is absent the renderer is served from the `app://` protocol, which
 * is what a packaged build does.
 */
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;

/** Where the window geometry is persisted, inside the Electron userData dir. */
const WINDOW_STATE_FILE = "window-state.json";

interface SavedBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const windowStatePath = (): string =>
  path.join(app.getPath("userData"), WINDOW_STATE_FILE);

const readSavedBounds = (): SavedBounds | null => {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(windowStatePath(), "utf8"),
    ) as SavedBounds;

    if (
      typeof parsed?.width !== "number" ||
      typeof parsed?.height !== "number" ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.height)
    ) {
      return null;
    }

    return parsed;
  } catch {
    // No saved state yet, or it is unreadable — fall back to the defaults.
    return null;
  }
};

const writeSavedBounds = (win: BrowserWindow): void => {
  try {
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify(win.getBounds()),
      "utf8",
    );
  } catch {
    // Persisting the geometry is best-effort; never block the close on it.
  }
};

/**
 * Whether the given bounds would land on a connected display.
 *
 * A window restored onto a monitor that has since been unplugged would be
 * invisible, so those bounds are discarded in favour of the default size.
 */
const isOnScreen = (bounds: Required<SavedBounds>): boolean => {
  const { workArea } = screen.getDisplayMatching(bounds);

  return (
    bounds.x + bounds.width > workArea.x &&
    bounds.x < workArea.x + workArea.width &&
    bounds.y + bounds.height > workArea.y &&
    bounds.y < workArea.y + workArea.height
  );
};

/**
 * Reflects the renderer's document state in the window title.
 *
 * A dirty document is marked with a leading bullet, so unsaved changes are
 * visible even when the app is not focused.
 */
export const applyDocumentState = (
  win: BrowserWindow,
  state: { name: string | null; dirty: boolean },
): void => {
  const name = state.name;

  win.setTitle(
    name ? `${state.dirty ? "• " : ""}${name} — Excalidraw` : "Excalidraw",
  );
};

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
  const saved = readSavedBounds();
  const restore =
    saved &&
    typeof saved.x === "number" &&
    typeof saved.y === "number" &&
    isOnScreen({
      x: saved.x,
      y: saved.y,
      width: saved.width,
      height: saved.height,
    });

  const win = new BrowserWindow({
    width: restore ? saved.width : DEFAULT_WIDTH,
    height: restore ? saved.height : DEFAULT_HEIGHT,
    ...(restore ? { x: saved.x, y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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

  // Remember the geometry for the next launch.
  win.on("close", () => {
    writeSavedBounds(win);
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
