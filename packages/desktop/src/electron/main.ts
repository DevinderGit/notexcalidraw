/**
 * Electron main process.
 *
 * `process.argv` contract — consumed by **D-26** (open-with / file associations):
 *
 *   - **Packaged** (`app.isPackaged === true`): `argv[0]` is the path of the
 *     installed executable. Any file to open follows it, possibly after
 *     Chromium or app flags.
 *   - **Development** (`electron . <file>`): `argv[0]` is the Electron binary
 *     and `argv[1]` is the app directory (`.`); file paths to open follow.
 *
 * D-26 adds `collectFilesFromArgv()` to filter the arguments down to the
 * supported extensions (PU §4.8), and forwards them to the already-running
 * instance through the `second-instance` event.
 */
import { app, BrowserWindow } from "electron";

import {
  registerAppProtocol,
  registerAppSchemePrivileges,
  resolveWebappRoot,
} from "./protocol";
import { registerAppIpcHandlers } from "./ipc/app";
import { createMainWindow } from "./windows";

// Chromium reads the privileged-scheme list while the browser process starts
// up, so this has to happen at module top level — before `app.whenReady()`.
// A late registration would be silently ignored and `app://` would not be a
// standard, secure origin.
registerAppSchemePrivileges();

/**
 * Only one instance of the app may run at a time. A second launch focuses the
 * existing window instead of starting a second copy. D-26 additionally
 * forwards the second launch's file arguments to the running window.
 */
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();

    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }

      win.focus();
    }
  });

  app.whenReady().then(() => {
    // `protocol.handle` is only available once the browser process is up.
    registerAppProtocol(resolveWebappRoot());
    registerAppIpcHandlers();
    createMainWindow();
  });

  app.on("window-all-closed", () => {
    // v1.0 has no macOS menu-bar residency: closing the last window quits.
    app.quit();
  });
}
