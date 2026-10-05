import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast, ToastType, ToastOptions } from '../../utils/toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  description?: string;
  duration: number;
  remaining: number;
  createdAt: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleRemoval = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      if (timersRef.current.has(id)) {
        clearTimeout(timersRef.current.get(id));
      }
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(() => {
    const unsubscribeToast = toast.subscribe((message: string, type: ToastType, options?: ToastOptions) => {
      const id = options?.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = options?.duration !== undefined ? options.duration : 5500;

      const newToast: ToastItem = {
        id,
        message,
        type,
        title: options?.title,
        description: options?.description,
        duration,
        remaining: duration,
        createdAt: Date.now(),
        action: options?.action,
      };

      setToasts((prev) => {
        // Keep up to 5 concurrent toasts, replacing duplicate ids if matching
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered.slice(-4), newToast];
      });

      scheduleRemoval(id, duration);
    });

    const unsubscribeDismiss = toast.onDismiss((id?: string) => {
      if (id) {
        removeToast(id);
      } else {
        setToasts([]);
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current.clear();
      }
    });

    return () => {
      unsubscribeToast();
      unsubscribeDismiss();
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [scheduleRemoval, removeToast]);

  const handleMouseEnter = (id: string) => {
    setPausedId(id);
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
  };

  const handleMouseLeave = (item: ToastItem) => {
    setPausedId(null);
    // Restart with remaining time (at least 2 seconds)
    const elapsed = Date.now() - item.createdAt;
    const remaining = Math.max(item.duration - elapsed, 2000);
    scheduleRemoval(item.id, remaining);
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="تنبيهات النظام"
      aria-live="polite"
      dir="rtl"
      className="fixed top-4 left-4 z-[99999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none select-none transition-all duration-300"
    >
      {toasts.map((item) => {
        const isPaused = pausedId === item.id;

        // Visual styling presets per type
        let borderClass = 'border-rose-500/60 shadow-rose-950/40';
        let bgGradient = 'from-slate-900/98 to-rose-950/20';
        let iconBg = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
        let progressBarClass = 'bg-gradient-to-r from-rose-500 to-red-400';
        let defaultTitle = 'تنبيه خطأ';

        if (item.type === 'success') {
          borderClass = 'border-emerald-500/60 shadow-emerald-950/40';
          bgGradient = 'from-slate-900/98 to-emerald-950/20';
          iconBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
          progressBarClass = 'bg-gradient-to-r from-emerald-500 to-teal-400';
          defaultTitle = 'تم بنجاح';
        } else if (item.type === 'warning') {
          borderClass = 'border-amber-500/60 shadow-amber-950/40';
          bgGradient = 'from-slate-900/98 to-amber-950/20';
          iconBg = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
          progressBarClass = 'bg-gradient-to-r from-amber-500 to-yellow-400';
          defaultTitle = 'تحذير / تعارض';
        } else if (item.type === 'info') {
          borderClass = 'border-sky-500/60 shadow-sky-950/40';
          bgGradient = 'from-slate-900/98 to-sky-950/20';
          iconBg = 'bg-sky-500/20 text-sky-400 border-sky-500/40';
          progressBarClass = 'bg-gradient-to-r from-sky-500 to-cyan-400';
          defaultTitle = 'معلومات';
        }

        const titleText = item.title || defaultTitle;

        return (
          <div
            key={item.id}
            role="alert"
            onMouseEnter={() => handleMouseEnter(item.id)}
            onMouseLeave={() => handleMouseLeave(item)}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border backdrop-blur-xl bg-gradient-to-br ${bgGradient} ${borderClass} p-3.5 shadow-2xl text-slate-100 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]`}
          >
            <div className="flex items-start gap-3">
              {/* Type Icon Badge */}
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${iconBg} shadow-inner`}
              >
                {item.type === 'success' && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {item.type === 'error' && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {item.type === 'warning' && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                )}
                {item.type === 'info' && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>

              {/* Message Content */}
              <div className="flex-1 min-w-0 pr-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-black tracking-wide text-slate-200">
                    {titleText}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removeToast(item.id)}
                    className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                    aria-label="إغلاق التنبيه"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-slate-300 font-medium break-words">
                  {item.message}
                </p>

                {item.description && (
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {item.description}
                  </p>
                )}

                {item.action && (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick();
                      removeToast(item.id);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20 transition-all active:scale-95"
                  >
                    {item.action.label}
                    <span aria-hidden="true">&larr;</span>
                  </button>
                )}
              </div>
            </div>

            {/* Countdown Progress Bar */}
            {item.duration > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80 overflow-hidden">
                <div
                  className={`h-full ${progressBarClass} transition-all ease-linear`}
                  style={{
                    width: isPaused ? '100%' : '0%',
                    transitionDuration: isPaused ? '0ms' : `${item.duration}ms`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};

export default ToastContainer;
