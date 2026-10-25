import type { DesktopBridge } from "../shared/bridge-contract";

declare global {
  interface Window {
    /**
     * The desktop bridge, exposed by the preload script via `contextBridge`.
     *
     * It only exists in a desktop build — web builds have no preload, so the
     * property is `undefined` there. Always guard the access:
     * `window.excalidrawDesktop?.isDesktop`.
     */
    excalidrawDesktop?: DesktopBridge;
  }
}

export {};
