/**
 * The frozen `DesktopBridge` contract (PU §5.3).
 *
 * This file is the **single source of truth** for the interface between the
 * Electron main process and the renderer. It is imported by both processes:
 * the preload script implements it, and renderer-side code consumes it.
 *
 * ## Frozen
 *
 * The contract is **frozen from D-10 onward**. New capabilities are *added*,
 * never reshaped — an existing member's name, signature, or semantics do not
 * change. This is what lets renderer code rely on it without version
 * gymnastics.
 *
 * ## Transport mapping
 *
 * | Contract member | Channel |
 * | --- | --- |
 * | `fs.open` / `fs.save` / `fs.readPath` | `desktop:fs:open` / `desktop:fs:save` / `desktop:fs:readPath` (invoke) |
 * | `onMenuCommand` | `desktop:menu` (main → renderer push) |
 * | `openExternal` | `desktop:shell:openExternal` (invoke) |
 * | `setDocumentState` | `desktop:app:documentState` (invoke) |
 * | `onConfirmClose` | `desktop:app:confirmClose` (main → renderer push) + `desktop:app:confirmClose:response` (back) |
 * | `onOpenFiles` | `desktop:open-files` (main → renderer push) |
 * | `getStartupFiles` | `desktop:app:startupFiles` (invoke) |
 * | `getRecentFiles` | `desktop:menu:recent` (invoke) |
 *
 * ## Contract properties
 *
 * - **Cancel is a value, not an exception.** `open`/`save` resolving to `null`
 *   means the user cancelled; the adapter layer translates that into the benign
 *   abort-error shape upstream already treats as cancel.
 * - **Opaque tokens, not paths.** The renderer never learns absolute file paths
 *   as *authority*; it receives opaque tokens whose path mapping lives in a
 *   main-process `HandleRegistry`. Paths do cross the bridge as *data* (for
 *   recents and labels), but privileged writes always resolve through main.
 * - **Push channels are evented.** Menu commands, open-with deliveries and
 *   close negotiation are main → renderer pushes with unsubscribe functions,
 *   shaped for React `useEffect` lifecycles.
 */

/**
 * A native file dialog filter. Mirrors Electron's `dialog.FileFilter` shape,
 * but is defined here so the renderer does not depend on Electron's types.
 */
export interface FileFilter {
  /** Human-readable filter name, e.g. `"Excalidraw files"`. */
  name: string;
  /** Extensions without a leading dot, e.g. `["excalidraw"]`. */
  extensions: string[];
}

/** A file the user picked in a native open dialog. */
export interface OpenResult {
  /** Absolute path on disk. */
  path: string;
  /** File name including extension. */
  name: string;
  /** Extension without a leading dot. */
  ext: string;
  /** Last modification time, in epoch milliseconds. */
  lastModifiedMs: number;
  /** Size in bytes. */
  size: number;
}

/**
 * Opaque handle to a file the main process has write access to. The renderer
 * passes it back to `fs.save` to overwrite the file silently, without a
 * dialog. It carries no authority of its own.
 */
export type DesktopFileHandleToken = string;

/** The outcome of a native save. */
export interface SaveResult {
  /** Absolute path that was written. */
  path: string;
  /** File name including extension. */
  name: string;
  /** Token to pass back to `fs.save` for a silent overwrite. */
  token: DesktopFileHandleToken;
}

/** A recently opened document, as shown in the native Recent submenu. */
export interface DesktopRecentFile {
  path: string;
  name: string;
  ext: string;
  /** Epoch milliseconds of the last open/save. */
  ts: number;
}

/** Commands the native application menu can dispatch into the renderer. */
export type MenuCommandId =
  | "file:new"
  | "file:open"
  | "file:save"
  | "file:saveAs"
  | "file:exportImage"
  | "help:about";

/**
 * The renderer's colour theme, mirrored into the native chrome so the Windows
 * title bar matches the app (PU §5.7).
 */
export type DesktopTheme = "light" | "dark" | "system";

/**
 * The bridge exposed on `window.excalidrawDesktop`.
 */
export interface DesktopBridge {
  /** static identity */
  readonly isDesktop: true;
  readonly platform: "win32" | "darwin" | "linux";
  readonly appVersion: string;
  /** file system */
  fs: {
    open(opts: {
      filters: FileFilter[];
      multiSelections?: boolean;
    }): Promise<OpenResult[] | null>; // null = user cancelled
    save(opts: {
      contents: Uint8Array;
      filters: FileFilter[];
      defaultPath?: string;
      /** existing handle → overwrite silently (true Save) */
      token?: string;
    }): Promise<SaveResult | null>;
    readPath(path: string): Promise<{
      data: Uint8Array;
      name: string;
      lastModifiedMs: number;
    }>;
  };
  /** native menu → renderer command dispatch */
  onMenuCommand(handler: (command: MenuCommandId) => void): () => void;
  /** shell */
  openExternal(url: string): void; // main allowlists https: only
  /** window state */
  setDocumentState(state: { name: string | null; dirty: boolean }): void;
  /**
   * Mirror the renderer's colour theme into the native chrome (D-11).
   *
   * Added after the contract was frozen in D-10. PU §5.3 permits *additions* —
   * "new capabilities are added, never reshaped" — and no existing member is
   * changed by this one.
   */
  setTheme(theme: DesktopTheme): void;
  /** close-flow negotiation (D-27) */
  onConfirmClose(
    handler: () => Promise<"save" | "discard" | "cancel">,
  ): () => void;
  /** open-with delivery, running instance: main → renderer push (second-instance argv) */
  onOpenFiles(handler: (paths: string[]) => void): () => void;
  /** open-with delivery, cold start: renderer pulls once during bootstrap (D-26) */
  getStartupFiles(): Promise<string[]>;
  /** main pulls in-app recents when rebuilding the native Recent submenu (D-24/D-28) */
  getRecentFiles(): Promise<DesktopRecentFile[]>;
}
