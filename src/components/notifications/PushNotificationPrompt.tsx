import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { isFirebaseConfigured } from '../../config/firebase';
import {
  getPushPermissionState,
  getPushSupportStatus,
  requestAndRegisterPushToken,
  isIosDevice,
  isStandalonePwa,
  PushPermissionState,
} from '../../services/pushNotificationService';
import { playNotificationSound } from '../../utils/notificationSound';

interface PushNotificationPromptProps {
  variant?: 'banner' | 'card' | 'compact' | 'executive';
  title?: string;
  onEnabled?: () => void;
  className?: string;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({
  variant = 'banner',
  title,
  onEnabled,
  className = '',
}) => {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [loading, setLoading] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isHttps, setIsHttps] = useState(true);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('ashbiliya_push_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const checkStatus = () => {
    const supported = getPushSupportStatus();
    const perm = getPushPermissionState();
    const configured = isFirebaseConfigured();
    const ios = isIosDevice();
    const standalone = isStandalonePwa();
    const https = typeof window !== 'undefined'
      ? (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      : true;

    setIsSupported(supported);
    setPermission(perm);
    setIsConfigured(configured);
    setIsIos(ios);
    setIsStandalone(standalone);
    setIsHttps(https);

    if (perm === 'granted') {
      void requestAndRegisterPushToken().catch(() => {});
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleTestSound = () => {
    setTestingSound(true);
    try {
      playNotificationSound();
      setMessage('تم تشغيل صوت التنبيه بنجاح. إذا لم تسمع صوتاً، تأكد من رفع مستوى صوت التابلت.');
      setIsSuccess(true);
    } catch {
      setMessage('تعذر تشغيل الصوت، تأكد من إلغاء كتم الصوت في التابلت.');
      setIsSuccess(false);
    } finally {
      setTimeout(() => setTestingSound(false), 800);
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    setMessage(null);
    try {
      // 1. Ensure this device's token is registered first
      await requestAndRegisterPushToken();

      // 2. Play local chime as immediate acoustic confirmation
      playNotificationSound();

      // 3. Call test-push API
      const { sendTestPushApi } = await import('../../api/notifications');
      const data = await sendTestPushApi();
      setIsSuccess(true);
      setMessage(`تم إرسال الإشعار التجريبي بنجاح إلى (${data.device_count || 1}) جهاز! تفقد شريط إشعارات التابلت/المتصفح الآن.`);
    } catch (err: any) {
      setIsSuccess(false);
      const errMsg = err?.response?.data?.message || err?.message || 'تعذر إرسال الإشعار التجريبي.';
      setMessage(errMsg);
    } finally {
      setTestingPush(false);
    }
  };

  const handleEnablePush = async () => {
    setLoading(true);
    setMessage(null);
    setIsSuccess(false);
    try {
      const result = await requestAndRegisterPushToken();
      checkStatus();
      if (result.success) {
        setIsSuccess(true);
        setMessage('تم تفعيل الإشعارات الفورية بنجاح! ستصلك التنبيهات حتى عند إغلاق التطبيق.');
        playNotificationSound();
        if (onEnabled) onEnabled();
      } else {
        setIsSuccess(false);
        setMessage(result.error || 'تعذر تفعيل الإشعارات.');
      }
    } catch {
      setIsSuccess(false);
      setMessage('حدث خطأ غير متوقع أثناء تفعيل الإشعارات.');
    } finally {
      setLoading(false);
    }
  };

  // Case 0: Insecure HTTP
  if (!isHttps) {
    return (
      <div className={`rounded-2xl border border-rose-800/60 bg-rose-950/40 p-4 text-xs text-rose-200 ${className}`}>
        <div className="font-bold flex items-center gap-2">
          <span>🔒</span>
          <span>تنبيه: تتطلب الإشعارات اتصالاً مشفراً (HTTPS)</span>
        </div>
        <p className="mt-1 text-slate-300">
          المتصفح يمنع الإشعارات على الروابط غير المشفرة (HTTP). يرجى فتح النظام عبر رابط https:// الرسمي.
        </p>
      </div>
    );
  }

  // Case 1: Apple iPad / iPhone in browser tab (Safari) - Needs Add to Home Screen
  if (isIos && !isStandalone) {
    return (
      <div className={`rounded-2xl border border-amber-800/70 bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 p-4 shadow-lg space-y-3 ${className}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-xl text-amber-300 border border-amber-500/30">
            📱
          </div>
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-black text-amber-200">
                {title || 'تفعيل الإشعارات على أجهزة آيباد (iPad / Apple)'}
              </h4>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                خطوة مطلوبة من أبل
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              نظام تشغيل أجهزة آيباد (iPadOS) يشترط إضافة النظام إلى الشاشة الرئيسية ليعمل كـ تطبيق وتصلك التنبيهات:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-200">
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                <span className="text-amber-400 font-black">1.</span>
                <span>اضغط زر <strong>المشاركة 📤</strong> في Safari</span>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                <span className="text-amber-400 font-black">2.</span>
                <span>اختر <strong>إضافة إلى الشاشة الرئيسية ➕</strong></span>
              </div>
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 flex items-center gap-2">
                <span className="text-amber-400 font-black">3.</span>
                <span>افتح التطبيق من الأيقونة واضغط تفعيل</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Browser doesn't support Web Push
  if (!isSupported) {
    return (
      <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400 flex items-center gap-2 ${className}`}>
        <span>ℹ️</span>
        <span>المتصفح الحالي على هذا الجهاز لا يدعم الإشعارات الفورية (Web Push). يرجى استخدام متصفح Google Chrome المحدث.</span>
      </div>
    );
  }

  // Case 3: Firebase not configured
  if (!isConfigured) {
    if (variant === 'compact') {
      return (
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-slate-400">
          الإشعارات الفورية غير مهيأة حالياً
        </span>
      );
    }
    return (
      <div className={`rounded-2xl border border-amber-800/60 bg-slate-900/80 p-4 text-sm text-amber-200 ${className}`}>
        <div className="font-black">الإشعارات الفورية غير مهيأة لهذه النسخة</div>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          يمكنك استخدام إشعارات النظام الداخلية، أو التواصل مع مسؤول النظام لتفعيل إعدادات Firebase.
        </p>
      </div>
    );
  }

  // Case 4: Permission Denied (The Tablet Trap)
  if (permission === 'denied') {
    return (
      <div className={`rounded-2xl border border-rose-800/80 bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 p-4 shadow-lg space-y-3 ${className}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-xl text-rose-300 border border-rose-500/30">
              🚫
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-rose-200">
                  {title || 'إذن الإشعارات محظور في متصفح التابلت'}
                </h4>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold border border-rose-500/30">
                  محظور ⚠️
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                تم رفض إذن الإشعارات مسبقاً في المتصفح. لتفعيلها على التابلت، يُرجى فك الحظر باتباع الخطوات التالية:
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="shrink-0 font-bold text-xs border-rose-700/60 text-rose-200 hover:bg-rose-900/30"
            onClick={checkStatus}
          >
            <span>🔄</span>
            <span>إعادة فحص الإذن بعد التعديل</span>
          </Button>
        </div>

        {/* Step-by-step unblock instructions */}
        <div className="bg-slate-950/80 rounded-xl p-3 border border-rose-900/50 space-y-2 text-xs text-slate-200">
          <div className="font-bold text-rose-300 flex items-center gap-1.5">
            <span>🛠️</span>
            <span>طريقة إلغاء الحظر وتفعيل الإشعارات على تابلت أندرويد (Chrome):</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 pr-2">
            <li>اضغط على رمز <strong>القفل 🔒</strong> أو خيارات الموقع في أعلى المتصفح بجانب رابط الصفحة.</li>
            <li>اختر <strong>أذونات الموقع (Permissions)</strong> أو إعدادات الموقع.</li>
            <li>اضغط على <strong>الإشعارات (Notifications)</strong> وغيّرها إلى <strong>سماح (Allow)</strong>.</li>
            <li>اضغط على زر <strong>إعادة فحص الإذن 🔄</strong> بالأعلى أو حدّث الصفحة.</li>
          </ol>
        </div>
      </div>
    );
  }

  // Case 5: Permission Granted (Active)
  if (permission === 'granted') {
    if (dismissed && variant !== 'executive') {
      return null;
    }

    return (
      <div className={`rounded-2xl border border-emerald-800/60 bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 p-4 shadow-lg space-y-3 ${className}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-xl text-emerald-300 border border-emerald-500/30">
              🔔
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-emerald-300">
                  {title || 'الإشعارات الفورية مفعّلة على هذا التابلت'}
                </h4>
                <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  نشط ⚡
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                التابلت مسجل الآن لاستقبال تنبيهات الاعتمادات والتحديثات مع الصوت والاهتزاز حتى والتطبيق مغلق.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="font-bold text-xs border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/40"
              isLoading={testingPush}
              onClick={handleTestPush}
              title="إرسال إشعار فوري عبر سيرفر Google لاختبار وصول التنبيه لشريط إشعارات التابلت"
            >
              <span>🔔</span>
              <span>إرسال إشعار تجريبي للتابلت</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="font-bold text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              isLoading={testingSound}
              onClick={handleTestSound}
              title="تجربة صوت جرس التنبيه على سماعات التابلت"
            >
              <span>🔊</span>
              <span>تجربة الصوت</span>
            </Button>

            {variant !== 'executive' && (
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  try {
                    localStorage.setItem('ashbiliya_push_banner_dismissed', 'true');
                  } catch {
                    // ignore
                  }
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
                title="إخفاء التنبيه"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {message && (
          <div
            className={`rounded-xl p-2.5 text-xs font-bold ${
              isSuccess
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
            }`}
          >
            {message}
          </div>
        )}
      </div>
    );
  }

  // Case 6: Compact Variant (Default State)
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button
          size="sm"
          variant="primary"
          className="font-bold flex items-center gap-1.5 text-xs"
          isLoading={loading}
          onClick={handleEnablePush}
        >
          <span>🔔</span>
          <span>تفعيل الإشعارات على التابلت</span>
        </Button>
      </div>
    );
  }

  // Case 7: Banner / Card / Executive (Default State - Ready to Enable)
  return (
    <div
      className={`rounded-2xl border border-cyan-800/70 bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 p-4 sm:p-5 shadow-lg space-y-3 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-xl text-cyan-300 border border-cyan-500/30">
            🔔
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-100">
              {title || 'تفعيل إشعارات التابلت الفورية (Web Push)'}
            </h4>
            <p className="mt-0.5 text-xs text-slate-400 leading-5">
              احصل على إشعار فوري بصوت واهتزاز على التابلت عند وصول طلبات جديدة بانتظار اعتمادك، أو صدور أوامر شراء وفواتير حتى عندما يكون المتصفح مقفلاً.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            className="w-full sm:w-auto font-bold shadow-md text-xs px-4 py-2"
            isLoading={loading}
            onClick={handleEnablePush}
          >
            تفعيل إشعارات التابلت الآن
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl p-2.5 text-xs font-bold ${
            isSuccess
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
              : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
};

export default PushNotificationPrompt;
