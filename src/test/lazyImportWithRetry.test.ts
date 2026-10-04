import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isChunkLoadError,
  hasRecentlyReloadedForChunk,
  markChunkReload,
  clearChunkReload,
} from '../utils/lazyImportWithRetry';

describe('lazyImportWithRetry and Chunk Error Detection', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('correctly identifies dynamic import failure messages', () => {
    const chromeErr = new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/AdminPage-123.js');
    const safariErr = new TypeError('Importing a module script failed.');
    const firefoxErr = new TypeError('error loading dynamically imported module: https://example.com/assets/AdminPage-123.js');
    const genericChunkErr = { name: 'ChunkLoadError', message: 'Loading chunk 5 failed' };
    const otherErr = new Error('Network timeout or DB connection failed');

    expect(isChunkLoadError(chromeErr)).toBe(true);
    expect(isChunkLoadError(safariErr)).toBe(true);
    expect(isChunkLoadError(firefoxErr)).toBe(true);
    expect(isChunkLoadError(genericChunkErr)).toBe(true);
    expect(isChunkLoadError(otherErr)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('handles reload cooldown tracking correctly to avoid infinite loops', () => {
    expect(hasRecentlyReloadedForChunk()).toBe(false);

    markChunkReload();
    expect(hasRecentlyReloadedForChunk()).toBe(true);

    clearChunkReload();
    expect(hasRecentlyReloadedForChunk()).toBe(false);
  });
});
