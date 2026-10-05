export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  duration?: number;
  id?: string;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export type ToastListener = (message: string, type: ToastType, options?: ToastOptions) => void;
export type ToastDismissListener = (id?: string) => void;

const listeners: Set<ToastListener> = new Set();
const dismissListeners: Set<ToastDismissListener> = new Set();

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
  conflict: (message: string, options?: ToastOptions) => {
    listeners.forEach((fn) => fn(message, 'warning', { title: 'تعارض في الإجراء (409)', ...options }));
  },
  dismiss: (id?: string) => {
    dismissListeners.forEach((fn) => fn(id));
  },
  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onDismiss: (listener: ToastDismissListener) => {
    dismissListeners.add(listener);
    return () => dismissListeners.delete(listener);
  },
};

export default toast;
