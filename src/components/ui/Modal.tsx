import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

class ModalErrorBoundary extends React.Component<{ onClose: () => void; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('خطأ داخل النافذة المنبثقة:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-8 px-4 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-950/60 border border-rose-600/40 flex items-center justify-center text-rose-400 text-xl font-bold">
            ⚠️
          </div>
          <p className="text-sm font-bold text-rose-200">
            حدث خطأ أثناء عرض محتويات هذه النافذة.
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            لم تتأثر بياناتك، يمكنك إغلاق النافذة والمحاولة مرة أخرى.
          </p>
          <button
            type="button"
            onClick={this.props.onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            إغلاق النافذة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const prevIsOpenRef = useRef(false);

  // Initial focus on open only
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return undefined;
    }

    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = true;

    // Only set initial focus once when the modal transitions from closed to open
    if (!wasOpen) {
      const timer = window.setTimeout(() => {
        const dialog = closeButtonRef.current?.closest('[role="dialog"]');
        const firstInput = dialog?.querySelector<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        } else {
          closeButtonRef.current?.focus();
        }
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key and body overflow
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscapeRef.current && event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  const modal = (
    <div
      className="modal-top-viewport fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/85 p-2 sm:p-4 md:p-6 backdrop-blur-sm"
      dir="rtl"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`relative flex min-h-0 w-full ${sizeClasses[size]} max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-slate-700 bg-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.55)]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 sm:gap-4 border-b border-slate-700 bg-slate-900 px-3 py-3 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base sm:text-lg font-bold text-slate-100 break-words">{title}</h3>
            {subtitle && <p id={descriptionId} className="mt-1.5 text-xs leading-5 text-slate-400">{subtitle}</p>}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="shrink-0 min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:border-cyan-500/60 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6 text-slate-200">
          <ModalErrorBoundary onClose={onClose}>
            {children}
          </ModalErrorBoundary>
        </div>

        {footer && (
          <footer className="flex shrink-0 flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 border-t border-slate-700 bg-slate-900 px-3 py-3 sm:px-6 sm:py-4 [&>button]:min-h-[44px] sm:[&>button]:min-h-0 [&>button]:w-full sm:[&>button]:w-auto">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );

  return createPortal(modal, document.body);
};
