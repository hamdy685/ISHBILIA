import React, { useState } from 'react';

export interface GlobalErrorFallbackProps {
  error?: Error | null;
  resetErrorBoundary?: () => void;
}

export const GlobalErrorFallback: React.FC<GlobalErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleReload = () => {
    if (resetErrorBoundary) {
      try {
        resetErrorBoundary();
      } catch {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div
      className="min-h-screen bg-[#0b1220] flex items-center justify-center p-4 sm:p-6 text-slate-100 font-sans selection:bg-gold-500/30"
      dir="rtl"
    >
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-gold-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl rounded-3xl border border-gold-500/20 bg-slate-900/90 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl shadow-black/80 text-center space-y-6">
        {/* Luxury Glowing Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-gold-500/30 blur-xl animate-pulse" />
          <div className="relative w-full h-full rounded-2xl border border-gold-400/40 bg-gradient-to-b from-slate-800/90 to-slate-950 flex items-center justify-center text-3xl shadow-inner shadow-gold-500/10">
            🛡️
          </div>
        </div>

        {/* Header Titles */}
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black tracking-widest text-[#d4a84e] bg-[#2a2111]/80 border border-[#c7a45b]/30">
            جدار حماية النظام • PRE-PRODUCTION GUARD
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
            واجهة النظام واجهت حالة غير متوقعة
          </h1>
          <p className="text-xs sm:text-sm text-slate-300/80 leading-relaxed max-w-md mx-auto">
            تم اعتراض الخطأ بنجاح لحماية الجلسة والبيانات التشغيلية من أي تلف.
            يمكنك إعادة تحميل الصفحة لاستئناف العمل فوراً.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReload}
            className="w-full sm:w-auto px-7 py-3 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-[#d4a84e] via-[#edd6a6] to-[#a47a2c] text-slate-950 hover:brightness-110 shadow-lg shadow-[#a47a2c]/25 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>إعادة تحميل الصفحة</span>
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs sm:text-sm font-bold border border-white/10 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>🏠</span>
            <span>الصفحة الرئيسية</span>
          </button>
        </div>

        {/* Technical Diagnostics for QA / Debugging */}
        {error && (
          <div className="pt-4 border-t border-white/5 text-right">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-[11px] font-mono text-slate-400 hover:text-gold-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{showDetails ? '▼ إخفاء التفاصيل الفنية' : '◀ عرض التفاصيل الفنية للخطأ (QA / Diagnostic)'}</span>
            </button>

            {showDetails && (
              <div className="mt-3 rounded-xl border border-rose-900/40 bg-black/60 p-3 text-left font-mono text-[11px] text-rose-300 overflow-x-auto max-h-48 space-y-1 select-text">
                <div className="font-bold text-rose-200">{error.name}: {error.message}</div>
                {error.stack && (
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap leading-tight mt-1">
                    {error.stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Subtle Footer */}
        <p className="text-[10px] text-slate-500 font-mono tracking-wider pt-2">
          شركة إشبيلية للاستثمار العقاري والمقاولات • قسم ضمان جودة البرمجيات
        </p>
      </div>
    </div>
  );
};

export default GlobalErrorFallback;
