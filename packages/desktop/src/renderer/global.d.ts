import type { DesktopBridge } from "../shared/bridge-contract";

declare global {
  interface Window {
    /**
     * The desktop bridge, exposed by the preload script via `contextBridge`.
     *
     * It only exists in a desktop build. Web builds have no preload, so guard
     * every access — `window.excalidrawDesktop?.isDesktop` — unless the
     * desktop bootstrap has already established that this is a desktop run
     * (D-16's `IS_DESKTOP` flag).
     */
    excalidrawDesktop: DesktopBridge;
  }
}

export {};
