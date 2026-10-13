import '@testing-library/jest-dom';
import { vi } from 'vitest';

// JSDOM does not implement scrolling; modal behavior is covered by DOM assertions.
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
if (typeof window !== 'undefined' && window.HTMLElement) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
