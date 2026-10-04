import React from 'react';

const CHUNK_RELOAD_KEY = 'ashbiliya_chunk_reload_timestamp';
const CHUNK_RELOAD_COOLDOWN_MS = 15000; // 15 seconds cooldown to prevent reload loops

/**
 * Checks whether an error is caused by a missing/stale Vite chunk after a new deployment.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as any)?.message || String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk [\d\w]+ failed/i.test(msg) ||
    /Failed to load module script/i.test(msg) ||
    (error as any)?.name === 'ChunkLoadError'
  );
}

/**
 * Checks if the browser has already triggered an automatic reload recently.
 */
export function hasRecentlyReloadedForChunk(): boolean {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (!raw) return false;
    const diff = Date.now() - parseInt(raw, 10);
    return diff < CHUNK_RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Marks that a chunk reload has been initiated to prevent infinite reload loops.
 */
export function markChunkReload(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, Date.now().toString());
  } catch {}
}

/**
 * Clears the reload marker.
 */
export function clearChunkReload(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {}
}

/**
 * Wraps dynamic component imports with retry and auto-reload on deployment/stale chunk errors.
 *
 * If a new deployment replaces chunks on the server, the browser holding an old bundle
 * will fail to load the chunk. This helper intercepts the failure, checks the cooldown,
 * and performs a clean window.location.reload() to fetch the latest index.html and assets.
 */
export function lazyImportWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | T>,
  componentName?: string
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const alreadyReloaded = hasRecentlyReloadedForChunk();

    try {
      const module = await factory();
      return (module && 'default' in module) ? module : { default: module as T };
    } catch (err: unknown) {
      if (!isChunkLoadError(err)) {
        throw err;
      }

      console.warn(
        `[Vite Cache-Bust] Detected stale chunk error for ${componentName || 'component'}. Retrying...`,
        err
      );

      // Attempt one quick retry after 400ms (in case of a brief network glitch)
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryModule = await factory();
        return (retryModule && 'default' in retryModule) ? retryModule : { default: retryModule as T };
      } catch (retryErr: unknown) {
        if (!isChunkLoadError(retryErr)) {
          throw retryErr;
        }

        // If not already reloaded in this session, trigger a hard reload
        if (!alreadyReloaded) {
          markChunkReload();
          console.warn(
            `[Vite Cache-Bust] Reloading page to fetch latest deployment assets for ${componentName || 'component'}...`
          );
          window.location.reload();
          // Return a non-resolving promise so React stays in loading suspense while the page reloads
          return new Promise<{ default: T }>(() => {});
        }

        // Already attempted reload and still failed, clear marker and let Error Boundary take over
        clearChunkReload();
        throw retryErr;
      }
    }
  });
}

/**
 * Setup global window listener for Vite preload errors.
 * Vite triggers 'vite:preloadError' event whenever dynamic imports or module preloads fail.
 */
export function setupVitePreloadErrorHandler(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite Cache-Bust] Intercepted vite:preloadError event on window:', event);
    event.preventDefault();

    if (!hasRecentlyReloadedForChunk()) {
      markChunkReload();
      window.location.reload();
    }
  });
}

export default lazyImportWithRetry;
