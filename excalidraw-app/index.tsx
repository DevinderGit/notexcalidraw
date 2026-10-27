import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";

// The desktop shell's bootstrap. Guarded so a web build never loads it — Vite
// splits it into its own chunk, which the web bundle simply never fetches.
if (window.excalidrawDesktop?.isDesktop) {
  void import("./desktop/bootstrap");
}

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

// The desktop app is already local: a service worker would cache assets outside
// the toolchain's control, fight the `app://` protocol loading, and complicate
// the CSP (PU 5.6). The web build keeps registering it (D-15).
//
// The static import above stays: the PWA plugin is still configured in desktop
// mode (with `injectRegister: null` and `disable: true`), so the
// `virtual:pwa-register` module still resolves.
if (!window.excalidrawDesktop?.isDesktop) {
  registerSW();
}

root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
