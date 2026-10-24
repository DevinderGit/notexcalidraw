import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopBridge,
  DesktopRecentFile,
  DesktopTheme,
  FileFilter,
  MenuCommandId,
  OpenResult,
  SaveResult,
} from "../shared/bridge-contract";

/**
 * The application version, baked in at build time from
 * `packages/desktop/package.json`. A sandboxed preload cannot read the main
 * process's `app.getVersion()`, and a synchronous IPC round-trip just to
 * populate a static field is not worth it.
 */
declare const __APP_VERSION__: string;

const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

/* -------------------------------------------------------------------------- */
/* Input sanitisation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Everything crossing the bridge is treated as untrusted: the renderer is
 * sandboxed, but a compromised or buggy page must not be able to hand the main
 * process a malformed filter, a non-string path, or a bogus payload.
 */

const sanitizeFilters = (filters: unknown): FileFilter[] => {
  if (!Array.isArray(filters)) {
    return [];
  }

  return filters.flatMap((filter) => {
    if (typeof filter !== "object" || filter === null) {
      return [];
    }

    const { name, extensions } = filter as Partial<FileFilter>;

    if (typeof name !== "string" || name.length === 0) {
      return [];
    }

    if (!Array.isArray(extensions)) {
      return [];
    }

    const cleanExtensions = extensions.filter(
      (extension): extension is string =>
        typeof extension === "string" && extension.length > 0,
    );

    return cleanExtensions.length > 0
      ? [{ name, extensions: cleanExtensions }]
      : [];
  });
};

const sanitizePath = (value: unknown): string =>
  typeof value === "string" ? value : "";

const sanitizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const sanitizeContents = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array();
};

const sanitizeOpenResult = (value: unknown): OpenResult => {
  const result = (
    typeof value === "object" && value !== null ? value : {}
  ) as Partial<OpenResult>;

  return {
    path: sanitizePath(result.path),
    name: sanitizePath(result.name),
    ext: sanitizePath(result.ext),
    lastModifiedMs: Number(result.lastModifiedMs) || 0,
    size: Number(result.size) || 0,
  };
};

const sanitizeRecentFile = (value: unknown): DesktopRecentFile => {
  const file = (
    typeof value === "object" && value !== null ? value : {}
  ) as Partial<DesktopRecentFile>;

  return {
    path: sanitizePath(file.path),
    name: sanitizePath(file.name),
    ext: sanitizePath(file.ext),
    ts: Number(file.ts) || 0,
  };
};

/* -------------------------------------------------------------------------- */
/* The bridge                                                                  */
/* -------------------------------------------------------------------------- */

const platform = (): DesktopBridge["platform"] => {
  const current = process.platform;

  return current === "win32" || current === "darwin" || current === "linux"
    ? current
    : "linux";
};

const bridge: DesktopBridge = {
  isDesktop: true,
  platform: platform(),
  appVersion: APP_VERSION,

  fs: {
    open: async (opts) => {
      const result = await ipcRenderer.invoke("desktop:fs:open", {
        filters: sanitizeFilters(opts?.filters),
        multiSelections: opts?.multiSelections === true,
      });

      if (!Array.isArray(result)) {
        // `null` means the user cancelled the dialog.
        return null;
      }

      return result.map(sanitizeOpenResult);
    },

    save: async (opts) => {
      const result = await ipcRenderer.invoke("desktop:fs:save", {
        contents: sanitizeContents(opts?.contents),
        filters: sanitizeFilters(opts?.filters),
        defaultPath: opts?.defaultPath
          ? sanitizePath(opts.defaultPath)
          : undefined,
        token: opts?.token ? sanitizePath(opts.token) : undefined,
      });

      if (
        typeof result !== "object" ||
        result === null ||
        (result as { canceled?: unknown }).canceled === true
      ) {
        // `null` means the user cancelled the dialog.
        return null;
      }

      const saved = result as Partial<SaveResult>;

      return {
        path: sanitizePath(saved.path),
        name: sanitizePath(saved.name),
        token: sanitizePath(saved.token),
      };
    },

    readPath: async (path) => {
      const result = await ipcRenderer.invoke(
        "desktop:fs:readPath",
        sanitizePath(path),
      );

      const file = (
        typeof result === "object" && result !== null ? result : {}
      ) as { data?: unknown; name?: unknown; lastModifiedMs?: unknown };

      return {
        data: sanitizeContents(file.data),
        name: sanitizePath(file.name),
        lastModifiedMs: Number(file.lastModifiedMs) || 0,
      };
    },
  },

  onMenuCommand: (handler) => {
    const listener = (_event: unknown, command: MenuCommandId) => {
      handler(command);
    };

    ipcRenderer.on("desktop:menu", listener);

    return () => {
      ipcRenderer.removeListener("desktop:menu", listener);
    };
  },

  openExternal: (url) => {
    void ipcRenderer.invoke("desktop:shell:openExternal", sanitizePath(url));
  },

  setDocumentState: (state) => {
    void ipcRenderer.invoke("desktop:app:documentState", {
      name: state?.name === null ? null : sanitizePath(state?.name),
      dirty: state?.dirty === true,
    });
  },

  setTheme: (theme) => {
    const value: DesktopTheme =
      theme === "dark" || theme === "light" || theme === "system"
        ? theme
        : "system";

    void ipcRenderer.invoke("desktop:app:theme", value);
  },

  onConfirmClose: (handler) => {
    const listener = (_event: unknown, requestId: string) => {
      handler()
        .then((decision) => {
          ipcRenderer.send(
            "desktop:app:confirmClose:response",
            requestId,
            decision,
          );
        })
        .catch(() => {
          ipcRenderer.send(
            "desktop:app:confirmClose:response",
            requestId,
            "cancel",
          );
        });
    };

    ipcRenderer.on("desktop:app:confirmClose", listener);

    return () => {
      ipcRenderer.removeListener("desktop:app:confirmClose", listener);
    };
  },

  onOpenFiles: (handler) => {
    const listener = (_event: unknown, paths: unknown) => {
      handler(sanitizeStringArray(paths));
    };

    ipcRenderer.on("desktop:open-files", listener);

    return () => {
      ipcRenderer.removeListener("desktop:open-files", listener);
    };
  },

  getStartupFiles: async () => {
    const result = await ipcRenderer.invoke("desktop:app:startupFiles");

    return sanitizeStringArray(result);
  },

  getRecentFiles: async () => {
    const result = await ipcRenderer.invoke("desktop:menu:recent");

    return Array.isArray(result) ? result.map(sanitizeRecentFile) : [];
  },
};

contextBridge.exposeInMainWorld("excalidrawDesktop", bridge);
