import React, { useEffect, useState } from 'react';
import useNetworkStatus from '../../hooks/useNetworkStatus';

export const NetworkStatusToast: React.FC = () => {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);

  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowReconnectedToast(true);
      const timer = setTimeout(() => {
        setShowReconnectedToast(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  // If online and was not previously offline, render nothing
  if (isOnline && !showReconnectedToast) {
    return null;
  }

  return (
    <aside
      aria-live="polite"
      role="status"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg transition-all duration-300 pointer-events-auto"
      dir="rtl"
    >
      {!isOnline ? (
        // Offline Warning Banner
        <div className="rounded-2xl border border-rose-500/50 bg-slate-950/95 backdrop-blur-xl p-4 shadow-2xl shadow-rose-950/50 flex items-start gap-3 text-right">
          <div className="relative mt-1 shrink-0">
            <span className="flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500" />
            </span>
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-rose-300 flex items-center gap-1.5">
                <span>📡</span>
                <span>انقطع الاتصال بالإنترنت</span>
              </h4>
              <span className="text-[10px] font-mono text-rose-400/80 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800/40">
                وضع عدم الاتصال
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
              البيانات المدخلة في النموذج محفوظة تلقائياً ومحمية. يرجى عدم إغلاق أو تحديث الصفحة حتى عودة الاتصال لاستكمال إرسال الطلب.
            </p>
          </div>
        </div>
      ) : showReconnectedToast ? (
        // Reconnected Success Banner
        <div className="rounded-2xl border border-emerald-500/50 bg-slate-950/95 backdrop-blur-xl p-3.5 shadow-2xl shadow-emerald-950/50 flex items-center justify-between gap-3 text-right animate-bounce">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <span className="text-xs font-black text-emerald-300">
              🟢 تمت استعادة الاتصال بالإنترنت بنجاح. يمكنك المتابعة الآن.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowReconnectedToast(false)}
            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700/60 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : null}
    </aside>
  );
};

export default NetworkStatusToast;
