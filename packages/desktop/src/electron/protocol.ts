import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, net, protocol } from "electron";

/**
 * The `app://` serving model (PU §5.2).
 *
 * The renderer is served from a privileged custom scheme rather than `file://`
 * (which breaks fetch/XHR semantics and origin-based APIs) or a bundled localhost
 * HTTP server (port collisions, firewall prompts, permanent attack surface).
 *
 * Because the scheme is registered as *standard*, the renderer gets a real
 * origin — `app://excalidraw` — so `window.location` hash state, localStorage,
 * IndexedDB and fetch all behave exactly as they do on the web.
 */

/** The custom scheme. */
export const APP_SCHEME = "app";

/** The host the app is served from. Together they form the renderer origin. */
export const APP_HOST = "excalidraw";

/** The renderer origin, e.g. `app://excalidraw`. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * Content types for the assets the webapp build emits.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const contentTypeFor = (filePath: string): string =>
  CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
  "application/octet-stream";

/**
 * Registers the `app://` scheme as privileged.
 *
 * **MUST be called before `app.whenReady()`** — Chromium reads the privileged
 * scheme list while the browser process starts up, and a late registration is
 * silently ignored. `main.ts` therefore calls this at module top level.
 */
export const registerAppSchemePrivileges = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        codeCache: true,
      },
    },
  ]);
};

/**
 * Where the built webapp lives.
 *
 * Packaged builds ship it unpacked under `resources/webapp` (D-30); in
 * development it is the Vite build output in the monorepo.
 */
export const resolveWebappRoot = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, "webapp")
    : path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "excalidraw-app",
        "build",
      );

/**
 * Maps an `app://excalidraw/...` request onto a file inside the webapp root.
 *
 * Returns `null` when the request must not be served: a foreign host, a NUL
 * byte, or a path that escapes the root. The traversal guard runs on the
 * *decoded* path, because the URL parser normalises literal `..` segments but
 * leaves percent-encoded ones (`%2e%2e%2f`) intact — those are the ones that
 * would actually escape.
 */
const resolveRequestPath = (
  webappRoot: string,
  requestUrl: string,
): string | null => {
  let url: URL;

  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.hostname !== APP_HOST) {
    return null;
  }

  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // malformed percent-encoding
    return null;
  }

  if (decodedPath.includes("\0")) {
    return null;
  }

  const root = path.resolve(webappRoot);
  const candidate = path.resolve(root, decodedPath.replace(/^[\\/]+/, ""));

  // The prefix check is the actual traversal guard: `path.resolve` has already
  // collapsed every `..` segment, so anything still outside the root escaped.
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    return null;
  }

  return candidate;
};

const textResponse = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/**
 * Registers the `app://` protocol handler.
 *
 * **MUST be called after `app.whenReady()`** — `protocol.handle` is only
 * available once the browser process is up.
 */
export const registerAppProtocol = (webappRoot: string): void => {
  protocol.handle(APP_SCHEME, async (request) => {
    const resolved = resolveRequestPath(webappRoot, request.url);

    if (!resolved) {
      return textResponse(403, "Forbidden");
    }

    // Extensionless paths fall back to the SPA entry point.
    const target = path.extname(resolved)
      ? resolved
      : path.join(path.resolve(webappRoot), "index.html");

    try {
      await fs.access(target);
    } catch {
      return textResponse(404, "Not found");
    }

    try {
      // `net.fetch` streams the file from disk instead of buffering it.
      const upstream = await net.fetch(pathToFileURL(target).toString());

      if (!upstream.ok) {
        return textResponse(404, "Not found");
      }

      const headers = new Headers(upstream.headers);
      headers.set("content-type", contentTypeFor(target));

      return new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
    } catch {
      return textResponse(404, "Not found");
    }
  });
};
