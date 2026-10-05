import { useEffect, useState } from 'react';

const BASE_TITLE = 'شركة اشبيلية — نظام إدارة المشتريات';
let originalFaviconHref: string | null = null;

/**
 * Updates PWA App Icon Badge, Document Title, and dynamic Favicon badge
 * whenever the unread notifications count changes.
 */
export const updateAppAndTabBadge = (count: number): void => {
  // 1. Update Document Title
  if (typeof document !== 'undefined') {
    if (count > 0) {
      const displayCount = count > 99 ? '99+' : count;
      document.title = `(${displayCount}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }

    // 2. Dynamic Favicon Badge Dot
    try {
      const favicon =
        document.querySelector<HTMLLinkElement>('link[rel="icon"][sizes="32x32"]') ||
        document.querySelector<HTMLLinkElement>('link[rel="icon"]');

      if (favicon) {
        if (!originalFaviconHref) {
          originalFaviconHref = favicon.href;
        }

        if (count <= 0) {
          favicon.href = originalFaviconHref;
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = originalFaviconHref;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, 32, 32);

              // Draw badge circle
              ctx.beginPath();
              ctx.arc(24, 8, 7, 0, 2 * Math.PI);
              ctx.fillStyle = '#f43f5e'; // rose-500
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();

              // Draw badge dot / count
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(count > 9 ? '•' : String(count), 24, 8.5);

              favicon.href = canvas.toDataURL('image/png');
            }
          };
        }
      }
    } catch {
      // Safe fallback if canvas is restricted
    }
  }

  // 3. PWA App Icon Badge API (Desktop & iOS 16.4+ standalone PWA)
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }

  // 4. Android Mobile System Notification Badge Bridge:
  // On Android (Chrome / Samsung Internet), the launcher app icon badge is tied
  // to active notifications in the Android notification tray.
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then((registration) => {
      if (count > 0) {
        registration.showNotification('شركة اشبيلية — نظام المشتريات', {
          body: `لديك (${count > 99 ? '99+' : count}) معاملات وإشعارات غير مقروءة تتطلب متابعتك.`,
          icon: '/icon-192x192.png',
          badge: '/favicon-32x32.png',
          tag: 'ashbiliya-unread-badge',
          renotify: false,
          silent: true,
          data: { url: '/notifications' },
        } as any).catch(() => {});
      } else {
        registration.getNotifications({ tag: 'ashbiliya-unread-badge' }).then((notifications) => {
          notifications.forEach((n) => n.close());
        }).catch(() => {});
      }
    }).catch(() => {});
  }
};

let currentNotificationCount = 0;

/**
 * Returns the latest in-memory cached notification count synchronously.
 */
export const getCachedNotificationCount = (): number => currentNotificationCount;

/**
 * Broadcasts the current notification count to all components and updates the app icon & tab.
 */
export const broadcastNotificationCount = (count: number): void => {
  const sanitized = Math.max(0, Math.round(Number(count) || 0));
  currentNotificationCount = sanitized;
  updateAppAndTabBadge(sanitized);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notification-count-changed', { detail: sanitized }));
  }
};

/**
 * Hook to read and subscribe to the real-time unread notification count.
 */
export const useNotificationCount = (): number => {
  const [count, setCount] = useState<number>(() => currentNotificationCount);

  useEffect(() => {
    // Keep local state in sync if cache changed before mount
    if (currentNotificationCount !== count) {
      setCount(currentNotificationCount);
    }

    const handleCount = (e: Event) => {
      const val = (e as CustomEvent<number>).detail;
      if (typeof val === 'number') {
        setCount(val);
      }
    };

    window.addEventListener('notification-count-changed', handleCount as EventListener);
    return () => {
      window.removeEventListener('notification-count-changed', handleCount as EventListener);
    };
  }, []);

  return count;
};
