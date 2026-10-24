import path from "path";

import { app, BrowserWindow } from "electron";

/**
 * Placeholder window for the D-07 build-pipeline smoke test.
 *
 * D-08 replaces this with `createMainWindow()` in `windows.ts`, which owns the
 * full security posture (`contextIsolation`, `sandbox`, `nodeIntegration`) and
 * the single-instance lock. Nothing here is load-bearing.
 *
 * The window is shown immediately rather than on `ready-to-show`: there is no
 * page to load yet, so no first paint would ever arrive and the event would
 * never fire. D-08 restores the `show: false` + `ready-to-show` pattern once
 * the window actually loads content.
 */
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.once("ready-to-show", () => {
    console.info("[desktop] main window ready to show");
  });

  console.info("[desktop] main window created");
};

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
