import { ipcMain, nativeTheme, BrowserWindow } from "electron";

import { applyDocumentState } from "../windows";

import type { DesktopTheme } from "../../shared/bridge-contract";

/**
 * App-level IPC handlers — the ones that drive the native chrome rather than
 * the file system (the `desktop:fs:*` family lands in D-21).
 */

/**
 * Applies the renderer's document state to the window title.
 *
 * The dirty state is reported by the renderer (D-25) and is reflected with a
 * leading bullet, so the user can see there are unsaved changes.
 */
export const applyTheme = (theme: unknown): void => {
  const value: DesktopTheme =
    theme === "dark" || theme === "light" || theme === "system"
      ? theme
      : "system";

  nativeTheme.themeSource = value;
};

export const registerAppIpcHandlers = (): void => {
  ipcMain.handle("desktop:app:documentState", (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    if (!win) {
      return;
    }

    applyDocumentState(win, {
      name: typeof state?.name === "string" ? state.name : null,
      dirty: state?.dirty === true,
    });
  });

  ipcMain.handle("desktop:app:theme", (_event, theme) => {
    applyTheme(theme);
  });
};
