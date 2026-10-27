/**
 * Desktop-mode flag for the renderer.
 *
 * The preload script exposes the bridge only inside the Electron shell, so this
 * is `false` in a web build and `true` in the desktop app. Every web-only
 * feature is gated on it.
 */
export const IS_DESKTOP = !!window.excalidrawDesktop?.isDesktop;
