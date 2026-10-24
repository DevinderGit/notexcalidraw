/**
 * Preload script.
 *
 * D-10 implements the frozen `DesktopBridge` contract (PU §5.3) here and exposes
 * it with `contextBridge.exposeInMainWorld("excalidrawDesktop", ...)`.
 *
 * The preload is bundled to **CommonJS** on purpose: a sandboxed renderer
 * requires a CommonJS preload script. D-08 turns on `sandbox: true`.
 */
export {};
