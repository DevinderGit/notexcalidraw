/**
 * Desktop bootstrap.
 *
 * This module is loaded **only inside the Electron shell**: `index.tsx` guards the
 * dynamic import with `window.excalidrawDesktop?.isDesktop`. In a web build the
 * import never runs, and Vite keeps the module in a separate chunk that is never
 * fetched — so the web bundle's critical path is unchanged.
 */

/**
 * The `source` written into exported `.excalidraw` files.
 *
 * Excalidraw stamps `window.EXCALIDRAW_EXPORT_SOURCE || window.location.origin`
 * into every export. Left alone, the desktop app would stamp its own origin
 * (`app://excalidraw`), which upstream consumers do not understand. Keeping the
 * upstream source makes exported files interoperable with excalidraw.com (PU §5.4).
 */
const UPSTREAM_EXPORT_SOURCE = "https://excalidraw.com";

export const bootstrapDesktop = () => {
  window.EXCALIDRAW_EXPORT_SOURCE = UPSTREAM_EXPORT_SOURCE;

  // D-23: register the Electron filesystem adapter, so every file open / save /
  // export flow goes through native dialogs. Needs D-20's
  // `createElectronFileSystemAdapter`.

  // D-25: install the native-menu command listener and the document-state
  // reporter (document name + dirty flag → the window title).

  // D-27: install the close-flow confirmation handler.
};

bootstrapDesktop();
