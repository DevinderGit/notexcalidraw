import { shell, session } from "electron";

import { APP_HOST, APP_SCHEME } from "./protocol";

import type { BrowserWindow } from "electron";

/**
 * Navigation and window-open hardening (PU §5.7).
 *
 * The renderer runs a full Excalidraw editor, which renders user-supplied
 * hyperlinks on canvas elements. Without a policy, a click on one of those
 * could open a new Electron window — with the preload bridge attached — or
 * navigate the app away from its own origin. Both are closed off here.
 */

/** Only HTTPS links may be handed to the operating system. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:"]);

/** The only capabilities the renderer may request. */
const ALLOWED_PERMISSIONS = new Set([
  "clipboard-sanitized-write",
  "fullscreen",
]);

/**
 * Whether a capability request is allowed.
 *
 * Exported so the policy can be asserted directly by the unit tests (D-36)
 * rather than only through the session handler.
 */
export const isPermissionAllowed = (permission: string): boolean =>
  ALLOWED_PERMISSIONS.has(permission);

/**
 * Whether a URL may be opened in the operating system's browser.
 *
 * The allowlist is enforced in the main process, never in the renderer: the
 * renderer can only ask, the main process decides.
 */
export const isAllowedExternalUrl = (url: string): boolean => {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * Whether a URL belongs to the app itself.
 *
 * In a packaged build that is the `app://excalidraw` origin. In development it
 * is the Vite dev server's origin, so hot reload keeps working.
 */
export const isAppOrigin = (url: string): boolean => {
  let target: URL;

  try {
    target = new URL(url);
  } catch {
    return false;
  }

  if (target.protocol === `${APP_SCHEME}:`) {
    return target.hostname === APP_HOST;
  }

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (devServerUrl) {
    try {
      return target.origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Opens a URL in the operating system's browser, if the policy allows it.
 *
 * Returns whether the URL was handed off.
 */
export const openExternalUrl = async (url: string): Promise<boolean> => {
  if (!isAllowedExternalUrl(url)) {
    return false;
  }

  await shell.openExternal(url);

  return true;
};

/**
 * Applies the navigation policy to a window.
 *
 *   - `window.open()` never creates a window. Allowed HTTPS links are handed
 *     to the operating system instead.
 *   - `will-navigate` is denied for anything that is not the app's own origin.
 */
export const applyNavigationHardening = (win: BrowserWindow): void => {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void openExternalUrl(url);
    }

    // Never allow a new Electron window, whatever the URL.
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppOrigin(url)) {
      event.preventDefault();
    }
  });
};

/**
 * Denies every capability request the renderer does not explicitly need.
 */
export const applyPermissionPolicy = (): void => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(isPermissionAllowed(permission));
    },
  );
};
