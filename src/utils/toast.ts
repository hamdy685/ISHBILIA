export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  duration?: number;
  id?: string;
}

export type ToastListener = (message: string, type: ToastType, options?: ToastOptions) => void;

const listeners: Set<ToastListener> = new Set();

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    listeners.forEach((fn) => fn(message, 'success', options));
  },
  error: (message: string, options?: ToastOptions) => {
    listeners.forEach((fn) => fn(message, 'error', options));
  },
  info: (message: string, options?: ToastOptions) => {
    listeners.forEach((fn) => fn(message, 'info', options));
  },
  warning: (message: string, options?: ToastOptions) => {
    listeners.forEach((fn) => fn(message, 'warning', options));
  },
  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export default toast;
